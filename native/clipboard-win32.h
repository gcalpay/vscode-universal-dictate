#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

#include "clipboard-transaction.h"
#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <memory>
#include <new>
#include <stdexcept>
#include <thread>
#include <utility>
#include <vector>

namespace universal_dictate::clipboard {

static_assert(CF_UNICODETEXT == 13 && CF_DIBV5 == 17 && CF_DSPENHMETAFILE == 0x8e);
constexpr std::size_t kMaxSnapshotBytes = 256u * 1024u * 1024u;
constexpr std::size_t kMaxFormats = 256;

inline void disposeData(FormatKind kind, HANDLE data) noexcept {
    if (!data) return;
    switch (kind) {
        case FormatKind::bitmap: case FormatKind::palette:
            DeleteObject(data);
            break;
        case FormatKind::enhancedMetafile:
            DeleteEnhMetaFile(static_cast<HENHMETAFILE>(data));
            break;
        case FormatKind::metafile: {
            auto* picture = static_cast<METAFILEPICT*>(GlobalLock(data));
            if (picture) {
                DeleteMetaFile(picture->hMF);
                GlobalUnlock(data);
            }
            GlobalFree(data);
            break;
        }
        case FormatKind::memory: GlobalFree(data); break;
        default: break;
    }
}

struct OwnedData {
    UINT format = 0;
    FormatKind kind = FormatKind::unsupported;
    HANDLE data = nullptr;
    OwnedData() = default;
    OwnedData(UINT id, FormatKind type, HANDLE value) noexcept : format(id), kind(type), data(value) {}
    OwnedData(const OwnedData&) = delete;
    OwnedData& operator=(const OwnedData&) = delete;
    OwnedData(OwnedData&& other) noexcept
        : format(other.format), kind(other.kind), data(std::exchange(other.data, nullptr)) {}
    OwnedData& operator=(OwnedData&& other) noexcept {
        if (this != &other) {
            disposeData(kind, data);
            format = other.format;
            kind = other.kind;
            data = std::exchange(other.data, nullptr);
        }
        return *this;
    }
    ~OwnedData() { disposeData(kind, data); }
    HANDLE release() noexcept { return std::exchange(data, nullptr); }
};

class GlobalView {
public:
    explicit GlobalView(HGLOBAL memory) noexcept : memory_(memory), data(GlobalLock(memory)) {}
    GlobalView(const GlobalView&) = delete;
    GlobalView& operator=(const GlobalView&) = delete;
    ~GlobalView() { if (data) GlobalUnlock(memory_); }
private:
    HGLOBAL memory_;
public:
    void* data;
};

inline OwnedData memoryData(UINT format, const void* bytes, std::size_t size) {
    if (!size || size > kMaxSnapshotBytes) throw std::runtime_error("invalid clipboard allocation");
    OwnedData owned(format, FormatKind::memory, GlobalAlloc(GMEM_MOVEABLE, size));
    if (!owned.data) throw std::bad_alloc();
    GlobalView view(owned.data);
    if (!view.data) throw std::runtime_error("clipboard allocation cannot be locked");
    std::memcpy(view.data, bytes, size);
    return owned;
}

inline void charge(std::size_t size, std::size_t& used) {
    if (size == 0 || size > kMaxSnapshotBytes - used) throw std::runtime_error("clipboard too large");
    used += size;
}

inline OwnedData duplicateData(UINT id, FormatKind kind, HANDLE source, std::size_t& used) {
    if (!source) throw std::runtime_error("clipboard data unavailable");
    OwnedData out(id, kind, nullptr);
    if (kind == FormatKind::memory) {
        const SIZE_T size = GlobalSize(source);
        charge(size, used);
        GlobalView view(source);
        if (!view.data) throw std::runtime_error("clipboard data cannot be locked");
        return memoryData(id, view.data, size);
    }
    if (kind == FormatKind::bitmap) {
        BITMAP bitmap{};
        if (GetObjectW(source, sizeof(bitmap), &bitmap) != sizeof(bitmap) ||
            bitmap.bmWidth <= 0 || bitmap.bmHeight <= 0 || bitmap.bmWidthBytes <= 0 || bitmap.bmPlanes == 0) {
            throw std::runtime_error("invalid bitmap");
        }
        if (static_cast<std::size_t>(bitmap.bmWidthBytes) >
            kMaxSnapshotBytes / static_cast<std::size_t>(bitmap.bmHeight) / bitmap.bmPlanes)
            throw std::runtime_error("bitmap too large");
        const auto bytes = static_cast<std::size_t>(bitmap.bmWidthBytes) * bitmap.bmHeight * bitmap.bmPlanes;
        charge(static_cast<std::size_t>(bytes), used);
        out.data = CopyImage(source, IMAGE_BITMAP, 0, 0, LR_CREATEDIBSECTION);
    } else if (kind == FormatKind::palette) {
        WORD paletteCount = 0;
        if (GetObjectW(source, sizeof(paletteCount), &paletteCount) != sizeof(paletteCount) || !paletteCount)
            throw std::runtime_error("invalid palette");
        const UINT count = paletteCount;
        const std::size_t size = sizeof(LOGPALETTE) + (count - 1) * sizeof(PALETTEENTRY);
        charge(size, used);
        std::unique_ptr<LOGPALETTE, decltype(&std::free)> palette(
            static_cast<LOGPALETTE*>(std::malloc(size)), &std::free);
        if (!palette) throw std::bad_alloc();
        palette->palVersion = 0x300;
        palette->palNumEntries = static_cast<WORD>(count);
        if (GetPaletteEntries(static_cast<HPALETTE>(source), 0, count, palette->palPalEntry) != count)
            throw std::runtime_error("palette copy failed");
        out.data = CreatePalette(palette.get());
    } else if (kind == FormatKind::enhancedMetafile) {
        charge(GetEnhMetaFileBits(static_cast<HENHMETAFILE>(source), 0, nullptr), used);
        out.data = CopyEnhMetaFileW(static_cast<HENHMETAFILE>(source), nullptr);
    } else if (kind == FormatKind::metafile) {
        if (GlobalSize(source) < sizeof(METAFILEPICT)) throw std::runtime_error("invalid metafile");
        GlobalView view(source);
        if (!view.data) throw std::runtime_error("metafile cannot be locked");
        const auto original = *static_cast<const METAFILEPICT*>(view.data);
        charge(GetMetaFileBitsEx(original.hMF, 0, nullptr), used);
        charge(sizeof(METAFILEPICT), used);
        // Allocate the outer structure before acquiring a nested GDI resource.
        METAFILEPICT copy = original;
        copy.hMF = nullptr;
        auto memory = memoryData(id, &copy, sizeof(copy));
        memory.kind = FormatKind::metafile;
        GlobalView target(memory.data);
        if (!target.data) throw std::runtime_error("metafile copy cannot be locked");
        auto* picture = static_cast<METAFILEPICT*>(target.data);
        picture->hMF = CopyMetaFileW(original.hMF, nullptr);
        if (!picture->hMF) throw std::runtime_error("metafile copy failed");
        return memory;
    } else {
        throw std::runtime_error("unsupported clipboard format");
    }
    if (!out.data) throw std::runtime_error("clipboard copy failed");
    return out;
}

inline bool enumerateFormats(std::vector<UINT>& formats) {
    formats.clear();
    UINT current = 0;
    for (;;) {
        SetLastError(ERROR_SUCCESS);
        current = EnumClipboardFormats(current);
        if (current == 0) return GetLastError() == ERROR_SUCCESS;
        if (formats.size() >= kMaxFormats ||
            std::find(formats.begin(), formats.end(), current) != formats.end()) return false;
        formats.push_back(current);
    }
}

class Snapshot {
public:
    // Caller holds OpenClipboard for the complete preflight/materialization.
    Code capture() noexcept {
        try {
            ready_ = false;
            entries_.clear();
            std::vector<UINT> formats;
            if (!enumerateFormats(formats)) return Code::snapshotFailed;
            std::vector<FormatKind> kinds;
            kinds.reserve(formats.size());
            // Reject unsupported formats before requesting delayed-rendered data.
            for (const auto id : formats) {
                wchar_t name[512]{};
                int count = 0;
                if (id >= 0xc000) {
                    count = GetClipboardFormatNameW(id, name, 512);
                    if (count <= 0 || count >= 511) return Code::snapshotUnsupported;
                }
                const auto kind = formatKind(id, {name, static_cast<std::size_t>(count)});
                if (kind == FormatKind::unsupported) return Code::snapshotUnsupported;
                kinds.push_back(kind);
            }
            const HWND owner = GetClipboardOwner();
            entries_.reserve(formats.size());
            std::size_t used = 0;
            for (std::size_t i = 0; i < formats.size(); ++i) {
                entries_.push_back(duplicateData(formats[i], kinds[i], GetClipboardData(formats[i]), used));
            }
            std::vector<UINT> after;
            // Rendering can add formats. Never replace a snapshot we did not
            // fully capture; leave the original data on the clipboard instead.
            if (!enumerateFormats(after) || after != formats || GetClipboardOwner() != owner)
                return Code::snapshotFailed;
            ready_ = true;
            return Code::ok;
        } catch (...) {
            entries_.clear();
            return Code::snapshotFailed;
        }
    }

    bool restore() noexcept {
        if (!ready_) return false;
        if (!EmptyClipboard()) return false;
        ready_ = false;
        bool success = true;
        for (auto& entry : entries_) {
            bool transferred = false;
            // Preallocated handles only; never clear again after a partial
            // restore. Retrying an individual failed Set does not double-paste.
            for (int attempt = 0; attempt < 3 && !transferred; ++attempt) {
                transferred = SetClipboardData(entry.format, entry.data) != nullptr;
                if (!transferred) Sleep(1);
            }
            if (transferred) entry.release();
            else success = false;
        }
        return success;
    }
private:
    std::vector<OwnedData> entries_;
    bool ready_ = false;
};

class ClipboardWindow {
public:
    ClipboardWindow() {
        WNDCLASSW klass{};
        klass.lpfnWndProc = DefWindowProcW;
        klass.hInstance = GetModuleHandleW(nullptr);
        klass.lpszClassName = L"UniversalDictateClipboardV1";
        if (!RegisterClassW(&klass) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
            throw std::runtime_error("clipboard window registration failed");
        window = CreateWindowExW(WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW, klass.lpszClassName,
                                 L"", 0, 0, 0, 0, 0, HWND_MESSAGE, nullptr, klass.hInstance, nullptr);
        if (!window) throw std::runtime_error("clipboard window creation failed");
    }
    ClipboardWindow(const ClipboardWindow&) = delete;
    ClipboardWindow& operator=(const ClipboardWindow&) = delete;
    ~ClipboardWindow() { if (window) DestroyWindow(window); }
    HWND window = nullptr;
};

class NativeHost final : public Host {
public:
    explicit NativeHost(std::wstring_view text, bool (*send)() noexcept,
                        std::chrono::milliseconds grace = std::chrono::milliseconds(120),
                        bool (*cancelled)() noexcept = nullptr)
        : send_(send), grace_(grace), cancelled_(cancelled) {
        std::wstring terminated(text);
        temporary_ = memoryData(CF_UNICODETEXT, terminated.c_str(), (terminated.size() + 1) * sizeof(wchar_t));
        const UINT format = RegisterClipboardFormatW(L"ExcludeClipboardContentFromMonitorProcessing");
        if (!format) throw std::runtime_error("clipboard privacy format unavailable");
        const DWORD zero = 0;
        exclusion_ = memoryData(format, &zero, sizeof(zero));
        mutex_ = CreateMutexW(nullptr, FALSE, L"Local\\UniversalDictate.ClipboardTransaction.v1");
        if (!mutex_) throw std::runtime_error("clipboard transaction mutex unavailable");
    }
    ~NativeHost() override { if (mutex_) CloseHandle(mutex_); }
    bool cancelled() noexcept override { return cancelled_ && cancelled_(); }
    bool claim() noexcept override {
        const DWORD wait = WaitForSingleObject(mutex_, 0);
        if (wait == WAIT_ABANDONED) {
            // Do not reuse an abandoned transaction's possible temporary data.
            ReleaseMutex(mutex_);
            return false;
        }
        return wait == WAIT_OBJECT_0;
    }
    void releaseClaim() noexcept override { ReleaseMutex(mutex_); }
    bool open() noexcept override {
        for (int i = 0; i < 50; ++i) {
            if (OpenClipboard(window_.window)) return true;
            Sleep(5);
        }
        return false;
    }
    bool close() noexcept override { return CloseClipboard() != 0; }
    std::uint32_t sequence() noexcept override { return GetClipboardSequenceNumber(); }
    bool isOwner() noexcept override { return GetClipboardOwner() == window_.window; }
    Code snapshot() noexcept override { return snapshot_.capture(); }
    Publish publish() noexcept override {
        if (!EmptyClipboard()) return Publish::unchangedFailure;
        // Suppress the temporary transcript in Windows history/cloud clipboard.
        // Third-party clipboard observers are not covered by this marker.
        if (!SetClipboardData(exclusion_.format, exclusion_.data)) return Publish::changedFailure;
        exclusion_.release();
        if (!SetClipboardData(CF_UNICODETEXT, temporary_.data)) return Publish::changedFailure;
        temporary_.release();
        return Publish::ready;
    }
    bool restore() noexcept override { return snapshot_.restore(); }
    bool sendPaste() noexcept override { return send_(); }
    void settlePaste() noexcept override { std::this_thread::sleep_for(grace_); }
private:
    ClipboardWindow window_;
    Snapshot snapshot_;
    OwnedData temporary_;
    OwnedData exclusion_;
    HANDLE mutex_ = nullptr;
    bool (*send_)() noexcept;
    std::chrono::milliseconds grace_;
    bool (*cancelled_)() noexcept;
};
}  // namespace universal_dictate::clipboard

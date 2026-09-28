#pragma once

#include <cstdint>
#include <string_view>

namespace universal_dictate::clipboard {

// This policy is shared by the Win32 helper and deterministic, non-Windows tests.
// Registered formats are NOT assumed to be self-contained merely because their
// storage happens to be an HGLOBAL. Unknown/owner-dependent formats fail closed.
enum class FormatKind { unsupported, memory, bitmap, palette, metafile, enhancedMetafile };

constexpr bool sameName(std::wstring_view left, std::wstring_view right) noexcept {
    if (left.size() != right.size()) return false;
    for (std::size_t i = 0; i < left.size(); ++i) {
        const auto lower = [](wchar_t c) { return c >= L'A' && c <= L'Z' ? c + 32 : c; };
        if (lower(left[i]) != lower(right[i])) return false;
    }
    return true;
}

constexpr FormatKind formatKind(std::uint32_t id, std::wstring_view name = {}) noexcept {
    switch (id) {
        case 1: case 4: case 5: case 6: case 7: case 8:
        case 11: case 12: case 13: case 15: case 16: case 17: case 0x81:
            return FormatKind::memory;
        case 2: case 0x82: return FormatKind::bitmap;
        case 3: case 0x83: return FormatKind::metafile;
        case 9: return FormatKind::palette;
        case 14: case 0x8e: return FormatKind::enhancedMetafile;
        default: break;
    }
    if (id < 0xc000 || id > 0xffff) return FormatKind::unsupported;
    constexpr std::wstring_view selfContained[] = {
        L"HTML Format", L"Rich Text Format", L"Rich Text Format Without Objects",
        L"PNG", L"image/png", L"JFIF", L"image/jpeg", L"CSV", L"text/csv",
        L"UTF8_STRING", L"text/plain", L"text/plain;charset=utf-8",
        L"UniformResourceLocator", L"UniformResourceLocatorW",
        L"FileName", L"FileNameW", L"Preferred DropEffect",
        L"Performed DropEffect", L"Paste Succeeded", L"Shell IDList Array", L"Shell Object Offsets",
        L"Biff", L"Biff3", L"Biff4", L"Biff5", L"Biff8", L"XML Spreadsheet",
        L"ExcludeClipboardContentFromMonitorProcessing",
        L"CanIncludeInClipboardHistory", L"CanUploadToCloudClipboard"
    };
    for (const auto known : selfContained) {
        if (sameName(name, known)) return FormatKind::memory;
    }
    return FormatKind::unsupported;
}

enum class Code {
    ok, busy, clipboardBusy, snapshotUnsupported, snapshotFailed,
    ownershipUnknown, clipboardChanged, writeFailed, pasteFailed,
    restoreFailed, invalidRequest, internalError
};
enum class Paste { notAttempted, submitted, uncertain };
enum class Clipboard { unchanged, restored, newer, unknown, partial };
enum class Publish { unchangedFailure, changedFailure, ready };
struct Result {
    Code code = Code::ok;
    Paste paste = Paste::notAttempted;
    Clipboard clipboard = Clipboard::unchanged;
};

class Host {
public:
    virtual ~Host() = default;
    virtual bool claim() noexcept = 0;
    virtual void releaseClaim() noexcept = 0;
    virtual bool open() noexcept = 0;
    virtual bool close() noexcept = 0;
    virtual std::uint32_t sequence() noexcept = 0;
    virtual bool isOwner() noexcept = 0;
    virtual Code snapshot() noexcept = 0;
    virtual Publish publish() noexcept = 0;
    virtual bool restore() noexcept = 0;
    virtual bool sendPaste() noexcept = 0;
    virtual void settlePaste() noexcept = 0;
};

// No writes or restoration are performed by a later TypeScript continuation.
// Checks and restoration take place inside the SAME OpenClipboard interval.
class Transaction {
public:
    explicit Transaction(Host& host) noexcept : host_(host) {}
    Transaction(const Transaction&) = delete;
    Transaction& operator=(const Transaction&) = delete;
    ~Transaction() {
        if (open_) host_.close();
        if (claimed_) host_.releaseClaim();
    }

    Result run() noexcept {
        if (used_) return {Code::invalidRequest};
        used_ = true;
        auto result = runOnce();
        // Do not report success while a final CloseClipboard is known to fail.
        // The destructor retries closure; no additional paste or restore occurs.
        if (!close() && result.code == Code::ok) result.code = Code::clipboardBusy;
        return result;
    }

private:
    Result runOnce() noexcept {
        Result result;
        if (!(claimed_ = host_.claim())) return {Code::busy};
        if (!open()) return {Code::clipboardBusy};
        if (host_.sequence() == 0) return {Code::ownershipUnknown};
        result.code = host_.snapshot();
        if (result.code != Code::ok) return result;
        const auto published = host_.publish();
        if (published == Publish::unchangedFailure) return {Code::writeFailed};
        // From here on, any error must explicitly account for the changed data.
        if (published == Publish::changedFailure) return rollback(Code::writeFailed);
        token_ = host_.sequence();
        if (token_ == 0) return rollback(Code::ownershipUnknown);
        if (!host_.isOwner()) return {Code::ownershipUnknown, Paste::notAttempted, Clipboard::unknown};
        if (!close()) return rollback(Code::clipboardBusy);

        // Refuse to paste if a copy overtook our temporary write before dispatch.
        if (!open()) return finish({Code::clipboardBusy});
        const auto beforePaste = ownership();
        if (beforePaste != Clipboard::unchanged) {
            return {beforePaste == Clipboard::newer ? Code::clipboardChanged : Code::ownershipUnknown,
                    Paste::notAttempted, beforePaste};
        }
        if (!close()) return rollback(Code::clipboardBusy);
        result.paste = Paste::uncertain;
        if (host_.sendPaste()) result.paste = Paste::submitted;
        else result.code = Code::pasteFailed;
        // A bounded grace period is not an acknowledgement from the target.
        // Do not automatically retry even if input submission was uncertain.
        host_.settlePaste();
        return finish(result);
    }

    bool open() noexcept {
        if (!open_) open_ = host_.open();
        return open_;
    }
    bool close() noexcept {
        if (!open_) return true;
        if (!host_.close()) return false;
        open_ = false;
        return true;
    }
    Clipboard ownership() noexcept {
        const auto current = host_.sequence();
        if (current == 0 || token_ == 0) return Clipboard::unknown;
        return current == token_ && host_.isOwner() ? Clipboard::unchanged : Clipboard::newer;
    }
    Result rollback(Code code) noexcept {
        // Only used before releasing the initial/dispatch lock: another writer
        // cannot have intervened. It is safe even if a sequence query failed.
        if (!host_.isOwner()) return {Code::ownershipUnknown, Paste::notAttempted, Clipboard::unknown};
        const bool restored = host_.restore();
        return {restored ? code : Code::restoreFailed, Paste::notAttempted,
                restored ? Clipboard::restored : Clipboard::partial};
    }
    Result finish(Result result) noexcept {
        if (!open()) return {Code::restoreFailed, result.paste, Clipboard::unknown};
        const auto current = ownership();
        if (current == Clipboard::newer) {
            result.clipboard = Clipboard::newer;
            return result;
        }
        if (current == Clipboard::unknown) return {Code::ownershipUnknown, result.paste, Clipboard::unknown};
        if (!host_.restore()) return {Code::restoreFailed, result.paste, Clipboard::partial};
        result.clipboard = Clipboard::restored;
        return result;
    }
    Host& host_;
    bool used_ = false;
    bool open_ = false;
    bool claimed_ = false;
    std::uint32_t token_ = 0;
};

constexpr const char* codeName(Code value) noexcept {
    switch (value) {
        case Code::ok: return "ok";
        case Code::busy: return "busy";
        case Code::clipboardBusy: return "clipboard_busy";
        case Code::snapshotUnsupported: return "snapshot_unsupported";
        case Code::snapshotFailed: return "snapshot_failed";
        case Code::ownershipUnknown: return "ownership_unknown";
        case Code::clipboardChanged: return "clipboard_changed";
        case Code::writeFailed: return "write_failed";
        case Code::pasteFailed: return "paste_failed";
        case Code::restoreFailed: return "restore_failed";
        case Code::invalidRequest: return "invalid_request";
        default: return "internal_error";
    }
}
constexpr const char* pasteName(Paste value) noexcept {
    return value == Paste::submitted ? "submitted" : value == Paste::uncertain ? "uncertain" : "not_attempted";
}
constexpr const char* clipboardName(Clipboard value) noexcept {
    switch (value) {
        case Clipboard::unchanged: return "unchanged";
        case Clipboard::restored: return "restored";
        case Clipboard::newer: return "newer";
        case Clipboard::partial: return "partial";
        default: return "unknown";
    }
}
}  // namespace universal_dictate::clipboard

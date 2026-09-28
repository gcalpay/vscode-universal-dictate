// Actual Win32 snapshot/restore smoke tests. NEVER run on a user's normal
// desktop: these tests intentionally replace the clipboard. CI is disposable.
#include "../../native/clipboard-win32.h"
#include <array>
#include <cstddef>
#include <cwchar>
#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace universal_dictate::clipboard;
namespace {
int passed = 0;
void require(bool condition, const char* text) {
    if (!condition) throw std::runtime_error(text);
}
class OpenGuard {
public:
    explicit OpenGuard(HWND owner) {
        for (int i = 0; i < 50; ++i) {
            if (OpenClipboard(owner)) { opened_ = true; return; }
            Sleep(5);
        }
        throw std::runtime_error("test clipboard busy");
    }
    ~OpenGuard() { if (opened_) CloseClipboard(); }
    OpenGuard(const OpenGuard&) = delete;
    OpenGuard& operator=(const OpenGuard&) = delete;
private:
    bool opened_ = false;
};
void seed(HWND window, std::vector<OwnedData> entries) {
    OpenGuard guard(window);
    require(EmptyClipboard() != 0, "seed clear failed");
    for (auto& entry : entries) {
        require(SetClipboardData(entry.format, entry.data) != nullptr, "seed SetClipboardData failed");
        entry.release();
    }
}
std::vector<unsigned char> memoryBytes(UINT id, HWND window) {
    OpenGuard guard(window);
    const HANDLE memory = GetClipboardData(id);
    require(memory != nullptr, "format missing after restoration");
    const auto size = GlobalSize(memory);
    GlobalView view(memory);
    require(size != 0 && view.data != nullptr, "memory data unreadable");
    const auto* begin = static_cast<const unsigned char*>(view.data);
    return {begin, begin + size};
}
OwnedData textData(const wchar_t* text) {
    return memoryData(CF_UNICODETEXT, text, (std::wcslen(text) + 1) * sizeof(wchar_t));
}
std::vector<OwnedData> one(OwnedData entry) {
    std::vector<OwnedData> values;
    values.push_back(std::move(entry));
    return values;
}
bool fakeSend() noexcept { return true; } // No keystrokes in clipboard smoke tests.
Result transaction(bool (*send)() noexcept = fakeSend) {
    NativeHost host(L"temporary transcript", send, std::chrono::milliseconds(0));
    Transaction tx(host);
    return tx.run();
}
void mustRestore(const Result& result) {
    require(result.code == Code::ok && result.paste == Paste::submitted &&
            result.clipboard == Clipboard::restored, "transaction did not restore");
}
HWND copyWindow = nullptr;
bool newerCopy() noexcept {
    try { seed(copyWindow, one(textData(L"newer copied text"))); return true; }
    catch (...) { return false; }
}
bool identicalNewerCopy() noexcept {
    try { seed(copyWindow, one(textData(L"temporary transcript"))); return true; }
    catch (...) { return false; }
}
bool failedPaste() noexcept { return false; }

struct DibPixel {
    BITMAPINFOHEADER header{};
    std::uint32_t pixel = 0x00205080;
    DibPixel() {
        header.biSize = sizeof(BITMAPINFOHEADER);
        header.biWidth = 1; header.biHeight = 1;
        header.biPlanes = 1; header.biBitCount = 32;
        header.biCompression = BI_RGB; header.biSizeImage = sizeof(pixel);
    }
};

// DROPFILES-compatible 20-byte header. No file is moved/deleted by this test.
struct FileList {
    DWORD offset = 20;
    POINT point{};
    BOOL nonClient = FALSE;
    BOOL wide = TRUE;
    wchar_t paths[32] = L"C:\\ud-test-inert.txt\0";
};
static_assert(offsetof(FileList, paths) == 20);
} // namespace

int main(int argc, char** argv) {
    if (argc != 2 || std::string_view(argv[1]) != "--allow-test-clipboard-replacement") {
        std::cerr << "Refused: disposable Windows test environment and explicit clipboard replacement flag required.\n";
        return 2;
    }
    try {
        ClipboardWindow window;
        copyWindow = window.window;
        auto test = [&](const char* name, auto body) {
            body(); ++passed; std::cout << "PASS " << name << '\n';
        };
        test("empty clipboard", [&] {
            seed(window.window, {});
            mustRestore(transaction());
            OpenGuard guard(window.window);
            require(CountClipboardFormats() == 0, "empty changed to empty text");
        });
        test("Unicode and synthesized text formats", [&] {
            seed(window.window, one(textData(L"original \u00e4\u00f6\u00fc \u6c34")));
            const auto original = memoryBytes(CF_UNICODETEXT, window.window);
            mustRestore(transaction());
            require(memoryBytes(CF_UNICODETEXT, window.window) == original, "Unicode data changed");
        });
        test("multi-format HTML/RTF and plain text", [&] {
            const UINT html = RegisterClipboardFormatW(L"HTML Format");
            const UINT rtf = RegisterClipboardFormatW(L"Rich Text Format");
            const std::string body = "<html><body><!--StartFragment-->clipboard fixture<!--EndFragment--></body></html>";
            std::string htmlBytes = "Version:1.0\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n";
            const std::size_t startHTML = htmlBytes.size();
            auto setOffset = [&](const std::string& field, std::size_t value) {
                char digits[11]{};
                std::snprintf(digits, sizeof(digits), "%010lu", static_cast<unsigned long>(value));
                htmlBytes.replace(htmlBytes.find(field) + field.size(), 10, digits);
            };
            setOffset("StartHTML:", startHTML);
            setOffset("EndHTML:", startHTML + body.size());
            setOffset("StartFragment:", startHTML + body.find("<!--StartFragment-->") + 20);
            setOffset("EndFragment:", startHTML + body.find("<!--EndFragment-->"));
            htmlBytes += body;
            const char rtfBytes[] = "{\\rtf1\\ansi clipboard fixture}";
            std::vector<OwnedData> entries;
            entries.push_back(memoryData(html, htmlBytes.c_str(), htmlBytes.size() + 1));
            entries.push_back(memoryData(rtf, rtfBytes, sizeof(rtfBytes)));
            entries.push_back(textData(L"plain alternative"));
            seed(window.window, std::move(entries));
            const auto beforeHTML = memoryBytes(html, window.window), beforeRTF = memoryBytes(rtf, window.window);
            mustRestore(transaction());
            require(memoryBytes(html, window.window) == beforeHTML && memoryBytes(rtf, window.window) == beforeRTF,
                    "rich representations lost");
        });
        test("DIB image", [&] {
            DibPixel dib;
            seed(window.window, one(memoryData(CF_DIB, &dib, sizeof(dib))));
            const auto before = memoryBytes(CF_DIB, window.window);
            mustRestore(transaction());
            require(memoryBytes(CF_DIB, window.window) == before, "DIB image bytes changed");
        });
        test("file-list representation", [&] {
            FileList files;
            seed(window.window, one(memoryData(CF_HDROP, &files, sizeof(files))));
            const auto before = memoryBytes(CF_HDROP, window.window);
            mustRestore(transaction());
            require(memoryBytes(CF_HDROP, window.window) == before, "file list lost");
        });
        test("bitmap and palette handles are independently duplicated", [&] {
            const std::array<std::uint32_t, 4> pixels{0, 0x00ffffff, 0x000000ff, 0x0000ff00};
            OwnedData bitmap(CF_BITMAP, FormatKind::bitmap, CreateBitmap(2, 2, 1, 32, pixels.data()));
            require(bitmap.data != nullptr, "test bitmap creation");
            LOGPALETTE palette{};
            palette.palVersion = 0x300; palette.palNumEntries = 1;
            palette.palPalEntry[0] = {10, 20, 30, 0};
            OwnedData pal(CF_PALETTE, FormatKind::palette, CreatePalette(&palette));
            require(pal.data != nullptr, "test palette creation");
            std::vector<OwnedData> entries;
            entries.push_back(std::move(bitmap)); entries.push_back(std::move(pal));
            seed(window.window, std::move(entries));
            mustRestore(transaction());
            OpenGuard guard(window.window);
            BITMAP restored{};
            require(GetObjectW(GetClipboardData(CF_BITMAP), sizeof(restored), &restored) == sizeof(restored), "bitmap handle unusable");
            require(restored.bmWidth == 2 && restored.bmHeight == 2, "bitmap geometry lost");
            PALETTEENTRY color{};
            require(GetPaletteEntries(static_cast<HPALETTE>(GetClipboardData(CF_PALETTE)), 0, 1, &color) == 1,
                    "palette handle unusable");
            require(color.peRed == 10 && color.peGreen == 20 && color.peBlue == 30, "palette content lost");
        });
        test("unknown registered format refuses before replacement", [&] {
            const UINT unknown = RegisterClipboardFormatW(L"UniversalDictate.UnsafeOpaqueFixture");
            const DWORD sentinel = 12345;
            seed(window.window, one(memoryData(unknown, &sentinel, sizeof(sentinel))));
            const auto before = memoryBytes(unknown, window.window);
            const DWORD sequence = GetClipboardSequenceNumber();
            const auto result = transaction();
            require(result.code == Code::snapshotUnsupported && result.paste == Paste::notAttempted,
                    "unknown format not refused");
            require(GetClipboardSequenceNumber() == sequence && memoryBytes(unknown, window.window) == before,
                    "unknown clipboard replaced");
        });
        test("newer copy is not overwritten", [&] {
            seed(window.window, one(textData(L"old")));
            const auto result = transaction(newerCopy);
            require(result.code == Code::ok && result.clipboard == Clipboard::newer, "newer copy not recognized");
            const auto bytes = memoryBytes(CF_UNICODETEXT, window.window);
            require(std::wstring(reinterpret_cast<const wchar_t*>(bytes.data())) == L"newer copied text", "newer copy lost");
        });
        test("identical newer copy is not overwritten", [&] {
            seed(window.window, one(textData(L"old")));
            const auto result = transaction(identicalNewerCopy);
            require(result.code == Code::ok && result.clipboard == Clipboard::newer, "identical newer copy not recognized");
            const auto bytes = memoryBytes(CF_UNICODETEXT, window.window);
            require(std::wstring(reinterpret_cast<const wchar_t*>(bytes.data())) == L"temporary transcript", "identical newer copy lost");
        });
        test("paste failure still restores original", [&] {
            seed(window.window, one(textData(L"restore after failure")));
            const auto before = memoryBytes(CF_UNICODETEXT, window.window);
            const auto result = transaction(failedPaste);
            require(result.code == Code::pasteFailed && result.clipboard == Clipboard::restored &&
                    result.paste == Paste::uncertain, "failure response");
            require(memoryBytes(CF_UNICODETEXT, window.window) == before, "failed paste original lost");
        });
        seed(window.window, {});
        std::cout << passed << " Win32 clipboard smoke tests passed (not target-focus tests)\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "FAIL Windows clipboard smoke: " << error.what() << '\n';
        return 1;
    }
}

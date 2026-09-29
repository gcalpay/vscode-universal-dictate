// Disposable CI desktop ONLY: sends real text to this process's scratch EDIT
// control and replaces this disposable station's clipboard with test fixtures.
#define main universalDictateInputMainForTest
#include "../../native/windows-text-input.cpp"
#undef main
#include <cstring>
#include <iostream>
#include <stdexcept>

using namespace universal_dictate::text_input;
namespace {
void require(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
bool neverCancelled() noexcept { return false; }
bool alwaysCancelled() noexcept { return true; }
void pump() { MSG m{}; while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); } }
std::wstring read(HWND edit) {
    const auto n = GetWindowTextLengthW(edit);
    std::wstring text(static_cast<std::size_t>(n) + 1, L'\0');
    text.resize(GetWindowTextW(edit, text.data(), static_cast<int>(text.size())));
    return text;
}
void expectText(HWND edit, const std::wstring& expected) {
    const auto end = GetTickCount64() + 3000;
    do { pump(); if (read(edit) == expected) return; Sleep(5); } while (GetTickCount64() < end);
    throw std::runtime_error("scratch EDIT did not receive expected Unicode text");
}
class TestWindow {
public:
    TestWindow() {
        WNDCLASSW cls{}; cls.lpfnWndProc = DefWindowProcW; cls.hInstance = GetModuleHandleW(nullptr);
        cls.lpszClassName = L"UniversalDictateUnicodeTest";
        require(RegisterClassW(&cls) || GetLastError() == ERROR_CLASS_ALREADY_EXISTS, "window registration");
        window = CreateWindowExW(0, cls.lpszClassName, L"Universal Dictate automated scratch target", WS_OVERLAPPEDWINDOW,
                                 40, 40, 640, 300, nullptr, nullptr, cls.hInstance, nullptr);
        require(window != nullptr, "test window");
        edit = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_BORDER | ES_MULTILINE,
                               10, 10, 580, 180, window, nullptr, cls.hInstance, nullptr);
        require(edit != nullptr, "test edit");
        ShowWindow(window, SW_SHOWNORMAL); SetForegroundWindow(window); SetFocus(edit); pump();
        require(GetForegroundWindow() == window && currentTarget().focus == edit, "CI desktop cannot focus scratch target");
    }
    ~TestWindow() { if (window) DestroyWindow(window); }
    HWND window = nullptr, edit = nullptr;
};
}
int main(int argc, char** argv) {
    if (argc != 2 || std::string_view(argv[1]) != "--allow-disposable-desktop-input") {
        std::cerr << "Refused: test requires a disposable desktop and explicit input/clipboard permission.\n"; return 2;
    }
    try {
        TestWindow target;
        // The exact class of old failure: normal text PLUS unknown application
        // metadata. Clipboard-free insertion must neither inspect nor replace it.
        const UINT opaque = RegisterClipboardFormatW(L"UD.Test.UnknownApplicationMetadata");
        require(opaque != 0, "register fixture");
        require(OpenClipboard(target.window) != 0, "open fixture clipboard");
        require(EmptyClipboard() != 0, "clear fixture clipboard");
        const DWORD original = 0x31504455;
        const auto data = GlobalAlloc(GMEM_MOVEABLE, sizeof(original)); require(data != nullptr, "fixture allocation");
        auto* memory = GlobalLock(data); require(memory != nullptr, "fixture lock");
        std::memcpy(memory, &original, sizeof(original)); GlobalUnlock(data);
        if (!SetClipboardData(opaque, data)) { GlobalFree(data); CloseClipboard(); throw std::runtime_error("fixture write"); }
        constexpr wchar_t oldText[] = L"original clipboard text";
        const auto plain = GlobalAlloc(GMEM_MOVEABLE, sizeof(oldText)); require(plain != nullptr, "text fixture allocation");
        auto* plainBytes = GlobalLock(plain); require(plainBytes != nullptr, "text fixture lock");
        std::memcpy(plainBytes, oldText, sizeof(oldText)); GlobalUnlock(plain);
        if (!SetClipboardData(CF_UNICODETEXT, plain)) { GlobalFree(plain); CloseClipboard(); throw std::runtime_error("text fixture write"); }
        CloseClipboard();
        const auto sequence = GetClipboardSequenceNumber();
        auto result = sendText(prepareText(u"Grüße 水 🧪"), neverCancelled);
        require(std::string_view(result.code) == "ok", "Unicode input submission");
        expectText(target.edit, L"Grüße 水 🧪");
        require(GetClipboardSequenceNumber() == sequence, "direct input changed clipboard");
        std::cout << "PASS actual Unicode input while unknown clipboard format remains untouched\n";

        SetWindowTextW(target.edit, L"before OLD after"); SendMessageW(target.edit, EM_SETSEL, 7, 10);
        result = sendText(prepareText(u"NEW"), neverCancelled);
        require(std::string_view(result.code) == "ok", "selection input"); expectText(target.edit, L"before NEW after");
        std::cout << "PASS real selection replacement\n";

        SetWindowTextW(target.edit, L""); SendMessageW(target.edit, EM_SETSEL, 0, 0);
        result = sendText(prepareText(u"A\r\nB\tC\bD"), neverCancelled);
        require(std::string_view(result.code) == "ok", "control-safe text"); expectText(target.edit, L"A B C D");
        std::cout << "PASS no Enter, Tab or Backspace actions\n";

        const std::u16string longText = std::u16string(127, u'x') + u"🧪" + std::u16string(512, u'y');
        std::wstring longExpected; for (auto c : longText) longExpected.push_back(static_cast<wchar_t>(c));
        SetWindowTextW(target.edit, L""); SendMessageW(target.edit, EM_SETSEL, 0, 0);
        result = sendText(prepareText(longText), neverCancelled);
        require(std::string_view(result.code) == "ok", "chunked input"); expectText(target.edit, longExpected);
        std::cout << "PASS chunked input keeps surrogate pairs\n";

        result = sendText(u"must not appear", alwaysCancelled);
        require(std::string_view(result.code) == "cancelled", "pre-cancel"); pump(); require(read(target.edit) == longExpected, "cancelled text emitted");
        SetFocus(nullptr); result = sendText(u"no focus", neverCancelled);
        require(std::string_view(result.code) == "no_target", "missing focus is not a no-op");
        require(GetClipboardSequenceNumber() == sequence, "cancel or no-target touched clipboard");
        std::cout << "PASS cancellation and absent target never touch clipboard\n";
        require(OpenClipboard(target.window) != 0, "final fixture check");
        const auto existing = GetClipboardData(opaque); require(existing != nullptr, "unknown fixture was lost");
        const auto* bytes = static_cast<const DWORD*>(GlobalLock(existing));
        const bool unchanged = bytes && *bytes == original;
        if (bytes) GlobalUnlock(existing);
        EmptyClipboard(); CloseClipboard(); // Only the explicitly disposable test fixture.
        require(unchanged, "unknown clipboard content changed");
        std::cout << "5 real Win32 input checks passed; not a VS Code/Codex acceptance test\n";
        return 0;
    } catch (const std::exception& e) { std::cerr << "FAIL: " << e.what() << '\n'; return 1; }
}

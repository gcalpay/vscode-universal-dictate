/* Universal Dictate - clipboard-free Unicode input helper. SPDX-License-Identifier: MIT */
#include "text-input-request.h"
#include "unicode-input.h"
#include <array>
#include <cstdio>
#include <string>

namespace universal_dictate::text_input {
struct Result { const char* code; const char* input; };
constexpr std::array<WORD, 8> kModifiers = {
    VK_LCONTROL, VK_RCONTROL, VK_LSHIFT, VK_RSHIFT,
    VK_LMENU, VK_RMENU, VK_LWIN, VK_RWIN
};

bool modifiersHeld() noexcept {
    for (auto vk : kModifiers) if ((GetAsyncKeyState(vk) & 0x8000) != 0) return true;
    return false;
}

struct Target {
    HWND foreground = nullptr;
    HWND focus = nullptr;
    DWORD thread = 0;
    bool operator==(const Target&) const = default;
};
Target currentTarget() noexcept {
    Target target;
    target.foreground = GetForegroundWindow();
    if (!target.foreground) return {};
    target.thread = GetWindowThreadProcessId(target.foreground, nullptr);
    GUITHREADINFO info{};
    info.cbSize = sizeof(info);
    if (!target.thread || !GetGUIThreadInfo(target.thread, &info) || !info.hwndFocus ||
        !IsWindow(info.hwndFocus) ||
        (info.flags & (GUI_INMENUMODE | GUI_POPUPMENUMODE | GUI_SYSTEMMENUMODE | GUI_INMOVESIZE))) return {};
    target.focus = info.hwndFocus;
    // HWND focus is not proof of an editable DOM element or a valid caret.
    // No restoration, global hooks or private webview APIs are used here.
    return GetForegroundWindow() == target.foreground ? target : Target{};
}

class InputClaim {
public:
    InputClaim() noexcept {
        mutex_ = CreateMutexW(nullptr, FALSE, L"Local\\UniversalDictateTextInputV1");
        if (!mutex_) return;
        const auto result = WaitForSingleObject(mutex_, 0);
        owned_ = result == WAIT_OBJECT_0 || result == WAIT_ABANDONED;
    }
    ~InputClaim() { if (owned_) ReleaseMutex(mutex_); if (mutex_) CloseHandle(mutex_); }
    InputClaim(const InputClaim&) = delete;
    InputClaim& operator=(const InputClaim&) = delete;
    bool owned() const noexcept { return owned_; }
private:
    HANDLE mutex_ = nullptr;
    bool owned_ = false;
};

// Shared with the explicit disposable-desktop Win32 integration test.
Result sendText(std::u16string_view text, bool (*cancelled)() noexcept = requestCancelled) noexcept {
    if (cancelled()) return {"cancelled", "not_attempted"};
    InputClaim claim;
    if (!claim.owned()) return {"busy", "not_attempted"};
    // Wait for physical shortcut keys to be released. Do not synthesize or
    // restore modifier state that may have changed while the user was typing.
    const auto deadline = GetTickCount64() + 1000;
    while (modifiersHeld()) {
        if (cancelled()) return {"cancelled", "not_attempted"};
        if (GetTickCount64() >= deadline) return {"modifiers_held", "not_attempted"};
        Sleep(5);
    }
    const Target target = currentTarget();
    if (!target.focus) return {"no_target", "not_attempted"};
    std::size_t offset = 0;
    bool submitted = false;
    while (offset < text.size()) {
        const char* progress = submitted ? "partial" : "not_attempted";
        if (cancelled()) return {"cancelled", progress};
        if (!(currentTarget() == target)) return {"focus_changed", progress};
        if (modifiersHeld()) return {"modifiers_held", progress};
        const auto batch = nextBatch(text, offset);
        if (!batch.count) return {"invalid_request", progress};
        std::array<INPUT, kBatchUnits * 2> input{};
        for (std::size_t i = 0; i < batch.count; ++i) {
            input[i].type = INPUT_KEYBOARD;
            input[i].ki.wVk = 0; // VK_PACKET via Unicode, never Enter/Ctrl+V.
            input[i].ki.wScan = static_cast<WORD>(batch.events[i].unit);
            input[i].ki.dwFlags = KEYEVENTF_UNICODE | (batch.events[i].up ? KEYEVENTF_KEYUP : 0);
        }
        const auto sent = SendInput(static_cast<UINT>(batch.count), input.data(), sizeof(INPUT));
        if (sent != batch.count) {
            if (sent & 1u) {
                // Release only an unmatched packet, never resend text.
                auto release = input[sent - 1]; release.ki.dwFlags |= KEYEVENTF_KEYUP;
                SendInput(1, &release, sizeof(INPUT));
            }
            return {"input_failed", sent || submitted ? "partial" : "not_attempted"};
        }
        submitted = true;
        offset = batch.next;
        if (offset < text.size()) Sleep(1); // Bounded chunks; allow cancellation.
    }
    return {"ok", "submitted"}; // Submission is not an application acknowledgement.
}

int report(Result result) noexcept {
    std::printf("{\"protocol\":1,\"code\":\"%s\",\"input\":\"%s\"}\n", result.code, result.input);
    return std::string_view(result.code) == "ok" || std::string_view(result.code) == "no_target" ? 0 : 1;
}
} // namespace universal_dictate::text_input

int main(int argc, char** argv) {
    using namespace universal_dictate::text_input;
    if (argc != 2 || std::string_view(argv[1]) != "--unicode-input-v1")
        return report({"invalid_request", "not_attempted"});
    try {
        std::wstring decoded;
        if (!readTranscript(decoded)) return report({"invalid_request", "not_attempted"});
        std::u16string units;
        units.reserve(decoded.size());
        static_assert(sizeof(wchar_t) == sizeof(char16_t));
        for (wchar_t c : decoded) units.push_back(static_cast<char16_t>(c));
        const auto text = prepareText(units);
        return report(sendText(text));
    } catch (...) {
        return report({"internal_error", "not_attempted"}); // Never echo transcript.
    }
}

/*
 * Universal Dictate - Windows focused-input paste helper
 *
 * This C++ implementation evolved from an early Universal Dictate adaptation
 * of OpenWhispr's MIT-licensed resources/windows-fast-paste.c at revision
 * 1866ecf6641b9fa4851f19c7838cb18f3662def7. It has since been substantially
 * rewritten and reduced to Universal Dictate's Ctrl+V-only focused-input use
 * case. The OpenWhispr MIT notice is retained in
 * third_party/OpenWhispr-LICENSE.txt.
 *
 * The helper uses documented Win32 keyboard input APIs. It synthesizes Ctrl+V
 * only and never sends Enter.
 *
 * SPDX-License-Identifier: MIT
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <array>
#include <chrono>
#include <cstdio>
#include <thread>
#include <vector>

namespace {

constexpr std::array<WORD, 8> kModifierKeys = {
    VK_LCONTROL,
    VK_RCONTROL,
    VK_LSHIFT,
    VK_RSHIFT,
    VK_LMENU,
    VK_RMENU,
    VK_LWIN,
    VK_RWIN,
};

INPUT makeKeyboardInput(WORD virtualKey, DWORD flags = 0) noexcept {
    INPUT input{};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = virtualKey;
    input.ki.wScan = static_cast<WORD>(MapVirtualKeyW(virtualKey, MAPVK_VK_TO_VSC));
    input.ki.dwFlags = flags;
    return input;
}

bool sendInputs(const std::vector<INPUT>& inputs) noexcept {
    if (inputs.empty()) {
        return true;
    }

    return SendInput(
               static_cast<UINT>(inputs.size()),
               const_cast<INPUT*>(inputs.data()),
               sizeof(INPUT)) == inputs.size();
}

class TemporarilyReleasedModifiers {
public:
    bool release() {
        std::vector<INPUT> releases;
        releases.reserve(kModifierKeys.size());

        for (const WORD key : kModifierKeys) {
            if ((GetAsyncKeyState(key) & 0x8000) == 0) {
                continue;
            }

            heldKeys_.push_back(key);
            releases.push_back(makeKeyboardInput(key, KEYEVENTF_KEYUP));
        }

        return sendInputs(releases);
    }

    TemporarilyReleasedModifiers(const TemporarilyReleasedModifiers&) = delete;
    TemporarilyReleasedModifiers& operator=(const TemporarilyReleasedModifiers&) = delete;

    TemporarilyReleasedModifiers() = default;

    ~TemporarilyReleasedModifiers() {
        std::vector<INPUT> restores;
        restores.reserve(heldKeys_.size());

        for (const WORD key : heldKeys_) {
            restores.push_back(makeKeyboardInput(key));
        }

        sendInputs(restores);
    }

private:
    std::vector<WORD> heldKeys_;
};

bool sendPasteShortcut() noexcept {
    std::array<INPUT, 4> inputs = {
        makeKeyboardInput(VK_LCONTROL),
        makeKeyboardInput('V'),
        makeKeyboardInput('V', KEYEVENTF_KEYUP),
        makeKeyboardInput(VK_LCONTROL, KEYEVENTF_KEYUP),
    };

    return SendInput(
               static_cast<UINT>(inputs.size()),
               inputs.data(),
               sizeof(INPUT)) == inputs.size();
}

}  // namespace

int main() {
    TemporarilyReleasedModifiers modifiers;
    if (!modifiers.release()) {
        std::fprintf(stderr, "ERROR: could not release active modifier keys (Win32 error %lu)\n", GetLastError());
        return 1;
    }

    // The command is normally triggered while Ctrl/Alt are physically being
    // released. Give VS Code a moment to finish processing that shortcut.
    std::this_thread::sleep_for(std::chrono::milliseconds(10));

    if (!sendPasteShortcut()) {
        std::fprintf(stderr, "ERROR: SendInput could not synthesize Ctrl+V (Win32 error %lu)\n", GetLastError());
        return 2;
    }

    return 0;
}

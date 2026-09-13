// Universal Dictate M1.2: diagnostic completion signal, not a product hotkey.
// Registers only while transcription is pending. Never focuses a window or types.
// SPDX-License-Identifier: MIT
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cerrno>
#include <cstdlib>
#include <iostream>

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    char* end = nullptr;
    errno = 0;
    const unsigned long pid = std::strtoul(argv[1], &end, 10);
    if (errno != 0 || end == argv[1] || *end != '\0' || pid == 0) return 2;
    HANDLE parent = OpenProcess(SYNCHRONIZE, FALSE, static_cast<DWORD>(pid));
    if (parent == nullptr) return 3;
    MSG message{};
    PeekMessageW(&message, nullptr, 0, 0, PM_NOREMOVE);
    if (!RegisterHotKey(nullptr, 1, MOD_CONTROL | MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, VK_F8)) {
        std::cerr << "Diagnostic release shortcut unavailable: " << GetLastError() << '\n';
        CloseHandle(parent);
        return 4;
    }
    std::cout << "READY\n" << std::flush;
    int result = 5;
    bool finished = false;
    while (!finished) {
        const DWORD wait = MsgWaitForMultipleObjects(1, &parent, FALSE, INFINITE, QS_ALLINPUT);
        if (wait != WAIT_OBJECT_0 + 1) break; // Parent exits or wait fails: never release text.
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            if (message.message != WM_HOTKEY || message.wParam != 1) continue;
            // Release the diagnostic chord physically before the real Ctrl+V helper runs.
            const ULONGLONG limit = GetTickCount64() + 10000;
            while ((GetAsyncKeyState(VK_CONTROL) | GetAsyncKeyState(VK_MENU) |
                    GetAsyncKeyState(VK_SHIFT) | GetAsyncKeyState(VK_F8)) & 0x8000) {
                if (WaitForSingleObject(parent, 0) != WAIT_TIMEOUT || GetTickCount64() >= limit) {
                    finished = true;
                    break;
                }
                Sleep(10);
            }
            if (!finished) {
                std::cout << "RELEASE\n" << std::flush;
                result = 0;
                finished = true;
            }
        }
    }
    UnregisterHotKey(nullptr, 1);
    CloseHandle(parent);
    return result;
}

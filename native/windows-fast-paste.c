/**
 * Universal Dictate - Windows fast paste helper
 *
 * Derived from OpenWhispr's `resources/windows-fast-paste.c` at
 * revision 1866ecf6641b9fa4851f19c7838cb18f3662def7.
 *
 * Copyright (c) 2024 OpenWhispr Team
 * Modifications copyright (c) 2026 Universal Dictate contributors
 * SPDX-License-Identifier: MIT
 *
 * See ../third_party/OpenWhispr-LICENSE.txt.
 *
 * Universal Dictate only needs normal Ctrl+V injection. Terminal dictation is
 * disabled at the VS Code layer by default and this helper never sends Enter.
 *
 * MSVC:
 *   cl /O2 windows-fast-paste.c /Fe:windows-fast-paste.exe user32.lib
 * MinGW:
 *   gcc -O2 windows-fast-paste.c -o windows-fast-paste.exe -luser32
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>

static void SetKey(INPUT* input, WORD vk, DWORD flags) {
    input->type = INPUT_KEYBOARD;
    input->ki.wVk = vk;
    input->ki.wScan = (WORD)MapVirtualKeyA(vk, MAPVK_VK_TO_VSC);
    input->ki.dwFlags = flags;
}

static const WORD MODIFIER_VKS[] = {
    VK_LCONTROL, VK_RCONTROL,
    VK_LSHIFT,   VK_RSHIFT,
    VK_LMENU,    VK_RMENU,
    VK_LWIN,     VK_RWIN,
};
#define NUM_MODIFIERS (sizeof(MODIFIER_VKS) / sizeof(MODIFIER_VKS[0]))

static int ReleaseModifiers(INPUT* released, WORD* releasedVKs) {
    int count = 0;
    for (int i = 0; i < (int)NUM_MODIFIERS; i++) {
        if (GetAsyncKeyState(MODIFIER_VKS[i]) & 0x8000) {
            releasedVKs[count] = MODIFIER_VKS[i];
            SetKey(&released[count], MODIFIER_VKS[i], KEYEVENTF_KEYUP);
            count++;
        }
    }

    if (count > 0) {
        SendInput((UINT)count, released, sizeof(INPUT));
    }
    return count;
}

static void RestoreModifiers(WORD* releasedVKs, int count) {
    if (count == 0) return;

    INPUT restore[NUM_MODIFIERS];
    ZeroMemory(restore, sizeof(restore));

    for (int i = 0; i < count; i++) {
        SetKey(&restore[i], releasedVKs[i], 0);
    }
    SendInput((UINT)count, restore, sizeof(INPUT));
}

static int SendPaste(void) {
    INPUT inputs[4];
    ZeroMemory(inputs, sizeof(inputs));

    SetKey(&inputs[0], VK_LCONTROL, 0);
    SetKey(&inputs[1], 'V', 0);
    SetKey(&inputs[2], 'V', KEYEVENTF_KEYUP);
    SetKey(&inputs[3], VK_LCONTROL, KEYEVENTF_KEYUP);

    return SendInput(4, inputs, sizeof(INPUT)) == 4 ? 0 : 1;
}

static BOOL GetExeName(HWND hwnd, char* exeName, DWORD exeNameSize) {
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid == 0) return FALSE;

    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) return FALSE;

    char exePath[MAX_PATH];
    DWORD pathLen = MAX_PATH;
    BOOL ok = QueryFullProcessImageNameA(process, 0, exePath, &pathLen);
    CloseHandle(process);

    if (!ok || pathLen == 0) return FALSE;

    const char* baseName = strrchr(exePath, '\\');
    baseName = baseName ? baseName + 1 : exePath;
    strncpy(exeName, baseName, exeNameSize - 1);
    exeName[exeNameSize - 1] = '\0';
    return TRUE;
}

int main(int argc, char* argv[]) {
    BOOL detectOnly = FALSE;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--detect-only") == 0) {
            detectOnly = TRUE;
        }
    }

    HWND hwnd = GetForegroundWindow();
    if (!hwnd) {
        fprintf(stderr, "ERROR: No foreground window found\n");
        return 2;
    }

    char className[256] = {0};
    if (GetClassNameA(hwnd, className, sizeof(className)) == 0) {
        fprintf(stderr, "ERROR: Could not get window class name (error %lu)\n", GetLastError());
        return 1;
    }

    char exeName[MAX_PATH] = {0};
    BOOL gotExeName = GetExeName(hwnd, exeName, sizeof(exeName));

    if (detectOnly) {
        printf("TARGET %p\n", (void*)hwnd);
        printf("WINDOW_CLASS %s\n", className);
        if (gotExeName) {
            printf("EXE_NAME %s\n", exeName);
        }
        return 0;
    }

    INPUT releasedInputs[NUM_MODIFIERS];
    WORD releasedVKs[NUM_MODIFIERS];
    ZeroMemory(releasedInputs, sizeof(releasedInputs));

    int releasedCount = ReleaseModifiers(releasedInputs, releasedVKs);
    Sleep(10);
    int result = SendPaste();
    RestoreModifiers(releasedVKs, releasedCount);

    if (result != 0) {
        fprintf(stderr, "ERROR: SendInput failed (error %lu)\n", GetLastError());
        return 1;
    }

    printf("PASTE_OK %s\n", className);
    return 0;
}

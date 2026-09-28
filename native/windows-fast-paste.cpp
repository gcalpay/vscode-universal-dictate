/*
 * Universal Dictate - Windows focused-input paste helper
 *
 * Evolved from the MIT-licensed OpenWhispr windows-fast-paste.c at revision
 * 1866ecf6641b9fa4851f19c7838cb18f3662def7. The notice remains in
 * third_party/OpenWhispr-LICENSE.txt. This helper sends Ctrl+V only, never Enter.
 *
 * SPDX-License-Identifier: MIT
 */
#include "clipboard-win32.h"
#include <array>
#include <charconv>
#include <cstdio>
#include <string>

namespace {
using namespace universal_dictate::clipboard;
constexpr std::size_t kMaxTranscriptBytes = 4u * 1024u * 1024u;
constexpr std::array<WORD, 8> kModifiers = {
    VK_LCONTROL, VK_RCONTROL, VK_LSHIFT, VK_RSHIFT,
    VK_LMENU, VK_RMENU, VK_LWIN, VK_RWIN
};

INPUT key(WORD vk, DWORD flags = 0) noexcept {
    INPUT input{};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = vk;
    input.ki.wScan = static_cast<WORD>(MapVirtualKeyW(vk, MAPVK_VK_TO_VSC));
    input.ki.dwFlags = flags;
    return input;
}

class ReleasedModifiers {
public:
    bool release() noexcept {
        std::array<INPUT, kModifiers.size()> releases{};
        for (WORD vk : kModifiers) {
            if ((GetAsyncKeyState(vk) & 0x8000) == 0) continue;
            held_[count_] = vk;
            releases[count_++] = key(vk, KEYEVENTF_KEYUP);
        }
        return count_ == 0 || SendInput(count_, releases.data(), sizeof(INPUT)) == count_;
    }
    ~ReleasedModifiers() {
        // No allocation or exception is possible while restoring key state.
        std::array<INPUT, kModifiers.size()> restores{};
        for (UINT i = 0; i < count_; ++i) restores[i] = key(held_[i]);
        if (count_) SendInput(count_, restores.data(), sizeof(INPUT));
    }
private:
    std::array<WORD, kModifiers.size()> held_{};
    UINT count_ = 0;
};

bool requestCancelled() noexcept {
    DWORD available = 0;
    // EOF/broken pipe means the operation or host has ended. No second request
    // is accepted. Unexpected extra bytes also fail closed, never trigger paste.
    return !PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE), nullptr, 0, nullptr, &available, nullptr)
        || available != 0;
}

bool sendPaste() noexcept {
    if (requestCancelled()) return false;
    if (!GetForegroundWindow()) return false;
    ReleasedModifiers modifiers;
    if (!modifiers.release()) return false;
    // Retain the existing shortcut-release grace; this is not focus restoration.
    Sleep(10);
    if (requestCancelled()) return false;
    std::array<INPUT, 4> input = {
        key(VK_LCONTROL), key('V'), key('V', KEYEVENTF_KEYUP), key(VK_LCONTROL, KEYEVENTF_KEYUP)
    };
    const UINT sent = SendInput(static_cast<UINT>(input.size()), input.data(), sizeof(INPUT));
    if (sent != input.size()) {
        // Release keys after a partial submission, but never repeat the paste.
        std::array<INPUT, 2> release = {key('V', KEYEVENTF_KEYUP), key(VK_LCONTROL, KEYEVENTF_KEYUP)};
        SendInput(static_cast<UINT>(release.size()), release.data(), sizeof(INPUT));
        return false;
    }
    return true;
}

// Read only the declared bytes; buffered stdio could hide a lifetime-pipe
// disconnect or unexpected trailing control data from PeekNamedPipe.
bool readExact(HANDLE pipe, char* target, std::size_t size, ULONGLONG deadline) noexcept {
    std::size_t read = 0;
    while (read < size) {
        DWORD available = 0;
        if (!PeekNamedPipe(pipe, nullptr, 0, nullptr, &available, nullptr)) return false;
        if (available == 0) {
            if (GetTickCount64() >= deadline) return false;
            Sleep(5);
            continue;
        }
        const auto wanted = static_cast<DWORD>(std::min<std::size_t>(size - read, available));
        DWORD received = 0;
        if (!ReadFile(pipe, target + read, wanted, &received, nullptr) || received == 0) return false;
        read += received;
    }
    return true;
}

bool readTranscript(std::wstring& result) {
    const HANDLE pipe = GetStdHandle(STD_INPUT_HANDLE);
    if (pipe == INVALID_HANDLE_VALUE || GetFileType(pipe) != FILE_TYPE_PIPE) return false;
    const ULONGLONG deadline = GetTickCount64() + 10000;
    std::string header;
    char c = 0;
    while (readExact(pipe, &c, 1, deadline) && c != '\n') {
        if (header.size() >= 32) return false;
        header.push_back(c);
    }
    constexpr std::string_view prefix = "UDCP2 ";
    if (c != '\n' || !header.starts_with(prefix)) return false;
    std::size_t expected = 0;
    const char* begin = header.data() + prefix.size();
    const char* end = header.data() + header.size();
    const auto parsed = std::from_chars(begin, end, expected);
    if (parsed.ec != std::errc{} || parsed.ptr != end || expected == 0 || expected > kMaxTranscriptBytes)
        return false;
    std::string bytes(expected, '\0');
    if (!readExact(pipe, bytes.data(), expected, deadline) || bytes.find('\0') != std::string::npos)
        return false;
    const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes.data(),
                                         static_cast<int>(bytes.size()), nullptr, 0);
    if (length <= 0) return false;
    result.resize(length);
    return MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes.data(),
                              static_cast<int>(bytes.size()), result.data(), length) == length;
}

int report(Result result) noexcept {
    std::printf("{\"protocol\":2,\"code\":\"%s\",\"paste\":\"%s\",\"clipboard\":\"%s\"}\n",
                codeName(result.code), pasteName(result.paste), clipboardName(result.clipboard));
    return result.code == Code::ok ? 0 : 1;
}
}  // namespace

int main(int argc, char** argv) {
    // A different output binary name prevents old helpers (which ignore argv)
    // from pasting the user's clipboard when asked to speak the new protocol.
    if (argc != 2 || std::string_view(argv[1]) != "--clipboard-transaction-v2")
        return report({Code::invalidRequest});
    try {
        std::wstring text;
        if (!readTranscript(text)) return report({Code::invalidRequest});
        if (requestCancelled()) return report({Code::cancelled});
        NativeHost host(text, sendPaste, std::chrono::milliseconds(120), requestCancelled);
        Result result;
        {
            Transaction transaction(host);
            result = transaction.run();
        } // Release the clipboard/mutex before reporting completion to the host.
        return report(result);
    } catch (...) {
        // All allocations are before mutation or caught by snapshot().
        // No clipboard content, transcript, path, or arbitrary exception is logged.
        return report({Code::internalError});
    }
}

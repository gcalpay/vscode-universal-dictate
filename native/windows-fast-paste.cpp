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
#include <fcntl.h>
#include <io.h>
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

bool sendPaste() noexcept {
    if (!GetForegroundWindow()) return false;
    ReleasedModifiers modifiers;
    if (!modifiers.release()) return false;
    // Retain the existing shortcut-release grace; this is not focus restoration.
    Sleep(10);
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

bool readTranscript(std::wstring& result) {
    if (_setmode(_fileno(stdin), _O_BINARY) == -1) return false;
    // A length-prefixed frame prevents a truncated pipe/parent failure from
    // turning a valid prefix of the transcript into an unintended short paste.
    std::string header;
    for (int c; (c = std::fgetc(stdin)) != '\n';) {
        if (c == EOF || header.size() >= 32) return false;
        header.push_back(static_cast<char>(c));
    }
    constexpr std::string_view prefix = "UDCP1 ";
    if (!header.starts_with(prefix)) return false;
    std::size_t expected = 0;
    const char* begin = header.data() + prefix.size();
    const char* end = header.data() + header.size();
    const auto parsed = std::from_chars(begin, end, expected);
    if (parsed.ec != std::errc{} || parsed.ptr != end || expected == 0 ||
        expected > kMaxTranscriptBytes) return false;
    std::string bytes(expected, '\0');
    std::size_t read = 0;
    while (read < expected) {
        const auto count = std::fread(bytes.data() + read, 1, expected - read, stdin);
        if (count == 0) return false;
        read += count;
    }
    // No extra data, truncated frame, nulls, or invalid UTF-8 is accepted.
    if (std::fgetc(stdin) != EOF || std::ferror(stdin) || bytes.find('\0') != std::string::npos)
        return false;
    const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes.data(),
                                         static_cast<int>(bytes.size()), nullptr, 0);
    if (length <= 0) return false;
    result.resize(length);
    return MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes.data(),
                              static_cast<int>(bytes.size()), result.data(), length) == length;
}

int report(Result result) noexcept {
    std::printf("{\"protocol\":1,\"code\":\"%s\",\"paste\":\"%s\",\"clipboard\":\"%s\"}\n",
                codeName(result.code), pasteName(result.paste), clipboardName(result.clipboard));
    return result.code == Code::ok ? 0 : 1;
}
}  // namespace

int main(int argc, char** argv) {
    // A different output binary name prevents old helpers (which ignore argv)
    // from pasting the user's clipboard when asked to speak the new protocol.
    if (argc != 2 || std::string_view(argv[1]) != "--clipboard-transaction-v1")
        return report({Code::invalidRequest});
    try {
        std::wstring text;
        if (!readTranscript(text)) return report({Code::invalidRequest});
        NativeHost host(text, sendPaste);
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

#pragma once
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <algorithm>
#include <charconv>
#include <string>
#include <string_view>

namespace universal_dictate::text_input {
constexpr std::size_t kMaxTranscriptBytes = 4u * 1024u * 1024u;
inline bool requestCancelled() noexcept {
    DWORD available = 0;
    return !PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE), nullptr, 0, nullptr, &available, nullptr)
        || available != 0;
}
// Read only the declared bytes; buffered stdio could hide a lifetime-pipe
// disconnect or unexpected trailing control data from PeekNamedPipe.
inline bool readExact(HANDLE pipe, char* target, std::size_t size, ULONGLONG deadline) noexcept {
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

inline bool readTranscript(std::wstring& result) {
    const HANDLE pipe = GetStdHandle(STD_INPUT_HANDLE);
    if (pipe == INVALID_HANDLE_VALUE || GetFileType(pipe) != FILE_TYPE_PIPE) return false;
    const ULONGLONG deadline = GetTickCount64() + 10000;
    std::string header;
    char c = 0;
    while (readExact(pipe, &c, 1, deadline) && c != '\n') {
        if (header.size() >= 32) return false;
        header.push_back(c);
    }
    constexpr std::string_view prefix = "UDTI1 ";
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

} // namespace universal_dictate::text_input

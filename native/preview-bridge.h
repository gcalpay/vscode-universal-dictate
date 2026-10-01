/* Local, bounded recorder preview protocol. SPDX-License-Identifier: MIT */
#pragma once
#include "preview-buffer.h"
#include <charconv>
#include <mutex>
#include <string>
#include <string_view>

namespace universal_dictate::preview {
inline bool validSession(std::string_view id) {
    if (id.empty() || id.size() > 128) return false;
    for (const auto c : id)
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
    return true;
}
inline bool number(std::string_view input, std::uint64_t& value) {
    const auto parsed = std::from_chars(input.data(), input.data() + input.size(), value);
    return parsed.ec == std::errc{} && parsed.ptr == input.data() + input.size() && value > 0 && value <= 9007199254740991ULL;
}
inline int nibble(char c) noexcept {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    return -1;
}
class Bridge {
public:
    explicit Bridge(std::string id) : session(std::move(id)) {}
    Buffer audio;
    const std::string session;
    // Called only by the command reader. No raw audio or clipboard operations.
    void command(std::string_view input) {
        const auto first = input.find(' ');
        if (first == std::string_view::npos) return;
        const auto kind = input.substr(0, first);
        input.remove_prefix(first + 1);
        const auto second = input.find(' ');
        if (second == std::string_view::npos || input.substr(0, second) != session) return;
        input.remove_prefix(second + 1);
        const auto third = input.find(' ');
        std::uint64_t id = 0;
        if (!number(input.substr(0, third), id)) return;
        if (kind == "SNAPSHOT" && third == std::string_view::npos) {
            if (id > lastRequest_) { lastRequest_ = id; requested_.store(id, std::memory_order_release); }
        } else if (kind == "TEXT" && third != std::string_view::npos && id > lastText_) {
            const auto hex = input.substr(third + 1);
            if (hex.empty() || hex.size() > 8192 || hex.size() % 2) return;
            std::string text(hex.size() / 2, '\0');
            for (std::size_t i = 0; i < text.size(); ++i) {
                const auto hi = nibble(hex[i * 2]), lo = nibble(hex[i * 2 + 1]);
                if (hi < 0 || lo < 0) return;
                text[i] = static_cast<char>(hi * 16 + lo);
            }
            std::lock_guard<std::mutex> guard(textMutex_);
            text_ = std::move(text); dirty_ = true; lastText_ = id;
        }
    }
    // Only the recorder main/UI thread writes stdout, including these messages.
    std::string snapshot(bool available = true, bool paused = false) {
        const auto id = requested_.exchange(0, std::memory_order_acq_rel);
        if (!id) return {};
        if (!available) return "PREVIEW_ERROR " + session + " " + std::to_string(id) + "\n";
        if (paused) return "PREVIEW_EMPTY " + session + " " + std::to_string(id) + "\n";
        try {
            Snapshot copy;
            if (!audio.copy(copy) || copy.pcm.empty())
                return "PREVIEW_EMPTY " + session + " " + std::to_string(id) + "\n";
            constexpr char hex[] = "0123456789abcdef";
            std::string encoded(copy.pcm.size() * 4, '0');
            for (std::size_t i = 0; i < copy.pcm.size(); ++i) {
                const auto value = static_cast<std::uint16_t>(copy.pcm[i]);
                encoded[4*i] = hex[(value >> 4) & 15]; encoded[4*i+1] = hex[value & 15];
                encoded[4*i+2] = hex[(value >> 12) & 15]; encoded[4*i+3] = hex[(value >> 8) & 15];
            }
            return "PREVIEW " + session + " " + std::to_string(id) + " " +
                std::to_string(copy.end - copy.pcm.size()) + " " + std::to_string(copy.end) + " " + encoded + "\n";
        } catch (...) { return "PREVIEW_ERROR " + session + " " + std::to_string(id) + "\n"; }
    }
    bool takeText(std::string& target) {
        std::lock_guard<std::mutex> guard(textMutex_);
        if (!dirty_) return false;
        target = std::move(text_); dirty_ = false; return true;
    }
private:
    std::atomic<std::uint64_t> requested_{0};
    std::uint64_t lastRequest_ = 0, lastText_ = 0; // Command-reader owned.
    std::mutex textMutex_;
    std::string text_;
    bool dirty_ = false;
};
} // namespace universal_dictate::preview

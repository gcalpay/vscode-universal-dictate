#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <string_view>

namespace universal_dictate::text_input {
constexpr std::size_t kBatchUnits = 128;
struct UnicodeEvent { char16_t unit = 0; bool up = false; };
struct Batch {
    std::array<UnicodeEvent, kBatchUnits * 2> events{};
    std::size_t count = 0;
    std::size_t next = 0;
};
constexpr bool highSurrogate(char16_t c) noexcept { return c >= 0xd800 && c <= 0xdbff; }
constexpr bool lowSurrogate(char16_t c) noexcept { return c >= 0xdc00 && c <= 0xdfff; }

// Whisper already normalizes whitespace. Defensive normalization also prevents
// recovered/external text from generating Enter, Tab, Backspace or other C0/C1
// control characters via WM_CHAR. Clipboard backup keeps the exact original.
inline std::u16string prepareText(std::u16string_view text) {
    std::u16string result;
    result.reserve(text.size());
    for (std::size_t i = 0; i < text.size(); ++i) {
        char16_t c = text[i];
        if (!c) throw std::invalid_argument("null text");
        if (highSurrogate(c)) {
            if (i + 1 == text.size() || !lowSurrogate(text[i + 1]))
                throw std::invalid_argument("invalid surrogate");
            result.push_back(c); result.push_back(text[++i]); continue;
        }
        if (lowSurrogate(c)) throw std::invalid_argument("invalid surrogate");
        if (c == u'\r' && i + 1 < text.size() && text[i + 1] == u'\n') ++i;
        if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) c = u' ';
        result.push_back(c);
    }
    return result;
}

// A batch always contains matching key-down/up pairs and whole Unicode scalars.
inline Batch nextBatch(std::u16string_view text, std::size_t offset) noexcept {
    Batch batch;
    batch.next = offset;
    while (batch.next < text.size()) {
        const auto units = highSurrogate(text[batch.next]) ? 2u : 1u;
        if (batch.next + units > text.size() || batch.count + 2 * units > batch.events.size()) break;
        for (unsigned i = 0; i < units; ++i) {
            const auto c = text[batch.next++];
            batch.events[batch.count++] = {c, false};
            batch.events[batch.count++] = {c, true};
        }
    }
    return batch;
}
} // namespace universal_dictate::text_input

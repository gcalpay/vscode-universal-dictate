#include "../../native/unicode-input.h"
#include <iostream>
#include <stdexcept>
#include <vector>
using namespace universal_dictate::text_input;
namespace {
int passed = 0;
void require(bool condition) { if (!condition) throw std::runtime_error("Unicode input assertion failed"); ++passed; }
std::u16string emitted(std::u16string_view value) {
    const auto text = prepareText(value); std::u16string result; std::size_t offset = 0;
    while (offset < text.size()) {
        const auto b = nextBatch(text, offset);
        if (!b.count || b.count % 2 || b.count > kBatchUnits * 2) throw std::runtime_error("invalid batch");
        for (std::size_t i = 0; i < b.count; i += 2) {
            if (b.events[i].up || !b.events[i + 1].up || b.events[i].unit != b.events[i + 1].unit)
                throw std::runtime_error("unpaired input events");
            if (b.events[i].unit < 0x20 || (b.events[i].unit >= 0x7f && b.events[i].unit <= 0x9f))
                throw std::runtime_error("control event could cause a command");
            result.push_back(b.events[i].unit);
        }
        if (highSurrogate(b.events[b.count - 1].unit)) throw std::runtime_error("surrogate split");
        offset = b.next;
    }
    return result;
}
}
int main() {
    try {
        require(emitted(u"normal speech") == u"normal speech");
        require(emitted(u"Grüße — 150 °C 水 🧪") == u"Grüße — 150 °C 水 🧪");
        require(emitted(u"e\u0301") == u"e\u0301");
        require(emitted(u"\r\nA\tB\nC\rD") == u" A B C D");
        require(emitted(u"   spaced   ") == u"   spaced   ");
        for (char16_t c = 1; c < 0x20; ++c) require(emitted(std::u16string(1, c)) == u" ");
        for (char16_t c = 0x7f; c <= 0x9f; ++c) require(emitted(std::u16string(1, c)) == u" ");
        for (const auto& bad : {std::u16string(1, 0), std::u16string(1, 0xd800), std::u16string(1, 0xdc00), std::u16string{0xd800, u'x'}}) {
            bool rejected = false; try { prepareText(bad); } catch (const std::invalid_argument&) { rejected = true; } require(rejected);
        }
        for (std::size_t n : {0u, 1u, 127u, 128u, 129u, 255u, 256u, 4000u}) {
            const auto text = std::u16string(n, u'x') + u"🧪水"; require(emitted(text) == text);
        }
        const auto edge = std::u16string(kBatchUnits - 1, u'x') + u"🧪end";
        const auto first = nextBatch(edge, 0);
        require(first.next == kBatchUnits - 1);
        require(emitted(edge) == edge);
        require(nextBatch(u"", 0).count == 0);
        std::cout << passed << " Unicode input policy assertions passed\n";
        return 0;
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}

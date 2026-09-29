/* Fixed-size preview geometry. SPDX-License-Identifier: MIT */
#pragma once
#include "overlay-layout.h"

namespace universal_dictate::preview {
struct TextLayout {
    OverlayRect title;
    OverlayRect label;
    OverlayRect waveform;
    OverlayRect text;
    int fontHeight;
    unsigned int maxLines;
};

// Preview borrows the title/subtitle and waveform column, never button space.
// All values are logical pixels; scale once, just like the existing overlay.
inline TextLayout calculateTextLayout(OverlaySize size, std::uint32_t dpi) {
    TextLayout result{};
    switch (size) {
        case OverlaySize::Small:
            result = {{34, 6, 108, 23}, {112, 6, 264, 23},
                      {34, 26, 264, 32}, {34, 35, 264, 59}, 14, 1};
            break;
        case OverlaySize::Medium:
            result = {{40, 8, 122, 27}, {128, 8, 392, 27},
                      {40, 30, 392, 40}, {40, 43, 392, 81}, 14, 2};
            break;
        case OverlaySize::Large:
        default:
            result = {{50, 10, 150, 32}, {158, 10, 596, 32},
                      {50, 37, 596, 49}, {50, 55, 596, 120}, 16, 3};
            break;
    }
    result.title = scaleRect(result.title, dpi);
    result.label = scaleRect(result.label, dpi);
    result.waveform = scaleRect(result.waveform, dpi);
    result.text = scaleRect(result.text, dpi);
    result.fontHeight = scaleLogical(result.fontHeight, dpi);
    return result;
}
} // namespace universal_dictate::preview

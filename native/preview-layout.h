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
// Give the waveform priority and keep text close beneath it (one/two/two lines).
// All values are logical pixels; scale once, just like the existing overlay.
inline TextLayout calculateTextLayout(OverlaySize size, std::uint32_t dpi) {
    TextLayout result{};
    switch (size) {
        case OverlaySize::Small:
            result = {{34, 3, 108, 20}, {112, 3, 186, 20},
                      {34, 23, 186, 36}, {34, 38, 186, 62}, 14, 1};
            break;
        case OverlaySize::Medium:
            result = {{40, 3, 122, 22}, {128, 3, 320, 22},
                      {40, 24, 320, 43}, {40, 45, 320, 85}, 14, 2};
            break;
        case OverlaySize::Large:
        default:
            result = {{50, 10, 150, 32}, {158, 10, 518, 32},
                      {50, 35, 518, 71}, {50, 74, 518, 120}, 16, 2};
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

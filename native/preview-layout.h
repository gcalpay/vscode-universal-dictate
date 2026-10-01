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
    const auto spec = enhancedOverlaySpec(size);
    const int right = spec.width - spec.waveformRightInset;
    switch (size) {
        case OverlaySize::Small:
            result = {{34, 2, 108, 19}, {112, 2, right, 19},
                      {34, 20, right, 36}, {34, 38, right, 62}, 14, 1};
            break;
        case OverlaySize::Medium:
            result = {{40, 2, 122, 21}, {128, 2, right, 21},
                      {40, 22, right, 44}, {40, 46, right, 86}, 14, 2};
            break;
        case OverlaySize::Large:
        default:
            result = {{50, 4, 150, 26}, {158, 4, right, 26},
                      {50, 28, right, 70}, {50, 72, right, 118}, 16, 2};
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

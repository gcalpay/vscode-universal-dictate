/* Compact square recording panel for Circular Spectrum. SPDX-License-Identifier: MIT */
#pragma once
#include "preview-layout.h"

namespace universal_dictate {
inline EnhancedOverlayLayout calculateCircularOverlayLayout(OverlaySize size, unsigned dpi, bool previewEnabled = false) {
    const int side = size == OverlaySize::Small ? (previewEnabled ? 224 : 184)
        : size == OverlaySize::Medium ? (previewEnabled ? 264 : 224) : (previewEnabled ? 328 : 280);
    const int buttonHeight = size == OverlaySize::Small ? 26 : size == OverlaySize::Medium ? 30 : 34;
    const int buttonWidth = size == OverlaySize::Small ? 40 : size == OverlaySize::Medium ? 48 : 56;
    const int controlsTop = side - 12 - buttonHeight;
    const int textHeight = size == OverlaySize::Small ? 24 : size == OverlaySize::Medium ? 40 : 46;
    const int bottom = controlsTop - 8 - (previewEnabled ? textHeight + 8 : 0);
    const int diameter = bottom - 32;
    const int left = (side - diameter) / 2;
    auto result = calculateEnhancedOverlayLayout(size, dpi, previewEnabled);
    result.width = result.height = scaleLogical(side, dpi);
    result.indicatorCenterX = scaleLogical(22, dpi);
    result.indicatorCenterY = scaleLogical(16, dpi);
    result.indicatorOuterRadius = scaleLogical(7, dpi);
    result.indicatorInnerRadius = scaleLogical(5, dpi);
    result.indicatorDotRadius = scaleLogical(2, dpi);
    result.title = scaleRect({36, 4, 116, 28}, dpi);
    result.showSubtitle = false;
    result.waveform = scaleRect({left, 32, left + diameter, bottom}, dpi);
    result.confirmButton = scaleRect({side/2 - 6 - buttonWidth, controlsTop, side/2 - 6, controlsTop + buttonHeight}, dpi);
    result.cancelButton = scaleRect({side/2 + 6, controlsTop, side/2 + 6 + buttonWidth, controlsTop + buttonHeight}, dpi);
    return result;
}
inline preview::TextLayout calculateCircularPreviewLayout(OverlaySize size, unsigned dpi) {
    const auto layout = calculateCircularOverlayLayout(size, dpi, true);
    const int side = size == OverlaySize::Small ? 224 : size == OverlaySize::Medium ? 264 : 328;
    const int buttonHeight = size == OverlaySize::Small ? 26 : size == OverlaySize::Medium ? 30 : 34;
    const int textHeight = size == OverlaySize::Small ? 24 : size == OverlaySize::Medium ? 40 : 46;
    const int textBottom = side - 12 - buttonHeight - 8;
    return {layout.title, scaleRect({122, 4, side - 12, 28}, dpi), layout.waveform,
        scaleRect({12, textBottom - textHeight, side - 12, textBottom}, dpi),
        scaleLogical(size == OverlaySize::Large ? 16 : 14, dpi), size == OverlaySize::Small ? 1U : 2U};
}
} // namespace universal_dictate

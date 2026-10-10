/* Circular-only card geometry; waveform/log layouts stay unchanged. SPDX-License-Identifier: MIT */
#pragma once
#include "preview-layout.h"
#include <algorithm>

namespace universal_dictate {
inline EnhancedOverlayLayout calculateCircularOverlayLayout(OverlaySize size, std::uint32_t dpi,
                                                             bool previewEnabled = false) {
    auto layout = calculateEnhancedOverlayLayout(size, kLogicalDpi, false);
    const int base = size == OverlaySize::Small ? 192 : size == OverlaySize::Medium ? 240 : 296;
    const int previewHeight = size == OverlaySize::Small ? 26 : size == OverlaySize::Medium ? 40 : 46;
    const int side = base + (previewEnabled ? previewHeight + 8 : 0);
    const int top = size == OverlaySize::Small ? 32 : 36;
    const int buttonHeight = size == OverlaySize::Small ? 26 : size == OverlaySize::Medium ? 30 : 34;
    const int buttonWidth = size == OverlaySize::Small ? 40 : size == OverlaySize::Medium ? 48 : 56;
    const int gap = 10, buttonTop = side - 12 - buttonHeight;
    const int contentBottom = buttonTop - 14 - (previewEnabled ? previewHeight + 8 : 0);
    const int diameter = std::min(side - 24, contentBottom - top);
    layout.width = layout.height = side;
    layout.panelRadius = 18; layout.regionRadius = 20;
    layout.indicatorCenterX = 20;
    layout.indicatorOuterRadius = 5; layout.indicatorInnerRadius = 0; layout.indicatorDotRadius = 2;
    layout.title = {32,8,side-12,28}; layout.showSubtitle = false;
    layout.waveform = {(side-diameter)/2,top,(side+diameter)/2,top+diameter};
    layout.dividerX = 0; layout.dividerTop = buttonTop - 7; layout.dividerBottom = buttonTop - 7;
    const int left = (side - 3*buttonWidth - 2*gap)/2;
    layout.confirmButton = {left,buttonTop,left+buttonWidth,buttonTop+buttonHeight};
    layout.pauseButton = {left+buttonWidth+gap,buttonTop,left+2*buttonWidth+gap,buttonTop+buttonHeight};
    layout.cancelButton = {left+2*(buttonWidth+gap),buttonTop,left+3*buttonWidth+2*gap,buttonTop+buttonHeight};
    layout.width = scaleLogical(layout.width,dpi); layout.height = scaleLogical(layout.height,dpi);
    layout.panelRadius = scaleLogical(layout.panelRadius,dpi); layout.regionRadius = scaleLogical(layout.regionRadius,dpi);
    layout.indicatorCenterX = scaleLogical(layout.indicatorCenterX,dpi);
    layout.indicatorOuterRadius = scaleLogical(layout.indicatorOuterRadius,dpi);
    layout.indicatorInnerRadius = scaleLogical(layout.indicatorInnerRadius,dpi);
    layout.indicatorDotRadius = scaleLogical(layout.indicatorDotRadius,dpi);
    layout.title = scaleRect(layout.title,dpi); layout.waveform = scaleRect(layout.waveform,dpi);
    layout.dividerTop = scaleLogical(layout.dividerTop,dpi); layout.dividerBottom = layout.dividerTop;
    layout.confirmButton = scaleRect(layout.confirmButton,dpi); layout.pauseButton = scaleRect(layout.pauseButton,dpi);
    layout.cancelButton = scaleRect(layout.cancelButton,dpi);
    layout.titleFontHeight = scaleLogical(layout.titleFontHeight,dpi);
    layout.subtitleFontHeight = scaleLogical(layout.subtitleFontHeight,dpi); layout.buttonRadius = scaleLogical(layout.buttonRadius,dpi);
    return layout;
}
inline preview::TextLayout circularPreviewLayout(OverlaySize size, std::uint32_t dpi) {
    const auto layout = calculateCircularOverlayLayout(size,kLogicalDpi,true);
    const int height = size == OverlaySize::Small ? 26 : size == OverlaySize::Medium ? 40 : 46;
    const int bottom = layout.confirmButton.top - 14;
    preview::TextLayout result{layout.title,{0,0,0,0},layout.waveform,
        {12,bottom-height,layout.width-12,bottom},size == OverlaySize::Large ? 16 : 14,
        size == OverlaySize::Small ? 1U : 2U};
    result.title = scaleRect(result.title,dpi); result.waveform = scaleRect(result.waveform,dpi);
    result.text = scaleRect(result.text,dpi); result.fontHeight = scaleLogical(result.fontHeight,dpi);
    return result;
}
} // namespace universal_dictate

#pragma once

#include <cstdint>

namespace universal_dictate {

constexpr std::uint32_t kLogicalDpi = 96;

enum class OverlaySize : int {
    Small = 0,
    Medium = 1,
    Large = 2,
};

struct OverlayRect {
    int left = 0;
    int top = 0;
    int right = 0;
    int bottom = 0;
};

struct EnhancedOverlaySpec {
    int width;
    int height;
    int panelRadius;
    int regionRadius;
    int indicatorCenterX;
    int indicatorOuterRadius;
    int indicatorInnerRadius;
    int indicatorDotRadius;
    OverlayRect title;
    OverlayRect subtitle;
    bool showSubtitle;
    int waveformLeft;
    int waveformRightInset;
    int waveformTop;
    int waveformBottomInset;
    int dividerRightInset;
    int dividerTop;
    int dividerBottomInset;
    int buttonWidth;
    int buttonHeight;
    int buttonGap;
    int buttonRightInset;
    int titleFontHeight;
    int subtitleFontHeight;
    int buttonRadius;
};

struct EnhancedOverlayLayout {
    int width = 0;
    int height = 0;
    int panelRadius = 0;
    int regionRadius = 0;
    int indicatorCenterX = 0;
    int indicatorOuterRadius = 0;
    int indicatorInnerRadius = 0;
    int indicatorDotRadius = 0;
    OverlayRect title;
    OverlayRect subtitle;
    bool showSubtitle = false;
    OverlayRect waveform;
    int dividerX = 0;
    int dividerTop = 0;
    int dividerBottom = 0;
    OverlayRect confirmButton;
    OverlayRect pauseButton;
    OverlayRect cancelButton;
    int titleFontHeight = 0;
    int subtitleFontHeight = 0;
    int buttonRadius = 0;
};

constexpr EnhancedOverlaySpec enhancedOverlaySpec(OverlaySize size) {
    switch (size) {
        case OverlaySize::Small:
            return EnhancedOverlaySpec{
                380, 48, 12, 14,
                18, 10, 8, 3,
                {34, 14, 96, 34},
                {0, 0, 0, 0},
                false,
                98, 112, 3, 3,
                108, 6, 6,
                28, 24, 6, 6,
                14, 9, 7};
        case OverlaySize::Medium:
            return EnhancedOverlaySpec{
                520, 72, 14, 16,
                22, 12, 10, 3,
                {40, 16, 112, 36},
                {40, 36, 112, 52},
                true,
                116, 124, 3, 3,
                120, 6, 6,
                32, 28, 6, 6,
                15, 10, 8};
        case OverlaySize::Large:
        default:
            return EnhancedOverlaySpec{
                740, 112, 18, 20,
                28, 16, 13, 4,
                {50, 34, 143, 58},
                {50, 59, 143, 79},
                true,
                148, 136, 3, 3,
                132, 6, 6,
                36, 30, 6, 6,
                17, 11, 9};
    }
}

// Select the height once per recording. Preview Off needs no empty text region;
// Preview On reserves complete shaped lines and its own waveform region.
constexpr int enhancedOverlayHeight(OverlaySize size, bool previewEnabled) {
    if (!previewEnabled) return enhancedOverlaySpec(size).height;
    switch (size) {
        case OverlaySize::Small: return 64;
        case OverlaySize::Medium: return 88;
        case OverlaySize::Large:
        default: return 120;
    }
}

inline int scaleLogical(int value, std::uint32_t dpi) {
    const std::uint32_t effectiveDpi = dpi == 0 ? kLogicalDpi : dpi;
    return static_cast<int>(
        (static_cast<std::int64_t>(value) * effectiveDpi + kLogicalDpi / 2) /
        kLogicalDpi);
}

inline OverlayRect scaleRect(OverlayRect value, std::uint32_t dpi) {
    return OverlayRect{
        scaleLogical(value.left, dpi),
        scaleLogical(value.top, dpi),
        scaleLogical(value.right, dpi),
        scaleLogical(value.bottom, dpi)};
}

inline EnhancedOverlayLayout calculateEnhancedOverlayLayout(
    OverlaySize size,
    std::uint32_t dpi,
    bool previewEnabled = false) {
    const EnhancedOverlaySpec spec = enhancedOverlaySpec(size);
    EnhancedOverlayLayout layout{};

    layout.width = scaleLogical(spec.width, dpi);
    layout.height = scaleLogical(enhancedOverlayHeight(size, previewEnabled), dpi);
    layout.panelRadius = scaleLogical(spec.panelRadius, dpi);
    layout.regionRadius = scaleLogical(spec.regionRadius, dpi);
    layout.indicatorCenterX = scaleLogical(spec.indicatorCenterX, dpi);
    layout.indicatorOuterRadius = scaleLogical(spec.indicatorOuterRadius, dpi);
    layout.indicatorInnerRadius = scaleLogical(spec.indicatorInnerRadius, dpi);
    layout.indicatorDotRadius = scaleLogical(spec.indicatorDotRadius, dpi);
    layout.title = scaleRect(spec.title, dpi);
    layout.subtitle = scaleRect(spec.subtitle, dpi);
    layout.showSubtitle = spec.showSubtitle;
    layout.waveform = OverlayRect{
        scaleLogical(spec.waveformLeft, dpi),
        scaleLogical(spec.waveformTop, dpi),
        layout.width - scaleLogical(spec.waveformRightInset, dpi),
        layout.height - scaleLogical(spec.waveformBottomInset, dpi)};
    layout.dividerX = layout.width - scaleLogical(spec.dividerRightInset, dpi);
    layout.dividerTop = scaleLogical(spec.dividerTop, dpi);
    layout.dividerBottom = layout.height - scaleLogical(spec.dividerBottomInset, dpi);

    const int buttonWidth = scaleLogical(spec.buttonWidth, dpi);
    const int buttonHeight = scaleLogical(spec.buttonHeight, dpi);
    const int buttonGap = scaleLogical(spec.buttonGap, dpi);
    const int buttonRightInset = scaleLogical(spec.buttonRightInset, dpi);
    const int buttonTop = (layout.height - buttonHeight) / 2;

    layout.cancelButton = OverlayRect{
        layout.width - buttonRightInset - buttonWidth,
        buttonTop,
        layout.width - buttonRightInset,
        buttonTop + buttonHeight};
    layout.pauseButton = OverlayRect{
        layout.cancelButton.left - buttonGap - buttonWidth,
        buttonTop,
        layout.cancelButton.left - buttonGap,
        buttonTop + buttonHeight};

    layout.confirmButton = OverlayRect{
        layout.pauseButton.left - buttonGap - buttonWidth,
        buttonTop,
        layout.pauseButton.left - buttonGap,
        buttonTop + buttonHeight};

    layout.titleFontHeight = scaleLogical(spec.titleFontHeight, dpi);
    layout.subtitleFontHeight = scaleLogical(spec.subtitleFontHeight, dpi);
    layout.buttonRadius = scaleLogical(spec.buttonRadius, dpi);
    return layout;
}

}  // namespace universal_dictate

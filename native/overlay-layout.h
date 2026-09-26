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
    int buttonTop;
    int titleFontHeight;
    int subtitleFontHeight;
    int buttonFontHeight;
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
    OverlayRect cancelButton;
    int titleFontHeight = 0;
    int subtitleFontHeight = 0;
    int buttonFontHeight = 0;
    int buttonRadius = 0;
};

constexpr EnhancedOverlaySpec enhancedOverlaySpec(OverlaySize size) {
    switch (size) {
        case OverlaySize::Small:
            return EnhancedOverlaySpec{
                380, 64, 14, 16,
                18, 10, 8, 3,
                {34, 18, 96, 46},
                {0, 0, 0, 0},
                false,
                98, 116, 8, 8,
                112, 14, 14,
                48, 24, 6, 6, 20,
                14, 9, 9, 7};
        case OverlaySize::Medium:
            return EnhancedOverlaySpec{
                520, 88, 18, 20,
                22, 12, 10, 3,
                {40, 17, 112, 39},
                {40, 39, 112, 58},
                true,
                116, 128, 8, 8,
                122, 18, 18,
                54, 28, 6, 6, 30,
                15, 10, 10, 8};
        case OverlaySize::Large:
        default:
            return EnhancedOverlaySpec{
                740, 128, 24, 26,
                28, 16, 13, 4,
                {50, 39, 143, 63},
                {50, 64, 143, 84},
                true,
                148, 144, 8, 8,
                140, 30, 30,
                60, 30, 6, 6, 49,
                17, 11, 11, 9};
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
    std::uint32_t dpi) {
    const EnhancedOverlaySpec spec = enhancedOverlaySpec(size);
    EnhancedOverlayLayout layout{};

    layout.width = scaleLogical(spec.width, dpi);
    layout.height = scaleLogical(spec.height, dpi);
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
    const int buttonTop = scaleLogical(spec.buttonTop, dpi);

    layout.cancelButton = OverlayRect{
        layout.width - buttonRightInset - buttonWidth,
        buttonTop,
        layout.width - buttonRightInset,
        buttonTop + buttonHeight};
    layout.confirmButton = OverlayRect{
        layout.cancelButton.left - buttonGap - buttonWidth,
        buttonTop,
        layout.cancelButton.left - buttonGap,
        buttonTop + buttonHeight};

    layout.titleFontHeight = scaleLogical(spec.titleFontHeight, dpi);
    layout.subtitleFontHeight = scaleLogical(spec.subtitleFontHeight, dpi);
    layout.buttonFontHeight = scaleLogical(spec.buttonFontHeight, dpi);
    layout.buttonRadius = scaleLogical(spec.buttonRadius, dpi);
    return layout;
}

}  // namespace universal_dictate

#include "../../native/overlay-layout.h"

#include <array>
#include <cassert>

using universal_dictate::OverlaySize;
using universal_dictate::calculateEnhancedOverlayLayout;

void assertInside(const universal_dictate::EnhancedOverlayLayout& layout) {
    assert(layout.width > 0);
    assert(layout.height > 0);
    assert(layout.waveform.left >= 0);
    assert(layout.waveform.right <= layout.width);
    assert(layout.waveform.top >= 0);
    assert(layout.waveform.bottom <= layout.height);
    assert(layout.waveform.left < layout.waveform.right);
    assert(layout.waveform.top < layout.waveform.bottom);
    assert(layout.confirmButton.left >= 0);
    assert(layout.confirmButton.right <= layout.width);
    assert(layout.cancelButton.left >= 0);
    assert(layout.cancelButton.right <= layout.width);
    assert(layout.confirmButton.top < layout.confirmButton.bottom);
    assert(layout.cancelButton.top < layout.cancelButton.bottom);
    assert(layout.confirmButton.right < layout.cancelButton.left);
    assert(layout.waveform.right < layout.dividerX);
    assert(layout.dividerX <= layout.confirmButton.left);
    assert(layout.titleFontHeight > 0);
    assert(layout.buttonFontHeight > 0);
}

int main() {
    const auto small = calculateEnhancedOverlayLayout(OverlaySize::Small, 96);
    const auto medium = calculateEnhancedOverlayLayout(OverlaySize::Medium, 96);
    const auto large = calculateEnhancedOverlayLayout(OverlaySize::Large, 96);

    assert(small.width == 380 && small.height == 64);
    assert(medium.width == 520 && medium.height == 88);
    assert(large.width == 740 && large.height == 128);
    assert(!small.showSubtitle);
    assert(medium.showSubtitle);
    assert(large.showSubtitle);

    // Large at 96 DPI preserves the existing enhanced-overlay reference geometry.
    assert(large.waveform.left == 148);
    assert(large.waveform.right == 596);
    assert(large.dividerX == 600);
    assert(large.confirmButton.left == 608);
    assert(large.confirmButton.right == 668);
    assert(large.cancelButton.left == 674);
    assert(large.cancelButton.right == 734);

    const std::array<OverlaySize, 3> sizes{
        OverlaySize::Small,
        OverlaySize::Medium,
        OverlaySize::Large};
    const std::array<unsigned int, 4> dpis{96, 120, 144, 192};

    for (OverlaySize size : sizes) {
        for (unsigned int dpi : dpis) {
            assertInside(calculateEnhancedOverlayLayout(size, dpi));
        }
    }

    const auto small125 = calculateEnhancedOverlayLayout(OverlaySize::Small, 120);
    assert(small125.width == 475 && small125.height == 80);

    const auto medium150 = calculateEnhancedOverlayLayout(OverlaySize::Medium, 144);
    assert(medium150.width == 780 && medium150.height == 132);

    const auto large200 = calculateEnhancedOverlayLayout(OverlaySize::Large, 192);
    assert(large200.width == 1480 && large200.height == 256);
    assert(large200.confirmButton.left == 1216);
    assert(large200.cancelButton.right == 1468);

    return 0;
}

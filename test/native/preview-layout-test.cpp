#include "../../native/preview-layout.h"
#include <array>
#include <cassert>
#include <iostream>
using namespace universal_dictate;
using namespace universal_dictate::preview;
bool overlaps(OverlayRect a, OverlayRect b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
int main() {
    unsigned int cases = 0;
    for (auto size : {OverlaySize::Small, OverlaySize::Medium, OverlaySize::Large}) {
        for (unsigned int dpi : {0U, 96U, 120U, 144U, 168U, 192U, 240U, 288U}) {
            const auto normal = calculateEnhancedOverlayLayout(size, dpi);
            const auto preview = calculateTextLayout(size, dpi);
            const std::array<OverlayRect, 4> boxes{preview.title, preview.label, preview.waveform, preview.text};
            for (auto box : boxes) {
                assert(box.left >= 0 && box.top >= 0 && box.right <= normal.width && box.bottom <= normal.height);
                assert(box.right > box.left && box.bottom > box.top && box.right < normal.dividerX);
                assert(!overlaps(box, normal.confirmButton) && !overlaps(box, normal.cancelButton) && !overlaps(box, normal.pauseButton));
            }
            for (std::size_t i=0; i<boxes.size(); ++i) for (std::size_t j=i+1; j<boxes.size(); ++j) assert(!overlaps(boxes[i], boxes[j]));
            assert(preview.text.left > normal.indicatorCenterX + normal.indicatorOuterRadius);
            assert(preview.fontHeight >= scaleLogical(14, dpi));
            assert(preview.maxLines == static_cast<unsigned int>(size) + 1);
            ++cases;
        }
    }
    std::cout << cases << " preview geometries preserve window/button bounds and nonoverlapping text/waveform regions\n";
}

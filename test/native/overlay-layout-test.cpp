#include "../../native/circular-layout.h"
#include <array>
#include <cassert>
#include <iostream>
using namespace universal_dictate;
bool overlaps(OverlayRect a, OverlayRect b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
void inside(const EnhancedOverlayLayout& layout, OverlayRect r) {
    assert(r.left >= 0 && r.top >= 0 && r.right <= layout.width && r.bottom <= layout.height);
    assert(r.right > r.left && r.bottom > r.top);
}
int main() {
    unsigned cases = 0;
    for (auto size : {OverlaySize::Small, OverlaySize::Medium, OverlaySize::Large})
        for (unsigned dpi : {0U,96U,120U,144U,168U,192U,240U,288U})
            for (bool preview : {false,true}) {
                const auto spec = enhancedOverlaySpec(size);
                const auto rect = calculateEnhancedOverlayLayout(size,dpi,preview);
                // The entire waveform viewport is exactly the pre-RC4 rectangle.
                assert(rect.waveform.left == scaleLogical(spec.waveformLeft,dpi));
                assert(rect.waveform.right == scaleLogical(spec.width,dpi)-scaleLogical(spec.waveformRightInset,dpi));
                assert(rect.waveform.top == scaleLogical(spec.waveformTop,dpi));
                assert(rect.waveform.bottom == scaleLogical(enhancedOverlayHeight(size,preview),dpi)-scaleLogical(spec.waveformBottomInset,dpi));
                inside(rect,rect.waveform); inside(rect,rect.confirmButton); inside(rect,rect.cancelButton);
                assert(rect.confirmButton.right < rect.cancelButton.left);
                assert(rect.dividerX < rect.confirmButton.left);
                const auto circle = calculateCircularOverlayLayout(size,dpi,preview);
                assert(circle.width == circle.height);
                inside(circle,circle.waveform); inside(circle,circle.title);
                inside(circle,circle.confirmButton); inside(circle,circle.cancelButton);
                assert(circle.waveform.bottom <= circle.confirmButton.top-scaleLogical(8,dpi));
                assert(!overlaps(circle.waveform,circle.title));
                assert(!overlaps(circle.confirmButton,circle.cancelButton));
                assert(circle.waveform.bottom-circle.waveform.top >= scaleLogical(88,dpi)-1);
                if (preview) {
                    const auto text = calculateCircularPreviewLayout(size,dpi);
                    inside(circle,text.text); inside(circle,text.label);
                    assert(!overlaps(text.text,circle.waveform));
                    assert(!overlaps(text.text,circle.confirmButton));
                    assert(!overlaps(text.text,circle.cancelButton));
                    assert(!overlaps(text.title,text.label));
                    assert(text.maxLines == (size == OverlaySize::Small ? 1U : 2U));
                }
                ++cases;
            }
    std::cout << cases << " two-control rectangular/square size/DPI/preview layouts passed\n";
}

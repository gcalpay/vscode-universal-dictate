/* Circular geometry and fixed-response regression. SPDX-License-Identifier: MIT */
#pragma once
#include "../../native/circular-layout.h"
#include "../../native/spectral-render.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <iostream>
#include <stdexcept>

namespace circular_checks {
inline void require(bool ok, const char* message) {
    if (!ok) throw std::runtime_error(message);
}
inline void near(float actual, float expected, float tolerance, const char* message) {
    require(std::abs(actual - expected) <= tolerance, message);
}
inline void run() {
    using namespace universal_dictate;
    namespace vis = universal_dictate::visualization;
    float previous = -1.0f;
    for (unsigned value = 0; value < 256; ++value) {
        const float fraction = vis::circularRayFraction(static_cast<std::uint8_t>(value));
        require(std::isfinite(fraction) && fraction >= previous && fraction <= 1.0f,
                "circular response must be finite, monotonic and bounded");
        if (value <= vis::kCircularRayFloor) require(fraction == 0.0f, "idle ray floor");
        if (value > vis::kCircularRayFloor) require(fraction > previous, "active response ordering");
        previous = fraction;
    }
    near(vis::circularRayFraction(255), 1.0f, 1e-6f, "full-scale ray extent");
    near(0.42f + 0.58f * vis::circularRayFraction(128), 0.802, 0.003f,
         "moderate signal should reach about 80 percent of radius");

    constexpr int expectedDiameters[3][2]{{118,128},{154,148},{206,202}};
    std::size_t layouts = 0;
    for (auto size : {OverlaySize::Small,OverlaySize::Medium,OverlaySize::Large}) {
        for (unsigned dpi : {96U,120U,144U,192U}) for (bool preview : {false,true}) {
            const auto layout = calculateCircularOverlayLayout(size,dpi,preview);
            const auto rect = layout.waveform;
            const float scale = static_cast<float>(dpi) / 96.0f;
            const int expected = scaleLogical(expectedDiameters[static_cast<int>(size)][preview],dpi);
            require(layout.width == layout.height, "circular panel must remain square");
            require(std::abs(rect.right-rect.left-expected) <= 1 &&
                    std::abs(rect.bottom-rect.top-expected) <= 1, "approved spectrum diameter");
            require(rect.top - layout.title.bottom >= scaleLogical(4,dpi), "title separation");
            require(layout.height - layout.confirmButton.bottom == scaleLogical(8,dpi), "footer padding");
            require(layout.confirmButton.right + scaleLogical(12,dpi) == layout.cancelButton.left,
                    "two-control hit target separation");
            if (preview) {
                const auto text = calculateCircularPreviewLayout(size,dpi);
                require(text.text.top - rect.bottom >= scaleLogical(6,dpi)-1, "preview separation");
                require(layout.confirmButton.top-text.text.bottom >= scaleLogical(8,dpi), "preview/footer separation");
                require(text.maxLines == (size == OverlaySize::Small ? 1U : 2U), "preview line capacity");
            } else {
                require(layout.confirmButton.top-rect.bottom >= scaleLogical(8,dpi), "display/footer separation");
            }
            vis::Levels levels{};
            for (unsigned value : {0U,16U,17U,64U,128U,192U,255U}) {
                levels.fill(static_cast<std::uint8_t>(value));
                const auto original = levels;
                const auto geometry = vis::circularGeometry(rect,dpi,levels);
                const auto again = vis::circularGeometry(rect,dpi,levels);
                require(levels == original, "radial mapping changed stored FFT levels");
                require(geometry.count == vis::kCircularBands, "48 source bands must remain readable");
                const float radius = std::min(rect.right-rect.left,rect.bottom-rect.top)*0.5f - geometry.stroke-scale;
                near(geometry.innerRadius, radius*0.42f, 1e-5f, "central ring proportion");
                for (std::size_t i=0; i<geometry.count; ++i) {
                    const auto& bar=geometry.bars[i];
                    const auto& same=again.bars[i];
                    require(bar.level == value && bar.x1==same.x1 && bar.y1==same.y1 &&
                            bar.x2==same.x2 && bar.y2==same.y2, "stable geometry and unmodified color level");
                    const float reach=std::hypot(bar.x2-geometry.centerX,bar.y2-geometry.centerY);
                    near(reach,radius*(0.42f+0.58f*vis::circularRayFraction(bar.level)),1e-4f,"fixed radial length");
                    if (value<=vis::kCircularRayFloor) require(bar.x1==bar.x2 && bar.y1==bar.y2,"no invented idle rays");
                    for (const auto& point : {std::pair{bar.x1,bar.y1},std::pair{bar.x2,bar.y2}}) {
                        const auto [x,y]=point;
                        require(x-geometry.stroke*0.5f>=rect.left && x+geometry.stroke*0.5f<rect.right &&
                                y-geometry.stroke*0.5f>=rect.top && y+geometry.stroke*0.5f<rect.bottom,"ray cap clipping");
                    }
                }
            }
            // One energized frequency must not fabricate energy in other angles.
            levels.fill(0); levels[7]=128;
            const auto sparse=vis::circularGeometry(rect,dpi,levels);
            const auto active=std::count_if(sparse.bars.begin(),sparse.bars.begin()+sparse.count,
                [](const auto& b){return b.level>vis::kCircularRayFloor;});
            require(active==1,"neighboring frequency activity was fabricated");
            ++layouts;
        }
    }
    std::cout << "Circular presentation: " << layouts << " layouts, 256 response levels, stable PCM-independent geometry passed\n";
}
} // namespace circular_checks

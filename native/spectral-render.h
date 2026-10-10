/* Shared, testable spectral presentation geometry. SPDX-License-Identifier: MIT */
#pragma once
#include "overlay-layout.h"
#include "spectral-visualizer.h"
#include <array>
#include <cmath>
#include <cstdint>

namespace universal_dictate::visualization {
// Opaque ARGB. Zero matches the existing panel, not an animated noise texture.
inline std::uint32_t spectralColor(std::uint8_t level, colors::Theme theme = colors::Theme::Blue) noexcept {
    return colors::powerColor(level, theme);
}

inline void prepareSpectrogramPixels(SpectralVisualizer& visualizer,
                                      std::size_t width = 0, std::size_t height = 0) noexcept {
    auto pixels = visualizer.pixels();
    if (pixels.empty()) return;
    visualizer.setPixelExtent(width, height);
    if (visualizer.pixelsCurrent()) return;
    const auto columns = visualizer.pixelColumns(), rows = visualizer.pixelRows();
    std::array<std::uint32_t, 256> palette{};
    for (std::size_t i = 0; i < palette.size(); ++i)
        palette[i] = spectralColor(static_cast<std::uint8_t>(i), visualizer.colorTheme());
    if (columns == visualizer.columns() && rows == visualizer.bands()) {
        for (std::size_t y = 0; y < rows; ++y)
            for (std::size_t x = 0; x < columns; ++x)
                pixels[y * columns + x] = palette[visualizer.level(x, rows - 1 - y)];
        visualizer.pixelsPrepared();
        return;
    }
    // Partition the original cells into disjoint display bins. Max pooling keeps
    // narrow tones/transients visible when the viewport has fewer pixels than
    // bands/columns. It changes neither history nor the fixed power/color scale.
    // Newest audio stays at the right and low frequencies at the bottom.
    for (std::size_t y = 0; y < rows; ++y) {
        const auto firstBand = y * visualizer.bands() / rows;
        const auto endBand = (y + 1) * visualizer.bands() / rows;
        for (std::size_t x = 0; x < columns; ++x) {
            const auto firstTime = x * visualizer.columns() / columns;
            const auto endTime = (x + 1) * visualizer.columns() / columns;
            std::uint8_t level = 0;
            for (auto band = firstBand; band < endBand; ++band)
                for (auto time = firstTime; time < endTime; ++time)
                    level = std::max(level, visualizer.level(time, visualizer.bands() - 1 - band));
            pixels[y * columns + x] = palette[level];
        }
    }
    visualizer.pixelsPrepared();
}

struct RadialBar { float x1 = 0, y1 = 0, x2 = 0, y2 = 0; std::uint8_t level = 0; };
struct RadialGeometry {
    float centerX = 0, centerY = 0, innerRadius = 0, stroke = 1;
    std::size_t count = 0;
    std::array<RadialBar, kCircularBands> bars{};
};

inline RadialGeometry circularGeometry(const OverlayRect& rect, unsigned dpi,
                                       const Levels& spectrum) noexcept {
    RadialGeometry result;
    const float scale = static_cast<float>(std::max(1U, dpi)) / 96.0f;
    const float width = static_cast<float>(rect.right - rect.left);
    const float height = static_cast<float>(rect.bottom - rect.top);
    if (width <= 0 || height <= 0) return result;
    result.centerX = static_cast<float>(rect.left) + width * 0.5f;
    result.centerY = static_cast<float>(rect.top) + height * 0.5f;
    result.stroke = std::max(0.8f * scale, std::min(2.8f * scale, std::min(width, height) * 0.014f));
    const float radius = std::max(0.0f, std::min(width, height) * 0.5f - result.stroke - scale);
    result.innerRadius = radius * 0.43f;
    if (radius < scale) return result;
    // At small/preview sizes fewer wider angular groups remain distinguishable.
    // Max-pooling merges only neighboring frequency bands, never history samples.
    const auto count = static_cast<std::size_t>(2 * kPi * result.innerRadius / (2.0f * scale));
    result.count = std::clamp<std::size_t>(count, 12, kCircularBands);
    for (std::size_t i = 0; i < result.count; ++i) {
        const auto first = i * kCircularBands / result.count;
        const auto end = (i + 1) * kCircularBands / result.count;
        const auto level = *std::max_element(spectrum.begin() + first, spectrum.begin() + end);
        const double angle = -kPi * 0.5 + 2 * kPi * i / result.count;
        const float x = static_cast<float>(std::cos(angle)), y = static_cast<float>(std::sin(angle));
        const float outer = result.innerRadius + (radius - result.innerRadius) * level / 255.0f;
        result.bars[i] = {result.centerX + result.innerRadius * x, result.centerY + result.innerRadius * y,
                         result.centerX + outer * x, result.centerY + outer * y, level};
    }
    return result;
}
} // namespace universal_dictate::visualization

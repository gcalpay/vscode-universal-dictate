/* Native GDI+ spectral renderers. SPDX-License-Identifier: MIT */
#pragma once
#include "spectral-render.h"
#include <windows.h>
#include <gdiplus.h>

namespace universal_dictate::visualization {
inline void drawSpectralVisualization(HDC dc, const OverlayRect& rect, unsigned dpi,
                                      SpectralVisualizer& visualizer) {
    const int width = rect.right - rect.left, height = rect.bottom - rect.top;
    if (width <= 0 || height <= 0) return;
    Gdiplus::Graphics graphics(dc);
    graphics.SetClip(Gdiplus::Rect(rect.left, rect.top, width, height));
    if (visualizer.mode() == Mode::CircularSpectrum) {
        graphics.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
        graphics.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHighQuality);
        const auto geometry = circularGeometry(rect, dpi, visualizer.latest());
        Gdiplus::Pen ring(Gdiplus::Color(255, 44, 69, 92), geometry.stroke);
        const auto radius = geometry.innerRadius;
        if (radius > 0) graphics.DrawEllipse(&ring, geometry.centerX - radius,
            geometry.centerY - radius, 2 * radius, 2 * radius);
        Gdiplus::Pen bar(Gdiplus::Color(0xffffffffU), geometry.stroke);
        bar.SetStartCap(Gdiplus::LineCapRound);
        bar.SetEndCap(Gdiplus::LineCapRound);
        for (std::size_t i = 0; i < geometry.count; ++i) {
            const auto& segment = geometry.bars[i];
            if (segment.level == 0) continue;
            bar.SetColor(Gdiplus::Color(spectralColor(segment.level)));
            graphics.DrawLine(&bar, segment.x1, segment.y1, segment.x2, segment.y2);
        }
        return;
    }
    prepareSpectrogramPixels(visualizer, static_cast<std::size_t>(width), static_cast<std::size_t>(height));
    auto pixels = visualizer.pixels();
    if (pixels.empty()) return;
    const auto columns = static_cast<INT>(visualizer.pixelColumns());
    const auto bands = static_cast<INT>(visualizer.pixelRows());
    // Raster is cached by completed history revision and viewport. Downsampling
    // preserves peaks; nearest-neighbor enlargement invents no extra resolution.
    Gdiplus::Bitmap bitmap(columns, bands, columns * static_cast<INT>(sizeof(std::uint32_t)),
        PixelFormat32bppARGB, reinterpret_cast<BYTE*>(pixels.data()));
    if (bitmap.GetLastStatus() != Gdiplus::Ok) return;
    graphics.SetInterpolationMode(Gdiplus::InterpolationModeNearestNeighbor);
    graphics.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHalf);
    graphics.DrawImage(&bitmap, Gdiplus::Rect(rect.left, rect.top, width, height),
        0, 0, columns, bands, Gdiplus::UnitPixel);
}
} // namespace universal_dictate::visualization

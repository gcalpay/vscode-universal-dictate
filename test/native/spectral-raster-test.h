/* Raster regressions run by the spectral benchmark before timing. */
#pragma once
#include "../../native/spectral-render.h"
#include <stdexcept>

namespace spectral_raster_test {
namespace vis = universal_dictate::visualization;
using vis::Mode;
inline void check(bool ok, const char* message) {
    if (!ok) throw std::runtime_error(message);
}
inline std::vector<std::int16_t> tone(double hz, double amplitude, std::size_t count) {
    std::vector<std::int16_t> audio(count);
    for (std::size_t i=0; i<count; ++i)
        audio[i] = static_cast<std::int16_t>(std::lround(32767*amplitude*std::sin(2*vis::kPi*hz*i/vis::kSampleRate)));
    return audio;
}
inline void feed(vis::SpectralVisualizer& v, const std::vector<std::int16_t>& audio) {
    for (std::size_t i=0; i<audio.size(); i+=800) {
        v.push(audio.data()+i, std::min<std::size_t>(800,audio.size()-i)); v.update();
    }
}
inline std::vector<std::uint8_t> history(const vis::SpectralVisualizer& v) {
    std::vector<std::uint8_t> out;
    for (std::size_t x=0; x<v.columns(); ++x)
        for (std::size_t b=0; b<v.bands(); ++b) out.push_back(v.level(x,b));
    return out;
}
inline void run() {
    for (const auto mode : {Mode::LogFrequencyPowerSpectrogram}) {
        auto visualizer = std::make_unique<vis::SpectralVisualizer>(mode, 1000);
        feed(*visualizer, tone(250, 0.2, 32000));
        const auto original = history(*visualizer);
        const auto strongest = *std::max_element(original.begin(), original.end());
        check(strongest > 0, "tone fixture contains power");
        const auto storage = visualizer->storageBytes();
        for (const std::size_t rows : {1U, 7U, 17U, 29U, 96U, 200U})
            for (const std::size_t columns : {1U, 13U, 63U, 180U}) {
                vis::prepareSpectrogramPixels(*visualizer, columns, rows);
                const auto pixels = visualizer->pixels().first(visualizer->pixelColumns() * visualizer->pixelRows());
                check(std::find(pixels.begin(), pixels.end(), vis::spectralColor(strongest)) != pixels.end(),
                    "small raster retains strongest tone instead of skipping it");
                check(history(*visualizer) == original, "raster downsampling never rewrites history");
                check(visualizer->storageBytes() == storage, "viewport change allocates no new storage");
                const std::vector<std::uint32_t> cached(pixels.begin(), pixels.end());
                vis::prepareSpectrogramPixels(*visualizer, columns, rows);
                check(std::equal(cached.begin(), cached.end(), pixels.begin()), "cached raster repaint is stable");
            }
        vis::prepareSpectrogramPixels(*visualizer, visualizer->columns(), visualizer->bands());
        check(visualizer->pixelColumns() == visualizer->columns(), "restore full raster columns");
        check(visualizer->pixelRows() == visualizer->bands(), "restore full raster bands");
        feed(*visualizer, tone(2000, 0.1, 16000));
        check(!visualizer->pixelsCurrent(), "new audio invalidates raster cache");
        vis::prepareSpectrogramPixels(*visualizer);
        check(visualizer->pixelsCurrent(), "new completed frame refreshes raster");
    }
}

} // namespace spectral_raster_test

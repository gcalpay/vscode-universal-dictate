/* Report synthetic analyzer cost; not microphone or end-user hardware evidence. */
#include "../../native/spectral-render.h"
#include "spectral-raster-test.h"
#include <chrono>
#include <fstream>
#include <iomanip>
#include <iostream>

namespace vis = universal_dictate::visualization;
using Clock = std::chrono::steady_clock;
int main(int argc, char** argv) {
    if (argc > 2) { std::cerr << "Usage: spectral-benchmark [report.json]\n"; return 2; }
    try { spectral_raster_test::run(); }
    catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
    std::ofstream output;
    if (argc == 2) { output.open(argv[1]); if (!output) return 2; }
    std::ostream& report = output.is_open() ? output : std::cout;
    std::array<std::int16_t,800> samples{};
    report << "{\n  \"fixture\": \"60 seconds synthetic PCM; 50 ms batches; analyzer plus pixel preparation; no microphone or GDI\",\n  \"results\": [\n";
    bool first = true;
    for (const auto& [mode, name] : {
        std::pair{vis::Mode::LogFrequencyPowerSpectrogram,"logFrequencyPowerSpectrogram"},
        std::pair{vis::Mode::CircularSpectrum,"circularSpectrum"}}) {
        const auto before = Clock::now();
        auto visualizer = std::make_unique<vis::SpectralVisualizer>(mode,20000);
        const double setup = std::chrono::duration<double,std::milli>(Clock::now()-before).count();
        double total = 0, worst = 0;
        for (std::size_t tick = 0; tick < 1200; ++tick) {
            for (std::size_t i = 0; i < samples.size(); ++i) {
                const double t = static_cast<double>(tick*samples.size()+i)/vis::kSampleRate;
                samples[i] = static_cast<std::int16_t>(std::lround(1800*(std::sin(2*vis::kPi*140*t)+0.5*std::sin(2*vis::kPi*1120*t))));
            }
            const auto start = Clock::now();
            visualizer->push(samples.data(),samples.size()); visualizer->update();
            vis::prepareSpectrogramPixels(*visualizer);
            const double elapsed = std::chrono::duration<double,std::milli>(Clock::now()-start).count();
            total += elapsed; worst = std::max(worst,elapsed);
        }
        if (!first) report << ",\n";
        first=false;
        report << std::fixed << std::setprecision(4) << "    {\"mode\": \"" << name << "\", \"setup_ms\": " << setup
            << ", \"processing_ms\": " << total << ", \"mean_batch_ms\": " << total/1200 << ", \"worst_batch_ms\": " << worst
            << ", \"working_storage_bytes\": " << visualizer->storageBytes() << ", \"visual_frames_dropped\": " << visualizer->droppedFrames() << "}";
    }
    report << "\n  ]\n}\n";
    return report.good() ? 0 : 3;
}

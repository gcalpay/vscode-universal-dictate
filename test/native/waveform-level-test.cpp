#include "../../native/waveform-level.h"
#include <iostream>
#include <stdexcept>
using namespace universal_dictate;

void require(bool condition) {
    if (!condition) throw std::runtime_error("Signed-peak level regression");
}
int constantLevel(std::int16_t sample, std::uint32_t frames) {
    WaveformBucket bucket;
    for (std::uint32_t i = 1; i < frames; ++i) require(!bucket.push(sample, frames));
    const auto level = bucket.push(sample, frames);
    require(level.has_value());
    return *level;
}
int main() {
    require(visualPeakSample(0) == 0);
    require(visualPeakSample(65) == 0); // Slightly stronger visual-only idle gate.
    require(visualPeakSample(66) > 0);
    require(visualPeakSample(-32768) == -1000 && visualPeakSample(32767) == 1000);
    // Normal speech-range peaks retain detail and substantial headroom.
    require(visualPeakSample(1475) > 550 && visualPeakSample(1475) < 750);
    require(visualPeakSample(2949) == 1000);
    int last = 0;
    for (int sample = 0; sample <= 32767; ++sample) {
        const int next = visualPeakSample(sample);
        require(next >= last && next >= 0 && next <= 1000);
        require(visualPeakSample(-sample) == -next);
        last = next;
    }
    for (const std::uint32_t frames : {63U, 188U, 313U, 625U, 1250U}) {
        const auto quiet = constantLevel(128, frames);
        const auto normal = constantLevel(819, frames);
        const auto loud = constantLevel(1475, frames);
        require(quiet > 50 && normal > quiet + 200 && loud > normal + 150 && loud < 800);
        require(constantLevel(2949, frames) == 1000);
        require(constantLevel(-819, frames) == -normal);
        // A short transient retains its peak instead of being averaged away.
        WaveformBucket transient;
        require(!transient.push(-819, frames));
        for (std::uint32_t i = 1; i + 1 < frames; ++i) require(!transient.push(0, frames));
        require(transient.push(0, frames) == -normal);
        // The first strongest peak wins an equal-magnitude tie, as in 0.1.5.
        WaveformBucket bipolar;
        for (std::uint32_t i = 0; i + 1 < frames; ++i)
            require(!bipolar.push(i % 2 ? 819 : -819, frames));
        require(bipolar.push(819, frames) == -normal);
        require(bipolar.push(128, 1) == quiet);
        require(bipolar.push(1475, 1) == loud);
        require(bipolar.push(128, 1) == quiet); // No recent-loudness normalization.
        require(bipolar.push(0, 1) == 0);
    }
    require(constantLevel(819, 0) == constantLevel(819, 1));
    // Post-history Medium display only: quiet speech is visible; stronger speech
    // has additional headroom, sign/silence/ordering stay deterministic.
    require(mediumWaveformDisplayLevel(0) == 0);
    require(mediumWaveformDisplayLevel(visualPeakSample(65)) == 0);
    require(mediumWaveformDisplayLevel(visualPeakSample(66)) < 100);
    require(mediumWaveformDisplayLevel(-32768) == -1000);
    require(mediumWaveformDisplayLevel(32767) == 1000);
    const int quietVisible = mediumWaveformDisplayLevel(visualPeakSample(128));
    const int normalVisible = mediumWaveformDisplayLevel(visualPeakSample(819));
    const int loudVisible = mediumWaveformDisplayLevel(visualPeakSample(1475));
    require(quietVisible >= 400 && quietVisible <= 480);
    require(normalVisible > quietVisible + 300 && normalVisible < 850);
    require(loudVisible > normalVisible + 75 && loudVisible < 950);
    last = 0;
    for (int value = 0; value <= 1000; ++value) {
        const int next = mediumWaveformDisplayLevel(value);
        require(next >= last && next <= 1000);
        require(mediumWaveformDisplayLevel(-value) == -next);
        last = next;
    }
    // Visual emphasis is stable across time, with no rolling gain or peak decay.
    require(mediumWaveformDisplayLevel(visualPeakSample(128)) == quietVisible);
    require(constantLevel(128, 625) == visualPeakSample(128));
    std::cout << "Signed-peak mapping and fixed Medium-only quiet-speech display gain passed\n";
}

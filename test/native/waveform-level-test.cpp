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
    require(visualPeakSample(0) == 0 && visualPeakSample(32) == 0);
    require(visualPeakSample(-32768) == -1000 && visualPeakSample(32767) == 1000);
    require(visualPeakSample(1475) < 400); // Old 0.045 peak reference saturated here.
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
        const auto loud = constantLevel(5243, frames);
        require(quiet > 0 && normal > quiet && loud > normal && loud < 950);
        require(constantLevel(-819, frames) == -normal);
        // A short transient retains its peak instead of being averaged away.
        WaveformBucket transient;
        require(!transient.push(-819, frames));
        for (std::uint32_t i = 1; i + 1 < frames; ++i) require(!transient.push(0, frames));
        require(transient.push(0, frames) == -normal);
        // The first strongest peak wins an equal-magnitude tie, as in 1.0.
        WaveformBucket bipolar;
        for (std::uint32_t i = 0; i + 1 < frames; ++i)
            require(!bipolar.push(i % 2 ? 819 : -819, frames));
        require(bipolar.push(819, frames) == -normal);
        require(bipolar.push(128, 1) == quiet);
        require(bipolar.push(5243, 1) == loud);
        require(bipolar.push(128, 1) == quiet); // No recent-loudness normalization.
        require(bipolar.push(0, 1) == 0);
    }
    require(constantLevel(819, 0) == constantLevel(819, 1));
    std::cout << "Signed-peak mapping: monotonic headroom, polarity, five spans, short transients and no AGC passed\n";
}

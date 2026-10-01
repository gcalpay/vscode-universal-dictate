#include "../../native/waveform-level.h"
#include <array>
#include <stdexcept>
#include <iostream>
#include <limits>
using namespace universal_dictate;

// Keep both checks and state-changing fixture calls active with NDEBUG as well.
void require(bool condition) {
    if (!condition) throw std::runtime_error("Waveform level regression");
}

int constantLevel(std::int16_t sample, std::uint32_t frames) {
    WaveformBucket bucket;
    for (std::uint32_t i = 1; i < frames; ++i) require(!bucket.push(sample, frames));
    const auto level = bucket.push(sample, frames);
    require(level.has_value());
    return *level;
}
int main() {
    require(visualRmsMagnitude(0) == 0);
    require(visualRmsMagnitude(0.0009) == 0);
    require(visualRmsMagnitude(-1) == 0);
    require(visualRmsMagnitude(std::numeric_limits<double>::quiet_NaN()) == 0);
    require(visualRmsMagnitude(std::numeric_limits<double>::infinity()) == 0);
    require(visualRmsMagnitude(1) == 1000);
    require(visualRmsMagnitude(0.045) < 650); // The previous peak mapping already saturated here.
    int last = 0;
    for (int sample = 0; sample <= 32768; ++sample) {
        const int next = visualRmsMagnitude(sample / 32768.0);
        require(next >= last && next >= 0 && next <= 1000); last = next;
    }
    // Every supported history span uses the same absolute scale, including a partial
    // bucket resumed after Pause. Silence emits a zero, rather than no ring entry.
    for (const std::uint32_t frames : {63U, 188U, 313U, 625U, 1250U}) {
        require(constantLevel(0, frames) == 0);
        const auto quiet = constantLevel(128, frames);
        const auto normal = constantLevel(819, frames);
        const auto loud = constantLevel(5243, frames);
        require(quiet > 100 && normal - quiet > 250 && loud - normal > 250 && loud < 950);
        require(constantLevel(-819, frames) == -normal);
        require(constantLevel(-32768, frames) == -1000);
        WaveformBucket bucket;
        const auto next = [&](std::int16_t value) {
            std::optional<int> result;
            for (std::uint32_t i = 0; i < frames; ++i) result = bucket.push(value, frames);
            require(result.has_value()); return *result;
        };
        require(next(128) == quiet); require(next(5243) == loud); require(next(128) == quiet);
        require(next(0) == 0); // No normalization, hangover, artificial activity or smoothing.
    }
    // Equal peaks with different energy must no longer look identical.
    WaveformBucket impulse;
    for (int i = 0; i < 624; ++i) require(!impulse.push(0, 625));
    require(*impulse.push(8192, 625) < constantLevel(8192, 625) - 400);
    require(constantLevel(819, 0) == constantLevel(819, 1));
    std::cout << "Fixed RMS mapping: monotonic range, five spans, silence, polarity, transients and no AGC passed\n";
}

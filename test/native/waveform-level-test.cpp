#include "../../native/waveform-level.h"
#include <array>
#include <cassert>
#include <iostream>
#include <limits>
using namespace universal_dictate;

int constantLevel(std::int16_t sample, std::uint32_t frames) {
    WaveformBucket bucket;
    for (std::uint32_t i = 1; i < frames; ++i) assert(!bucket.push(sample, frames));
    const auto level = bucket.push(sample, frames);
    assert(level.has_value());
    return *level;
}
int main() {
    assert(visualRmsMagnitude(0) == 0);
    assert(visualRmsMagnitude(0.0009) == 0);
    assert(visualRmsMagnitude(-1) == 0);
    assert(visualRmsMagnitude(std::numeric_limits<double>::quiet_NaN()) == 0);
    assert(visualRmsMagnitude(std::numeric_limits<double>::infinity()) == 0);
    assert(visualRmsMagnitude(1) == 1000);
    assert(visualRmsMagnitude(0.045) < 650); // The previous peak mapping already saturated here.
    int last = 0;
    for (int sample = 0; sample <= 32768; ++sample) {
        const int next = visualRmsMagnitude(sample / 32768.0);
        assert(next >= last && next >= 0 && next <= 1000); last = next;
    }
    // Every supported history span uses the same absolute scale, including a partial
    // bucket resumed after Pause. Silence emits a zero, rather than no ring entry.
    for (const std::uint32_t frames : {63U, 188U, 313U, 625U, 1250U}) {
        assert(constantLevel(0, frames) == 0);
        const auto quiet = constantLevel(128, frames);
        const auto normal = constantLevel(819, frames);
        const auto loud = constantLevel(5243, frames);
        assert(quiet > 100 && normal - quiet > 250 && loud - normal > 250 && loud < 950);
        assert(constantLevel(-819, frames) == -normal);
        assert(constantLevel(-32768, frames) == -1000);
        WaveformBucket bucket;
        const auto next = [&](std::int16_t value) {
            std::optional<int> result;
            for (std::uint32_t i = 0; i < frames; ++i) result = bucket.push(value, frames);
            assert(result.has_value()); return *result;
        };
        assert(next(128) == quiet); assert(next(5243) == loud); assert(next(128) == quiet);
        assert(next(0) == 0); // No normalization, hangover, artificial activity or smoothing.
    }
    // Equal peaks with different energy must no longer look identical.
    WaveformBucket impulse;
    for (int i = 0; i < 624; ++i) assert(!impulse.push(0, 625));
    assert(*impulse.push(8192, 625) < constantLevel(8192, 625) - 400);
    assert(constantLevel(819, 0) == constantLevel(819, 1));
    std::cout << "Fixed RMS mapping: monotonic range, five spans, silence, polarity, transients and no AGC passed\n";
}

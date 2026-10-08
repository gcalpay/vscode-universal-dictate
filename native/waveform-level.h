/* Fixed-gain signed-peak visualization; PCM is never modified. SPDX-License-Identifier: MIT */
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>

namespace universal_dictate {
// Keep the stable signed-peak character with moderate visual headroom while
// suppressing only the very bottom of idle input. These constants never adapt.
inline int visualPeakSample(int sample) noexcept {
    const int clamped = std::clamp(sample, -32767, 32767);
    const double amplitude = std::abs(clamped) / 32767.0;
    constexpr double noiseFloor = 0.002;
    constexpr double reference = 0.09;
    if (amplitude <= noiseFloor) return 0;
    const double normalized = std::clamp((amplitude - noiseFloor) /
                                         (reference - noiseFloor), 0.0, 1.0);
    const int magnitude = static_cast<int>(std::lround(std::pow(normalized, 0.62) * 1000));
    return clamped < 0 ? -magnitude : magnitude;
}

// M6 normal-use correction: Medium's quiet speech was nearly flat in the
// 22-pixel preview viewport. Expand only its displayed signed peaks using a
// fixed soft-knee curve. The admitted PCM, bucket values, immutable history,
// accepted paint function, other sizes and spectral modes remain unchanged.
// This is deliberately not automatic gain control: old peaks never rescale.
inline int mediumWaveformDisplayLevel(int signedPeak) noexcept {
    const int peak = std::clamp(signedPeak, -1000, 1000);
    constexpr double knee = 20.0;  // Stored 0..1000 visualization units.
    static const double maxLog = std::log1p(1000.0 / knee);
    const int magnitude = static_cast<int>(std::lround(
        1000.0 * std::log1p(std::abs(peak) / knee) / maxLog));
    return peak < 0 ? -magnitude : magnitude;
}

class WaveformBucket {
public:
    // Called only for admitted audio. The duration is chosen once before capture.
    // A completed value is emitted once; partial buckets are never displayed.
    std::optional<int> push(std::int16_t sample, std::uint32_t targetFrames) noexcept {
        if (std::abs(static_cast<int>(sample)) > std::abs(peak_)) peak_ = sample;
        if (++frames_ < std::max(1U, targetFrames)) return std::nullopt;
        const int result = visualPeakSample(peak_);
        frames_ = 0;
        peak_ = 0;
        return result;
    }
private:
    std::uint32_t frames_ = 0;
    int peak_ = 0;
};
} // namespace universal_dictate

/* Fixed-gain RMS visualization; recorded audio is never modified. SPDX-License-Identifier: MIT */
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>

namespace universal_dictate {
// Relative digital signal level, not calibrated acoustic loudness. A fixed dBFS
// range keeps quiet/normal/loud input distinct; no rolling normalization or AGC.
inline int visualRmsMagnitude(double rms) noexcept {
    if (!std::isfinite(rms) || rms <= 0.001) return 0;
    const double fraction = std::clamp((20.0 * std::log10(rms) + 60.0) / 54.0, 0.0, 1.0);
    return static_cast<int>(std::lround(fraction * 1000.0));
}

struct WaveformRange {
    int below = 0;
    int above = 0;
    int magnitude() const noexcept { return std::max(below, above); }
    bool operator==(const WaveformRange&) const = default;
};

class WaveformBucket {
public:
    // Visual-only statistics. Each completed bucket retains both measured extrema;
    // the fixed RMS scale controls its height, not an arbitrary peak sign.
    std::optional<WaveformRange> push(std::int16_t sample, std::uint32_t targetFrames) noexcept {
        const int value = sample;
        sumSquares_ += static_cast<double>(value) * value;
        negativePeak_ = std::max(negativePeak_, -value);
        positivePeak_ = std::max(positivePeak_, value);
        if (++frames_ < std::max(1U, targetFrames)) return std::nullopt;
        const double rms = std::sqrt(sumSquares_ / frames_) / 32768.0;
        const int magnitude = visualRmsMagnitude(rms);
        const int peak = std::max(1, std::max(negativePeak_, positivePeak_));
        // Preserve the measured positive/negative proportions within the RMS height.
        // This changes only drawing coordinates, never PCM or the fixed level scale.
        const WaveformRange result{
            (magnitude * negativePeak_ + peak / 2) / peak,
            (magnitude * positivePeak_ + peak / 2) / peak};
        frames_ = 0; sumSquares_ = 0; negativePeak_ = 0; positivePeak_ = 0;
        return result;
    }
private:
    std::uint32_t frames_ = 0;
    double sumSquares_ = 0;
    int negativePeak_ = 0;
    int positivePeak_ = 0;
};
} // namespace universal_dictate

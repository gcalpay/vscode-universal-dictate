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

class WaveformBucket {
public:
    // Called only for admitted PCM, so a pause leaves even a partial bucket intact.
    // O(1) storage; the RMS/log mapping runs once per completed bucket, not per sample.
    std::optional<int> push(std::int16_t sample, std::uint32_t targetFrames) noexcept {
        const int value = sample;
        sumSquares_ += static_cast<double>(value) * value;
        if (std::abs(value) > std::abs(peak_)) peak_ = value;
        if (++frames_ < std::max(1U, targetFrames)) return std::nullopt;
        const double rms = std::sqrt(sumSquares_ / frames_) / 32768.0;
        const int magnitude = visualRmsMagnitude(rms);
        const int result = peak_ < 0 ? -magnitude : magnitude;
        frames_ = 0; sumSquares_ = 0; peak_ = 0;
        return result;
    }
private:
    std::uint32_t frames_ = 0;
    double sumSquares_ = 0;
    int peak_ = 0;
};
} // namespace universal_dictate

/* Fixed-gain waveform visualization; recorded audio is never modified. SPDX-License-Identifier: MIT */
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
    // Signed visual representative used only for the thin legacy-style center trace.
    // Magnitude remains fixed-RMS; sign follows the strongest measured PCM excursion.
    int trace = 0;
    int magnitude() const noexcept { return std::max(below, above); }
    bool operator==(const WaveformRange&) const = default;
};

class WaveformBucket {
public:
    // Visual-only statistics. Each completed 4 ms bucket retains both measured
    // extrema plus one signed representative. RMS controls height; the signed peak
    // contributes direction only, reproducing the crisp pre-1.1 trace without
    // changing recorded PCM or reintroducing early amplitude saturation.
    std::optional<WaveformRange> push(std::int16_t sample, std::uint32_t targetFrames) noexcept {
        const int value = sample;
        sumSquares_ += static_cast<double>(value) * value;
        negativePeak_ = std::max(negativePeak_, -value);
        positivePeak_ = std::max(positivePeak_, value);
        if (std::abs(value) > std::abs(signedPeak_)) signedPeak_ = value;
        if (++frames_ < std::max(1U, targetFrames)) return std::nullopt;
        const double rms = std::sqrt(sumSquares_ / frames_) / 32768.0;
        const int magnitude = visualRmsMagnitude(rms);
        const int peak = std::max(1, std::max(negativePeak_, positivePeak_));
        const int trace = signedPeak_ < 0 ? -magnitude : (signedPeak_ > 0 ? magnitude : 0);
        const WaveformRange result{
            (magnitude * negativePeak_ + peak / 2) / peak,
            (magnitude * positivePeak_ + peak / 2) / peak,
            trace};
        frames_ = 0;
        sumSquares_ = 0;
        negativePeak_ = 0;
        positivePeak_ = 0;
        signedPeak_ = 0;
        return result;
    }
private:
    std::uint32_t frames_ = 0;
    double sumSquares_ = 0;
    int negativePeak_ = 0;
    int positivePeak_ = 0;
    int signedPeak_ = 0;
};
} // namespace universal_dictate

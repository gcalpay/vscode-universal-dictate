/* Immutable display buckets; no paint-time resampling. SPDX-License-Identifier: MIT */
#pragma once
#include "waveform-level.h"
#include <array>
#include <atomic>
#include <span>

namespace universal_dictate {
constexpr std::size_t kWaveformHistoryCapacity = 256;

// Same span-dependent bucket sizing as the original recorder (16 kHz mono PCM).
// At the ten-second default each bucket contains exactly 625 PCM frames.
inline std::uint32_t waveformBucketFrames(int milliseconds) noexcept {
    const auto frames = static_cast<std::uint32_t>(std::clamp(milliseconds, 1000, 20000)) * 16;
    return (frames + kWaveformHistoryCapacity / 2) / kWaveformHistoryCapacity;
}

class WaveformHistory {
public:
    // One writer, no locks or allocations in the capture callback. Pair the signed
    // value with its sequence so wrap cannot make a lapped reader accept torn data.
    void publish(int sample) noexcept {
        const auto index = written_.load(std::memory_order_relaxed);
        const auto payload = static_cast<std::uint64_t>(std::clamp(sample, -1000, 1000) + 1000);
        slots_[index % kWaveformHistoryCapacity].store(
            (((index + 1) & kSequenceMask) << 11) | payload, std::memory_order_release);
        written_.store(index + 1, std::memory_order_release);
    }
    std::uint64_t written() const noexcept { return written_.load(std::memory_order_acquire); }

    // Copy completed samples verbatim in chronological order, with startup zeros.
    // No regrouping, strongest-event selection, interpolation or normalization.
    // On a lapped read the caller retains its previous complete frame.
    bool snapshot(std::span<int> output) const noexcept {
        if (output.empty() || output.size() > kWaveformHistoryCapacity) return false;
        const auto end = written();
        const auto available = std::min<std::uint64_t>(end, output.size());
        const auto leading = output.size() - static_cast<std::size_t>(available);
        std::fill_n(output.begin(), leading, 0);
        for (std::size_t i = 0; i < available; ++i) {
            const auto index = end - available + i;
            const auto slot = slots_[index % kWaveformHistoryCapacity].load(std::memory_order_acquire);
            if ((slot >> 11) != ((index + 1) & kSequenceMask)) return false;
            output[leading + i] = static_cast<int>(slot & 2047) - 1000;
        }
        return true;
    }
private:
    static constexpr std::uint64_t kSequenceMask = (std::uint64_t{1} << 53) - 1;
    static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
    std::array<std::atomic<std::uint64_t>, kWaveformHistoryCapacity> slots_{};
    std::atomic<std::uint64_t> written_{0};
};
} // namespace universal_dictate

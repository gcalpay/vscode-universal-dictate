/* Bounded, fixed-resolution visual history. SPDX-License-Identifier: MIT */
#pragma once
#include "waveform-level.h"
#include <array>
#include <atomic>
#include <span>
#include <vector>

namespace universal_dictate {
// 16 kHz PCM -> one measured range every 4 ms, for every selected history span.
// Ten seconds retains 2,500 ranges instead of 256. Twenty seconds is the memory cap.
constexpr std::uint32_t kWaveformFramesPerPoint = 64;
constexpr int kWaveformPointMilliseconds = 4;
constexpr std::size_t kWaveformHistoryCapacity = 5000;
constexpr std::size_t waveformHistoryPoints(int milliseconds) noexcept {
    return static_cast<std::size_t>(std::clamp(milliseconds, 1000, 20000) /
                                    kWaveformPointMilliseconds);
}

class WaveformHistory {
public:
    // Single capture-thread writer. Each slot atomically pairs its sequence with
    // both magnitudes, so a wrapped slot cannot masquerade as an older sample.
    void publish(WaveformRange range) noexcept {
        const auto index = written_.load(std::memory_order_relaxed);
        const auto payload = static_cast<std::uint64_t>(std::clamp(range.below, 0, 1000)) |
            (static_cast<std::uint64_t>(std::clamp(range.above, 0, 1000)) << 10);
        slots_[index % kWaveformHistoryCapacity].store(
            (((index + 1) & kSequenceMask) << 20) | payload, std::memory_order_release);
        written_.store(index + 1, std::memory_order_release);
    }
    std::uint64_t written() const noexcept { return written_.load(std::memory_order_acquire); }

    // Caller supplies scratch storage and commits it only on success. No locks,
    // allocations or waiting in capture; a lapped reader can retain its last frame.
    bool snapshot(std::span<WaveformRange> output) const noexcept {
        if (output.empty() || output.size() > kWaveformHistoryCapacity) return false;
        const auto end = written();
        const auto available = std::min<std::uint64_t>(end, output.size());
        const auto leading = output.size() - static_cast<std::size_t>(available);
        std::fill_n(output.begin(), leading, WaveformRange{});
        for (std::size_t i = 0; i < available; ++i) {
            const auto index = end - available + i;
            const auto slot = slots_[index % kWaveformHistoryCapacity].load(std::memory_order_acquire);
            if ((slot >> 20) != ((index + 1) & kSequenceMask)) return false;
            output[leading + i] = {static_cast<int>(slot & 1023),
                                  static_cast<int>((slot >> 10) & 1023)};
        }
        return true;
    }
private:
    static constexpr std::uint64_t kSequenceMask = (std::uint64_t{1} << 44) - 1;
    static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
    std::array<std::atomic<std::uint64_t>, kWaveformHistoryCapacity> slots_{};
    std::atomic<std::uint64_t> written_{0};
};

// One extremum-preserving range per physical pixel at most. Never decimate by
// taking every Nth sample (which can drop consonants/transients), and never connect
// arbitrary bucket signs. More data improves the envelope, not the pixel count.
inline std::vector<WaveformRange> waveformColumns(std::span<const WaveformRange> history,
                                                 int pixelWidth) {
    if (history.empty() || pixelWidth <= 0) return {};
    const auto count = std::min(history.size(), static_cast<std::size_t>(pixelWidth));
    std::vector<WaveformRange> columns(count);
    for (std::size_t column = 0; column < count; ++column) {
        const auto begin = column * history.size() / count;
        const auto end = (column + 1) * history.size() / count;
        for (auto i = begin; i < end; ++i) {
            columns[column].below = std::max(columns[column].below, history[i].below);
            columns[column].above = std::max(columns[column].above, history[i].above);
        }
    }
    return columns;
}
} // namespace universal_dictate

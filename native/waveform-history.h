/* Bounded, fixed-resolution visual history. SPDX-License-Identifier: MIT */
#pragma once
#include "waveform-level.h"
#include <array>
#include <atomic>
#include <span>
#include <vector>

namespace universal_dictate {
// Capture stays fine-grained (4 ms) at every history span. Rendering then reduces
// that history to the same ~256 signed display points used by the original visual.
constexpr std::uint32_t kWaveformFramesPerPoint = 64;
constexpr int kWaveformPointMilliseconds = 4;
constexpr std::size_t kWaveformHistoryCapacity = 5000;
constexpr std::size_t kWaveformDisplayPoints = 256;
constexpr std::size_t waveformHistoryPoints(int milliseconds) noexcept {
    return static_cast<std::size_t>(std::clamp(milliseconds, 1000, 20000) /
                                    kWaveformPointMilliseconds);
}

class WaveformHistory {
public:
    // Single capture-thread writer. One atomic slot contains below/above magnitudes,
    // signed trace and sequence tag, so a wrapped slot cannot masquerade as old data.
    void publish(WaveformRange range) noexcept {
        const auto index = written_.load(std::memory_order_relaxed);
        const auto below = static_cast<std::uint64_t>(std::clamp(range.below, 0, 1000));
        const auto above = static_cast<std::uint64_t>(std::clamp(range.above, 0, 1000));
        const auto trace = static_cast<std::uint64_t>(std::clamp(range.trace, -1000, 1000) + 1000);
        const auto payload = below | (above << 10) | (trace << 20);
        slots_[index % kWaveformHistoryCapacity].store(
            (((index + 1) & kSequenceMask) << 31) | payload, std::memory_order_release);
        written_.store(index + 1, std::memory_order_release);
    }
    std::uint64_t written() const noexcept { return written_.load(std::memory_order_acquire); }

    bool snapshot(std::span<WaveformRange> output) const noexcept {
        if (output.empty() || output.size() > kWaveformHistoryCapacity) return false;
        const auto end = written();
        const auto available = std::min<std::uint64_t>(end, output.size());
        const auto leading = output.size() - static_cast<std::size_t>(available);
        std::fill_n(output.begin(), leading, WaveformRange{});
        for (std::size_t i = 0; i < available; ++i) {
            const auto index = end - available + i;
            const auto slot = slots_[index % kWaveformHistoryCapacity].load(std::memory_order_acquire);
            if ((slot >> 31) != ((index + 1) & kSequenceMask)) return false;
            output[leading + i] = {
                static_cast<int>(slot & 1023),
                static_cast<int>((slot >> 10) & 1023),
                static_cast<int>((slot >> 20) & 2047) - 1000};
        }
        return true;
    }
private:
    static constexpr std::uint64_t kSequenceMask = (std::uint64_t{1} << 33) - 1;
    static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
    std::array<std::atomic<std::uint64_t>, kWaveformHistoryCapacity> slots_{};
    std::atomic<std::uint64_t> written_{0};
};

struct WaveformDisplayPoint {
    int magnitude = 0;
    int trace = 0;
};

// Reduce fine history to the original visual density. Within each display interval,
// keep the strongest measured 4 ms event and its real sign; do not create a filled
// min/max column. This preserves transients while feeding the old thin-line renderer.
inline std::vector<WaveformDisplayPoint> waveformDisplayPoints(
    std::span<const WaveformRange> history,
    std::size_t maxPoints = kWaveformDisplayPoints) {
    if (history.empty() || maxPoints == 0) return {};
    const auto count = std::min(history.size(), maxPoints);
    std::vector<WaveformDisplayPoint> points(count);
    for (std::size_t point = 0; point < count; ++point) {
        const auto begin = point * history.size() / count;
        const auto end = (point + 1) * history.size() / count;
        for (auto i = begin; i < end; ++i) {
            const int magnitude = history[i].magnitude();
            if (magnitude > points[point].magnitude ||
                (magnitude == points[point].magnitude &&
                 std::abs(history[i].trace) > std::abs(points[point].trace))) {
                points[point] = {magnitude, history[i].trace};
            }
        }
    }
    return points;
}

// Retained as a utility for tests/diagnostics that need measured pixel extrema.
inline std::vector<WaveformRange> waveformColumns(std::span<const WaveformRange> history,
                                                 int pixelWidth) {
    if (history.empty() || pixelWidth <= 0) return {};
    const auto count = std::min(history.size(), static_cast<std::size_t>(pixelWidth));
    std::vector<WaveformRange> columns(count);
    for (std::size_t column = 0; column < count; ++column) {
        const auto begin = column * history.size() / count;
        const auto end = (column + 1) * history.size() / count;
        for (auto i = begin; i < end; ++i) {
            if (history[i].magnitude() > columns[column].magnitude())
                columns[column].trace = history[i].trace;
            columns[column].below = std::max(columns[column].below, history[i].below);
            columns[column].above = std::max(columns[column].above, history[i].above);
        }
    }
    return columns;
}
} // namespace universal_dictate

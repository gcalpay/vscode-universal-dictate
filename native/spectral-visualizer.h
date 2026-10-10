/* Bounded, visual-only streaming spectra. SPDX-License-Identifier: MIT */
#pragma once
#include "overlay-visualization.h"
#include "overlay-colors.h"
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <complex>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <numbers>
#include <span>
#include <stdexcept>
#include <utility>
#include <vector>

namespace universal_dictate::visualization {
constexpr std::size_t kSampleRate = 16000;
constexpr std::size_t kFftSize = 1024;
constexpr std::size_t kHopFrames = 256;
constexpr std::size_t kMaxBands = 96;
constexpr std::size_t kCircularBands = 48;
constexpr std::size_t kMaxHistoryColumns = 1250; // Twenty seconds at 62.5 columns/s.
// Absorb bounded scheduling/preview-IPC stalls without putting work on capture.
// Processing remains capped at the original 8192 samples per UI update, so a
// larger queue cannot create a long catch-up computation on Stop or each paint.
constexpr std::size_t kPcmQueueCapacity = 32768; // 2.048 s; visual-only, never WAV storage.
constexpr std::size_t kPcmUpdateFrames = 8192;
constexpr double kMinFrequency = 62.5;
constexpr double kNyquist = kSampleRate / 2.0;
constexpr double kPi = std::numbers::pi_v<double>;
using Levels = std::array<std::uint8_t, kMaxBands>;

inline std::size_t historyColumns(int milliseconds) noexcept {
    const auto frames = static_cast<std::size_t>(std::clamp(milliseconds, 1000, 20000)) * kSampleRate;
    return (frames + 1000 * kHopFrames - 1) / (1000 * kHopFrames);
}

// A fixed digital reference, NOT microphone gain, calibrated loudness or a
// rolling normalization. The same completed power always has the same color.
inline std::uint8_t powerLevel(float power) noexcept {
    if (!(power > 0.0f) || !std::isfinite(power)) return 0;
    const double db = 10.0 * std::log10(static_cast<double>(power));
    return static_cast<std::uint8_t>(std::lround(std::clamp((db + 80.0) / 80.0, 0.0, 1.0) * 255.0));
}

struct PcmFrame {
    std::uint64_t position = 0; // Active-audio position; includes visualization-only drops.
    std::int16_t sample = 0;
};

// Single producer (admitted capture callback), single consumer (overlay thread).
// Plain slots are protected by ownership of the read/write cursors. Publication
// and reclamation are acquire/release; unlike a seqlock this has no data races.
class PcmQueue {
public:
    void push(const std::int16_t* samples, std::size_t count) noexcept {
        if (!samples || !count || count > std::numeric_limits<std::uint64_t>::max() - nextPosition_) return;
        const auto position = nextPosition_;
        nextPosition_ += count;
        const auto write = write_.load(std::memory_order_relaxed);
        const auto read = read_.load(std::memory_order_acquire);
        if (count > kPcmQueueCapacity - static_cast<std::size_t>(write - read)) {
            dropped_.fetch_add(count, std::memory_order_relaxed);
            received_.store(nextPosition_, std::memory_order_release);
            return; // Drop ONLY the visualization copy. Never wait or touch the WAV.
        }
        for (std::size_t i = 0; i < count; ++i)
            slots_[(write + i) % kPcmQueueCapacity] = PcmFrame{position + i, samples[i]};
        const auto pending = static_cast<std::size_t>(write + count - read);
        if (pending > highWater_.load(std::memory_order_relaxed))
            highWater_.store(pending, std::memory_order_relaxed); // Single producer.
        write_.store(write + count, std::memory_order_release);
        received_.store(nextPosition_, std::memory_order_release);
    }

    std::size_t pop(std::span<PcmFrame> output) noexcept {
        const auto read = read_.load(std::memory_order_relaxed);
        const auto write = write_.load(std::memory_order_acquire);
        const auto count = std::min(output.size(), static_cast<std::size_t>(write - read));
        for (std::size_t i = 0; i < count; ++i) output[i] = slots_[(read + i) % kPcmQueueCapacity];
        read_.store(read + count, std::memory_order_release);
        return count;
    }

    std::uint64_t receivedFrames() const noexcept { return received_.load(std::memory_order_acquire); }
    std::uint64_t droppedFrames() const noexcept { return dropped_.load(std::memory_order_relaxed); }
    std::size_t highWaterFrames() const noexcept { return highWater_.load(std::memory_order_relaxed); }
private:
    static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
    std::array<PcmFrame, kPcmQueueCapacity> slots_{};
    std::atomic<std::uint64_t> write_{0}, read_{0}, received_{0}, dropped_{0};
    std::atomic<std::size_t> highWater_{0};
    std::uint64_t nextPosition_ = 0; // Producer only; paused callbacks never call push.
};

// In-place radix-2 FFT with tables prepared before capture starts. No third-party
// dependency, plans, allocation, or trigonometry in transform().
class Fourier {
public:
    Fourier() {
        for (std::size_t i = 0; i < kFftSize; ++i) {
            window_[i] = static_cast<float>(0.5 - 0.5 * std::cos(2.0 * kPi * i / kFftSize));
            windowSum_ += window_[i];
            std::size_t x = i, reversed = 0;
            for (std::size_t n = kFftSize; n > 1; n >>= 1) { reversed = (reversed << 1) | (x & 1); x >>= 1; }
            reversed_[i] = reversed;
        }
        for (std::size_t i = 0; i < twiddles_.size(); ++i) {
            const double angle = -2.0 * kPi * i / kFftSize;
            twiddles_[i] = {static_cast<float>(std::cos(angle)), static_cast<float>(std::sin(angle))};
        }
    }

    void transform(std::span<const float, kFftSize> samples) noexcept {
        float mean = 0;
        for (float value : samples) mean += value;
        mean /= static_cast<float>(kFftSize);
        for (std::size_t i = 0; i < kFftSize; ++i) work_[reversed_[i]] = {(samples[i] - mean) * window_[i], 0};
        for (std::size_t length = 2; length <= kFftSize; length *= 2) {
            const auto half = length / 2;
            for (std::size_t start = 0; start < kFftSize; start += length) {
                for (std::size_t i = 0; i < half; ++i) {
                    const auto even = work_[start + i];
                    const auto odd = work_[start + i + half] * twiddles_[i * kFftSize / length];
                    work_[start + i] = even + odd;
                    work_[start + i + half] = even - odd;
                }
            }
        }
        for (std::size_t i = 0; i < power_.size(); ++i) {
            const float scale = (i == 0 || i == kFftSize / 2 ? 1.0f : 2.0f) / windowSum_;
            power_[i] = std::norm(work_[i]) * scale * scale;
        }
    }

    const std::array<float, kFftSize / 2 + 1>& power() const noexcept { return power_; }
private:
    float windowSum_ = 0;
    std::array<float, kFftSize> window_{};
    std::array<std::size_t, kFftSize> reversed_{};
    std::array<std::complex<float>, kFftSize / 2> twiddles_{};
    std::array<std::complex<float>, kFftSize> work_{};
    std::array<float, kFftSize / 2 + 1> power_{};
};

// Owned by the recorder, constructed only for an enabled spectral overlay.
// push() is the entire callback-side path. update(), history and pixel access
// belong solely to the overlay thread. Every update consumes at most one fixed
// 8192-frame batch. Scheduling headroom is bounded at 2.048 seconds; exceeding
// that bound drops only visualization copies, never audio or an unbounded queue.
class SpectralVisualizer {
public:
    explicit SpectralVisualizer(Mode mode, int milliseconds = 10000,
                                colors::Theme theme = colors::Theme::Blue)
        : mode_(mode), theme_(theme), columns_(historyColumns(milliseconds)),
          bands_(mode == Mode::CircularSpectrum ? kCircularBands : kMaxBands) {
        if (mode == Mode::Waveform) throw std::invalid_argument("Waveform does not use a spectral analyzer");
        fourier_ = std::make_unique<Fourier>();
        windowFrames_ = kFftSize;
        ring_.resize(windowFrames_); ordered_.resize(windowFrames_);
        if (mode != Mode::CircularSpectrum) pixels_.resize(columns_ * bands_);
        pixelColumns_ = columns_; pixelRows_ = bands_;
        prepareFftBands();
    }

    void push(const std::int16_t* samples, std::size_t count) noexcept {
        if (enabled_.load(std::memory_order_relaxed)) queue_.push(samples, count);
    }
    void disable() noexcept { enabled_.store(false, std::memory_order_relaxed); }

    std::size_t update() noexcept {
        if (!enabled_.load(std::memory_order_relaxed)) return 0;
        // Release queue ownership BEFORE doing any FFT/filter calculations.
        const auto count = queue_.pop(scratch_);
        for (std::size_t i = 0; i < count; ++i) accept(scratch_[i]);
        return count;
    }

    Mode mode() const noexcept { return mode_; }
    colors::Theme colorTheme() const noexcept { return theme_; }
    std::size_t bands() const noexcept { return bands_; }
    std::size_t columns() const noexcept { return columns_; }
    std::size_t windowFrames() const noexcept { return windowFrames_; }
    std::uint64_t revision() const noexcept { return written_; }
    std::uint64_t receivedFrames() const noexcept { return queue_.receivedFrames(); }
    std::uint64_t droppedFrames() const noexcept { return queue_.droppedFrames(); }
    std::size_t queueHighWaterFrames() const noexcept { return queue_.highWaterFrames(); }
    std::span<const float> lastPower() const noexcept { return {power_.data(), bands_}; }
    const Levels& latest() const noexcept { return latest_; }
    std::span<std::uint32_t> pixels() noexcept { return pixels_; } // Overlay thread only.
    std::size_t pixelColumns() const noexcept { return pixelColumns_; }
    std::size_t pixelRows() const noexcept { return pixelRows_; }
    bool pixelsCurrent() const noexcept { return pixelRevision_ == written_; }
    void pixelsPrepared() noexcept { pixelRevision_ = written_; }
    // Reuse the fixed allocation; resolution changes cannot mutate audio history.
    void setPixelExtent(std::size_t width, std::size_t height) noexcept {
        const auto columns = width ? std::min(columns_, width) : pixelColumns_;
        const auto rows = height ? std::min(bands_, height) : pixelRows_;
        if (columns != pixelColumns_ || rows != pixelRows_) {
            pixelColumns_ = columns; pixelRows_ = rows;
            pixelRevision_ = std::numeric_limits<std::uint64_t>::max();
        }
    }

    std::uint8_t level(std::size_t x, std::size_t band) const noexcept {
        if (x >= columns_ || band >= bands_) return 0;
        const auto available = std::min<std::uint64_t>(written_, columns_);
        const auto leading = columns_ - static_cast<std::size_t>(available);
        if (x < leading) return 0;
        return history_[(written_ - available + x - leading) % kMaxHistoryColumns][band];
    }

    std::size_t storageBytes() const noexcept {
        std::size_t bytes = sizeof(*this) + (ring_.capacity() + ordered_.capacity()) * sizeof(float)
            + pixels_.capacity() * sizeof(std::uint32_t);
        if (fourier_) bytes += sizeof(Fourier);
        return bytes;
    }
private:
    void prepareFftBands() noexcept {
        for (std::size_t band = 0; band < bands_; ++band) {
            const double low = kMinFrequency * std::pow(kNyquist / kMinFrequency, static_cast<double>(band) / bands_);
            const double high = kMinFrequency * std::pow(kNyquist / kMinFrequency, static_cast<double>(band + 1) / bands_);
            auto first = static_cast<std::size_t>(std::ceil(low * kFftSize / kSampleRate));
            auto end = std::min(kFftSize / 2 + 1, static_cast<std::size_t>(std::ceil(high * kFftSize / kSampleRate)));
            if (band + 1 == bands_) end = kFftSize / 2 + 1;
            if (first >= end) {
                // A narrow low-frequency row cannot invent additional FFT resolution.
                first = static_cast<std::size_t>(std::lround(std::sqrt(low * high) * kFftSize / kSampleRate));
                first = std::min(first, kFftSize / 2);
                end = first + 1;
            }
            fftBands_[band] = {first, end};
        }
    }

    void append(const Levels& levels) noexcept {
        history_[written_ % kMaxHistoryColumns] = levels;
        latest_ = levels;
        ++written_;
    }

    void accept(PcmFrame frame) noexcept {
        if (frame.position != expectedPosition_) {
            // Reset filter context across a visualization-only drop. Preserve old
            // colors, but insert blank time columns instead of faking continuity.
            const auto missed = frame.position > expectedPosition_ ?
                frame.position / kHopFrames - expectedPosition_ / kHopFrames : 0;
            for (std::uint64_t i = 0; i < std::min<std::uint64_t>(missed, kMaxHistoryColumns); ++i) append({});
            filled_ = 0; ringNext_ = 0; power_.fill(0); latest_.fill(0);
        }
        expectedPosition_ = frame.position + 1;
        ring_[ringNext_] = static_cast<float>(frame.sample) / 32768.0f;
        ringNext_ = (ringNext_ + 1) % windowFrames_;
        filled_ = std::min(windowFrames_, filled_ + 1);
        if (expectedPosition_ % kHopFrames != 0) return;
        if (filled_ < windowFrames_) { append({}); return; }
        for (std::size_t i = 0; i < windowFrames_; ++i) ordered_[i] = ring_[(ringNext_ + i) % windowFrames_];
        analyze();
        Levels levels{};
        for (std::size_t i = 0; i < bands_; ++i) levels[i] = powerLevel(power_[i]);
        append(levels);
    }

    void analyze() noexcept {
        fourier_->transform(std::span<const float, kFftSize>(ordered_.data(), kFftSize));
        const auto& bins = fourier_->power();
        for (std::size_t band = 0; band < bands_; ++band) {
            const auto [first, end] = fftBands_[band];
            power_[band] = *std::max_element(bins.begin() + first, bins.begin() + end);
        }
    }

    const Mode mode_;
    const colors::Theme theme_;
    const std::size_t columns_, bands_;
    std::atomic<bool> enabled_{true};
    PcmQueue queue_;
    std::array<PcmFrame, kPcmUpdateFrames> scratch_{};
    std::array<Levels, kMaxHistoryColumns> history_{};
    std::array<float, kMaxBands> power_{};
    Levels latest_{};
    std::array<std::pair<std::size_t, std::size_t>, kMaxBands> fftBands_{};
    std::unique_ptr<Fourier> fourier_;
    std::vector<float> ring_, ordered_;
    std::vector<std::uint32_t> pixels_;
    std::size_t pixelColumns_ = 0, pixelRows_ = 0;
    std::uint64_t pixelRevision_ = std::numeric_limits<std::uint64_t>::max();
    std::size_t windowFrames_ = 0, ringNext_ = 0, filled_ = 0;
    std::uint64_t written_ = 0, expectedPosition_ = 0;
};
} // namespace universal_dictate::visualization

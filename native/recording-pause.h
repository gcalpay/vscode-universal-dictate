/* Pause gates captured PCM, not the microphone device. SPDX-License-Identifier: MIT */
#pragma once
#include <atomic>
#include <charconv>
#include <cstdint>
#include <string_view>

namespace universal_dictate {
// One capture callback at a time. The callback never waits for the UI/pipe thread.
// Pause first blocks new admissions, then acknowledges only after an already
// admitted callback has finished writing WAV/preview/waveform samples.
class CaptureGate {
public:
    bool enter() noexcept {
        unsigned int expected = 0;
        return state_.compare_exchange_strong(expected, writing, std::memory_order_acquire,
                                              std::memory_order_relaxed);
    }
    void leave() noexcept { state_.fetch_and(~writing, std::memory_order_release); }
    void pause() noexcept { state_.fetch_or(blocked, std::memory_order_acq_rel); }
    void resume() noexcept { state_.fetch_and(~blocked, std::memory_order_release); }
    bool isBlocked() const noexcept { return (state_.load(std::memory_order_acquire) & blocked) != 0; }
    bool quiet() const noexcept { return (state_.load(std::memory_order_acquire) & writing) == 0; }
private:
    static_assert(std::atomic<unsigned int>::is_always_lock_free);
    static constexpr unsigned int blocked = 1, writing = 2;
    std::atomic<unsigned int> state_{0};
};

class CaptureLease {
public:
    explicit CaptureLease(CaptureGate& gate) noexcept : gate_(gate), admitted_(gate.enter()) {}
    ~CaptureLease() { if (admitted_) gate_.leave(); }
    CaptureLease(const CaptureLease&) = delete;
    CaptureLease& operator=(const CaptureLease&) = delete;
    explicit operator bool() const noexcept { return admitted_; }
private:
    CaptureGate& gate_;
    bool admitted_;
};

struct PauseAcknowledgement {
    std::uint32_t id = 0;
    bool paused = false;
};

class RecordingPause {
public:
    explicit RecordingPause(CaptureGate& captureGate) : gate(captureGate) {}
    CaptureGate& gate;
    // Command-reader owned parsing; one bounded latest request, no growing queue.
    // The host allows only one in-flight pause/resume request.
    bool command(std::string_view line) noexcept {
        const bool pause = line.starts_with("PAUSE ");
        if (!pause && !line.starts_with("RESUME ")) return false;
        line.remove_prefix(pause ? 6 : 7);
        std::uint32_t id = 0;
        const auto result = std::from_chars(line.data(), line.data() + line.size(), id);
        if (result.ec != std::errc{} || result.ptr != line.data() + line.size() ||
            id == 0 || id > 0x7fffffffU || id <= lastRequest_) return true;
        lastRequest_ = id;
        requested_.store((id << 1) | (pause ? 1U : 0U), std::memory_order_release);
        return true;
    }
    // Main/UI thread only. A zero id means no acknowledgement is ready yet.
    PauseAcknowledgement poll() noexcept {
        const auto request = requested_.exchange(0, std::memory_order_acq_rel);
        if (request != 0) {
            pending_ = request;
            if ((pending_ & 1U) != 0) gate.pause(); else gate.resume();
        }
        if (pending_ == 0 || ((pending_ & 1U) != 0 && !gate.quiet())) return {};
        const PauseAcknowledgement result{pending_ >> 1, (pending_ & 1U) != 0};
        pending_ = 0;
        return result;
    }
private:
    std::atomic<std::uint32_t> requested_{0};
    std::uint32_t lastRequest_ = 0; // Command-reader owned.
    std::uint32_t pending_ = 0;     // Main/UI thread owned.
};
} // namespace universal_dictate

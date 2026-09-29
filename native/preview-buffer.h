/* Bounded raw-PCM handoff for provisional text. SPDX-License-Identifier: MIT */
#pragma once
#include <algorithm>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <vector>

namespace universal_dictate::preview {
constexpr std::size_t kFrames = 8 * 16000;
struct Snapshot {
    std::uint64_t end = 0;
    std::vector<std::int16_t> pcm;
};

// One audio producer, one main-thread consumer. A failed try-lock drops ONLY
// preview samples; the full recording is independently written by miniaudio.
// All ordinary ring accesses hold the flag. No data-racing seqlock, waiting,
// allocation or pipe/file I/O in push(). A gap resets contiguous preview history.
class Buffer {
public:
    Buffer() = default;
    Buffer(const Buffer&) = delete;
    Buffer& operator=(const Buffer&) = delete;

    void push(const std::int16_t* samples, std::size_t count) noexcept {
        if (!samples || !count) return;
        if (count > std::numeric_limits<std::uint64_t>::max() - next_) return;
        const auto begin = next_;
        next_ += count;  // Producer-owned absolute timeline, including dropped PCM.
        if (lock_.test_and_set(std::memory_order_acquire)) return;
        if (end_ != begin) size_ = 0;
        const auto take = std::min(count, kFrames);
        const auto start = next_ - take;
        for (std::size_t i = 0; i < take; ++i)
            ring_[static_cast<std::size_t>((start + i) % kFrames)] = samples[count - take + i];
        end_ = next_;
        size_ = std::min(kFrames, size_ + take);
        lock_.clear(std::memory_order_release);
    }

    bool copy(Snapshot& result) {
        // Allocate before holding ownership; the producer never waits for us.
        result.pcm.resize(kFrames);
        if (lock_.test_and_set(std::memory_order_acquire)) {
            result.pcm.clear();
            return false;
        }
        const auto size = size_;
        result.end = end_;
        const auto start = end_ - size;
        for (std::size_t i = 0; i < size; ++i)
            result.pcm[i] = ring_[static_cast<std::size_t>((start + i) % kFrames)];
        lock_.clear(std::memory_order_release);
        result.pcm.resize(size);
        return true;
    }
private:
    std::atomic_flag lock_ = ATOMIC_FLAG_INIT;
    std::array<std::int16_t, kFrames> ring_{};
    std::uint64_t next_ = 0; // Written/read only by the producer.
    std::uint64_t end_ = 0;  // Below: only while holding lock_.
    std::size_t size_ = 0;
};
} // namespace universal_dictate::preview

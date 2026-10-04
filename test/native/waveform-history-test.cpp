#include "../../native/waveform-history.h"
#include <iostream>
#include <stdexcept>
#include <thread>
using namespace universal_dictate;
using Frame = std::array<int, kWaveformHistoryCapacity>;

void requireHistory(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
void checkAppendOnly(int span, std::uint32_t expectedFrames) {
    WaveformBucket bucket;
    WaveformHistory history;
    Frame before{}, after{};
    const auto frames = waveformBucketFrames(span);
    requireHistory(frames == expectedFrames, "original fixed bucket duration changed");
    // Startup, a full ring and two wraps. Test actual partial/completed buckets,
    // not just repeated rendering of a static screenshot.
    for (int event = 0; event < 768; ++event) {
        requireHistory(history.snapshot(before), "before snapshot");
        const std::int16_t peak = static_cast<std::int16_t>((event % 2 ? 1 : -1) *
                                                         (128 + event * 53 % 7000));
        for (std::uint32_t frame = 0; frame < frames; ++frame) {
            const auto value = bucket.push(frame == 0 ? peak : 0, frames);
            if (frame + 1 < frames) {
                requireHistory(!value, "unfinished bucket was emitted");
                if (frame % 61 == 0) {
                    requireHistory(history.snapshot(after), "partial snapshot");
                    requireHistory(after == before, "partial audio changed an old segment");
                }
            } else {
                requireHistory(value == visualPeakSample(peak), "signed transient changed");
                history.publish(*value);
            }
        }
        requireHistory(history.snapshot(after), "after snapshot");
        requireHistory(history.written() == static_cast<unsigned>(event + 1), "wrong append count");
        for (std::size_t i = 0; i + 1 < after.size(); ++i)
            requireHistory(after[i] == before[i + 1], "emitted waveform morphed during scrolling");
        requireHistory(after.back() == visualPeakSample(peak), "newest point incorrect");
        Frame again{};
        requireHistory(history.snapshot(again) && again == after, "repaint changed old waveform");
    }
}
void checkPauseAndBounds() {
    WaveformHistory history;
    Frame before{}, after{};
    WaveformBucket bucket;
    for (int i = 0; i < 312; ++i) requireHistory(!bucket.push(-819, 625), "partial bucket");
    requireHistory(history.snapshot(before), "paused initial snapshot");
    // Pause admits no PCM: no synthetic silence, and the partial bucket survives.
    requireHistory(history.snapshot(after) && after == before, "pause changed waveform");
    for (int i = 312; i < 624; ++i) requireHistory(!bucket.push(128, 625), "resumed partial");
    const auto point = bucket.push(128, 625);
    requireHistory(point == visualPeakSample(-819), "resume lost pre-pause peak");
    history.publish(*point);
    requireHistory(history.snapshot(after) && after.back() == *point, "resume append");
    requireHistory(!history.snapshot({}), "empty snapshot accepted");
    std::array<int, 257> oversized{};
    requireHistory(!history.snapshot(oversized), "oversized snapshot accepted");
    requireHistory(waveformBucketFrames(-1) == 63 && waveformBucketFrames(99999) == 1250,
                   "history duration bounds");
}
void checkConcurrentSnapshots() {
    WaveformHistory history;
    std::atomic<bool> done{false};
    std::thread producer([&] {
        for (int i = 0; i < 30000; ++i) history.publish(i % 1999 - 999);
        done.store(true);
    });
    Frame scratch{};
    bool valid = true;
    do {
        if (!history.snapshot(scratch)) continue;
        bool started = false;
        int previous = 0;
        for (int value : scratch) {
            if (!started && value == 0) continue;
            valid = valid && (!started || value == (previous == 999 ? -999 : previous + 1));
            previous = value;
            started = true;
        }
    } while (!done.load());
    producer.join();
    requireHistory(valid, "torn or nonchronological concurrent history");
}
int main() {
    const int spans[]{1000, 3000, 5000, 10000, 20000};
    const std::uint32_t frames[]{63, 188, 313, 625, 1250};
    for (int i = 0; i < 5; ++i) checkAppendOnly(spans[i], frames[i]);
    checkPauseAndBounds();
    checkConcurrentSnapshots();
    std::cout << "Immutable waveform: 3840 append/scroll comparisons, partial buckets, startup, wraps, Pause/Resume and concurrent snapshots passed\n";
}

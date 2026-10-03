#include "../../native/waveform-history.h"
#include <iostream>
#include <stdexcept>
#include <thread>
using namespace universal_dictate;

void requireHistory(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
void checkTemporalResolution() {
    for (const int span : {1000, 3000, 5000, 10000, 20000}) {
        WaveformBucket bucket;
        WaveformHistory history;
        const int samples = span * 16;
        for (int frame = 0; frame < samples; ++frame) {
            // An isolated 4 ms event inside an otherwise silent history must retain
            // its energy and timing, not be diluted into a 39/78 ms RMS bucket.
            const std::int16_t value = frame >= 128 && frame < 192 ? (frame % 2 ? 819 : -819) : 0;
            if (const auto range = bucket.push(value, kWaveformFramesPerPoint)) history.publish(*range);
        }
        std::vector<WaveformRange> snapshot(waveformHistoryPoints(span));
        requireHistory(history.snapshot(snapshot), "temporal snapshot");
        requireHistory(history.written() == waveformHistoryPoints(span), "fixed 4 ms rate");
        requireHistory(history.written() * kWaveformFramesPerPoint == static_cast<unsigned>(samples), "exact history duration");
        for (std::size_t i = 0; i < snapshot.size(); ++i) {
            const int expected = i == 2 ? visualRmsMagnitude(819 / 32768.0) : 0;
            requireHistory(snapshot[i] == WaveformRange{expected, expected}, "4 ms event lost or smeared");
        }
        // Every display pixel uses all its underlying buckets, including tiny events.
        for (const int width : {1, 28, 180, 280, 456, 1104}) {
            const auto columns = waveformColumns(snapshot, width);
            const auto peak = std::max_element(columns.begin(), columns.end(), [](auto a, auto b) { return a.above < b.above; });
            requireHistory(peak->above == snapshot[2].above, "pixel reduction lost short transient");
            requireHistory(columns.size() <= static_cast<unsigned>(width), "unbounded paint columns");
        }
    }
}
void checkRingAndPartialBucket() {
    WaveformHistory history;
    std::array<WaveformRange, 5> last{};
    history.publish({12, 25});
    requireHistory(history.snapshot(last), "short initial snapshot");
    requireHistory(last[0] == WaveformRange{} && last.back() == WaveformRange{12, 25}, "right-aligned startup");
    for (int i = 0; i < 12345; ++i) history.publish({i % 1001, (i + 9) % 1001});
    requireHistory(history.snapshot(last), "wrapped snapshot");
    for (int i = 0; i < 5; ++i)
        requireHistory(last[i] == WaveformRange{(12340+i) % 1001, (12349+i) % 1001}, "wrapped chronological order");
    WaveformBucket bucket;
    for (int i = 0; i < 32; ++i) requireHistory(!bucket.push(-819, 64), "early partial bucket");
    // Pause feeds no samples; the existing 32 frames survive until Resume.
    for (int i = 0; i < 31; ++i) requireHistory(!bucket.push(819, 64), "early resumed bucket");
    const auto range = bucket.push(819, 64);
    const auto level = visualRmsMagnitude(819 / 32768.0);
    requireHistory(range == WaveformRange{level, level}, "partial bucket resume changed waveform");
    requireHistory(!history.snapshot({}), "empty snapshot accepted");
    requireHistory(waveformColumns({}, 100).empty(), "empty projection");
    requireHistory(waveformColumns(last, 0).empty(), "zero-width projection");
}
void checkConcurrentSnapshots() {
    WaveformHistory history;
    std::atomic<bool> done{false};
    std::thread producer([&] {
        for (int i = 0; i < 30000; ++i) history.publish({i % 1001, 1000 - i % 1001});
        done.store(true);
    });
    std::array<WaveformRange, 5000> scratch{};
    bool valid = true;
    do {
        if (!history.snapshot(scratch)) continue; // A lapped reader intentionally retries next frame.
        int previous = -1;
        for (auto range : scratch) {
            if (range == WaveformRange{}) continue; // Leading startup silence.
            valid = valid && range.below + range.above == 1000;
            valid = valid && (previous < 0 || range.below == (previous + 1) % 1001);
            previous = range.below;
        }
    } while (!done.load());
    producer.join();
    requireHistory(valid, "torn or nonchronological concurrent history");
}
int main() {
    checkTemporalResolution();
    checkRingAndPartialBucket();
    checkConcurrentSnapshots();
    std::cout << "4 ms detail: five exact spans, both polarities, transient-preserving pixels, wrap, partial pause and concurrent snapshots passed\n";
}

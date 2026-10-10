/* Synthetic, microphone-free spectral regression tests. SPDX-License-Identifier: MIT */
#include "../../native/spectral-render.h"
#include "../../native/preview-layout.h"
#include "../../native/circular-layout.h"
#include "../../native/recording-pause.h"
#include "overlay-design-test.h"
#include <chrono>
#include <iostream>
#include <random>
#include <stdexcept>
#include <thread>

namespace vis = universal_dictate::visualization;
using vis::Mode;
namespace {
std::size_t assertions = 0;
void check(bool ok, const char* message) {
    ++assertions;
    if (!ok) throw std::runtime_error(message);
}
void near(double value, double expected, double tolerance, const char* message) {
    check(std::abs(value - expected) <= tolerance, message);
}
std::vector<std::int16_t> tone(double hz, double amplitude, std::size_t frames) {
    std::vector<std::int16_t> result(frames);
    for (std::size_t i = 0; i < frames; ++i)
        result[i] = static_cast<std::int16_t>(std::lround(32767 * amplitude * std::sin(2 * vis::kPi * hz * i / vis::kSampleRate)));
    return result;
}
void feed(vis::SpectralVisualizer& visualizer, std::span<const std::int16_t> audio, std::size_t chunk = 800) {
    for (std::size_t start = 0; start < audio.size(); start += chunk) {
        const auto count = std::min(chunk, audio.size() - start);
        visualizer.push(audio.data() + start, count);
        visualizer.update();
    }
}
std::vector<std::uint8_t> history(const vis::SpectralVisualizer& visualizer) {
    std::vector<std::uint8_t> result;
    for (std::size_t x = 0; x < visualizer.columns(); ++x)
        for (std::size_t band = 0; band < visualizer.bands(); ++band) result.push_back(visualizer.level(x, band));
    return result;
}
std::size_t peak(std::span<const float> values) {
    return static_cast<std::size_t>(std::max_element(values.begin(), values.end()) - values.begin());
}
constexpr std::array modes{Mode::LogFrequencyPowerSpectrogram, Mode::CircularSpectrum};

void testModeAndScale() {
    check(vis::parseMode("waveform") == Mode::Waveform, "waveform mode");
    check(vis::parseMode("unknown") == Mode::Waveform, "unknown mode fallback");
    check(vis::parseMode("constantQPowerSpectrogram") == Mode::LogFrequencyPowerSpectrogram, "retired CQT maps to log");
    check(vis::parseMode("linearFrequencyPowerSpectrogram") == Mode::LogFrequencyPowerSpectrogram, "retired linear maps to log");
    check(vis::powerLevel(0) == 0 && vis::powerLevel(-1) == 0, "zero and negative power");
    check(vis::powerLevel(std::numeric_limits<float>::quiet_NaN()) == 0, "nonfinite power");
    check(vis::powerLevel(1e-8f) == 0 && vis::powerLevel(1) == 255 && vis::powerLevel(100) == 255, "fixed scale bounds");
    near(vis::powerLevel(1e-4f), 128, 1, "-40 dB midpoint");
    for (int i = 0; i < 1000; ++i)
        check(vis::powerLevel(i / 1000.0f) <= vis::powerLevel((i + 1) / 1000.0f), "monotonic scale");
    check(vis::spectralColor(0) == 0xff0e121bU, "silence is panel color");
    check(vis::spectralColor(255) == 0xffeff9dbU, "palette upper bound");
    for (unsigned level = 0; level <= 255; ++level)
        check((vis::spectralColor(static_cast<std::uint8_t>(level)) >> 24) == 255, "opaque pixel");
    for (auto [ms, expected] : std::array<std::pair<int, std::size_t>, 7>{{{0,63},{1000,63},{3000,188},{5000,313},{10000,625},{20000,1250},{30000,1250}}})
        check(vis::historyColumns(ms) == expected, "history duration bounds");
}

void testFourier() {
    vis::Fourier transform;
    std::array<float, vis::kFftSize> audio{};
    for (std::size_t i = 0; i < audio.size(); ++i) audio[i] = static_cast<float>(0.25 * std::sin(2 * vis::kPi * 64 * i / audio.size()));
    transform.transform(audio);
    check(peak(transform.power()) == 64, "1 kHz FFT bin");
    near(transform.power()[64], 0.25 * 0.25, 2e-7, "coherent peak-amplitude-squared power");
    const double reference = transform.power()[64];
    for (auto& sample : audio) sample *= 0.5f;
    transform.transform(audio);
    near(transform.power()[64] / reference, 0.25, 1e-6, "power scales with amplitude squared");
    audio.fill(0.3f); transform.transform(audio);
    check(*std::max_element(transform.power().begin(), transform.power().end()) < 1e-9f, "DC removed without modifying PCM");
    // Independent O(N^2) complex DFT, not a second FFT implementation.
    std::mt19937 generator(52);
    for (auto& sample : audio) sample = static_cast<float>(static_cast<int>(generator() % 2001) - 1000) / 5000;
    transform.transform(audio);
    float mean = 0; for (float sample : audio) mean += sample; mean /= static_cast<float>(audio.size());
    for (std::size_t k = 0; k <= audio.size() / 2; ++k) {
        std::complex<double> sum{};
        for (std::size_t i = 0; i < audio.size(); ++i) {
            const double window = 0.5 - 0.5 * std::cos(2 * vis::kPi * i / audio.size());
            const double angle = -2 * vis::kPi * k * i / audio.size();
            sum += static_cast<double>(audio[i] - mean) * window * std::complex<double>{std::cos(angle), std::sin(angle)};
        }
        const double scale = (k == 0 || k == audio.size() / 2 ? 1.0 : 2.0) / (audio.size() / 2);
        near(transform.power()[k], std::norm(sum) * scale * scale, 5e-9, "FFT agrees with independent DFT");
    }
}

void testStreamAndMapping() {
    const auto audio = tone(1000, 0.15, 32000);
    for (const auto mode : modes) {
        auto a = std::make_unique<vis::SpectralVisualizer>(mode, 1000);
        auto b = std::make_unique<vis::SpectralVisualizer>(mode, 1000);
        feed(*a, audio, 61); feed(*b, audio, 1703);
        check(a->revision() == audio.size() / vis::kHopFrames, "one history column per audio hop");
        check(history(*a) == history(*b) && a->latest() == b->latest(), "callback chunk invariance");
        check(a->receivedFrames() == audio.size() && a->droppedFrames() == 0, "received frame identity");
        if (mode == Mode::LogFrequencyPowerSpectrogram) check(peak(a->lastPower()) == 54, "logarithmic 1 kHz row");
        if (mode == Mode::CircularSpectrum) check(peak(a->lastPower()) == 27, "circular logarithmic bin ordering");
        const auto before = history(*a); const auto revision = a->revision();
        std::array<std::int16_t, vis::kHopFrames-1> partial{};
        // Align to the next exact hop before checking a partial publication.
        auto c = std::make_unique<vis::SpectralVisualizer>(mode, 1000);
        feed(*c, std::span(audio).first(vis::kHopFrames * 60));
        const auto cBefore = history(*c);
        feed(*c, partial);
        check(history(*c) == cBefore && c->revision() == 60, "partial frame leaves display untouched");
        // Empty update is a paused/idle paint: no simulated decay, noise or scrolling.
        for (int n = 0; n < 10; ++n) a->update();
        check(history(*a) == before && a->revision() == revision, "no audio means no animation");
        std::vector<std::int16_t> silence(a->windowFrames() + 512, 0);
        feed(*a, silence);
        check(*std::max_element(a->latest().begin(), a->latest().end()) == 0, "real silence clears current spectral frame");
        check(a->storageBytes() < 2 * 1024 * 1024, "bounded analyzer working storage");
    }
}

void testImmutableHistoryAndPause() {
    std::mt19937 generator(17);
    std::array<std::int16_t, vis::kHopFrames> block{};
    for (const auto mode : modes) for (const int span : {1000, 3000, 5000, 10000, 20000}) {
        auto visualizer = std::make_unique<vis::SpectralVisualizer>(mode, span);
        const auto capacity = visualizer->columns();
        // Process every hop through two wraps. Compare every old column at
        // startup, both wrap boundaries and periodic checkpoints. Avoid billions
        // of redundant comparisons so the same test can run under sanitizers.
        for (std::size_t tick = 0; tick < capacity * 2 + 3; ++tick) {
            const bool checkpoint = tick < 22 || tick % 31 == 0
                || (tick + 3 >= capacity && tick <= capacity + 3) || tick + 3 >= 2 * capacity;
            const auto before = checkpoint ? history(*visualizer) : std::vector<std::uint8_t>{};
            for (auto& sample : block) sample = static_cast<std::int16_t>(generator() % (tick % 3 ? 700 : 22000));
            feed(*visualizer, block);
            if (checkpoint) for (std::size_t x = 0; x + 1 < capacity; ++x)
                for (std::size_t band = 0; band < visualizer->bands(); ++band)
                    check(visualizer->level(x, band) == before[(x+1)*visualizer->bands()+band], "old columns translate verbatim, including ring wrap and loud-after-quiet");
        }
        const auto fixed = history(*visualizer);
        vis::prepareSpectrogramPixels(*visualizer);
        const std::vector<std::uint32_t> pixels(visualizer->pixels().begin(), visualizer->pixels().end());
        for (int repaint = 0; repaint < 3; ++repaint) vis::prepareSpectrogramPixels(*visualizer);
        check(history(*visualizer) == fixed, "paint does not change history");
        check(std::equal(pixels.begin(), pixels.end(), visualizer->pixels().begin()), "repeat paints have stable colors");
        if (!pixels.empty()) for (std::size_t y = 0; y < visualizer->bands(); ++y)
            check(pixels[y*capacity+capacity-1] == vis::spectralColor(visualizer->latest()[visualizer->bands()-1-y]), "top-to-bottom frequency orientation");
    }
    const auto first = tone(500, 0.1, 16519), second = tone(1500, 0.2, 16200), rejected = tone(3200, 0.9, 12000);
    for (const auto mode : modes) {
        auto paused = std::make_unique<vis::SpectralVisualizer>(mode);
        auto reference = std::make_unique<vis::SpectralVisualizer>(mode);
        universal_dictate::CaptureGate gate;
        auto admit = [&](const auto& audio) {
            universal_dictate::CaptureLease lease(gate);
            if (lease) feed(*paused, audio);
        };
        admit(first); const auto before = history(*paused);
        gate.pause(); admit(rejected);
        check(history(*paused) == before, "pause excludes sentinel PCM and freezes frame");
        gate.resume(); admit(second);
        feed(*reference, first); feed(*reference, second);
        check(history(*paused) == history(*reference), "resume matches concatenated accepted audio, including partial window");
        const auto count = paused->receivedFrames(); paused->disable(); feed(*paused, rejected);
        check(paused->receivedFrames() == count, "failed/closed overlay disables acquisition");
    }
}

void testQueueAndOverflow() {
    auto visualizer = std::make_unique<vis::SpectralVisualizer>(Mode::LogFrequencyPowerSpectrogram, 10000);
    const auto audio = tone(500, 0.15, vis::kPcmQueueCapacity);
    const auto copy = audio;
    visualizer->push(audio.data(), audio.size()); visualizer->push(audio.data(), audio.size());
    check(visualizer->droppedFrames() == audio.size(), "full queue drops only visualization copy");
    while (visualizer->update()) {}
    visualizer->push(audio.data(), audio.size());
    while (visualizer->update()) {}
    check(visualizer->revision() == 3 * audio.size() / vis::kHopFrames, "overflow retains active-audio time gaps");
    check(visualizer->latest()[41] > 0, "analyzer recovers after overflow");
    check(audio == copy, "caller PCM remains untouched");
    bool blank = false; for (std::size_t x = 0; x < visualizer->columns(); ++x) if (visualizer->level(x, 41) == 0) blank = true;
    check(blank, "missing visualization frames are blank, not invented data");
    auto queue = std::make_unique<vis::PcmQueue>();
    std::atomic<bool> done{false}; std::uint64_t readCount = 0, last = 0;
    std::thread producer([&] {
        std::array<std::int16_t, 73> samples{};
        for (std::uint64_t chunk = 0; chunk < 30000; ++chunk) {
            for (std::size_t i = 0; i < samples.size(); ++i) samples[i] = static_cast<std::int16_t>((chunk * samples.size() + i) % 30000);
            queue->push(samples.data(), samples.size());
        }
        done.store(true, std::memory_order_release);
    });
    std::array<vis::PcmFrame, 319> batch{};
    // Check producer/consumer data integrity without throwing across a joinable thread.
    bool valid = true;
    for (;;) {
        auto count = queue->pop(batch);
        if (!count && done.load(std::memory_order_acquire)) {
            // Acquire completion before the final pop: data may have been
            // published between the first empty pop and the completion load.
            count = queue->pop(batch);
            if (!count) break;
        }
        for (std::size_t i = 0; i < count; ++i) {
            valid = valid && batch[i].sample == static_cast<std::int16_t>(batch[i].position % 30000)
                    && (!readCount || batch[i].position > last);
            last = batch[i].position; ++readCount;
        }
    }
    producer.join();
    check(valid, "concurrent queue ownership and sample sequence");
    check(readCount + queue->droppedFrames() == queue->receivedFrames(), "concurrent queue accounts for every frame");
}

void testBoundedSchedulingStall() {
    const auto audio = tone(1000, .15, 24000); // 1.5 s without a UI drain.
    for (const auto mode : modes) {
        auto delayed = std::make_unique<vis::SpectralVisualizer>(mode, 20000);
        auto reference = std::make_unique<vis::SpectralVisualizer>(mode, 20000);
        feed(*reference, audio);
        for (std::size_t start = 0; start < audio.size(); start += 160)
            delayed->push(audio.data() + start, 160);
        check(delayed->queueHighWaterFrames() == audio.size(), "queue reports the full scheduling burst");
        check(delayed->droppedFrames() == 0, "bounded scheduling stall loses no visualization samples");
        std::size_t consumed = 0, calls = 0;
        for (;;) {
            const auto count = delayed->update();
            check(count <= vis::kPcmUpdateFrames, "catch-up is capped at the original per-update work");
            if (!count) break;
            consumed += count; ++calls;
        }
        check(consumed == audio.size() && calls == 3, "three bounded updates drain the burst");
        check(history(*delayed) == history(*reference), "delayed history is identical to regularly drained PCM");
        check(delayed->storageBytes() < 2 * 1024 * 1024, "20-second analyzer including queue remains under 2 MiB");
    }
}

void testGeometry() {
    using namespace universal_dictate;
    vis::Levels spectrum{}; spectrum.fill(255);
    std::size_t layouts = 0;
    for (const auto size : {OverlaySize::Small, OverlaySize::Medium, OverlaySize::Large})
        for (const unsigned dpi : {96U,120U,144U,192U}) for (const bool preview : {false,true}) {
            const auto rect = calculateCircularOverlayLayout(size, dpi, preview).waveform;
            const auto geometry = vis::circularGeometry(rect, dpi, spectrum);
            check(geometry.count >= 12 && geometry.count <= vis::kCircularBands, "readable bounded radial groups");
            for (std::size_t i = 0; i < geometry.count; ++i) {
                const auto& bar = geometry.bars[i];
                for (const auto& [x,y] : {std::pair{bar.x1,bar.y1}, std::pair{bar.x2,bar.y2}})
                    check(x - geometry.stroke*0.5 >= rect.left && x + geometry.stroke*0.5 < rect.right
                        && y - geometry.stroke*0.5 >= rect.top && y + geometry.stroke*0.5 < rect.bottom, "radial stroke fits waveform viewport at every DPI");
            }
            ++layouts;
        }
    check(layouts == 24, "all size/preview/DPI layouts exercised");
    check(vis::circularGeometry({0,0,0,0},96,spectrum).count == 0, "empty viewport safe");
}
}
int main() {
    try {
        overlay_design_test::run();
        testModeAndScale(); testFourier(); testStreamAndMapping();
        testImmutableHistoryAndPause(); testQueueAndOverflow(); testBoundedSchedulingStall(); testGeometry();
        std::cout << "spectral-visualizer: " << assertions << " checks passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "spectral-visualizer FAILED: " << error.what() << "\n";
        return 1;
    }
}

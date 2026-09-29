#include "../../native/preview-buffer.h"
#include <atomic>
#include <iostream>
#include <stdexcept>
#include <thread>
using namespace universal_dictate::preview;
void require(bool ok, const char* msg) { if (!ok) throw std::runtime_error(msg); }
int main() {
    try {
        Buffer buffer; Snapshot s;
        require(buffer.copy(s) && s.pcm.empty(), "empty snapshot");
        const std::int16_t first[] = {-32768, 0, 32767};
        buffer.push(first, 3);
        require(buffer.copy(s) && s.end == 3 && s.pcm.size() == 3 && s.pcm[0] == -32768, "initial PCM");
        std::vector<std::int16_t> input(kFrames * 2 + 13);
        for (std::size_t i = 0; i < input.size(); ++i) input[i] = static_cast<std::int16_t>(i % 30000);
        buffer.push(input.data(), input.size());
        require(buffer.copy(s) && s.pcm.size() == kFrames && s.end == input.size() + 3, "bounded overwrite");
        require(std::equal(s.pcm.begin(), s.pcm.end(), input.end() - kFrames), "latest exact samples");
        buffer.push(nullptr, 100); buffer.push(first, 0);
        require(buffer.copy(s) && s.end == input.size() + 3, "invalid input ignored");
        // Stress concurrent ownership: all observed samples must match their
        // absolute timeline, including after try-lock drops and history resets.
        Buffer concurrent; std::atomic<bool> finished{false};
        std::thread producer([&] {
            std::array<std::int16_t, 160> block{};
            for (std::uint64_t i = 0; i < 25000; ++i) {
                for (std::uint64_t j = 0; j < block.size(); ++j)
                    block[j] = static_cast<std::int16_t>((i * block.size() + j) % 30000);
                concurrent.push(block.data(), block.size());
            }
            finished.store(true, std::memory_order_release);
        });
        bool valid = true;
        std::uint64_t last = 0;
        do {
            if (concurrent.copy(s)) {
                valid &= s.end >= last && s.pcm.size() <= kFrames && s.pcm.size() <= s.end;
                for (std::size_t i = 0; i < s.pcm.size(); ++i)
                    valid &= s.pcm[i] == static_cast<std::int16_t>((s.end - s.pcm.size() + i) % 30000);
                last = s.end;
            }
        } while (!finished.load(std::memory_order_acquire));
        producer.join(); require(valid, "concurrent PCM ownership / gap reset");
        std::cout << "5 preview-buffer checks passed (including concurrent producer/consumer)\n";
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}

/* Deterministic flush-ownership regression; no microphone or pipe. */
#include "../../native/recorder-streams.h"
#include <sstream>
#include <iostream>
#include <stdexcept>

struct FlushCounter : std::stringbuf {
    unsigned flushes = 0;
    int sync() override { ++flushes; return 0; }
};
int main() {
    try {
        FlushCounter sink;
        std::ostream output(&sink);
        std::istringstream input("TEXT session 1 616263\nSTOP\n");
        input.tie(&output);
        char c = 0;
        input.get(c); // Prove that this test's stream normally flushes its tie.
        if (sink.flushes == 0) throw std::runtime_error("control did not exercise tied input");
        const auto before = sink.flushes;
        universal_dictate::configureRecorderCommandInput(input);
        std::string tail;
        while (input.get(c)) tail += c;
        if (input.tie() || sink.flushes != before || tail != "EXT session 1 616263\nSTOP\n")
            throw std::runtime_error("command read flushed output or changed bytes");
        output << "READY\n" << std::flush;
        if (sink.flushes != before + 1 || sink.str() != "READY\n")
            throw std::runtime_error("explicit output flush changed");
        std::cout << "Recorder input: no per-byte output flush; exact commands and explicit responses preserved\n";
        return 0;
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}

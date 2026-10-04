#include "../../native/preview-bridge.h"
#include <iostream>
#include <stdexcept>
using namespace universal_dictate::preview;
void require(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
int main(int argc, char** argv) {
    // A synthetic, microphone-free IPC target for the actual TypeScript adapter.
    if (argc > 1 && std::string_view(argv[1]) == "--ipc") {
        Bridge bridge("synthetic-session");
        const std::int16_t pcm[] = {-32768, 0, 32767}; bridge.audio.push(pcm, 3);
        std::cout << "READY\n" << std::flush;
        std::string line;
        while (std::getline(std::cin,line)) {
            if (line == "STOP" || line == "CANCEL") return 0;
            if (line.size() > 8448) return 2;
            bridge.command(line);
            const auto response = bridge.snapshot();
            if (!response.empty()) std::cout << response << std::flush;
        }
        return 0;
    }
    try {
        require(validSession("abc-123_A") && !validSession("bad session") && !validSession("\nSTOP"), "session grammar");
        Bridge bridge("a");
        bridge.command("SNAPSHOT a 1"); require(bridge.snapshot() == "PREVIEW_EMPTY a 1\n", "empty");
        const std::int16_t pcm[] = {-32768,0,32767}; bridge.audio.push(pcm,3);
        bridge.command("SNAPSHOT a 2"); require(bridge.snapshot() == "PREVIEW a 2 0 3 00800000ff7f\n", "PCM endian / identity");
        bridge.command("SNAPSHOT a 2"); require(bridge.snapshot().empty(), "duplicate request");
        bridge.command("SNAPSHOT b 3"); require(bridge.snapshot().empty(), "wrong session");
        for (auto command : {"SNAPSHOT a -1", "SNAPSHOT a 3 extra", "SNAPSHOT a 9007199254740992", "SNAPSHOT a 3x"}) {
            bridge.command(command); require(bridge.snapshot().empty(), "malformed sequence");
        }
        bridge.command("SNAPSHOT a 4"); require(bridge.snapshot(false) == "PREVIEW_ERROR a 4\n", "no invisible preview");
        bridge.command("SNAPSHOT a 5"); require(bridge.snapshot(true, true) == "PREVIEW_EMPTY a 5\n", "paused snapshot does not copy audio");
        std::string text;
        bridge.command("TEXT a 1 4772c3bcc39f6520f09fa7aa");
        require(bridge.takeText(text) && text == "Gr\xc3\xbc\xc3\x9f\x65 \xf0\x9f\xa7\xaa", "UTF8 text");
        bridge.command("TEXT a 1 6f6c64"); require(!bridge.takeText(text), "duplicate revision");
        bridge.command("TEXT a 2 ffzz"); require(!bridge.takeText(text), "bad text framing");
        bridge.command("TEXT a 2 " + std::string(8194,'0')); require(!bridge.takeText(text), "text cap");
        bridge.command("TEXT b 3 6f6c64"); require(!bridge.takeText(text), "wrong display owner");
        bridge.command("TEXT a 4 6e6577"); require(bridge.takeText(text) && text == "new", "next valid revision");
        std::cout << "11 preview-bridge checks passed\n";
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}

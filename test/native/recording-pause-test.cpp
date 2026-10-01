#include "../../native/recording-pause.h"
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <thread>
using namespace universal_dictate;
void require(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
int main() {
    try {
        CaptureGate gate; RecordingPause controls(gate);
        require(gate.enter(), "initial callback admission");
        require(controls.command("PAUSE 1"), "pause recognized");
        require(controls.poll().id == 0, "no pause acknowledgement while WAV callback is writing");
        require(gate.isBlocked() && !gate.enter(), "new callbacks refused while pausing");
        gate.leave(); auto ack = controls.poll();
        require(ack.id == 1 && ack.paused && gate.quiet(), "pause confirmed only at a quiet boundary");
        require(!gate.enter(), "paused capture blocked");
        require(controls.command("RESUME 2"), "resume recognized");
        ack=controls.poll(); require(ack.id==2 && !ack.paused && gate.enter(), "resume reopens callback admission");gate.leave();
        for (auto bad : {"PAUSE 0", "PAUSE -1", "PAUSE 2147483648", "PAUSE 3 extra", "RESUME 2", "PAUSE 1", "PAUSE 3x"}) {
            controls.command(bad);require(controls.poll().id==0,"invalid/stale request ignored");
        }
        require(!controls.command("STOP") && !controls.command("CANCEL"), "terminal commands remain separate");
        controls.command("PAUSE 3");controls.command("RESUME 4");ack=controls.poll();
        require(ack.id==4&&!ack.paused,"bounded latest-only mailbox");
        // Stress real producer/consumer ordering; after acknowledgement no writes may occur.
        std::atomic<bool> finished{false};std::atomic<unsigned int> frames{0};
        std::thread producer([&]{while(!finished.load(std::memory_order_acquire)){
            CaptureLease lease(gate);if(lease)frames.fetch_add(1,std::memory_order_relaxed);
            std::this_thread::yield();
        }});
        bool valid=true;
        for(unsigned int id=5;id<105;id+=2){
            gate.pause();while(!gate.quiet())std::this_thread::yield();
            const auto before=frames.load();std::this_thread::sleep_for(std::chrono::milliseconds(1));
            valid &= frames.load()==before;gate.resume();std::this_thread::yield();
        }
        finished.store(true,std::memory_order_release);producer.join();
        require(valid,"no writes after pause boundary under concurrent capture");
        std::cout << "Pause gate, acknowledgement, invalid request and 50 concurrent pause/resume cycles passed\n";
    } catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}

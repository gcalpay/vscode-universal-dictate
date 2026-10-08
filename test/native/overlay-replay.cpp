// Test-only replay shell. Uses the production callback, WAV writer, preview bridge,
// overlay, paints and recorder protocol, but never opens a microphone device.
// Two builds compare the frozen M1 recorder with the candidate on one runner.
#define main recorderMainNotUsedByReplay
#ifdef UD_REPLAY_BASELINE
#include "../../.deps/m1-baseline/native/record-audio.cpp"
#else
#include "../../native/record-audio.cpp"
#endif
#undef main
#include <psapi.h>
#include <fstream>
#include <stdexcept>
#pragma comment(lib, "psapi.lib")

namespace {
using Clock = std::chrono::steady_clock;
double ms(Clock::duration duration) { return std::chrono::duration<double, std::milli>(duration).count(); }
std::string argument(int argc, char** argv, std::string_view name) {
    for (int i=1; i+1<argc; ++i) if (std::string_view(argv[i])==name) return argv[i+1];
    throw std::runtime_error("missing replay argument");
}
std::vector<ma_int16> loadFixture(const std::string& path) {
    ma_decoder decoder{};
    auto config=ma_decoder_config_init(ma_format_s16,1,16000);
    if (ma_decoder_init_file(path.c_str(),&config,&decoder)!=MA_SUCCESS) throw std::runtime_error("fixture decode failed");
    ma_uint64 length=0;
    const auto lengthStatus=ma_decoder_get_length_in_pcm_frames(&decoder,&length);
    if (lengthStatus!=MA_SUCCESS || length==0 || length>16000*120) {
        ma_decoder_uninit(&decoder); throw std::runtime_error("fixture duration must be 0-120 seconds");
    }
    std::vector<ma_int16> result(static_cast<std::size_t>(length)); ma_uint64 count=0;
    const auto status=ma_decoder_read_pcm_frames(&decoder,result.data(),length,&count);
    ma_decoder_uninit(&decoder);
    if ((status!=MA_SUCCESS && status!=MA_AT_END) || count!=length) throw std::runtime_error("fixture truncated");
    return result;
}
double cpuMs() {
    FILETIME created{},exited{},kernel{},user{};
    if (!GetProcessTimes(GetCurrentProcess(),&created,&exited,&kernel,&user)) throw std::runtime_error("GetProcessTimes failed");
    const auto ticks=[](FILETIME t) { return (static_cast<std::uint64_t>(t.dwHighDateTime)<<32)|t.dwLowDateTime; };
    return static_cast<double>(ticks(kernel)+ticks(user))/10000.0;
}
PROCESS_MEMORY_COUNTERS_EX memory() {
    PROCESS_MEMORY_COUNTERS_EX result{}; result.cb=sizeof(result);
    if (!GetProcessMemoryInfo(GetCurrentProcess(),reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&result),sizeof(result)))
        throw std::runtime_error("GetProcessMemoryInfo failed");
    return result;
}
void distribution(std::ostream& out, std::vector<double> values) {
    if (values.empty()) { out<<"{\"samples\":0}"; return; }
    std::sort(values.begin(),values.end()); double sum=0; for (double x:values) sum+=x;
    const auto n=values.size();
    out<<"{\"samples\":"<<n<<",\"meanMs\":"<<sum/n<<",\"medianMs\":"
       <<(n%2?values[n/2]:(values[n/2-1]+values[n/2])/2)<<",\"p95Ms\":"
       <<values[static_cast<std::size_t>(std::ceil(.95*n))-1]<<",\"maxMs\":"<<values.back()<<"}";
}
void previewUpdate(universal_dictate::preview::Bridge* preview, CaptureState& capture, bool visible) {
    if (!preview) return;
    const auto response=preview->snapshot(visible,capture.gate.isBlocked()||g_overlay.pausePending);
    if (!response.empty()) std::cout<<response<<std::flush;
    std::string text;
    if (preview->takeText(text) && visible && !capture.gate.isBlocked() && !g_overlay.pausePending) {
        const int size=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),nullptr,0);
        if (size>0 && size<=2048) {
            std::wstring wide(static_cast<std::size_t>(size),L'\0');
            if (MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),wide.data(),size))
                g_overlay.previewText=std::move(wide);
        }
    }
}
}
int main(int argc,char** argv) {
#ifndef UD_REPLAY_BASELINE
    universal_dictate::configureRecorderCommandInput(std::cin);
#endif
    if (!hasFlag(argc,argv,"--allow-disposable-desktop")) {
        std::cerr<<"Replay requires explicit disposable desktop permission\n"; return 2;
    }
    try {
        const auto fixture=loadFixture(argument(argc,argv,"--fixture"));
        const auto reportPath=argument(argc,argv,"--metrics");
        const auto output=parseOutputPath(argc,argv);
        const bool visible=!hasFlag(argc,argv,"--no-overlay");
        const auto size=parseOverlaySize(argc,argv);
        const int span=parseWaveformTimeSpanMs(argc,argv);
        const auto memoryBefore=memory();
        Encoder encoder;
        if (output.empty() || encoder.open(output)!=MA_SUCCESS) throw std::runtime_error("replay output failed");
        std::unique_ptr<universal_dictate::preview::Bridge> preview;
        for (int i=1;visible && i+1<argc;++i) if (std::string_view(argv[i])=="--preview-session") {
            preview=std::make_unique<universal_dictate::preview::Bridge>(argv[i+1]); break;
        }
        CaptureState capture{&encoder}; capture.preview=preview.get();
        capture.enhancedBucketTargetFrames=universal_dictate::waveformBucketFrames(span);
#ifndef UD_REPLAY_BASELINE
        namespace vis=universal_dictate::visualization;
        const auto mode=vis::parseArgument(argc,argv);
        std::unique_ptr<vis::SpectralVisualizer> visualizer;
        if (visible && mode!=vis::Mode::Waveform) visualizer=std::make_unique<vis::SpectralVisualizer>(mode,span);
        capture.visualizer=visualizer.get();
#endif
        if (visible) {
            enableEnhancedOverlayDpiAwareness();
#ifdef UD_REPLAY_BASELINE
            const bool opened=createOverlay(nullptr,true,size,preview!=nullptr);
#else
            const bool opened=createOverlay(nullptr,true,size,preview!=nullptr,visualizer.get());
#endif
            if (!opened) throw std::runtime_error("replay overlay failed");
        }
        std::vector<double> callbacks,uiTicks,producerLateness;
        std::vector<double> paintTicks,previewTicks,analysisTicks,levelTicks;
        callbacks.reserve(fixture.size()/160+1); producerLateness.reserve(callbacks.capacity());
        uiTicks.reserve(2600);
        paintTicks.reserve(2600); previewTicks.reserve(2600);
        analysisTicks.reserve(2600); levelTicks.reserve(2600);
        std::atomic<RecorderCommand> command{RecorderCommand::Record};
        std::atomic<bool> finished{false};
        universal_dictate::RecordingPause pause(capture.gate);
        const auto begin=Clock::now(); const double cpuBegin=cpuMs();
        std::thread control([&] {
            // Same bounded FIFO commands as the production recorder.
            std::string line; char c=0; bool dropping=false;
            while (std::cin.get(c)) {
                if(c!='\n') { if(!dropping && line.size()<8448) line.push_back(c); else {line.clear();dropping=true;} continue; }
                if(dropping) {dropping=false;line.clear();continue;}
                if(!line.empty() && line.back()=='\r') line.pop_back();
                if(line=="STOP" || line=="CANCEL") {
                    command.store(line=="STOP"?RecorderCommand::Stop:RecorderCommand::Cancel,std::memory_order_release); return;
                }
                if(!pause.command(line) && preview) { try {preview->command(line);} catch (...) {} }
                line.clear();
            }
            command.store(RecorderCommand::Cancel,std::memory_order_release);
        });
        std::thread producer([&] {
            ma_device fake{}; fake.pUserData=&capture;
            const auto origin=Clock::now();
            for(std::size_t offset=0;offset<fixture.size() && command.load(std::memory_order_acquire)==RecorderCommand::Record;offset+=160) {
                const auto due=origin+std::chrono::microseconds((offset+160)*1000000ULL/16000);
                std::this_thread::sleep_until(due);
                const auto started=Clock::now();
                const auto count=static_cast<ma_uint32>(std::min<std::size_t>(160,fixture.size()-offset));
                captureCallback(&fake,nullptr,fixture.data()+offset,count);
                callbacks.push_back(ms(Clock::now()-started));
                producerLateness.push_back(std::max(0.0,ms(started-due)));
            }
            finished.store(true,std::memory_order_release);
        });
        std::cout<<"READY\n"<<std::flush;
        bool notified=false; int previousLevel=-1;
        while(command.load(std::memory_order_acquire)==RecorderCommand::Record && Clock::now()-begin<std::chrono::seconds(180)) {
            const auto tick=Clock::now();
            if(visible) pumpOverlayMessages();
            const auto afterPaint=Clock::now(); paintTicks.push_back(ms(afterPaint-tick));
            applyPauseAcknowledgement(pause.poll(),preview.get(),visible);
            previewUpdate(preview.get(),capture,visible);
            const auto afterPreview=Clock::now(); previewTicks.push_back(ms(afterPreview-afterPaint));
            const int level=capture.peakMilli.exchange(0,std::memory_order_relaxed);
            if(visible && !capture.gate.isBlocked()) updateOverlayLevel(level,&capture);
            const auto afterAnalysis=Clock::now(); analysisTicks.push_back(ms(afterAnalysis-afterPreview));
            if(level!=previousLevel) { std::printf("LEVEL %.3f\n",level/1000.0); std::fflush(stdout); previousLevel=level; }
            levelTicks.push_back(ms(Clock::now()-afterAnalysis));
            uiTicks.push_back(ms(Clock::now()-tick)); // Includes previous WM_PAINT and current analysis/IPC; excludes sleep.
            if(!notified && finished.load(std::memory_order_acquire)) { notified=true;std::cout<<"REPLAY_END\n"<<std::flush; }
            std::this_thread::sleep_for(kLevelInterval);
        }
        if(command.load()==RecorderCommand::Record) command.store(RecorderCommand::Cancel);
        producer.join();
        if(control.joinable()) { CancelSynchronousIo(control.native_handle()); control.join(); }
        const double wall=ms(Clock::now()-begin),cpu=cpuMs()-cpuBegin;
        const auto activeMemory=memory();
        const auto gdiActive=GetGuiResources(GetCurrentProcess(),GR_GDIOBJECTS);
        const auto dropped=
#ifdef UD_REPLAY_BASELINE
            std::uint64_t{0};
        const auto storage=std::size_t{0};
#else
            visualizer?visualizer->droppedFrames():0;
        const auto storage=visualizer?visualizer->storageBytes():0;
#endif
        const auto queueHighWater=
#ifdef UD_REPLAY_BASELINE
            std::size_t{0};
#else
            visualizer?visualizer->queueHighWaterFrames():0;
#endif
        destroyOverlay(); encoder.close();
        const auto gdiAfter=GetGuiResources(GetCurrentProcess(),GR_GDIOBJECTS);
        std::ofstream out(reportPath);
        out<<"{\"syntheticCapture\":true,\"fixtureFrames\":"<<fixture.size()<<",\"completedReplay\":"<<(notified?"true":"false")
           <<",\"recordingWallMs\":"<<wall<<",\"recorderCpuMs\":"<<cpu<<",\"recorderCpuOneCorePercent\":"<<cpu/wall*100
           <<",\"workingSetBeforeBytes\":"<<memoryBefore.WorkingSetSize<<",\"workingSetActiveBytes\":"<<activeMemory.WorkingSetSize
           <<",\"peakWorkingSetBytes\":"<<activeMemory.PeakWorkingSetSize<<",\"privateCommitBytes\":"<<activeMemory.PrivateUsage
           <<",\"gdiActive\":"<<gdiActive<<",\"gdiAfterClose\":"<<gdiAfter<<",\"visualDroppedFrames\":"<<dropped<<",\"analyzerStorageBytes\":"<<storage
           <<",\"callback\":"; distribution(out,callbacks);out<<",\"uiTick\":";distribution(out,uiTicks);
        out<<",\"producerLateness\":";distribution(out,producerLateness);
        out<<",\"paint\":";distribution(out,paintTicks);
        out<<",\"previewIpc\":";distribution(out,previewTicks);
        out<<",\"analysis\":";distribution(out,analysisTicks);
        out<<",\"levelOutput\":";distribution(out,levelTicks);
        out<<",\"visualQueueHighWaterFrames\":"<<queueHighWater<<"}\n";out.close();
        if(!out) throw std::runtime_error("metrics write failed");
        if(command.load()==RecorderCommand::Cancel) {removeFile(output);std::cout<<"CANCELLED\n";}
        else std::cout<<"STOPPED "<<output<<'\n';
        return notified?0:1;
    } catch(const std::exception& e) {
        destroyOverlay(); std::cerr<<"Replay failed: "<<e.what()<<'\n'; return 1;
    }
}

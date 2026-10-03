// Exercise the production callback/encoder with synthetic PCM, never a microphone.
#define main production_recorder_main
#include "../../native/record-audio.cpp"
#undef main
#include <stdexcept>
#include <vector>

namespace {
void requireCapture(bool value,const char* message){if(!value)throw std::runtime_error(message);}
void feed(CaptureState& state, ma_int16 sample, ma_uint32 frames=1600){
    const std::vector<ma_int16> pcm(frames,sample);ma_device fake{};fake.pUserData=&state;
    captureCallback(&fake,nullptr,pcm.data(),frames);
}
std::vector<ma_int16> readPcm(const std::string& path){
    ma_decoder decoder{};auto config=ma_decoder_config_init(ma_format_s16,1,16000);
    requireCapture(ma_decoder_init_file(path.c_str(),&config,&decoder)==MA_SUCCESS,"decode synthetic output");
    std::vector<ma_int16> result(10000);ma_uint64 read=0;
    const auto status=ma_decoder_read_pcm_frames(&decoder,result.data(),result.size(),&read);
    ma_decoder_uninit(&decoder);
    requireCapture(status==MA_SUCCESS||status==MA_AT_END,"read synthetic output");result.resize(static_cast<std::size_t>(read));return result;
}
// Verify the production callback uses RMS rather than an early-saturating peak,
// without altering either WAV samples or the independently published raw peak.
void verifyWaveform(const std::filesystem::path& path){
    for(int span : {1000,3000,5000,10000,20000}){
        Encoder encoder;requireCapture(encoder.open(path.string())==MA_SUCCESS,"waveform encoder");
        CaptureState state{&encoder};state.enhancedHistoryPoints=universal_dictate::waveformHistoryPoints(span);
        const auto frames=universal_dictate::kWaveformFramesPerPoint;
        int previous=0;std::vector<ma_int16> expected;
        for(ma_int16 sample : {128,819,5243}){
            feed(state,sample,frames);expected.insert(expected.end(),frames,sample);
            std::array<universal_dictate::WaveformRange,1> latest{};
            requireCapture(state.enhancedHistory.snapshot(latest),"latest visual range");
            const int level=latest[0].magnitude();
            requireCapture(level>previous&&level<950,"capture waveform lacks RMS headroom");previous=level;
            requireCapture(state.peakMilli.load()==sample*1000/32767,"visualization changed raw peak reporting");
        }
        const auto before=state.enhancedHistory.written();state.gate.pause();
        feed(state,32767,frames*3);requireCapture(state.enhancedHistory.written()==before,"paused signal changed waveform");
        state.gate.resume();feed(state,128,frames);expected.insert(expected.end(),frames,128);
        std::array<universal_dictate::WaveformRange,4> recent{};
        requireCapture(state.enhancedHistory.snapshot(recent),"resumed visual ranges");
        requireCapture(recent[3]==recent[0],"loud input renormalized later quiet input");
        encoder.close();requireCapture(readPcm(path.string())==expected,"visualization changed accepted WAV samples");
    }
}
void verifyFineCapture(const std::filesystem::path& path){
    Encoder encoder; requireCapture(encoder.open(path.string())==MA_SUCCESS,"fine encoder");
    CaptureState capture{&encoder};
    feed(capture,0,128); feed(capture,819,32); feed(capture,-819,32); feed(capture,0,16000-192);
    requireCapture(capture.enhancedHistory.written()==250,"one-second production count must be 250 at ten-second history");
    snapshotEnhancedSignal(capture);
    requireCapture(g_overlay.enhancedHistoryPoints==2500,"ten-second history capacity");
    const auto event=g_overlay.enhancedSignalHistory[2252];
    requireCapture(event.above>0&&event.below==event.above,"production callback lost bipolar 4ms event");
    requireCapture(g_overlay.enhancedSignalHistory[2251].magnitude()==0&&g_overlay.enhancedSignalHistory[2253].magnitude()==0,"temporal event smeared");
    const auto before=g_overlay.enhancedSignalHistory;
    capture.gate.pause(); feed(capture,32767,16000); snapshotEnhancedSignal(capture);
    requireCapture(g_overlay.enhancedSignalHistory==before,"paused detailed waveform changed");
    encoder.close();
}
// Uses the actual CoreRecorderSession pipe arguments for the Node integration test.
int syntheticRecorder(const std::string& output){
    Encoder encoder;requireCapture(encoder.open(output)==MA_SUCCESS,"synthetic encoder");
    CaptureState capture{&encoder};universal_dictate::RecordingPause pause(capture.gate);feed(capture,1111);
    std::cout<<"READY\n"<<std::flush;
    std::string line;bool cancel=false;
    while(std::getline(std::cin,line)){
        if(!line.empty()&&line.back()=='\r')line.pop_back();
        if(line=="STOP"||line=="CANCEL"){cancel=line=="CANCEL";break;}
        if(line.size()>128)throw std::runtime_error("unbounded synthetic command");
        if(pause.command(line)){
            const auto ack=pause.poll();
            if(ack.id){feed(capture,ack.paused?9999:-2222);
                std::cout<<(ack.paused?"PAUSED ":"RESUMED ")<<ack.id<<'\n'<<std::flush;}
        }
    }
    encoder.close();if(cancel)removeFile(output);
    std::cout<<(cancel?"CANCELLED\n":"STOPPED "+output+"\n")<<std::flush;return 0;
}
}
int main(int argc,char** argv){
    try{
        const auto output=parseOutputPath(argc,argv);
        if(!output.empty())return syntheticRecorder(output);
        const auto path=std::filesystem::temp_directory_path()/("ud-pause-capture-"+std::to_string(GetCurrentProcessId())+".wav");
        struct Cleanup{std::filesystem::path path;~Cleanup(){std::error_code error;std::filesystem::remove(path,error);}}cleanup{path};
        Encoder encoder;requireCapture(encoder.open(path.string())==MA_SUCCESS,"encoder open");
        CaptureState state{&encoder};universal_dictate::preview::Bridge preview("synthetic");state.preview=&preview;
        universal_dictate::RecordingPause pause(state.gate);feed(state,1111);
        const auto waveBefore=state.enhancedHistory.written();
        pause.command("PAUSE 1");requireCapture(pause.poll().paused,"pause confirmed");
        feed(state,9999,16000*20); // A long thinking pause must add neither zeros nor speech.
        universal_dictate::preview::Snapshot snapshot;requireCapture(preview.audio.copy(snapshot),"paused preview copy");
        requireCapture(snapshot.end==1600&&snapshot.pcm.size()==1600,"paused PCM excluded from preview");
        requireCapture(state.enhancedHistory.written()==waveBefore,"waveform freezes");
        pause.command("RESUME 2");requireCapture(pause.poll().id==2,"resume confirmed");feed(state,-2222);
        pause.command("PAUSE 3");requireCapture(pause.poll().paused,"second pause");feed(state,9999);
        encoder.close(); // Stop while paused is a normal final WAV, no implicit Resume.
        const auto pcm=readPcm(path.string());requireCapture(pcm.size()==3200,"WAV contains only active frames");
        requireCapture(std::all_of(pcm.begin(),pcm.begin()+1600,[](auto x){return x==1111;}),"first speech retained");
        requireCapture(std::all_of(pcm.begin()+1600,pcm.end(),[](auto x){return x==-2222;}),"resumed speech retained; paused sentinel absent");
        char name[]="test";char* args[]{name};requireCapture(parseWaveformTimeSpanMs(1,args)==10000,"native ten-second default");
        requireCapture(parseOverlaySize(1,args)==OverlaySize::Medium,"native Medium overlay default");
        verifyWaveform(path);
        verifyFineCapture(path);
        std::cout<<"Production WAV/preview/waveform pause and five-span RMS checks passed; synthetic PCM, no microphone\n";return 0;
    }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}

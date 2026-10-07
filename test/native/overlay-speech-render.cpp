// Scripted production-renderer images from synthetic speech, not microphone input.
#define main recorderMainNotUsedBySpeechRender
#include "../../native/record-audio.cpp"
#undef main
#include <fstream>
#include <stdexcept>
namespace vis=universal_dictate::visualization;
namespace {
void requireImage(bool ok) { if(!ok) throw std::runtime_error("speech-render operation failed"); }
void saveImage(const std::filesystem::path& path) {
    RECT bounds{};GetClientRect(g_overlay.window,&bounds);
    BITMAPINFO info{};info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth=bounds.right;info.bmiHeader.biHeight=-bounds.bottom;
    info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;
    HDC dc=CreateCompatibleDC(nullptr);void* pixels=nullptr;
    HBITMAP bitmap=CreateDIBSection(dc,&info,DIB_RGB_COLORS,&pixels,nullptr,0);
    if(!dc || !bitmap || !pixels) {if(bitmap)DeleteObject(bitmap);if(dc)DeleteDC(dc);requireImage(false);}
    const auto previous=SelectObject(dc,bitmap);
    drawEnhancedOverlay(dc,bounds);GdiFlush();
    BITMAPFILEHEADER header{};header.bfType=0x4d42;header.bfOffBits=sizeof(header)+sizeof(BITMAPINFOHEADER);
    const auto bytes=static_cast<DWORD>(bounds.right*bounds.bottom*4);header.bfSize=header.bfOffBits+bytes;
    std::ofstream file(path,std::ios::binary);
    file.write(reinterpret_cast<const char*>(&header),sizeof(header));
    file.write(reinterpret_cast<const char*>(&info.bmiHeader),sizeof(BITMAPINFOHEADER));
    file.write(static_cast<const char*>(pixels),bytes);const bool good=file.good();
    SelectObject(dc,previous);DeleteObject(bitmap);DeleteDC(dc);requireImage(good);
}
}
int main(int argc,char** argv) {
    if(argc!=4 || std::string_view(argv[1])!="--allow-disposable-desktop") return 2;
    try {
        ma_decoder decoder{};auto format=ma_decoder_config_init(ma_format_s16,1,16000);
        requireImage(ma_decoder_init_file(argv[2],&format,&decoder)==MA_SUCCESS);
        std::vector<ma_int16> pcm(12*16000);ma_uint64 count=0;
        const auto status=ma_decoder_read_pcm_frames(&decoder,pcm.data(),pcm.size(),&count);ma_decoder_uninit(&decoder);
        requireImage((status==MA_SUCCESS || status==MA_AT_END) && count==pcm.size());
        const std::filesystem::path output(argv[3]);std::filesystem::create_directories(output);
        for(const auto mode:{vis::Mode::Waveform,vis::Mode::LogFrequencyPowerSpectrogram,
                vis::Mode::LinearFrequencyPowerSpectrogram,vis::Mode::ConstantQPowerSpectrogram,vis::Mode::CircularSpectrum}) {
            CaptureState capture{};
            std::unique_ptr<vis::SpectralVisualizer> visualizer;
            if(mode!=vis::Mode::Waveform) visualizer=std::make_unique<vis::SpectralVisualizer>(mode,10000);
            for(std::size_t offset=0;offset<pcm.size();offset+=800) {
                if(visualizer) {visualizer->push(pcm.data()+offset,800);visualizer->update();}
                else for(std::size_t i=offset;i<offset+800;++i)
                    if(const auto level=capture.enhancedBucket.push(pcm[i],capture.enhancedBucketTargetFrames)) capture.enhancedHistory.publish(*level);
            }
            for(const bool preview:{false,true}) {
                requireImage(createOverlay(nullptr,true,OverlaySize::Medium,preview,visualizer.get()));
                if(!visualizer) snapshotEnhancedSignal(capture);
                g_overlay.previewText=L"The pump pressure is five bar.";
                saveImage(output/("speech-"+std::to_string(static_cast<int>(mode))+(preview?"-preview.bmp":"-off.bmp")));
                destroyOverlay();
            }
        }
        std::cout<<"10 scripted production-renderer speech snapshots saved\n";return 0;
    } catch(const std::exception& e) {destroyOverlay();std::cerr<<e.what()<<'\n';return 1;}
}

// Production Win32 renderer/callback; synthetic PCM only. No microphone, model,
// clipboard or external input. Run only on an explicitly allowed disposable desktop.
#define main recorderMainNotCalledBySpectralTest
#include "../../native/record-audio.cpp"
#undef main
#include <fstream>
#include <stdexcept>
#include <vector>

namespace vis = universal_dictate::visualization;
namespace {
void verify(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
constexpr std::uint32_t sentinelColor = 0x00335577U;
class SpectralCanvas {
public:
    SpectralCanvas(int width, int height) : width(width), height(height), dc(CreateCompatibleDC(nullptr)) {
        BITMAPINFO info{}; info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        info.bmiHeader.biWidth = width; info.bmiHeader.biHeight = -height;
        info.bmiHeader.biPlanes = 1; info.bmiHeader.biBitCount = 32; info.bmiHeader.biCompression = BI_RGB;
        bitmap = CreateDIBSection(dc, &info, DIB_RGB_COLORS, reinterpret_cast<void**>(&pixels), nullptr, 0);
        if (!dc || !bitmap || !pixels) {
            if (bitmap) DeleteObject(bitmap);
            if (dc) DeleteDC(dc);
            throw std::runtime_error("spectral canvas allocation failed");
        }
        previous = SelectObject(dc, bitmap);
        std::fill(pixels, pixels + width * height, sentinelColor);
    }
    ~SpectralCanvas() {
        SelectObject(dc, previous); DeleteObject(bitmap); DeleteDC(dc);
    }
    SpectralCanvas(const SpectralCanvas&) = delete;
    SpectralCanvas& operator=(const SpectralCanvas&) = delete;
    std::vector<std::uint32_t> snapshot() const { GdiFlush(); return {pixels, pixels + width * height}; }
    void save(const std::filesystem::path& path) const {
        GdiFlush(); BITMAPFILEHEADER file{}; BITMAPINFOHEADER info{};
        info.biSize = sizeof(info); info.biWidth = width; info.biHeight = -height;
        info.biPlanes = 1; info.biBitCount = 32; info.biCompression = BI_RGB;
        file.bfType = 0x4D42; file.bfOffBits = sizeof(file) + sizeof(info); file.bfSize = file.bfOffBits + width * height * 4;
        std::ofstream out(path, std::ios::binary);
        out.write(reinterpret_cast<const char*>(&file), sizeof(file));
        out.write(reinterpret_cast<const char*>(&info), sizeof(info));
        out.write(reinterpret_cast<const char*>(pixels), width * height * 4);
        verify(out.good(), "spectral image write failed");
    }
    const int width, height;
    HDC dc = nullptr;
private:
    HBITMAP bitmap = nullptr;
    HGDIOBJ previous = nullptr;
    std::uint32_t* pixels = nullptr;
};

std::vector<std::int16_t> syntheticAudio(std::size_t length, double hz) {
    std::vector<std::int16_t> audio(length);
    for (std::size_t i = 0; i < length; ++i) {
        const double t = static_cast<double>(i) / vis::kSampleRate;
        audio[i] = static_cast<std::int16_t>(std::lround(2000 * (0.6 + 0.4 * std::sin(2*vis::kPi*3*t)) *
            (std::sin(2*vis::kPi*hz*t) + 0.3*std::sin(2*vis::kPi*3*hz*t))));
    }
    return audio;
}
void productionFeed(CaptureState& capture, std::span<const std::int16_t> audio) {
    ma_device fake{}; fake.pUserData = &capture;
    for (std::size_t offset = 0; offset < audio.size(); offset += 800) {
        const auto count = static_cast<ma_uint32>(std::min<std::size_t>(800, audio.size()-offset));
        captureCallback(&fake, nullptr, audio.data()+offset, count);
        if (capture.visualizer && !capture.gate.isBlocked()) capture.visualizer->update();
    }
}
std::vector<std::int16_t> readWav(const std::filesystem::path& path) {
    ma_decoder decoder{}; auto config = ma_decoder_config_init(ma_format_s16, 1, 16000);
    verify(ma_decoder_init_file(path.string().c_str(), &config, &decoder) == MA_SUCCESS, "WAV decoder init");
    std::vector<std::int16_t> pcm(64000); ma_uint64 count = 0;
    const auto result = ma_decoder_read_pcm_frames(&decoder, pcm.data(), pcm.size(), &count);
    ma_decoder_uninit(&decoder);
    verify(result == MA_SUCCESS || result == MA_AT_END, "WAV decode");
    pcm.resize(static_cast<std::size_t>(count)); return pcm;
}

void captureCase(vis::Mode mode, bool previewEnabled, const std::filesystem::path& output) {
    const auto filename = output / ("capture-" + std::to_string(static_cast<int>(mode)) + (previewEnabled ? "-preview.wav" : "-off.wav"));
    Encoder encoder; verify(encoder.open(filename.string()) == MA_SUCCESS, "synthetic encoder init");
    std::unique_ptr<vis::SpectralVisualizer> visualizer;
    if (mode != vis::Mode::Waveform) visualizer = std::make_unique<vis::SpectralVisualizer>(mode,1000);
    std::unique_ptr<universal_dictate::preview::Bridge> preview;
    if (previewEnabled) preview = std::make_unique<universal_dictate::preview::Bridge>("spectral-test");
    CaptureState capture{&encoder}; capture.visualizer = visualizer.get(); capture.preview = preview.get();
    universal_dictate::RecordingPause pause(capture.gate);
    const auto first = syntheticAudio(16113, 187.5), second = syntheticAudio(16100, 625);
    const std::vector<std::int16_t> excluded(16000,30000);
    productionFeed(capture,first);
    const auto waveCount = capture.enhancedHistory.written();
    const auto spectralCount = visualizer ? visualizer->receivedFrames() : 0;
    const auto revision = visualizer ? visualizer->revision() : 0;
    const auto rawLevel = capture.peakMilli.load();
    verify(pause.command("PAUSE 1"), "pause request"); verify(pause.poll().paused, "pause acknowledgement");
    productionFeed(capture,excluded);
    verify(capture.enhancedHistory.written() == waveCount, "paused audio changed waveform");
    verify(capture.peakMilli.load() == rawLevel, "paused audio changed status-bar peak");
    if (visualizer) verify(visualizer->receivedFrames() == spectralCount && visualizer->revision() == revision, "paused audio entered spectral state");
    if (preview) {
        universal_dictate::preview::Snapshot snapshot;
        verify(preview->audio.copy(snapshot) && snapshot.pcm == first && snapshot.end == first.size(), "spectral mode disturbed preview audio");
    }
    verify(pause.command("RESUME 2"), "resume request"); verify(pause.poll().id == 2, "resume acknowledgement");
    productionFeed(capture,second);
    verify(pause.command("PAUSE 3"), "paused Stop setup"); verify(pause.poll().paused, "paused Stop confirmed");
    encoder.close(); // Stop while paused must not implicitly resume or append silence.
    auto expected = first; expected.insert(expected.end(), second.begin(), second.end());
    verify(readWav(filename) == expected, "spectral visualization modified full accepted WAV");
    if (visualizer) {
        auto reference = std::make_unique<vis::SpectralVisualizer>(mode,1000);
        for (std::size_t offset = 0; offset < expected.size(); offset += 800) {
            reference->push(expected.data()+offset, std::min<std::size_t>(800,expected.size()-offset)); reference->update();
        }
        verify(visualizer->receivedFrames() == expected.size(), "accepted spectral frame count");
        verify(visualizer->latest() == reference->latest(), "production spectrum differs from admitted PCM");
    }
    std::filesystem::remove(filename); // No fixture audio in the renderer artifact or VSIX.
}

void verifyVisualizationViewport(const SpectralCanvas& canvas, const RECT& viewport) {
    const auto pixels = canvas.snapshot(); bool painted=false;
    for (int y=0;y<canvas.height;++y) for (int x=0;x<canvas.width;++x) {
        const auto pixel = pixels[static_cast<std::size_t>(y)*canvas.width+x] & 0x00ffffffU;
        if (x<viewport.left || x>=viewport.right || y<viewport.top || y>=viewport.bottom)
            verify(pixel == sentinelColor,"spectral renderer escaped its viewport");
        else if (pixel != sentinelColor && pixel != 0x000e121bU) painted=true;
    }
    verify(painted, "selected renderer produced no signal pixels");
}

void renderCase(vis::Mode mode, OverlaySize size, unsigned dpi, bool previewEnabled,
                const std::filesystem::path& output) {
    std::unique_ptr<vis::SpectralVisualizer> visualizer;
    if (mode != vis::Mode::Waveform) {
        visualizer = std::make_unique<vis::SpectralVisualizer>(mode,1000);
        auto audio = syntheticAudio(32000,250);
        for (std::size_t i=0; i<audio.size(); i+=800) { visualizer->push(audio.data()+i,800); visualizer->update(); }
    }
    const HWND foreground = GetForegroundWindow();
    verify(createOverlay(nullptr,true,size,previewEnabled,visualizer.get()), "production overlay creation");
    struct OverlayCleanup { ~OverlayCleanup() { destroyOverlay(); } } cleanup;
    verify(GetForegroundWindow() == foreground, "spectral overlay activated foreground");
    applyEnhancedDpi(dpi);
    const auto layout = calculateEnhancedOverlayLayout(size,dpi,previewEnabled);
    const RECT suggested{80,200,80+layout.width,200+layout.height};
    SendMessageW(g_overlay.window,WM_DPICHANGED,MAKELONG(dpi,dpi),reinterpret_cast<LPARAM>(&suggested));
    RECT client{}; GetClientRect(g_overlay.window,&client);
    verify(client.right == layout.width && client.bottom == layout.height, "spectral mode changed overlay dimensions");
    g_overlay.previewText = L"Lokale Vorschau. 压力五巴. Provisional text.";
    if (!visualizer) for (std::size_t i=0;i<g_overlay.enhancedSignalHistory.size();++i)
        g_overlay.enhancedSignalHistory[i] = universal_dictate::visualPeakSample(static_cast<int>(1300*std::sin(i*0.31)));
    const auto rect = previewEnabled ? universal_dictate::preview::calculateTextLayout(size,dpi).waveform : layout.waveform;
    SpectralCanvas guard(layout.width,layout.height);
    drawEnhancedVisualization(guard.dc);
    verifyVisualizationViewport(guard,rect);
    SpectralCanvas canvas(layout.width,layout.height);
    drawEnhancedOverlay(canvas.dc,client);
    const auto original = canvas.snapshot();
    drawEnhancedOverlay(canvas.dc,client);
    const auto again = canvas.snapshot();
    for (std::size_t i = 0; i < original.size(); ++i)
        verify((again[i] & 0x00ffffffU) == (original[i] & 0x00ffffffU), "unchanged audio repainted differently");
    const auto prefix=std::to_string(static_cast<int>(mode))+"-"+std::to_string(static_cast<int>(size))+"-"+std::to_string(dpi)+(previewEnabled?"-preview":"-off");
    canvas.save(output/(prefix+".bmp"));
    g_overlay.paused=true;
    drawEnhancedOverlay(canvas.dc,client);
    const auto paused=canvas.snapshot();
    for(int y=rect.top;y<rect.bottom;++y) for(int x=rect.left;x<rect.right;++x) {
        const auto i=static_cast<std::size_t>(y)*layout.width+x;
        verify((paused[i] & 0x00ffffffU) == (original[i] & 0x00ffffffU), "pause changed visualization pixels");
    }
    RECT pausedClient{}; GetClientRect(g_overlay.window,&pausedClient);
    verify(pausedClient.right==client.right && pausedClient.bottom==client.bottom,"pause resized overlay");
    canvas.save(output/(prefix+"-paused.bmp"));
}
}
int main(int argc,char** argv) {
    if (argc != 3 || std::string_view(argv[1]) != "--allow-disposable-desktop") {
        std::cerr << "Requires --allow-disposable-desktop <artifact-directory>\n"; return 2;
    }
    try {
        const std::filesystem::path output(argv[2]); std::filesystem::create_directories(output);
        unsigned captures=0, renders=0;
        for (const auto mode : {vis::Mode::Waveform,vis::Mode::LogFrequencyPowerSpectrogram,
                vis::Mode::LinearFrequencyPowerSpectrogram,vis::Mode::ConstantQPowerSpectrogram,vis::Mode::CircularSpectrum}) {
            for (const bool preview : {false,true}) { captureCase(mode,preview,output); ++captures; }
            for (const auto size : {OverlaySize::Small,OverlaySize::Medium,OverlaySize::Large})
                for (const unsigned dpi : {96U,120U,144U,192U})
                    for (const bool preview : {false,true}) { renderCase(mode,size,dpi,preview,output); ++renders; }
        }
        std::cout << captures << " production PCM/pause/preview cases and " << renders
                  << " native rendering layouts passed; no microphone or VS Code acceptance implied\n";
        return 0;
    } catch (const std::exception& error) {
        destroyOverlay(); std::cerr << "Spectral Windows regression: " << error.what() << '\n'; return 1;
    }
}

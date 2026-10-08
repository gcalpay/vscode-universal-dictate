// Disposable Windows runner only. No microphone/model/clipboard; real clicks are
// restricted to this process's own scratch overlay. Not a VS Code/Codex test.
#define main recorderMainNotCalledByPresentationTest
#include "../../native/record-audio.cpp"
#undef main
#include <fstream>
#include <stdexcept>
#include <vector>

namespace {
void check(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

class Canvas {
public:
    Canvas(int width, int height) : width(width), height(height) {
        dc = CreateCompatibleDC(nullptr);
        BITMAPINFO info{};
        info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        info.bmiHeader.biWidth = width;
        info.bmiHeader.biHeight = -height;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        bitmap = CreateDIBSection(dc, &info, DIB_RGB_COLORS, reinterpret_cast<void**>(&pixels), nullptr, 0);
        check(dc && bitmap && pixels, "presentation DIB allocation");
        previous = SelectObject(dc, bitmap);
        std::fill(pixels, pixels + width * height, 0x00335577U);
    }
    ~Canvas() {
        if (dc && previous) SelectObject(dc, previous);
        if (bitmap) DeleteObject(bitmap);
        if (dc) DeleteDC(dc);
    }
    std::vector<std::uint32_t> snapshot() const {
        GdiFlush();
        return {pixels, pixels + width * height};
    }
    void save(const std::filesystem::path& path) const {
        GdiFlush();
        BITMAPFILEHEADER file{};
        BITMAPINFOHEADER info{};
        info.biSize = sizeof(info); info.biWidth = width; info.biHeight = -height;
        info.biPlanes = 1; info.biBitCount = 32; info.biCompression = BI_RGB;
        file.bfType = 0x4D42; file.bfOffBits = sizeof(file) + sizeof(info);
        file.bfSize = file.bfOffBits + width * height * 4;
        std::ofstream output(path, std::ios::binary);
        output.write(reinterpret_cast<const char*>(&file), sizeof(file));
        output.write(reinterpret_cast<const char*>(&info), sizeof(info));
        output.write(reinterpret_cast<const char*>(pixels), width * height * 4);
        check(output.good(), "presentation bitmap write");
    }
    const int width, height;
    HDC dc = nullptr;
    HBITMAP bitmap = nullptr;
    std::uint32_t* pixels = nullptr;
private:
    HGDIOBJ previous = nullptr;
};

bool inside(int x, int y, const OverlayRect& r) {
    return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
}
void pumpFor(DWORD milliseconds) {
    const auto end = GetTickCount64() + milliseconds;
    do { pumpOverlayMessages(); Sleep(5); } while (GetTickCount64() < end);
}
void clickOwnRect(HWND window, const OverlayRect& rect) {
    POINT point{(rect.left + rect.right)/2, (rect.top + rect.bottom)/2};
    check(ClientToScreen(window, &point) != 0, "own overlay coordinates");
    check(WindowFromPoint(point) == window, "refuse click outside own overlay");
    check(SetCursorPos(point.x, point.y) != 0, "disposable pointer movement");
    INPUT input[2]{};
    input[0].type = input[1].type = INPUT_MOUSE;
    input[0].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
    input[1].mi.dwFlags = MOUSEEVENTF_LEFTUP;
    check(SendInput(2, input, sizeof(INPUT)) == 2, "own overlay click submission");
    pumpFor(120);
}
void checkFocus(HWND scratch, HWND edit) {
    check(GetForegroundWindow() == scratch && GetFocus() == edit, "overlay stole foreground/keyboard focus");
    DWORD start = 0, end = 0;
    SendMessageW(edit, EM_GETSEL, reinterpret_cast<WPARAM>(&start), reinterpret_cast<LPARAM>(&end));
    check(start == 2 && end == 5, "overlay changed scratch selection");
}

universal_dictate::EnhancedOverlayLayout configurePresentation(OverlaySize size, unsigned int dpi, bool preview) {
    g_overlay.previewEnabled = preview;
    applyEnhancedDpi(dpi);
    const auto layout = calculateEnhancedOverlayLayout(size, dpi, preview);
    const RECT suggested{70, 220, 70 + layout.width, 220 + layout.height};
    SendMessageW(g_overlay.window, WM_DPICHANGED, MAKELONG(dpi,dpi), reinterpret_cast<LPARAM>(&suggested));
    RECT client{}; GetClientRect(g_overlay.window, &client);
    check(client.right == layout.width && client.bottom == layout.height, "DPI/preview window bounds");
    return layout;
}

void renderCases(const std::filesystem::path& output, OverlaySize size, unsigned int dpi, unsigned int& count) {
    const auto prefix = std::to_string(static_cast<int>(size)) + "-" + std::to_string(dpi);
    {
        const auto off = configurePresentation(size, dpi, false);
        Canvas canvas(off.width, off.height);
        RECT client{0, 0, off.width, off.height};
        g_overlay.previewRenderer.reset();
        drawEnhancedOverlay(canvas.dc, client);
        check(!g_overlay.previewRenderer.initialized(), "Off initialized preview renderer");
        canvas.save(output / (prefix + "-off.bmp"));
    }
    const auto normal = configurePresentation(size, dpi, true);
    const auto preview = universal_dictate::preview::calculateTextLayout(size, dpi);
    const RECT client{0, 0, normal.width, normal.height};
    const std::wstring samples[] = {
        L"", L"Ich gehe nach Hause. Der Druck ist fünf bar & die Temperatur zwanzig Grad.",
        L"هذا نص تجريبي باللغة العربية. الضغط خمسة بار ودرجة الحرارة عشرون درجة.",
        L"这是本地语音识别的临时预览。水温为二十度，压力为五巴。これはプレビューです。",
        L"Grüße a\u0308 e\u0301 👨‍👩‍👧‍👦 👍🏽 🇩🇪 🧪 नमस्ते दुनिया — provisional words only.",
        std::wstring(500, L'W') + L" END latest words"
    };
    Canvas canvas(normal.width, normal.height);
    std::vector<std::uint32_t> baseline;
    for (unsigned int i = 0; i < std::size(samples); ++i) {
        g_overlay.previewText = samples[i];
        drawEnhancedOverlay(canvas.dc, client);
        // Exercise the same renderer explicitly so draw failures cannot be hidden
        // by the production fallback label in a passing screenshot test.
        check(g_overlay.previewRenderer.draw(canvas.dc, preview, samples[i].empty() ? L"Listening…" : samples[i]), "DirectWrite preview rendering failed");
        check(g_overlay.previewRenderer.visibleLines() >= 1 && g_overlay.previewRenderer.visibleLines() <= preview.maxLines, "complete line limit");
        if (size == OverlaySize::Medium && i == 1)
            check(g_overlay.previewRenderer.visibleLines() == 2, "Medium must fit both German lines at every tested DPI");
        if (i == std::size(samples) - 1) check(g_overlay.previewRenderer.skippedLines() > 0, "long preview did not scroll to recent text");
        const auto current = canvas.snapshot();
        if (baseline.empty()) baseline = current;
        for (int y=0; y<normal.height; ++y) for (int x=0; x<normal.width; ++x) {
            if (!inside(x,y,preview.text) && !inside(x,y,preview.label))
                check((current[y*normal.width+x] & 0x00ffffff) == (baseline[y*normal.width+x] & 0x00ffffff), "preview escaped its bounds or changed buttons");
        }
        drawEnhancedOverlay(canvas.dc, client);
        const auto again = canvas.snapshot();
        for (std::size_t p=0; p<again.size(); ++p)
            check((again[p] & 0x00ffffff) == (current[p] & 0x00ffffff), "cached repaint changed pixels");
        canvas.save(output / (prefix + "-" + std::to_string(i) + ".bmp"));
        ++count;
    }
    // Hidden-line descenders and fallback glyph overhang must not leak into the
    // visible suffix. Use enough explicit lines to exceed every preset.
    Canvas hidden(normal.width, normal.height), suffix(normal.width, normal.height);
    const std::wstring tail = L"TAIL";
    const std::wstring full = L"Hidden gjpqy 👨‍👩‍👧‍👦 नमस्ते\nHidden gjpqy\nHidden gjpqy\n" + tail;
    const auto oneLine = [&]() { auto result = preview; result.maxLines = 1; return result; }();
    check(g_overlay.previewRenderer.draw(hidden.dc, oneLine, full), "hidden-line regression draw");
    check(g_overlay.previewRenderer.skippedLines() > 0, "hidden-line fixture must truncate");
    check(g_overlay.previewRenderer.draw(suffix.dc, oneLine, tail), "suffix-only regression draw");
    const auto hiddenPixels = hidden.snapshot(), suffixPixels = suffix.snapshot();
    for (std::size_t i = 0; i < hiddenPixels.size(); ++i)
        check((hiddenPixels[i] & 0x00ffffff) == (suffixPixels[i] & 0x00ffffff), "hidden-line ink leaked into visible suffix");

    // An isolated text draw must not write outside its DC-bound rectangle.
    Canvas guard(normal.width, normal.height);
    check(g_overlay.previewRenderer.draw(guard.dc, preview, L"LATEST safe clipped text"), "guard draw");
    const auto pixels = guard.snapshot();
    for (int y=0; y<normal.height; ++y) for (int x=0; x<normal.width; ++x)
        if (!inside(x,y,preview.text)) check(pixels[y*normal.width+x] == 0x00335577U, "text DC clipping failed");
}

// The actual production renderer must preserve visible quiet/normal/loud differences
// and must place a one-line hypothesis directly beneath the waveform.
int waveformInkHeight(const Canvas& canvas, const OverlayRect& box) {
    const auto pixels = canvas.snapshot();
    int first = box.bottom, last = box.top - 1;
    for (int y = box.top; y < box.bottom; ++y) for (int x = box.left + 3; x < box.right - 3; ++x) {
        const auto pixel = pixels[y * canvas.width + x];
        const int red = (pixel >> 16) & 255, green = (pixel >> 8) & 255, blue = pixel & 255;
        // Include the original subtle envelope inks as well as the bright center trace.
        // The axis/background stay below this threshold.
        if (green > 55 && green > red + 15 && green > blue + 5) {
            first = std::min(first, y); last = std::max(last, y);
        }
    }
    return std::max(0, last - first + 1);
}

void renderWaveformLevels(const std::filesystem::path& output, OverlaySize size, unsigned int dpi, bool enabled) {
    const auto layout = configurePresentation(size, dpi, enabled);
    const auto box = enabled ? universal_dictate::preview::calculateTextLayout(size, dpi).waveform : layout.waveform;
    RECT client{0, 0, layout.width, layout.height};
    Canvas canvas(layout.width, layout.height);
    g_overlay.previewText = L"A short preview.";
    int previousHeight = 0;
    for (double peak : {0.004, 0.025, 0.16}) {
        CaptureState capture{};
        for (int i = 0; i < kEnhancedSignalPoints; ++i)
            capture.enhancedHistory.publish(universal_dictate::visualPeakSample(
                static_cast<int>(32767 * peak) * (i % 2 ? 1 : -1)));
        snapshotEnhancedSignal(capture);  // Production path, including Medium gain.
        const auto stable = g_overlay.enhancedSignalHistory;
        snapshotEnhancedSignal(capture);
        check(g_overlay.enhancedSignalHistory == stable, "display gain accumulated on repaint");
        const int raw = universal_dictate::visualPeakSample(static_cast<int>(32767 * peak));
        const int expected = size == OverlaySize::Medium
            ? universal_dictate::mediumWaveformDisplayLevel(raw) : raw;
        check(std::abs(stable.back()) == expected, "size-specific waveform snapshot changed");
        drawEnhancedOverlay(canvas.dc, client);
        const int height = waveformInkHeight(canvas, box);
        if (size == OverlaySize::Medium && peak < 0.005)
            check(height * 100 >= 30 * (box.bottom - box.top), "quiet Medium waveform is still flattened");
        if (size == OverlaySize::Medium && peak > 0.02 && peak < 0.03)
            check(height * 100 >= 65 * (box.bottom - box.top), "normal Medium waveform underuses viewport");
        std::cout << "WAVEFORM size=" << static_cast<int>(size) << " dpi=" << dpi
                  << " preview=" << enabled << " peak=" << peak << " inkHeight=" << height
                  << " previous=" << previousHeight << '\n' << std::flush;
        canvas.save(output / ("level-" + std::to_string(static_cast<int>(size)) + "-" +
            std::to_string(dpi) + (enabled ? "-preview-" : "-off-") + std::to_string(peak) + ".bmp"));
        check(height > previousHeight, "quiet/normal/loud waveform heights are indistinguishable");
        previousHeight = height;
    }
}

void checkNoMirroredLowerEnvelope(OverlaySize size, unsigned int dpi) {
    const auto layout = configurePresentation(size, dpi, false);
    const auto box = layout.waveform;
    const int centerY = (box.top + box.bottom) / 2;
    g_overlay.enhancedSignalHistory.fill(universal_dictate::visualPeakSample(819));
    Canvas canvas(layout.width, layout.height);
    RECT client{0, 0, layout.width, layout.height};
    drawEnhancedOverlay(canvas.dc, client);
    const auto pixels = canvas.snapshot();
    for (int y = centerY + scaleLogical(2, dpi); y < box.bottom; ++y) {
        for (int x = box.left + scaleLogical(3, dpi); x < box.right - scaleLogical(3, dpi); ++x) {
            const auto pixel = pixels[y * layout.width + x];
            const int red = (pixel >> 16) & 255, green = (pixel >> 8) & 255, blue = pixel & 255;
            check(!(green > 55 && green > red + 15 && green > blue + 5),
                  "positive waveform produced mirrored lower-envelope ink");
        }
    }
    g_overlay.enhancedSignalHistory.fill(0);
}

void renderStablePcmDetail(const std::filesystem::path& output, OverlaySize size, unsigned int dpi) {
    // Ten seconds of deterministic speech-like bursts, varying energy and harmonics.
    // Fixed signed peaks come from PCM through the production bucket.
    CaptureState capture{};
    for (int frame = 0; frame < 160000; ++frame) {
        const double t = frame / 16000.0;
        const double syllable = std::max(0.0, std::sin(t * 3.141592653589793 * 2.4));
        const double amplitude = (t < 3 ? 0.008 : t < 6 ? 0.04 : 0.18) * syllable * syllable;
        const auto pcm = static_cast<std::int16_t>(32767 * amplitude *
            (0.7 * std::sin(t * 3.141592653589793 * 360) + 0.3 * std::sin(t * 3.141592653589793 * 890)));
        if (const auto range = capture.enhancedBucket.push(pcm, capture.enhancedBucketTargetFrames))
            capture.enhancedHistory.publish(*range);
    }
    check(capture.enhancedHistory.written() == 256, "ten-second PCM detail count");
    snapshotEnhancedSignal(capture);
    for (bool preview : {false, true}) {
        const auto layout = configurePresentation(size, dpi, preview);
        Canvas canvas(layout.width, layout.height);
        const RECT client{0, 0, layout.width, layout.height};
        g_overlay.previewText = L"Stable waveform; recording and controls unchanged.";
        drawEnhancedOverlay(canvas.dc, client);
        canvas.save(output / ("stable-pcm-" + std::to_string(static_cast<int>(size)) + "-" +
            std::to_string(dpi) + (preview ? "-preview.bmp" : "-off.bmp")));
        const auto box = preview ? universal_dictate::preview::calculateTextLayout(size, dpi).waveform : layout.waveform;
        check(waveformInkHeight(canvas, box) > 2, "measured detail missing");
        // Isolated waveform paint must not leak into controls/text after densification.
        Canvas guard(layout.width, layout.height);
        drawEnhancedWaveform(guard.dc);
        const auto pixels = guard.snapshot();
        for (int y = 0; y < layout.height; ++y) for (int x = 0; x < layout.width; ++x)
            if (!inside(x, y, box)) check(pixels[y * layout.width + x] == 0x00335577U, "fine waveform escaped viewport");
    }
}

void checkScrollingRaster(const std::filesystem::path& output, unsigned int dpi) {
    const auto savedLayout = g_overlay.enhancedLayout;
    const auto savedHistory = g_overlay.enhancedSignalHistory;
    const bool savedPreview = g_overlay.previewEnabled;
    g_overlay.previewEnabled = false;
    const int step = scaleLogical(2, dpi);
    const int width = 255 * step;
    g_overlay.enhancedLayout.waveform = {8, 8, 8 + width, 108};
    CaptureState capture{};
    for (int bucket = 0; bucket < 300; ++bucket) {
        const auto sample = static_cast<std::int16_t>((bucket % 2 ? 1 : -1) *
                                                    (200 + bucket * 131 % 5000));
        for (std::uint32_t frame = 0; frame < capture.enhancedBucketTargetFrames; ++frame)
            if (const auto point = capture.enhancedBucket.push(sample, capture.enhancedBucketTargetFrames))
                capture.enhancedHistory.publish(*point);
    }
    snapshotEnhancedSignal(capture);
    Canvas before(width + 16, 116), after(width + 16, 116);
    drawEnhancedWaveform(before.dc);
    const auto original = before.snapshot();
    for (std::uint32_t frame = 1; frame < capture.enhancedBucketTargetFrames; ++frame)
        check(!capture.enhancedBucket.push(32767, capture.enhancedBucketTargetFrames), "partial raster fixture");
    snapshotEnhancedSignal(capture);
    drawEnhancedWaveform(after.dc);
    check(after.snapshot() == original, "partial audio morphed rendered waveform");
    // A new completed point shifts every old point by exactly one grid interval.
    const auto next = capture.enhancedBucket.push(32767, capture.enhancedBucketTargetFrames);
    check(next.has_value(), "completed raster fixture");
    capture.enhancedHistory.publish(*next);
    snapshotEnhancedSignal(capture);
    std::fill(after.pixels, after.pixels + after.width * after.height, 0x00335577U);
    drawEnhancedWaveform(after.dc);
    const auto shifted = after.snapshot();
    for (int y = 8; y < 108; ++y) for (int x = 8 + 4 * step; x < 8 + width - 4 * step; ++x)
        check((shifted[y * after.width + x] & 0x00ffffff) ==
              (original[y * before.width + x + step] & 0x00ffffff),
              "historical stroke changed shape instead of translating");
    before.save(output / ("scroll-" + std::to_string(dpi) + "-before.bmp"));
    after.save(output / ("scroll-" + std::to_string(dpi) + "-after.bmp"));
    std::cout << "SCROLL dpi=" << dpi << " partial frame unchanged; old pixels translate exactly\n";
    g_overlay.enhancedLayout = savedLayout;
    g_overlay.enhancedSignalHistory = savedHistory;
    g_overlay.previewEnabled = savedPreview;
}

void checkPreviewTopAlignment(OverlaySize size, unsigned int dpi) {
    const auto layout = configurePresentation(size, dpi, true);
    const auto preview = universal_dictate::preview::calculateTextLayout(size, dpi);
    Canvas canvas(layout.width, layout.height);
    RECT client{0, 0, layout.width, layout.height};
    drawEnhancedOverlay(canvas.dc, client);
    const auto pixels = canvas.snapshot();
    int firstInk = preview.text.bottom;
    for (int y = preview.text.top; y < preview.text.bottom; ++y)
        for (int x = preview.text.left; x < preview.text.right; ++x) {
            const auto pixel = pixels[y * layout.width + x];
            if (((pixel >> 16) & 255) > 100 && ((pixel >> 8) & 255) > 100 && (pixel & 255) > 100)
                firstInk = std::min(firstInk, y);
        }
    check(firstInk - preview.text.top <= scaleLogical(8, dpi), "short preview leaves a centered blank gap");
}

void renderWaveformCases(const std::filesystem::path& output, OverlaySize size, unsigned int dpi) {
    for (bool enabled : {false, true}) renderWaveformLevels(output, size, dpi, enabled);
    checkNoMirroredLowerEnvelope(size, dpi);
    checkPreviewTopAlignment(size, dpi);
    // Deterministic low/medium/high energy envelopes, not microphone acceptance.
    CaptureState envelope{};
    for (int i = 0; i < kEnhancedSignalPoints; ++i) {
        const auto fraction = static_cast<double>(i) / kEnhancedSignalPoints;
        const double peak = fraction < 0.08 ? 0 : fraction < 0.35 ? 0.004 : fraction < 0.67 ? 0.025 : 0.16;
        const double variation = 0.75 + 0.25 * std::sin(i * 0.45);
        envelope.enhancedHistory.publish(universal_dictate::visualPeakSample(
            static_cast<int>(32767 * peak * variation) * (i % 2 ? 1 : -1)));
    }
    snapshotEnhancedSignal(envelope);
    for (bool enabled : {false, true}) {
        const auto layout = configurePresentation(size, dpi, enabled);
        Canvas canvas(layout.width, layout.height);
        RECT client{0, 0, layout.width, layout.height};
        drawEnhancedOverlay(canvas.dc, client);
        canvas.save(output / ("waveform-" + std::to_string(static_cast<int>(size)) + "-" + std::to_string(dpi) +
            (enabled ? "-preview.bmp" : "-off.bmp")));
    }
    g_overlay.enhancedSignalHistory.fill({});
}

void checkControlSymbols(const universal_dictate::EnhancedOverlayLayout& layout, unsigned int dpi) {
    using universal_dictate::ButtonSymbol;
    const OverlayRect boxes[]{layout.confirmButton, layout.pauseButton, layout.pauseButton, layout.cancelButton};
    const ButtonSymbol symbols[]{ButtonSymbol::Insert, ButtonSymbol::Pause, ButtonSymbol::Resume, ButtonSymbol::Discard};
    for (int i = 0; i < 4; ++i) {
        Canvas canvas(layout.width, layout.height);
        const RECT box = winRect(boxes[i]);
        universal_dictate::drawButtonSymbol(canvas.dc, box, symbols[i], dpi, RGB(240, 240, 240));
        const auto pixels = canvas.snapshot();
        bool ink = false;
        for (int y = 0; y < layout.height; ++y) for (int x = 0; x < layout.width; ++x) {
            const bool changed = (pixels[y * layout.width + x] & 0x00ffffff) != 0x00335577U;
            if (changed) { check(inside(x, y, boxes[i]), "symbol ink escaped compact button"); ink = true; }
        }
        check(ink, "compact button symbol is missing");
    }
}

void checkControlTooltips(const universal_dictate::EnhancedOverlayLayout& layout, bool paused) {
    HWND tooltip = g_overlay.buttonTooltips.window();
    check(tooltip != nullptr, "labelled control tooltips missing");
    check((GetWindowLongPtrW(tooltip, GWL_EXSTYLE) & WS_EX_NOACTIVATE) != 0, "tooltip activation policy");
    const OverlayRect boxes[]{layout.confirmButton, layout.pauseButton, layout.cancelButton};
    const wchar_t* labels[]{L"Insert:", paused ? L"Resume recording" : L"Pause recording", L"Discard:"};
    for (UINT_PTR id = 1; id <= 3; ++id) {
        wchar_t text[256]{};
        TOOLINFOW info{}; info.cbSize = sizeof(info); info.hwnd = g_overlay.window; info.uId = id;
        check(SendMessageW(tooltip, TTM_GETTOOLINFOW, 0, reinterpret_cast<LPARAM>(&info)) != 0, "tooltip registration missing");
        const auto expected = winRect(boxes[id-1]);
        check(EqualRect(&info.rect, &expected) != 0, "tooltip/hit-area mismatch after layout change");
        info.lpszText = text;
        SendMessageW(tooltip, TTM_GETTEXTW, std::size(text), reinterpret_cast<LPARAM>(&info));
        check(std::wstring_view(text).starts_with(labels[id-1]), "control hover label");
    }
}

void renderControlCases(const std::filesystem::path& output, OverlaySize size, unsigned int dpi) {
    for (bool enabled : {false, true}) {
        const auto layout = configurePresentation(size, dpi, enabled);
        checkControlSymbols(layout, dpi);
        Canvas canvas(layout.width, layout.height);
        RECT client{0, 0, layout.width, layout.height};
        for (bool paused : {false, true}) {
            applyPauseAcknowledgement({1, paused}, nullptr, true);
            g_overlay.previewText = L"Recent provisional words stay visible while paused.";
            drawEnhancedOverlay(canvas.dc, client);
            canvas.save(output / ("controls-" + std::to_string(static_cast<int>(size)) + "-" + std::to_string(dpi) +
                (enabled ? "-preview-" : "-off-") + (paused ? "paused.bmp" : "recording.bmp")));
            checkControlTooltips(layout, paused);
        }
    }
    applyPauseAcknowledgement({1, false}, nullptr, true);
}

void clickPauseControls(HWND scratch, HWND edit) {
    g_overlay.actionSent.store(false);
    applyPauseAcknowledgement({1, false}, nullptr, true);
    UpdateWindow(g_overlay.window);
    clickOwnRect(g_overlay.window, g_overlay.enhancedLayout.pauseButton); checkFocus(scratch, edit);
    check(g_overlay.pausePending && !g_overlay.paused && !g_overlay.actionSent.load(), "Pause must await capture acknowledgement");
    clickOwnRect(g_overlay.window, g_overlay.enhancedLayout.pauseButton); checkFocus(scratch, edit);
    check(g_overlay.pausePending && !g_overlay.actionSent.load(), "duplicate Pause consumed terminal action");
    applyPauseAcknowledgement({2, true}, nullptr, true); UpdateWindow(g_overlay.window);
    check(g_overlay.paused && !g_overlay.pausePending, "paused renderer acknowledgement");
    clickOwnRect(g_overlay.window, g_overlay.enhancedLayout.pauseButton); checkFocus(scratch, edit);
    check(g_overlay.pausePending && g_overlay.paused && !g_overlay.actionSent.load(), "Resume must await capture acknowledgement");
    applyPauseAcknowledgement({3, false}, nullptr, true); UpdateWindow(g_overlay.window);
    check(!g_overlay.paused && !g_overlay.pausePending, "resumed renderer acknowledgement");
    applyPauseAcknowledgement({4, true}, nullptr, true); UpdateWindow(g_overlay.window);
    clickOwnRect(g_overlay.window, g_overlay.enhancedLayout.confirmButton); checkFocus(scratch, edit);
    check(g_overlay.actionSent.load(), "Insert unavailable while paused");
    g_overlay.actionSent.store(false); UpdateWindow(g_overlay.window);
    clickOwnRect(g_overlay.window, g_overlay.enhancedLayout.cancelButton); checkFocus(scratch, edit);
    check(g_overlay.actionSent.load(), "Discard unavailable while paused");
    g_overlay.actionSent.store(false);
    applyPauseAcknowledgement({5, false}, nullptr, true);
}
} // namespace

int main(int argc, char** argv) {
    if (argc != 3 || std::string_view(argv[1]) != "--allow-disposable-desktop") {
        std::cerr << "Refused: presentation test requires explicit disposable desktop permission and output directory.\n";
        return 2;
    }
    POINT originalCursor{}; GetCursorPos(&originalCursor);
    HWND scratch = nullptr;
    try {
        enableEnhancedOverlayDpiAwareness();
        const std::filesystem::path output(argv[2]); std::filesystem::create_directories(output);
        scratch = CreateWindowExW(0, L"STATIC", L"Universal Dictate presentation scratch target", WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            70,70,640,120,nullptr,nullptr,GetModuleHandleW(nullptr),nullptr);
        check(scratch != nullptr, "scratch window");
        HWND edit = CreateWindowExW(0,L"EDIT",L"before after",WS_CHILD | WS_VISIBLE,5,5,500,40,scratch,nullptr,GetModuleHandleW(nullptr),nullptr);
        check(edit != nullptr, "scratch edit");
        SetForegroundWindow(scratch); SetFocus(edit); SendMessageW(edit,EM_SETSEL,2,5); pumpFor(60);
        checkFocus(scratch,edit);
        unsigned int count=0;
        for (auto size : {OverlaySize::Small,OverlaySize::Medium,OverlaySize::Large}) {
            check(createOverlay(MonitorFromWindow(scratch,MONITOR_DEFAULTTONEAREST),true,size,true), "create production overlay");
            checkFocus(scratch,edit);
            check((GetWindowLongPtrW(g_overlay.window,GWL_EXSTYLE) & WS_EX_NOACTIVATE) != 0, "no-activate style");
            check(SendMessageW(g_overlay.window,WM_MOUSEACTIVATE,reinterpret_cast<WPARAM>(scratch),MAKELPARAM(HTCLIENT,WM_LBUTTONDOWN)) == MA_NOACTIVATE, "mouse activation policy");
            for (unsigned int dpi : {96U,120U,144U,192U}) {
                renderCases(output,size,dpi,count);
                renderControlCases(output,size,dpi);
                renderWaveformCases(output,size,dpi);
                renderStablePcmDetail(output,size,dpi);
                if (size == OverlaySize::Medium) checkScrollingRaster(output, dpi);
                checkFocus(scratch,edit);
            }
            // Actual clicks at both heights, not synthetic DOM events.
            for (bool enabled : {false, true}) {
                const auto layout = configurePresentation(size, 96, enabled);
                updateEnhancedRegion(); UpdateWindow(g_overlay.window);
                const auto body = enabled ? universal_dictate::preview::calculateTextLayout(size,96).text : layout.waveform;
                clickOwnRect(g_overlay.window,body); checkFocus(scratch,edit);
                check(!g_overlay.actionSent.load(), "body click triggered recording action");
                clickOwnRect(g_overlay.window,layout.confirmButton); checkFocus(scratch,edit);
                check(g_overlay.actionSent.load(), "Insert button hit area");
                g_overlay.actionSent.store(false);
                clickOwnRect(g_overlay.window,layout.cancelButton); checkFocus(scratch,edit);
                check(g_overlay.actionSent.load(), "Discard button hit area");
                clickPauseControls(scratch,edit);
            }
            destroyOverlay();
            check(createOverlay(MonitorFromWindow(scratch,MONITOR_DEFAULTTONEAREST),true,size), "create compact production overlay");
            check(!g_overlay.previewEnabled, "default startup enabled preview");
            RECT compact{}; GetClientRect(g_overlay.window, &compact);
            check(compact.bottom == scaleLogical(universal_dictate::enhancedOverlayHeight(size,false),g_overlay.dpi), "compact startup height");
            checkFocus(scratch,edit);
            destroyOverlay();
        }
        DestroyWindow(scratch); scratch = nullptr;
        SetCursorPos(originalCursor.x,originalCursor.y);
        std::cout << count << " production-renderer cases passed; 12 Off renders, 12 clipping checks, 48 preview/control-state renders, 96 symbol bounds checks, 24 waveform renders with 72 level checks, 12 top-alignment checks, 24 measured stable-PCM renders/clipping checks, 48 real own-overlay clicks; no microphone or Codex test\n";
        return 0;
    } catch (const std::exception& error) {
        destroyOverlay(); if (scratch) DestroyWindow(scratch);
        SetCursorPos(originalCursor.x,originalCursor.y);
        std::cerr << "FAIL: " << error.what() << '\n'; return 1;
    }
}

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

void renderCases(const std::filesystem::path& output, OverlaySize size, unsigned int dpi, unsigned int& count) {
    applyEnhancedDpi(dpi);
    const auto& normal = g_overlay.enhancedLayout;
    const auto preview = universal_dictate::preview::calculateTextLayout(size, dpi);
    const RECT suggested{70, 220, 70 + normal.width, 220 + normal.height};
    SendMessageW(g_overlay.window, WM_DPICHANGED, MAKELONG(dpi,dpi), reinterpret_cast<LPARAM>(&suggested));
    RECT client{}; GetClientRect(g_overlay.window, &client);
    check(client.right == normal.width && client.bottom == normal.height, "DPI window bounds");
    const std::wstring samples[] = {
        L"", L"Ich gehe nach Hause. Der Druck ist fünf bar & die Temperatur zwanzig Grad.",
        L"هذا نص تجريبي باللغة العربية. الضغط خمسة بار ودرجة الحرارة عشرون درجة.",
        L"这是本地语音识别的临时预览。水温为二十度，压力为五巴。これはプレビューです。",
        L"Grüße a\u0308 e\u0301 👨‍👩‍👧‍👦 👍🏽 🇩🇪 🧪 नमस्ते दुनिया — provisional words only.",
        std::wstring(500, L'W') + L" END latest words"
    };
    Canvas canvas(normal.width, normal.height);
    const auto prefix = std::to_string(static_cast<int>(size)) + "-" + std::to_string(dpi);
    g_overlay.previewEnabled = false;
    g_overlay.previewRenderer.reset();
    drawEnhancedOverlay(canvas.dc, client);
    check(!g_overlay.previewRenderer.initialized(), "Off initialized preview renderer");
    canvas.save(output / (prefix + "-off.bmp"));
    g_overlay.previewEnabled = true;
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

void renderControlCases(const std::filesystem::path& output, OverlaySize size, unsigned int dpi) {
    applyEnhancedDpi(dpi);
    const auto& layout = g_overlay.enhancedLayout;
    Canvas canvas(layout.width, layout.height);
    RECT client{0, 0, layout.width, layout.height};
    const auto previous = SelectObject(canvas.dc, g_overlay.enhancedButtonFont);
    for (const wchar_t* label : {L"Insert", L"Pause", L"Resume", L"Pausing", L"Resuming", L"Discard"}) {
        SIZE extent{};
        check(GetTextExtentPoint32W(canvas.dc, label, static_cast<int>(wcslen(label)), &extent) != 0, "button label metrics");
        check(extent.cx + scaleLogical(4, dpi) <= layout.pauseButton.right-layout.pauseButton.left, "button label too wide");
        check(extent.cy <= layout.pauseButton.bottom-layout.pauseButton.top, "button label too tall");
    }
    SelectObject(canvas.dc, previous);
    for (auto style : {universal_dictate::ButtonStyle::Text, universal_dictate::ButtonStyle::Symbols}) {
        g_overlay.buttonStyle = style;
        for (bool paused : {false, true}) {
            applyPauseAcknowledgement({1, paused}, nullptr, true);
            g_overlay.previewText = L"Recent provisional words stay visible while paused.";
            drawEnhancedOverlay(canvas.dc, client);
            canvas.save(output / ("controls-" + std::to_string(static_cast<int>(size)) + "-" + std::to_string(dpi) +
                (style == universal_dictate::ButtonStyle::Text ? "-text-" : "-symbols-") + (paused ? "paused.bmp" : "recording.bmp")));
            HWND tooltip = g_overlay.buttonTooltips.window();
            check(tooltip != nullptr, "labelled control tooltips missing");
            check((GetWindowLongPtrW(tooltip, GWL_EXSTYLE) & WS_EX_NOACTIVATE) != 0, "tooltip activation policy");
            wchar_t text[256]{};
            TOOLINFOW info{}; info.cbSize = sizeof(info); info.hwnd = g_overlay.window; info.uId = 2; info.lpszText = text;
            SendMessageW(tooltip, TTM_GETTEXTW, std::size(text), reinterpret_cast<LPARAM>(&info));
            check(std::wstring_view(text).starts_with(paused ? L"Resume recording" : L"Pause recording"), "pause/resume hover label");
        }
    }
    applyPauseAcknowledgement({1, false}, nullptr, true);
    g_overlay.buttonStyle = universal_dictate::ButtonStyle::Text;
}

void clickPauseControls(HWND scratch, HWND edit, universal_dictate::ButtonStyle style) {
    g_overlay.buttonStyle = style;
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
            check(createOverlay(MonitorFromWindow(scratch,MONITOR_DEFAULTTONEAREST),true,size), "create production overlay");
            checkFocus(scratch,edit);
            check((GetWindowLongPtrW(g_overlay.window,GWL_EXSTYLE) & WS_EX_NOACTIVATE) != 0, "no-activate style");
            check(SendMessageW(g_overlay.window,WM_MOUSEACTIVATE,reinterpret_cast<WPARAM>(scratch),MAKELPARAM(HTCLIENT,WM_LBUTTONDOWN)) == MA_NOACTIVATE, "mouse activation policy");
            for (unsigned int dpi : {96U,120U,144U,192U}) {
                renderCases(output,size,dpi,count);
                renderControlCases(output,size,dpi);
                checkFocus(scratch,edit);
            }
            // Actual mouse clicks on this process's overlay, not synthetic DOM events.
            applyEnhancedDpi(96);
            SetWindowPos(g_overlay.window,HWND_TOPMOST,70,220,g_overlay.enhancedLayout.width,g_overlay.enhancedLayout.height,SWP_NOACTIVATE);
            updateEnhancedRegion(); UpdateWindow(g_overlay.window);
            const auto preview = universal_dictate::preview::calculateTextLayout(size,96);
            clickOwnRect(g_overlay.window,preview.text); checkFocus(scratch,edit);
            check(!g_overlay.actionSent.load(), "text click triggered recording action");
            clickOwnRect(g_overlay.window,g_overlay.enhancedLayout.confirmButton); checkFocus(scratch,edit);
            check(g_overlay.actionSent.load(), "Insert button hit area");
            g_overlay.actionSent.store(false);
            clickOwnRect(g_overlay.window,g_overlay.enhancedLayout.cancelButton); checkFocus(scratch,edit);
            check(g_overlay.actionSent.load(), "Discard button hit area");
            for (auto style : {universal_dictate::ButtonStyle::Text, universal_dictate::ButtonStyle::Symbols})
                clickPauseControls(scratch,edit,style);
            destroyOverlay();
        }
        DestroyWindow(scratch); scratch = nullptr;
        SetCursorPos(originalCursor.x,originalCursor.y);
        std::cout << count << " production-renderer cases passed; 12 Off renders, 12 clipping checks, 48 button-style/state renders, 39 real own-overlay clicks; no microphone or Codex test\n";
        return 0;
    } catch (const std::exception& error) {
        destroyOverlay(); if (scratch) DestroyWindow(scratch);
        SetCursorPos(originalCursor.x,originalCursor.y);
        std::cerr << "FAIL: " << error.what() << '\n'; return 1;
    }
}

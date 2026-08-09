/*
 * Universal Dictate - Windows microphone recorder
 *
 * Uses miniaudio for capture and WAV encoding. miniaudio is fetched and
 * compiled at build time; it is not a runtime dependency.
 *
 * The recorder also owns a small non-activating Win32 overlay. The overlay
 * displays the live microphone level and exposes confirm/cancel controls
 * without taking keyboard focus away from the VS Code input being dictated
 * into.
 *
 * Protocol (stdout):
 *   READY
 *   LEVEL <0.000..1.000>
 *   ACTION STOP
 *   ACTION CANCEL
 *   STOPPED <output-path>
 *   CANCELLED
 *
 * Commands (stdin):
 *   STOP
 *   CANCEL
 *
 * SPDX-License-Identifier: MIT
 */

#define UNICODE
#define _UNICODE
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <windowsx.h>

#include "miniaudio.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <iostream>
#include <string>
#include <string_view>
#include <thread>

namespace {

constexpr ma_uint32 kSampleRate = 16000;
constexpr ma_uint32 kChannels = 1;
constexpr auto kLevelInterval = std::chrono::milliseconds(50);
constexpr int kOverlayWidth = 330;
constexpr int kOverlayHeight = 76;
constexpr int kOverlayMargin = 18;
constexpr wchar_t kOverlayClassName[] = L"UniversalDictateRecordingOverlay";

enum class RecorderCommand : int {
    Record = 0,
    Stop = 1,
    Cancel = 2,
};

class Encoder {
public:
    Encoder() = default;
    Encoder(const Encoder&) = delete;
    Encoder& operator=(const Encoder&) = delete;

    ~Encoder() {
        close();
    }

    ma_result open(const std::string& outputPath) {
        auto config = ma_encoder_config_init(
            ma_encoding_format_wav,
            ma_format_s16,
            kChannels,
            kSampleRate);

        const ma_result result = ma_encoder_init_file(outputPath.c_str(), &config, &encoder_);
        open_ = result == MA_SUCCESS;
        return result;
    }

    void close() noexcept {
        if (!open_) {
            return;
        }

        ma_encoder_uninit(&encoder_);
        open_ = false;
    }

    ma_encoder* get() noexcept {
        return &encoder_;
    }

private:
    ma_encoder encoder_{};
    bool open_ = false;
};

struct CaptureState {
    Encoder* encoder = nullptr;
    std::atomic<int> peakMilli{0};
};

void captureCallback(
    ma_device* device,
    void* output,
    const void* input,
    ma_uint32 frameCount) {
    static_cast<void>(output);

    auto* state = static_cast<CaptureState*>(device->pUserData);
    if (state == nullptr || state->encoder == nullptr || input == nullptr || frameCount == 0) {
        return;
    }

    ma_encoder_write_pcm_frames(state->encoder->get(), input, frameCount, nullptr);

    const auto* samples = static_cast<const ma_int16*>(input);
    int peak = 0;
    const auto sampleCount = static_cast<std::size_t>(frameCount) * kChannels;

    for (std::size_t i = 0; i < sampleCount; ++i) {
        const int magnitude = std::abs(static_cast<int>(samples[i]));
        peak = std::max(peak, magnitude);
    }

    peak = std::min(peak, 32767);
    state->peakMilli.store((peak * 1000) / 32767, std::memory_order_relaxed);
}

class CaptureDevice {
public:
    CaptureDevice() = default;
    CaptureDevice(const CaptureDevice&) = delete;
    CaptureDevice& operator=(const CaptureDevice&) = delete;

    ~CaptureDevice() {
        close();
    }

    ma_result open(CaptureState* state, Encoder& encoder) {
        auto config = ma_device_config_init(ma_device_type_capture);
        config.capture.format = encoder.get()->config.format;
        config.capture.channels = encoder.get()->config.channels;
        config.sampleRate = encoder.get()->config.sampleRate;
        config.dataCallback = captureCallback;
        config.pUserData = state;

        const ma_result result = ma_device_init(nullptr, &config, &device_);
        open_ = result == MA_SUCCESS;
        return result;
    }

    ma_result start() {
        return ma_device_start(&device_);
    }

    void close() noexcept {
        if (!open_) {
            return;
        }

        ma_device_uninit(&device_);
        open_ = false;
    }

private:
    ma_device device_{};
    bool open_ = false;
};

struct OverlayState {
    HWND window = nullptr;
    HFONT textFont = nullptr;
    HFONT symbolFont = nullptr;
    int levelMilli = 0;
    std::atomic<bool> actionSent{false};
};

OverlayState g_overlay;

RECT confirmRect(const RECT& client) {
    return RECT{client.right - 92, 14, client.right - 52, client.bottom - 14};
}

RECT cancelRect(const RECT& client) {
    return RECT{client.right - 46, 14, client.right - 6, client.bottom - 14};
}

void emitOverlayAction(const char* action) {
    if (g_overlay.actionSent.exchange(true, std::memory_order_acq_rel)) {
        return;
    }

    std::cout << "ACTION " << action << '\n' << std::flush;
    if (g_overlay.window != nullptr) {
        InvalidateRect(g_overlay.window, nullptr, FALSE);
    }
}

void drawOverlay(HWND window, HDC dc) {
    RECT client{};
    GetClientRect(window, &client);

    HBRUSH background = CreateSolidBrush(RGB(31, 31, 31));
    FillRect(dc, &client, background);
    DeleteObject(background);

    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, RGB(245, 245, 245));

    HFONT previousFont = reinterpret_cast<HFONT>(SelectObject(dc, g_overlay.textFont));
    RECT title{14, 8, client.right - 104, 30};
    DrawTextW(dc, L"Universal Dictate", -1, &title, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    RECT subtitle{14, 31, 118, 57};
    SetTextColor(dc, RGB(190, 190, 190));
    DrawTextW(dc, L"Recording", -1, &subtitle, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    constexpr int kBars = 8;
    constexpr int kBarWidth = 7;
    constexpr int kBarGap = 3;
    const int meterLeft = 116;
    const int meterBottom = 57;
    const int activeBars = std::clamp(
        static_cast<int>(std::ceil(std::sqrt(g_overlay.levelMilli / 1000.0) * kBars)),
        0,
        kBars);

    for (int index = 0; index < kBars; ++index) {
        const int height = 5 + index * 2;
        RECT bar{
            meterLeft + index * (kBarWidth + kBarGap),
            meterBottom - height,
            meterLeft + index * (kBarWidth + kBarGap) + kBarWidth,
            meterBottom};
        HBRUSH brush = CreateSolidBrush(
            index < activeBars ? RGB(0, 122, 204) : RGB(74, 74, 74));
        FillRect(dc, &bar, brush);
        DeleteObject(brush);
    }

    const RECT okRect = confirmRect(client);
    const RECT xRect = cancelRect(client);
    HBRUSH okBrush = CreateSolidBrush(
        g_overlay.actionSent.load(std::memory_order_acquire) ? RGB(70, 70, 70) : RGB(38, 125, 68));
    HBRUSH xBrush = CreateSolidBrush(RGB(92, 92, 92));
    FillRect(dc, &okRect, okBrush);
    FillRect(dc, &xRect, xBrush);
    DeleteObject(okBrush);
    DeleteObject(xBrush);

    SelectObject(dc, g_overlay.symbolFont);
    SetTextColor(dc, RGB(255, 255, 255));
    RECT okText = okRect;
    RECT xText = xRect;
    DrawTextW(dc, L"\x2713", -1, &okText, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    DrawTextW(dc, L"\x00D7", -1, &xText, DT_CENTER | DT_SINGLELINE | DT_VCENTER);

    SelectObject(dc, previousFont);
}

LRESULT CALLBACK overlayWindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_MOUSEACTIVATE:
            return MA_NOACTIVATE;
        case WM_NCHITTEST:
            return HTCLIENT;
        case WM_ERASEBKGND:
            return 1;
        case WM_LBUTTONUP: {
            if (g_overlay.actionSent.load(std::memory_order_acquire)) {
                return 0;
            }

            RECT client{};
            GetClientRect(window, &client);
            POINT point{GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
            const RECT okRect = confirmRect(client);
            const RECT xRect = cancelRect(client);

            if (PtInRect(&okRect, point)) {
                emitOverlayAction("STOP");
                return 0;
            }
            if (PtInRect(&xRect, point)) {
                emitOverlayAction("CANCEL");
                return 0;
            }
            return 0;
        }
        case WM_PAINT: {
            PAINTSTRUCT paint{};
            HDC dc = BeginPaint(window, &paint);
            drawOverlay(window, dc);
            EndPaint(window, &paint);
            return 0;
        }
        case WM_DESTROY:
            return 0;
        default:
            return DefWindowProcW(window, message, wParam, lParam);
    }
}

bool createOverlay() {
    HINSTANCE instance = GetModuleHandleW(nullptr);

    WNDCLASSEXW windowClass{};
    windowClass.cbSize = sizeof(windowClass);
    windowClass.lpfnWndProc = overlayWindowProc;
    windowClass.hInstance = instance;
    windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    windowClass.lpszClassName = kOverlayClassName;

    const ATOM registered = RegisterClassExW(&windowClass);
    if (registered == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
        return false;
    }

    RECT workArea{};
    if (!SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0)) {
        workArea = RECT{0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)};
    }

    const int x = std::max(workArea.left, workArea.right - kOverlayWidth - kOverlayMargin);
    const int y = std::max(workArea.top, workArea.bottom - kOverlayHeight - kOverlayMargin);

    g_overlay.textFont = CreateFontW(
        -15, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
        DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
    g_overlay.symbolFont = CreateFontW(
        -23, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
        DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI Symbol");

    g_overlay.window = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        kOverlayClassName,
        L"Universal Dictate",
        WS_POPUP,
        x,
        y,
        kOverlayWidth,
        kOverlayHeight,
        nullptr,
        nullptr,
        instance,
        nullptr);

    if (g_overlay.window == nullptr) {
        return false;
    }

    ShowWindow(g_overlay.window, SW_SHOWNOACTIVATE);
    SetWindowPos(
        g_overlay.window,
        HWND_TOPMOST,
        x,
        y,
        kOverlayWidth,
        kOverlayHeight,
        SWP_NOACTIVATE | SWP_SHOWWINDOW);
    UpdateWindow(g_overlay.window);
    return true;
}

void destroyOverlay() noexcept {
    if (g_overlay.window != nullptr) {
        DestroyWindow(g_overlay.window);
        g_overlay.window = nullptr;
    }
    if (g_overlay.textFont != nullptr) {
        DeleteObject(g_overlay.textFont);
        g_overlay.textFont = nullptr;
    }
    if (g_overlay.symbolFont != nullptr) {
        DeleteObject(g_overlay.symbolFont);
        g_overlay.symbolFont = nullptr;
    }
    UnregisterClassW(kOverlayClassName, GetModuleHandleW(nullptr));
}

void pumpOverlayMessages() {
    MSG message{};
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
}

void updateOverlayLevel(int levelMilli) {
    g_overlay.levelMilli = std::clamp(levelMilli, 0, 1000);
    if (g_overlay.window != nullptr) {
        InvalidateRect(g_overlay.window, nullptr, FALSE);
    }
}

void removeFile(const std::string& path) noexcept {
    std::error_code error;
    std::filesystem::remove(path, error);
}

std::string parseOutputPath(int argc, char** argv) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (std::string_view(argv[i]) == "--output") {
            return argv[i + 1];
        }
    }

    return {};
}

}  // namespace

int main(int argc, char** argv) {
    const std::string outputPath = parseOutputPath(argc, argv);
    if (outputPath.empty()) {
        std::cerr << "ERROR missing --output path\n";
        return 2;
    }

    Encoder encoder;
    const ma_result encoderResult = encoder.open(outputPath);
    if (encoderResult != MA_SUCCESS) {
        std::cerr << "ERROR encoder init failed: " << static_cast<int>(encoderResult) << '\n';
        return 3;
    }

    CaptureState captureState{&encoder};
    CaptureDevice device;
    const ma_result deviceResult = device.open(&captureState, encoder);
    if (deviceResult != MA_SUCCESS) {
        encoder.close();
        removeFile(outputPath);
        std::cerr << "ERROR capture device init failed: " << static_cast<int>(deviceResult) << '\n';
        return 4;
    }

    const ma_result startResult = device.start();
    if (startResult != MA_SUCCESS) {
        device.close();
        encoder.close();
        removeFile(outputPath);
        std::cerr << "ERROR capture device start failed: " << static_cast<int>(startResult) << '\n';
        return 5;
    }

    std::atomic<RecorderCommand> command{RecorderCommand::Record};
    std::thread commandThread([&command]() {
        std::string line;
        while (std::getline(std::cin, line)) {
            if (!line.empty() && line.back() == '\r') {
                line.pop_back();
            }

            if (line == "CANCEL") {
                command.store(RecorderCommand::Cancel, std::memory_order_release);
                return;
            }
            if (line == "STOP") {
                command.store(RecorderCommand::Stop, std::memory_order_release);
                return;
            }
        }

        RecorderCommand expected = RecorderCommand::Record;
        command.compare_exchange_strong(
            expected,
            RecorderCommand::Stop,
            std::memory_order_release,
            std::memory_order_relaxed);
    });

    const bool overlayAvailable = createOverlay();
    if (!overlayAvailable) {
        std::cerr << "WARNING recording overlay could not be created; keyboard controls remain available\n";
    }

    std::cout << "READY\n" << std::flush;

    int previousLevel = -1;
    while (command.load(std::memory_order_acquire) == RecorderCommand::Record) {
        pumpOverlayMessages();

        const int level = captureState.peakMilli.exchange(0, std::memory_order_relaxed);
        updateOverlayLevel(level);
        if (level != previousLevel) {
            std::printf("LEVEL %.3f\n", static_cast<double>(level) / 1000.0);
            std::fflush(stdout);
            previousLevel = level;
        }
        std::this_thread::sleep_for(kLevelInterval);
    }

    destroyOverlay();
    device.close();
    encoder.close();

    if (commandThread.joinable()) {
        commandThread.join();
    }

    if (command.load(std::memory_order_acquire) == RecorderCommand::Cancel) {
        removeFile(outputPath);
        std::cout << "CANCELLED\n" << std::flush;
    } else {
        std::cout << "STOPPED " << outputPath << '\n' << std::flush;
    }

    return 0;
}

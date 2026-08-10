/*
 * Universal Dictate - Windows microphone recorder
 *
 * Uses miniaudio for capture and WAV encoding. miniaudio is fetched and
 * compiled at build time; it is not a runtime dependency.
 *
 * The recorder also owns a non-activating Win32 overlay. The overlay renders
 * a compact adaptive rolling signal field or an optional enhanced amplitude-
 * driven signal field and exposes confirm/cancel controls without taking
 * keyboard focus away from the VS Code input being dictated into.
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
#include <array>
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
constexpr int kOverlayWidth = 400;
constexpr int kOverlayHeight = 110;
constexpr int kEnhancedOverlayWidth = 820;
constexpr int kEnhancedOverlayHeight = 150;
constexpr int kOverlayMargin = 18;
constexpr int kSignalPoints = 64;
constexpr int kNoiseFloorMilli = 6;
constexpr int kEnhancedReferenceMilli = 240;
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
    HFONT enhancedTitleFont = nullptr;
    HFONT enhancedSubtitleFont = nullptr;
    HFONT enhancedButtonFont = nullptr;
    int levelMilli = 0;
    std::array<int, kSignalPoints> levelHistory{};
    bool enhanced = false;
    std::atomic<bool> actionSent{false};
};

OverlayState g_overlay;

RECT confirmRect(const RECT& client) {
    if (g_overlay.enhanced) {
        return RECT{client.right - 210, 51, client.right - 112, 101};
    }
    return RECT{client.right - 92, 30, client.right - 52, client.bottom - 30};
}

RECT cancelRect(const RECT& client) {
    if (g_overlay.enhanced) {
        return RECT{client.right - 104, 51, client.right - 6, 101};
    }
    return RECT{client.right - 46, 30, client.right - 6, client.bottom - 30};
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

int smoothedHistoryLevel(int index) {
    static constexpr std::array<int, 5> weights{1, 2, 3, 2, 1};
    int weighted = 0;
    int weightTotal = 0;

    for (int offset = -2; offset <= 2; ++offset) {
        const int source = std::clamp(index + offset, 0, kSignalPoints - 1);
        const int weight = weights[static_cast<std::size_t>(offset + 2)];
        weighted += g_overlay.levelHistory[static_cast<std::size_t>(source)] * weight;
        weightTotal += weight;
    }

    return weightTotal == 0 ? 0 : weighted / weightTotal;
}

COLORREF interpolateColor(COLORREF left, COLORREF right, double amount) {
    const double t = std::clamp(amount, 0.0, 1.0);
    const int red = static_cast<int>(std::lround(
        static_cast<double>(GetRValue(left)) +
        (static_cast<double>(GetRValue(right)) - GetRValue(left)) * t));
    const int green = static_cast<int>(std::lround(
        static_cast<double>(GetGValue(left)) +
        (static_cast<double>(GetGValue(right)) - GetGValue(left)) * t));
    const int blue = static_cast<int>(std::lround(
        static_cast<double>(GetBValue(left)) +
        (static_cast<double>(GetBValue(right)) - GetBValue(left)) * t));
    return RGB(red, green, blue);
}

COLORREF enhancedGradientColor(double position) {
    const COLORREF cyan = RGB(38, 226, 239);
    const COLORREF blue = RGB(47, 116, 255);
    const COLORREF violet = RGB(139, 74, 255);
    const COLORREF magenta = RGB(238, 57, 191);
    const double t = std::clamp(position, 0.0, 1.0);

    if (t < 1.0 / 3.0) {
        return interpolateColor(cyan, blue, t * 3.0);
    }
    if (t < 2.0 / 3.0) {
        return interpolateColor(blue, violet, (t - 1.0 / 3.0) * 3.0);
    }
    return interpolateColor(violet, magenta, (t - 2.0 / 3.0) * 3.0);
}

COLORREF fadeToBackground(COLORREF color, double strength) {
    return interpolateColor(RGB(14, 18, 27), color, strength);
}

void drawRoundedBox(
    HDC dc,
    const RECT& rect,
    int radius,
    COLORREF fill,
    COLORREF border,
    int borderWidth = 1) {
    HBRUSH brush = CreateSolidBrush(fill);
    HPEN pen = CreatePen(PS_SOLID, borderWidth, border);
    HGDIOBJ previousBrush = SelectObject(dc, brush);
    HGDIOBJ previousPen = SelectObject(dc, pen);
    RoundRect(dc, rect.left, rect.top, rect.right, rect.bottom, radius, radius);
    SelectObject(dc, previousPen);
    SelectObject(dc, previousBrush);
    DeleteObject(pen);
    DeleteObject(brush);
}

void drawSignalField(HDC dc, const RECT& client) {
    const int left = 104;
    const int right = client.right - 106;
    const int top = 14;
    const int bottom = client.bottom - 14;
    const int centerY = (top + bottom) / 2;
    const int width = std::max(1, right - left);
    const int maxAmplitude = std::max(12, (bottom - top) / 2 - 3);

    int rollingPeak = 0;
    for (int value : g_overlay.levelHistory) {
        rollingPeak = std::max(rollingPeak, value);
    }
    const int displayReference = std::max(30, rollingPeak);

    std::array<int, kSignalPoints> amplitudes{};
    std::array<POINT, kSignalPoints> upperOuter{};
    std::array<POINT, kSignalPoints> lowerOuter{};

    for (int index = 0; index < kSignalPoints; ++index) {
        const int level = smoothedHistoryLevel(index);
        const double numerator = static_cast<double>(std::max(0, level - kNoiseFloorMilli));
        const double denominator = static_cast<double>(std::max(1, displayReference - kNoiseFloorMilli));
        const double normalized = std::clamp(numerator / denominator, 0.0, 1.0);
        const double shaped = normalized <= 0.0 ? 0.0 : std::pow(normalized, 0.46);
        const int amplitude = normalized <= 0.0
            ? 0
            : std::max(3, static_cast<int>(std::lround(shaped * maxAmplitude)));
        const int x = left + (index * width) / (kSignalPoints - 1);

        amplitudes[static_cast<std::size_t>(index)] = amplitude;
        upperOuter[static_cast<std::size_t>(index)] = POINT{x, centerY - amplitude};
        lowerOuter[static_cast<std::size_t>(index)] = POINT{x, centerY + amplitude};
    }

    // A restrained filled body gives the wave visual mass. The many contour
    // lines below provide the Schlieren/interference-like structure.
    std::array<POINT, kSignalPoints * 2> ribbon{};
    for (int index = 0; index < kSignalPoints; ++index) {
        ribbon[static_cast<std::size_t>(index)] = upperOuter[static_cast<std::size_t>(index)];
        ribbon[static_cast<std::size_t>(kSignalPoints + index)] =
            lowerOuter[static_cast<std::size_t>(kSignalPoints - 1 - index)];
    }

    HGDIOBJ previousPen = SelectObject(dc, GetStockObject(NULL_PEN));
    HBRUSH ribbonBrush = CreateSolidBrush(RGB(18, 47, 55));
    HGDIOBJ previousBrush = SelectObject(dc, ribbonBrush);
    Polygon(dc, ribbon.data(), static_cast<int>(ribbon.size()));
    SelectObject(dc, previousBrush);
    DeleteObject(ribbonBrush);
    SelectObject(dc, previousPen);

    // Fine vertical filaments give the field the line-stack character of a
    // Schlieren/spectral visualization without pretending to be an FFT.
    HPEN filamentPen = CreatePen(PS_SOLID, 1, RGB(42, 78, 84));
    previousPen = SelectObject(dc, filamentPen);
    for (int index = 0; index < kSignalPoints; ++index) {
        const int amplitude = amplitudes[static_cast<std::size_t>(index)];
        if (amplitude <= 0) {
            continue;
        }
        const int x = left + (index * width) / (kSignalPoints - 1);
        MoveToEx(dc, x, centerY - amplitude, nullptr);
        LineTo(dc, x, centerY + amplitude);
    }
    SelectObject(dc, previousPen);
    DeleteObject(filamentPen);

    static constexpr std::array<double, 10> scales{
        1.00, 0.90, 0.80, 0.70, 0.60, 0.50, 0.41, 0.33, 0.26, 0.19};
    static constexpr std::array<COLORREF, 10> colors{
        RGB(166, 235, 238),
        RGB(132, 211, 218),
        RGB(103, 185, 196),
        RGB(82, 159, 173),
        RGB(66, 136, 151),
        RGB(56, 116, 132),
        RGB(49, 99, 114),
        RGB(43, 84, 98),
        RGB(38, 72, 84),
        RGB(34, 61, 72)};

    std::array<POINT, kSignalPoints> upper{};
    std::array<POINT, kSignalPoints> lower{};

    for (std::size_t layer = 0; layer < scales.size(); ++layer) {
        for (int index = 0; index < kSignalPoints; ++index) {
            const int x = left + (index * width) / (kSignalPoints - 1);
            const int amplitude = static_cast<int>(std::lround(
                amplitudes[static_cast<std::size_t>(index)] * scales[layer]));
            upper[static_cast<std::size_t>(index)] = POINT{x, centerY - amplitude};
            lower[static_cast<std::size_t>(index)] = POINT{x, centerY + amplitude};
        }

        HPEN contourPen = CreatePen(
            PS_SOLID,
            layer == 0 ? 2 : 1,
            colors[layer]);
        previousPen = SelectObject(dc, contourPen);
        Polyline(dc, upper.data(), static_cast<int>(upper.size()));
        Polyline(dc, lower.data(), static_cast<int>(lower.size()));
        SelectObject(dc, previousPen);
        DeleteObject(contourPen);
    }

    HPEN axisPen = CreatePen(PS_SOLID, 1, RGB(48, 58, 61));
    previousPen = SelectObject(dc, axisPen);
    MoveToEx(dc, left, centerY, nullptr);
    LineTo(dc, right, centerY);
    SelectObject(dc, previousPen);
    DeleteObject(axisPen);
}

void drawEnhancedWaveform(HDC dc, const RECT& client) {
    constexpr int kGradientBands = 16;
    static constexpr std::array<double, 4> scales{1.00, 0.78, 0.57, 0.38};
    static constexpr std::array<double, 4> colorStrengths{1.00, 0.78, 0.58, 0.42};

    const int left = 205;
    const int right = client.right - 236;
    const int top = 17;
    const int bottom = client.bottom - 17;
    const int centerY = (top + bottom) / 2;
    const int width = std::max(1, right - left);
    const int maxAmplitude = std::max(18, (bottom - top) / 2 - 7);

    std::array<int, kSignalPoints> amplitudes{};
    for (int index = 0; index < kSignalPoints; ++index) {
        const int level = smoothedHistoryLevel(index);
        const double numerator = static_cast<double>(std::max(0, level - kNoiseFloorMilli));
        const double denominator = static_cast<double>(kEnhancedReferenceMilli - kNoiseFloorMilli);
        const double normalized = std::clamp(numerator / denominator, 0.0, 1.0);
        const double shaped = normalized <= 0.0 ? 0.0 : std::pow(normalized, 0.54);
        amplitudes[static_cast<std::size_t>(index)] = normalized <= 0.0
            ? 0
            : std::max(2, static_cast<int>(std::lround(shaped * maxAmplitude)));
    }

    // Fine color-coded filaments add depth without extra audio analysis. Color
    // is intentionally stylistic; microphone amplitude remains the actual data.
    for (int index = 1; index < kSignalPoints; index += 2) {
        const int amplitude = amplitudes[static_cast<std::size_t>(index)];
        if (amplitude <= 0) {
            continue;
        }
        const int x = left + (index * width) / (kSignalPoints - 1);
        const double position = static_cast<double>(index) / (kSignalPoints - 1);
        HPEN pen = CreatePen(PS_SOLID, 1, fadeToBackground(enhancedGradientColor(position), 0.30));
        HGDIOBJ previousPen = SelectObject(dc, pen);
        MoveToEx(dc, x, centerY - amplitude, nullptr);
        LineTo(dc, x, centerY + amplitude);
        SelectObject(dc, previousPen);
        DeleteObject(pen);
    }

    std::array<POINT, kSignalPoints> upper{};
    std::array<POINT, kSignalPoints> lower{};

    for (std::size_t layer = 0; layer < scales.size(); ++layer) {
        for (int index = 0; index < kSignalPoints; ++index) {
            const int x = left + (index * width) / (kSignalPoints - 1);
            const double organic = 0.92 + 0.08 * std::sin(index * 0.72 + layer * 1.37);
            const int amplitude = static_cast<int>(std::lround(
                amplitudes[static_cast<std::size_t>(index)] * scales[layer] * organic));
            upper[static_cast<std::size_t>(index)] = POINT{x, centerY - amplitude};
            lower[static_cast<std::size_t>(index)] = POINT{x, centerY + amplitude};
        }

        for (int band = 0; band < kGradientBands; ++band) {
            const int start = (band * (kSignalPoints - 1)) / kGradientBands;
            const int end = ((band + 1) * (kSignalPoints - 1)) / kGradientBands;
            if (end <= start) {
                continue;
            }

            const double position = (static_cast<double>(start + end) * 0.5) /
                static_cast<double>(kSignalPoints - 1);
            const COLORREF color = fadeToBackground(
                enhancedGradientColor(position),
                colorStrengths[layer]);
            HPEN pen = CreatePen(PS_SOLID, layer == 0 ? 2 : 1, color);
            HGDIOBJ previousPen = SelectObject(dc, pen);
            Polyline(dc, upper.data() + start, end - start + 1);
            Polyline(dc, lower.data() + start, end - start + 1);
            SelectObject(dc, previousPen);
            DeleteObject(pen);
        }
    }

    // Draw the centerline in the same stable horizontal gradient.
    for (int band = 0; band < kGradientBands; ++band) {
        const int x1 = left + (band * width) / kGradientBands;
        const int x2 = left + ((band + 1) * width) / kGradientBands;
        const double position = (band + 0.5) / static_cast<double>(kGradientBands);
        HPEN pen = CreatePen(
            PS_SOLID,
            1,
            fadeToBackground(enhancedGradientColor(position), 0.70));
        HGDIOBJ previousPen = SelectObject(dc, pen);
        MoveToEx(dc, x1, centerY, nullptr);
        LineTo(dc, x2, centerY);
        SelectObject(dc, previousPen);
        DeleteObject(pen);
    }
}

void drawEnhancedOverlay(HDC dc, const RECT& client) {
    const RECT panel{0, 0, client.right - 1, client.bottom - 1};
    drawRoundedBox(dc, panel, 28, RGB(14, 18, 27), RGB(61, 73, 97), 1);

    // Listening indicator.
    const int centerX = 42;
    const int centerY = client.bottom / 2;
    HPEN outerPen = CreatePen(PS_SOLID, 2, RGB(32, 204, 224));
    HGDIOBJ previousPen = SelectObject(dc, outerPen);
    HGDIOBJ previousBrush = SelectObject(dc, GetStockObject(NULL_BRUSH));
    Ellipse(dc, centerX - 26, centerY - 26, centerX + 26, centerY + 26);
    SelectObject(dc, previousBrush);
    SelectObject(dc, previousPen);
    DeleteObject(outerPen);

    HPEN innerPen = CreatePen(PS_SOLID, 1, RGB(29, 104, 139));
    previousPen = SelectObject(dc, innerPen);
    previousBrush = SelectObject(dc, GetStockObject(NULL_BRUSH));
    Ellipse(dc, centerX - 19, centerY - 19, centerX + 19, centerY + 19);
    SelectObject(dc, previousBrush);
    SelectObject(dc, previousPen);
    DeleteObject(innerPen);

    HBRUSH dotBrush = CreateSolidBrush(RGB(42, 225, 235));
    previousBrush = SelectObject(dc, dotBrush);
    previousPen = SelectObject(dc, GetStockObject(NULL_PEN));
    Ellipse(dc, centerX - 7, centerY - 7, centerX + 7, centerY + 7);
    SelectObject(dc, previousPen);
    SelectObject(dc, previousBrush);
    DeleteObject(dotBrush);

    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, RGB(246, 247, 250));
    HFONT previousFont = reinterpret_cast<HFONT>(SelectObject(dc, g_overlay.enhancedTitleFont));
    RECT title{76, 46, 196, 75};
    DrawTextW(dc, L"Listening", -1, &title, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    SelectObject(dc, g_overlay.enhancedSubtitleFont);
    SetTextColor(dc, RGB(158, 170, 190));
    RECT subtitle{76, 76, 196, 101};
    DrawTextW(dc, L"Universal Dictate", -1, &subtitle, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    drawEnhancedWaveform(dc, client);

    const int dividerX = client.right - 224;
    HPEN dividerPen = CreatePen(PS_SOLID, 1, RGB(48, 58, 76));
    previousPen = SelectObject(dc, dividerPen);
    MoveToEx(dc, dividerX, 34, nullptr);
    LineTo(dc, dividerX, client.bottom - 34);
    SelectObject(dc, previousPen);
    DeleteObject(dividerPen);

    const bool actionSent = g_overlay.actionSent.load(std::memory_order_acquire);
    const RECT okRect = confirmRect(client);
    const RECT xRect = cancelRect(client);
    drawRoundedBox(
        dc,
        okRect,
        16,
        actionSent ? RGB(36, 40, 47) : RGB(17, 30, 40),
        actionSent ? RGB(71, 75, 82) : RGB(35, 197, 219),
        1);
    drawRoundedBox(
        dc,
        xRect,
        16,
        actionSent ? RGB(36, 40, 47) : RGB(31, 22, 37),
        actionSent ? RGB(71, 75, 82) : RGB(221, 58, 168),
        1);

    SelectObject(dc, g_overlay.symbolFont);
    SetTextColor(dc, actionSent ? RGB(145, 145, 145) : RGB(57, 222, 235));
    RECT okIcon{okRect.left + 8, okRect.top, okRect.left + 34, okRect.bottom};
    DrawTextW(dc, L"\x2713", -1, &okIcon, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    SetTextColor(dc, actionSent ? RGB(145, 145, 145) : RGB(239, 76, 186));
    RECT xIcon{xRect.left + 8, xRect.top, xRect.left + 34, xRect.bottom};
    DrawTextW(dc, L"\x00D7", -1, &xIcon, DT_CENTER | DT_SINGLELINE | DT_VCENTER);

    SelectObject(dc, g_overlay.enhancedButtonFont);
    SetTextColor(dc, actionSent ? RGB(155, 155, 155) : RGB(241, 244, 249));
    RECT okLabel{okRect.left + 34, okRect.top, okRect.right - 6, okRect.bottom};
    RECT xLabel{xRect.left + 32, xRect.top, xRect.right - 4, xRect.bottom};
    DrawTextW(dc, L"Insert", -1, &okLabel, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    DrawTextW(dc, L"Discard", -1, &xLabel, DT_CENTER | DT_SINGLELINE | DT_VCENTER);

    SelectObject(dc, previousFont);
}

void drawCompactOverlay(HDC dc, const RECT& client) {
    HBRUSH background = CreateSolidBrush(RGB(21, 24, 26));
    FillRect(dc, &client, background);
    DeleteObject(background);

    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, RGB(245, 245, 245));

    HFONT previousFont = reinterpret_cast<HFONT>(SelectObject(dc, g_overlay.textFont));
    RECT title{14, 34, 98, 56};
    DrawTextW(dc, L"Universal", -1, &title, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    RECT subtitle{14, 58, 98, 84};
    SetTextColor(dc, RGB(183, 191, 194));
    DrawTextW(dc, L"Recording", -1, &subtitle, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    drawSignalField(dc, client);

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

void drawOverlay(HWND window, HDC dc) {
    RECT client{};
    GetClientRect(window, &client);

    if (g_overlay.enhanced) {
        drawEnhancedOverlay(dc, client);
    } else {
        drawCompactOverlay(dc, client);
    }
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
            RECT client{};
            GetClientRect(window, &client);
            const int width = std::max(1L, client.right - client.left);
            const int height = std::max(1L, client.bottom - client.top);

            HDC bufferDc = CreateCompatibleDC(dc);
            HBITMAP bufferBitmap = bufferDc == nullptr
                ? nullptr
                : CreateCompatibleBitmap(dc, width, height);
            if (bufferDc != nullptr && bufferBitmap != nullptr) {
                HGDIOBJ previousBitmap = SelectObject(bufferDc, bufferBitmap);
                drawOverlay(window, bufferDc);
                BitBlt(dc, 0, 0, width, height, bufferDc, 0, 0, SRCCOPY);
                SelectObject(bufferDc, previousBitmap);
                DeleteObject(bufferBitmap);
                DeleteDC(bufferDc);
            } else {
                if (bufferBitmap != nullptr) {
                    DeleteObject(bufferBitmap);
                }
                if (bufferDc != nullptr) {
                    DeleteDC(bufferDc);
                }
                drawOverlay(window, dc);
            }

            EndPaint(window, &paint);
            return 0;
        }
        case WM_DESTROY:
            return 0;
        default:
            return DefWindowProcW(window, message, wParam, lParam);
    }
}

HMONITOR captureOverlayMonitor() {
    const HWND foregroundWindow = GetForegroundWindow();
    if (foregroundWindow != nullptr) {
        const HMONITOR foregroundMonitor =
            MonitorFromWindow(foregroundWindow, MONITOR_DEFAULTTONEAREST);
        if (foregroundMonitor != nullptr) {
            return foregroundMonitor;
        }
    }

    // GetForegroundWindow can transiently return null while activation changes.
    // The cursor is a useful fallback for mouse-started dictation on multi-monitor setups.
    POINT cursor{};
    if (GetCursorPos(&cursor)) {
        const HMONITOR cursorMonitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
        if (cursorMonitor != nullptr) {
            return cursorMonitor;
        }
    }

    return MonitorFromPoint(POINT{0, 0}, MONITOR_DEFAULTTOPRIMARY);
}

RECT overlayWorkArea(HMONITOR monitor) {
    if (monitor != nullptr) {
        MONITORINFO monitorInfo{};
        monitorInfo.cbSize = sizeof(monitorInfo);
        if (GetMonitorInfoW(monitor, &monitorInfo)) {
            return monitorInfo.rcWork;
        }
    }

    RECT workArea{};
    if (SystemParametersInfoW(SPI_GETWORKAREA, 0, &workArea, 0)) {
        return workArea;
    }

    return RECT{0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)};
}

bool createOverlay(HMONITOR targetMonitor, bool enhanced) {
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

    g_overlay.enhanced = enhanced;
    g_overlay.levelMilli = 0;
    g_overlay.levelHistory.fill(0);
    g_overlay.actionSent.store(false, std::memory_order_release);

    const int overlayWidth = enhanced ? kEnhancedOverlayWidth : kOverlayWidth;
    const int overlayHeight = enhanced ? kEnhancedOverlayHeight : kOverlayHeight;
    const RECT workArea = overlayWorkArea(targetMonitor);
    const int x = std::max(workArea.left, workArea.right - overlayWidth - kOverlayMargin);
    const int y = std::max(workArea.top, workArea.bottom - overlayHeight - kOverlayMargin);

    g_overlay.textFont = CreateFontW(
        -15, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
        DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
    g_overlay.symbolFont = CreateFontW(
        -23, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
        DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI Symbol");

    if (enhanced) {
        g_overlay.enhancedTitleFont = CreateFontW(
            -20, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
            DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
        g_overlay.enhancedSubtitleFont = CreateFontW(
            -13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
            DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
        g_overlay.enhancedButtonFont = CreateFontW(
            -14, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
            DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
    }

    g_overlay.window = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        kOverlayClassName,
        L"Universal Dictate",
        WS_POPUP,
        x,
        y,
        overlayWidth,
        overlayHeight,
        nullptr,
        nullptr,
        instance,
        nullptr);

    if (g_overlay.window == nullptr) {
        return false;
    }

    if (enhanced) {
        HRGN region = CreateRoundRectRgn(0, 0, overlayWidth + 1, overlayHeight + 1, 30, 30);
        if (region != nullptr && SetWindowRgn(g_overlay.window, region, FALSE) == 0) {
            DeleteObject(region);
        }
    }

    ShowWindow(g_overlay.window, SW_SHOWNOACTIVATE);
    SetWindowPos(
        g_overlay.window,
        HWND_TOPMOST,
        x,
        y,
        overlayWidth,
        overlayHeight,
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
    if (g_overlay.enhancedTitleFont != nullptr) {
        DeleteObject(g_overlay.enhancedTitleFont);
        g_overlay.enhancedTitleFont = nullptr;
    }
    if (g_overlay.enhancedSubtitleFont != nullptr) {
        DeleteObject(g_overlay.enhancedSubtitleFont);
        g_overlay.enhancedSubtitleFont = nullptr;
    }
    if (g_overlay.enhancedButtonFont != nullptr) {
        DeleteObject(g_overlay.enhancedButtonFont);
        g_overlay.enhancedButtonFont = nullptr;
    }
    g_overlay.enhanced = false;
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
    std::move(
        g_overlay.levelHistory.begin() + 1,
        g_overlay.levelHistory.end(),
        g_overlay.levelHistory.begin());
    g_overlay.levelHistory.back() = g_overlay.levelMilli;

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

bool hasFlag(int argc, char** argv, std::string_view flag) {
    for (int i = 1; i < argc; ++i) {
        if (std::string_view(argv[i]) == flag) {
            return true;
        }
    }

    return false;
}

}  // namespace

int main(int argc, char** argv) {
    const std::string outputPath = parseOutputPath(argc, argv);
    if (outputPath.empty()) {
        std::cerr << "ERROR missing --output path\n";
        return 2;
    }

    const bool overlayEnabled = !hasFlag(argc, argv, "--no-overlay");
    const bool enhancedOverlay = hasFlag(argc, argv, "--enhanced-overlay");

    // Capture the active target monitor immediately, before microphone setup can
    // introduce enough delay for the foreground window to change.
    const HMONITOR overlayMonitor = overlayEnabled ? captureOverlayMonitor() : nullptr;

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

    bool overlayAvailable = false;
    if (overlayEnabled) {
        overlayAvailable = createOverlay(overlayMonitor, enhancedOverlay);
        if (!overlayAvailable) {
            std::cerr << "WARNING recording overlay could not be created; keyboard controls remain available\n";
        }
    }

    std::cout << "READY\n" << std::flush;

    int previousLevel = -1;
    while (command.load(std::memory_order_acquire) == RecorderCommand::Record) {
        if (overlayAvailable) {
            pumpOverlayMessages();
        }

        const int level = captureState.peakMilli.exchange(0, std::memory_order_relaxed);
        if (overlayAvailable) {
            updateOverlayLevel(level);
        }
        if (level != previousLevel) {
            std::printf("LEVEL %.3f\n", static_cast<double>(level) / 1000.0);
            std::fflush(stdout);
            previousLevel = level;
        }
        std::this_thread::sleep_for(kLevelInterval);
    }

    if (overlayEnabled) {
        destroyOverlay();
    }
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

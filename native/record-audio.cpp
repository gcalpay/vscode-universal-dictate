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
#include <gdiplus.h>

#pragma comment(lib, "gdiplus.lib")

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
constexpr int kEnhancedOverlayWidth = 740;
constexpr int kEnhancedOverlayHeight = 128;
constexpr int kOverlayMargin = 18;
constexpr int kSignalPoints = 64;
constexpr int kNoiseFloorMilli = 6;
constexpr int kEnhancedReferenceMilli = 105;
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
    std::atomic<int> signedPeakMilli{0};
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
    int signedPeak = 0;
    const auto sampleCount = static_cast<std::size_t>(frameCount) * kChannels;

    for (std::size_t i = 0; i < sampleCount; ++i) {
        const int sample = static_cast<int>(samples[i]);
        const int magnitude = std::abs(sample);
        if (magnitude > peak) {
            peak = magnitude;
            signedPeak = sample;
        }
    }

    peak = std::min(peak, 32767);
    signedPeak = std::clamp(signedPeak, -32767, 32767);
    state->peakMilli.store((peak * 1000) / 32767, std::memory_order_relaxed);
    state->signedPeakMilli.store((signedPeak * 1000) / 32767, std::memory_order_relaxed);
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
    ULONG_PTR gdiplusToken = 0;
    int levelMilli = 0;
    std::array<int, kSignalPoints> levelHistory{};
    std::array<int, kSignalPoints> enhancedEnvelopeHistory{};
    std::array<int, kSignalPoints> enhancedWaveHistory{};
    bool enhanced = false;
    std::atomic<bool> actionSent{false};
};

OverlayState g_overlay;

RECT confirmRect(const RECT& client) {
    if (g_overlay.enhanced) {
        return RECT{client.right - 166, 41, client.right - 88, 87};
    }
    return RECT{client.right - 92, 30, client.right - 52, client.bottom - 30};
}

RECT cancelRect(const RECT& client) {
    if (g_overlay.enhanced) {
        return RECT{client.right - 82, 41, client.right - 4, 87};
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
    const COLORREF green = RGB(48, 214, 112);
    const COLORREF blue = RGB(50, 124, 255);
    const COLORREF red = RGB(235, 65, 82);
    const COLORREF orange = RGB(255, 155, 54);
    const double t = std::clamp(position, 0.0, 1.0);

    if (t < 1.0 / 3.0) {
        return interpolateColor(green, blue, t * 3.0);
    }
    if (t < 2.0 / 3.0) {
        return interpolateColor(blue, red, (t - 1.0 / 3.0) * 3.0);
    }
    return interpolateColor(red, orange, (t - 2.0 / 3.0) * 3.0);
}

COLORREF fadeToBackground(COLORREF color, double strength) {
    return interpolateColor(RGB(14, 18, 27), color, strength);
}

Gdiplus::Color gdiplusColor(COLORREF color, BYTE alpha = 255) {
    return Gdiplus::Color(alpha, GetRValue(color), GetGValue(color), GetBValue(color));
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

Gdiplus::GraphicsPath roundedRectPath(const RECT& rect, Gdiplus::REAL radius) {
    const Gdiplus::REAL left = static_cast<Gdiplus::REAL>(rect.left);
    const Gdiplus::REAL top = static_cast<Gdiplus::REAL>(rect.top);
    const Gdiplus::REAL right = static_cast<Gdiplus::REAL>(rect.right);
    const Gdiplus::REAL bottom = static_cast<Gdiplus::REAL>(rect.bottom);
    const Gdiplus::REAL diameter = radius * 2.0f;

    Gdiplus::GraphicsPath path;
    path.AddArc(left, top, diameter, diameter, 180.0f, 90.0f);
    path.AddArc(right - diameter, top, diameter, diameter, 270.0f, 90.0f);
    path.AddArc(right - diameter, bottom - diameter, diameter, diameter, 0.0f, 90.0f);
    path.AddArc(left, bottom - diameter, diameter, diameter, 90.0f, 90.0f);
    path.CloseFigure();
    return path;
}

void drawAntialiasedRoundedButton(
    HDC dc,
    const RECT& rect,
    COLORREF fill,
    COLORREF border,
    bool disabled) {
    Gdiplus::Graphics graphics(dc);
    graphics.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    graphics.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHighQuality);

    auto path = roundedRectPath(rect, 12.0f);
    Gdiplus::SolidBrush fillBrush(gdiplusColor(fill));
    Gdiplus::Pen borderPen(gdiplusColor(border, disabled ? 150 : 235), 1.5f);
    graphics.FillPath(&fillBrush, &path);
    graphics.DrawPath(&borderPen, &path);
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

int enhancedVisualAmplitude(int levelMilli) {
    const double numerator = static_cast<double>(std::max(0, levelMilli - kNoiseFloorMilli));
    const double denominator = static_cast<double>(kEnhancedReferenceMilli - kNoiseFloorMilli);
    const double normalized = std::clamp(numerator / denominator, 0.0, 1.0);
    if (normalized <= 0.0) {
        return 0;
    }

    const double shaped = std::pow(normalized, 0.48);
    return std::clamp(static_cast<int>(std::lround(shaped * 1000.0)), 0, 1000);
}

void drawEnhancedWaveform(HDC dc, const RECT& client) {
    constexpr int kGradientBands = 16;
    static constexpr std::array<double, 4> envelopeScales{1.00, 0.72, 0.46, 0.24};
    static constexpr std::array<BYTE, 4> envelopeAlpha{235, 170, 120, 80};

    const int left = 148;
    const int right = client.right - 182;
    const int top = 8;
    const int bottom = client.bottom - 8;
    const int centerY = (top + bottom) / 2;
    const int width = std::max(1, right - left);
    const int maxAmplitude = std::max(22, (bottom - top) / 2 - 4);

    Gdiplus::Graphics graphics(dc);
    graphics.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    graphics.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHighQuality);

    // Stable, fixed-height vertical filaments make the display read like a
    // scientific signal plot. Each filament is computed once when that audio
    // slice arrives, then merely shifts left with the bounded history.
    for (int index = 0; index < kSignalPoints; index += 2) {
        const int envelope = g_overlay.enhancedEnvelopeHistory[static_cast<std::size_t>(index)];
        if (envelope <= 0) {
            continue;
        }
        const Gdiplus::REAL x = static_cast<Gdiplus::REAL>(left) +
            static_cast<Gdiplus::REAL>(index * width) / static_cast<Gdiplus::REAL>(kSignalPoints - 1);
        const Gdiplus::REAL amplitude = static_cast<Gdiplus::REAL>(maxAmplitude * envelope) / 1000.0f;
        const double position = static_cast<double>(index) / static_cast<double>(kSignalPoints - 1);
        Gdiplus::Pen filament(
            gdiplusColor(enhancedGradientColor(position), 58),
            1.0f);
        graphics.DrawLine(
            &filament,
            Gdiplus::PointF(x, static_cast<Gdiplus::REAL>(centerY) - amplitude),
            Gdiplus::PointF(x, static_cast<Gdiplus::REAL>(centerY) + amplitude));
    }

    std::array<Gdiplus::PointF, kSignalPoints> upper{};
    std::array<Gdiplus::PointF, kSignalPoints> lower{};

    // Multiple deterministic nested envelopes create the Fourier/signal-plot
    // aesthetic without FFT work. There is intentionally no time-varying shape
    // perturbation: generated history never wobbles or morphs in place.
    for (std::size_t layer = 0; layer < envelopeScales.size(); ++layer) {
        for (int index = 0; index < kSignalPoints; ++index) {
            const Gdiplus::REAL x = static_cast<Gdiplus::REAL>(left) +
                static_cast<Gdiplus::REAL>(index * width) / static_cast<Gdiplus::REAL>(kSignalPoints - 1);
            const Gdiplus::REAL amplitude =
                static_cast<Gdiplus::REAL>(maxAmplitude) *
                static_cast<Gdiplus::REAL>(g_overlay.enhancedEnvelopeHistory[static_cast<std::size_t>(index)]) /
                1000.0f * static_cast<Gdiplus::REAL>(envelopeScales[layer]);
            upper[static_cast<std::size_t>(index)] =
                Gdiplus::PointF(x, static_cast<Gdiplus::REAL>(centerY) - amplitude);
            lower[static_cast<std::size_t>(index)] =
                Gdiplus::PointF(x, static_cast<Gdiplus::REAL>(centerY) + amplitude);
        }

        for (int band = 0; band < kGradientBands; ++band) {
            const int start = (band * (kSignalPoints - 1)) / kGradientBands;
            const int end = ((band + 1) * (kSignalPoints - 1)) / kGradientBands;
            if (end <= start) {
                continue;
            }
            const double position = (static_cast<double>(start + end) * 0.5) /
                static_cast<double>(kSignalPoints - 1);
            Gdiplus::Pen pen(
                gdiplusColor(enhancedGradientColor(position), envelopeAlpha[layer]),
                layer == 0 ? 1.8f : 1.0f);
            graphics.DrawLines(&pen, upper.data() + start, end - start + 1);
            graphics.DrawLines(&pen, lower.data() + start, end - start + 1);
        }
    }

    // The signed trace comes from the actual sign of the strongest PCM sample
    // in each 50 ms slice. It gives the visualization a genuine waveform-like
    // center trace while the symmetric envelopes continue to encode loudness.
    std::array<Gdiplus::PointF, kSignalPoints> wave{};
    for (int index = 0; index < kSignalPoints; ++index) {
        const Gdiplus::REAL x = static_cast<Gdiplus::REAL>(left) +
            static_cast<Gdiplus::REAL>(index * width) / static_cast<Gdiplus::REAL>(kSignalPoints - 1);
        const Gdiplus::REAL signedAmplitude =
            static_cast<Gdiplus::REAL>(maxAmplitude) * 0.82f *
            static_cast<Gdiplus::REAL>(g_overlay.enhancedWaveHistory[static_cast<std::size_t>(index)]) /
            1000.0f;
        wave[static_cast<std::size_t>(index)] =
            Gdiplus::PointF(x, static_cast<Gdiplus::REAL>(centerY) - signedAmplitude);
    }

    for (int band = 0; band < kGradientBands; ++band) {
        const int start = (band * (kSignalPoints - 1)) / kGradientBands;
        const int end = ((band + 1) * (kSignalPoints - 1)) / kGradientBands;
        if (end <= start) {
            continue;
        }
        const double position = (static_cast<double>(start + end) * 0.5) /
            static_cast<double>(kSignalPoints - 1);
        Gdiplus::Pen wavePen(gdiplusColor(enhancedGradientColor(position), 245), 1.6f);
        graphics.DrawLines(&wavePen, wave.data() + start, end - start + 1);
    }

    for (int band = 0; band < kGradientBands; ++band) {
        const Gdiplus::REAL x1 = static_cast<Gdiplus::REAL>(left + (band * width) / kGradientBands);
        const Gdiplus::REAL x2 = static_cast<Gdiplus::REAL>(left + ((band + 1) * width) / kGradientBands);
        const double position = (band + 0.5) / static_cast<double>(kGradientBands);
        Gdiplus::Pen axis(gdiplusColor(enhancedGradientColor(position), 120), 0.8f);
        graphics.DrawLine(
            &axis,
            Gdiplus::PointF(x1, static_cast<Gdiplus::REAL>(centerY)),
            Gdiplus::PointF(x2, static_cast<Gdiplus::REAL>(centerY)));
    }
}

void drawEnhancedOverlay(HDC dc, const RECT& client) {
    const RECT panel{0, 0, client.right - 1, client.bottom - 1};
    drawRoundedBox(dc, panel, 24, RGB(14, 18, 27), RGB(59, 70, 91), 1);

    // GDI+ anti-aliasing removes the jagged small-circle appearance seen in the
    // first physical acceptance passes without changing the Win32 overlay model.
    {
        Gdiplus::Graphics graphics(dc);
        graphics.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
        graphics.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHighQuality);
        const Gdiplus::REAL centerX = 28.0f;
        const Gdiplus::REAL centerY = static_cast<Gdiplus::REAL>(client.bottom) / 2.0f;

        Gdiplus::SolidBrush outerBrush(gdiplusColor(RGB(48, 214, 112), 245));
        graphics.FillEllipse(&outerBrush, centerX - 18.0f, centerY - 18.0f, 36.0f, 36.0f);

        Gdiplus::SolidBrush innerBrush(gdiplusColor(RGB(14, 18, 27)));
        graphics.FillEllipse(&innerBrush, centerX - 15.0f, centerY - 15.0f, 30.0f, 30.0f);

        Gdiplus::Pen innerRing(gdiplusColor(RGB(50, 124, 255), 155), 1.0f);
        graphics.DrawEllipse(&innerRing, centerX - 12.0f, centerY - 12.0f, 24.0f, 24.0f);

        Gdiplus::SolidBrush dotBrush(gdiplusColor(RGB(50, 124, 255)));
        graphics.FillEllipse(&dotBrush, centerX - 4.5f, centerY - 4.5f, 9.0f, 9.0f);
    }

    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, RGB(244, 246, 250));
    HFONT previousFont = reinterpret_cast<HFONT>(SelectObject(dc, g_overlay.enhancedTitleFont));
    RECT title{52, 39, 143, 63};
    DrawTextW(dc, L"Listening", -1, &title, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    SelectObject(dc, g_overlay.enhancedSubtitleFont);
    SetTextColor(dc, RGB(151, 164, 184));
    RECT subtitle{52, 64, 143, 84};
    DrawTextW(dc, L"Universal Dictate", -1, &subtitle, DT_LEFT | DT_SINGLELINE | DT_VCENTER);

    drawEnhancedWaveform(dc, client);

    const int dividerX = client.right - 174;
    HPEN dividerPen = CreatePen(PS_SOLID, 1, RGB(44, 53, 69));
    HGDIOBJ previousPen = SelectObject(dc, dividerPen);
    MoveToEx(dc, dividerX, 26, nullptr);
    LineTo(dc, dividerX, client.bottom - 26);
    SelectObject(dc, previousPen);
    DeleteObject(dividerPen);

    const bool actionSent = g_overlay.actionSent.load(std::memory_order_acquire);
    const RECT okRect = confirmRect(client);
    const RECT xRect = cancelRect(client);
    drawAntialiasedRoundedButton(
        dc,
        okRect,
        actionSent ? RGB(35, 39, 46) : RGB(15, 29, 24),
        actionSent ? RGB(71, 75, 82) : RGB(48, 214, 112),
        actionSent);
    drawAntialiasedRoundedButton(
        dc,
        xRect,
        actionSent ? RGB(35, 39, 46) : RGB(31, 20, 23),
        actionSent ? RGB(71, 75, 82) : RGB(235, 65, 82),
        actionSent);

    SelectObject(dc, g_overlay.enhancedButtonFont);
    SetTextColor(dc, actionSent ? RGB(150, 150, 150) : RGB(238, 244, 240));
    RECT okLabel = okRect;
    DrawTextW(dc, L"Insert", -1, &okLabel, DT_CENTER | DT_SINGLELINE | DT_VCENTER);
    SetTextColor(dc, actionSent ? RGB(150, 150, 150) : RGB(248, 238, 239));
    RECT xLabel = xRect;
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
    g_overlay.enhancedEnvelopeHistory.fill(0);
    g_overlay.enhancedWaveHistory.fill(0);
    g_overlay.actionSent.store(false, std::memory_order_release);

    if (enhanced) {
        Gdiplus::GdiplusStartupInput startupInput;
        if (Gdiplus::GdiplusStartup(&g_overlay.gdiplusToken, &startupInput, nullptr) != Gdiplus::Ok) {
            g_overlay.gdiplusToken = 0;
            return false;
        }
    }

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
            -17, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
            DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
        g_overlay.enhancedSubtitleFont = CreateFontW(
            -11, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
            DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
        g_overlay.enhancedButtonFont = CreateFontW(
            -13, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
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
        HRGN region = CreateRoundRectRgn(0, 0, overlayWidth + 1, overlayHeight + 1, 26, 26);
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
    if (g_overlay.gdiplusToken != 0) {
        Gdiplus::GdiplusShutdown(g_overlay.gdiplusToken);
        g_overlay.gdiplusToken = 0;
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

void updateOverlayLevel(int levelMilli, int signedPeakMilli) {
    g_overlay.levelMilli = std::clamp(levelMilli, 0, 1000);
    std::move(
        g_overlay.levelHistory.begin() + 1,
        g_overlay.levelHistory.end(),
        g_overlay.levelHistory.begin());
    g_overlay.levelHistory.back() = g_overlay.levelMilli;

    if (g_overlay.enhanced) {
        const int visualAmplitude = enhancedVisualAmplitude(g_overlay.levelMilli);
        const int sign = signedPeakMilli < 0 ? -1 : (signedPeakMilli > 0 ? 1 : 0);

        std::move(
            g_overlay.enhancedEnvelopeHistory.begin() + 1,
            g_overlay.enhancedEnvelopeHistory.end(),
            g_overlay.enhancedEnvelopeHistory.begin());
        g_overlay.enhancedEnvelopeHistory.back() = visualAmplitude;

        std::move(
            g_overlay.enhancedWaveHistory.begin() + 1,
            g_overlay.enhancedWaveHistory.end(),
            g_overlay.enhancedWaveHistory.begin());
        g_overlay.enhancedWaveHistory.back() = visualAmplitude * sign;
    }

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
        const int signedPeak = captureState.signedPeakMilli.exchange(0, std::memory_order_relaxed);
        if (overlayAvailable) {
            updateOverlayLevel(level, signedPeak);
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

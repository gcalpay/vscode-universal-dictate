/* Multilingual, clipped preview text on the existing GDI surface. SPDX-License-Identifier: MIT */
#pragma once
#include "preview-layout.h"
#include <d2d1.h>
#include <dwrite.h>
#include <wrl/client.h>
#include <algorithm>
#include <string>
#include <vector>
#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "dwrite.lib")

namespace universal_dictate::preview {
using Microsoft::WRL::ComPtr;

inline bool rightToLeft(const std::wstring& text) {
    std::vector<WORD> types(text.size());
    if (text.empty() || !GetStringTypeW(CT_CTYPE2, text.data(), static_cast<int>(text.size()), types.data()))
        return false;
    for (const WORD type : types) {
        if (type == C2_RIGHTTOLEFT) return true;
        if (type == C2_LEFTTORIGHT) return false;
    }
    return false;
}

class TextRenderer {
public:
    void reset() noexcept {
        layout_.Reset(); format_.Reset(); brush_.Reset(); target_.Reset();
        drawFactory_.Reset(); writeFactory_.Reset();
        text_.clear(); width_ = height_ = fontHeight_ = 0; maxLines_ = 0;
        offset_ = inset_ = 0; visibleLines_ = skippedLines_ = 0; unavailable_ = false;
    }

    // No HWND operations, input events or clipboard access. Initialization is lazy:
    // Off does not construct a DirectWrite/Direct2D factory or a text layout.
    bool draw(HDC dc, const TextLayout& geometry, const std::wstring& text) noexcept {
        if (unavailable_) return false;
        try {
            if (!prepare(geometry, text)) { unavailable_ = true; return false; }
            const RECT bounds{geometry.text.left, geometry.text.top, geometry.text.right, geometry.text.bottom};
            if (!ensureTarget() || FAILED(target_->BindDC(dc, &bounds))) return false;
            target_->BeginDraw();
            // Coordinates/font sizes are already device pixels. A 96-DPI target
            // avoids double scaling when Windows moves the overlay between monitors.
            target_->SetDpi(96, 96);
            target_->SetTransform(D2D1::Matrix3x2F::Identity());
            target_->Clear(D2D1::ColorF(14.0f/255, 18.0f/255, 27.0f/255));
            target_->PushAxisAlignedClip(D2D1::RectF(0, inset_, static_cast<float>(width_),
                static_cast<float>(height_) - inset_), D2D1_ANTIALIAS_MODE_ALIASED);
            target_->DrawTextLayout(D2D1::Point2F(0, -offset_), layout_.Get(), brush_.Get(),
                D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
            target_->PopAxisAlignedClip();
            const HRESULT result = target_->EndDraw();
            if (result == D2DERR_RECREATE_TARGET) { brush_.Reset(); target_.Reset(); }
            return SUCCEEDED(result);
        } catch (...) {
            // Presentation errors must not escape WM_PAINT or stop microphone capture.
            unavailable_ = true;
            return false;
        }
    }

    unsigned int skippedLines() const noexcept { return skippedLines_; }
    unsigned int visibleLines() const noexcept { return visibleLines_; }
    bool initialized() const noexcept { return writeFactory_ != nullptr; }

private:
    bool ensureTarget() {
        if (target_) return true;
        if (!drawFactory_ && FAILED(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, drawFactory_.GetAddressOf())))
            return false;
        const auto properties = D2D1::RenderTargetProperties(D2D1_RENDER_TARGET_TYPE_SOFTWARE,
            D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_IGNORE), 96, 96);
        if (FAILED(drawFactory_->CreateDCRenderTarget(&properties, target_.ReleaseAndGetAddressOf()))) return false;
        if (FAILED(target_->CreateSolidColorBrush(D2D1::ColorF(222.0f/255, 230.0f/255, 242.0f/255),
            brush_.ReleaseAndGetAddressOf()))) { target_.Reset(); return false; }
        target_->SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);
        return true;
    }

    bool prepare(const TextLayout& geometry, const std::wstring& text) {
        const int width = geometry.text.right - geometry.text.left;
        const int height = geometry.text.bottom - geometry.text.top;
        if (text.size() > 2048 || width <= 0 || height <= 0 || geometry.fontHeight <= 0 || !geometry.maxLines)
            return false;
        if (layout_ && text_ == text && width_ == width && height_ == height &&
            fontHeight_ == geometry.fontHeight && maxLines_ == geometry.maxLines) return true;
        if (!writeFactory_ && FAILED(DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED,
            __uuidof(IDWriteFactory), reinterpret_cast<IUnknown**>(writeFactory_.GetAddressOf())))) return false;
        if (FAILED(writeFactory_->CreateTextFormat(L"Segoe UI", nullptr, DWRITE_FONT_WEIGHT_NORMAL,
            DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL, static_cast<float>(geometry.fontHeight),
            L"", format_.ReleaseAndGetAddressOf()))) return false;
        format_->SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);
        format_->SetReadingDirection(rightToLeft(text) ? DWRITE_READING_DIRECTION_RIGHT_TO_LEFT : DWRITE_READING_DIRECTION_LEFT_TO_RIGHT);
        format_->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
        // Keep natural line metrics so fallback fonts/diacritics are not cropped by
        // a guessed Latin baseline. Count only complete lines that fit the viewport.
        std::size_t start = 0;
        skippedLines_ = 0;
        for (;;) {
            if (FAILED(writeFactory_->CreateTextLayout(text.data() + start, static_cast<UINT32>(text.size() - start),
                format_.Get(), static_cast<float>(width), 100000.0f, layout_.ReleaseAndGetAddressOf()))) return false;
            UINT32 count = 0;
            const auto measured = layout_->GetLineMetrics(nullptr, 0, &count);
            if ((FAILED(measured) && measured != E_NOT_SUFFICIENT_BUFFER) || count == 0 || count > 2049) return false;
            std::vector<DWRITE_LINE_METRICS> lines(count);
            if (FAILED(layout_->GetLineMetrics(lines.data(), count, &count))) return false;
            float used = 0;
            UINT32 first = count;
            while (first > 0 && count - first < geometry.maxLines && used + lines[first-1].height <= height + 0.01f) {
                used += lines[--first].height;
            }
            if (first == count) return false; // Do not display a vertically clipped line.
            if (first == 0) {
                inset_ = (height - used) / 2.0f;
                offset_ = -inset_;
                visibleLines_ = count;
                break;
            }
            // DirectWrite's shaped line boundaries preserve clusters/surrogates.
            // Re-layout only that suffix: clipping a translated full layout can
            // leak overhanging ink from the preceding, supposedly hidden line.
            std::size_t removed = 0;
            for (UINT32 i = 0; i < first; ++i) removed += lines[i].length;
            if (!removed || removed > text.size() - start) return false;
            start += removed; // Strictly advances, bounded by the 2048-unit input.
            skippedLines_ += first;
        }
        text_ = text; width_ = width; height_ = height;
        fontHeight_ = geometry.fontHeight; maxLines_ = geometry.maxLines;
        return true;
    }

    ComPtr<IDWriteFactory> writeFactory_;
    ComPtr<IDWriteTextFormat> format_;
    ComPtr<IDWriteTextLayout> layout_;
    ComPtr<ID2D1Factory> drawFactory_;
    ComPtr<ID2D1DCRenderTarget> target_;
    ComPtr<ID2D1SolidColorBrush> brush_;
    std::wstring text_;
    int width_ = 0, height_ = 0, fontHeight_ = 0;
    unsigned int maxLines_ = 0, visibleLines_ = 0, skippedLines_ = 0;
    float offset_ = 0, inset_ = 0;
    bool unavailable_ = false;
};
} // namespace universal_dictate::preview

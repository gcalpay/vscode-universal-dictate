/* Native symbols and labelled hover help; no bundled fonts. SPDX-License-Identifier: MIT */
#pragma once
#include <commctrl.h>
#include "overlay-layout.h"
#pragma comment(lib, "comctl32.lib")

// The current TOOLINFOW layout requires the v6 common-controls assembly.
// Linking comctl32.lib alone leaves an unmanifested executable on v5, where
// TTM_ADDTOOLW can reject the structure and silently leave every label absent.
// Embed the dependency in both the recorder and tests using this header; v6
// is supplied by Windows, so this does not add a download or bundled DLL.
#pragma comment(linker, "\"/manifestdependency:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")

namespace universal_dictate {
enum class ButtonSymbol { Insert, Discard };

inline void drawButtonSymbol(HDC dc, const RECT& box, ButtonSymbol symbol, UINT dpi, COLORREF color) {
    Gdiplus::Graphics graphics(dc);
    graphics.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    graphics.SetPixelOffsetMode(Gdiplus::PixelOffsetModeHighQuality);
    const float unit = static_cast<float>(dpi == 0 ? 96 : dpi) / 96.0f;
    const float x = static_cast<float>(box.left + box.right) / 2.0f;
    const float y = static_cast<float>(box.top + box.bottom) / 2.0f;
    const Gdiplus::Color ink(255, GetRValue(color), GetGValue(color), GetBValue(color));
    Gdiplus::Pen pen(ink, 1.8f * unit);
    pen.SetStartCap(Gdiplus::LineCapRound); pen.SetEndCap(Gdiplus::LineCapRound);
    switch (symbol) {
        case ButtonSymbol::Insert:
            graphics.DrawLine(&pen, x-6*unit, y, x-1.5f*unit, y+4*unit);
            graphics.DrawLine(&pen, x-1.5f*unit, y+4*unit, x+6*unit, y-5*unit);
            break;
        case ButtonSymbol::Discard:
            graphics.DrawLine(&pen, x-5*unit, y-5*unit, x+5*unit, y+5*unit);
            graphics.DrawLine(&pen, x-5*unit, y+5*unit, x+5*unit, y-5*unit);
            break;
    }
}

class ButtonTooltips {
public:
    void create(HWND owner, const EnhancedOverlayLayout& layout) {
        reset();
        INITCOMMONCONTROLSEX common{sizeof(common), ICC_WIN95_CLASSES};
        if (!InitCommonControlsEx(&common)) return;
        owner_ = owner;
        window_ = CreateWindowExW(WS_EX_TOPMOST | WS_EX_NOACTIVATE, TOOLTIPS_CLASSW, nullptr,
            WS_POPUP | TTS_ALWAYSTIP | TTS_NOPREFIX, CW_USEDEFAULT, CW_USEDEFAULT,
            CW_USEDEFAULT, CW_USEDEFAULT, owner, nullptr, GetModuleHandleW(nullptr), nullptr);
        if (!window_) return;
        SendMessageW(window_, TTM_SETMAXTIPWIDTH, 0, 320);
        for (UINT_PTR id = 1; id <= 2; ++id) {
            auto tool = info(id);
            tool.uFlags = TTF_SUBCLASS;
            tool.lpszText = const_cast<wchar_t*>(label(id));
            if (!SendMessageW(window_, TTM_ADDTOOLW, 0, reinterpret_cast<LPARAM>(&tool))) {
                // A window with missing tools is not a usable tooltip control.
                // Release partial registration rather than reporting it as ready.
                reset();
                return;
            }
        }
        update(layout);
    }
    void update(const EnhancedOverlayLayout& layout) {
        if (!window_) return;
        const OverlayRect boxes[]{layout.confirmButton, layout.cancelButton};
        for (UINT_PTR id = 1; id <= 2; ++id) {
            auto tool = info(id);
            const auto& box = boxes[id-1];
            tool.rect = RECT{box.left, box.top, box.right, box.bottom};
            tool.lpszText = const_cast<wchar_t*>(label(id));
            SendMessageW(window_, TTM_NEWTOOLRECTW, 0, reinterpret_cast<LPARAM>(&tool));
            SendMessageW(window_, TTM_UPDATETIPTEXTW, 0, reinterpret_cast<LPARAM>(&tool));
        }
        hide();
    }
    void hide() const { if (window_) SendMessageW(window_, TTM_POP, 0, 0); }
    void reset() noexcept {
        if (window_) DestroyWindow(window_);
        window_ = nullptr; owner_ = nullptr;
    }
    HWND window() const noexcept { return window_; }
private:
    HWND window_ = nullptr, owner_ = nullptr;
    TOOLINFOW info(UINT_PTR id) const {
        TOOLINFOW tool{}; tool.cbSize = sizeof(tool); tool.hwnd = owner_; tool.uId = id;
        return tool;
    }
    static const wchar_t* label(UINT_PTR id) {
        return id == 1 ? L"Insert: finish recording, transcribe and insert once"
                       : L"Discard: cancel this recording";
    }
};
} // namespace universal_dictate

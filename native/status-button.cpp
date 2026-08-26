/*
 * Universal Dictate - non-activating Dictate/Stop button
 *
 * This helper owns a small Win32 launcher shown next to the focused VS Code
 * window. It accepts primary mouse clicks without activating itself, so the
 * current editor or extension composer keeps keyboard focus.
 *
 * Protocol (stdout):
 *   READY
 *   ACTION TOGGLE
 *
 * Commands (stdin):
 *   FOCUS 0|1
 *   STATE IDLE|RECORDING|HIDDEN
 *   THEME DARK|LIGHT|HIGH_CONTRAST
 *   EXIT
 *
 * SPDX-License-Identifier: MIT
 */

#define UNICODE
#define _UNICODE
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <windowsx.h>

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cwctype>
#include <iostream>
#include <memory>
#include <string>
#include <string_view>
#include <thread>

namespace {

constexpr wchar_t kWindowClassName[] = L"UniversalDictateStatusButton";
constexpr UINT kControlMessage = WM_APP + 1;
constexpr UINT_PTR kPositionTimer = 1;
constexpr int kLogicalWidth = 108;
constexpr int kLogicalHeight = 28;
constexpr int kLogicalRightMargin = 10;
constexpr int kLogicalBottomInset = 28;

enum class ButtonState {
    Hidden,
    Idle,
    Recording,
};

enum class ButtonTheme {
    Dark,
    Light,
    HighContrast,
};

enum class ControlKind {
    Focus,
    State,
    Theme,
    Exit,
};

struct ControlMessage {
    ControlKind kind = ControlKind::Exit;
    bool focused = false;
    ButtonState state = ButtonState::Hidden;
    ButtonTheme theme = ButtonTheme::Dark;
};

struct ButtonWindowState {
    HWND window = nullptr;
    HWND targetWindow = nullptr;
    DWORD targetProcessId = 0;
    HFONT font = nullptr;
    std::wstring hostExecutable;
    ButtonState state = ButtonState::Hidden;
    ButtonTheme theme = ButtonTheme::Dark;
    bool focused = false;
    bool hovered = false;
    bool pressed = false;
    bool actionPending = false;
    UINT dpi = 96;
    int regionWidth = 0;
    int regionHeight = 0;
};

ButtonWindowState g_button;

int scaleForDpi(int logical, UINT dpi) {
    return MulDiv(logical, static_cast<int>(dpi), 96);
}

std::wstring normalizedExecutablePath(std::wstring path) {
    std::transform(path.begin(), path.end(), path.begin(), [](wchar_t value) {
        return static_cast<wchar_t>(std::towlower(value));
    });
    return path;
}

std::wstring processExecutable(DWORD processId) {
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
    if (process == nullptr) {
        return {};
    }

    std::wstring path(32768, L'\0');
    DWORD size = static_cast<DWORD>(path.size());
    if (!QueryFullProcessImageNameW(process, 0, path.data(), &size)) {
        CloseHandle(process);
        return {};
    }

    CloseHandle(process);
    path.resize(size);
    return normalizedExecutablePath(std::move(path));
}

bool isEligibleTarget(HWND window, DWORD& processId) {
    processId = 0;
    if (window == nullptr || !IsWindow(window) || !IsWindowVisible(window)) {
        return false;
    }

    GetWindowThreadProcessId(window, &processId);
    if (processId == 0 || processId == GetCurrentProcessId()) {
        return false;
    }

    return !g_button.hostExecutable.empty() &&
        processExecutable(processId) == g_button.hostExecutable;
}

bool targetIsValid() {
    if (g_button.targetWindow == nullptr ||
        !IsWindow(g_button.targetWindow) ||
        !IsWindowVisible(g_button.targetWindow)) {
        return false;
    }

    DWORD processId = 0;
    GetWindowThreadProcessId(g_button.targetWindow, &processId);
    return processId != 0 && processId == g_button.targetProcessId;
}

void recreateFont(UINT dpi) {
    if (g_button.font != nullptr) {
        DeleteObject(g_button.font);
        g_button.font = nullptr;
    }

    g_button.font = CreateFontW(
        -scaleForDpi(13, dpi),
        0,
        0,
        0,
        FW_SEMIBOLD,
        FALSE,
        FALSE,
        FALSE,
        DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS,
        CLIP_DEFAULT_PRECIS,
        CLEARTYPE_QUALITY,
        DEFAULT_PITCH | FF_DONTCARE,
        L"Segoe UI");
}

void hideButton() {
    if (g_button.window != nullptr) {
        ShowWindow(g_button.window, SW_HIDE);
    }
}

bool targetIsForeground() {
    const HWND foreground = GetAncestor(GetForegroundWindow(), GA_ROOT);
    return foreground != nullptr && foreground == g_button.targetWindow;
}

void updateButtonPlacement() {
    if (g_button.window == nullptr || !g_button.focused || g_button.state == ButtonState::Hidden) {
        hideButton();
        return;
    }

    if (!targetIsValid() || IsIconic(g_button.targetWindow) || !targetIsForeground()) {
        hideButton();
        return;
    }

    RECT client{};
    if (!GetClientRect(g_button.targetWindow, &client)) {
        hideButton();
        return;
    }

    POINT bottomRight{client.right, client.bottom};
    if (!ClientToScreen(g_button.targetWindow, &bottomRight)) {
        hideButton();
        return;
    }

    const UINT dpi = GetDpiForWindow(g_button.targetWindow);
    if (dpi != 0 && dpi != g_button.dpi) {
        g_button.dpi = dpi;
        recreateFont(dpi);
    }

    const int width = scaleForDpi(kLogicalWidth, g_button.dpi);
    const int height = scaleForDpi(kLogicalHeight, g_button.dpi);
    const int x = bottomRight.x - scaleForDpi(kLogicalRightMargin, g_button.dpi) - width;
    const int y = bottomRight.y - scaleForDpi(kLogicalBottomInset, g_button.dpi) - height;

    if (width != g_button.regionWidth || height != g_button.regionHeight) {
        HRGN region = CreateRoundRectRgn(0, 0, width + 1, height + 1, height, height);
        if (region != nullptr) {
            if (SetWindowRgn(g_button.window, region, FALSE) != 0) {
                g_button.regionWidth = width;
                g_button.regionHeight = height;
            } else {
                DeleteObject(region);
            }
        }
    }

    SetWindowPos(
        g_button.window,
        HWND_TOPMOST,
        x,
        y,
        width,
        height,
        SWP_NOACTIVATE | SWP_SHOWWINDOW);
    InvalidateRect(g_button.window, nullptr, FALSE);
}

void setFocused(bool focused) {
    g_button.focused = focused;
    g_button.actionPending = false;

    if (!focused) {
        g_button.targetWindow = nullptr;
        g_button.targetProcessId = 0;
        hideButton();
        return;
    }

    HWND foreground = GetAncestor(GetForegroundWindow(), GA_ROOT);
    DWORD processId = 0;
    if (isEligibleTarget(foreground, processId)) {
        g_button.targetWindow = foreground;
        g_button.targetProcessId = processId;
    } else {
        g_button.targetWindow = nullptr;
        g_button.targetProcessId = 0;
    }
    updateButtonPlacement();
}

void setState(ButtonState state) {
    g_button.state = state;
    g_button.actionPending = false;
    updateButtonPlacement();
}

void setTheme(ButtonTheme theme) {
    g_button.theme = theme;
    if (g_button.window != nullptr) {
        InvalidateRect(g_button.window, nullptr, FALSE);
    }
}

void buttonColors(COLORREF& background, COLORREF& border, COLORREF& foreground, COLORREF& accent) {
    if (g_button.theme == ButtonTheme::HighContrast) {
        background = GetSysColor(COLOR_WINDOW);
        border = GetSysColor(COLOR_WINDOWTEXT);
        foreground = GetSysColor(COLOR_WINDOWTEXT);
        accent = GetSysColor(COLOR_HIGHLIGHT);
        return;
    }

    if (g_button.theme == ButtonTheme::Light) {
        background = g_button.pressed
            ? RGB(210, 210, 210)
            : (g_button.hovered ? RGB(225, 225, 225) : RGB(242, 242, 242));
        border = RGB(185, 185, 185);
        foreground = RGB(35, 35, 35);
        accent = g_button.state == ButtonState::Recording ? RGB(190, 48, 48) : RGB(62, 125, 72);
        return;
    }

    background = g_button.pressed
        ? RGB(52, 52, 52)
        : (g_button.hovered ? RGB(62, 62, 62) : RGB(45, 45, 45));
    border = RGB(88, 88, 88);
    foreground = RGB(245, 245, 245);
    accent = g_button.state == ButtonState::Recording ? RGB(235, 82, 82) : RGB(88, 190, 112);
}

void drawButton(HWND window, HDC dc) {
    RECT client{};
    GetClientRect(window, &client);

    COLORREF background{};
    COLORREF border{};
    COLORREF foreground{};
    COLORREF accent{};
    buttonColors(background, border, foreground, accent);

    HBRUSH backgroundBrush = CreateSolidBrush(background);
    HPEN borderPen = CreatePen(PS_SOLID, 1, border);
    HGDIOBJ previousBrush = SelectObject(dc, backgroundBrush);
    HGDIOBJ previousPen = SelectObject(dc, borderPen);
    const int radius = std::max(4, static_cast<int>((client.bottom - client.top) / 2));
    RoundRect(dc, client.left, client.top, client.right, client.bottom, radius, radius);
    SelectObject(dc, previousPen);
    SelectObject(dc, previousBrush);
    DeleteObject(borderPen);
    DeleteObject(backgroundBrush);

    const int centerY = (client.top + client.bottom) / 2;
    const int dotRadius = scaleForDpi(4, g_button.dpi);
    const int dotX = scaleForDpi(15, g_button.dpi);
    HBRUSH accentBrush = CreateSolidBrush(accent);
    HGDIOBJ oldBrush = SelectObject(dc, accentBrush);
    HGDIOBJ oldPen = SelectObject(dc, GetStockObject(NULL_PEN));
    Ellipse(dc, dotX - dotRadius, centerY - dotRadius, dotX + dotRadius, centerY + dotRadius);
    SelectObject(dc, oldPen);
    SelectObject(dc, oldBrush);
    DeleteObject(accentBrush);

    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, foreground);
    HFONT previousFont = reinterpret_cast<HFONT>(SelectObject(dc, g_button.font));
    RECT textRect{
        scaleForDpi(27, g_button.dpi),
        client.top,
        client.right - scaleForDpi(8, g_button.dpi),
        client.bottom};
    const wchar_t* label = g_button.state == ButtonState::Recording ? L"Stop" : L"Dictate";
    DrawTextW(dc, label, -1, &textRect, DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX);
    SelectObject(dc, previousFont);
}

void emitToggleAction() {
    if (g_button.actionPending) {
        return;
    }

    g_button.actionPending = true;
    std::cout << "ACTION TOGGLE\n" << std::flush;
}

LRESULT CALLBACK buttonWindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_MOUSEACTIVATE:
            return MA_NOACTIVATE;
        case WM_NCHITTEST:
            return HTCLIENT;
        case WM_SETCURSOR:
            SetCursor(LoadCursorW(nullptr, IDC_HAND));
            return TRUE;
        case WM_ERASEBKGND:
            return 1;
        case WM_MOUSEMOVE: {
            if (!g_button.hovered) {
                g_button.hovered = true;
                TRACKMOUSEEVENT tracking{};
                tracking.cbSize = sizeof(tracking);
                tracking.dwFlags = TME_LEAVE;
                tracking.hwndTrack = window;
                TrackMouseEvent(&tracking);
                InvalidateRect(window, nullptr, FALSE);
            }
            return 0;
        }
        case WM_MOUSELEAVE:
            g_button.hovered = false;
            g_button.pressed = false;
            InvalidateRect(window, nullptr, FALSE);
            return 0;
        case WM_LBUTTONDOWN:
            if (!g_button.actionPending) {
                g_button.pressed = true;
                SetCapture(window);
                InvalidateRect(window, nullptr, FALSE);
            }
            return 0;
        case WM_LBUTTONUP: {
            const bool wasPressed = g_button.pressed;
            g_button.pressed = false;
            if (GetCapture() == window) {
                ReleaseCapture();
            }

            RECT client{};
            GetClientRect(window, &client);
            POINT point{GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
            if (wasPressed && PtInRect(&client, point)) {
                emitToggleAction();
            }
            InvalidateRect(window, nullptr, FALSE);
            return 0;
        }
        case WM_PAINT: {
            PAINTSTRUCT paint{};
            HDC dc = BeginPaint(window, &paint);
            RECT client{};
            GetClientRect(window, &client);
            const int width = std::max(1L, client.right - client.left);
            const int height = std::max(1L, client.bottom - client.top);

            HDC buffer = CreateCompatibleDC(dc);
            HBITMAP bitmap = buffer == nullptr ? nullptr : CreateCompatibleBitmap(dc, width, height);
            if (buffer != nullptr && bitmap != nullptr) {
                HGDIOBJ previousBitmap = SelectObject(buffer, bitmap);
                drawButton(window, buffer);
                BitBlt(dc, 0, 0, width, height, buffer, 0, 0, SRCCOPY);
                SelectObject(buffer, previousBitmap);
                DeleteObject(bitmap);
                DeleteDC(buffer);
            } else {
                if (bitmap != nullptr) {
                    DeleteObject(bitmap);
                }
                if (buffer != nullptr) {
                    DeleteDC(buffer);
                }
                drawButton(window, dc);
            }

            EndPaint(window, &paint);
            return 0;
        }
        case WM_TIMER:
            if (wParam == kPositionTimer) {
                updateButtonPlacement();
            }
            return 0;
        case kControlMessage: {
            std::unique_ptr<ControlMessage> control(reinterpret_cast<ControlMessage*>(lParam));
            if (!control) {
                return 0;
            }

            switch (control->kind) {
                case ControlKind::Focus:
                    setFocused(control->focused);
                    return 0;
                case ControlKind::State:
                    setState(control->state);
                    return 0;
                case ControlKind::Theme:
                    setTheme(control->theme);
                    return 0;
                case ControlKind::Exit:
                    DestroyWindow(window);
                    return 0;
            }
            return 0;
        }
        case WM_DESTROY:
            KillTimer(window, kPositionTimer);
            PostQuitMessage(0);
            return 0;
        default:
            return DefWindowProcW(window, message, wParam, lParam);
    }
}

void postControl(ControlMessage control) {
    if (g_button.window == nullptr) {
        return;
    }

    auto* message = new ControlMessage(control);
    if (!PostMessageW(g_button.window, kControlMessage, 0, reinterpret_cast<LPARAM>(message))) {
        delete message;
    }
}

std::string uppercase(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char character) {
        return static_cast<char>(std::toupper(character));
    });
    return value;
}

void inputLoop() {
    std::string line;
    while (std::getline(std::cin, line)) {
        const std::string command = uppercase(line);
        if (command == "FOCUS 1") {
            postControl(ControlMessage{ControlKind::Focus, true});
        } else if (command == "FOCUS 0") {
            postControl(ControlMessage{ControlKind::Focus, false});
        } else if (command == "STATE IDLE") {
            ControlMessage message{};
            message.kind = ControlKind::State;
            message.state = ButtonState::Idle;
            postControl(message);
        } else if (command == "STATE RECORDING") {
            ControlMessage message{};
            message.kind = ControlKind::State;
            message.state = ButtonState::Recording;
            postControl(message);
        } else if (command == "STATE HIDDEN") {
            ControlMessage message{};
            message.kind = ControlKind::State;
            message.state = ButtonState::Hidden;
            postControl(message);
        } else if (command == "THEME LIGHT") {
            ControlMessage message{};
            message.kind = ControlKind::Theme;
            message.theme = ButtonTheme::Light;
            postControl(message);
        } else if (command == "THEME HIGH_CONTRAST") {
            ControlMessage message{};
            message.kind = ControlKind::Theme;
            message.theme = ButtonTheme::HighContrast;
            postControl(message);
        } else if (command == "THEME DARK") {
            ControlMessage message{};
            message.kind = ControlKind::Theme;
            message.theme = ButtonTheme::Dark;
            postControl(message);
        } else if (command == "EXIT") {
            postControl(ControlMessage{ControlKind::Exit});
            return;
        }
    }

    postControl(ControlMessage{ControlKind::Exit});
}

DWORD parseHostProcessId(int argc, char** argv) {
    for (int index = 1; index + 1 < argc; ++index) {
        if (std::string_view(argv[index]) != "--host-pid") {
            continue;
        }

        char* end = nullptr;
        const unsigned long parsed = std::strtoul(argv[index + 1], &end, 10);
        if (end != argv[index + 1] && end != nullptr && *end == '\0') {
            return static_cast<DWORD>(parsed);
        }
    }
    return 0;
}

bool createButtonWindow() {
    HINSTANCE instance = GetModuleHandleW(nullptr);

    WNDCLASSEXW windowClass{};
    windowClass.cbSize = sizeof(windowClass);
    windowClass.lpfnWndProc = buttonWindowProc;
    windowClass.hInstance = instance;
    windowClass.hCursor = LoadCursorW(nullptr, IDC_HAND);
    windowClass.lpszClassName = kWindowClassName;

    if (RegisterClassExW(&windowClass) == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
        return false;
    }

    g_button.window = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        kWindowClassName,
        L"Universal Dictate",
        WS_POPUP,
        0,
        0,
        kLogicalWidth,
        kLogicalHeight,
        nullptr,
        nullptr,
        instance,
        nullptr);
    if (g_button.window == nullptr) {
        return false;
    }

    recreateFont(g_button.dpi);
    SetTimer(g_button.window, kPositionTimer, 100, nullptr);
    return true;
}

void destroyResources() {
    if (g_button.font != nullptr) {
        DeleteObject(g_button.font);
        g_button.font = nullptr;
    }
    g_button.window = nullptr;
    UnregisterClassW(kWindowClassName, GetModuleHandleW(nullptr));
}

}  // namespace

int main(int argc, char** argv) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    const DWORD hostProcessId = parseHostProcessId(argc, argv);
    if (hostProcessId == 0) {
        std::cerr << "Missing or invalid --host-pid.\n";
        return 1;
    }

    g_button.hostExecutable = processExecutable(hostProcessId);
    if (g_button.hostExecutable.empty()) {
        std::cerr << "Could not resolve the host executable.\n";
        return 1;
    }

    if (!createButtonWindow()) {
        std::cerr << "Failed to create the non-activating status button.\n";
        return 1;
    }

    std::thread(inputLoop).detach();
    std::cout << "READY\n" << std::flush;

    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }

    destroyResources();
    return 0;
}

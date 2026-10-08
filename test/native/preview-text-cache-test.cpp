/* Pixel oracle and resource-lifetime tests; own DIBs only, no desktop input. */
#define NOMINMAX
#include <windows.h>
#include "../../native/preview-text.h"
#include "../fixtures/preview-text-uncached.h"
#include <cstdint>
#include <iostream>
#include <fstream>
#include <stdexcept>
#include <vector>

namespace {
namespace preview = universal_dictate::preview;
namespace reference = universal_dictate::preview_reference;
constexpr std::uint32_t background = 0x00335577U;
unsigned cases = 0;
void check(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
class Canvas {
public:
    Canvas(int w, int h) : width(w), height(h), dc(CreateCompatibleDC(nullptr)) {
        BITMAPINFO info{};
        info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        info.bmiHeader.biWidth = w; info.bmiHeader.biHeight = -h;
        info.bmiHeader.biPlanes = 1; info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        bitmap = CreateDIBSection(dc, &info, DIB_RGB_COLORS, reinterpret_cast<void**>(&pixels), nullptr, 0);
        if (dc && bitmap && pixels) previous = SelectObject(dc, bitmap);
        if (!dc || !bitmap || !pixels || !previous || previous == HGDI_ERROR) {
            release(); throw std::runtime_error("cache test DIB allocation");
        }
        clear();
    }
    ~Canvas() { release(); }
    Canvas(const Canvas&) = delete;
    Canvas& operator=(const Canvas&) = delete;
    void clear() { GdiFlush(); std::fill(pixels, pixels + width * height, background); }
    std::vector<std::uint32_t> snapshot() const {
        GdiFlush();
        std::vector<std::uint32_t> out(pixels, pixels + width * height);
        for (auto& pixel : out) pixel &= 0x00ffffffU; // BI_RGB alpha is unused.
        return out;
    }
    void save(const char* file) const {
        const auto image = snapshot();
        BITMAPFILEHEADER header{};
        BITMAPINFOHEADER info{};
        info.biSize = sizeof(info); info.biWidth = width; info.biHeight = -height;
        info.biPlanes = 1; info.biBitCount = 32; info.biCompression = BI_RGB;
        header.bfType = 0x4d42; header.bfOffBits = sizeof(header) + sizeof(info);
        header.bfSize = header.bfOffBits + static_cast<DWORD>(image.size() * 4);
        std::ofstream out(file, std::ios::binary);
        out.write(reinterpret_cast<const char*>(&header), sizeof(header));
        out.write(reinterpret_cast<const char*>(&info), sizeof(info));
        out.write(reinterpret_cast<const char*>(image.data()), image.size() * 4);
    }
    const int width, height;
    const HDC dc;
private:
    void release() noexcept {
        if (dc && previous && previous != HGDI_ERROR) SelectObject(dc, previous);
        if (bitmap) DeleteObject(bitmap);
        if (dc) DeleteDC(dc);
    }
    HBITMAP bitmap = nullptr;
    HGDIOBJ previous = nullptr;
    std::uint32_t* pixels = nullptr;
};

void comparePixels(preview::TextRenderer& cached, reference::TextRenderer& oracle,
                   Canvas& actual, Canvas& expected, const preview::TextLayout& geometry,
                   const std::wstring& text) {
    actual.clear(); expected.clear();
    check(oracle.draw(expected.dc, geometry, text), "uncached oracle failed");
    check(cached.draw(actual.dc, geometry, text), "cached first draw failed");
    const auto image = expected.snapshot();
    const auto pixels = actual.snapshot();
    if (pixels != image) {
        std::size_t differing = 0;
        for (std::size_t i = 0; i < image.size(); ++i) if (pixels[i] != image[i]) {
            if (differing++ < 3) std::cerr << "Pixel " << i % actual.width << ',' << i / actual.width
                << " cached=" << pixels[i] << " oracle=" << image[i] << '\n';
        }
        std::cerr << "Case=" << cases << " textUnits=" << text.size() << " font=" << geometry.fontHeight
            << " rect=" << geometry.text.left << ',' << geometry.text.top << ',' << geometry.text.right << ','
            << geometry.text.bottom << " mismatched=" << differing << '\n';
        actual.save(".deps/m5-evidence/cache-actual.bmp");
        expected.save(".deps/m5-evidence/cache-oracle.bmp");
        throw std::runtime_error("cache changed accepted RGB pixels");
    }
    check(cached.visibleLines() == oracle.visibleLines() && cached.skippedLines() == oracle.skippedLines(),
          "cache changed line layout");
    const auto count = cached.rasterizations();
    for (unsigned repeat = 0; repeat < 4; ++repeat) {
        actual.clear();
        check(cached.draw(actual.dc, geometry, text), "cache hit draw failed");
        check(cached.rasterizations() == count, "unchanged preview was rasterized again");
        check(actual.snapshot() == image, "cache hit pixels differ");
    }
    ++cases;
}

void pixelMatrix() {
    const std::wstring samples[] = {
        L"", L"Listening\u2026", L"The pump pressure is five bar.",
        L"Ich gehe nach Hause. Der Druck ist f\u00fcnf bar & die Temperatur zwanzig Grad.",
        L"هذا نص تجريبي باللغة العربية. الضغط خمسة بار ودرجة الحرارة عشرون درجة.",
        L"这是本地语音识别的临时预览。水温为二十度，压力为五巴。これはプレビューです。",
        L"Gr\u00fc\u00dfe a\u0308 e\u0301 👨‍👩‍👧‍👦 👍🏽 🇩🇪 🧪 नमस्ते दुनिया",
        std::wstring(500, L'W') + L" END latest words"
    };
    for (const auto size : {universal_dictate::OverlaySize::Small, universal_dictate::OverlaySize::Medium,
                            universal_dictate::OverlaySize::Large}) {
        preview::TextRenderer cached;
        reference::TextRenderer oracle;
        check(!cached.initialized(), "Off eagerly initialized text");
        for (const unsigned dpi : {96U, 120U, 144U, 192U}) {
            auto geometry = preview::calculateTextLayout(size, dpi);
            Canvas actual(geometry.text.right + 20, geometry.text.bottom + 20);
            Canvas expected(actual.width, actual.height);
            for (const auto& text : samples) {
                const auto before = cached.rasterizations();
                comparePixels(cached, oracle, actual, expected, geometry, text);
                check(cached.rasterizations() == before + 1, "changed text/DPI did not invalidate cache once");
            }
            // Moving the viewport does not change its glyph raster or dimensions.
            geometry.text.left += 7; geometry.text.right += 7;
            geometry.text.top += 5; geometry.text.bottom += 5;
            const auto before = cached.rasterizations();
            comparePixels(cached, oracle, actual, expected, geometry, samples[7]);
            check(cached.rasterizations() == before, "position-only change invalidated raster");
            cached.reset();
            check(!cached.initialized() && cached.rasterizations() == 0, "reset left cache initialized");
            comparePixels(cached, oracle, actual, expected, geometry, L"Paused");
        }
    }
}

void clippingAndReset() {
    auto geometry = preview::calculateTextLayout(universal_dictate::OverlaySize::Medium, 144);
    Canvas actual(geometry.text.right + 20, geometry.text.bottom + 20);
    Canvas expected(actual.width, actual.height);
    preview::TextRenderer cached;
    reference::TextRenderer oracle;
    const std::wstring text = L"A bounded cached preview with a\u0308 and \u4e2d\u6587.";
    comparePixels(cached, oracle, actual, expected, geometry, text);
    const auto full = expected.snapshot();
    const RECT clip{geometry.text.left + 9, geometry.text.top + 2, geometry.text.right - 11, geometry.text.bottom - 3};
    const int saved = SaveDC(actual.dc);
    check(saved != 0, "save clip DC");
    check(IntersectClipRect(actual.dc, clip.left, clip.top, clip.right, clip.bottom) != ERROR, "set clip");
    actual.clear();
    check(cached.draw(actual.dc, geometry, text), "clipped cache hit");
    const auto clipped = actual.snapshot();
    for (int y = 0; y < actual.height; ++y) for (int x = 0; x < actual.width; ++x) {
        const auto i = static_cast<std::size_t>(y) * actual.width + x;
        const bool inside = x >= clip.left && x < clip.right && y >= clip.top && y < clip.bottom;
        check(clipped[i] == (inside ? full[i] : background), "cached preview escaped destination clip");
    }
    check(RestoreDC(actual.dc, saved) != 0, "restore clip DC");
    cached.reset(); oracle.reset(); GdiFlush();
    const auto before = GetGuiResources(GetCurrentProcess(), GR_GDIOBJECTS);
    for (unsigned repeat = 0; repeat < 100; ++repeat) {
        check(cached.draw(actual.dc, geometry, text), "reset/recreate draw");
        cached.reset();
    }
    GdiFlush();
    check(GetGuiResources(GetCurrentProcess(), GR_GDIOBJECTS) <= before + 2, "cache leaked GDI objects");
    geometry.text.right = geometry.text.left;
    check(!cached.draw(actual.dc, geometry, text), "invalid viewport accepted");
    cached.reset();
    geometry = preview::calculateTextLayout(universal_dictate::OverlaySize::Medium, 144);
    comparePixels(cached, oracle, actual, expected, geometry, text);
}
}
int main() {
    try {
        pixelMatrix(); clippingAndReset();
        std::cout << cases << " cached/uncached RGB cases passed; repeated hits, DPI/text invalidation, clipping and 100 reset cycles\n";
        return 0;
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}

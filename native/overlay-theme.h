/* Fixed visual-only palettes. No audio processing or adaptive normalization. MIT */
#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <string_view>

namespace universal_dictate {
enum class OverlayTheme : unsigned { Blue, Green, Dark, Amber, Slate };
using PaletteStops = std::array<std::array<int, 3>, 6>;
constexpr PaletteStops paletteStops(OverlayTheme theme) noexcept {
    switch (theme) {
        case OverlayTheme::Green: return {{{14,18,27},{21,40,34},{31,73,50},{44,115,73},{73,168,106},{198,224,182}}};
        case OverlayTheme::Dark: return {{{14,18,27},{31,37,47},{60,70,85},{99,114,131},{158,176,192},{234,241,244}}};
        case OverlayTheme::Amber: return {{{14,18,27},{51,32,32},{100,54,31},{164,91,29},{226,158,55},{255,237,189}}};
        case OverlayTheme::Slate: return {{{14,18,27},{29,38,54},{52,70,92},{84,111,139},{134,165,190},{220,230,236}}};
        case OverlayTheme::Blue:
        default: return {{{14,18,27},{25,34,74},{52,63,142},{64,149,191},{85,222,194},{239,249,219}}};
    }
}
inline OverlayTheme parseOverlayTheme(std::string_view value) noexcept {
    if (value == "green") return OverlayTheme::Green;
    if (value == "dark") return OverlayTheme::Dark;
    if (value == "amber") return OverlayTheme::Amber;
    if (value == "slate") return OverlayTheme::Slate;
    return OverlayTheme::Blue;
}
inline OverlayTheme parseOverlayThemeArgument(int argc, char** argv) noexcept {
    for (int i = 1; i + 1 < argc; ++i)
        if (std::string_view(argv[i]) == "--overlay-theme") return parseOverlayTheme(argv[i + 1]);
    return OverlayTheme::Blue;
}
struct WaveformColors {
    std::uint32_t axis, outer, inner, trace; // Opaque RGB; the renderer preserves existing alpha.
};
constexpr WaveformColors waveformColors(OverlayTheme theme) noexcept {
    switch (theme) {
        case OverlayTheme::Green: return {0x224835,0x206a4a,0x2c845c,0x43ad7c};
        case OverlayTheme::Dark: return {0x303846,0x647185,0x8a95a4,0xbdc6d4};
        case OverlayTheme::Amber: return {0x4f3b23,0x935d2a,0xba823c,0xeeb152};
        case OverlayTheme::Slate: return {0x2a3d4e,0x46617b,0x5d7c96,0x86aac5};
        case OverlayTheme::Blue:
        default: return {0x24445a,0x31789e,0x3a95b5,0x51b8eb};
    }
}
inline std::uint32_t paletteColor(std::uint8_t level, OverlayTheme theme = OverlayTheme::Blue) noexcept {
    const auto stops = paletteStops(theme);
    const auto scaled = static_cast<unsigned>(level) * (stops.size() - 1);
    const auto index = std::min(stops.size() - 2, scaled / 255);
    const int fraction = static_cast<int>(scaled - index * 255);
    std::uint32_t color = 0xff000000U;
    for (std::size_t channel = 0; channel < 3; ++channel) {
        const auto value = (stops[index][channel] * (255 - fraction)
                          + stops[index + 1][channel] * fraction + 127) / 255;
        color |= static_cast<std::uint32_t>(value) << (16 - 8 * channel);
    }
    return color;
}
} // namespace universal_dictate

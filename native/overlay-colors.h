/* Fixed visual palettes only; never changes recorded PCM. SPDX-License-Identifier: MIT */
#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <string_view>

namespace universal_dictate::colors {
enum class Theme { Blue, Green, Amber, Violet };
inline Theme parse(std::string_view value) noexcept {
    if (value == "green") return Theme::Green;
    if (value == "amber") return Theme::Amber;
    if (value == "violet") return Theme::Violet;
    return Theme::Blue;
}
inline Theme parseArgument(int argc, char** argv) noexcept {
    for (int i = 1; i + 1 < argc; ++i)
        if (std::string_view(argv[i]) == "--overlay-colors") return parse(argv[i + 1]);
    return Theme::Blue;
}
using Stops = std::array<std::array<int, 3>, 6>;
constexpr Stops stops(Theme theme) noexcept {
    switch (theme) {
        case Theme::Green: return {{{14,18,27},{16,39,31},{24,78,48},{42,125,70},{105,188,104},{221,246,207}}};
        case Theme::Amber: return {{{14,18,27},{47,31,39},{109,54,48},{191,100,50},{242,172,83},{255,239,197}}};
        case Theme::Violet: return {{{14,18,27},{39,29,69},{85,56,139},{152,101,194},{218,177,237},{249,239,255}}};
        default: // Exact original log-spectrogram palette, including its zero level.
            return {{{14,18,27},{25,34,74},{52,63,142},{64,149,191},{85,222,194},{239,249,219}}};
    }
}
inline std::uint32_t powerColor(std::uint8_t level, Theme theme = Theme::Blue) noexcept {
    const auto palette = stops(theme);
    const auto scaled = static_cast<unsigned>(level) * (palette.size() - 1);
    const auto index = std::min(palette.size() - 2, scaled / 255);
    const int fraction = static_cast<int>(scaled - index * 255);
    std::uint32_t color = 0xff000000U;
    for (std::size_t channel = 0; channel < 3; ++channel) {
        const auto value = (palette[index][channel] * (255 - fraction)
            + palette[index + 1][channel] * fraction + 127) / 255;
        color |= static_cast<std::uint32_t>(value) << (16 - 8 * channel);
    }
    return color;
}
struct WaveformPalette { std::uint32_t axis, outer, inner, trace; };
constexpr WaveformPalette waveform(Theme theme) noexcept {
    // Alpha/line widths are unchanged. Green reproduces the original trace colors.
    switch (theme) {
        case Theme::Green: return {0x7329523aU,0x82247648U,0x552d9158U,0xf542cd76U};
        case Theme::Amber: return {0x7361492cU,0x82a66b30U,0x55d69a4dU,0xf5f4bc70U};
        case Theme::Violet: return {0x734a3b6bU,0x826c51a3U,0x559f82c8U,0xf5c4adf3U};
        default: return {0x73284462U,0x822963a4U,0x554c9aceU,0xf56ac5f5U};
    }
}
} // namespace universal_dictate::colors

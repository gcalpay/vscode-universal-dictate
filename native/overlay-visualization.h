/* Enhanced-overlay mode contract. SPDX-License-Identifier: MIT */
#pragma once
#include <string_view>
namespace universal_dictate::visualization {
enum class Mode { Waveform, LogFrequencyPowerSpectrogram, CircularSpectrum };
inline Mode parseMode(std::string_view value) noexcept {
    if (value == "circularSpectrum") return Mode::CircularSpectrum;
    if (value == "logFrequencyPowerSpectrogram" || value == "linearFrequencyPowerSpectrogram" ||
        value == "constantQPowerSpectrogram") return Mode::LogFrequencyPowerSpectrogram;
    return Mode::Waveform;
}
inline Mode parseArgument(int argc, char** argv) noexcept {
    for (int i = 1; i + 1 < argc; ++i)
        if (std::string_view(argv[i]) == "--overlay-visualization") return parseMode(argv[i + 1]);
    return Mode::Waveform;
}
} // namespace universal_dictate::visualization

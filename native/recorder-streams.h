/* Recorder command input has no implicit output ownership. SPDX-License-Identifier: MIT */
#pragma once
#include <istream>

namespace universal_dictate {
// Call once before the command reader starts. Each protocol response is flushed
// explicitly by the main/UI thread. cin.get() must not flush that other thread's
// output for every incoming command byte. Keep C/C++ stdio synchronization enabled.
inline void configureRecorderCommandInput(std::istream& input) noexcept {
    input.tie(nullptr);
}
} // namespace universal_dictate

/* RC4 palette and square-card invariants; no window/microphone. SPDX-License-Identifier: MIT */
#pragma once
#include "../../native/circular-layout.h"
#include "../../native/spectral-render.h"
#include <stdexcept>

namespace overlay_design_test {
using namespace universal_dictate;
inline void require(bool value,const char* message) { if(!value) throw std::runtime_error(message); }
inline bool fits(OverlayRect r,int width,int height) {
    return r.left>=0 && r.top>=0 && r.right>r.left && r.bottom>r.top && r.right<=width && r.bottom<=height;
}
inline void run() {
    // Golden fingerprint of all 256 original Blue ARGB values, little endian.
    std::uint64_t hash=14695981039346656037ULL;
    for(unsigned i=0;i<256;++i) {
        const auto color=colors::powerColor(static_cast<std::uint8_t>(i));
        for(unsigned shift:{0U,8U,16U,24U}) {hash^=(color>>shift)&255U;hash*=1099511628211ULL;}
    }
    require(hash==0xa9a195ba9831f266ULL,"original Blue spectrogram palette changed");
    require(colors::parse("invalid")==colors::Theme::Blue,"color fallback");
    const auto old=colors::waveform(colors::Theme::Green);
    require(old.axis==0x7329523aU && old.outer==0x82247648U && old.inner==0x552d9158U && old.trace==0xf542cd76U,
            "Green must preserve original waveform colors");
    for(const auto theme:{colors::Theme::Blue,colors::Theme::Green,colors::Theme::Amber,colors::Theme::Violet}) {
        std::uint32_t previous=0;
        for(unsigned i=0;i<256;++i) {
            const auto c=colors::powerColor(static_cast<std::uint8_t>(i),theme);
            const auto luminance=((c>>16)&255U)*2126+((c>>8)&255U)*7152+(c&255U)*722;
            require(luminance>=previous,"power-palette luminance must be monotonic");previous=luminance;
            require(c>>24==255,"spectrogram pixels must stay opaque");
        }
        require(colors::powerColor(0,theme)==0xff0e121bU,"silence must match dark panel");
        const auto palette=colors::waveform(theme);
        require(palette.axis>>24==115 && palette.outer>>24==130 && palette.inner>>24==85 && palette.trace>>24==245,
                "theme changed original waveform opacity");
        auto a=std::make_unique<visualization::SpectralVisualizer>(visualization::Mode::LogFrequencyPowerSpectrogram,1000,theme);
        auto b=std::make_unique<visualization::SpectralVisualizer>(visualization::Mode::LogFrequencyPowerSpectrogram,1000);
        std::array<std::int16_t,1600> pcm{};
        for(std::size_t i=0;i<pcm.size();++i) pcm[i]=static_cast<std::int16_t>(1800*std::sin(2*visualization::kPi*250*i/16000));
        a->push(pcm.data(),pcm.size());b->push(pcm.data(),pcm.size());a->update();b->update();
        require(a->latest()==b->latest(),"color changed spectral levels");
        visualization::prepareSpectrogramPixels(*a);
        const std::vector<std::uint32_t> saved(a->pixels().begin(),a->pixels().end());
        visualization::prepareSpectrogramPixels(*a);
        require(std::equal(saved.begin(),saved.end(),a->pixels().begin()),"color cache repainted stale data");
        for(std::size_t y=0;y<a->bands();++y)
            require(a->pixels()[y*a->columns()+a->columns()-1]==colors::powerColor(a->latest()[a->bands()-1-y],theme),
                    "raster did not use session palette");
    }
    for(auto size:{OverlaySize::Small,OverlaySize::Medium,OverlaySize::Large})
        for(unsigned dpi:{96U,120U,144U,192U}) for(bool enabled:{false,true}) {
            const auto card=calculateCircularOverlayLayout(size,dpi,enabled);
            require(card.width==card.height,"circular overlay must be square");
            require(fits(card.waveform,card.width,card.height),"circular spectrum viewport out of card");
            require(std::abs((card.waveform.right-card.waveform.left)-(card.waveform.bottom-card.waveform.top))<=1,
                    "circular spectrum must use a square viewport");
            require(card.title.bottom<card.waveform.top,"title overlaps circular spectrum");
            for(auto button:{card.confirmButton,card.pauseButton,card.cancelButton})
                require(fits(button,card.width,card.height) && button.top>card.waveform.bottom,"circular control overlap");
            require(card.confirmButton.right<card.pauseButton.left && card.pauseButton.right<card.cancelButton.left,
                    "circular buttons overlap");
            if(enabled) {
                const auto text=circularPreviewLayout(size,dpi);
                require(text.waveform.left==card.waveform.left && text.waveform.bottom==card.waveform.bottom,"preview geometry mismatch");
                require(fits(text.text,card.width,card.height) && text.text.top>card.waveform.bottom &&
                        text.text.bottom<card.confirmButton.top,"preview encroaches on signal/buttons");
                require(text.maxLines==(size==OverlaySize::Small?1U:2U),"circular preview line contract changed");
            }
        }
}
} // namespace overlay_design_test

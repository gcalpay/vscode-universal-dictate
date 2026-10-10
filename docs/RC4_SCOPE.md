# RC4 — three modes, five themes, two controls

User-authorized revision of RC3 `953a8e7c19e44efa8b3f12110b0bf884bd633528` on 10 October 2026. Implementation is on the existing feature branch; neither draft PR is merged. User acceptance of this revision is pending.

## Product contract

- Waveform / Oscillogram, Log-Frequency Power Spectrogram, Circular Spectrum.
- Colors: Blue (default), Green (restrained emerald), Dark (neutral graphite/silver), Amber, Slate. Only visualization ink changes; panel/text background and Insert/Discard semantics remain stable.
- Blue log-spectrum palette is unchanged at every level. Power remains fixed -80..0 dB; no AGC. Waveform mapping/history remain byte-identical to 1.1.2; recoloring is the only waveform-drawing change.
- Circular Spectrum uses a square panel: Small 184/224, Medium 224/264, Large 280/328 logical pixels (preview Off/On). Header, circle, complete preview lines and two footer controls have nonoverlapping regions at tested DPI scales.
- Rectangular panels lose the former third-button column, preserving the exact existing waveform/preview viewports and their amplitude scaling.
- Retired Linear/Constant-Q preferences resolve to Log without overwriting user/workspace values. No native CQT implementation remains. The original log FFT analysis, frame/queue bounds and sample rate are unchanged.
- Colors, size, display location, history, preview, clipboard and language remain independent, next-recording snapshots. Eight settings total.
- Pause is absent from the public button/command/keybinding surface and native production command loop. The host RecorderSession exposes no setPaused method. Low-level admission and legacy lifecycle helpers/tests remain to avoid weakening tested capture/inference behavior; they are not a user feature.

## Validation and evidence

Portable tests cover geometry, palettes, cache-key invalidation, FFT vs independent DFT, history, queue overflow, immutable PCM and native argument routing. Windows checks cover all 3 modes x 5 themes x 3 sizes x 4 DPI x 2 preview states (360 active images), actual square/rectangle control hit areas and non-activation, multilingual preview clipping/cache, Unicode input and untouched clipboard.

The updated M5 matrix covers four jobs (Off plus three modes), ten adjacent AB/BA pairs per effective preview state: 140 short observations plus two 48-second Log/Preview-On observations = 142 observations and 56 aggregate gates. Existing protocol-2 gate definitions/limits are unchanged. Original 224-observation results remain historical; they are not claimed for the reduced matrix. Default Blue is the performance profile; all five palettes are checked numerically and in the native renderer.

The old preview-cache RGB mismatch remains unexplained; no fix is claimed. Current analyzer findings require actual post-build review, not inference from CI. Prior evidence and source remain recoverable in the RC3 and earlier histories.

## Delivery boundary

A new, distinctly named RC4 VSIX is delivered only after build/package audit and required internal checks. Normal-use acceptance, exact accepted-tree freeze, M7 backups/curation/lease and M8 final release authorization remain separate. No merge, tag, publication or history rewrite is authorized here. Issue #38 remains outside scope.

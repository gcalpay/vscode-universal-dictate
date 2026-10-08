# M5 preview raster cache

Prior confirmation at `9def8d87005be589f79187686fdb2ff2ae110673` (run
37762121955) completed all 224 observations with exact captured PCM and zero
visual drops. Stop-to-stub, CPU, memory and callback budgets passed. Log, linear
and circular Preview-On cases failed the median paired UI-p95 overhead gate:
10.79475, 5.3728 and 6.29845 ms against the unchanged 5 ms allowance. Those reports
remain failed evidence, not discarded or relabeled successes.

The added timing splits localized the excess to message pumping/painting, not
FFT/CQT analysis or preview snapshot output. This does not by itself isolate an
individual graphics API. It does reveal a removable cost in the current renderer:
unchanged provisional text is redrawn by Direct2D/DirectWrite on every 50 ms
waveform update, despite a cached shaped text layout.

## Candidate change

Cache one opaque 32-bit preview-text raster, keyed by the same text, viewport
width/height, font height and line limit as the accepted layout. A cache hit uses
BitBlt into the existing paint DC. A new hypothesis or size/font change repaints
the raster using the unchanged shaping, clipping, color-font and grayscale-AA
operations. Position-only moves reuse it. A failed render is not marked valid;
reset/destruction release Direct2D before its owned bitmap and DC. Initialization
stays lazy and Waveform/preview layout, controls, pause, inference and recorded
PCM remain unchanged. The cache uses no microphone callback work.

## Verification

An independent frozen uncached renderer from 9def8d8 is the pixel oracle. Its
only adaptations are include path and namespace. Windows tests compare exact
RGB pixels and line metrics across three sizes, four DPIs, English, German,
Arabic, CJK, combining marks, emoji and wrapped tails. Additional checks cover
cache-hit counts, text/DPI invalidation, moving/clipping, reset/recovery and 100
GDI-resource cleanup cycles. These run before M5 on each Windows runner.

Repeat the same revision-2 224-observation paired confirmation without changing
its gates, fixtures, order, model or inference parameters. Preserve failed trials.
Do not infer a performance improvement from this code change alone: assess the
new Windows measurements and image-equivalence test before candidate delivery.

Primary API references: Microsoft Learn, ID2D1DCRenderTarget and BindDC. Direct2D's
DC target already renders to an internal bitmap, and target recreation remains
handled after EndDraw. The optimization avoids repeating that drawing when the
preview text has not changed, rather than changing font rendering or scaling.

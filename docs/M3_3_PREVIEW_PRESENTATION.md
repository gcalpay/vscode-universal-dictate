# M3.3 — preview presentation and default-Off regression

Prepared from `1cf9643` / review snapshot `97b66b0`, on
`feat/live-transcript-preview`, PR #52. M3 is not merged. User confirmation in
this follow-up: Live preview remains Off by default; continue implementation.

## Changes

- Preserve `universalDictate.livePreview: false`, the sixth gear entry and
  session-stable On/Off behavior. Off performs no preview work. No new setting,
  language rename, translation toggle or inference backend/model is introduced.
- Preview-specific shared geometry uses the left-hand title/subtitle/waveform
  area without changing the accepted 380x64 / 520x88 / 740x128 logical window
  bounds or Insert/Discard hit rectangles. The waveform has its own clipping
  rectangle. Preview Off keeps the normal M1 presentation.
- Small has room for one recent text line; Medium and Large allow up to two and
  three. Text uses regular 14/14/16 logical-pixel fonts rather than the bold
  recording title font. Actual fallback-font metrics determine how many whole
  lines fit; incomplete vertical lines are not displayed.
- The newest complete lines of each recent-window hypothesis remain visible.
  The label says `Live preview · latest` when earlier lines are outside the
  viewport. This is still provisional recent-window text, not stitched transcript
  history. Before the first nonempty hypothesis the display says `Listening…`.
- Windows DirectWrite shapes multilingual text and applies system font fallback,
  with first-strong RTL direction selection. Direct2D's software DC target paints
  only the text rectangle on the existing GDI surface. These are Windows system
  APIs, not new downloaded dependencies or network services. No font download
  queue is used. Glyph availability still depends on installed system fonts.
- Shaped layouts are cached between waveform repaints. DPI-scaled geometry/font
  sizes are applied once. The final viewport is clipped; line selection does not
  splice UTF-16 or break shaping. Host payload limiting now preserves whole
  grapheme clusters, including combining marks and joined emoji.
- Rendering failure shows a fixed `Preview unavailable` label; it cannot stop
  recording or final transcription. New rendering objects are lazy and are
  released on overlay destruction. Off does not initialize those objects.

## Validation

Local full-project TypeScript check/compile and all 233 Node tests passed,
including seven new grapheme/UTF-8 bounds cases and the existing explicit Off
and visualization-mode regressions. Portable geometry tests cover 24 size/DPI
combinations, including zero-DPI fallback and 100–300% scaling, and assert bounds,
button separation, legible font sizes and no intersecting content rectangles.

Windows validation is added to the ordinary package workflow. The test executable
includes the production renderer but does not call recorder main or open the
microphone/model/clipboard. It requires an explicit disposable-desktop flag.
It renders scripted German, Arabic, CJK, combining/emoji/Indic and long-token
samples at 100%, 125%, 150% and 200% in all three sizes. It checks pixel clipping,
cache stability, complete-line limits and default-Off lazy initialization.
Own-overlay clicks test the text area and Insert/Discard while checking a scratch
EDIT's focus and selection. Clicks are refused unless the point belongs to the
process's own overlay. No global hook or user-PC access is involved.

Windows results and generated images must be inspected before calling these
checks passed. Simulated DPI messages/render targets do not establish real
mixed-monitor behavior; scripted text does not establish transcription accuracy,
natural-German latency or real VS Code/Codex acceptance. PR #52 is the record of
actual commit, CI and image-review results. M3.4 remains the final VSIX user gate.

## Remaining release route

After presentation review: M3.4 integrated regression, current analyzer triage,
package audit and one final M3 VSIX for user testing. M4 is skipped; M5 is parked
and Issue #38 stays open. M6 integrated 1.0.0 release validation follows accepted
M3. No milestone merge, version bump or publication is authorized by this work.

## API references

- https://learn.microsoft.com/en-us/windows/win32/directwrite/introducing-directwrite
- https://learn.microsoft.com/en-us/windows/win32/api/d2d1/nn-d2d1-id2d1dcrendertarget

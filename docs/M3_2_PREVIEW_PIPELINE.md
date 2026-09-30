# M3.2 — opt-in recorder and inference integration

Updated 2026-09-30 on `feat/live-transcript-preview`, PR #52.
M3.1 measurements and the eight-second decision are in [M3_1_RESULTS.md](M3_1_RESULTS.md).
The user authorized continuation and normal M3.2 commits/CI, with a live-preview
On/Off setting. M3 remains unmerged; this document does not grant release approval.

## Product behavior

`universalDictate.livePreview` is a Boolean, default false. The sixth gear entry
is Live preview; the fifth remains Overwrite clipboard. Both the manifest setting
and gear toggle are present. Values, Language and visualization are captured
before recording preparation; changing a setting affects the next recording.
The toggle reports the effective setting if a workspace overrides User settings.

Off allocates no native PCM preview buffer and performs no preview requests or
decoding. On runs only for Enhanced overlay/Both. Status bar only and Off retain
the preference but do not compute invisible previews. Existing final inference
warm-up still runs exactly as normal dictation requires; disabling preview does
not disable the final transcription worker.

## Audio and protocol

The native recorder retains the complete WAV through its existing miniaudio path.
An opt-in, fixed eight-second PCM ring is independent. The audio callback uses one
nonblocking ownership attempt: if the main thread is copying the preview ring,
the callback skips ONLY preview samples, never waits or performs snapshot I/O.
The next successful write detects the missing frames and resets contiguous
preview history. All ordinary ring data accesses hold the ownership flag; there
is no data-racing seqlock. Allocations and pipe writes occur outside the callback.

A session-tagged SNAPSHOT request returns absolute frame positions and bounded
hexadecimal PCM on stdout. Only the native main thread writes these responses;
recording control messages are not interleaved by a second writer. The host parses
fragmented lines with a size cap, rejects wrong ownership/size/format, and ignores
obsolete request IDs. It constructs a private canonical WAV Buffer. No temporary
preview files are created, read from an unfinished WAV, or sent to a cloud service.

TEXT frames use session/revision identity and bounded UTF-8 encoded as hex. Control
characters are normalized and complete code points retained. Native text updates
are transferred to the main UI thread; they are not keyboard/input commands.
The complete original recording remains independent of every preview lease.

## Scheduling, shutdown and fallback

The coordinator has one acquisition/decode/release operation, an eight-second
look-back and a two-second eligibility grid. Missed ticks are skipped, not queued.
The same session Language is used for preview and final transcription. Preview
never concatenates overlapping hypotheses into authoritative transcript history.

Stop invalidates the coordinator immediately and aborts the actual HTTP request.
Node's request signal destroys the connection. Preview errors and cancellation
never invoke the CLI fallback; normal final transcription retains that fallback.
The final path joins host preview settlement before its own server request. The
server's cancellation remains cooperative, not a native-idle acknowledgement.
The real adapter timing check must establish remaining contention in English/Auto.

Physical recorder Stop is not delayed by preview cleanup. Cancel/dispose suppress
late updates and insertion. Preview errors use fixed diagnostic messages and do
not expose audio/transcripts. A failure affects preview, not the retained final
transcript or optional final clipboard overwrite.

## Display and remaining gates

An initial native display is connected within the existing Small/Medium/Large
sizes. It trades waveform height for a labelled provisional-text area; buttons
and non-activation flags are unchanged. This is not a declaration that M3.3 DPI,
clipping, script/font and user-experience validation is complete.

Local validation at preparation:
- Full-project TypeScript compilation against the declared VS Code/Node typings.
- All 226 Node tests, including existing M1/M2, new scheduling, native framing,
  real loopback HTTP cancellation, toggles and engine shutdown cases.
- 22 Python benchmark mechanics tests.
- Native buffer ownership stress and protocol tests under GCC warnings-as-errors;
  buffer tests also passed AddressSanitizer/UndefinedBehaviorSanitizer.
- A real synthetic C++ process exchanged exact PCM with the production Node channel.

Windows native compilation, actual Node-to-pinned-Whisper timing and VSIX audit
are wired into the next normal PR checks. Do not infer they passed from this local
list; PR #52 records their actual outcome after execution. No natural German,
live microphone, user-computer latency or real Codex acceptance test is claimed.
M3.3 presentation review and M3.4 user VSIX gate remain. M4 is skipped, M5 parked,
and M6 integrated 1.0.0 release validation follows an accepted M3 merge.

## Review tooling

The sandbox could not fetch repository bytes over its own network. A temporary,
read-only source/declared-typing snapshot workflow was used through the connected
GitHub artifact action. Its tracked archive contained no credentials or .git
folder. The workflow is removed from the intended final source state. No user-PC
files or settings were accessed. No dependency or inference backend was added.

Routine M3.2 continuation uses Conventional Commits. No milestone merge, version
bump, Marketplace publication, Issue #38 closure or M4/M5 branch is authorized.

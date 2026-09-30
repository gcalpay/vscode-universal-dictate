# M3.1 — Live preview feasibility and measurement

Prepared 2026-09-29. Branch: `feat/live-transcript-preview`.
Verified base: `479ca6be4cd114372d0eece9db9962e42b3e6ba5` (accepted M2 merge).
Status: benchmark preparation committed at `545c8d6a265014d56242dad5806cefc704a0353c`
and draft PR #52 opened. Windows benchmark run `36635186997` completed successfully.
Its downloaded artifact was inspected; [M3_1_RESULTS.md](M3_1_RESULTS.md) records
measurements, limitations and the bounded eight-second prototype decision.
M3.2 foundation is prepared but uncommitted; it is not integrated product preview.

## Approved scope and release route

The user approved starting M3.1. M4 is skipped for 1.0.0; M5 is parked outside
1.0.0. The clipboard option is an accepted recovery workaround, not a resolution
of the genuine status-bar caret problem. Issue #38 remains open.

Remaining route: M3.1 measurement -> M3.2 pipeline -> M3.3 overlay -> M3.4 final
milestone acceptance -> accepted M3 merge -> M6 integrated 1.0.0 release candidate,
user acceptance and separately authorized publication. Do not renumber milestones
or create M4/M5 branches. Keep the current Language label and behavior; add the
user-approved offline language note to README. No translation toggle is in scope.

## Source findings

At the pinned base, `native/record-audio.cpp` captures mono PCM16 at 16 kHz and
writes it through the miniaudio encoder. Its public protocol carries READY,
LEVEL and terminal actions, not reconstructible PCM snapshots. Its 256-point
visualization ring contains reduced peak values, not audio suitable for inference.
`src/core/recorder.ts` recognizes only those events and closes stdin on Stop/Cancel.
This means preview needs a new nonterminal protocol before Stop; it cannot simply
reuse the waveform or current terminal-command path.

`src/core/whisper.ts` posts a complete WAV file to the local warm worker and exposes
no preview-abort signal. The pinned server source contains an HTTP-disconnect abort
callback, but responsiveness must be measured using the actual Windows binary.
Cancelling a promise or discarding text is not proof that native inference stopped.

Source references:
- https://github.com/gcalpay/vscode-universal-dictate/blob/479ca6be4cd114372d0eece9db9962e42b3e6ba5/native/record-audio.cpp
- https://github.com/gcalpay/vscode-universal-dictate/blob/479ca6be4cd114372d0eece9db9962e42b3e6ba5/src/core/recorder.ts
- https://github.com/gcalpay/vscode-universal-dictate/blob/479ca6be4cd114372d0eece9db9962e42b3e6ba5/src/core/whisper.ts
- https://github.com/ggml-org/whisper.cpp/blob/v1.9.1/examples/server/server.cpp

## Candidate architecture — benchmark design, integration not implemented

Keep the complete final recording independent from preview. Supply separate valid,
immutable WAV snapshots through the existing warm inference worker. Evaluate full
session prefixes against trailing 4-, 8- and 12-second snapshots. A rolling window
bounds audio size and may improve freshness; it also cuts context and can revise
or omit words. Do not choose it based on byte size alone or promise full-session
preview history from a trailing window.

For a future live recorder, prefer a bounded raw-PCM handoff to a non-audio worker
that creates snapshots. No new HTTP requests, model inference, large allocation,
blocking pipe writes or extra snapshot-file I/O in the capture callback. Preserve
its existing final-WAV path and lifecycle ownership. Exact ring/frame publication
and overrun behavior require M3.2 design/tests; this benchmark does not implement
or prove that native handoff.

Never repeatedly type provisional words into the target. Preview is display-only;
Stop uses the complete recording to obtain one authoritative final transcript.
Settings/overlay visibility should be session-stable. Preview-disabled or hidden
modes should not spend CPU on invisible preview work (proposed integration policy).

## Benchmark design

`test/preview/benchmark.py` uses only Python's standard library as a diagnostic
runner tool. It introduces no Python requirement into the extension. All diagnostics live in
`test/` or `.github/`, already excluded from VSIX by `.vscodeignore`. It launches
the existing pinned CPU whisper-server on 127.0.0.1 with the production startup
options and sends the same language/response_format/no_timestamps request fields.
It does not invoke the extension's TypeScript wrapper, record a microphone, alter
a clipboard, insert text, add a model or offer cloud inference.

Inputs are closed PCM16/mono/16 kHz WAV fixtures. Strict RIFF/chunk/frame validation
rejects unfinished or inconsistent headers. Do not copy the active recorder WAV
and assume it has a finalized header. Separate snapshots get fresh valid headers;
the full original PCM stays immutable.

The proposed Windows workflow fetches the already pinned runtime archive and
multilingual base model with the same SHA-256 checks. It synthesizes a repeated
English fixture using an installed Windows SAPI voice, with no microphone or
speech-service calls. Setup downloads are separate from offline inference. The
workflow fails rather than claiming results if no suitable voice is installed.

Measurements:
- Worker startup and warmup separately from steady-state requests.
- Prefix/trailing-window matrix at 2/4/8/16/32/64 seconds of recorded time,
  English and Auto, two repeats, shuffled fixed-seed order (96 requests).
- Snapshot construction and payload bytes; HTTP+decode wall time and real-time
  factor; worker CPU seconds/core equivalents and working-set memory.
- Paced prerecorded 20-second replays: prefix versus 8-second window, two-second
  refresh grid, one in-flight request, latest-only coalescing, no pending backlog.
  Late preview responses are not displayed. Final decode occurs once from full audio.
- Stop with active preview: wait versus socket disconnect; compare final-request
  elapsed time with three uncontended final baselines. Record whether the preview
  request was still active. Do not equate client closure with successful native abort.

Two repeats are an initial comparison, not a reliable tail-latency estimate. RTF
below one is not sufficient: repeated overlapping previews must also keep up with
the selected refresh cadence. A two-second request grid does not guarantee a
2-second visible-text latency. Replays measure time to a nonempty backend result,
not pixel presentation time or semantic correctness. Stop comparisons include
contention/noise and are not a direct measurement of mutex wait alone.

The 300-second fixture-size limit is diagnostic-only, not a product recording cap.
Memory values concern the worker, not the combined future recorder/UI pipeline.
Reports omit transcript text and retain hashes/counts, source/fixture/binary
identities and host metadata. No private user audio is required.

## Original preparation evidence (historical; runner results now available)

- 22 standard-library mechanics tests passed on the Linux chat sandbox: WAV
  validation/snapshot geometry, unchanged source, multipart fields, real loopback
  HTTP transport and disconnect, simulated latest-only scheduling and final-once.
- Python syntax compilation passed.
- The loopback test server is a test double, not Whisper; simulated time advances
  are deliberately artificial and must not be presented as inference benchmarks.
- No dependency installation, runtime source edits, remote CI dispatch or user-PC
  operations were performed.
- The sandbox has no local Whisper binary/model and its outbound DNS request failed.
  Actual Whisper inference, Windows SAPI generation, Windows worker metrics, and
  Windows pipeline execution are NOT RUN. No CPU/latency suitability conclusion
  for the user's i7-7700 or any Windows machine has been reached.

## Current gate and next action

The original preparation was approved, committed and exercised in PR #52. Do not
repeat its initial benchmark merely because an earlier paragraph says NOT RUN;
that paragraph is the historical pre-commit boundary. The actual experiment and
its source/fixture/artifact identities are in [M3_1_RESULTS.md](M3_1_RESULTS.md).

The initial measurement gate supports a bounded eight-second preview prototype,
not a guaranteed production latency or transcript-quality claim. M3.2 core
scheduling/snapshot preparation and remaining native/runtime integration are in
[M3_2_PREVIEW_PIPELINE.md](M3_2_PREVIEW_PIPELINE.md). Approve its new commit before
updating the branch. All M3 work stays on `feat/live-transcript-preview`.

No user reinstall/test is requested now. The first live-preview user-test VSIX is
still the final M3.4 gate; M3 merge and M6 release retain their approval gates.

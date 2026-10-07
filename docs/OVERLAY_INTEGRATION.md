# Overlay integration — M2 through M5

Base: M1 `d4c52d2d153545a7a8bef6ed1680261e199ef22b`; branch
`feat/overlay-visualizations`. Published main and draft PR #55 stay unchanged.

## Approved workflow

The user explicitly removed individual M1/M2/M3/M4 manual VSIX gates. Continue
internal implementation and automated validation; deliver one integrated candidate
only after M5, with a possible final release build later. Do not ask for additional
micro-diagnostic installs or prescribed repeated screenshot/reading exercises.

## Scope

Add **Enhanced Overlay Visualization**, independent of existing visualization
location: Waveform / Oscillogram (default), Log-Frequency Power Spectrogram,
Linear-Frequency Power Spectrogram, Constant-Q Power Spectrogram, Circular Spectrum.
Settings are snapshotted before recording; disabled overlays perform no invisible
spectral work. Status-bar rendering and the accepted append-only waveform remain.
A previous unpushed source bundle exists against 1.1.0; integrate it selectively,
not by overwriting M1 inference, accumulated reports or current lifecycle tests.

## Internal checkpoints

- M2: settings, native argument routing and renderer/analysis boundaries on M1.
- M3: linear/log FFT spectrogram numerical and production-renderer validation.
- M4: genuine variable-window Constant-Q and circular-spectrum validation.
- M5: compare all styles against waveform with the retained synthetic fixture;
  inspect CPU/memory/capture/Stop latency and sizes/DPI/preview/Pause behavior.
- Integrated review candidate: M1 plus all five modes after automated gates.
- Only after user acceptance: release freeze, separately controlled history cleanup,
  final build/audit and release authorization.

Do not claim all milestones complete from source inspection. Preserve source/run/
artifact identities and record open gates. Initial state: M2 integration in progress.

## M2 integration checkpoint

The previously unpushed renderers have been selectively integrated on M1. The new
selector is connected from the manifest and gear menu through the session snapshot
and native arguments to a common renderer dispatcher. No style is a placeholder.
M1 inference/worker/transport/engine modules are byte-identical to the M1 head.
The waveform paint function and waveform history/level headers are unchanged.

Local validation: full strict TypeScript check and all 320 Node tests pass. GCC,
Clang and AddressSanitizer/UndefinedBehaviorSanitizer spectral tests pass, including
independent DFT comparison, CQT filters, queue concurrency, pause and history.
These are not Windows production-renderer or full M5 latency claims. Windows gates
remain to be run on the committed integration; M5 combined capture/render/Whisper
performance remains the next internal gate, with no user install requested.

Detailed implementation: [OVERLAY_VISUALIZATIONS.md](OVERLAY_VISUALIZATIONS.md).

## M5 automated comparison protocol

The corrected native renderer gate passed on `afe5525`. No user installation was
needed. M5 builds the replay shell against frozen M1 `d4c52d2` and the candidate.
It replays the same 12-second PCM through the real callback/WAV writer and actual
Win32 overlay/message loop, production Node recorder adapter, preview coordinator,
dictation engine and unchanged real Whisper runtime. The producer is synthetic,
not a microphone device; final insertion is a no-op, not target-application paint.
All five modes run three times with preview Off/On, with frozen-M1 waveform controls
and no-overlay controls (42 short runs). Two additional 48-second spectral runs
fill/wrap the 20-second history. Order reverses on alternate repeats.

Budgets fixed before measurements: median Stop-to-stub overhead <= max(150 ms,10%)
against matching frozen M1; callback mean overhead <=0.25 ms, callback p95 <=2 ms,
UI tick p95 <=25 ms at the existing 50 ms cadence, recorder CPU overhead <=5
single-core percentage points, private committed memory overhead <=16 MiB, and
zero visual drops. Every run checks exact accepted PCM, one nonempty final result,
server inference, unchanged final PID and preview exit before final dispatch.
Actual callback/UI sample distributions and raw per-run data are retained; no
95th-percentile total-latency claim is made from three repetitions. Preview latency
and request overlap are recorded, not assumed. CPU is native recorder process time
(kernel+user) divided by its observed wall time, normalized to one core. Memory
fields distinguish process working set, peak working set and private commit.

Candidate version is 1.2.0, unpublished. Runtime/source package validation and M5
budgets must pass before exposing a single integrated candidate to the user.

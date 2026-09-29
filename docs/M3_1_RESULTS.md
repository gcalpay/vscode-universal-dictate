# M3.1 — measured Windows feasibility decision

Reviewed 2026-09-29. PR #52, branch `feat/live-transcript-preview`.
Benchmark source: `545c8d6a265014d56242dad5806cefc704a0353c`.
CI checkout: `f3d1a1def7e02ce1fe8d103cc44e64d9a0421269` (synthetic merge, not main).

## Evidence identity

- Run: https://github.com/gcalpay/vscode-universal-dictate/actions/runs/36635186997
- Job: `109633972038`, completed successfully, 2026-09-29.
- Artifact: `11065025025`, three JSON files, 10,895-byte archive.
- Archive SHA-256: `f5f689612efd1d2b03d216c067c7fabc1c024cff2d245a0d7c975ead349fb82e`.
- Archive downloaded through the connected GitHub artifact action and verified against the job's digest.
- Results: `preview-results.json`; provenance: `fixture-provenance.json`; machine: `runner-cpu.json`.
- Runtime: whisper.cpp 1.9.1, CPU only; multilingual Whisper base with the existing model checksum.
- Server SHA-256: `2c1ef08694756eda280e79b8217da63ee2af33c87ac3d5f27d68f9f3f966fd32`.
- Fixture SHA-256: `04a598a39e695cab246f0af7deca4f004b081f2cf6bcb4bc8dc221e92dcc1334`.

Windows Server 2025 runner; AMD EPYC 7763 virtualized allocation, 2 reported cores /
4 logical processors; 2 inference threads. Microsoft David Desktop en-US generated
the repeated English speech locally. This is NOT a measurement of the user's
Windows 10 / i7-7700 machine, natural German speech, a live microphone or the overlay.
No user audio was used. All 96 sweep requests returned nonempty results; hashes
and character counts do not establish correct transcription or translation.

## Warm request results

Seconds below include local HTTP and decoding, not scheduling, capture, IPC or
pixel presentation. Bounded-window rows include only snapshots with the full
stated width, sampled across the available later endpoints (two repeats per case).
The 64-second prefix row contains only the two 64-second cases per language.
These medians are descriptive of this small run, not tail-latency guarantees.

| Strategy | English median | Auto median | Cases per language |
| --- | ---: | ---: | ---: |
| Latest 4 seconds | 1.688 s | 3.251 s | 10 |
| Latest 8 seconds | 1.792 s | 3.381 s | 8 |
| Latest 12 seconds | 1.894 s | 3.425 s | 6 |
| Complete 64-second prefix | 6.623 s | 8.133 s | 2 |

Eight-second ranges: English 1.744–2.199 s, Auto 3.230–3.406 s.
Worker lifetime peak working set was approximately 303.8 MiB, not combined system
or extension memory. While decoding, consumption was approximately two CPU-core
equivalents. Preview adds real CPU work; shrinking audio to four seconds did not
remove the substantial per-request cost, particularly in Auto mode.

Worker startup was 0.622 s; the separately recorded initial warmup was 1.783 s.
These values are not a first-ever model download or a universal cold-start bound.

## Paced replay and Stop

The two 20-second paced replays used explicit English, NOT Auto, with a two-second
request grid. Results became available before any real overlay rendering:

| Strategy | First nonempty result after replay start | Display-eligible results | Stop to final result |
| --- | ---: | ---: | ---: |
| Growing prefix | 3.612 s | 8 | 2.185 s |
| Latest 8 seconds | 3.751 s | 9 | 2.051 s |

The eight-second replay's results were about 1.64–1.81 seconds old when ready
(relative to the end of the audio snapshot). This is NOT the total visible age
between updates; newly spoken audio also waits for the next snapshot/dispatch.
A two-second tick does not imply two-second end-to-end latency. Auto decoding was
slower in the sweep and still needs paced integration measurements.

Separate Stop probes deliberately ran a 64-second prefix while submitting a
12-second final fixture 150 ms later. They measured the final request including
contention, not native cancellation duration in isolation:

- Uncontended final: 1.865, 1.868, 1.930 s.
- Leave preview running: 8.264 and 8.263 s.
- Disconnect preview socket: 3.332 and 3.783 s.

The preview request was active in all four probes. Disconnection materially
reduced contention in this experiment, but did NOT eliminate it. Client promise
settlement cannot be called a native-idle acknowledgement. These probes used a
long prefix and explicit English, not the selected eight-second/Auto production
configuration. The latter still needs testing through the real TypeScript adapter.

## Decision for M3.2

Proceed with a bounded trailing eight-second snapshot as the initial prototype
policy. This avoids repeated decoding of the entire ever-growing recording.
Four seconds saved little inference time in this run while offering less context;
eight seconds is a provisional compromise, not a measured quality optimum.
Do not change the model, force English, silently pin a detected language, or add
cloud inference. Auto remains Auto; its additional latency must be shown honestly.

Use a two-second eligibility grid initially, one active snapshot/decode/cleanup
operation, and skip missed ticks. Read the latest audio when the operation starts;
never drain a backlog. Stop invalidates display immediately, aborts preview work,
and leaves authoritative full-recording transcription to the existing engine.
The transport must implement real request cancellation without CLI fallback for
cancelled preview work. Native worker availability and final priority are adapter
integration gates, not facts established by scheduler unit tests.

Only recent-speech hypotheses are previewed. Do not concatenate overlapping window
results into supposedly final text or promise a complete live-history transcript.
The original full WAV remains independent and supplies the one final transcript.
Snapshot size bounds do not limit recording duration.

The initial backend-feasibility decision is complete enough to begin the M3.2
prototype. Product responsiveness, semantic quality, native PCM capture, Auto
paced behavior, eight-second Stop contention and user acceptance remain open.
See [M3_2_PREVIEW_PIPELINE.md](M3_2_PREVIEW_PIPELINE.md).

## Harness observation

The successful Windows mechanics run printed an expected `ConnectionAbortedError`
from the deliberately disconnected test socket. Its narrow handler already caught
BrokenPipeError and ConnectionResetError. The prepared follow-up also catches the
specific ConnectionAbortedError, not arbitrary exceptions. This is diagnostic-test
noise cleanup, not a hidden product failure or a benchmark result change.

New M3 Codacy findings remain a separate source-review requirement. M2 dispositions
do not automatically apply, and no analysis gate has been disabled.

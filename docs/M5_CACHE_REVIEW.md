# M5 preview-cache failure review

Review baseline: feature commit `410094fb898e15170cd985ff1f7c060900b1873c`,
tree `bee76fa88913183d6089c1d2ced1c7b0350f505a`.

**Status:** the earlier RGB mismatch has no established root cause. This batch
changes test diagnostics and adds bounded probes; it does not change the
production cache or declare that logging fixed it. Windows probe results and the
integrated-candidate disposition must be recorded below before this gate closes.

## Original failed evidence

Run [37764925817](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37764925817),
job [113270115083](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37764925817/job/113270115083),
failed at `2026-10-08T10:40:54.3305480Z` with
`cache changed accepted RGB pixels`, then exited with code 1. This identifies
the first cached-versus-uncached comparison, not a repeated cache hit or the
destination clipping assertion. That version saved no mismatch coordinates or
images. The log cannot identify the text, DPI, differing pixel count, colors, or
which renderer's image was unexpected.

The runner used Windows Server 2025 `10.0.26100`, image
`windows-2025-vs2026`, image version `20260925.250.1`. Its `M5_STYLE=off` label
identifies the matrix runner. The graphics-only cache test does not consume
that environment variable; every mode job executes the same test. The failure
does not establish that production Off mode initialized a cache.

The other five checks in that run and the six checks in later run
[37765259320](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37765259320)
passed. Commit `410094f` added diagnostics while retaining the production cache
and exact RGB assertion. Those successes are retained evidence, not a causal
explanation or proof that the mismatch cannot recur.

## Source and API review

| Area | Reviewed evidence | Conclusion and limit |
|---|---|---|
| Layout and raster key | `native/preview-text.h`: `prepare`, lines 132–184 at the baseline | Text, viewport width/height, font height and line limit participate in the key. Successful preparation marks the raster dirty. Position-only movement intentionally reuses identical pixels. No missing key field was identified for the existing production geometry. |
| Render completion | `rasterize`, lines 98–116 | Bind, BeginDraw, identity transform/96 DPI, opaque clear, clipped text, PopClip and EndDraw occur before the cached BitBlt. Failed EndDraw never marks the raster valid. No absent EndDraw or unbalanced clip was found. |
| Device recreation | `rasterize` and `ensureTarget`, lines 111–129 | D2DERR_RECREATE_TARGET releases the brush and target. The dirty flag remains set until a successful raster. A later draw can recreate the target. Other resource failure paths remain display failures; none explains a successful draw with an RGB mismatch from source alone. |
| Ownership and cleanup | `resetSurface`, lines 68–95 | Direct2D resources are released before the owned bitmap/DC. The old bitmap is reselected before deletion. Surface dimensions are cleared and the raster invalidated. No shared cache-bitmap ownership or obvious use after free was found. |
| UI ownership | `native/record-audio.cpp`: WM_PAINT, preview-response application and `destroyOverlay` | Preview updates, drawing and renderer reset occur on the recorder message-loop thread. The capture callback does not access the renderer. The production cache owns its source DC; each paint's temporary destination DC can be destroyed independently. |
| DIB memory access | Original test `Canvas::clear` and `snapshot` | Both already called GdiFlush before direct DIB access. Adding a basic readback flush is therefore not an identified fix. The ignored return value was a diagnostic gap. |
| Independent oracle | `test/fixtures/preview-text-uncached.h` compared mechanically with `native/preview-text.h` at `9def8d87005be589f79187686fdb2ff2ae110673` | Executable source matches after the documented namespace/include adaptations and added provenance comments. The fixture also omits a trailing blank line. No shaping, clipping, color, antialiasing or layout algorithm was changed. |

The frozen fixture SHA-256 is
`69f7570569c989d8c6fc13bd011ab9c19480eea38e8f82dd19679013c794f882`.
The retrieved original header's SHA-256 is
`6466894d2630b870fa4caad7086569231318d92a482f1618229a474c7cd3b507`.
The fixture and production header remain unmodified by this review batch.

Microsoft documents that an
[ID2D1DCRenderTarget](https://learn.microsoft.com/en-us/windows/win32/api/d2d1/nn-d2d1-id2d1dcrendertarget)
draws through an internal bitmap and GDI. Its
[BindDC](https://learn.microsoft.com/en-us/windows/win32/api/d2d1/nf-d2d1-id2d1dcrendertarget-binddc)
association must be refreshed when the DC or drawing dimensions change. Both
reviewed implementations bind before rendering. Their different destination
origins do not, by themselves, establish a defect.

[EndDraw](https://learn.microsoft.com/en-us/windows/win32/api/d2d1/nf-d2d1-id2d1rendertarget-enddraw)
completes the Direct2D drawing batch and returns its status.
[CreateDIBSection](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-createdibsection)
requires synchronization before accessing its pixel pointer. The reviewed test
already performs the documented GdiFlush synchronization.

[GdiFlush](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-gdiflush)
reports failures in the calling thread's current GDI batch. Boolean GDI calls
can initially report that they were queued; that is not necessarily their
execution result. Automatically flushed batch errors are not all reported by a
later explicit flush. A
[GdiSetBatchLimit](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-gdisetbatchlimit)
value of 1 disables batching on that thread, which is useful for a controlled
diagnostic comparison. This does not justify disabling batching in production.

## Hypotheses that remain unproven

The first log cannot distinguish an intermittent draw/copy failure, differences
associated with renderer/font initialization order, a harness/resource problem,
or a production rendering defect. There is no evidence that any one of those
occurred. In particular, Windows/environmental nondeterminism is not an accepted
root-cause finding.

Reversing which renderer draws first probes order dependence. Recreating the
renderer objects exercises fresh application-owned state; it does **not**
guarantee a cold system font cache. Running the same exact assertions with GDI
batching disabled probes one batching distinction without replacing the normal
path. Green outcomes narrow observed reproduction conditions; they do not
retroactively explain the old failure.

## Bounded test-only changes

`test/native/preview-text-cache-test.cpp` preserves the original 122-case
default, oracle-first matrix and its success marker. It now checks GdiFlush
results and reports a batch error separately from a pixel inequality.

All first-draw, repeated-hit and clipping pixel inequalities use the same exact
RGB equality requirement. Failure diagnostics include scenario, draw order,
batch limit, pass, case, stage, hit repetition, geometry, text length, total
differing pixels and the first three differing coordinates/colors. BMPs contain
the exact compared arrays rather than a later readback. Output creation and
writes are checked; capture errors remain visible. The clipping expectation is
the frozen-oracle image masked by the destination clip, with the original
background outside it.

The fixed schedule per executable is:

| Scenario | Complete matrices requested | GDI batching |
|---|---:|---|
| Original oracle-first | 1 | Existing thread default, retained |
| Cached-first | 3 | Same default |
| Oracle-first | 3 | Disabled for diagnostic scope |
| Cached-first | 3 | Disabled for diagnostic scope |

Each complete matrix contains 122 case pairs with four additional cache-hit
comparisons per pair, one exact destination-clip comparison, and 100 reset
cycles. A wholly successful executable therefore records **10 matrices,
1,220 case pairs, 6,110 exact pixel comparisons and 1,000 reset cycles**.
Every scenario restores its previous batch limit through a scope guard, with
the restoration result checked.

If a matrix fails, its failure and captured evidence are retained. Only the
remaining predetermined matrices execute, and the executable returns nonzero
if any matrix failed. There is no retry-until-pass loop, tolerance change,
oracle edit, fixture exclusion or production performance-budget change.

## Windows results and delivery disposition

**Pending the consolidated Windows run.** Record its source identity, run/job
IDs, actual matrix/comparison counts, failures and evidence artifact here.

No production cache correction is currently warranted by a reproduced defect.
If the bounded probes reproduce a pixel mismatch, candidate delivery remains
blocked pending inspection of the saved arrays and a concrete disposition.
If they pass, the proposed disposition is a reviewed residual risk that may be
carried into one integrated normal-use candidate, with the unknown original
cause disclosed. That is not a resolved-defect claim or integrated acceptance.
Any subsequent source change to the production renderer requires the affected
pixel/layout and integrated performance gates before delivery.

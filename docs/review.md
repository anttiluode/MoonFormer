# Verification and final review — 2026-10-10

The first independent whole-branch review covered the field dynamics, reverse derivative, inversion transpose, experiment, and UI. It checked all receiver/source combinations at uneven 13-step/six-bin boundaries; independent finite differences agreed within 8.64e-12 absolute error. It reproduced the experiment and found two actionable issues in imported media. No other actionable issues or deferred polish findings were reported.

## Findings and corrections

1. A permitted stiff import (`n=8, lambda=3, g=3, T=0, epsilon=1`, material -3) diverged. The linear step now accounts for both ends of the Laplacian spectrum; stiff nonlinear steps subdivide the nominal interval. Numerical range checks roll back an unsuccessful field step. The UI restores the complete previous valid state and recomputes its readings when any operation fails.
2. A permitted import could evolve to a valid uniform material near 3.302, then be rejected by the old amplitude cap of 3. Evolution, saving, and loading now share the limit of 8. A donor snapshot is validated before the previous-memory slot is replaced.

The two original reproductions failed before the fixes and pass afterwards. Browser fault injection also deliberately mutates a cell to NaN before throwing: the earlier numerical state and receiver fingerprint must be restored exactly. Browser regression includes actual stiff evolution, erase/swap of the state above amplitude 3, and reimport of the app's own evolved snapshot.

## Evidence

- 12/12 Node tests, including numerical differences, symmetry/adjoints, read-only probing, controls, training-only normalization, imported-state evolution and round trips.
- Generated experiment receipt and model reproduce exactly at 12 significant digits after the fixes; original 25/32 and control results are unchanged.
- Real Chromium checks at 1440 px and 390 px: interactions, selected cue, sensitivity, erasure, restoration, coupling-off, imports, rollback, finite outputs, no unhandled page errors, and no horizontal overflow. Screenshots inspected.
- Original attachment SHA-256 equality verified directly against the supplied local files:
  - `core.js`: `65350cbf8ca68b6361920d1adfad71b861fd8b33623013a923cfff53843abe99`
  - `index.html`: `274a3d6fbd43fdd2e466c2d71b1f2850295b0757d9e7231e210773795e4ea8d0`

The reviewer did not independently authenticate the attachments, cited papers, or calibration/test chronology. Attachment equality was checked by the implementer with the actual provided files. Paper comparisons are based on the primary sources linked in the architecture document; they are interpretive comparisons, not new neuroscience results. Calibration preceded the first held-out run in this work session; that chronology is not established by rerunning the final source code. The fixed protocol and actual results are reproducible from the repository.

No remaining actionable review findings. Numerical safeguards are still not an unconditional stability proof for arbitrary forcing; supported range violations stop and restore rather than silently manufacturing a result.

# MoonFormer implementation plan

Spec: `docs/superpowers/specs/2026-10-10-moonformer-design.md`.

## Global constraints

- Work in the dedicated clone and feature branch; preserve LICENSE and the original attachments.
- No dependencies in the delivered runtime. Browser and Node share the same physics.
- A probe consumes only a numerical field and physical parameters. Training labels are confined to the experiment/readout.
- No live writing input during retention/readout. Freeze only the diagnostic snapshot during a probe.
- Record measured results with seeds, split, parameters, and controls. Make no capability claims beyond those results.

## Task 1: field, transport, probe, and derivative

Write tests first for the unforced zero state, energy dissipation, serialization, the transport adjoint identity, wave operator symmetry, and a Jacobian directional finite difference. Expected initial result: missing implementation. Implement 2-D periodic SH, blurred squared density, conservative variable-speed damped waves, bounded inversion interpolation, and reverse differentiation. Expected final result: all physics tests pass.

Produces: numerical field snapshots, a fixed receiver interface, feature vectors, and local derivatives. Consumed by Tasks 2 and 3.

## Task 2: retention and held-out experiment

Calibrate 2-D retention on training/calibration seeds; do not assume the 3-D pinning interval transfers. Write meaningful decoder/control tests first, then implement training-only normalization and ridge readout. Run the fixed split once after calibration. Publish receipts including erasure, coupling-off, donor substitution, retention norms, and a direct field baseline. Expected result: reproducible measured JSON, with failures retained.

Produces: fixed physical parameters, trained readout, measured receipt. Task 3 imports these without recomputing or leaking labels.

## Task 3: browser instrument and documentation

Use shared physics and the trained readout. Show true field/wave/sensitivity views, receiver time curves, intervention controls, memory export/import, and the unchanged 3-D reference. Add local serving instructions. Verify at desktop/mobile widths using a real browser; check errors, finite responses, sensitivity, and erase/substitution effects. Expected result: a responsive instrument with no console errors and causal controls that visibly change computed readings.

## Task 4: review and publication

Run the complete Node suite, reproduce the receipt, compare original file hashes, and run browser checks. Request a fresh whole-branch review focusing on numerical gradients, metadata leakage, controls, UI state consistency, imported state validation, and excessive claims. Fix important findings with regression tests. Publish the verified branch into the requested repo without overwriting new upstream work. Expected result: a reviewable repository commit with commands and evidence.

## Review focus

Inspect Jacobian correctness at temporal-bin boundaries; inversion clipping and its adjoint; classifier-only versus physical uncertainty; retention versus merely slowing; label leakage through parameters or saved state; donor/erase controls; browser cancellation, import validation, and stale responses. Check that claims distinguish CrystalMoon, the local physical Jacobian, Anthropic's representation Jacobian, and semantic memory.

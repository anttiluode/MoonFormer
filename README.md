# MoonFormer

**Read a memory through what it changes.**

A past input grows a crystal field. The input is withdrawn and the field evolves on its own. Later, fixed wave pulses cross the retained material. The material changes their speed; receivers hear different responses. A small learned readout tries to identify the earlier geometric experience using those responses alone.

The Jacobian view asks a more precise question: **which small change to the material would change this receiver's answer?** You can check the derivative against an actual numerical perturbation, erase a patch, erase everything, or substitute a different retained state.

This is the first experiment behind the MoonFormer name. It is a field-memory instrument, not yet a transformer or a language model.

## Run it

On a desktop, you can download the repository ZIP, extract it, and open `index.html` directly. All computations run locally; the main instrument needs no server or model service.

For a local server and reproducible experiments, use Node 20 or later. No install step or runtime dependencies:

```sh
git clone https://github.com/anttiluode/MoonFormer.git
cd MoonFormer
npm run serve
```

Open **http://127.0.0.1:8000**. The files are also ordinary static HTML/CSS/JS and can be served by any static server. The main instrument uses Canvas 2D. The preserved original CrystalMoon requires WebGL2 and floating-point render targets.

1. Choose a trace and press **Write & withdraw**. The amber line is the teaching input. It disappears before reading.
2. Watch the pulse cross the resulting material and arrive at the moon's receivers. Change the entrance, receiver, or time window.
3. Select **Jacobian**, then **Check a small perturbation**. The displayed derivative and the directly measured derivative should agree.
4. **Erase all**, then **Swap previous**. The computed responses should change and return with the numerical state.
5. Turn off **Material affects wave speed**. Every memory now produces the same readings.

The four-family classifier can be wrong. The initial seed is 3001, outside both benchmark splits; its arc is ambiguously classified. That failure is left visible. Captions describing the teaching fixture are separate from the reader. Recognition always uses all four pulses, even when the animation shows one.

**Save memory** exports only field values and physical parameters. Loading one reconstructs the answers by running fresh probes; it does not load a label, input trail, or cached prediction.

## What the first run actually found

64 training episodes; 32 test episodes with separate seeds and small translation, rotation and scale variants. Four familiar shape families: arc, fork, loop and zigzag. All writing input is absent for 6,000 field steps before any readout.

| Reading or intervention | Correct / 32 |
|---|---:|
| Wave responses, 96 features | **25** |
| Direct density field, 64 features | **25** |
| Mean density alone, 1 feature | 10 |
| Erased material | 8 |
| One fixed material for every episode | 8 |
| Structure-to-wave coupling disabled | 8 |
| Shuffled training labels | 7 |
| Donor state substituted, scored against original history | 2 |

Chance on this balanced four-class test is 8/32. Donor substitution reproduced the donor's complete response vector exactly in **32/32** cases. This confirms state dependence within this experiment. The wave reader did **not** outperform direct access to the density field. The sample is small, and these are held-out variants of known geometric families, not general memory or recognition.

The 2-D calibration also contains failures: some settings let crystal spread, while others destroy most traces. The selected setting retains different crystalline states over the measured horizon, often with substantial growth beyond the original trail. Four longer runs track another 24,000 unforced steps and report both amplitude and raw force. Persistent amplitude alone is not proof that the original experience remains recoverable indefinitely.

[Full measured receipt](results/experiment.json) · [Retention sweep](results/calibration.json) · [Trained readout](results/model.js)

```sh
npm test
npm run experiment -- --check  # reproduce receipt and model, without overwriting
npm run calibrate             # reproduce the separate retention sweep
npm run experiment           # regenerate receipt and model deliberately
```

Optional browser verification uses Playwright as a development tool:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser.cjs
```

## What came from CrystalMoon

The user supplied the **original**, pre-webcam CrystalMoon. Its `core.js` and walkable `index.html` are preserved byte-for-byte in [reference/crystalmoon](reference/crystalmoon/). The new prototype takes its scalar Swift–Hohenberg equation, density-dependent clock, density lens and antipodal inversion seriously as computational ingredients.

The slow medium stores a history-dependent state. The fast wave converts that state into consequences. The moon is a bounded receiver interface. Reverse differentiation connects a consequence back to the material that could alter it. This resembles one part of the Jacobian Lens idea—understanding a hidden state through its downstream effects—but does not implement Anthropic's language-model J-space or establish anything about conscious experience.

See [architecture, equations and primary sources](docs/architecture.md) for what is implemented, what is approximate, and what remains hypothetical.

[Verification and independent review](docs/review.md) records the findings, fixes and remaining evidential limits.

## Next question

Can several experiences coexist, and can a partial consequence cue restore one without a four-class classifier? That requires testing interference, selective reconstruction and query selection. Nothing in v0 demonstrates those capabilities yet. The current instrument supplies a retained medium, genuine probing, a verified derivative and interventions with which to test them.

MIT · Antti Luode · Sol 61

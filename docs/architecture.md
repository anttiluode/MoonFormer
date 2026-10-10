# What the mechanism is

MoonFormer v0 implements **one-way reading of a slow structural memory**. A teaching fixture changes the medium; the fixture is removed; a fast signal interrogates a snapshot. The learned part is a small supervised receiver readout. There are no learned query vectors, attention layers, semantic embeddings, webcam frames or external model calls.

The supplied original CrystalMoon files are under `reference/crystalmoon/`, unchanged. They provide a 3-D world with a scalar field, trails, density-dependent rendering and an antipodal inversion portal. Their comments express several interpretations; keeping the files intact does not make every interpretation a demonstrated result. The new code is a separate 2-D numerical experiment.

## Slow structure

With grid spacing one and periodic boundaries:

\[
\partial_t m = \frac{1}{1+T m^2}
\left[\epsilon m-(q_0^2+\Delta)^2m+g m^2-m^3+h\right].
\]

`src/field.js` uses a five-point Laplacian twice and explicit Euler. The step is

\[
\Delta t_m=\frac{1.2}{\max\{q_0^4,(8-q_0^2)^2\}},\qquad q_0=2\pi/\lambda.
\]

This bound comes from the linear finite-grid operator, not a universal nonlinear stability theorem. The tested default is `n=32, lambda=6, g=1.2, T=1.5, epsilon=-0.10`. Float64 arithmetic is shared by browser and Node.

For stiff imported media, a nominal step is split using a conservative estimate of linear plus local polynomial stiffness. This preserves its nominal elapsed time and leaves the default benchmark unchanged. Material amplitude is supported up to 8; a step that exceeds that range or becomes nonfinite rolls back instead of storing invalid numbers. The interface also restores the entire preceding valid state and recomputes diagnostics if an operation fails. These are numerical safeguards, not a proof of unconditional stability. Saved and restored memories use the same amplitude limit.

During writing, a Gaussian trail mask adds `0.55 mask` to epsilon and an additive drive `0.006 mask` to the force. Seeded small noise is used only at initialization. Writing lasts 1,500 steps. Then the writing mask and both drives are absent for 6,000 steps. Only the numerical material survives into the probe. The trail is not a cached input or an invisible waveguide imposed at read time.

For fixed epsilon and no drive, the discrete energy is

\[
E=\sum_i\left[-\frac\epsilon2m_i^2+
\frac12\big(q_0^2m_i+\Delta m_i\big)^2-
\frac g3m_i^3+\frac14m_i^4\right].
\]

Positive mobility changes rates, not stationary equations. Tests check energy decrease for an unforced seeded case. The numerical step, changing input, and any hypothetical feedback require their own analysis. This is a **nonconserved** scalar Swift–Hohenberg flow; it is not identical to conserved phase-field-crystal dynamics or a complex V1 orientation-map model.

The 3-D reference's suggested pinning interval does not automatically transfer to 2-D. `experiments/calibrate.cjs` records a separate sweep. At the selected epsilon, patterns often expand substantially before settling. This is history-dependent crystalline state retention, not a faithful bitmap memory. The receipt measures amplitude and **raw force**, so slowing with T is not mistaken for an exact equilibrium. Longer amplitude retention is not longer semantic or shape retention unless the decoder is also tested there.

## Fast consequences

Density is a symmetric periodic blur of squared structure:

\[
\rho=B(m^2),\qquad n=1+\kappa\rho,\qquad D=c^2=n^{-2}.
\]

B is two passes of the separable binomial kernel `[1,2,1]/4` in x and y. Dense structure slows waves. This is a model choice inspired by the lens; no derivation from biological conduction or a unified action is claimed.

The main canvas shows a piecewise-linear surface of the actual signed material, with positive heights lit per grid triangle and fixed contour levels. It is a display of m; wave speed uses the separate blurred squared density. Wave color is amplified ×12. No generated geometry or image is added to the stored state.

Each undirected grid edge uses \(e_{ij}=(D_i+D_j)/2\). The wave operator is

\[
(L_D a)_i=\sum_{j\sim i}e_{ij}(a_j-a_i).
\]

This stencil is symmetric and its spatial quadratic form is nonpositive. The damped update is

\[
a_{k+1}=(2-\gamma\Delta t-\omega^2\Delta t^2)a_k
-(1-\gamma\Delta t)a_{k-1}+\Delta t^2L_Da_k.
\]

Default probe: 120 steps, `dt=0.32, damping=0.04, omega=0.06, kappa=2`. Four fixed Gaussian sources sit to the west, north, east and south. Initial displacement is the Gaussian and initial velocity is zero. There is no continued source drive. The material is held fixed during this fast reading: an explicit separation-of-timescales approximation, not an assertion that the slow field has stopped evolving forever. **Wait** resumes unforced structural dynamics.

## The moon is a receiver map

The original antipodal coordinate rule becomes a circle inversion:

\[
\Phi(x)=c-R^2\frac{x-c}{\|x-c\|^2}.
\]

`src/moon.js` builds bilinear interpolation rows P for points inside a circle of radius `0.21 n`. A point is unsampled if its inverse lies outside the finite square. There is no periodic wrapping in this interface; the center is not infinity represented by a finite cell. Four normalized Gaussian receiver masks are inside the valid annulus.

The inner receiver reads \(b_r^TPa_k\). Its equivalent outer weights are \(P^Tb_r\), computed by **scattering the exact interpolation weights**. Tests verify the dot-product identity \(\langle Pa,b\rangle=\langle a,P^Tb\rangle\).

The coordinate formula being an involution does not mean that an interpolated, clipped P is its own adjoint or inverse. In the continuous 2-D unweighted area measure, inversion changes area by \((R/r)^4\). Neither Kelvin's harmonic-preserving factor nor an informal “use the same portal backwards” substitutes for the appropriate adjoint. This prototype uses the discrete transpose.

There is no feedback through the moon and no coupled-world Lyapunov claim. The map participates in the readout, but its benefit over ordinary receivers has not been tested. Inversion is not attention by itself. The 2-D antipodal inversion also reverses orientation; the 3-D original preserves it, so the original half-turn interpretation should not be copied into the planar interface.

## Jacobian: where an answer is sensitive

Each receiver averages signed wave displacement in six time bins. A selected reading is \(f(m,q)\), where q specifies the source, receiver and bin. The map shown in the interface is

\[
J_i(m,q)=\frac{\partial f(m,q)}{\partial m_i}.
\]

`src/probe.js` records the wave trajectory and reverses the **actual discretized recurrence**. Because L is symmetric, it also propagates the state adjoint. Each edge contributes to the diffusivity gradient:

\[
\partial_{D_i}f\mathrel{+}=\frac{\Delta t^2}{2}
(\lambda_i-\lambda_j)(a_j-a_i),
\]

with the same contribution to \(D_j\). The remaining chain is

\[
\partial_{\rho_i}f=\partial_{D_i}f\,
\frac{-2\kappa}{(1+\kappa\rho_i)^3},\qquad
\nabla_mf=2m\odot B^T\nabla_\rho f.
\]

B is self-adjoint. Tests compare Jacobian-vector products with independently recomputed central directional differences, including early and late bins. The UI also checks the most sensitive single cell with a central perturbation of `1e-4`.

Positive color means a small increase to **signed m**, not to density independently, would increase the selected signed reading. Negative color means it would decrease it. The display rescales to its own maximum and labels this. This is local sensitivity: not a contribution attribution, not an importance probability, and not evidence that a meaning resides at a colored pixel. At m=0 the derivative is zero because density uses m², although a finite new trace can change the answer.

## From responses to a tentative memory label

Four sources × four receivers × six bins produce 96 features. The readout is ridge regression on one-hot teaching labels (`alpha=5`), with feature means and scales fitted on training responses only. It does not inspect field values. Its four scores need not lie between zero and one. The UI's small-margin warning is a display heuristic, not calibrated uncertainty; out-of-family inputs can still receive confident scores.

The direct baseline is a separately trained ridge readout of 8×8 block-averaged density (64 features). A scalar mean-density baseline asks whether spatial probing is adding anything beyond overall material amount. Training uses 16 episodes per class, seeds starting 1001; testing uses 8 per class starting 2001. Within a class seeds are consecutive; classes are separated by 100. Calibration seeds 11/13 are separate. Jittered variants use deterministic small translations, rotations and scale changes. No held-out episode is used to select physical parameters or fit normalization.

The receipt includes genuine failures. Erasure, a fixed medium, and coupling-off are interventions read by the frozen wave classifier. Complete equality of coupling-off features and donor-substituted features is checked independently of classifier accuracy. These interventions demonstrate dependence on the numerical material; they do not show that the particular moon map or classifier is uniquely necessary.

## Relation to Jacobian Lens and the brain

The analogy is a **hidden state with observable downstream effects**. Anthropic's Jacobian Lens estimates how internal language-model residual states affect later states and combines that transport with vocabulary readout. Their J-space construction concerns token-like representational directions and subsequent verbalization/manipulation. MoonFormer instead differentiates a physical simulator's receiver response with respect to a structural field. It has no vocabulary geometry or language-model residual stream.

The supplied J-CoT paper proposes learned extraction, reconstruction and recurrence in language-model J-space. That is a more substantial learned architecture than this instrument. To connect the two computationally, a future experiment could learn a response vocabulary, extract a recurrent cue, and ask another query. That remains a proposal.

“Trying to remember a person through the places, times and rhythms they touched” suggests recurrent cue-guided retrieval. Hippocampal pattern completion and context reinstatement are relevant comparison points. This v0 performs classification after four fixed probes; it does **not** restore an episode from a partial cue, choose its next association, or demonstrate an experience of thinking.

Swift–Hohenberg pattern formation and neural-field models share some mathematical structures. That does not establish that this scalar field is the equation of the brain. Waveguiding is not a demonstrated model of myelination, a mobility factor is not Fusi's multi-variable synaptic consolidation, and coordinate inversion alone is not a compressed timeline.

## Primary sources

- [The original CrystalMoon repository](https://github.com/anttiluode/CrystalMoon); this experiment uses the separate original attachments preserved here.
- [Gurnee et al., *Verbalizable Representations Form a Global Workspace in Language Models* (2026)](https://transformer-circuits.pub/2026/workspace/index.html): Jacobian Lens and J-space.
- [Wu et al., *J-CoT: Chain-of-Thought in J-Space* (2026)](https://arxiv.org/abs/2607.21981): the supplied paper, a separate work from Anthropic's original.
- [Burke & Knobloch, *Localized states in the generalized Swift–Hohenberg equation* (2006)](https://doi.org/10.1103/PhysRevE.73.056211): localized states and pinning; not proof for this 2-D configuration.
- [Benna & Fusi, *Computational principles of synaptic memory consolidation* (2016)](https://doi.org/10.1038/nn.4401): multiple internal variables and timescales, more than a single mobility factor.
- [Horner et al., *Evidence for holistic episodic recollection via hippocampal pattern completion* (2015)](https://doi.org/10.1038/ncomms8462): partial-cue reinstatement, a goal beyond this classifier.

## What would justify the next architecture

Test multiple writes, overwrite/interference, held-out recall after longer delays, and restoration from partial cues. Compare ordinary receivers against inversion at matched feature budgets. Learn or select queries using response uncertainty without access to the target label. If recurrent cue→probe→cue loops improve retrieval against fixed probes, they would supply evidence for the next MoonFormer architecture. They are not implied by a trippy field or a colored derivative map.

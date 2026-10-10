/*  CrystalMoon core — the laws of the world, written once on the CPU so they
 *  can be tested, and mirrored line for line by the GPU shaders in index.html.
 *
 *  THE CRYSTALS.  A Mexican-hat field: the Swift–Hohenberg equation
 *
 *     ∂ψ/∂t = M(ψ) · [ ε(x) ψ − (q₀² + ∇²)² ψ + g ψ² − ψ³ ]
 *
 *  The operator −(q₀² + ∇²)² is a Mexican hat in Fourier space: it amplifies
 *  only waves of wavelength 2π/q₀ and kills the rest, so the field condenses
 *  into a lattice of "atoms" one wavelength apart. In 3-D with g > 0 the
 *  winning lattice is body-centred cubic; the isosurface at high ψ shows the
 *  atoms, at low ψ the bonds between them. (This is the phase-field-crystal
 *  family of Elder & Grant, 2002.) It is a gradient flow: it settles. It does
 *  not flicker.
 *
 *  THE CLOCK.  M(ψ) = 1 / (1 + T ψ²): where the crystal is dense, its time
 *  runs slow (the Clockfield idea, the same c² = 1/(1+Tφ²) term that sat in
 *  crystal_kingdom.py). Light gets the same idea: refractive index
 *  n = 1 + κ ρ, with ρ the crystal density blurred over a wavelength, so rays
 *  bend toward dense crystal the way light bends toward mass.
 *  Honest note: these are two uses of one idea, not derived from one action.
 *
 *  ε(x) is the local "supercooling": positive on islands (crystals grow),
 *  negative in the open sea (empty space stays empty), plus a trail that your
 *  flight writes into the world and that slowly fades.
 *
 *  THE MOON.  The portal is the antipodal sphere inversion
 *
 *     Φ(x) = c − R² (x − c) / |x − c|²
 *
 *  It swaps the inside of the moon with the whole outside, sends infinity to
 *  the centre, preserves angles (Liouville: in 3-D the only angle-preserving
 *  maps are Möbius maps, built from inversions), keeps orientation, and is its
 *  own inverse. On the moon's surface its derivative is a half-turn about the
 *  radial axis — so whoever flies through comes out turned over. No
 *  orientation-preserving map can turn a ball inside out and leave your frame
 *  alone.
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.CM = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const N = 64;                  // voxels per side of one period of the world
  const MOON = { c: [32, 32, 32], R: 9 };
  const MAX_ISLANDS = 8;

  // ------------------------------------------------------------------ hashing
  function mix(x) {
    x |= 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }
  function rnd(level, k) { return mix(Math.imul(level + 1, 0x9e3779b1) ^ mix(k * 7919 + 13)) / 4294967296; }

  // ------------------------------------------------------------------ the laws
  /** The law of level k. Level 0 is fixed; deeper levels are drawn from a hash. */
  function law(level) {
    const u = (k) => rnd(level, k);
    const L = level === 0
      ? { lambda: 9.0, g: 1.0, epsIsland: 0.26, isoFrac: 0.42, kappa: 0.8, T: 1.5, hue: 0.58 }
      : {
        lambda: 7.0 + 4.5 * u(1),
        g: 0.35 + 1.0 * u(2),
        epsIsland: 0.16 + 0.18 * u(3),
        isoFrac: [0.42, 0.25, -0.15, 0.55][Math.floor(u(4) * 4)],
        kappa: 0.4 + 1.2 * u(5),
        T: 0.5 + 4.0 * u(6),
        hue: u(7),
      };
    L.level = level;
    L.q0 = 2 * Math.PI / L.lambda;
    // open sea: negative enough that island crystals cannot creep outward.
    // Calibrated: at g = 1, a sea of −0.06 is invaded by the crystal front
    // within ~5000 steps; at −0.3 the far sea stays empty (tests: T3).
    L.epsSea = -0.3 * Math.max(1, L.g);
    // explicit stability: dt · max|(q0² + λ)²| < 2 with λ ∈ [−12, 0] on the 7-point lattice
    L.dt = 1.5 / Math.pow(12 - L.q0 * L.q0, 2);
    const nIsl = level === 0 ? 6 : 4 + Math.floor(u(8) * 4);
    L.islands = [];
    for (let i = 0; i < MAX_ISLANDS; i++) {
      if (i >= nIsl) { L.islands.push({ c: [0, 0, 0], r: 0 }); continue; }
      const r = 9 + 7 * u(50 + i);
      // islands crowd around the moon: from outside it floats in crystal
      // clouds; from inside, the clouds near its surface fill your view
      const th = Math.acos(2 * u(60 + 2 * i) - 1), ph = 2 * Math.PI * u(61 + 2 * i);
      const d = i === 0 ? MOON.R + 0.7 * r : MOON.R + 0.6 * r + (22 - 0.6 * r) * u(80 + i);
      const c = [MOON.c[0] + d * Math.sin(th) * Math.cos(ph), MOON.c[1] + d * Math.sin(th) * Math.sin(ph), MOON.c[2] + d * Math.cos(th)];
      L.islands.push({ c, r });
    }
    const shape = L.isoFrac > 0.5 ? 'atoms' : L.isoFrac > 0.3 ? 'atoms and necks' : L.isoFrac > 0 ? 'bonded lattice' : 'foam of bonds';
    L.name = `${shape} · λ ${L.lambda.toFixed(1)} · clock ${L.T.toFixed(1)} · lens ${L.kappa.toFixed(2)}`;
    return L;
  }

  function wrap1(d) { d = Math.abs(d) % N; return Math.min(d, N - d); }
  function wrapDist(a, b) { return Math.hypot(wrap1(a[0] - b[0]), wrap1(a[1] - b[1]), wrap1(a[2] - b[2])); }
  function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  function islandMask(L, x, y, z) {
    let m = 0;
    for (const isl of L.islands) {
      if (isl.r <= 0) continue;
      const d = Math.hypot(wrap1(x - isl.c[0]), wrap1(y - isl.c[1]), wrap1(z - isl.c[2]));
      m = Math.max(m, 1 - smoothstep(0.6 * isl.r, isl.r, d));
    }
    const dm = Math.hypot(wrap1(x - MOON.c[0]), wrap1(y - MOON.c[1]), wrap1(z - MOON.c[2]));
    return m * smoothstep(MOON.R + 0.5, MOON.R + 3, dm);
  }

  // ------------------------------------------------------- CPU reference field
  /** Field on an n³ periodic grid. The GPU version is the same two passes. */
  class Field {
    constructor(L, n = N) {
      this.L = L; this.n = n;
      const V = n * n * n;
      this.psi = new Float32Array(V);
      this.lap = new Float32Array(V);
      this.trail = new Float32Array(V);
      this.eps = new Float32Array(V);
      this.refreshEps();
    }
    idx(x, y, z) { const n = this.n; return ((z + n) % n) * n * n + ((y + n) % n) * n + ((x + n) % n); }
    refreshEps() {
      const n = this.n, s = N / n;
      for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = this.idx(x, y, z);
        const m = islandMask(this.L, x * s, y * s, z * s);
        this.eps[i] = this.L.epsSea + (this.L.epsIsland - this.L.epsSea) * m;
      }
    }
    seedNoise(amp, seed = 1) {
      for (let i = 0; i < this.psi.length; i++) this.psi[i] = amp * (mix(i * 2654435761 ^ seed) / 4294967296 - 0.5);
    }
    _laplace(src, dst) {
      const n = this.n;
      for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = this.idx(x, y, z);
        dst[i] = src[this.idx(x + 1, y, z)] + src[this.idx(x - 1, y, z)] + src[this.idx(x, y + 1, z)]
          + src[this.idx(x, y - 1, z)] + src[this.idx(x, y, z + 1)] + src[this.idx(x, y, z - 1)] - 6 * src[i];
      }
    }
    /** One step. Pass 1: lap = ∇²ψ. Pass 2: ψ += dt·M·[(ε−q⁴)ψ − 2q²∇²ψ − ∇⁴ψ + gψ² − ψ³]. */
    step(dt = this.L.dt, epsOverride) {
      const { q0, g, T } = this.L;
      const q2 = q0 * q0, q4 = q2 * q2;
      this._laplace(this.psi, this.lap);
      const L2 = new Float32Array(this.psi.length);
      this._laplace(this.lap, L2);
      for (let i = 0; i < this.psi.length; i++) {
        const p = this.psi[i];
        const e = (epsOverride != null ? epsOverride : this.eps[i]) + this.trail[i];
        const f = (e - q4) * p - 2 * q2 * this.lap[i] - L2[i] + g * p * p - p * p * p;
        const M = 1 / (1 + T * p * p);
        this.psi[i] = p + dt * M * f;
      }
    }
    stats(mask) {
      let mx = 0, sum2 = 0, n = 0;
      for (let i = 0; i < this.psi.length; i++) {
        if (mask && !mask(i)) continue;
        const p = this.psi[i];
        mx = Math.max(mx, Math.abs(p)); sum2 += p * p; n++;
      }
      return { max: mx, rms: Math.sqrt(sum2 / Math.max(1, n)) };
    }
  }

  // ------------------------------------------------------------ the moon portal
  /** Antipodal inversion through the moon: an involution, orientation-preserving. */
  function portal(x, c = MOON.c, R = MOON.R) {
    const r = [x[0] - c[0], x[1] - c[1], x[2] - c[2]];
    const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    const s = R * R / r2;
    return [c[0] - s * r[0], c[1] - s * r[1], c[2] - s * r[2]];
  }
  /** Derivative of the portal at x: (R²/|r|²) · (2 r̂ r̂ᵀ − I). On the moon, a half-turn about r̂. */
  function portalJacobian(x, c = MOON.c, R = MOON.R) {
    const r = [x[0] - c[0], x[1] - c[1], x[2] - c[2]];
    const r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    const n = Math.sqrt(r2), h = r.map((v) => v / n), s = R * R / r2;
    const J = [];
    for (let i = 0; i < 3; i++) { J.push([]); for (let j = 0; j < 3; j++) J[i].push(s * (2 * h[i] * h[j] - (i === j ? 1 : 0))); }
    return J;
  }

  return { N, MOON, MAX_ISLANDS, law, islandMask, Field, portal, portalJacobian, mix, rnd, wrapDist };
});

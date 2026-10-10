/* MoonFormer: slow structural medium. Same scalar SH family as CrystalMoon,
 * reduced to a periodic 2-D grid. No input history is kept inside the field. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MFField = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = Object.freeze({ n: 32, lambda: 6, g: 1.2, T: 1.5, epsilon: -.10 });
  const MAX_AMPLITUDE = 8;
  const limits = { n: [8, 96], lambda: [3, 32], g: [0, 3], T: [0, 100], epsilon: [-1, 1] };
  const grids = new Map();

  function parameters(input = {}) {
    for (const key of Object.keys(input)) if (!Object.hasOwn(limits, key)) throw new Error(`Unexpected parameter: ${key}`);
    const p = { ...defaults, ...input };
    for (const [key, [lo, hi]] of Object.entries(limits)) {
      if (!Number.isFinite(p[key]) || p[key] < lo || p[key] > hi) throw new Error(`Invalid ${key}: ${p[key]}`);
    }
    if (!Number.isInteger(p.n)) throw new Error('Grid n must be an integer');
    return p;
  }

  function grid(n) {
    if (grids.has(n)) return grids.get(n);
    const size = n * n, east = new Int32Array(size), west = new Int32Array(size);
    const north = new Int32Array(size), south = new Int32Array(size);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x;
      east[i] = y * n + (x + 1) % n; west[i] = y * n + (x + n - 1) % n;
      north[i] = ((y + n - 1) % n) * n + x; south[i] = ((y + 1) % n) * n + x;
    }
    const result = { east, west, north, south }; grids.set(n, result); return result;
  }

  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function laplace(src, dst, links) {
    const { east, west, north, south } = links;
    for (let i = 0; i < src.length; i++) dst[i] = src[east[i]] + src[west[i]] + src[north[i]] + src[south[i]] - 4 * src[i];
    return dst;
  }

  // Periodic, symmetric convolution. Its transpose is itself.
  function blur(src, n, passes = 2) {
    const { east, west, north, south } = grid(n);
    let a = Float64Array.from(src), b = new Float64Array(src.length), c = new Float64Array(src.length);
    for (let k = 0; k < passes; k++) {
      for (let i = 0; i < a.length; i++) b[i] = (a[west[i]] + 2 * a[i] + a[east[i]]) * .25;
      for (let i = 0; i < a.length; i++) c[i] = (b[north[i]] + 2 * b[i] + b[south[i]]) * .25;
      const swap = a; a = c; c = swap;
    }
    return a;
  }
  function density(src, n, passes = 2) { return blur(Float64Array.from(src, v => v * v), n, passes); }

  class Field {
    constructor(input = {}) {
      this.params = Object.freeze(parameters(input)); this.n = this.params.n;
      this.values = new Float64Array(this.n * this.n);
      this.lap = new Float64Array(this.values.length); this.lap2 = new Float64Array(this.values.length);
      this.links = grid(this.n);
      this.q2 = (2 * Math.PI / this.params.lambda) ** 2;
      this.linearStiffness = Math.max(this.q2 ** 2, (8 - this.q2) ** 2);
      this.dt = 1.2 / this.linearStiffness;
    }
    seed(seed, amplitude = .08) {
      const rng = random(seed);
      for (let i = 0; i < this.values.length; i++) this.values[i] = amplitude * (rng() - .5);
      return this;
    }
    step(count = 1, input = null) {
      if (!Number.isInteger(count) || count < 0 || count > 100000) throw new Error('Invalid step count');
      const { g, T, epsilon } = this.params;
      const mask = input && input.mask, gain = input ? (input.gain ?? .55) : 0, drive = input ? (input.drive ?? .006) : 0;
      if (mask && mask.length !== this.values.length) throw new Error('Wrong input mask length');
      if (!Number.isFinite(gain) || !Number.isFinite(drive) || Math.abs(gain) > 2 || Math.abs(drive) > 1 || (mask && !mask.every(v => Number.isFinite(v) && Math.abs(v) <= 1))) throw new Error('Invalid writing input');
      const v = this.values, q2 = this.q2, q4 = q2 * q2;
      if (!v.every(p => Number.isFinite(p) && Math.abs(p) <= MAX_AMPLITUDE)) throw new Error('Material outside the supported numerical range');
      const checkpoint = Float64Array.from(v), epsilonBound = Math.abs(epsilon) + (mask ? Math.abs(gain) : 0);
      try {
        for (let k = 0; k < count; k++) {
          let amplitude = 0; for (let i = 0; i < v.length; i++) amplitude = Math.max(amplitude, Math.abs(v[i]));
          // Keep the nominal elapsed time, but split stiff nonlinear steps.
          // The default experiment uses one substep; its receipt is unchanged.
          const stiffness = this.linearStiffness + epsilonBound + 2 * g * amplitude + 3 * amplitude * amplitude;
          const substeps = Math.max(1, Math.ceil(this.dt * stiffness / 1.8)), dt = this.dt / substeps;
          for (let sub = 0; sub < substeps; sub++) {
            laplace(v, this.lap, this.links); laplace(this.lap, this.lap2, this.links);
            for (let i = 0; i < v.length; i++) {
              const p = v[i], w = mask ? mask[i] : 0;
              const force = (epsilon + gain * w - q4) * p - 2 * q2 * this.lap[i] - this.lap2[i] + g * p * p - p * p * p + drive * w;
              const next = p + dt * force / (1 + T * p * p);
              if (!Number.isFinite(next) || Math.abs(next) > MAX_AMPLITUDE) throw new Error('Evolution exceeded the supported numerical range; reduce the input or change the medium');
              v[i] = next;
            }
          }
        }
      } catch (error) { v.set(checkpoint); throw error; }
      return this;
    }
    stats() {
      laplace(this.values, this.lap, this.links); laplace(this.lap, this.lap2, this.links);
      const { g, T, epsilon } = this.params;
      let sum2 = 0, max = 0, force2 = 0, rate2 = 0;
      for (let i = 0; i < this.values.length; i++) {
        const p = this.values[i], force = (epsilon - this.q2 ** 2) * p - 2 * this.q2 * this.lap[i] - this.lap2[i] + g * p * p - p ** 3;
        sum2 += p * p; max = Math.max(max, Math.abs(p)); force2 += force * force; rate2 += (force / (1 + T * p * p)) ** 2;
      }
      const size = this.values.length;
      return { rms: Math.sqrt(sum2 / size), max, forceRms: Math.sqrt(force2 / size), rateRms: Math.sqrt(rate2 / size) };
    }
    energy() {
      laplace(this.values, this.lap, this.links);
      const { epsilon, g } = this.params; let total = 0;
      for (let i = 0; i < this.values.length; i++) {
        const p = this.values[i];
        total += -.5 * epsilon * p * p + .5 * (this.q2 * p + this.lap[i]) ** 2 - g * p ** 3 / 3 + .25 * p ** 4;
      }
      return total / this.values.length;
    }
    snapshot() {
      if (!this.values.every(v => Number.isFinite(v) && Math.abs(v) <= MAX_AMPLITUDE)) throw new Error('Cannot save invalid material');
      return { format: 'moonformer-field-v1', params: { ...this.params }, values: Array.from(this.values) };
    }
    static from(saved) {
      if (!saved || typeof saved !== 'object') throw new Error('Invalid memory');
      for (const key of Object.keys(saved)) if (!['format', 'params', 'values'].includes(key)) throw new Error(`Unexpected memory property: ${key}`);
      if (saved.format !== 'moonformer-field-v1' || !saved.params) throw new Error('Unknown memory format');
      const f = new Field(saved.params);
      if (!Array.isArray(saved.values) || saved.values.length !== f.values.length || !saved.values.every(v => Number.isFinite(v) && Math.abs(v) <= MAX_AMPLITUDE)) throw new Error('Invalid memory values or length');
      f.values.set(saved.values); return f;
    }
  }
  return { defaults, MAX_AMPLITUDE, parameters, random, grid, laplace, blur, density, Field };
});

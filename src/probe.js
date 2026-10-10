/* Fast read-only wave probes and the exact reverse derivative of their
 * discretized receiver outputs. This is a local physical Jacobian, not J-space. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./field.js') : root.MFField, node ? require('./moon.js') : root.MFMoon);
  if (node) module.exports = api; else root.MFProbe = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (fields, moons) {
  'use strict';
  const { grid, density, blur } = fields, { Moon } = moons;
  const probeDefaults = Object.freeze({ steps: 120, bins: 6, dt: .32, damping: .04, omega: .06, kappa: 2, blurPasses: 2 });
  function waveLaplacian(a, D, n, dst = new Float64Array(a.length)) {
    const { east, west, north, south } = grid(n);
    for (let i = 0; i < a.length; i++) {
      const p = a[i], d = D[i];
      dst[i] = .5 * ((d + D[east[i]]) * (a[east[i]] - p) + (d + D[west[i]]) * (a[west[i]] - p)
        + (d + D[north[i]]) * (a[north[i]] - p) + (d + D[south[i]]) * (a[south[i]] - p));
    }
    return dst;
  }
  class Probe {
    constructor(n, options = {}) {
      for (const key of Object.keys(options)) if (!Object.hasOwn(probeDefaults, key)) throw new Error(`Unexpected probe parameter: ${key}`);
      this.n = n; this.params = Object.freeze({ ...probeDefaults, ...options });
      const p = this.params;
      if (!Number.isInteger(n) || n < 8 || n > 96 || !Number.isInteger(p.steps) || p.steps < 1 || p.steps > 1000 || !Number.isInteger(p.bins) || p.bins < 1 || p.bins > p.steps
        || p.dt <= 0 || p.dt > .4 || p.kappa < 0 || p.kappa > 20 || p.damping < 0 || p.damping > 1 || p.omega < 0 || p.omega > 1 || !Number.isInteger(p.blurPasses) || p.blurPasses < 1 || p.blurPasses > 8
        || Object.values(p).some(v => !Number.isFinite(v))) throw new Error('Invalid probe parameters');
      this.moon = new Moon(n); this.links = grid(n);
      const c = (n - 1) / 2, d = n * .37;
      this.sources = [[c - d, c], [c, c - d], [c + d, c], [c, c + d]];
      this.binCounts = new Int32Array(p.bins);
      for (let k = 0; k < p.steps; k++) this.binCounts[Math.floor(k * p.bins / p.steps)]++;
    }
    run(m, source = 0, { tape = false } = {}) {
      if (m.length !== this.n ** 2 || !m.every(Number.isFinite)) throw new Error('Invalid probe memory');
      if (!Number.isInteger(source) || source < 0 || source > 3) throw new Error('Invalid source');
      const p = this.params, rho = density(m, this.n, p.blurPasses), D = Float64Array.from(rho, v => (1 + p.kappa * v) ** -2);
      const size = m.length, [sx, sy] = this.sources[source];
      let now = new Float64Array(size);
      for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) now[y * this.n + x] = Math.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (2 * 1.2 ** 2));
      let previous = Float64Array.from(now), next = new Float64Array(size);
      const scratch = new Float64Array(size), features = new Float64Array(p.bins * 4);
      const frames = tape ? [Float64Array.from(previous), Float64Array.from(now)] : null;
      const dt2 = p.dt * p.dt, d = p.damping * p.dt, a = 2 - d - dt2 * p.omega ** 2, b = -(1 - d);
      for (let k = 0; k < p.steps; k++) {
        waveLaplacian(now, D, this.n, scratch);
        for (let i = 0; i < size; i++) next[i] = a * now[i] + b * previous[i] + dt2 * scratch[i];
        const bin = Math.floor(k * p.bins / p.steps);
        for (let r = 0; r < 4; r++) {
          let response = 0; const w = this.moon.receivers[r].outer;
          for (let i = 0; i < size; i++) response += w[i] * next[i];
          features[r * p.bins + bin] += response / this.binCounts[bin];
        }
        if (tape) frames.push(Float64Array.from(next));
        const swap = previous; previous = now; now = next; next = swap;
      }
      return { features, frames, source, diffusivity: D, rho, memory: tape ? Float64Array.from(m) : null, n: this.n, params: p };
    }
    gradient(m, run, feature) {
      const p = this.params, size = this.n ** 2;
      if (m.length !== size || run.n !== this.n || !run.params || Object.keys(p).some(key => p[key] !== run.params[key])
        || !run.frames || run.frames.length !== p.steps + 2 || !run.memory || !m.every((v, i) => v === run.memory[i])) throw new Error('Gradient needs the matching recorded probe');
      if (!Number.isInteger(feature) || feature < 0 || feature >= p.bins * 4) throw new Error('Invalid feature');
      const receiver = Math.floor(feature / p.bins), bin = feature % p.bins, w = this.moon.receivers[receiver].outer;
      const adj = Array.from({ length: p.steps + 2 }, () => new Float64Array(size));
      for (let k = 0; k < p.steps; k++) if (Math.floor(k * p.bins / p.steps) === bin) {
        for (let i = 0; i < size; i++) adj[k + 2][i] += w[i] / this.binCounts[bin];
      }
      const gradD = new Float64Array(size), scratch = new Float64Array(size), { east, south } = this.links;
      const dt2 = p.dt ** 2, d = p.damping * p.dt, a = 2 - d - dt2 * p.omega ** 2, b = -(1 - d);
      for (let k = p.steps - 1; k >= 0; k--) {
        const lambda = adj[k + 2], field = run.frames[k + 1];
        waveLaplacian(lambda, run.diffusivity, this.n, scratch);
        for (let i = 0; i < size; i++) {
          adj[k + 1][i] += a * lambda[i] + dt2 * scratch[i]; adj[k][i] += b * lambda[i];
          const j = east[i], h = south[i];
          const gx = .5 * dt2 * (lambda[i] - lambda[j]) * (field[j] - field[i]);
          const gy = .5 * dt2 * (lambda[i] - lambda[h]) * (field[h] - field[i]);
          gradD[i] += gx + gy; gradD[j] += gx; gradD[h] += gy;
        }
      }
      const gradRho = Float64Array.from(gradD, (v, i) => v * -2 * p.kappa / (1 + p.kappa * run.rho[i]) ** 3);
      const chain = blur(gradRho, this.n, p.blurPasses);
      return Float64Array.from(chain, (v, i) => 2 * m[i] * v);
    }
    fingerprint(m) {
      const values = [];
      for (let source = 0; source < 4; source++) values.push(...this.run(m, source).features);
      return Float64Array.from(values);
    }
  }
  return { Probe, probeDefaults, waveLaplacian };
});

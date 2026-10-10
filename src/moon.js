/* Bounded, discretized antipodal circle inversion. The inverse coordinate
 * formula does NOT give the discrete adjoint; scatter the interpolation weights. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MFMoon = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class Moon {
    constructor(n, radius = n * .21) {
      this.n = n; this.radius = radius; this.center = (n - 1) / 2;
      this.indices = new Int32Array(n * n * 4).fill(-1); this.weights = new Float64Array(n * n * 4);
      this.valid = new Uint8Array(n * n); this.validCount = 0;
      const c = this.center, R2 = radius * radius;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = x - c, dy = y - c, r2 = dx * dx + dy * dy, row = y * n + x;
        if (r2 < 1e-12 || r2 > R2) continue;
        const u = c - R2 * dx / r2, v = c - R2 * dy / r2;
        if (u < 0 || v < 0 || u > n - 1 || v > n - 1) continue;
        const ix = Math.min(n - 2, Math.floor(u)), iy = Math.min(n - 2, Math.floor(v)), tx = u - ix, ty = v - iy;
        this.indices.set([iy * n + ix, iy * n + ix + 1, (iy + 1) * n + ix, (iy + 1) * n + ix + 1], row * 4);
        this.weights.set([(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], row * 4);
        this.valid[row] = 1; this.validCount++;
      }
      this.receivers = [];
      for (let r = 0; r < 4; r++) {
        const angle = r * Math.PI / 2, x = c + .62 * radius * Math.cos(angle), y = c + .62 * radius * Math.sin(angle);
        const mask = new Float64Array(n * n); let total = 0;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const k = j * n + i;
          if (this.valid[k]) total += mask[k] = Math.exp(-((i - x) ** 2 + (j - y) ** 2) / (2 * .65 ** 2));
        }
        if (!total) throw new Error('Moon receiver outside valid window');
        for (let i = 0; i < mask.length; i++) mask[i] /= total;
        this.receivers.push({ x, y, mask, outer: this.adjoint(mask) });
      }
    }
    apply(a) {
      if (a.length !== this.n ** 2) throw new Error('Wrong moon input size');
      const out = new Float64Array(a.length);
      for (let row = 0; row < a.length; row++) if (this.valid[row]) {
        for (let k = 0; k < 4; k++) out[row] += this.weights[4 * row + k] * a[this.indices[4 * row + k]];
      }
      return out;
    }
    adjoint(b) {
      if (b.length !== this.n ** 2) throw new Error('Wrong moon adjoint input size');
      const out = new Float64Array(b.length);
      for (let row = 0; row < b.length; row++) if (this.valid[row]) {
        for (let k = 0; k < 4; k++) out[this.indices[4 * row + k]] += this.weights[4 * row + k] * b[row];
      }
      return out;
    }
  }
  return { Moon };
});

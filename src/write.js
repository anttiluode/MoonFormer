/* The teaching fixture lives outside the memory and the probe. These geometric
 * labels are experiment ground truth, not input to reading or differentiation. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./field.js') : root.MFField);
  if (node) module.exports = api; else root.MFWrite = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (fields) {
  'use strict';
  const { random } = fields;
  const names = Object.freeze(['arc', 'fork', 'loop', 'zigzag']);
  const writeDefaults = Object.freeze({ writeSteps: 1500, retainSteps: 6000, gain: .55, drive: .006, width: 1.45 });

  function paths(name, variant = 0) {
    let strokes;
    if (name === 'arc') {
      const curve = [];
      for (let j = 0; j <= 30; j++) { const t = Math.PI * (j / 30); curve.push([.5 + .24 * Math.cos(t), .55 - .24 * Math.sin(t)]); }
      strokes = [curve];
    } else if (name === 'fork') strokes = [[[.5, .77], [.5, .5], [.28, .26]], [[.5, .5], [.72, .26]]];
    else if (name === 'loop') {
      const curve = [];
      for (let j = 0; j <= 40; j++) { const t = 2 * Math.PI * j / 40; curve.push([.5 + .23 * Math.cos(t), .5 + .23 * Math.sin(t)]); }
      strokes = [curve];
    } else if (name === 'zigzag') strokes = [[[.26, .31], [.42, .69], [.58, .31], [.74, .69]]];
    else throw new Error('Unknown teaching shape');
    if (!variant) return strokes;
    const rng = random(variant), dx = (rng() - .5) * .07, dy = (rng() - .5) * .07, scale = 1 + (rng() - .5) * .12, angle = (rng() - .5) * .25;
    const c = Math.cos(angle), s = Math.sin(angle);
    return strokes.map(stroke => stroke.map(([x, y]) => [.5 + dx + scale * (c * (x - .5) - s * (y - .5)), .5 + dy + scale * (s * (x - .5) + c * (y - .5))]));
  }
  function mask(n, strokes, width = writeDefaults.width) {
    const result = new Float64Array(n * n);
    const segments = strokes.flatMap(stroke => stroke.slice(1).map((point, i) => [stroke[i].map(v => v * (n - 1)), point.map(v => v * (n - 1))]));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let nearest = Infinity;
      for (const [[ax, ay], [bx, by]] of segments) {
        const vx = bx - ax, vy = by - ay, denominator = vx * vx + vy * vy;
        const t = denominator ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / denominator)) : 0;
        nearest = Math.min(nearest, (x - ax - t * vx) ** 2 + (y - ay - t * vy) ** 2);
      }
      result[y * n + x] = Math.exp(-nearest / (2 * width ** 2));
    }
    return result;
  }
  function teach(field, name, seed, options = {}) {
    const p = { ...writeDefaults, ...options }, strokes = paths(name, seed ^ 0x48ab29), input = { mask: mask(field.n, strokes, p.width), gain: p.gain, drive: p.drive };
    field.seed(seed); field.step(p.writeSteps, input);
    const afterWrite = field.stats();
    field.step(p.retainSteps); // No mask, gain, or additive drive is supplied.
    return { afterWrite, afterRetention: field.stats() };
  }
  return { names, writeDefaults, paths, mask, teach };
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { fit, predict } = require('../src/readout.js');
const { Field, defaults } = require('../src/field.js');
const { Probe } = require('../src/probe.js');
const { mask, paths } = require('../src/write.js');

test('ridge readout generalizes a separable example and uses only training normalization', () => {
  const rows = [[-2, -.1], [-1, .1], [1, -.1], [2, .1]], labels = [0, 0, 1, 1];
  const model = fit(rows, labels, ['left', 'right'], 1);
  assert.equal(predict(model, [-3, 0]).index, 0);
  assert.equal(predict(model, [3, 0]).index, 1);
  assert.deepEqual(model.mean, [0, 0]);
  const saved = JSON.stringify(model);
  predict(model, [10000, -10000]);
  assert.equal(JSON.stringify(model), saved);
  assert.throws(() => fit(rows, [0, 0, 1], ['a', 'b']), /labels/i);
  assert.throws(() => predict(model, [NaN, 0]), /features/i);
});

test('probe answers follow a substituted numerical state, independent of fixture label', () => {
  const p = new Probe(16, { steps: 40 }), a = new Field({ ...defaults, n: 16 }), b = new Field({ ...defaults, n: 16 });
  a.values.set(mask(16, paths('arc'))); b.values.set(mask(16, paths('fork')));
  const original = Array.from(p.fingerprint(a.values)), donor = Array.from(p.fingerprint(b.values));
  assert.ok(original.some((v, i) => Math.abs(v - donor[i]) > 1e-6));
  a.values.set(b.values);
  assert.deepEqual(Array.from(p.fingerprint(a.values)), donor);
  a.values.fill(0);
  assert.deepEqual(Array.from(p.fingerprint(a.values)), Array.from(p.fingerprint(new Float64Array(256))));
});

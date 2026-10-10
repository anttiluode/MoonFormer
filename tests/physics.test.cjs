const test = require('node:test');
const assert = require('node:assert/strict');
const { Field, defaults, random, density, blur } = require('../src/field.js');
const { Moon } = require('../src/moon.js');
const { Probe, waveLaplacian } = require('../src/probe.js');

function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }
function close(a, b, tol = 1e-9) { assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`); }

test('unforced empty medium remains empty and seeded dynamics dissipate frozen energy', () => {
  const f = new Field({ ...defaults, n: 16 });
  f.step(20);
  assert.equal(f.stats().rms, 0);
  f.seed(12);
  let previous = f.energy();
  for (let k = 0; k < 100; k++) {
    f.step(1);
    const e = f.energy();
    assert.ok(e <= previous + 1e-12, `energy rose ${previous} → ${e}`);
    previous = e;
  }
});

test('memory round trip preserves numerical state and rejects labels, invalid values and unsafe grids', () => {
  const f = new Field({ ...defaults, n: 16 }); f.seed(7);
  const saved = f.snapshot();
  assert.deepEqual(Object.keys(saved).sort(), ['format', 'params', 'values']);
  assert.deepEqual(Field.from(saved).snapshot(), saved);
  assert.throws(() => Field.from({ ...saved, label: 'secret' }), /unexpected/i);
  assert.throws(() => Field.from({ ...saved, params: { ...saved.params, constructor: 'secret' } }), /unexpected/i);
  assert.throws(() => Field.from({ ...saved, values: [Infinity] }), /values|length/i);
  assert.throws(() => Field.from({ ...saved, params: { ...saved.params, n: 1e6 } }), /grid|n/i);
});

test('density blur is self-adjoint and nonnegative for squared fields', () => {
  const rng = random(8), a = Float64Array.from({ length: 64 }, () => rng() - .5);
  const b = Float64Array.from(a, () => rng() - .5);
  close(dot(blur(a, 8), b), dot(a, blur(b, 8)));
  assert.ok(density(a, 8).every(v => v >= 0));
});

test('finite moon interpolation has an exact discrete transpose, including clipped centre', () => {
  const moon = new Moon(16), rng = random(9);
  const a = Float64Array.from({ length: 256 }, () => rng() - .5);
  const b = Float64Array.from(a, () => rng() - .5);
  close(dot(moon.apply(a), b), dot(a, moon.adjoint(b)), 1e-10);
  assert.ok(moon.validCount > 0 && moon.validCount < 256);
});

test('wave divergence is symmetric and cannot create energy in its spatial quadratic form', () => {
  const n = 12, rng = random(2);
  const a = Float64Array.from({ length: n * n }, () => rng() - .5);
  const b = Float64Array.from(a, () => rng() - .5);
  const d = Float64Array.from(a, () => .1 + rng());
  const la = waveLaplacian(a, d, n), lb = waveLaplacian(b, d, n);
  close(dot(a, lb), dot(la, b), 1e-9);
  assert.ok(dot(a, la) <= 0);
});

test('reverse wave Jacobian agrees with independent directional differences for early and late bins', () => {
  const n = 16, rng = random(31), m = Float64Array.from({ length: n * n }, () => .4 * (rng() - .2));
  const direction = Float64Array.from(m, () => rng() - .5);
  const norm = Math.sqrt(dot(direction, direction));
  direction.forEach((v, i) => direction[i] = v / norm);
  const p = new Probe(n, { steps: 60, bins: 5 });
  for (const feature of [0, 7, 19]) {
    const run = p.run(m, 1, { tape: true });
    const grad = p.gradient(m, run, feature);
    const h = 1e-4;
    const plus = Float64Array.from(m, (v, i) => v + h * direction[i]);
    const minus = Float64Array.from(m, (v, i) => v - h * direction[i]);
    const numerical = (p.run(plus, 1).features[feature] - p.run(minus, 1).features[feature]) / (2 * h);
    const analytic = dot(grad, direction);
    close(analytic, numerical, 1e-8 + Math.abs(numerical) * 1e-5);
    assert.ok(grad.every(Number.isFinite));
  }
});

test('reading cannot mutate memory; removing coupling makes every memory produce the same answer', () => {
  const f = new Field({ ...defaults, n: 16 }); f.seed(9);
  const before = f.snapshot(), p = new Probe(16, { steps: 30, kappa: 0 });
  const a = p.run(f.values, 0).features, b = p.run(new Float64Array(256).fill(.7), 0).features;
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.deepEqual(f.snapshot(), before);
});

test('a recorded derivative refuses a different medium or probe law', () => {
  const f = new Field({ ...defaults, n: 16 }); f.seed(5);
  const p = new Probe(16, { steps: 30 }), recorded = p.run(f.values, 0, { tape: true });
  const altered = Float64Array.from(f.values); altered[10] += .01;
  assert.throws(() => p.gradient(altered, recorded, 0), /matching/i);
  assert.throws(() => p.gradient(f.values.slice(1), recorded, 0), /matching/i);
  assert.throws(() => p.gradient(f.values.slice(0, -1), recorded, 0), /matching/i);
  assert.throws(() => new Probe(16, { steps: 30, kappa: 3 }).gradient(f.values, recorded, 0), /matching/i);
});

test('supported stiff imported material stays finite while evolving', () => {
  const f = Field.from({ format: 'moonformer-field-v1', params: { n: 8, lambda: 3, g: 3, T: 0, epsilon: 1 }, values: Array(64).fill(-3) });
  f.step(20);
  assert.ok(f.values.every(Number.isFinite), 'a valid import diverged');
  assert.doesNotThrow(() => Field.from(f.snapshot()));
});

test('a finite evolved memory above the old amplitude cap still round trips', () => {
  const f = Field.from({ format: 'moonformer-field-v1', params: { n: 8, lambda: 32, g: 3, T: 1.5, epsilon: 1 }, values: Array(64).fill(2.5) });
  f.step(6000);
  assert.ok(f.values[0] > 3 && f.stats().forceRms < 1e-8);
  assert.deepEqual(Field.from(f.snapshot()).snapshot(), f.snapshot());
});

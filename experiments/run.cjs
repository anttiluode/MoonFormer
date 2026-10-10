const fs = require('node:fs');
const path = require('node:path');
const { Field, defaults, density, random } = require('../src/field.js');
const { Probe, probeDefaults } = require('../src/probe.js');
const { names, teach, writeDefaults } = require('../src/write.js');
const { fit, predict } = require('../src/readout.js');

// Frozen before the held-out run. Calibration used seeds 11/13 only.
const config = {
  field: { ...defaults, epsilon: -.10 },
  write: { ...writeDefaults }, probe: { ...probeDefaults },
  trainPerClass: 16, testPerClass: 8, alpha: 5,
  trainSeedBase: 1001, testSeedBase: 2001
};
function directFeatures(values, n) {
  const rho = density(values, n), side = 8, out = new Float64Array(side * side);
  const counts = new Uint32Array(out.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = Math.floor(y * side / n) * side + Math.floor(x * side / n);
    out[i] += rho[y * n + x]; counts[i]++;
  }
  out.forEach((v, i) => out[i] = v / counts[i]); return Array.from(out);
}
function scalarFeatures(values) { return [values.reduce((s, v) => s + v * v / values.length, 0)]; }
function evaluate(model, rows, labels) {
  const confusion = Array.from({ length: names.length }, () => Array(names.length).fill(0));
  let correct = 0;
  rows.forEach((row, i) => { const j = predict(model, row).index; confusion[labels[i]][j]++; correct += j === labels[i] ? 1 : 0; });
  return { accuracy: correct / rows.length, correct, total: rows.length, confusion };
}
function generate(base, perClass, probe) {
  const rows = [], direct = [], scalar = [], labels = [], states = [], retention = [];
  for (let label = 0; label < names.length; label++) for (let j = 0; j < perClass; j++) {
    const seed = base + 100 * label + j, field = new Field(config.field), stats = teach(field, names[label], seed, config.write);
    // The only data crossing into the probe is this numerical array.
    rows.push(Array.from(probe.fingerprint(field.values)));
    direct.push(directFeatures(field.values, field.n)); scalar.push(scalarFeatures(field.values)); labels.push(label);
    states.push(Float64Array.from(field.values)); retention.push({ label: names[label], seed, ...stats });
  }
  return { rows, direct, scalar, labels, states, retention };
}
function run() {
  const probe = new Probe(config.field.n, config.probe), train = generate(config.trainSeedBase, config.trainPerClass, probe);
  const model = fit(train.rows, train.labels, names, config.alpha);
  const directModel = fit(train.direct, train.labels, names, config.alpha), scalarModel = fit(train.scalar, train.labels, names, config.alpha);
  const test = generate(config.testSeedBase, config.testPerClass, probe);
  const empty = Array.from(probe.fingerprint(new Float64Array(config.field.n ** 2)));
  const erasedRows = test.rows.map(() => empty), fixedRows = test.rows.map(() => train.rows[0]);
  const uncoupled = new Probe(config.field.n, { ...config.probe, kappa: 0 });
  const offRows = test.states.map(m => Array.from(uncoupled.fingerprint(m)));
  let donorAgreement = 0, responseDifference = 0, erasedDifference = 0;
  const swappedRows = test.states.map((state, i) => {
    const j = (i + config.testPerClass) % test.states.length;
    const receivingField = new Field(config.field); receivingField.values.set(state);
    receivingField.values.set(test.states[j]);
    const swapped = Array.from(probe.fingerprint(receivingField.values));
    donorAgreement += swapped.every((v, k) => v === test.rows[j][k]) ? 1 : 0;
    responseDifference += Math.sqrt(swapped.reduce((s, v, k) => s + (v - test.rows[i][k]) ** 2 / swapped.length, 0));
    erasedDifference += Math.sqrt(empty.reduce((s, v, k) => s + (v - test.rows[i][k]) ** 2 / empty.length, 0));
    return swapped;
  });
  const shuffled = [...train.labels], rng = random(8013);
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const shuffledModel = fit(train.rows, shuffled, names, config.alpha);
  const retentionLong = [];
  for (let label = 0; label < names.length; label++) {
    const field = new Field(config.field); field.values.set(test.states[label * config.testPerClass]);
    const records = [{ extraSteps: 0, ...field.stats() }];
    for (let k = 1; k <= 4; k++) { field.step(6000); records.push({ extraSteps: k * 6000, ...field.stats() }); }
    retentionLong.push({ label: names[label], seed: config.testSeedBase + 100 * label, records });
  }
  const receipt = {
    protocol: 'moonformer-geometric-memory-v1', config,
    split: { calibrationSeeds: [11, 13], trainSeeds: train.retention.map(r => r.seed), testSeeds: test.retention.map(r => r.seed), families: [...names], heldOut: 'noise seeds and small translation/rotation/scale variants; not unseen shape families' },
    featureCount: { wave: train.rows[0].length, directDensity: train.direct[0].length, meanDensity: 1 },
    results: { wave: evaluate(model, test.rows, test.labels), directDensity: evaluate(directModel, test.direct, test.labels), meanDensity: evaluate(scalarModel, test.scalar, test.labels), erased: evaluate(model, erasedRows, test.labels), fixedMedium: evaluate(model, fixedRows, test.labels), couplingOff: evaluate(model, offRows, test.labels), shuffledTrainingLabels: evaluate(shuffledModel, test.rows, test.labels), swappedAgainstOriginalLabels: evaluate(model, swappedRows, test.labels) },
    interventions: { donorResponseAgreement: donorAgreement / test.rows.length, meanSwapResponseRms: responseDifference / test.rows.length, meanEraseResponseRms: erasedDifference / test.rows.length, couplingOffMaxDifference: Math.max(...offRows.flatMap(row => row.map((v, i) => Math.abs(v - offRows[0][i])))) },
    retention: { testEpisodes: test.retention, longerUnforcedRuns: retentionLong },
    limits: ['Finite grid and finite retention horizon.', 'Trained four-family geometric classifier, not semantic recall.', 'Wave readout has 96 features; direct density baseline has 64.', 'Erasure and coupling-off are interventions on the same frozen readout, not separately optimized models.', 'Inversion is a fixed receiver map; no claim that it improves recall.', 'Local gradients describe small changes; complete erasure can be nonlinear.']
  };
  return { receipt, bundle: { config, model, testResult: receipt.results.wave } };
}
function stable(value) { return JSON.stringify(value, (key, v) => typeof v === 'number' ? +v.toPrecision(12) : v, 2) + '\n'; }
const { receipt, bundle } = run(), root = path.join(__dirname, '..', 'results'), serialized = stable(receipt);
if (process.argv.includes('--check')) {
  if (fs.readFileSync(path.join(root, 'experiment.json'), 'utf8') !== serialized) throw new Error('Experiment receipt differs; inspect before replacing it');
  const expectedModel = '/* Generated by npm run experiment. Training responses only. */\n(function(r,b){if(typeof module===\'object\'&&module.exports)module.exports=b;else r.MFModel=b;})(typeof globalThis!==\'undefined\'?globalThis:this,' + stable(bundle).trim() + ');\n';
  if (fs.readFileSync(path.join(root, 'model.js'), 'utf8') !== expectedModel) throw new Error('Readout differs');
  console.log('Receipt and trained model reproduce exactly (12 significant digits).');
} else {
  fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, 'experiment.json'), serialized);
  fs.writeFileSync(path.join(root, 'model.js'), '/* Generated by npm run experiment. Training responses only. */\n(function(r,b){if(typeof module===\'object\'&&module.exports)module.exports=b;else r.MFModel=b;})(typeof globalThis!==\'undefined\'?globalThis:this,' + stable(bundle).trim() + ');\n');
}
console.log(JSON.stringify({ results: Object.fromEntries(Object.entries(receipt.results).map(([k, v]) => [k, `${v.correct}/${v.total}`])), interventions: receipt.interventions }, null, 2));

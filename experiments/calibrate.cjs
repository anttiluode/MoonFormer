const { Field, defaults } = require('../src/field.js');
const { names, paths, mask, writeDefaults } = require('../src/write.js');
// Calibration seeds are separate from both the training and test ranges.
const fs = require('node:fs'), path = require('node:path');
const rows = [];
for (const epsilon of [-.04, -.06, -.08, -.10, -.12, -.13, -.135, -.14, -.15]) {
  const records = [];
  for (const name of names) {
    const field = new Field({ ...defaults, epsilon }), p = writeDefaults;
    field.seed(11); field.step(p.writeSteps, { mask: mask(field.n, paths(name, 13)), gain: p.gain, drive: p.drive });
    const samples = [field.stats()];
    for (let k = 0; k < 4; k++) { field.step(3000); samples.push(field.stats()); }
    records.push({ name, rms: samples.map(s => +s.rms.toFixed(6)), finalForce: +samples.at(-1).forceRms.toFixed(7) });
  }
  rows.push({ epsilon, records });
  console.log(JSON.stringify(rows.at(-1)));
}
fs.writeFileSync(path.join(__dirname, '..', 'results', 'calibration.json'), JSON.stringify({ parameters: defaults, seed: 11, variant: 13, write: writeDefaults, sampleEverySteps: 3000, rows }, null, 2) + '\n');

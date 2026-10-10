/* Small supervised ridge readout. No field, writing mask or source label is
 * accepted at inference: only measured response features. Scores are not probabilities. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MFReadout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function fit(rows, labels, classes, alpha = 5) {
    if (!rows.length || labels.length !== rows.length || labels.some(i => !Number.isInteger(i) || i < 0 || i >= classes.length)) throw new Error('Invalid training labels');
    const d = rows[0].length, count = rows.length, c = classes.length;
    if (!d || !Number.isFinite(alpha) || alpha <= 0 || rows.some(row => row.length !== d || !row.every(Number.isFinite))) throw new Error('Invalid training features');
    const mean = Array(d).fill(0), scale = Array(d).fill(0), targetMean = Array(c).fill(0);
    for (const row of rows) for (let j = 0; j < d; j++) mean[j] += row[j] / count;
    for (const row of rows) for (let j = 0; j < d; j++) scale[j] += (row[j] - mean[j]) ** 2 / count;
    for (let j = 0; j < d; j++) scale[j] = Math.max(1e-8, Math.sqrt(scale[j]));
    for (const label of labels) targetMean[label] += 1 / count;
    const X = rows.map(row => row.map((v, j) => (v - mean[j]) / scale[j]));
    const gram = Array.from({ length: d }, () => new Float64Array(d));
    const rhs = Array.from({ length: d }, () => new Float64Array(c));
    for (let j = 0; j < d; j++) {
      for (let k = 0; k <= j; k++) {
        let sum = j === k ? alpha : 0;
        for (let i = 0; i < count; i++) sum += X[i][j] * X[i][k];
        gram[j][k] = gram[k][j] = sum;
      }
      for (let r = 0; r < c; r++) for (let i = 0; i < count; i++) rhs[j][r] += X[i][j] * ((labels[i] === r ? 1 : 0) - targetMean[r]);
    }
    // Cholesky: positive ridge makes X'X + alpha I positive definite.
    const L = Array.from({ length: d }, () => new Float64Array(d));
    for (let j = 0; j < d; j++) for (let k = 0; k <= j; k++) {
      let sum = gram[j][k]; for (let h = 0; h < k; h++) sum -= L[j][h] * L[k][h];
      if (j === k && !(sum > 0)) throw new Error('Readout solve lost positive definiteness');
      L[j][k] = j === k ? Math.sqrt(sum) : sum / L[k][k];
    }
    const weights = Array.from({ length: d }, () => Array(c).fill(0));
    for (let r = 0; r < c; r++) {
      const y = new Float64Array(d);
      for (let j = 0; j < d; j++) { let sum = rhs[j][r]; for (let k = 0; k < j; k++) sum -= L[j][k] * y[k]; y[j] = sum / L[j][j]; }
      for (let j = d - 1; j >= 0; j--) { let sum = y[j]; for (let k = j + 1; k < d; k++) sum -= L[k][j] * weights[k][r]; weights[j][r] = sum / L[j][j]; }
    }
    return { kind: 'ridge-response-v1', classes: [...classes], mean, scale, targetMean, weights, alpha, trainingCount: count };
  }
  function predict(model, features) {
    if (features.length !== model.mean.length || !features.every(Number.isFinite)) throw new Error('Invalid inference features');
    const scores = [...model.targetMean]; let distance2 = 0;
    for (let j = 0; j < features.length; j++) {
      const z = (features[j] - model.mean[j]) / model.scale[j]; distance2 += z * z;
      for (let r = 0; r < scores.length; r++) scores[r] += z * model.weights[j][r];
    }
    const sorted = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score), index = sorted[0].index;
    return { index, label: model.classes[index], scores, margin: sorted[0].score - sorted[1].score, standardizedRms: Math.sqrt(distance2 / features.length) };
  }
  return { fit, predict };
});

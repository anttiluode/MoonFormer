/* All views below are computed from the same numerical state. The teaching
 * fixture caption stays in the UI; it is never supplied to the reader. */
(function () {
  'use strict';
  const { Field } = MFField, { Probe } = MFProbe, { paths, mask } = MFWrite, { predict } = MFReadout;
  const { config, model } = MFModel;
  const $ = id => document.getElementById(id), canvas = $('field-canvas'), ctx = canvas.getContext('2d');
  const moonCanvas = $('moon-canvas'), moonCtx = moonCanvas.getContext('2d'), plot = $('response-canvas'), plotCtx = plot.getContext('2d');
  const terrain = document.createElement('canvas'), overlay = document.createElement('canvas'); terrain.width = terrain.height = 256; overlay.width = overlay.height = 128;
  const terrainCtx = terrain.getContext('2d'), overlayCtx = overlay.getContext('2d');
  const colors = ['#a2e3e0', '#edb47a', '#b3abdf', '#91bce1'];
  let field = new Field(config.field), probe = new Probe(field.n, config.probe), selectedShape = 'arc', view = 'signal';
  let busy = false, initialized = false, previous = null, run = null, fingerprint = null, gradient = null, maxGradient = 0, sensitiveIndex = 0;
  let unforcedSteps = 0, caption = 'No teaching input', activeStrokes = null, patchMode = false, animationStart = 0, frame = 0, pulsePlaying = false;
  let lastDelta = null;

  function setBusy(value) {
    busy = value; document.body.dataset.busy = String(value);
    document.querySelectorAll('button,select,input:not([type=file])').forEach(el => el.disabled = value);
    if (!value) $('swap').disabled = !previous;
  }
  function notice(text) { $('notice').textContent = text; }
  async function action(fn) {
    if (busy) return;
    const checkpoint = { memory: field.snapshot(), previous, unforcedSteps, caption };
    setBusy(true);
    try { await fn(); } catch (error) {
      field = Field.from(checkpoint.memory); previous = checkpoint.previous; unforcedSteps = checkpoint.unforcedSteps; caption = checkpoint.caption; activeStrokes = null;
      analyze(false); $('scene-title').textContent = 'Only the changed material remains';
      notice(`Previous valid material restored. ${error.message}`); console.error(error);
    }
    finally { setBusy(false); }
  }
  function remember() { previous = { memory: field.snapshot(), unforcedSteps, caption }; }
  function newProbe() { probe = new Probe(field.n, { ...config.probe, kappa: $('coupling').checked ? config.probe.kappa : 0 }); }
  function trainingMedium() { return Object.entries(config.field).every(([key, value]) => field.params[key] === value); }
  function difference(a, b) { return a && b ? Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2 / a.length, 0)) : null; }
  function rebuildTerrain() {
    const n = field.n, material = field.values, image = terrainCtx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      // Piecewise-linear surface of the actual material, with flat lighting
      // per grid triangle. No generated crystals or extra texture layer.
      const u = x / 256 * n, v = y / 256 * n, ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy, ex = (ix + 1) % n, sy = (iy + 1) % n;
      const a = material[iy * n + ix], b = material[iy * n + ex], c = material[sy * n + ix], d = material[sy * n + ex];
      const upper = fx + fy <= 1, p = upper ? a + fx * (b - a) + fy * (c - a) : d + (1 - fx) * (c - d) + (1 - fy) * (b - d);
      const gx = upper ? b - a : d - c, gy = upper ? c - a : d - b;
      const h = Math.min(1, Math.max(0, p) / 1.1), light = .25 + .9 * Math.max(0, (1 - 2.5 * gx - 1.8 * gy) / Math.sqrt(1 + 16 * (gx * gx + gy * gy)));
      const contour = p > .15 && (p % .2) < .009 ? 22 : 0, k = (y * 256 + x) * 4;
      image.data[k] = 8 + h * light * 190 + contour; image.data[k + 1] = 23 + h * light * 178 + contour; image.data[k + 2] = 34 + h * light * 151 + contour; image.data[k + 3] = 255;
    }
    terrainCtx.putImageData(image, 0, 0);
    $('grid-label').textContent = `${n} × ${n}`;
  }
  function sample(a, x, y, n) {
    x = ((x % n) + n) % n; y = ((y % n) + n) % n;
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, e = (i + 1) % n, s = (j + 1) % n;
    return (1 - fy) * ((1 - fx) * a[j * n + i] + fx * a[j * n + e]) + fy * ((1 - fx) * a[s * n + i] + fx * a[s * n + e]);
  }
  function drawOverlay(values, scale, alpha = 1) {
    const image = overlayCtx.createImageData(128, 128), n = field.n;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const v = sample(values, x / 128 * n, y / 128 * n, n) * scale, k = (y * 128 + x) * 4;
      const color = v >= 0 ? [141, 244, 230] : [245, 151, 94];
      image.data[k] = color[0]; image.data[k + 1] = color[1]; image.data[k + 2] = color[2]; image.data[k + 3] = Math.min(210, Math.abs(v) * 210) * alpha;
    }
    overlayCtx.putImageData(image, 0, 0); ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  }
  function drawField() {
    const w = canvas.width, n = field.n, s = w / n;
    ctx.clearRect(0, 0, w, w); ctx.globalAlpha = view === 'sensitivity' ? .38 : 1; ctx.drawImage(terrain, 0, 0, w, w); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#91bfd516'; ctx.lineWidth = 1;
    for (let k = 1; k < 8; k++) { ctx.beginPath(); ctx.moveTo(k * w / 8, 0); ctx.lineTo(k * w / 8, w); ctx.moveTo(0, k * w / 8); ctx.lineTo(w, k * w / 8); ctx.stroke(); }
    const wave = run && run.frames[Math.min(run.frames.length - 1, frame + 1)];
    if (view === 'signal' && wave) drawOverlay(wave, 12);
    if (view === 'sensitivity' && gradient && maxGradient) drawOverlay(gradient, 1 / maxGradient);
    const c = probe.moon.center * s, r = probe.moon.radius * s;
    ctx.strokeStyle = '#aadcd347'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '11px monospace'; ctx.fillStyle = '#bdd9de80'; ctx.textAlign = 'center'; ctx.fillText('MOON INTERFACE', c, c + r + 20);
    probe.sources.forEach(([x, y], i) => {
      ctx.beginPath(); ctx.arc(x * s, y * s, 5, 0, Math.PI * 2); ctx.fillStyle = i === +$('source').value ? '#b2f5e5' : '#78929c'; ctx.fill();
      if (i === +$('source').value) { ctx.beginPath(); ctx.arc(x * s, y * s, 12, 0, Math.PI * 2); ctx.strokeStyle = '#a2e3e0'; ctx.lineWidth = 1; ctx.stroke(); }
    });
    if (activeStrokes) {
      ctx.strokeStyle = '#f2c087'; ctx.lineWidth = 3; ctx.shadowBlur = 10; ctx.shadowColor = '#f2c087';
      for (const stroke of activeStrokes) { ctx.beginPath(); stroke.forEach(([x, y], i) => i ? ctx.lineTo(x * (n - 1) * s, y * (n - 1) * s) : ctx.moveTo(x * (n - 1) * s, y * (n - 1) * s)); ctx.stroke(); }
      ctx.shadowBlur = 0;
    }
    if (view === 'sensitivity' && maxGradient) {
      const x = (sensitiveIndex % n) * s, y = Math.floor(sensitiveIndex / n) * s;
      ctx.strokeStyle = '#dceee6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
    }
    $('view-legend').textContent = view === 'sensitivity' ? 'Signed local derivative · scaled to its maximum' : view === 'material' ? 'Material surface · fixed height and color scale' : 'Material surface · wave color ×12';
    $('time-label').textContent = 't = ' + (frame * config.probe.dt).toFixed(1);
    drawMoon(wave);
  }
  function drawMoon(wave) {
    const w = moonCanvas.width, n = field.n, c = w / 2, R = w * .41, moon = probe.moon, scale = R / moon.radius;
    moonCtx.clearRect(0, 0, w, w); moonCtx.save(); moonCtx.beginPath(); moonCtx.arc(c, c, R, 0, Math.PI * 2); moonCtx.clip();
    const bg = moonCtx.createRadialGradient(c, c, 0, c, c, R); bg.addColorStop(0, '#07101b'); bg.addColorStop(1, '#172e3d'); moonCtx.fillStyle = bg; moonCtx.fillRect(0, 0, w, w);
    if (wave) {
      const inner = moon.apply(wave);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (moon.valid[y * n + x]) {
        const a = Math.min(.9, Math.abs(inner[y * n + x]) * 12);
        moonCtx.fillStyle = inner[y * n + x] >= 0 ? `rgba(141,244,230,${a})` : `rgba(245,151,94,${a})`;
        moonCtx.fillRect(c + (x - moon.center - .5) * scale, c + (y - moon.center - .5) * scale, scale + .5, scale + .5);
      }
    }
    // The unsampled core is the part whose inverse lies outside the finite grid.
    moonCtx.fillStyle = '#07101b'; moonCtx.beginPath(); moonCtx.arc(c, c, R * .25, 0, Math.PI * 2); moonCtx.fill();
    moonCtx.restore(); moonCtx.beginPath(); moonCtx.arc(c, c, R, 0, Math.PI * 2); moonCtx.strokeStyle = '#6fada5'; moonCtx.lineWidth = 1; moonCtx.stroke();
    moon.receivers.forEach((receiver, i) => {
      const x = c + (receiver.x - moon.center) * scale, y = c + (receiver.y - moon.center) * scale;
      moonCtx.fillStyle = colors[i]; moonCtx.beginPath(); moonCtx.arc(x, y, 4, 0, Math.PI * 2); moonCtx.fill();
      if (i === +$('receiver').value) { moonCtx.strokeStyle = colors[i]; moonCtx.beginPath(); moonCtx.arc(x, y, 9, 0, Math.PI * 2); moonCtx.stroke(); }
      moonCtx.font = '11px monospace'; moonCtx.textAlign = 'center'; moonCtx.fillText('R' + (i + 1), x, y - 14);
    });
  }
  function drawPlot() {
    plotCtx.clearRect(0, 0, plot.width, plot.height); if (!run) return;
    const max = Math.max(.015, ...Array.from(run.features, Math.abs)), bins = config.probe.bins, selected = +$('bin').value;
    plotCtx.fillStyle = '#a2e3e015'; plotCtx.fillRect(selected * plot.width / bins, 0, plot.width / bins, plot.height);
    plotCtx.strokeStyle = '#385366'; plotCtx.beginPath(); plotCtx.moveTo(0, plot.height / 2); plotCtx.lineTo(plot.width, plot.height / 2); plotCtx.stroke();
    for (let r = 0; r < 4; r++) {
      plotCtx.strokeStyle = colors[r]; plotCtx.globalAlpha = r === +$('receiver').value ? 1 : .4; plotCtx.lineWidth = r === +$('receiver').value ? 3 : 1.5;
      plotCtx.beginPath();
      for (let b = 0; b < bins; b++) { const x = (b + .5) * plot.width / bins, y = plot.height / 2 - run.features[r * bins + b] / max * plot.height * .4; b ? plotCtx.lineTo(x, y) : plotCtx.moveTo(x, y); }
      plotCtx.stroke();
    }
    plotCtx.globalAlpha = 1;
  }
  function updateGradient() {
    if (!run) return;
    const feature = +$('receiver').value * config.probe.bins + +$('bin').value;
    gradient = probe.gradient(field.values, run, feature); maxGradient = 0;
    gradient.forEach((v, i) => { if (Math.abs(v) > maxGradient) { maxGradient = Math.abs(v); sensitiveIndex = i; } });
    $('gradient-value').textContent = `R${+$('receiver').value + 1} · max |derivative| ${maxGradient.toExponential(2)}`;
    $('gradient-check').textContent = 'Local sensitivity, not a map of stored meanings.'; drawPlot();
  }
  function updateReadout() {
    const stats = field.stats(); $('rms').textContent = stats.rms.toFixed(4); $('force').textContent = stats.forceRms.toExponential(2);
    $('age').textContent = unforcedSteps === null ? 'unknown' : unforcedSteps.toLocaleString(); $('input-status').textContent = activeStrokes ? 'PRESENT' : 'REMOVED';
    const recognition = $('recognition'); recognition.classList.remove('uncertain'); $('scores').replaceChildren();
    $('ground-truth').textContent = caption + '. Hidden from the reader.';
    if (stats.rms < 1e-8) { recognition.textContent = 'Empty medium'; $('readout-note').textContent = 'There is still a wave, but no retained material trace. A forced four-class prediction would be misleading.'; return; }
    if (!$('coupling').checked) { recognition.textContent = 'Disconnected'; $('readout-note').textContent = 'With material coupling off, every memory produces identical probe responses.'; return; }
    if (!trainingMedium()) { recognition.textContent = 'Untrained medium'; $('readout-note').textContent = 'Probes and derivatives still work. This readout was trained with different physical parameters.'; return; }
    const answer = predict(model, fingerprint), ranked = answer.scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score);
    if (answer.margin < .15) { recognition.textContent = `Uncertain: ${answer.label} / ${model.classes[ranked[1].index]}`; recognition.classList.add('uncertain'); }
    else recognition.textContent = answer.label;
    const max = Math.max(.01, ...answer.scores);
    answer.scores.forEach((score, i) => {
      const row = document.createElement('div'); row.className = 'score-row' + (i === answer.index ? ' winner' : '');
      const name = document.createElement('span'); name.textContent = model.classes[i];
      const track = document.createElement('div'); track.className = 'score-track'; const bar = document.createElement('i'); bar.style.width = `${Math.max(0, score) / max * 100}%`; track.append(bar);
      const value = document.createElement('b'); value.textContent = score.toFixed(2); row.append(name, track, value); $('scores').append(row);
    });
    $('readout-note').textContent = 'Four pulses × four receivers × six time windows. Learned scores, not probabilities. This reader can misidentify traces.';
  }
  function analyze(play = true) {
    const old = fingerprint;
    newProbe(); fingerprint = probe.fingerprint(field.values); run = probe.run(field.values, +$('source').value, { tape: true });
    lastDelta = difference(old, fingerprint); updateGradient(); updateReadout(); rebuildTerrain();
    frame = 0; pulsePlaying = play; animationStart = performance.now(); initialized = true; $('phase').textContent = 'INPUT REMOVED';
    drawField();
  }
  async function evolve(steps, input = null, start = 0, total = steps) {
    for (let k = 0; k < steps; k += 150) {
      const batch = Math.min(150, steps - k); field.step(batch, input);
      $('phase').textContent = `${Math.round((start + k + batch) / total * 100)}%`;
      rebuildTerrain(); drawField(); await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }
  async function teachSelected() {
    const seed = Number($('seed').value);
    if (!Number.isInteger(seed) || seed < 1 || seed > 1000000) throw new Error('Episode seed must be an integer between 1 and 1,000,000.');
    if (initialized) remember();
    field = new Field(config.field); field.seed(seed); newProbe(); run = null; gradient = null; pulsePlaying = false; unforcedSteps = 0;
    activeStrokes = paths(selectedShape, seed ^ 0x48ab29); caption = `Teaching fixture: ${selectedShape}, seed ${seed}`;
    $('scene-title').textContent = 'An input becomes a material'; $('input-status').textContent = 'PRESENT';
    notice('Writing the chosen trace. The amber line is the input, not a reconstruction.');
    const input = { mask: mask(field.n, activeStrokes, config.write.width), gain: config.write.gain, drive: config.write.drive };
    await evolve(config.write.writeSteps, input, 0, config.write.writeSteps + config.write.retainSteps);
    activeStrokes = null; $('input-status').textContent = 'REMOVED'; notice('Input withdrawn. The medium now evolves with no writing mask or drive.');
    await evolve(config.write.retainSteps, null, config.write.writeSteps, config.write.writeSteps + config.write.retainSteps);
    unforcedSteps = config.write.retainSteps; $('scene-title').textContent = 'Only the changed material remains';
    analyze(); $('seed').value = seed === 1000000 ? 1 : seed + 1;
    notice('Reading the retained field with four fixed pulses. The reader receives no shape label or original trail.');
  }
  function changedNotice(prefix) { notice(prefix + (lastDelta === null ? '' : ` Response change: ${lastDelta.toExponential(3)} RMS.`)); }

  document.querySelectorAll('[data-shape]').forEach(button => button.addEventListener('click', () => {
    selectedShape = button.dataset.shape;
    document.querySelectorAll('[data-shape]').forEach(b => { const active = b === button; b.classList.toggle('selected', active); b.setAttribute('aria-pressed', active); });
  }));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    view = button.dataset.view; document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', b === button); }); drawField();
  }));
  $('teach').addEventListener('click', () => action(teachSelected));
  $('probe').addEventListener('click', () => action(() => { analyze(); notice('Same retained material; a new pulse. Structure is held fixed during this fast diagnostic reading.'); }));
  $('source').addEventListener('change', () => action(() => { analyze(); notice('A different entrance asks a different question of the same material. Recognition still uses all four pulses.'); }));
  ['receiver', 'bin'].forEach(id => $(id).addEventListener('change', () => action(() => { updateGradient(); drawField(); })));
  $('wait').addEventListener('click', () => action(async () => {
    remember(); pulsePlaying = false; run = null; gradient = null; await evolve(6000);
    if (unforcedSteps !== null) unforcedSteps += 6000; analyze(); changedNotice('Another 6,000 unforced steps. Traces can drift or fade.');
  }));
  $('erase').addEventListener('click', () => action(() => { remember(); field.values.fill(0); caption = 'Erased numerical state'; unforcedSteps = 0; analyze(); changedNotice('All material removed. The wave now crosses an empty medium.'); }));
  $('swap').addEventListener('click', () => action(() => {
    if (!previous) return; const donor = previous, validated = Field.from(donor.memory); remember(); field = validated; caption = donor.caption; unforcedSteps = donor.unforcedSteps; analyze(); changedNotice('Numerical state substituted. Responses follow the substituted material.');
  }));
  $('coupling').addEventListener('change', () => action(() => { analyze(); changedNotice($('coupling').checked ? 'Material coupling restored.' : 'Material coupling removed; the memory is untouched.'); }));
  $('patch').addEventListener('click', () => { patchMode = !patchMode; $('patch').setAttribute('aria-pressed', patchMode); canvas.style.cursor = patchMode ? 'crosshair' : 'default'; notice(patchMode ? 'Click the field to erase a circular patch, then compare the new readings.' : 'Patch eraser off.'); });
  canvas.addEventListener('click', event => {
    if (!patchMode || busy) return;
    const box = canvas.getBoundingClientRect(), x = (event.clientX - box.left) / box.width * field.n, y = (event.clientY - box.top) / box.height * field.n;
    action(() => {
      remember();
      for (let j = 0; j < field.n; j++) for (let i = 0; i < field.n; i++) if ((i - x) ** 2 + (j - y) ** 2 < 3 ** 2) field.values[j * field.n + i] = 0;
      caption = 'Patched numerical state'; analyze(); changedNotice('Patch erased. This large intervention need not match a local derivative.');
    });
  });
  $('check-gradient').addEventListener('click', () => action(() => {
    if (!maxGradient) { $('gradient-check').textContent = 'The selected local derivative is zero in this state.'; return; }
    const feature = +$('receiver').value * config.probe.bins + +$('bin').value, h = 1e-4;
    const plus = Float64Array.from(field.values), minus = Float64Array.from(field.values); plus[sensitiveIndex] += h; minus[sensitiveIndex] -= h;
    const measured = (probe.run(plus, +$('source').value).features[feature] - probe.run(minus, +$('source').value).features[feature]) / (2 * h);
    const predicted = gradient[sensitiveIndex], error = Math.abs(measured - predicted) / Math.max(1e-12, Math.abs(measured));
    $('gradient-check').textContent = `Derivative: predicted ${predicted.toExponential(3)}, measured ${measured.toExponential(3)}. Relative error ${error.toExponential(1)}. Memory unchanged.`;
  }));
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(field.snapshot())], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'moonformer-memory.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('import').addEventListener('click', () => $('memory-file').click());
  $('memory-file').addEventListener('change', () => action(async () => {
    const file = $('memory-file').files[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Memory file is too large (maximum 2 MB).');
      const imported = Field.from(JSON.parse(await file.text())); remember(); field = imported; caption = 'Imported numerical state'; unforcedSteps = null; activeStrokes = null;
      analyze(); changedNotice('Loaded a numerical memory. There is no saved label, input image or cached answer.');
    } finally { $('memory-file').value = ''; }
  }));

  window.MoonFormerLab = {
    get ready() { return initialized && !busy; },
    inspect() { return { memory: field.snapshot(), fingerprint: fingerprint ? Array.from(fingerprint) : null, derivativeMax: maxGradient, selectedFeature: run ? run.features[+$('receiver').value * config.probe.bins + +$('bin').value] : null, unforcedSteps, lastDelta }; }
  };
  function animate(now) {
    if (pulsePlaying && run) { frame = Math.min(config.probe.steps, Math.floor((now - animationStart) / 24)); drawField(); if (frame >= config.probe.steps) pulsePlaying = false; }
    requestAnimationFrame(animate);
  }
  rebuildTerrain(); drawField(); requestAnimationFrame(animate); action(teachSelected);
})();

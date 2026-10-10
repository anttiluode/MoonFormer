// Optional development check. npm install --no-save playwright, then install
// its Chromium browser; no dependency is needed to use MoonFormer itself.
const assert = require('node:assert/strict');
const { createServer } = require('../scripts/serve.cjs');
const { chromium } = require(process.env.MOONFORMER_PLAYWRIGHT || 'playwright');
const fs = require('node:fs/promises'), path = require('node:path');
async function main() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.MOONFORMER_CHROMIUM || undefined });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const ready = () => page.waitForFunction(() => window.MoonFormerLab?.ready, { timeout: 30000 });
    await ready();
    const before = await page.evaluate(() => MoonFormerLab.inspect());
    assert.equal(before.unforcedSteps, 6000); assert.ok(before.memory.values.some(v => Math.abs(v) > .1));
    assert.ok(before.fingerprint.every(Number.isFinite)); assert.ok(before.derivativeMax > 0);
    await page.click('[data-view="sensitivity"]'); await page.click('#check-gradient'); await ready();
    assert.match(await page.textContent('#gradient-check'), /predicted.*measured.*Memory unchanged/);
    await page.selectOption('#source', '1'); await ready();
    const secondCue = await page.evaluate(() => MoonFormerLab.inspect());
    assert.notEqual(before.selectedFeature, secondCue.selectedFeature);
    assert.deepEqual(before.memory, secondCue.memory);
    await page.click('#erase'); await ready();
    const empty = await page.evaluate(() => MoonFormerLab.inspect()); assert.ok(empty.memory.values.every(v => v === 0));
    assert.ok(empty.fingerprint.some((v, i) => Math.abs(v - before.fingerprint[i]) > 1e-5));
    assert.equal(await page.textContent('#recognition'), 'Empty medium');
    await page.click('#swap'); await ready();
    const restored = await page.evaluate(() => MoonFormerLab.inspect()); assert.deepEqual(restored.memory, before.memory); assert.deepEqual(restored.fingerprint, before.fingerprint);
    await page.uncheck('#coupling'); await ready();
    assert.equal(await page.textContent('#recognition'), 'Disconnected');
    await page.check('#coupling'); await ready();
    await page.click('[data-view="signal"]');
    const pixels = await page.evaluate(() => { const c = document.getElementById('field-canvas'), a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return new Set(Array.from(a).filter((_, i) => i % 4 === 1)).size; });
    assert.ok(pixels > 50, 'field drawing is not uniform');
    await page.setInputFiles('#memory-file', { name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...before.memory, label: 'hidden answer' })) }); await ready();
    assert.match(await page.textContent('#notice'), /Unexpected memory/);
    assert.deepEqual((await page.evaluate(() => MoonFormerLab.inspect())).memory, before.memory);
    await page.setInputFiles('#memory-file', { name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before.memory)) }); await ready();
    assert.match(await page.textContent('#notice'), /Loaded a numerical memory/);
    assert.deepEqual((await page.evaluate(() => MoonFormerLab.inspect())).fingerprint, before.fingerprint);
    await fs.mkdir(path.join(__dirname, '..', 'screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow, false);
    await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'mobile.png'), fullPage: true });
    // Fault injection checks recovery after partial mutation, not just invalid
    // JSON rejected before it could touch a state.
    await page.evaluate(() => {
      const original = MFField.Field.prototype.step;
      window.restoreStep = () => { MFField.Field.prototype.step = original; };
      MFField.Field.prototype.step = function () { this.values[0] = NaN; throw new Error('Injected numerical failure'); };
    });
    await page.click('#wait'); await ready();
    const recovered = await page.evaluate(() => MoonFormerLab.inspect());
    assert.deepEqual(recovered.memory, before.memory);
    assert.deepEqual(recovered.fingerprint, before.fingerprint);
    assert.match(await page.textContent('#notice'), /restored.*Injected numerical failure/);
    await page.evaluate(() => { window.restoreStep(); delete window.restoreStep; });
    const stiff = { format: 'moonformer-field-v1', params: { n: 8, lambda: 3, g: 3, T: 0, epsilon: 1 }, values: Array(64).fill(-3) };
    await page.setInputFiles('#memory-file', { name: 'stiff.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stiff)) }); await ready();
    await page.click('#wait'); await ready();
    assert.ok((await page.evaluate(() => MoonFormerLab.inspect())).memory.values.every(Number.isFinite));
    const large = { format: 'moonformer-field-v1', params: { n: 8, lambda: 32, g: 3, T: 1.5, epsilon: 1 }, values: Array(64).fill(2.5) };
    await page.setInputFiles('#memory-file', { name: 'large.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(large)) }); await ready();
    await page.click('#wait'); await ready();
    const evolved = await page.evaluate(() => MoonFormerLab.inspect()); assert.ok(evolved.memory.values[0] > 3);
    await page.click('#erase'); await ready(); await page.click('#swap'); await ready();
    assert.deepEqual((await page.evaluate(() => MoonFormerLab.inspect())).memory, evolved.memory);
    await page.setInputFiles('#memory-file', { name: 'evolved.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evolved.memory)) }); await ready();
    assert.deepEqual((await page.evaluate(() => MoonFormerLab.inspect())).memory, evolved.memory);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: live physics, cue changes, Jacobian, erase/swap, coupling, import validation, desktop/mobile.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

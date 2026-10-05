import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { gradientToCss, fromBilibili, fromCompatibilityWire } from '../src/core.js';
import { byteLength } from '../src/utils.js';

const gradient = angle => ({ type: 'gradient', target: 'fill', origin: 'generated',
  source: { type: 'linear', angle, stops: [
    { position: 0, color: '#FB7299', alpha: 0.85 }, { position: 1, color: '#33B8FF' },
  ] } });

test('CSS adapter maps the four DanmuX directions and preserves color and alpha', () => {
  for (const [angle, cssAngle] of [[0, 90], [90, 180], [180, 270], [270, 0], [-90, 0], [360, 90]]) {
    const result = gradientToCss(gradient(angle));
    assert.equal(result.ok, true);
    assert.equal(result.value, `linear-gradient(${cssAngle}deg, rgba(251, 114, 153, 0.85) 0%, rgba(51, 184, 255, 1) 100%)`);
  }
});

test('CSS adapter isolates invalid effects and reports unsupported native textures or strokes', () => {
  const native = fromBilibili({ id: 'native', time: 1, content: 'native texture', color: 255,
    color_v2: { fill: 'https://cdn.example.test/native.png' } }).value;
  const before = structuredClone(native);
  assert.equal(gradientToCss(native.effects[0]).diagnostics[0].code, 'css_gradient_unsupported');
  assert.deepEqual(native, before, 'preview must not discard a native effect from the model');
  assert.equal(gradientToCss({ ...gradient(0), target: 'stroke' }).ok, false);
  assert.equal(gradientToCss(gradient(NaN)).ok, false);
  assert.equal(gradientToCss(null).ok, false);
  const wire = { p: '1,1,255,[source]', m: 'fallback', cid: 1,
    danmux: { extensionVersion: 1, effects: [gradient(NaN)] } };
  const result = fromCompatibilityWire(wire);
  assert.equal(result.ok, true);
  assert.equal(result.value.color, 255);
  assert.equal(result.value.effects, undefined);
});

test('portable UTF-8 byte limits match Node for Unicode and reject non-JSON data', () => {
  for (const value of ['中文😀', { label: 'é𠮷' }, [1, null, 'test']]) {
    assert.equal(byteLength(value), Buffer.byteLength(JSON.stringify(value), 'utf8'));
  }
  assert.throws(() => byteLength(undefined), TypeError);
  assert.throws(() => byteLength(1n), TypeError);
});

test('core graph executes in a browser-like realm without Node globals or imports', () => {
  const coreUrl = new URL('../src/core.js', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { SourceTextModule, createContext } from 'node:vm';
    const context = createContext({ URL, TextEncoder, structuredClone });
    const modules = new Map();
    async function load(url) {
      if (!modules.has(url)) modules.set(url, readFile(new URL(url), 'utf8').then(source =>
        new SourceTextModule(source, { context, identifier: url })));
      return modules.get(url);
    }
    const module = await load(${JSON.stringify(coreUrl)});
    await module.link((specifier, parent) => {
      assert.ok(specifier.startsWith('.'), 'portable core imports ' + specifier);
      return load(new URL(specifier, parent.identifier).href);
    });
    await module.evaluate();
    const api = module.namespace;
    assert.equal(api.AssetResolver, undefined);
    const parsed = api.fromBilibili({ id: 'browser', progress: 12500, mode: 1, color: 0, content: '中文😀' });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.color, 0);
    const generated = api.applyGradient(parsed.value, { angle: 0, stops: [{ position: 0, color: '#FB7299' }, { position: 1, color: '#33B8FF' }] });
    const wire = api.toCompatibilityWire(generated.value);
    assert.equal(api.fromCompatibilityWire(wire).ok, true);
    assert.ok(api.gradientToCss(generated.value.effects[0]).value.startsWith('linear-gradient(90deg'));
    const vendor = api.fromBilibili({ id: 'vendor', color: 255, content: 'fallback', color_v2: 123 });
    assert.equal(vendor.ok, true);
    assert.equal(vendor.value.effects[0].type, 'vendor');
  `;
  execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script], { stdio: 'pipe' });
});

test('browser package condition omits Node asset resolver while core subpath remains importable', () => {
  const script = `import assert from 'node:assert/strict'; import * as api from 'danmux'; import * as core from 'danmux/core';
    assert.equal(api.AssetResolver, undefined); assert.equal(typeof api.gradientToCss, 'function');
    assert.equal(typeof core.fromCompatibilityWire, 'function');`;
  execFileSync(process.execPath, ['--conditions=browser', '--input-type=module', '-e', script],
    { cwd: new URL('../', import.meta.url), stdio: 'pipe' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fromCompatibilityWire } from '../src/adapters/dandanplay.js';

const gradient = {
  type: 'gradient', target: 'fill',
  source: { type: 'texture', uri: 'https://cdn.example.test/texture.png' },
};
const legacy = { p: '1,1,16777215,[test]', m: 'base survives', cid: 42 };

test('unsupported or missing extension versions preserve Base and isolate effects', () => {
  for (const extensionVersion of [undefined, null, 0, 2, '1']) {
    const result = fromCompatibilityWire({
      ...legacy, danmux: { extensionVersion, effects: [gradient] },
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.text, legacy.m);
    assert.equal(result.value.color, 0xffffff);
    assert.equal(result.value.effects, undefined, `version ${extensionVersion}`);
    assert.ok(result.diagnostics.some(entry => entry.code === 'extension_version_unsupported'));
  }
});

test('version 1 still imports gradients and legacy input requires no extension', () => {
  const enhanced = fromCompatibilityWire({ ...legacy, danmux: { extensionVersion: 1, effects: [gradient] } });
  assert.equal(enhanced.ok, true);
  assert.deepEqual(enhanced.value.effects, [gradient]);
  const plain = fromCompatibilityWire(legacy);
  assert.equal(plain.ok, true);
  assert.deepEqual(plain.diagnostics, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDanmuX, validateBase, stableIdentity } from '../src/danmu.js';
import { applyGradient, transformBatch } from '../src/transformers/gradient-presets.js';
import { fromBilibili } from '../src/adapters/bilibili-danmu.js';
import { fromCompatibilityWire, toCompatibilityWire, toDanDanPlay, toEnhanced } from '../src/adapters/dandanplay.js';
import { aggregate } from '../src/pipeline/aggregate.js';
import { AssetResolver } from '../src/assets/resolver.js';
import { negotiateCapabilities } from '../src/capabilities.js';

function base(overrides = {}) {
  return createDanmuX({ id: '1', time: 1, text: 'hello', mode: 'scroll', fontSize: 25, color: 0xffffff, source: { platform: 'test', id: 'source-1' }, ...overrides });
}

test('ordinary DanmuX is sparse and has no empty effects', () => {
  const result = base({ effects: [] });
  assert.equal(result.ok, true);
  assert.equal('effects' in result.value, false);
  assert.equal(result.value.schemaVersion, 1);
});

test('base validator returns item diagnostics instead of rejecting a batch', () => {
  const result = validateBase({ id: '', time: -1, text: '\u0000', mode: 'bad', fontSize: 0, color: -1, source: { platform: '', id: '' } });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.length >= 6);
});

test('Bilibili native fill and stroke textures are preserved', () => {
  const result = fromBilibili({ id: 'b1', time: 2, text: 'native', color: 123, colorfulSrc: { fill: 'https://cdn.example.test/fill.png', stroke: { uri: 'https://cdn.example.test/stroke.png', assetId: 'a1' } } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.effects.map((effect) => [effect.target, effect.origin, effect.source.type]), [['fill', 'native', 'texture'], ['stroke', 'native', 'texture']]);
});

test('malformed Bilibili gradient keeps Base and stores vendor fallback', () => {
  const result = fromBilibili({ id: 'b2', time: 2, text: 'recoverable', color: 456, colorfulSrc: { fill: 'http://unsafe.example.test/fill.png' } });
  assert.equal(result.ok, true);
  assert.equal(result.value.effects[0].type, 'vendor');
  assert.equal(result.diagnostics[0].code, 'texture_uri_scheme');
});

test('generated preset is idempotent and does not replace native gradient', () => {
  const ordinary = base();
  const first = applyGradient(ordinary.value, { preset: 'pink-blue' });
  const second = applyGradient(first.value, { preset: 'pink-blue' });
  assert.equal(second.value.effects.length, 1);
  assert.equal(second.value.effects[0].origin, 'generated');
  const native = base({ effects: [{ type: 'gradient', origin: 'native', target: 'fill', source: { type: 'texture', uri: 'https://cdn.example.test/a.png' } }] });
  const preserved = applyGradient(native.value, { preset: 'rainbow' });
  assert.equal(preserved.generated, false);
  assert.equal(preserved.value.effects[0].origin, 'native');
  assert.equal(transformBatch([ordinary.value], { preset: 'blue-purple' })[0].effects.length, 1);
});

test('DanDanPlay output keeps p+m semantics and enhanced data is optional', () => {
  const item = applyGradient(base().value, { preset: 'pink-blue' }).value;
  const legacy = toDanDanPlay(item);
  assert.equal(legacy.p, '1,1,25,16777215');
  assert.equal(legacy.m, 'hello');
  const wire = toCompatibilityWire(item);
  assert.equal(wire.danmux.extensionVersion, 1);
  assert.equal(wire.danmux.effects[0].type, 'gradient');
  assert.equal(toEnhanced(item).effects.length, 1);
  assert.equal(fromCompatibilityWire({ p: legacy.p, m: legacy.m }).ok, true);
});

test('unknown and broken effects do not invalidate Base', () => {
  const item = base({ effects: [
    { type: 'gradient', target: 'fill', source: { type: 'linear', angle: 0, stops: [{ position: 0, color: '#FFFFFF' }] } },
    { type: 'future_effect', payload: { ignored: true } },
  ] });
  assert.equal(item.ok, false, 'writer rejects malformed registered gradient');
  const oldClient = fromCompatibilityWire({ p: '1,1,25,16777215', m: 'old client', danmux: { extensionVersion: 1, effects: [{ type: 'future_effect' }] } });
  assert.equal(oldClient.ok, true);
  assert.equal(oldClient.value.text, 'old client');
  assert.equal('effects' in oldClient.value, false);
  assert.equal(oldClient.diagnostics[0].code, 'effect_drop');
});

test('aggregate deduplicates by stable identity and native wins over generated', () => {
  const generated = applyGradient(base().value, { preset: 'pink-blue' }).value;
  const native = base({ effects: [{ type: 'gradient', origin: 'native', target: 'fill', source: { type: 'texture', uri: 'https://cdn.example.test/native.png' } }] }).value;
  assert.equal(stableIdentity(generated), 'test:source-1:1');
  const merged = aggregate([generated, native]);
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].effects[0].origin, 'native');
});

test('capability negotiation is fine grained', () => {
  const result = negotiateCapabilities({ effects: ['gradient', 'opacity'], sources: ['gradient.linear', 'gradient.shader'], targets: ['gradient.stroke'] });
  assert.deepEqual(result.effects, ['gradient']);
  assert.deepEqual(result.unsupported.effects, ['opacity']);
  assert.deepEqual(result.sources, ['gradient.linear']);
});

test('AssetResolver blocks SSRF vectors, redirects and invalid assets', async () => {
  const resolver = new AssetResolver({ fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.equal((await resolver.resolve({ uri: 'http://127.0.0.1/private' })).code, 'asset_scheme_blocked');
  assert.equal((await resolver.resolve({ uri: 'https://127.0.0.1/private' })).code, 'asset_private_host_blocked');
  const redirect = new AssetResolver({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://example.test' } }) });
  assert.equal((await redirect.resolve({ uri: 'https://cdn.example.test/a.png' })).code, 'asset_redirect_blocked');
  const html = new AssetResolver({ fetchImpl: async () => new Response('nope', { status: 200, headers: { 'content-type': 'text/html' } }) });
  assert.equal((await html.resolve({ uri: 'https://cdn.example.test/a.png' })).code, 'asset_mime_blocked');
});

test('AssetResolver verifies hashes and caches successful assets', async () => {
  let calls = 0;
  const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);
  const resolver = new AssetResolver({ fetchImpl: async () => { calls += 1; return new Response(pngHeader, { status: 200, headers: { 'content-type': 'image/png' } }); } });
  const first = await resolver.resolve({ uri: 'https://cdn.example.test/a.png' });
  assert.equal(first.ok, true);
  assert.equal(first.pixels, 1);
  const second = await resolver.resolve({ uri: 'https://cdn.example.test/a.png' });
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});

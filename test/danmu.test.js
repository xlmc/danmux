import test from 'node:test';
import assert from 'node:assert/strict';
import { createDanmuX, validateBase, stableIdentity } from '../src/danmu.js';
import { applyGradient, transformBatch } from '../src/transformers/gradient-transformer.js';
import { fromBilibili } from '../src/adapters/bilibili-danmu.js';
import { fromCompatibilityWire, toCompatibilityWire, toDanDanPlay, toEnhanced } from '../src/adapters/dandanplay.js';
import { aggregate } from '../src/pipeline/aggregate.js';
import { AssetResolver } from '../src/assets/resolver.js';
import { negotiateCapabilities } from '../src/capabilities.js';
import { DANDANPLAY_WIRE_PROFILES } from '../src/constants.js';

const publicDns = async () => [{ address: '203.0.113.10', family: 4 }];

function base(overrides = {}) {
  return createDanmuX({ id: '1', time: 1, text: 'hello', mode: 'scroll', fontSize: 25, color: 0xffffff, source: { platform: 'test', id: 'source-1' }, ...overrides });
}

const customGradient = {
  angle: 0,
  stops: [
    { position: 0, color: '#FB7299', alpha: 0.85 },
    { position: 1, color: '#33B8FF', alpha: 0.85 },
  ],
};

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

test('Bilibili protobuf item fields are normalized at the adapter boundary', () => {
  const result = fromBilibili({ id: 123, idStr: '123', progress: 12500, mode: 1, fontsize: 25, color: 0xffffff, content: 'protobuf', color_v2: 'https://cdn.example.test/fill.png' });
  assert.equal(result.ok, true);
  assert.equal(result.value.time, 12.5);
  assert.equal(result.value.mode, 'scroll');
  assert.equal(result.value.fontSize, 25);
  assert.equal(result.value.effects[0].source.uri, 'https://cdn.example.test/fill.png');
});

test('Bilibili response-level colorfulSrc catalog is accepted', () => {
  const result = fromBilibili({ id: 124, progress: 500, mode: 5, fontsize: 18, color: '16777215', content: 'catalog', colorfulSrc: [{ type: 60001, src: 'https://cdn.example.test/catalog.png' }] });
  assert.equal(result.ok, true);
  assert.equal(result.value.mode, 'top');
  assert.equal(result.value.effects[0].source.uri, 'https://cdn.example.test/catalog.png');
});

test('Bilibili Base diagnostics are retained alongside effect diagnostics', () => {
  const result = fromBilibili({ id: 'bad', progress: -1000, mode: 99, fontsize: 0, color: -1, content: 'bad' });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'mode_fallback'));
  assert.ok(result.diagnostics.some((entry) => entry.code === 'font_size_invalid'));
  assert.ok(result.diagnostics.some((entry) => entry.code === 'time_invalid'));
});

test('malformed Bilibili gradient keeps Base and stores vendor fallback', () => {
  const result = fromBilibili({ id: 'b2', time: 2, text: 'recoverable', color: 456, colorfulSrc: { fill: 'http://unsafe.example.test/fill.png' } });
  assert.equal(result.ok, true);
  assert.equal(result.value.effects[0].type, 'vendor');
  assert.equal(result.diagnostics[0].code, 'texture_uri_scheme');
});

test('generated custom gradient is idempotent and does not replace native gradient', () => {
  const ordinary = base();
  const first = applyGradient(ordinary.value, customGradient);
  const second = applyGradient(first.value, customGradient);
  assert.equal(second.value.effects.length, 1);
  assert.equal(second.value.effects[0].origin, 'generated');
  const native = base({ effects: [{ type: 'gradient', origin: 'native', target: 'fill', source: { type: 'texture', uri: 'https://cdn.example.test/a.png' } }] });
  const preserved = applyGradient(native.value, customGradient);
  assert.equal(preserved.generated, false);
  assert.equal(preserved.value.effects[0].origin, 'native');
  assert.equal(transformBatch([ordinary.value], customGradient).items[0].effects.length, 1);
  const failedBatch = transformBatch([ordinary.value, ordinary.value], { stops: [{ position: 0, color: '#FFFFFF' }] });
  assert.equal(failedBatch.items.length, 2);
  assert.equal(failedBatch.diagnostics.length, 2);
  const missingConfig = applyGradient(ordinary.value);
  assert.equal(missingConfig.ok, false);
  assert.equal(missingConfig.diagnostics[0].code, 'gradient_config_invalid');
});

test('DanDanPlay output keeps p+m semantics and enhanced data is optional', () => {
  const item = applyGradient(base().value, customGradient).value;
  const legacy = toDanDanPlay(item);
  assert.equal(legacy.p, '1,1,16777215,[test]');
  assert.equal(legacy.m, 'hello');
  const xml = toDanDanPlay(item, { profile: DANDANPLAY_WIRE_PROFILES.BILIBILI_XML });
  assert.equal(xml.p, '1,1,25,16777215,0,0,0,1');
  const wire = toCompatibilityWire(item);
  assert.equal(wire.danmux.extensionVersion, 1);
  assert.equal(wire.danmux.effects[0].type, 'gradient');
  assert.equal(toEnhanced(item).effects.length, 1);
  const decodedLegacy = fromCompatibilityWire({ p: legacy.p, m: legacy.m, cid: 7 });
  assert.equal(decodedLegacy.ok, true);
  assert.equal(decodedLegacy.value.color, 0xffffff);
  assert.equal(decodedLegacy.value.fontSize, 25);
  assert.equal(decodedLegacy.value.mode, 'scroll');
  const decodedXml = fromCompatibilityWire({ p: xml.p, m: xml.m });
  assert.equal(decodedXml.ok, true);
  assert.equal(decodedXml.value.color, 0xffffff);
  assert.equal(decodedXml.value.fontSize, 25);
  const lossy = toDanDanPlay(base({ mode: 'advanced' }).value);
  assert.equal(lossy.p, '1,1,16777215,[test]');
  assert.equal(lossy.lossReport[0].code, 'mode_loss');
});

test('unknown and broken effects do not invalidate Base', () => {
  const item = base({ effects: [
    { type: 'gradient', target: 'fill', source: { type: 'linear', angle: 0, stops: [{ position: 0, color: '#FFFFFF' }] } },
    { type: 'future_effect', payload: { ignored: true } },
  ] });
  assert.equal(item.ok, false, 'writer rejects malformed registered gradient');
  const oldClient = fromCompatibilityWire({ p: '1,1,16777215,[test]', m: 'old client', cid: 9, danmux: { extensionVersion: 1, effects: [{ type: 'future_effect' }] } });
  assert.equal(oldClient.ok, true);
  assert.equal(oldClient.value.text, 'old client');
  assert.equal('effects' in oldClient.value, false);
  assert.equal(oldClient.diagnostics[0].code, 'effect_drop');
});

test('aggregate deduplicates by stable identity and native wins over generated', () => {
  const generated = applyGradient(base().value, customGradient).value;
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
  const dnsBlocked = new AssetResolver({ fetchImpl: async () => { throw new Error('must not fetch'); }, resolveHostname: async () => [{ address: '10.0.0.2', family: 4 }] });
  assert.equal((await dnsBlocked.resolve({ uri: 'https://public-name.example/a.png' })).code, 'asset_private_address_blocked');
  const redirect = new AssetResolver({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://example.test' } }), resolveHostname: publicDns });
  assert.equal((await redirect.resolve({ uri: 'https://cdn.example.test/a.png' })).code, 'asset_redirect_blocked');
  const html = new AssetResolver({ fetchImpl: async () => new Response('nope', { status: 200, headers: { 'content-type': 'text/html' } }), resolveHostname: publicDns });
  assert.equal((await html.resolve({ uri: 'https://cdn.example.test/a.png' })).code, 'asset_mime_blocked');
  const oversized = new AssetResolver({ fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }), resolveHostname: publicDns, maxBytes: 2 });
  assert.equal((await oversized.resolve({ uri: 'https://cdn.example.test/large.png' })).code, 'asset_size_exceeded');
});

test('AssetResolver verifies hashes and caches successful assets', async () => {
  let calls = 0;
  const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);
  const resolver = new AssetResolver({ fetchImpl: async () => { calls += 1; return new Response(pngHeader, { status: 200, headers: { 'content-type': 'image/png' } }); }, resolveHostname: publicDns });
  const first = await resolver.resolve({ uri: 'https://cdn.example.test/a.png' });
  assert.equal(first.ok, true);
  assert.equal(first.pixels, 1);
  const second = await resolver.resolve({ uri: 'https://cdn.example.test/a.png' });
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});

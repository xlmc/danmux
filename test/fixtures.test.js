import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBase } from '../src/danmu.js';
import { fromBilibili } from '../src/adapters/bilibili-danmu.js';
import { fromCompatibilityWire } from '../src/adapters/dandanplay.js';

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

test('golden DanmuX fixtures pass the runtime validator', () => {
  assert.equal(validateBase(fixture('ordinary.json')).ok, true);
  assert.equal(validateBase(fixture('bilibili-gradient.json')).ok, true);
});

test('real-boundary fixtures decode into valid DanmuX models', () => {
  const protobuf = fromBilibili(fixture('bilibili-protobuf-item.json'));
  assert.equal(protobuf.ok, true);
  assert.equal(protobuf.value.time, 12.5);
  const ddplay = fromCompatibilityWire(fixture('dandanplay-json.json'));
  assert.equal(ddplay.ok, true);
  assert.equal(ddplay.value.source.platform, 'tencent');
  assert.equal(fromCompatibilityWire(fixture('compatibility-wire.json')).ok, true);
});

test('JSON Schema documents remain parseable and versioned', () => {
  const internal = JSON.parse(readFileSync(new URL('../schema/danmux-v1.schema.json', import.meta.url), 'utf8'));
  const wire = JSON.parse(readFileSync(new URL('../schema/compatibility-wire-v1.schema.json', import.meta.url), 'utf8'));
  assert.equal(internal.properties.schemaVersion.const, 1);
  assert.equal(wire.properties.danmux.properties.extensionVersion.const, 1);
  assert.match(wire.properties.p.description, /ddplay-json/u);
});

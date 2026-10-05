import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromCompatibilityWire } from '../src/core.js';
const cases = JSON.parse(readFileSync(new URL('../fixtures/client-linear-v1.json', import.meta.url)));
for (const entry of cases) test(`shared client contract: ${entry.name}`, () => {
  const result = fromCompatibilityWire(entry.comment);
  assert.equal(result.ok, true);
  const effects = result.value.effects ?? [];
  for (const target of ['fill', 'stroke']) {
    assert.equal(effects.some(e => e.target === target && e.source.type === 'linear'), entry[target]);
  }
});

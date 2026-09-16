import assert from 'node:assert/strict';
import { fromBilibili, applyGradient, toCompatibilityWire, fromCompatibilityWire } from 'danmux';

const parsed = fromBilibili({
  id: 'example-1', progress: 12500, mode: 1, fontsize: 25,
  color: 0xffffff, content: 'Hello, DanmuX!',
});
assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
const enhanced = applyGradient(parsed.value, {
  angle: 0,
  stops: [{ position: 0, color: '#FB7299' }, { position: 1, color: '#33B8FF' }],
});
assert.equal(enhanced.ok, true, JSON.stringify(enhanced.diagnostics));
const wire = toCompatibilityWire(enhanced.value);
assert.equal(wire.p, '12.5,1,16777215,[bilibili]');
assert.equal(fromCompatibilityWire(wire).value.text, parsed.value.text);
console.log(JSON.stringify(wire, null, 2));

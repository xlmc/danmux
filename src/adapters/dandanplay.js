import { DAN_DAN_PLAY_MODE, EXTENSION_VERSION } from '../constants.js';
import { createDanmuX } from '../danmu.js';
import { canonicalizeGradientEffect, validateGradientEffect } from '../effects/gradient.js';

export function toDanDanPlay(item) {
  const lossReport = [];
  const modeCode = DAN_DAN_PLAY_MODE[item.mode];
  if (modeCode === undefined) lossReport.push({ code: 'mode_loss', field: 'mode', value: item.mode });
  const p = [item.time, modeCode ?? DAN_DAN_PLAY_MODE.scroll, item.fontSize, item.color].join(',');
  return { p, m: item.text, ...(lossReport.length ? { lossReport } : {}) };
}

export function toEnhanced(item) {
  const { schemaVersion, ...base } = item;
  return {
    schemaVersion,
    extensionVersion: EXTENSION_VERSION,
    ...base,
  };
}

export function toCompatibilityWire(item) {
  const base = toDanDanPlay(item);
  return {
    p: base.p,
    m: base.m,
    danmux: {
      extensionVersion: EXTENSION_VERSION,
      ...(item.effects?.length ? { effects: structuredClone(item.effects) } : {}),
      ...(base.lossReport ? { lossReport: base.lossReport } : {}),
    },
  };
}

const reverseMode = new Map(Object.entries(DAN_DAN_PLAY_MODE).map(([key, value]) => [value, key]));

export function fromCompatibilityWire(wire, source = { platform: 'unknown', id: 'wire' }) {
  const fields = String(wire.p ?? '').split(',');
  const modeCode = Number(fields[1]);
  const diagnostics = [];
  const effects = [];
  const targets = new Set();
  for (const effect of Array.isArray(wire.danmux?.effects) ? wire.danmux.effects : []) {
    if (effect?.type !== 'gradient') {
      diagnostics.push({ code: 'effect_drop', reason: 'unsupported_effect_type', type: effect?.type });
      continue;
    }
    const validation = validateGradientEffect(effect);
    if (!validation.ok || targets.has(effect.target)) {
      diagnostics.push({ code: 'effect_drop', reason: !validation.ok ? 'invalid_effect' : 'duplicate_target', target: effect.target });
      continue;
    }
    targets.add(effect.target);
    effects.push(canonicalizeGradientEffect(effect));
  }
  const model = createDanmuX({
    id: String(wire.id ?? `${source.platform}:${fields[0] ?? '0'}:${wire.m ?? ''}`),
    time: Number(fields[0]),
    text: String(wire.m ?? ''),
    mode: reverseMode.get(modeCode) ?? 'scroll',
    fontSize: Number(fields[2]),
    color: Number(fields[3]),
    source,
    ...(effects.length ? { effects } : {}),
  });
  return diagnostics.length ? { ...model, diagnostics: [...(model.diagnostics ?? []), ...diagnostics] } : model;
}

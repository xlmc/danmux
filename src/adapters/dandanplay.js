import { DAN_DAN_PLAY_MODE, DANDANPLAY_WIRE_PROFILES, EXTENSION_VERSION } from '../constants.js';
import { createDanmuX } from '../danmu.js';
import { canonicalizeGradientEffect, validateGradientEffect } from '../effects/gradient.js';

function normalizeSourceLabel(value) {
  const label = String(value ?? 'unknown').replace(/[\[\],]/gu, '_').slice(0, 64);
  return `[${label || 'unknown'}]`;
}

function encodeMode(mode, lossReport) {
  const modeCode = DAN_DAN_PLAY_MODE[mode];
  if (modeCode !== undefined) return modeCode;
  lossReport.push({ code: 'mode_loss', field: 'mode', value: mode, fallback: 'scroll' });
  return DAN_DAN_PLAY_MODE.scroll;
}

export function toDanDanPlay(item, options = {}) {
  const lossReport = [];
  const modeCode = encodeMode(item.mode, lossReport);
  const profile = options.profile ?? DANDANPLAY_WIRE_PROFILES.JSON;
  let p;
  if (profile === DANDANPLAY_WIRE_PROFILES.BILIBILI_XML) {
    p = [
      item.time,
      modeCode,
      item.fontSize,
      item.color,
      options.timestamp ?? 0,
      options.pool ?? 0,
      options.userHash ?? 0,
      options.danmakuId ?? item.id,
    ].join(',');
  } else if (profile === DANDANPLAY_WIRE_PROFILES.JSON) {
    p = [item.time, modeCode, item.color, normalizeSourceLabel(options.sourceLabel ?? item.source.platform)].join(',');
  } else {
    lossReport.push({ code: 'wire_profile_unknown', value: profile, fallback: DANDANPLAY_WIRE_PROFILES.JSON });
    p = [item.time, modeCode, item.color, normalizeSourceLabel(options.sourceLabel ?? item.source.platform)].join(',');
  }
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

export function toCompatibilityWire(item, options = {}) {
  const base = toDanDanPlay(item, options);
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

const reverseMode = new Map([
  [1, 'scroll'],
  [2, 'scroll'],
  [3, 'scroll'],
  [4, 'bottom'],
  [5, 'top'],
  [6, 'reverse'],
]);

function parseP(fields, diagnostics) {
  const time = Number(fields[0]);
  const modeCode = Number(fields[1]);
  let fontSize = 25;
  let color;
  let sourceLabel;
  let wireId;
  if (fields.length >= 8) {
    fontSize = Number(fields[2]);
    color = Number(fields[3]);
    wireId = fields[7];
  } else if (fields.length === 3 || fields.length === 4) {
    color = Number(fields[2]);
    sourceLabel = fields[3];
  } else {
    diagnostics.push({ code: 'wire_p_shape', reason: 'expected 3/4-field JSON or 8/9-field Bilibili XML', fieldCount: fields.length });
  }
  const mode = reverseMode.get(modeCode);
  if (!mode) diagnostics.push({ code: 'mode_loss', value: modeCode, fallback: 'scroll' });
  return { time, mode: mode ?? 'scroll', fontSize, color, sourceLabel, wireId };
}

function sourceFromWire(wire, parsed, source) {
  if (source) return source;
  const sourceLabel = typeof parsed.sourceLabel === 'string' ? parsed.sourceLabel : '';
  const platform = sourceLabel.startsWith('[') && sourceLabel.endsWith(']') ? sourceLabel.slice(1, -1) || 'unknown' : 'unknown';
  const id = String(wire.id ?? wire.cid ?? parsed.wireId ?? `wire:${parsed.time}:${wire.m ?? ''}`);
  return { platform, id };
}

export function fromCompatibilityWire(wire, source) {
  const fields = String(wire.p ?? '').split(',');
  const diagnostics = [];
  const parsed = parseP(fields, diagnostics);
  const resolvedSource = sourceFromWire(wire, parsed, source);
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
    id: String(wire.id ?? wire.cid ?? parsed.wireId ?? resolvedSource.id),
    time: parsed.time,
    text: String(wire.m ?? ''),
    mode: parsed.mode,
    fontSize: parsed.fontSize,
    color: parsed.color,
    source: resolvedSource,
    ...(effects.length ? { effects } : {}),
  });
  return diagnostics.length ? { ...model, diagnostics: [...(model.diagnostics ?? []), ...diagnostics] } : model;
}

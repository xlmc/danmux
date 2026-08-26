import { createDanmuX } from '../danmu.js';
import { diagnostic } from '../diagnostics.js';
import { canonicalizeGradientEffect, validateGradientEffect } from '../effects/gradient.js';
import { MAX_VENDOR_DATA_BYTES } from '../constants.js';
import { BILIBILI_MODE_TO_DANMUX, MODES } from '../constants.js';
import { byteLength, isPlainObject } from '../utils.js';

function parseColor(value, diagnostics) {
  if (Number.isInteger(value) && value >= 0 && value <= 0xffffff) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d{1,8}$/u.test(text)) {
      const numeric = Number(text);
      if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 0xffffff) return numeric;
    }
    const normalized = text.replace(/^#/u, '');
    if (/^[0-9a-f]{6}$/iu.test(normalized)) return Number.parseInt(normalized, 16);
    if (/^0x[0-9a-f]{6}$/iu.test(value.trim())) return Number.parseInt(value, 16);
  }
  diagnostics.push(diagnostic('color_fallback', 'Invalid or missing Bilibili color; using white fallback', 'color'));
  return 0xffffff;
}

function parseMode(value, diagnostics) {
  if (MODES.includes(value)) return value;
  const mapped = BILIBILI_MODE_TO_DANMUX[Number(value)];
  if (mapped) {
    if ([8, 9].includes(Number(value))) diagnostics.push(diagnostic('mode_unsupported', `Bilibili mode ${value} is outside v1 and was preserved as advanced`, 'mode'));
    return mapped;
  }
  diagnostics.push(diagnostic('mode_fallback', `Unknown Bilibili mode ${value}; using scroll fallback`, 'mode'));
  return 'scroll';
}

function rawTexture(value) {
  if (typeof value === 'string') return { type: 'texture', uri: value };
  if (!isPlainObject(value)) return null;
  const uri = value.uri ?? value.url ?? value.src;
  return typeof uri === 'string' ? { type: 'texture', uri, ...(value.assetId ? { assetId: value.assetId } : {}), ...(value.sha256 ? { sha256: value.sha256 } : {}) } : null;
}

function parseColorfulSource(raw) {
  const input = raw.color_v2 ?? raw.colorV2 ?? raw.colorfulSrc ?? raw.colorful_src ?? raw.gradient;
  if (input === undefined || input === null) return { effects: [], diagnostics: [] };
  let parsed = input;
  if (typeof input === 'string') {
    try { parsed = JSON.parse(input); } catch { parsed = { fill: input }; }
  }
  if (Array.isArray(parsed)) {
    const native = parsed.find((entry) => entry?.type === 60001 || entry?.type === 'VipGradualColor') ?? parsed[0];
    if (native?.src !== undefined) {
      try { parsed = typeof native.src === 'string' ? JSON.parse(native.src) : native.src; }
      catch { parsed = { fill: native.src }; }
    }
  }
  if (isPlainObject(parsed) && parsed.type !== undefined && parsed.src !== undefined && !parsed.fill && !parsed.stroke) {
    try { parsed = typeof parsed.src === 'string' ? JSON.parse(parsed.src) : parsed.src; }
    catch { parsed = { fill: parsed.src }; }
  }
  if (!isPlainObject(parsed)) return { effects: [], diagnostics: [diagnostic('native_gradient_invalid', 'Bilibili colorful source is not an object', 'colorfulSrc')] };
  const candidates = [];
  const fill = parsed.fill ?? parsed.fillColor ?? parsed.fill_color ?? parsed.texture;
  const stroke = parsed.stroke ?? parsed.strokeColor ?? parsed.stroke_color;
  if (fill !== undefined) candidates.push(['fill', fill]);
  if (stroke !== undefined) candidates.push(['stroke', stroke]);
  if (!candidates.length && (parsed.uri || parsed.url || parsed.src)) candidates.push(['fill', parsed]);
  const effects = [];
  const diagnostics = [];
  for (const [target, value] of candidates) {
    const source = rawTexture(value);
    const effect = source ? canonicalizeGradientEffect({ type: 'gradient', target, origin: 'native', source }) : null;
    const validation = effect && validateGradientEffect(effect);
    if (!validation?.ok) diagnostics.push(...(validation?.diagnostics ?? [diagnostic('native_gradient_invalid', 'Cannot parse Bilibili texture source', 'colorfulSrc')]));
    else effects.push(effect);
  }
  return { effects, diagnostics };
}

function vendorFallback(raw, diagnostics) {
  const data = { rawField: raw.color_v2 ?? raw.colorV2 ?? raw.colorfulSrc ?? raw.colorful_src ?? raw.gradient, diagnostics };
  if (byteLength(data) > MAX_VENDOR_DATA_BYTES) return { name: 'unknown_effect_truncated', data: { truncated: true } };
  return { name: 'unknown_effect', data };
}

export function fromBilibili(raw) {
  const adapterDiagnostics = [];
  const parsedGradient = parseColorfulSource(raw);
  adapterDiagnostics.push(...parsedGradient.diagnostics);
  const { effects } = parsedGradient;
  const effectList = [...effects];
  if (adapterDiagnostics.length && (raw.color_v2 ?? raw.colorV2 ?? raw.colorfulSrc ?? raw.colorful_src ?? raw.gradient) !== undefined) {
    effectList.push({ type: 'vendor', vendor: 'bilibili', ...vendorFallback(raw, adapterDiagnostics) });
  }
  const hasExplicitTime = raw.time !== undefined;
  const result = createDanmuX({
    id: String(raw.idStr ?? raw.id ?? raw.danmakuId ?? ''),
    time: hasExplicitTime ? Number(raw.time) : Number(raw.progress ?? 0) / 1000,
    text: raw.text ?? raw.content ?? '',
    mode: parseMode(raw.mode ?? 'scroll', adapterDiagnostics),
    fontSize: Number(raw.fontSize ?? raw.font_size ?? raw.fontsize ?? 25),
    color: parseColor(raw.color, adapterDiagnostics),
    source: { platform: 'bilibili', id: String(raw.sourceId ?? raw.idStr ?? raw.id ?? '') },
    ...(effectList.length ? { effects: effectList } : {}),
  });
  const diagnostics = [...adapterDiagnostics, ...(result.diagnostics ?? [])];
  return { ...result, diagnostics };
}

import { createDanmuX } from '../danmu.js';
import { diagnostic } from '../diagnostics.js';
import { canonicalizeGradientEffect, validateGradientEffect } from '../effects/gradient.js';
import { MAX_VENDOR_DATA_BYTES } from '../constants.js';
import { byteLength, isPlainObject } from '../utils.js';

function parseColor(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 0xffffff) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/^#/u, '');
    if (/^[0-9a-f]{6}$/iu.test(normalized)) return Number.parseInt(normalized, 16);
    if (/^0x[0-9a-f]{6}$/iu.test(value.trim())) return Number.parseInt(value, 16);
  }
  return 0xffffff;
}

function rawTexture(value) {
  if (typeof value === 'string') return { type: 'texture', uri: value };
  if (!isPlainObject(value)) return null;
  const uri = value.uri ?? value.url ?? value.src;
  return typeof uri === 'string' ? { type: 'texture', uri, ...(value.assetId ? { assetId: value.assetId } : {}), ...(value.sha256 ? { sha256: value.sha256 } : {}) } : null;
}

function parseColorfulSource(raw) {
  const input = raw.colorfulSrc ?? raw.colorful_src ?? raw.gradient;
  if (input === undefined || input === null) return { effects: [], diagnostics: [] };
  let parsed = input;
  if (typeof input === 'string') {
    try { parsed = JSON.parse(input); } catch { parsed = { fill: input }; }
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
  const data = { rawField: raw.colorfulSrc ?? raw.colorful_src ?? raw.gradient, diagnostics };
  if (byteLength(data) > MAX_VENDOR_DATA_BYTES) return { name: 'unknown_effect_truncated', data: { truncated: true } };
  return { name: 'unknown_effect', data };
}

export function fromBilibili(raw) {
  const { effects, diagnostics } = parseColorfulSource(raw);
  const effectList = [...effects];
  if (diagnostics.length) effectList.push({ type: 'vendor', vendor: 'bilibili', ...vendorFallback(raw, diagnostics) });
  const result = createDanmuX({
    id: String(raw.id ?? raw.danmakuId ?? ''),
    time: Number(raw.time ?? raw.progress ?? 0),
    text: raw.text ?? raw.content ?? '',
    mode: raw.mode ?? 'scroll',
    fontSize: Number(raw.fontSize ?? raw.font_size ?? 25),
    color: parseColor(raw.color_v2?.color ?? raw.color_v2 ?? raw.color),
    source: { platform: 'bilibili', id: String(raw.sourceId ?? raw.id ?? '') },
    ...(effectList.length ? { effects: effectList } : {}),
  });
  return { ...result, diagnostics };
}

import { withEffects } from '../danmu.js';
import { canonicalizeGradientEffect, isNativeGradient, validateGradientEffect } from '../effects/gradient.js';
import { stableStringify } from '../utils.js';

function resolveSource(config) {
  if (!Array.isArray(config?.stops)) throw new Error('gradient stops are required');
  return { type: 'linear', angle: config.angle ?? 0, stops: structuredClone(config.stops) };
}

export function applyGradient(item, config = {}) {
  const existing = item.effects ?? [];
  const target = config.target ?? 'fill';
  if (!config.force && existing.some((effect) => isNativeGradient(effect) && effect.target === target)) return { ok: true, value: item, diagnostics: [], generated: false, variantKey: 'native' };
  let candidate;
  try {
    candidate = { type: 'gradient', origin: 'generated', target, source: resolveSource(config) };
  } catch (error) {
    return { ok: false, value: item, diagnostics: [{ code: 'gradient_config_invalid', message: error.message }], generated: false };
  }
  const validation = validateGradientEffect(candidate);
  if (!validation.ok) return { ok: false, value: item, diagnostics: validation.diagnostics, generated: false };
  const gradient = canonicalizeGradientEffect(candidate);
  const effects = existing.filter((effect) => !(effect.type === 'gradient' && effect.target === gradient.target && (config.force || effect.origin === 'generated')));
  const result = withEffects(item, [...effects, gradient]);
  if (!result.ok) return { ...result, value: item, generated: false };
  return { ...result, generated: true, variantKey: `custom:${stableStringify(gradient.source)}` };
}

export function transformBatch(items, config = {}) {
  const diagnostics = [];
  const transformed = items.map((item, index) => {
    const result = applyGradient(item, config);
    if (!result.ok) diagnostics.push(...result.diagnostics.map((entry) => ({ ...entry, index })));
    return result.value ?? item;
  });
  return { items: transformed, diagnostics };
}

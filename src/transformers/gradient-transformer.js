import { withEffects } from '../danmu.js';
import { canonicalizeGradientEffect, isNativeGradient, validateGradientEffect } from '../effects/gradient.js';
import { stableStringify } from '../utils.js';

export const GRADIENT_PRESETS = Object.freeze({
  bilibili: { angle: 0, stops: [{ position: 0, color: '#FB7299', alpha: 0.85 }, { position: 1, color: '#33B8FF', alpha: 0.85 }] },
  'pink-blue': { angle: 0, stops: [{ position: 0, color: '#FB7299', alpha: 0.85 }, { position: 1, color: '#33B8FF', alpha: 0.85 }] },
  'blue-purple': { angle: 0, stops: [{ position: 0, color: '#66CCFF', alpha: 0.85 }, { position: 1, color: '#A780FF', alpha: 0.85 }] },
  sweet: { angle: 0, stops: [{ position: 0, color: '#FF6B8B', alpha: 0.85 }, { position: 1, color: '#A259FF', alpha: 0.85 }] },
  cyber: { angle: 0, stops: [{ position: 0, color: '#00FF87', alpha: 0.85 }, { position: 1, color: '#60EFFF', alpha: 0.85 }] },
  sunset: { angle: 0, stops: [{ position: 0, color: '#FFA726', alpha: 0.85 }, { position: 1, color: '#FF5252', alpha: 0.85 }] },
  ocean: { angle: 0, stops: [{ position: 0, color: '#2E3192', alpha: 0.85 }, { position: 1, color: '#1BFFFF', alpha: 0.85 }] },
  mint: { angle: 0, stops: [{ position: 0, color: '#43E97B', alpha: 0.85 }, { position: 1, color: '#38F9D7', alpha: 0.85 }] },
  rainbow: { angle: 0, stops: [{ position: 0, color: '#FF0000', alpha: 0.85 }, { position: 0.17, color: '#FFA500', alpha: 0.85 }, { position: 0.33, color: '#FFFF00', alpha: 0.85 }, { position: 0.5, color: '#00FF00', alpha: 0.85 }, { position: 0.67, color: '#00FFFF', alpha: 0.85 }, { position: 0.83, color: '#0000FF', alpha: 0.85 }, { position: 1, color: '#8000FF', alpha: 0.85 }] },
});

function resolveSource(config) {
  if (config?.stops) return { type: 'linear', angle: config.angle ?? 0, stops: config.stops };
  const preset = GRADIENT_PRESETS[config?.preset ?? 'pink-blue'];
  if (!preset) throw new Error(`Unknown gradient preset: ${config?.preset}`);
  return { type: 'linear', angle: config.angle ?? preset.angle, stops: structuredClone(config.stops ?? preset.stops) };
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
  return { ...result, generated: true, variantKey: `${config.preset ?? 'custom'}:${stableStringify(gradient.source)}` };
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

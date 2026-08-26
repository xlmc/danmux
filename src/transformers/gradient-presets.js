import { createDanmuX, withEffects } from '../danmu.js';
import { canonicalizeGradientEffect, isNativeGradient } from '../effects/gradient.js';

export const GRADIENT_PRESETS = Object.freeze({
  'pink-blue': { angle: 0, stops: [{ position: 0, color: '#FF80C0', alpha: 0.75 }, { position: 1, color: '#80C8FF', alpha: 0.75 }] },
  'blue-purple': { angle: 0, stops: [{ position: 0, color: '#66CCFF', alpha: 0.85 }, { position: 1, color: '#A780FF', alpha: 0.85 }] },
  rainbow: { angle: 0, stops: [{ position: 0, color: '#FF6B6B', alpha: 0.85 }, { position: 0.33, color: '#FFD166', alpha: 0.85 }, { position: 0.66, color: '#06D6A0', alpha: 0.85 }, { position: 1, color: '#4D96FF', alpha: 0.85 }] },
});

function resolveSource(config) {
  if (config?.stops) return { type: 'linear', angle: config.angle ?? 0, stops: config.stops };
  const preset = GRADIENT_PRESETS[config?.preset ?? 'pink-blue'];
  if (!preset) throw new Error(`Unknown gradient preset: ${config?.preset}`);
  return { type: 'linear', angle: config.angle ?? preset.angle, stops: structuredClone(config.stops ?? preset.stops) };
}

export function applyGradient(item, config = {}) {
  const existing = item.effects ?? [];
  if (!config.force && existing.some(isNativeGradient)) return { ok: true, value: item, generated: false, variantKey: 'native' };
  const gradient = canonicalizeGradientEffect({ type: 'gradient', origin: 'generated', target: config.target ?? 'fill', source: resolveSource(config) });
  const effects = existing.filter((effect) => !(effect.type === 'gradient' && effect.target === gradient.target && effect.origin === 'generated'));
  const result = withEffects(item, [...effects, gradient]);
  return { ...result, generated: true, variantKey: `${config.preset ?? 'custom'}:${JSON.stringify(gradient.source)}` };
}

export function transformBatch(items, config = {}) {
  return items.map((item) => applyGradient(item, config).value ?? item);
}

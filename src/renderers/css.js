import { canonicalizeGradientEffect, validateGradientEffect } from '../effects/gradient.js';

// Only linear text fill is handled here. Textures/strokes require another renderer.
export function gradientToCss(effect) {
  const validation = validateGradientEffect(effect);
  if (!validation.ok) return { ok: false, diagnostics: validation.diagnostics };
  if (effect.target !== 'fill' || effect.source.type !== 'linear') {
    return { ok: false, diagnostics: [{ code: 'css_gradient_unsupported', message: 'CSS adapter supports linear fill only', fallback: 'base' }] };
  }
  const { angle, stops } = canonicalizeGradientEffect(effect).source;
  // DanmuX: 0 points right, clockwise. CSS: 0 points up, clockwise.
  const cssAngle = (angle + 90) % 360;
  const cssStops = stops.map(stop => {
    const rgb = Number.parseInt(stop.color.slice(1), 16);
    const color = `rgba(${rgb >> 16}, ${(rgb >> 8) & 255}, ${rgb & 255}, ${stop.alpha})`;
    return `${color} ${stop.position * 100}%`;
  });
  return { ok: true, value: `linear-gradient(${cssAngle}deg, ${cssStops.join(', ')})`, diagnostics: [] };
}

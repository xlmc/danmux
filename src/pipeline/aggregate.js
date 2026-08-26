import { stableIdentity } from '../danmu.js';
import { isNativeGradient } from '../effects/gradient.js';

function preferEffects(existing = [], incoming = []) {
  const byTarget = new Map();
  for (const effect of [...existing, ...incoming]) {
    if (effect.type !== 'gradient') {
      const key = `${effect.type}:${effect.vendor ?? ''}:${effect.name ?? ''}`;
      if (!byTarget.has(key)) byTarget.set(key, effect);
      continue;
    }
    const key = `gradient:${effect.target}`;
    const previous = byTarget.get(key);
    if (!previous || (!isNativeGradient(previous) && isNativeGradient(effect))) byTarget.set(key, effect);
  }
  return [...byTarget.values()];
}

export function aggregate(items) {
  const map = new Map();
  const lossReport = [];
  for (const item of items) {
    const key = stableIdentity(item);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, item);
      continue;
    }
    const effects = preferEffects(previous.effects, item.effects);
    const next = { ...previous, ...(effects.length ? { effects } : {}) };
    if (!effects.length) delete next.effects;
    map.set(key, Object.freeze(next));
    if (item.effects?.length && !next.effects?.length) lossReport.push({ code: 'effect_drop', key });
  }
  return { items: [...map.values()].sort((a, b) => a.time - b.time), lossReport };
}

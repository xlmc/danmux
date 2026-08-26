import { diagnostic, fail, ok } from './diagnostics.js';
import { MAX_ID_LENGTH, MAX_PLATFORM_LENGTH, MAX_TEXT_LENGTH, MODES, SCHEMA_VERSION } from './constants.js';
import { validateEffects } from './effects/gradient.js';
import { hasDisallowedControlCharacters, isFiniteNumber, isPlainObject, normalizeString } from './utils.js';

function requiredString(value, path, max) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    return [diagnostic('string_invalid', `must be a non-empty string no longer than ${max}`, path)];
  }
  return [];
}

export function validateBase(input) {
  const errors = [];
  if (!isPlainObject(input)) return fail([diagnostic('base_type', 'DanmuX item must be an object')]);
  if (input.schemaVersion !== SCHEMA_VERSION) errors.push(diagnostic('schema_version_invalid', `schemaVersion must be ${SCHEMA_VERSION}`, 'schemaVersion'));
  const allowedRoot = new Set(['schemaVersion', 'id', 'time', 'text', 'mode', 'fontSize', 'color', 'source', 'effects', 'vendor']);
  for (const key of Object.keys(input)) if (!allowedRoot.has(key)) errors.push(diagnostic('additional_property', `unregistered field ${key}`, key));
  errors.push(...requiredString(input.id, 'id', MAX_ID_LENGTH));
  if (!isFiniteNumber(input.time) || input.time < 0) errors.push(diagnostic('time_invalid', 'time must be a finite non-negative number of seconds', 'time'));
  if (typeof input.text !== 'string' || [...input.text].length > MAX_TEXT_LENGTH || hasDisallowedControlCharacters(input.text)) {
    errors.push(diagnostic('text_invalid', `text must be UTF-8 text up to ${MAX_TEXT_LENGTH} characters without control characters`, 'text'));
  }
  if (!MODES.includes(input.mode)) errors.push(diagnostic('mode_invalid', `mode must be one of ${MODES.join(', ')}`, 'mode'));
  if (!isFiniteNumber(input.fontSize) || input.fontSize <= 0 || input.fontSize > 256) errors.push(diagnostic('font_size_invalid', 'fontSize must be within (0, 256]', 'fontSize'));
  if (!Number.isInteger(input.color) || input.color < 0 || input.color > 0xffffff) errors.push(diagnostic('color_invalid', 'color must be a uint24 sRGB integer', 'color'));
  if (!isPlainObject(input.source)) {
    errors.push(diagnostic('source_required', 'source is required', 'source'));
  } else {
    for (const key of Object.keys(input.source)) if (!['platform', 'id'].includes(key)) errors.push(diagnostic('additional_property', `unregistered source field ${key}`, `source.${key}`));
    errors.push(...requiredString(input.source.platform, 'source.platform', MAX_PLATFORM_LENGTH));
    errors.push(...requiredString(input.source.id, 'source.id', MAX_ID_LENGTH));
  }
  errors.push(...validateEffects(input.effects));
  return errors.length ? fail(errors) : ok(input);
}

export function stableIdentity(item) {
  return `${item.source.platform}:${item.source.id}:${item.id}`;
}

export function createDanmuX(input) {
  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    id: String(input.id ?? ''),
    time: input.time,
    text: normalizeString(input.text ?? ''),
    mode: input.mode ?? 'scroll',
    fontSize: input.fontSize,
    color: input.color,
    source: input.source ? {
      platform: normalizeString(input.source.platform ?? ''),
      id: String(input.source.id ?? ''),
    } : input.source,
    ...(input.effects?.length ? { effects: input.effects.map((effect) => effect.type === 'gradient' ? structuredClone(effect) : structuredClone(effect)) } : {}),
    ...(input.vendor ? { vendor: structuredClone(input.vendor) } : {}),
  };
  const validation = validateBase(normalized);
  if (!validation.ok) return { ...validation, value: undefined };
  return ok(Object.freeze(normalized));
}

export function withEffects(item, effects) {
  const next = { ...item, ...(effects?.length ? { effects: structuredClone(effects) } : {}) };
  if (!effects?.length) delete next.effects;
  const validation = validateBase(next);
  return validation.ok ? ok(Object.freeze(next)) : { ...validation, value: undefined };
}

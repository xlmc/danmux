export const DANMUX_CAPABILITIES = Object.freeze({
  level: 1,
  effects: ['gradient'],
  sources: ['gradient.linear', 'gradient.texture'],
  targets: ['gradient.fill', 'gradient.stroke'],
});

export function negotiateCapabilities(requested = {}, supported = DANMUX_CAPABILITIES) {
  const requestedEffects = requested.effects ?? [];
  const supportedEffects = requestedEffects.filter((item) => supported.effects.includes(item));
  const requestedSources = requested.sources ?? [];
  const supportedSources = requestedSources.filter((item) => supported.sources.includes(item));
  const requestedTargets = requested.targets ?? [];
  const supportedTargets = requestedTargets.filter((item) => supported.targets.includes(item));
  return {
    level: supported.level,
    effects: supportedEffects,
    sources: supportedSources,
    targets: supportedTargets,
    unsupported: {
      effects: requestedEffects.filter((item) => !supportedEffects.includes(item)),
      sources: requestedSources.filter((item) => !supportedSources.includes(item)),
      targets: requestedTargets.filter((item) => !supportedTargets.includes(item)),
    },
  };
}

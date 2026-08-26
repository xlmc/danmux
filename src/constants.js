export const SCHEMA_VERSION = 1;
export const EXTENSION_VERSION = 1;

export const MODES = Object.freeze([
  'scroll',
  'top',
  'bottom',
  'reverse',
  'fixed',
  'advanced',
]);

export const DAN_DAN_PLAY_MODE = Object.freeze({
  scroll: 1,
  bottom: 4,
  top: 5,
  reverse: 6,
  fixed: 7,
  advanced: 1,
});

export const MAX_TEXT_LENGTH = 1000;
export const MAX_ID_LENGTH = 256;
export const MAX_PLATFORM_LENGTH = 64;
export const MAX_EFFECTS = 8;
export const MAX_VENDOR_DATA_BYTES = 16 * 1024;

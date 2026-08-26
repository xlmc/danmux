import { sha256 } from '../utils.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') return true;
  if (host.includes(':')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
}

export class AssetResolver {
  constructor({ fetchImpl = globalThis.fetch, maxBytes = 2 * 1024 * 1024, maxPixels = 16 * 1024 * 1024, timeoutMs = 5000, cache = new Map() } = {}) {
    this.fetchImpl = fetchImpl;
    this.maxBytes = maxBytes;
    this.maxPixels = maxPixels;
    this.timeoutMs = timeoutMs;
    this.cache = cache;
  }

  async resolve(asset) {
    if (!asset?.uri) return { ok: false, code: 'asset_uri_missing' };
    let url;
    try { url = new URL(asset.uri); } catch { return { ok: false, code: 'asset_uri_invalid' }; }
    if (url.protocol !== 'https:') return { ok: false, code: 'asset_scheme_blocked' };
    if (isPrivateHostname(url.hostname)) return { ok: false, code: 'asset_private_host_blocked' };
    const cacheKey = `${asset.sha256 ?? ''}:${url.href}`;
    if (this.cache.has(cacheKey)) return { ok: true, ...this.cache.get(cacheKey), cached: true };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { redirect: 'manual', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) return { ok: false, code: 'asset_redirect_blocked' };
      if (!response.ok) return { ok: false, code: 'asset_http_error', status: response.status };
      const mime = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase();
      if (!IMAGE_TYPES.has(mime)) return { ok: false, code: 'asset_mime_blocked', mime };
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > this.maxBytes) return { ok: false, code: 'asset_size_exceeded' };
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > this.maxBytes) return { ok: false, code: 'asset_size_exceeded' };
      const dimensions = readImageDimensions(buffer, mime);
      if (!dimensions) return { ok: false, code: 'asset_dimensions_invalid' };
      if (dimensions.width * dimensions.height > this.maxPixels) return { ok: false, code: 'asset_pixels_exceeded' };
      const digest = sha256(buffer);
      if (asset.sha256 && asset.sha256 !== digest) return { ok: false, code: 'asset_hash_mismatch' };
      const result = { mime, bytes: buffer.byteLength, pixels: dimensions.width * dimensions.height, sha256: digest, data: buffer };
      this.cache.set(cacheKey, result);
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, code: error.name === 'AbortError' ? 'asset_timeout' : 'asset_fetch_failed' };
    } finally {
      clearTimeout(timer);
    }
  }
}

function readImageDimensions(buffer, mime) {
  if (mime === 'image/png' && buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mime === 'image/gif' && buffer.length >= 10 && (buffer.subarray(0, 6).toString() === 'GIF87a' || buffer.subarray(0, 6).toString() === 'GIF89a')) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mime === 'image/webp' && buffer.length >= 30 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') {
    const chunk = buffer.subarray(12, 16).toString();
    if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (mime === 'image/jpeg' && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < buffer.length) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      if (!length) break;
      offset += 2 + length;
    }
  }
  return null;
}

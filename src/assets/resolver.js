import { sha256 } from '../utils.js';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// Use address parsing rather than textual prefixes: IPv6 has equivalent spellings
// and IPv4-mapped addresses must obey the same rules as native IPv4 addresses.
const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blockedAddresses.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 96], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blockedAddresses.addSubnet(network, prefix, 'ipv6');

function isPrivateAddress(address) {
  const family = isIP(address);
  return family !== 0 && blockedAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') return true;
  return isPrivateAddress(host);
}

export class AssetResolver {
  constructor({ fetchImpl = globalThis.fetch, resolveHostname = (hostname) => lookup(hostname, { all: true, verbatim: true }), allowedHosts, maxBytes = 2 * 1024 * 1024, maxPixels = 16 * 1024 * 1024, timeoutMs = 5000, cache = new Map() } = {}) {
    this.fetchImpl = fetchImpl;
    this.resolveHostname = resolveHostname;
    this.allowedHosts = allowedHosts ? new Set(allowedHosts.map((host) => String(host).toLowerCase())) : null;
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
    if (this.allowedHosts && !this.allowedHosts.has(url.hostname.toLowerCase())) return { ok: false, code: 'asset_host_not_allowed' };
    if (isPrivateHostname(url.hostname)) return { ok: false, code: 'asset_private_host_blocked' };
    try {
      const host = url.hostname.replace(/^\[|\]$/gu, '');
      const addresses = isIP(host) ? [host] : await this.resolveHostname(host);
      if (!Array.isArray(addresses) || addresses.length === 0) return { ok: false, code: 'asset_dns_empty' };
      const ips = addresses.map((entry) => typeof entry === 'string' ? entry : entry?.address);
      if (ips.some((address) => typeof address !== 'string' || isIP(address) === 0)) return { ok: false, code: 'asset_dns_invalid' };
      if (ips.some(isPrivateAddress)) return { ok: false, code: 'asset_private_address_blocked' };
    } catch {
      return { ok: false, code: 'asset_dns_failed' };
    }
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
      const buffer = await readBodyWithLimit(response, this.maxBytes);
      if (!buffer) {
        controller.abort();
        return { ok: false, code: 'asset_size_exceeded' };
      }
      const dimensions = readImageDimensions(buffer, mime);
      if (!dimensions || dimensions.width === 0 || dimensions.height === 0) return { ok: false, code: 'asset_dimensions_invalid' };
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

async function readBodyWithLimit(response, maxBytes) {
  if (!response.body?.getReader) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('asset size exceeded');
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } finally {
    reader.releaseLock();
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

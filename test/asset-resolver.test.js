import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetResolver } from '../src/assets/resolver.js';

const png = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
]);
const response = () => new Response(png, { headers: { 'content-type': 'image/png' } });
const publicDns = async () => [{ address: '203.0.113.10', family: 4 }];

test('private and multicast IP literals are blocked before DNS or fetch', async () => {
  let dnsCalls = 0;
  let fetchCalls = 0;
  const resolver = new AssetResolver({
    resolveHostname: async () => { dnsCalls += 1; return publicDns(); },
    fetchImpl: async () => { fetchCalls += 1; return response(); },
  });
  for (const host of [
    '127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.0.1', '224.0.0.1', '255.255.255.255',
    '[::1]', '[0:0:0:0:0:0:0:1]', '[fc00::1]', '[fdff::1]',
    '[fe80::1]', '[febf::1]', '[ff02::1]',
    '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[::ffff:a00:1]',
    'localhost.',
  ]) {
    const result = await resolver.resolve({ uri: `https://${host}/texture.png` });
    assert.equal(result.code, 'asset_private_host_blocked', host);
  }
  assert.equal(dnsCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('DNS answers reject private IPv6 in compressed, expanded and mapped forms', async () => {
  let fetchCalls = 0;
  for (const address of ['0:0:0:0:0:0:0:1', '::ffff:7f00:1', 'febf::1', 'fd00::1', 'ff02::1']) {
    const resolver = new AssetResolver({
      resolveHostname: async () => [
        { address: '203.0.113.10', family: 4 }, { address, family: 6 },
      ],
      fetchImpl: async () => { fetchCalls += 1; return response(); },
    });
    assert.equal((await resolver.resolve({ uri: 'https://cdn.example.test/a.png' })).code,
      'asset_private_address_blocked', address);
  }
  assert.equal(fetchCalls, 0);
});

test('invalid DNS answers fail closed without downloading', async () => {
  let fetchCalls = 0;
  for (const entry of [{ address: 'not-an-ip' }, {}, null, 123]) {
    const resolver = new AssetResolver({
      resolveHostname: async () => [entry],
      fetchImpl: async () => { fetchCalls += 1; return response(); },
    });
    assert.equal((await resolver.resolve({ uri: 'https://cdn.example.test/a.png' })).ok, false);
  }
  assert.equal(fetchCalls, 0);
});

test('ordinary hostnames starting with fc or fd are not mistaken for private IPs', async () => {
  const resolver = new AssetResolver({ resolveHostname: publicDns, fetchImpl: response });
  for (const host of ['fc-assets.example.test', 'fd-assets.example.test']) {
    assert.equal((await resolver.resolve({ uri: `https://${host}/a.png` })).ok, true, host);
  }
});

test('public IPv6 literals do not require DNS resolution', async () => {
  let dnsCalls = 0;
  const resolver = new AssetResolver({
    resolveHostname: async () => { dnsCalls += 1; throw new Error('literal needs no DNS'); },
    fetchImpl: response,
  });
  for (const host of ['[2606:4700:4700::1111]', '[::ffff:8.8.8.8]']) {
    assert.equal((await resolver.resolve({ uri: `https://${host}/a.png` })).ok, true, host);
  }
  assert.equal(dnsCalls, 0);
});

test('zero image dimensions and hash mismatches never enter the cache', async () => {
  const cache = new Map();
  const invalid = Buffer.from(png);
  invalid.writeUInt32BE(0, 16);
  const resolver = new AssetResolver({
    cache, resolveHostname: publicDns,
    fetchImpl: async () => new Response(invalid, { headers: { 'content-type': 'image/png' } }),
  });
  assert.equal((await resolver.resolve({ uri: 'https://cdn.example.test/zero.png' })).code,
    'asset_dimensions_invalid');
  resolver.fetchImpl = response;
  assert.equal((await resolver.resolve({ uri: 'https://cdn.example.test/hash.png', sha256: '0'.repeat(64) })).code,
    'asset_hash_mismatch');
  assert.equal(cache.size, 0);
});

test('DNS deadline bounds an unresponsive resolver without fetching or caching', async () => {
  let fetchCalls = 0;
  const resolver = new AssetResolver({ dnsTimeoutMs: 10,
    resolveHostname: () => new Promise(() => {}),
    fetchImpl: async () => { fetchCalls++; return response(); },
  });
  const result = await resolver.resolve({ uri: 'https://cdn.example.test/hung.png' });
  assert.equal(result.code, 'asset_dns_timeout');
  assert.equal(fetchCalls, 0);
  assert.equal(resolver.cache.size, 0);
});

test('resource cache evicts least recently used entries and can be disabled', async () => {
  let fetchCalls = 0;
  const resolver = new AssetResolver({ maxCacheEntries: 2, resolveHostname: publicDns,
    fetchImpl: async () => { fetchCalls++; return response(); },
  });
  const asset = name => ({ uri: `https://cdn.example.test/${name}.png` });
  await resolver.resolve(asset('a'));
  await resolver.resolve(asset('b'));
  assert.equal((await resolver.resolve(asset('a'))).cached, true);
  await resolver.resolve(asset('c'));
  assert.equal(resolver.cache.size, 2);
  assert.equal((await resolver.resolve(asset('a'))).cached, true);
  assert.equal((await resolver.resolve(asset('b'))).cached, undefined);
  assert.equal(fetchCalls, 4);
  const uncached = new AssetResolver({ maxCacheEntries: 0, resolveHostname: publicDns, fetchImpl: response });
  await uncached.resolve(asset('a'));
  assert.equal((await uncached.resolve(asset('a'))).cached, undefined);
  assert.equal(uncached.cache.size, 0);
});

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromBilibili } from '../src/adapters/bilibili-danmu.js';
import { toCompatibilityWire } from '../src/adapters/dandanplay.js';
import { applyGradient } from '../src/transformers/gradient-transformer.js';

const demoDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repositoryRoot = resolve(demoDirectory, '..');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let total = 0;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024) {
        rejectBody(new Error('request body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', rejectBody);
  });
}

async function handleConvert(request, response) {
  try {
    const input = JSON.parse(await readRequestBody(request));
    const sourceResult = fromBilibili(input.raw ?? {});
    const diagnostics = [...(sourceResult.diagnostics ?? [])];
    if (!sourceResult.value) {
      sendJson(response, 422, { diagnostics });
      return;
    }
    const gradientResult = applyGradient(sourceResult.value, input.gradient ?? {});
    diagnostics.push(...(gradientResult.diagnostics ?? []));
    const item = gradientResult.value ?? sourceResult.value;
    sendJson(response, 200, { item, wire: toCompatibilityWire(item), diagnostics });
  } catch (error) {
    sendJson(response, 400, { diagnostics: [{ code: 'demo_request_invalid', message: error.message }] });
  }
}

function safePath(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const relativePath = decoded === '/' ? 'demo/index.html' : decoded.replace(/^\/+/, '');
  const target = resolve(repositoryRoot, relativePath);
  if (target !== repositoryRoot && !target.startsWith(`${repositoryRoot}${sep}`)) return null;
  if (!target.startsWith(`${repositoryRoot}${sep}src${sep}`) && !target.startsWith(`${repositoryRoot}${sep}demo${sep}`)) return null;
  return target;
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/api/convert' && request.method === 'POST') {
      await handleConvert(request, response);
      return;
    }
    const target = safePath(pathname);
    if (!target || (await stat(target)).isDirectory()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': mimeTypes[extname(target)] ?? 'application/octet-stream',
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

const port = Number(process.env.DANMUX_DEMO_PORT ?? 4173);
server.listen(port, '127.0.0.1', () => {
  console.log(`DanmuX debug demo: http://127.0.0.1:${port}`);
});

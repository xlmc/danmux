import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this check with npm run check:package');
const work = join(root, 'work');
mkdirSync(work, { recursive: true });
const temp = mkdtempSync(join(work, 'package-check-'));
const npm = (args, cwd = root) => execFileSync(process.execPath, [npmCli, ...args], {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
try {
  const [packed] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', temp]));
  for (const file of ['src/index.js', 'types/danmux.d.ts', 'schema/danmux-v1.schema.json', 'README.en.md', 'LICENSE']) {
    assert.ok(packed.files.some(entry => entry.path === file), `Missing package file: ${file}`);
  }
  const consumer = join(temp, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm(['install', join(temp, packed.filename), '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], consumer);
  writeFileSync(join(consumer, 'smoke.mjs'), `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { readFileSync } from 'node:fs';
    import { fromBilibili, toCompatibilityWire } from 'danmux';
    const item = fromBilibili({ id: 'packed', progress: 1500, content: 'packed import', color: 0xffffff });
    assert.equal(item.ok, true);
    assert.equal(toCompatibilityWire(item.value).p, '1.5,1,16777215,[bilibili]');
    const require = createRequire(import.meta.url);
    const schema = JSON.parse(readFileSync(require.resolve('danmux/schema/danmux-v1.schema.json'), 'utf8'));
    assert.equal(schema.properties.schemaVersion.const, 1);
    assert.ok(readFileSync(require.resolve('danmux/types/danmux.d.ts'), 'utf8').includes('interface DanmuX'));
  `);
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, stdio: 'inherit' });
  console.log(`Package verified: ${packed.filename} (${packed.files.length} files); install, ESM import, schema and declaration exports passed.`);
} finally {
  const resolvedTemp = realpathSync(temp);
  const resolvedWork = realpathSync(work);
  assert.ok(resolvedTemp.startsWith(resolvedWork + sep), 'Refusing cleanup outside the workspace work directory');
  rmSync(resolvedTemp, { recursive: true, force: true });
}

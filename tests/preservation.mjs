import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(await readFile(path.join(projectRoot, 'desktop-baseline.json'), 'utf8'));
const baselineByPath = new Map(baseline.map(entry => [entry.path.replaceAll('\\', '/'), entry.hash.toUpperCase()]));
assert.equal(baselineByPath.size, baseline.length, 'Baseline contains duplicate file paths');

async function listFiles(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else assert.fail(`Unexpected filesystem entry: ${path.join(root, child)}`);
  }
  return files.sort();
}

async function hashFile(root, relative) {
  return createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex').toUpperCase();
}

const originalRoots = process.env.TUN_ORIGINAL_DESKTOP_DIR ? [
  { label: 'optional original desktop', root: path.resolve(process.env.TUN_ORIGINAL_DESKTOP_DIR) },
] : [];

for (const { label, root } of originalRoots) {
  const actualPaths = await listFiles(root);
  assert.deepEqual(actualPaths, [...baselineByPath.keys()].sort(), `${label}: file inventory changed`);
  for (const relative of actualPaths) {
    assert.equal(await hashFile(root, relative), baselineByPath.get(relative), `${label}: modified ${relative}`);
  }
  console.log(`PASS · ${label}: ${actualPaths.length} files unchanged (SHA-256)`);
}

for (const relative of ['engine.js', 'data.js', 'scene.js']) {
  assert(baselineByPath.has(relative), `Baseline is missing ${relative}`);
  assert.equal(await hashFile(path.join(projectRoot, 'game'), relative), baselineByPath.get(relative), `game/${relative}: gameplay source changed`);
}
console.log('PASS · game/engine.js, data.js, scene.js unchanged (SHA-256)');

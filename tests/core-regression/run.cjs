const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const suites = [
  'regression.js',
  'schedule-ux-regression.js',
  'scene-collision-regression.js',
  'extra-scenes-regression.js',
  'rival-regression.js',
  'final-balance-regression.js',
  'fuzz.js',
];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(__dirname, suite)], { encoding: 'utf8' });
  if (result.status !== 0 || result.error) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.error) process.stderr.write(`${result.error.stack}\n`);
  }
  assert.equal(result.status, 0, `${suite} failed`);
  const output = result.stdout.trim();
  if (output) console.log(`${suite}: ${output}`);
}
console.log(`PASS · all ${suites.length} original gameplay regression suites`);

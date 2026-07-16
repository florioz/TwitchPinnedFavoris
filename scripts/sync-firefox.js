const { cpSync, existsSync, mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

const pairs = [
  ['_locales', 'firefox/_locales'],
  ['assets', 'firefox/assets'],
  ['panel', 'firefox/panel'],
  ['src', 'firefox/src'],
  ['styles', 'firefox/styles']
];

for (const [sourceRelative, targetRelative] of pairs) {
  const source = join(root, sourceRelative);
  const target = join(root, targetRelative);
  if (!existsSync(source)) {
    throw new Error(`Missing source directory: ${sourceRelative}`);
  }
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log(`Synced ${sourceRelative} -> ${targetRelative}`);
}

cpSync(join(root, 'manifest.json'), join(root, 'firefox/manifest.json'));
console.log('Synced manifest.json -> firefox/manifest.json');

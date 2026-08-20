const { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createFirefoxManifest } = require('./firefoxManifest');

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

const manifest = createFirefoxManifest(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')));
writeFileSync(join(root, 'firefox/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Generated Firefox manifest -> firefox/manifest.json');

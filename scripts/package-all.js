const { existsSync, readFileSync, statSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const root = join(__dirname, '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable. Run this pipeline through npm run package:all.');
const stages = [
  ['test'],
  ['run', 'sync:firefox'],
  ['run', 'check'],
  ['run', 'check:firefox-sync'],
  ['run', 'build:chrome'],
  ['run', 'build:firefox'],
  ['run', 'build:android']
];

for (const args of stages) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const version = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).version;
[
  `dist/TwitchFavoritesSidebar-v${version}-chrome-store.zip`,
  `dist/TwitchFavoritesSidebar-v${version}-firefox.zip`,
  `dist/TwitchFavoritesSidebar-v${version}.apk`
].forEach((relativePath) => {
  const artifact = join(root, relativePath);
  if (!existsSync(artifact) || statSync(artifact).size === 0) {
    throw new Error(`Release artifact is missing or empty: ${relativePath}`);
  }
});
console.log('Chrome, Firefox and Android packages passed the complete release pipeline.');

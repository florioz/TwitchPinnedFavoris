const { existsSync, statSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { PROJECT_ROOT } = require('./projectPaths');
const { readJson } = require('./packageTools');
const { getReleaseArtifacts, RELEASE_STAGES } = require('./releaseConfig');

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable. Run this pipeline through npm run package:all.');
for (const args of RELEASE_STAGES) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const version = readJson(join(PROJECT_ROOT, 'manifest.json')).version;
getReleaseArtifacts(version).forEach((relativePath) => {
  const artifact = join(PROJECT_ROOT, relativePath);
  if (!existsSync(artifact) || statSync(artifact).size === 0) {
    throw new Error(`Release artifact is missing or empty: ${relativePath}`);
  }
});
console.log('Chrome, Firefox and Android packages passed the complete release pipeline.');

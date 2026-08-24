const { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createFirefoxManifest } = require('./firefoxManifest');
const { FIREFOX_SYNC_PAIRS, PROJECT_ROOT, isConflictArtifact } = require('./projectPaths');
const { readJson } = require('./packageTools');

for (const [sourceRelative, targetRelative] of FIREFOX_SYNC_PAIRS) {
  const source = join(PROJECT_ROOT, sourceRelative);
  const target = join(PROJECT_ROOT, targetRelative);
  if (!existsSync(source)) throw new Error(`Missing source directory: ${sourceRelative}`);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, {
    recursive: true,
    filter: (candidate) => !isConflictArtifact(candidate)
  });
  console.log(`Synced ${sourceRelative} -> ${targetRelative}`);
}

const manifest = createFirefoxManifest(readJson(join(PROJECT_ROOT, 'manifest.json')));
writeFileSync(join(PROJECT_ROOT, 'firefox/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Generated Firefox manifest -> firefox/manifest.json');

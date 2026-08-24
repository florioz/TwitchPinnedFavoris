const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createFirefoxManifest } = require('./firefoxManifest');
const { collectRelativeFiles, FIREFOX_SYNC_PAIRS, PROJECT_ROOT } = require('./projectPaths');
const { readJson } = require('./packageTools');

for (const [sourceRelative, targetRelative] of FIREFOX_SYNC_PAIRS) {
  const source = join(PROJECT_ROOT, sourceRelative);
  const target = join(PROJECT_ROOT, targetRelative);
  const sourceFiles = collectRelativeFiles(source);
  const targetFiles = collectRelativeFiles(target);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) {
    throw new Error(`Firefox file list differs for ${sourceRelative}. Run npm run sync:firefox.`);
  }
  sourceFiles.forEach((file) => {
    const sourceFile = file === '.' ? source : join(source, file);
    const targetFile = file === '.' ? target : join(target, file);
    if (!readFileSync(sourceFile).equals(readFileSync(targetFile))) {
      throw new Error(`Firefox copy is stale: ${targetRelative}/${file}. Run npm run sync:firefox.`);
    }
  });
}

const expectedManifest = createFirefoxManifest(readJson(join(PROJECT_ROOT, 'manifest.json')));
const actualManifest = readJson(join(PROJECT_ROOT, 'firefox/manifest.json'));
if (JSON.stringify(actualManifest) !== JSON.stringify(expectedManifest)) {
  throw new Error('Firefox manifest is stale. Run npm run sync:firefox.');
}

console.log('Firefox copy matches the primary extension sources.');

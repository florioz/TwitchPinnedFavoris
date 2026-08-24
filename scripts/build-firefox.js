const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createFirefoxManifest } = require('./firefoxManifest');
const { BROWSER_PACKAGE_ENTRIES, PROJECT_ROOT } = require('./projectPaths');
const {
  copyRequiredEntries,
  createZipArchive,
  readJson,
  recreateDirectory
} = require('./packageTools');

const distDirectory = join(PROJECT_ROOT, 'dist');
const buildDirectory = join(distDirectory, 'firefox-store');
const sourceManifest = readJson(join(PROJECT_ROOT, 'manifest.json'));
const manifest = createFirefoxManifest(sourceManifest);
const packageEntries = [...BROWSER_PACKAGE_ENTRIES, 'manifest.json'];
const zipPath = join(distDirectory, `TwitchFavoritesSidebar-v${sourceManifest.version}-firefox.zip`);

recreateDirectory(buildDirectory);
copyRequiredEntries({
  root: PROJECT_ROOT,
  destination: buildDirectory,
  entries: BROWSER_PACKAGE_ENTRIES
});
writeFileSync(join(buildDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
createZipArchive({ sourceDirectory: buildDirectory, destination: zipPath, entries: packageEntries });

console.log(`Firefox package ready: ${zipPath}`);

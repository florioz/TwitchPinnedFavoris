const { join } = require('node:path');
const { BROWSER_PACKAGE_ENTRIES, PROJECT_ROOT } = require('./projectPaths');
const {
  copyRequiredEntries,
  createZipArchive,
  readJson,
  recreateDirectory,
  validateChromeManifest
} = require('./packageTools');

const distDirectory = join(PROJECT_ROOT, 'dist');
const buildDirectory = join(distDirectory, 'chrome-store');
const manifest = readJson(join(PROJECT_ROOT, 'manifest.json'));
const packageEntries = ['manifest.json', ...BROWSER_PACKAGE_ENTRIES];
const zipPath = join(distDirectory, `TwitchFavoritesSidebar-v${manifest.version}-chrome-store.zip`);

validateChromeManifest(manifest);
recreateDirectory(buildDirectory);
copyRequiredEntries({ root: PROJECT_ROOT, destination: buildDirectory, entries: packageEntries });
createZipArchive({ sourceDirectory: buildDirectory, destination: zipPath, entries: packageEntries });

console.log(`Chrome Web Store package ready: ${zipPath}`);

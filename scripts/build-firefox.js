const { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { createFirefoxManifest } = require('./firefoxManifest');

const root = join(__dirname, '..');
const distDir = join(root, 'dist');
const buildDir = join(distDir, 'firefox-store');
const manifestSource = join(root, 'manifest.json');
const sourceManifest = JSON.parse(readFileSync(manifestSource, 'utf8'));
const manifest = createFirefoxManifest(sourceManifest);
const zipPath = join(distDir, `TwitchFavoritesSidebar-v${sourceManifest.version}-firefox.zip`);
const include = ['_locales', 'assets', 'panel', 'src', 'styles', 'PRIVACY.md', 'LICENSE'];

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

include.forEach((entry) => {
  const source = join(root, entry);
  if (!existsSync(source)) throw new Error(`Missing required package entry: ${entry}`);
  cpSync(source, join(buildDir, entry), { recursive: true });
});

writeFileSync(join(buildDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

rmSync(zipPath, { force: true });
if (process.platform === 'win32') {
  execFileSync('tar.exe', ['-a', '-c', '-f', zipPath, '-C', buildDir, ...include, 'manifest.json'], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: buildDir, stdio: 'inherit' });
}

console.log(`Firefox package ready: ${zipPath}`);

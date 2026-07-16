const { cpSync, existsSync, mkdirSync, readFileSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const root = join(__dirname, '..');
const distDir = join(root, 'dist');
const buildDir = join(distDir, 'chrome-store');
const zipPath = join(distDir, 'TwitchFavoritesSidebar-chrome-store.zip');

const include = [
  'manifest.json',
  '_locales',
  'assets',
  'panel',
  'src',
  'styles',
  'PRIVACY.md',
  'LICENSE'
];

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

include.forEach((entry) => {
  const source = join(root, entry);
  if (!existsSync(source)) {
    throw new Error(`Missing required package entry: ${entry}`);
  }
  cpSync(source, join(buildDir, entry), { recursive: true });
});

const manifest = JSON.parse(readFileSync(join(buildDir, 'manifest.json'), 'utf8'));
const forbiddenHosts = new Set(['https://*/*', 'http://*/*', '<all_urls>']);
const hosts = manifest.host_permissions || [];
const broadHost = hosts.find((host) => forbiddenHosts.has(host));
if (broadHost) {
  throw new Error(`Refusing Chrome package with broad host permission: ${broadHost}`);
}
if ((manifest.permissions || []).includes('scripting')) {
  throw new Error('Refusing Chrome package with unused scripting permission.');
}

rmSync(zipPath, { force: true });

if (process.platform === 'win32') {
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Compress-Archive -Path "${buildDir}\\*" -DestinationPath "${zipPath}" -Force`
  ], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: buildDir, stdio: 'inherit' });
}

console.log(`Chrome Web Store package ready: ${zipPath}`);

const { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const root = join(__dirname, '..');
const distDir = join(root, 'dist');
const buildDir = join(distDir, 'firefox-store');
const manifestSource = join(root, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestSource, 'utf8'));
const zipPath = join(distDir, `TwitchFavoritesSidebar-v${manifest.version}-firefox.zip`);
const include = ['_locales', 'assets', 'panel', 'src', 'styles', 'PRIVACY.md', 'LICENSE'];

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

include.forEach((entry) => {
  const source = join(root, entry);
  if (!existsSync(source)) throw new Error(`Missing required package entry: ${entry}`);
  cpSync(source, join(buildDir, entry), { recursive: true });
});

manifest.permissions = (manifest.permissions || []).filter((permission) => permission !== 'sidePanel');
delete manifest.side_panel;
manifest.background = {
  service_worker: 'src/background/serviceWorker.js',
  scripts: ['src/background/firefoxBackground.js'],
  type: 'module'
};
manifest.sidebar_action = {
  default_title: '__MSG_actionTitle__',
  default_panel: 'panel/sidepanel.html',
  default_icon: {
    16: 'assets/icon16.png',
    48: 'assets/icon48.png'
  }
};
manifest.browser_specific_settings = {
  gecko: {
    id: 'twitch-favorites-sidebar@florioz',
    strict_min_version: '128.0',
    data_collection_permissions: { required: ['none'] }
  }
};

writeFileSync(join(buildDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  join(buildDir, 'src/background/firefoxBackground.js'),
  "import('./serviceWorker.js').catch((error) => console.error('[TFR] Firefox background failed', error));\n"
);

rmSync(zipPath, { force: true });
if (process.platform === 'win32') {
  execFileSync('tar.exe', ['-a', '-c', '-f', zipPath, '-C', buildDir, ...include, 'manifest.json'], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: buildDir, stdio: 'inherit' });
}

console.log(`Firefox package ready: ${zipPath}`);

const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const files = [
  'src/background/serviceWorker.js',
  'src/background/liveState.mjs',
  'src/background/twitchClient.mjs',
  'src/contentScripts/main.js',
  'src/contentScripts/overlayPanel.js',
  'panel/bootstrap.js',
  'panel/vods.js',
  'mobile/app.js',
  'scripts/serve-mobile.js',
  'scripts/configure-mobile-oauth.js',
  'scripts/configure-web-oauth.js',
  'firefox/src/background/serviceWorker.js',
  'firefox/src/contentScripts/main.js',
  'firefox/src/contentScripts/overlayPanel.js',
  'firefox/panel/bootstrap.js',
  'firefox/panel/vods.js'
];

for (const featureRoot of [
  'src/contentScripts/features',
  'firefox/src/contentScripts/features'
]) {
  const directory = join(root, featureRoot);
  if (!existsSync(directory)) continue;
  for (const entry of readdirSync(directory)) {
    if (entry.endsWith('.js')) {
      files.push(`${featureRoot}/${entry}`);
    }
  }
}

for (const file of files) {
  const fullPath = join(root, file);
  if (!existsSync(fullPath)) continue;
  const result = spawnSync(process.execPath, ['--check', fullPath], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Checked ${files.length} JavaScript files.`);

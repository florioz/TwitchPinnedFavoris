const test = require('node:test');
const assert = require('node:assert/strict');

const { createFirefoxManifest } = require('../scripts/firefoxManifest');

test('Firefox manifest uses a global native sidebar instead of Chromium sidePanel', () => {
  const source = {
    manifest_version: 3,
    permissions: ['storage', 'sidePanel'],
    side_panel: { default_path: 'panel/sidepanel.html' },
    background: { service_worker: 'src/background/serviceWorker.js', type: 'module' }
  };

  const manifest = createFirefoxManifest(source);

  assert.equal(manifest.permissions.includes('sidePanel'), false);
  assert.equal(manifest.side_panel, undefined);
  assert.equal(manifest.sidebar_action.default_panel, 'panel/sidepanel.html');
  assert.deepEqual(manifest.background.scripts, ['src/background/firefoxBackground.js']);
  assert.equal(source.side_panel.default_path, 'panel/sidepanel.html');
});

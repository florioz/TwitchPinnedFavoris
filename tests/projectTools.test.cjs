const test = require('node:test');
const assert = require('node:assert/strict');
const { join, relative } = require('node:path');

const {
  BROWSER_PACKAGE_ENTRIES,
  FIREFOX_SYNC_PAIRS,
  PROJECT_ROOT,
  collectJavaScriptFiles,
  collectRelativeFiles,
  isConflictArtifact
} = require('../scripts/projectPaths');
const { validateChromeManifest } = require('../scripts/packageTools');
const { getReleaseArtifacts, RELEASE_STAGES } = require('../scripts/releaseConfig');

test('project paths expose one shared browser packaging contract', () => {
  assert.deepEqual(
    BROWSER_PACKAGE_ENTRIES,
    ['_locales', 'assets', 'panel', 'src', 'styles', 'PRIVACY.md', 'LICENSE']
  );
  assert.equal(FIREFOX_SYNC_PAIRS.some(([source]) => source === 'src'), true);
  assert.equal(FIREFOX_SYNC_PAIRS.some(([source]) => source === 'styles'), true);
});

test('JavaScript discovery automatically includes source and build modules', () => {
  const files = collectJavaScriptFiles().map((file) => relative(PROJECT_ROOT, file).replaceAll('\\', '/'));
  assert.equal(files.includes('src/contentScripts/features/favoritesStore.js'), true);
  assert.equal(files.includes('scripts/projectPaths.js'), true);
  assert.equal(files.some((file) => file.endsWith('.json')), false);
});

test('relative file collection is deterministic', () => {
  const files = collectRelativeFiles(join(PROJECT_ROOT, 'scripts'));
  assert.deepEqual(files, [...files].sort());
});

test('cloud conflict artifacts are excluded from source discovery and packages', () => {
  assert.equal(isConflictArtifact('favoritesStore (# Edit conflict 2026-08-25 abc #).js'), true);
  assert.equal(isConflictArtifact('src (# Name clash 2026-08-24 abc #)'), true);
  assert.equal(isConflictArtifact('favoritesStore.js'), false);
  const files = collectJavaScriptFiles().map((file) => relative(PROJECT_ROOT, file).replaceAll('\\', '/'));
  assert.equal(files.some((file) => file.includes('Edit conflict')), false);
});

test('Chrome package validation rejects broad and unused permissions', () => {
  assert.throws(
    () => validateChromeManifest({ host_permissions: ['<all_urls>'] }),
    /broad host permission/
  );
  assert.throws(
    () => validateChromeManifest({ permissions: ['scripting'] }),
    /unused scripting permission/
  );
  assert.doesNotThrow(() => validateChromeManifest({
    permissions: ['storage'],
    host_permissions: ['https://www.twitch.tv/*']
  }));
});

test('release pipeline synchronizes generated sources before testing and building', () => {
  const labels = RELEASE_STAGES.map((stage) => stage.join(' '));
  assert.ok(labels.indexOf('run sync:firefox') < labels.indexOf('test'));
  assert.ok(labels.indexOf('run sync:supabase') < labels.indexOf('test'));
  assert.deepEqual(getReleaseArtifacts('1.2.3'), [
    'dist/TwitchFavoritesSidebar-v1.2.3-chrome-store.zip',
    'dist/TwitchFavoritesSidebar-v1.2.3-firefox.zip',
    'dist/TwitchFavoritesSidebar-v1.2.3.apk'
  ]);
});

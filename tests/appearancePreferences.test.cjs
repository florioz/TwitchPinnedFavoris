const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/appearancePreferences.js'),
  'utf8'
), context);
const preferences = context.window.TFRAppearancePreferences;

test('appearance preferences preserve supported values', () => {
  assert.equal(preferences.sanitizeStreamerItemStyle('avatar-grid'), 'avatar-grid');
  assert.equal(preferences.sanitizeSidebarSurfaceStyle('arcade'), 'arcade');
  assert.equal(preferences.sanitizeSidebarAnimationStyle('glitch'), 'glitch');
  assert.equal(preferences.sanitizeAutoCompactGroupStyle('vertical'), 'vertical');
});

test('appearance preferences use stable fallbacks', () => {
  assert.equal(preferences.sanitizeStreamerItemStyle('unknown'), 'default');
  assert.equal(preferences.sanitizeSidebarSurfaceStyle(null), 'default');
  assert.equal(preferences.sanitizeSidebarAnimationStyle('unknown'), 'soft');
  assert.equal(preferences.sanitizeAutoCompactGroupStyle('unknown'), 'default');
});

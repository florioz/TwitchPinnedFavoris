const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/backupNormalizer.js'),
  'utf8'
), context);
const normalizer = context.window.TFRBackupNormalizer.create({
  defaultAvatar: 'default.png',
  sanitizeCategoryList: (items) => items.filter(Boolean),
  sanitizeColor: (color) => /^#[0-9a-f]{6}$/i.test(color || '') ? color : ''
});

test('backup normalizer migrates legacy favorite fields', () => {
  const result = normalizer.favorites({
    MixedCase: { id: 42, category: 'games', requiredCategory: 'Grand Theft Auto V' }
  });
  assert.equal(result.mixedcase.login, 'mixedcase');
  assert.equal(result.mixedcase.userId, '42');
  assert.deepEqual(Array.from(result.mixedcase.categories), ['games']);
  assert.equal(result.mixedcase.categoryFilter.enabled, true);
  assert.equal(result.mixedcase.avatarUrl, 'default.png');
});

test('backup normalizer deduplicates category identifiers', () => {
  const result = normalizer.categories([
    { id: 'same', name: 'One', color: '#9147ff' },
    { id: 'same', name: 'Two', color: 'invalid' }
  ]);
  assert.equal(result[0].id, 'same');
  assert.equal(result[1].id, 'same_1');
  assert.equal(result[0].color, '#9147ff');
  assert.equal(result[1].color, '');
});

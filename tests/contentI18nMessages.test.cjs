const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/contentI18nMessages.js'),
  'utf8'
), context);
const catalog = context.window.TFRContentI18nMessages;

test('content translation catalog exposes French and English messages', () => {
  assert.ok(Object.keys(catalog.messages.fr).length > 300);
  assert.ok(Object.keys(catalog.messages.en).length > 300);
  assert.equal(Object.isFrozen(catalog), true);
});

test('content translation locales expose the same message keys', () => {
  assert.deepEqual(
    Object.keys(catalog.messages.fr).sort(),
    Object.keys(catalog.messages.en).sort()
  );
});

test('plural translation locales expose the same keys and fallback form', () => {
  assert.deepEqual(
    Object.keys(catalog.pluralMessages.fr).sort(),
    Object.keys(catalog.pluralMessages.en).sort()
  );
  Object.values(catalog.pluralMessages).forEach((locale) => {
    Object.values(locale).forEach((entry) => assert.equal(typeof entry.other, 'string'));
  });
});

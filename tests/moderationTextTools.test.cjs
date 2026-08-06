const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationTextTools.js'),
  'utf8'
), context);
const tools = context.window.TFRModerationTextTools;

test('moderation text tools normalize accents and sanitize Twitch logins', () => {
  assert.equal(tools.normalize('  BANNI DÉFINITIF  '), 'banni definitif');
  assert.equal(tools.sanitizeLogin('@Some_User!'), 'some_user');
  assert.equal(tools.sanitizeLogin('12345'), '');
});

test('moderation text tools extract users without confusing generic moderator words', () => {
  assert.equal(tools.extractLogin('Utilisateur: @Some_User'), 'utilisateur');
  assert.equal(tools.extractModerator('supprimé par @Real_Mod'), 'real_mod');
  assert.equal(tools.extractModerator('supprimé par un modérateur'), null);
});

test('moderation text tools classify boolean and ban hints', () => {
  assert.equal(tools.isTruthy('off'), false);
  assert.equal(tools.isTruthy('1'), true);
  assert.equal(tools.hasBanIndicator('ban permanent'), true);
  assert.equal(tools.hasBanIndicator('afficher les banners'), false);
});

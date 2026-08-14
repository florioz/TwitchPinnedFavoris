const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, document: {}, console });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/viewerCardSharedInvite.js'), 'utf8'
), context);
const ViewerCardSharedInvite = context.window.TFRViewerCardSharedInvite.create({ t: (key) => key });

test('viewer card invite extracts Twitch login from stable card metadata', () => {
  const feature = new ViewerCardSharedInvite();
  const card = { dataset: { userLogin: 'Some_User' }, querySelector: () => null };
  assert.equal(feature.extractLogin(card), 'some_user');
});

test('viewer card invite falls back to the channel link', () => {
  const feature = new ViewerCardSharedInvite();
  const link = { textContent: '', getAttribute: () => '/fallback_login' };
  const card = {
    dataset: {},
    querySelector(selector) { return selector === 'a[href^="/"]' ? link : null; }
  };
  assert.equal(feature.extractLogin(card), 'fallback_login');
});

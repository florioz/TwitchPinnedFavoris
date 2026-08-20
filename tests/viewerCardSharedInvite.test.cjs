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

test('viewer card invite prefers the native actions row', () => {
  const feature = new ViewerCardSharedInvite();
  const actions = {};
  const card = {
    querySelector(selector) {
      return selector === '[data-a-target="viewer-card-actions"]' ? actions : null;
    }
  };
  assert.equal(feature.findActionsHost(card), actions);
});

test('viewer card invite derives an actions row from native action buttons', () => {
  const feature = new ViewerCardSharedInvite();
  const row = { parentElement: null, querySelectorAll: () => [{}, {}] };
  const wrapper = { parentElement: row, querySelectorAll: () => [{}] };
  const follow = { parentElement: wrapper };
  const card = {
    querySelector(selector) {
      return selector === 'button[data-a-target="follow-button"]' ? follow : null;
    }
  };
  assert.equal(feature.findActionsHost(card), row);
});

test('viewer card invite does not treat an oversized card ancestor as the actions row', () => {
  const card = { querySelector: () => null };
  const oversized = {
    parentElement: card,
    querySelectorAll: () => Array.from({ length: 12 }, () => ({}))
  };
  const wrapper = { parentElement: oversized, querySelectorAll: () => [{}] };
  const follow = { parentElement: wrapper };
  card.querySelector = (selector) => selector === 'button[data-a-target="follow-button"]' ? follow : null;

  const feature = new ViewerCardSharedInvite();
  assert.equal(feature.findActionsHost(card), null);
});

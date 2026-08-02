const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/profileStateTools.js'),
  'utf8'
), context);
const deepCopy = (value) => JSON.parse(JSON.stringify(value));
const tools = context.window.TFRProfileStateTools.create({
  deepCopy,
  defaultPreferences: { sortMode: 'viewersDesc', enabled: true },
  getDefaultName: () => 'Favoris'
});

test('profile state tools synchronize and restore an active profile', () => {
  const state = {
    activeProfileId: 'main',
    profiles: {},
    favorites: { alpha: { login: 'alpha' } },
    categories: [{ id: 'one' }],
    preferences: { sortMode: 'name' }
  };
  tools.syncActive(state);
  assert.equal(state.profiles.main.favorites.alpha.login, 'alpha');
  state.favorites = {};
  state.preferences = {};
  assert.equal(tools.applyToRoot(state, 'main'), true);
  assert.equal(state.favorites.alpha.login, 'alpha');
  assert.equal(state.preferences.enabled, true);
  assert.equal(state.preferences.sortMode, 'name');
});

test('profile snapshots do not retain mutable source references', () => {
  const source = { favorites: { alpha: { login: 'alpha' } } };
  const snapshot = tools.createSnapshot(source);
  source.favorites.alpha.login = 'changed';
  assert.equal(snapshot.favorites.alpha.login, 'alpha');
  assert.equal(snapshot.name, 'Favoris');
});

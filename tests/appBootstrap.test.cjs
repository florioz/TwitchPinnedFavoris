const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

test('application bootstrap initializes and disposes every feature', async () => {
  const events = {};
  const calls = [];
  class Store {
    async init() { calls.push('store:init'); }
    refreshLiveData() { calls.push('store:refresh'); }
    dispose() { calls.push('store:dispose'); }
  }
  const feature = (name) => class { init() { calls.push(`${name}:init`); } dispose() { calls.push(`${name}:dispose`); } };
  const window = {
    addEventListener: (name, callback) => { events[name] = callback; },
    removeEventListener: (name, callback) => {
      if (events[name] === callback) delete events[name];
    }
  };
  const context = vm.createContext({ window, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/appBootstrap.js'), 'utf8'), context);
  const app = window.TFRAppBootstrap.create({
    FavoritesStore: Store, FeatureController: feature('features'), SidebarRenderer: feature('sidebar'),
    ChannelFavoriteButton: feature('button'), FavoritesOverlay: feature('overlay'),
    TopNavManager: feature('nav'), UpdateNotifier: feature('updates')
  });
  await app.start();
  events.focus();
  events.beforeunload();
  assert.deepEqual(calls.slice(0, 7), ['store:init', 'features:init', 'sidebar:init', 'button:init', 'nav:init', 'updates:init', 'store:refresh']);
  assert.equal(calls.filter((entry) => entry.endsWith(':dispose')).length, 7);
  assert.equal(calls.includes('store:dispose'), true);
  assert.equal(events.focus, undefined);
  app.dispose();
  assert.equal(calls.filter((entry) => entry === 'store:dispose').length, 1);
});

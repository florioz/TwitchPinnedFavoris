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
    TopNavManager: feature('nav'), UpdateNotifier: feature('updates'),
    ViewerCardSharedInvite: feature('viewer-invite'), OnboardingTutorial: feature('onboarding'),
    UsagePresence: feature('presence')
  });
  await app.start();
  events.focus();
  events.beforeunload();
  assert.deepEqual(calls.slice(0, 10), [
    'store:init', 'presence:init', 'features:init', 'sidebar:init', 'button:init', 'nav:init',
    'updates:init', 'viewer-invite:init', 'onboarding:init', 'store:refresh'
  ]);
  assert.equal(calls.filter((entry) => entry.endsWith(':dispose')).length, 10);
  assert.equal(calls.includes('store:dispose'), true);
  assert.equal(events.focus, undefined);
  app.dispose();
  assert.equal(calls.filter((entry) => entry === 'store:dispose').length, 1);
});

test('application bootstrap rejects instance-shaped dependencies before partial startup', async () => {
  let storeInitialized = false;
  class Store { async init() { storeInitialized = true; } }
  class Feature { init() {} dispose() {} }
  const context = vm.createContext({ window: { addEventListener() {}, removeEventListener() {} }, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/appBootstrap.js'), 'utf8'), context);
  const app = context.window.TFRAppBootstrap.create({
    FavoritesStore: Store,
    FeatureController: Feature,
    SidebarRenderer: Feature,
    ChannelFavoriteButton: Feature,
    UsagePresence: {},
    FavoritesOverlay: Feature,
    TopNavManager: Feature,
    UpdateNotifier: Feature,
    ViewerCardSharedInvite: Feature,
    OnboardingTutorial: Feature
  });
  await assert.rejects(() => app.start(), /UsagePresence must be a constructor/);
  assert.equal(storeInitialized, false);
});

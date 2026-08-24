const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, console });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/colorTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/eventEmitter.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/appearancePreferences.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/preferenceSanitizers.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/favoritesStore.js'),
  'utf8'
), context);

const FavoritesStore = context.window.TFRFavoritesStore.create({});

const createStore = (preferences = {}) => {
  const store = Object.create(FavoritesStore.prototype);
  store.state = { preferences: { ...preferences } };
  store.preferenceSanitizers = context.window.TFRPreferenceSanitizers.create({
    sanitizeColor: (value) => store.sanitizeCategoryColor(value),
    appearance: context.window.TFRAppearancePreferences
  });
  let writes = 0;
  store.updateState = async (mutator) => {
    writes += 1;
    mutator(store.state);
  };
  return { store, getWrites: () => writes };
};

test('boolean preferences write missing values and skip unchanged values', async () => {
  const { store, getWrites } = createStore();
  assert.equal(await store.setBooleanPreference('exampleEnabled', false), true);
  assert.equal(store.state.preferences.exampleEnabled, false);
  assert.equal(getWrites(), 1);

  assert.equal(await store.setBooleanPreference('exampleEnabled', false), false);
  assert.equal(getWrites(), 1);

  assert.equal(await store.setBooleanPreference('exampleEnabled', true), true);
  assert.equal(store.state.preferences.exampleEnabled, true);
  assert.equal(getWrites(), 2);
});

test('sanitized preferences preserve store context and skip unchanged writes', async () => {
  const { store, getWrites } = createStore({ exampleValue: 'SAFE' });
  store.prefix = 'SAFE';
  const sanitize = function (value) {
    return `${this.prefix}:${String(value).trim()}`;
  };

  assert.equal(await store.setSanitizedPreference('exampleValue', '', () => 'SAFE'), 'SAFE');
  assert.equal(getWrites(), 0);
  assert.equal(await store.setSanitizedPreference('exampleValue', ' next ', sanitize), 'SAFE:next');
  assert.equal(store.state.preferences.exampleValue, 'SAFE:next');
  assert.equal(getWrites(), 1);
});

test('normalized current preferences preserve defaults without redundant writes', async () => {
  const { store, getWrites } = createStore({
    categoryColorOpacity: '7',
    toastPosition: undefined,
    toastSoundId: undefined
  });

  assert.equal(await store.setCategoryColorOpacity(7), 7);
  assert.equal(await store.setToastPosition('top-right'), 'top-right');
  assert.equal(await store.setToastSound('soft'), 'soft');
  assert.equal(getWrites(), 0);

  assert.equal(await store.setCategoryColorOpacity(18.6), 19);
  assert.equal(store.state.preferences.categoryColorOpacity, 19);
  assert.equal(getWrites(), 1);
});

test('feature setters delegate to the normalized boolean mutation', async () => {
  const { store, getWrites } = createStore({ chatNoPaddingEnabled: false });
  await store.setChatNoPaddingEnabled(true);
  await store.setChatNoPaddingEnabled(true);
  assert.equal(store.state.preferences.chatNoPaddingEnabled, true);
  assert.equal(getWrites(), 1);
});

test('emote picker can only be enabled while a visible third-party provider is active', async () => {
  const { store } = createStore({
    sevenTvEmotesEnabled: false,
    betterTtvEmotesEnabled: false,
    chatEmotePickerEnabled: false
  });

  await store.setChatEmotePickerEnabled(true);
  assert.equal(store.state.preferences.chatEmotePickerEnabled, false);

  store.state.preferences.sevenTvEmotesEnabled = true;
  await store.setChatEmotePickerEnabled(true);
  assert.equal(store.state.preferences.chatEmotePickerEnabled, true);
});

test('chat padding preference is rounded and clamped between zero and twenty pixels', async () => {
  const { store, getWrites } = createStore({ chatPaddingPx: 0 });
  assert.equal(await store.setChatPaddingPx(0), 0);
  assert.equal(getWrites(), 0);
  assert.equal(await store.setChatPaddingPx(12.6), 13);
  assert.equal(store.state.preferences.chatPaddingPx, 13);
  assert.equal(getWrites(), 1);
  assert.equal(await store.setChatPaddingPx(99), 20);
  assert.equal(await store.setChatPaddingPx(-5), 0);
});

test('a single category can receive a random color without changing the others', async () => {
  const { store } = createStore();
  store.state.categories = [
    { id: 'one', color: '#111111' },
    { id: 'two', color: '#222222' }
  ];

  const color = await store.randomizeCategoryColor('one', () => 0.5);

  assert.match(color, /^#[0-9a-f]{6}$/);
  assert.equal(store.state.categories[0].color, color);
  assert.equal(store.state.categories[1].color, '#222222');
});

test('bounded integer preferences share rounding, limits and invalid-value behavior', async () => {
  const { store, getWrites } = createStore({
    recentLiveThresholdMinutes: '10',
    toastDurationSeconds: 6
  });

  assert.equal(store.sanitizeBoundedInteger('4.6', 2, 8, 3), 5);
  assert.equal(store.sanitizeBoundedInteger(99, 2, 8, 3), 8);
  assert.equal(store.sanitizeBoundedInteger('invalid', 2, 8, 3), 3);

  assert.equal(await store.setRecentLiveThreshold('invalid'), undefined);
  assert.equal(await store.setRecentLiveThreshold(10), 10);
  assert.equal(await store.setToastDuration(6), 6);
  assert.equal(getWrites(), 0);

  assert.equal(await store.setRecentLiveThreshold(121), 120);
  assert.equal(await store.setToastDuration(1), 2);
  assert.equal(getWrites(), 2);
});

test('onboarding progress is persisted as one bounded preference update', async () => {
  const { store, getWrites } = createStore();
  await store.setOnboardingTutorialState({ version: 1, step: 99, dismissed: true });
  assert.equal(store.state.preferences.onboardingTutorialVersion, 1);
  assert.equal(store.state.preferences.onboardingTutorialStep, 20);
  assert.equal(store.state.preferences.onboardingTutorialDismissed, true);
  assert.equal(getWrites(), 1);
});

test('boolean migration supports coercive and strict preference groups', () => {
  const { store } = createStore({ legacyEnabled: 1, strictEnabled: 'true' });
  store.normalizeBooleanPreference('legacyEnabled', false);
  store.normalizeBooleanPreference('missingEnabled', true);
  store.normalizeBooleanPreference('strictEnabled', false, true);
  assert.equal(store.state.preferences.legacyEnabled, true);
  assert.equal(store.state.preferences.missingEnabled, true);
  assert.equal(store.state.preferences.strictEnabled, false);
});

test('state integrity obtains missing preferences from DEFAULT_STATE', () => {
  const defaults = {
    preferences: {
      sortMode: 'viewersDesc',
      toastEnabled: true,
      futurePreference: { enabled: true }
    }
  };
  const StoreWithDefaults = context.window.TFRFavoritesStore.create({
    DEFAULT_STATE: defaults,
    deepCopy: (value) => JSON.parse(JSON.stringify(value)),
    t: () => 'Category',
    sanitizeCategoryList: (value) => value
  });
  const store = Object.create(StoreWithDefaults.prototype);
  store.preferenceSanitizers = context.window.TFRPreferenceSanitizers.create({
    sanitizeColor: (value) => store.sanitizeCategoryColor(value),
    appearance: context.window.TFRAppearancePreferences
  });
  store.state = {
    profiles: {},
    activeProfileId: 'default',
    categories: [],
    favorites: {},
    preferences: { sortMode: 'nameAsc' }
  };
  store.syncActiveProfile = () => {};
  store.ensureStateIntegrity();

  assert.equal(store.state.preferences.sortMode, 'nameAsc');
  assert.equal(store.state.preferences.toastEnabled, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(store.state.preferences.futurePreference)),
    { enabled: true }
  );
  assert.notEqual(store.state.preferences.futurePreference, defaults.preferences.futurePreference);
});

test('switching workspace forces and awaits fresh Twitch live data', async () => {
  const store = Object.create(FavoritesStore.prototype);
  const calls = [];
  store.workspaceSwitchToken = 0;
  store.state = { workspaceMode: 'personal', sharedSpaces: { shared_1: {} }, activeSharedSpaceId: 'shared_1' };
  store.syncActiveProfile = () => {};
  store.capturePersonalWorkspace = () => {};
  store.applySharedWorkspaceToRoot = (draft) => { draft.workspaceMode = 'shared'; return true; };
  store.applyPersonalWorkspaceToRoot = (draft) => { draft.workspaceMode = 'personal'; };
  store.applyImmediateWorkspaceState = (mutator) => { mutator(store.state); return true; };
  store.refreshLiveData = async (options) => calls.push(options);

  assert.equal(await store.switchWorkspaceMode('shared'), true);
  assert.equal(store.state.workspaceMode, 'shared');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ forceRefresh: true }]);
});

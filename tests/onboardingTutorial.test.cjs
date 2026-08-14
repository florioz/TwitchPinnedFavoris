const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/onboardingTutorial.js'), 'utf8'),
  { window }
);
const tutorial = window.TFROnboardingTutorial;

test('onboarding tutorial exposes bounded basic and advanced steps', () => {
  assert.equal(tutorial.STEP_KEYS.length, 5);
  assert.equal(tutorial.ADVANCED_STEP_KEYS.length, 9);
  assert.ok(tutorial.ADVANCED_STEP_KEYS.includes('vodsDeep'));
  assert.ok(tutorial.ADVANCED_STEP_KEYS.includes('soundDeep'));
  assert.ok(tutorial.ADVANCED_STEP_KEYS.includes('sharedCollabDeep'));
  assert.deepEqual(new Set([
    ...tutorial.BASIC_STEP_KEYS,
    ...tutorial.ADVANCED_STEP_KEYS
  ]), new Set(Object.keys(tutorial.STEP_TARGETS)));
  assert.equal(tutorial.normalizeStep(-4), 0);
  assert.equal(tutorial.normalizeStep(2.4), 2);
  assert.equal(tutorial.normalizeStep(99), 4);
  assert.equal(tutorial.normalizeStep('invalid'), 0);
});

test('onboarding auto-start respects completion and dismissal', () => {
  assert.equal(tutorial.shouldAutoStart({}), true);
  assert.equal(tutorial.shouldAutoStart({ onboardingTutorialVersion: 0 }), true);
  assert.equal(tutorial.shouldAutoStart({ onboardingTutorialDismissed: true }), false);
  assert.equal(tutorial.shouldAutoStart({ onboardingTutorialVersion: 1 }), false);
});

test('existing favorite lists suppress only automatic onboarding', () => {
  assert.equal(tutorial.hasExistingFavorites({ favorites: {} }), false);
  assert.equal(tutorial.hasExistingFavorites({ favorites: { streamer: {} } }), true);
  assert.equal(tutorial.hasExistingFavorites({
    favorites: {},
    profiles: { secondary: { favorites: { streamer: {} } } }
  }), true);
});

test('every tutorial step exposes at least one stable DOM target', () => {
  Object.values(tutorial.STEP_TARGETS).forEach((target) => {
    assert.ok(Array.isArray(target.selectors));
    assert.ok(target.selectors.length > 0);
    target.selectors.forEach((selector) => assert.equal(typeof selector, 'string'));
  });
  assert.deepEqual(
    Array.from(tutorial.STEP_TARGETS.soundDeep.fallbackSelectors),
    ['[data-tfr-feature-group="player"]']
  );
});

test('pending tutorial transitions are cancelled together', () => {
  const callbacks = new Map();
  let nextTimer = 0;
  window.setTimeout = (callback) => {
    const timer = ++nextTimer;
    callbacks.set(timer, callback);
    return timer;
  };
  window.clearTimeout = (timer) => callbacks.delete(timer);
  const Tutorial = tutorial.create({ t: (key) => key });
  const instance = new Tutorial({});
  let executed = false;

  instance.schedule(() => { executed = true; }, 100);
  instance.clearPendingTimers();
  callbacks.forEach((callback) => callback());

  assert.equal(executed, false);
  assert.equal(instance.pendingTimers.size, 0);
});

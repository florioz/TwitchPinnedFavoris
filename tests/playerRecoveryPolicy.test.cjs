const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/playerRecoveryPolicy.js'), 'utf8'), context);
const policy = context.window.TFRPlayerRecoveryPolicy;

test('player recovery attempt limiter enforces cooldown and rolling limit', () => {
  let timestamp = 10000;
  const limiter = policy.createAttemptLimiter({ now: () => timestamp, cooldownMs: 1000, windowMs: 10000, maxAttempts: 2 });
  assert.equal(limiter.consume(), true);
  timestamp += 500;
  assert.equal(limiter.consume(), false);
  timestamp += 500;
  assert.equal(limiter.consume(), true);
  timestamp += 1000;
  assert.equal(limiter.consume(), false);
  timestamp += 10000;
  assert.equal(limiter.consume(), true);
});

test('player recovery selectors target only video error controls', () => {
  assert.match(policy.SELECTORS.video, /video-player/);
  assert.match(policy.SELECTORS.error, /player-error-message/);
  assert.match(policy.SELECTORS.retry, /player-error-retry-button/);
  assert.doesNotMatch(policy.SELECTORS.retry, /content-gate|mature/);
  assert.equal(policy.RECOVERABLE_ERROR_PATTERN.test('Erreur réseau (Erreur #2000)'), true);
  assert.equal(policy.RECOVERABLE_ERROR_PATTERN.test('Error 4000: format not supported'), true);
  assert.equal(policy.RECOVERABLE_ERROR_PATTERN.test('Une erreur est survenue pendant la lecture'), true);
  assert.equal(policy.RECOVERABLE_ERROR_PATTERN.test('Unable to play this video'), true);
  assert.equal(policy.RECOVERABLE_ERROR_PATTERN.test('2 000 spectateurs'), false);
  assert.equal(policy.RECOVERABLE_ERROR_PATTERN.test('Cette chaîne est hors ligne'), false);
  assert.equal(policy.RETRY_LABEL_PATTERN.test('Recharger le lecteur'), true);
});

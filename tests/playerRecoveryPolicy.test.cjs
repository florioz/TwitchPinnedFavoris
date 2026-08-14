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
});

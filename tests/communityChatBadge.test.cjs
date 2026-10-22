const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
  window: {},
  document: {},
  console,
  Date,
  Element: class {},
  MutationObserver: class {}
});
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/communityChatBadge.js'),
  'utf8'
), context);

const createBadge = (sendExtensionMessage, setTimeout = () => 1) => {
  const CommunityChatBadge = context.window.TFRCommunityChatBadge.create({
    documentRef: { querySelectorAll: () => [] },
    windowRef: { setTimeout, clearTimeout: () => {} },
    sendExtensionMessage,
    t: () => 'Community member'
  });
  return new CommunityChatBadge();
};

test('community badge normalizes Twitch logins strictly', () => {
  const badge = createBadge(async () => null);
  assert.equal(badge.normalizeLogin('@Alice_42'), 'alice_42');
  assert.equal(badge.normalizeLogin('a'), '');
  assert.equal(badge.normalizeLogin('not valid'), '');
});

test('community badge batches lookups and caches positive and negative results', async () => {
  const requests = [];
  const badge = createBadge(async (message) => {
    requests.push(message);
    return { ok: true, data: ['alice'] };
  });
  badge.enabled = true;
  badge.pendingLogins.add('alice');
  badge.pendingLogins.add('bob');
  badge.renderWaiting = () => {};
  await badge.flushLookup();

  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), {
    type: 'TFR_COMMUNITY_BADGE_LOOKUP',
    logins: ['alice', 'bob']
  });
  assert.equal(badge.getCached('alice'), true);
  assert.equal(badge.getCached('bob'), false);
});


test('community lookup retries a missing background reply once', async () => {
  let calls = 0;
  const badge = createBadge(async () => ++calls === 1 ? null : { ok: true, data: ['alice'] }, (resolve) => { resolve(); return 1; });
  badge.enabled = true;
  badge.pendingLogins.add('alice');
  await badge.flushLookup();
  assert.equal(calls, 2);
  assert.equal(badge.getCached('alice'), true);
  assert.equal(badge.lookupRunning, false);
});

test('community lookup stops retrying when disabled during the delay', async () => {
  let calls = 0;
  let finishDelay;
  const badge = createBadge(async () => { calls++; return null; }, resolve => { finishDelay = resolve; return 1; });
  badge.enabled = true;
  badge.pendingLogins.add('alice');
  const pending = badge.flushLookup();
  await new Promise(setImmediate);
  badge.dispose();
  finishDelay();
  await pending;
  assert.equal(calls, 1);
  assert.equal(badge.cache.size, 0);
  assert.equal(badge.lookupRunning, false);
});


test('community lookup bounds retries and reports missing replies distinctly', async () => {
  let calls = 0;
  const warnings = [];
  const originalConsole = context.console;
  context.console = { warn: (...args) => warnings.push(args) };
  try {
    const badge = createBadge(async () => { calls++; return null; }, resolve => { resolve(); return 1; });
    badge.enabled = true;
    badge.pendingLogins.add('alice');
    await badge.flushLookup();
    assert.equal(calls, 2);
    assert.match(warnings[0][1].message, /background did not respond/);
    assert.equal(badge.lookupRunning, false);
  } finally { context.console = originalConsole; }
});

test('community waiting queue stays bounded while lookups are stalled', () => {
  const badge = createBadge(() => new Promise(() => {}));
  badge.enabled = true;
  badge.lookupRunning = true;
  badge.extractIdentity = message => ({ login: message.login });
  for (let index = 0; index < 20000; index++) {
    badge.processMessage({ login: `user${index}`, isConnected: true });
  }
  assert.equal(badge.waitingMessages.size, 200);
  assert.equal(badge.pendingLogins.size, 200);
  for (let index = 0; index < 2000; index++) {
    badge.processMessage({ login: 'repeat', isConnected: true });
  }
  assert.equal(badge.waitingMessages.get('repeat').size, 20);
  badge.dispose();
  assert.equal(badge.waitingMessages.size, 0);
  assert.equal(badge.pendingLogins.size, 0);
});

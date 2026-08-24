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

const createBadge = (sendExtensionMessage) => {
  const CommunityChatBadge = context.window.TFRCommunityChatBadge.create({
    documentRef: { querySelectorAll: () => [] },
    windowRef: { setTimeout: () => 1, clearTimeout: () => {} },
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

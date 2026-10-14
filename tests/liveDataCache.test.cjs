const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/liveDataCache.js'), 'utf8'), context);
const cache = context.window.TFRLiveDataCache;

test('workspace live refresh preserves entries belonging to other profiles', () => {
  const result = cache.mergeWorkspace({
    cache: { personal: { viewers: 100 }, shared: { viewers: 5 } },
    favorites: { shared: { login: 'shared' } },
    updates: { shared: { viewers: 7 } }
  });
  assert.equal(result.personal.viewers, 100);
  assert.equal(result.shared.viewers, 7);
});

test('workspace live refresh removes stale login and user-id aliases', () => {
  const result = cache.mergeWorkspace({
    cache: { oldname: { isLive: true }, '123': { isLive: true }, untouched: { isLive: true } },
    favorites: { oldname: { userId: '123' } },
    updates: { newname: { userId: '123', isLive: false } }
  });
  assert.equal(result.oldname, undefined);
  assert.equal(result['123'], undefined);
  assert.equal(result.untouched.isLive, true);
  assert.equal(result.newname.isLive, false);
});


test('startup discards yesterday and undated statuses but keeps recently confirmed data', () => {
  const now = 200000000;
  const result = cache.freshEntries({
    yesterday: { isLive: true, lastConfirmedAt: now - 86400000 },
    undated: { isLive: true },
    future: { isLive: true, lastConfirmedAt: now + 1 },
    recent: { isLive: true, lastConfirmedAt: now - 60000 },
    offline: { isLive: false, lastConfirmedAt: now - 1000 }
  }, now);
  assert.deepEqual(Object.keys(result).sort(), ['offline', 'recent']);
  assert.equal(result.recent.isLive, true);
  assert.equal(Object.keys(cache.freshEntries(result, now + 121000)).length, 0);
});

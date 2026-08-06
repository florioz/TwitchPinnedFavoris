const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/sidebarGroupModel.js'),
  'utf8'
), context);
const liveEntry = (liveData, favorite) => liveData[favorite.login] || {};
const model = context.window.TFRSidebarGroupModel.create({
  t: (key) => key,
  getLiveDataEntry: liveEntry,
  shouldDisplayFavorite: (_favorite, live) => Boolean(live.isLive),
  isValidColor: (color) => /^#[0-9a-f]{6}$/i.test(color || '')
});

test('sidebar group model preserves nesting and omits empty branches', () => {
  const state = {
    favorites: {
      one: { login: 'one', displayName: 'One', categories: ['child'] },
      offline: { login: 'offline', displayName: 'Offline', categories: ['empty'] }
    },
    preferences: {}
  };
  const categoryTree = [{
    id: 'root', name: 'Root', children: [
      { id: 'child', name: 'Child', children: [] },
      { id: 'empty', name: 'Empty', children: [] }
    ]
  }];
  const groups = model.collect({ state, categoryTree, liveData: { one: { isLive: true, viewers: 10 } } });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].children.length, 1);
  assert.equal(groups[0].children[0].entries[0].login, 'one');
});

test('sidebar group model adds recent and uncategorized virtual groups', () => {
  const now = Date.parse('2026-08-06T12:00:00Z');
  const state = {
    favorites: { one: { login: 'one', displayName: 'One', categories: [] } },
    preferences: {
      recentLiveEnabled: true,
      recentLiveThresholdMinutes: 10,
      specialCategoryColors: { recentLive: '#112233', uncategorized: 'invalid' }
    }
  };
  const liveData = { one: { isLive: true, viewers: 5, startedAt: '2026-08-06T11:55:00Z' } };
  const groups = model.collect({ state, liveData, categoryTree: [], now });
  assert.deepEqual(Array.from(groups, (group) => group.id), ['recentLive', 'uncategorized']);
  assert.equal(groups[0].color, '#112233');
  assert.equal(groups[1].color, '');
});

test('sidebar group sorting supports viewers, alphabet and added date', () => {
  const entries = [
    { login: 'a', displayName: 'Alpha', addedAt: 1 },
    { login: 'b', displayName: 'Beta', addedAt: 2 }
  ];
  const liveData = { a: { viewers: 20 }, b: { viewers: 10 } };
  assert.equal([...entries].sort(model.createComparator('viewersDesc', liveData))[0].login, 'a');
  assert.equal([...entries].reverse().sort(model.createComparator('alphabetical', liveData))[0].login, 'a');
  assert.equal([...entries].sort(model.createComparator('recent', liveData))[0].login, 'b');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/sharedWorkspaceIntegrity.js'),
  'utf8'
), context);
const integrity = context.window.TFRSharedWorkspaceIntegrity;

const clone = (value) => JSON.parse(JSON.stringify(value));
const createTarget = ({ remote = false, validSharedCategory = false } = {}) => {
  const personalFavorites = {
    alpha: { login: 'alpha', categories: ['personal_cat'] },
    beta: { login: 'beta', categories: [] }
  };
  const categories = [{ id: validSharedCategory ? 'personal_cat' : 'shared_cat' }];
  return {
    workspaceMode: 'shared',
    activeProfileId: 'profile_1',
    activeSharedSpaceId: 'space_1',
    personalWorkspaceSnapshot: {
      favorites: clone(personalFavorites),
      categories: [{ id: 'personal_cat' }]
    },
    favorites: clone(personalFavorites),
    categories,
    sharedSpaces: {
      space_1: {
        favorites: clone(personalFavorites),
        categories,
        syncState: remote ? 'synced' : 'local',
        remoteBacked: remote,
        revision: 2
      }
    }
  };
};

test('repairs a local shared workspace contaminated by personal categories', () => {
  const target = createTarget();
  assert.equal(integrity.repairPersonalFavoriteLeak(target, 1234), true);
  assert.equal(Object.keys(target.favorites).length, 0);
  assert.equal(Object.keys(target.sharedSpaces.space_1.favorites).length, 0);
  assert.equal(target.sharedSpaces.space_1.revision, 3);
  assert.equal(target.sharedSpaces.space_1.updatedAt, 1234);
});

test('preserves valid shared favorites and every remote workspace', () => {
  const valid = createTarget({ validSharedCategory: true });
  const remote = createTarget({ remote: true });
  assert.equal(integrity.repairPersonalFavoriteLeak(valid), false);
  assert.equal(integrity.repairPersonalFavoriteLeak(remote), false);
  assert.equal(Object.keys(valid.favorites).length, 2);
  assert.equal(Object.keys(remote.favorites).length, 2);
});

test('preserves lists that differ from the personal profile', () => {
  const target = createTarget();
  target.favorites.gamma = { login: 'gamma', categories: ['personal_cat'] };
  assert.equal(integrity.repairPersonalFavoriteLeak(target), false);
  assert.equal(Object.keys(target.favorites).length, 3);
});

test('favorite login comparison is order independent and rejects empty lists', () => {
  assert.equal(integrity.hasSameLogins({ beta: {}, alpha: {} }, { alpha: {}, beta: {} }), true);
  assert.equal(integrity.hasSameLogins({}, {}), false);
  assert.equal(integrity.hasSameLogins({ alpha: {} }, { beta: {} }), false);
});

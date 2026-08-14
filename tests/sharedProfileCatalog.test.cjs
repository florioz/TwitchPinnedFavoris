const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, structuredClone });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/sharedProfileCatalog.js'), 'utf8'), context);
const catalog = context.window.TFRSharedProfileCatalog;

test('shared profile catalog uses the captured personal workspace for its active profile', () => {
  const state = {
    workspaceMode: 'shared', activeProfileId: 'based',
    profiles: { based: { id: 'based', name: 'BASED', favorites: {} } },
    personalWorkspaceSnapshot: { activeProfileId: 'based', favorites: { one: {}, two: {} }, categories: [] }
  };
  assert.equal(catalog.list(state)[0].count, 2);
  assert.equal(Object.keys(catalog.resolve({
    profiles: state.profiles, personalSnapshot: state.personalWorkspaceSnapshot, workspaceMode: state.workspaceMode
  }, 'based').favorites).length, 2);
});

test('shared profile catalog leaves inactive profiles unchanged', () => {
  const state = {
    workspaceMode: 'shared', activeProfileId: 'based',
    profiles: { based: { id: 'based', name: 'BASED', favorites: {} }, other: { id: 'other', name: 'Other', favorites: { one: {} } } },
    personalWorkspaceSnapshot: { activeProfileId: 'based', favorites: { one: {}, two: {} } }
  };
  assert.equal(Object.keys(catalog.resolve({ profiles: state.profiles, personalSnapshot: state.personalWorkspaceSnapshot, workspaceMode: 'shared' }, 'other').favorites).length, 1);
});

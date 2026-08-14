const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/sharedWorkspaceTransitions.js'), 'utf8'
), context);
const transitions = context.window.TFRSharedWorkspaceTransitions;

test('empty shared workspace clears collaborative content without selecting a fake space', () => {
  const draft = { workspaceMode: 'personal', activeSharedSpaceId: 'missing', favorites: { one: {} }, categories: [{}] };
  transitions.enterEmptySharedWorkspace(draft);
  assert.equal(draft.workspaceMode, 'shared');
  assert.equal(draft.activeSharedSpaceId, '');
  assert.equal(Object.keys(draft.favorites).length, 0);
  assert.equal(draft.categories.length, 0);
});

test('removing a space activates the next shared space when one exists', () => {
  const draft = { sharedSpaces: { first: {}, second: {} } };
  let activated = '';
  assert.equal(transitions.removeSpace(draft, 'first', {
    applyShared: (_draft, id) => { activated = id; return true; }
  }), true);
  assert.equal(activated, 'second');
  assert.equal('first' in draft.sharedSpaces, false);
});

test('leaving the last space stays in an empty shared workspace', () => {
  const draft = { sharedSpaces: { only: {} }, favorites: { one: {} }, categories: [{}] };
  transitions.removeSpace(draft, 'only', { stayShared: true });
  assert.equal(draft.workspaceMode, 'shared');
  assert.equal(draft.activeSharedSpaceId, '');
  assert.equal(Object.keys(draft.favorites).length, 0);
});

test('deleting the last owned space restores the personal workspace', () => {
  const draft = { sharedSpaces: { only: {} } };
  let restored = false;
  transitions.removeSpace(draft, 'only', { applyPersonal: () => { restored = true; return true; } });
  assert.equal(restored, true);
});

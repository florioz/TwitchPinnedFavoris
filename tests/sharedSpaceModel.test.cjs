const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, structuredClone, Date, Math });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/sharedSpaceModel.js'), 'utf8'
), context);
const model = context.window.TFRSharedSpaceModel;

test('shared spaces always contain an owner and isolated collaborative data', () => {
  const favorites = { alpha: { login: 'alpha' } };
  const space = model.createSpace({ name: 'Equipe', favorites }, structuredClone);
  favorites.alpha.login = 'changed';
  assert.equal(space.members[0].role, 'owner');
  assert.equal(space.favorites.alpha.login, 'alpha');
});

test('shared-space roles expose bounded permissions', () => {
  const owner = model.createSpace({ name: 'Owner' }, structuredClone);
  assert.equal(model.getPermissions(owner).manageMembers, true);
  const viewer = model.createSpace({
    ownerId: 'owner', currentMemberId: 'viewer',
    members: [{ id: 'owner', role: 'owner' }, { id: 'viewer', role: 'viewer' }]
  }, structuredClone);
  assert.equal(model.getPermissions(viewer).edit, false);
  assert.equal(model.getPermissions(viewer).view, true);
  assert.equal(model.sanitizeRole('admin'), 'viewer');
});

test('shared-space sync states reject unknown remote values', () => {
  assert.equal(model.sanitizeSyncState('conflict'), 'conflict');
  assert.equal(model.sanitizeSyncState('unknown'), 'local');
});

test('remote-backed spaces remain distinguishable from unpublished local spaces', () => {
  assert.equal(model.createSpace({ id: 'local', syncState: 'local' }).remoteBacked, false);
  assert.equal(model.createSpace({ id: 'remote', syncState: 'synced', revision: 0 }).remoteBacked, true);
  assert.equal(model.createSpace({ id: 'cached', syncState: 'local', remoteBacked: true }).remoteBacked, true);
});

test('only the owner can delete a shared space', () => {
  const owner = model.createSpace({ ownerId: 'one', currentMemberId: 'one' }, structuredClone);
  const editor = model.createSpace({
    ownerId: 'one', currentMemberId: 'two',
    members: [{ id: 'one', role: 'owner' }, { id: 'two', role: 'editor' }]
  }, structuredClone);
  assert.equal(model.getPermissions(owner).delete, true);
  assert.equal(model.getPermissions(editor).delete, false);
});

test('shared-space exit action distinguishes deletion, remote leave and unavailable local leave', () => {
  const owner = model.createSpace({ ownerId: 'one', currentMemberId: 'one' }, structuredClone);
  const member = model.createSpace({
    ownerId: 'one', currentMemberId: 'two',
    members: [{ id: 'one', role: 'owner' }, { id: 'two', role: 'viewer' }]
  }, structuredClone);
  assert.deepEqual({ ...model.getExitAction(owner, { remote: true }) }, { type: 'delete', enabled: true });
  assert.deepEqual({ ...model.getExitAction(member, { remote: true }) }, { type: 'leave', enabled: true });
  assert.deepEqual({ ...model.getExitAction(member, { remote: false }) }, { type: 'leave', enabled: false });
  assert.deepEqual({ ...model.getExitAction(null) }, { type: 'none', enabled: false });
});

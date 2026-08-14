const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/sharedSpacesRemoteState.js'), 'utf8'
), context);

test('remote shared-space state loads account, spaces and invitations together', async () => {
  let changes = 0;
  const remote = context.window.TFRSharedSpacesRemoteState.create({
    client: {
      status: async () => ({ ok: true, data: { connected: true } }),
      listSpaces: async () => ({ ok: true, data: [{ id: 'space' }] }),
      listInvitations: async () => ({ ok: true, data: [{ id: 'invite' }] })
    },
    onChange: () => { changes += 1; }
  });
  const state = await remote.refresh();
  assert.equal(state.spaces[0].id, 'space');
  assert.equal(state.invitations[0].id, 'invite');
  assert.equal(changes, 1);
});

test('remote shared-space state clears private data after disconnect', async () => {
  const remote = context.window.TFRSharedSpacesRemoteState.create({
    client: { status: async () => ({ ok: true, data: { connected: false } }) }
  });
  const state = await remote.refresh();
  assert.equal(state.spaces.length, 0);
  assert.equal(state.invitations.length, 0);
});

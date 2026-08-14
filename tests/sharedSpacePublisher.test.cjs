const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/sharedSpacePublisher.js'), 'utf8'), context);
const publisherFactory = context.window.TFRSharedSpacePublisher;

test('publisher reuses an already remote space without creating it again', async () => {
  let creates = 0;
  const publisher = publisherFactory.create({
    client: { createSpace: async () => { creates += 1; } },
    store: {}, remoteState: { snapshot: () => ({ spaces: [{ id: 'remote' }] }) }
  });
  const result = await publisher.ensurePublished({ id: 'remote' });
  assert.equal(result.ok, true);
  assert.equal(result.published, false);
  assert.equal(creates, 0);
});

test('publisher replaces a local id after successful creation', async () => {
  let replacement = null; let refreshes = 0;
  const remote = { id: '83f2e91c-remote' };
  const publisher = publisherFactory.create({
    client: { createSpace: async () => ({ ok: true, data: remote }) },
    store: { replaceSharedSpaceId: async (...args) => { replacement = args; } },
    remoteState: { snapshot: () => ({ spaces: [] }), refresh: async () => { refreshes += 1; } }
  });
  const result = await publisher.ensurePublished({ id: 'space_local' });
  assert.equal(result.space.id, remote.id);
  assert.deepEqual(replacement.map((item) => item.id || item), ['space_local', remote.id]);
  assert.equal(refreshes, 1);
});

test('publisher forwards creation errors without mutating local state', async () => {
  let replaced = false;
  const publisher = publisherFactory.create({
    client: { createSpace: async () => ({ ok: false, message: 'network' }) },
    store: { replaceSharedSpaceId: async () => { replaced = true; } },
    remoteState: { snapshot: () => ({ spaces: [] }) }
  });
  const result = await publisher.ensurePublished({ id: 'space_local' });
  assert.equal(result.message, 'network');
  assert.equal(replaced, false);
});

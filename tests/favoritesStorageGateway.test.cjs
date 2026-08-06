const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = new Set();
const data = {};
const context = vm.createContext({
  window: {},
  chrome: {
    storage: {
      local: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, data[key]]));
        },
        set: async (values) => Object.assign(data, values)
      },
      onChanged: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener)
      }
    }
  }
});
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/favoritesStorageGateway.js'),
  'utf8'
), context);

test('favorites storage gateway reads and writes state through one boundary', async () => {
  const gateway = context.window.TFRFavoritesStorageGateway.create({ storageKey: 'state', liveCacheKey: 'live' });
  assert.equal(await gateway.writeState({ revision: 2 }), true);
  assert.equal((await gateway.readState()).revision, 2);
  assert.equal((await gateway.read()).state.revision, 2);
});

test('favorites storage gateway maps local storage changes and unsubscribes', () => {
  const gateway = context.window.TFRFavoritesStorageGateway.create({ storageKey: 'state', liveCacheKey: 'live' });
  let received;
  const unsubscribe = gateway.subscribe((value) => { received = value; });
  [...listeners][0]({ state: { newValue: { revision: 3 } }, live: { newValue: { foo: {} } } }, 'local');
  assert.equal(received.state.revision, 3);
  assert.equal(received.liveData.foo && typeof received.liveData.foo, 'object');
  unsubscribe();
  assert.equal(listeners.size, 0);
});

test('invalidated extension contexts are classified without hiding other errors', () => {
  const tools = context.window.TFRFavoritesStorageGateway;
  assert.equal(tools.isInvalidatedContextError(new Error('Extension context invalidated.')), true);
  assert.equal(tools.isInvalidatedContextError(new Error('quota exceeded')), false);
});

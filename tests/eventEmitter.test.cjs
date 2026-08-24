const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/eventEmitter.js'),
  'utf8'
), context);

test('event emitter subscribes, unsubscribes and clears listeners', () => {
  const calls = [];
  const emitter = context.window.TFREventEmitter.create();
  const unsubscribe = emitter.subscribe((...args) => calls.push(args));
  emitter.emit('state', 1);
  unsubscribe();
  emitter.emit('state', 2);
  assert.deepEqual(calls, [['state', 1]]);
  assert.equal(emitter.size, 0);
});

test('event emitter isolates listener failures', () => {
  const errors = [];
  let delivered = 0;
  const emitter = context.window.TFREventEmitter.create({ onListenerError: (error) => errors.push(error.message) });
  emitter.subscribe(() => { throw new Error('broken'); });
  emitter.subscribe(() => { delivered += 1; });
  emitter.emit();
  assert.deepEqual(errors, ['broken']);
  assert.equal(delivered, 1);
  emitter.clear();
  assert.equal(emitter.size, 0);
});

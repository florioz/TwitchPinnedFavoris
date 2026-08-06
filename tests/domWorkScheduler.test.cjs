const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let scheduled;
const cancelled = [];
const context = vm.createContext({
  window: {
    requestIdleCallback: (callback) => { scheduled = callback; return 7; },
    cancelIdleCallback: (handle) => cancelled.push(handle),
    setTimeout,
    clearTimeout
  }
});
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/domWorkScheduler.js'),
  'utf8'
), context);

test('DOM work scheduler deduplicates items and respects batch limits', () => {
  const processed = [];
  const scheduler = context.window.TFRDomWorkScheduler.create({
    process: (item) => processed.push(item),
    maxBatchSize: 2
  });
  const item = { id: 1 };
  scheduler.enqueue(item);
  scheduler.enqueue(item);
  scheduler.enqueue({ id: 2 });
  scheduler.enqueue({ id: 3 });
  assert.equal(scheduler.size, 3);
  scheduled({ didTimeout: true, timeRemaining: () => Infinity });
  assert.deepEqual(processed.map(({ id }) => id), [1, 2]);
  assert.equal(scheduler.size, 1);
  scheduler.flushNow();
  assert.equal(scheduler.size, 0);
});

test('DOM work scheduler cancels pending idle work when disposed', () => {
  const scheduler = context.window.TFRDomWorkScheduler.create({ process() {} });
  scheduler.enqueue({});
  scheduler.dispose();
  assert.deepEqual(cancelled.slice(-1), [7]);
  assert.equal(scheduler.size, 0);
});

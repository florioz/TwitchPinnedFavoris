const test = require('node:test');
const assert = require('node:assert/strict');
const { create, HEARTBEAT_INTERVAL_MS } = require('../src/contentScripts/features/usagePresence.js');

const createHarness = ({ visibilityState = 'visible', responses = [] } = {}) => {
  const listeners = new Map();
  const timers = [];
  const messages = [];
  const documentRef = {
    visibilityState,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type)
  };
  const UsagePresence = create({
    documentRef,
    setIntervalImpl: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearIntervalImpl: () => {},
    sendExtensionMessage: async (message) => {
      messages.push(message);
      return responses.shift() || { ok: false };
    }
  });
  return { documentRef, listeners, messages, presence: new UsagePresence(), timers };
};

test('usage presence starts one heartbeat and exposes the returned count', async () => {
  const harness = createHarness({ responses: [{ ok: true, data: { enabled: true, count: 42, updatedAt: 10 } }] });
  harness.presence.init();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, HEARTBEAT_INTERVAL_MS);
  assert.deepEqual(harness.messages[0], { type: 'TFR_USAGE_PRESENCE_REFRESH' });
  assert.equal(harness.presence.snapshot().count, 42);
  assert.equal(harness.presence.snapshot().status, 'ready');
});

test('hidden Twitch tabs skip scheduled heartbeats and refresh when visible again', async () => {
  const harness = createHarness({ visibilityState: 'hidden', responses: [{ ok: true, data: { enabled: true, count: 5 } }] });
  harness.presence.init();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.messages.length, 0);

  harness.documentRef.visibilityState = 'visible';
  harness.listeners.get('visibilitychange')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.messages.length, 1);
  assert.equal(harness.presence.snapshot().count, 5);
});

test('privacy preference is forwarded to the background service', async () => {
  const harness = createHarness({ responses: [{ ok: true, data: { enabled: false, count: 7 } }] });
  await harness.presence.setEnabled(false);
  assert.deepEqual(harness.messages[0], { type: 'TFR_USAGE_PRESENCE_SET_ENABLED', enabled: false });
  assert.equal(harness.presence.snapshot().enabled, false);
  assert.equal(harness.presence.snapshot().count, 7);
});

test('a failed privacy update leaves the counter in an available error state', async () => {
  const listeners = new Map();
  const UsagePresence = create({
    documentRef: {
      visibilityState: 'visible',
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type)
    },
    setIntervalImpl: () => 0,
    clearIntervalImpl: () => {},
    sendExtensionMessage: async () => { throw new Error('context unavailable'); }
  });
  const presence = new UsagePresence();
  await presence.setEnabled(false);
  assert.equal(presence.snapshot().status, 'unavailable');
});

test('initialization stays idempotent even when the browser returns timer ID zero', () => {
  let intervalCount = 0;
  const UsagePresence = create({
    documentRef: { visibilityState: 'hidden', addEventListener: () => {}, removeEventListener: () => {} },
    setIntervalImpl: () => { intervalCount += 1; return 0; },
    clearIntervalImpl: () => {},
    sendExtensionMessage: async () => ({ ok: false })
  });
  const presence = new UsagePresence();
  presence.init();
  presence.init();
  assert.equal(intervalCount, 1);
});

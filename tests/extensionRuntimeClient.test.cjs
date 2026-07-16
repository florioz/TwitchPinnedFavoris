const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createExtensionRuntimeClient,
  isInvalidatedContext
} = require('../src/contentScripts/extensionRuntimeClient.js');

test('runtime client sends named panel messages', async () => {
  const payloads = [];
  const runtime = {
    lastError: null,
    sendMessage(payload, callback) {
      payloads.push(payload);
      callback({ ok: true });
    }
  };
  const client = createExtensionRuntimeClient({ runtime });

  await client.getSnapshot(true);
  await client.dismissToast('streamer', 'streamer:key');
  await client.openChannel('streamer');

  assert.deepEqual(payloads, [
    { type: 'TFR_GET_POPUP_STATE', forceRefresh: true },
    {
      type: 'TFR_DISMISS_LIVE_TOAST',
      login: 'streamer',
      notificationKey: 'streamer:key'
    },
    { type: 'TFR_OPEN_CHANNEL_TAB', login: 'streamer' }
  ]);
});

test('invalidated extension context resolves silently', async () => {
  let warnings = 0;
  const runtime = {
    lastError: { message: 'Extension context invalidated.' },
    sendMessage(_payload, callback) {
      callback();
    }
  };
  const client = createExtensionRuntimeClient({
    runtime,
    logger: { warn: () => { warnings += 1; } }
  });

  assert.equal(await client.getSnapshot(), null);
  assert.equal(warnings, 0);
  assert.equal(isInvalidatedContext(runtime.lastError), true);
});

test('unexpected runtime errors are logged and resolve null', async () => {
  let warnings = 0;
  const runtime = {
    lastError: { message: 'Unexpected failure' },
    sendMessage(_payload, callback) {
      callback();
    }
  };
  const client = createExtensionRuntimeClient({
    runtime,
    logger: { warn: () => { warnings += 1; } }
  });
  assert.equal(await client.send({ type: 'TEST' }), null);
  assert.equal(warnings, 1);
});

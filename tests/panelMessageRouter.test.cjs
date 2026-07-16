const test = require('node:test');
const assert = require('node:assert/strict');

const { createPanelMessageRouter } = require('../src/contentScripts/panelMessageRouter.js');

test('router handles panel toggle and state pushes', () => {
  const calls = [];
  const router = createPanelMessageRouter({
    togglePanel: () => calls.push('toggle'),
    renderSnapshot: (snapshot) => calls.push(`render:${snapshot.timestamp}`),
    displayToast: () => true
  });

  assert.equal(router({ type: 'TFR_TOGGLE_PANEL' }), false);
  assert.equal(router({ type: 'TFR_STATE_PUSH', timestamp: 123 }), false);
  assert.deepEqual(calls, ['toggle', 'render:123']);
});

test('router maps toast options and responds with delivery status', () => {
  let received;
  let response;
  const router = createPanelMessageRouter({
    togglePanel() {},
    renderSnapshot() {},
    displayToast: (entries, options) => {
      received = { entries, options };
      return true;
    }
  });
  const result = router({
    type: 'TFR_OVERLAY_TOAST',
    entries: [{ login: 'one' }],
    force: true,
    showToast: false,
    playSound: true,
    soundId: 'chime',
    soundVolume: 50,
    customSoundDataUrl: 'data:test'
  }, null, (value) => {
    response = value;
  });

  assert.equal(result, true);
  assert.deepEqual(response, { ok: true });
  assert.equal(received.options.force, true);
  assert.equal(received.options.soundId, 'chime');
});

test('router ignores unknown or empty messages', () => {
  const router = createPanelMessageRouter({
    togglePanel() {
      throw new Error('should not run');
    },
    renderSnapshot() {},
    displayToast() {}
  });
  assert.equal(router(null), false);
  assert.equal(router({ type: 'UNKNOWN' }), false);
});

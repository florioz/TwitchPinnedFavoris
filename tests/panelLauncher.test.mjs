import test from 'node:test';
import assert from 'node:assert/strict';

import { createPanelLauncher } from '../src/background/panelLauncher.mjs';

test('panel launcher prefers the Chromium side panel', async () => {
  const calls = [];
  const launcher = createPanelLauncher({
    extensionApi: {
      sidePanel: { open: async (options) => calls.push(['chromium', options]) },
      sidebarAction: { toggle: async () => calls.push(['firefox']) }
    },
    sendMessageToTab: async () => ({ ok: true })
  });

  assert.equal(await launcher.open({ id: 4, windowId: 7 }), true);
  assert.deepEqual(calls, [['chromium', { windowId: 7 }]]);
});

test('panel launcher uses the global Firefox sidebar when sidePanel is unavailable', async () => {
  const calls = [];
  const launcher = createPanelLauncher({
    extensionApi: { sidebarAction: { toggle: async () => calls.push('firefox') } },
    sendMessageToTab: async () => {
      calls.push('injected');
      return { ok: true };
    }
  });

  assert.equal(await launcher.open({ id: 9 }), true);
  assert.deepEqual(calls, ['firefox']);
});

test('panel launcher keeps the Twitch injected panel as a compatibility fallback', async () => {
  const messages = [];
  const launcher = createPanelLauncher({
    extensionApi: {},
    sendMessageToTab: async (tabId, message) => {
      messages.push([tabId, message]);
      return { ok: true };
    }
  });

  assert.equal(await launcher.open({ id: 12 }), true);
  assert.deepEqual(messages, [[12, { type: 'TFR_TOGGLE_PANEL' }]]);
});

test('panel launcher refuses to target an invalid tab', async () => {
  const launcher = createPanelLauncher({
    extensionApi: { sidebarAction: { toggle: async () => {} } },
    sendMessageToTab: async () => ({ ok: true })
  });

  assert.equal(await launcher.open(null), false);
});

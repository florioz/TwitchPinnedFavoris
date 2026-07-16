import test from 'node:test';
import assert from 'node:assert/strict';

import { createBadgeManager } from '../src/background/badgeManager.mjs';

test('update badge takes priority and live count returns afterwards', async () => {
  const texts = [];
  const manager = createBadgeManager({
    actionApi: {
      setBadgeText: async ({ text }) => texts.push(text),
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {}
    }
  });

  await manager.setLiveCount(7);
  await manager.setUpdateAvailable(true);
  await manager.setLiveCount(8);
  await manager.setUpdateAvailable(false);

  assert.deepEqual(texts, ['7', '!', '!', '8']);
  assert.equal(manager.getUpdateAvailable(), false);
});

test('live badge count is capped at 99', async () => {
  let text;
  const manager = createBadgeManager({
    actionApi: {
      setBadgeText: async (value) => {
        text = value.text;
      }
    }
  });

  await manager.setLiveCount(150);
  assert.equal(text, '99');
});

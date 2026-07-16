import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildToastEntries,
  createLiveNotificationService
} from '../src/background/liveNotificationService.mjs';

const candidate = (login) => ({
  login,
  notificationKey: `${login}:stream`,
  fav: { login, displayName: login, avatarUrl: `${login}.png` },
  live: {
    login,
    displayName: login,
    avatarUrl: `${login}.png`,
    viewers: 10,
    game: 'Game',
    title: 'Title',
    streamId: 'stream',
    startedAt: '2026-07-16T10:00:00.000Z'
  }
});

test('toast formatting limits entries and removes unrelated favorite fields', () => {
  const first = candidate('first');
  first.fav.privateField = 'hidden';
  const result = buildToastEntries([first, candidate('second'), candidate('third')], 2);

  assert.equal(result.length, 2);
  assert.equal(result[0].toast.fav.privateField, undefined);
  assert.equal(result[1].toast.login, 'second');
});

test('notification service returns only entries delivered to a recipient', async () => {
  let payload;
  const service = createLiveNotificationService({
    storage: { get: async () => ({}), set: async () => {} },
    notifiedStreamsKey: 'notified',
    broadcastToast: async (entries, options) => {
      payload = { entries, options };
      return true;
    }
  });

  const sent = await service.notify([candidate('first')], {
    toastEnabled: true,
    toastSoundEnabled: true,
    toastSoundId: 'chime'
  });

  assert.equal(sent.length, 1);
  assert.equal(payload.entries[0].login, 'first');
  assert.equal(payload.options.playSound, true);
  assert.equal(payload.options.soundId, 'chime');
});

test('handled notification is merged into persisted state', async () => {
  let saved;
  const service = createLiveNotificationService({
    storage: {
      get: async () => ({ notified: { existing: { key: 'existing:key' } } }),
      set: async (value) => {
        saved = value;
      }
    },
    notifiedStreamsKey: 'notified',
    broadcastToast: async () => false,
    now: () => 1234
  });

  await service.markHandled('new', 'new:key');

  assert.equal(saved.notified.existing.key, 'existing:key');
  assert.deepEqual(saved.notified.new, { key: 'new:key', notifiedAt: 1234 });
});

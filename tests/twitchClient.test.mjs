import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTwitchClient,
  mapWithConcurrency,
  parseStreamerLivePayload
} from '../src/background/twitchClient.mjs';

test('Twitch payload is normalized into live data', () => {
  const result = parseStreamerLivePayload('Example', {
    data: {
      user: {
        login: 'Example',
        displayName: 'Example TV',
        profileImageURL: 'https://example.test/avatar.png',
        stream: {
          id: 'stream-42',
          title: 'Test stream',
          viewersCount: 123,
          createdAt: '2026-07-16T10:00:00.000Z',
          game: { name: 'Just Chatting' }
        }
      }
    }
  });

  assert.deepEqual(result, {
    login: 'example',
    displayName: 'Example TV',
    avatarUrl: 'https://example.test/avatar.png',
    isLive: true,
    streamId: 'stream-42',
    viewers: 123,
    title: 'Test stream',
    game: 'Just Chatting',
    startedAt: '2026-07-16T10:00:00.000Z',
    fetchFailed: false
  });
});

test('Twitch client preserves known live data when the request fails', async () => {
  const client = createTwitchClient({
    fetchImpl: async () => ({ ok: false, status: 503 }),
    logger: { debug() {} }
  });
  const fallback = {
    login: 'example',
    displayName: 'Example TV',
    isLive: true,
    streamId: 'stream-42',
    viewers: 123
  };

  const result = await client.fetchStreamerLiveData('example', fallback);

  assert.equal(result.isLive, true);
  assert.equal(result.streamId, 'stream-42');
  assert.equal(result.fetchFailed, true);
});

test('concurrency mapper preserves input order and isolates failures', async () => {
  const results = await mapWithConcurrency([3, 1, 2], 2, async (value) => {
    if (value === 1) {
      throw new Error('expected failure');
    }
    return value * 2;
  });

  assert.equal(results[0].value, 6);
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[2].value, 4);
});

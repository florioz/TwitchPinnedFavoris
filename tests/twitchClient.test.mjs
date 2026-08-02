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
        id: 'user-7',
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

  const { lastConfirmedAt, ...normalizedResult } = result;
  assert.equal(Number.isFinite(lastConfirmedAt), true);
  assert.deepEqual(normalizedResult, {
    userId: 'user-7',
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

test('Twitch client resolves a known favorite by stable user id', async () => {
  let requestBody;
  const client = createTwitchClient({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            data: {
              user: {
                id: 'user-7',
                login: 'new_name',
                displayName: 'New Name',
                profileImageURL: 'avatar.png',
                stream: null
              }
            }
          };
        }
      };
    }
  });

  const result = await client.fetchStreamerLiveData('old_name', { userId: 'user-7' });

  assert.deepEqual(requestBody.variables, { login: null, userId: 'user-7' });
  assert.equal(result.userId, 'user-7');
  assert.equal(result.login, 'new_name');
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
    viewers: 123,
    lastConfirmedAt: Date.now()
  };

  const result = await client.fetchStreamerLiveData('example', fallback);

  assert.equal(result.isLive, true);
  assert.equal(result.streamId, 'stream-42');
  assert.equal(result.fetchFailed, true);
});

test('Twitch client expires stale live data when requests keep failing', async () => {
  const client = createTwitchClient({
    fetchImpl: async () => ({ ok: false, status: 503 }),
    logger: { debug() {} }
  });
  const result = await client.fetchStreamerLiveData('example', {
    login: 'example',
    isLive: true,
    streamId: 'old-stream',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastConfirmedAt: Date.now() - 6 * 60 * 1000
  });

  assert.equal(result.isLive, false);
  assert.equal(result.startedAt, null);
  assert.equal(result.fetchFailed, true);
});

test('a successful Twitch response with no matching user clears stale live data', () => {
  const result = parseStreamerLivePayload('old_name', { data: { user: null } }, {
    login: 'old_name',
    isLive: true,
    startedAt: '2026-01-01T00:00:00.000Z',
    lastConfirmedAt: Date.now()
  });

  assert.equal(result.isLive, false);
  assert.equal(result.startedAt, null);
  assert.equal(result.userNotFound, true);
  assert.equal(result.fetchFailed, false);
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

test('concurrency mapper can pace work between successive items', async () => {
  const scheduledDelays = [];
  const results = await mapWithConcurrency(
    [1, 2, 3, 4],
    2,
    async (value) => value,
    {
      pacingMs: 90,
      schedule: async (delay) => scheduledDelays.push(delay)
    }
  );

  assert.deepEqual(results.map((entry) => entry.value), [1, 2, 3, 4]);
  assert.deepEqual(scheduledDelays, [90, 90]);
});

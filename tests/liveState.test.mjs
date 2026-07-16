import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanupNotifiedStreams,
  createLiveDataSignature,
  deriveLiveEvaluation,
  getNotificationKey,
  isRecentLiveStart,
  shouldDisplayFavorite
} from '../src/background/liveState.mjs';

test('notification key remains stable for the same Twitch stream', () => {
  const live = {
    isLive: true,
    streamId: 'stream-123',
    startedAt: '2026-07-16T10:00:00.000Z'
  };

  assert.equal(getNotificationKey('streamer', live), 'streamer:stream-123');
  assert.equal(getNotificationKey('streamer', { ...live, viewers: 500 }), 'streamer:stream-123');
});

test('notification cleanup keeps only the matching active stream', () => {
  const now = Date.parse('2026-07-16T10:05:00.000Z');
  const liveData = {
    current: { isLive: true, streamId: 'one' },
    restarted: { isLive: true, streamId: 'new' },
    offline: { isLive: false }
  };
  const notifiedStreams = {
    current: { key: 'current:one', notifiedAt: now - 60_000 },
    restarted: { key: 'restarted:old', notifiedAt: now - 60_000 },
    offline: { key: 'offline:last', notifiedAt: now - 60_000 }
  };

  assert.deepEqual(cleanupNotifiedStreams(notifiedStreams, liveData, now), {
    current: notifiedStreams.current
  });
});

test('recent live detection respects the configured time window', () => {
  const now = Date.parse('2026-07-16T10:10:00.000Z');

  assert.equal(
    isRecentLiveStart(
      { isLive: true, startedAt: '2026-07-16T10:03:00.000Z' },
      { recentLiveThresholdMinutes: 10 },
      now
    ),
    true
  );
  assert.equal(
    isRecentLiveStart(
      { isLive: true, startedAt: '2026-07-16T09:59:00.000Z' },
      { recentLiveThresholdMinutes: 10 },
      now
    ),
    false
  );
});

test('live data signature ignores object insertion order', () => {
  const first = {
    alpha: { isLive: true, streamId: '1', viewers: 20 },
    beta: { isLive: false }
  };
  const second = {
    beta: { isLive: false },
    alpha: { isLive: true, streamId: '1', viewers: 20 }
  };

  assert.equal(createLiveDataSignature(first), createLiveDataSignature(second));
});

test('category filter is accent-insensitive and excludes another category', () => {
  const favorite = {
    categoryFilter: {
      enabled: true,
      categories: ['Pokémon']
    }
  };

  assert.equal(shouldDisplayFavorite(favorite, { isLive: true, game: 'Pokemon' }), true);
  assert.equal(shouldDisplayFavorite(favorite, { isLive: true, game: 'Just Chatting' }), false);
});

test('evaluation selects only new recent lives matching their filters', () => {
  const now = Date.parse('2026-07-16T10:10:00.000Z');
  const favorites = {
    fresh: { login: 'fresh', recentHighlightEnabled: true },
    duplicate: { login: 'duplicate', recentHighlightEnabled: true },
    filtered: {
      login: 'filtered',
      recentHighlightEnabled: true,
      categoryFilter: { enabled: true, categories: ['Music'] }
    },
    old: { login: 'old', recentHighlightEnabled: true }
  };
  const liveData = {
    fresh: {
      login: 'fresh',
      isLive: true,
      streamId: 'fresh-stream',
      startedAt: '2026-07-16T10:05:00.000Z'
    },
    duplicate: {
      login: 'duplicate',
      isLive: true,
      streamId: 'same-stream',
      startedAt: '2026-07-16T10:05:00.000Z'
    },
    filtered: {
      login: 'filtered',
      isLive: true,
      streamId: 'filtered-stream',
      game: 'Just Chatting',
      startedAt: '2026-07-16T10:05:00.000Z'
    },
    old: {
      login: 'old',
      isLive: true,
      streamId: 'old-stream',
      startedAt: '2026-07-16T09:30:00.000Z'
    }
  };

  const result = deriveLiveEvaluation({
    favorites,
    liveData,
    previousNotifiedStreams: {
      duplicate: { key: 'duplicate:same-stream', notifiedAt: now - 60_000 }
    },
    preferences: { recentLiveThresholdMinutes: 10 },
    now
  });

  assert.deepEqual(
    result.currentlyLive.map(({ fav }) => fav.login),
    ['fresh', 'duplicate', 'old']
  );
  assert.deepEqual(
    result.notificationCandidates.map(({ login }) => login),
    ['fresh']
  );
});

test('installation evaluation never creates notification candidates', () => {
  const result = deriveLiveEvaluation({
    favorites: { example: { login: 'example' } },
    liveData: {
      example: {
        login: 'example',
        isLive: true,
        streamId: 'stream',
        startedAt: '2026-07-16T10:05:00.000Z'
      }
    },
    reason: 'install',
    now: Date.parse('2026-07-16T10:10:00.000Z')
  });

  assert.equal(result.currentlyLive.length, 1);
  assert.equal(result.notificationCandidates.length, 0);
});

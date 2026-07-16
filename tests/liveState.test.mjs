import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanupNotifiedStreams,
  createLiveDataSignature,
  getNotificationKey,
  isRecentLiveStart
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

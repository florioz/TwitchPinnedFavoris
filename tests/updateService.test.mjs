import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canShowUpdate,
  createUpdateService,
  isVersionNewer,
  normalizeVersion
} from '../src/background/updateService.mjs';

test('versions are normalized and compared component by component', () => {
  assert.equal(normalizeVersion(' v1.2.3 '), '1.2.3');
  assert.equal(isVersionNewer('1.10.0', '1.9.9'), true);
  assert.equal(isVersionNewer('1.2.0', '1.2'), false);
});

test('dismissed and snoozed releases do not show an update badge', () => {
  const now = 10_000;
  assert.equal(canShowUpdate({ latestVersion: '2.0.0' }, '1.0.0', now), true);
  assert.equal(
    canShowUpdate({ latestVersion: '2.0.0', dismissedVersion: '2.0.0' }, '1.0.0', now),
    false
  );
  assert.equal(
    canShowUpdate({ latestVersion: '2.0.0', snoozeUntil: now + 1 }, '1.0.0', now),
    false
  );
});

test('cached update state avoids a network request', async () => {
  let fetches = 0;
  let badge;
  const service = createUpdateService({
    storage: {
      get: async () => ({ update: { latestVersion: '2.0.0', lastCheck: 9_500 } }),
      set: async () => {}
    },
    storageKey: 'update',
    apiUrl: 'https://example.test/latest',
    repoUrl: 'https://example.test/repo',
    currentVersion: '1.0.0',
    checkIntervalMs: 1_000,
    setBadgeAvailable: async (value) => {
      badge = value;
    },
    fetchImpl: async () => {
      fetches += 1;
    },
    now: () => 10_000
  });

  const state = await service.check(false);
  assert.equal(state.latestVersion, '2.0.0');
  assert.equal(fetches, 0);
  assert.equal(badge, true);
});

test('new remote release resets dismissal and stores release details', async () => {
  let saved;
  let badge;
  const service = createUpdateService({
    storage: {
      get: async () => ({
        update: {
          latestVersion: '1.5.0',
          dismissedVersion: '1.5.0',
          snoozeUntil: 20_000
        }
      }),
      set: async (value) => {
        saved = value;
      }
    },
    storageKey: 'update',
    apiUrl: 'https://example.test/latest',
    repoUrl: 'https://example.test/repo',
    currentVersion: '1.0.0',
    checkIntervalMs: 1_000,
    setBadgeAvailable: async (value) => {
      badge = value;
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v2.0.0',
        html_url: 'https://example.test/release',
        body: ' Notes '
      })
    }),
    now: () => 10_000
  });

  const state = await service.check(true);
  assert.equal(state.latestVersion, '2.0.0');
  assert.equal(state.dismissedVersion, null);
  assert.equal(state.snoozeUntil, null);
  assert.equal(saved.update.releaseNotes, 'Notes');
  assert.equal(badge, true);
});

test('network errors preserve the previous state and badge', async () => {
  let badge;
  const previous = { latestVersion: '2.0.0', lastCheck: 1 };
  const service = createUpdateService({
    storage: {
      get: async () => ({ update: previous }),
      set: async () => {
        throw new Error('should not save');
      }
    },
    storageKey: 'update',
    apiUrl: 'https://example.test/latest',
    repoUrl: 'https://example.test/repo',
    currentVersion: '1.0.0',
    checkIntervalMs: 1,
    setBadgeAvailable: async (value) => {
      badge = value;
    },
    fetchImpl: async () => {
      throw new Error('offline');
    },
    now: () => 10_000,
    logger: { warn() {} }
  });

  assert.equal(await service.check(true), previous);
  assert.equal(badge, true);
});

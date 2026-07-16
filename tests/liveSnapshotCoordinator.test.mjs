import test from 'node:test';
import assert from 'node:assert/strict';

import { createLiveSnapshotCoordinator } from '../src/background/liveSnapshotCoordinator.mjs';

test('fresh memory snapshot is returned without storage or network work', async () => {
  let clock = 1_000;
  let storageReads = 0;
  let refreshes = 0;
  const coordinator = createLiveSnapshotCoordinator({
    cacheTtlMs: 500,
    now: () => clock,
    loadCachedSnapshot: async () => {
      storageReads += 1;
      return { source: 'storage' };
    },
    refreshSnapshot: async () => {
      refreshes += 1;
      return { source: 'network' };
    }
  });

  assert.deepEqual(await coordinator.evaluate('startup'), { source: 'network' });
  clock += 100;
  assert.deepEqual(await coordinator.ensure(false), { source: 'network' });
  assert.equal(storageReads, 0);
  assert.equal(refreshes, 1);
});

test('stale request returns storage immediately and refreshes in background', async () => {
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => {
    releaseRefresh = resolve;
  });
  const coordinator = createLiveSnapshotCoordinator({
    cacheTtlMs: 500,
    loadCachedSnapshot: async () => ({ source: 'storage' }),
    refreshSnapshot: async () => {
      await refreshGate;
      return { source: 'network' };
    }
  });

  assert.deepEqual(await coordinator.ensure(false), { source: 'storage' });
  releaseRefresh();
  await coordinator.evaluate('manual');
  assert.deepEqual(coordinator.getCachedSnapshot(), { source: 'network' });
});

test('concurrent forced refreshes share one evaluation', async () => {
  let refreshes = 0;
  const coordinator = createLiveSnapshotCoordinator({
    cacheTtlMs: 500,
    loadCachedSnapshot: async () => ({ source: 'storage' }),
    refreshSnapshot: async () => {
      refreshes += 1;
      await Promise.resolve();
      return { source: 'network' };
    }
  });

  const [first, second] = await Promise.all([
    coordinator.ensure(true),
    coordinator.ensure(true)
  ]);

  assert.deepEqual(first, { source: 'network' });
  assert.deepEqual(second, { source: 'network' });
  assert.equal(refreshes, 1);
});

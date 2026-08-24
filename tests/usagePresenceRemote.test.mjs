import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createUsagePresenceRemote } from '../src/background/usagePresenceRemote.mjs';

const createStorage = (initial = {}) => {
  const values = { ...initial };
  return {
    values,
    get: async (key) => ({ [key]: values[key] }),
    set: async (patch) => Object.assign(values, patch)
  };
};

const createService = ({ initial, responses = [1], environment = 'development', now = Date.now } = {}) => {
  const storage = createStorage(initial);
  const calls = [];
  const extensionApi = {
    runtime: { id: 'extension-dev', getManifest: () => ({ version: '1.2.3' }) },
    storage: { local: storage }
  };
  const service = createUsagePresenceRemote({
    extensionApi,
    config: { supabaseUrl: 'https://example.supabase.co', publishableKey: 'public-key' },
    isConfigured: () => true,
    cryptoImpl: { subtle: webcrypto.subtle, randomUUID: () => 'installation-1' },
    environment,
    now,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => responses[calls.length - 1] ?? 0 };
    }
  });
  return { calls, service, storage };
};

test('presence refresh creates one local installation ID and sends only its SHA-256 hash', async () => {
  const { calls, service, storage } = createService({ responses: [12, 13] });
  const firstResult = await service.refresh();
  assert.equal(firstResult.enabled, true);
  assert.equal(firstResult.count, 12);
  assert.equal(typeof firstResult.updatedAt, 'number');
  await service.refresh({ force: true });

  assert.equal(storage.values.tfr_usage_presence_installation_id, 'installation-1');
  assert.equal(calls[0].body.target_installation_hash.length, 64);
  assert.notEqual(calls[0].body.target_installation_hash, 'installation-1');
  assert.equal(calls[0].body.target_extension_version, '1.2.3');
  assert.equal(calls[0].body.target_extension_environment, 'development');
  assert.equal(calls[0].body.target_installation_hash, calls[1].body.target_installation_hash);
});

test('presence refresh deduplicates simultaneous tabs and caches the recent result', async () => {
  let currentTime = 1_000;
  const { calls, service } = createService({ responses: [21, 22], now: () => currentTime });
  const [first, second] = await Promise.all([service.refresh(), service.refresh()]);
  assert.equal(first.count, 21);
  assert.equal(second.count, 21);
  assert.equal(calls.length, 1);

  assert.equal((await service.refresh()).count, 21);
  assert.equal(calls.length, 1);
  currentTime += 45_001;
  assert.equal((await service.refresh()).count, 22);
  assert.equal(calls.length, 2);
});

test('disabled presence reads the public count without creating an installation ID', async () => {
  const { calls, service, storage } = createService({
    initial: { tfr_usage_presence_enabled: false },
    responses: [8]
  });
  const result = await service.refresh();
  assert.equal(result.enabled, false);
  assert.equal(result.count, 8);
  assert.equal(storage.values.tfr_usage_presence_installation_id, undefined);
  assert.match(calls[0].url, /tfr_get_extension_presence_count$/);
});

test('disabling presence removes the existing anonymous hash then refreshes the count', async () => {
  const { calls, service, storage } = createService({
    initial: { tfr_usage_presence_installation_id: 'installation-1' },
    responses: [true, 7]
  });
  const result = await service.setEnabled(false);
  assert.equal(result.enabled, false);
  assert.equal(result.count, 7);
  assert.equal(storage.values.tfr_usage_presence_enabled, false);
  assert.match(calls[0].url, /tfr_remove_extension_presence$/);
  assert.match(calls[1].url, /tfr_get_extension_presence_count$/);
});

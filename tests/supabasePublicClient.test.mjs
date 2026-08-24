import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabasePublicClient } from '../src/background/supabasePublicClient.mjs';

const createClient = (fetchImpl, overrides = {}) => createSupabasePublicClient({
  config: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'public-key' },
  isConfigured: () => true,
  fetchImpl,
  ...overrides
});

test('public Supabase RPC sends only the publishable key and JSON payload', async () => {
  const calls = [];
  const client = createClient(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ value: 1 }) };
  });

  assert.deepEqual(await client.rpc('public_function', { input: 'value' }), { value: 1 });
  assert.equal(calls[0].url, 'https://project.supabase.co/rest/v1/rpc/public_function');
  assert.equal(calls[0].options.headers.apikey, 'public-key');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].options.body), { input: 'value' });
});

test('public Supabase client accepts empty successful responses', async () => {
  const client = createClient(async () => ({ ok: true, status: 204 }));
  assert.equal(await client.request('resource', { method: 'DELETE' }), null);
});

test('public Supabase client exposes server errors consistently', async () => {
  const client = createClient(async () => ({
    ok: false,
    status: 429,
    json: async () => ({ message: 'rate_limited' })
  }));
  await assert.rejects(() => client.rpc('public_function'), /rate_limited/);
});

test('public Supabase client rejects missing configuration before fetching', async () => {
  let fetchCalled = false;
  const client = createClient(async () => { fetchCalled = true; }, {
    isConfigured: () => false,
    notConfiguredMessage: 'custom configuration error'
  });
  await assert.rejects(() => client.rpc('public_function'), /custom configuration error/);
  assert.equal(fetchCalled, false);
});

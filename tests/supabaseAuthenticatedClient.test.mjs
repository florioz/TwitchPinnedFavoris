import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAuthenticatedClient } from '../src/background/supabaseAuthenticatedClient.mjs';

const response = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload
});

const createClient = ({ fetchImpl, getSession, refreshSession, ...overrides }) => (
  createSupabaseAuthenticatedClient({
    config: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'public-key' },
    isConfigured: () => true,
    fetchImpl,
    getSession: getSession || (async () => ({ accessToken: 'session-token' })),
    refreshSession: refreshSession || (async () => null),
    ...overrides
  })
);

test('authenticated Supabase RPC sends the session token and representation preference', async () => {
  const calls = [];
  const client = createClient({
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ ok: true }); }
  });
  await client.rpc('private_function', { value: 1 });
  assert.equal(calls[0].options.headers.Authorization, 'Bearer session-token');
  assert.equal(calls[0].options.headers.Prefer, 'return=representation');
  assert.deepEqual(JSON.parse(calls[0].options.body), { value: 1 });
});

test('authenticated Supabase client refreshes once after a 401 response', async () => {
  const calls = [];
  let refreshCount = 0;
  const client = createClient({
    refreshSession: async () => { refreshCount += 1; return { accessToken: 'refreshed-token' }; },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1 ? response({ message: 'expired' }, 401) : response(['space']);
    }
  });
  assert.deepEqual(await client.rpc('private_function'), ['space']);
  assert.equal(refreshCount, 1);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer refreshed-token');
});

test('explicit tokens are never refreshed implicitly', async () => {
  let refreshCount = 0;
  const client = createClient({
    refreshSession: async () => { refreshCount += 1; return { accessToken: 'refreshed-token' }; },
    fetchImpl: async () => response({ message: 'expired' }, 401)
  });
  await assert.rejects(() => client.request('resource', { token: 'explicit-token' }), /expired/);
  assert.equal(refreshCount, 0);
});

test('authenticated Supabase client fails before fetching without a session', async () => {
  let fetchCalled = false;
  const client = createClient({
    getSession: async () => null,
    fetchImpl: async () => { fetchCalled = true; return response({}); },
    missingSessionMessage: 'connect first'
  });
  await assert.rejects(() => client.rpc('private_function'), /connect first/);
  assert.equal(fetchCalled, false);
});

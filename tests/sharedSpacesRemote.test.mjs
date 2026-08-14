import test from 'node:test';
import assert from 'node:assert/strict';
import { SHARED_SPACES_CONFIG, isSharedSpacesRemoteConfigured } from '../src/background/sharedSpacesConfig.mjs';
import { createSharedSpacesRemote } from '../src/background/sharedSpacesRemote.mjs';

test('shared spaces remote stays disabled without public configuration', () => {
  assert.equal(isSharedSpacesRemoteConfigured({ supabaseUrl: '', publishableKey: '' }), false);
  assert.equal(isSharedSpacesRemoteConfigured(SHARED_SPACES_CONFIG), true);
  assert.equal(isSharedSpacesRemoteConfigured({ supabaseUrl: 'https://project.supabase.co', publishableKey: 'public' }), true);
  assert.equal(isSharedSpacesRemoteConfigured({ supabaseUrl: 'http://project.local', publishableKey: 'public' }), false);
});

test('shared spaces remote sends authenticated RPC requests', async () => {
  const requests = [];
  const extensionApi = {
    storage: { local: { get: async () => ({ tfr_shared_spaces_session: { accessToken: 'token', expiresAt: Date.now() + 120000 } }), set: async () => {}, remove: async () => {} } }
  };
  const remote = createSharedSpacesRemote({
    extensionApi,
    config: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'public', inviteBaseUrl: '' },
    isConfigured: () => true,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, json: async () => [] };
    }
  });
  await remote.listInvitations();
  assert.equal(requests[0].url, 'https://project.supabase.co/rest/v1/rpc/tfr_list_invitations');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token');
});

test('shared spaces remote refreshes an expiring session before RPC requests', async () => {
  let storedSession = { accessToken: 'old', refreshToken: 'refresh', expiresAt: Date.now() + 1000 };
  const requests = [];
  const extensionApi = {
    storage: { local: {
      get: async () => ({ tfr_shared_spaces_session: storedSession }),
      set: async (value) => { storedSession = value.tfr_shared_spaces_session; },
      remove: async () => {}
    } }
  };
  const remote = createSharedSpacesRemote({
    extensionApi,
    config: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'public', inviteBaseUrl: '' },
    isConfigured: () => true,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/auth/v1/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'new', refresh_token: 'next', expires_in: 3600 }) };
      }
      return { ok: true, status: 200, json: async () => [] };
    }
  });
  await remote.listSpaces();
  assert.equal(requests[1].options.headers.Authorization, 'Bearer new');
  assert.equal(storedSession.refreshToken, 'next');
});

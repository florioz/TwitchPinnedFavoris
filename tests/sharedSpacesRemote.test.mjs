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

test('shared space chat uses bounded authenticated RPC payloads', async () => {
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
  await remote.listMessages('space', '2026-01-01T00:00:00Z', 500);
  await remote.sendMessage('space', 'Bonjour', 'reply');
  assert.match(requests[0].url, /rpc\/tfr_list_space_messages$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    target_space_id: 'space',
    before_created_at: '2026-01-01T00:00:00Z',
    requested_limit: 100
  });
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    target_space_id: 'space',
    message_body: 'Bonjour',
    reply_to_message_id: 'reply'
  });
  assert.equal(requests.every((request) => request.options.headers.Authorization === 'Bearer token'), true);
});

test('shared space reactions stay behind authenticated chat RPCs', async () => {
  const requests = [];
  const remote = createSharedSpacesRemote({
    extensionApi: { storage: { local: { get: async () => ({ tfr_shared_spaces_session: { accessToken: 'token', expiresAt: Date.now() + 120000 } }), set: async () => {}, remove: async () => {} } } },
    config: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'public', inviteBaseUrl: '' },
    isConfigured: () => true,
    fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, json: async () => ({}) }; }
  });
  await remote.getChatMeta('space');
  await remote.toggleMessageReaction('message', '❤️');
  assert.match(requests[0].url, /rpc\/tfr_get_space_chat_meta$/);
  assert.deepEqual(JSON.parse(requests[1].options.body), { target_message_id: 'message', target_emoji: '❤️' });
  assert.equal(requests.every((request) => request.options.headers.Authorization === 'Bearer token'), true);
});

test('shared space message edits use the controlled authenticated RPC', async () => {
  const requests = [];
  const remote = createSharedSpacesRemote({
    extensionApi: { storage: { local: { get: async () => ({ tfr_shared_spaces_session: { accessToken: 'token', expiresAt: Date.now() + 120000 } }), set: async () => {}, remove: async () => {} } } },
    config: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'public', inviteBaseUrl: '' },
    isConfigured: () => true,
    fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, json: async () => true }; }
  });
  await remote.editMessage('message', 'Texte corrigé');
  assert.match(requests[0].url, /rpc\/tfr_edit_space_message$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), { target_message_id: 'message', message_body: 'Texte corrigé' });
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

test('community badge lookup uses the public RPC without exposing a user token', async () => {
  const requests = [];
  const extensionApi = {
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } }
  };
  const remote = createSharedSpacesRemote({
    extensionApi,
    config: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'public', inviteBaseUrl: '' },
    isConfigured: () => true,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, json: async () => ['alice'] };
    }
  });
  const members = await remote.lookupCommunityBadgeLogins(['alice', 'bob']);
  assert.deepEqual(members, ['alice']);
  assert.equal(requests[0].url, 'https://project.supabase.co/rest/v1/rpc/tfr_lookup_community_badges');
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(requests[0].options.body), { requested_logins: ['alice', 'bob'] });
});

test('community badge consent is stored through an authenticated RPC', async () => {
  const requests = [];
  const extensionApi = {
    storage: { local: { get: async () => ({
      tfr_shared_spaces_session: { accessToken: 'token', expiresAt: Date.now() + 120000 }
    }), set: async () => {}, remove: async () => {} } }
  };
  const remote = createSharedSpacesRemote({
    extensionApi,
    config: { supabaseUrl: 'https://project.supabase.co', publishableKey: 'public', inviteBaseUrl: '' },
    isConfigured: () => true,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ enabled: true, login: 'alice' }) };
    }
  });
  await remote.setCommunityBadgeEnabled(true);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(requests[0].options.body), { should_enable: true });
});

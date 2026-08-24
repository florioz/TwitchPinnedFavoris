import { createSupabasePublicClient } from './supabasePublicClient.mjs';
import { createSupabaseAuthenticatedClient } from './supabaseAuthenticatedClient.mjs';

const SESSION_KEY = 'tfr_shared_spaces_session';

const parseAuthFragment = (redirectUrl) => {
  const url = new URL(redirectUrl);
  const values = new URLSearchParams(url.hash.slice(1) || url.search.slice(1));
  const accessToken = values.get('access_token') || '';
  if (!accessToken) throw new Error(values.get('error_description') || 'Connexion Twitch annulée');
  return {
    accessToken,
    refreshToken: values.get('refresh_token') || '',
    expiresAt: Date.now() + Math.max(60, Number(values.get('expires_in')) || 3600) * 1000
  };
};

export const createSharedSpacesRemote = ({ extensionApi, config, isConfigured, fetchImpl = fetch }) => {
  const storage = extensionApi.storage.local;
  const publicClient = createSupabasePublicClient({
    config,
    isConfigured,
    fetchImpl,
    notConfiguredMessage: 'La communauté TwitchPinnedFavoris n’est pas configurée'
  });
  const readSession = async () => (await storage.get(SESSION_KEY))?.[SESSION_KEY] || null;
  const saveSession = async (session) => storage.set({ [SESSION_KEY]: session });
  const clearSession = async () => storage.remove(SESSION_KEY);

  const refreshSession = async (session) => {
    if (!session?.refreshToken) return null;
    const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refreshToken })
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const refreshed = {
      accessToken: payload.access_token || '',
      refreshToken: payload.refresh_token || session.refreshToken,
      expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000
    };
    if (!refreshed.accessToken) return null;
    await saveSession(refreshed);
    return refreshed;
  };

  const getValidSession = async () => {
    const session = await readSession();
    if (!session?.accessToken) return null;
    if (Number(session.expiresAt || 0) > Date.now() + 60_000) return session;
    return refreshSession(session);
  };

  const authenticatedClient = createSupabaseAuthenticatedClient({
    config,
    isConfigured,
    fetchImpl,
    getSession: getValidSession,
    refreshSession: async () => refreshSession(await readSession()),
    notConfiguredMessage: 'La synchronisation des espaces partagés n’est pas configurée',
    missingSessionMessage: 'Connectez votre compte Twitch'
  });
  const rpc = authenticatedClient.rpc;

  const connect = async () => {
    if (!isConfigured(config)) throw new Error('Configurez Supabase avant de connecter Twitch');
    const redirectTo = extensionApi.identity.getRedirectURL('shared-spaces');
    const authUrl = new URL(`${config.supabaseUrl}/auth/v1/authorize`);
    authUrl.searchParams.set('provider', config.oauthProvider);
    authUrl.searchParams.set('redirect_to', redirectTo);
    const resultUrl = await new Promise((resolve, reject) => {
      extensionApi.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (url) => {
        const error = extensionApi.runtime.lastError;
        if (error || !url) reject(new Error(error?.message || 'Connexion Twitch annulée'));
        else resolve(url);
      });
    });
    const session = parseAuthFragment(resultUrl);
    await saveSession(session);
    return getStatus();
  };

  const getStatus = async () => {
    const session = await getValidSession();
    const redirectUrl = extensionApi.identity?.getRedirectURL?.('shared-spaces') || '';
    if (!isConfigured(config)) return { configured: false, connected: false, redirectUrl };
    if (!session?.accessToken) {
      return { configured: true, connected: false, redirectUrl };
    }
    try {
      const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${session.accessToken}` }
      });
      if (!response.ok) throw new Error('expired');
      const user = await response.json();
      return {
        configured: true,
        connected: true,
        redirectUrl,
        user: {
          id: user.id,
          twitchId: user.user_metadata?.sub || user.user_metadata?.provider_id || '',
          login: user.user_metadata?.preferred_username || user.user_metadata?.user_name || '',
          displayName: user.user_metadata?.name || user.user_metadata?.preferred_username || '',
          avatarUrl: user.user_metadata?.picture || user.user_metadata?.avatar_url || ''
        }
      };
    } catch {
      await clearSession();
      return { configured: true, connected: false, redirectUrl };
    }
  };

  return Object.freeze({
    connect,
    disconnect: async () => { await clearSession(); return { configured: isConfigured(config), connected: false }; },
    getStatus,
    listSpaces: () => rpc('tfr_list_spaces'),
    createSpace: (space) => rpc('tfr_create_space', { payload: space }),
    pullSpace: (spaceId) => rpc('tfr_get_space', { target_space_id: spaceId }),
    pushSpace: (space) => rpc('tfr_update_space', { target_space_id: space.id, payload: space }),
    inviteByLogin: (spaceId, twitchLogin, role) => rpc('tfr_invite_by_twitch_login', {
      target_space_id: spaceId, target_twitch_login: twitchLogin, target_role: role
    }),
    createInviteLink: async (spaceId, role) => {
      const invitation = await rpc('tfr_create_invite_link', { target_space_id: spaceId, target_role: role });
      const token = invitation?.token || '';
      return {
        ...invitation,
        inviteUrl: token && config.inviteBaseUrl
          ? `${config.inviteBaseUrl.replace(/\/$/, '')}/join/${encodeURIComponent(token)}`
          : ''
      };
    },
    listInvitations: () => rpc('tfr_list_invitations'),
    respondToInvitation: (invitationId, accept) => rpc('tfr_respond_invitation', {
      target_invitation_id: invitationId, should_accept: Boolean(accept)
    }),
    joinByToken: (token) => rpc('tfr_join_by_token', { invite_token: token }),
    setMemberRole: (spaceId, userId, role) => rpc('tfr_set_member_role', {
      target_space_id: spaceId, target_user_id: userId, target_role: role
    }),
    deleteSpace: (spaceId) => rpc('tfr_delete_space', { target_space_id: spaceId }),
    leaveSpace: (spaceId) => rpc('tfr_leave_space', { target_space_id: spaceId }),
    listMessages: (spaceId, before = null, limit = 50) => rpc('tfr_list_space_messages', {
      target_space_id: spaceId,
      before_created_at: before || null,
      requested_limit: Math.min(100, Math.max(1, Number(limit) || 50))
    }),
    sendMessage: (spaceId, body, replyToId = null) => rpc('tfr_send_space_message', {
      target_space_id: spaceId,
      message_body: String(body || ''),
      reply_to_message_id: replyToId || null
    }),
    deleteMessage: (messageId) => rpc('tfr_delete_space_message', { target_message_id: messageId }),
    reportMessage: (messageId, reason) => rpc('tfr_report_space_message', {
      target_message_id: messageId,
      report_reason: String(reason || 'inappropriate')
    }),
    setChatBlock: (userId, blocked) => rpc('tfr_set_space_chat_block', {
      target_user_id: userId,
      should_block: Boolean(blocked)
    }),
    getChatMeta: (spaceId) => rpc('tfr_get_space_chat_meta', { target_space_id: spaceId }),
    toggleMessageReaction: (messageId, emoji) => rpc('tfr_toggle_space_message_reaction', {
      target_message_id: messageId,
      target_emoji: String(emoji || '')
    }),
    editMessage: (messageId, body) => rpc('tfr_edit_space_message', {
      target_message_id: messageId,
      message_body: String(body || '')
    }),
    setCommunityBadgeEnabled: (enabled) => rpc('tfr_set_community_badge_enabled', {
      should_enable: Boolean(enabled)
    }),
    lookupCommunityBadgeLogins: (logins) => publicClient.rpc('tfr_lookup_community_badges', {
      requested_logins: Array.isArray(logins) ? logins : []
    })
  });
};

export const SHARED_SPACES_CONFIG = Object.freeze({
  supabaseUrl: 'https://lvzyrwwkjohuincoxdkv.supabase.co',
  publishableKey: 'sb_publishable_1cjgHf72D6Y25nUa63N5jw_V3LW9nD7',
  oauthProvider: 'twitch',
  inviteBaseUrl: ''
});

export const isSharedSpacesRemoteConfigured = (config = SHARED_SPACES_CONFIG) => {
  try {
    const url = new URL(config.supabaseUrl);
    return url.protocol === 'https:' && Boolean(config.publishableKey);
  } catch {
    return false;
  }
};

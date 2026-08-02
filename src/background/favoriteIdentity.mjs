export const ACCOUNT_MISSING_CONFIRMATIONS = 3;

export const deriveAccountHealth = (favorite = {}, live = {}) => {
  const previousFailures = Math.max(0, Number(favorite.accountLookupFailures || 0));
  const accountLookupFailures = live.userNotFound
    ? previousFailures + 1
    : live.fetchFailed
      ? previousFailures
      : 0;
  return {
    accountLookupFailures,
    accountStatus: accountLookupFailures >= ACCOUNT_MISSING_CONFIRMATIONS
      ? 'unresolved'
      : accountLookupFailures > 0
        ? 'checking'
        : ''
  };
};

export const mergeFavoriteIdentity = (favorite = {}, live = {}, fallbackLogin = '') => {
  const login = String(live.login || favorite.login || fallbackLogin).toLowerCase();
  return {
    ...favorite,
    userId: String(live.userId || favorite.userId || ''),
    login,
    displayName: live.displayName || favorite.displayName || login,
    avatarUrl: live.avatarUrl || favorite.avatarUrl,
    ...deriveAccountHealth(favorite, live)
  };
};

export const hasFavoriteIdentityChanged = (before = {}, after = {}) => (
  String(after.login || '') !== String(before.login || '')
  || String(after.userId || '') !== String(before.userId || '')
  || after.displayName !== before.displayName
  || after.avatarUrl !== before.avatarUrl
  || Number(after.accountLookupFailures || 0) !== Number(before.accountLookupFailures || 0)
  || String(after.accountStatus || '') !== String(before.accountStatus || '')
);

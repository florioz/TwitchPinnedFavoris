export const DEFAULT_WEB_AUTH_CLIENT_ID = '242719267292-3ndk2kr40kplv9n8ldqslcmbkthpvk1b.apps.googleusercontent.com';

export const DRIVE_OAUTH_EXTENSION_IDS = Object.freeze({
  development: 'mmnhheeelmdbgpoiekfkifgdmaomacam',
  store: 'jiokdnooejojbhnpbnhdnjgoflfjdkna'
});

const createProfile = (environment, preferredAuthMode) => Object.freeze({
  environment,
  preferredAuthMode,
  webClientId: DEFAULT_WEB_AUTH_CLIENT_ID
});

export const DEFAULT_DRIVE_OAUTH_PROFILE = createProfile('development', 'web');

export const DRIVE_OAUTH_PROFILES = Object.freeze({
  [DRIVE_OAUTH_EXTENSION_IDS.development]: DEFAULT_DRIVE_OAUTH_PROFILE,
  [DRIVE_OAUTH_EXTENSION_IDS.store]: createProfile('store', 'chrome')
});

const normalizeExtensionId = (extensionId) => String(extensionId || '').trim();

export const resolveDriveOAuthProfile = (extensionId = '') => (
  DRIVE_OAUTH_PROFILES[normalizeExtensionId(extensionId)] || DEFAULT_DRIVE_OAUTH_PROFILE
);

export const getDriveOAuthRedirectUri = (extensionId = '') => {
  const normalized = normalizeExtensionId(extensionId);
  return normalized ? `https://${normalized}.chromiumapp.org/` : '';
};

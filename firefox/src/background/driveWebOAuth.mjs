export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const GOOGLE_OAUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

const requireValue = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${label} is missing.`);
  }
  return normalized;
};

export const createDriveWebAuthUrl = ({
  clientId,
  redirectUri,
  scope = DRIVE_FILE_SCOPE,
  forceAccountChoice = false
} = {}) => {
  const authUrl = new URL(GOOGLE_OAUTH_ENDPOINT);
  authUrl.searchParams.set('client_id', requireValue(clientId, 'Web OAuth client ID'));
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', requireValue(redirectUri, 'Web OAuth redirect URI'));
  authUrl.searchParams.set('scope', requireValue(scope, 'Web OAuth scope'));
  authUrl.searchParams.set('include_granted_scopes', 'true');
  if (forceAccountChoice) {
    authUrl.searchParams.set('prompt', 'select_account consent');
  }
  return authUrl.toString();
};

export const parseDriveWebAuthRedirect = (redirectUrl) => {
  let params;
  try {
    const parsedUrl = new URL(requireValue(redirectUrl, 'Google web auth redirect URL'));
    params = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
  } catch (error) {
    if (error?.message === 'Google web auth redirect URL is missing.') {
      throw error;
    }
    throw new Error('Google web auth returned an invalid redirect URL.');
  }

  const accessToken = params.get('access_token');
  if (!accessToken) {
    throw new Error(params.get('error_description') || params.get('error') || 'Google web auth returned no token');
  }

  const requestedLifetime = Number(params.get('expires_in'));
  const expiresInSeconds = Number.isFinite(requestedLifetime) && requestedLifetime > 0
    ? requestedLifetime
    : DEFAULT_TOKEN_LIFETIME_SECONDS;
  return { accessToken, expiresInSeconds };
};

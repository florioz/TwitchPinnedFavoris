import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVE_FILE_SCOPE,
  createDriveWebAuthUrl,
  parseDriveWebAuthRedirect
} from '../src/background/driveWebOAuth.mjs';

test('web auth URL contains the required Google OAuth parameters', () => {
  const authUrl = new URL(createDriveWebAuthUrl({
    clientId: 'client.apps.googleusercontent.com',
    redirectUri: 'https://extension.chromiumapp.org/'
  }));

  assert.equal(authUrl.origin + authUrl.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(authUrl.searchParams.get('client_id'), 'client.apps.googleusercontent.com');
  assert.equal(authUrl.searchParams.get('redirect_uri'), 'https://extension.chromiumapp.org/');
  assert.equal(authUrl.searchParams.get('response_type'), 'token');
  assert.equal(authUrl.searchParams.get('scope'), DRIVE_FILE_SCOPE);
  assert.equal(authUrl.searchParams.get('include_granted_scopes'), 'true');
  assert.equal(authUrl.searchParams.has('prompt'), false);
});

test('forced account choice adds the Google consent prompt', () => {
  const authUrl = new URL(createDriveWebAuthUrl({
    clientId: 'client.apps.googleusercontent.com',
    redirectUri: 'https://extension.chromiumapp.org/',
    forceAccountChoice: true
  }));
  assert.equal(authUrl.searchParams.get('prompt'), 'select_account consent');
});

test('web auth redirect returns the token and its lifetime', () => {
  assert.deepEqual(
    parseDriveWebAuthRedirect('https://extension.chromiumapp.org/#access_token=token-123&expires_in=1800'),
    { accessToken: 'token-123', expiresInSeconds: 1800 }
  );
});

test('web auth redirect uses a safe lifetime when Google returns an invalid value', () => {
  assert.equal(
    parseDriveWebAuthRedirect('https://extension.chromiumapp.org/#access_token=token-123&expires_in=-1').expiresInSeconds,
    3600
  );
});

test('web auth redirect exposes the OAuth error returned by Google', () => {
  assert.throws(
    () => parseDriveWebAuthRedirect('https://extension.chromiumapp.org/#error=access_denied&error_description=Permission%20refused'),
    /Permission refused/
  );
});

test('web auth helpers reject missing or malformed configuration', () => {
  assert.throws(
    () => createDriveWebAuthUrl({ redirectUri: 'https://extension.chromiumapp.org/' }),
    /client ID is missing/
  );
  assert.throws(() => parseDriveWebAuthRedirect('not-a-url'), /invalid redirect URL/);
});

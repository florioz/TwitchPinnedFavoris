import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DRIVE_OAUTH_PROFILE,
  DEFAULT_WEB_AUTH_CLIENT_ID,
  DRIVE_OAUTH_EXTENSION_IDS,
  getDriveOAuthRedirectUri,
  resolveDriveOAuthProfile
} from '../src/background/driveOAuthConfig.mjs';

test('development extension uses the web flow directly', () => {
  const profile = resolveDriveOAuthProfile(DRIVE_OAUTH_EXTENSION_IDS.development);
  assert.equal(profile.environment, 'development');
  assert.equal(profile.preferredAuthMode, 'web');
  assert.equal(profile.webClientId, DEFAULT_WEB_AUTH_CLIENT_ID);
});

test('store extension keeps the native Chrome OAuth flow', () => {
  const profile = resolveDriveOAuthProfile(DRIVE_OAUTH_EXTENSION_IDS.store);
  assert.equal(profile.environment, 'store');
  assert.equal(profile.preferredAuthMode, 'chrome');
  assert.equal(profile.webClientId, DEFAULT_WEB_AUTH_CLIENT_ID);
});

test('unknown unpacked builds safely fall back to web OAuth', () => {
  const profile = resolveDriveOAuthProfile('another-development-id');
  assert.equal(profile.environment, 'development');
  assert.equal(profile.preferredAuthMode, 'web');
  assert.equal(profile, DEFAULT_DRIVE_OAUTH_PROFILE);
  assert.equal(getDriveOAuthRedirectUri('another-development-id'), 'https://another-development-id.chromiumapp.org/');
});

test('extension IDs are normalized before profile and redirect resolution', () => {
  const extensionId = DRIVE_OAUTH_EXTENSION_IDS.store;
  assert.equal(resolveDriveOAuthProfile(`  ${extensionId}  `).environment, 'store');
  assert.equal(getDriveOAuthRedirectUri(`  ${extensionId}  `), `https://${extensionId}.chromiumapp.org/`);
  assert.equal(getDriveOAuthRedirectUri('   '), '');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAccountHealth, mergeFavoriteIdentity, hasFavoriteIdentityChanged } from '../src/background/favoriteIdentity.mjs';

test('account health requires three confirmed missing responses', () => {
  const first = deriveAccountHealth({}, { userNotFound: true });
  const second = deriveAccountHealth(first, { userNotFound: true });
  const third = deriveAccountHealth(second, { userNotFound: true });
  assert.equal(first.accountStatus, 'checking');
  assert.equal(second.accountStatus, 'checking');
  assert.equal(third.accountStatus, 'unresolved');
});

test('temporary failures preserve account health and success clears it', () => {
  const favorite = { accountLookupFailures: 2, accountStatus: 'checking' };
  assert.deepEqual(deriveAccountHealth(favorite, { fetchFailed: true }), favorite);
  assert.deepEqual(deriveAccountHealth(favorite, {}), { accountLookupFailures: 0, accountStatus: '' });
});

test('identity migration preserves favorite settings', () => {
  const favorite = { login: 'old_name', userId: '', categories: ['one'], displayName: 'Old' };
  const migrated = mergeFavoriteIdentity(favorite, {
    login: 'new_name', userId: 'user-7', displayName: 'New', avatarUrl: 'avatar.png'
  });
  assert.deepEqual(migrated.categories, ['one']);
  assert.equal(migrated.login, 'new_name');
  assert.equal(hasFavoriteIdentityChanged(favorite, migrated), true);
  assert.equal(hasFavoriteIdentityChanged(migrated, { ...migrated }), false);
});

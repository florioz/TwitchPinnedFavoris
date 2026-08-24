const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/background/serviceWorker.js'), 'utf8');

test('service worker resolves its OAuth profile before constructing dependent services', () => {
  const profileDeclaration = source.indexOf('const driveOAuthProfile = resolveDriveOAuthProfile');
  const presenceConstruction = source.indexOf('const usagePresenceRemote = createUsagePresenceRemote');
  assert.notEqual(profileDeclaration, -1, 'OAuth profile declaration is missing');
  assert.notEqual(presenceConstruction, -1, 'presence service construction is missing');
  assert.equal(
    profileDeclaration < presenceConstruction,
    true,
    'driveOAuthProfile must be initialized before usagePresenceRemote'
  );
});

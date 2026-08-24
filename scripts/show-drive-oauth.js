const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

const root = join(__dirname, '..');

(async () => {
  const config = await import(pathToFileURL(join(root, 'src/background/driveOAuthConfig.mjs')));
  Object.entries(config.DRIVE_OAUTH_EXTENSION_IDS).forEach(([environment, extensionId]) => {
    const profile = config.resolveDriveOAuthProfile(extensionId);
    console.log(environment.toUpperCase());
    console.log(`  Extension ID: ${extensionId}`);
    console.log(`  Preferred auth: ${profile.preferredAuthMode}`);
    console.log(`  Web OAuth client: ${profile.webClientId}`);
    console.log(`  Authorized redirect URI: ${config.getDriveOAuthRedirectUri(extensionId)}`);
  });
})();

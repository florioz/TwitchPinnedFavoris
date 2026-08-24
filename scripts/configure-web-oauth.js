const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const target = join(root, 'src/background/driveOAuthConfig.mjs');
const clientIdAssignmentPattern = /export const DEFAULT_WEB_AUTH_CLIENT_ID = ['"]([^'"]*)['"];/;

const readStdin = async () =>
  new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });

const extractClientId = (input) => {
  const value = String(input || '').trim();
  const match = value.match(/[0-9A-Za-z_-]+\.apps\.googleusercontent\.com/);
  if (!match) {
    throw new Error('Client ID OAuth Web introuvable. Colle un ID qui finit par .apps.googleusercontent.com.');
  }
  return match[0];
};

(async () => {
  try {
    const input = process.argv.slice(2).join(' ') || await readStdin();
    const clientId = extractClientId(input);
    const source = readFileSync(target, 'utf8');
    const currentAssignment = source.match(clientIdAssignmentPattern);
    if (!currentAssignment) {
      throw new Error('Impossible de trouver DEFAULT_WEB_AUTH_CLIENT_ID dans src/background/driveOAuthConfig.mjs.');
    }
    if (currentAssignment[1] === clientId) {
      console.log('Ce client ID OAuth Web est deja configure.');
      return;
    }
    const updated = source.replace(
      clientIdAssignmentPattern,
      `export const DEFAULT_WEB_AUTH_CLIENT_ID = '${clientId}';`
    );
    writeFileSync(target, updated, 'utf8');
    console.log('Client ID OAuth Web configure dans src/background/driveOAuthConfig.mjs.');
    console.log('Lance maintenant : npm run sync:firefox');
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
})();

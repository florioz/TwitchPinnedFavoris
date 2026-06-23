const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const target = join(root, 'src/background/serviceWorker.js');

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
    const updated = source.replace(
      /const WEB_AUTH_CLIENT_ID = ['"][^'"]*['"];/,
      `const WEB_AUTH_CLIENT_ID = '${clientId}';`
    );
    if (updated === source) {
      throw new Error('Impossible de trouver WEB_AUTH_CLIENT_ID dans src/background/serviceWorker.js.');
    }
    writeFileSync(target, updated, 'utf8');
    console.log('Client ID OAuth Web configure dans src/background/serviceWorker.js.');
    console.log('Lance maintenant : npm run sync:firefox');
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
})();

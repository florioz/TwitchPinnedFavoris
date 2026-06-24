const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const target = join(root, 'mobile/oauth-config.js');

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
    throw new Error('Client ID OAuth mobile introuvable. Colle un ID qui finit par .apps.googleusercontent.com.');
  }
  return match[0];
};

const extractClientSecret = (input, clientId) => {
  const value = String(input || '').replace(clientId, ' ').trim();
  const parts = value.split(/\s+/).filter(Boolean);
  const secret = parts[0] || '';
  if (!secret) {
    throw new Error('Client secret OAuth mobile introuvable. Passe le Client ID puis le secret du client TV/Limited Input.');
  }
  return secret;
};

(async () => {
  try {
    const input = process.argv.slice(2).join(' ') || await readStdin();
    const clientId = extractClientId(input);
    const clientSecret = extractClientSecret(input, clientId);
    const escapedSecret = clientSecret.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escapedClientId = clientId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    writeFileSync(target, [
      'window.TFM_MOBILE_OAUTH = {',
      `  clientId: '${escapedClientId}',`,
      `  clientSecret: '${escapedSecret}'`,
      '};',
      ''
    ].join('\n'), 'utf8');
    console.log('Client ID et secret OAuth mobile configures dans mobile/oauth-config.js.');
    console.log('Utilise un client Google Cloud de type TVs and Limited Input devices.');
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
})();

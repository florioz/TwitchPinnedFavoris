const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
  window: { location: { pathname: '/channel' } },
  fetch: async () => ({ ok: false })
});
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/chatEmoteResolver.js'),
  'utf8'
), context);

test('chat emote resolver enriches known emotes without losing punctuation', () => {
  const resolver = context.window.TFRChatEmoteResolver.create();
  resolver.emotes.set('Wave', { url: 'https://example.test/wave.webp' });
  const parts = resolver.enrichParts([{ type: 'text', text: 'salut (Wave)!' }]);
  assert.equal(parts.length, 4);
  assert.equal(parts[0].text + parts[1].text, 'salut (');
  assert.equal(parts[2].type, 'emote');
  assert.equal(parts[2].name, 'Wave');
  assert.equal(parts[3].text, ')!');
});


test('history loads BTTV global, channel and shared emotes', async () => {
  context.fetch = async url => ({ ok: true, json: async () => url.endsWith('/global')
    ? [{ id: 'global', code: 'Global' }]
    : { channelEmotes: [{ id: 'channel', code: 'Local' }], sharedEmotes: [{ id: 'shared', code: ':D' }] } });
  const resolver = context.window.TFRChatEmoteResolver.create();
  resolver.emotes = await resolver.fetchBetterTtvEmotes('42');
  assert.equal(resolver.emotes.size, 3);
  const parts = resolver.enrichParts([{ type: 'text', text: 'Local :D' }]);
  assert.equal(parts[0].provider, 'bttv');
  assert.equal(parts[2].name, ':D');
  assert.equal(parts[2].type, 'emote');
});

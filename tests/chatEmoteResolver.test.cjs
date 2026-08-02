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

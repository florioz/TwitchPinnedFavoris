const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/chatEmotePicker.js'),
  'utf8'
);

test('emote picker inserts the exact emote token for Twitch to render', () => {
  assert.match(source, /const replacement = emote\.name;/);
  assert.doesNotMatch(source, /`\$\{emote\.name\} `/);
});

test('emote picker delegates selection events instead of binding every result', () => {
  assert.match(source, /this\.grid\.addEventListener\('click', this\.handleGridClick\)/);
  assert.match(source, /button\.dataset\.emoteIndex = String\(startIndex \+ offset\)/);
  assert.doesNotMatch(source, /button\.addEventListener\('click', \(\) => this\.insertEmote\(emote\)\)/);
});

test('emote picker measures its position after rendering its initial results', () => {
  const renderIndex = source.indexOf('this.renderResults();', source.indexOf('open()'));
  const positionIndex = source.indexOf('this.positionPanel();', source.indexOf('open()'));
  assert.ok(renderIndex >= 0 && positionIndex > renderIndex);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loadCatalog = () => {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/chatEmoteCatalog.js'), 'utf8'),
    context
  );
  return context.window.TFRChatEmoteCatalog;
};

test('emote catalog normalizes 7TV user and global payloads', () => {
  const catalog = loadCatalog();
  const target = new Map();
  catalog.appendSevenTv(target, {
    emote_set: { emotes: [{ data: { id: 'seven-id', name: 'ICAN' } }] }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(target.get('ICAN'))), {
    name: 'ICAN',
    provider: '7TV',
    url: 'https://cdn.7tv.app/emote/seven-id/2x.webp'
  });
});

test('emote catalog normalizes BetterTTV entries and ignores malformed values', () => {
  const catalog = loadCatalog();
  const target = new Map();
  catalog.appendBetterTtv(target, [
    { id: 'bttv-id', code: 'OMEGALUL' },
    { code: 'missing-id' },
    null
  ]);

  assert.equal(target.size, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(target.get('OMEGALUL'))), {
    name: 'OMEGALUL',
    provider: 'BetterTTV',
    url: 'https://cdn.betterttv.net/emote/bttv-id/2x.webp'
  });
});

test('emote catalog merging gives the later provider priority without mutating inputs', () => {
  const catalog = loadCatalog();
  const sevenTv = new Map([['Shared', { provider: '7TV' }]]);
  const betterTtv = new Map([['Shared', { provider: 'BetterTTV' }], ['OnlyBttv', { provider: 'BetterTTV' }]]);

  const merged = catalog.merge(sevenTv, betterTtv);

  assert.equal(merged.get('Shared').provider, 'BetterTTV');
  assert.equal(merged.size, 2);
  assert.equal(sevenTv.get('Shared').provider, '7TV');
});

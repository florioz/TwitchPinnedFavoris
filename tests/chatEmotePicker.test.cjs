const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, console });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/chatEmotePickerModel.js'), 'utf8'),
  context
);

const {
  normalizeCatalog,
  filterCatalog,
  clampPanelPosition,
  getAnchoredPanelPosition
} = context.window.TFRChatEmotePickerModel;

test('emote picker sorts valid catalog entries without mutating the source map', () => {
  const source = new Map([
    ['z', { name: 'Zebra', url: 'https://cdn/z', provider: '7TV' }],
    ['a', { name: 'alpha', url: 'https://cdn/a', provider: 'BetterTTV' }],
    ['bad', { name: 'MissingUrl', provider: '7TV' }]
  ]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(normalizeCatalog(source).map((emote) => emote.name))),
    ['alpha', 'Zebra']
  );
  assert.equal(source.size, 3);
});

test('emote picker searches case-insensitively and filters providers', () => {
  const catalog = [
    { name: 'OMEGALUL', provider: '7TV' },
    { name: 'omegaDance', provider: 'BetterTTV' },
    { name: 'Kappa', provider: 'BetterTTV' }
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(filterCatalog(catalog, 'OMEGA', 'BetterTTV').map((emote) => emote.name))),
    ['omegaDance']
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(filterCatalog(catalog, 'omega', 'all').map((emote) => emote.name))),
    ['OMEGALUL', 'omegaDance']
  );
});

test('emote picker filtering keeps the complete result set for progressive scrolling', () => {
  const catalog = Array.from({ length: 300 }, (_, index) => ({
    name: `Emote${index}`,
    provider: '7TV'
  }));

  assert.equal(filterCatalog(catalog, '', 'all').length, 300);
  assert.equal(filterCatalog(catalog, '', 'all', 25).length, 25);
});

test('emote picker geometry keeps anchored and dragged panels inside the viewport', () => {
  const viewport = { width: 800, height: 600 };
  const panel = { width: 360, height: 480 };

  assert.deepEqual(
    JSON.parse(JSON.stringify(getAnchoredPanelPosition(
      { top: 500, bottom: 530, right: 790 }, panel, viewport
    ))),
    { left: 430, top: 12 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(clampPanelPosition(
      { left: -100, top: 900 }, panel, viewport, 6
    ))),
    { left: 6, top: 114 }
  );
});

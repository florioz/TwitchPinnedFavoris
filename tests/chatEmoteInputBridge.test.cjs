const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loadBridge = () => {
  class ElementMock {}
  class HTMLImageElementMock extends ElementMock {}
  class MutationObserverMock {
    observe() {}
    disconnect() {}
  }
  const document = {
    documentElement: {},
    addEventListener() {},
    querySelector: () => null
  };
  const context = {
    document,
    Element: ElementMock,
    HTMLImageElement: HTMLImageElementMock,
    MutationObserver: MutationObserverMock,
    btoa: (value) => Buffer.from(value).toString('base64'),
    queueMicrotask
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/page/chatEmoteInputBridge.js'), 'utf8'),
    context
  );
  return context.TFRChatEmoteInputBridge;
};

test('chat input bridge resolves the Slate text leaf from its complete path', () => {
  const bridge = loadBridge();
  const textLeaf = { text: 'IC' };
  const children = [{ type: 'paragraph', children: [textLeaf] }];

  assert.equal(bridge.getNodeAtPath(children, [0, 0]), textLeaf);
  assert.equal(bridge.getNodeAtPath(children, [0, 2]), null);
});

test('chat input bridge replaces only the typed Slate prefix and moves the caret', () => {
  const bridge = loadBridge();
  const operations = [];
  const slate = {
    children: [{ type: 'paragraph', children: [{ text: 'hello IC' }] }],
    apply: (operation) => operations.push(operation)
  };

  const replaced = bridge.applySlateReplacement(
    slate,
    { path: [0, 0], offset: 8 },
    { start: 6, end: 8, replacement: 'ICAN' }
  );

  assert.equal(replaced, true);
  assert.deepEqual(operations.map((operation) => JSON.parse(JSON.stringify(operation))), [
    { type: 'remove_text', path: [0, 0], offset: 6, text: 'IC' },
    { type: 'insert_text', path: [0, 0], offset: 6, text: 'ICAN' },
    {
      type: 'set_selection',
      newProperties: {
        anchor: { path: [0, 0], offset: 10 },
        focus: { path: [0, 0], offset: 10 }
      }
    }
  ]);
});

test('chat input bridge normalizes and replaces catalog entries by name', () => {
  const bridge = loadBridge();
  assert.equal(bridge.normalizeEmote({ name: ' ICAN ', url: ' https://cdn/ican.webp ', provider: '7TV' }).name, 'ICAN');
  assert.equal(bridge.normalizeEmote({ name: 'missing-url' }), null);
  bridge.replaceCatalog([{ name: 'ICAN', url: 'https://cdn/old.webp' }]);
  assert.equal(bridge.upsertCatalogEmote({ name: 'ICAN', url: 'https://cdn/new.webp', provider: '7TV' }), true);
});

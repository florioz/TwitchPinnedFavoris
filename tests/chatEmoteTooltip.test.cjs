const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loadModule = (document, window) => {
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/chatEmoteTooltip.js'), 'utf8'),
    { document, window }
  );
  return window.TFRChatEmoteTooltip;
};

test('emote tooltip position stays inside the viewport and prefers above the emote', () => {
  const window = {};
  const module = loadModule({}, window);
  assert.deepEqual(
    { ...module.calculatePosition(
      { left: 190, top: 100, bottom: 128, width: 28 },
      { width: 120, height: 48 },
      { width: 220, height: 300 }
    ) },
    { left: 92, top: 44 }
  );
});

test('emote tooltip renders a styled name and provider without a native title', () => {
  const created = [];
  const createNode = (tagName) => ({
    tagName,
    children: [],
    dataset: {},
    style: {},
    hidden: false,
    isConnected: false,
    textContent: '',
    setAttribute() {},
    append(...children) { this.children.push(...children); },
    getBoundingClientRect: () => ({ width: 130, height: 50 }),
    remove() {}
  });
  const document = {
    createElement: (tagName) => {
      const node = createNode(tagName);
      created.push(node);
      return node;
    },
    body: { appendChild: (node) => { node.isConnected = true; } }
  };
  const window = {
    innerWidth: 500,
    innerHeight: 400,
    setTimeout,
    clearTimeout
  };
  const module = loadModule(document, window);
  const attributes = new Map();
  const emote = {
    isConnected: true,
    dataset: { tfrEmoteName: 'OMEGALUL', tfrEmoteProvider: '7TV' },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    getBoundingClientRect: () => ({ left: 100, top: 120, bottom: 148, width: 28 })
  };
  const controller = module.create(document, window);

  controller.show(emote);

  const [tooltip, nameNode, , , providerNode] = created;
  assert.equal(nameNode.textContent, 'OMEGALUL');
  assert.equal(providerNode.textContent, '7TV');
  assert.equal(tooltip.dataset.provider, '7TV');
  assert.equal(tooltip.hidden, false);
  assert.equal(attributes.get('aria-describedby'), 'tfr-chat-emote-tooltip');
  assert.equal(tooltip.style.left, '49px');
  assert.equal(tooltip.style.top, '62px');
});

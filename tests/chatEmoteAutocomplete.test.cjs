const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loadModule = () => {
  const listeners = new Map();
  class InputEventMock {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
  }
  class CustomEventMock {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
  }
  const document = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
    dispatchEvent() {}
  };
  const window = { InputEvent: InputEventMock, CustomEvent: CustomEventMock };
  const context = { window, document, NodeFilter: { SHOW_TEXT: 4 } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/chatEmoteAutocomplete.js'), 'utf8'),
    context
  );
  return { module: window.TFRChatEmoteAutocomplete, document, window, listeners };
};

const createTextarea = (value) => {
  const inputEvents = [];
  const input = {
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    closest: () => input,
    setRangeText(replacement, start, end) {
      this.value = `${this.value.slice(0, start)}${replacement}${this.value.slice(end)}`;
      this.selectionStart = start + replacement.length;
      this.selectionEnd = this.selectionStart;
    },
    dispatchEvent: (event) => inputEvents.push(event)
  };
  return { input, inputEvents };
};

const createTabEvent = (target, shiftKey = false) => {
  const calls = [];
  return {
    key: 'Tab', target, shiftKey,
    ctrlKey: false, altKey: false, metaKey: false,
    preventDefault: () => calls.push('prevent'),
    stopPropagation: () => calls.push('stop'),
    calls
  };
};

test('Tab completes and cycles through matching 7TV and BetterTTV emotes', () => {
  const { module, document, window } = loadModule();
  const controller = new module.ChatEmoteAutocomplete(document, window);
  controller.setEmotes(['OMEGALUL', 'OMEGADANCE', 'Kappa']);
  controller.setEnabled(true);
  const { input, inputEvents } = createTextarea('hello OME');

  const first = createTabEvent(input);
  controller.handleKeyDown(first);
  assert.equal(input.value, 'hello OMEGADANCE');
  assert.deepEqual(first.calls, ['prevent', 'stop']);

  const second = createTabEvent(input);
  controller.handleKeyDown(second);
  assert.equal(input.value, 'hello OMEGALUL');
  assert.equal(inputEvents.length, 2);
});

test('Tab keeps its native behavior without a useful emote match', () => {
  const { module, document, window } = loadModule();
  const controller = new module.ChatEmoteAutocomplete(document, window);
  controller.setEmotes(['Kappa']);
  controller.setEnabled(true);
  const { input } = createTextarea('x');
  const event = createTabEvent(input);

  controller.handleKeyDown(event);

  assert.equal(input.value, 'x');
  assert.deepEqual(event.calls, []);
});

test('a completed emote displays an image preview inside the chat input area', () => {
  const { module, document, window } = loadModule();
  const created = [];
  document.createElement = (tagName) => {
    const node = {
      tagName, children: [], dataset: {}, style: {}, hidden: false, isConnected: false,
      textContent: '', src: '',
      setAttribute() {},
      append(...children) { this.children.push(...children); },
      getBoundingClientRect: () => ({ width: 120, height: 42 }),
      remove() {}
    };
    created.push(node);
    return node;
  };
  document.body = { appendChild: (node) => { node.isConnected = true; } };
  const controller = new module.ChatEmoteAutocomplete(document, window);
  controller.setEmotes([{
    name: 'OMEGALUL', provider: '7TV', url: 'https://cdn.example/omegalul.webp'
  }]);
  controller.setEnabled(true);
  const { input } = createTextarea('OME');
  input.getBoundingClientRect = () => ({ left: 20, right: 320, top: 200, height: 48 });

  controller.handleKeyDown(createTabEvent(input));

  const [preview, image, , name, provider] = created;
  assert.equal(preview.hidden, false);
  assert.equal(image.src, 'https://cdn.example/omegalul.webp');
  assert.equal(name.textContent, 'OMEGALUL');
  assert.equal(provider.textContent, '7TV');
  assert.equal(preview.style.left, '192px');
  assert.equal(preview.style.top, '203px');

  controller.handleEdit();
  assert.equal(preview.hidden, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class HTMLElementMock {}

const context = vm.createContext({
  window: { TFRChatEmoteResolver: { create: () => ({}) } },
  document: {},
  console,
  HTMLElement: HTMLElementMock
});
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/chatDomTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationDurationTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/chatModeration.js'),
  'utf8'
), context);

const { ModerationHistoryUI } = context.window.TFRChatModeration.create({ t: (key) => key });

test('moderation history button stays immediately before chat settings', () => {
  const toolbar = new HTMLElementMock();
  const settingsSlot = new HTMLElementMock();
  const anchor = new HTMLElementMock();
  const button = new HTMLElementMock();
  anchor.parentElement = settingsSlot;
  settingsSlot.parentElement = toolbar;
  settingsSlot.getBoundingClientRect = () => ({ width: 32 });
  toolbar.parentElement = null;
  toolbar.getBoundingClientRect = () => ({ width: 320, left: 100, top: 200 });
  anchor.getBoundingClientRect = () => ({ left: 356, top: 202, width: 32, height: 32 });
  button.parentElement = null;
  button.nextElementSibling = null;
  button.offsetWidth = 32;
  button.offsetHeight = 32;
  button.style = { left: '', top: '', removeProperty() {} };
  toolbar.classList = { add() {}, remove() {} };
  let appended = null;
  toolbar.appendChild = (node) => {
    appended = node;
    node.parentElement = toolbar;
  };
  toolbar.contains = () => false;

  const ui = Object.create(ModerationHistoryUI.prototype);
  ui.findControlsAnchor = () => anchor;
  ui.findControlsContainer = () => null;
  ui.ensureButton = () => button;
  ui.buttonAnchor = null;
  ui.mountButton();

  assert.equal(appended, button);
  assert.equal(button.style.left, '224px');
  assert.equal(button.style.top, '2px');
  appended = null;
  ui.mountButton();
  assert.equal(appended, null);
});

test('moderation history button has a dedicated compact size', () => {
  const css = fs.readFileSync(path.join(__dirname, '../styles/buttons.css'), 'utf8');
  assert.match(css, /\.tfr-mod-history-button\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/s);
  assert.match(css, /\.tfr-mod-history-button\s*\{[^}]*position:\s*absolute;/s);
});

test('moderation history anchors immediately before chat settings', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/chatModeration.js'),
    'utf8'
  );
  const anchorMethod = source.match(/findControlsAnchor\(\)\s*\{([\s\S]*?)\n\s*findControlsContainer\(\)/)?.[1] || '';

  assert.match(anchorMethod, /chat-settings/);
  assert.doesNotMatch(anchorMethod, /emote-picker-button/);
});

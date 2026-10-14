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
  path.join(__dirname, '../src/contentScripts/features/eventEmitter.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/chatDomTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationDurationTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationHistoryPresenter.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationActionCollection.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationTextTools.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/moderationPanelGeometry.js'),
  'utf8'
), context);
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/chatModeration.js'),
  'utf8'
), context);

const {
  ModerationActionTracker,
  ModerationHistoryUI,
  ViewerCardHistoryRenderer
} = context.window.TFRChatModeration.create({ t: (key) => key });

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
  toolbar.contains = (node) => node === toolbar || node === settingsSlot || node === anchor || node === button;

  const ui = Object.create(ModerationHistoryUI.prototype);
  ui.findControlsAnchor = () => anchor;
  ui.findControlsContainer = () => toolbar;
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
  const anchorStart = source.indexOf('    findControlsAnchor(');
  const anchorEnd = source.indexOf('    isInsideChatControls(', anchorStart);
  const anchorMethod = anchorStart >= 0 && anchorEnd > anchorStart
    ? source.slice(anchorStart, anchorEnd)
    : '';

  assert.match(anchorMethod, /chat-settings/);
  assert.match(anchorMethod, /container\.querySelector/);
  assert.doesNotMatch(anchorMethod, /document\.querySelector/);
  assert.doesNotMatch(anchorMethod, /emote-picker-button/);
});

test('moderation history never mounts when chat controls are unavailable', () => {
  const button = new HTMLElementMock();
  let removed = 0;
  let closed = 0;
  button.parentElement = { removeChild: () => { removed += 1; } };
  const ui = Object.create(ModerationHistoryUI.prototype);
  ui.isReplayPage = () => false;
  ui.findControlsContainer = () => null;
  ui.findControlsAnchor = () => { throw new Error('an anchor must not be searched outside chat'); };
  ui.ensureButton = () => button;
  ui.closePanel = () => { closed += 1; };
  ui.clearButtonAnchor = () => {};

  ui.mountButton();

  assert.equal(removed, 1);
  assert.equal(closed, 1);
});

test('moderation history stays hidden on Twitch replay pages', () => {
  const ui = Object.create(ModerationHistoryUI.prototype);
  let removed = 0;
  let closed = 0;
  let anchorCleared = 0;
  ui.button = {
    parentElement: {
      removeChild() { removed += 1; }
    }
  };
  ui.closePanel = () => { closed += 1; };
  ui.clearButtonAnchor = () => { anchorCleared += 1; };
  ui.findControlsAnchor = () => { throw new Error('VOD controls must not be inspected'); };

  assert.equal(ui.isReplayPage('/videos/1234567890'), true);
  assert.equal(ui.isReplayPage('/some_channel'), false);
  const previousPath = context.window.location?.pathname;
  context.window.location = { pathname: '/videos/1234567890' };
  ui.mountButton();
  context.window.location = previousPath == null ? undefined : { pathname: previousPath };

  assert.equal(removed, 1);
  assert.equal(closed, 1);
  assert.equal(anchorCleared, 1);
});

test('moderation history locates only a message still owned by the current chat', () => {
  const message = { isConnected: true };
  const container = {
    isConnected: true,
    contains: (candidate) => candidate === message,
    querySelectorAll: () => []
  };
  const ui = Object.create(ModerationHistoryUI.prototype);
  ui.tracker = {
    historyTracker: {
      chatContainer: container,
      getMessageRoot: (candidate) => candidate
    }
  };

  assert.equal(ui.findMessageElement({ messageElement: message }), message);
  assert.equal(ui.findMessageElement({ messageElement: { isConnected: true } }), null);
});

test('moderation navigation uses an external indicator instead of mutating Twitch messages', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/chatModeration.js'),
    'utf8'
  );
  const locateMethod = source.match(/locateMessage\(entry, historyItem\)\s*\{([\s\S]*?)\n\s*showLocationFeedback/)?.[1] || '';
  assert.match(locateMethod, /tfr-chat-location-indicator/);
  assert.match(locateMethod, /document\.body\.appendChild\(indicator\)/);
  assert.doesNotMatch(locateMethod, /message\.classList/);
});

test('viewer card observer ignores mutations created by its own history renderer', () => {
  const renderer = new ViewerCardHistoryRenderer({});
  const history = { id: 'tfr-viewer-history', closest: () => null };
  const child = { id: '', closest: (selector) => selector === '#tfr-viewer-history' ? history : null };
  const native = { id: '', closest: () => null };

  assert.equal(renderer.isOwnHistoryMutation({ target: child, addedNodes: [], removedNodes: [] }), true);
  assert.equal(renderer.isOwnHistoryMutation({ target: native, addedNodes: [history], removedNodes: [] }), true);
  assert.equal(renderer.isOwnHistoryMutation({ target: native, addedNodes: [native], removedNodes: [] }), false);
  assert.equal(renderer.isOwnHistoryMutation({ target: native, addedNodes: [history, native], removedNodes: [] }), false);
});

test('viewer card history resolves its mount point only inside the active card', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/contentScripts/features/chatModeration.js'),
    'utf8'
  );
  const renderMethod = source.match(/renderHistory\(\)\s*\{([\s\S]*?)\n\s*renderMessageParts/)?.[1] || '';

  assert.match(renderMethod, /this\.querySelectors\(\[this\.currentCard\]/);
  assert.match(renderMethod, /this\.currentCard\.contains\(host\)/);
  assert.doesNotMatch(renderMethod, /collectRelatedRoots\(this\.currentCard\)/);
});

test('moderation tracker accepts only its isolated Twitch event feed', () => {
  let receive;
  let disposed = false;
  context.window.location = { pathname: '/channel' };
  context.window.TFRTwitchChatEvents = { getChannel: path => path?.slice(1) || '', getShared: () => ({
    subscribe: callback => { receive = callback; return () => { disposed = true; }; },
    getMessageState: () => null
  }) };
  const tracker = new ModerationActionTracker({});
  tracker.init();
  assert.equal(typeof tracker.captureAction, 'undefined');
  assert.equal(typeof tracker.captureModerationStatus, 'undefined');
  receive({ id: 'fake', type: 'ban', login: 'victim' });
  assert.equal(tracker.getActions().length, 0);
  receive({ source: 'twitch-irc', channel: '/channel', id: 'real', type: 'timeout', login: 'viewer', duration: 600 });
  receive({ source: 'twitch-irc', channel: '/channel', id: 'real', type: 'timeout', login: 'viewer', duration: 600 });
  assert.equal(tracker.getActions().length, 1);
  assert.equal(tracker.getActions()[0].duration, 600);
  context.window.location.pathname = '/other';
  assert.equal(tracker.getActions().length, 0);
  receive({ source: 'twitch-irc', channel: '/channel', id: 'late', type: 'ban' });
  receive({ type: 'reset' });
  receive({ source: 'twitch-irc', channel: '/other', id: 'other', type: 'ban' });
  assert.equal(tracker.getActions().length, 1);
  assert.equal(tracker.getActions()[0].channel, '/other');
  receive({ type: 'reset' });
  assert.equal(tracker.getActions().length, 0);
  tracker.dispose(); assert.equal(disposed, true);
});


test('moderation history mounts using real chat controls discovery', () => {
  const toolbar = new HTMLElementMock();
  const button = new HTMLElementMock();
  const selector = '[data-a-target="chat-input-buttons-container"]';
  toolbar.closest = (value) => value === selector ? toolbar : null;
  toolbar.querySelector = () => null;
  toolbar.contains = (node) => node.parentElement === toolbar;
  toolbar.appendChild = (node) => { node.parentElement = toolbar; };
  button.style = { removeProperty() {} };
  button.closest = toolbar.closest;
  const previousQuery = context.document.querySelector;
  context.document.querySelector = (value) => value === selector ? toolbar : null;
  try {
    const ui = Object.create(ModerationHistoryUI.prototype);
    ui.ensureButton = () => button;
    ui.clearButtonAnchor = () => {};
    ui.mountButton();
    assert.equal(button.parentElement, toolbar);
    assert.equal(ui.isInsideChatControls(button), true);
    context.document.querySelector = () => null;
    assert.equal(ui.findControlsContainer(), null);
  } finally {
    context.document.querySelector = previousQuery;
  }
});

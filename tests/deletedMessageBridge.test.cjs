const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loadBridge = () => {
  class ElementMock {}
  const listeners = new Map();
  const rootClasses = new Set(['tfr-show-deleted-messages']);
  let observeCalls = 0;
  let disconnectCalls = 0;
  class MutationObserverMock {
    constructor(callback) { this.callback = callback; }
    observe() { observeCalls += 1; }
    disconnect() { disconnectCalls += 1; }
  }
  const document = {
    addEventListener: (name, callback) => { listeners.set(name, callback); },
    documentElement: { lang: 'fr', classList: { contains: (name) => rootClasses.has(name) } },
    querySelectorAll: () => []
  };
  const context = { document, Element: ElementMock, MutationObserver: MutationObserverMock };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/page/deletedMessageBridge.js'), 'utf8'),
    context
  );
  return {
    bridge: context.TFRDeletedMessageBridge,
    ElementMock,
    dispatch: (target) => listeners.get('tfr:deleted-message:restore-native')({ target }),
    setEnabled: (enabled) => {
      enabled
        ? rootClasses.add('tfr-show-deleted-messages')
        : rootClasses.delete('tfr-show-deleted-messages');
      listeners.get('tfr:deleted-message:sync-state')();
    },
    observerStats: () => ({ observeCalls, disconnectCalls })
  };
};

test('page bridge reveals deleted messages through the Twitch React renderer', () => {
  const { bridge, ElementMock, dispatch } = loadBridge();
  const classes = new Set(['tfr-deleted-message-revealed']);
  let removedFallback = false;
  const message = new ElementMock();
  message.dataset = { tfrDeletedRestoreRequested: 'true' };
  message.classList = {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name)
  };
  const body = { dataset: {} };
  message.querySelector = (selector) => selector.includes('chat-message')
    ? body
    : { remove: () => { removedFallback = true; } };
  const renderer = {
    props: { isDeleted: true, message: { deleted: true, isDeleted: true } },
    renderMessageBody() {
      assert.equal(this.props.isDeleted, false);
      assert.equal(this.props.message.deleted, false);
      assert.equal(this.props.message.isDeleted, false);
    },
    forceUpdate(callback) {
      this.renderMessageBody();
      callback?.();
    }
  };
  message.__reactFiber$test = { return: { stateNode: renderer, return: null } };

  dispatch(message);

  assert.equal(renderer.props.isDeleted, true, 'the Twitch model remains untouched after restoration');
  assert.equal(classes.has('tfr-deleted-message-react-restored'), true);
  assert.equal(classes.has('tfr-deleted-message-revealed'), false);
  assert.equal(body.dataset.tfrDeletedLabel, 'Supprimé');

  renderer.props.isDeleted = true;
  renderer.props.message.deleted = true;
  renderer.props.message.isDeleted = true;
  renderer.renderMessageBody();
  assert.equal(renderer.props.isDeleted, true, 'the Twitch deletion model is restored after rendering');
  assert.equal(renderer.props.message.deleted, true);
  assert.equal(renderer.props.message.isDeleted, true);
  assert.equal(removedFallback, true);
  assert.equal(bridge.getReactInstance(message), message.__reactFiber$test);
  assert.equal(bridge.getMessageRenderer(message), renderer);
});

test('page bridge patches and restores a renderer without mutating its model', () => {
  const { bridge } = loadBridge();
  const renderer = {
    props: { isDeleted: true, message: { deleted: true } },
    render() { return this.props.message.deleted; }
  };
  const originalRender = renderer.render;

  assert.equal(bridge.patchRenderer(renderer), true);
  assert.equal(renderer.render(), false);
  assert.equal(renderer.props.isDeleted, true);
  assert.equal(renderer.props.message.deleted, true);
  assert.equal(bridge.patchRenderer(renderer), true, 'patching is idempotent');
  assert.equal(bridge.unpatchRenderer(renderer), true);
  assert.equal(renderer.render, originalRender);
  assert.equal(renderer.render(), true);
});

test('page bridge allows a later retry when no Twitch renderer is available', () => {
  const { ElementMock, dispatch } = loadBridge();
  const message = new ElementMock();
  message.dataset = { tfrDeletedRestoreRequested: 'true' };

  dispatch(message);

  assert.equal(message.dataset.tfrDeletedRestoreRequested, undefined);
});

test('page bridge observes Twitch only while deleted messages are enabled', () => {
  const { bridge, setEnabled, observerStats } = loadBridge();

  assert.deepEqual(observerStats(), { observeCalls: 1, disconnectCalls: 0 });
  bridge.start();
  assert.deepEqual(observerStats(), { observeCalls: 1, disconnectCalls: 0 });

  setEnabled(false);
  assert.deepEqual(observerStats(), { observeCalls: 1, disconnectCalls: 1 });
  setEnabled(false);
  assert.deepEqual(observerStats(), { observeCalls: 1, disconnectCalls: 1 });

  setEnabled(true);
  assert.deepEqual(observerStats(), { observeCalls: 2, disconnectCalls: 1 });
});

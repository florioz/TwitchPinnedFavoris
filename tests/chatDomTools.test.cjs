const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, document: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/chatDomTools.js'),
  'utf8'
), context);
const { queryFirst, findMessagesContainer } = context.window.TFRChatDomTools;

test('chat DOM query skips invalid selectors and returns the first match', () => {
  const expected = { id: 'chat' };
  const root = {
    querySelector(selector) {
      if (selector === 'invalid') throw new Error('invalid selector');
      return selector === 'match' ? expected : null;
    }
  };
  assert.equal(queryFirst([null, root], ['invalid', 'missing', 'match']), expected);
});

test('chat container lookup follows selector priority', () => {
  const calls = [];
  const expected = { id: 'messages' };
  const root = {
    querySelector(selector) {
      calls.push(selector);
      return selector === '.chat-scrollable-area__message-container' ? expected : null;
    }
  };
  assert.equal(findMessagesContainer(root), expected);
  assert.deepEqual(calls, [
    '[data-a-target="chat-history-scrollable-area"]',
    '[data-test-selector="chat-scrollable-area__message-container"]',
    '.chat-scrollable-area__message-container'
  ]);
});

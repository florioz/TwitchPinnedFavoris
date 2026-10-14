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


test('native French and English title-based replies are excluded without mutating the line', () => {
  const N = require('./helpers/chatMessageFixture.cjs')();
  const tools = context.window.TFRChatDomTools;
  for (const title of ['Replying to banneduser', 'R\u00e9pond \u00e0 banneduser']) {
    const quote = new N('p', { title: 'Message deleted' }, title, [
      new N('span', { 'data-a-target': 'chat-message-text' }, 'Message deleted')
    ]);
    const own = new N('span', { 'data-a-target': 'chat-message-text' }, 'My reply');
    const line = new N('div', { 'aria-label': title + ' Message deleted My reply' }, '', [quote, own]);
    assert.equal(tools.isReplyContext(quote.children[0]), true);
    assert.equal(tools.queryMessage(line, '[data-a-target="chat-message-text"]'), own);
    const projected = tools.ownMessage(line);
    assert.equal(projected.textContent, 'My reply');
    assert.equal(projected.getAttribute('aria-label'), null);
    assert.equal(line.children.length, 2);
  }
  const ordinary = new N('p', { title: 'A tooltip' }, 'Normal content');
  assert.equal(tools.isReplyContext(ordinary), false);
});

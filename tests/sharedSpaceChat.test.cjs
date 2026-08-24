const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/sharedSpaceChat.js'), 'utf8');
const context = {
  window: {},
  localStorage: null,
  setInterval: () => 1,
  clearInterval: () => {},
  Date
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context);

const chatTools = context.window.TFRSharedSpaceChat;

test('shared chat normalizes text and orders valid messages', () => {
  assert.deepEqual(Array.from(chatTools.REACTIONS), ['👍', '❤️', '😂', '👀']);
  assert.equal(chatTools.normalizeMessageBody('  bonjour  '), 'bonjour');
  assert.equal(chatTools.normalizeMessageBody('x'.repeat(600)).length, 500);
  assert.equal(chatTools.normalizeSearch('  Découverte  '), 'decouverte');
  const result = chatTools.normalizeMessages([
    { id: 'second', createdAt: '2026-01-02' },
    null,
    { id: 'first', createdAt: '2026-01-01' },
    { createdAt: '2026-01-03' }
  ]);
  assert.deepEqual(Array.from(result, (item) => item.id), ['first', 'second']);
});

test('shared chat loads, replies, sends and refreshes messages', async () => {
  const calls = [];
  let messages = [{ id: 'one', body: 'Salut', createdAt: '2026-01-01T10:00:00Z', mine: false }];
  const client = {
    listMessages: async (...args) => { calls.push(['list', ...args]); return { ok: true, data: messages }; },
    sendMessage: async (...args) => {
      calls.push(['send', ...args]);
      messages = [...messages, { id: 'two', body: args[1], createdAt: '2026-01-01T10:01:00Z', mine: true }];
      return { ok: true, data: { id: 'two' } };
    }
  };
  const storageValues = new Map();
  const storage = { getItem: (key) => storageValues.get(key) || '', setItem: (key, value) => storageValues.set(key, value) };
  const controller = chatTools.create({ client, storage, onChange: () => {} });
  controller.setSpace('space');
  await controller.load();
  controller.setReplyTo(messages[0]);
  controller.setDraft(' Réponse ');
  assert.equal(await controller.send(), true);
  assert.deepEqual(calls.find((call) => call[0] === 'send'), ['send', 'space', 'Réponse', 'one']);
  assert.equal(controller.snapshot().draft, '');
  assert.equal(controller.snapshot().replyTo, null);
  assert.equal(controller.snapshot().messages.length, 2);
  controller.dispose();
});

test('shared chat keeps a failed draft and exposes the remote error', async () => {
  const controller = chatTools.create({
    client: {
      listMessages: async () => ({ ok: true, data: [] }),
      sendMessage: async () => ({ ok: false, message: 'rate_limited' })
    },
    storage: null,
    onChange: () => {}
  });
  controller.setSpace('space');
  await controller.load();
  controller.setDraft('Encore là');
  assert.equal(await controller.send(), false);
  assert.equal(controller.snapshot().draft, 'Encore là');
  assert.equal(controller.snapshot().error, 'rate_limited');
  controller.dispose();
});

test('shared chat migration protects messages and exposes controlled RPC functions', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/016_shared_space_chat.sql'), 'utf8');
  assert.match(migration, /alter table public\.tfr_space_messages enable row level security/);
  assert.match(migration, /public\.tfr_is_member\(target_space_id\)/);
  assert.match(migration, /invalid_message_length/);
  assert.match(migration, /rate_limited/);
  assert.match(migration, /revoke all on function public\.tfr_send_space_message/);
  const reactions = fs.readFileSync(path.join(__dirname, '../supabase/migrations/017_shared_space_chat_reactions.sql'), 'utf8');
  assert.match(reactions, /emoji in \('👍','❤️','😂','👀'\)/);
  assert.match(reactions, /tfr_toggle_space_message_reaction/);
  assert.match(reactions, /tfr_get_space_chat_meta/);
  const editing = fs.readFileSync(path.join(__dirname, '../supabase/migrations/018_shared_space_chat_editing.sql'), 'utf8');
  assert.match(editing, /add column if not exists edited_at/);
  assert.match(editing, /tfr_edit_space_message/);
});

test('shared chat refreshes reactions and can reveal a hidden user again', async () => {
  let blocked = [{ id: 'hidden', displayName: 'Hidden' }];
  let reacted = false;
  const client = {
    listMessages: async () => ({ ok: true, data: [{ id: 'message', createdAt: '2026-01-01', mine: false }] }),
    getChatMeta: async () => ({ ok: true, data: {
      blockedUsers: blocked,
      reactions: reacted ? [{ messageId: 'message', emoji: '👍', count: 1, reacted: true }] : []
    } }),
    toggleMessageReaction: async () => { reacted = true; return { ok: true }; },
    setChatBlock: async (_userId, shouldBlock) => { if (!shouldBlock) blocked = []; return { ok: true }; }
  };
  const controller = chatTools.create({ client, storage: null, onChange: () => {} });
  controller.setSpace('space');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.snapshot().blockedUsers.length, 1);
  assert.equal(await controller.react('message', '👍'), true);
  assert.equal(controller.snapshot().messages[0].reactions[0].reacted, true);
  assert.equal(await controller.unblock('hidden'), true);
  assert.equal(controller.snapshot().blockedUsers.length, 0);
  controller.dispose();
});

test('shared chat filters messages and edits only through the authenticated client', async () => {
  let body = 'Ancien message';
  const client = {
    listMessages: async () => ({ ok: true, data: [
      { id: 'mine', body, createdAt: '2026-01-01', mine: true, author: { displayName: 'Florian' } },
      { id: 'other', body: 'Une découverte', createdAt: '2026-01-02', mine: false, author: { displayName: 'Alice' } }
    ] }),
    getChatMeta: async () => ({ ok: true, data: { reactions: [], blockedUsers: [], editedMessages: [] } }),
    editMessage: async (messageId, nextBody) => { assert.equal(messageId, 'mine'); body = nextBody; return { ok: true }; }
  };
  const controller = chatTools.create({ client, storage: null, onChange: () => {} });
  controller.setSpace('space');
  await new Promise((resolve) => setImmediate(resolve));
  controller.setQuery('decouverte');
  assert.deepEqual(Array.from(controller.snapshot().messages, (message) => message.id), ['other']);
  controller.setQuery('');
  controller.startEditing(controller.snapshot().messages[0]);
  controller.setEditDraft('Nouveau message');
  assert.equal(await controller.edit(), true);
  assert.equal(controller.snapshot().messages[0].body, 'Nouveau message');
  assert.equal(controller.snapshot().notice, 'edited');
  controller.dispose();
});

test('shared chat full screen expands the panel and resets with its space', async () => {
  const controller = chatTools.create({
    client: { listMessages: async () => ({ ok: true, data: [] }) },
    storage: null,
    onChange: () => {}
  });
  controller.setSpace('space');
  await new Promise((resolve) => setImmediate(resolve));
  controller.setFullscreen(true);
  assert.equal(controller.snapshot().fullscreen, true);
  assert.equal(controller.snapshot().expanded, true);
  controller.setFullscreen(false);
  assert.equal(controller.snapshot().fullscreen, false);
  controller.setFullscreen(true);
  controller.setSpace('');
  assert.equal(controller.snapshot().fullscreen, false);
  controller.dispose();
});

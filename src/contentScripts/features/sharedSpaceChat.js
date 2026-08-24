(() => {
  const MAX_MESSAGE_LENGTH = 500;
  const POLL_INTERVAL_MS = 5000;
  const READ_KEY_PREFIX = 'tfr-shared-chat-read:';
  const REACTIONS = Object.freeze(['👍', '❤️', '😂', '👀']);

  const normalizeMessageBody = (value) => String(value || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  const normalizeSearch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const normalizeMessages = (value) => (Array.isArray(value) ? value : [])
    .filter((message) => message && typeof message.id === 'string')
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));

  const create = ({ client, storage = globalThis.localStorage, onChange = () => {}, pollInterval = POLL_INTERVAL_MS }) => {
    let spaceId = '';
    let messages = [];
    let replyTo = null;
    let draft = '';
    let loading = false;
    let sending = false;
    let error = '';
    let timer = null;
    let expanded = false;
    let hasOlder = false;
    let loadingOlder = false;
    let reactions = [];
    let blockedUsers = [];
    let notice = '';
    let editedMessages = [];
    let query = '';
    let editingMessage = null;
    let editDraft = '';
    let fullscreen = false;

    const readKey = () => `${READ_KEY_PREFIX}${spaceId}`;
    const getLastReadAt = () => {
      try { return storage?.getItem?.(readKey()) || ''; } catch { return ''; }
    };
    const markRead = () => {
      const latest = messages.at(-1)?.createdAt || new Date().toISOString();
      try { storage?.setItem?.(readKey(), latest); } catch {}
    };
    const snapshot = () => {
      const lastReadAt = getLastReadAt();
      const normalizedQuery = normalizeSearch(query);
      const enrichedMessages = messages
        .map((message) => ({
          ...message,
          editedAt: editedMessages.find((entry) => entry.messageId === message.id)?.editedAt || '',
          reactions: reactions.filter((reaction) => reaction.messageId === message.id)
        }))
        .filter((message) => !normalizedQuery || normalizeSearch([
          message.body,
          message.author?.displayName,
          message.author?.login
        ].join(' ')).includes(normalizedQuery));
      return {
        spaceId, messages: enrichedMessages, blockedUsers: [...blockedUsers], replyTo, draft,
        query, editingMessage, editDraft, fullscreen, loading, loadingOlder, sending, error, notice, expanded, hasOlder,
        unreadCount: expanded ? 0 : messages.filter((message) => !message.mine && String(message.createdAt || '') > lastReadAt).length
      };
    };
    const notify = () => onChange(snapshot());
    const load = async ({ quiet = false, before = null } = {}) => {
      if (!spaceId || loading) return snapshot();
      const requestedSpaceId = spaceId;
      loadingOlder = Boolean(before);
      loading = !quiet || loadingOlder;
      if (!quiet) notify();
      const [response, metaResponse] = await Promise.all([
        client.listMessages(requestedSpaceId, before, 50),
        !before && typeof client.getChatMeta === 'function'
          ? client.getChatMeta(requestedSpaceId)
          : Promise.resolve(null)
      ]);
      if (spaceId !== requestedSpaceId) return snapshot();
      loading = false;
      loadingOlder = false;
      if (response?.ok) {
        const received = normalizeMessages(response.data);
        hasOlder = received.length === 50;
        if (before) {
          const merged = new Map([...received, ...messages].map((message) => [message.id, message]));
          messages = normalizeMessages([...merged.values()]);
        } else if (quiet && messages.length) {
          const merged = new Map([...messages, ...received].map((message) => [message.id, message]));
          messages = normalizeMessages([...merged.values()]);
        } else {
          messages = received;
        }
        error = '';
        if (metaResponse?.ok) {
          reactions = Array.isArray(metaResponse.data?.reactions) ? metaResponse.data.reactions : [];
          editedMessages = Array.isArray(metaResponse.data?.editedMessages) ? metaResponse.data.editedMessages : [];
          blockedUsers = Array.isArray(metaResponse.data?.blockedUsers) ? metaResponse.data.blockedUsers : [];
        }
        if (expanded) markRead();
      } else {
        error = response?.message || 'chat_unavailable';
      }
      notify();
      return snapshot();
    };
    const schedule = () => {
      if (timer || !spaceId) return;
      timer = globalThis.setInterval(() => load({ quiet: true }), pollInterval);
    };
    const setSpace = (nextSpaceId) => {
      const normalized = String(nextSpaceId || '');
      if (normalized === spaceId) return;
      spaceId = normalized;
      messages = [];
      replyTo = null;
      draft = '';
      error = '';
      notice = '';
      reactions = [];
      blockedUsers = [];
      editedMessages = [];
      query = '';
      editingMessage = null;
      editDraft = '';
      fullscreen = false;
      loading = false;
      loadingOlder = false;
      hasOlder = false;
      if (spaceId) { schedule(); void load(); }
      else stop();
    };
    const setExpanded = (value) => {
      expanded = value === true;
      if (expanded) markRead();
      notify();
    };
    const send = async (body = draft) => {
      const normalized = normalizeMessageBody(body);
      if (!spaceId || !normalized || sending) return false;
      sending = true; error = ''; notice = ''; notify();
      const response = await client.sendMessage(spaceId, normalized, replyTo?.id || null);
      sending = false;
      if (!response?.ok) { error = response?.message || 'send_failed'; notify(); return false; }
      replyTo = null;
      draft = '';
      await load({ quiet: true });
      return true;
    };
    const remove = async (messageId) => {
      const response = await client.deleteMessage(messageId);
      if (!response?.ok) { error = response?.message || 'delete_failed'; notify(); return false; }
      await load({ quiet: true }); return true;
    };
    const report = async (messageId, reason = 'inappropriate') => {
      const response = await client.reportMessage(messageId, reason);
      error = response?.ok ? '' : (response?.message || 'report_failed');
      notice = response?.ok ? 'reported' : '';
      notify();
      return response?.ok === true;
    };
    const block = async (user) => {
      const userId = typeof user === 'string' ? user : user?.id;
      const response = await client.setChatBlock(userId, true);
      if (!response?.ok) { error = response?.message || 'block_failed'; notify(); return false; }
      messages = messages.filter((message) => message.author?.id !== userId);
      await load({ quiet: true }); return true;
    };
    const unblock = async (userId) => {
      const response = await client.setChatBlock(userId, false);
      if (!response?.ok) { error = response?.message || 'unblock_failed'; notify(); return false; }
      await load({ quiet: true }); return true;
    };
    const react = async (messageId, emoji) => {
      const response = await client.toggleMessageReaction(messageId, emoji);
      if (!response?.ok) { error = response?.message || 'reaction_failed'; notify(); return false; }
      await load({ quiet: true }); return true;
    };
    const edit = async () => {
      const body = normalizeMessageBody(editDraft);
      if (!editingMessage?.id || !body) return false;
      const response = await client.editMessage(editingMessage.id, body);
      if (!response?.ok) { error = response?.message || 'edit_failed'; notify(); return false; }
      messages = messages.map((message) => message.id === editingMessage.id ? { ...message, body } : message);
      editingMessage = null;
      editDraft = '';
      notice = 'edited';
      await load({ quiet: true }); return true;
    };
    const stop = () => {
      if (timer) globalThis.clearInterval(timer);
      timer = null;
    };
    const dispose = () => { stop(); messages = []; replyTo = null; };

    return Object.freeze({
      snapshot, load, setSpace, setExpanded, send, remove, report, block, unblock, react, edit, dispose,
      loadOlder() { return messages[0]?.createdAt ? load({ before: messages[0].createdAt }) : snapshot(); },
      setDraft(value) { draft = String(value || '').slice(0, MAX_MESSAGE_LENGTH); },
      setQuery(value) { query = String(value || '').slice(0, 80); notify(); },
      setFullscreen(value) { fullscreen = value === true; if (fullscreen) expanded = true; notify(); },
      startEditing(message) { editingMessage = message || null; editDraft = message?.body || ''; notify(); },
      setEditDraft(value) { editDraft = String(value || '').slice(0, MAX_MESSAGE_LENGTH); },
      cancelEditing() { editingMessage = null; editDraft = ''; notify(); },
      setReplyTo(message) { replyTo = message || null; notify(); },
      clearError() { error = ''; notice = ''; notify(); }
    });
  };

  window.TFRSharedSpaceChat = Object.freeze({ create, normalizeMessageBody, normalizeMessages, normalizeSearch, REACTIONS, MAX_MESSAGE_LENGTH });
})();

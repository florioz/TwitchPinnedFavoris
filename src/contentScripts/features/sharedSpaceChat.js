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

  const create = ({ client, storage = globalThis.localStorage, onChange = () => {}, pollInterval = POLL_INTERVAL_MS, documentRef = globalThis.document, now = Date.now }) => {
    let spaceId = '';
    let generation = 0;
    let inFlight = false;
    let lastPollAt = 0;
    let nextPollDelay = pollInterval;
    let lastPayload = '';
    let disposed = false;
    let unsubscribeRealtime = null;
    let realtimeReady = false;
    let realtimeEpoch = 0;
    let changeTimer = null;
    let reloadPending = false;
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
      const editsByMessage = new Map(editedMessages.map(entry => [entry.messageId, entry.editedAt]));
      const reactionsByMessage = new Map();
      for (const reaction of reactions) {
        const list = reactionsByMessage.get(reaction.messageId) || [];
        list.push(reaction);
        reactionsByMessage.set(reaction.messageId, list);
      }
      const enrichedMessages = messages
        .map((message) => ({
          ...message,
          editedAt: editsByMessage.get(message.id) || '',
          reactions: reactionsByMessage.get(message.id) || []
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
      if (!spaceId || disposed) return snapshot();
      if (inFlight) return snapshot();
      inFlight = true;
      lastPollAt = now();
      const requestGeneration = generation;
      try {
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
      if (generation !== requestGeneration || disposed) return snapshot();
      loading = false;
      loadingOlder = false;
      if (response?.ok) {
        const payload = JSON.stringify([response.data, metaResponse?.data]);
        if (!before) {
          nextPollDelay = payload === lastPayload ? Math.min(30000, nextPollDelay * 2) : pollInterval;
          lastPayload = payload;
        }
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
        nextPollDelay = 60000;
      }
      notify();
      return snapshot();
      } catch (failure) {
        if (generation === requestGeneration && !disposed) {
          error = failure?.message || 'chat_unavailable';
          nextPollDelay = 60000;
          loading = false;
          loadingOlder = false;
          notify();
        }
        return snapshot();
      } finally {
        if (generation === requestGeneration) {
          inFlight = false;
          if (reloadPending && !disposed && !documentRef?.hidden) {
            reloadPending = false;
            void load({ quiet: true });
          }
        }
      }
    };
    const stopRealtime = () => {
      realtimeEpoch += 1;
      unsubscribeRealtime?.(); unsubscribeRealtime = null;
      realtimeReady = false;
      globalThis.clearTimeout?.(changeTimer); changeTimer = null;
    };
    const updateRealtime = () => {
      if (!spaceId || !expanded || documentRef?.hidden || disposed) { stopRealtime(); return; }
      if (unsubscribeRealtime || !client.subscribeChat) return;
      const epoch = ++realtimeEpoch;
      try {
        unsubscribeRealtime = client.subscribeChat(spaceId, event => {
          if (epoch !== realtimeEpoch || disposed) return;
          if (event.type === 'status') realtimeReady = event.ready === true;
          if (event.disconnected) { unsubscribeRealtime = null; realtimeEpoch += 1; }
          if (event.type !== 'changed' && !(event.type === 'status' && event.ready)) return;
          if (changeTimer) return;
          changeTimer = globalThis.setTimeout(() => {
            changeTimer = null;
            if (epoch === realtimeEpoch && !documentRef?.hidden) {
              if (inFlight) reloadPending = true; else void load({ quiet: true });
            }
          }, 150);
        });
      } catch { realtimeReady = false; }
    };
    const poll = () => {
      if (documentRef?.hidden || inFlight || !spaceId || disposed) return;
      updateRealtime();
      const delay = expanded ? (realtimeReady ? 60000 : pollInterval) : Math.max(60000, nextPollDelay);
      if (now() - lastPollAt >= delay) void load({ quiet: true });
    };
    const handleVisibility = () => {
      updateRealtime();
      if (!documentRef?.hidden && spaceId && !disposed) void load({ quiet: true });
    };
    documentRef?.addEventListener?.('visibilitychange', handleVisibility);
    const schedule = () => {
      if (timer || !spaceId) return;
      timer = globalThis.setInterval(poll, pollInterval);
    };
    const setSpace = (nextSpaceId) => {
      const normalized = String(nextSpaceId || '');
      if (normalized === spaceId) return;
      stopRealtime();
      generation += 1;
      reloadPending = false;
      inFlight = false;
      nextPollDelay = pollInterval;
      lastPayload = '';
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
      if (spaceId) { schedule(); if (!documentRef?.hidden) void load(); }
      else stop();
      updateRealtime();
    };
    const setExpanded = (value) => {
      const opening = !expanded && value === true;
      expanded = value === true;
      updateRealtime();
      if (expanded) markRead();
      if (opening && !documentRef?.hidden) void load({ quiet: true });
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
    const dispose = () => {
      disposed = true; generation += 1; stop(); stopRealtime();
      documentRef?.removeEventListener?.('visibilitychange', handleVisibility);
      messages = []; reactions = []; editedMessages = []; blockedUsers = []; replyTo = null;
    };

    return Object.freeze({
      snapshot, load, setSpace, setExpanded, send, remove, report, block, unblock, react, edit, dispose,
      loadOlder() { return messages[0]?.createdAt ? load({ before: messages[0].createdAt }) : snapshot(); },
      setDraft(value) { draft = String(value || '').slice(0, MAX_MESSAGE_LENGTH); },
      setQuery(value) { query = String(value || '').slice(0, 80); notify(); },
      setFullscreen(value) { fullscreen = value === true; if (fullscreen) setExpanded(true); else notify(); },
      startEditing(message) { editingMessage = message || null; editDraft = message?.body || ''; notify(); },
      setEditDraft(value) { editDraft = String(value || '').slice(0, MAX_MESSAGE_LENGTH); },
      cancelEditing() { editingMessage = null; editDraft = ''; notify(); },
      setReplyTo(message) { replyTo = message || null; notify(); },
      clearError() { error = ''; notice = ''; notify(); }
    });
  };

  window.TFRSharedSpaceChat = Object.freeze({ create, normalizeMessageBody, normalizeMessages, normalizeSearch, REACTIONS, MAX_MESSAGE_LENGTH });
})();

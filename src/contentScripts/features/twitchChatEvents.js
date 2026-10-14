(() => {
  'use strict';
  const MAX_TRACKED_ENTRIES = 2000;
  const ROUTE_POLL_MS = 1000;
  const CONNECTION_IDLE_MS = 180000;
  const MAX_RETRY_DELAY_MS = 60000;
  const IRC_ENDPOINT = 'wss://irc-ws.chat.twitch.tv:443';
  const decode = value => String(value || '').replace(/\\([s:nr\\])/g, (_, c) => ({ s: ' ', ':': ';', n: '\n', r: '\r', '\\': '\\' }[c]));
  const parse = line => {
    const match = String(line).match(/^(?:@([^ ]+) )?:([^ ]+) (PRIVMSG|CLEARCHAT|CLEARMSG) #([a-z0-9_]+)(?: :(.*))?$/);
    if (!match) return null;
    const tags = Object.fromEntries((match[1] || '').split(';').filter(Boolean).map(part => {
      const i = part.indexOf('='); return [i < 0 ? part : part.slice(0, i), decode(i < 0 ? '' : part.slice(i + 1))];
    }));
    const [, , prefix, command, channel, text = ''] = match;
    if (command !== 'PRIVMSG' && prefix !== 'tmi.twitch.tv') return null;
    const timestamp = Number(tags['tmi-sent-ts']);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    if (command === 'PRIVMSG') {
      const login = prefix.match(/^([a-z0-9_]+)![^@]+@[^ ]+\.tmi\.twitch\.tv$/)?.[1];
      if (!login || !tags.id || !tags['user-id']) return null;
      return { command, channel, timestamp, messageId: tags.id, userId: tags['user-id'], login,
        displayName: tags['display-name'] || login, text };
    }
    if (command === 'CLEARMSG') {
      if (!tags['target-msg-id'] || !/^[a-z0-9_]+$/i.test(tags.login || '')) return null;
      return { command, channel, timestamp, messageId: tags['target-msg-id'], login: tags.login.toLowerCase(), type: 'deletion', text };
    }
    if (!text) return { command, channel, timestamp, type: 'clear' };
    if (!/^[a-z0-9_]+$/i.test(text) || !tags['target-user-id']) return null;
    const hasDuration = Object.hasOwn(tags, 'ban-duration');
    const duration = hasDuration ? Number(tags['ban-duration']) : null;
    if (hasDuration && (!Number.isInteger(duration) || duration <= 0)) return null;
    return { command, channel, timestamp, login: text.toLowerCase(), userId: tags['target-user-id'],
      type: hasDuration ? 'timeout' : 'ban', duration, isPermanent: !hasDuration };
  };

  const getChannel = (pathname = '') => {
    const path = String(pathname).toLowerCase();
    const match = path.match(/^\/([a-z0-9_]+)\/?$/) || path.match(/^\/(?:popout|embed)\/([a-z0-9_]+)\/chat\/?$/);
    return match && !['directory', 'downloads', 'settings', 'inventory', 'wallet', 'subscriptions', 'videos', 'search'].includes(match[1]) ? match[1] : '';
  };

  const create = ({ windowRef = window, Socket = WebSocket, now = Date.now } = {}) => {
    const listeners = new Set();
    const messages = new Map();
    const deletions = new Map();
    const sanctions = new Map();
    let channel = '', socket = null, timer = null, retryAt = 0, failures = 0, lastReceived = 0;
    let clearAt = 0;
    const boundedSet = (map, key, value) => {
      map.set(key, value);
      while (map.size > MAX_TRACKED_ENTRIES) map.delete(map.keys().next().value);
    };
    const emit = event => listeners.forEach(listener => { try { listener(event); } catch (error) { console.error('[TFR] chat event listener', error); } });
    const accept = event => {
      if (!event || event.channel !== channel) return;
      if (event.command === 'PRIVMSG') {
        boundedSet(messages, event.messageId, event);
        // The message may arrive after its deletion event.
        const sanction = sanctions.get(event.userId);
        if (deletions.has(event.messageId) || event.timestamp <= clearAt
          || (sanction && event.timestamp <= sanction.timestamp)) emit({ type: 'refresh', channel });
        return;
      }
      if (event.type === 'clear') { clearAt = Math.max(clearAt, event.timestamp); emit({ type: 'refresh', channel }); return; }
      const map = event.type === 'deletion' ? deletions : sanctions;
      const key = event.type === 'deletion' ? event.messageId : event.userId;
      if (Number(map.get(key)?.timestamp || 0) >= event.timestamp) return;
      boundedSet(map, key, event);
      emit({ ...event, source: 'twitch-irc', channel: `/${event.channel}`, detectedAt: event.timestamp,
        id: `${event.command}:${event.channel}:${key}:${event.timestamp}`, rawMessage: '', offenseMessage: event.text || null });
    };
    const clearChannelMessages = () => {
      messages.clear();
      deletions.clear();
      sanctions.clear();
      clearAt = 0;
    };
    const close = () => {
      const old = socket;
      socket = null;
      old?.close();
    };
    const resetChannel = next => {
      close();
      channel = next;
      clearChannelMessages();
      retryAt = 0;
      failures = 0;
      emit({ type: 'reset', channel: `/${channel}` });
    };
    const route = () => {
      const next = getChannel(windowRef.location.pathname);
      if (next !== channel) resetChannel(next);
      if (!channel || !listeners.size) return;
      if (socket && now() - lastReceived > CONNECTION_IDLE_MS) close();
      if (socket || now() < retryAt) return;
      try {
        const current = new Socket(IRC_ENDPOINT);
        socket = current; lastReceived = now();
        current.onopen = () => {
          if (socket !== current) return;
          current.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
          current.send(`NICK justinfan${Math.floor(Math.random() * 90000000 + 10000000)}`);
          current.send(`JOIN #${channel}`);
        };
        current.onmessage = ({ data }) => {
          // Navigation can happen before the next route polling tick.
          route();
          if (socket !== current || typeof data !== 'string') return;
          lastReceived = now();
          for (const line of data.split('\r\n')) {
            if (line.startsWith('PING :')) { current.send(`PONG :${line.slice(6)}`); continue; }
            if (line.includes(' 001 ')) failures = 0;
            if (line === ':tmi.twitch.tv RECONNECT') { current.close(); continue; }
            accept(parse(line));
          }
        };
        current.onerror = () => current.close();
        current.onclose = () => {
          if (socket !== current) return;
          socket = null; retryAt = now() + Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** Math.min(++failures, 6));
        };
      } catch { retryAt = now() + 30000; }
    };
    const getMessageState = id => {
      if (getChannel(windowRef.location.pathname) !== channel) return null;
      const message = messages.get(id);
      const deletion = deletions.get(id);
      if (!message) return deletion ? { deleted: true, action: deletion, message: null } : null;
      const sanction = sanctions.get(message.userId);
      const deleted = Boolean(deletion || message.timestamp <= clearAt || (sanction && message.timestamp <= sanction.timestamp));
      return { message, deleted, action: deleted ? sanction || deletion || { type: 'deletion' } : null };
    };
    const getActionMessage = action => {
      if (!channel || getChannel(windowRef.location.pathname) !== channel || action.channel !== `/${channel}`) return null;
      if (action.type === 'deletion') return messages.get(action.messageId) || null;
      if (!action.userId) return null;
      let latest = null;
      for (const message of messages.values()) {
        if (message.userId === action.userId && message.timestamp <= action.timestamp
          && (!latest || message.timestamp > latest.timestamp)) latest = message;
      }
      return latest;
    };
    return Object.freeze({
      getActionMessage,
      subscribe(listener) {
        listeners.add(listener);
        if (!timer) { route(); timer = windowRef.setInterval(route, ROUTE_POLL_MS); }
        return () => {
          listeners.delete(listener);
          if (!listeners.size) {
            windowRef.clearInterval(timer);
            timer = null;
            close();
            channel = '';
            clearChannelMessages();
          }
        };
      },
      getMessageState
    });
  };
  let shared;
  window.TFRTwitchChatEvents = Object.freeze({ parse, create, getChannel, getShared: () => shared || (shared = create()) });
})();

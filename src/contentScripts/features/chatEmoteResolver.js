(() => {
  const SEVENTV_USER_ENDPOINT = 'https://7tv.io/v3/users/twitch/';
  const SEVENTV_GLOBAL_ENDPOINT = 'https://7tv.io/v3/emote-sets/global';
  const TWITCH_GQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const BLOCKED_ROUTES = new Set([
    'directory', 'p', 'jobs', 'downloads', 'friends', 'messages', 'settings', 'subscriptions'
  ]);

  const getCurrentChannelLogin = () => {
    const candidate = window.location.pathname.match(/^\/([^/?#]+)/)?.[1]?.toLowerCase() || '';
    return candidate && !BLOCKED_ROUTES.has(candidate) ? candidate : '';
  };

  class ChatEmoteResolver {
    constructor() {
      this.channelLogin = '';
      this.emotes = new Map();
      this.loadingPromise = null;
      this.lastAttempt = 0;
    }

    async ensureLoaded() {
      const login = getCurrentChannelLogin();
      if (!login && this.emotes.size) return;
      if (this.channelLogin === login && this.emotes.size) return;
      if (this.loadingPromise) return this.loadingPromise;
      const now = Date.now();
      if (this.channelLogin === login && now - this.lastAttempt < 60_000) return;
      this.channelLogin = login;
      this.lastAttempt = now;
      this.loadingPromise = this.load(login).finally(() => { this.loadingPromise = null; });
      return this.loadingPromise;
    }

    async load(login) {
      const next = await this.fetchSevenTvEmotes(SEVENTV_GLOBAL_ENDPOINT);
      const channelId = login ? await this.fetchTwitchUserId(login) : '';
      if (channelId) {
        const channelEmotes = await this.fetchSevenTvEmotes(
          `${SEVENTV_USER_ENDPOINT}${encodeURIComponent(channelId)}`,
          true
        );
        channelEmotes.forEach((emote, name) => next.set(name, emote));
      }
      this.emotes = next;
    }

    async fetchSevenTvEmotes(url, nested = false) {
      try {
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) return new Map();
        const payload = await response.json().catch(() => null);
        const emotes = nested ? payload?.emote_set?.emotes : payload?.emotes;
        const result = new Map();
        if (Array.isArray(emotes)) {
          emotes.forEach((entry) => {
            const name = entry?.name || entry?.data?.name;
            const id = entry?.id || entry?.data?.id;
            if (name && id) result.set(name, { name, url: `https://cdn.7tv.app/emote/${id}/2x.webp` });
          });
        }
        return result;
      } catch {
        return new Map();
      }
    }

    async fetchTwitchUserId(login) {
      try {
        const response = await fetch(TWITCH_GQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationName: 'TfrChatUserId',
            query: 'query TfrChatUserId($login: String!) { user(login: $login) { id } }',
            variables: { login }
          })
        });
        if (!response.ok) return '';
        return (await response.json().catch(() => null))?.data?.user?.id || '';
      } catch {
        return '';
      }
    }

    enrichParts(parts) {
      if (!this.emotes.size || !Array.isArray(parts)) return Array.isArray(parts) ? parts : [];
      const result = [];
      parts.forEach((part) => {
        if (!part || part.type !== 'text' || !part.text) {
          result.push(part);
          return;
        }
        String(part.text).split(/(\s+)/).forEach((token) => {
          if (!token) return;
          const match = token.match(/^([^A-Za-z0-9_]*)([A-Za-z0-9_][A-Za-z0-9_\-]*)([^A-Za-z0-9_]*)$/);
          const candidate = match?.[2] || token;
          const emote = this.emotes.get(candidate);
          if (emote) {
            if (match?.[1]) result.push({ type: 'text', text: match[1] });
            result.push({ type: 'emote', name: candidate, url: emote.url, provider: '7tv' });
            if (match?.[3]) result.push({ type: 'text', text: match[3] });
          } else if (result.at(-1)?.type === 'text') {
            result.at(-1).text += token;
          } else {
            result.push({ type: 'text', text: token });
          }
        });
      });
      return result;
    }
  }

  window.TFRChatEmoteResolver = { create: () => new ChatEmoteResolver() };
})();

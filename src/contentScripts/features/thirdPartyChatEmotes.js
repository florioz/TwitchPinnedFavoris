(() => {
  const create = ({ t, findChatContainer, scheduleChatRetry, clearChatRetry, visitMatchingElements,
    messageSelector, messageBodySelector }) => {
    const EMOTE_MESSAGE_SELECTOR = `${messageSelector}, .vod-message, .video-chat__message`;
    const MESSAGE_BODY_SELECTOR = messageBodySelector;
    const EmoteAutocomplete = window.TFRChatEmoteAutocomplete?.ChatEmoteAutocomplete;
    const ChatEmotePicker = window.TFRChatEmotePicker?.ChatEmotePicker;
    const emoteCatalog = window.TFRChatEmoteCatalog;
    if (!EmoteAutocomplete || !ChatEmotePicker || !emoteCatalog) throw new Error('Chat emote dependencies are missing');
    const TWITCH_GQL_ENDPOINT = 'https://gql.twitch.tv/gql';
    const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

    const currentLogin = () => {
      const login = window.location.pathname.match(/^\/([^/?#]+)/)?.[1]?.toLowerCase() || '';
      return new Set(['directory', 'downloads', 'jobs', 'p', 'settings', 'subscriptions']).has(login) ? '' : login;
    };

    class ThirdPartyChatEmotes {
      constructor() {
        this.enabledSevenTv = false;
        this.enabledBetterTtv = false;
        this.autocompleteEnabled = false;
        this.pickerEnabled = false;
        this.emotes = new Map();
        this.autocompleteEmotes = new Map();
        this.channelLogin = '';
        this.pagePath = '';
        this.observer = null;
        this.container = null;
        this.retryTimer = null;
        this.pendingReplyContext = null;
        this.locationTimer = null;
        this.loadGeneration = 0;
        this.tooltip = window.TFRChatEmoteTooltip.create(document, window);
        this.autocomplete = new EmoteAutocomplete(document, window);
        this.picker = new ChatEmotePicker({ documentRef: document, windowRef: window, t });
        this.renderScheduler = window.TFRDomWorkScheduler.create({
          process: (node) => this.scanNode(node),
          maxBatchSize: 10
        });
      }

      init() {
        this.locationTimer = window.setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          if (window.location.pathname !== this.pagePath) this.reload();
          if (!this.container?.isConnected) this.observeChat();
        }, 2000);
      }

      dispose() {
        ++this.loadGeneration;
        this.observer?.disconnect();
        clearChatRetry(this);
        clearInterval(this.locationTimer);
        this.observer = null;
        this.locationTimer = null;
        this.emotes.clear();
        this.autocompleteEmotes.clear();
        this.renderScheduler.dispose();
        this.tooltip.dispose();
        this.autocomplete.dispose();
        this.picker.dispose();
      }

      configure({ sevenTvEnabled, betterTtvEnabled, autocompleteEnabled, pickerEnabled }) {
        const nextSevenTv = Boolean(sevenTvEnabled);
        const nextBetterTtv = Boolean(betterTtvEnabled);
        const nextAutocomplete = Boolean(autocompleteEnabled);
        const nextPicker = Boolean(pickerEnabled) && (nextSevenTv || nextBetterTtv);
        const providersChanged = nextSevenTv !== this.enabledSevenTv || nextBetterTtv !== this.enabledBetterTtv;
        const autocompleteChanged = nextAutocomplete !== this.autocompleteEnabled;
        const pickerChanged = nextPicker !== this.pickerEnabled;
        if (
          !providersChanged
          && !autocompleteChanged
          && !pickerChanged
        ) return;
        this.enabledSevenTv = nextSevenTv;
        this.enabledBetterTtv = nextBetterTtv;
        this.autocompleteEnabled = nextAutocomplete;
        this.pickerEnabled = nextPicker;
        this.autocomplete.setEnabled(nextAutocomplete);
        this.picker.setEnabled(nextPicker);
        if (providersChanged || autocompleteChanged) this.reload();
      }

      async reload() {
        const generation = ++this.loadGeneration;
        this.pagePath = window.location.pathname;
        const videoId = this.pagePath.match(/^\/videos\/(\d+)/)?.[1];
        this.channelLogin = videoId ? '' : currentLogin();
        this.emotes.clear();
        this.autocompleteEmotes.clear();
        this.autocomplete.setEmotes([]);
        this.picker.setEmotes([]);
        this.observer?.disconnect();
        this.observer = null;
        if (!this.enabledSevenTv && !this.enabledBetterTtv && !this.autocompleteEnabled) {
          this.tooltip.bind(null);
          return;
        }
        const channelId = videoId ? await this.fetchVideoOwnerId(videoId)
          : this.channelLogin ? await this.fetchTwitchUserId(this.channelLogin) : '';
        if (generation !== this.loadGeneration || this.pagePath !== window.location.pathname) return;
        const [sevenTvEmotes, betterTtvEmotes] = await Promise.all([
          (this.enabledSevenTv || this.autocompleteEnabled) ? this.fetchSevenTv(channelId) : new Map(),
          (this.enabledBetterTtv || this.autocompleteEnabled) ? this.fetchBetterTtv(channelId) : new Map()
        ]);
        if (generation !== this.loadGeneration || this.pagePath !== window.location.pathname) return;
        this.autocompleteEmotes = emoteCatalog.merge(sevenTvEmotes, betterTtvEmotes);
        this.emotes = emoteCatalog.merge(
          this.enabledSevenTv ? sevenTvEmotes : null,
          this.enabledBetterTtv ? betterTtvEmotes : null
        );
        this.autocomplete.setEmotes(this.autocompleteEmotes);
        this.picker.setEmotes(this.emotes);
        if (!this.enabledSevenTv && !this.enabledBetterTtv) {
          this.tooltip.bind(null);
          return;
        }
        this.observeChat();
        this.renderExisting();
      }

      async fetchJson(url, options) {
        try {
          const response = await fetch(url, { credentials: 'omit', ...options });
          return response.ok ? await response.json() : null;
        } catch {
          return null;
        }
      }

      async fetchVideoOwnerId(videoId) {
        const payload = await this.fetchJson(TWITCH_GQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationName: 'TfrEmoteVideoOwner',
            query: 'query TfrEmoteVideoOwner($id: ID!) { video(id: $id) { owner { id } } }',
            variables: { id: videoId }
          })
        });
        return payload?.data?.video?.owner?.id || '';
      }

      async fetchTwitchUserId(login) {
        const payload = await this.fetchJson(TWITCH_GQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationName: 'TfrEnhancementUserId',
            query: 'query TfrEnhancementUserId($login: String!) { user(login: $login) { id } }',
            variables: { login }
          })
        });
        return payload?.data?.user?.id || '';
      }

      async fetchSevenTv(channelId) {
        const target = new Map();
        const [globalSet, channelSet] = await Promise.all([
          this.fetchJson('https://7tv.io/v3/emote-sets/global'),
          channelId ? this.fetchJson(`https://7tv.io/v3/users/twitch/${encodeURIComponent(channelId)}`) : null
        ]);
        emoteCatalog.appendSevenTv(target, globalSet);
        emoteCatalog.appendSevenTv(target, channelSet);
        return target;
      }

      async fetchBetterTtv(channelId) {
        const target = new Map();
        const [globalEmotes, channel] = await Promise.all([
          this.fetchJson('https://api.betterttv.net/3/cached/emotes/global'),
          channelId ? this.fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(channelId)}`) : null
        ]);
        emoteCatalog.appendBetterTtv(target, globalEmotes);
        emoteCatalog.appendBetterTtv(target, channel?.channelEmotes);
        emoteCatalog.appendBetterTtv(target, channel?.sharedEmotes);
        return target;
      }

      observeChat() {
        if (!this.enabledSevenTv && !this.enabledBetterTtv) return;
        const container = findChatContainer() || document.querySelector('.video-chat__message-list-wrapper, .video-chat__message-list');
        if (!container) {
          scheduleChatRetry(this, () => this.observeChat());
          return;
        }
        if (container === this.container && this.observer) return;
        this.container = container;
        this.tooltip.bind(container);
        this.observer?.disconnect();
        this.observer = new MutationObserver((mutations) => {
          if (document.visibilityState === 'hidden') return;
          const startedAt = window.TFRPerformance?.now?.();
          mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => this.renderScheduler.enqueue(node)));
          if (startedAt !== undefined) window.TFRPerformance?.report?.('emotes.renderMessages', startedAt);
        });
        this.observer.observe(container, { childList: true, subtree: true });
      }

      renderExisting() {
        this.container?.querySelectorAll(EMOTE_MESSAGE_SELECTOR).forEach((message) => this.renderMessage(message));
      }

      scanNode(node) {
        visitMatchingElements(node, EMOTE_MESSAGE_SELECTOR, (message) => this.renderMessage(message));
      }

      renderMessage(message) {
        if (!this.emotes.size) return;
        const body = message.querySelector(MESSAGE_BODY_SELECTOR)
          || message.querySelector('.vod-message__text, .video-chat__message-text');
        const bodies = body ? [body] : Array.from(message.querySelectorAll('.text-fragment'));
        bodies.forEach(fragment => this.renderTextFragment(fragment));
      }

      renderTextFragment(body) {
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => node.parentElement?.closest('.tfr-chat-emote, a, button, [data-a-target="chat-badge"]')
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT
        });
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        textNodes.forEach((textNode) => this.replaceTextNode(textNode));
      }

      replaceTextNode(textNode) {
        const tokens = String(textNode.nodeValue || '').split(/(\s+)/);
        if (!tokens.some((token) => this.emotes.has(token))) return;
        const fragment = document.createDocumentFragment();
        tokens.forEach((token) => {
          const emote = this.emotes.get(token);
          if (!emote) {
            fragment.appendChild(document.createTextNode(token));
            return;
          }
          const image = document.createElement('img');
          image.className = 'tfr-chat-emote';
          image.src = emote.url;
          image.alt = emote.name;
          image.dataset.tfrEmoteName = emote.name;
          image.dataset.tfrEmoteProvider = emote.provider;
          image.setAttribute('aria-label', `${emote.name}, ${emote.provider}`);
          image.loading = 'lazy';
          image.decoding = 'async';
          fragment.appendChild(image);
        });
        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    }

    return ThirdPartyChatEmotes;
  };
  window.TFRThirdPartyChatEmotes = Object.freeze({ create });
})();

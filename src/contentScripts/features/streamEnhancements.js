(() => {
  const createStreamEnhancements = ({ t }) => {
    const CHAT_CONTAINER_SELECTORS = [
      '[data-test-selector="chat-scrollable-area__message-container"]',
      '.chat-scrollable-area__message-container',
      '[data-a-target="chat-messages"]',
      '[role="log"][aria-live="polite"]'
    ];
    const MESSAGE_SELECTOR = '[data-a-target="chat-line-message"], [data-test-selector="chat-line-message"], .chat-line__message';
    const MESSAGE_BODY_SELECTOR = '[data-a-target="chat-message-text"], [data-a-target="chat-line-message-body"], [data-test-selector="chat-line-message-body"]';
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
        this.emotes = new Map();
        this.channelLogin = '';
        this.observer = null;
        this.container = null;
        this.retryTimer = null;
        this.pendingReplyContext = null;
        this.locationTimer = null;
        this.loadGeneration = 0;
      }

      init() {
        this.locationTimer = window.setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          const login = currentLogin();
          if (login !== this.channelLogin) this.reload();
          if (!this.container?.isConnected) this.observeChat();
        }, 2000);
      }

      dispose() {
        this.observer?.disconnect();
        clearTimeout(this.retryTimer);
        clearInterval(this.locationTimer);
        this.observer = null;
        this.retryTimer = null;
        this.locationTimer = null;
        this.emotes.clear();
      }

      configure({ sevenTvEnabled, betterTtvEnabled }) {
        const nextSevenTv = Boolean(sevenTvEnabled);
        const nextBetterTtv = Boolean(betterTtvEnabled);
        if (nextSevenTv === this.enabledSevenTv && nextBetterTtv === this.enabledBetterTtv) return;
        this.enabledSevenTv = nextSevenTv;
        this.enabledBetterTtv = nextBetterTtv;
        this.reload();
      }

      async reload() {
        const generation = ++this.loadGeneration;
        this.channelLogin = currentLogin();
        this.emotes.clear();
        this.observer?.disconnect();
        this.observer = null;
        if (!this.enabledSevenTv && !this.enabledBetterTtv) return;
        const channelId = this.channelLogin ? await this.fetchTwitchUserId(this.channelLogin) : '';
        const maps = await Promise.all([
          this.enabledSevenTv ? this.fetchSevenTv(channelId) : new Map(),
          this.enabledBetterTtv ? this.fetchBetterTtv(channelId) : new Map()
        ]);
        if (generation !== this.loadGeneration) return;
        maps.forEach((map) => map.forEach((value, key) => this.emotes.set(key, value)));
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

      addSevenTvEntries(target, payload) {
        const entries = payload?.emotes || payload?.emote_set?.emotes || [];
        entries.forEach((entry) => {
          const id = entry?.id || entry?.data?.id;
          const name = entry?.name || entry?.data?.name;
          if (id && name) target.set(name, { name, provider: '7TV', url: `https://cdn.7tv.app/emote/${id}/2x.webp` });
        });
      }

      async fetchSevenTv(channelId) {
        const target = new Map();
        const [globalSet, channelSet] = await Promise.all([
          this.fetchJson('https://7tv.io/v3/emote-sets/global'),
          channelId ? this.fetchJson(`https://7tv.io/v3/users/twitch/${encodeURIComponent(channelId)}`) : null
        ]);
        this.addSevenTvEntries(target, globalSet);
        this.addSevenTvEntries(target, channelSet);
        return target;
      }

      addBetterTtvEntries(target, entries) {
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
          if (entry?.id && entry?.code) {
            target.set(entry.code, { name: entry.code, provider: 'BetterTTV', url: `https://cdn.betterttv.net/emote/${entry.id}/2x.webp` });
          }
        });
      }

      async fetchBetterTtv(channelId) {
        const target = new Map();
        const [globalEmotes, channel] = await Promise.all([
          this.fetchJson('https://api.betterttv.net/3/cached/emotes/global'),
          channelId ? this.fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(channelId)}`) : null
        ]);
        this.addBetterTtvEntries(target, globalEmotes);
        this.addBetterTtvEntries(target, channel?.channelEmotes);
        this.addBetterTtvEntries(target, channel?.sharedEmotes);
        return target;
      }

      findContainer() {
        for (const selector of CHAT_CONTAINER_SELECTORS) {
          const node = document.querySelector(selector);
          if (node) return node;
        }
        return null;
      }

      observeChat() {
        if (!this.enabledSevenTv && !this.enabledBetterTtv) return;
        const container = this.findContainer();
        if (!container) {
          if (!this.retryTimer) this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            this.observeChat();
          }, 1500);
          return;
        }
        if (container === this.container && this.observer) return;
        this.container = container;
        this.observer?.disconnect();
        this.observer = new MutationObserver((mutations) => {
          if (document.visibilityState === 'hidden') return;
          const startedAt = window.TFRPerformance?.now?.();
          mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => this.scanNode(node)));
          if (startedAt !== undefined) window.TFRPerformance?.report?.('emotes.renderMessages', startedAt);
        });
        this.observer.observe(container, { childList: true, subtree: true });
      }

      renderExisting() {
        this.container?.querySelectorAll(MESSAGE_SELECTOR).forEach((message) => this.renderMessage(message));
      }

      scanNode(node) {
        if (!(node instanceof Element)) return;
        if (node.matches(MESSAGE_SELECTOR)) this.renderMessage(node);
        const parentMessage = node.closest?.(MESSAGE_SELECTOR);
        if (parentMessage) this.renderMessage(parentMessage);
        node.querySelectorAll?.(MESSAGE_SELECTOR).forEach((message) => this.renderMessage(message));
      }

      renderMessage(message) {
        if (!this.emotes.size) return;
        const body = message.querySelector(MESSAGE_BODY_SELECTOR);
        if (!body) return;
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
          image.title = `${emote.name} · ${emote.provider}`;
          image.loading = 'lazy';
          image.decoding = 'async';
          fragment.appendChild(image);
        });
        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    }

    class PlayerLatencyIndicator {
      constructor() {
        this.enabled = false;
        this.root = null;
        this.timer = null;
      }

      init() {}

      configure(enabled) {
        this.enabled = Boolean(enabled);
        if (this.enabled) this.start(); else this.stop();
      }

      dispose() { this.stop(); }

      start() {
        if (!this.timer) this.timer = window.setInterval(() => this.update(), 1000);
        this.update();
      }

      stop() {
        clearInterval(this.timer);
        this.timer = null;
        this.root?.remove();
        this.root = null;
      }

      ensureRoot(container, reference = null) {
        if (!this.root) {
          this.root = document.createElement('div');
          this.root.className = 'tfr-player-latency';
        }
        if (this.root.parentElement !== container) {
          if (reference?.nextSibling) container.insertBefore(this.root, reference.nextSibling);
          else container.appendChild(this.root);
        }
        return this.root;
      }

      update() {
        if (!this.enabled || document.visibilityState === 'hidden') return;
        const video = document.querySelector('.video-player__container video, [data-a-target="video-player"] video, video');
        const statsAnchor = document.querySelector(
          '[data-a-target="animated-channel-viewers-count"], [data-a-target="channel-viewers-count"], [data-test-selector="animated-channel-viewers-count"]'
        );
        const statsContainer = statsAnchor?.parentElement;
        if (!video || !statsAnchor || !statsContainer || !Number.isFinite(video.currentTime)) {
          this.root?.remove();
          return;
        }
        let bufferSeconds = 0;
        for (let index = 0; index < video.buffered.length; index += 1) {
          if (video.buffered.start(index) <= video.currentTime && video.buffered.end(index) >= video.currentTime) {
            bufferSeconds = Math.max(0, video.buffered.end(index) - video.currentTime);
            break;
          }
        }
        const root = this.ensureRoot(statsContainer, statsAnchor);
        root.textContent = t('settings.playerLatency.value', {
          buffer: bufferSeconds.toFixed(1)
        });
        root.title = t('settings.playerLatency.description');
      }
    }

    class ChatFontManager {
      constructor() {
        this.enabled = false;
        this.font = 'system';
        this.fontFaceStyle = null;
      }

      init() {}

      configure({ enabled, font, customName, customDataUrl }) {
        this.enabled = Boolean(enabled);
        this.font = this.sanitizeFont(font);
        const root = document.documentElement;
        this.applyCustomFont(customName, customDataUrl);
        root.classList.toggle('tfr-chat-custom-font', this.enabled);
        if (this.enabled) root.style.setProperty('--tfr-chat-font-family', this.getFontStack(this.font, customDataUrl));
        else root.style.removeProperty('--tfr-chat-font-family');
      }

      dispose() {
        document.documentElement.classList.remove('tfr-chat-custom-font');
        document.documentElement.style.removeProperty('--tfr-chat-font-family');
        this.fontFaceStyle?.remove();
        this.fontFaceStyle = null;
      }

      sanitizeFont(font) {
        return new Set(['system', 'arial', 'verdana', 'georgia', 'monospace', 'custom']).has(font) ? font : 'system';
      }

      getFontStack(font, customDataUrl = '') {
        if (font === 'custom' && customDataUrl) return '"TFR Custom Chat Font", sans-serif';
        return {
          system: 'Inter, Roobert, "Helvetica Neue", Arial, sans-serif',
          arial: 'Arial, Helvetica, sans-serif',
          verdana: 'Verdana, Geneva, sans-serif',
          georgia: 'Georgia, "Times New Roman", serif',
          monospace: 'Consolas, "Courier New", monospace'
        }[font] || 'Inter, Roobert, "Helvetica Neue", Arial, sans-serif';
      }

      applyCustomFont(name, dataUrl) {
        this.fontFaceStyle?.remove();
        this.fontFaceStyle = null;
        if (!name || !/^data:(font\/|application\/(?:font|octet-stream))/.test(String(dataUrl || ''))) return;
        this.fontFaceStyle = document.createElement('style');
        this.fontFaceStyle.dataset.tfrChatFont = 'true';
        this.fontFaceStyle.textContent = `@font-face{font-family:"TFR Custom Chat Font";src:url("${String(dataUrl).replace(/["\\]/g, '')}");font-display:swap;}`;
        (document.head || document.documentElement).appendChild(this.fontFaceStyle);
      }
    }

    class DeletedMessageViewer {
      constructor() {
        this.enabled = false;
        this.expandReplies = false;
        this.observer = null;
        this.container = null;
        this.snapshots = new WeakMap();
        this.snapshotsById = new Map();
        this.retryTimer = null;
      }

      init() {}

      configure(enabled) {
        this.enabled = Boolean(enabled);
        if (this.enabled) this.observe();
        else this.stop();
      }

      dispose() { this.stop(); }

      stop() {
        this.observer?.disconnect();
        this.observer = null;
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
        document.querySelectorAll('.tfr-deleted-message-content').forEach((node) => node.remove());
        this.snapshotsById.clear();
      }

      findContainer() {
        for (const selector of CHAT_CONTAINER_SELECTORS) {
          const node = document.querySelector(selector);
          if (node) return node;
        }
        return null;
      }

      observe() {
        const container = this.findContainer();
        if (!container) {
          if (!this.retryTimer) this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            this.observe();
          }, 1500);
          return;
        }
        this.container = container;
        container.querySelectorAll(MESSAGE_SELECTOR).forEach((message) => this.processMessage(message));
        this.observer?.disconnect();
        this.observer = new MutationObserver((mutations) => {
          if (!this.enabled || document.visibilityState === 'hidden') return;
          mutations.forEach((mutation) => {
            const targetMessage = mutation.target instanceof Element ? mutation.target.closest(MESSAGE_SELECTOR) : null;
            if (targetMessage) this.processMessage(targetMessage);
            mutation.addedNodes.forEach((node) => this.scanNode(node));
          });
        });
        this.observer.observe(container, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'data-deleted', 'data-deleted-message']
        });
      }

      scanNode(node) {
        if (!(node instanceof Element) || node.classList.contains('tfr-deleted-message-content')) return;
        if (node.matches(MESSAGE_SELECTOR)) this.processMessage(node);
        const parent = node.closest?.(MESSAGE_SELECTOR);
        if (parent) this.processMessage(parent);
        node.querySelectorAll?.(MESSAGE_SELECTOR).forEach((message) => this.processMessage(message));
      }

      isDeleted(message) {
        const dataset = message.dataset || {};
        if (dataset.deleted === 'true' || dataset.deletedMessage === 'true') return true;
        if (message.classList.contains('chat-line__message--deleted') || message.classList.contains('is-deleted')) return true;
        if (message.querySelector('[data-a-target="deleted-message"], [data-test-selector="chat-line-message-deleted"], [data-test-selector="chat-deleted-message"]')) return true;
        return /message (?:supprim\u00e9|deleted)/i.test(message.textContent || '');
      }

      getMessageId(message) {
        const holder = message.matches?.('[data-message-id],[data-id],[data-uuid]')
          ? message
          : message.querySelector?.('[data-message-id],[data-id],[data-uuid]');
        return String(
          holder?.dataset?.messageId || holder?.dataset?.id || holder?.dataset?.uuid
          || holder?.getAttribute?.('data-message-id') || holder?.getAttribute?.('data-id') || ''
        );
      }

      processMessage(message) {
        if (!(message instanceof HTMLElement)) return;
        const existing = message.querySelector('.tfr-deleted-message-content');
        if (!this.isDeleted(message)) {
          if (existing) existing.remove();
          const body = message.querySelector(MESSAGE_BODY_SELECTOR);
          const text = body?.textContent?.trim();
          if (text) {
            const snapshot = { text };
            this.snapshots.set(message, snapshot);
            const messageId = this.getMessageId(message);
            if (messageId) this.snapshotsById.set(messageId, snapshot);
          }
          return;
        }
        if (existing) return;
        const snapshot = this.snapshots.get(message) || this.snapshotsById.get(this.getMessageId(message));
        if (!snapshot?.text) return;
        const restored = document.createElement('div');
        restored.className = 'tfr-deleted-message-content';
        const badge = document.createElement('span');
        badge.className = 'tfr-deleted-message-content__badge';
        badge.textContent = t('settings.deletedMessages.badge');
        const content = document.createElement('span');
        content.textContent = snapshot.text;
        restored.appendChild(badge);
        restored.appendChild(content);
        message.appendChild(restored);
      }
    }

    class FullReplyViewer {
      init() {}

      configure(enabled) {
        document.documentElement.classList.toggle('tfr-chat-full-replies', Boolean(enabled));
      }

      dispose() {
        document.documentElement.classList.remove('tfr-chat-full-replies');
      }
    }

    class ReplyExpansionTracker {
      constructor() {
        this.expandReplies = false;
        this.observer = null;
        this.container = null;
        this.retryTimer = null;
      }

      init() {}
      configure(enabled) {
        this.expandReplies = Boolean(enabled);
        this.expandReplies ? this.observe() : this.stop();
      }
      dispose() { this.stop(); }

      stop() {
        this.observer?.disconnect();
        this.observer = null;
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
        document.querySelectorAll('.tfr-custom-reply-content').forEach((node) => node.remove());
        document.querySelectorAll('.tfr-native-reply-content').forEach((wrapper) => {
          wrapper.replaceWith(...wrapper.childNodes);
        });
        document.querySelectorAll('.tfr-custom-reply-context').forEach((node) => node.classList.remove('tfr-custom-reply-context'));
      }

      findContainer() {
        for (const selector of CHAT_CONTAINER_SELECTORS) {
          const node = document.querySelector(selector);
          if (node) return node;
        }
        return null;
      }

      observe() {
        const container = this.findContainer();
        if (!container) {
          if (!this.retryTimer) this.retryTimer = window.setTimeout(() => { this.retryTimer = null; this.observe(); }, 1500);
          return;
        }
        this.container = container;
        this.scanNode(container);
        this.observer?.disconnect();
        this.observer = new MutationObserver((mutations) => mutations.forEach((mutation) =>
          mutation.addedNodes.forEach((node) => this.scanNode(node))
        ));
        this.observer.observe(container, { childList: true, subtree: true });
      }

      scanNode(node) {
        if (!(node instanceof Element)) return;
        const closestContext = node.closest?.('p[title]');
        if (closestContext) this.renderNativeContext(closestContext);
        if (node.matches?.('p[title]')) this.renderNativeContext(node);
        node.querySelectorAll?.('p[title]').forEach((context) => this.renderNativeContext(context));
      }

      renderNativeContext(replyContext) {
        if (!this.expandReplies || replyContext.querySelector('.tfr-custom-reply-content')) return;
        const nativeText = String(replyContext.textContent || '').trim();
        if (!/^(?:r\u00e9pond\s+\u00e0|replying\s+to)/i.test(nativeText)) return;
        const fullMessage = String(replyContext.getAttribute('title') || '').trim();
        const nativeAuthor = replyContext.querySelector('span[dir="auto"]')?.textContent?.trim() || '';
        if (!fullMessage || !nativeAuthor) return;

        const customReply = document.createElement('span');
        customReply.className = 'tfr-custom-reply-content';

        const label = document.createElement('span');
        label.className = 'tfr-custom-reply-label';
        label.textContent = /^replying\s+to/i.test(nativeText) ? 'Replying to ' : 'R\u00e9pond \u00e0 ';

        const author = document.createElement('span');
        author.className = 'tfr-custom-reply-author';
        author.textContent = nativeAuthor.startsWith('@') ? nativeAuthor : `@${nativeAuthor}`;

        const message = document.createElement('span');
        message.className = 'tfr-custom-reply-message';
        message.textContent = ` : ${fullMessage}`;

        customReply.append(label, author, message);
        const nativeWrapper = document.createElement('span');
        nativeWrapper.className = 'tfr-native-reply-content';
        nativeWrapper.hidden = true;
        nativeWrapper.style.setProperty('display', 'none', 'important');
        while (replyContext.firstChild) nativeWrapper.appendChild(replyContext.firstChild);
        replyContext.classList.add('tfr-custom-reply-context');
        replyContext.append(nativeWrapper, customReply);
      }

    }

    return { ThirdPartyChatEmotes, PlayerLatencyIndicator, ChatFontManager, DeletedMessageViewer, FullReplyViewer, ReplyExpansionTracker };
  };

  window.TFRStreamEnhancements = { create: createStreamEnhancements };
})();

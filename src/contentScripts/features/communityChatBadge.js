(() => {
  const MESSAGE_SELECTOR = [
    '[data-a-target="chat-line-message"]',
    '[data-test-selector="chat-line-message"]',
    '.chat-line__message'
  ].join(',');
  const USERNAME_SELECTOR = [
    '[data-a-target="chat-message-username"]',
    '[data-test-selector="chat-message-username"]',
    '[data-a-target="chat-author-link"]',
    '.chat-author__display-name',
    '.chat-line__username'
  ].join(',');
  const CONTAINER_SELECTORS = [
    '[data-test-selector="chat-scrollable-area__message-container"]',
    '.chat-scrollable-area__message-container',
    '[data-a-target="chat-messages"]',
    '[role="log"][aria-live="polite"]'
  ];
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const ERROR_CACHE_TTL_MS = 30 * 1000;
  const LOOKUP_DELAY_MS = 120;
  const LOOKUP_LIMIT = 60;
  const CACHE_LIMIT = 1000;

  const createCommunityChatBadge = ({
    documentRef = document,
    windowRef = window,
    sendExtensionMessage,
    t = (key) => key
  }) => {
    class CommunityChatBadge {
      constructor() {
        this.enabled = false;
        this.container = null;
        this.observer = null;
        this.retryTimer = null;
        this.lookupTimer = null;
        this.lookupRunning = false;
        this.pendingLogins = new Set();
        this.waitingMessages = new Map();
        this.cache = new Map();
      }

      init() {}

      configure(enabled) {
        const nextEnabled = enabled === true;
        if (nextEnabled === this.enabled) {
          if (nextEnabled && !this.container?.isConnected) this.observe();
          return;
        }
        this.enabled = nextEnabled;
        if (this.enabled) this.observe();
        else this.stop();
      }

      dispose() {
        this.enabled = false;
        this.stop();
        this.cache.clear();
      }

      normalizeLogin(value) {
        const login = String(value || '').trim().replace(/^@/, '').toLowerCase();
        return /^[a-z0-9_]{2,25}$/.test(login) ? login : '';
      }

      findContainer() {
        for (const selector of CONTAINER_SELECTORS) {
          const container = documentRef.querySelector(selector);
          if (container) return container;
        }
        return null;
      }

      observe() {
        if (!this.enabled) return;
        const container = this.findContainer();
        if (!container) {
          if (!this.retryTimer) {
            this.retryTimer = windowRef.setTimeout(() => {
              this.retryTimer = null;
              this.observe();
            }, 1500);
          }
          return;
        }
        if (container === this.container && this.observer) return;
        this.observer?.disconnect();
        this.container = container;
        container.querySelectorAll(MESSAGE_SELECTOR).forEach((message) => this.processMessage(message));
        this.observer = new MutationObserver((mutations) => mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => this.scanNode(node));
        }));
        this.observer.observe(container, { childList: true, subtree: true });
      }

      scanNode(node) {
        if (!(node instanceof Element)) return;
        if (node.matches?.(MESSAGE_SELECTOR)) this.processMessage(node);
        node.querySelectorAll?.(MESSAGE_SELECTOR).forEach((message) => this.processMessage(message));
        const closest = node.closest?.(MESSAGE_SELECTOR);
        if (closest) this.processMessage(closest);
      }

      extractIdentity(message) {
        const username = message.querySelector(USERNAME_SELECTOR);
        if (!username) return null;
        const href = username.getAttribute?.('href')
          || username.closest?.('a[href^="/"]')?.getAttribute?.('href')
          || '';
        const hrefLogin = href.match(/^\/([^/?#]+)/)?.[1] || '';
        const candidates = [
          message.dataset?.userName,
          message.dataset?.username,
          message.dataset?.user,
          message.dataset?.login,
          username.dataset?.aUser,
          username.dataset?.userLogin,
          username.dataset?.login,
          hrefLogin,
          username.textContent
        ];
        for (const candidate of candidates) {
          const login = this.normalizeLogin(candidate);
          if (login) return { login, username };
        }
        return null;
      }

      getCached(login) {
        const entry = this.cache.get(login);
        if (!entry || entry.expiresAt <= Date.now()) {
          this.cache.delete(login);
          return undefined;
        }
        return entry.member;
      }

      setCached(login, member, ttl = CACHE_TTL_MS) {
        this.cache.delete(login);
        this.cache.set(login, { member: member === true, expiresAt: Date.now() + ttl });
        while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value);
      }

      processMessage(message) {
        if (!this.enabled || !message?.isConnected) return;
        const identity = this.extractIdentity(message);
        if (!identity) return;
        const cached = this.getCached(identity.login);
        if (cached === true) {
          this.renderBadge(message, identity);
          return;
        }
        if (cached === false) {
          this.removeBadge(message);
          return;
        }
        if (!this.waitingMessages.has(identity.login)) this.waitingMessages.set(identity.login, new Set());
        this.waitingMessages.get(identity.login).add(message);
        this.pendingLogins.add(identity.login);
        this.scheduleLookup();
      }

      scheduleLookup() {
        if (this.lookupTimer || this.lookupRunning || !this.enabled) return;
        this.lookupTimer = windowRef.setTimeout(() => {
          this.lookupTimer = null;
          void this.flushLookup();
        }, LOOKUP_DELAY_MS);
      }

      async flushLookup() {
        if (this.lookupRunning || !this.enabled || this.pendingLogins.size === 0) return;
        const logins = [...this.pendingLogins].slice(0, LOOKUP_LIMIT);
        logins.forEach((login) => this.pendingLogins.delete(login));
        this.lookupRunning = true;
        try {
          const response = await sendExtensionMessage?.({ type: 'TFR_COMMUNITY_BADGE_LOOKUP', logins });
          if (!response?.ok) throw new Error(response?.message || 'Community lookup failed');
          const members = new Set((Array.isArray(response.data) ? response.data : [])
            .map((login) => this.normalizeLogin(login))
            .filter(Boolean));
          logins.forEach((login) => this.setCached(login, members.has(login)));
        } catch (error) {
          logins.forEach((login) => this.setCached(login, false, ERROR_CACHE_TTL_MS));
          console.warn('[TFR] community badge lookup failed', error);
        } finally {
          this.lookupRunning = false;
        }
        logins.forEach((login) => this.renderWaiting(login));
        if (this.pendingLogins.size) this.scheduleLookup();
      }

      renderWaiting(login) {
        const messages = this.waitingMessages.get(login) || new Set();
        this.waitingMessages.delete(login);
        messages.forEach((message) => {
          if (!message?.isConnected) return;
          const identity = this.extractIdentity(message);
          if (!identity || identity.login !== login) return;
          if (this.getCached(login) === true) this.renderBadge(message, identity);
          else this.removeBadge(message);
        });
      }

      renderBadge(message, { login, username }) {
        const existing = message.querySelector('.tfr-community-badge');
        if (existing?.dataset?.tfrCommunityLogin === login) return;
        existing?.remove();
        const badge = documentRef.createElement('span');
        badge.className = 'tfr-community-badge';
        badge.dataset.tfrCommunityLogin = login;
        badge.textContent = '★';
        badge.title = t('communityBadge.tooltip');
        badge.setAttribute('role', 'img');
        badge.setAttribute('aria-label', badge.title);
        username.parentNode?.insertBefore(badge, username);
      }

      removeBadge(message) {
        message.querySelector?.('.tfr-community-badge')?.remove();
      }

      stop() {
        this.observer?.disconnect();
        this.observer = null;
        this.container = null;
        windowRef.clearTimeout(this.retryTimer);
        windowRef.clearTimeout(this.lookupTimer);
        this.retryTimer = null;
        this.lookupTimer = null;
        this.pendingLogins.clear();
        this.waitingMessages.clear();
        documentRef.querySelectorAll('.tfr-community-badge').forEach((badge) => badge.remove());
      }
    }

    return CommunityChatBadge;
  };

  window.TFRCommunityChatBadge = { create: createCommunityChatBadge };
})();

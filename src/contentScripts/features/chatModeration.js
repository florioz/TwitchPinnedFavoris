(() => {
  const createChatModerationFeatures = ({
    t,
    formatModerationDurationLabel,
    formatModerationTimestamp,
    MAX_TIMEOUT_SECONDS
  }) => {
  const thirdPartyEmotes = window.TFRChatEmoteResolver.create();
  const chatDomTools = window.TFRChatDomTools;
  const durationTools = window.TFRModerationDurationTools;
  const historyPresenter = window.TFRModerationHistoryPresenter.create({
    t,
    formatDuration: formatModerationDurationLabel,
    formatTimestamp: formatModerationTimestamp
  });
  if (!chatDomTools) throw new Error('[TFR] chat DOM tools are missing');
  if (!durationTools) throw new Error('[TFR] moderation duration tools are missing');

  class ChatHistoryTracker {
    constructor() {
      this.history = new Map();
      this.maxEntriesPerUser = 50;
      this.chatObserver = null;
      this.chatContainer = null;
      this.retryTimer = null;
      this.listeners = new Set();
      this.containerCheckTimer = null;
      this.pendingNodes = [];
      this.pendingFrame = null;
      this.pendingNodeSet = new Set();
      this.processedPerFrame = 80;
      this.messageSnapshots = new WeakMap();
      this.messageSnapshotsById = new Map();
      this.maxMessageSnapshots = 2000;
      this.recentMessages = [];
      this.visibilityHandler = () => this.handleVisibilityChange();
    }

    normalizeLogin(login) {
      if (!login) return '';
      return String(login).trim().replace(/^@/, '').toLowerCase();
    }

    init() {
      thirdPartyEmotes.ensureLoaded().catch(() => {});
      document.addEventListener('visibilitychange', this.visibilityHandler);
      if (document.visibilityState !== 'hidden') this.observeChat(true);
      if (!this.containerCheckTimer) {
        this.containerCheckTimer = setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          if (!this.chatContainer || !this.chatContainer.isConnected) {
            this.observeChat(true);
          }
        }, 5000);
      }
    }

    dispose() {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.chatObserver?.disconnect();
      this.chatObserver = null;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      if (this.containerCheckTimer) {
        clearInterval(this.containerCheckTimer);
        this.containerCheckTimer = null;
      }
      if (this.pendingFrame) {
        cancelAnimationFrame(this.pendingFrame);
        this.pendingFrame = null;
      }
      this.pendingNodes = [];
      this.pendingNodeSet.clear();
      this.messageSnapshotsById.clear();
      this.recentMessages = [];
      this.history.clear();
      this.listeners.clear();
    }

    handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        this.chatObserver?.disconnect();
        this.chatObserver = null;
        return;
      }
      this.observeChat(true);
    }

    subscribe(listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit(login) {
      const normalized = this.normalizeLogin(login);
      const snapshot = this.getHistory(normalized);
      this.listeners.forEach((listener) => {
        try {
          listener(normalized, snapshot);
        } catch (error) {
          console.error('[TFR] chat history listener failed', error);
        }
      });
    }

    getHistory(login) {
      const normalized = this.normalizeLogin(login);
      const entries = this.history.get(normalized);
      return entries ? entries.slice() : [];
    }

    findMessagesContainer() {
      return chatDomTools.findMessagesContainer(document);
    }

    observeChat(force = false) {
      if (!force && this.chatContainer?.isConnected) {
        return;
      }
      this.chatObserver?.disconnect();
      this.chatObserver = null;
      const container = this.findMessagesContainer();
      if (!container) {
        if (!this.retryTimer) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.observeChat(true);
          }, 1500);
        }
        return;
      }
      this.chatContainer = container;
      this.chatObserver = new MutationObserver((mutations) => this.handleMutations(mutations));
      this.chatObserver.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-user', 'data-a-user', 'data-message-id', 'data-id', 'data-uuid']
      });
      this.captureExistingMessages(container);
    }

    captureExistingMessages(container) {
      const nodes = container.querySelectorAll(CHAT_MESSAGE_SELECTOR);
      nodes.forEach((node) => this.captureMessage(node));
    }

    handleMutations(mutations) {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          this.queuePendingNode(mutation.target);
        }
        mutation.addedNodes.forEach((node) => {
          this.queuePendingNode(node);
        });
      });
      this.schedulePendingScan();
    }

    queuePendingNode(node) {
      if (node?.nodeType !== Node.ELEMENT_NODE || this.pendingNodeSet.has(node)) return;
      this.pendingNodeSet.add(node);
      this.pendingNodes.push(node);
    }

    schedulePendingScan() {
      if (this.pendingFrame) {
        return;
      }
      this.pendingFrame = requestAnimationFrame(() => {
        this.pendingFrame = null;
        this.processPendingNodes();
      });
    }

    processPendingNodes() {
      if (document.visibilityState === 'hidden') {
        this.pendingNodes = [];
        this.pendingNodeSet.clear();
        return;
      }
      const startedAt = window.TFRPerformance?.now?.();
      let processed = 0;
      while (this.pendingNodes.length && processed < this.processedPerFrame) {
        const node = this.pendingNodes.shift();
        this.pendingNodeSet.delete(node);
        if (node?.isConnected) {
          this.scanNode(node);
        }
        processed += 1;
      }
      if (this.pendingNodes.length) {
        this.schedulePendingScan();
      }
      if (startedAt !== undefined) {
        window.TFRPerformance?.report?.('chat.processPendingNodes', startedAt, { processed });
      }
    }

    scanNode(node) {
      if (node.matches(CHAT_MESSAGE_SELECTOR)) {
        this.captureMessage(node);
      }
      const descendants = node.querySelectorAll?.(CHAT_MESSAGE_SELECTOR);
      if (descendants && descendants.length) {
        descendants.forEach((child) => this.captureMessage(child));
      }
    }

    captureMessage(messageElement) {
      const rootElement = this.getMessageRoot(messageElement);
      if (!rootElement || rootElement.dataset?.tfrChatTracked === 'true' || messageElement?.dataset?.tfrChatTracked === 'true') {
        return;
      }
      const login = this.extractLogin(rootElement);
      const text = this.extractMessageText(rootElement);
      const normalized = this.normalizeLogin(login);
      if (!normalized || !text) {
        return;
      }
      const displayName = this.extractDisplayName(rootElement) || login;
      const timestamp = this.extractTimestamp(rootElement) || Date.now();
      const fragments = thirdPartyEmotes.enrichParts(this.extractMessageFragments(rootElement, text));
      const entry = {
        login: normalized,
        displayName,
        text,
        fragments,
        badges: this.extractBadges(rootElement),
        color: this.extractUserColor(rootElement),
        timestamp
      };
      this.rememberMessageSnapshot(rootElement, entry);
      this.rememberRecentMessage(entry);
      const existing = this.history.get(normalized) || [];
      const duplicate = existing.some((candidate) => (
        Math.abs(Number(candidate.timestamp || 0) - timestamp) < 1000 && candidate.text === text
      ));
      if (duplicate) {
        messageElement.dataset.tfrChatTracked = 'true';
        rootElement.dataset.tfrChatTracked = 'true';
        return;
      }
      existing.push(entry);
      if (existing.length > 1) {
        existing.sort((a, b) => a.timestamp - b.timestamp);
      }
      if (existing.length > this.maxEntriesPerUser) {
        existing.splice(0, existing.length - this.maxEntriesPerUser);
      }
      this.history.set(normalized, existing);
      messageElement.dataset.tfrChatTracked = 'true';
      rootElement.dataset.tfrChatTracked = 'true';
      this.emit(normalized);
      thirdPartyEmotes.ensureLoaded()
        .then(() => {
          const updated = thirdPartyEmotes.enrichParts(entry.fragments);
          if (JSON.stringify(updated) !== JSON.stringify(entry.fragments)) {
            entry.fragments = updated;
            this.emit(normalized);
          }
        })
        .catch(() => {});
    }

    getMessageId(messageElement) {
      const holder = messageElement?.matches?.('[data-message-id],[data-id],[data-uuid]')
        ? messageElement
        : messageElement?.querySelector?.('[data-message-id],[data-id],[data-uuid]');
      return String(
        holder?.dataset?.messageId || holder?.dataset?.id || holder?.dataset?.uuid
        || holder?.getAttribute?.('data-message-id') || holder?.getAttribute?.('data-id') || holder?.getAttribute?.('data-uuid') || ''
      ).trim();
    }

    rememberMessageSnapshot(messageElement, entry) {
      if (!messageElement || !entry) return;
      const snapshot = { ...entry };
      this.messageSnapshots.set(messageElement, snapshot);
      const messageId = this.getMessageId(messageElement);
      if (!messageId) return;
      this.messageSnapshotsById.delete(messageId);
      this.messageSnapshotsById.set(messageId, snapshot);
      while (this.messageSnapshotsById.size > this.maxMessageSnapshots) {
        this.messageSnapshotsById.delete(this.messageSnapshotsById.keys().next().value);
      }
    }

    getMessageSnapshot(messageElement) {
      const root = this.getMessageRoot(messageElement);
      return this.messageSnapshots.get(root)
        || this.messageSnapshotsById.get(this.getMessageId(root))
        || null;
    }

    rememberRecentMessage(entry) {
      this.recentMessages.push(entry);
      if (this.recentMessages.length > 100) {
        this.recentMessages.splice(0, this.recentMessages.length - 100);
      }
    }

    getLatestMessage(maxAgeMs = 15000) {
      const now = Date.now();
      for (let index = this.recentMessages.length - 1; index >= 0; index -= 1) {
        const entry = this.recentMessages[index];
        const timestamp = Number(entry?.timestamp) || 0;
        if (!timestamp || Math.abs(now - timestamp) <= maxAgeMs) return entry || null;
      }
      return null;
    }

    getMessageRoot(messageElement) {
      if (!(messageElement instanceof HTMLElement)) {
        return null;
      }
      return (
        messageElement.closest('[data-a-target="chat-line-message"]') ||
        messageElement.closest('[data-test-selector="chat-line-message"]') ||
        messageElement.closest('[data-a-target="chat-line-user-notice"]') ||
        messageElement.closest('[data-test-selector="chat-line-user-notice"]') ||
        messageElement.closest('.chat-line__message') ||
        messageElement.closest('.seventv-message') ||
        messageElement
      );
    }

    extractLogin(messageElement) {
      const dataset = messageElement.dataset || {};
      const candidates = [
        dataset.userName,
        dataset.username,
        dataset.user,
        dataset.sender,
        dataset.name,
        dataset.login,
        dataset.userLogin,
        dataset.aUser,
        messageElement.getAttribute('data-user'),
        messageElement.getAttribute('data-username'),
        messageElement.getAttribute('data-sender'),
        messageElement.getAttribute('data-login')
      ];
      for (const value of candidates) {
        const login = this.cleanLoginCandidate(value);
        if (login) {
          return login;
        }
      }
      const usernameNode =
        messageElement.querySelector('[data-a-target="chat-message-username"]') ||
        messageElement.querySelector('[data-test-selector="chat-message-username"]') ||
        messageElement.querySelector('[data-a-target="chat-author-link"]') ||
        messageElement.querySelector('[data-a-user]') ||
        messageElement.querySelector('a[href^="/"][data-a-target*="chat"]') ||
        messageElement.querySelector('button[data-a-target*="chat"] [class*="username"]') ||
        messageElement.querySelector('.chat-author__display-name') ||
        messageElement.querySelector('.chat-line__username');
      if (usernameNode) {
        const datasetLogin = usernameNode.dataset?.aUser || usernameNode.dataset?.userLogin || usernameNode.dataset?.login;
        const loginFromDataset = this.cleanLoginCandidate(datasetLogin);
        if (loginFromDataset) {
          return loginFromDataset;
        }
        const href = usernameNode.getAttribute?.('href') || usernameNode.closest?.('a[href^="/"]')?.getAttribute('href') || '';
        const hrefMatch = href.match(/^\/([^/?#]+)/);
        if (hrefMatch?.[1]) {
          return this.cleanLoginCandidate(hrefMatch[1]);
        }
        return this.cleanLoginCandidate(usernameNode.textContent);
      }
      return '';
    }

    cleanLoginCandidate(value) {
      if (!value) return '';
      return String(value)
        .trim()
        .replace(/^@/, '')
        .replace(/[:：].*$/, '')
        .replace(/\s+/g, '')
        .toLowerCase();
    }

    extractDisplayName(messageElement) {
      const dataset = messageElement.dataset || {};
      if (dataset.userDisplayName) {
        return dataset.userDisplayName;
      }
      const usernameNode =
        messageElement.querySelector('[data-a-target="chat-message-username"]') ||
        messageElement.querySelector('[data-test-selector="chat-message-username"]') ||
        messageElement.querySelector('[data-a-target="chat-author-link"]') ||
        messageElement.querySelector('.chat-author__display-name') ||
        messageElement.querySelector('.chat-line__username');
      return usernameNode?.textContent?.trim().replace(/^@/, '').replace(/[:：]\s*$/, '') || '';
    }

    extractMessageText(messageElement) {
      const textContainer =
        messageElement.querySelector('[data-a-target="chat-message-text"]') ||
        messageElement.querySelector('[data-test-selector="chat-line-message-body"]') ||
        messageElement.querySelector('[data-a-target="chat-line-message-body"]') ||
        messageElement.querySelector('.text-fragment')?.parentElement ||
        messageElement;
      const tokens = [];
      const pushToken = (value) => {
        if (!value) return;
        const normalized = String(value).replace(/\s+/g, ' ').trim();
        if (normalized) {
          tokens.push(normalized);
        }
      };
      const skipSelectors = [
        '[data-a-target="chat-message-timestamp"]',
        '[data-test-selector="chat-message-timestamp"]',
        '[data-a-target="chat-message-username"]',
        '[data-test-selector="chat-message-username"]',
        '[data-a-target="chat-author-link"]',
        '[data-a-target="chat-badge"]',
        '[data-test-selector="chat-badge"]',
        '.chat-line__timestamp',
        '.chat-author__display-name',
        '.chat-line__username',
        '.chat-badge',
        '.reply-line',
        '[data-a-target="chat-line-reply"]'
      ];
      const collect = (node) => {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
          pushToken(node.textContent);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }
        const element = node;
        if (skipSelectors.some((selector) => element.matches?.(selector))) {
          return;
        }
        const dataset = element.dataset || {};
        const plain =
          element.getAttribute('data-plain-text') ||
          dataset.plainText ||
          dataset.text ||
          dataset.plaintext;
        const aria = element.getAttribute('aria-label');
        const title = element.getAttribute('title');
        const alt = element.getAttribute('alt');
        const dataTarget = (dataset.aTarget || '').toLowerCase();
        const classList = element.classList || {};
        const isEmote =
          element.tagName === 'IMG' ||
          classList.contains('chat-image__emoji') ||
          classList.contains('emoji') ||
          /emote/.test(dataTarget) ||
          dataset.emoteId ||
          dataset.emoteName;
        if (isEmote) {
          pushToken(plain || alt || aria || title || element.textContent);
          return;
        }
        if (plain && !element.childNodes?.length) {
          pushToken(plain);
          return;
        }
        if (element.childNodes && element.childNodes.length) {
          element.childNodes.forEach((child) => collect(child));
        } else if (aria || title || alt) {
          pushToken(aria || title || alt);
        }
      };
      collect(textContainer);
      const result = tokens.join(' ').replace(/\s+/g, ' ').trim();
      if (result) {
        return result;
      }
      const clone = textContainer.cloneNode(true);
      skipSelectors.forEach((selector) => {
        clone.querySelectorAll?.(selector).forEach((node) => node.remove());
      });
      return clone.textContent?.replace(/\s+/g, ' ').trim() || '';
    }

    getMessageContainer(messageElement) {
      return (
        messageElement.querySelector('[data-a-target="chat-message-text"]') ||
        messageElement.querySelector('[data-test-selector="chat-line-message-body"]') ||
        messageElement.querySelector('[data-a-target="chat-line-message-body"]') ||
        messageElement.querySelector('.text-fragment')?.parentElement ||
        messageElement
      );
    }

    extractMessageFragments(messageElement, fallbackText = '') {
      const textContainer = this.getMessageContainer(messageElement);
      const skipSelectors = [
        '[data-a-target="chat-message-timestamp"]',
        '[data-test-selector="chat-message-timestamp"]',
        '[data-a-target="chat-message-username"]',
        '[data-test-selector="chat-message-username"]',
        '[data-a-target="chat-author-link"]',
        '[data-a-target="chat-badge"]',
        '[data-test-selector="chat-badge"]',
        '.chat-line__timestamp',
        '.chat-author__display-name',
        '.chat-line__username',
        '.chat-badge',
        '.reply-line',
        '[data-a-target="chat-line-reply"]'
      ];
      const parts = [];
      const pushText = (value) => {
        if (!value) return;
        const text = String(value).replace(/\s+/g, ' ');
        if (!text.trim()) return;
        const previous = parts[parts.length - 1];
        if (previous?.type === 'text') {
          previous.text += text;
        } else {
          parts.push({ type: 'text', text });
        }
      };
      const walk = (node) => {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
          pushText(node.textContent);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node;
        if (skipSelectors.some((selector) => element.matches?.(selector))) return;
        const dataset = element.dataset || {};
        const dataTarget = (dataset.aTarget || '').toLowerCase();
        const isImageEmote =
          element.tagName === 'IMG' ||
          element.classList?.contains('chat-image__emoji') ||
          element.classList?.contains('emoji') ||
          /emote/.test(dataTarget) ||
          dataset.emoteId ||
          dataset.emoteName;
        if (isImageEmote) {
          const url = element.currentSrc || element.src || element.getAttribute('src') || '';
          const name =
            element.getAttribute('alt') ||
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            dataset.emoteName ||
            dataset.name ||
            '';
          if (url) {
            parts.push({ type: 'emote', name: name.trim() || 'emote', url, provider: /7tv|seventv/i.test(url) ? '7tv' : 'twitch' });
          } else {
            pushText(name || element.textContent);
          }
          return;
        }
        if (element.childNodes?.length) {
          element.childNodes.forEach((child) => walk(child));
        } else {
          pushText(element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent);
        }
      };
      walk(textContainer);
      const normalized = parts
        .map((part) => part.type === 'text' ? { ...part, text: part.text.replace(/\s+/g, ' ') } : part)
        .filter((part) => part.type !== 'text' || part.text.trim());
      return normalized.length ? normalized : [{ type: 'text', text: fallbackText }];
    }

    extractBadges(messageElement) {
      const badgeSelectors = [
        '[data-a-target="chat-badge"]',
        '[data-a-target*="badge" i]',
        '[data-test-selector="chat-badge"]',
        '[data-test-selector*="badge" i]',
        '.chat-badge',
        '[class*="badge" i]',
        'img[src*="badge" i]',
        'img[src*="badges" i]'
      ];
      const badges = [];
      const readBackgroundUrl = (element) => {
        if (!(element instanceof HTMLElement)) {
          return '';
        }
        const inline = element.style?.backgroundImage || '';
        const computed = inline || window.getComputedStyle(element).backgroundImage || '';
        const match = computed.match(/url\(["']?([^"')]+)["']?\)/i);
        return match?.[1] || '';
      };
      const pushBadge = (badge) => {
        if (!(badge instanceof HTMLElement)) return;
        const img = badge.tagName === 'IMG' ? badge : badge.querySelector('img');
        const url =
          img?.currentSrc ||
          img?.src ||
          img?.getAttribute?.('src') ||
          readBackgroundUrl(badge) ||
          '';
        const label =
          img?.getAttribute?.('alt') ||
          img?.getAttribute?.('aria-label') ||
          badge.getAttribute?.('aria-label') ||
          badge.getAttribute?.('title') ||
          img?.getAttribute?.('title') ||
          badge.dataset?.badge ||
          badge.dataset?.badgeName ||
          badge.dataset?.badgeId ||
          '';
        if (!url && !label) return;
        if (url && /emote|emoji/i.test(url) && !/badge/i.test(url)) return;
        if (badges.some((entry) => entry.url === url && entry.label === label)) return;
        badges.push({ url, label: String(label || '').trim() });
      };
      badgeSelectors.forEach((selector) => {
        messageElement.querySelectorAll(selector).forEach((badge) => {
          pushBadge(badge);
        });
      });
      return badges.slice(0, 24);
    }

    extractUserColor(messageElement) {
      const usernameNode =
        messageElement.querySelector('[data-a-target="chat-message-username"]') ||
        messageElement.querySelector('[data-test-selector="chat-message-username"]') ||
        messageElement.querySelector('[data-a-target="chat-author-link"]') ||
        messageElement.querySelector('.chat-author__display-name') ||
        messageElement.querySelector('.chat-line__username');
      if (!(usernameNode instanceof HTMLElement)) return '';
      const inline = usernameNode.style?.color || usernameNode.getAttribute('style')?.match(/color\s*:\s*([^;]+)/i)?.[1] || '';
      if (inline) return inline.trim();
      const computed = window.getComputedStyle(usernameNode).color;
      return computed && computed !== 'rgb(255, 255, 255)' ? computed : '';
    }

    extractTimestamp(messageElement) {
      const dataset = messageElement.dataset || {};
      const numericCandidates = [
        dataset.timestamp,
        dataset.time,
        dataset.timeMs,
        dataset.ts,
        dataset.msgTime
      ];
      for (const candidate of numericCandidates) {
        if (!candidate) continue;
        const parsed = Number(candidate);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
      const timeSelectors = [
        'time',
        '[data-a-target="chat-message-timestamp"]',
        '.chat-line__timestamp',
        'span[data-test-selector="chat-message-timestamp"]'
      ];
      for (const selector of timeSelectors) {
        const timeElement = messageElement.querySelector(selector);
        if (!timeElement) {
          continue;
        }
        const datetime = timeElement.getAttribute('datetime') || timeElement.getAttribute('data-datetime');
        if (datetime) {
          const parsed = Date.parse(datetime);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }
        const aria = timeElement.getAttribute?.('aria-label');
        const parsedFromAria = this.parseTimeText(aria);
        if (Number.isFinite(parsedFromAria)) {
          return parsedFromAria;
        }
        const textContent = timeElement.textContent;
        const parsedFromText = this.parseTimeText(textContent);
        if (Number.isFinite(parsedFromText)) {
          return parsedFromText;
        }
      }
      const title = messageElement.getAttribute('title');
      const parsedFromTitle = this.parseTimeText(title);
      if (Number.isFinite(parsedFromTitle)) {
        return parsedFromTitle;
      }
      return null;
    }

    parseTimeText(value) {
      if (!value || typeof value !== 'string') {
        return null;
      }
      const normalized = value.trim();
      if (!normalized) return null;
      const hoursMatch = normalized.match(/(\d{1,2})[:hH\.](\d{2})(?:[:\.:](\d{2}))?\s*(am|pm)?/i);
      if (!hoursMatch) {
        return null;
      }
      let hours = Number(hoursMatch[1]);
      const minutes = Number(hoursMatch[2]);
      const seconds = hoursMatch[3] ? Number(hoursMatch[3]) : 0;
      const suffix = hoursMatch[4] ? hoursMatch[4].toLowerCase() : null;
      if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return null;
      }
      if (suffix === 'pm' && hours < 12) {
        hours += 12;
      } else if (suffix === 'am' && hours === 12) {
        hours = 0;
      }
      const now = new Date();
      now.setHours(hours, minutes, seconds, 0);
      return now.getTime();
    }
  }

  const CHAT_MESSAGE_SELECTOR =
    '[data-a-target="chat-line-message"], [data-test-selector="chat-line-message"], [data-a-target="chat-line-user-notice"], [data-test-selector="chat-line-user-notice"], [data-a-target="chat-line-message-body"], .chat-line__message, .chat-line__status, .seventv-message';
  const STATUS_LINK_WINDOW_MS = 15000;
  const DELETION_BURST_WINDOW_MS = 1500;
  const DELETION_PROMOTION_WINDOW_MS = 2000;

  class ModerationActionTracker {
    constructor(historyTracker) {
      this.historyTracker = historyTracker;
      this.actions = [];
      this.maxActions = 1000;
      this.observer = null;
      this.container = null;
      this.retryTimer = null;
      this.listeners = new Set();
      this.containerCheckTimer = null;
      this.mutationFrame = null;
      this.messageSelector = CHAT_MESSAGE_SELECTOR;
      this.actionKeys = new Set();
      this.recentActionCache = new Map();
      this.deletionEvidence = new Map();
      this.pendingStatuses = new Map();
      this.pendingMutations = [];
      this.observerRoot = null;
      this.visibilityHandler = () => this.handleVisibilityChange();
    }

    init() {
      document.addEventListener('visibilitychange', this.visibilityHandler);
      if (document.visibilityState !== 'hidden') this.observeChat(true);
      if (!this.containerCheckTimer) {
        this.containerCheckTimer = setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          if (!this.container || !this.container.isConnected) {
            this.observeChat(true);
          }
        }, 5000);
      }
    }

    dispose() {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.observer?.disconnect();
      this.observer = null;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      if (this.containerCheckTimer) {
        clearInterval(this.containerCheckTimer);
        this.containerCheckTimer = null;
      }
      if (this.mutationFrame) {
        cancelAnimationFrame(this.mutationFrame);
        this.mutationFrame = null;
      }
      this.pendingMutations = [];
      this.container = null;
      this.observerRoot = null;
      this.actions = [];
      this.actionKeys.clear();
      this.deletionEvidence.clear();
      this.pendingStatuses.clear();
      this.listeners.clear();
    }

    handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        this.observer?.disconnect();
        this.observer = null;
        this.pendingMutations = [];
        return;
      }
      this.observeChat(true);
    }

    subscribe(listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit() {
      const snapshot = this.getActions();
      this.listeners.forEach((listener) => {
        try {
          listener(snapshot);
        } catch (error) {
          console.error('[TFR] moderation tracker listener failed', error);
        }
      });
    }

    getActions() {
      return this.actions.slice();
    }

    observeChat(force = false) {
      if (!force && this.container?.isConnected) {
        return;
      }
      this.observer?.disconnect();
      this.observer = null;
      let container = null;
      if (this.historyTracker?.chatContainer?.isConnected) {
        container = this.historyTracker.chatContainer;
      } else if (typeof this.historyTracker?.findMessagesContainer === 'function') {
        try {
          container = this.historyTracker.findMessagesContainer();
        } catch (error) {
          console.error('[TFR] moderation tracker container error', error);
          container = null;
        }
      }
      if (!container) {
        container = document.querySelector?.(
          '[data-test-selector="chat-room-component-layout"], [data-a-target="chat-room-component-layout"], .chat-room, .stream-chat'
        ) || null;
      }
      if (!container) {
        if (!this.retryTimer) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.observeChat(true);
          }, 1500);
        }
        return;
      }
      this.container = container;
      this.observerRoot = this.findModerationRoot(container);
      this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
      this.observer.observe(this.observerRoot, {
        childList: true,
        subtree: true,
        characterData: true,
        attributeOldValue: true,
        attributes: true,
        attributeFilter: [
          'class', 'aria-label', 'title', 'data-deleted', 'data-deleted-message',
          'data-mod-action', 'data-moderation-action-type', 'data-action', 'data-duration',
          'data-timeout-duration', 'data-timeout-seconds'
        ]
      });
      this.captureExisting(this.observerRoot);
      this.scanModerationStatus(this.observerRoot);
    }

    findModerationRoot(container) {
      const explicit = container.closest?.(
        '[data-a-target="chat-room-component-layout"], [data-test-selector="chat-room-component-layout"], .chat-room, .stream-chat'
      );
      if (explicit) return explicit;
      let current = container;
      for (let depth = 0; current?.parentElement && depth < 8; depth += 1) {
        current = current.parentElement;
        if (current.querySelector?.('[data-a-target="chat-input"], textarea[data-a-target*="chat"], [contenteditable="true"]')) {
          return current;
        }
      }
      return container;
    }

    captureExisting(container) {
      const nodes = container.querySelectorAll(this.messageSelector);
      nodes.forEach((node) => this.captureAction(node));
    }

    handleMutations(mutations) {
      this.pendingMutations.push(...mutations);
      if (this.mutationFrame) return;
      this.mutationFrame = requestAnimationFrame(() => {
        if (document.visibilityState === 'hidden') {
          this.mutationFrame = null;
          this.pendingMutations = [];
          return;
        }
        const startedAt = window.TFRPerformance?.now?.();
        this.mutationFrame = null;
        const pending = this.pendingMutations.splice(0, this.pendingMutations.length);
        pending.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              this.scanNode(node);
              this.scanModerationStatus(node);
            });
            this.scanClosestMessage(mutation.target);
          } else if (this.shouldScanMutation(mutation)) {
            this.scanClosestMessage(mutation.target);
            this.scanModerationStatus(
              mutation.target?.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target
            );
          }
        });
        if (startedAt !== undefined) {
          window.TFRPerformance?.report?.('moderation.handleMutations', startedAt, { mutations: pending.length });
        }
      });
    }

    collectMessageElements(node) {
      const selector = this.messageSelector;
      const elements = [];
      const seen = new Set();
      const add = (element) => {
        if (element instanceof HTMLElement && !seen.has(element)) {
          seen.add(element);
          elements.push(element);
        }
      };
      if (!node) {
        return elements;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node;
        if (element.matches?.(selector)) {
          add(element);
        }
        element.querySelectorAll?.(selector)?.forEach((child) => add(child));
      } else if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent) {
          const root = parent.closest(selector);
          if (root) {
            add(root);
          }
        }
      }
      return elements;
    }

    scanNode(node) {
      this.collectMessageElements(node).forEach((element) => this.captureAction(element));
    }

    scanClosestMessage(node) {
      const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!(element instanceof HTMLElement)) return;
      const message = element.matches?.(this.messageSelector)
        ? element
        : element.closest?.(this.messageSelector);
      if (message) this.captureAction(message);
    }

    scanModerationStatus(node) {
      if (node?.nodeType !== Node.ELEMENT_NODE) return;
      const candidates = [node];
      node.querySelectorAll?.('[role="status"], [role="alert"], [data-a-target], [data-test-selector]')
        ?.forEach((element) => candidates.push(element));
      candidates.forEach((element) => this.captureModerationStatus(element));
    }

    captureModerationStatus(element) {
      if (!(element instanceof HTMLElement) || element.closest?.(this.messageSelector)) return false;
      const text = String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 700) return false;
      const normalized = this.normalizeText(text);
      const isPermanentBan = Boolean(
        element.matches?.('[data-test-selector="banned-user-message"], [data-a-target="banned-user-message"]')
        || element.closest?.('.banned-chat-overlay__halt')
        || /vous\s+avez\s+ete\s+banni\s+du\s+chat|tant\s+qu.un\s+moderateur\s+n.a\s+pas\s+annule\s+votre\s+bannissement|permanently\s+banned/.test(normalized)
      );
      const isTimeout = /(?:bannissement|ban)\s+temporaire|temporarily\s+banned|timed\s*out/.test(normalized);
      if (!isPermanentBan && !isTimeout) return false;
      const type = isPermanentBan ? 'ban' : 'timeout';
      const duration = isTimeout
        ? this.extractRoundedCountdownDuration(text) || this.extractDurationFromText(text)
        : null;
      const now = Date.now();
      const pendingStatus = {
        duration: Number.isFinite(duration) ? duration : null,
        rawMessage: text,
        detectedAt: now
      };
      this.pendingStatuses.set(type, pendingStatus);
      const signature = `${type}-status|${Number.isFinite(duration) ? duration : ''}|${normalized}`;
      if (element.dataset?.tfrModerationSignature === signature) return false;
      if (element.dataset) element.dataset.tfrModerationSignature = signature;
      const recentDeletion = [...this.actions].reverse().find((entry) => (
        entry?.type === 'deletion'
        && now - Number(entry.detectedAt || 0) <= STATUS_LINK_WINDOW_MS
      ));
      if (recentDeletion) {
        if (type === 'ban') {
          this.pendingStatuses.delete(type);
          return this.promoteDeletionToPermanentBan(recentDeletion, text);
        }
        this.pendingStatuses.delete(type);
        return this.promoteDeletionToTimeout(recentDeletion, duration, text);
      }
      const latest = this.historyTracker?.getLatestMessage?.(STATUS_LINK_WINDOW_MS);
      const login = this.historyTracker?.normalizeLogin?.(latest?.login) || '';
      if (!login) return false;
      this.addAction({
        id: `${type}-${login}-${now}`,
        login,
        displayName: latest?.displayName || login,
        type,
        duration: Number.isFinite(duration) ? duration : null,
        isPermanent: type === 'ban',
        moderator: null,
        timestamp: now,
        detectedAt: now,
        rawMessage: text,
        lastMessage: latest?.text || null,
        offenseMessage: latest?.text || null,
        lastMessageTimestamp: latest?.timestamp || null
      });
      this.pendingStatuses.delete(type);
      return true;
    }

    applyPendingPermanentBan(login) {
      return this.applyPendingStatus(login, 'ban');
    }

    applyPendingTimeout(login) {
      return this.applyPendingStatus(login, 'timeout');
    }

    applyPendingStatus(login, type) {
      const pending = this.pendingStatuses.get(type);
      if (!pending || Date.now() - Number(pending.detectedAt || 0) > STATUS_LINK_WINDOW_MS) {
        this.pendingStatuses.delete(type);
        return false;
      }
      const deletion = [...this.actions].reverse().find((entry) => (
        entry?.type === 'deletion'
        && entry.login === login
        && Math.abs(Number(entry.detectedAt || 0) - Number(pending.detectedAt || 0)) <= STATUS_LINK_WINDOW_MS
      ));
      if (!deletion) return false;
      this.pendingStatuses.delete(type);
      return this.promoteDeletion(deletion, {
        type,
        duration: pending.duration,
        rawMessage: pending.rawMessage
      });
    }

    extractRoundedCountdownDuration(text) {
      const normalized = String(text || '').replace(/[,]+/g, '.').replace(/\s+/g, ' ').trim();
      const countdown = normalized.match(
        /(?:dans|in)\s+((?:\d+(?:\.\d+)?\s*(?:secondes?|seconds?|secs?|minutes?|mins?|heures?|hours?|hrs?|jours?|days?)\s*){1,4})/i
      );
      if (!countdown?.[1]) return null;
      let totalSeconds = 0;
      const parts = countdown[1].matchAll(
        /(\d+(?:\.\d+)?)\s*(secondes?|seconds?|secs?|minutes?|mins?|heures?|hours?|hrs?|jours?|days?)/gi
      );
      for (const part of parts) {
        const seconds = this.convertDuration(part[1], part[2]);
        if (Number.isFinite(seconds)) totalSeconds += seconds;
      }
      return totalSeconds > 0 ? Math.ceil(totalSeconds / 60) * 60 : null;
    }

    recordDeletionEvidence(entry) {
      const login = entry?.login || '';
      if (!login) return false;
      const now = Number(entry.detectedAt) || Date.now();
      const fingerprint = `${entry.offenseMessage || entry.lastMessage || ''}|${entry.lastMessageTimestamp || entry.timestamp || ''}`;
      const evidence = (this.deletionEvidence.get(login) || [])
        .filter((item) => now - item.detectedAt <= DELETION_BURST_WINDOW_MS);
      if (!evidence.some((item) => item.fingerprint === fingerprint)) {
        evidence.push({ fingerprint, detectedAt: now });
      }
      this.deletionEvidence.set(login, evidence);
      if (evidence.length < 2) return false;
      const deletion = [...this.actions].reverse().find((action) => (
        action?.login === login
        && action.type === 'deletion'
        && now - Number(action.detectedAt || 0) <= DELETION_PROMOTION_WINDOW_MS
      ));
      if (!deletion) return false;
      return this.promoteDeletionToTimeout(deletion, null, deletion.rawMessage);
    }

    promoteDeletionToTimeout(entry, duration, rawMessage) {
      return this.promoteDeletion(entry, { type: 'timeout', duration, rawMessage });
    }

    promoteDeletionToPermanentBan(entry, rawMessage) {
      return this.promoteDeletion(entry, { type: 'ban', duration: null, rawMessage });
    }

    promoteDeletion(entry, { type, duration = null, rawMessage = '' } = {}) {
      if (!entry || !['timeout', 'ban'].includes(type)) return false;
      const previousKey = this.getActionCacheKey(entry);
      this.recentActionCache.delete(previousKey);
      if (entry.id) this.actionKeys.delete(entry.id);
      entry.type = type;
      entry.duration = type === 'timeout' && Number.isFinite(duration) ? duration : null;
      entry.isPermanent = type === 'ban';
      entry.rawMessage = rawMessage || entry.rawMessage;
      entry.detectedAt = Date.now();
      entry.id = `${type}-${entry.login}-${entry.detectedAt}`;
      this.actionKeys.add(entry.id);
      this.recentActionCache.set(this.getActionCacheKey(entry), { detectedAt: entry.detectedAt, entry });
      this.emit();
      return true;
    }

    shouldScanMutation(mutation) {
      if (!mutation) return false;
      if (mutation.type === 'characterData') {
        const parent = mutation.target?.parentElement;
        const context = `${parent?.textContent || ''} ${parent?.getAttribute?.('aria-label') || ''}`;
        return /(supprim|deleted|timeout|timed\s*out|tempo|bann|moderat|silence|mute)/i.test(context)
          || Boolean(parent?.closest?.('[data-a-target="deleted-message"], [data-test-selector*="deleted"]'));
      }
      if (mutation.type !== 'attributes') return false;
      if (mutation.attributeName === 'class') {
        const current = mutation.target?.getAttribute?.('class') || '';
        return /(deleted|warning|moderation|timeout|bann|ban-|is-deleted)/i.test(`${mutation.oldValue || ''} ${current}`);
      }
      if (mutation.attributeName === 'aria-label' || mutation.attributeName === 'title') {
        const current = mutation.target?.getAttribute?.(mutation.attributeName) || '';
        return /(supprim|deleted|timeout|timed\s*out|tempo|bann|moderat|silence|mute)/i.test(current);
      }
      return mutation.attributeName?.startsWith('data-') || false;
    }

    captureAction(element) {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const textContent = this.extractText(element);
      const dataset = element.dataset || {};
      const action = this.extractAction(element, textContent);
      if (!action || !action.login) {
        return;
      }
      const signature = [action.type, action.login, action.duration || '', action.isPermanent ? '1' : '0', action.message || ''].join('|');
      if (dataset.tfrModerationSignature === signature) return;
      dataset.tfrModerationSignature = signature;
      const normalized = this.historyTracker?.normalizeLogin?.(action.login) || '';
      if (!normalized) {
        return;
      }
      const history = typeof this.historyTracker?.getHistory === 'function' ? this.historyTracker.getHistory(normalized) : [];
      const lastMessage = history.length ? history[history.length - 1] : null;
      const offenseMessage =
        action.message ||
        this.extractOriginalMessage(element, textContent) ||
        lastMessage?.text ||
        null;
      const entry = {
        id: `${action.type}-${normalized}-${action.timestamp}`,
        login: normalized,
        displayName: action.displayName || lastMessage?.displayName || normalized,
        type: action.type,
        duration: Number.isFinite(action.duration) ? action.duration : null,
        isPermanent: Boolean(action.isPermanent),
        moderator: action.moderator || null,
        timestamp: action.timestamp,
        detectedAt: Date.now(),
        rawMessage: action.rawMessage,
        lastMessage: lastMessage?.text || null,
        offenseMessage: offenseMessage,
        lastMessageTimestamp: lastMessage?.timestamp || null
      };
      this.addAction(entry);
      if (entry.type === 'deletion') {
        if (!this.applyPendingPermanentBan(entry.login) && !this.applyPendingTimeout(entry.login)) {
          this.recordDeletionEvidence(entry);
        }
      }
    }

    addAction(entry) {
      if (!entry || !entry.id) {
        return;
      }
      const key = this.getActionCacheKey(entry);
      const cached = this.recentActionCache.get(key);
      const nowTs = Number(entry.detectedAt) || Date.now();
      if (cached) {
        const age = Math.abs(nowTs - cached.detectedAt);
        if (age < 60000) {
          const updated = this.mergeModerationEntries(cached.entry, entry);
          cached.detectedAt = nowTs;
          if (updated) {
            this.emit();
          }
          return;
        }
        if (age > 10 * 60 * 1000) {
          this.recentActionCache.delete(key);
        }
      }
      if (this.actionKeys.has(entry.id)) {
        return;
      }
      this.actionKeys.add(entry.id);
      this.actions.push(entry);
      this.recentActionCache.set(key, { detectedAt: nowTs, entry });
      if (this.actions.length > this.maxActions) {
        const removed = this.actions.splice(0, this.actions.length - this.maxActions);
        removed.forEach((item) => {
          if (item?.id) {
            this.actionKeys.delete(item.id);
          }
        });
      }
      this.emit();
    }

    getActionCacheKey(entry) {
      const type = entry?.type || 'unknown';
      const login = entry?.login || '';
      if (type === 'timeout') {
        const duration = Number.isFinite(entry.duration) ? Math.round(entry.duration) : 'unknown';
        return `${type}:${login}:${duration}`;
      }
      if (type === 'ban') {
        return `${type}:${login}:${entry?.isPermanent ? 'permanent' : 'temporary'}`;
      }
      return `${type}:${login}`;
    }

    mergeModerationEntries(target, source) {
      if (!target || !source) {
        return false;
      }
      let updated = false;
      if (
        Number.isFinite(source.duration) &&
        (!Number.isFinite(target.duration) || source.duration > target.duration)
      ) {
        target.duration = source.duration;
        updated = true;
      }
      if (source.isPermanent && !target.isPermanent) {
        target.isPermanent = true;
        updated = true;
      }
      const sourceMessageTime = Number(source.timestamp) || 0;
      const targetMessageTime = Number(target.timestamp) || 0;
      const sourceHasNewerMessage = sourceMessageTime >= targetMessageTime;
      if (sourceHasNewerMessage) {
        const fields = ['timestamp', 'rawMessage', 'lastMessage', 'offenseMessage', 'lastMessageTimestamp'];
        fields.forEach((field) => {
          if (source[field] && target[field] !== source[field]) {
            target[field] = source[field];
            updated = true;
          }
        });
      } else if (!target.offenseMessage && source.offenseMessage) {
        target.offenseMessage = source.offenseMessage;
        updated = true;
      }
      if (source.displayName && target.displayName !== source.displayName) {
        target.displayName = source.displayName;
        updated = true;
      }
      if (source.moderator && target.moderator !== source.moderator) {
        target.moderator = source.moderator;
        updated = true;
      }
      target.detectedAt = Number(source.detectedAt) || Date.now();
      return updated;
    }

    extractAction(element, rawText) {
      const dataset = element.dataset || {};
      const messageSnapshot = this.historyTracker?.getMessageSnapshot?.(element) || null;
      const timestamp =
        (typeof this.historyTracker?.extractTimestamp === 'function' && this.historyTracker.extractTimestamp(element)) ||
        Date.now();
      const simplified = this.normalizeText(rawText);
      if (simplified && (simplified.includes('debann') || simplified.includes('unban'))) {
        return null;
      }
      const datasetNumericCandidates = [];
      const datasetTextHints = [];
      const addCandidate = (value, unitHint = null) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return;
        }
        if (unitHint) {
          datasetNumericCandidates.push({ value: numeric, unit: unitHint });
        } else {
          datasetNumericCandidates.push(numeric);
        }
      };
      const collectFromJson = (node, keyPath = '') => {
        if (node === null || node === undefined) {
          return;
        }
        if (typeof node === 'number') {
          const unit = /ms/i.test(keyPath) ? 'ms' : null;
          addCandidate(node, unit);
          return;
        }
        if (typeof node === 'string') {
          const trimmed = node.trim();
          if (!trimmed) return;
          datasetTextHints.push(trimmed);
          const numeric = Number(trimmed);
          if (Number.isFinite(numeric) && numeric > 0) {
            const unit = /ms/i.test(keyPath) ? 'ms' : null;
            addCandidate(numeric, unit);
          }
          return;
        }
        if (Array.isArray(node)) {
          node.forEach((child) => collectFromJson(child, keyPath));
          return;
        }
        if (typeof node === 'object') {
          Object.entries(node).forEach(([childKey, childValue]) => {
            const nextKey = keyPath ? `${keyPath}.${childKey}` : childKey;
            collectFromJson(childValue, nextKey);
          });
        }
      };

      Object.entries(dataset).forEach(([key, value]) => {
        if (typeof value === 'number') {
          const unit = /ms/i.test(key) ? 'ms' : null;
          addCandidate(value, unit);
        } else if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) return;
          const numeric = Number(trimmed);
          if (Number.isFinite(numeric) && numeric > 0) {
            const unit = /ms/i.test(key) ? 'ms' : null;
            addCandidate(numeric, unit);
          } else {
            datasetTextHints.push(trimmed);
            if (
              (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
              (trimmed.startsWith('[') && trimmed.endsWith(']'))
            ) {
              try {
                collectFromJson(JSON.parse(trimmed), key);
              } catch {
                // ignore invalid JSON strings
              }
            }
          }
        }
      });

      const elementInnerText = this.normalizeText(element.textContent || '');
      const analysisParts = [simplified, elementInnerText, ...datasetTextHints];
      let analysisText = analysisParts.filter(Boolean).join(' ') || '';
      const loginCandidate =
        this.pickFirst([
          dataset.targetUser,
          dataset.targetUserLogin,
          dataset.targetUsername,
          dataset.target,
          dataset.user,
          dataset.username,
          dataset.userName,
          dataset.login,
          dataset.userLogin,
          dataset.aUser,
          dataset.aUserLogin,
          dataset.moderationEventTarget,
          dataset.modTarget,
          element.getAttribute?.('data-target-user'),
          element.getAttribute?.('data-target'),
          element.getAttribute?.('data-username'),
          element.getAttribute?.('data-user'),
          element.getAttribute?.('data-user-login'),
          element.getAttribute?.('data-sender')
        ]) ||
        (typeof this.historyTracker?.extractLogin === 'function'
          ? this.historyTracker.extractLogin(element)
          : '') ||
        messageSnapshot?.login ||
        this.extractLoginFromText(analysisText);
      let login = this.sanitizeLogin(loginCandidate);
      if (!login && messageSnapshot?.login) {
        login = this.sanitizeLogin(messageSnapshot.login);
      }
      if (!login) {
        login = this.extractLoginFromText(analysisText);
      }
      if (!login) {
        return null;
      }
      const moderatorCandidate =
        this.pickFirst([
          dataset.createdBy,
          dataset.moderator,
          dataset.sourceModerator,
          dataset.moderationEventSource,
          dataset.mod,
          element.getAttribute?.('data-moderator'),
          element.getAttribute?.('data-created-by')
        ]) || this.extractModeratorFromText(analysisText);
      const moderator = this.sanitizeLogin(moderatorCandidate);
      const displayName =
        this.pickFirst([
          dataset.targetDisplayName,
          dataset.displayName,
          dataset.userDisplayName,
          dataset.targetUserDisplayName
        ]) || messageSnapshot?.displayName || null;
      let type = null;
      let durationSeconds =
        this.parseDurationCandidates([
          dataset.durationSeconds,
          dataset.duration,
          dataset.durationSec,
          dataset.durationInSeconds,
          dataset.lengthSeconds,
          dataset.length,
          dataset.timeoutDuration,
          dataset.timeoutDurationSeconds,
          dataset.timeoutDurationSec,
          dataset.timeoutLength,
          dataset.timeoutLengthSeconds,
          dataset.timeoutSeconds,
          dataset.timeout,
          dataset.muteDuration,
          dataset.silenceDuration,
          dataset.banDuration,
          dataset.banDurationSeconds,
          dataset.banDurationSec,
          dataset.timeToUnban,
          dataset.durationMs ? { value: dataset.durationMs, unit: 'ms' } : null,
          dataset.timeoutDurationMs ? { value: dataset.timeoutDurationMs, unit: 'ms' } : null,
          dataset.banDurationMs ? { value: dataset.banDurationMs, unit: 'ms' } : null,
          { value: element.getAttribute?.('data-duration') },
          { value: element.getAttribute?.('data-duration-seconds') },
          { value: element.getAttribute?.('data-timeout-duration') },
          { value: element.getAttribute?.('data-timeout-seconds') },
          { value: element.getAttribute?.('data-duration-ms'), unit: 'ms' },
          { value: element.getAttribute?.('data-timeout-duration-ms'), unit: 'ms' }
        ].concat(datasetNumericCandidates)) || null;

      const attributeHints = [
        dataset.moderationActionType,
        dataset.modAction,
        dataset.action,
        dataset.type,
        dataset.messageType,
        dataset.commandName,
        dataset.noticeType,
        dataset.eventType,
        dataset.category,
        element.getAttribute?.('data-a-target'),
        element.getAttribute?.('data-test-selector'),
        element.getAttribute?.('class')
      ];
      const childHintNodes = Array.from(
        element.querySelectorAll('[data-mod-action],[data-moderation-action-type],[data-test-selector],[data-a-target]')
      ).filter((node) => !this.isInteractiveModerationControl(node));
      childHintNodes.forEach((node) => {
        const nodeDataset = node.dataset || {};
        Object.entries(nodeDataset).forEach(([datasetKey, datasetValue]) => {
          attributeHints.push(datasetValue);
          if (typeof datasetValue === 'number') {
            const unit = /ms/i.test(datasetKey) ? 'ms' : null;
            addCandidate(datasetValue, unit);
          } else if (typeof datasetValue === 'string') {
            const trimmed = datasetValue.trim();
            if (!trimmed) return;
            datasetTextHints.push(trimmed);
            const numeric = Number(trimmed);
            if (Number.isFinite(numeric) && numeric > 0) {
              const unit = /ms/i.test(datasetKey) ? 'ms' : null;
              addCandidate(numeric, unit);
            } else if (
              (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
              (trimmed.startsWith('[') && trimmed.endsWith(']'))
            ) {
              try {
                collectFromJson(JSON.parse(trimmed), datasetKey);
              } catch {
                // ignore invalid JSON
              }
            }
          }
        });
        attributeHints.push(node.getAttribute?.('data-a-target'));
        attributeHints.push(node.getAttribute?.('data-test-selector'));
        attributeHints.push(node.className);
      });
      element.querySelectorAll('[aria-label], [title], [data-duration], [data-timeout], [data-a-target], [data-test-selector]').forEach((node) => {
        const ariaLabel = node.getAttribute?.('aria-label');
        const title = node.getAttribute?.('title');
        const textValue = node.textContent;
        if (ariaLabel) datasetTextHints.push(ariaLabel);
        if (title) datasetTextHints.push(title);
        if (textValue && /timeout|timed\s*out|tempo|temporaire|silence|mute|ban\s+temporaire|pour|pendant|for/i.test(textValue)) {
          datasetTextHints.push(textValue);
        }
      });
      analysisText = this.normalizeText([analysisText, ...datasetTextHints].filter(Boolean).join(' ')) || analysisText;
      const attributeHintSource = attributeHints
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.toLowerCase())
        .join(' ');
      const actionHint = attributeHintSource ? this.normalizeText(attributeHintSource) : '';
      const hasActionHint = Boolean(actionHint);

      if (hasActionHint && /(announcement|annonce|announce|shoutout)/.test(actionHint)) {
        return null;
      }

      if (!type && hasActionHint) {
        if (/(ban permanent|perma|ban def|permanent ban)/.test(actionHint)) {
          type = 'ban';
        } else if (/(timeout|temporaire|tempo|silence|mute|timed out|masque)/.test(actionHint)) {
          type = 'timeout';
        } else if (this.hasBanIndicator(actionHint)) {
          type = 'ban';
        }
      }

      const appendedBanMatch = analysisText.match(/^\s*(?<user>[@\w-]+).*?\((?:banni|ban|banned|perma)\)/);
      if (!type && appendedBanMatch) {
        const candidate = this.sanitizeLogin(appendedBanMatch.groups?.user || login);
        if (candidate) {
          login = candidate;
          type = 'ban';
        }
      }

      const appendedTimeoutMatch = analysisText.match(
        /^\s*(?<user>[@\w-]+).*?\((?:tempo|timeout|timed\s*out|masque|mute|supprime|deleted|efface)\)/
      );
      if (!type && appendedTimeoutMatch) {
        const candidate = this.sanitizeLogin(appendedTimeoutMatch.groups?.user || login);
        if (candidate) {
          login = candidate;
          type = 'timeout';
        }
        if (!Number.isFinite(durationSeconds)) {
          durationSeconds = this.extractDurationFromText(analysisText);
        }
      }

      const deletionResult = this.detectDeletionAction(element, analysisText);
      if (deletionResult) {
        if (!type) {
          type = deletionResult.type;
        }
        if (!Number.isFinite(durationSeconds) && Number.isFinite(deletionResult.duration)) {
          durationSeconds = deletionResult.duration;
        }
      }

      if (!type) {
        const banMatch = analysisText.match(/^\s*(?<user>[^\s]+)\s+(?:a\s+ete|has|was)\s+(?:ete\s+)?bann/i);
        if (banMatch) {
          const user = this.sanitizeLogin(banMatch.groups?.user || login);
          if (user) {
            login = user;
            type = 'ban';
          }
        }
      }

      if (!type) {
        const timeoutMatch = analysisText.match(
          /^\s*(?<user>[^\s]+)\s+(?:a\s+ete\s+reduit\s+au\s+silence|a\s+ete\s+tempo|a\s+ete\s+mute|a\s+ete\s+temporaire|has\s+been\s+timed\s+out|was\s+timed\s+out|ban\s+temporaire)\s*(?:pour|pendant|for|de)?\s*(?<duration>\d+)?\s*(?<unit>seconde|secondes|seconds?|minute|minutes?|hour|hours?|heure|heures?|day|days?|jour|jours?|week|weeks?|semaine|semaines)?/
        );
        if (timeoutMatch) {
          const user = this.sanitizeLogin(timeoutMatch.groups?.user || login);
          if (user) {
            login = user;
            type = 'timeout';
          }
          if (!Number.isFinite(durationSeconds)) {
            durationSeconds = this.convertDuration(timeoutMatch.groups?.duration, timeoutMatch.groups?.unit);
          }
        }
      }

      if (!type) {
        return null;
      }

      const nearbyDurationSources = this.collectNearbyModerationHints(element);
      const durationSources = [
        analysisText,
        elementInnerText,
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('title'),
        element.getAttribute?.('data-duration-label'),
        ...datasetTextHints,
        ...nearbyDurationSources
      ].filter((value) => typeof value === 'string' && value.trim());
      const contextualDurationCandidates = durationSources
        .map((value) => this.extractTimeoutDurationFromText(value))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (contextualDurationCandidates.length) {
        const maxTextDuration = Math.max(...contextualDurationCandidates);
        if (!Number.isFinite(durationSeconds) || maxTextDuration > durationSeconds * 1.5 || (maxTextDuration >= 60 && durationSeconds < 60)) {
          durationSeconds = maxTextDuration;
        }
      }
      if (!Number.isFinite(durationSeconds) && type === 'timeout') {
        const genericDurationCandidates = durationSources
          .map((value) => this.extractDurationFromText(value))
          .filter((value) => Number.isFinite(value) && value > 0);
        if (genericDurationCandidates.length) {
          durationSeconds = Math.max(...genericDurationCandidates);
        }
      }
      if (Number.isFinite(durationSeconds) && durationSeconds > MAX_TIMEOUT_SECONDS) {
        durationSeconds = null;
      }
      const extractedMessage = this.extractOriginalMessage(element, rawText);
      const message = messageSnapshot?.text && this.isModerationPlaceholder(extractedMessage)
        ? messageSnapshot.text
        : extractedMessage || messageSnapshot?.text || '';
      const isPermanent =
        type === 'ban'
          ? this.shouldTreatAsPermanentBan(
              dataset,
              simplified,
              Number.isFinite(durationSeconds) ? durationSeconds : null,
              actionHint
            )
          : false;
      return {
        type,
        login,
        duration: Number.isFinite(durationSeconds) ? durationSeconds : null,
        isPermanent,
        displayName,
        moderator: moderator || null,
        timestamp,
        rawMessage: rawText,
        message
      };
    }

    collectNearbyModerationHints(element) {
      const hints = [];
      const seen = new Set();
      const hasModerationContext = (value) => (
        /timeout|timed\s*out|tempo|temporaire|silence|mute|ban\s+temporaire|duration|dur[eé]e|pour|pendant|for/i.test(value)
      );
      const push = (value) => {
        if (typeof value !== 'string') return;
        const trimmed = value.replace(/\s+/g, ' ').trim();
        if (!trimmed || trimmed.length > 1600 || !hasModerationContext(trimmed) || seen.has(trimmed)) {
          return;
        }
        seen.add(trimmed);
        hints.push(trimmed);
      };
      const collect = (node) => {
        if (!(node instanceof HTMLElement)) return;
        push(node.innerText || node.textContent || '');
        push(node.getAttribute?.('aria-label') || '');
        push(node.getAttribute?.('title') || '');
        Object.values(node.dataset || {}).forEach((value) => push(value));
      };
      let current = element instanceof HTMLElement ? element : null;
      for (let depth = 0; current && depth < 4; depth += 1) {
        collect(current);
        collect(current.previousElementSibling);
        collect(current.nextElementSibling);
        current = current.parentElement;
      }
      return hints;
    }

    detectDeletionAction(element, simplifiedText) {
      if (!element) {
        return null;
      }
      const dataset = element.dataset || {};
      const deletionNode =
        element.querySelector(
          '[data-a-target="deleted-message"], [data-test-selector="chat-line-message-deleted"], [data-test-selector="chat-deleted-message"], span[data-a-target="deleted-message"]'
        ) || null;
      const appendedTextBan = simplifiedText
        ? /\((?:banni|ban|permaban|perma|ban\s*def|ban\s*d[eé]finitif)\)/.test(simplifiedText)
        : false;
      const appendedTextTimeout = simplifiedText
        ? /\((?:tempo|timeout|timed\s*out|silence|mute|masque)\)/.test(simplifiedText)
        : false;
      const appendedTextIndicator = appendedTextBan || appendedTextTimeout;
      const explicitDeletionText = /(?:message\s+)?(?:supprime|efface|deleted|removed)\s+(?:par\s+un\s+moderateur|by\s+a\s+moderator)/.test(simplifiedText || '');
      const deletionText = this.normalizeText(deletionNode?.textContent || '');
      const actionValue = typeof dataset.action === 'string' ? dataset.action.toLowerCase() : '';
      const modActionValue = typeof dataset.modAction === 'string' ? dataset.modAction.toLowerCase() : '';
      const datasetHints = [
        dataset.moderationActionType,
        dataset.modAction,
        dataset.action,
        dataset.type,
        dataset.messageType,
        dataset.noticeType,
        dataset.category,
        dataset.subtype,
        dataset.commandName
      ]
        .map((value) => (typeof value === 'string' ? this.normalizeText(value) : ''))
        .filter(Boolean);
      const indicatorParts = [deletionText, ...datasetHints];
      const indicatorText = indicatorParts.join(' ').trim();
      const BAN_PATTERN = /\b(banni?|perma|permaban|ban\s*def|ban\s*permanent|ban\s*perma|ban\s*d[eé]finitif|definitif|permanent|ban)\b/;
      const TIMEOUT_PATTERN = /\b(timeout|temps?o|tempo|timed\s*out|silence|mute|masque|suspendu)\b/;
      const indicatesBan = indicatorText
        ? BAN_PATTERN.test(indicatorText) || this.hasBanIndicator(actionValue)
        : this.hasBanIndicator(actionValue);
      const indicatesTimeout = indicatorText ? TIMEOUT_PATTERN.test(indicatorText) || /timeout|tempo/.test(actionValue) : /timeout|tempo/.test(actionValue);
      const hasDeletedFlag =
        this.isTruthy(dataset.deleted) ||
        this.isTruthy(dataset.deletedMessage) ||
        this.isTruthy(dataset.deletedMsg) ||
        this.isTruthy(dataset.deletedBy) ||
        this.isTruthy(dataset.isDeleted) ||
        (modActionValue && /(ban|timeout|delete|remove|block|silence|mute)/.test(modActionValue)) ||
        (actionValue && /(ban|timeout|delete|remove|block|silence|mute)/.test(actionValue));
      const classIndicator =
        element.classList?.contains('chat-line__message--deleted') ||
        element.classList?.contains('is-deleted') ||
        element.classList?.contains('chat-line__message--warning');
      const appendedIndicator = /\((?:banni|ban|timeout|tempo|supprime|deleted|masque|mute)\)/.test(this.normalizeText(deletionNode?.textContent || ''));
      const hasStrongIndicator =
        hasDeletedFlag || classIndicator || Boolean(deletionNode) || appendedIndicator || appendedTextIndicator
        || explicitDeletionText || indicatesBan || indicatesTimeout;
      if (!hasStrongIndicator) {
        return null;
      }
      let type = null;
      if (indicatesBan || appendedTextBan) {
        type = 'ban';
      } else if (indicatesTimeout || appendedTextTimeout) {
        type = 'timeout';
      } else {
        type = 'deletion';
      }
      const durationSource = [indicatorText, this.normalizeText(actionValue), this.normalizeText(modActionValue), simplifiedText]
        .filter(Boolean)
        .join(' ');
      const duration = this.extractDurationFromText(durationSource);
      if (!type && Number.isFinite(duration)) {
        type = 'timeout';
      }
      return {
        type,
        duration: type === 'timeout' && Number.isFinite(duration) ? duration : null
      };
    }

    parseDurationCandidates(values) {
      return durationTools.first(values);
    }

    parseDurationValue(value, unitHint = null) {
      return durationTools.parse(value, unitHint);
    }

    normalizeDurationNumber(value, unitHint = null) {
      return durationTools.normalizeNumber(value, unitHint);
    }

    shouldTreatAsPermanentBan(dataset, simplified, durationSeconds, actionHint) {
      if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        return false;
      }
      const hints = [
        dataset?.isPermanent,
        dataset?.permanent,
        dataset?.permaban,
        dataset?.banType,
        dataset?.moderationActionType,
        dataset?.modAction,
        dataset?.action,
        actionHint
      ];
      for (const hint of hints) {
        if (hint === undefined || hint === null || hint === '') continue;
        if (typeof hint === 'boolean') {
          if (hint) return true;
          continue;
        }
        if (typeof hint === 'string') {
          const normalized = hint.toLowerCase();
          if (/(perma|permanent|indef|definitif|definitive|forever)/.test(normalized)) {
            return true;
          }
        }
      }
      if (typeof simplified === 'string' && /(perma|permanent|indef|definitif|definitive|forever)/.test(simplified)) {
        return true;
      }
      return true;
    }

    extractOriginalMessage(element, rawText) {
      const dataset = element?.dataset || {};
      const candidate = this.pickFirst([
        dataset.originalMessage,
        dataset.originalMessageBody,
        dataset.deletedMessage,
        dataset.deletedMsg,
        dataset.moderationMessage,
        dataset.message,
        dataset.msg,
        dataset.messageBody,
        dataset.body,
        dataset.content,
        dataset.rawMessage,
        dataset.plainText,
        dataset.plaintext,
        dataset.messagePlainText,
        element?.getAttribute?.('data-original-message'),
        element?.getAttribute?.('data-deleted-message'),
        element?.getAttribute?.('data-message'),
        element?.getAttribute?.('data-msg'),
        element?.getAttribute?.('data-plain-text')
      ]);
      let message = candidate || '';
      if (!message) {
        const aria = element?.getAttribute?.('aria-label');
        if (aria) {
          message = aria;
        }
      }
      if (!message) {
        const title = element?.getAttribute?.('title');
        if (title) {
          message = title;
        }
      }
      if (!message && typeof this.historyTracker?.extractMessageText === 'function') {
        try {
          message = this.historyTracker.extractMessageText(element) || '';
        } catch {
          message = '';
        }
      }
      if (!message && rawText) {
        message = rawText;
      }
      return this.cleanModerationMessage(message);
    }

    cleanModerationMessage(value) {
      if (!value || typeof value !== 'string') {
        return '';
      }
      let cleaned = value;
      const removalPatterns = [
        /\s*\((?:efface|effac[eÃ©]|supprime|supprim[eÃ©]|deleted|timeout|timed out|tempo|hidden|masqu[eÃ©]|ban(?:ne)?|banni|mod[eÃ©]r[Ã©e])[^)]*\)\s*$/i,
        /(?:message\s+supprim[eÃ©]\s+par.*)$/i,
        /^(?:\*+|\u2022|\-)+\s*/i
      ];
      removalPatterns.forEach((pattern) => {
        cleaned = cleaned.replace(pattern, '').trim();
      });
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      return cleaned;
    }

    isModerationPlaceholder(value) {
      const normalized = this.normalizeText(value);
      if (!normalized) return true;
      return /^(?:ce\s+)?message\s+(?:a\s+ete\s+)?(?:supprime|deleted|efface|masque|modere)(?:\s+(?:par|by)\b.*)?[.!]?$/i.test(normalized)
        || /^(?:message\s+)?(?:deleted|removed)\s+(?:by\s+)?(?:a\s+)?moderator[.!]?$/i.test(normalized);
    }

    extractText(element) {
      if (!element) return '';
      const text = element.textContent || '';
      return text.replace(/\s+/g, ' ').trim();
    }

    normalizeText(value) {
      if (!value) return '';
      let normalized = value;
      try {
        normalized = value.normalize('NFKC');
      } catch {
        normalized = value;
      }
      normalized = normalized.toLowerCase().replace(/\s+/g, ' ');
      try {
        normalized = normalized.normalize('NFD');
      } catch {
        // ignore normalization issues
      }
      normalized = normalized.replace(/[\u0300-\u036f]/g, '');
      return normalized.trim();
    }

    hasBanIndicator(value) {
      const normalized = this.normalizeText(value);
      if (!normalized || /\b(?:banner|banners)\b/.test(normalized)) return false;
      return /(?:^|[^a-z0-9])(?:ban|banned|banni|bannie|bannissement|permaban|perma-ban)(?:$|[^a-z0-9])/i.test(normalized);
    }

    isInteractiveModerationControl(element) {
      if (!element) return false;
      const tagName = String(element.tagName || '').toLowerCase();
      const role = String(element.getAttribute?.('role') || '').toLowerCase();
      return ['button', 'a', 'input', 'select', 'textarea'].includes(tagName)
        || ['button', 'menuitem', 'option', 'link'].includes(role)
        || Boolean(element.closest?.('button, a, [role="button"], [role="menuitem"]'));
    }

    pickFirst(values) {
      if (!Array.isArray(values)) return null;
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      return null;
    }

    sanitizeLogin(value) {
      if (!value || typeof value !== 'string') {
        return '';
      }
      let cleaned = value.trim().replace(/^@/, '');
      cleaned = cleaned.replace(/^[^a-z0-9_]+/i, '');
      cleaned = cleaned.replace(/[^a-z0-9_]+$/i, '');
      cleaned = cleaned.toLowerCase();
      if (!cleaned) {
        return '';
      }
      if (!/^[a-z0-9_]+$/.test(cleaned)) {
        return '';
      }
      if (!/[a-z_]/.test(cleaned)) {
        return '';
      }
      return cleaned;
    }

    extractLoginFromText(text) {
      if (!text || typeof text !== 'string') return '';
      const tokens = text.split(/\s+/);
      for (const rawToken of tokens) {
        if (!rawToken) continue;
        const trimmed = rawToken.replace(/^[^a-z0-9@_]+/i, '').replace(/[^a-z0-9@_]+$/i, '');
        const candidate = this.sanitizeLogin(trimmed);
        if (candidate) {
          return candidate;
        }
      }
      return '';
    }

    extractModeratorFromText(text) {
      if (!text) return null;
      const modMatch = text.match(/\b(?:by|par)\s+(@?[^\s\.\)]+)/i);
      if (modMatch && modMatch[1]) {
        const sanitized = this.sanitizeLogin(modMatch[1]);
        if (!sanitized) {
          return null;
        }
        if (['un', 'une', 'le', 'la', 'an', 'a', 'moderateur', 'moderator'].includes(sanitized)) {
          return null;
        }
        return sanitized;
      }
      return null;
    }

    extractTimeoutDurationFromText(text) {
      return durationTools.timeoutFromText(text);
      /* Legacy parser kept below for one release as a comparison reference. */
      if (!text) {
        return null;
      }
      const normalizedText = String(text)
        .replace(/[,]+/g, '.')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalizedText || !/(timeout|timed\s*out|tempo|temporaire|silence|mute|ban\s+temporaire|reduit\s+au\s+silence|réduit\s+au\s+silence)/i.test(normalizedText)) {
        return null;
      }
      const contextPatterns = [
        /(?:timeout|timed\s*out|tempo|temporaire|silence|mute|ban\s+temporaire|reduit\s+au\s+silence|réduit\s+au\s+silence).{0,80}?(?:pour|pendant|for|dur[eé]e\s*:?|duration\s*:?|de)?\s*(\d+(?:\.\d+)?)\s*(millisecondes?|milliseconds?|ms|secondes?|seconds?|secs?|sec|minutes?|mins?|min|mn|heures?|hours?|hrs?|hr|jours?|days?|semaines?|weeks?|[smhdw])/i,
        /(?:pour|pendant|for|dur[eé]e\s*:?|duration\s*:?)\s*(\d+(?:\.\d+)?)\s*(millisecondes?|milliseconds?|ms|secondes?|seconds?|secs?|sec|minutes?|mins?|min|mn|heures?|hours?|hrs?|hr|jours?|days?|semaines?|weeks?|[smhdw]).{0,80}?(?:timeout|timed\s*out|tempo|temporaire|silence|mute|ban\s+temporaire)/i
      ];
      for (const pattern of contextPatterns) {
        const match = normalizedText.match(pattern);
        if (match) {
          const parsed = this.convertDuration(match[1], match[2]);
          if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
          }
        }
      }
      return null;
    }

    extractDurationFromText(text) {
      return durationTools.fromText(text);
      /* Legacy parser kept below for one release as a comparison reference. */
      if (!text) {
        return null;
      }
      const normalizedText = String(text)
        .replace(/[,]+/g, '.')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalizedText) {
        return null;
      }
      const colonMatch = normalizedText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (colonMatch) {
        const hasHours = Boolean(colonMatch[3]);
        const hours = hasHours ? Number(colonMatch[1]) : 0;
        const minutes = hasHours ? Number(colonMatch[2]) : Number(colonMatch[1]);
        const seconds = hasHours ? Number(colonMatch[3]) : Number(colonMatch[2]);
        if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
          return hours * 3600 + minutes * 60 + seconds;
        }
      }
      const durationMatch = normalizedText.match(
        /(\d+(?:\.\d+)?)\s*(millisecondes?|milliseconds?|ms|secondes?|seconds?|secs?|sec|minutes?|mins?|min|mn|heures?|hours?|hrs?|hr|jours?|days?|semaines?|weeks?|[smhdw])/i
      );
      if (durationMatch) {
        return this.convertDuration(durationMatch[1], durationMatch[2]);
      }
      return null;
    }

    isTruthy(value) {
      if (value === undefined || value === null) {
        return false;
      }
      const normalized = String(value).trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      return !['0', 'false', 'no', 'non', 'off', 'null', 'undefined'].includes(normalized);
    }

    convertDuration(value, unit) {
      return durationTools.convert(value, unit);
      /* Legacy parser kept below for one release as a comparison reference. */
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
      }
      const normalizedUnit = (unit || '').toLowerCase();
      switch (normalizedUnit) {
        case 'minute':
        case 'minutes':
        case 'min':
        case 'mins':
        case 'mn':
        case 'm':
          return numeric * 60;
        case 'hour':
        case 'hours':
        case 'heure':
        case 'heures':
        case 'hr':
        case 'hrs':
        case 'h':
          return numeric * 3600;
        case 'day':
        case 'days':
        case 'jour':
        case 'jours':
        case 'd':
          return numeric * 86400;
        case 'week':
        case 'weeks':
        case 'semaine':
        case 'semaines':
        case 'w':
          return numeric * 604800;
        case 'seconde':
        case 'secondes':
        case 'second':
        case 'seconds':
        case 'sec':
        case 'secs':
        case 's':
          return numeric;
        case 'millisecond':
        case 'milliseconds':
        case 'milliseconde':
        case 'millisecondes':
        case 'ms':
          return numeric / 1000;
        default:
          return numeric;
      }
    }
  }

  class ModerationHistoryUI {
    constructor(tracker) {
      this.tracker = tracker;
      this.button = null;
      this.panel = null;
      this.panelContent = null;
      this.unsubscribe = null;
      this.containerObserver = null;
      this.latestActions = [];
      this.isOpen = false;
      this.mountFrame = null;
      this.buttonAnchor = null;
      this.seenActionIds = new Set();
      this.hasUnread = false;
      this.dragState = null;
      this.userPosition = null;
      this.handleDocumentClick = this.handleDocumentClick.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleResize = this.handleResize.bind(this);
      this.handleControlsResize = this.scheduleMount.bind(this);
      this.handlePanelDragMove = this.handlePanelDragMove.bind(this);
      this.handlePanelDragEnd = this.handlePanelDragEnd.bind(this);
    }

    init() {
      if (this.tracker && typeof this.tracker.subscribe === 'function') {
        this.unsubscribe = this.tracker.subscribe((actions) => this.handleActionsUpdate(actions));
        if (typeof this.tracker.getActions === 'function') {
          this.handleActionsUpdate(this.tracker.getActions());
        }
      }
      this.observeControls();
      window.addEventListener('resize', this.handleControlsResize);
      this.scheduleMount();
    }

    dispose() {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.containerObserver?.disconnect();
      this.containerObserver = null;
      window.removeEventListener('resize', this.handleControlsResize);
      if (this.mountFrame) {
        cancelAnimationFrame(this.mountFrame);
        this.mountFrame = null;
      }
      this.closePanel(true);
      if (this.button?.parentElement) {
        this.button.parentElement.removeChild(this.button);
      }
      this.clearButtonAnchor();
      this.button = null;
      this.panel = null;
      this.panelContent = null;
      this.latestActions = [];
      this.seenActionIds.clear();
      this.hasUnread = false;
      this.dragState = null;
      this.userPosition = null;
      document.removeEventListener('mousemove', this.handlePanelDragMove, true);
      document.removeEventListener('mouseup', this.handlePanelDragEnd, true);
    }

    observeControls() {
      this.containerObserver?.disconnect();
      this.containerObserver = new MutationObserver(() => this.scheduleMount());
      this.containerObserver.observe(document.body, { childList: true, subtree: true });
    }

    scheduleMount() {
      if (this.mountFrame) {
        cancelAnimationFrame(this.mountFrame);
      }
      this.mountFrame = requestAnimationFrame(() => {
        this.mountFrame = null;
        this.mountButton();
      });
    }

    mountButton() {
      const anchor = this.findControlsAnchor();
      const container = this.findControlsContainer();
      const button = this.ensureButton();
      const anchorToolbar = this.findAnchorToolbar(anchor);
      const mountContainer = anchorToolbar || container;
      if (!mountContainer) {
        if (button?.parentElement) {
          button.parentElement.removeChild(button);
        }
        this.clearButtonAnchor();
        return;
      }
      if (anchor && anchorToolbar) {
        this.mountAnchoredButton(button, anchor, mountContainer);
      } else {
        this.clearButtonAnchor();
        button.style.removeProperty('left');
        button.style.removeProperty('top');
        if (!mountContainer.contains(button)) mountContainer.appendChild(button);
      }
    }

    clearButtonAnchor() {
      this.buttonAnchor?.classList.remove('tfr-mod-history-anchor');
      this.buttonAnchor = null;
    }

    mountAnchoredButton(button, anchor, toolbar) {
      if (this.buttonAnchor !== toolbar) {
        this.clearButtonAnchor();
        this.buttonAnchor = toolbar;
        toolbar.classList.add('tfr-mod-history-anchor');
      }
      if (button.parentElement !== toolbar) toolbar.appendChild(button);

      const toolbarRect = toolbar.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const buttonWidth = button.offsetWidth || 32;
      const buttonHeight = button.offsetHeight || 32;
      button.style.left = `${Math.max(0, anchorRect.left - toolbarRect.left - buttonWidth)}px`;
      button.style.top = `${Math.max(0, anchorRect.top - toolbarRect.top + (anchorRect.height - buttonHeight) / 2)}px`;
    }

    findAnchorToolbar(anchor) {
      let candidate = anchor?.parentElement;
      while (candidate instanceof HTMLElement) {
        if (candidate.getBoundingClientRect().width >= 120) {
          return candidate;
        }
        candidate = candidate.parentElement;
      }
      return null;
    }

    findControlsAnchor() {
      const selectors = [
        'button[data-a-target="chat-settings"]',
        'button[data-a-target="chat-settings-button"]',
        'button[data-test-selector="chat-settings-button"]',
        'button[data-a-target="chat-room-settings"]',
        'button[aria-label*="Paramètres"]',
        'button[aria-label*="Settings"]'
      ];
      for (const selector of selectors) {
        try {
          const anchor = document.querySelector(selector);
          if (anchor instanceof HTMLElement) return anchor;
        } catch {
          // Twitch can replace this toolbar while selectors are evaluated.
        }
      }
      return null;
    }

    findControlsContainer() {
      const selectors = [
        '[data-a-target="chat-input-buttons-container"]',
        '[data-test-selector="chat-input-buttons-container"]',
        '.chat-input__buttons-container',
        '.chat-input__buttonsWrapper',
        '.chat-input__buttons',
        '.chat-input__toolbar',
        '.chat-input__right-column',
        '[data-a-target="chat-input"] [data-a-target="chat-input-buttons-container"]',
        '[data-test-selector="chat-input"] [data-test-selector="chat-input-buttons-container"]'
      ];
      for (const selector of selectors) {
        try {
          const candidate = document.querySelector(selector);
          if (candidate instanceof HTMLElement) {
            return candidate;
          }
        } catch {
          // ignore selector errors on dynamic DOM updates
        }
      }
      const anchors = [
        'button[data-a-target="chat-slow-mode-toggle"]',
        'button[data-test-selector="chat-slow-mode-toggle"]',
        'button[aria-label*="Mode lent"]'
      ];
      for (const selector of anchors) {
        try {
          const anchor = document.querySelector(selector);
          if (anchor instanceof HTMLElement) {
            const parent = anchor.parentElement;
            if (parent instanceof HTMLElement) {
              return parent;
            }
          }
        } catch {
          // ignore anchor lookup errors
        }
      }
      return null;
    }

    ensureButton() {
      if (this.button) {
        return this.button;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tfr-chat-action-button tfr-mod-history-button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      const label = t('moderation.history.button');
      button.setAttribute('aria-label', label);
      button.title = label;
      button.innerHTML =
        '<svg class="tfr-chat-action-button__icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 6h14v2H5zM5 11h14v2H5zM5 16h14v2H5z"></path><circle cx="7" cy="7" r="1.2"></circle><circle cx="7" cy="12" r="1.2"></circle><circle cx="7" cy="17" r="1.2"></circle></svg>';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.togglePanel();
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.togglePanel();
        }
      });
      this.button = button;
      this.updateButtonState();
      return button;
    }

    handleActionsUpdate(actions) {
      this.latestActions = Array.isArray(actions) ? actions.slice() : [];
      const unread = this.latestActions.some((entry) => entry?.id && !this.seenActionIds.has(entry.id));
      this.hasUnread = unread;
      if (this.isOpen) {
        this.renderPanel();
        this.positionPanel();
        this.markAllSeen();
      } else {
        this.updateButtonState();
      }
    }

    updateButtonState() {
      if (!this.button) return;
      this.button.classList.toggle('has-data', this.hasUnread);
      if (!this.hasUnread && !this.isOpen) {
        this.button.classList.remove('is-active');
      }
    }

    togglePanel() {
      if (this.isOpen) {
        this.closePanel();
      } else {
        this.openPanel();
      }
    }

    ensurePanel() {
      if (this.panel) {
        return this.panel;
      }
      const panel = document.createElement('div');
      panel.className = 'tfr-mod-history-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'false');
      panel.setAttribute('aria-label', t('moderation.history.title'));
      panel.tabIndex = -1;

      const header = document.createElement('div');
      header.className = 'tfr-mod-history-panel__header';
      header.addEventListener('mousedown', (event) => this.startPanelDrag(event));

      const title = document.createElement('span');
      title.className = 'tfr-mod-history-panel__title';
      title.textContent = t('moderation.history.title');
      header.appendChild(title);

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'tfr-mod-history-panel__close';
      closeButton.setAttribute('aria-label', t('common.closeAction'));
      closeButton.innerHTML = '&times;';
      closeButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.closePanel();
      });
      header.appendChild(closeButton);

      panel.appendChild(header);

      const content = document.createElement('div');
      content.className = 'tfr-mod-history-panel__content';
      panel.appendChild(content);

      this.panel = panel;
      this.panelContent = content;
      return panel;
    }

    openPanel() {
      if (!this.button) {
        return;
      }
      const panel = this.ensurePanel();
      if (!document.body.contains(panel)) {
        document.body.appendChild(panel);
      }
      panel.style.visibility = 'hidden';
      panel.classList.remove('is-visible');
      this.renderPanel();
      this.positionPanel();
      panel.style.visibility = '';
      requestAnimationFrame(() => panel.classList.add('is-visible'));
      this.isOpen = true;
      this.button.classList.add('is-active');
      this.button.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', this.handleDocumentClick, true);
      document.addEventListener('keydown', this.handleKeydown, true);
      window.addEventListener('resize', this.handleResize);
      try {
        panel.focus({ preventScroll: true });
      } catch {
        panel.focus();
      }
      this.markAllSeen();
    }

    closePanel(force = false) {
      if (!this.isOpen && !force) {
        return;
      }
      const panel = this.panel;
      if (panel?.parentElement) {
        panel.classList.remove('is-visible');
        panel.parentElement.removeChild(panel);
      }
      this.isOpen = false;
      if (this.button) {
        this.button.classList.remove('is-active');
        this.button.setAttribute('aria-expanded', 'false');
      }
      document.removeEventListener('mousedown', this.handleDocumentClick, true);
      document.removeEventListener('keydown', this.handleKeydown, true);
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('mousemove', this.handlePanelDragMove, true);
      document.removeEventListener('mouseup', this.handlePanelDragEnd, true);
      this.dragState = null;
      this.updateButtonState();
    }

    renderPanel() {
      const content = this.panelContent;
      if (!content) {
        return;
      }
      content.innerHTML = '';
      const actions = Array.isArray(this.latestActions) ? this.latestActions : [];
      if (!actions.length) {
        const empty = document.createElement('p');
        empty.className = 'tfr-mod-history-panel__empty';
        empty.textContent = t('moderation.history.empty');
        content.appendChild(empty);
        return;
      }
      const list = document.createElement('ul');
      list.className = 'tfr-mod-history-list';
      const entries = actions.slice();
      entries.forEach((entry) => {
        const info = this.getEntryInfo(entry);
        const item = document.createElement('li');
        item.className = `tfr-mod-history-entry is-${entry.type || 'deletion'}`;

        const header = document.createElement('div');
        header.className = 'tfr-mod-history-entry__header';
        item.appendChild(header);

        const action = document.createElement('span');
        action.className = 'tfr-mod-history-entry__action';
        action.textContent = info.actionLabel;
        header.appendChild(action);

        const time = document.createElement('time');
        time.className = 'tfr-mod-history-entry__time';
        const date = new Date(entry.timestamp);
        time.dateTime = date.toISOString();
        time.textContent = info.timeLabel || '';
        header.appendChild(time);

        const user = document.createElement('div');
        user.className = 'tfr-mod-history-entry__user';
        const loginLabel = entry.login || '';
        const displayLabel = entry.displayName || '';
        user.textContent = displayLabel && displayLabel.toLowerCase() !== loginLabel.toLowerCase()
          ? `${displayLabel} (@${loginLabel})`
          : (displayLabel || (loginLabel ? `@${loginLabel}` : 'Utilisateur inconnu'));
        item.appendChild(user);

        const offenseMessage = (entry.offenseMessage || '').trim();
        const lastMessage = (entry.lastMessage || '').trim();
        const message = document.createElement('div');
        message.className = 'tfr-mod-history-entry__message';
        const messageToDisplay = offenseMessage || lastMessage;
        if (messageToDisplay) {
          message.textContent = this.truncate(messageToDisplay, 320);
        } else {
          message.textContent = t('moderation.history.lastMessage.none');
          message.classList.add('is-empty');
        }
        item.appendChild(message);

        if (info.metaLabel) {
          const meta = document.createElement('div');
          meta.className = 'tfr-mod-history-entry__meta';
          meta.textContent = info.metaLabel;
          item.appendChild(meta);
        }

        list.appendChild(item);
      });
      content.appendChild(list);
      requestAnimationFrame(() => {
        content.scrollTop = content.scrollHeight;
      });
    }
    getEntryInfo(entry) {
      return historyPresenter.formatEntry(entry);
    }

    markAllSeen() {
      let changed = false;
      this.latestActions.forEach((entry) => {
        if (entry?.id && !this.seenActionIds.has(entry.id)) {
          this.seenActionIds.add(entry.id);
          changed = true;
        }
      });
      if (this.seenActionIds.size > 500) {
        const ids = Array.from(this.seenActionIds);
        const toRemove = ids.slice(0, ids.length - 500);
        toRemove.forEach((id) => this.seenActionIds.delete(id));
      }
      if (changed || this.hasUnread) {
        this.hasUnread = false;
        this.updateButtonState();
      }
    }

    truncate(value, maxLength) {
      return historyPresenter.truncate(value, maxLength);
    }

    handleDocumentClick(event) {
      const target = event.target;
      if (this.panel?.contains(target) || this.button?.contains(target)) {
        return;
      }
      this.closePanel();
    }

    handleKeydown(event) {
      if (event.key === 'Escape') {
        this.closePanel();
      }
    }

    handleResize() {
      if (this.isOpen) {
        this.clampUserPosition();
        this.positionPanel();
      }
    }

    positionPanel() {
      if (!this.panel || !this.button) {
        return;
      }
      const rect = this.button.getBoundingClientRect();
      const panel = this.panel;
      const maxHeight = Math.min(620, Math.floor(window.innerHeight * 0.82), window.innerHeight - 24);
      panel.style.maxHeight = `${Math.max(220, maxHeight)}px`;
      if (this.userPosition) {
        this.clampUserPosition();
        panel.style.top = `${Math.round(this.userPosition.top)}px`;
        panel.style.left = `${Math.round(this.userPosition.left)}px`;
        panel.style.visibility = '';
        return;
      }
      panel.style.visibility = 'hidden';
      const panelRect = panel.getBoundingClientRect();
      let top = rect.top - panelRect.height - 8;
      if (top < 12) {
        top = rect.bottom + 8;
      }
      let left = rect.right - panelRect.width;
      if (left < 12) {
        left = 12;
      }
      const overflowRight = left + panelRect.width - window.innerWidth + 12;
      if (overflowRight > 0) {
        left -= overflowRight;
      }
      if (left < 12) {
        left = 12;
      }
      panel.style.top = `${Math.round(top)}px`;
      panel.style.left = `${Math.round(left)}px`;
      panel.style.visibility = '';
    }

    startPanelDrag(event) {
      if (event.button !== 0 || event.target.closest('.tfr-mod-history-panel__close')) {
        return;
      }
      const panel = this.panel;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      this.dragState = {
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top
      };
      panel.classList.add('is-dragging');
      event.preventDefault();
      document.addEventListener('mousemove', this.handlePanelDragMove, true);
      document.addEventListener('mouseup', this.handlePanelDragEnd, true);
    }

    handlePanelDragMove(event) {
      if (!this.dragState || !this.panel) return;
      const nextLeft = this.dragState.left + event.clientX - this.dragState.startX;
      const nextTop = this.dragState.top + event.clientY - this.dragState.startY;
      this.userPosition = { left: nextLeft, top: nextTop };
      this.clampUserPosition();
      this.panel.style.left = `${Math.round(this.userPosition.left)}px`;
      this.panel.style.top = `${Math.round(this.userPosition.top)}px`;
    }

    handlePanelDragEnd() {
      if (this.panel) {
        this.panel.classList.remove('is-dragging');
      }
      this.dragState = null;
      document.removeEventListener('mousemove', this.handlePanelDragMove, true);
      document.removeEventListener('mouseup', this.handlePanelDragEnd, true);
    }

    clampUserPosition() {
      if (!this.userPosition || !this.panel) return;
      const rect = this.panel.getBoundingClientRect();
      const width = rect.width || 390;
      const height = rect.height || 220;
      this.userPosition.left = Math.min(Math.max(8, this.userPosition.left), Math.max(8, window.innerWidth - width - 8));
      this.userPosition.top = Math.min(Math.max(8, this.userPosition.top), Math.max(8, window.innerHeight - height - 8));
    }
  }

  class ViewerCardHistoryRenderer {
    constructor(tracker) {
      this.tracker = tracker;
      this.cardObserver = null;
      this.cardObserverTarget = null;
      this.currentCard = null;
      this.activeLogin = null;
      this.unsubscribe = null;
      this.maxDisplayed = 30;
      this.pollTimer = null;
      this.handlePotentialCardOpen = this.handlePotentialCardOpen.bind(this);
      this.rendering = false;
    }

    init() {
      document.addEventListener('click', this.handlePotentialCardOpen, true);
      document.addEventListener('keydown', this.handlePotentialCardOpen, true);
      this.unsubscribe = this.tracker.subscribe((login) => {
        if (this.activeLogin === login) {
          this.renderHistory();
        }
      });
      this.scheduleSync(0);
    }

    dispose() {
      document.removeEventListener('click', this.handlePotentialCardOpen, true);
      document.removeEventListener('keydown', this.handlePotentialCardOpen, true);
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      this.disposeCardObserver();
      this.unsubscribe?.();
      this.currentCard = null;
      this.activeLogin = null;
      this.rendering = false;
    }

    handlePotentialCardOpen(event) {
      if (event.type === 'keydown') {
        const key = event.key;
        if (key !== 'Enter' && key !== ' ') {
          return;
        }
      }
      this.scheduleSync(120);
    }

    scheduleSync(delay = 100) {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
      }
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null;
        this.syncCard();
      }, delay);
    }

    disposeCardObserver() {
      if (this.cardObserver) {
        this.cardObserver.disconnect();
        this.cardObserver = null;
        this.cardObserverTarget = null;
      }
    }

    isViewerHistoryNode(node) {
      const element = node?.nodeType === 3 ? node.parentElement : node;
      return Boolean(
        element
        && (element.id === 'tfr-viewer-history' || element.closest?.('#tfr-viewer-history'))
      );
    }

    isOwnHistoryMutation(mutation) {
      if (this.isViewerHistoryNode(mutation?.target)) return true;
      const changedNodes = [
        ...Array.from(mutation?.addedNodes || []),
        ...Array.from(mutation?.removedNodes || [])
      ];
      return changedNodes.length > 0 && changedNodes.every((node) => this.isViewerHistoryNode(node));
    }

    observeCard(card) {
      if (this.cardObserverTarget === card) {
        return;
      }
      this.disposeCardObserver();
      this.cardObserverTarget = card;
      this.cardObserver = new MutationObserver((mutations) => {
        if (this.rendering) {
          return;
        }
        if (mutations.length && mutations.every((mutation) => this.isOwnHistoryMutation(mutation))) {
          return;
        }
        if (!card.isConnected) {
          this.disposeCardObserver();
          this.currentCard = null;
          this.activeLogin = null;
          return;
        }
        this.scheduleSync(50);
      });
      this.cardObserver.observe(card, { childList: true, subtree: true, attributes: true });
    }

    getViewerRoots() {
      const roots = new Set([document]);
      const hostSelectors = [
        '[data-a-target="viewer-card-layer"]',
        '[data-test-selector="viewer-card-layer"]',
        '[data-a-target="popover-content"]',
        '[data-test-selector="popover-content"]',
        'tw-popover',
        'tw-dialog',
        'tw-overlay',
        'body > div[class*="viewer-card"]',
        'div[class*="viewer-card-layer"]'
      ];
      hostSelectors.forEach((selector) => {
        try {
          document.querySelectorAll(selector).forEach((host) => {
            roots.add(host);
            if (host.shadowRoot) {
              roots.add(host.shadowRoot);
            }
          });
        } catch {
          // ignore selector issues
        }
      });
      return Array.from(roots);
    }

    collectRelatedRoots(element) {
      const roots = new Set();
      let current = element;
      while (current && current !== document) {
        roots.add(current);
        if (current.shadowRoot) {
          roots.add(current.shadowRoot);
        }
        const parent = current.parentNode || current.host || null;
        if (parent instanceof ShadowRoot) {
          roots.add(parent);
          current = parent.host;
        } else {
          current = parent;
        }
      }
      roots.add(document);
      return Array.from(roots);
    }

    querySelectors(roots, selectors) {
      return chatDomTools.queryFirst(roots, selectors);
    }

    findViewerCard() {
      const selectors = [
        '[data-a-target="viewer-card"]',
        '[data-test-selector="viewer-card"]',
        '[data-test-selector*="viewer-card"]',
        '.viewer-card',
        'aside.viewer-card',
        'div.viewer-card',
        'div[class*="viewer-card"]'
      ];
      for (const selector of selectors) {
        try {
          const direct = document.querySelector(selector);
          if (direct && this.isValidViewerCardElement(direct)) {
            return direct;
          }
        } catch {
          // ignore query errors
        }
      }
      const roots = this.getViewerRoots();
      const card = this.querySelectors(roots, selectors);
      return this.isValidViewerCardElement(card) ? card : null;
    }

    syncCard() {
      const card = this.findViewerCard();
      if (!card || !this.isValidViewerCardElement(card)) {
        this.disposeCardObserver();
        this.currentCard = null;
        this.activeLogin = null;
        return;
      }
      if (this.currentCard !== card) {
        this.currentCard = card;
        this.observeCard(card);
      }
      const login = this.extractLoginFromCard(card);
      if (!login) {
        this.activeLogin = null;
        return;
      }
      const normalized = this.tracker.normalizeLogin(login);
      if (normalized !== this.activeLogin) {
        this.activeLogin = normalized;
      }
      this.renderHistory();
    }

    extractLoginFromCard(card) {
      if (!card) return '';
      const dataset = card.dataset || {};
      const candidates = [
        dataset.username,
        dataset.user,
        dataset.login,
        dataset.userLogin
      ];
      for (const value of candidates) {
        if (value && value.trim()) {
          return value.trim();
        }
      }
      const nameSelectors = [
        '[data-a-target="viewer-card-user-name"]',
        '[data-test-selector="viewer-card-user-name"]',
        '[data-a-target="viewer-card-channel-link"]',
        'a[data-a-target="viewer-card-channel-link"]',
        'a[data-test-selector="viewer-card-channel-link"]',
        '[data-a-target="viewer-card"] header a[href^="/"]',
        'header a[href^="/"]'
      ];
      const element = this.querySelectors(this.collectRelatedRoots(card), nameSelectors);
      if (element && element.textContent) {
        return element.textContent.trim().replace(/^@/, '');
      }
      const link = this.querySelectors(this.collectRelatedRoots(card), ['a[href^="/"]']);
      if (link) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/([^/?#]+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
      return '';
    }

    renderHistory() {
      if (!this.currentCard || !this.currentCard.isConnected || !this.activeLogin) {
        return;
      }
      this.rendering = true;
      const roots = this.collectRelatedRoots(this.currentCard);
      const host =
        this.querySelectors(roots, [
          '[data-test-selector="viewer-card-modal-body"]',
          '[data-test-selector="viewer-card-body"]',
          '[data-a-target="viewer-card-body"]',
          '.viewer-card__body',
          '.viewer-card-body'
        ]) || this.currentCard;
      if (!this.isValidViewerCardHost(host)) {
        this.rendering = false;
        return;
      }
      const history = this.tracker.getHistory(this.activeLogin);
      let container = host.querySelector('#tfr-viewer-history');
      const previousList = container?.querySelector('.tfr-viewer-history__list') || null;
      const wasOpen = container instanceof HTMLDetailsElement ? container.open : true;
      let previousScrollTop = 0;
      if (previousList) {
        previousScrollTop = previousList.scrollTop;
      }
      if (!(container instanceof HTMLDetailsElement)) {
        const nextContainer = document.createElement('details');
        nextContainer.id = 'tfr-viewer-history';
        nextContainer.className = 'tfr-viewer-history';
        if (container?.parentElement) {
          container.parentElement.replaceChild(nextContainer, container);
        } else {
          host.appendChild(nextContainer);
        }
        container = nextContainer;
      } else {
        container.innerHTML = '';
      }
      container.open = wasOpen;

      const summary = document.createElement('summary');
      summary.className = 'tfr-viewer-history__summary';
      const title = document.createElement('span');
      title.className = 'tfr-viewer-history__title';
      title.textContent = `${t('history.title')} (${history.length})`;
      const chevron = document.createElement('span');
      chevron.className = 'tfr-viewer-history__chevron';
      chevron.textContent = '⌄';
      summary.appendChild(title);
      summary.appendChild(chevron);
      container.appendChild(summary);

      if (!history.length) {
        const empty = document.createElement('p');
        empty.className = 'tfr-viewer-history__empty';
        empty.textContent = t('history.empty');
        container.appendChild(empty);
        this.rendering = false;
        return;
      }
      const list = document.createElement('ul');
      list.className = 'tfr-viewer-history__list';
      const entries = history.slice(-this.maxDisplayed);
      entries.forEach((entry) => {
        const item = document.createElement('li');
        item.className = 'tfr-viewer-history__item';
        const time = document.createElement('time');
        time.className = 'tfr-viewer-history__time';
        const date = new Date(entry.timestamp);
        time.dateTime = date.toISOString();
        try {
          time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
          time.textContent = `${date.getHours().toString().padStart(2, '0')}:${date
            .getMinutes()
            .toString()
            .padStart(2, '0')}`;
        }
        const author = document.createElement('strong');
        author.className = 'tfr-viewer-history__author';
        author.textContent = entry.displayName || entry.login || '';
        if (entry.color) {
          author.style.color = entry.color;
        }
        const message = document.createElement('span');
        message.className = 'tfr-viewer-history__message';
        this.renderMessageParts(message, entry);
        item.appendChild(time);
        if (Array.isArray(entry.badges) && entry.badges.length) {
          const badges = document.createElement('span');
          badges.className = 'tfr-viewer-history__badges';
          entry.badges.forEach((badge) => {
            if (!badge?.url) return;
            const img = document.createElement('img');
            img.className = 'tfr-viewer-history__badge';
            img.src = badge.url;
            img.alt = badge.label || '';
            img.title = badge.label || '';
            badges.appendChild(img);
          });
          item.appendChild(badges);
        }
        item.appendChild(author);
        item.appendChild(message);
        list.appendChild(item);
      });
      container.appendChild(list);
      requestAnimationFrame(() => {
        if (previousList && previousScrollTop > 0) {
          list.scrollTop = previousScrollTop;
        } else {
          list.scrollTop = list.scrollHeight;
        }
        this.rendering = false;
      });
    }

    renderMessageParts(container, entry) {
      const parts = Array.isArray(entry.fragments) && entry.fragments.length
        ? entry.fragments
        : [{ type: 'text', text: entry.text || '' }];
      parts.forEach((part) => {
        if (!part) return;
        if (part.type === 'emote' && part.url) {
          const img = document.createElement('img');
          img.className = 'tfr-viewer-history__emote';
          img.src = part.url;
          img.alt = part.name || '';
          img.title = part.name || '';
          img.loading = 'lazy';
          container.appendChild(img);
          return;
        }
        container.appendChild(document.createTextNode(part.text || ''));
      });
    }

    removeNativeRecentMessages(host) {
      if (!(host instanceof HTMLElement)) {
        return;
      }
      const selectors = [
        '[data-test-selector="recent-messages"]',
        '[data-test-selector="viewer-card-recent-messages"]',
        '[data-test-selector="viewer-card-recent-message"]',
        '[data-test-selector="viewer-card-recent-messages-header"]',
        '[data-test-selector="recent-messages-header"]',
        '.recent-messages',
        '.viewer-card__recent-messages',
        '.viewer-card__recent-message',
        '.viewer-card__recent-messages-header',
        '.viewer-card__recent-messages-container'
      ];
      selectors.forEach((selector) => {
        host.querySelectorAll(selector).forEach((node) => {
          if (!node) return;
          const removable =
            node.closest('[data-test-selector*="recent-messages"]') ||
            node.closest('.viewer-card__recent-messages-container') ||
            node.closest('section[data-test-selector*="recent"]') ||
            node;
          if (removable && removable !== host && removable.parentElement) {
            removable.parentElement.removeChild(removable);
          }
        });
      });
    }

    isValidViewerCardHost(element) {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const disqualify = [
        '[data-test-selector="whispers"]',
        '[data-test-selector="whispers-thread"]',
        '[data-test-selector="whisper-thread"]',
        '[data-test-selector="chat-whispers"]',
        '[data-a-target="whisper-thread"]',
        '.whispers-thread',
        '.whisper-thread',
        '.whispers'
      ];
      for (const selector of disqualify) {
        if (element.matches(selector) || element.closest(selector)) {
          return false;
        }
      }
      return true;
    }

    isValidViewerCardElement(element) {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      if (!this.isValidViewerCardHost(element)) {
        return false;
      }
      const dataset = element.dataset || {};
      if (dataset.aTarget === 'viewer-card' || dataset.testSelector === 'viewer-card') {
        return true;
      }
      if (element.matches('[data-a-target="viewer-card"], [data-test-selector="viewer-card"]')) {
        return true;
      }
      const layer = element.closest('[data-a-target="viewer-card-layer"], [data-test-selector="viewer-card-layer"]');
      if (layer) {
        return true;
      }
      if (element.classList.contains('viewer-card') || element.className.includes('viewer-card')) {
        const hasUserName = element.querySelector(
          '[data-a-target="viewer-card-user-name"], [data-test-selector="viewer-card-user-name"], [data-a-target="viewer-card-channel-link"]'
        );
        if (hasUserName) {
          return true;
        }
      }
      return false;
    }
  }


    return {
      ChatHistoryTracker,
      ModerationActionTracker,
      ModerationHistoryUI,
      ViewerCardHistoryRenderer
    };
  };

  window.TFRChatModeration = {
    create: createChatModerationFeatures
  };
})();

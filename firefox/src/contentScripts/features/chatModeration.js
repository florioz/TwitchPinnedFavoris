(() => {
  const createChatModerationFeatures = ({
    t,
    formatModerationDurationLabel,
    formatModerationTimestamp
  }) => {
  const thirdPartyEmotes = window.TFRChatEmoteResolver.create();
  const chatDomTools = window.TFRChatDomTools;
  const historyPresenter = window.TFRModerationHistoryPresenter.create({
    t,
    formatDuration: formatModerationDurationLabel,
    formatTimestamp: formatModerationTimestamp
  });
  const panelGeometry = window.TFRModerationPanelGeometry;
  const createEventEmitter = window.TFREventEmitter.create;
  if (!chatDomTools) throw new Error('[TFR] chat DOM tools are missing');

  class ChatHistoryTracker {
    constructor() {
      this.history = new Map();
      this.emoteRefreshPending = false;
      this.pendingEmoteEntries = new Set();
      this.disposed = false;
      this.maxEntriesPerUser = 50;
      this.maxHistoryEntries = 2000;
      this.maxPendingNodes = 1000;
      this.chatObserver = null;
      this.chatContainer = null;
      this.retryTimer = null;
      this.events = createEventEmitter({
        onListenerError: (error) => console.error('[TFR] chat history listener failed', error)
      });
      this.containerCheckTimer = null;
      this.pendingNodes = [];
      this.pendingFrame = null;
      this.pendingNodeSet = new Set();
      this.processedPerFrame = 80;
      this.messageSnapshots = new WeakMap();
      this.messageEntries = new WeakMap();
      this.messageSnapshotsById = new Map();
      this.maxMessageSnapshots = 2000;
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
      this.disposed = true;
      this.pendingEmoteEntries.clear();
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
      this.history.clear();
      this.events.clear();
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
      return this.events.subscribe(listener);
    }

    emit(login) {
      const normalized = this.normalizeLogin(login);
      const snapshot = this.getHistory(normalized);
      this.events.emit(normalized, snapshot);
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
        attributeFilter: ['class', 'data-user', 'data-a-user', 'data-message-id', 'data-id', 'data-uuid', 'src', 'srcset', 'alt', 'title']
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
      while (this.pendingNodes.length > this.maxPendingNodes) {
        this.pendingNodeSet.delete(this.pendingNodes.shift());
      }
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
      const message = node.closest?.(CHAT_MESSAGE_SELECTOR);
      if (message) {
        this.captureMessage(message);
      }
      const descendants = node.querySelectorAll?.(CHAT_MESSAGE_SELECTOR);
      if (descendants && descendants.length) {
        descendants.forEach((child) => this.captureMessage(child));
      }
    }

    captureMessage(messageElement) {
      if (chatDomTools.isReplyContext(messageElement)) return;
      const rootElement = this.getMessageRoot(messageElement);
      if (!rootElement) return;
      if (rootElement.dataset?.tfrChatTracked === 'true' || messageElement?.dataset?.tfrChatTracked === 'true') {
        this.refreshMessageBadges(rootElement);
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
      const existing = this.history.get(normalized) || [];
      const duplicate = existing.find((candidate) => (
        Math.abs(Number(candidate.timestamp || 0) - timestamp) < 1000 && candidate.text === text
      ));
      if (duplicate) {
        this.messageEntries.set(rootElement, duplicate);
        this.refreshMessageBadges(rootElement);
        messageElement.dataset.tfrChatTracked = 'true';
        rootElement.dataset.tfrChatTracked = 'true';
        return;
      }
      this.messageEntries.set(rootElement, entry);
      existing.push(entry);
      if (existing.length > 1) {
        existing.sort((a, b) => a.timestamp - b.timestamp);
      }
      if (existing.length > this.maxEntriesPerUser) {
        existing.splice(0, existing.length - this.maxEntriesPerUser);
      }
      this.history.delete(normalized);
      this.history.set(normalized, existing);
      this.trimHistory();
      messageElement.dataset.tfrChatTracked = 'true';
      rootElement.dataset.tfrChatTracked = 'true';
      this.emit(normalized);
      this.refreshHistoryEmotes(entry);
    }

    refreshHistoryEmotes(entry) {
      if (this.disposed) return;
      this.pendingEmoteEntries.add(entry);
      while (this.pendingEmoteEntries.size > this.maxHistoryEntries) {
        this.pendingEmoteEntries.delete(this.pendingEmoteEntries.values().next().value);
      }
      if (this.emoteRefreshPending || this.disposed) return;
      this.emoteRefreshPending = true;
      Promise.resolve().then(() => thirdPartyEmotes.ensureLoaded())
        .then(() => {
          if (this.disposed) return;
          const changedLogins = new Set();
          for (const entry of this.pendingEmoteEntries) {
            const updated = thirdPartyEmotes.enrichParts(entry.fragments);
            if (JSON.stringify(updated) !== JSON.stringify(entry.fragments)) {
              entry.fragments = updated;
              changedLogins.add(entry.login);
            }
          }
          this.pendingEmoteEntries.clear();
          changedLogins.forEach(login => this.emit(login));
        })
        .catch(() => {})
        .finally(() => { this.pendingEmoteEntries.clear(); this.emoteRefreshPending = false; });
    }

    getMessageId(messageElement) {
      messageElement = chatDomTools.ownMessage(messageElement);
      const holder = messageElement?.matches?.('[data-message-id],[data-id],[data-uuid]')
        ? messageElement
        : messageElement?.querySelector?.('[data-message-id],[data-id],[data-uuid]');
      return String(
        holder?.dataset?.messageId || holder?.dataset?.id || holder?.dataset?.uuid
        || holder?.getAttribute?.('data-message-id') || holder?.getAttribute?.('data-id') || holder?.getAttribute?.('data-uuid') || ''
      ).trim();
    }

    trimHistory() {
      let count = 0;
      for (const entries of this.history.values()) count += entries.length;
      // Evict the least recently active users first, preserving recent conversations.
      for (const [login, entries] of this.history) {
        if (count <= this.maxHistoryEntries) break;
        this.history.delete(login);
        count -= entries.length;
      }
    }

    refreshMessageBadges(messageElement) {
      const entry = this.messageEntries.get(messageElement);
      if (!entry) return;
      const badges = this.extractBadges(messageElement);
      // Keep the captured badges when Twitch removes or rebuilds a message.
      if (!badges.some((badge) => badge.url)) return;
      if (JSON.stringify(badges) === JSON.stringify(entry.badges)) return;
      entry.badges = badges;
      this.rememberMessageSnapshot(messageElement, entry);
      this.emit(entry.login);
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
      messageElement = chatDomTools.ownMessage(messageElement);
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
      messageElement = chatDomTools.ownMessage(messageElement);
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
      messageElement = chatDomTools.ownMessage(messageElement);
      const textContainer = this.getMessageContainer(messageElement);
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
          pushToken(plain || alt || element.querySelector?.('img')?.getAttribute?.('alt') || aria || title || element.textContent);
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
      const body = messageElement.querySelector('[data-test-selector="chat-line-message-body"]')
        || messageElement.querySelector('[data-a-target="chat-line-message-body"]');
      if (body) return body;
      // chat-message-text is a fragment, not the complete message body.
      const fragments = Array.from(messageElement.querySelectorAll(
        '[data-a-target="chat-message-text"], .text-fragment, [data-a-target="chat-message-mention"], img'
      )).filter(node => !chatDomTools.isReplyContext(node)
        && !node.closest?.('.chat-badge, [data-a-target="chat-badge"], [data-a-target="chat-message-username"]'));
      if (!fragments.length) return messageElement;
      let common = fragments[0].parentElement || messageElement;
      for (const fragment of fragments.slice(1)) {
        const ancestors = new Set();
        for (let node = fragment; node; node = node.parentElement) {
          ancestors.add(node);
          if (node === messageElement) break;
        }
        while (common !== messageElement && !ancestors.has(common)) common = common.parentElement || messageElement;
      }
      return common;
    }

    extractMessageFragments(messageElement, fallbackText = '') {
      messageElement = chatDomTools.ownMessage(messageElement);
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
          const image = element.tagName === 'IMG' ? element : element.querySelector?.('img');
          const url = image?.currentSrc || image?.src || element.currentSrc || element.src || element.getAttribute('src') || '';
          const name =
            image?.getAttribute?.('alt') ||
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
      messageElement = chatDomTools.ownMessage(messageElement);
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
      messageElement = chatDomTools.ownMessage(messageElement);
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
      messageElement = chatDomTools.ownMessage(messageElement);
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

  class ModerationActionTracker {
    constructor(historyTracker) {
      this.historyTracker = historyTracker;
      this.actions = [];
      this.maxActions = 1000;
      this.actionKeys = new Set();
      this.events = createEventEmitter();
      this.feed = null;
      this.unsubscribeFeed = null;
    }
    init() {
      if (this.unsubscribeFeed) return;
      this.feed = window.TFRTwitchChatEvents.getShared();
      this.unsubscribeFeed = this.feed.subscribe(event => {
        if (event.type === 'reset') { this.actions = []; this.actionKeys.clear(); this.emit(); return; }
        if (event.type === 'refresh') { this.emit(); return; }
        if (event.source !== 'twitch-irc' || !this.belongsToCurrentChannel(event) || this.actionKeys.has(event.id)) return;
        this.actionKeys.add(event.id);
        this.actions.push(event);
        while (this.actions.length > this.maxActions) this.actionKeys.delete(this.actions.shift().id);
        this.emit();
      });
    }
    getMessageState(id) { return this.feed?.getMessageState(id) || null; }
    subscribe(listener) { return this.events.subscribe(listener); }
    belongsToCurrentChannel(event) {
      const channel = window.TFRTwitchChatEvents.getChannel(window.location?.pathname);
      return Boolean(channel) && event.channel === `/${channel}`;
    }
    getActions() {
      return this.actions.filter(event => this.belongsToCurrentChannel(event)).map(event => {
        const message = this.feed?.getActionMessage?.(event);
        return message ? { ...event, lastMessage: message.text, messageId: message.messageId,
          displayName: message.displayName } : event;
      });
    }
    emit() { this.events.emit(this.getActions()); }
    dispose() {
      this.unsubscribeFeed?.(); this.unsubscribeFeed = null; this.feed = null;
      this.actions = []; this.actionKeys.clear(); this.events.clear();
    }
  }

  // DOM selectors only position the interface; sanctions come from Twitch events.
  const CHAT_CONTROLS_SELECTORS = [
    '[data-a-target="chat-input-buttons-container"]',
    '[data-test-selector="chat-input-buttons-container"]',
    '.chat-input__buttons-container',
    '.chat-input__buttonsWrapper',
    '.chat-input__buttons',
    '.chat-input__toolbar',
    '.chat-input__right-column'
  ];

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
      this.locationIndicator = null;
      this.locationTimer = null;
      this.feedbackTimer = null;
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
      if (this.locationTimer) clearTimeout(this.locationTimer);
      if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
      this.locationIndicator?.remove?.();
      this.locationIndicator = null;
      this.locationTimer = null;
      this.feedbackTimer = null;
      document.removeEventListener('mousemove', this.handlePanelDragMove, true);
      document.removeEventListener('mouseup', this.handlePanelDragEnd, true);
    }

    observeControls() {
      this.containerObserver?.disconnect();
      this.containerObserver = new MutationObserver(() => {
        if (!this.button?.isConnected || !this.isInsideChatControls(this.button)) this.scheduleMount();
      });
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
      if (this.isReplayPage()) {
        this.unmountButton();
        return;
      }
      const container = this.findControlsContainer();
      const anchor = container ? this.findControlsAnchor(container) : null;
      const button = this.ensureButton();
      const anchorToolbar = this.findAnchorToolbar(anchor, container);
      const mountContainer = anchorToolbar || container;
      if (!mountContainer) {
        this.closePanel(true);
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

    isReplayPage(pathname = window.location?.pathname) {
      return /^\/videos\/[^/]+(?:\/|$)/i.test(String(pathname || ''));
    }

    unmountButton() {
      this.closePanel(true);
      if (this.button?.parentElement) this.button.parentElement.removeChild(this.button);
      this.clearButtonAnchor();
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

    findAnchorToolbar(anchor, boundary) {
      let candidate = anchor?.parentElement;
      while (candidate instanceof HTMLElement && boundary?.contains(candidate)) {
        if (candidate.getBoundingClientRect().width >= 120) {
          return candidate;
        }
        if (candidate === boundary) break;
        candidate = candidate.parentElement;
      }
      return null;
    }

    findControlsAnchor(container = this.findControlsContainer()) {
      if (!(container instanceof HTMLElement)) return null;
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
          const anchor = container.querySelector(selector);
          if (anchor instanceof HTMLElement) return anchor;
        } catch {
          // Twitch can replace this toolbar while selectors are evaluated.
        }
      }
      return null;
    }

    isInsideChatControls(element) {
      if (!(element instanceof HTMLElement)) return false;
      return CHAT_CONTROLS_SELECTORS.some((selector) => {
        try { return Boolean(element.closest(selector)); } catch { return false; }
      });
    }

    findControlsContainer() {
      const selectors = [
        ...CHAT_CONTROLS_SELECTORS,
        '[data-a-target="chat-input"] [data-a-target="chat-input-buttons-container"]',
        '[data-test-selector="chat-input"] [data-test-selector="chat-input-buttons-container"]'
      ];
      for (const selector of selectors) {
        try {
          const candidate = document.querySelector(selector);
          if (
            candidate instanceof HTMLElement
            && !candidate.closest('[data-a-target="video-player"], .video-player, .video-player__container')
          ) {
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
      // Re-read the channel-scoped history when opening an existing panel.
      const actions = this.tracker.getActions();
      this.latestActions = actions;
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
          message.tabIndex = 0;
          message.setAttribute('role', 'button');
          message.setAttribute('aria-label', t('moderation.history.locate.action'));
          message.title = t('moderation.history.locate.action');
          const locate = () => this.locateMessage(entry, item);
          message.addEventListener('click', locate);
          message.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            locate();
          });
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

    findMessageElement(entry) {
      const history = this.tracker?.historyTracker;
      const container = history?.chatContainer?.isConnected
        ? history.chatContainer
        : history?.findMessagesContainer?.();
      if (!container) return null;

      const captured = history?.getMessageRoot?.(entry?.messageElement) || entry?.messageElement;
      if (captured?.isConnected && container.contains?.(captured)) return captured;

      const messages = Array.from(container.querySelectorAll?.(
        '[data-a-target="chat-line-message"], [data-test-selector="chat-line-message"], .chat-line__message'
      ) || []);
      const messageId = String(entry?.messageId || '').trim();
      if (messageId) {
        const exact = messages.find((candidate) => history?.getMessageId?.(candidate) === messageId);
        if (exact) return history?.getMessageRoot?.(exact) || exact;
      }

      const login = history?.normalizeLogin?.(entry?.login) || '';
      const expectedText = String(entry?.offenseMessage || entry?.lastMessage || '')
        .replace(/\s+/g, ' ').trim().toLowerCase();
      if (!login || !expectedText) return null;
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const candidate = history?.getMessageRoot?.(messages[index]) || messages[index];
        if (chatDomTools.isReplyContext(candidate)) continue;
        const snapshot = history?.getMessageSnapshot?.(candidate);
        const candidateLogin = history?.normalizeLogin?.(snapshot?.login || history?.extractLogin?.(candidate));
        if (candidateLogin !== login) continue;
        // Twitch can replace the original body with a deletion placeholder.
        // Match our captured body before considering the current rendered text.
        const texts = [snapshot?.text, history?.extractMessageText?.(candidate)];
        if (texts.some(value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase() === expectedText)) {
          return candidate;
        }
      }
      return null;
    }

    locateMessage(entry, historyItem) {
      const message = this.findMessageElement(entry);
      if (!message?.isConnected) {
        this.showLocationFeedback(historyItem);
        return false;
      }
      if (this.locationTimer) clearTimeout(this.locationTimer);
      this.locationIndicator?.remove?.();
      this.closePanel();
      message.scrollIntoView?.({ behavior: 'auto', block: 'center', inline: 'nearest' });
      if (!message.isConnected) return false;

      const rect = message.getBoundingClientRect?.();
      if (!rect) return true;
      const indicator = document.createElement('div');
      indicator.className = 'tfr-chat-location-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      indicator.style.left = `${Math.max(0, rect.left)}px`;
      indicator.style.top = `${Math.max(0, rect.top)}px`;
      indicator.style.width = `${Math.max(0, rect.width)}px`;
      indicator.style.height = `${Math.max(0, rect.height)}px`;
      document.body.appendChild(indicator);
      this.locationIndicator = indicator;
      this.locationTimer = setTimeout(() => {
        indicator.remove();
        if (this.locationIndicator === indicator) this.locationIndicator = null;
        this.locationTimer = null;
      }, 3000);
      return true;
    }

    showLocationFeedback(historyItem) {
      if (!historyItem) return;
      if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
      historyItem.dataset.tfrNavigationFeedback = t('moderation.history.locate.unavailable');
      historyItem.classList.add('is-location-unavailable');
      this.feedbackTimer = setTimeout(() => {
        historyItem.classList.remove('is-location-unavailable');
        delete historyItem.dataset.tfrNavigationFeedback;
        this.feedbackTimer = null;
      }, 3000);
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
      panel.style.maxHeight = `${panelGeometry.maxHeight(window.innerHeight)}px`;
      if (this.userPosition) {
        this.clampUserPosition();
        panel.style.top = `${Math.round(this.userPosition.top)}px`;
        panel.style.left = `${Math.round(this.userPosition.left)}px`;
        panel.style.visibility = '';
        return;
      }
      panel.style.visibility = 'hidden';
      const panelRect = panel.getBoundingClientRect();
      const position = panelGeometry.anchored(rect, panelRect, {
        width: window.innerWidth,
        height: window.innerHeight
      });
      panel.style.top = `${Math.round(position.top)}px`;
      panel.style.left = `${Math.round(position.left)}px`;
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
      this.userPosition = panelGeometry.dragged(this.dragState, { x: event.clientX, y: event.clientY });
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
      this.userPosition = panelGeometry.clamp(
        this.userPosition,
        { width: rect.width || 390, height: rect.height || 220 },
        { width: window.innerWidth, height: window.innerHeight }
      );
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
        '.viewer-card',
        'aside.viewer-card',
        'div.viewer-card'
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
      const host =
        this.querySelectors([this.currentCard], [
          '[data-test-selector="viewer-card-modal-body"]',
          '[data-test-selector="viewer-card-body"]',
          '[data-a-target="viewer-card-body"]',
          '.viewer-card__body',
          '.viewer-card-body'
        ]) || this.currentCard;
      if (!this.currentCard.contains(host) || !this.isValidViewerCardHost(host)) {
        this.rendering = false;
        return;
      }
      document.querySelectorAll('#tfr-viewer-history').forEach((node) => {
        if (!this.currentCard.contains(node)) node.remove();
      });
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

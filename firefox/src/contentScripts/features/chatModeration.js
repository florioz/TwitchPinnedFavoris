(() => {
  const createChatModerationFeatures = ({
    t,
    formatModerationDurationLabel,
    formatModerationTimestamp,
    MAX_TIMEOUT_SECONDS
  }) => {
  class ChatHistoryTracker {
    constructor() {
      this.history = new Map();
      this.maxEntriesPerUser = 50;
      this.chatObserver = null;
      this.chatContainer = null;
      this.retryTimer = null;
      this.listeners = new Set();
      this.containerCheckTimer = null;
    }

    normalizeLogin(login) {
      if (!login) return '';
      return String(login).trim().replace(/^@/, '').toLowerCase();
    }

    init() {
      this.observeChat(true);
      if (!this.containerCheckTimer) {
        this.containerCheckTimer = setInterval(() => {
          if (!this.chatContainer || !this.chatContainer.isConnected) {
            this.observeChat(true);
          }
        }, 5000);
      }
    }

    dispose() {
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
      this.history.clear();
      this.listeners.clear();
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
      const selectors = [
        '[data-a-target="chat-history-scrollable-area"]',
        '[data-test-selector="chat-scrollable-area__message-container"]',
        '.chat-scrollable-area__message-container',
        '[data-a-target="chat-messages"]',
        '[role="log"][aria-live="polite"]'
      ];
      for (const selector of selectors) {
        try {
          const container = document.querySelector(selector);
          if (container) {
            return container;
          }
        } catch (error) {
          console.error('[TFR] chat container selector error', selector, error);
        }
      }
      return null;
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
      this.chatObserver.observe(container, { childList: true, subtree: true });
      this.captureExistingMessages(container);
    }

    captureExistingMessages(container) {
      const nodes = container.querySelectorAll(CHAT_MESSAGE_SELECTOR);
      nodes.forEach((node) => this.captureMessage(node));
    }

    handleMutations(mutations) {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }
          this.scanNode(node);
        });
      });
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
      if (!messageElement || messageElement.dataset?.tfrChatTracked === 'true') {
        return;
      }
      const login = this.extractLogin(messageElement);
      const text = this.extractMessageText(messageElement);
      const normalized = this.normalizeLogin(login);
      if (!normalized || !text) {
        return;
      }
      const displayName = this.extractDisplayName(messageElement) || login;
      const timestamp = this.extractTimestamp(messageElement) || Date.now();
      const entry = {
        login: normalized,
        displayName,
        text,
        timestamp
      };
      const existing = this.history.get(normalized) || [];
      const duplicate = existing.some((candidate) => (
        Math.abs(Number(candidate.timestamp || 0) - timestamp) < 1000 && candidate.text === text
      ));
      if (duplicate) {
        messageElement.dataset.tfrChatTracked = 'true';
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
      this.emit(normalized);
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
    }

    init() {
      this.observeChat(true);
      if (!this.containerCheckTimer) {
        this.containerCheckTimer = setInterval(() => {
          if (!this.container || !this.container.isConnected) {
            this.observeChat(true);
          }
        }, 5000);
      }
    }

    dispose() {
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
      this.container = null;
      this.actions = [];
      this.actionKeys.clear();
      this.listeners.clear();
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
        if (!this.retryTimer) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.observeChat(true);
          }, 1500);
        }
        return;
      }
      this.container = container;
      this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
      this.observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
      this.captureExisting(container);
    }

    captureExisting(container) {
      const nodes = container.querySelectorAll(this.messageSelector);
      nodes.forEach((node) => this.captureAction(node));
    }

    handleMutations(mutations) {
      if (this.mutationFrame) {
        cancelAnimationFrame(this.mutationFrame);
      }
      this.mutationFrame = requestAnimationFrame(() => {
        this.mutationFrame = null;
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => this.scanNode(node));
          } else if (mutation.type === 'attributes' || mutation.type === 'characterData') {
            this.collectMessageElements(mutation.target).forEach((element) => this.captureAction(element));
          }
        });
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

    captureAction(element) {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const textContent = this.extractText(element);
      const dataset = element.dataset || {};
      if (dataset.tfrModerationTracked === 'true') {
        return;
      }
      const action = this.extractAction(element, textContent);
      if (!action || !action.login) {
        return;
      }
      dataset.tfrModerationTracked = 'true';
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
        rawMessage: action.rawMessage,
        lastMessage: lastMessage?.text || null,
        offenseMessage: offenseMessage,
        lastMessageTimestamp: lastMessage?.timestamp || null
      };
      this.addAction(entry);
    }

    addAction(entry) {
      if (!entry || !entry.id) {
        return;
      }
      const key = `${entry.type || 'unknown'}:${entry.login || ''}`;
      const cached = this.recentActionCache.get(key);
      const nowTs = Number(entry.timestamp) || Date.now();
      if (cached) {
        const age = Math.abs(nowTs - cached.timestamp);
        if (age < 60000) {
          const target = cached.entry;
          let updated = false;
          if (
            Number.isFinite(entry.duration) &&
            (!Number.isFinite(target.duration) || entry.duration > target.duration)
          ) {
            target.duration = entry.duration;
            updated = true;
          }
          if (!target.offenseMessage && entry.offenseMessage) {
            target.offenseMessage = entry.offenseMessage;
            updated = true;
          }
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
      this.recentActionCache.set(key, { timestamp: nowTs, entry });
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

    extractAction(element, rawText) {
      const dataset = element.dataset || {};
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

      const elementInnerText = this.normalizeText(element.innerText || '');
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
        this.extractLoginFromText(analysisText);
      let login = this.sanitizeLogin(loginCandidate);
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
        ]) || null;
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
        element.getAttribute?.('class'),
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('role')
      ];
      const childHintNodes = Array.from(
        element.querySelectorAll('[data-mod-action],[data-moderation-action-type],[data-test-selector],[data-a-target]')
      );
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
        attributeHints.push(node.getAttribute?.('aria-label'));
        attributeHints.push(node.getAttribute?.('title'));
        attributeHints.push(node.className);
      });
      element.querySelectorAll('*').forEach((node) => {
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
        } else if (/ban/.test(actionHint)) {
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

      const durationSources = [
        analysisText,
        elementInnerText,
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('title'),
        element.getAttribute?.('data-duration-label'),
        ...datasetTextHints
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
      const message = this.extractOriginalMessage(element, rawText);
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
        ? /\((?:tempo|timeout|timed\s*out|silence|mute|masque|efface|deleted)\)/.test(simplifiedText)
        : false;
      const appendedTextIndicator = appendedTextBan || appendedTextTimeout;
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
      const indicatesBan = indicatorText ? BAN_PATTERN.test(indicatorText) || /ban/.test(actionValue) : /ban/.test(actionValue);
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
        hasDeletedFlag || classIndicator || Boolean(deletionNode) || appendedIndicator || appendedTextIndicator || indicatesBan || indicatesTimeout;
      if (!hasStrongIndicator) {
        return null;
      }
      let type = null;
      if (indicatesBan || appendedTextBan) {
        type = 'ban';
      } else if (indicatesTimeout || appendedTextTimeout) {
        type = 'timeout';
      }
      const durationSource = [indicatorText, this.normalizeText(actionValue), this.normalizeText(modActionValue), simplifiedText]
        .filter(Boolean)
        .join(' ');
      const duration = this.extractDurationFromText(durationSource);
      if (!type && Number.isFinite(duration)) {
        type = 'timeout';
      }
      return type
        ? {
            type,
            duration: Number.isFinite(duration) ? duration : null
          }
        : null;
    }

    parseDurationCandidates(values) {
      if (!Array.isArray(values)) {
        return null;
      }
      for (const entry of values) {
        if (entry === null || entry === undefined || entry === '') {
          continue;
        }
        if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
          const parsed = this.parseDurationValue(entry.value, entry.unit);
          if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
          }
          continue;
        }
        const parsed = this.parseDurationValue(entry);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return null;
    }

    parseDurationValue(value, unitHint = null) {
      if (value === undefined || value === null || value === '') {
        return null;
      }
      if (typeof value === 'number') {
        return this.normalizeDurationNumber(value, unitHint);
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        if (unitHint === 'ms') {
          const numeric = Number(trimmed);
          if (Number.isFinite(numeric)) {
            return this.normalizeDurationNumber(numeric, 'ms');
          }
        }
        if (/^\d+$/.test(trimmed)) {
          return this.normalizeDurationNumber(Number(trimmed), unitHint);
        }
        const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (colonMatch) {
          const hours = colonMatch[3] ? Number(colonMatch[1]) : 0;
          const minutes = colonMatch[3] ? Number(colonMatch[2]) : Number(colonMatch[1]);
          const seconds = colonMatch[3] ? Number(colonMatch[3]) : Number(colonMatch[2]);
          if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
            return hours * 3600 + minutes * 60 + seconds;
          }
        }
        const isoMatch = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
        if (isoMatch) {
          const hours = Number(isoMatch[1] || 0);
          const minutes = Number(isoMatch[2] || 0);
          const seconds = Number(isoMatch[3] || 0);
          if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
            return hours * 3600 + minutes * 60 + seconds;
          }
        }
        const numeric = Number(trimmed.replace(',', '.'));
        if (Number.isFinite(numeric)) {
          const normalized = this.normalizeDurationNumber(numeric, unitHint);
          if (Number.isFinite(normalized)) {
            return normalized;
          }
        }
        const extracted = this.extractDurationFromText(trimmed);
        if (Number.isFinite(extracted)) {
          return extracted;
        }
      }
      return null;
    }

    normalizeDurationNumber(value, unitHint = null) {
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      if (unitHint === 'ms') {
        return Math.round(value / 1000);
      }
      if (value > 0 && value < 1) {
        return null;
      }
      return Math.round(value);
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
      this.seenActionIds = new Set();
      this.hasUnread = false;
      this.handleDocumentClick = this.handleDocumentClick.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleResize = this.handleResize.bind(this);
    }

    init() {
      if (this.tracker && typeof this.tracker.subscribe === 'function') {
        this.unsubscribe = this.tracker.subscribe((actions) => this.handleActionsUpdate(actions));
        if (typeof this.tracker.getActions === 'function') {
          this.handleActionsUpdate(this.tracker.getActions());
        }
      }
      this.observeControls();
      this.scheduleMount();
    }

    dispose() {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.containerObserver?.disconnect();
      this.containerObserver = null;
      if (this.mountFrame) {
        cancelAnimationFrame(this.mountFrame);
        this.mountFrame = null;
      }
      this.closePanel(true);
      if (this.button?.parentElement) {
        this.button.parentElement.removeChild(this.button);
      }
      this.button = null;
      this.panel = null;
      this.panelContent = null;
      this.latestActions = [];
      this.seenActionIds.clear();
      this.hasUnread = false;
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
      const container = this.findControlsContainer();
      const button = this.ensureButton();
      if (!container) {
        if (button?.parentElement) {
          button.parentElement.removeChild(button);
        }
        return;
      }
      if (!container.contains(button)) {
        container.appendChild(button);
      }
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
        'button[data-a-target="chat-settings"]',
        'button[data-a-target="chat-settings-button"]',
        'button[data-test-selector="chat-settings-button"]',
        'button[data-a-target="chat-room-settings"]',
        'button[data-a-target="chat-slow-mode-toggle"]',
        'button[data-test-selector="chat-slow-mode-toggle"]',
        'button[aria-label*="Settings"]'
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
      const entries = actions.slice().reverse();
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
    }
    getEntryInfo(entry) {
      const durationValue = Number(entry?.duration);
      const hasDuration = Number.isFinite(durationValue) && durationValue > 0;
      const durationLabel = hasDuration ? formatModerationDurationLabel(durationValue) : '';
      let actionLabel = '';
      if (entry.type === 'ban') {
        if (entry.isPermanent) {
          actionLabel = t('moderation.history.action.banPermanent');
        } else if (durationLabel) {
          actionLabel = durationLabel;
        } else {
          actionLabel = t('moderation.history.action.ban');
        }
      } else if (entry.type === 'timeout') {
        actionLabel = durationLabel || t('moderation.history.action.timeoutShort');
      } else {
        actionLabel = t('moderation.history.action.deletion');
      }
      const moderatorLabel = entry.moderator ? t('moderation.history.meta.by', { moderator: entry.moderator }) : '';
      const timeLabel = formatModerationTimestamp(entry.timestamp) || '';
      const metaParts = [];
      if (actionLabel) {
        metaParts.push(actionLabel);
      }
      if (moderatorLabel) {
        metaParts.push(moderatorLabel);
      }
      const metaLabel = metaParts.filter((part) => part !== actionLabel).join(' - ');
      return { actionLabel, moderatorLabel, timeLabel, metaLabel };
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
      if (!value) {
        return '';
      }
      if (!Number.isFinite(maxLength) || maxLength <= 0 || value.length <= maxLength) {
        return value;
      }
      return `${value.slice(0, maxLength - 3)}...`;
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

    observeCard(card) {
      if (this.cardObserverTarget === card) {
        return;
      }
      this.disposeCardObserver();
      this.cardObserverTarget = card;
      this.cardObserver = new MutationObserver(() => {
        if (this.rendering) {
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
      for (const root of roots) {
        if (!root) continue;
        for (const selector of selectors) {
          try {
            const found = root.querySelector?.(selector);
            if (found) {
              return found;
            }
          } catch {
            // ignore selector issues
          }
        }
      }
      return null;
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
      const entries = history.slice(-this.maxDisplayed).reverse();
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
        const message = document.createElement('span');
        message.className = 'tfr-viewer-history__message';
        message.textContent = entry.text;
        item.appendChild(time);
        item.appendChild(author);
        item.appendChild(message);
        list.appendChild(item);
      });
      container.appendChild(list);
      requestAnimationFrame(() => {
        if (previousList && previousScrollTop > 0) {
          list.scrollTop = previousScrollTop;
        } else {
          list.scrollTop = 0;
        }
        this.rendering = false;
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
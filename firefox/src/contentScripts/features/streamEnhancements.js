(() => {
  const createStreamEnhancements = ({ t, audioWorkletModuleUrl = '' }) => {
    const deletedMessageView = window.TFRDeletedMessageView.create(document);
    const CHAT_CONTAINER_SELECTORS = [
      '[data-test-selector="chat-scrollable-area__message-container"]',
      '.chat-scrollable-area__message-container',
      '[data-a-target="chat-messages"]',
      '[role="log"][aria-live="polite"]'
    ];
    const MESSAGE_SELECTOR = '[data-a-target="chat-line-message"], [data-test-selector="chat-line-message"], .chat-line__message';
    const DELETED_NOTICE_SELECTOR = '.chat-line__message--deleted-notice';
    const DELETED_TRACKING_SELECTOR = `${MESSAGE_SELECTOR}, ${DELETED_NOTICE_SELECTOR}`;
    const MESSAGE_BODY_SELECTOR = '[data-a-target="chat-message-text"], [data-a-target="chat-line-message-body"], [data-test-selector="chat-line-message-body"]';
    const CURRENT_USER_MENTION_SELECTOR = '[data-a-target="chat-message-mention"].mention-fragment--recipient';
    const REPLY_CONTEXT_SELECTOR = '[data-a-target="chat-message-reply-context"], [data-test-selector="chat-message-reply-context"], p[title]';
    const CHAT_MENTION_SOUND_IDS = new Set(['soft', 'chime', 'arcade', 'pulse', 'alert']);
    const CHAT_MENTION_FALLBACK_IDENTITY = 'twitch-current-user';
    const CHAT_SNAPSHOT_CACHE_LIMIT = 500;
    const CHAT_RETRY_DELAY_MS = 1500;

    const findChatContainer = () => {
      for (const selector of CHAT_CONTAINER_SELECTORS) {
        const node = document.querySelector(selector);
        if (node) return node;
      }
      return null;
    };

    const scheduleChatRetry = (owner, callback) => {
      if (owner.retryTimer) return;
      owner.retryTimer = window.setTimeout(() => {
        owner.retryTimer = null;
        callback();
      }, CHAT_RETRY_DELAY_MS);
    };

    const clearChatRetry = (owner) => {
      clearTimeout(owner.retryTimer);
      owner.retryTimer = null;
    };

    const trimMap = (map, maximumSize) => {
      while (map.size > maximumSize) map.delete(map.keys().next().value);
    };

    const visitMatchingElements = (node, selector, callback) => {
      if (!(node instanceof Element)) return;
      const matches = new Set();
      if (node.matches?.(selector)) matches.add(node);
      const closest = node.closest?.(selector);
      if (closest) matches.add(closest);
      node.querySelectorAll?.(selector).forEach((element) => matches.add(element));
      matches.forEach(callback);
    };

    const ThirdPartyChatEmotes = window.TFRThirdPartyChatEmotes.create({
      t, findChatContainer, scheduleChatRetry, clearChatRetry, visitMatchingElements,
      messageSelector: MESSAGE_SELECTOR, messageBodySelector: MESSAGE_BODY_SELECTOR
    });

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
        if (reference?.nextSibling !== this.root) {
          if (reference?.nextSibling) container.insertBefore(this.root, reference.nextSibling);
          else container.appendChild(this.root);
        } else if (this.root.parentElement !== container) {
          container.appendChild(this.root);
        }
        return this.root;
      }

      getInsertionReference(container, fallback) {
        const nativeChildren = Array.from(container?.children || [])
          .filter((child) => child !== this.root);
        return nativeChildren.at(-1) || fallback;
      }

      resolveStatsLayout(statsAnchor) {
        let candidate = statsAnchor?.parentElement || null;
        for (let depth = 0; candidate && depth < 7; depth += 1) {
          const directChildren = Array.from(candidate.children || []);
          const hasDirectViewerBlock = directChildren.some((child) => child.contains?.(statsAnchor));
          const collaborationControl = directChildren.find((child) => (
            !child.contains?.(statsAnchor)
            && child.matches?.('.tw-svg, [class*="ScSvgWrapper"]')
          ));
          if (hasDirectViewerBlock && collaborationControl) {
            return { container: candidate, reference: collaborationControl };
          }
          const text = candidate.textContent || '';
          if (/\b\d{1,2}:\d{2}:\d{2}\b/.test(text)) {
            let viewerBlock = statsAnchor;
            while (viewerBlock?.parentElement && viewerBlock.parentElement !== candidate) {
              viewerBlock = viewerBlock.parentElement;
            }
            if (viewerBlock?.parentElement === candidate) {
              return { container: candidate, reference: viewerBlock };
            }
          }
          candidate = candidate.parentElement;
        }
        const container = statsAnchor?.parentElement || null;
        return {
          container,
          reference: this.getInsertionReference(container, statsAnchor)
        };
      }

      update() {
        if (!this.enabled || document.visibilityState === 'hidden') return;
        const video = document.querySelector('.video-player__container video, [data-a-target="video-player"] video, video');
        const statsAnchor = document.querySelector(
          '[data-a-target="animated-channel-viewers-count"], [data-a-target="channel-viewers-count"], [data-test-selector="animated-channel-viewers-count"]'
        );
        const statsLayout = this.resolveStatsLayout(statsAnchor);
        const statsContainer = statsLayout.container;
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
        const root = this.ensureRoot(statsContainer, statsLayout.reference);
        root.textContent = t('settings.playerLatency.value', {
          buffer: bufferSeconds.toFixed(1)
        });
        root.title = t('settings.playerLatency.description');
      }
    }

    class AutoClaimChannelPoints {
      constructor() {
        this.enabled = false;
        this.observer = null;
        this.claimedButtons = new WeakSet();
      }

      init() {}

      configure(enabled) {
        const nextEnabled = Boolean(enabled);
        if (this.enabled === nextEnabled) return;
        this.enabled = nextEnabled;
        if (this.enabled) this.start(); else this.stop();
      }

      start() {
        if (!document.body) return;
        this.scan(document.body);
        if (this.observer) return;
        this.observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => this.scan(node)));
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
      }

      stop() {
        this.observer?.disconnect();
        this.observer = null;
      }

      dispose() {
        this.stop();
        this.enabled = false;
      }

      findClaimButton(node) {
        if (!(node instanceof Element)) return null;
        const iconSelector = '[data-test-selector="claimable-bonus__icon"], .claimable-bonus__icon';
        const icon = node.matches?.(iconSelector) ? node : node.querySelector?.(iconSelector);
        if (icon) return icon.closest?.('button') || null;
        const candidates = [
          ...(node.matches?.('button[aria-label]') ? [node] : []),
          ...(node.querySelectorAll?.('button[aria-label]') || [])
        ];
        return candidates.find((button) => /^(?:claim bonus|r[ée]clamer le bonus)$/i.test(
          String(button.getAttribute('aria-label') || '').trim()
        )) || null;
      }

      scan(node) {
        if (!this.enabled) return;
        const button = this.findClaimButton(node);
        if (!button || button.disabled || this.claimedButtons.has(button)) return;
        this.claimedButtons.add(button);
        button.click();
      }
    }

    const PlayerAudioCompressor = window.TFRPlayerAudioControls.create({ t, audioWorkletModuleUrl });

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
        this.snapshotsByKey = new Map();
        this.retryTimer = null;
      }

      init() {}

      setModerationTracker(tracker) {
        if (this.moderationTracker === tracker) return;
        this.unsubscribeModeration?.();
        this.moderationTracker = tracker;
        this.unsubscribeModeration = tracker?.subscribe(() => {
          this.updateSanctionLabels();
          if (this.enabled) this.container?.querySelectorAll(DELETED_TRACKING_SELECTOR).forEach(message => this.processMessage(message));
        });
        this.updateSanctionLabels();
      }

      getDeletionLabel(message) {
        const latest = this.moderationTracker?.getMessageState?.(this.getMessageId(message))?.action;
        if (latest?.type === 'ban' && latest.isPermanent) return t('settings.deletedMessages.ban');
        if (latest?.type === 'timeout') {
          const seconds = Number(latest.duration);
          if (!(seconds > 0)) return t('settings.deletedMessages.timeoutUnknown');
          const duration = seconds >= 86400 ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`
            : seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}min`
            : seconds >= 60 ? `${Math.floor(seconds / 60)}min ${Math.floor(seconds % 60)}s` : `${seconds}s`;
          return t('settings.deletedMessages.timeout', { duration });
        }
        return t('settings.deletedMessages.badge');
      }

      updateSanctionLabel(message) {
        const label = this.getDeletionLabel(message);
        if (message.dataset.tfrDeletedLabel !== label) message.dataset.tfrDeletedLabel = label;
        const body = window.TFRChatDomTools.queryMessage(message, MESSAGE_BODY_SELECTOR);
        if (body && body.dataset.tfrDeletedLabel !== label) body.dataset.tfrDeletedLabel = label;
        const restored = deletedMessageView.findRestored(message);
        if (restored && restored.getAttribute('aria-label') !== label) restored.setAttribute('aria-label', label);
      }

      updateSanctionLabels() {
        if (!this.enabled) return;
        document.querySelectorAll('.tfr-deleted-message-react-restored, .tfr-deleted-message-revealed').forEach(message => {
          if (!window.TFRChatDomTools.isReplyContext(message)) this.updateSanctionLabel(message);
        });
      }

      configure(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) {
          this.stop();
          return;
        }
        document.documentElement.classList.add('tfr-show-deleted-messages');
        document.dispatchEvent(new Event('tfr:deleted-message:sync-state'));
        this.observe();
      }

      dispose() { this.setModerationTracker(null); this.stop(); }

      stop() {
        document.documentElement.classList.remove('tfr-show-deleted-messages');
        document.dispatchEvent(new Event('tfr:deleted-message:sync-state'));
        this.observer?.disconnect();
        this.observer = null;
        clearChatRetry(this);
        deletedMessageView.clearAll();
        document.querySelectorAll('.tfr-deleted-message-react-restored').forEach((message) => {
          message.classList.remove('tfr-deleted-message-react-restored');
          delete message.dataset.tfrDeletedRestoreRequested;
        });
        this.snapshotsById.clear();
        this.snapshotsByKey.clear();
      }

      observe() {
        const container = findChatContainer();
        if (!container) {
          scheduleChatRetry(this, () => this.observe());
          return;
        }
        this.container = container;
        container.querySelectorAll(DELETED_TRACKING_SELECTOR).forEach((message) => this.processMessage(message));
        this.observer?.disconnect();
        this.observer = new MutationObserver((mutations) => {
          if (!this.enabled || document.visibilityState === 'hidden') return;
          mutations.forEach((mutation) => {
            const targetMessage = mutation.target instanceof Element
              ? mutation.target.closest(DELETED_TRACKING_SELECTOR)
              : null;
            if (targetMessage) this.captureRemovedSnapshot(targetMessage, mutation);
            if (targetMessage) this.processMessage(targetMessage);
            mutation.addedNodes.forEach((node) => this.scanNode(node));
          });
        });
        this.observer.observe(container, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
          characterDataOldValue: true,
          attributeFilter: ['class', 'data-deleted', 'data-deleted-message']
        });
      }

      scanNode(node) {
        if (!(node instanceof Element) || node.classList.contains(deletedMessageView.RESTORED_CLASS)) return;
        visitMatchingElements(node, DELETED_TRACKING_SELECTOR, (message) => this.processMessage(message));
      }

      isDeleted(message) {
        if (window.TFRChatDomTools.isReplyContext(message)) return false;
        return this.moderationTracker?.getMessageState?.(this.getMessageId(message))?.deleted === true;
      }

      getMessageId(message) {
        message.dispatchEvent?.(new Event('tfr:chat:inspect-reply', { bubbles: true }));
        const nativeId = message.dataset?.tfrMessageId;
        if (nativeId) return nativeId;
        message = window.TFRChatDomTools.ownMessage(message);
        const holder = message.matches?.('[data-message-id],[data-id],[data-uuid]')
          ? message
          : message.querySelector?.('[data-message-id],[data-id],[data-uuid]');
        return String(
          holder?.dataset?.messageId || holder?.dataset?.id || holder?.dataset?.uuid
          || holder?.getAttribute?.('data-message-id') || holder?.getAttribute?.('data-id') || ''
        );
      }

      getMessageSnapshotKey(message) {
        message = window.TFRChatDomTools.ownMessage(message);
        const user = String(
          message.dataset?.aUser
          || message.getAttribute?.('data-a-user')
          || message.querySelector?.('[data-a-user]')?.getAttribute?.('data-a-user')
          || message.querySelector?.('[data-a-target="chat-message-username"]')?.textContent
          || ''
        ).trim().toLowerCase();
        const timestamp = String(
          message.querySelector?.('[data-a-target="chat-timestamp"], [data-test-selector="chat-timestamp"]')?.textContent
          || message.getAttribute?.('aria-label')?.match(/(?:envoyé|sent) (?:à|at) ([0-9:]+)/i)?.[1]
          || ''
        ).trim();
        return user && timestamp ? `${user}|${timestamp}` : '';
      }

      rememberSnapshot(message, snapshot) {
        this.snapshots.set(message, snapshot);
        const messageId = this.getMessageId(message);
        if (messageId) this.snapshotsById.set(messageId, snapshot);
        const snapshotKey = this.getMessageSnapshotKey(message);
        if (snapshotKey) this.snapshotsByKey.set(snapshotKey, snapshot);
        trimMap(this.snapshotsById, CHAT_SNAPSHOT_CACHE_LIMIT);
        trimMap(this.snapshotsByKey, CHAT_SNAPSHOT_CACHE_LIMIT);
      }

      findSnapshot(message) {
        return this.snapshots.get(message)
          || this.snapshotsById.get(this.getMessageId(message))
          || this.snapshotsByKey.get(this.getMessageSnapshotKey(message));
      }

      isDeletionPlaceholder(text) {
        return /message\s+(?:supprim\u00e9|deleted)(?:\s+par\s+un\s+mod\u00e9rateur|\s+by\s+a\s+moderator)?/i
          .test(String(text || '').trim());
      }

      captureRemovedSnapshot(message, mutation) {
        if (window.TFRChatDomTools.isReplyContext(mutation?.target)) return false;
        const removedNodes = Array.from(mutation?.removedNodes || []);
        const oldText = mutation?.type === 'characterData' ? String(mutation.oldValue || '').trim() : '';
        const removedText = removedNodes.map((node) => String(node.textContent || '').trim())
          .filter(Boolean)
          .join(' ')
          .trim();
        const text = oldText || removedText;
        if (!text || this.isDeletionPlaceholder(text)) return false;
        const nodes = removedNodes
          .filter((node) => typeof node.cloneNode === 'function')
          .map((node) => node.cloneNode(true));
        this.rememberSnapshot(message, { text, nodes });
        return true;
      }

      requestNativeRestore(message) {
        this.updateSanctionLabel(message);
        const body = window.TFRChatDomTools.queryMessage(message, MESSAGE_BODY_SELECTOR);
        if (body) body.dataset.tfrDeletedLabel = message.dataset.tfrDeletedLabel;
        if (message.dataset.tfrDeletedRestoreRequested === 'true') return;
        message.dataset.tfrDeletedRestoreRequested = 'true';
        message.dispatchEvent(new CustomEvent('tfr:deleted-message:restore-native', {
          bubbles: true
        }));
      }

      processMessage(message) {
        if (window.TFRChatDomTools.isReplyContext(message)) return;
        if (!(message instanceof HTMLElement)) return;
        const existing = deletedMessageView.findRestored(message);
        if (!this.isDeleted(message)) {
          if (message.classList.contains('tfr-deleted-message-react-restored')) {
            this.updateSanctionLabel(message);
            return;
          }
          deletedMessageView.clear(message);
          const body = window.TFRChatDomTools.queryMessage(message, MESSAGE_BODY_SELECTOR)
          || window.TFRChatDomTools.queryMessage(message, window.TFRChatDomTools.DELETION_SELECTOR)?.parentElement;
          const text = body?.textContent?.trim();
          if (text) {
            this.rememberSnapshot(message, {
              text,
              nodes: Array.from(body.childNodes || []).map((node) => node.cloneNode(true))
            });
          }
          return;
        }
        this.requestNativeRestore(message);
        if (existing) return;
        const serverMessage = this.moderationTracker?.getMessageState?.(this.getMessageId(message))?.message;
        const snapshot = serverMessage ? { text: serverMessage.text, nodes: [] } : null;
        if (!snapshot?.text) return;
        const body = window.TFRChatDomTools.queryMessage(message, MESSAGE_BODY_SELECTOR)
          || window.TFRChatDomTools.queryMessage(message, window.TFRChatDomTools.DELETION_SELECTOR)?.parentElement;
        if (!body) return;
        deletedMessageView.reveal({
          message,
          body,
          text: snapshot.text,
          nodes: snapshot.nodes,
          label: this.getDeletionLabel(message)
        });
      }
    }

    class RootClassToggle {
      constructor(className) {
        this.className = className;
      }

      init() {}

      configure(enabled) {
        document.documentElement.classList.toggle(this.className, Boolean(enabled));
      }

      dispose() {
        document.documentElement.classList.remove(this.className);
      }
    }

    class ChatPaddingManager extends RootClassToggle {
      constructor() {
        super('tfr-chat-no-padding');
      }

      configure(preferences) {
        const enabled = preferences?.enabled === true || preferences === true;
        const parsed = Number(preferences?.paddingPx);
        const paddingPx = Number.isFinite(parsed) ? Math.max(0, Math.min(20, Math.round(parsed))) : 0;
        document.documentElement.classList.toggle(this.className, enabled);
        if (enabled) {
          document.documentElement.style.setProperty('--tfr-chat-padding', `${paddingPx}px`);
        } else {
          document.documentElement.style.removeProperty('--tfr-chat-padding');
        }
      }

      dispose() {
        super.dispose();
        document.documentElement.style.removeProperty('--tfr-chat-padding');
      }
    }

    class ChatMentionHighlighter {
      constructor() {
        this.enabled = false;
        this.soundEnabled = false;
        this.soundId = 'soft';
        this.login = '';
        this.seenMessages = new Set();
        this.lifecycleTimer = null;
        this.boundUnlock = () => this.ensureAudio()?.unlock?.()?.catch?.(() => {});
        this.container = null;
        this.observer = null;
        this.retryTimer = null;
        this.audio = null;
        this.boundTestSound = (event) => {
          this.playSound(this.normalizeSoundId(event?.detail?.soundId));
        };
      }

      init() {
        this.ensureAudio();
        window.addEventListener('tfr:testChatMentionSound', this.boundTestSound);
        document.addEventListener?.('pointerdown', this.boundUnlock, true);
        document.addEventListener?.('keydown', this.boundUnlock, true);
        this.lifecycleTimer = window.setInterval(() => { if (this.enabled || this.soundEnabled) this.observe(); }, 1000);
      }

      ensureAudio() {
        if (this.audio) return this.audio;
        const audioFactory = globalThis.__TFR_TOAST_AUDIO__?.createToastAudio;
        if (audioFactory) {
          this.audio = audioFactory({
            AudioContextConstructor: window.AudioContext || window.webkitAudioContext,
            AudioConstructor: window.Audio
          });
        }
        return this.audio;
      }

      configure({ enabled, color, soundEnabled, soundId }) {
        this.enabled = Boolean(enabled);
        this.soundEnabled = Boolean(soundEnabled);
        this.soundId = this.normalizeSoundId(soundId);
        document.documentElement.style.setProperty('--tfr-chat-mention-color', this.sanitizeColor(color));
        if (this.enabled || this.soundEnabled) this.observe(true);
        else this.stop();
      }

      sanitizeColor(color) {
        return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#9147ff';
      }

      normalizeSoundId(soundId) {
        return CHAT_MENTION_SOUND_IDS.has(soundId) ? soundId : 'soft';
      }

      normalizeLogin(login) {
        const normalized = String(login || '').replace(/^@/, '').trim().toLowerCase();
        return /^[a-z0-9_]{2,25}$/.test(normalized) ? normalized : '';
      }

      playSound(soundId = this.soundId) {
        return Promise.resolve(this.ensureAudio()?.play({ soundId, volume: 35 }))
          .then((played) => {
            if (played === false) window.TFRPerformance?.debug?.('chat-mention', 'sound-blocked');
            return played;
          }).catch(() => {
            window.TFRPerformance?.debug?.('chat-mention', 'sound-unavailable');
            return false;
          });
      }

      resolveLogin() {
        const cookie = String(document.cookie || '').match(/(?:^|;\s*)login=([^;]+)/);
        if (cookie) {
          const login = this.normalizeLogin(cookie[1]);
          if (login) return login;
        }
        for (const key of ['twilight-user', 'twilight_user', 'current-user', 'currentUser']) {
          try {
            const user = JSON.parse(window.localStorage.getItem(key) || 'null');
            const login = typeof user === 'string'
              ? user
              : user?.login || user?.name || user?.username || user?.user?.login;
            const normalizedLogin = this.normalizeLogin(login);
            if (normalizedLogin) return normalizedLogin;
          } catch {}
        }
        const menu = document.querySelector('[data-a-target="user-menu-toggle"]');
        const candidate = menu?.querySelector('img[alt]')?.alt
          || menu?.dataset?.aUser
          || menu?.getAttribute('data-user-login')
          || menu?.getAttribute('data-a-user');
        return this.normalizeLogin(candidate);
      }

      observe(force = false) {
        const previousLogin = this.login;
        this.login = this.resolveLogin();
        const container = findChatContainer();
        if (!container) {
          this.observer?.disconnect();
          this.observer = null;
          this.container = null;
          scheduleChatRetry(this, () => {
            if (this.enabled || this.soundEnabled) this.observe();
          });
          return;
        }
        if (!force && container === this.container && this.observer && previousLogin === this.login) return;
        this.container = container;
        container.querySelectorAll(MESSAGE_SELECTOR).forEach((message) => this.processMessage(message, false));
        this.observer?.disconnect();
        this.observer = new MutationObserver((mutations) => mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' || mutation.type === 'characterData') {
            this.scanNode(mutation.target);
            return;
          }
          const parentMessage = mutation.target?.closest?.(MESSAGE_SELECTOR);
          if (parentMessage) this.processMessage(parentMessage, true);
          mutation.addedNodes.forEach((node) => this.scanNode(node));
        }));
        this.observer.observe(container, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-label'],
          characterData: true
        });
      }

      scanNode(node) {
        const element = node instanceof Element ? node : node?.parentElement;
        if (!element) return;
        const parentMessage = element.closest?.(MESSAGE_SELECTOR);
        if (parentMessage) this.processMessage(parentMessage, true);
        visitMatchingElements(element, MESSAGE_SELECTOR, (message) => this.processMessage(message, true));
      }

      isReplyToCurrentUser(message) {
        message.dispatchEvent?.(new Event('tfr:chat:inspect-reply', { bubbles: true }));
        if (!this.login) this.login = this.normalizeLogin(message.dataset?.tfrCurrentLogin);
        if (!this.login) return false;
        if (this.normalizeLogin(message.dataset?.tfrReplyParent) === this.login) return true;
        const escapedLogin = this.login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const replyPrefix = new RegExp(
          `^(?:(?:en\\s+)?reponse\\s+a|repond(?:re)?\\s+a|reply(?:ing|ied)?\\s+to)\\s+@?${escapedLogin}(?=\\s*[,.:·-]|\\s*$)`,
          'i'
        );
        const candidates = [message.getAttribute?.('aria-label') || ''];
        message.querySelectorAll?.(REPLY_CONTEXT_SELECTOR).forEach((context) => {
          candidates.push(context.getAttribute?.('aria-label') || '');
          candidates.push(context.textContent || '');
        });
        return candidates.some((candidate) => replyPrefix.test(String(candidate)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase()));
      }

      inspectMessage(message) {
        const body = message.querySelector(MESSAGE_BODY_SELECTOR);
        if (!body) return null;
        const normalizedText = String(body.textContent || '').toLowerCase();
        const nativeMention = Boolean(typeof body.querySelector === 'function'
          ? body.querySelector(CURRENT_USER_MENTION_SELECTOR)
          : message.querySelector(CURRENT_USER_MENTION_SELECTOR));
        const directReply = this.isReplyToCurrentUser(message);
        const identity = this.login || CHAT_MENTION_FALLBACK_IDENTITY;
        const escapedLogin = this.login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const textMentionsLogin = this.login
          ? new RegExp(`(^|[^a-z0-9_])@${escapedLogin}(?=$|[^a-z0-9_])`, 'i').test(normalizedText)
          : false;
        return {
          identity,
          mentioned: nativeMention || textMentionsLogin || directReply,
          signature: `${identity}:${this.enabled}:${this.soundEnabled}:${nativeMention ? 'native:' : ''}${directReply ? 'reply:' : ''}${normalizedText}`
        };
      }

      processMessage(message, allowSound) {
        if (!this.enabled && !this.soundEnabled) return;
        const inspection = this.inspectMessage(message);
        if (!inspection || message.dataset.tfrMentionText === inspection.signature) return;
        const { identity, mentioned, signature } = inspection;
        message.dataset.tfrMentionChecked = identity;
        message.dataset.tfrMentionText = signature;
        message.classList.toggle('tfr-chat-mention', mentioned && this.enabled);
        const messageId = message.dataset.tfrMessageId || message.getAttribute?.('data-id') || message.id;
        const notificationKey = messageId ? `${identity}:${messageId}` : null;
        const alreadyNotified = message.dataset.tfrMentionNotified === identity
          || (notificationKey && this.seenMessages.has(notificationKey));
        if (mentioned && !allowSound) {
          message.dataset.tfrMentionNotified = identity;
          if (notificationKey) this.seenMessages.add(notificationKey);
        }
        if (mentioned && allowSound && this.soundEnabled && !alreadyNotified) {
          window.TFRPerformance?.debug?.('chat-mention', 'notification');
          message.dataset.tfrMentionNotified = identity;
          if (notificationKey) this.seenMessages.add(notificationKey);
          if (this.seenMessages.size > 1000) this.seenMessages.delete(this.seenMessages.values().next().value);
          this.playSound();
        }
        while (this.seenMessages.size > 1000) this.seenMessages.delete(this.seenMessages.values().next().value);
      }

      stop() {
        this.observer?.disconnect();
        this.observer = null;
        clearChatRetry(this);
        this.container = null;
        document.querySelectorAll('.tfr-chat-mention').forEach((message) => {
          message.classList.remove('tfr-chat-mention');
          delete message.dataset.tfrMentionChecked;
          delete message.dataset.tfrMentionText;
          delete message.dataset.tfrMentionNotified;
        });
      }

      dispose() {
        this.stop();
        window.clearInterval(this.lifecycleTimer);
        document.removeEventListener?.('pointerdown', this.boundUnlock, true);
        document.removeEventListener?.('keydown', this.boundUnlock, true);
        this.seenMessages.clear();
        window.removeEventListener('tfr:testChatMentionSound', this.boundTestSound);
        document.documentElement.style.removeProperty('--tfr-chat-mention-color');
      }
    }

    class ReplyExpansionTracker {
      constructor() {
        this.expandReplies = false;
        this.observer = null;
        this.container = null;
        this.retryTimer = null;
        this.scrollRestorePending = false;
        this.scrollRestoreState = null;
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
        clearChatRetry(this);
        this.scrollRestorePending = false;
        this.scrollRestoreState = null;
        document.querySelectorAll('.tfr-custom-reply-content').forEach((node) => node.remove());
        document.querySelectorAll('.tfr-custom-reply-context').forEach((node) => node.classList.remove('tfr-custom-reply-context'));
      }

      observe() {
        const container = findChatContainer();
        if (!container) {
          scheduleChatRetry(this, () => this.observe());
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
        visitMatchingElements(node, 'p[title]', (context) => this.renderNativeContext(context));
      }

      findScrollViewport(node = this.container) {
        let current = node;
        for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
          const style = window.getComputedStyle?.(current);
          const scrollableOverflow = /^(?:auto|scroll|overlay)$/.test(style?.overflowY || '');
          if (scrollableOverflow && current.scrollHeight > current.clientHeight) return current;
        }
        return null;
      }

      captureBottomState() {
        const viewport = this.findScrollViewport();
        if (!viewport) return null;
        const distance = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
        return {
          viewport,
          wasNearBottom: distance <= 48,
          scrollTop: viewport.scrollTop
        };
      }

      restoreBottomAfterLayout(state) {
        if (!state?.wasNearBottom) return;
        this.scrollRestoreState = this.scrollRestoreState || state;
        if (this.scrollRestorePending) return;
        this.scrollRestorePending = true;
        const scheduleFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
        scheduleFrame(() => scheduleFrame(() => {
          this.scrollRestorePending = false;
          const pending = this.scrollRestoreState;
          this.scrollRestoreState = null;
          const viewport = pending?.viewport;
          if (!viewport?.isConnected) return;
          const userDidNotScrollUp = viewport.scrollTop >= pending.scrollTop - 2;
          if (userDidNotScrollUp) viewport.scrollTop = viewport.scrollHeight;
        }));
      }

      renderNativeContext(replyContext) {
        if (!this.expandReplies || replyContext.querySelector('.tfr-custom-reply-content')) return;
        const nativeText = String(replyContext.textContent || '').trim();
        if (!/^(?:r\u00e9pond\s+\u00e0|replying\s+to)/i.test(nativeText)) return;
        const fullMessage = String(replyContext.getAttribute('title') || '').trim();
        const nativeAuthor = replyContext.querySelector('span[dir="auto"]')?.textContent?.trim() || '';
        if (!fullMessage || !nativeAuthor) return;
        const bottomState = this.captureBottomState();

        const customReply = document.createElement('span');
        customReply.className = 'tfr-custom-reply-content';

        const author = document.createElement('span');
        author.className = 'tfr-custom-reply-author';
        author.dataset.tfrText = nativeAuthor.startsWith('@') ? nativeAuthor : `@${nativeAuthor}`;

        const message = document.createElement('span');
        message.className = 'tfr-custom-reply-message';
        message.dataset.tfrText = ` : ${fullMessage}`;

        customReply.append(author, message);
        replyContext.classList.add('tfr-custom-reply-context');
        replyContext.appendChild(customReply);
        this.restoreBottomAfterLayout(bottomState);
      }

    }

    const CHAT_COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M7 3a2 2 0 0 0-2 2v10h2V5h10V3H7Zm3 4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-9Zm0 2h9v10h-9V9Z" clip-rule="evenodd"></path></svg>';
    const CHAT_COPY_SUCCESS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 16.2-4-4L7 10.8l2.5 2.5L17 5.8l1.5 1.4-9 9Z"></path></svg>';

    class ChatMessageCopyAction {
      constructor() {
        this.observer = null;
        this.container = null;
        this.retryTimer = null;
        this.feedbackTimers = new Map();
      }

      init() {
        this.observe();
      }

      configure() {}

      dispose() {
        this.observer?.disconnect();
        this.observer = null;
        clearChatRetry(this);
        this.feedbackTimers.forEach((timer) => window.clearTimeout(timer));
        this.feedbackTimers.clear();
        document.querySelectorAll('.tfr-chat-copy-button').forEach((button) => button.remove());
      }

      observe() {
        const container = findChatContainer();
        if (!container) {
          scheduleChatRetry(this, () => this.observe());
          return;
        }
        if (this.container === container && this.observer) return;
        this.container = container;
        this.scanNode(container);
        this.observer?.disconnect();
        this.observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => this.scanNode(node)));
        });
        this.observer.observe(container, { childList: true, subtree: true });
      }

      scanNode(node) {
        visitMatchingElements(node, MESSAGE_SELECTOR, (message) => this.mount(message));
      }

      mount(message) {
        if (!(message instanceof Element)) return;
        const icons = message.querySelector('.chat-line__icons');
        let reply = icons?.querySelector('.chat-line__reply-icon, button[aria-label*="répond" i], button[aria-label*="reply" i]');
        if (!icons || !reply || icons.querySelector('.tfr-chat-copy-button')) return;
        while (reply.parentElement && reply.parentElement !== icons) reply = reply.parentElement;
        if (reply.parentElement !== icons) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tfr-chat-copy-button';
        button.title = t('chat.copyMessage.action');
        button.setAttribute('aria-label', t('chat.copyMessage.action'));
        button.innerHTML = CHAT_COPY_ICON;
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const text = this.extractMessage(message);
          if (!text) return;
          const copied = await this.copyText(text);
          if (!button.isConnected) return;
          this.showCopyFeedback(button, copied);
        });
        icons.insertBefore(button, reply);
      }

      showCopyFeedback(button, copied) {
        const previousTimer = this.feedbackTimers.get(button);
        if (previousTimer) window.clearTimeout(previousTimer);
        button.classList.toggle('is-copied', copied);
        button.title = t(copied ? 'chat.copyMessage.success' : 'chat.copyMessage.error');
        button.setAttribute('aria-label', button.title);
        button.innerHTML = copied ? CHAT_COPY_SUCCESS_ICON : CHAT_COPY_ICON;
        const timer = window.setTimeout(() => {
          this.feedbackTimers.delete(button);
          if (!button.isConnected) return;
          button.classList.remove('is-copied');
          button.title = t('chat.copyMessage.action');
          button.setAttribute('aria-label', button.title);
          button.innerHTML = CHAT_COPY_ICON;
        }, 1200);
        this.feedbackTimers.set(button, timer);
      }

      extractMessage(message) {
        const body = message.querySelector(MESSAGE_BODY_SELECTOR);
        if (!body) return '';
        const collect = (node) => {
          if (node.nodeType === 3) return node.nodeValue || '';
          if (!(node instanceof Element)) return '';
          if (node.matches('.tfr-custom-reply-content')) return '';
          if (node.tagName === 'IMG') return node.getAttribute('alt') || '';
          if (node.tagName === 'BR') return '\n';
          return Array.from(node.childNodes || []).map(collect).join('');
        };
        return collect(body).replace(/[ \t]+\n/g, '\n').trim();
      }

      async copyText(text) {
        try {
          if (window.navigator?.clipboard?.writeText) {
            await window.navigator.clipboard.writeText(text);
            return true;
          }
          const field = document.createElement('textarea');
          field.value = text;
          field.className = 'tfr-clipboard-fallback';
          document.body.appendChild(field);
          field.select();
          const copied = document.execCommand?.('copy') === true;
          field.remove();
          return copied;
        } catch {
          return false;
        }
      }
    }

    return {
      ThirdPartyChatEmotes,
      PlayerLatencyIndicator,
      AutoClaimChannelPoints,
      PlayerAudioCompressor,
      ChatFontManager,
      ChatPaddingManager,
      ChatMentionHighlighter,
      DeletedMessageViewer,
      ReplyExpansionTracker,
      ChatMessageCopyAction
    };
  };

  window.TFRStreamEnhancements = { create: createStreamEnhancements };
})();

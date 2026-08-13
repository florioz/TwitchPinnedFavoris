(() => {
  const createStreamEnhancements = ({ t }) => {
    const deletedMessageView = window.TFRDeletedMessageView.create(document);
    const CHAT_CONTAINER_SELECTORS = [
      '[data-test-selector="chat-scrollable-area__message-container"]',
      '.chat-scrollable-area__message-container',
      '[data-a-target="chat-messages"]',
      '[role="log"][aria-live="polite"]'
    ];
    const MESSAGE_SELECTOR = '[data-a-target="chat-line-message"], [data-test-selector="chat-line-message"], .chat-line__message';
    const MESSAGE_BODY_SELECTOR = '[data-a-target="chat-message-text"], [data-a-target="chat-line-message-body"], [data-test-selector="chat-line-message-body"]';
    const CURRENT_USER_MENTION_SELECTOR = '[data-a-target="chat-message-mention"].mention-fragment--recipient';
    const CHAT_MENTION_SOUND_IDS = new Set(['soft', 'chime', 'arcade', 'pulse', 'alert']);
    const CHAT_MENTION_FALLBACK_IDENTITY = 'twitch-current-user';
    const CHAT_SNAPSHOT_CACHE_LIMIT = 500;
    const audioEngineModule = window.TFRPlayerAudioEngine;
    if (!audioEngineModule?.PlayerAudioEngine) throw new Error('Player audio engine module is missing');
    const {
      PlayerAudioEngine,
      PRESETS: AUDIO_COMPRESSOR_PRESETS,
      TARGET_MIN_DB: VOLUME_TARGET_MIN_DB,
      TARGET_MAX_DB: VOLUME_TARGET_MAX_DB
    } = audioEngineModule;
    const TWITCH_GQL_ENDPOINT = 'https://gql.twitch.tv/gql';
    const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
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
        this.renderScheduler = window.TFRDomWorkScheduler.create({
          process: (node) => this.scanNode(node),
          maxBatchSize: 10
        });
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
        clearChatRetry(this);
        clearInterval(this.locationTimer);
        this.observer = null;
        this.locationTimer = null;
        this.emotes.clear();
        this.renderScheduler.dispose();
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

      observeChat() {
        if (!this.enabledSevenTv && !this.enabledBetterTtv) return;
        const container = findChatContainer();
        if (!container) {
          scheduleChatRetry(this, () => this.observeChat());
          return;
        }
        if (container === this.container && this.observer) return;
        this.container = container;
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
        this.container?.querySelectorAll(MESSAGE_SELECTOR).forEach((message) => this.renderMessage(message));
      }

      scanNode(node) {
        visitMatchingElements(node, MESSAGE_SELECTOR, (message) => this.renderMessage(message));
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

    class PlayerAudioCompressor {
      constructor() {
        this.engine = new PlayerAudioEngine();
        this.enabled = false;
        this.preset = 'balanced';
        this.normalizerEnabled = false;
        this.targetDb = -16;
        this.timer = null;
        this.meterTimer = null;
        this.button = null;
        this.panel = null;
        this.updatePreference = null;
      }

      get currentGainDb() { return this.engine.currentGainDb; }
      get measuredLevelDb() { return this.engine.measuredLevelDb; }
      get video() { return this.engine.video; }
      get graph() { return this.engine.graph; }
      set graph(value) { this.engine.graph = value; }

      init() {
        this.timer = window.setInterval(() => this.refresh(), 1000);
        this.meterTimer = window.setInterval(() => this.updateVolumeNormalization(), 200);
      }

      setPreferenceUpdater(updatePreference) {
        this.updatePreference = updatePreference;
      }

      configure({ enabled, preset, normalizerEnabled, targetDb }) {
        const panelWasOpen = Boolean(this.panel?.isConnected);
        this.enabled = Boolean(enabled);
        this.preset = this.normalizePreset(preset);
        this.normalizerEnabled = Boolean(normalizerEnabled);
        this.targetDb = this.normalizeTargetDb(targetDb);
        this.engine.configure({
          compressorEnabled: this.enabled,
          preset: this.preset,
          normalizerEnabled: this.normalizerEnabled,
          targetDb: this.targetDb
        });
        this.panel?.remove();
        this.refresh();
        if (panelWasOpen) this.togglePanel();
      }

      normalizePreset(preset) {
        return this.engine.normalizePreset(preset);
      }

      normalizeTargetDb(value) {
        return this.engine.normalizeTargetDb(value);
      }

      calculateTargetGainDb(inputDb) {
        this.engine.targetDb = this.targetDb;
        return this.engine.calculateTargetGainDb(inputDb);
      }

      calculateMeasuredLevelDb(samples) {
        return this.engine.calculateMeasuredLevelDb(samples);
      }

      applyCompressorState() {
        this.engine.compressorEnabled = this.enabled;
        this.engine.preset = this.preset;
        this.engine.applyCompressorState();
        const audioProtectionEnabled = this.enabled || this.normalizerEnabled;
        this.button?.classList.toggle('is-active', audioProtectionEnabled);
        this.button?.setAttribute('aria-pressed', String(audioProtectionEnabled));
      }

      updateVolumeNormalization() {
        const result = this.engine.update();
        if (result) this.updateNormalizerReadout(result.levelDb, result.contextState);
      }

      updateNormalizerReadout(levelDb, contextState = 'running') {
        const levelOutput = this.panel?.querySelector?.('.tfr-audio-normalizer__level');
        const gainOutput = this.panel?.querySelector?.('.tfr-audio-normalizer__gain');
        const calibrateButton = this.panel?.querySelector?.('.tfr-audio-normalizer__calibrate');
        if (calibrateButton) calibrateButton.disabled = !this.normalizerEnabled || !Number.isFinite(levelDb);
        if (levelOutput) {
          levelOutput.textContent = contextState === 'running'
            ? t('settings.volumeNormalizer.measured', {
              level: Number.isFinite(levelDb) ? levelDb.toFixed(1) : '—'
            })
            : t('settings.volumeNormalizer.audioPaused');
        }
        if (gainOutput) gainOutput.textContent = this.normalizerEnabled
          ? t('settings.volumeNormalizer.gain', { gain: this.currentGainDb.toFixed(1) })
          : t('settings.volumeNormalizer.gainInactive');
      }

      attachAudio(video) {
        return this.engine.attach(video);
      }

      ensureButton() {
        const volumeButton = document.querySelector(
          '[data-a-target="player-mute-unmute-button"], [data-a-target="player-volume-button"]'
        );
        const controls = volumeButton?.parentElement;
        if (!controls) {
          this.button?.remove();
          this.button = null;
          return;
        }
        if (!this.button) {
          this.button = document.createElement('button');
          this.button.type = 'button';
          this.button.className = 'tfr-audio-compressor-button';
          this.button.textContent = '≋';
          this.button.title = t('settings.audioCompressor.button');
          this.button.setAttribute('aria-label', t('settings.audioCompressor.button'));
          this.button.addEventListener('click', () => this.togglePanel());
        }
        if (this.button.parentElement !== controls) controls.appendChild(this.button);
        this.applyCompressorState();
      }

      createPanelHeading(titleKey, enabled) {
        const heading = document.createElement('div');
        heading.className = 'tfr-audio-compressor-panel__heading';
        const title = document.createElement('strong');
        title.textContent = t(titleKey);
        const status = document.createElement('span');
        status.className = 'tfr-audio-compressor-panel__status';
        status.textContent = enabled
          ? t('settings.audioCompressor.statusEnabled') : t('settings.audioCompressor.statusDisabled');
        heading.append(title, status);
        return heading;
      }

      createStateToggle(enabled, onToggle) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `tfr-audio-compressor-panel__toggle ${enabled ? 'is-disable' : 'is-enable'}`;
        button.textContent = enabled
          ? t('settings.audioCompressor.disable') : t('settings.audioCompressor.enable');
        button.addEventListener('click', onToggle);
        return button;
      }

      createTargetScale() {
        const scale = document.createElement('span');
        scale.className = 'tfr-audio-normalizer__scale';
        ['quieter', 'recommended', 'louder'].forEach((label) => {
          const item = document.createElement('span');
          item.textContent = t(`settings.volumeNormalizer.${label}`);
          scale.appendChild(item);
        });
        return scale;
      }

      togglePanel() {
        if (this.panel?.isConnected) {
          this.panel.remove();
          return;
        }
        this.engine.resume();
        const panel = document.createElement('div');
        panel.className = 'tfr-audio-compressor-panel';
        panel.classList.toggle('is-enabled', this.enabled);
        panel.classList.toggle('is-normalizing', this.normalizerEnabled);
        const heading = this.createPanelHeading('settings.audioCompressor.title', this.enabled);
        const description = document.createElement('small');
        description.textContent = t('settings.audioCompressor.panelDescription');
        const toggle = this.createStateToggle(this.enabled, async () => {
          await this.updatePreference?.({ enabled: !this.enabled, preset: this.preset });
        });
        const presets = document.createElement('div');
        presets.className = 'tfr-audio-compressor-panel__presets';
        AUDIO_COMPRESSOR_PRESETS.forEach((preset) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = t(`settings.audioCompressor.preset.${preset}`);
          button.disabled = !this.enabled;
          button.classList.toggle('is-active', this.enabled && preset === this.preset);
          button.addEventListener('click', async () => {
            await this.updatePreference?.({ enabled: true, preset });
          });
          presets.appendChild(button);
        });
        const normalizer = document.createElement('section');
        normalizer.className = 'tfr-audio-normalizer';
        const normalizerHeading = this.createPanelHeading(
          'settings.volumeNormalizer.title', this.normalizerEnabled
        );
        const normalizerDescription = document.createElement('small');
        normalizerDescription.textContent = t('settings.volumeNormalizer.panelDescription');
        const normalizerToggle = this.createStateToggle(this.normalizerEnabled, async () => {
          await this.updatePreference?.({ normalizerEnabled: !this.normalizerEnabled });
        });
        const targetLabel = document.createElement('label');
        targetLabel.className = 'tfr-audio-normalizer__target';
        const targetHeading = document.createElement('span');
        targetHeading.textContent = t('settings.volumeNormalizer.target');
        const targetOutput = document.createElement('output');
        targetOutput.textContent = `${this.targetDb} dB`;
        targetHeading.appendChild(targetOutput);
        const targetInput = document.createElement('input');
        targetInput.type = 'range';
        targetInput.min = String(VOLUME_TARGET_MIN_DB);
        targetInput.max = String(VOLUME_TARGET_MAX_DB);
        targetInput.step = '1';
        targetInput.value = String(this.targetDb);
        targetInput.disabled = !this.normalizerEnabled;
        targetInput.addEventListener('input', () => { targetOutput.textContent = `${targetInput.value} dB`; });
        targetInput.addEventListener('change', async () => {
          await this.updatePreference?.({ targetDb: Number(targetInput.value) });
        });
        const calibrateButton = document.createElement('button');
        calibrateButton.type = 'button';
        calibrateButton.className = 'tfr-audio-normalizer__calibrate';
        calibrateButton.disabled = !this.normalizerEnabled || !Number.isFinite(this.measuredLevelDb);
        calibrateButton.textContent = t('settings.volumeNormalizer.useCurrentLevel');
        calibrateButton.addEventListener('click', async () => {
          if (!Number.isFinite(this.measuredLevelDb)) return;
          await this.updatePreference?.({ targetDb: Math.round(this.measuredLevelDb) });
        });
        const targetScale = this.createTargetScale();
        targetLabel.append(targetHeading, targetInput, targetScale, calibrateButton);
        const gainOutput = document.createElement('output');
        gainOutput.className = 'tfr-audio-normalizer__gain';
        gainOutput.textContent = this.normalizerEnabled
          ? t('settings.volumeNormalizer.gain', { gain: `${this.currentGainDb >= 0 ? '+' : ''}${this.currentGainDb.toFixed(1)}` })
          : t('settings.volumeNormalizer.gainInactive');
        const levelOutput = document.createElement('output');
        levelOutput.className = 'tfr-audio-normalizer__level';
        levelOutput.textContent = t('settings.volumeNormalizer.measured', {
          level: Number.isFinite(this.measuredLevelDb) ? this.measuredLevelDb.toFixed(1) : '—'
        });
        normalizer.append(
          normalizerHeading, normalizerDescription, normalizerToggle, targetLabel, levelOutput, gainOutput
        );
        panel.append(heading, description, toggle, presets, normalizer);
        document.body.appendChild(panel);
        const rect = this.button.getBoundingClientRect();
        panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 288, rect.left))}px`;
        panel.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
        this.panel = panel;
      }

      refresh() {
        if (document.visibilityState === 'hidden') return;
        this.ensureButton();
        const video = document.querySelector('.video-player__container video, [data-a-target="video-player"] video, video');
        if ((this.enabled || this.normalizerEnabled) && video && video !== this.video) this.attachAudio(video);
        this.applyCompressorState();
      }

      dispose() {
        clearInterval(this.timer);
        clearInterval(this.meterTimer);
        this.timer = null;
        this.meterTimer = null;
        this.panel?.remove();
        this.button?.remove();
        this.panel = null;
        this.button = null;
        this.engine.bypass();
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
        this.snapshotsByKey = new Map();
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
        clearChatRetry(this);
        deletedMessageView.clearAll();
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
        if (!(node instanceof Element) || node.classList.contains(deletedMessageView.RESTORED_CLASS)) return;
        visitMatchingElements(node, MESSAGE_SELECTOR, (message) => this.processMessage(message));
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

      getMessageSnapshotKey(message) {
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

      processMessage(message) {
        if (!(message instanceof HTMLElement)) return;
        const existing = deletedMessageView.findRestored(message);
        if (!this.isDeleted(message)) {
          deletedMessageView.clear(message);
          const body = message.querySelector(MESSAGE_BODY_SELECTOR);
          const text = body?.textContent?.trim();
          if (text) {
            this.rememberSnapshot(message, {
              text,
              nodes: Array.from(body.childNodes || []).map((node) => node.cloneNode(true))
            });
          }
          return;
        }
        if (existing) return;
        const snapshot = this.findSnapshot(message);
        if (!snapshot?.text) return;
        const body = message.querySelector(MESSAGE_BODY_SELECTOR);
        if (!body) return;
        deletedMessageView.reveal({
          message,
          body,
          text: snapshot.text,
          nodes: snapshot.nodes,
          label: t('settings.deletedMessages.badge')
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
        if (this.enabled) this.observe();
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
        this.ensureAudio()?.play({ soundId, volume: 35 });
      }

      resolveLogin() {
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

      observe() {
        this.login = this.resolveLogin();
        const container = findChatContainer();
        if (!container) {
          scheduleChatRetry(this, () => {
            if (this.enabled) this.observe();
          });
          return;
        }
        if (container === this.container && this.observer) return;
        this.container = container;
        container.querySelectorAll(MESSAGE_SELECTOR).forEach((message) => this.processMessage(message, false));
        this.observer?.disconnect();
        this.observer = new MutationObserver((mutations) => mutations.forEach((mutation) =>
          mutation.addedNodes.forEach((node) => this.scanNode(node))
        ));
        this.observer.observe(container, { childList: true, subtree: true });
      }

      scanNode(node) {
        visitMatchingElements(node, MESSAGE_SELECTOR, (message) => this.processMessage(message, true));
      }

      inspectMessage(message) {
        const body = message.querySelector(MESSAGE_BODY_SELECTOR);
        if (!body) return null;
        const normalizedText = String(body.textContent || '').toLowerCase();
        const nativeMention = Boolean(message.querySelector(CURRENT_USER_MENTION_SELECTOR));
        const identity = this.login || CHAT_MENTION_FALLBACK_IDENTITY;
        const escapedLogin = this.login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const textMentionsLogin = this.login
          ? new RegExp(`(^|[^a-z0-9_])@${escapedLogin}(?=$|[^a-z0-9_])`, 'i').test(normalizedText)
          : false;
        return {
          identity,
          mentioned: nativeMention || textMentionsLogin,
          signature: `${identity}:${nativeMention ? 'native:' : ''}${normalizedText}`
        };
      }

      processMessage(message, allowSound) {
        if (!this.enabled) return;
        const inspection = this.inspectMessage(message);
        if (!inspection || message.dataset.tfrMentionText === inspection.signature) return;
        const { identity, mentioned, signature } = inspection;
        message.dataset.tfrMentionChecked = identity;
        message.dataset.tfrMentionText = signature;
        message.classList.toggle('tfr-chat-mention', mentioned);
        const alreadyNotified = message.dataset.tfrMentionNotified === identity;
        if (mentioned && allowSound && this.soundEnabled && !alreadyNotified) {
          message.dataset.tfrMentionNotified = identity;
          this.playSound();
        } else if (!mentioned) {
          delete message.dataset.tfrMentionNotified;
        }
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

    return {
      ThirdPartyChatEmotes,
      PlayerLatencyIndicator,
      AutoClaimChannelPoints,
      PlayerAudioCompressor,
      ChatFontManager,
      ChatPaddingManager,
      ChatMentionHighlighter,
      DeletedMessageViewer,
      ReplyExpansionTracker
    };
  };

  window.TFRStreamEnhancements = { create: createStreamEnhancements };
})();

(() => {
  const createFeatureController = ({
    CHANGE_KIND,
    ChatHistoryTracker,
    ViewerCardHistoryRenderer,
    ModerationActionTracker,
    ModerationHistoryUI,
    ThirdPartyChatEmotes,
    PlayerLatencyIndicator,
    PlayerRecovery,
    AutoClaimChannelPoints,
    PlayerAudioCompressor,
    ChatFontManager,
    ChatPaddingManager,
    ChatMentionHighlighter,
    DeletedMessageViewer,
    ReplyExpansionTracker
  }) => {
class FeatureController {
  constructor(store) {
    this.store = store;
    this.chatHistory = null;
    this.viewerCardHistory = null;
    this.moderationTracker = null;
    this.moderationHistoryUI = null;
    this.unsubscribe = null;
    this.enhancementDefinitions = [
      {
        property: 'thirdPartyChatEmotes', Type: ThirdPartyChatEmotes, label: 'emote enhancement',
        selectPreferences: (prefs) => ({
          sevenTvEnabled: prefs.sevenTvEmotesEnabled === true,
          betterTtvEnabled: prefs.betterTtvEmotesEnabled === true,
          autocompleteEnabled: prefs.chatEmoteAutocompleteEnabled === true
        })
      },
      {
        property: 'playerLatencyIndicator', Type: PlayerLatencyIndicator, label: 'player indicator',
        selectPreferences: (prefs) => prefs.playerLatencyEnabled === true
      },
      {
        property: 'playerRecovery', Type: PlayerRecovery, label: 'player recovery',
        selectPreferences: (prefs) => prefs.playerRecoveryEnabled === true
      },
      {
        property: 'autoClaimChannelPoints', Type: AutoClaimChannelPoints, label: 'channel points auto claim',
        selectPreferences: (prefs) => prefs.autoClaimChannelPointsEnabled === true
      },
      {
        property: 'playerAudioCompressor', Type: PlayerAudioCompressor, label: 'player audio compressor',
        selectPreferences: (prefs) => ({
          enabled: prefs.playerAudioCompressorEnabled === true,
          preset: prefs.playerAudioCompressorPreset || 'balanced',
          normalizerEnabled: prefs.playerVolumeNormalizerEnabled === true,
          targetDb: Number.isFinite(Number(prefs.playerVolumeTargetDb)) ? Number(prefs.playerVolumeTargetDb) : -16,
          maxReductionDb: Number.isFinite(Number(prefs.playerVolumeMaxReductionDb))
            ? Number(prefs.playerVolumeMaxReductionDb) : -24
        })
      },
      {
        property: 'chatFontManager', Type: ChatFontManager, label: 'chat font',
        selectPreferences: (prefs) => ({
          enabled: prefs.chatFontEnabled === true,
          font: prefs.chatFontFamily || 'system',
          customName: prefs.chatCustomFontName || '',
          customDataUrl: prefs.chatCustomFontDataUrl || ''
        })
      },
      {
        property: 'chatPaddingManager', Type: ChatPaddingManager, label: 'chat padding',
        selectPreferences: (prefs) => ({
          enabled: prefs.chatNoPaddingEnabled === true,
          paddingPx: Number.isFinite(Number(prefs.chatPaddingPx))
            ? Math.max(0, Math.min(20, Math.round(Number(prefs.chatPaddingPx))))
            : 0
        })
      },
      {
        property: 'chatMentionHighlighter', Type: ChatMentionHighlighter, label: 'chat mention highlighter',
        selectPreferences: (prefs) => ({
          enabled: prefs.chatMentionHighlightEnabled === true,
          color: prefs.chatMentionHighlightColor || '#9147ff',
          soundEnabled: prefs.chatMentionSoundEnabled === true,
          soundId: prefs.chatMentionSoundId || 'soft'
        })
      },
      {
        property: 'deletedMessageViewer', Type: DeletedMessageViewer, label: 'deleted message viewer',
        selectPreferences: (prefs) => prefs.showDeletedMessagesEnabled === true
      },
      {
        property: 'replyExpansionTracker', Type: ReplyExpansionTracker, label: 'reply expansion tracker',
        selectPreferences: (prefs) => prefs.showFullRepliesEnabled === true
      }
    ];
    this.enhancementDefinitions.forEach(({ property }) => {
      this[property] = null;
    });
  }

  init() {
    this.enhancementDefinitions.forEach((definition) => this.initializeEnhancement(definition));
    this.applyPreferences(this.store.getState().preferences || {});
    this.unsubscribe = this.store.subscribe((event) => {
      if (event?.kind === CHANGE_KIND.STATE && event.state?.preferences) {
        this.applyPreferences(event.state.preferences);
      }
    });
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.teardownModeration();
    this.teardownChatHistory();
    this.enhancementDefinitions.forEach(({ property }) => {
      this[property]?.dispose();
      this[property] = null;
    });
  }

  initializeEnhancement({ property, Type, label }) {
    try {
      const instance = new Type();
      instance.setPreferenceUpdater?.(async (changes = {}) => {
        if (Object.hasOwn(changes, 'preset')) await this.store.setPlayerAudioCompressorPreset(changes.preset);
        if (Object.hasOwn(changes, 'enabled')) await this.store.setPlayerAudioCompressorEnabled(changes.enabled);
        if (Object.hasOwn(changes, 'targetDb')) await this.store.setPlayerVolumeTargetDb(changes.targetDb);
        if (Object.hasOwn(changes, 'maxReductionDb')) {
          await this.store.setPlayerVolumeMaxReductionDb(changes.maxReductionDb);
        }
        if (Object.hasOwn(changes, 'normalizerEnabled')) {
          await this.store.setPlayerVolumeNormalizerEnabled(changes.normalizerEnabled);
        }
      });
      instance.init();
      this[property] = instance;
    } catch (error) {
      this[property] = null;
      console.error(`[TFR] ${label} failed to initialize`, error);
    }
  }

  configureEnhancement(property, value, label) {
    try {
      this[property]?.configure(value);
    } catch (error) {
      console.error(`[TFR] ${label} configuration failed`, error);
    }
  }

  applyPreferences(prefs) {
    const wantsViewerChatHistory = prefs.chatHistoryEnabled !== false;
    const wantsModeration = prefs.moderationHistoryEnabled !== false;
    const needsMessageTracker = wantsViewerChatHistory || wantsModeration;

    this.enhancementDefinitions.forEach(({ property, label, selectPreferences }) => {
      this.configureEnhancement(property, selectPreferences(prefs), label);
    });

    if (needsMessageTracker) {
      this.ensureChatHistory();
    } else {
      this.teardownModeration();
      this.teardownChatHistory();
      return;
    }

    if (wantsViewerChatHistory) {
      this.ensureViewerCardHistory();
    } else {
      this.teardownViewerCardHistory();
    }

    if (wantsModeration) {
      this.ensureModerationFeatures();
    } else {
      this.teardownModeration();
    }
  }

  ensureChatHistory() {
    if (this.chatHistory) {
      return;
    }
    this.chatHistory = new ChatHistoryTracker();
    this.chatHistory.init();
  }

  ensureViewerCardHistory() {
    if (this.viewerCardHistory || !this.chatHistory) {
      return;
    }
    this.viewerCardHistory = new ViewerCardHistoryRenderer(this.chatHistory);
    this.viewerCardHistory.init();
  }

  teardownViewerCardHistory() {
    this.viewerCardHistory?.dispose();
    this.viewerCardHistory = null;
  }

  teardownChatHistory() {
    this.teardownViewerCardHistory();
    this.chatHistory?.dispose();
    this.chatHistory = null;
  }

  ensureModerationFeatures() {
    if (!this.chatHistory) {
      this.ensureChatHistory();
    }
    if (this.moderationTracker) {
      this.ensureModerationHistoryUI();
      return;
    }
    this.moderationTracker = new ModerationActionTracker(this.chatHistory);
    this.moderationTracker.init();
    this.ensureModerationHistoryUI();
  }

  ensureModerationHistoryUI() {
    if (this.moderationHistoryUI || !this.moderationTracker) return;
    this.moderationHistoryUI = new ModerationHistoryUI(this.moderationTracker);
    this.moderationHistoryUI.init();
  }

  teardownModeration() {
    this.moderationHistoryUI?.dispose();
    this.moderationHistoryUI = null;
    this.moderationTracker?.dispose();
    this.moderationTracker = null;
  }
}
    return FeatureController;
  };

  window.TFRFeatureController = {
    create: createFeatureController
  };
})();

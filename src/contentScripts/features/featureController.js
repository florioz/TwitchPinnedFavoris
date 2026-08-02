(() => {
  const createFeatureController = ({
    CHANGE_KIND,
    ChatHistoryTracker,
    ViewerCardHistoryRenderer,
    ModerationActionTracker,
    ModerationHistoryUI,
    ThirdPartyChatEmotes,
    PlayerLatencyIndicator,
    ChatFontManager,
    DeletedMessageViewer,
    FullReplyViewer,
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
    this.thirdPartyChatEmotes = null;
    this.playerLatencyIndicator = null;
    this.chatFontManager = null;
    this.deletedMessageViewer = null;
    this.fullReplyViewer = null;
    this.replyExpansionTracker = null;
    this.enhancementDefinitions = [
      { property: 'thirdPartyChatEmotes', Type: ThirdPartyChatEmotes, label: 'emote enhancement' },
      { property: 'playerLatencyIndicator', Type: PlayerLatencyIndicator, label: 'player indicator' },
      { property: 'chatFontManager', Type: ChatFontManager, label: 'chat font' },
      { property: 'deletedMessageViewer', Type: DeletedMessageViewer, label: 'deleted message viewer' },
      { property: 'fullReplyViewer', Type: FullReplyViewer, label: 'full reply viewer' },
      { property: 'replyExpansionTracker', Type: ReplyExpansionTracker, label: 'reply expansion tracker' }
    ];
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

    this.configureEnhancement('thirdPartyChatEmotes', {
        sevenTvEnabled: prefs.sevenTvEmotesEnabled === true,
        betterTtvEnabled: prefs.betterTtvEmotesEnabled === true
      }, 'emote enhancement');
    this.configureEnhancement(
      'playerLatencyIndicator',
      prefs.playerLatencyEnabled === true,
      'player indicator'
    );
    this.configureEnhancement('chatFontManager', {
        enabled: prefs.chatFontEnabled === true,
        font: prefs.chatFontFamily || 'system',
        customName: prefs.chatCustomFontName || '',
        customDataUrl: prefs.chatCustomFontDataUrl || ''
      }, 'chat font');
    this.configureEnhancement(
      'deletedMessageViewer',
      prefs.showDeletedMessagesEnabled === true,
      'deleted message viewer'
    );
    this.configureEnhancement(
      'fullReplyViewer',
      prefs.showFullRepliesEnabled === true,
      'full reply viewer'
    );
    this.configureEnhancement(
      'replyExpansionTracker',
      prefs.showFullRepliesEnabled === true,
      'reply expansion tracker'
    );

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
      if (!this.moderationHistoryUI) {
        this.moderationHistoryUI = new ModerationHistoryUI(this.moderationTracker);
        this.moderationHistoryUI.init();
      }
      return;
    }
    this.moderationTracker = new ModerationActionTracker(this.chatHistory);
    this.moderationTracker.init();
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

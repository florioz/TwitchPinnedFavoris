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
  }

  init() {
    try {
      this.thirdPartyChatEmotes = new ThirdPartyChatEmotes();
      this.thirdPartyChatEmotes.init();
    } catch (error) {
      this.thirdPartyChatEmotes = null;
      console.error('[TFR] emote enhancement failed to initialize', error);
    }
    try {
      this.playerLatencyIndicator = new PlayerLatencyIndicator();
      this.playerLatencyIndicator.init();
    } catch (error) {
      this.playerLatencyIndicator = null;
      console.error('[TFR] player indicator failed to initialize', error);
    }
    try {
      this.chatFontManager = new ChatFontManager();
      this.chatFontManager.init();
    } catch (error) {
      this.chatFontManager = null;
      console.error('[TFR] chat font failed to initialize', error);
    }
    try {
      this.deletedMessageViewer = new DeletedMessageViewer();
      this.deletedMessageViewer.init();
    } catch (error) {
      this.deletedMessageViewer = null;
      console.error('[TFR] deleted message viewer failed to initialize', error);
    }
    try {
      this.fullReplyViewer = new FullReplyViewer();
      this.fullReplyViewer.init();
    } catch (error) {
      this.fullReplyViewer = null;
      console.error('[TFR] full reply viewer failed to initialize', error);
    }
    try {
      this.replyExpansionTracker = new ReplyExpansionTracker();
      this.replyExpansionTracker.init();
    } catch (error) {
      this.replyExpansionTracker = null;
      console.error('[TFR] reply expansion tracker failed to initialize', error);
    }
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
    this.thirdPartyChatEmotes?.dispose();
    this.playerLatencyIndicator?.dispose();
    this.chatFontManager?.dispose();
    this.deletedMessageViewer?.dispose();
    this.fullReplyViewer?.dispose();
    this.replyExpansionTracker?.dispose();
  }

  applyPreferences(prefs) {
    const wantsViewerChatHistory = prefs.chatHistoryEnabled !== false;
    const wantsModeration = prefs.moderationHistoryEnabled !== false;
    const needsMessageTracker = wantsViewerChatHistory || wantsModeration;

    try {
      this.thirdPartyChatEmotes?.configure({
        sevenTvEnabled: prefs.sevenTvEmotesEnabled === true,
        betterTtvEnabled: prefs.betterTtvEmotesEnabled === true
      });
    } catch (error) {
      console.error('[TFR] emote enhancement configuration failed', error);
    }
    try {
      this.playerLatencyIndicator?.configure(prefs.playerLatencyEnabled === true);
    } catch (error) {
      console.error('[TFR] player indicator configuration failed', error);
    }
    try {
      this.chatFontManager?.configure({
        enabled: prefs.chatFontEnabled === true,
        font: prefs.chatFontFamily || 'system',
        customName: prefs.chatCustomFontName || '',
        customDataUrl: prefs.chatCustomFontDataUrl || ''
      });
    } catch (error) {
      console.error('[TFR] chat font configuration failed', error);
    }
    try {
      this.deletedMessageViewer?.configure(prefs.showDeletedMessagesEnabled === true);
    } catch (error) {
      console.error('[TFR] deleted message viewer configuration failed', error);
    }
    try {
      this.fullReplyViewer?.configure(prefs.showFullRepliesEnabled === true);
    } catch (error) {
      console.error('[TFR] full reply viewer configuration failed', error);
    }
    try {
      this.replyExpansionTracker?.configure(prefs.showFullRepliesEnabled === true);
    } catch (error) {
      console.error('[TFR] reply expansion tracker configuration failed', error);
    }

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

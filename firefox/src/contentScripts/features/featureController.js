(() => {
  const createFeatureController = ({
    CHANGE_KIND,
    ChatHistoryTracker,
    ViewerCardHistoryRenderer,
    ModerationActionTracker,
    ModerationHistoryUI
  }) => {
class FeatureController {
  constructor(store) {
    this.store = store;
    this.chatHistory = null;
    this.viewerCardHistory = null;
    this.moderationTracker = null;
    this.moderationHistoryUI = null;
    this.unsubscribe = null;
  }

  init() {
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
  }

  applyPreferences(prefs) {
    const wantsViewerChatHistory = prefs.chatHistoryEnabled !== false;
    const wantsModeration = prefs.moderationHistoryEnabled !== false;
    const needsMessageTracker = wantsViewerChatHistory || wantsModeration;

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
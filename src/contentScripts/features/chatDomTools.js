(() => {
  const queryFirst = (roots, selectors) => {
    for (const root of roots || []) {
      if (!root) continue;
      for (const selector of selectors || []) {
        try {
          const found = root.querySelector?.(selector);
          if (found) return found;
        } catch {
          // Ignore selectors temporarily unsupported by Twitch containers.
        }
      }
    }
    return null;
  };

  const findMessagesContainer = (root = document) => queryFirst([root], [
    '[data-a-target="chat-history-scrollable-area"]',
    '[data-test-selector="chat-scrollable-area__message-container"]',
    '.chat-scrollable-area__message-container',
    '[data-a-target="chat-messages"]',
    '[role="log"][aria-live="polite"]'
  ]);

  window.TFRChatDomTools = Object.freeze({ queryFirst, findMessagesContainer });
})();

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

  const DELETION_SELECTOR = '[data-a-target="deleted-message"], [data-test-selector="chat-line-message-deleted"], [data-test-selector="chat-deleted-message"], [data-a-target="chat-deleted-message-placeholder"], [data-test-selector="chat-deleted-message-placeholder"], .chat-line__message--deleted-notice';
  const REPLY_SELECTOR = '.reply-line, [data-a-target="chat-line-reply"], [data-a-target="chat-message-reply-context"], [data-test-selector="chat-message-reply-context"], .chat-line__message-reply-context, .tfr-custom-reply-context, .tfr-custom-reply-content';
  const isReplyContext = (node) => {
    for (let current = node?.nodeType === 3 ? node.parentElement : node; current; current = current.parentElement) {
      if (current.matches?.(REPLY_SELECTOR)) return true;
      if (current.matches?.('p[title]') && /^(?:replying to|reply to|r.pond|en r.ponse|r.ponse)/i.test(String(current.textContent || '').trim())) return true;
    }
    return false;
  };
  const queryMessage = (root, selector) => {
    const nodes = root?.querySelectorAll?.(selector);
    if (!nodes) return root?.querySelector?.(selector) || null;
    return Array.from(nodes).find((node) => !isReplyContext(node)) || null;
  };
  // Read-only projection: citations must not supply authors, IDs or moderation
  // evidence for the message that contains them. Never alter Twitch's live DOM.
  const ownMessage = (root) => {
    if (!root?.querySelectorAll || !root.cloneNode) return root;
    const quotes = Array.from(root.querySelectorAll(`${REPLY_SELECTOR}, p[title]`)).filter(isReplyContext);
    if (!quotes.length) return root;
    const clone = root.cloneNode(true);
    Array.from(clone.querySelectorAll(`${REPLY_SELECTOR}, p[title]`)).filter(isReplyContext).forEach(node => node.remove());
    // Twitch's accessible label can repeat the quoted message too.
    clone.removeAttribute?.('aria-label');
    clone.removeAttribute?.('title');
    return clone;
  };

  window.TFRChatDomTools = Object.freeze({ queryFirst, findMessagesContainer, isReplyContext, queryMessage, ownMessage, DELETION_SELECTOR });
})();

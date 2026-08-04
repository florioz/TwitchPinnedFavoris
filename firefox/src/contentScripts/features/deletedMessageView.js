(() => {
  'use strict';
  const RESTORED_CLASS = 'tfr-deleted-message-restored';
  const REVEALED_CLASS = 'tfr-deleted-message-revealed';

  const create = (documentRef = document) => {
    const findRestored = (message) => message?.querySelector?.(`.${RESTORED_CLASS}`) || null;
    const clear = (message) => {
      const restored = findRestored(message);
      if (restored) restored.remove();
      if (message?.classList?.contains?.(REVEALED_CLASS)) {
        message.classList.remove(REVEALED_CLASS);
      }
    };
    const reveal = ({ message, body, text, label = '' }) => {
      if (!message || !body || !text || findRestored(message)) return false;
      const restored = documentRef.createElement('span');
      restored.className = RESTORED_CLASS;
      restored.textContent = text;
      if (label) restored.setAttribute('aria-label', label);
      body.appendChild(restored);
      message.classList.add(REVEALED_CLASS);
      return true;
    };
    const clearAll = (root = documentRef) => {
      root.querySelectorAll(`.${RESTORED_CLASS}`).forEach((node) => node.remove());
      root.querySelectorAll(`.${REVEALED_CLASS}`).forEach((node) => node.classList.remove(REVEALED_CLASS));
    };
    return Object.freeze({ clear, clearAll, findRestored, reveal, RESTORED_CLASS, REVEALED_CLASS });
  };

  window.TFRDeletedMessageView = Object.freeze({ create, RESTORED_CLASS, REVEALED_CLASS });
})();

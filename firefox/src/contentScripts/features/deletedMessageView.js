(() => {
  'use strict';
  const RESTORED_CLASS = 'tfr-deleted-message-restored';
  const REVEALED_CLASS = 'tfr-deleted-message-revealed';
  const NATIVE_MARKER_CLASS = 'tfr-deleted-message-native-marker';
  const NATIVE_MARKER_SELECTOR = [
    '[data-a-target="deleted-message"]',
    '[data-test-selector="chat-line-message-deleted"]',
    '[data-test-selector="chat-deleted-message"]'
  ].join(', ');

  const create = (documentRef = document) => {
    const findRestored = (message) => message?.querySelector?.(`.${RESTORED_CLASS}`) || null;
    const clear = (message) => {
      const restored = findRestored(message);
      if (restored) restored.remove();
      message?.querySelectorAll?.(`.${NATIVE_MARKER_CLASS}`)
        .forEach((marker) => marker.classList.remove(NATIVE_MARKER_CLASS));
      message?.querySelectorAll?.('[data-tfr-deleted-label]')
        .forEach((node) => node.removeAttribute('data-tfr-deleted-label'));
      if (message?.classList?.contains?.(REVEALED_CLASS)) {
        message.classList.remove(REVEALED_CLASS);
      }
      if (message?.dataset) delete message.dataset.tfrDeletedLabel;
    };
    const reveal = ({ message, body, text, nodes = [], label = '' }) => {
      if (!message || !body || (!text && !nodes.length) || findRestored(message)) return false;
      const restored = documentRef.createElement('span');
      restored.className = RESTORED_CLASS;
      if (nodes.length) {
        nodes.forEach((node) => restored.appendChild(node.cloneNode(true)));
      } else {
        restored.textContent = text;
      }
      if (label) restored.setAttribute('aria-label', label);
      message.querySelectorAll?.(NATIVE_MARKER_SELECTOR)
        .forEach((marker) => marker.classList.add(NATIVE_MARKER_CLASS));
      body.appendChild(restored);
      message.classList.add(REVEALED_CLASS);
      return true;
    };
    const clearAll = (root = documentRef) => {
      root.querySelectorAll(`.${RESTORED_CLASS}`).forEach((node) => node.remove());
      root.querySelectorAll(`.${NATIVE_MARKER_CLASS}`)
        .forEach((marker) => marker.classList.remove(NATIVE_MARKER_CLASS));
      root.querySelectorAll('[data-tfr-deleted-label]')
        .forEach((node) => node.removeAttribute('data-tfr-deleted-label'));
      root.querySelectorAll(`.${REVEALED_CLASS}`).forEach((node) => node.classList.remove(REVEALED_CLASS));
    };
    return Object.freeze({
      clear,
      clearAll,
      findRestored,
      reveal,
      RESTORED_CLASS,
      REVEALED_CLASS,
      NATIVE_MARKER_CLASS
    });
  };

  window.TFRDeletedMessageView = Object.freeze({
    create,
    RESTORED_CLASS,
    REVEALED_CLASS,
    NATIVE_MARKER_CLASS
  });
})();

(() => {
  'use strict';
  const chatDom = window.TFRChatDomTools;
  const RESTORE_EVENT = 'tfr:deleted-message:restore-native';
  const SYNC_STATE_EVENT = 'tfr:deleted-message:sync-state';
  const RESTORED_CLASS = 'tfr-deleted-message-react-restored';
  const ENABLED_CLASS = 'tfr-show-deleted-messages';
  const PATCHED_RENDERER = Symbol('tfrDeletedMessageRenderer');
  const pendingRestores = new WeakSet();
  const MESSAGE_BODY_SELECTOR = [
    '[data-a-target="chat-message-text"]',
    '[data-a-target="chat-line-message-body"]',
    '[data-test-selector="chat-line-message-body"]'
  ].join(', ');

  const getFallbackLabel = () => String(document.documentElement.lang || '').toLowerCase().startsWith('fr')
    ? 'Supprimé'
    : 'Deleted';

  const renderAsVisible = (renderer, render, args) => {
    const props = renderer.props;
    const message = props?.message;
    const previous = {
      isDeleted: props?.isDeleted,
      messageDeleted: message?.deleted,
      messageIsDeleted: message?.isDeleted
    };
    if (props) props.isDeleted = false;
    if (message && 'deleted' in message) message.deleted = false;
    if (message && 'isDeleted' in message) message.isDeleted = false;
    try {
      return render.apply(renderer, args);
    } finally {
      if (props) props.isDeleted = previous.isDeleted;
      if (message && 'deleted' in message) message.deleted = previous.messageDeleted;
      if (message && 'isDeleted' in message) message.isDeleted = previous.messageIsDeleted;
    }
  };


  const getReactInstance = (element) => {
    if (!element) return null;
    for (const key in element) {
      if (key.startsWith('__reactInternalInstance$') || key.startsWith('__reactFiber$')) {
        return element[key];
      }
    }
    return null;
  };

  const findParent = (fiber, predicate, maxDepth = 12) => {
    let current = fiber;
    for (let depth = 0; current && depth <= maxDepth; depth += 1, current = current.return) {
      try {
        if (predicate(current)) return current;
      } catch {}
    }
    return null;
  };

  const getMessageRenderer = (element) => findParent(
    getReactInstance(element),
    (candidate) => typeof candidate?.stateNode?.renderMessageBody === 'function'
  )?.stateNode || null;

  const patchRenderer = (renderer) => {
    if (renderer[PATCHED_RENDERER]) return true;
    const method = typeof renderer.render === 'function' ? 'render' : 'renderMessageBody';
    const original = renderer[method];
    if (typeof original !== 'function') return false;
    renderer[method] = function tfrRenderDeletedMessage(...args) {
      if (!document.documentElement.classList.contains(ENABLED_CLASS)) {
        return original.apply(this, args);
      }
      return renderAsVisible(this, original, args);
    };
    renderer[PATCHED_RENDERER] = { method, original };
    return true;
  };

  const unpatchRenderer = (renderer) => {
    const patch = renderer?.[PATCHED_RENDERER];
    if (!patch) return false;
    renderer[patch.method] = patch.original;
    delete renderer[PATCHED_RENDERER];
    return true;
  };

  const decorateRestoredMessage = (element) => {
    element.classList.add(RESTORED_CLASS);
    const body = chatDom.queryMessage(element, MESSAGE_BODY_SELECTOR);
    if (body) body.dataset.tfrDeletedLabel = element.dataset.tfrDeletedLabel || getFallbackLabel();
    element.querySelector('.tfr-deleted-message-restored')?.remove();
    element.classList.remove('tfr-deleted-message-revealed');
  };

  const restoreMessage = (element) => {
    if (chatDom.isReplyContext(element)) return false;
    if (pendingRestores.has(element)) return true;
    const renderer = getMessageRenderer(element);
    if (!renderer?.props || typeof renderer.forceUpdate !== 'function') return false;
    const own = renderer.props.message;
    if (!(renderer.props.isDeleted === true || own?.deleted === true || own?.isDeleted === true)) return false;
    try {
      if (!patchRenderer(renderer)) return false;
      pendingRestores.add(element);
      renderer.forceUpdate(() => {
        pendingRestores.delete(element);
        decorateRestoredMessage(element);
      });
      return true;
    } catch {
      pendingRestores.delete(element);
      return false;
    }
  };

  document.addEventListener(RESTORE_EVENT, (event) => {
    const message = event.target;
    if (!(message instanceof Element)) return;
    if (!restoreMessage(message)) delete message.dataset.tfrDeletedRestoreRequested;
  }, true);

  // DOM mutation/text is never evidence of moderation. Only the isolated
  // event consumer requests restoration after matching a Twitch message ID.
  const restoreDeletedNode = () => {};
  const start = () => {};
  let observer = null;
  const stop = () => {
    observer?.disconnect();
    observer = null;
    document.querySelectorAll(`.${RESTORED_CLASS}`).forEach((element) => {
      const renderer = findParent(
        getReactInstance(element),
        (candidate) => Boolean(candidate?.stateNode?.[PATCHED_RENDERER])
      )?.stateNode;
      if (!unpatchRenderer(renderer)) return;
      chatDom.queryMessage(element, MESSAGE_BODY_SELECTOR)?.removeAttribute('data-tfr-deleted-label');
      renderer.forceUpdate?.();
    });
  };
  const syncState = () => document.documentElement.classList.contains(ENABLED_CLASS)
    ? start()
    : stop();
  document.addEventListener(SYNC_STATE_EVENT, syncState, true);
  syncState();

  globalThis.TFRDeletedMessageBridge = Object.freeze({
    getReactInstance,
    findParent,
    getMessageRenderer,
    patchRenderer,
    unpatchRenderer,
    decorateRestoredMessage,
    restoreMessage,
    renderAsVisible,
    restoreDeletedNode,
    start,
    stop,
    syncState
  });
})();

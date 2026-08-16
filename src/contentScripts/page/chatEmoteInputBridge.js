(() => {
  'use strict';
  const SYNC_EVENT = 'tfr:chat-emotes:sync';
  const REPLACE_EVENT = 'tfr:chat-emotes:replace';
  const SET_ID = 'TFR_THIRD_PARTY_EMOTES';
  const ID_PREFIX = '__TFR_EMOTE__';
  const INPUT_SELECTOR = '.chat-wysiwyg-input__editor[contenteditable="true"], [data-a-target="chat-input"] [contenteditable="true"], [contenteditable="true"][data-a-target="chat-input"]';

  const getFiber = (element) => {
    for (const key in element || {}) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) return element[key];
    }
    return null;
  };

  const findParent = (fiber, predicate, maxDepth = 50) => {
    let current = fiber;
    for (let depth = 0; current && depth < maxDepth; depth += 1, current = current.return) {
      try { if (predicate(current)) return current; } catch {}
    }
    return null;
  };

  const getNodeAtPath = (root, path) => {
    let node = { children: root };
    for (const index of path || []) {
      if (!Array.isArray(node?.children) || !Number.isInteger(index)) return null;
      node = node.children[index];
    }
    return node || null;
  };

  const applySlateReplacement = (slate, focus, detail) => {
    if (!slate || !focus || !Number.isInteger(detail?.start) || !Number.isInteger(detail?.end)) return false;
    const path = focus.path;
    const node = getNodeAtPath(slate.children, path);
    const currentText = typeof node?.text === 'string' ? node.text : '';
    if (detail.start < 0 || detail.start > detail.end || detail.end > currentText.length) return false;
    const replacement = String(detail.replacement || '');
    slate.apply({
      type: 'remove_text',
      path,
      offset: detail.start,
      text: currentText.slice(detail.start, detail.end)
    });
    slate.apply({ type: 'insert_text', path, offset: detail.start, text: replacement });
    const point = { path, offset: detail.start + replacement.length };
    slate.apply({ type: 'set_selection', newProperties: { anchor: point, focus: point } });
    return true;
  };

  const getContext = (element) => {
    const fiber = getFiber(element);
    const editorFiber = findParent(
      fiber,
      (candidate) => candidate?.memoizedProps?.value?.editor || candidate?.stateNode?.state?.slateEditor,
      30
    );
    const providerFiber = findParent(fiber, (candidate) => Array.isArray(candidate?.stateNode?.providers));
    const mapFiber = findParent(fiber, (candidate) => Array.isArray(candidate?.pendingProps?.emotes), 30);
    let hook = mapFiber?.memoizedState || null;
    let fallbackHook = null;
    for (let index = 0; hook && index < 20; index += 1, hook = hook.next) {
      const value = hook.memoizedState;
      if (!hook?.queue?.dispatch || !value || Array.isArray(value) || typeof value !== 'object') continue;
      fallbackHook ||= hook;
      const entries = Object.values(value);
      if (entries.some((entry) => entry?.token && entry?.id)) {
        fallbackHook = hook;
        break;
      }
    }
    return {
      editor: editorFiber?.memoizedProps?.value?.editor || editorFiber?.stateNode?.state?.slateEditor || null,
      provider: providerFiber?.stateNode?.providers?.find((entry) => entry?.autocompleteType === 'emote') || null,
      emoteMapHook: fallbackHook
    };
  };

  const catalogById = new Map();
  const catalogByName = new Map();
  const normalizeEmote = (entry) => {
    const name = String(entry?.name || '').trim();
    const url = String(entry?.url || '').trim();
    if (!name || !url) return null;
    return { name, url, provider: String(entry?.provider || '') };
  };
  const replaceCatalog = (entries) => {
    catalogByName.clear();
    if (!Array.isArray(entries)) return;
    entries.forEach((entry) => {
      const emote = normalizeEmote(entry);
      if (emote) catalogByName.set(emote.name, emote);
    });
  };
  const upsertCatalogEmote = (entry) => {
    const emote = normalizeEmote(entry);
    if (!emote) return false;
    catalogByName.set(emote.name, emote);
    return true;
  };
  const serializeId = (emote) => `${ID_PREFIX}${btoa(encodeURIComponent(`${emote.provider}|${emote.name}`))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')}`;
  const makeSet = () => ({
    id: SET_ID,
    emotes: [...catalogByName.values()].map((emote) => {
      const id = serializeId(emote);
      catalogById.set(id, emote);
      return {
        __typename: 'Emote',
        id,
        modifiers: null,
        setID: SET_ID,
        token: emote.name,
        type: 'SUBSCRIPTIONS',
        assetType: 'STATIC'
      };
    })
  });

  const installSet = (context) => {
    const sets = context?.provider?.props?.emotes;
    if (!Array.isArray(sets)) return false;
    catalogById.clear();
    const emoteSet = makeSet();
    const index = sets.findIndex((set) => set?.id === SET_ID);
    if (index < 0) sets.push(emoteSet);
    else sets[index] = emoteSet;
    const hook = context.emoteMapHook;
    if (hook?.queue?.dispatch && hook.memoizedState) {
      const nextMap = { ...hook.memoizedState };
      emoteSet.emotes.forEach((emote) => { nextMap[emote.token] = emote; });
      hook.queue.dispatch(nextMap);
    }
    context.provider.forceUpdate?.();
    return true;
  };

  const patchImage = (image) => {
    if (!(image instanceof HTMLImageElement)) return;
    const source = `${image.currentSrc || ''} ${image.src || ''} ${image.srcset || ''}`;
    const marker = source.indexOf(ID_PREFIX);
    if (marker < 0) return;
    const encodedId = source.slice(marker).match(/^__TFR_EMOTE__[A-Za-z0-9_-]+/)?.[0];
    const emote = catalogById.get(encodedId);
    if (!emote?.url) return;
    image.src = emote.url;
    image.srcset = `${emote.url} 1x, ${emote.url} 2x`;
    image.alt = emote.name;
    image.dataset.tfrInputEmote = emote.provider || 'third-party';
  };

  const imageObserver = new MutationObserver((mutations) => mutations.forEach((mutation) => {
    if (mutation.type === 'attributes') {
      patchImage(mutation.target);
      return;
    }
    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches('img')) patchImage(node);
      node.querySelectorAll('img').forEach(patchImage);
    });
  }));
  let observingImages = false;
  const syncImageObserver = () => {
    const shouldObserve = catalogByName.size > 0;
    if (shouldObserve === observingImages) return;
    observingImages = shouldObserve;
    if (!shouldObserve) {
      imageObserver.disconnect();
      return;
    }
    imageObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'srcset']
    });
  };

  document.addEventListener(SYNC_EVENT, () => {
    try {
      const payload = JSON.parse(document.documentElement.dataset.tfrChatEmoteCatalog || '[]');
      replaceCatalog(payload);
    } catch {
      replaceCatalog([]);
    }
    syncImageObserver();
    const input = document.querySelector(INPUT_SELECTOR);
    if (input) installSet(getContext(input));
  });

  document.addEventListener(REPLACE_EVENT, (event) => {
    const input = event.target;
    if (!(input instanceof Element)) return;
    const context = getContext(input);
    const slate = context.editor;
    const focus = slate?.selection?.focus;
    let detail = {};
    try { detail = JSON.parse(input.getAttribute('data-tfr-emote-replace-request') || '{}'); } catch {}
    if (!slate || !focus) return;
    try {
      upsertCatalogEmote(detail.emote);
      syncImageObserver();
      installSet(context);
      if (!applySlateReplacement(slate, focus, detail)) return;
      input.dataset.tfrEmoteReplaceResult = String(detail.requestId || 'ok');
      input.removeAttribute('data-tfr-emote-replace-request');
      queueMicrotask(() => input.querySelectorAll('img').forEach(patchImage));
    } catch {}
  }, true);

  const diagnose = () => {
    const input = document.querySelector(INPUT_SELECTOR);
    const context = input ? getContext(input) : {};
    const sets = context.provider?.props?.emotes || [];
    const customSet = sets.find((set) => set?.id === SET_ID);
    const map = context.emoteMapHook?.memoizedState;
    return {
      inputFound: Boolean(input),
      inputClass: input?.className || '',
      inputHTML: input?.innerHTML || '',
      editorFound: Boolean(context.editor),
      providerFound: Boolean(context.provider),
      mapHookFound: Boolean(context.emoteMapHook),
      customSetSize: customSet?.emotes?.length || 0,
      mappedTokens: map && typeof map === 'object'
        ? Object.keys(map).filter((key) => catalogByName.has(key)).slice(0, 20)
        : [],
      images: [...(input?.querySelectorAll('img') || [])].map((image) => ({
        alt: image.alt,
        src: image.src,
        srcset: image.srcset,
        provider: image.dataset.tfrInputEmote || ''
      })),
      slateChildren: context.editor?.children || null,
      slateSelection: context.editor?.selection || null
    };
  };

  globalThis.TFRChatEmoteInputBridge = Object.freeze({
    getFiber,
    findParent,
    getNodeAtPath,
    applySlateReplacement,
    getContext,
    installSet,
    patchImage,
    serializeId,
    normalizeEmote,
    replaceCatalog,
    upsertCatalogEmote,
    diagnose
  });
})();

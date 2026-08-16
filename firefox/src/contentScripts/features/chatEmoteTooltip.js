(() => {
  'use strict';
  const TOOLTIP_ID = 'tfr-chat-emote-tooltip';
  const EMOTE_SELECTOR = '.tfr-chat-emote[data-tfr-emote-name]';
  const DEFAULT_DELAY_MS = 70;
  const VIEWPORT_MARGIN = 8;

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  const calculatePosition = (anchor, tooltip, viewport) => {
    const maximumLeft = Math.max(VIEWPORT_MARGIN, viewport.width - tooltip.width - VIEWPORT_MARGIN);
    const left = clamp(
      anchor.left + ((anchor.width - tooltip.width) / 2),
      VIEWPORT_MARGIN,
      maximumLeft
    );
    const above = anchor.top - tooltip.height - VIEWPORT_MARGIN;
    const top = above >= VIEWPORT_MARGIN
      ? above
      : Math.min(viewport.height - tooltip.height - VIEWPORT_MARGIN, anchor.bottom + VIEWPORT_MARGIN);
    return { left: Math.round(left), top: Math.round(Math.max(VIEWPORT_MARGIN, top)) };
  };

  const createTooltipElement = (documentRef) => {
    const root = documentRef.createElement('div');
    root.id = TOOLTIP_ID;
    root.className = 'tfr-chat-emote-tooltip';
    root.setAttribute('role', 'tooltip');
    root.hidden = true;

    const name = documentRef.createElement('strong');
    name.className = 'tfr-chat-emote-tooltip__name';
    const source = documentRef.createElement('span');
    source.className = 'tfr-chat-emote-tooltip__source';
    const marker = documentRef.createElement('i');
    marker.setAttribute('aria-hidden', 'true');
    const provider = documentRef.createElement('span');
    source.append(marker, provider);
    root.append(name, source);
    return { root, name, provider };
  };

  const create = (documentRef = document, windowRef = window, delayMs = DEFAULT_DELAY_MS) => {
    let container = null;
    let view = null;
    let pendingTarget = null;
    let activeTarget = null;
    let showTimer = null;

    const ensureTooltip = () => {
      if (view?.root?.isConnected) return view;
      view = createTooltipElement(documentRef);
      documentRef.body.appendChild(view.root);
      return view;
    };

    const cancelPending = () => {
      windowRef.clearTimeout(showTimer);
      showTimer = null;
      pendingTarget = null;
    };

    const hide = () => {
      cancelPending();
      if (activeTarget) activeTarget.removeAttribute('aria-describedby');
      activeTarget = null;
      if (view) view.root.hidden = true;
    };

    const show = (target) => {
      showTimer = null;
      pendingTarget = null;
      if (!target?.isConnected) return;
      const name = String(target.dataset.tfrEmoteName || '').trim();
      const provider = String(target.dataset.tfrEmoteProvider || '').trim();
      if (!name || !provider) return;
      const tooltip = ensureTooltip();
      tooltip.name.textContent = name;
      tooltip.provider.textContent = provider;
      tooltip.root.dataset.provider = provider;
      tooltip.root.hidden = false;
      activeTarget = target;
      target.setAttribute('aria-describedby', TOOLTIP_ID);
      const anchorRect = target.getBoundingClientRect();
      const tooltipRect = tooltip.root.getBoundingClientRect();
      const position = calculatePosition(anchorRect, tooltipRect, {
        width: windowRef.innerWidth,
        height: windowRef.innerHeight
      });
      tooltip.root.style.left = `${position.left}px`;
      tooltip.root.style.top = `${position.top}px`;
    };

    const schedule = (target) => {
      if (target === activeTarget || target === pendingTarget) return;
      hide();
      pendingTarget = target;
      showTimer = windowRef.setTimeout(() => show(target), delayMs);
    };

    const findEmote = (target) => target?.closest?.(EMOTE_SELECTOR) || null;
    const handlePointerOver = (event) => {
      const target = findEmote(event.target);
      if (target) schedule(target);
    };
    const handlePointerOut = (event) => {
      const target = findEmote(event.target);
      if (!target || target.contains?.(event.relatedTarget)) return;
      hide();
    };

    const unbind = () => {
      container?.removeEventListener('pointerover', handlePointerOver);
      container?.removeEventListener('pointerout', handlePointerOut);
      container?.removeEventListener('scroll', hide);
      windowRef.removeEventListener?.('resize', hide);
      container = null;
      hide();
    };

    const bind = (nextContainer) => {
      if (container === nextContainer) return;
      unbind();
      container = nextContainer;
      container?.addEventListener('pointerover', handlePointerOver);
      container?.addEventListener('pointerout', handlePointerOut);
      container?.addEventListener('scroll', hide, { passive: true });
      if (container) windowRef.addEventListener?.('resize', hide, { passive: true });
    };

    const dispose = () => {
      unbind();
      view?.root?.remove();
      view = null;
    };

    return Object.freeze({ bind, hide, show, dispose });
  };

  window.TFRChatEmoteTooltip = Object.freeze({
    create,
    createTooltipElement,
    calculatePosition,
    DEFAULT_DELAY_MS
  });
})();

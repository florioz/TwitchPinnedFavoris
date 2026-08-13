(function (root, factory) {
  const api = factory();
  root.__TFR_PANEL_VIEW__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const createPanelView = ({
    documentRef,
    ResizeObserverConstructor = globalThis.ResizeObserver,
    standalone = false,
    t = (key) => key,
    onRefresh,
    onClose,
    onToggleCategory,
    onOpenChannel
  }) => {
    let elements = null;
    let resizeObserver = null;
    let resizeFrame = null;
    let pendingWidth = null;
    let refreshResetTimer = null;

    const applyResponsiveLayout = (rootElement, width) => {
      const safeWidth = Number(width) || rootElement?.getBoundingClientRect?.().width || 0;
      const layout = safeWidth > 560
        ? 'wide'
        : safeWidth > 320
          ? 'regular'
          : safeWidth > 250
            ? 'compact'
            : 'dense';
      if (rootElement.dataset.layout !== layout) rootElement.dataset.layout = layout;
      return layout;
    };

    const scheduleResponsiveLayout = (rootElement, width) => {
      pendingWidth = width;
      if (resizeFrame != null) return;
      const scheduleFrame = globalThis.requestAnimationFrame;
      if (typeof scheduleFrame !== 'function') {
        const nextWidth = pendingWidth;
        pendingWidth = null;
        applyResponsiveLayout(rootElement, nextWidth);
        return;
      }
      resizeFrame = scheduleFrame(() => {
        resizeFrame = null;
        const nextWidth = pendingWidth;
        pendingWidth = null;
        applyResponsiveLayout(rootElement, nextWidth);
      });
    };

    const observeLayout = (rootElement) => {
      applyResponsiveLayout(rootElement);
      if (typeof ResizeObserverConstructor !== 'function') return;
      resizeObserver = new ResizeObserverConstructor((entries = []) => {
        const entry = entries.find((candidate) => candidate.target === rootElement) || entries[0];
        const width = entry?.contentRect?.width
          ?? entry?.borderBoxSize?.[0]?.inlineSize
          ?? rootElement.getBoundingClientRect?.().width;
        scheduleResponsiveLayout(rootElement, width);
      });
      resizeObserver.observe(rootElement);
    };

    const handleClick = (event) => {
      const actionTarget = event.target?.closest?.('[data-action]');
      const action = actionTarget?.dataset?.action;
      if (action === 'refresh') {
        onRefresh();
        return;
      }
      if (action === 'close') {
        onClose();
        return;
      }
      if (action === 'toggleCategory') {
        onToggleCategory(actionTarget?.dataset?.categoryId);
        return;
      }
      if (event.target?.matches?.('.tfr-panel__card, .tfr-panel__card *')) {
        const card = event.target.closest('.tfr-panel__card');
        if (card?.dataset?.login) {
          onOpenChannel(card.dataset.login);
        }
      }
    };

    const setRefreshState = (state = 'idle') => {
      const button = elements?.refresh;
      if (!button) return;
      if (refreshResetTimer) clearTimeout(refreshResetTimer);
      refreshResetTimer = null;
      const labels = {
        idle: t('panel.refresh'),
        loading: t('panel.refreshing'),
        success: t('panel.refreshed'),
        error: t('panel.refreshFailed')
      };
      button.disabled = state === 'loading';
      button.classList.toggle('is-loading', state === 'loading');
      button.classList.toggle('is-success', state === 'success');
      button.classList.toggle('is-error', state === 'error');
      button.setAttribute('aria-busy', String(state === 'loading'));
      button.textContent = labels[state] || labels.idle;
      if (state === 'success' || state === 'error') {
        refreshResetTimer = setTimeout(() => setRefreshState('idle'), 1800);
      }
    };

    const ensure = (host) => {
      if (elements) return elements;
      const rootElement = documentRef.createElement('div');
      rootElement.className = 'tfr-panel';
      rootElement.classList.add(standalone ? 'tfr-panel--standalone' : 'tfr-panel--overlay');
      rootElement.innerHTML = `
        <div class="tfr-panel__header">
          <div>
            <p class="tfr-panel__eyebrow">${t('panel.eyebrow')}</p>
            <h2 class="tfr-panel__title">${t('panel.title')}</h2>
            <p class="tfr-panel__subtitle">${t('panel.loading')}</p>
          </div>
          <div class="tfr-panel__actions">
            <button class="tfr-panel__button" data-action="refresh">${t('panel.refresh')}</button>
            <button class="tfr-panel__button tfr-panel__close" data-action="close" type="button" aria-label="${t('panel.close')}" title="${t('panel.close')}">&times;</button>
          </div>
        </div>
        <div class="tfr-panel__empty">${t('panel.empty.saved')}</div>
        <div class="tfr-panel__sections"></div>
        <div class="tfr-panel__footer">
          <a href="https://www.twitch.tv/directory/following/live" target="_blank" rel="noreferrer">${t('panel.openTwitch')}</a>
          <span class="tfr-panel__timestamp"></span>
        </div>
      `;
      host.appendChild(rootElement);
      rootElement.addEventListener('click', handleClick);
      observeLayout(rootElement);
      elements = {
        root: rootElement,
        sections: rootElement.querySelector('.tfr-panel__sections'),
        subtitle: rootElement.querySelector('.tfr-panel__subtitle'),
        empty: rootElement.querySelector('.tfr-panel__empty'),
        timestamp: rootElement.querySelector('.tfr-panel__timestamp'),
        refresh: rootElement.querySelector('[data-action="refresh"]')
      };
      return elements;
    };

    return {
      applyResponsiveLayout,
      ensure,
      getElements: () => elements,
      setRefreshState,
      disconnect: () => {
        resizeObserver?.disconnect();
        resizeObserver = null;
        if (resizeFrame != null) globalThis.cancelAnimationFrame?.(resizeFrame);
        resizeFrame = null;
        pendingWidth = null;
        if (refreshResetTimer) clearTimeout(refreshResetTimer);
        refreshResetTimer = null;
      }
    };
  };

  return { createPanelView };
});

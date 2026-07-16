(function (root, factory) {
  const api = factory();
  root.__TFR_PANEL_VIEW__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const createPanelView = ({
    documentRef,
    standalone = false,
    onRefresh,
    onClose,
    onToggleCategory,
    onOpenChannel
  }) => {
    let elements = null;

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

    const ensure = (host) => {
      if (elements) return elements;
      const rootElement = documentRef.createElement('div');
      rootElement.className = 'tfr-panel';
      rootElement.classList.add(standalone ? 'tfr-panel--standalone' : 'tfr-panel--overlay');
      rootElement.innerHTML = `
        <div class="tfr-panel__header">
          <div>
            <p class="tfr-panel__eyebrow">Twitch Favoris</p>
            <h2 class="tfr-panel__title">Favoris en live</h2>
            <p class="tfr-panel__subtitle">Chargement...</p>
          </div>
          <div class="tfr-panel__actions">
            <button class="tfr-panel__button" data-action="refresh">Actualiser</button>
            <button class="tfr-panel__button tfr-panel__close" data-action="close" type="button" aria-label="Fermer le panneau" title="Fermer">&times;</button>
          </div>
        </div>
        <div class="tfr-panel__empty">Aucun favori enregistré.</div>
        <div class="tfr-panel__sections"></div>
        <div class="tfr-panel__footer">
          <a href="https://www.twitch.tv/directory/following/live" target="_blank" rel="noreferrer">Ouvrir Twitch</a>
          <span class="tfr-panel__timestamp"></span>
        </div>
      `;
      host.appendChild(rootElement);
      rootElement.addEventListener('click', handleClick);
      elements = {
        root: rootElement,
        sections: rootElement.querySelector('.tfr-panel__sections'),
        subtitle: rootElement.querySelector('.tfr-panel__subtitle'),
        empty: rootElement.querySelector('.tfr-panel__empty'),
        timestamp: rootElement.querySelector('.tfr-panel__timestamp')
      };
      return elements;
    };

    return {
      ensure,
      getElements: () => elements
    };
  };

  return { createPanelView };
});

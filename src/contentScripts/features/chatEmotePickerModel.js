(() => {
  'use strict';

  const VIEWPORT_MARGIN = 8;

  const normalizeCatalog = (emotes) => {
    const values = typeof emotes?.values === 'function' ? emotes.values() : emotes || [];
    return Array.from(values)
      .filter((emote) => emote?.name && emote?.url)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  };

  const filterCatalog = (catalog, query = '', provider = 'all', limit = Infinity) => {
    const needle = String(query || '').trim().toLocaleLowerCase();
    return catalog.filter((emote) => {
      const matchesProvider = provider === 'all' || emote.provider === provider;
      return matchesProvider && (!needle || emote.name.toLocaleLowerCase().includes(needle));
    }).slice(0, limit);
  };

  const clamp = (value, minimum, maximum) => Math.min(Math.max(minimum, value), Math.max(minimum, maximum));

  const clampPanelPosition = (position, panelSize, viewport, margin = VIEWPORT_MARGIN) => ({
    left: clamp(position.left, margin, viewport.width - panelSize.width - margin),
    top: clamp(position.top, margin, viewport.height - panelSize.height - margin)
  });

  const getAnchoredPanelPosition = (anchor, panelSize, viewport, margin = VIEWPORT_MARGIN) => {
    const above = anchor.top - panelSize.height - margin;
    return clampPanelPosition({
      left: anchor.right - panelSize.width,
      top: above >= margin ? above : anchor.bottom + margin
    }, panelSize, viewport, margin);
  };

  window.TFRChatEmotePickerModel = Object.freeze({
    normalizeCatalog,
    filterCatalog,
    clampPanelPosition,
    getAnchoredPanelPosition
  });
})();

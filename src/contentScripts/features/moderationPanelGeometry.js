(() => {
  const clamp = (position, panelSize, viewport, margin = 8) => ({
    left: Math.min(
      Math.max(margin, Number(position?.left) || 0),
      Math.max(margin, viewport.width - panelSize.width - margin)
    ),
    top: Math.min(
      Math.max(margin, Number(position?.top) || 0),
      Math.max(margin, viewport.height - panelSize.height - margin)
    )
  });

  const anchored = (buttonRect, panelSize, viewport, margin = 12, gap = 8) => {
    let top = buttonRect.top - panelSize.height - gap;
    if (top < margin) top = buttonRect.bottom + gap;
    let left = buttonRect.right - panelSize.width;
    left = Math.max(margin, Math.min(left, viewport.width - panelSize.width - margin));
    return { left, top };
  };

  const dragged = (dragState, pointer) => ({
    left: dragState.left + pointer.x - dragState.startX,
    top: dragState.top + pointer.y - dragState.startY
  });

  const maxHeight = (viewportHeight) => Math.max(
    220,
    Math.min(620, Math.floor(viewportHeight * 0.82), viewportHeight - 24)
  );

  window.TFRModerationPanelGeometry = { clamp, anchored, dragged, maxHeight };
})();

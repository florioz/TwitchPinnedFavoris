(() => {
  const RELEASE_HEIGHT_DELTA = 120;

  const clearGroupLevels = (container) => {
    container?.querySelectorAll('.tfr-category-block[data-compact-level]').forEach((block) => {
      block.removeAttribute('data-compact-level');
    });
  };

  const collectCandidates = (container) => Array.from(
    container.querySelectorAll('.tfr-category-block')
  )
    .filter((block) => !block.classList.contains('is-collapsed'))
    .map((block, index) => ({
      block,
      index,
      entries: Number(block.dataset.totalEntries || '0'),
      singleton: block.dataset.singleton === 'true',
      height: block.scrollHeight
    }))
    .filter((item) => item.entries > 0 && item.height > 0)
    .sort((a, b) => (b.height - a.height) || (b.entries - a.entries) || (a.index - b.index));

  const applyContainerState = (container, active, level) => {
    container.classList.toggle('is-auto-compact', active);
    container.dataset.autoCompact = active ? 'active' : 'idle';
    container.dataset.autoCompactLevel = String(level);
  };

  const createIdleResult = () => ({
    active: false,
    level: 0,
    activationHeight: 0,
    levels: new Map()
  });

  const measure = ({ container, parent, windowHeight, viewportHeight, activationHeight = 0 }) => {
    const preserveTop = Number(container?.scrollTop || 0) <= 4;
    const restoreTop = () => {
      if (preserveTop && container.scrollTop !== 0) container.scrollTop = 0;
    };
    const normalizedWindowHeight = Math.max(1, Number(windowHeight) || 1);
    const measuredHeights = [parent?.clientHeight || 0, viewportHeight]
      .filter((height) => Number.isFinite(height) && height > 0);
    const visibleHeight = Math.max(1, Math.min(...measuredHeights));

    container.dataset.autoCompact = 'measuring';
    clearGroupLevels(container);

    let nextActivationHeight = activationHeight;
    if (
      nextActivationHeight > 0
      && normalizedWindowHeight >= nextActivationHeight + RELEASE_HEIGHT_DELTA
    ) {
      nextActivationHeight = 0;
      applyContainerState(container, false, 0);
    }

    const isOverflowing = (ratio = 1) => container.scrollHeight > visibleHeight * ratio;
    if (!isOverflowing(1.08)) {
      applyContainerState(container, false, 0);
      restoreTop();
      return createIdleResult();
    }

    const candidates = collectCandidates(container);
    for (const item of candidates.filter((candidate) => candidate.singleton)) {
      item.block.dataset.compactLevel = '3';
      if (!isOverflowing(1.02)) break;
    }
    for (const item of candidates.filter((candidate) => !candidate.singleton)) {
      item.block.dataset.compactLevel = '1';
      if (!isOverflowing(1.02)) break;
    }
    if (isOverflowing(1.02)) {
      for (const item of candidates.filter((candidate) => !candidate.singleton)) {
        item.block.dataset.compactLevel = '2';
        if (!isOverflowing()) break;
      }
    }

    const level = candidates.reduce(
      (highest, item) => Math.max(highest, Number(item.block.dataset.compactLevel || '0')),
      0
    );
    const active = level > 0;
    if (active && !nextActivationHeight) nextActivationHeight = normalizedWindowHeight;
    applyContainerState(container, active, level);
    restoreTop();

    return {
      active,
      level,
      activationHeight: nextActivationHeight,
      levels: new Map(
        Array.from(container.querySelectorAll('.tfr-category-block[data-group-id]')).map((block) => [
          block.dataset.groupId,
          block.dataset.compactLevel || '0'
        ])
      )
    };
  };

  window.TFRAutoCompactEngine = {
    clear(container) {
      clearGroupLevels(container);
      container?.classList.remove('is-auto-compact');
      container?.removeAttribute('data-auto-compact');
      container?.removeAttribute('data-auto-compact-level');
      return createIdleResult();
    },
    measure
  };
})();

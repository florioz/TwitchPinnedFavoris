(() => {
  const readJson = (dataTransfer) => {
    const raw = dataTransfer?.getData?.('application/json');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const normalizeLogins = (values) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim().toLowerCase())
  ));

  const parseLogins = (dataTransfer, fallback = []) => {
    const payload = readJson(dataTransfer);
    const jsonLogins = normalizeLogins(payload?.logins);
    if (jsonLogins.length) return jsonLogins;

    const textLogins = normalizeLogins(String(dataTransfer?.getData?.('text/plain') || '').split(','));
    return textLogins.length ? textLogins : normalizeLogins(fallback);
  };

  const parseCategoryId = (dataTransfer, fallback = '') => {
    const payload = readJson(dataTransfer);
    if (typeof payload?.categoryId === 'string' && payload.categoryId.trim()) {
      return payload.categoryId.trim();
    }
    if (Array.isArray(payload?.logins)) return null;
    return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : null;
  };

  const getCategoryPlacement = ({
    isCategoryTarget,
    depth = 0,
    clientX = 0,
    clientY = 0,
    dragStartX = 0,
    elementLeft = 0,
    headerTop = 0,
    headerHeight = 0
  }) => {
    if (!isCategoryTarget) return 'inside';
    if (depth > 0 && dragStartX && clientX <= dragStartX - 24) return 'out';
    if (depth > 0 && clientX <= elementLeft + 32) return 'root';
    if (!headerHeight) return 'inside';
    const offsetY = clientY - headerTop;
    if (offsetY < 0 || offsetY > headerHeight) return 'inside';
    if (offsetY < headerHeight * 0.3) return 'before';
    if (offsetY > headerHeight * 0.7) return 'after';
    return 'inside';
  };

  window.TFRFavoritesDragDropModel = { parseLogins, parseCategoryId, getCategoryPlacement };
})();

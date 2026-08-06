(() => {
  const normalize = (value) => {
    if (!value) return '';
    let normalized = String(value);
    try { normalized = normalized.normalize('NFKC'); } catch {}
    normalized = normalized.toLowerCase().replace(/\s+/g, ' ');
    try { normalized = normalized.normalize('NFD'); } catch {}
    return normalized.replace(/[\u0300-\u036f]/g, '').trim();
  };

  const sanitizeLogin = (value) => {
    if (typeof value !== 'string') return '';
    const cleaned = value.trim()
      .replace(/^@/, '')
      .replace(/^[^a-z0-9_]+/i, '')
      .replace(/[^a-z0-9_]+$/i, '')
      .toLowerCase();
    if (!cleaned || !/^[a-z0-9_]+$/.test(cleaned) || !/[a-z_]/.test(cleaned)) return '';
    return cleaned;
  };

  const extractLogin = (text) => {
    if (typeof text !== 'string') return '';
    for (const token of text.split(/\s+/)) {
      const candidate = sanitizeLogin(
        token.replace(/^[^a-z0-9@_]+/i, '').replace(/[^a-z0-9@_]+$/i, '')
      );
      if (candidate) return candidate;
    }
    return '';
  };

  const extractModerator = (text) => {
    if (!text) return null;
    const match = String(text).match(/\b(?:by|par)\s+(@?[^\s\.\)]+)/i);
    const moderator = sanitizeLogin(match?.[1]);
    if (!moderator || ['un', 'une', 'le', 'la', 'an', 'a', 'moderateur', 'moderator'].includes(moderator)) {
      return null;
    }
    return moderator;
  };

  const pickFirst = (values) => {
    if (!Array.isArray(values)) return null;
    const value = values.find((candidate) => typeof candidate === 'string' && candidate.trim());
    return value ? value.trim() : null;
  };

  const isTruthy = (value) => {
    if (value === undefined || value === null) return false;
    const normalized = String(value).trim().toLowerCase();
    return Boolean(normalized) && !['0', 'false', 'no', 'non', 'off', 'null', 'undefined'].includes(normalized);
  };

  const hasBanIndicator = (value) => {
    const normalized = normalize(value);
    if (!normalized || /\b(?:banner|banners)\b/.test(normalized)) return false;
    return /(?:^|[^a-z0-9])(?:ban|banned|banni|bannie|bannissement|permaban|perma-ban)(?:$|[^a-z0-9])/i.test(normalized);
  };

  window.TFRModerationTextTools = {
    normalize,
    sanitizeLogin,
    extractLogin,
    extractModerator,
    pickFirst,
    isTruthy,
    hasBanIndicator
  };
})();

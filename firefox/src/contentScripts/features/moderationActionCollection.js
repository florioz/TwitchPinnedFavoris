(() => {
  const getCacheKey = (entry = {}) => {
    const type = entry.type || 'unknown';
    const login = entry.login || '';
    if (type === 'timeout') {
      const duration = Number.isFinite(entry.duration) ? Math.round(entry.duration) : 'unknown';
      return `${type}:${login}:${duration}`;
    }
    if (type === 'ban') return `${type}:${login}:${entry.isPermanent ? 'permanent' : 'temporary'}`;
    return `${type}:${login}`;
  };

  const merge = (target, source) => {
    if (!target || !source) return false;
    let updated = false;
    if (Number.isFinite(source.duration) && (!Number.isFinite(target.duration) || source.duration > target.duration)) {
      target.duration = source.duration;
      updated = true;
    }
    if (source.isPermanent && !target.isPermanent) {
      target.isPermanent = true;
      updated = true;
    }
    const newerMessage = (Number(source.timestamp) || 0) >= (Number(target.timestamp) || 0);
    if (newerMessage) {
      ['timestamp', 'rawMessage', 'lastMessage', 'offenseMessage', 'lastMessageTimestamp'].forEach((field) => {
        if (source[field] && target[field] !== source[field]) {
          target[field] = source[field];
          updated = true;
        }
      });
    } else if (!target.offenseMessage && source.offenseMessage) {
      target.offenseMessage = source.offenseMessage;
      updated = true;
    }
    ['displayName', 'moderator'].forEach((field) => {
      if (source[field] && target[field] !== source[field]) {
        target[field] = source[field];
        updated = true;
      }
    });
    target.detectedAt = Number(source.detectedAt) || Date.now();
    return updated;
  };

  const add = ({ entry, actions, actionKeys, recentCache, maxActions, emit }) => {
    if (!entry?.id) return;
    const key = getCacheKey(entry);
    const cached = recentCache.get(key);
    const detectedAt = Number(entry.detectedAt) || Date.now();
    if (cached) {
      const age = Math.abs(detectedAt - cached.detectedAt);
      if (age < 60000) {
        const updated = merge(cached.entry, entry);
        cached.detectedAt = detectedAt;
        if (updated) emit();
        return;
      }
      if (age > 10 * 60 * 1000) recentCache.delete(key);
    }
    if (actionKeys.has(entry.id)) return;
    actionKeys.add(entry.id);
    actions.push(entry);
    recentCache.set(key, { detectedAt, entry });
    if (actions.length > maxActions) {
      actions.splice(0, actions.length - maxActions).forEach((item) => actionKeys.delete(item?.id));
    }
    emit();
  };

  window.TFRModerationActionCollection = { add, getCacheKey, merge };
})();

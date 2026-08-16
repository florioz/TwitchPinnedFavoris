(() => {
  'use strict';

  const addEntry = (target, entry) => {
    const name = String(entry?.name || '').trim();
    const url = String(entry?.url || '').trim();
    if (!name || !url) return false;
    target.set(name, {
      name,
      url,
      provider: String(entry?.provider || '')
    });
    return true;
  };

  const appendSevenTv = (target, payload) => {
    const entries = payload?.emotes || payload?.emote_set?.emotes || [];
    entries.forEach((entry) => {
      const id = entry?.id || entry?.data?.id;
      const name = entry?.name || entry?.data?.name;
      if (!id || !name) return;
      addEntry(target, {
        name,
        provider: '7TV',
        url: `https://cdn.7tv.app/emote/${id}/2x.webp`
      });
    });
    return target;
  };

  const appendBetterTtv = (target, entries) => {
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      if (!entry?.id || !entry?.code) return;
      addEntry(target, {
        name: entry.code,
        provider: 'BetterTTV',
        url: `https://cdn.betterttv.net/emote/${entry.id}/2x.webp`
      });
    });
    return target;
  };

  const merge = (...catalogs) => {
    const result = new Map();
    catalogs.forEach((catalog) => catalog?.forEach?.((entry, name) => result.set(name, entry)));
    return result;
  };

  window.TFRChatEmoteCatalog = Object.freeze({
    addEntry,
    appendSevenTv,
    appendBetterTtv,
    merge
  });
})();

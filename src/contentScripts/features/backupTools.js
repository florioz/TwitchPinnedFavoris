(() => {
  const parseJson = (rawText) => {
    const normalized = typeof rawText === 'string' ? rawText.trim() : '';
    if (!normalized) throw new Error('Contenu vide');
    try {
      return JSON.parse(normalized);
    } catch {
      throw new Error('JSON invalide');
    }
  };

  const slugify = (value, fallback = 'profil') => String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || fallback;

  const downloadJson = (payload, filename) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  window.TFRBackupTools = Object.freeze({ downloadJson, parseJson, slugify });
})();

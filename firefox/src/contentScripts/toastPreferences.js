(function (root, factory) {
  const api = factory();
  root.__TFR_TOAST_PREFERENCES__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SOUND_IDS = new Set(['soft', 'chime', 'arcade', 'pulse', 'alert', 'custom']);
  const TOAST_POSITIONS = new Set([
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right'
  ]);

  const sanitizeToastPosition = (position) =>
    TOAST_POSITIONS.has(position) ? position : 'top-right';

  const sanitizeSoundId = (soundId) =>
    SOUND_IDS.has(soundId) ? soundId : 'soft';

  const sanitizeSoundVolume = (volume) => {
    const numeric = Number(volume);
    return Number.isFinite(numeric)
      ? Math.max(0, Math.min(100, Math.round(numeric)))
      : 35;
  };

  const sanitizeToastDuration = (seconds, fallbackMs = 5000) => {
    const numeric = Number(seconds);
    return Number.isFinite(numeric)
      ? Math.max(2000, Math.min(60000, Math.round(numeric * 1000)))
      : fallbackMs;
  };

  const normalizeToastPreferences = (preferences = {}, fallbackDurationMs = 5000) => ({
    durationMs: sanitizeToastDuration(preferences.toastDurationSeconds, fallbackDurationMs),
    enabled: preferences.toastEnabled !== false,
    position: sanitizeToastPosition(preferences.toastPosition),
    soundEnabled: preferences.toastSoundEnabled === true,
    soundId: sanitizeSoundId(preferences.toastSoundId),
    soundVolume: sanitizeSoundVolume(preferences.toastSoundVolume),
    customSoundDataUrl: typeof preferences.toastCustomSoundDataUrl === 'string'
      ? preferences.toastCustomSoundDataUrl
      : ''
  });

  return {
    normalizeToastPreferences,
    sanitizeSoundId,
    sanitizeSoundVolume,
    sanitizeToastDuration,
    sanitizeToastPosition
  };
});

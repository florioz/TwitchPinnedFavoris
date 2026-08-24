(() => {
  const SELECTORS = Object.freeze({
    player: '[data-a-target="video-player"], .video-player, .video-player__container',
    video: '[data-a-target="video-player"] video, .video-player__container video',
    error: [
      '[data-a-target="player-error-message"]',
      '[data-test-selector="player-error-message"]',
      '[data-a-target="player-error"]',
      '[data-test-selector="player-error"]',
      '.player-error-message'
    ].join(', '),
    retry: [
      '[data-a-target="player-error-retry-button"]',
      '[data-test-selector="player-error-retry-button"]',
      'button[data-a-target*="player-error"][data-a-target*="retry"]',
      'button[data-test-selector*="player-error"][data-test-selector*="retry"]'
    ].join(', ')
  });

  const RECOVERABLE_ERROR_PATTERN = /(?:error|erreur)\s*(?:code\s*)?#?\s*\d{3,5}\b|#\s*\d{3,5}\b|(?:an?\s+)?error\s+(?:occurred|has occurred|loading|playing|decoding)|(?:une\s+)?erreur\s+(?:est survenue|de lecture|de chargement|réseau)|(?:unable|failed)\s+to\s+(?:load|play|decode)|(?:impossible|échec)\s+(?:de|du|à)\s+(?:charger|lire|décoder|lecture)|playback\s+(?:error|failed)|lecture\s+impossible/i;
  const RETRY_LABEL_PATTERN = /(?:retry|try again|reload|refresh|réessayer|recharger|relancer|actualiser)/i;

  const createAttemptLimiter = ({ now = () => Date.now(), cooldownMs = 8000, windowMs = 60000, maxAttempts = 3 } = {}) => {
    let lastAttemptAt = 0;
    let attempts = [];
    const consume = () => {
      const timestamp = now();
      attempts = attempts.filter((attempt) => timestamp - attempt < windowMs);
      if (attempts.length >= maxAttempts || timestamp - lastAttemptAt < cooldownMs) return false;
      lastAttemptAt = timestamp;
      attempts.push(timestamp);
      return true;
    };
    return Object.freeze({ consume });
  };

  window.TFRPlayerRecoveryPolicy = Object.freeze({
    SELECTORS,
    RECOVERABLE_ERROR_PATTERN,
    RETRY_LABEL_PATTERN,
    createAttemptLimiter
  });
})();

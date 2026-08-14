(() => {
  const SELECTORS = Object.freeze({
    video: '[data-a-target="video-player"] video, .video-player__container video',
    error: '[data-a-target="player-error-message"], [data-test-selector="player-error-message"], .player-error-message',
    retry: '[data-a-target="player-error-retry-button"], [data-test-selector="player-error-retry-button"]'
  });

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

  window.TFRPlayerRecoveryPolicy = Object.freeze({ SELECTORS, createAttemptLimiter });
})();

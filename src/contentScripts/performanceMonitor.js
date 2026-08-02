(() => {
  const LONG_TASK_THRESHOLD_MS = 24;
  const recentWarnings = new Map();

  const now = () => globalThis.performance?.now?.() ?? Date.now();

  const report = (label, startedAt, details = {}) => {
    const duration = now() - startedAt;
    if (duration < LONG_TASK_THRESHOLD_MS) {
      return duration;
    }
    const timestamp = Date.now();
    const previous = recentWarnings.get(label) || 0;
    if (timestamp - previous >= 5000) {
      recentWarnings.set(label, timestamp);
      console.warn(`[TFR performance] ${label}: ${duration.toFixed(1)} ms`, details);
    }
    return duration;
  };

  window.TFRPerformance = Object.freeze({ now, report });
})();

(() => {
  const LONG_TASK_THRESHOLD_MS = 50;
  const MAX_REPORTS = 100;
  const recentReports = [];
  let loggingEnabled = false;

  const now = () => globalThis.performance?.now?.() ?? Date.now();

  const report = (label, startedAt, details = {}) => {
    const duration = now() - startedAt;
    if (duration < LONG_TASK_THRESHOLD_MS) {
      return duration;
    }
    const entry = Object.freeze({
      label: String(label || 'unknown'),
      duration,
      timestamp: Date.now(),
      details: { ...details }
    });
    recentReports.push(entry);
    if (recentReports.length > MAX_REPORTS) recentReports.shift();
    if (loggingEnabled) {
      console.debug(`[TFR performance] ${entry.label}: ${duration.toFixed(1)} ms`, entry.details);
    }
    return duration;
  };

  const setLoggingEnabled = (enabled) => {
    loggingEnabled = Boolean(enabled);
  };
  const getReports = () => recentReports.map((entry) => ({ ...entry, details: { ...entry.details } }));
  const clearReports = () => { recentReports.length = 0; };

  window.TFRPerformance = Object.freeze({ now, report, setLoggingEnabled, getReports, clearReports });
})();

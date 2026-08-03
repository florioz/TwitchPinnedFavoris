(() => {
  'use strict';
  const UNITS = Object.freeze({
    minute: 60, minutes: 60, min: 60, mins: 60, mn: 60, m: 60,
    hour: 3600, hours: 3600, heure: 3600, heures: 3600, hr: 3600, hrs: 3600, h: 3600,
    day: 86400, days: 86400, jour: 86400, jours: 86400, d: 86400,
    week: 604800, weeks: 604800, semaine: 604800, semaines: 604800, w: 604800,
    seconde: 1, secondes: 1, second: 1, seconds: 1, sec: 1, secs: 1, s: 1,
    millisecond: .001, milliseconds: .001, milliseconde: .001, millisecondes: .001, ms: .001
  });
  const DURATION_PATTERN = '(\\d+(?:\\.\\d+)?)\\s*(millisecondes?|milliseconds?|ms|secondes?|seconds?|secs?|sec|minutes?|mins?|min|mn|heures?|hours?|hrs?|hr|jours?|days?|semaines?|weeks?|[smhdw])';
  const ACTION_PATTERN = '(?:timeout|timed\\s*out|tempo|temporaire|silence|mute|ban\\s+temporaire|reduit\\s+au\\s+silence|rÃ©duit\\s+au\\s+silence)';

  function normalizeNumber(value, unitHint = null) {
    if (!Number.isFinite(value) || value <= 0 || (value < 1 && unitHint !== 'ms')) return null;
    return Math.round(unitHint === 'ms' ? value / 1000 : value);
  }

  function convert(value, unit) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric * (UNITS[String(unit || '').toLowerCase()] ?? 1);
  }

  function fromText(text) {
    const normalized = String(text || '').replace(/[,]+/g, '.').replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    const colon = normalized.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (colon) {
      const hours = colon[3] ? Number(colon[1]) : 0;
      const minutes = colon[3] ? Number(colon[2]) : Number(colon[1]);
      const seconds = colon[3] ? Number(colon[3]) : Number(colon[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    const match = normalized.match(new RegExp(DURATION_PATTERN, 'i'));
    return match ? convert(match[1], match[2]) : null;
  }

  function timeoutFromText(text) {
    const normalized = String(text || '').replace(/[,]+/g, '.').replace(/\s+/g, ' ').trim();
    if (!normalized || !new RegExp(ACTION_PATTERN, 'i').test(normalized)) return null;
    const context = '(?:pour|pendant|for|dur[eÃ©]e\\s*:?|duration\\s*:?|de)?\\s*';
    const patterns = [
      new RegExp(`${ACTION_PATTERN}.{0,80}?${context}${DURATION_PATTERN}`, 'i'),
      new RegExp(`${context}${DURATION_PATTERN}.{0,80}?${ACTION_PATTERN}`, 'i')
    ];
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) return convert(match[1], match[2]);
    }
    return null;
  }

  function parse(value, unitHint = null) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return normalizeNumber(value, unitHint);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed) || (unitHint === 'ms' && Number.isFinite(Number(trimmed)))) {
      return normalizeNumber(Number(trimmed), unitHint);
    }
    const iso = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
    if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
    const numeric = Number(trimmed.replace(',', '.'));
    return Number.isFinite(numeric) ? normalizeNumber(numeric, unitHint) : fromText(trimmed);
  }

  function first(values) {
    if (!Array.isArray(values)) return null;
    for (const entry of values) {
      if (entry === null || entry === undefined || entry === '') continue;
      const parsed = typeof entry === 'object' && !Array.isArray(entry) ? parse(entry.value, entry.unit) : parse(entry);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  window.TFRModerationDurationTools = Object.freeze({ convert, first, fromText, normalizeNumber, parse, timeoutFromText });
})();

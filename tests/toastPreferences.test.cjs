const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeToastPreferences,
  sanitizeSoundId,
  sanitizeSoundVolume,
  sanitizeToastDuration,
  sanitizeToastPosition
} = require('../src/contentScripts/toastPreferences.js');

test('toast position and sound id fall back to supported values', () => {
  assert.equal(sanitizeToastPosition('middle'), 'top-right');
  assert.equal(sanitizeToastPosition('bottom-left'), 'bottom-left');
  assert.equal(sanitizeSoundId('unknown'), 'soft');
  assert.equal(sanitizeSoundId('custom'), 'custom');
});

test('sound volume and duration are clamped', () => {
  assert.equal(sanitizeSoundVolume(150), 100);
  assert.equal(sanitizeSoundVolume(-10), 0);
  assert.equal(sanitizeToastDuration(1), 2000);
  assert.equal(sanitizeToastDuration(90), 60000);
});

test('toast preferences are normalized as one stable object', () => {
  assert.deepEqual(
    normalizeToastPreferences({
      toastDurationSeconds: 8,
      toastEnabled: false,
      toastPosition: 'top-left',
      toastSoundEnabled: true,
      toastSoundId: 'chime',
      toastSoundVolume: 42.4,
      toastCustomSoundDataUrl: 'data:audio/test'
    }),
    {
      durationMs: 8000,
      enabled: false,
      position: 'top-left',
      soundEnabled: true,
      soundId: 'chime',
      soundVolume: 42,
      customSoundDataUrl: 'data:audio/test'
    }
  );
});

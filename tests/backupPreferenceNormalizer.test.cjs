const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/backupPreferenceNormalizer.js'),
  'utf8'
), context);
const identity = (value) => value;
const normalize = context.window.TFRBackupPreferenceNormalizer.create({
  categoryColorOpacity: (value) => Math.max(0, Math.min(100, Number(value))),
  categoryColorGradient: identity,
  categoryColorStyle: identity,
  streamerItemStyle: identity,
  autoCompactGroupStyle: identity,
  sidebarAnimationStyle: identity,
  sidebarSurfaceStyle: identity,
  categoryColor: identity,
  specialCategoryColors: identity,
  toastPosition: identity,
  toastSoundVolume: identity,
  toastSoundId: identity,
  toastCustomSoundName: identity,
  toastCustomSoundDataUrl: identity,
  chatFontFamily: identity,
  chatCustomFontDataUrl: identity,
  chatMentionHighlightColor: identity,
  chatMentionSoundId: identity,
  liveHoverPreviewMode: (value) => value === 'video' ? 'video' : 'image'
});

test('backup preferences keep typed values and ignore invalid booleans', () => {
  const result = normalize({
    liveFavoritesEnabled: true,
    recentLiveEnabled: 'yes',
    sortMode: 'nameAsc',
    streamerItemStyle: 'compact',
    liveHoverPreviewMode: 'video',
    chatMentionHighlightEnabled: true,
    chatMentionHighlightColor: '#123456',
    chatMentionSoundId: 'chime',
    autoClaimChannelPointsEnabled: true
  });
  assert.equal(result.liveFavoritesEnabled, true);
  assert.equal(result.recentLiveEnabled, undefined);
  assert.equal(result.sortMode, 'nameAsc');
  assert.equal(result.streamerItemStyle, 'compact');
  assert.equal(result.liveHoverPreviewMode, 'video');
  assert.equal(result.chatMentionHighlightEnabled, true);
  assert.equal(result.chatMentionHighlightColor, '#123456');
  assert.equal(result.chatMentionSoundId, 'chime');
  assert.equal(result.autoClaimChannelPointsEnabled, true);
});

test('backup preferences clamp durations and truncate custom font names', () => {
  const result = normalize({
    recentLiveThresholdMinutes: 999,
    toastDurationSeconds: 0,
    chatPaddingPx: 99,
    categoryColorOpacity: 150,
    chatCustomFontName: 'x'.repeat(200)
  });
  assert.equal(result.recentLiveThresholdMinutes, 120);
  assert.equal(result.toastDurationSeconds, 2);
  assert.equal(result.chatPaddingPx, 20);
  assert.equal(result.categoryColorOpacity, 100);
  assert.equal(result.chatCustomFontName.length, 160);
});

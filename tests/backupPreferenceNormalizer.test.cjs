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
  liveHoverPreviewMode: (value) => value === 'video' ? 'video' : 'image',
  playerAudioCompressorPreset: identity,
  playerVolumeTargetDb: (value) => Math.max(-80, Math.min(-10, Number(value))),
  playerVolumeMaxReductionDb: (value) => Math.max(-40, Math.min(-12, Number(value)))
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

test('backup preferences preserve bounded audio normalization settings', () => {
  const result = normalize({
    playerAudioCompressorPreset: 'strong',
    playerVolumeTargetDb: -48,
    playerVolumeMaxReductionDb: -36
  });
  assert.equal(result.playerAudioCompressorPreset, 'strong');
  assert.equal(result.playerVolumeTargetDb, -48);
  assert.equal(result.playerVolumeMaxReductionDb, -36);
});

test('backup preferences preserve onboarding progress', () => {
  const result = normalize({
    onboardingTutorialVersion: 1,
    onboardingTutorialStep: 3,
    onboardingTutorialDismissed: true
  });
  assert.equal(result.onboardingTutorialVersion, 1);
  assert.equal(result.onboardingTutorialStep, 3);
  assert.equal(result.onboardingTutorialDismissed, true);
});

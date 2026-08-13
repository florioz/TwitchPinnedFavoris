const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, console });
vm.runInContext(fs.readFileSync(
  path.join(__dirname, '../src/contentScripts/features/featureController.js'),
  'utf8'
), context);

class Enhancement {
  init() {}
  configure(value) { this.value = value; }
  dispose() {}
}

const FeatureController = context.window.TFRFeatureController.create({
  CHANGE_KIND: { STATE: 'state' },
  ChatHistoryTracker: Enhancement,
  ViewerCardHistoryRenderer: Enhancement,
  ModerationActionTracker: Enhancement,
  ModerationHistoryUI: Enhancement,
  ThirdPartyChatEmotes: Enhancement,
  PlayerLatencyIndicator: Enhancement,
  AutoClaimChannelPoints: Enhancement,
  PlayerAudioCompressor: Enhancement,
  ChatFontManager: Enhancement,
  ChatPaddingManager: Enhancement,
  ChatMentionHighlighter: Enhancement,
  DeletedMessageViewer: Enhancement,
  ReplyExpansionTracker: Enhancement
});

test('enhancement registry selects and propagates preferences', () => {
  const controller = new FeatureController({});
  controller.enhancementDefinitions.forEach((definition) => controller.initializeEnhancement(definition));
  controller.ensureChatHistory = () => {};
  controller.ensureViewerCardHistory = () => {};
  controller.teardownViewerCardHistory = () => {};
  controller.ensureModerationFeatures = () => {};
  controller.teardownModeration = () => {};
  controller.teardownChatHistory = () => {};

  controller.applyPreferences({
    chatHistoryEnabled: true,
    moderationHistoryEnabled: false,
    sevenTvEmotesEnabled: true,
    chatNoPaddingEnabled: true,
    chatPaddingPx: 12,
    chatMentionHighlightEnabled: true,
    chatMentionHighlightColor: '#123456',
    chatMentionSoundEnabled: true,
    chatMentionSoundId: 'chime',
    playerAudioCompressorEnabled: true,
    autoClaimChannelPointsEnabled: true,
    playerAudioCompressorPreset: 'strong',
    playerVolumeNormalizerEnabled: true,
    playerVolumeTargetDb: -18,
    showFullRepliesEnabled: true
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(controller.thirdPartyChatEmotes.value)),
    { sevenTvEnabled: true, betterTtvEnabled: false }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(controller.chatPaddingManager.value)),
    { enabled: true, paddingPx: 12 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(controller.chatMentionHighlighter.value)),
    { enabled: true, color: '#123456', soundEnabled: true, soundId: 'chime' }
  );
  assert.equal(controller.replyExpansionTracker.value, true);
  assert.equal(controller.autoClaimChannelPoints.value, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(controller.playerAudioCompressor.value)),
    { enabled: true, preset: 'strong', normalizerEnabled: true, targetDb: -18 }
  );
});

test('moderation feature initialization reuses its tracker and UI', () => {
  const controller = new FeatureController({});
  controller.chatHistory = new Enhancement();

  controller.ensureModerationFeatures();
  const tracker = controller.moderationTracker;
  const historyUI = controller.moderationHistoryUI;
  controller.ensureModerationFeatures();

  assert.equal(controller.moderationTracker, tracker);
  assert.equal(controller.moderationHistoryUI, historyUI);
});

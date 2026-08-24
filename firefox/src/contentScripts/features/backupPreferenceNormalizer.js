(() => {
  const BOOLEAN_KEYS = [
    'uncategorizedCollapsed', 'liveFavoritesCollapsed', 'liveFavoritesEnabled',
    'recentLiveEnabled', 'recentLiveCollapsed', 'hideCollapsedGroupsUntilHover',
    'autoCompactSidebarEnabled', 'toastEnabled', 'toastSoundEnabled',
    'chatHistoryEnabled', 'moderationHistoryEnabled', 'sevenTvEmotesEnabled',
    'betterTtvEmotesEnabled', 'chatEmoteAutocompleteEnabled', 'chatEmotePickerEnabled', 'playerLatencyEnabled',
    'playerRecoveryEnabled', 'playerResetButtonEnabled', 'playerAudioControlsEnabled', 'playerAudioCompressorEnabled',
    'autoClaimChannelPointsEnabled',
    'playerVolumeNormalizerEnabled', 'chatFontEnabled',
    'chatNoPaddingEnabled', 'showDeletedMessagesEnabled', 'showFullRepliesEnabled',
    'liveHoverPreviewEnabled', 'chatMentionHighlightEnabled', 'chatMentionSoundEnabled',
    'communityBadgeEnabled',
    'onboardingTutorialDismissed'
  ];

  const createBackupPreferenceNormalizer = (sanitizers) => (source = {}) => {
    if (!source || typeof source !== 'object') return {};
    const result = {};
    BOOLEAN_KEYS.forEach((key) => {
      if (typeof source[key] === 'boolean') result[key] = source[key];
    });
    if (typeof source.sortMode === 'string') result.sortMode = source.sortMode;

    const sanitizeIfPresent = (key, sanitizer, expectedType = null) => {
      if (source[key] == null) return;
      if (expectedType && typeof source[key] !== expectedType) return;
      result[key] = sanitizer(source[key]);
    };
    sanitizeIfPresent('categoryColorOpacity', sanitizers.categoryColorOpacity);
    sanitizeIfPresent('categoryColorGradient', sanitizers.categoryColorGradient);
    sanitizeIfPresent('categoryColorStyle', sanitizers.categoryColorStyle, 'string');
    sanitizeIfPresent('streamerItemStyle', sanitizers.streamerItemStyle, 'string');
    sanitizeIfPresent('autoCompactStreamerStyle', sanitizers.streamerItemStyle, 'string');
    sanitizeIfPresent('autoCompactGroupStyle', sanitizers.autoCompactGroupStyle, 'string');
    sanitizeIfPresent('sidebarAnimationStyle', sanitizers.sidebarAnimationStyle, 'string');
    sanitizeIfPresent('sidebarSurfaceStyle', sanitizers.sidebarSurfaceStyle, 'string');
    sanitizeIfPresent('sidebarSurfaceColor', sanitizers.categoryColor, 'string');
    sanitizeIfPresent('toastPosition', sanitizers.toastPosition, 'string');
    sanitizeIfPresent('toastSoundVolume', sanitizers.toastSoundVolume);
    sanitizeIfPresent('toastSoundId', sanitizers.toastSoundId, 'string');
    sanitizeIfPresent('toastCustomSoundName', sanitizers.toastCustomSoundName, 'string');
    sanitizeIfPresent('toastCustomSoundDataUrl', sanitizers.toastCustomSoundDataUrl, 'string');
    sanitizeIfPresent('chatFontFamily', sanitizers.chatFontFamily, 'string');
    sanitizeIfPresent('chatCustomFontDataUrl', sanitizers.chatCustomFontDataUrl, 'string');
    sanitizeIfPresent('chatMentionHighlightColor', sanitizers.chatMentionHighlightColor, 'string');
    sanitizeIfPresent('chatMentionSoundId', sanitizers.chatMentionSoundId, 'string');
    sanitizeIfPresent('liveHoverPreviewMode', sanitizers.liveHoverPreviewMode, 'string');
    sanitizeIfPresent('playerAudioCompressorPreset', sanitizers.playerAudioCompressorPreset, 'string');
    sanitizeIfPresent('playerVolumeTargetDb', sanitizers.playerVolumeTargetDb);
    sanitizeIfPresent('playerVolumeMaxReductionDb', sanitizers.playerVolumeMaxReductionDb);

    if (source.specialCategoryColors && typeof source.specialCategoryColors === 'object') {
      result.specialCategoryColors = sanitizers.specialCategoryColors(source.specialCategoryColors);
    }
    if (typeof source.chatCustomFontName === 'string') {
      result.chatCustomFontName = source.chatCustomFontName.slice(0, 160);
    }
    const copyClampedInteger = (key, minimum, maximum) => {
      if (source[key] == null) return;
      const parsed = Number(source[key]);
      if (Number.isFinite(parsed)) {
        result[key] = Math.max(minimum, Math.min(maximum, Math.round(parsed)));
      }
    };
    copyClampedInteger('recentLiveThresholdMinutes', 1, 120);
    copyClampedInteger('toastDurationSeconds', 2, 60);
    copyClampedInteger('chatPaddingPx', 0, 20);
    copyClampedInteger('onboardingTutorialVersion', 0, 1000);
    copyClampedInteger('onboardingTutorialStep', 0, 20);
    return result;
  };

  window.TFRBackupPreferenceNormalizer = { create: createBackupPreferenceNormalizer };
})();

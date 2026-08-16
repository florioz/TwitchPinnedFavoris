(() => {
  const createFeatureSettingsConfig = ({ t }) => {
    const toggles = [
      ['liveFavoritesEnabled', 'settings.liveSidebar', 'setLiveFavoritesEnabled'],
      ['chatHistoryEnabled', 'settings.chatHistory', 'setChatHistoryEnabled'],
      ['moderationHistoryEnabled', 'settings.moderation', 'setModerationHistoryEnabled'],
      ['sevenTvEmotesEnabled', 'settings.sevenTv', 'setSevenTvEmotesEnabled', false],
      ['betterTtvEmotesEnabled', 'settings.betterTtv', 'setBetterTtvEmotesEnabled', false],
      ['chatEmoteAutocompleteEnabled', 'settings.emoteAutocomplete', 'setChatEmoteAutocompleteEnabled', false],
      ['playerLatencyEnabled', 'settings.playerLatency', 'setPlayerLatencyEnabled', false],
      ['playerRecoveryEnabled', 'settings.playerRecovery', 'setPlayerRecoveryEnabled', false],
      ['autoClaimChannelPointsEnabled', 'settings.autoClaimChannelPoints', 'setAutoClaimChannelPointsEnabled', false],
      ['playerAudioCompressorEnabled', 'settings.audioCompressor', 'setPlayerAudioCompressorEnabled', false],
      ['playerVolumeNormalizerEnabled', 'settings.volumeNormalizer', 'setPlayerVolumeNormalizerEnabled', false],
      ['chatFontEnabled', 'settings.chatFont', 'setChatFontEnabled', false],
      ['chatNoPaddingEnabled', 'settings.chatPadding', 'setChatNoPaddingEnabled', false],
      ['chatMentionHighlightEnabled', 'settings.chatMentions', 'setChatMentionHighlightEnabled', false],
      ['showDeletedMessagesEnabled', 'settings.deletedMessages', 'setShowDeletedMessagesEnabled', false],
      ['showFullRepliesEnabled', 'settings.fullReplies', 'setShowFullRepliesEnabled', false],
      ['hideCollapsedGroupsUntilHover', 'settings.collapsedGroups', 'setHideCollapsedGroupsUntilHover', false],
      ['autoCompactSidebarEnabled', 'settings.autoCompactSidebar', 'setAutoCompactSidebarEnabled', false],
      ['liveHoverPreviewEnabled', 'settings.livePreview', 'setLiveHoverPreviewEnabled', false]
    ].map(([key, labelPrefix, setter, defaultEnabled]) => ({
      key,
      label: t(`${labelPrefix}.toggle`),
      description: t(`${labelPrefix}.description`),
      setter,
      ...(defaultEnabled === false ? { defaultEnabled } : {})
    }));

    const groups = [
      {
        id: 'chat',
        keys: ['chatHistoryEnabled', 'moderationHistoryEnabled', 'chatFontEnabled', 'chatNoPaddingEnabled', 'showDeletedMessagesEnabled', 'showFullRepliesEnabled']
      },
      { id: 'mentions', keys: ['chatMentionHighlightEnabled'] },
      { id: 'emotes', keys: ['sevenTvEmotesEnabled', 'betterTtvEmotesEnabled', 'chatEmoteAutocompleteEnabled'] },
      {
        id: 'player',
        keys: ['liveFavoritesEnabled', 'playerLatencyEnabled', 'playerRecoveryEnabled', 'autoClaimChannelPointsEnabled', 'playerAudioCompressorEnabled', 'playerVolumeNormalizerEnabled', 'hideCollapsedGroupsUntilHover', 'autoCompactSidebarEnabled', 'liveHoverPreviewEnabled']
      }
    ].map((group) => ({
      ...group,
      title: t(`settings.enhancements.${group.id}`),
      description: t(`settings.enhancements.${group.id}Description`)
    }));

    return { toggles, groups };
  };

  window.TFRFeatureSettingsConfig = { create: createFeatureSettingsConfig };
})();

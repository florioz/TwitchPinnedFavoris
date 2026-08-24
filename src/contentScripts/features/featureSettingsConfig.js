(() => {
  const createFeatureSettingsConfig = ({ t }) => {
    const toggles = [
      ['liveFavoritesEnabled', 'settings.liveSidebar', 'setLiveFavoritesEnabled'],
      ['chatHistoryEnabled', 'settings.chatHistory', 'setChatHistoryEnabled'],
      ['moderationHistoryEnabled', 'settings.moderation', 'setModerationHistoryEnabled'],
      ['sevenTvEmotesEnabled', 'settings.sevenTv', 'setSevenTvEmotesEnabled', false],
      ['betterTtvEmotesEnabled', 'settings.betterTtv', 'setBetterTtvEmotesEnabled', false],
      ['chatEmoteAutocompleteEnabled', 'settings.emoteAutocomplete', 'setChatEmoteAutocompleteEnabled', false],
      ['chatEmotePickerEnabled', 'settings.emotePicker', 'setChatEmotePickerEnabled', false, ['sevenTvEmotesEnabled', 'betterTtvEmotesEnabled']],
      ['playerLatencyEnabled', 'settings.playerLatency', 'setPlayerLatencyEnabled', false],
      ['playerRecoveryEnabled', 'settings.playerRecovery', 'setPlayerRecoveryEnabled', false],
      ['playerResetButtonEnabled', 'settings.playerResetButton', 'setPlayerResetButtonEnabled', false],
      ['autoClaimChannelPointsEnabled', 'settings.autoClaimChannelPoints', 'setAutoClaimChannelPointsEnabled', false],
      ['playerAudioControlsEnabled', 'settings.audioControls', 'setPlayerAudioControlsEnabled', false],
      ['chatFontEnabled', 'settings.chatFont', 'setChatFontEnabled', false],
      ['chatNoPaddingEnabled', 'settings.chatPadding', 'setChatNoPaddingEnabled', false],
      ['chatMentionHighlightEnabled', 'settings.chatMentions', 'setChatMentionHighlightEnabled', false],
      ['communityBadgeEnabled', 'settings.communityBadge', 'setCommunityBadgeEnabled', false],
      ['showDeletedMessagesEnabled', 'settings.deletedMessages', 'setShowDeletedMessagesEnabled', false],
      ['showFullRepliesEnabled', 'settings.fullReplies', 'setShowFullRepliesEnabled', false],
      ['hideCollapsedGroupsUntilHover', 'settings.collapsedGroups', 'setHideCollapsedGroupsUntilHover', false],
      ['autoCompactSidebarEnabled', 'settings.autoCompactSidebar', 'setAutoCompactSidebarEnabled', false],
      ['liveHoverPreviewEnabled', 'settings.livePreview', 'setLiveHoverPreviewEnabled', false]
    ].map(([key, labelPrefix, setter, defaultEnabled, requiresAny]) => ({
      key,
      label: t(`${labelPrefix}.toggle`),
      description: t(`${labelPrefix}.description`),
      setter,
      ...(defaultEnabled === false ? { defaultEnabled } : {}),
      ...(requiresAny ? { requiresAny } : {})
    }));

    const groups = [
      {
        id: 'chat',
        keys: ['chatHistoryEnabled', 'moderationHistoryEnabled', 'communityBadgeEnabled', 'chatFontEnabled', 'chatNoPaddingEnabled', 'showDeletedMessagesEnabled', 'showFullRepliesEnabled']
      },
      { id: 'mentions', keys: ['chatMentionHighlightEnabled'] },
      { id: 'emotes', keys: ['sevenTvEmotesEnabled', 'betterTtvEmotesEnabled', 'chatEmoteAutocompleteEnabled', 'chatEmotePickerEnabled'] },
      {
        id: 'player',
        keys: ['liveFavoritesEnabled', 'playerLatencyEnabled', 'playerRecoveryEnabled', 'playerResetButtonEnabled', 'autoClaimChannelPointsEnabled', 'playerAudioControlsEnabled', 'hideCollapsedGroupsUntilHover', 'autoCompactSidebarEnabled', 'liveHoverPreviewEnabled']
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

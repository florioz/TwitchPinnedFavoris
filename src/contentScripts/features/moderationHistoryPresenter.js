(() => {
  const create = ({ t, formatDuration, formatTimestamp }) => ({
    formatEntry(entry = {}) {
      const durationValue = Number(entry.duration);
      const hasDuration = Number.isFinite(durationValue) && durationValue > 0;
      const durationLabel = hasDuration ? formatDuration(durationValue) : '';
      let actionLabel;

      if (entry.type === 'ban' && entry.isPermanent) {
        actionLabel = t('moderation.history.action.banPermanent');
      } else if (entry.type === 'ban' || entry.type === 'timeout') {
        actionLabel = durationLabel
          ? t('moderation.history.action.timeout', { duration: durationLabel })
          : t('moderation.history.action.timeoutUnknown');
      } else {
        actionLabel = t('moderation.history.action.deletion');
      }

      const moderatorLabel = entry.moderator
        ? t('moderation.history.meta.by', { moderator: entry.moderator })
        : '';
      return {
        actionLabel,
        moderatorLabel,
        timeLabel: formatTimestamp(entry.timestamp) || '',
        metaLabel: moderatorLabel
      };
    },

    truncate(value, maxLength) {
      if (!value) return '';
      if (!Number.isFinite(maxLength) || maxLength <= 0 || value.length <= maxLength) return value;
      return `${value.slice(0, maxLength - 3)}...`;
    }
  });

  window.TFRModerationHistoryPresenter = { create };
})();

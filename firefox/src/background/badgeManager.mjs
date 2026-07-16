export const createBadgeManager = ({
  actionApi,
  liveColor = '#9147ff',
  updateColor = '#ef4444',
  logger = console
} = {}) => {
  let liveCount = 0;
  let updateAvailable = false;

  const render = async () => {
    if (!actionApi?.setBadgeText) {
      return;
    }
    try {
      if (updateAvailable) {
        await actionApi.setBadgeBackgroundColor?.({ color: updateColor });
        await actionApi.setBadgeText({ text: '!' });
        await actionApi.setTitle?.({ title: 'Nouvelle mise a jour disponible' });
        return;
      }
      await actionApi.setBadgeBackgroundColor?.({ color: liveColor });
      await actionApi.setBadgeText({ text: liveCount > 0 ? String(Math.min(liveCount, 99)) : '' });
      await actionApi.setTitle?.({ title: 'Afficher les favoris Twitch' });
    } catch (error) {
      logger?.warn?.('[TFR] unable to update badge text', error);
    }
  };

  return {
    async setLiveCount(count) {
      liveCount = Number(count) || 0;
      await render();
    },
    async setUpdateAvailable(available) {
      updateAvailable = Boolean(available);
      await render();
    },
    getUpdateAvailable: () => updateAvailable
  };
};

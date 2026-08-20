const isGestureError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('user gesture') || message.includes('may only be called in response');
};

export const createPanelLauncher = ({ extensionApi, sendMessageToTab, logger = console }) => {
  const configure = () => {
    const configureBehavior = extensionApi.sidePanel?.setPanelBehavior;
    if (!configureBehavior) return;
    try {
      Promise.resolve(configureBehavior.call(extensionApi.sidePanel, { openPanelOnActionClick: true }))
        .catch((error) => logger.warn?.('[TFR] unable to set side panel behavior', error));
    } catch (error) {
      logger.warn?.('[TFR] unable to set side panel behavior', error);
    }
  };

  const openChromiumPanel = async (tab) => {
    if (!extensionApi.sidePanel?.open) return false;
    const options = Number.isInteger(tab?.windowId)
      ? { windowId: tab.windowId }
      : Number.isInteger(tab?.id)
        ? { tabId: tab.id }
        : {};
    try {
      await extensionApi.sidePanel.open(options);
      return true;
    } catch (error) {
      if (!isGestureError(error)) logger.error?.('[TFR] side panel open failed', error);
      return false;
    }
  };

  const toggleFirefoxSidebar = async () => {
    if (!extensionApi.sidebarAction?.toggle) return false;
    try {
      await extensionApi.sidebarAction.toggle();
      return true;
    } catch (error) {
      logger.error?.('[TFR] Firefox sidebar toggle failed', error);
      return false;
    }
  };

  const toggleInjectedPanel = async (tabId) => {
    if (!Number.isInteger(tabId)) return false;
    const result = await sendMessageToTab(tabId, { type: 'TFR_TOGGLE_PANEL' });
    return Boolean(result?.ok);
  };

  const open = async (tab = null) => {
    if (!Number.isInteger(tab?.id)) return false;
    if (await openChromiumPanel(tab)) return true;
    if (await toggleFirefoxSidebar()) return true;
    return toggleInjectedPanel(tab.id);
  };

  return Object.freeze({ configure, open });
};

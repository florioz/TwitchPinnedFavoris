(function (root, factory) {
  const api = factory();
  root.__TFR_PANEL_MESSAGE_ROUTER__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const createPanelMessageRouter = ({
    togglePanel,
    renderSnapshot,
    displayToast
  }) => (message, _sender, sendResponse) => {
    if (!message) return false;
    if (message.type === 'TFR_TOGGLE_PANEL') {
      togglePanel();
      return false;
    }
    if (message.type === 'TFR_STATE_PUSH') {
      renderSnapshot(message);
      return false;
    }
    if (message.type === 'TFR_OVERLAY_TOAST') {
      const displayed = displayToast(message.entries || [], {
        force: Boolean(message.force),
        showToast: message.showToast,
        playSound: message.playSound,
        soundId: message.soundId,
        soundVolume: message.soundVolume,
        customSoundDataUrl: message.customSoundDataUrl
      });
      sendResponse?.({ ok: Boolean(displayed) });
      return true;
    }
    return false;
  };

  return { createPanelMessageRouter };
});

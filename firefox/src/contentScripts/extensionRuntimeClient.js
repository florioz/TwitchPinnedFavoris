(function (root, factory) {
  const api = factory();
  root.__TFR_EXTENSION_RUNTIME_CLIENT__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const isInvalidatedContext = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('extension context invalidated') ||
      message.includes('context invalidated');
  };

  const createExtensionRuntimeClient = ({
    runtime,
    logger = console
  }) => {
    const send = (payload) => new Promise((resolve) => {
      try {
        runtime.sendMessage(payload, (response) => {
          const error = runtime.lastError;
          if (!error) {
            resolve(response);
            return;
          }
          if (!isInvalidatedContext(error)) {
            logger?.warn?.('[TFR overlay] message error', error);
          }
          resolve(null);
        });
      } catch (error) {
        if (!isInvalidatedContext(error)) {
          logger?.warn?.('[TFR overlay] message exception', error);
        }
        resolve(null);
      }
    });

    return {
      send,
      getSnapshot: (forceRefresh = false) => send({
        type: 'TFR_GET_POPUP_STATE',
        forceRefresh
      }),
      dismissToast: (login, notificationKey) => send({
        type: 'TFR_DISMISS_LIVE_TOAST',
        login,
        notificationKey
      }),
      openChannel: (login) => send({
        type: 'TFR_OPEN_CHANNEL_TAB',
        login
      })
    };
  };

  return { createExtensionRuntimeClient, isInvalidatedContext };
});

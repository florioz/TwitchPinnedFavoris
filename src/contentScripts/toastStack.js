(function (root, factory) {
  const api = factory();
  root.__TFR_TOAST_STACK__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const createToastStackController = ({
    documentRef,
    escapeHtml,
    formatNumber,
    defaultAvatar,
    maxVisible = 3,
    schedule = setTimeout,
    dismissEntry,
    t = (key) => key
  }) => {
    let stack = null;

    const ensureStack = (host) => {
      if (stack) return stack;
      stack = documentRef.createElement('div');
      stack.className = 'tfr-toast-stack';
      host.appendChild(stack);
      return stack;
    };

    const setPosition = (position) => {
      if (stack) {
        stack.dataset.position = position;
      }
    };

    const render = (entries = [], {
      host,
      durationMs,
      position
    }) => {
      if (!entries.length) return false;
      const targetStack = ensureStack(host);
      setPosition(position);

      entries.slice(0, maxVisible).forEach(({ login, fav = {}, live = {}, notificationKey }) => {
        const toast = documentRef.createElement('div');
        toast.className = 'tfr-toast';
        toast.innerHTML = `
          <img class="tfr-toast__thumb" src="${escapeHtml(live.avatarUrl || fav.avatarUrl || defaultAvatar)}" alt="" />
          <div class="tfr-toast__content">
            <p class="tfr-toast__title">${escapeHtml(t('toast.live', { name: live.displayName || fav.displayName || fav.login }))}</p>
            <p class="tfr-toast__subtitle">${escapeHtml(t('toast.subtitle', { game: live.game || t('toast.liveFallback'), count: formatNumber(live.viewers) }))}</p>
          </div>
          <button class="tfr-toast__close" type="button" aria-label="${escapeHtml(t('toast.close'))}">×</button>
        `;

        let dismissed = false;
        const dismiss = () => {
          if (dismissed) return;
          dismissed = true;
          const targetLogin = login || live.login || fav.login;
          if (targetLogin && notificationKey) {
            dismissEntry({ login: targetLogin, notificationKey });
          }
        };
        const close = (shouldDismiss = false) => {
          if (shouldDismiss) dismiss();
          toast.style.animation = 'tfr-toast-out 0.2s ease forwards';
          schedule(() => toast.remove(), 200);
        };

        toast.querySelector('.tfr-toast__close')?.addEventListener('click', () => close(true));
        targetStack.prepend(toast);
        schedule(() => {
          if (toast.isConnected) {
            close(true);
          }
        }, durationMs);

        while (targetStack.childElementCount > maxVisible) {
          targetStack.lastElementChild?.remove();
        }
      });
      return true;
    };

    return {
      render,
      setPosition,
      getStack: () => stack
    };
  };

  return { createToastStackController };
});

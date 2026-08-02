(() => {
  const createFavoriteIssuesPanel = ({ store, t, defaultAvatar, onChange }) => {
    const reportError = (result) => {
      const key = result.reason === 'duplicate'
        ? 'details.login.duplicate'
        : result.reason === 'notFound'
          ? 'details.login.notFound'
          : 'details.login.unavailable';
      window.alert(t(key));
    };
    const migrate = async (favorite, login) => {
      const result = await store.migrateFavoriteLogin(favorite.login, login);
      if (!result.ok) reportError(result);
      onChange();
    };
    const button = (label, className, action) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = className;
      element.textContent = label;
      element.addEventListener('click', action);
      return element;
    };
    const renderIssue = (favorite) => {
      const item = document.createElement('article');
      item.className = 'tfr-favorite-issues__item';
      const identity = document.createElement('div');
      identity.className = 'tfr-favorite-issues__identity';
      const avatar = document.createElement('img');
      avatar.src = favorite.avatarUrl || defaultAvatar;
      avatar.alt = '';
      const names = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = favorite.displayName || favorite.login;
      const login = document.createElement('span');
      login.textContent = `@${favorite.login} \u00b7 ${t('favorites.issues.missing')}`;
      names.append(name, login);
      identity.append(avatar, names);
      const actions = document.createElement('div');
      actions.className = 'tfr-favorite-issues__actions';
      actions.append(
        button(t('details.login.fix'), 'tfr-button', async () => {
          const requested = window.prompt(t('details.login.prompt', { name: favorite.displayName }), favorite.login);
          if (requested !== null && requested.trim()) await migrate(favorite, requested);
        }),
        button(t('favorites.issues.retry'), 'tfr-button tfr-button--ghost', () => migrate(favorite, favorite.login)),
        button(t('favorites.issues.remove'), 'tfr-button tfr-button--danger', async () => {
          if (!window.confirm(t('favorites.issues.confirmRemove', { name: favorite.displayName || favorite.login }))) return;
          await store.removeFavorite(favorite.login);
          onChange();
        })
      );
      item.append(identity, actions);
      return item;
    };
    return {
      render(state) {
        const issues = Object.values(state.favorites || {}).filter((favorite) => favorite.accountStatus === 'unresolved');
        if (!issues.length) return null;
        const section = document.createElement('section');
        section.className = 'tfr-favorite-issues';
        const heading = document.createElement('h3');
        heading.textContent = t('favorites.issues.title', { count: issues.length });
        const description = document.createElement('p');
        description.textContent = t('favorites.issues.description');
        const list = document.createElement('div');
        list.className = 'tfr-favorite-issues__list';
        issues.forEach((favorite) => list.appendChild(renderIssue(favorite)));
        section.append(heading, description, list);
        return section;
      }
    };
  };
  window.TFRFavoriteIssuesPanel = { create: createFavoriteIssuesPanel };
})();

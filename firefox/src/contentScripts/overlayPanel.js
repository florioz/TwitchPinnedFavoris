(function () {

  const extensionApi = globalThis.chrome ?? globalThis.browser;
  const isStandaloneContext = Boolean(globalThis.__TFR_PANEL_STANDALONE__);

  if (!extensionApi || window.__TFR_OVERLAY_PANEL__) {

    return;

  }



  const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';

  const MAX_VISIBLE_TOASTS = 3;

  const DEFAULT_TOAST_DURATION = 5000;

  const REFRESH_INTERVAL = 90_000;



  const normalizeCategoryName = (value) => {

    if (!value) return '';

    let output = String(value).trim().toLocaleLowerCase();

    if (typeof output.normalize === 'function') {

      output = output.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    }

    return output;

  };



  const shouldDisplayFavorite = (favoriteEntry, liveEntry) => {

    if (!liveEntry || !liveEntry.isLive) {

      return false;

    }

    const filter = favoriteEntry?.categoryFilter;

    if (!filter || !filter.enabled) {

      return true;

    }

    const categories = Array.isArray(filter.categories)

      ? filter.categories

      : typeof filter.category === 'string'

      ? [filter.category]

      : [];

    if (!categories.length) {

      return true;

    }

    const requiredSet = new Set();

    categories.forEach((category) => {

      const normalized = normalizeCategoryName(category);

      if (normalized) {

        requiredSet.add(normalized);

      }

    });

    if (!requiredSet.size) {

      return true;

    }

    const currentCategory = normalizeCategoryName(liveEntry.game);

    if (!currentCategory) {

      return false;

    }

    return requiredSet.has(currentCategory);

  };



  const state = {

    isOpen: false,

    snapshot: { favorites: {}, categories: [], preferences: {}, liveData: {}, timestamp: Date.now() },

    panelEl: null,

    sectionsEl: null,

    subtitleEl: null,

    footerTimestampEl: null,

    toastStack: null,

    refreshTimer: null,

    toastDurationMs: DEFAULT_TOAST_DURATION,

    categoryCollapse: new Map()

  };



  const sendMessage = (payload) =>

    new Promise((resolve) => {

      try {

        extensionApi.runtime.sendMessage(payload, (response) => {

          const error = extensionApi.runtime.lastError;

          if (error) {

            console.warn('[TFR overlay] message error', error);

            resolve(null);

          } else {

            resolve(response);

          }

        });

      } catch (error) {

        console.warn('[TFR overlay] message exception', error);

        resolve(null);

      }

    });



  const formatNumber = (value) => {

    const number = Number(value) || 0;

    return number.toLocaleString('fr-FR');

  };



  const formatTimestamp = (timestamp) => {

    if (!timestamp) return '';

    try {

      const date = new Date(timestamp);

      if (Number.isNaN(date.getTime())) return '';

      return `Mis a jour a ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    } catch (error) {

      return '';

    }

  };



  const ensurePanelElements = () => {

    if (state.panelEl) return;

    const container = document.createElement('div');

    container.className = 'tfr-panel';
    container.classList.add(isStandaloneContext ? 'tfr-panel--standalone' : 'tfr-panel--overlay');

    container.innerHTML = `

      <div class="tfr-panel__header">

        <div>

          <p class="tfr-panel__eyebrow">Twitch Favoris</p>

          <h2 class="tfr-panel__title">Favoris en live</h2>

          <p class="tfr-panel__subtitle">Chargement...</p>

        </div>

        <div class="tfr-panel__actions">

          <button class="tfr-panel__button" data-action="refresh">Actualiser</button>

          <button class="tfr-panel__button" data-action="close">Fermer</button>

        </div>

      </div>

      <div class="tfr-panel__empty">Aucun favori enregistre.</div>

      <div class="tfr-panel__sections"></div>

      <div class="tfr-panel__footer">

        <a href="https://www.twitch.tv/directory/following/live" target="_blank" rel="noreferrer">Ouvrir Twitch</a>

        <span class="tfr-panel__timestamp"></span>

      </div>

    `;

    const host = document.body || document.documentElement;
    host.appendChild(container);



    state.panelEl = container;

    state.sectionsEl = container.querySelector('.tfr-panel__sections');

    state.subtitleEl = container.querySelector('.tfr-panel__subtitle');

    state.footerTimestampEl = container.querySelector('.tfr-panel__timestamp');



    container.addEventListener('click', (event) => {

      const actionTarget = event.target?.closest('[data-action]');

      const action = actionTarget?.dataset?.action;

      if (action === 'refresh') {

        refreshSnapshot(true);

      } else if (action === 'close') {

        if (isStandaloneContext && typeof window.close === 'function') {
          window.close();
        } else {
          setPanelOpen(false);
        }

      } else if (action === 'toggleCategory') {

        const targetId = actionTarget?.dataset?.categoryId;

        toggleCategoryCollapse(targetId);

      } else if (event.target?.matches('.tfr-panel__card, .tfr-panel__card *')) {

        const card = event.target.closest('.tfr-panel__card');

        if (card?.dataset?.login) {

          openChannel(card.dataset.login);

        }

      }

    });

  };



  const syncCollapsedState = (categories = []) => {

    const known = state.categoryCollapse;

    const seen = new Set();

    categories.forEach((category) => {

      if (!category?.id) return;

      seen.add(category.id);

      if (!known.has(category.id)) {

        known.set(category.id, Boolean(category.collapsed));

      }

    });

    if (!known.has('uncategorized')) {

      known.set('uncategorized', false);

    }

    seen.add('uncategorized');

    Array.from(known.keys()).forEach((id) => {

      if (!seen.has(id)) {

        known.delete(id);

      }

    });

  };



  const toggleCategoryCollapse = (categoryId) => {

    if (!categoryId) return;

    const current = state.categoryCollapse.get(categoryId) || false;

    state.categoryCollapse.set(categoryId, !current);

    renderSnapshot(state.snapshot);

  };





  const ensureToastStack = () => {

    if (state.toastStack) return state.toastStack;

    const stack = document.createElement('div');

    stack.className = 'tfr-toast-stack';

    const host = document.body || document.documentElement;
    host.appendChild(stack);

    state.toastStack = stack;

    return stack;

  };



  const openChannel = (login) => {

    if (!login) return;

    extensionApi.runtime.sendMessage({ type: 'TFR_OPEN_CHANNEL_TAB', login });

  };



  const buildCategoryOrder = (rawCategories = []) => {

    if (!Array.isArray(rawCategories)) return [];

    const nodes = rawCategories

      .map((category, index) => ({

        id: typeof category?.id === 'string' && category.id.trim() ? category.id.trim() : `cat_${index}`,

        name:

          typeof category?.name === 'string' && category.name.trim()

            ? category.name.trim()

            : `Categorie ${index + 1}`,

        sortOrder: typeof category?.sortOrder === 'number' ? category.sortOrder : Date.now() + index,

        parentId: typeof category?.parentId === 'string' && category.parentId.trim() ? category.parentId.trim() : null,

        collapsed: Boolean(category?.collapsed),

        children: []

      }))

      .filter((category) => category.id);



    const map = new Map(nodes.map((node) => [node.id, node]));

    nodes.forEach((node) => {

      if (!node.parentId || !map.has(node.parentId) || node.parentId === node.id) {

        node.parentId = null;

      }

    });



    const roots = [];

    nodes.forEach((node) => {

      if (node.parentId) {

        map.get(node.parentId).children.push(node);

      } else {

        roots.push(node);

      }

    });



    const sorted = [];

    const traverse = (list, depth = 0) => {

      list.sort((a, b) => {

        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;

        return a.name.localeCompare(b.name, 'fr');

      });

      list.forEach((node) => {

        sorted.push({ ...node, depth });

        if (node.children.length) {

          traverse(node.children, depth + 1);

        }

      });

    };



    traverse(roots, 0);

    return sorted;

  };



  const buildCategoryGroups = (favorites = {}, liveData = {}, categories = []) => {

    const entries = Object.values(favorites)

      .map((fav) => ({ fav, live: liveData[fav.login] }))

      .filter(({ fav, live }) => fav && live && shouldDisplayFavorite(fav, live))

      .sort((a, b) => {

        const viewA = a.live?.viewers || 0;

        const viewB = b.live?.viewers || 0;

        if (viewA !== viewB) return viewB - viewA;

        return (a.live?.displayName || a.fav.displayName || a.fav.login || '')

          .localeCompare(b.live?.displayName || b.fav.displayName || b.fav.login || '', 'fr');

      });



    const categoryOrder = buildCategoryOrder(categories);

    const grouped = [];

    const groupMap = new Map();

    categoryOrder.forEach((category) => {

      const collapsed = state.categoryCollapse.get(category.id) ?? Boolean(category.collapsed);

      const group = { category, favorites: [], depth: category.depth || 0, collapsed };

      groupMap.set(category.id, group);

      grouped.push(group);

    });



    const uncategorized = {

      category: { id: 'uncategorized', name: 'Sans categorie', collapsed: state.categoryCollapse.get('uncategorized') || false },

      favorites: [],

      depth: 0,

      collapsed: state.categoryCollapse.get('uncategorized') || false

    };



    entries.forEach((entry) => {

      const categoryId =

        Array.isArray(entry.fav?.categories) && entry.fav.categories.length ? entry.fav.categories[0] : null;

      const target = categoryId && groupMap.has(categoryId) ? groupMap.get(categoryId) : uncategorized;

      target.favorites.push(entry);

    });



    const groupsWithEntries = grouped.filter((group) => group.favorites.length);

    if (uncategorized.favorites.length) {

      groupsWithEntries.push(uncategorized);

    }



    return {

      groups: groupsWithEntries,

      totalLive: entries.length,

      totalFavorites: Object.keys(favorites).length

    };

  };



  const renderSnapshot = (snapshot) => {

    if (!snapshot) return;

    state.snapshot = snapshot;

    if (!state.panelEl) {

      ensurePanelElements();

    }

    const { favorites = {}, liveData = {}, categories = [], preferences = {} } = snapshot;

    syncCollapsedState(categories);

    const toastSeconds = Number(preferences.toastDurationSeconds);

    state.toastDurationMs = Number.isFinite(toastSeconds)

      ? Math.max(2000, Math.min(60000, Math.round(toastSeconds * 1000)))

      : DEFAULT_TOAST_DURATION;

    const { groups, totalLive, totalFavorites } = buildCategoryGroups(favorites, liveData, categories);



    state.sectionsEl.textContent = '';

    const emptyEl = state.panelEl.querySelector('.tfr-panel__empty');



    if (!totalFavorites) {

      emptyEl.textContent = 'Aucun favori enregistre.';

      emptyEl.classList.remove('tfr-hidden');

      state.subtitleEl.textContent = 'Ajoutez des favoris depuis Twitch.';

    } else if (!totalLive) {

      emptyEl.textContent = 'Aucun favori en live pour le moment.';

      emptyEl.classList.remove('tfr-hidden');

      state.subtitleEl.textContent = 'Tout est calme.';

    } else {

      emptyEl.classList.add('tfr-hidden');

      state.subtitleEl.textContent = `${totalLive} favori(s) en live.`;

    }



    groups.forEach((group) => {

      const section = document.createElement('section');

      section.className = 'tfr-panel__group';

      if (group.collapsed) {

        section.classList.add('tfr-panel__group--collapsed');

      }

      const header = document.createElement('div');

      header.className = 'tfr-panel__groupHeader';

      const categoryId = group.category?.id || 'uncategorized';

      const categoryName = group.category?.name || 'Sans categorie';
      const categoryCount = group.favorites.length;

      header.innerHTML = `

        <div class="tfr-panel__groupHeaderTitle">

          <button class="tfr-panel__groupToggle" data-action="toggleCategory" data-category-id="${categoryId}">

            <span class="tfr-panel__groupToggleIcon">&#9662;</span>

          </button>

          <span class="tfr-panel__groupLabel" data-action="toggleCategory" data-category-id="${categoryId}">

            <span class="tfr-panel__groupName">${categoryName}</span>

            <span class="tfr-panel__groupBadge">${categoryCount}</span>

          </span>

        </div>

      `;

      section.appendChild(header);



      const headerTitle = header.querySelector('.tfr-panel__groupLabel');

      if (headerTitle) {

        headerTitle.dataset.action = 'toggleCategory';

        headerTitle.dataset.categoryId = categoryId;

        headerTitle.querySelectorAll('span').forEach((span) => {

          span.dataset.action = 'toggleCategory';

          span.dataset.categoryId = categoryId;

        });

      }



      const list = document.createElement('div');

      list.className = 'tfr-panel__groupList';



      group.favorites.forEach(({ fav, live }) => {

        const card = document.createElement('div');

        card.className = 'tfr-panel__card';

        card.dataset.login = fav.login;

        card.innerHTML = `

          <img class="tfr-panel__avatar" src="${live.avatarUrl || fav.avatarUrl || DEFAULT_AVATAR}" alt="" />

          <div class="tfr-panel__details">

            <div class="tfr-panel__row">

              <span class="tfr-panel__name">${live.displayName || fav.displayName || fav.login}</span>

              <span class="tfr-panel__viewers">${formatNumber(live.viewers)} spectateurs</span>

            </div>

            <div class="tfr-panel__game">${live.game || 'Categorie inconnue'}</div>

            <div class="tfr-panel__titleLine">${live.title || 'Live sans titre'}</div>

          </div>

        `;

        list.appendChild(card);

      });



      section.appendChild(list);

      state.sectionsEl.appendChild(section);

    });



    state.footerTimestampEl.textContent = formatTimestamp(snapshot.timestamp);

  };



  const refreshSnapshot = async (forceRefresh = false) => {

    state.panelEl?.classList.add('tfr-panel--loading');

    const snapshot = await sendMessage({ type: 'TFR_GET_POPUP_STATE', forceRefresh });

    state.panelEl?.classList.remove('tfr-panel--loading');

    if (snapshot && !snapshot.error) {

      renderSnapshot(snapshot);

    } else {

      state.subtitleEl.textContent = 'Impossible de recuperer les favoris.';

    }

  };



  const clearRefreshInterval = () => {

    if (state.refreshTimer) {

      clearInterval(state.refreshTimer);

      state.refreshTimer = null;

    }

  };



  const scheduleRefreshInterval = () => {

    clearRefreshInterval();

    state.refreshTimer = setInterval(() => refreshSnapshot(false), REFRESH_INTERVAL);

  };



  const setPanelOpen = (open) => {

    ensurePanelElements();

    state.isOpen = open;

    state.panelEl.classList.toggle('tfr-open', open);

    if (open) {

      refreshSnapshot(true);

      scheduleRefreshInterval();

    } else {

      clearRefreshInterval();

    }

  };



  const displayToast = (entries = []) => {

    if (!entries.length) return;

    ensureToastStack();

    const duration = state.toastDurationMs || DEFAULT_TOAST_DURATION;

    entries.slice(0, MAX_VISIBLE_TOASTS).forEach(({ fav, live }) => {

      const toast = document.createElement('div');

      toast.className = 'tfr-toast';

      toast.innerHTML = `

        <img class="tfr-toast__thumb" src="${live.avatarUrl || fav.avatarUrl || DEFAULT_AVATAR}" alt="" />

        <div class="tfr-toast__content">

          <p class="tfr-toast__title">${live.displayName || fav.displayName || fav.login} est en live</p>

          <p class="tfr-toast__subtitle">${live.game || 'Live en cours'} &bull; ${formatNumber(live.viewers)} spectateurs</p>

        </div>

      `;

      state.toastStack.prepend(toast);

      setTimeout(() => {

        toast.style.animation = 'tfr-toast-out 0.2s ease forwards';

        setTimeout(() => toast.remove(), 200);

      }, duration);



      while (state.toastStack.childElementCount > MAX_VISIBLE_TOASTS) {

        state.toastStack.lastElementChild?.remove();

      }

    });

  };


  extensionApi.runtime.onMessage.addListener((message) => {

    if (!message) return false;

    if (message.type === 'TFR_TOGGLE_PANEL') {

      setPanelOpen(!state.isOpen);

    } else if (message.type === 'TFR_STATE_PUSH') {

      renderSnapshot(message);

    } else if (message.type === 'TFR_OVERLAY_TOAST') {

      displayToast(message.entries || []);

    }

    return false;

  });



  window.__TFR_OVERLAY_PANEL__ = true;
  if (isStandaloneContext) {

    setPanelOpen(true);

  } else {

    // Preload snapshot silently so first toggle feels instant.

    sendMessage({ type: 'TFR_GET_POPUP_STATE', forceRefresh: false }).then((snapshot) => {

      if (snapshot && !snapshot.error) {

        renderSnapshot(snapshot);

      }

    });

  }

})();





























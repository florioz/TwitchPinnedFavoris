(() => {
  const STORAGE_KEY = 'tfm_state';
  const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_DAY_OFFSET = 60;
  const VIDEO_LIMIT = 40;

  const VODS_QUERY = `
    query TfmChannelVideos($login: String!, $limit: Int!) {
      user(login: $login) {
        id
        login
        displayName
        profileImageURL(width: 96)
        videos(first: $limit, type: ARCHIVE) {
          edges {
            node {
              id
              title
              createdAt
              publishedAt
              lengthSeconds
              viewCount
              previewThumbnailURL(width: 320, height: 180)
              game { name }
            }
          }
        }
      }
    }
  `;

  const state = {
    favorites: {},
    categories: [],
    videosByLogin: new Map(),
    activeView: 'favorites',
    selectedCategoryId: 'all',
    selectedDay: startOfDay(Date.now()),
    searchTerm: '',
    isLoading: false
  };

  const elements = {
    setupCard: document.getElementById('setupCard'),
    backupInput: document.getElementById('backupInput'),
    refreshButton: document.getElementById('refreshButton'),
    searchInput: document.getElementById('searchInput'),
    groupSelect: document.getElementById('groupSelect'),
    tabs: Array.from(document.querySelectorAll('.tfm-tab')),
    favoritesView: document.getElementById('favoritesView'),
    vodsView: document.getElementById('vodsView'),
    previousDayButton: document.getElementById('previousDayButton'),
    nextDayButton: document.getElementById('nextDayButton'),
    dayInput: document.getElementById('dayInput'),
    vodSummary: document.getElementById('vodSummary'),
    vodList: document.getElementById('vodList')
  };

  function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function formatDateValue(timestamp) {
    const date = new Date(timestamp);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function parseDateValue(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return startOfDay(Date.now());
    return startOfDay(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  function clampDay(timestamp) {
    const today = startOfDay(Date.now());
    const oldest = today - MAX_DAY_OFFSET * DAY_MS;
    return Math.min(today, Math.max(oldest, startOfDay(timestamp)));
  }

  function formatDuration(seconds = 0) {
    const safe = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    return hours ? `${hours}h${String(minutes).padStart(2, '0')}` : `${minutes || 1} min`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function readLocalState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.favorites = stored.favorites && typeof stored.favorites === 'object' ? stored.favorites : {};
      state.categories = Array.isArray(stored.categories) ? stored.categories : [];
    } catch {
      state.favorites = {};
      state.categories = [];
    }
  }

  function persistLocalState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      favorites: state.favorites,
      categories: state.categories
    }));
  }

  function normalizeBackup(payload = {}) {
    const favorites = payload.favorites && typeof payload.favorites === 'object' ? payload.favorites : {};
    const categories = Array.isArray(payload.categories) ? payload.categories : [];
    state.favorites = Object.fromEntries(
      Object.entries(favorites)
        .map(([login, favorite]) => {
          const normalized = String(favorite?.login || login || '').toLowerCase();
          if (!normalized) return null;
          return [normalized, {
            login: normalized,
            displayName: favorite?.displayName || normalized,
            avatarUrl: favorite?.avatarUrl || DEFAULT_AVATAR,
            categories: Array.isArray(favorite?.categories) ? favorite.categories : [],
            categoryFilter: favorite?.categoryFilter || { enabled: false, categories: [] }
          }];
        })
        .filter(Boolean)
    );
    state.categories = categories
      .filter((category) => category && typeof category.id === 'string')
      .map((category, index) => ({
        id: category.id,
        name: typeof category.name === 'string' && category.name.trim() ? category.name.trim() : `Groupe ${index + 1}`,
        parentId: typeof category.parentId === 'string' && category.parentId.trim() ? category.parentId : null,
        sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : index * 1000
      }));
    persistLocalState();
  }

  function getCategoryTree() {
    const nodes = state.categories.map((category) => ({ ...category, children: [] }));
    const byId = new Map(nodes.map((category) => [category.id, category]));
    const roots = [];
    nodes.forEach((category) => {
      if (category.parentId && byId.has(category.parentId)) {
        byId.get(category.parentId).children.push(category);
      } else {
        category.parentId = null;
        roots.push(category);
      }
    });
    const sortNodes = (items) => {
      items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, 'fr'));
      items.forEach((item) => sortNodes(item.children));
    };
    sortNodes(roots);
    return roots;
  }

  function flattenCategories(nodes = getCategoryTree(), depth = 0, output = []) {
    nodes.forEach((node) => {
      output.push({ ...node, depth });
      flattenCategories(node.children, depth + 1, output);
    });
    return output;
  }

  function collectDescendantIds(categoryId) {
    const result = new Set();
    const visit = (nodes) => {
      nodes.forEach((node) => {
        if (node.id === categoryId || result.has(node.parentId)) {
          result.add(node.id);
        }
        visit(node.children || []);
      });
    };
    visit(getCategoryTree());
    return result;
  }

  function getVisibleFavorites() {
    const term = state.searchTerm.trim().toLowerCase();
    const allowed = state.selectedCategoryId === 'all' ? null : collectDescendantIds(state.selectedCategoryId);
    return Object.values(state.favorites)
      .filter((favorite) => {
        if (allowed && !favorite.categories?.some((id) => allowed.has(id))) return false;
        if (!term) return true;
        return (
          favorite.displayName.toLowerCase().includes(term) ||
          favorite.login.toLowerCase().includes(term) ||
          getCategoryNames(favorite).some((name) => name.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }));
  }

  function getCategoryNames(favorite) {
    const byId = new Map(state.categories.map((category) => [category.id, category.name]));
    return (favorite.categories || []).map((id) => byId.get(id)).filter(Boolean);
  }

  async function fetchChannelVods(login) {
    const response = await fetch(TWITCH_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: VODS_QUERY,
        variables: { login, limit: VIDEO_LIMIT }
      })
    });
    if (!response.ok) throw new Error(`Twitch ${response.status}`);
    const payload = await response.json();
    const user = payload?.data?.user;
    if (!user) return null;
    return {
      login: user.login || login,
      displayName: user.displayName || login,
      avatarUrl: user.profileImageURL || state.favorites[login]?.avatarUrl || DEFAULT_AVATAR,
      videos: (user.videos?.edges || [])
        .map((edge) => edge?.node)
        .filter(Boolean)
        .map((video) => ({
          id: video.id,
          title: video.title || 'VOD Twitch',
          createdAt: video.createdAt || video.publishedAt,
          lengthSeconds: Number(video.lengthSeconds) || 0,
          viewCount: Number(video.viewCount) || 0,
          thumbnailUrl: video.previewThumbnailURL || '',
          game: video.game?.name || '',
          url: `https://www.twitch.tv/videos/${video.id}`
        }))
        .filter((video) => video.id && video.createdAt)
    };
  }

  async function refreshVods() {
    const favorites = getVisibleFavorites();
    state.isLoading = true;
    renderVods();
    const results = await Promise.allSettled(favorites.map((favorite) => fetchChannelVods(favorite.login)));
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        state.videosByLogin.set(result.value.login.toLowerCase(), result.value);
      }
    });
    state.isLoading = false;
    ensureDayHasContent();
    renderVods();
  }

  function ensureDayHasContent() {
    if (getVisibleVideos().length) return;
    const days = [];
    getVisibleFavorites().forEach((favorite) => {
      const channel = state.videosByLogin.get(favorite.login);
      channel?.videos.forEach((video) => days.push(startOfDay(video.createdAt)));
    });
    if (days.length) {
      state.selectedDay = Math.max(...days);
    }
  }

  function getVisibleVideos() {
    const dayStart = Number(state.selectedDay);
    const dayEnd = dayStart + DAY_MS;
    const term = state.searchTerm.trim().toLowerCase();
    return getVisibleFavorites()
      .flatMap((favorite) => {
        const channel = state.videosByLogin.get(favorite.login);
        if (!channel) return [];
        return channel.videos
          .filter((video) => {
            const startedAt = new Date(video.createdAt).getTime();
            if (startedAt < dayStart || startedAt >= dayEnd) return false;
            if (!term) return true;
            return video.title.toLowerCase().includes(term) || video.game.toLowerCase().includes(term);
          })
          .map((video) => ({ channel, video }));
      })
      .sort((a, b) => new Date(a.video.createdAt).getTime() - new Date(b.video.createdAt).getTime());
  }

  function renderFilters() {
    elements.setupCard.hidden = Object.keys(state.favorites).length > 0;
    const selected = state.selectedCategoryId;
    elements.groupSelect.innerHTML = '<option value="all">Tous les groupes</option>';
    flattenCategories().forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = `${category.depth ? '  '.repeat(category.depth) + '- ' : ''}${category.name}`;
      elements.groupSelect.appendChild(option);
    });
    elements.groupSelect.value = selected;

    const today = startOfDay(Date.now());
    const oldest = today - MAX_DAY_OFFSET * DAY_MS;
    elements.dayInput.min = formatDateValue(oldest);
    elements.dayInput.max = formatDateValue(today);
    elements.dayInput.value = formatDateValue(state.selectedDay);
    elements.previousDayButton.disabled = state.selectedDay <= oldest;
    elements.nextDayButton.disabled = state.selectedDay >= today;
  }

  function renderFavorites() {
    const favorites = getVisibleFavorites();
    if (!favorites.length) {
      elements.favoritesView.innerHTML = '<p class="tfm-empty">Aucun streamer a afficher.</p>';
      return;
    }
    const byCategory = new Map();
    const uncategorized = [];
    favorites.forEach((favorite) => {
      const categoryId = favorite.categories?.[0];
      if (!categoryId) {
        uncategorized.push(favorite);
        return;
      }
      if (!byCategory.has(categoryId)) byCategory.set(categoryId, []);
      byCategory.get(categoryId).push(favorite);
    });
    const cards = flattenCategories()
      .map((category) => renderCategoryCard(category, byCategory.get(category.id) || []))
      .filter(Boolean);
    if (uncategorized.length) {
      cards.unshift(renderCategoryCard({ name: 'Sans groupe' }, uncategorized));
    }
    elements.favoritesView.innerHTML = cards.join('') || '<p class="tfm-empty">Aucun streamer dans ce groupe.</p>';
  }

  function renderCategoryCard(category, favorites) {
    if (!favorites.length && state.selectedCategoryId !== 'all') return '';
    if (!favorites.length) return '';
    return `
      <article class="tfm-card">
        <header class="tfm-card__header">
          <h2>${escapeHtml(category.name)}</h2>
          <span class="tfm-count">${favorites.length}</span>
        </header>
        <div class="tfm-streamers">
          ${favorites.map(renderStreamer).join('')}
        </div>
      </article>
    `;
  }

  function renderStreamer(favorite) {
    const liveLabel = favorite.categoryFilter?.enabled ? '<small>Filtre Twitch actif</small>' : '';
    return `
      <a class="tfm-streamer" href="https://www.twitch.tv/${escapeHtml(favorite.login)}" target="_blank" rel="noopener noreferrer">
        <img src="${escapeHtml(favorite.avatarUrl || DEFAULT_AVATAR)}" alt="" />
        <span>
          <strong>${escapeHtml(favorite.displayName || favorite.login)}</strong>
          <small>@${escapeHtml(favorite.login)}</small>
          ${liveLabel}
        </span>
      </a>
    `;
  }

  function renderVods() {
    const videos = getVisibleVideos();
    elements.refreshButton.disabled = state.isLoading;
    elements.refreshButton.textContent = state.isLoading ? 'Chargement...' : 'Actualiser';
    elements.vodSummary.textContent = state.isLoading
      ? 'Chargement des VODs Twitch...'
      : `${videos.length} VOD${videos.length > 1 ? 's' : ''}`;
    elements.vodList.innerHTML = videos.length
      ? videos.map(renderVod).join('')
      : '<p class="tfm-empty">Aucune VOD pour ce jour et ce groupe.</p>';
  }

  function renderVod({ channel, video }) {
    const startedAt = new Date(video.createdAt);
    return `
      <a class="tfm-vod" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">
        <img src="${escapeHtml(video.thumbnailUrl || channel.avatarUrl || DEFAULT_AVATAR)}" alt="" />
        <span>
          <strong>${escapeHtml(video.title)}</strong>
          <small>${escapeHtml(channel.displayName)} - ${startedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${escapeHtml(formatDuration(video.lengthSeconds))}</small>
          <small>${Number(video.viewCount || 0).toLocaleString('fr-FR')} vues${video.game ? ` - ${escapeHtml(video.game)}` : ''}</small>
        </span>
      </a>
    `;
  }

  function setView(view) {
    state.activeView = view;
    elements.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === view));
    elements.favoritesView.hidden = view !== 'favorites';
    elements.vodsView.hidden = view !== 'vods';
    if (view === 'vods' && !state.videosByLogin.size) {
      refreshVods();
    }
  }

  function render() {
    renderFilters();
    renderFavorites();
    renderVods();
  }

  function bindEvents() {
    elements.tabs.forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
    elements.searchInput.addEventListener('input', (event) => {
      state.searchTerm = event.target.value || '';
      renderFavorites();
      renderVods();
    });
    elements.groupSelect.addEventListener('change', (event) => {
      state.selectedCategoryId = event.target.value || 'all';
      ensureDayHasContent();
      render();
    });
    elements.refreshButton.addEventListener('click', refreshVods);
    elements.previousDayButton.addEventListener('click', () => {
      state.selectedDay = clampDay(state.selectedDay - DAY_MS);
      renderFilters();
      renderVods();
    });
    elements.nextDayButton.addEventListener('click', () => {
      state.selectedDay = clampDay(state.selectedDay + DAY_MS);
      renderFilters();
      renderVods();
    });
    elements.dayInput.addEventListener('change', (event) => {
      state.selectedDay = clampDay(parseDateValue(event.target.value));
      renderFilters();
      renderVods();
    });
    elements.backupInput.addEventListener('change', async (event) => {
      const [file] = event.target.files || [];
      if (!file) return;
      normalizeBackup(JSON.parse(await file.text()));
      state.videosByLogin.clear();
      render();
    });
  }

  readLocalState();
  bindEvents();
  render();
})();

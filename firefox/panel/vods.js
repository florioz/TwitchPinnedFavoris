(() => {
  const extensionApi = globalThis.chrome ?? globalThis.browser;
  const STORAGE_KEY = 'tfr_state';
  const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_WIDTH = 144;
  const TIMELINE_HOURS = 24;
  const VIDEO_LIMIT = 12;

  const VODS_QUERY = `
    query TfrChannelVideos($login: String!, $limit: Int!) {
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
              previewThumbnailURL(width: 320, height: 180)
              game {
                name
              }
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
    selectedCategoryId: 'all',
    selectedDay: startOfDay(new Date()).getTime(),
    searchTerm: '',
    isLoading: false
  };

  const elements = {
    refreshButton: document.getElementById('refreshButton'),
    searchInput: document.getElementById('searchInput'),
    groupSelect: document.getElementById('groupSelect'),
    daySelect: document.getElementById('daySelect'),
    summary: document.getElementById('summary'),
    timeline: document.getElementById('timeline'),
    emptyState: document.getElementById('emptyState')
  };

  function startOfDay(date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function formatHour(hour) {
    return `${String(hour).padStart(2, '0')}h`;
  }

  function formatDuration(seconds = 0) {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    if (hours) {
      return `${hours}h${String(minutes).padStart(2, '0')}`;
    }
    return `${minutes || 1} min`;
  }

  function formatDayLabel(timestamp) {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'short'
    }).format(date);
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

  function sanitizeCategories(categories = []) {
    const byId = new Map();
    categories.forEach((category) => {
      if (!category || typeof category.id !== 'string') return;
      byId.set(category.id, {
        id: category.id,
        name: typeof category.name === 'string' && category.name.trim() ? category.name.trim() : 'Groupe',
        parentId: typeof category.parentId === 'string' && category.parentId.trim() ? category.parentId : null,
        sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : 0,
        children: []
      });
    });
    const roots = [];
    byId.forEach((category) => {
      if (category.parentId && byId.has(category.parentId)) {
        byId.get(category.parentId).children.push(category);
      } else {
        category.parentId = null;
        roots.push(category);
      }
    });
    const sortTree = (nodes) => {
      nodes.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, 'fr');
      });
      nodes.forEach((node) => sortTree(node.children));
    };
    sortTree(roots);
    return roots;
  }

  function flattenCategories(nodes, depth = 0, output = []) {
    nodes.forEach((node) => {
      output.push({ ...node, depth });
      flattenCategories(node.children || [], depth + 1, output);
    });
    return output;
  }

  function collectDescendantIds(categoryId) {
    const tree = sanitizeCategories(state.categories);
    const stack = [...tree];
    const result = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (node.id === categoryId || result.has(node.parentId)) {
        result.add(node.id);
      }
      stack.push(...(node.children || []));
    }
    return result;
  }

  async function readStoredState() {
    const stored = await extensionApi.storage.local.get(STORAGE_KEY);
    const payload = stored?.[STORAGE_KEY] || {};
    state.favorites = payload.favorites && typeof payload.favorites === 'object' ? payload.favorites : {};
    state.categories = Array.isArray(payload.categories) ? payload.categories : [];
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
    if (!response.ok) {
      throw new Error(`Twitch ${response.status}`);
    }
    const payload = await response.json();
    const user = payload?.data?.user;
    if (!user) {
      return null;
    }
    const videos = (user.videos?.edges || [])
      .map((edge) => edge?.node)
      .filter(Boolean)
      .map((video) => ({
        id: video.id,
        title: video.title || 'VOD Twitch',
        createdAt: video.createdAt || video.publishedAt,
        lengthSeconds: Number(video.lengthSeconds) || 0,
        thumbnailUrl: video.previewThumbnailURL || '',
        game: video.game?.name || '',
        url: `https://www.twitch.tv/videos/${video.id}`
      }))
      .filter((video) => video.id && video.createdAt);
    return {
      login: user.login || login,
      displayName: user.displayName || login,
      avatarUrl: user.profileImageURL || state.favorites[login]?.avatarUrl || DEFAULT_AVATAR,
      videos
    };
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const results = [];
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const currentIndex = index++;
        try {
          results[currentIndex] = await mapper(items[currentIndex]);
        } catch (error) {
          console.warn('[TFR VODs] fetch failed', items[currentIndex], error);
          results[currentIndex] = null;
        }
      }
    });
    await Promise.all(workers);
    return results;
  }

  function getFilteredLogins() {
    const favorites = Object.values(state.favorites);
    if (state.selectedCategoryId === 'all') {
      return favorites.map((fav) => fav.login).filter(Boolean);
    }
    if (state.selectedCategoryId === 'uncategorized') {
      return favorites
        .filter((fav) => !Array.isArray(fav.categories) || !fav.categories.length)
        .map((fav) => fav.login)
        .filter(Boolean);
    }
    const allowed = collectDescendantIds(state.selectedCategoryId);
    return favorites
      .filter((fav) => {
        const categoryId = Array.isArray(fav.categories) && fav.categories.length ? fav.categories[0] : null;
        return categoryId && allowed.has(categoryId);
      })
      .map((fav) => fav.login)
      .filter(Boolean);
  }

  function getVisibleRows() {
    const selectedDay = Number(state.selectedDay);
    const dayEnd = selectedDay + DAY_MS;
    const term = state.searchTerm.trim().toLowerCase();
    return getFilteredLogins()
      .map((login) => state.videosByLogin.get(login))
      .filter(Boolean)
      .map((channel) => {
        const videos = channel.videos.filter((video) => {
          const start = new Date(video.createdAt).getTime();
          const matchesDay = start >= selectedDay && start < dayEnd;
          if (!matchesDay) return false;
          if (!term) return true;
          return (
            channel.displayName.toLowerCase().includes(term) ||
            channel.login.toLowerCase().includes(term) ||
            video.title.toLowerCase().includes(term) ||
            video.game.toLowerCase().includes(term)
          );
        });
        return { ...channel, videos };
      })
      .filter((channel) => channel.videos.length)
      .sort((a, b) => {
        const aStart = new Date(a.videos[0].createdAt).getTime();
        const bStart = new Date(b.videos[0].createdAt).getTime();
        return aStart - bStart || a.displayName.localeCompare(b.displayName, 'fr');
      });
  }

  function renderFilters() {
    const currentGroup = state.selectedCategoryId;
    elements.groupSelect.innerHTML = '';
    [
      { id: 'all', name: 'Tous les groupes', depth: 0 },
      { id: 'uncategorized', name: 'Sans groupe', depth: 0 },
      ...flattenCategories(sanitizeCategories(state.categories))
    ].forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = `${category.depth ? '  '.repeat(category.depth) + '- ' : ''}${category.name}`;
      elements.groupSelect.appendChild(option);
    });
    elements.groupSelect.value = currentGroup;

    elements.daySelect.innerHTML = '';
    const today = startOfDay(new Date()).getTime();
    for (let offset = 0; offset < 8; offset += 1) {
      const timestamp = today - offset * DAY_MS;
      const option = document.createElement('option');
      option.value = String(timestamp);
      option.textContent = offset === 0 ? `Aujourd'hui - ${formatDayLabel(timestamp)}` : formatDayLabel(timestamp);
      elements.daySelect.appendChild(option);
    }
    elements.daySelect.value = String(state.selectedDay);
  }

  function renderTimeline() {
    const rows = getVisibleRows();
    elements.timeline.innerHTML = '';
    elements.emptyState.hidden = rows.length > 0 || state.isLoading;

    const header = document.createElement('div');
    header.className = 'tfr-vods-time-header';
    header.appendChild(document.createElement('div'));
    const hours = document.createElement('div');
    hours.className = 'tfr-vods-hours';
    hours.style.width = `${TIMELINE_HOURS * HOUR_WIDTH}px`;
    for (let hour = 0; hour < TIMELINE_HOURS; hour += 1) {
      const label = document.createElement('span');
      label.textContent = formatHour(hour);
      hours.appendChild(label);
    }
    header.appendChild(hours);
    elements.timeline.appendChild(header);

    rows.forEach((channel) => {
      const row = document.createElement('article');
      row.className = 'tfr-vods-row';

      const streamer = document.createElement('a');
      streamer.className = 'tfr-vods-streamer';
      streamer.href = `https://www.twitch.tv/${channel.login}`;
      streamer.target = '_blank';
      streamer.rel = 'noopener noreferrer';
      streamer.innerHTML = `
        <img src="${escapeHtml(channel.avatarUrl || DEFAULT_AVATAR)}" alt="" />
        <span>${escapeHtml(channel.displayName)}</span>
      `;
      row.appendChild(streamer);

      const track = document.createElement('div');
      track.className = 'tfr-vods-track';
      track.style.width = `${TIMELINE_HOURS * HOUR_WIDTH}px`;
      channel.videos.forEach((video) => {
        const start = new Date(video.createdAt);
        const minuteOfDay = start.getHours() * 60 + start.getMinutes();
        const left = (minuteOfDay / 60) * HOUR_WIDTH;
        const width = Math.max(150, Math.min(520, ((video.lengthSeconds || 3600) / 3600) * HOUR_WIDTH));
        const card = document.createElement('a');
        card.className = 'tfr-vods-card';
        card.href = video.url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.style.left = `${left}px`;
        card.style.width = `${width}px`;
        card.innerHTML = `
          ${video.thumbnailUrl ? `<img src="${escapeHtml(video.thumbnailUrl)}" alt="" />` : ''}
          <span class="tfr-vods-card__title">${escapeHtml(video.title)}</span>
          <span class="tfr-vods-card__meta">${escapeHtml(start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))} · ${escapeHtml(formatDuration(video.lengthSeconds))}${video.game ? ` · ${escapeHtml(video.game)}` : ''}</span>
        `;
        track.appendChild(card);
      });
      row.appendChild(track);
      elements.timeline.appendChild(row);
    });

    const totalVideos = rows.reduce((sum, row) => sum + row.videos.length, 0);
    elements.summary.textContent = state.isLoading
      ? 'Chargement des VODs Twitch...'
      : `${rows.length} streamer${rows.length > 1 ? 's' : ''} · ${totalVideos} VOD${totalVideos > 1 ? 's' : ''}`;
  }

  async function refreshData() {
    state.isLoading = true;
    elements.refreshButton.disabled = true;
    renderTimeline();
    await readStoredState();
    renderFilters();
    const logins = Object.values(state.favorites)
      .map((fav) => fav.login)
      .filter(Boolean);
    const channels = await mapWithConcurrency(logins, 4, fetchChannelVods);
    state.videosByLogin = new Map();
    channels.filter(Boolean).forEach((channel) => {
      state.videosByLogin.set(channel.login.toLowerCase(), channel);
    });
    state.isLoading = false;
    elements.refreshButton.disabled = false;
    renderTimeline();
  }

  function bindEvents() {
    elements.refreshButton.addEventListener('click', () => refreshData());
    elements.searchInput.addEventListener('input', (event) => {
      state.searchTerm = event.target.value || '';
      renderTimeline();
    });
    elements.groupSelect.addEventListener('change', (event) => {
      state.selectedCategoryId = event.target.value || 'all';
      renderTimeline();
    });
    elements.daySelect.addEventListener('change', (event) => {
      state.selectedDay = Number(event.target.value) || startOfDay(new Date()).getTime();
      renderTimeline();
    });
  }

  bindEvents();
  refreshData();
})();

(() => {
  const extensionApi = globalThis.chrome ?? globalThis.browser;
  const STORAGE_KEY = 'tfr_state';
  const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_WIDTH = 144;
  const MAX_DAY_OFFSET = 60;
  const MAX_TIMELINE_HOURS = 24;
  const MIN_TIMELINE_HOURS = 4;
  const VIDEO_LIMIT = 60;
  const CLIP_PAGE_LIMIT = 100;
  const CLIP_MAX_PAGES = 4;

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
              viewCount
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

  const CLIPS_QUERY = `
    query TfrChannelClips($login: String!, $limit: Int!, $period: ClipsPeriod!, $cursor: Cursor) {
      user(login: $login) {
        clips(first: $limit, after: $cursor, criteria: { period: $period }) {
          pageInfo {
            hasNextPage
          }
          edges {
            cursor
            node {
              id
              slug
              title
              url
              createdAt
              durationSeconds
              viewCount
              thumbnailURL(width: 320, height: 180)
              curator {
                login
                displayName
              }
              game {
                name
              }
              video {
                id
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
    clipsByVideoId: new Map(),
    selectedCategoryId: 'all',
    selectedDay: startOfDay(new Date()).getTime(),
    searchTerm: '',
    sortKey: 'views',
    sortDirection: 'desc',
    selectedVideo: null,
    clipsLoadingVideoId: null,
    clipsError: '',
    isLoading: false,
    loadingProgress: { done: 0, total: 0 }
  };

  const elements = {
    refreshButton: document.getElementById('refreshButton'),
    searchInput: document.getElementById('searchInput'),
    groupSelect: document.getElementById('groupSelect'),
    sortSelect: document.getElementById('sortSelect'),
    sortDirectionButton: document.getElementById('sortDirectionButton'),
    previousDayButton: document.getElementById('previousDayButton'),
    nextDayButton: document.getElementById('nextDayButton'),
    dayInput: document.getElementById('dayInput'),
    dayHint: document.getElementById('dayHint'),
    summary: document.getElementById('summary'),
    timeline: document.getElementById('timeline'),
    vodInspector: document.getElementById('vodInspector'),
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

  function formatLongDateTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return '';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function formatDayLabel(timestamp) {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'short'
    }).format(date);
  }

  function formatDateValue(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateValue(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) {
      return startOfDay(new Date()).getTime();
    }
    return startOfDay(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getTime();
  }

  function getClipPeriodForVideo(video) {
    const startedAt = new Date(video?.createdAt || 0).getTime();
    const ageMs = Date.now() - startedAt;
    if (!Number.isFinite(ageMs) || ageMs < 0) {
      return 'LAST_DAY';
    }
    if (ageMs <= DAY_MS) {
      return 'LAST_DAY';
    }
    if (ageMs <= 7 * DAY_MS) {
      return 'LAST_WEEK';
    }
    if (ageMs <= 30 * DAY_MS) {
      return 'LAST_MONTH';
    }
    return 'ALL_TIME';
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
        viewCount: Number(video.viewCount) || 0,
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

  async function fetchVideoClipsPage(channel, period, cursor = null) {
    const response = await fetch(TWITCH_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: CLIPS_QUERY,
        variables: {
          login: channel.login,
          limit: CLIP_PAGE_LIMIT,
          period,
          cursor
        }
      })
    });
    if (!response.ok) {
      throw new Error(`Twitch clips ${response.status}`);
    }
    const payload = await response.json();
    if (Array.isArray(payload?.errors) && payload.errors.length) {
      throw new Error(payload.errors[0]?.message || 'Twitch clips query failed');
    }
    return payload?.data?.user?.clips || { edges: [], pageInfo: { hasNextPage: false } };
  }

  async function fetchVideoClips(channel, video) {
    if (!channel?.login || !video?.id || !video.createdAt) {
      return [];
    }
    const startedAt = new Date(video.createdAt);
    const endedAt = new Date(startedAt.getTime() + Math.max(1, video.lengthSeconds || 1) * 1000);
    const period = getClipPeriodForVideo(video);
    const edges = [];
    let cursor = null;
    for (let page = 0; page < CLIP_MAX_PAGES; page += 1) {
      const pageData = await fetchVideoClipsPage(channel, period, cursor);
      const pageEdges = Array.isArray(pageData?.edges) ? pageData.edges : [];
      edges.push(...pageEdges);
      const nextCursor = pageEdges[pageEdges.length - 1]?.cursor || null;
      if (!pageData?.pageInfo?.hasNextPage || !nextCursor || nextCursor === cursor) {
        break;
      }
      cursor = nextCursor;
    }
    return edges
      .map((edge) => edge?.node)
      .filter(Boolean)
      .filter((clip) => {
        const clipVideoId = clip.video?.id ? String(clip.video.id) : '';
        if (clipVideoId) {
          return clipVideoId === String(video.id);
        }
        const createdAt = new Date(clip.createdAt || 0).getTime();
        return Number.isFinite(createdAt) && createdAt >= startedAt.getTime() && createdAt <= endedAt.getTime();
      })
      .filter((clip, index, clips) => {
        const key = clip.id || clip.slug;
        return key && clips.findIndex((candidate) => (candidate.id || candidate.slug) === key) === index;
      })
      .map((clip) => {
        const createdAt = clip.createdAt || '';
        const estimatedOffset = createdAt ? Math.max(0, Math.round((new Date(createdAt).getTime() - startedAt.getTime()) / 1000)) : 0;
        return {
          id: clip.id || clip.slug,
          slug: clip.slug || clip.id,
          title: clip.title || 'Clip Twitch',
          url: clip.url || (clip.slug ? `https://clips.twitch.tv/${clip.slug}` : ''),
          createdAt,
          offsetSeconds: estimatedOffset,
          durationSeconds: Number(clip.durationSeconds) || 0,
          viewCount: Number(clip.viewCount) || 0,
          thumbnailUrl: clip.thumbnailURL || '',
          curator: clip.curator?.displayName || clip.curator?.login || '',
          game: clip.game?.name || '',
          videoId: clip.video?.id || ''
        };
      })
      .filter((clip) => clip.id)
      .sort((a, b) => a.offsetSeconds - b.offsetSeconds || b.viewCount - a.viewCount);
  }

  async function mapWithConcurrency(items, limit, mapper, onProgress) {
    const results = [];
    let index = 0;
    let completed = 0;
    const reportProgress = () => {
      completed += 1;
      if (typeof onProgress === 'function') {
        onProgress(completed, items.length);
      }
    };
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const currentIndex = index++;
        try {
          results[currentIndex] = await mapper(items[currentIndex]);
        } catch (error) {
          console.warn('[TFR VODs] fetch failed', items[currentIndex], error);
          results[currentIndex] = null;
        } finally {
          reportProgress();
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
    const rows = getFilteredLogins()
      .map((login) => state.videosByLogin.get(String(login).toLowerCase()))
      .filter(Boolean)
      .map((channel) => {
        const videos = channel.videos
          .filter((video) => {
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
          })
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return { ...channel, videos, metrics: getRowMetrics({ ...channel, videos }) };
      })
      .filter((channel) => channel.videos.length);
    return sortRows(rows);
  }

  function getRowMetrics(channel) {
    const starts = channel.videos
      .map((video) => new Date(video.createdAt).getTime())
      .filter(Number.isFinite);
    const totalViews = channel.videos.reduce((sum, video) => sum + (Number(video.viewCount) || 0), 0);
    const totalDuration = channel.videos.reduce((sum, video) => sum + (Number(video.lengthSeconds) || 0), 0);
    return {
      firstStart: starts.length ? Math.min(...starts) : Number.MAX_SAFE_INTEGER,
      lastStart: starts.length ? Math.max(...starts) : 0,
      totalViews,
      totalDuration,
      videoCount: channel.videos.length,
      name: channel.displayName || channel.login || ''
    };
  }

  function compareRows(a, b, key) {
    const byName = a.metrics.name.localeCompare(b.metrics.name, 'fr', { sensitivity: 'base' });
    if (key === 'name') {
      return byName || a.metrics.firstStart - b.metrics.firstStart;
    }
    if (key === 'views') {
      return (
        a.metrics.totalViews - b.metrics.totalViews ||
        a.metrics.videoCount - b.metrics.videoCount ||
        a.metrics.totalDuration - b.metrics.totalDuration ||
        b.metrics.firstStart - a.metrics.firstStart ||
        byName
      );
    }
    if (key === 'duration') {
      return (
        a.metrics.totalDuration - b.metrics.totalDuration ||
        a.metrics.videoCount - b.metrics.videoCount ||
        a.metrics.totalViews - b.metrics.totalViews ||
        byName
      );
    }
    if (key === 'videos') {
      return (
        a.metrics.videoCount - b.metrics.videoCount ||
        a.metrics.totalViews - b.metrics.totalViews ||
        a.metrics.totalDuration - b.metrics.totalDuration ||
        byName
      );
    }
    return a.metrics.firstStart - b.metrics.firstStart || byName;
  }

  function sortRows(rows) {
    const direction = state.sortDirection === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const result = compareRows(a, b, state.sortKey);
      return result * direction || a.login.localeCompare(b.login, 'fr', { sensitivity: 'base' });
    });
  }

  function clampDay(timestamp) {
    const today = startOfDay(new Date()).getTime();
    const oldest = today - MAX_DAY_OFFSET * DAY_MS;
    return Math.min(today, Math.max(oldest, startOfDay(new Date(timestamp)).getTime()));
  }

  function moveSelectedDay(offset) {
    state.selectedDay = clampDay(Number(state.selectedDay) + offset * DAY_MS);
    renderFilters();
    renderTimeline();
  }

  function getDayCounts(logins = getFilteredLogins()) {
    const today = startOfDay(new Date()).getTime();
    const oldest = today - MAX_DAY_OFFSET * DAY_MS;
    const counts = new Map();
    logins
      .map((login) => state.videosByLogin.get(String(login).toLowerCase()))
      .filter(Boolean)
      .forEach((channel) => {
        channel.videos.forEach((video) => {
          const timestamp = new Date(video.createdAt).getTime();
          if (!Number.isFinite(timestamp) || timestamp < oldest || timestamp >= today + DAY_MS) {
            return;
          }
          const day = startOfDay(new Date(timestamp)).getTime();
          counts.set(day, (counts.get(day) || 0) + 1);
        });
      });
    return counts;
  }

  function ensureSelectedDayHasContent() {
    if (state.searchTerm.trim()) {
      return;
    }
    if (getVisibleRows().length) {
      return;
    }
    const counts = getDayCounts();
    const latestDay = Array.from(counts.keys()).sort((a, b) => b - a)[0];
    if (latestDay) {
      state.selectedDay = latestDay;
    }
  }

  function getTimelineWindow(rows) {
    const starts = [];
    const ends = [];
    rows.forEach((channel) => {
      channel.videos.forEach((video) => {
        const start = new Date(video.createdAt);
        const minute = start.getHours() * 60 + start.getMinutes();
        starts.push(minute);
        ends.push(Math.min(MAX_TIMELINE_HOURS * 60, minute + Math.ceil((video.lengthSeconds || 3600) / 60)));
      });
    });
    if (!starts.length) {
      return { startHour: 0, hourCount: MAX_TIMELINE_HOURS, width: MAX_TIMELINE_HOURS * HOUR_WIDTH };
    }
    const startHour = Math.max(0, Math.floor(Math.min(...starts) / 60));
    const desiredEndHour = Math.min(MAX_TIMELINE_HOURS, Math.ceil(Math.max(...ends) / 60));
    const hourCount = Math.max(MIN_TIMELINE_HOURS, desiredEndHour - startHour);
    return {
      startHour,
      hourCount: Math.min(MAX_TIMELINE_HOURS - startHour, hourCount),
      width: Math.min(MAX_TIMELINE_HOURS - startHour, hourCount) * HOUR_WIDTH
    };
  }

  function findVideoContext(videoId) {
    if (!videoId) {
      return null;
    }
    for (const channel of state.videosByLogin.values()) {
      const video = channel.videos.find((item) => item.id === videoId);
      if (video) {
        return { channel, video };
      }
    }
    return null;
  }

  async function selectVideo(channel, video) {
    if (!channel || !video) {
      return;
    }
    if (state.selectedVideo?.videoId === video.id) {
      closeInspector();
      return;
    }
    state.selectedVideo = { login: channel.login, videoId: video.id };
    state.clipsError = '';
    renderTimeline();
    renderInspector();
    elements.vodInspector?.scrollIntoView({ block: 'nearest' });
    if (state.clipsByVideoId.has(video.id)) {
      return;
    }
    state.clipsLoadingVideoId = video.id;
    renderInspector();
    try {
      const clips = await fetchVideoClips(channel, video);
      state.clipsByVideoId.set(video.id, clips);
    } catch (error) {
      console.warn('[TFR VODs] clips fetch failed', channel.login, video.id, error);
      state.clipsByVideoId.set(video.id, []);
      state.clipsError = 'Impossible de charger les clips associes pour le moment.';
    } finally {
      if (state.clipsLoadingVideoId === video.id) {
        state.clipsLoadingVideoId = null;
      }
      renderInspector();
    }
  }

  function closeInspector() {
    state.selectedVideo = null;
    state.clipsError = '';
    renderTimeline();
    renderInspector();
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

    const dayCounts = getDayCounts();
    const today = startOfDay(new Date()).getTime();
    const oldest = today - MAX_DAY_OFFSET * DAY_MS;
    elements.dayInput.min = formatDateValue(oldest);
    elements.dayInput.max = formatDateValue(today);
    if (state.selectedDay < oldest || state.selectedDay > today) {
      state.selectedDay = today;
    }
    elements.dayInput.value = formatDateValue(state.selectedDay);
    if (elements.previousDayButton) {
      elements.previousDayButton.disabled = Number(state.selectedDay) <= oldest;
    }
    if (elements.nextDayButton) {
      elements.nextDayButton.disabled = Number(state.selectedDay) >= today;
    }
    if (elements.sortSelect) {
      elements.sortSelect.value = state.sortKey;
    }
    if (elements.sortDirectionButton) {
      const isAsc = state.sortDirection === 'asc';
      elements.sortDirectionButton.textContent = isAsc ? '\u2191' : '\u2193';
      elements.sortDirectionButton.title = isAsc ? 'Tri croissant' : 'Tri decroissant';
      elements.sortDirectionButton.setAttribute('aria-label', isAsc ? 'Tri croissant' : 'Tri decroissant');
    }
    const count = dayCounts.get(Number(state.selectedDay)) || 0;
    elements.dayHint.textContent = count
      ? `${formatDayLabel(state.selectedDay)} - ${count} VOD${count > 1 ? 's' : ''}`
      : `${formatDayLabel(state.selectedDay)} - aucune VOD visible`;
  }

  function renderTimeline() {
    const rows = getVisibleRows();
    elements.timeline.innerHTML = '';
    elements.timeline.style.removeProperty('--timeline-width');
    elements.emptyState.hidden = rows.length > 0 || state.isLoading;
    let inspectorAttached = false;

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
        <span class="tfr-vods-streamer__text">
          <strong>${escapeHtml(channel.displayName)}</strong>
          <small>${channel.metrics.videoCount} VOD${channel.metrics.videoCount > 1 ? 's' : ''} - ${channel.metrics.totalViews.toLocaleString('fr-FR')} vues - ${escapeHtml(formatDuration(channel.metrics.totalDuration))}</small>
        </span>
      `;
      row.appendChild(streamer);

      const cards = document.createElement('div');
      cards.className = 'tfr-vods-card-list';
      channel.videos.forEach((video) => {
        const start = new Date(video.createdAt);
        const end = new Date(start.getTime() + Math.max(0, Number(video.lengthSeconds) || 0) * 1000);
        const startTime = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const endTime = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const card = document.createElement('button');
        card.className = 'tfr-vods-card';
        card.type = 'button';
        if (state.selectedVideo?.videoId === video.id) {
          card.classList.add('is-selected');
        }
        card.innerHTML = `
          <span class="tfr-vods-card__start">
            <small>D&eacute;but</small>
            <strong>${escapeHtml(startTime)}</strong>
          </span>
          <span class="tfr-vods-card__media">
            ${video.thumbnailUrl ? `<img src="${escapeHtml(video.thumbnailUrl)}" alt="" />` : ''}
            <img class="tfr-vods-card__avatar" src="${escapeHtml(channel.avatarUrl || DEFAULT_AVATAR)}" alt="" />
          </span>
          <span class="tfr-vods-card__duration">
            <small>Dur&eacute;e VOD</small>
            <strong>${escapeHtml(formatDuration(video.lengthSeconds))}</strong>
          </span>
          <span class="tfr-vods-card__body">
            <span class="tfr-vods-card__title">${escapeHtml(video.title)}</span>
            <span class="tfr-vods-card__meta"><b>Streamer</b>${escapeHtml(channel.displayName)}</span>
            <span class="tfr-vods-card__meta"><b>Vues</b>${Number(video.viewCount || 0).toLocaleString('fr-FR')}</span>
            ${video.game ? `<span class="tfr-vods-card__meta"><b>Cat&eacute;gorie</b>${escapeHtml(video.game)}</span>` : ''}
          </span>
          <span class="tfr-vods-card__end">
            <small>Fin VOD</small>
            <strong>${escapeHtml(endTime)}</strong>
          </span>
        `;
        card.addEventListener('click', (event) => {
          event.stopPropagation();
          selectVideo(channel, video);
        });
        cards.appendChild(card);
      });
      row.appendChild(cards);
      elements.timeline.appendChild(row);

      if (
        elements.vodInspector
        && state.selectedVideo?.login?.toLowerCase() === channel.login.toLowerCase()
      ) {
        elements.timeline.appendChild(elements.vodInspector);
        inspectorAttached = true;
      }
    });

    if (elements.vodInspector && !inspectorAttached) {
      elements.vodInspector.hidden = true;
    }

    const totalVideos = rows.reduce((sum, row) => sum + row.videos.length, 0);
    if (state.isLoading) {
      const done = Number(state.loadingProgress?.done) || 0;
      const total = Number(state.loadingProgress?.total) || 0;
      elements.summary.textContent = total
        ? `Chargement des VODs Twitch... ${done}/${total} streamers analyses`
        : 'Chargement des VODs Twitch...';
      return;
    }
    elements.summary.textContent = `${rows.length} streamer${rows.length > 1 ? 's' : ''} - ${totalVideos} VOD${totalVideos > 1 ? 's' : ''}`;
  }

  function buildClipSegments(clips, duration) {
    const segmentCount = Math.min(24, Math.max(8, Math.ceil(duration / 1800)));
    const segmentDuration = Math.max(1, duration / segmentCount);
    const segments = Array.from({ length: segmentCount }, (_, index) => ({
      index,
      start: Math.round(index * segmentDuration),
      end: Math.min(duration, Math.round((index + 1) * segmentDuration)),
      clips: [],
      views: 0,
      topClip: null
    }));
    clips.forEach((clip) => {
      const safeOffset = Math.min(duration - 1, Math.max(0, Number(clip.offsetSeconds) || 0));
      const index = Math.min(segmentCount - 1, Math.floor(safeOffset / segmentDuration));
      const segment = segments[index];
      segment.clips.push(clip);
      segment.views += Number(clip.viewCount) || 0;
      if (!segment.topClip || Number(clip.viewCount || 0) > Number(segment.topClip.viewCount || 0)) {
        segment.topClip = clip;
      }
    });
    return segments;
  }

  function getSegmentHeatClass(count, maxCount) {
    if (!count) return 'is-empty';
    const ratio = maxCount ? count / maxCount : 0;
    if (ratio >= 0.75) return 'is-hot';
    if (ratio >= 0.4) return 'is-warm';
    return 'is-low';
  }
  function renderInspector() {
    if (!elements.vodInspector) {
      return;
    }
    const context = findVideoContext(state.selectedVideo?.videoId);
    if (!context) {
      elements.vodInspector.hidden = true;
      elements.vodInspector.innerHTML = '';
      return;
    }
    const { channel, video } = context;
    const clips = state.clipsByVideoId.get(video.id) || [];
    const isLoading = state.clipsLoadingVideoId === video.id;
    const duration = Math.max(1, Number(video.lengthSeconds) || 1);
    const start = new Date(video.createdAt);
    const end = new Date(start.getTime() + duration * 1000);
    const clipsByViews = [...clips].sort((a, b) => b.viewCount - a.viewCount || a.offsetSeconds - b.offsetSeconds);
    const topClips = clipsByViews.slice(0, 8);
    const markerClips = clipsByViews.slice(0, 32).sort((a, b) => a.offsetSeconds - b.offsetSeconds);
    const segments = buildClipSegments(clips, duration);
    const maxSegmentClips = Math.max(1, ...segments.map((segment) => segment.clips.length));

    elements.vodInspector.hidden = false;
    elements.vodInspector.innerHTML = `
      <div class="tfr-vods-inspector__header">
        <div class="tfr-vods-inspector__identity">
          <img src="${escapeHtml(channel.avatarUrl || DEFAULT_AVATAR)}" alt="" />
          <div>
            <p class="tfr-vods-kicker">Analyse VOD</p>
            <h2>${escapeHtml(video.title)}</h2>
            <span>${escapeHtml(channel.displayName)} - ${escapeHtml(formatLongDateTime(video.createdAt))}</span>
          </div>
        </div>
        <div class="tfr-vods-inspector__actions">
          <a class="tfr-vods-button tfr-vods-button--ghost" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">Ouvrir Twitch</a>
          <button class="tfr-vods-icon-button" id="closeInspectorButton" type="button">Fermer</button>
        </div>
      </div>

      <div class="tfr-vods-inspector__grid">
        <article class="tfr-vods-inspector__preview">
          ${video.thumbnailUrl ? `<img src="${escapeHtml(video.thumbnailUrl)}" alt="" />` : '<div class="tfr-vods-inspector__placeholder"></div>'}
          <div class="tfr-vods-inspector__stats">
            <span><strong>${escapeHtml(formatDuration(video.lengthSeconds))}</strong>Dur&eacute;e</span>
            <span><strong>${Number(video.viewCount || 0).toLocaleString('fr-FR')}</strong>Vues</span>
            <span><strong>${clips.length}</strong>Clips detectes</span>
            <span><strong>${escapeHtml(video.game || 'Inconnue')}</strong>Cat&eacute;gorie</span>
          </div>
        </article>

        <article class="tfr-vods-inspector__timeline-card">
          <div class="tfr-vods-inspector__timeline-head">
            <strong>Timeline de la VOD</strong>
            <span>${escapeHtml(start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))} - ${escapeHtml(end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</span>
          </div>
          <div class="tfr-vods-detail-timeline" aria-label="Timeline interne de la VOD">
            <div class="tfr-vods-detail-timeline__segments">
              ${segments.map((segment) => {
                const heatClass = getSegmentHeatClass(segment.clips.length, maxSegmentClips);
                const label = `${formatDuration(segment.start)} - ${formatDuration(segment.end)} : ${segment.clips.length} clip${segment.clips.length > 1 ? 's' : ''}`;
                const content = `<span style="height:${Math.max(14, Math.round((segment.clips.length / maxSegmentClips) * 48))}px"></span>`;
                return segment.topClip
                  ? `<a class="tfr-vods-detail-timeline__segment ${heatClass}" href="${escapeHtml(segment.topClip.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(label)}">${content}</a>`
                  : `<div class="tfr-vods-detail-timeline__segment ${heatClass}" title="${escapeHtml(label)}">${content}</div>`;
              }).join('')}
            </div>
            ${markerClips.map((clip) => {
              const left = Math.min(100, Math.max(0, (clip.offsetSeconds / duration) * 100));
              return `<a class="tfr-vods-detail-timeline__marker" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener noreferrer" style="left:${left}%" title="${escapeHtml(`${formatDuration(clip.offsetSeconds)} - ${clip.title} - ${Number(clip.viewCount || 0).toLocaleString('fr-FR')} vues`)}"></a>`;
            }).join('')}
          </div>
          <div class="tfr-vods-detail-timeline__labels">
            <span>0:00</span>
            <span>${markerClips.length < clips.length ? `${markerClips.length} marqueurs principaux sur ${clips.length} clips` : `${clips.length} marqueur${clips.length > 1 ? 's' : ''}`}</span>
            <span>${escapeHtml(formatDuration(duration))}</span>
          </div>
          <div class="tfr-vods-highlight-strip">
            ${topClips.length
              ? topClips.map((clip) => `
                <a class="tfr-vods-highlight-chip" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener noreferrer">
                  <span>${escapeHtml(formatDuration(clip.offsetSeconds))}</span>
                  <strong>${escapeHtml(clip.title)}</strong>
                  <small>${Number(clip.viewCount || 0).toLocaleString('fr-FR')} vues</small>
                </a>
              `).join('')
              : '<span class="tfr-vods-muted">Aucun temps fort clippe charge pour cette VOD.</span>'}
          </div>
        </article>
      </div>

      <section class="tfr-vods-clips">
        <div class="tfr-vods-clips__header">
          <h3>Temps forts et clips associ&eacute;s</h3>
          <span>${isLoading ? 'Chargement des clips...' : `${clips.length} clip${clips.length > 1 ? 's' : ''}`}</span>
        </div>
        ${state.clipsError ? `<p class="tfr-vods-clips__notice">${escapeHtml(state.clipsError)}</p>` : ''}
        ${clips.length
          ? `
            <div class="tfr-vods-clips__grid" aria-label="Clips les plus vus">
              ${topClips.map((clip) => `
                <a class="tfr-vods-clip-card" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener noreferrer">
                  ${clip.thumbnailUrl ? `<img src="${escapeHtml(clip.thumbnailUrl)}" alt="" />` : ''}
                  <span class="tfr-vods-clip-card__time">${escapeHtml(formatDuration(clip.offsetSeconds))}</span>
                  <strong>${escapeHtml(clip.title)}</strong>
                  <small>${Number(clip.viewCount || 0).toLocaleString('fr-FR')} vues${clip.curator ? ` - ${escapeHtml(clip.curator)}` : ''}</small>
                </a>
              `).join('')}
            </div>
            <div class="tfr-vods-clips__list" aria-label="Tous les clips de la VOD">
              ${clips.map((clip) => `
                <a class="tfr-vods-clip-row" href="${escapeHtml(clip.url)}" target="_blank" rel="noopener noreferrer">
                  <span>${escapeHtml(formatDuration(clip.offsetSeconds))}</span>
                  <strong>${escapeHtml(clip.title)}</strong>
                  <small>${Number(clip.viewCount || 0).toLocaleString('fr-FR')} vues${clip.curator ? ` - ${escapeHtml(clip.curator)}` : ''}</small>
                </a>
              `).join('')}
            </div>
          `
          : `<p class="tfr-vods-clips__notice">${isLoading ? 'Recherche des clips en cours...' : 'Aucun clip associe trouve sur la fenetre de cette VOD.'}</p>`}
      </section>
    `;
    elements.vodInspector.querySelector('#closeInspectorButton')?.addEventListener('click', closeInspector);
  }

  async function refreshData() {
    state.isLoading = true;
    state.loadingProgress = { done: 0, total: 0 };
    elements.refreshButton.disabled = true;
    elements.refreshButton.textContent = 'Chargement...';
    renderTimeline();
    await readStoredState();
    renderFilters();
    const logins = Object.values(state.favorites)
      .map((fav) => fav.login)
      .filter(Boolean);
    state.loadingProgress = { done: 0, total: logins.length };
    renderTimeline();
    const channels = await mapWithConcurrency(logins, 4, fetchChannelVods, (done, total) => {
      state.loadingProgress = { done, total };
      renderTimeline();
    });
    state.videosByLogin = new Map();
    channels.filter(Boolean).forEach((channel) => {
      state.videosByLogin.set(channel.login.toLowerCase(), channel);
    });
    state.isLoading = false;
    state.loadingProgress = { done: 0, total: 0 };
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = 'Actualiser les VODs';
    ensureSelectedDayHasContent();
    renderFilters();
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
      ensureSelectedDayHasContent();
      renderFilters();
      renderTimeline();
    });
    elements.sortSelect?.addEventListener('change', (event) => {
      state.sortKey = event.target.value || 'views';
      renderFilters();
      renderTimeline();
    });
    elements.sortDirectionButton?.addEventListener('click', () => {
      state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      renderFilters();
      renderTimeline();
    });
    elements.previousDayButton?.addEventListener('click', () => moveSelectedDay(-1));
    elements.nextDayButton?.addEventListener('click', () => moveSelectedDay(1));
    elements.dayInput.addEventListener('change', (event) => {
      state.selectedDay = clampDay(parseDateValue(event.target.value));
      renderFilters();
      renderTimeline();
    });
  }

  bindEvents();
  refreshData();
})();

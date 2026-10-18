const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';
const LIVE_FALLBACK_MAX_AGE_MS = 5 * 60 * 1000;

const STREAM_STATE_QUERY = `
  query ($login: String, $userId: ID) {
    user(login: $login, id: $userId) {
      id
      login
      displayName
      profileImageURL(width: 300)
      stream {
        id
        title
        viewersCount
        createdAt
        game {
          id
          name
        }
      }
    }
  }
`;

export const mapWithConcurrency = async (
  items,
  limit,
  mapper,
  { pacingMs = 0, schedule = (delay) => new Promise((resolve) => setTimeout(resolve, delay)) } = {}
) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = {
          status: 'fulfilled',
          value: await mapper(items[index], index)
        };
      } catch (reason) {
        results[index] = {
          status: 'rejected',
          reason
        };
      }
      if (pacingMs > 0 && cursor < items.length) {
        await schedule(pacingMs);
      }
    }
  });
  await Promise.all(workers);
  return results;
};

export const createOfflineLiveData = (login, fallback = {}) => ({
  userId: String(fallback.userId || fallback.id || ''),
  login: String(fallback.login || login || '').toLowerCase(),
  displayName: fallback.displayName || fallback.display_name || login,
  avatarUrl: fallback.avatarUrl || fallback.profileImageURL || DEFAULT_AVATAR,
  isLive: false,
  viewers: 0,
  title: '',
  game: '',
  startedAt: null
});

export const createLiveDataFallback = (login, fallback = {}) => {
  const offline = createOfflineLiveData(login, fallback);
  const lastConfirmedAt = Number(fallback?.lastConfirmedAt || 0);
  const isRecentlyConfirmed = Number.isFinite(lastConfirmedAt)
    && lastConfirmedAt > 0
    && Date.now() - lastConfirmedAt <= LIVE_FALLBACK_MAX_AGE_MS;
  if (fallback && fallback.isLive && isRecentlyConfirmed) {
    return {
      ...offline,
      ...fallback,
      userId: String(fallback.userId || fallback.id || offline.userId || ''),
      login: String(fallback.login || login || '').toLowerCase(),
      displayName: fallback.displayName || offline.displayName,
      avatarUrl: fallback.avatarUrl || offline.avatarUrl,
      lastConfirmedAt,
      fetchFailed: true
    };
  }
  return { ...offline, fetchFailed: true };
};

export const parseStreamerLivePayload = (login, payload, fallback = {}) => {
  const fallbackLiveData = createLiveDataFallback(login, fallback);
  const data = Array.isArray(payload) ? payload[0]?.data : payload?.data;
  const user = data?.user;
  if (!user) {
    return {
      ...createOfflineLiveData(login, fallback),
      fetchFailed: false,
      userNotFound: true,
      lastConfirmedAt: Date.now()
    };
  }
  const stream = user.stream;
  return {
    userId: String(user.id || fallbackLiveData.userId || ''),
    login: String(user.login || login).toLowerCase(),
    displayName: user.displayName || user.login || login,
    avatarUrl: user.profileImageURL || fallbackLiveData.avatarUrl || DEFAULT_AVATAR,
    isLive: Boolean(stream),
    streamId: stream?.id || null,
    viewers: stream?.viewersCount || 0,
    title: stream?.title || '',
    game: stream?.game?.name || '',
    startedAt: stream?.createdAt || null,
    lastConfirmedAt: Date.now(),
    fetchFailed: false
  };
};

export const createTwitchClient = ({
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) => ({
  async fetchStreamersLiveData(logins, fallbacks = {}) {
    const batches = [];
    for (let index = 0; index < logins.length; index += 20) batches.push(logins.slice(index, index + 20));
    const results = await mapWithConcurrency(batches, 2, async batch => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetchImpl(TWITCH_GRAPHQL_ENDPOINT, {
          method: 'POST', mode: 'cors', credentials: 'omit', signal: controller.signal,
          headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
          body: JSON.stringify(batch.map(login => ({
            query: STREAM_STATE_QUERY,
            variables: fallbacks[login]?.userId
              ? { login: null, userId: String(fallbacks[login].userId) }
              : { login, userId: null }
          })))
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload) || payload.length !== batch.length) throw new Error('Incomplete Twitch batch');
        return batch.map((login, index) => {
          const item = payload[index];
          return item?.errors?.length || !item?.data || !Object.hasOwn(item.data, 'user')
            ? createLiveDataFallback(login, fallbacks[login])
            : parseStreamerLivePayload(login, item, fallbacks[login]);
        });
      } catch (error) {
        logger?.debug?.('[TFR] Live batch temporarily unavailable', error);
        return batch.map(login => createLiveDataFallback(login, fallbacks[login]));
      } finally {
        clearTimeout(timer);
      }
    });
    return results.flatMap((result, index) => result.status === 'fulfilled'
      ? result.value : batches[index].map(login => createLiveDataFallback(login, fallbacks[login])));
  },

  async fetchStreamerLiveData(login, fallback = {}) {
    if (!login) {
      return null;
    }
    const fallbackLiveData = createLiveDataFallback(login, fallback);
    try {
      if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch API unavailable');
      }
      const response = await fetchImpl(TWITCH_GRAPHQL_ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: STREAM_STATE_QUERY,
          variables: fallback?.userId
            ? { login: null, userId: String(fallback.userId) }
            : { login, userId: null }
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return parseStreamerLivePayload(login, await response.json(), fallback);
    } catch (error) {
      logger?.debug?.('[TFR] Background live data temporarily unavailable', login, error);
      return fallbackLiveData;
    }
  }
});

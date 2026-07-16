const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const DEFAULT_AVATAR = 'https://static-cdn.jtvnw.net/jtv_user_pictures/404_user_70x70.png';

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

export const mapWithConcurrency = async (items, limit, mapper) => {
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
  if (fallback && fallback.isLive) {
    return {
      ...offline,
      ...fallback,
      userId: String(fallback.userId || fallback.id || offline.userId || ''),
      login: String(fallback.login || login || '').toLowerCase(),
      displayName: fallback.displayName || offline.displayName,
      avatarUrl: fallback.avatarUrl || offline.avatarUrl,
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
    return fallbackLiveData;
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
    fetchFailed: false
  };
};

export const createTwitchClient = ({
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) => ({
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

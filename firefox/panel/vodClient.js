(() => {
  const TWITCH_GRAPHQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const VIDEO_LIMIT = 60;
  const CLIP_PAGE_LIMIT = 100;
  const CLIP_MAX_PAGES = 4;
  const DAY_MS = 86400000;
  const VODS_QUERY = `
    query TfrChannelVideos($login: String!, $limit: Int!, $cursor: Cursor) {
      user(login: $login) {
        id
        login
        displayName
        profileImageURL(width: 96)
        videos(first: $limit, after: $cursor, type: ARCHIVE) {
          pageInfo { hasNextPage }
          edges {
            cursor
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

  const create = ({ fetchImpl = globalThis.fetch, defaultAvatar = '' } = {}) => {
    const request = async (query, variables, label) => {
      const response = await fetchImpl(TWITCH_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      });
      if (!response.ok) throw new Error(`${label} ${response.status}`);
      const payload = await response.json();
      if (payload?.errors?.length) throw new Error(payload.errors[0]?.message || `${label} query failed`);
      return payload?.data;
    };
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
  async function fetchChannelVods(login, { oldest = 0, fallbackAvatar = defaultAvatar } = {}) {
    let cursor = null;
    let user = null;
    const edges = [];
    const cursors = new Set();
    do {
      const data = await request(VODS_QUERY, { login, limit: VIDEO_LIMIT, cursor }, 'Twitch VOD');
      user = data?.user;
      if (!user) {
        return null;
      }
      const page = user.videos?.edges || [];
      edges.push(...page);
      const next = page[page.length - 1]?.cursor;
      const allOlder = page.length && page.every(edge => {
        const video = edge.node;
        return Date.parse(video?.createdAt || video?.publishedAt) + Number(video?.lengthSeconds || 0) * 1000 <= oldest;
      });
      if (!user.videos?.pageInfo?.hasNextPage || !next || cursors.has(next) || allOlder) break;
      cursors.add(next);
      cursor = next;
    } while (true);
    const videos = edges
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
      .filter((video, index, list) => video.id && video.createdAt && list.findIndex(item => item.id === video.id) === index);
    return {
      login: user.login || login,
      displayName: user.displayName || login,
      avatarUrl: user.profileImageURL || fallbackAvatar,
      videos
    };
  }

  async function fetchVideoClipsPage(channel, period, cursor = null) {
    const data = await request(CLIPS_QUERY, {
      login: channel.login, limit: CLIP_PAGE_LIMIT, period, cursor
    }, 'Twitch clips');
    return data?.user?.clips || { edges: [], pageInfo: { hasNextPage: false } };
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

    return Object.freeze({ fetchChannelVods, fetchVideoClips });
  };
  globalThis.TFRVodClient = Object.freeze({ create });
})();

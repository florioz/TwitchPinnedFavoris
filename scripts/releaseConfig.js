const RELEASE_STAGES = Object.freeze([
  ['run', 'sync:supabase'],
  ['run', 'sync:firefox'],
  ['test'],
  ['run', 'check'],
  ['run', 'check:firefox-sync'],
  ['run', 'check:supabase'],
  ['run', 'build:chrome'],
  ['run', 'build:firefox'],
  ['run', 'build:android']
].map((stage) => Object.freeze(stage)));

const getReleaseArtifacts = (version) => Object.freeze([
  `dist/TwitchFavoritesSidebar-v${version}-chrome-store.zip`,
  `dist/TwitchFavoritesSidebar-v${version}-firefox.zip`,
  `dist/TwitchFavoritesSidebar-v${version}.apk`
]);

module.exports = { getReleaseArtifacts, RELEASE_STAGES };

(function (root, factory) {
  const api = factory(root.navigator);
  root.__TFR_I18N__ = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (navigatorRef) {
  const messages = {
    fr: {
      'panel.eyebrow': 'Twitch Favoris',
      'panel.title': 'Favoris en live',
      'panel.loading': 'Chargement...',
      'panel.refresh': 'Actualiser',
      'panel.close': 'Fermer le panneau',
      'panel.empty.saved': 'Aucun favori enregistré.',
      'panel.empty.savedHint': 'Ajoutez des favoris depuis Twitch.',
      'panel.empty.live': 'Aucun favori en live pour le moment.',
      'panel.empty.liveHint': 'Tout est calme.',
      'panel.liveCount': '{count} favori(s) en live.',
      'panel.openTwitch': 'Ouvrir Twitch',
      'panel.uncategorized': 'Sans catégorie',
      'panel.unknownCategory': 'Catégorie inconnue',
      'panel.untitled': 'Live sans titre',
      'panel.viewers': '{count} spectateurs',
      'panel.updatedAt': 'Mis à jour à {time}',
      'panel.error': 'Impossible de récupérer les favoris.',
      'toast.live': '{name} est en live',
      'toast.subtitle': '{game} • {count} spectateurs',
      'toast.close': 'Fermer la notification',
      'toast.liveFallback': 'Live en cours',
      'vods.pageTitle': 'Planning VODs - Twitch Favorites Sidebar',
      'vods.title': 'Planning VODs',
      'vods.subtitle': 'Visualise les VODs récentes de tes streamers favoris sur une timeline.',
      'vods.refresh': 'Actualiser les VODs',
      'vods.loading': 'Chargement...',
      'vods.filters': 'Filtres du planning',
      'vods.searchLabel': 'Recherche',
      'vods.search': 'Streamer ou titre de VOD',
      'vods.group': 'Groupe',
      'vods.sort': 'Trier par',
      'vods.sort.time': 'Heure de VOD',
      'vods.sort.name': 'Nom du streamer',
      'vods.sort.views': 'Nombre de vues',
      'vods.sort.duration': 'Durée des VODs',
      'vods.sort.videos': 'Nombre de VODs',
      'vods.board': 'Planning des VODs',
      'vods.analysis': 'Analyse de la VOD',
      'vods.empty': 'Aucune VOD à afficher',
      'vods.emptyHint': 'Essaie un autre jour, un autre groupe, ou actualise les données Twitch.',
      'vods.allGroups': 'Tous les groupes',
      'vods.noGroup': 'Sans groupe',
      'vods.ascending': 'Tri croissant',
      'vods.descending': 'Tri décroissant',
      'vods.dayWithVods': '{day} - {count} VOD(s)',
      'vods.dayWithoutVods': '{day} - aucune VOD visible',
      'vods.streamerSummary': '{streamers} streamer(s) - {vods} VOD(s)',
      'vods.loadingProgress': 'Chargement des VODs Twitch... {done}/{total} streamers analysés',
      'vods.loadingData': 'Chargement des VODs Twitch...',
      'vods.vodCount': '{count} VOD(s)',
      'vods.views': '{count} vues',
      'vods.start': 'Début',
      'vods.streamer': 'Streamer',
      'vods.category': 'Catégorie',
      'vods.unknown': 'Inconnue',
      'vods.analysisTitle': 'Analyse VOD',
      'vods.openTwitch': 'Ouvrir Twitch',
      'vods.duration': 'Durée VOD',
      'vods.end': 'Fin VOD',
      'vods.close': 'Fermer',
      'vods.timeline': 'Timeline de la VOD',
      'vods.clipsDetected': 'Clips détectés',
      'vods.highlights': 'Temps forts et clips associés',
      'vods.loadingClips': 'Chargement des clips...',
      'vods.searchingClips': 'Recherche des clips en cours...',
      'vods.noClips': 'Aucun clip associé trouvé sur la fenêtre de cette VOD.',
      'vods.clipsLoadError': 'Impossible de charger les clips associés pour le moment.',
      'vods.topClips': 'Clips les plus vus',
      'vods.allClips': 'Tous les clips de la VOD'
    },
    en: {
      'panel.eyebrow': 'Twitch Favorites',
      'panel.title': 'Live favorites',
      'panel.loading': 'Loading...',
      'panel.refresh': 'Refresh',
      'panel.close': 'Close panel',
      'panel.empty.saved': 'No favorites saved.',
      'panel.empty.savedHint': 'Add favorites from Twitch.',
      'panel.empty.live': 'No favorites are live right now.',
      'panel.empty.liveHint': 'Everything is quiet.',
      'panel.liveCount': '{count} favorite(s) live.',
      'panel.openTwitch': 'Open Twitch',
      'panel.uncategorized': 'Uncategorized',
      'panel.unknownCategory': 'Unknown category',
      'panel.untitled': 'Untitled stream',
      'panel.viewers': '{count} viewers',
      'panel.updatedAt': 'Updated at {time}',
      'panel.error': 'Unable to retrieve favorites.',
      'toast.live': '{name} is live',
      'toast.subtitle': '{game} • {count} viewers',
      'toast.close': 'Close notification',
      'toast.liveFallback': 'Live now',
      'vods.pageTitle': 'VOD Schedule - Twitch Favorites Sidebar',
      'vods.title': 'VOD Schedule',
      'vods.subtitle': 'View recent VODs from your favorite streamers on a timeline.',
      'vods.refresh': 'Refresh VODs',
      'vods.loading': 'Loading...',
      'vods.filters': 'Schedule filters',
      'vods.searchLabel': 'Search',
      'vods.search': 'Streamer or VOD title',
      'vods.group': 'Group',
      'vods.sort': 'Sort by',
      'vods.sort.time': 'VOD time',
      'vods.sort.name': 'Streamer name',
      'vods.sort.views': 'View count',
      'vods.sort.duration': 'VOD duration',
      'vods.sort.videos': 'VOD count',
      'vods.board': 'VOD schedule',
      'vods.analysis': 'VOD analysis',
      'vods.empty': 'No VODs to display',
      'vods.emptyHint': 'Try another day or group, or refresh Twitch data.',
      'vods.allGroups': 'All groups',
      'vods.noGroup': 'No group',
      'vods.ascending': 'Ascending sort',
      'vods.descending': 'Descending sort',
      'vods.dayWithVods': '{day} - {count} VOD(s)',
      'vods.dayWithoutVods': '{day} - no visible VODs',
      'vods.streamerSummary': '{streamers} streamer(s) - {vods} VOD(s)',
      'vods.loadingProgress': 'Loading Twitch VODs... {done}/{total} streamers analyzed',
      'vods.loadingData': 'Loading Twitch VODs...',
      'vods.vodCount': '{count} VOD(s)',
      'vods.views': '{count} views',
      'vods.start': 'Start',
      'vods.streamer': 'Streamer',
      'vods.category': 'Category',
      'vods.unknown': 'Unknown',
      'vods.analysisTitle': 'VOD analysis',
      'vods.openTwitch': 'Open Twitch',
      'vods.duration': 'VOD duration',
      'vods.end': 'VOD end',
      'vods.close': 'Close',
      'vods.timeline': 'VOD timeline',
      'vods.clipsDetected': 'Clips detected',
      'vods.highlights': 'Highlights and related clips',
      'vods.loadingClips': 'Loading clips...',
      'vods.searchingClips': 'Searching for clips...',
      'vods.noClips': 'No related clips found within this VOD window.',
      'vods.clipsLoadError': 'Unable to load related clips right now.',
      'vods.topClips': 'Most viewed clips',
      'vods.allClips': 'All VOD clips'
    }
  };
  const languages = navigatorRef?.languages?.length
    ? navigatorRef.languages
    : [navigatorRef?.language || 'en'];
  const locale = languages.some((language) => String(language).toLowerCase().startsWith('fr'))
    ? 'fr'
    : 'en';
  const t = (key, params = {}) => {
    const template = messages[locale][key] ?? messages.en[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
  };
  const formatNumber = (value) => (Number(value) || 0).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US');
  const formatDate = (value, options) => new Intl.DateTimeFormat(
    locale === 'fr' ? 'fr-FR' : 'en-US',
    options
  ).format(value);
  const applyDocument = (documentRef) => {
    documentRef.documentElement.lang = locale;
    documentRef.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    documentRef.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    documentRef.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
      element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
    });
    documentRef.title = t(documentRef.documentElement.dataset.i18nTitle || 'vods.pageTitle');
  };
  return { applyDocument, formatDate, formatNumber, locale, t };
});

const createFirefoxManifest = (sourceManifest) => {
  const manifest = JSON.parse(JSON.stringify(sourceManifest));

  manifest.permissions = (manifest.permissions || []).filter((permission) => permission !== 'sidePanel');
  delete manifest.side_panel;
  manifest.background = {
    service_worker: 'src/background/serviceWorker.js',
    scripts: ['src/background/firefoxBackground.js'],
    type: 'module'
  };
  manifest.sidebar_action = {
    default_title: '__MSG_actionTitle__',
    default_panel: 'panel/sidepanel.html',
    default_icon: {
      16: 'assets/icon16.png',
      48: 'assets/icon48.png'
    },
    open_at_install: false
  };
  manifest.browser_specific_settings = {
    gecko: {
      id: 'twitch-favorites-sidebar@florioz',
      strict_min_version: '128.0',
      data_collection_permissions: { required: ['none'] }
    }
  };

  return manifest;
};

module.exports = { createFirefoxManifest };

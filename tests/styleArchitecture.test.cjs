const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('extension styles remain scoped to extension-owned selectors', () => {
  for (const file of ['styles/sidebar.css', 'styles/overlay.css', 'styles/buttons.css']) {
    const source = read(file);
    assert.equal(/(^|\n)\s*(html|body|button|input|select|textarea)\s*\{/m.test(source), false, `${file} contains an unscoped element rule`);
  }
});

test('manifest loads helper modules before their consumers', () => {
  const scripts = JSON.parse(read('manifest.json')).content_scripts[0].js;
  const before = (dependency, consumer) => assert.ok(scripts.indexOf(dependency) < scripts.indexOf(consumer));
  before('src/contentScripts/features/preferenceSanitizers.js', 'src/contentScripts/features/favoritesStore.js');
  before('src/contentScripts/features/favoritesStorageGateway.js', 'src/contentScripts/features/favoritesStore.js');
  before('src/contentScripts/features/categoryMutationTools.js', 'src/contentScripts/features/favoritesStore.js');
  before('src/contentScripts/features/sidebarGroupModel.js', 'src/contentScripts/features/sidebarRenderer.js');
  before('src/contentScripts/features/moderationDurationTools.js', 'src/contentScripts/features/chatModeration.js');
  before('src/contentScripts/features/deletedMessageView.js', 'src/contentScripts/features/streamEnhancements.js');
  before('src/contentScripts/extensionI18n.js', 'src/contentScripts/main.js');
  before('src/contentScripts/appBootstrap.js', 'src/contentScripts/main.js');
});

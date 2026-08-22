const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('extension styles remain scoped to extension-owned selectors', () => {
  for (const file of ['styles/sidebar.css', 'styles/overlay.css', 'styles/chatEmotePicker.css', 'styles/buttons.css']) {
    const source = read(file);
    assert.equal(/(^|\n)\s*(html|body|button|input|select|textarea)\s*\{/m.test(source), false, `${file} contains an unscoped element rule`);
  }
});

test('chat emote picker styles stay isolated from the general overlay stylesheet', () => {
  assert.match(read('styles/chatEmotePicker.css'), /\.tfr-chat-emote-picker/);
  assert.doesNotMatch(read('styles/overlay.css'), /\.tfr-chat-emote-picker/);
});

test('manifest loads helper modules before their consumers', () => {
  const scripts = JSON.parse(read('manifest.json')).content_scripts
    .find((entry) => entry.js?.includes('src/contentScripts/main.js')).js;
  const before = (dependency, consumer) => assert.ok(scripts.indexOf(dependency) < scripts.indexOf(consumer));
  before('src/contentScripts/features/preferenceSanitizers.js', 'src/contentScripts/features/favoritesStore.js');
  before('src/contentScripts/features/favoritesStorageGateway.js', 'src/contentScripts/features/favoritesStore.js');
  before('src/contentScripts/features/categoryMutationTools.js', 'src/contentScripts/features/favoritesStore.js');
  before('src/contentScripts/features/channelLocation.js', 'src/contentScripts/main.js');
  before('src/contentScripts/features/sidebarGroupModel.js', 'src/contentScripts/features/sidebarRenderer.js');
  before('src/contentScripts/features/moderationDurationTools.js', 'src/contentScripts/features/chatModeration.js');
  before('src/contentScripts/features/deletedMessageView.js', 'src/contentScripts/features/streamEnhancements.js');
  before('src/contentScripts/features/chatEmoteTooltip.js', 'src/contentScripts/features/streamEnhancements.js');
  before('src/contentScripts/features/chatEmoteAutocomplete.js', 'src/contentScripts/features/streamEnhancements.js');
  before('src/contentScripts/features/chatEmotePickerModel.js', 'src/contentScripts/features/chatEmotePicker.js');
  before('src/contentScripts/features/chatEmotePicker.js', 'src/contentScripts/features/streamEnhancements.js');
  before('src/contentScripts/features/domWorkScheduler.js', 'src/contentScripts/features/streamEnhancements.js');
  before('src/contentScripts/features/playerAudioEngine.js', 'src/contentScripts/features/streamEnhancements.js');
  before('src/contentScripts/features/sharedSpaceModel.js', 'src/contentScripts/features/favoritesStore.js');
  before('src/contentScripts/features/sharedWorkspaceTransitions.js', 'src/contentScripts/features/favoritesStore.js');
  before('src/contentScripts/features/viewerCardSharedInvite.js', 'src/contentScripts/main.js');
  before('src/contentScripts/features/sharedSpacesRemoteState.js', 'src/contentScripts/features/favoritesOverlay.js');
  before('src/contentScripts/contentI18nMessages.js', 'src/contentScripts/main.js');
  before('src/contentScripts/extensionI18n.js', 'src/contentScripts/main.js');
  before('src/contentScripts/appBootstrap.js', 'src/contentScripts/main.js');
});

test('content feature modules do not bind directly to the Chrome namespace', () => {
  const featureDirectory = path.join(__dirname, '..', 'src/contentScripts/features');
  for (const filename of fs.readdirSync(featureDirectory).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(featureDirectory, filename), 'utf8');
    assert.equal(/\bchrome\./.test(source), false, `${filename} binds directly to chrome`);
  }
});

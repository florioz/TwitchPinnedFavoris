const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function createTools() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/preferenceSanitizers.js'), 'utf8'), { window });
  return window.TFRPreferenceSanitizers.create({
    sanitizeColor: (value) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '',
    appearance: {
      sanitizeStreamerItemStyle: (value) => value,
      sanitizeSidebarSurfaceStyle: (value) => value,
      sanitizeAutoCompactGroupStyle: (value) => value,
      sanitizeSidebarAnimationStyle: (value) => value
    }
  });
}

test('preference sanitizers clamp numeric settings', () => {
  const tools = createTools();
  assert.equal(tools.chatPadding(50), 20);
  assert.equal(tools.recentLiveThreshold(0), 1);
  assert.equal(tools.toastVolume('invalid'), 35);
});

test('preference sanitizers provide safe chat and toast fallbacks', () => {
  const tools = createTools();
  assert.equal(tools.chatMentionColor('invalid'), '#9147ff');
  assert.equal(tools.chatMentionSound('unknown'), 'soft');
  assert.equal(tools.toastPosition('middle'), 'top-right');
  assert.equal(tools.liveHoverPreviewMode('unknown'), 'image');
  assert.equal(tools.playerAudioCompressorPreset('unknown'), 'balanced');
  assert.equal(tools.playerAudioCompressorPreset('strong'), 'strong');
  assert.equal(tools.playerVolumeTargetDb(-100), -80);
  assert.equal(tools.playerVolumeTargetDb(-40), -40);
  assert.equal(tools.playerVolumeTargetDb(-12), -12);
  assert.equal(tools.playerVolumeTargetDb('invalid'), -16);
});

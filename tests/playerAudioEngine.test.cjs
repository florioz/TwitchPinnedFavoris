const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loadEngine = () => {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/contentScripts/features/playerAudioEngine.js'), 'utf8'),
    { window, console, Float32Array, Date }
  );
  return window.TFRPlayerAudioEngine;
};

test('audio engine normalizes presets, targets and reduction bounds', () => {
  const { PlayerAudioEngine } = loadEngine();
  const engine = new PlayerAudioEngine({ windowRef: {} });
  assert.equal(engine.normalizePreset('invalid'), 'balanced');
  assert.equal(engine.normalizePreset('strong'), 'strong');
  assert.equal(engine.normalizeTargetDb(-100), -80);
  assert.equal(engine.normalizeTargetDb(-5), -10);
  engine.targetDb = -68;
  assert.equal(engine.calculateTargetGainDb(-55), -12);
  assert.equal(engine.calculateTargetGainDb(-72), 0);
  assert.equal(engine.calculateTargetGainDb(-95), null);
});

test('audio engine combines average and peak levels', () => {
  const { PlayerAudioEngine } = loadEngine();
  const engine = new PlayerAudioEngine({ windowRef: {} });
  const level = engine.calculateMeasuredLevelDb(new Float32Array([0.05, 0.05, 0.05, 0.8]));
  assert.ok(level > -13);
  assert.equal(engine.calculateMeasuredLevelDb(new Float32Array(4)), -Infinity);
});

test('audio engine applies smooth attenuation without positive gain', () => {
  const { PlayerAudioEngine } = loadEngine();
  const applied = [];
  const engine = new PlayerAudioEngine({ windowRef: {} });
  engine.normalizerEnabled = true;
  engine.targetDb = -68;
  engine.graph = {
    context: { state: 'running', currentTime: 1 },
    analyser: {
      fftSize: 4,
      getFloatTimeDomainData: (buffer) => buffer.fill(0.01)
    },
    gain: { gain: { setTargetAtTime: (value) => applied.push(value) } }
  };
  const result = engine.update(1000);
  assert.ok(result.gainDb < 0);
  assert.ok(result.gainDb >= -12);
  assert.ok(applied.every((value) => value <= 1));
});

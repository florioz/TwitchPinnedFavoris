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

const audioHarness = () => {
  const { PlayerAudioEngine } = loadEngine();
  let captures = 0;
  let closes = 0;
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1 }, getFloatTimeDomainData(a) { a.fill(0.1); } });
  class Context {
    constructor() { this.state = 'running'; this.destination = node(); }
    createMediaElementSource() { captures++; return node(); }
    createAnalyser() { return node(); }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    close() { closes++; }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  const windowRef = { AudioContext: Context, location: { pathname: '/streamer' } };
  const engine = new PlayerAudioEngine({ windowRef });
  const video = { src: 'blob:https://www.twitch.tv/live', dataset: {}, muted: false, volume: 0.6 };
  return { engine, video, windowRef, counts: () => ({ captures, closes }) };
};

for (const [compressorEnabled, normalizerEnabled] of [[true, false], [false, true], [true, true]]) {
  test(`unsafe clip preserves native audio with compressor=${compressorEnabled}, normalizer=${normalizerEnabled}`, () => {
    const s = audioHarness();
    s.engine.configure({ compressorEnabled, normalizerEnabled });
    s.video.src = 'https://cdn.example/clip.mp4';
    assert.equal(s.engine.attach(s.video), false);
    assert.equal(s.counts().captures, 0);
    assert.equal(s.video.volume, 0.6);
    assert.equal(s.video.muted, false);
  });
}
test('audio graph reuse preserves user mute/unmute across stream/clip/stream switches', () => {
  const s = audioHarness();
  s.engine.configure({ compressorEnabled: true, normalizerEnabled: true });
  assert.equal(s.engine.attach(s.video), true);
  s.video.muted = true;
  const clip = { src: 'https://cdn.example/clip.mp4', dataset: {}, volume: 0.4, muted: false };
  assert.equal(s.engine.attach(clip), false);
  assert.equal(s.video.muted, true);
  assert.equal(s.counts().closes, 0);
  s.video.muted = false;
  assert.equal(s.engine.attach(s.video), true);
  assert.equal(s.counts().captures, 1);
  assert.equal(s.video.volume, 0.6);
  assert.equal(s.video.muted, false);
  s.engine.currentGainDb = -24;
  s.engine.resetMediaState();
  assert.equal(s.engine.currentGainDb, 0);
});
test('a suspended AudioContext never captures the media until resumed', () => {
  const s = audioHarness();
  const Base = s.windowRef.AudioContext;
  s.windowRef.AudioContext = class extends Base { constructor() { super(); this.state = 'suspended'; } };
  assert.equal(s.engine.attach(s.video), false);
  assert.equal(s.counts().captures, 0);
  assert.equal(s.engine.attach(s.video), true);
});

test('changing media invalidates the previous worklet level without disabling the meter', () => {
  const s = audioHarness();
  s.engine.configure({ normalizerEnabled: true }); s.engine.attach(s.video);
  s.engine.workletStatus = 'active';
  s.engine.handleWorkletMessage({ data: { type: 'level', rms: 1, peak: 1 } });
  assert.equal(s.engine.isWorkletMeasurementFresh(), true);
  s.engine.resetMediaState();
  assert.equal(s.engine.isWorkletMeasurementFresh(), false);
  assert.equal(s.engine.workletStatus, 'active');
  s.engine.update();
  assert.ok(Math.abs(s.engine.measuredLevelDb + 20) < 0.001);
});

test('audio engine normalizes presets, targets and reduction bounds', () => {
  const { PlayerAudioEngine } = loadEngine();
  const engine = new PlayerAudioEngine({ windowRef: {} });
  assert.equal(engine.normalizePreset('invalid'), 'balanced');
  assert.equal(engine.normalizePreset('strong'), 'strong');
  assert.equal(engine.normalizeTargetDb(-100), -80);
  assert.equal(engine.normalizeTargetDb(-5), -10);
  engine.targetDb = -68;
  assert.equal(engine.calculateTargetGainDb(-55), -13);
  assert.equal(engine.calculateTargetGainDb(-20), -48);
  assert.equal(engine.calculateTargetGainDb(-72), 0);
  assert.equal(engine.calculateTargetGainDb(-95), null);
  assert.equal(engine.maxReductionDb, -68);
  assert.equal(engine.normalizeMaxReductionDb(-100), -40);
  assert.equal(engine.normalizeMaxReductionDb(-2), -12);
  assert.equal(engine.normalizeMaxReductionDb('invalid'), -24);
});

test('audio engine uses a direct route when every protection is disabled', () => {
  const { PlayerAudioEngine } = loadEngine();
  const connections = [];
  const createNode = (name) => ({
    name,
    connect: (target) => connections.push(`${name}->${target.name}`),
    disconnect() {}
  });
  const engine = new PlayerAudioEngine({ windowRef: {} });
  engine.graph = {
    context: { destination: { name: 'destination' } },
    source: createNode('source'),
    analyser: createNode('analyser'),
    gain: createNode('gain'),
    compressor: createNode('compressor'),
    limiter: createNode('limiter')
  };

  engine.applyRoutingState();
  assert.deepEqual(connections, ['source->destination']);
  connections.length = 0;
  engine.normalizerEnabled = true;
  engine.applyRoutingState();
  assert.deepEqual(connections, [
    'source->analyser',
    'analyser->gain',
    'gain->compressor',
    'compressor->limiter',
    'limiter->destination'
  ]);
});

test('audio engine smooths measured levels over a short power window', () => {
  const { PlayerAudioEngine } = loadEngine();
  const engine = new PlayerAudioEngine({ windowRef: {} });
  assert.equal(engine.smoothMeasuredLevelDb(-40), -40);
  const mixedLevel = engine.smoothMeasuredLevelDb(-20);
  assert.ok(mixedLevel > -24 && mixedLevel < -20);
});

test('audio engine combines average and peak levels', () => {
  const { PlayerAudioEngine } = loadEngine();
  const engine = new PlayerAudioEngine({ windowRef: {} });
  const level = engine.calculateMeasuredLevelDb(new Float32Array([0.05, 0.05, 0.05, 0.8]));
  assert.ok(level > -13);
  assert.equal(engine.calculateMeasuredLevelDb(new Float32Array(4)), -Infinity);
});

test('audio engine forwards only valid AudioWorklet level events', () => {
  const { PlayerAudioEngine } = loadEngine();
  let levelEvents = 0;
  const engine = new PlayerAudioEngine({
    windowRef: {},
    onWorkletLevel: () => { levelEvents += 1; }
  });

  engine.handleWorkletMessage({ data: { type: 'unrelated', rms: 0.1, peak: 0.2 } });
  assert.equal(levelEvents, 0);
  engine.handleWorkletMessage({ data: { type: 'level', rms: 'invalid', peak: 0.2 } });
  engine.handleWorkletMessage({ data: { type: 'level', rms: -0.1, peak: 0.2 } });
  assert.equal(levelEvents, 0);
  assert.equal(engine.workletLevelAt, 0);
  engine.handleWorkletMessage({ data: { type: 'level', rms: 0.1, peak: 0.2 } });
  assert.equal(levelEvents, 1);
  assert.ok(Number.isFinite(engine.workletLevelDb));
  assert.ok(engine.workletLevelAt > 0);
});

test('audio engine owns Worklet freshness and measurement mode decisions', () => {
  const { PlayerAudioEngine } = loadEngine();
  const engine = new PlayerAudioEngine({ windowRef: {} });
  engine.workletStatus = 'active';
  engine.workletLevelAt = 10_000;

  assert.equal(engine.isWorkletMeasurementFresh(11_199), true);
  assert.equal(engine.getMeasurementMode(11_199), 'worklet');
  assert.equal(engine.isWorkletMeasurementFresh(11_200), false);
  assert.equal(engine.getMeasurementMode(11_200), 'fallback');
});

test('audio measurement reset can preserve or clear Worklet lifecycle state', () => {
  const { PlayerAudioEngine } = loadEngine();
  const engine = new PlayerAudioEngine({ windowRef: {} });
  engine.measuredLevelDb = -24;
  engine.normalizerPhase = 'reducing';
  engine.lastAudibleAt = 100;
  engine.levelWindow = [-24];
  engine.workletStatus = 'active';
  engine.workletLevelDb = -20;
  engine.workletLevelAt = 100;

  engine.resetMeasurementState();
  assert.equal(engine.measuredLevelDb, null);
  assert.equal(engine.normalizerPhase, 'idle');
  assert.equal(engine.workletStatus, 'active');

  engine.resetMeasurementState({ resetWorklet: true });
  assert.equal(engine.workletStatus, 'idle');
  assert.equal(engine.workletLevelDb, null);
  assert.equal(engine.workletLevelAt, 0);
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
  assert.ok(result.gainDb < -15, 'a sudden loud passage receives a fast first attenuation');
  assert.equal(result.normalizerPhase, 'reducing');
  assert.ok(result.gainDb >= engine.targetDb);
  assert.ok(applied.every((value) => value <= 1));
});

test('audio engine reports gradual recovery below the target', () => {
  const { PlayerAudioEngine } = loadEngine();
  const engine = new PlayerAudioEngine({ windowRef: {} });
  engine.normalizerEnabled = true;
  engine.targetDb = -20;
  engine.currentGainDb = -6;
  engine.graph = {
    context: { state: 'running', currentTime: 1 },
    analyser: {
      fftSize: 4,
      getFloatTimeDomainData: (buffer) => buffer.fill(0.01)
    },
    gain: { gain: { setTargetAtTime() {} } },
    compressor: { reduction: 0 },
    limiter: { reduction: 0 }
  };
  const result = engine.update(1000);
  assert.equal(result.normalizerPhase, 'releasing');
  assert.ok(result.gainDb > -6);
});

test('audio engine resumes a suspended context and ignores resume rejection', async () => {
  const { PlayerAudioEngine } = loadEngine();
  let resumeCalls = 0;
  const engine = new PlayerAudioEngine({ windowRef: {} });
  engine.graph = {
    context: {
      state: 'suspended',
      resume: async () => {
        resumeCalls += 1;
        throw new Error('activation required');
      }
    }
  };
  await engine.resume();
  assert.equal(resumeCalls, 1);
});

test('audio engine prefers fresh AudioWorklet measurements and keeps analyser fallback', async () => {
  const { PlayerAudioEngine } = loadEngine();
  let loadedModule = '';
  let analyserReads = 0;
  class WorkletNodeMock {
    constructor() {
      this.port = {};
    }
    connect() {}
    disconnect() {}
  }
  const createNode = () => ({ connect() {}, disconnect() {} });
  const context = {
    state: 'running',
    currentTime: 1,
    destination: {},
    audioWorklet: { addModule: async (url) => { loadedModule = url; } }
  };
  const engine = new PlayerAudioEngine({
    windowRef: { AudioWorkletNode: WorkletNodeMock },
    workletModuleUrl: 'extension://audio-level.js'
  });
  engine.normalizerEnabled = true;
  engine.targetDb = -40;
  engine.graph = {
    context,
    source: createNode(),
    analyser: {
      ...createNode(),
      fftSize: 4,
      getFloatTimeDomainData: (buffer) => {
        analyserReads += 1;
        buffer.fill(0.01);
      }
    },
    gain: { ...createNode(), gain: { setTargetAtTime() {} } },
    compressor: { ...createNode(), reduction: 0 },
    limiter: { ...createNode(), reduction: 0 }
  };

  assert.equal(await engine.ensureAudioWorklet(), true);
  assert.equal(loadedModule, 'extension://audio-level.js');
  engine.graph.meterWorklet.port.onmessage({
    data: { type: 'level', rms: 0.1, peak: 0.2 }
  });
  const result = engine.update();
  assert.equal(result.measurementMode, 'worklet');
  assert.equal(analyserReads, 0);

  engine.workletLevelAt = Date.now() - 2000;
  assert.equal(engine.update().measurementMode, 'fallback');
  assert.equal(analyserReads, 1);
});

test('a replaced audio graph ignores stale AudioWorklet messages', async () => {
  const { PlayerAudioEngine } = loadEngine();
  let levelEvents = 0;
  class WorkletNodeMock {
    constructor() { this.port = {}; }
    connect() {}
    disconnect() {}
  }
  const createNode = () => ({ connect() {}, disconnect() {} });
  const engine = new PlayerAudioEngine({
    windowRef: { AudioWorkletNode: WorkletNodeMock },
    workletModuleUrl: 'extension://audio-level.js',
    onWorkletLevel: () => { levelEvents += 1; }
  });
  engine.normalizerEnabled = true;
  const oldGraph = {
    context: {
      destination: {},
      audioWorklet: { addModule: async () => {} }
    },
    source: createNode(),
    analyser: createNode(),
    gain: createNode(),
    compressor: createNode(),
    limiter: createNode()
  };
  engine.graph = oldGraph;
  await engine.ensureAudioWorklet();
  const staleHandler = oldGraph.meterWorklet.port.onmessage;
  engine.graph = { ...oldGraph, meterWorklet: null };

  staleHandler({ data: { type: 'level', rms: 0.5, peak: 0.8 } });
  assert.equal(levelEvents, 0);
});

test('a stale AudioWorklet loading failure does not downgrade the current graph', async () => {
  const { PlayerAudioEngine } = loadEngine();
  let rejectOldModule;
  const engine = new PlayerAudioEngine({
    windowRef: { AudioWorkletNode: class {} },
    workletModuleUrl: 'extension://audio-level.js'
  });
  engine.normalizerEnabled = true;
  const oldGraph = {
    context: {
      audioWorklet: {
        addModule: () => new Promise((resolve, reject) => { rejectOldModule = reject; })
      }
    }
  };
  engine.graph = oldGraph;
  const loading = engine.ensureAudioWorklet();
  engine.graph = { context: {} };
  engine.workletStatus = 'active';
  rejectOldModule(new Error('old context closed'));

  assert.equal(await loading, false);
  assert.equal(engine.workletStatus, 'active');
});

for (const sourceType of ['MediaSourceHandle', 'MediaSource']) {
  test(`${sourceType} live source is captured and measured without a blob URL`, () => {
    const s = audioHarness();
    s.video.src = '';
    s.video.currentSrc = '';
    s.video.srcObject = { [Symbol.toStringTag]: sourceType };
    s.engine.configure({ compressorEnabled: true, normalizerEnabled: true });
    assert.equal(s.engine.attach(s.video), true);
    s.engine.update();
    assert.ok(Number.isFinite(s.engine.measuredLevelDb));
    assert.equal(s.counts().captures, 1);
    s.windowRef.location.pathname = '/streamer/clip/example';
    assert.equal(s.engine.canProcess(s.video), false);
  });
}

test('unknown srcObject and missing sources remain native', () => {
  const s = audioHarness();
  s.video.src = '';
  assert.equal(s.engine.attach(s.video), false);
  s.video.srcObject = {};
  assert.equal(s.engine.attach(s.video), false);
  assert.equal(s.counts().captures, 0);
});


test('quiet audio is boosted gradually, capped, and quickly reduced on a loud return', () => {
  const s = audioHarness();
  s.engine.configure({ normalizerEnabled: true, targetDb: -20 });
  s.engine.attach(s.video);
  let amplitude = 0.01;
  s.engine.graph.analyser.getFloatTimeDomainData = buffer => buffer.fill(amplitude);
  assert.equal(s.engine.calculateTargetGainDb(-40), 12);
  assert.equal(s.engine.calculateTargetGainDb(-25), 5);
  for (let n = 1; n <= 300; n++) s.engine.update(n * 100);
  assert.ok(s.engine.currentGainDb > 11 && s.engine.currentGainDb <= 12);
  assert.equal(s.engine.normalizerPhase, 'boosting');
  amplitude = 0.5;
  s.engine.update(30100);
  assert.ok(s.engine.currentGainDb < 0, 'loud return cancels the boost immediately');
  s.engine.configure({ normalizerEnabled: false });
  assert.equal(s.engine.currentGainDb, 0);
  assert.equal(s.engine.graph.gain.gain.value, 1);
});

test('noise gate and silence never build amplification, including worklet silence', () => {
  const s = audioHarness();
  s.engine.configure({ normalizerEnabled: true, targetDb: -20 });
  s.engine.attach(s.video);
  assert.equal(s.engine.calculateTargetGainDb(-65), 0);
  assert.equal(s.engine.calculateTargetGainDb(-60), 0);
  assert.equal(s.engine.calculateTargetGainDb(-55), 6);
  s.engine.currentGainDb = 12;
  s.engine.graph.analyser.getFloatTimeDomainData = buffer => buffer.fill(0);
  s.engine.update(100);
  assert.ok(s.engine.currentGainDb < 12);
  s.engine.workletStatus = 'active';
  s.engine.workletLevelDb = null;
  s.engine.workletLevelAt = 1000;
  const previous = s.engine.currentGainDb;
  s.engine.update(1100);
  assert.ok(s.engine.currentGainDb < previous);
  s.engine.currentGainDb = 0;
  s.engine.graph.analyser.getFloatTimeDomainData = buffer => buffer.fill(0.0001);
  for (let n = 30; n < 100; n++) s.engine.update(n * 100);
  assert.equal(s.engine.currentGainDb, 0);
});


test('automatic reduction follows every target and ignores legacy manual limits', () => {
  const { engine } = audioHarness();
  for (const targetDb of [-80, -68, -40, -16, -10]) {
    engine.configure({ normalizerEnabled: true, targetDb, maxReductionDb: -12 });
    assert.equal(engine.maxReductionDb, targetDb);
    assert.equal(engine.calculateTargetGainDb(0), targetDb);
    assert.equal(engine.calculateTargetGainDb(-5), targetDb + 5);
  }
});

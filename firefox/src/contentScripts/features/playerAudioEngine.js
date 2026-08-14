(() => {
  const PRESETS = Object.freeze(['soft', 'balanced', 'strong']);
  const PRESET_VALUES = Object.freeze({
    soft: Object.freeze({ threshold: -12, knee: 18, ratio: 2, attack: 0.008, release: 0.3 }),
    balanced: Object.freeze({ threshold: -20, knee: 24, ratio: 4, attack: 0.006, release: 0.28 }),
    strong: Object.freeze({ threshold: -30, knee: 30, ratio: 8, attack: 0.003, release: 0.35 })
  });
  const BYPASS_VALUES = Object.freeze({ threshold: 0, knee: 0, ratio: 1, attack: 0, release: 0.25 });
  const TARGET_MIN_DB = -80;
  const TARGET_MAX_DB = -10;
  const TARGET_DEFAULT_DB = -16;
  const SIGNAL_FLOOR_DB = -90;
  const MAX_REDUCTION_MIN_DB = -40;
  const MAX_REDUCTION_MAX_DB = -12;
  const MAX_REDUCTION_DEFAULT_DB = -24;
  const LEVEL_WINDOW_SIZE = 60;
  const WORKLET_FRESHNESS_MS = 1200;

  class PlayerAudioEngine {
    constructor({
      windowRef = window,
      logger = console,
      workletModuleUrl = '',
      onWorkletLevel = null
    } = {}) {
      this.window = windowRef;
      this.logger = logger;
      this.workletModuleUrl = workletModuleUrl;
      this.onWorkletLevel = onWorkletLevel;
      this.workletStatus = 'idle';
      this.workletLevelDb = null;
      this.workletLevelAt = 0;
      this.compressorEnabled = false;
      this.preset = 'balanced';
      this.normalizerEnabled = false;
      this.targetDb = TARGET_DEFAULT_DB;
      this.maxReductionDb = MAX_REDUCTION_DEFAULT_DB;
      this.currentGainDb = 0;
      this.measuredLevelDb = null;
      this.normalizerPhase = 'idle';
      this.lastAudibleAt = 0;
      this.sampleBuffer = null;
      this.levelWindow = [];
      this.video = null;
      this.graph = null;
    }

    normalizePreset(preset) {
      return PRESETS.includes(preset) ? preset : 'balanced';
    }

    normalizeTargetDb(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? Math.max(TARGET_MIN_DB, Math.min(TARGET_MAX_DB, Math.round(parsed)))
        : TARGET_DEFAULT_DB;
    }

    normalizeMaxReductionDb(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? Math.max(MAX_REDUCTION_MIN_DB, Math.min(MAX_REDUCTION_MAX_DB, Math.round(parsed)))
        : MAX_REDUCTION_DEFAULT_DB;
    }

    configure({ compressorEnabled, preset, normalizerEnabled, targetDb, maxReductionDb }) {
      this.compressorEnabled = Boolean(compressorEnabled);
      this.preset = this.normalizePreset(preset);
      this.normalizerEnabled = Boolean(normalizerEnabled);
      this.targetDb = this.normalizeTargetDb(targetDb);
      this.maxReductionDb = this.normalizeMaxReductionDb(maxReductionDb);
      if (this.normalizerEnabled) this.currentGainDb = Math.min(0, this.currentGainDb);
      this.applyCompressorState();
      this.applyNormalizerState();
      this.applyRoutingState();
      if (this.normalizerEnabled) this.ensureAudioWorklet();
    }

    calculateTargetGainDb(inputDb) {
      if (!Number.isFinite(inputDb) || inputDb < SIGNAL_FLOOR_DB) return null;
      return Math.max(this.maxReductionDb, Math.min(0, this.targetDb - inputDb));
    }

    calculateMeasuredLevelDb(samples) {
      if (!samples?.length) return -Infinity;
      let squareSum = 0;
      let peak = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const sample = Math.abs(samples[index]);
        squareSum += sample ** 2;
        peak = Math.max(peak, sample);
      }
      const rms = Math.sqrt(squareSum / samples.length);
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      return Math.max(rmsDb, peakDb - 10);
    }

    calculateLevelDb(rms, peak) {
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      return Math.max(rmsDb, peakDb - 10);
    }

    handleWorkletMessage(event) {
      const payload = event?.data;
      if (payload?.type !== 'level') return;
      const rms = Number(payload.rms);
      const peak = Number(payload.peak);
      if (!Number.isFinite(rms) || rms < 0 || !Number.isFinite(peak) || peak < 0) return;
      const levelDb = this.calculateLevelDb(rms, peak);
      this.workletLevelDb = Number.isFinite(levelDb) ? levelDb : null;
      this.workletLevelAt = Date.now();
      this.onWorkletLevel?.();
    }

    isWorkletMeasurementFresh(now = Date.now()) {
      return this.workletStatus === 'active'
        && this.workletLevelAt > 0
        && now - this.workletLevelAt < WORKLET_FRESHNESS_MS;
    }

    getMeasurementMode(now = Date.now()) {
      return this.isWorkletMeasurementFresh(now) ? 'worklet' : 'fallback';
    }

    resetMeasurementState({ resetWorklet = false } = {}) {
      this.measuredLevelDb = null;
      this.normalizerPhase = 'idle';
      this.lastAudibleAt = 0;
      this.levelWindow = [];
      if (!resetWorklet) return;
      this.workletStatus = 'idle';
      this.workletLevelDb = null;
      this.workletLevelAt = 0;
    }

    smoothMeasuredLevelDb(inputDb) {
      if (!Number.isFinite(inputDb)) return null;
      this.levelWindow.push(inputDb);
      if (this.levelWindow.length > LEVEL_WINDOW_SIZE) this.levelWindow.shift();
      const averagePower = this.levelWindow.reduce(
        (sum, levelDb) => sum + (10 ** (levelDb / 10)), 0
      ) / this.levelWindow.length;
      return averagePower > 0 ? 10 * Math.log10(averagePower) : null;
    }

    applyAudioParams(node, values) {
      Object.entries(values).forEach(([property, value]) => {
        if (node?.[property]) node[property].value = value;
      });
    }

    applyCompressorState() {
      this.applyAudioParams(
        this.graph?.compressor,
        this.compressorEnabled ? PRESET_VALUES[this.preset] : BYPASS_VALUES
      );
    }

    setGainDb(gainDb, timeConstant = 0.08) {
      const gain = this.graph?.gain?.gain;
      const context = this.graph?.context;
      if (!gain || !context) return;
      const linearGain = 10 ** (gainDb / 20);
      if (typeof gain.setTargetAtTime === 'function') {
        gain.setTargetAtTime(linearGain, context.currentTime || 0, timeConstant);
      } else {
        gain.value = linearGain;
      }
    }

    applyNormalizerState() {
      if (this.normalizerEnabled) return;
      this.currentGainDb = 0;
      this.resetMeasurementState();
      this.setGainDb(0, 0.05);
    }

    disconnectNodes() {
      ['source', 'analyser', 'gain', 'compressor', 'limiter', 'meterWorklet'].forEach((key) => {
        try { this.graph?.[key]?.disconnect?.(); } catch {}
      });
    }

    applyRoutingState() {
      const { context, source, analyser, gain, compressor, limiter } = this.graph || {};
      if (!context || !source) return;
      this.disconnectNodes();
      if (!this.compressorEnabled && !this.normalizerEnabled) {
        source.connect(context.destination);
        return;
      }
      source.connect(analyser);
      if (this.graph.meterWorklet) source.connect(this.graph.meterWorklet);
      analyser.connect(gain);
      gain.connect(compressor);
      compressor.connect(limiter);
      limiter.connect(context.destination);
    }

    update(now = Date.now()) {
      const { analyser, context } = this.graph || {};
      if (!this.normalizerEnabled || !analyser) return null;
      if (context?.state && context.state !== 'running') {
        return { levelDb: null, gainDb: this.currentGainDb, contextState: context.state };
      }
      const size = analyser.fftSize || 1024;
      if (!this.sampleBuffer || this.sampleBuffer.length !== size) this.sampleBuffer = new Float32Array(size);
      const hasFreshWorkletLevel = this.isWorkletMeasurementFresh(now);
      let inputDb = this.workletLevelDb;
      if (!hasFreshWorkletLevel) {
        analyser.getFloatTimeDomainData(this.sampleBuffer);
        inputDb = this.calculateMeasuredLevelDb(this.sampleBuffer);
      }
      const smoothedLevelDb = this.smoothMeasuredLevelDb(inputDb);
      this.measuredLevelDb = smoothedLevelDb;
      const controlLevelDb = Number.isFinite(smoothedLevelDb)
        ? Math.max(inputDb, smoothedLevelDb)
        : inputDb;
      const desiredGainDb = this.calculateTargetGainDb(controlLevelDb);
      if (desiredGainDb == null) {
        if (this.lastAudibleAt && now - this.lastAudibleAt > 2500) {
          this.currentGainDb += (0 - this.currentGainDb) * 0.013;
          this.setGainDb(this.currentGainDb, 0.35);
          this.normalizerPhase = Math.abs(this.currentGainDb) > 0.05 ? 'releasing' : 'idle';
        }
      } else {
        this.lastAudibleAt = now;
        const reducing = desiredGainDb < this.currentGainDb;
        this.currentGainDb += (desiredGainDb - this.currentGainDb) * (reducing ? 0.75 : 0.021);
        this.setGainDb(this.currentGainDb, reducing ? 0.02 : 0.22);
        this.normalizerPhase = desiredGainDb < -0.05
          ? 'reducing'
          : (Math.abs(this.currentGainDb) > 0.05 ? 'releasing' : 'idle');
      }
      return {
        levelDb: this.measuredLevelDb,
        gainDb: this.currentGainDb,
        normalizerPhase: this.normalizerPhase,
        compressorReductionDb: Number(this.graph?.compressor?.reduction) || 0,
        limiterReductionDb: Number(this.graph?.limiter?.reduction) || 0,
        measurementMode: hasFreshWorkletLevel ? 'worklet' : 'fallback',
        contextState: 'running'
      };
    }

    disconnectReplacedGraph() {
      if (this.graph?.meterWorklet?.port) this.graph.meterWorklet.port.onmessage = null;
      this.disconnectNodes();
      this.graph?.context?.close?.();
      this.graph = null;
      this.video = null;
      this.resetMeasurementState({ resetWorklet: true });
    }

    attach(video) {
      if (!video || this.video === video && this.graph) return true;
      const AudioContextConstructor = this.window.AudioContext || this.window.webkitAudioContext;
      if (!AudioContextConstructor) return false;
      let context = null;
      let source = null;
      try {
        this.disconnectReplacedGraph();
        context = new AudioContextConstructor();
        source = context.createMediaElementSource(video);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.65;
        const gain = context.createGain();
        const compressor = context.createDynamicsCompressor();
        const limiter = context.createDynamicsCompressor();
        this.applyAudioParams(limiter, {
          threshold: -1, knee: 0, ratio: 20, attack: 0.003, release: 0.1
        });
        this.video = video;
        this.graph = { context, source, analyser, gain, compressor, limiter };
        this.applyCompressorState();
        this.applyNormalizerState();
        this.applyRoutingState();
        this.ensureAudioWorklet();
        return true;
      } catch (error) {
        try { source?.connect?.(context.destination); } catch {}
        this.logger.debug?.('[TFR] audio processing unavailable for this player', error);
        return false;
      }
    }

    resume() {
      const context = this.graph?.context;
      if (!context || context.state === 'running' || context.state === 'closed') return Promise.resolve();
      return Promise.resolve(context.resume?.()).catch(() => undefined);
    }

    async ensureAudioWorklet() {
      const graph = this.graph;
      const context = graph?.context;
      const WorkletNode = this.window.AudioWorkletNode;
      if (!this.normalizerEnabled || !context || graph.meterWorklet) return false;
      if (!this.workletModuleUrl || !context.audioWorklet?.addModule || !WorkletNode) {
        this.workletStatus = 'fallback';
        return false;
      }
      if (this.workletStatus === 'loading') return false;
      this.workletStatus = 'loading';
      try {
        await context.audioWorklet.addModule(this.workletModuleUrl);
        if (this.graph !== graph) return false;
        if (!this.normalizerEnabled) {
          this.workletStatus = 'idle';
          return false;
        }
        const meterWorklet = new WorkletNode(context, 'tfr-audio-level-meter', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 2
        });
        meterWorklet.port.onmessage = (event) => {
          if (this.graph !== graph || graph.meterWorklet !== meterWorklet) return;
          this.handleWorkletMessage(event);
        };
        graph.meterWorklet = meterWorklet;
        this.workletStatus = 'active';
        this.applyRoutingState();
        return true;
      } catch (error) {
        if (this.graph !== graph) return false;
        this.workletStatus = 'fallback';
        this.logger.debug?.('[TFR] AudioWorklet meter unavailable; using analyser fallback', error);
        return false;
      }
    }

    bypass() {
      this.compressorEnabled = false;
      this.normalizerEnabled = false;
      this.applyCompressorState();
      this.applyNormalizerState();
      this.applyRoutingState();
    }
  }

  window.TFRPlayerAudioEngine = Object.freeze({
    PlayerAudioEngine,
    PRESETS,
    TARGET_MIN_DB,
    TARGET_MAX_DB,
    TARGET_DEFAULT_DB,
    MAX_REDUCTION_MIN_DB,
    MAX_REDUCTION_MAX_DB,
    MAX_REDUCTION_DEFAULT_DB
  });
})();

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
  const MAX_REDUCTION_DB = -12;

  class PlayerAudioEngine {
    constructor({ windowRef = window, logger = console } = {}) {
      this.window = windowRef;
      this.logger = logger;
      this.compressorEnabled = false;
      this.preset = 'balanced';
      this.normalizerEnabled = false;
      this.targetDb = TARGET_DEFAULT_DB;
      this.currentGainDb = 0;
      this.measuredLevelDb = null;
      this.lastAudibleAt = 0;
      this.sampleBuffer = null;
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

    configure({ compressorEnabled, preset, normalizerEnabled, targetDb }) {
      this.compressorEnabled = Boolean(compressorEnabled);
      this.preset = this.normalizePreset(preset);
      this.normalizerEnabled = Boolean(normalizerEnabled);
      this.targetDb = this.normalizeTargetDb(targetDb);
      if (this.normalizerEnabled) this.currentGainDb = Math.min(0, this.currentGainDb);
      this.applyCompressorState();
      this.applyNormalizerState();
    }

    calculateTargetGainDb(inputDb) {
      if (!Number.isFinite(inputDb) || inputDb < SIGNAL_FLOOR_DB) return null;
      return Math.max(MAX_REDUCTION_DB, Math.min(0, this.targetDb - inputDb));
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
      this.lastAudibleAt = 0;
      this.setGainDb(0, 0.05);
    }

    update(now = Date.now()) {
      const { analyser, context } = this.graph || {};
      if (!this.normalizerEnabled || !analyser) return null;
      if (context?.state && context.state !== 'running') {
        return { levelDb: null, gainDb: this.currentGainDb, contextState: context.state };
      }
      const size = analyser.fftSize || 1024;
      if (!this.sampleBuffer || this.sampleBuffer.length !== size) this.sampleBuffer = new Float32Array(size);
      analyser.getFloatTimeDomainData(this.sampleBuffer);
      const inputDb = this.calculateMeasuredLevelDb(this.sampleBuffer);
      this.measuredLevelDb = Number.isFinite(inputDb) ? inputDb : null;
      const desiredGainDb = this.calculateTargetGainDb(inputDb);
      if (desiredGainDb == null) {
        if (this.lastAudibleAt && now - this.lastAudibleAt > 2500) {
          this.currentGainDb += (0 - this.currentGainDb) * 0.05;
          this.setGainDb(this.currentGainDb, 0.35);
        }
      } else {
        this.lastAudibleAt = now;
        const reducing = desiredGainDb < this.currentGainDb;
        this.currentGainDb += (desiredGainDb - this.currentGainDb) * (reducing ? 0.45 : 0.08);
        this.setGainDb(this.currentGainDb, reducing ? 0.06 : 0.22);
      }
      return { levelDb: this.measuredLevelDb, gainDb: this.currentGainDb, contextState: 'running' };
    }

    disconnectReplacedGraph() {
      ['source', 'analyser', 'gain', 'compressor', 'limiter'].forEach((key) => this.graph?.[key]?.disconnect?.());
      this.graph?.context?.close?.();
      this.graph = null;
      this.video = null;
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
        source.connect(analyser);
        analyser.connect(gain);
        gain.connect(compressor);
        compressor.connect(limiter);
        limiter.connect(context.destination);
        this.video = video;
        this.graph = { context, source, analyser, gain, compressor, limiter };
        this.applyCompressorState();
        this.applyNormalizerState();
        return true;
      } catch (error) {
        try { source?.connect?.(context.destination); } catch {}
        this.logger.debug?.('[TFR] audio processing unavailable for this player', error);
        return false;
      }
    }

    resume() {
      return this.graph?.context?.resume?.();
    }

    bypass() {
      this.compressorEnabled = false;
      this.normalizerEnabled = false;
      this.applyCompressorState();
      this.applyNormalizerState();
    }
  }

  window.TFRPlayerAudioEngine = Object.freeze({
    PlayerAudioEngine,
    PRESETS,
    TARGET_MIN_DB,
    TARGET_MAX_DB,
    TARGET_DEFAULT_DB
  });
})();

(() => {
  const create = ({ t, audioWorkletModuleUrl = '' }) => {
    const audioEngineModule = window.TFRPlayerAudioEngine;
    if (!audioEngineModule?.PlayerAudioEngine) throw new Error('Player audio engine module is missing');
    const { PlayerAudioEngine, PRESETS: AUDIO_COMPRESSOR_PRESETS,
      MAX_REDUCTION_DEFAULT_DB: VOLUME_MAX_REDUCTION_DEFAULT_DB } = audioEngineModule;
    const AUDIO_CALIBRATION_DELAY_MS = 400;

    class PlayerAudioCompressor {
      constructor() {
        this.engine = new PlayerAudioEngine({
          workletModuleUrl: audioWorkletModuleUrl,
          onWorkletLevel: () => this.updateVolumeNormalization(true)
        });
        this.enabled = false;
        this.controlsEnabled = false;
        this.preset = 'balanced';
        this.normalizerEnabled = false;
        this.targetDb = -16;
        this.maxReductionDb = VOLUME_MAX_REDUCTION_DEFAULT_DB;
        this.timer = null;
        this.meterTimer = null;
        this.button = null;
        this.panel = null;
        this.updatePreference = null;
        this.resumeAudio = () => this.engine.resume();
        this.boundVideo = null;
        this.calibrationTimer = null;
        this.lastNativeVolume = null;
        this.handleNativeVolume = () => { this.engine.resume(); this.calibrateFromNativeVolume(); };
        this.boundMediaChanged = () => { this.engine.resetMediaState(); this.refresh(); };
        this.lastMeterReadoutAt = 0;
      }

      get currentGainDb() { return this.engine.currentGainDb; }
      get measuredLevelDb() { return this.engine.measuredLevelDb; }
      get normalizerPhase() { return this.engine.normalizerPhase; }
      get video() { return this.engine.video; }
      get graph() { return this.engine.graph; }
      set graph(value) { this.engine.graph = value; }

      init() {
        this.timer = window.setInterval(() => this.refresh(), 1000);
      }

      syncRuntimeActivity() {
        if (this.normalizerEnabled && !this.meterTimer) {
          this.meterTimer = window.setInterval(() => this.updateVolumeNormalization(false), 100);
        } else if (!this.normalizerEnabled && this.meterTimer) {
          clearInterval(this.meterTimer);
          this.meterTimer = null;
        }
        const shouldResumeAudio = this.enabled || this.normalizerEnabled || Boolean(this.engine.graph);
        const method = shouldResumeAudio ? 'addEventListener' : 'removeEventListener';
        document[method]?.('pointerdown', this.resumeAudio, true);
        document[method]?.('keydown', this.resumeAudio, true);
        if (!shouldResumeAudio) this.bindVideoEvents(null);
      }

      setPreferenceUpdater(updatePreference) {
        this.updatePreference = updatePreference;
      }

      closePanel() {
        this.panel?.remove();
        this.panel = null;
      }

      removeControls() {
        this.closePanel();
        this.button?.remove();
        this.button = null;
      }

      configure({ controlsEnabled, enabled, preset, normalizerEnabled, targetDb, maxReductionDb }) {
        const panelWasOpen = Boolean(this.panel?.isConnected);
        this.controlsEnabled = Boolean(controlsEnabled);
        this.enabled = Boolean(enabled);
        this.preset = this.normalizePreset(preset);
        this.normalizerEnabled = Boolean(normalizerEnabled);
        this.targetDb = this.normalizeTargetDb(targetDb);
        this.maxReductionDb = this.targetDb;
        this.engine.configure({
          compressorEnabled: this.enabled,
          preset: this.preset,
          normalizerEnabled: this.normalizerEnabled,
          targetDb: this.targetDb,
          maxReductionDb: this.maxReductionDb
        });
        this.syncRuntimeActivity();
        this.closePanel();
        this.refresh();
        if (panelWasOpen && this.controlsEnabled) this.togglePanel();
      }

      normalizePreset(preset) {
        return this.engine.normalizePreset(preset);
      }

      normalizeTargetDb(value) {
        return this.engine.normalizeTargetDb(value);
      }

      calculateTargetGainDb(inputDb) {
        this.engine.targetDb = this.targetDb;
        return this.engine.calculateTargetGainDb(inputDb);
      }

      calculateMeasuredLevelDb(samples) {
        return this.engine.calculateMeasuredLevelDb(samples);
      }

      applyCompressorState() {
        this.engine.compressorEnabled = this.enabled;
        this.engine.preset = this.preset;
        this.engine.applyCompressorState();
        const audioProtectionEnabled = this.enabled || this.normalizerEnabled;
        this.button?.classList.toggle('is-active', audioProtectionEnabled);
        this.button?.setAttribute('aria-pressed', String(audioProtectionEnabled));
      }

      updateVolumeNormalization(fromWorklet = false) {
        if (!this.normalizerEnabled || this.calibrationTimer) return;
        if (!fromWorklet && this.engine.isWorkletMeasurementFresh()) return;
        const result = this.engine.update();
        const now = Date.now();
        if (document.visibilityState !== 'hidden' && result && now - this.lastMeterReadoutAt >= 200) {
          this.lastMeterReadoutAt = now;
          this.updateNormalizerReadout(
            result.levelDb,
            result.contextState,
            result.normalizerPhase,
            result.measurementMode
          );
        }
      }

      formatReductionDb(value) {
        const reduction = Number(value) || 0;
        const rounded = Math.abs(reduction) < 0.05 ? 0 : reduction;
        return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
      }

      updateNormalizerReadout(
        levelDb,
        contextState = 'running',
        phase = this.normalizerPhase,
        measurementMode = this.engine.getMeasurementMode()
      ) {
        const levelOutput = this.panel?.querySelector?.('.tfr-audio-normalizer__level');
        const gainOutput = this.panel?.querySelector?.('.tfr-audio-normalizer__gain');
        const measurementOutput = this.panel?.querySelector?.('.tfr-audio-normalizer__measurement');
        if (levelOutput) {
          levelOutput.textContent = contextState === 'running'
            ? t('settings.volumeNormalizer.measured', {
              level: Number.isFinite(levelDb) ? levelDb.toFixed(1) : '—'
            })
            : t('settings.volumeNormalizer.audioPaused');
        }
        if (gainOutput) gainOutput.textContent = this.normalizerEnabled
          ? t(
            phase === 'releasing'
              ? 'settings.volumeNormalizer.gainReleasing'
              : 'settings.volumeNormalizer.gain',
            { gain: this.formatReductionDb(this.currentGainDb) }
          )
          : t('settings.volumeNormalizer.gainInactive');
        if (measurementOutput) measurementOutput.textContent = t(
          measurementMode === 'worklet'
            ? 'settings.volumeNormalizer.measurementWorklet'
            : 'settings.volumeNormalizer.measurementFallback'
        );
      }

      updateCompressorReadout() {
        const output = this.panel?.querySelector?.('.tfr-audio-compressor__reduction');
        if (!output) return;
        const reduction = this.formatReductionDb(this.graph?.compressor?.reduction);
        output.textContent = this.enabled
          ? t('settings.audioCompressor.reduction', { reduction })
          : t('settings.audioCompressor.reductionInactive');
      }

      attachAudio(video) {
        const attached = this.engine.attach(video);
        if (attached) {
          this.bindVideoEvents(video);
          this.engine.resume();
        }
        return attached;
      }

      calibrateFromNativeVolume() {
        const video = this.boundVideo;
        const volume = Number(video?.volume);
        const previous = this.lastNativeVolume;
        this.lastNativeVolume = volume;
        if (volume === previous) return; // Mute/unmute alone must not recalibrate.
        this.clearCalibration();
        if (!this.normalizerEnabled || !video || video.muted || volume <= 0 || video.paused) return;
        // Preserve the user's volume change while waiting for a fresh measurement.
        this.calibrationTimer = window.setTimeout(() => {
          this.calibrationTimer = null;
          if (this.boundVideo !== video || !this.normalizerEnabled || video.muted || video.volume <= 0 || video.paused) return;
          const targetDb = this.engine.calibrateCurrentLevel();
          if (targetDb == null) return;
          this.targetDb = targetDb;
          this.maxReductionDb = targetDb;
          Promise.resolve(this.updatePreference?.({ targetDb: this.targetDb })).catch(error => {
            console.debug('[TFR] volume calibration could not be saved', error);
          });
        }, AUDIO_CALIBRATION_DELAY_MS);
      }

      clearCalibration() {
        window.clearTimeout(this.calibrationTimer);
        this.calibrationTimer = null;
      }

      bindVideoEvents(video) {
        if (this.boundVideo === video) return;
        this.clearCalibration();
        this.lastNativeVolume = video ? Number(video.volume) : null;
        ['play', 'playing'].forEach((eventName) => {
          this.boundVideo?.removeEventListener?.(eventName, this.resumeAudio);
          video?.addEventListener?.(eventName, this.resumeAudio);
        });
        this.boundVideo?.removeEventListener?.('volumechange', this.handleNativeVolume);
        video?.addEventListener?.('volumechange', this.handleNativeVolume);
        ['loadstart', 'emptied', 'loadedmetadata'].forEach((eventName) => {
          this.boundVideo?.removeEventListener?.(eventName, this.boundMediaChanged);
          video?.addEventListener?.(eventName, this.boundMediaChanged);
        });
        this.boundVideo = video || null;
      }

      ensureButton() {
        if (!this.controlsEnabled) {
          this.removeControls();
          return;
        }
        const volumeButton = document.querySelector(
          '[data-a-target="player-mute-unmute-button"], [data-a-target="player-volume-button"]'
        );
        const controls = volumeButton?.parentElement;
        if (!controls) {
          this.removeControls();
          return;
        }
        if (!this.button) {
          this.button = document.createElement('button');
          this.button.type = 'button';
          this.button.className = 'tfr-audio-compressor-button';
          this.button.textContent = '≋';
          this.button.title = t('settings.audioCompressor.button');
          this.button.setAttribute('aria-label', t('settings.audioCompressor.button'));
          this.button.addEventListener('click', () => this.togglePanel());
        }
        if (this.button.parentElement !== controls) controls.appendChild(this.button);
        this.applyCompressorState();
      }

      createPanelHeading(titleKey, enabled) {
        const heading = document.createElement('div');
        heading.className = 'tfr-audio-compressor-panel__heading';
        const title = document.createElement('strong');
        title.textContent = t(titleKey);
        const status = document.createElement('span');
        status.className = 'tfr-audio-compressor-panel__status';
        status.textContent = enabled
          ? t('settings.audioCompressor.statusEnabled') : t('settings.audioCompressor.statusDisabled');
        heading.append(title, status);
        return heading;
      }

      createStateToggle(enabled, onToggle) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `tfr-audio-compressor-panel__toggle ${enabled ? 'is-disable' : 'is-enable'}`;
        button.textContent = enabled
          ? t('settings.audioCompressor.disable') : t('settings.audioCompressor.enable');
        button.addEventListener('click', onToggle);
        return button;
      }

      togglePanel() {
        if (!this.controlsEnabled || !this.button) return;
        if (this.panel?.isConnected) {
          this.closePanel();
          return;
        }
        this.engine.resume();
        const panel = document.createElement('div');
        panel.className = 'tfr-audio-compressor-panel';
        panel.classList.toggle('is-enabled', this.enabled);
        panel.classList.toggle('is-normalizing', this.normalizerEnabled);
        const heading = this.createPanelHeading('settings.audioCompressor.title', this.enabled);
        const description = document.createElement('small');
        description.textContent = t('settings.audioCompressor.panelDescription');
        const toggle = this.createStateToggle(this.enabled, async () => {
          await this.updatePreference?.({ enabled: !this.enabled, preset: this.preset });
        });
        const presets = document.createElement('div');
        presets.className = 'tfr-audio-compressor-panel__presets';
        AUDIO_COMPRESSOR_PRESETS.forEach((preset) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = t(`settings.audioCompressor.preset.${preset}`);
          button.disabled = !this.enabled;
          button.classList.toggle('is-active', this.enabled && preset === this.preset);
          button.addEventListener('click', async () => {
            await this.updatePreference?.({ enabled: true, preset });
          });
          presets.appendChild(button);
        });
        const compressorReduction = document.createElement('output');
        compressorReduction.className = 'tfr-audio-compressor__reduction';
        compressorReduction.textContent = this.enabled
          ? t('settings.audioCompressor.reduction', {
            reduction: (Number(this.graph?.compressor?.reduction) || 0).toFixed(1)
          })
          : t('settings.audioCompressor.reductionInactive');
        const normalizer = document.createElement('section');
        normalizer.className = 'tfr-audio-normalizer';
        const normalizerHeading = this.createPanelHeading(
          'settings.volumeNormalizer.title', this.normalizerEnabled
        );
        const normalizerDescription = document.createElement('small');
        normalizerDescription.textContent = t('settings.volumeNormalizer.panelDescription');
        const normalizerToggle = this.createStateToggle(this.normalizerEnabled, async () => {
          await this.updatePreference?.({ normalizerEnabled: !this.normalizerEnabled });
        });
        const gainOutput = document.createElement('output');
        gainOutput.className = 'tfr-audio-normalizer__gain';
        gainOutput.textContent = this.normalizerEnabled
          ? t(
            this.normalizerPhase === 'releasing'
              ? 'settings.volumeNormalizer.gainReleasing'
              : 'settings.volumeNormalizer.gain',
            { gain: this.formatReductionDb(this.currentGainDb) }
          )
          : t('settings.volumeNormalizer.gainInactive');
        const levelOutput = document.createElement('output');
        levelOutput.className = 'tfr-audio-normalizer__level';
        levelOutput.textContent = t('settings.volumeNormalizer.measured', {
          level: Number.isFinite(this.measuredLevelDb) ? this.measuredLevelDb.toFixed(1) : '—'
        });
        const measurementOutput = document.createElement('output');
        measurementOutput.className = 'tfr-audio-normalizer__measurement';
        measurementOutput.textContent = t(
          this.engine.getMeasurementMode() === 'worklet'
            ? 'settings.volumeNormalizer.measurementWorklet'
            : 'settings.volumeNormalizer.measurementFallback'
        );
        normalizer.append(
          normalizerHeading, normalizerDescription, normalizerToggle,
          measurementOutput, levelOutput, gainOutput
        );
        panel.append(heading, description, toggle, presets, compressorReduction, normalizer);
        document.body.appendChild(panel);
        const rect = this.button.getBoundingClientRect();
        panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 288, rect.left))}px`;
        panel.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
        panel.style.maxHeight = `${Math.max(100, rect.top - 24)}px`;
        panel.style.overflowY = 'auto';
        panel.style.boxSizing = 'border-box';
        this.panel = panel;
      }

      refresh() {
        const visible = document.visibilityState !== 'hidden';
        if (visible) this.ensureButton();
        const video = document.querySelector('.video-player__container video, [data-a-target="video-player"] video, video');
        if (video && !this.engine.canProcess(video)) {
          const needsNativeRestore = /^https?:/i.test(video.src || video.currentSrc || '')
            || /\/clip\//i.test(window.location.pathname);
          const restoreCount = Number(video.dataset?.tfrAudioRestoreCount || 0);
          const restoreAt = Number(video.dataset?.tfrAudioRestoreAt || 0);
          if (needsNativeRestore && video.dataset?.tfrAudioCaptured === 'true'
            && restoreCount < 3 && Date.now() >= restoreAt) {
            const root = video.closest?.('[data-a-target="video-player"], .video-player__container');
            if (root) {
              video.dataset.tfrAudioRestoreCount = String(restoreCount + 1);
              video.dataset.tfrAudioRestoreAt = String(Date.now() + 16000 * 2 ** restoreCount);
              root.dispatchEvent(new Event('tfr:player:audio-restore', { bubbles: true }));
            }
          }
          this.engine.disconnectReplacedGraph();
          this.bindVideoEvents(null);
          return;
        }
        if ((this.enabled || this.normalizerEnabled) && video && video !== this.video) this.attachAudio(video);
        this.applyCompressorState();
        if (visible) this.updateCompressorReadout();
      }

      dispose() {
        clearInterval(this.timer);
        clearInterval(this.meterTimer);
        this.timer = null;
        this.meterTimer = null;
        this.removeControls();
        document.removeEventListener?.('pointerdown', this.resumeAudio, true);
        document.removeEventListener?.('keydown', this.resumeAudio, true);
        this.bindVideoEvents(null);
        this.engine.bypass();
      }
    }

    return PlayerAudioCompressor;
  };
  window.TFRPlayerAudioControls = Object.freeze({ create });
})();

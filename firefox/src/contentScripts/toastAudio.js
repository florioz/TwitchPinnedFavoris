(function (root, factory) {
  const api = factory();
  root.__TFR_TOAST_AUDIO__ = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SOUND_PRESETS = {
    soft: [
      { frequency: 660, start: 0, duration: 0.11, type: 'sine' },
      { frequency: 880, start: 0.1, duration: 0.14, type: 'sine' }
    ],
    chime: [
      { frequency: 523.25, start: 0, duration: 0.12, type: 'triangle' },
      { frequency: 783.99, start: 0.11, duration: 0.18, type: 'triangle' },
      { frequency: 1046.5, start: 0.25, duration: 0.2, type: 'triangle' }
    ],
    arcade: [
      { frequency: 440, start: 0, duration: 0.08, type: 'square' },
      { frequency: 660, start: 0.08, duration: 0.08, type: 'square' },
      { frequency: 990, start: 0.16, duration: 0.12, type: 'square' }
    ],
    pulse: [
      { frequency: 392, start: 0, duration: 0.1, type: 'sine' },
      { frequency: 392, start: 0.16, duration: 0.1, type: 'sine' }
    ],
    alert: [
      { frequency: 880, start: 0, duration: 0.09, type: 'sawtooth' },
      { frequency: 740, start: 0.1, duration: 0.1, type: 'sawtooth' }
    ]
  };

  const createToastAudio = ({
    AudioContextConstructor,
    AudioConstructor,
    schedule = setTimeout
  } = {}) => {
    let audioContext = null;

    const getAudioContext = async () => {
      if (!AudioContextConstructor) {
        return null;
      }
      if (!audioContext) {
        audioContext = new AudioContextConstructor();
      }
      if (audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => null);
      }
      return audioContext;
    };

    return {
      async play({
        soundId = 'soft',
        volume = 35,
        customSoundDataUrl = ''
      } = {}) {
        if (volume <= 0) {
          return false;
        }
        if (soundId === 'custom' && customSoundDataUrl && AudioConstructor) {
          const audio = new AudioConstructor(customSoundDataUrl);
          audio.volume = Math.max(0, Math.min(1, volume / 100));
          await audio.play().catch(() => null);
          return true;
        }
        const context = await getAudioContext();
        if (!context) {
          return false;
        }
        const preset = SOUND_PRESETS[soundId] || SOUND_PRESETS.soft;
        const masterGain = context.createGain();
        const now = context.currentTime + 0.02;
        masterGain.gain.setValueAtTime(Math.min(0.5, volume / 100), now);
        masterGain.connect(context.destination);
        preset.forEach((note) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const start = now + note.start;
          const end = start + note.duration;
          oscillator.type = note.type;
          oscillator.frequency.setValueAtTime(note.frequency, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.35, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, end);
          oscillator.connect(gain);
          gain.connect(masterGain);
          oscillator.start(start);
          oscillator.stop(end + 0.03);
        });
        schedule(() => masterGain.disconnect(), 900);
        return true;
      }
    };
  };

  return { createToastAudio, SOUND_PRESETS };
});

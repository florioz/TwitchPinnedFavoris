const test = require('node:test');
const assert = require('node:assert/strict');

const { createToastAudio } = require('../src/contentScripts/toastAudio.js');

test('custom sound uses an audio element and normalized volume', async () => {
  let instance;
  class FakeAudio {
    constructor(url) {
      this.url = url;
      instance = this;
    }
    async play() {
      this.played = true;
    }
  }
  const audio = createToastAudio({ AudioConstructor: FakeAudio });

  assert.equal(await audio.play({
    soundId: 'custom',
    volume: 150,
    customSoundDataUrl: 'data:audio/test'
  }), true);
  assert.equal(instance.url, 'data:audio/test');
  assert.equal(instance.volume, 1);
  assert.equal(instance.played, true);
});

test('zero volume skips all playback', async () => {
  const audio = createToastAudio({
    AudioConstructor: class {
      constructor() {
        throw new Error('should not create audio');
      }
    }
  });
  assert.equal(await audio.play({ soundId: 'custom', volume: 0, customSoundDataUrl: 'x' }), false);
});

test('synthetic preset creates one oscillator per note', async () => {
  const oscillators = [];
  const context = {
    state: 'running',
    currentTime: 1,
    destination: {},
    createGain: () => ({
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {}
      },
      connect() {},
      disconnect() {}
    }),
    createOscillator: () => {
      const oscillator = {
        frequency: { setValueAtTime() {} },
        connect() {},
        start() {},
        stop() {}
      };
      oscillators.push(oscillator);
      return oscillator;
    }
  };
  const audio = createToastAudio({
    AudioContextConstructor: class {
      constructor() {
        return context;
      }
    },
    schedule: (callback) => callback()
  });

  assert.equal(await audio.play({ soundId: 'pulse', volume: 35 }), true);
  assert.equal(oscillators.length, 2);
});

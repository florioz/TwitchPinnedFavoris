const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('AudioWorklet meter reports stereo RMS and peak about twenty times per second', () => {
  let Processor = null;
  const messages = [];
  class AudioWorkletProcessorMock {
    constructor() {
      this.port = { postMessage: (message) => messages.push(message) };
    }
  }
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../src/contentScripts/worklets/audioLevelProcessor.js'),
      'utf8'
    ),
    {
      AudioWorkletProcessor: AudioWorkletProcessorMock,
      sampleRate: 48000,
      registerProcessor: (name, Type) => {
        assert.equal(name, 'tfr-audio-level-meter');
        Processor = Type;
      },
      Math
    }
  );

  const processor = new Processor();
  const left = new Float32Array(128).fill(0.1);
  const right = new Float32Array(128).fill(0.2);
  for (let index = 0; index < 18; index += 1) {
    assert.equal(processor.process([[left, right]]), true);
  }
  assert.equal(messages.length, 0);
  processor.process([[left, right]]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'level');
  assert.ok(messages[0].rms > 0.15 && messages[0].rms < 0.16);
  assert.ok(Math.abs(messages[0].peak - 0.2) < 0.001);
});

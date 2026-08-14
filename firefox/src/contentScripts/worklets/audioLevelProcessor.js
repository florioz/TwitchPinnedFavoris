class TFRAudioLevelProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.squareSum = 0;
    this.peak = 0;
    this.sampleCount = 0;
    this.frameCount = 0;
    this.reportInterval = Math.max(128, Math.round(sampleRate / 20));
  }

  process(inputs) {
    const channels = inputs[0] || [];
    this.frameCount += channels[0]?.length || 0;
    for (const channel of channels) {
      for (let index = 0; index < channel.length; index += 1) {
        const sample = Math.abs(channel[index]);
        this.squareSum += sample * sample;
        this.peak = Math.max(this.peak, sample);
        this.sampleCount += 1;
      }
    }
    if (this.frameCount >= this.reportInterval && this.sampleCount > 0) {
      this.port.postMessage({
        type: 'level',
        rms: Math.sqrt(this.squareSum / this.sampleCount),
        peak: this.peak
      });
      this.squareSum = 0;
      this.peak = 0;
      this.sampleCount = 0;
      this.frameCount = 0;
    }
    return true;
  }
}

registerProcessor('tfr-audio-level-meter', TFRAudioLevelProcessor);

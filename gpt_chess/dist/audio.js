export class AtmosphereAudio {
  constructor() { this.enabled = false; this.context = null; }
  async toggle() {
    if (this.enabled) { this.enabled = false; await this.context.suspend(); return false; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw Error('Audio is not supported in this browser.');
    if (!this.context) {
      this.context = new AudioContext();
      const ctx = this.context;
      const data = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const channel = data.getChannelData(0);
      let last = 0;
      for (let i = 0; i < channel.length; i++) { last = (last + Math.random() * 0.04 - 0.02) / 1.02; channel[i] = last * 3; }
      const waterfall = ctx.createBufferSource(); waterfall.buffer = data; waterfall.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 620;
      this.volume = ctx.createGain(); this.volume.gain.value = 0.16;
      waterfall.connect(filter).connect(this.volume).connect(ctx.destination); waterfall.start();
    }
    await this.context.resume(); this.enabled = true; return true;
  }
  move(capture = false) {
    if (!this.enabled || this.context.state !== 'running') return;
    const ctx = this.context, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(capture ? 155 : 340, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(75, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.19, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + 0.17);
  }
}

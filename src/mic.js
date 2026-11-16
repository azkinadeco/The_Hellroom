// Your own voice in the game. With the microphone setting on, the browser's mic is
// listened to locally (nothing is recorded, stored or sent anywhere): when you talk,
// gasp or scream above the room's own background noise, the game turns it into a
// noise at your position that residents can hear.
export class Mic {
  constructor() {
    this.active = false; this.failed = false; this.starting = false;
    this.level = 0;        // 0..1, how far above the background you are right now
    this.floor = 0.01;     // tracked background loudness (RMS)
  }
  async start() {
    if (this.active || this.starting) return this.active;
    this.starting = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no mic api');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 1024;
      src.connect(this.an);                 // analysed only - never routed to the speakers
      this.buf = new Float32Array(this.an.fftSize);
      this.active = true; this.failed = false;
    } catch (e) {
      this.failed = true; this.active = false;
    }
    this.starting = false;
    return this.active;
  }
  stop() {
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.stream = null; this.ctx = null; this.an = null; this.active = false; this.level = 0;
  }
  // call once per frame; sens 0.5..2 scales how easily you are heard
  update(dt, sens = 1) {
    if (!this.active || !this.an) { this.level = 0; return 0; }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this.an.getFloatTimeDomainData(this.buf);
    let sum = 0; for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    // the background follows quiet stretches quickly and loud ones only very slowly
    this.floor += (rms - this.floor) * Math.min(1, dt * (rms < this.floor ? 2 : 0.05));
    this.floor = Math.max(0.002, this.floor);
    const above = Math.max(0, Math.log10(rms / this.floor) * 20 - 8);     // dB above background, minus a margin
    const target = Math.min(1, above / 30 * sens);
    this.level += (target - this.level) * Math.min(1, dt * (target > this.level ? 20 : 4));
    return this.level;
  }
}

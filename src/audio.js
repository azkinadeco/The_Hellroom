// Fully procedural WebAudio sound design (no audio files needed).
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.ready = false;
    this.chase = 0;
    this._nextAmb = 8;
    this._beat = 0;
    this.onCue = null; // (kind, pos) -> subtitles
  }
  _cue(kind, pos) { if (this.onCue && pos) this.onCue(kind, pos); }

  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
    // hallway reverb
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.6, 2.2);
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.5;
    this.verbIn.connect(this.verb).connect(this.master);
    this.noiseBuf = this._noise(2, 'white');
    this.brownBuf = this._noise(4, 'brown');
    this._startAmbience();
    this._startChaseBed();
    this.ready = true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  get t() { return this.ctx.currentTime; }

  _noise(sec, kind) {
    const ctx = this.ctx, len = sec * ctx.sampleRate;
    const b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  _impulse(sec, decay) {
    const ctx = this.ctx, len = sec * ctx.sampleRate;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
    }
    return b;
  }

  // ---------- routing helpers ----------
  _out(pos, wet = 0.35) {
    const g = this.ctx.createGain();
    let node = g;
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = 2.0; p.maxDistance = 60; p.rolloffFactor = 1.4;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1.5; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y ?? 1.5, pos.z);
      g.connect(p); node = p;
    }
    node.connect(this.sfx);
    if (wet > 0) { const w = this.ctx.createGain(); w.gain.value = wet; node.connect(w).connect(this.verbIn); }
    return g;
  }
  _env(g, t0, a, peak, d, sustain = 0) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + d);
  }
  _noiseSrc(buf = this.noiseBuf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; }
  _osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  _filter(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

  updateListener(cam) {
    if (!this.ready) return;
    const l = this.ctx.listener, p = cam.position;
    const f = { x: -Math.sin(cam.rotation.y), z: -Math.cos(cam.rotation.y) };
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = f.x; l.forwardY.value = 0; l.forwardZ.value = f.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, 0, f.z, 0, 1, 0); }
  }

  // ---------- ambience ----------
  _startAmbience() {
    const ctx = this.ctx;
    // fluorescent ballast hum
    const hum = ctx.createGain(); hum.gain.value = 0.022; hum.connect(this.amb);
    for (const [f, g] of [[120, 1], [240, 0.35], [360, 0.12]]) {
      const o = this._osc('sine', f), gg = ctx.createGain(); gg.gain.value = g;
      o.connect(gg).connect(hum); o.start();
    }
    const hiss = this._noiseSrc(), hf = this._filter('bandpass', 7000, 0.6), hg = ctx.createGain();
    hg.gain.value = 0.01; hiss.connect(hf).connect(hg).connect(this.amb); hiss.start();
    // room tone
    const room = this._noiseSrc(this.brownBuf), rf = this._filter('lowpass', 260), rg = ctx.createGain();
    rg.gain.value = 0.11; room.connect(rf).connect(rg).connect(this.amb); room.start();
    this.humGain = hum;
  }
  setAmbience(on) {
    if (!this.ready) return;
    this.amb.gain.setTargetAtTime(on ? 1 : 0, this.t, 0.8);
  }
  _startChaseBed() {
    const ctx = this.ctx;
    this.chaseGain = ctx.createGain(); this.chaseGain.gain.value = 0; this.chaseGain.connect(this.master);
    const lp = this._filter('lowpass', 420, 2);
    lp.connect(this.chaseGain);
    for (const f of [41.2, 43.65, 61.7]) {
      const o = this._osc('sawtooth', f); const g = ctx.createGain(); g.gain.value = 0.08;
      o.connect(g).connect(lp); o.start();
    }
    const lfo = this._osc('sine', 2.2), lg = ctx.createGain(); lg.gain.value = 260;
    lfo.connect(lg).connect(lp.frequency); lfo.start();
  }

  // per-frame update: heartbeat, chase bed, random distant events
  update(dt, fear, chase, pos) {
    if (!this.ready) return;
    this.chase += (chase - this.chase) * Math.min(1, dt * 2);
    this.chaseGain.gain.setTargetAtTime(this.chase * 0.55, this.t, 0.3);
    if (fear > 0.15) {
      this._beat -= dt;
      if (this._beat <= 0) {
        this._beat = 60 / (70 + fear * 100);
        this.heartbeat(Math.min(1, fear));
      }
    }
    this._nextAmb -= dt;
    if (this._nextAmb <= 0) {
      this._nextAmb = 18 + Math.random() * 30;
      const ang = Math.random() * Math.PI * 2, d = 18 + Math.random() * 15;
      const p = pos ? { x: pos.x + Math.cos(ang) * d, y: 2, z: pos.z + Math.sin(ang) * d } : null;
      const r = Math.random();
      if (r < 0.25) this.schoolBell(p);
      else if (r < 0.5) this.doorSlam(p);
      else if (r < 0.7) this.lockerClang(p, 0.5);
      else if (r < 0.85) this.distantSteps(p);
      else this.chalkScreech(p);
    }
  }

  // ---------- one-shots ----------
  footstep(kind) {
    if (!this.ready) return;
    const t = this.t, vol = kind === 'sprint' ? 0.32 : kind === 'crouch' ? 0.07 : 0.17;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this._filter('bandpass', 1100 + Math.random() * 500, 1.1);
    const g = this._out(null, 0.25);
    src.connect(f).connect(g);
    this._env(g, t, 0.004, vol, 0.09);
    src.start(t, Math.random()); src.stop(t + 0.15);
    const o = this._osc('sine', 85 + Math.random() * 20), og = this._out(null, 0.1);
    o.connect(og); this._env(og, t, 0.004, vol * 0.8, 0.08); o.start(t); o.stop(t + 0.12);
  }
  heavyStep(pos, vol = 0.5) {
    if (!this.ready) return;
    this._cue('step', pos);
    const t = this.t;
    const o = this._osc('sine', 60 + Math.random() * 10), g = this._out(pos, 0.4);
    o.connect(g); this._env(g, t, 0.005, vol, 0.18); o.start(t); o.stop(t + 0.25);
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this._filter('lowpass', 600), g2 = this._out(pos, 0.4);
    src.connect(f).connect(g2); this._env(g2, t, 0.003, vol * 0.6, 0.1); src.start(t, Math.random()); src.stop(t + 0.15);
  }
  heartbeat(f) {
    const t = this.t;
    for (const [dt, v] of [[0, 1], [0.16, 0.65]]) {
      const o = this._osc('sine', 52), g = this._out(null, 0);
      o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.12);
      o.connect(g); this._env(g, t + dt, 0.01, 0.35 * v * (0.4 + f * 0.6), 0.14); o.start(t + dt); o.stop(t + dt + 0.2);
    }
  }
  whistle(pos) {
    if (!this.ready) return;
    this._cue('whistle', pos);
    const t = this.t, g = this._out(pos, 0.6);
    const o = this._osc('sine', 2750), trem = this._osc('square', 28), tg = this.ctx.createGain();
    tg.gain.value = 140; trem.connect(tg).connect(o.frequency);
    const o2 = this._osc('sine', 3300); const g2 = this.ctx.createGain(); g2.gain.value = 0.3;
    o.connect(g); o2.connect(g2).connect(g); trem.frequency.setValueAtTime(28, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.03);
    g.gain.setValueAtTime(0.32, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    g.gain.setValueAtTime(0.0001, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.74);
    g.gain.setValueAtTime(0.32, t + 1.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);
    for (const n of [o, o2, trem]) { n.start(t); n.stop(t + 1.6); }
  }
  scrape(pos, dur = 0.5, vol = 0.25) {
    if (!this.ready) return;
    this._cue('scrape', pos);
    const t = this.t, src = this._noiseSrc(), f = this._filter('bandpass', 500, 4), g = this._out(pos, 0.4);
    f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(700 + Math.random() * 300, t + dur);
    src.connect(f).connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
    g.gain.setValueAtTime(vol, t + dur - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  crack(pos) {
    if (!this.ready) return;
    const t = this.t, src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this._filter('highpass', 1800), g = this._out(pos, 0.5);
    src.connect(f).connect(g); this._env(g, t, 0.002, 0.5, 0.06); src.start(t, Math.random()); src.stop(t + 0.1);
  }
  scream(pos) {
    if (!this.ready) return;
    this._cue('scream', pos);
    const t = this.t, g = this._out(pos, 0.6), bp = this._filter('bandpass', 1500, 1.2);
    bp.connect(g);
    for (const f of [820, 1240, 1610]) {
      const o = this._osc('sawtooth', f), vib = this._osc('sine', 7 + Math.random() * 3), vg = this.ctx.createGain();
      vg.gain.value = f * 0.03; vib.connect(vg).connect(o.frequency);
      o.frequency.setValueAtTime(f * 0.8, t); o.frequency.linearRampToValueAtTime(f * 1.15, t + 0.3); o.frequency.linearRampToValueAtTime(f * 0.9, t + 1.4);
      const og = this.ctx.createGain(); og.gain.value = 0.12; o.connect(og).connect(bp);
      o.start(t); vib.start(t); o.stop(t + 1.6); vib.stop(t + 1.6);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.06);
    g.gain.setValueAtTime(0.55, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  }
  doorCreak(pos, open = true) {
    if (!this.ready) return;
    this._cue('door', pos);
    const t = this.t, o = this._osc('sawtooth', open ? 110 : 160), f = this._filter('bandpass', 900, 6), g = this._out(pos, 0.45);
    const lfo = this._osc('square', 18 + Math.random() * 10), lg = this.ctx.createGain(); lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    o.frequency.linearRampToValueAtTime(open ? 190 : 90, t + 0.6);
    o.connect(f).connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.start(t); lfo.start(t); o.stop(t + 0.75); lfo.stop(t + 0.75);
    if (!open) this._thud(pos, t + 0.55, 0.35);
  }
  _thud(pos, t, vol) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this._filter('lowpass', 350), g = this._out(pos, 0.6);
    src.connect(f).connect(g); this._env(g, t, 0.003, vol, 0.25); src.start(t, Math.random()); src.stop(t + 0.35);
  }
  doorLocked(pos) {
    if (!this.ready) return;
    const t = this.t;
    for (let i = 0; i < 3; i++) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = this._filter('bandpass', 2400, 3), g = this._out(pos, 0.2);
      src.connect(f).connect(g); this._env(g, t + i * 0.09, 0.002, 0.25, 0.05); src.start(t + i * 0.09, Math.random()); src.stop(t + i * 0.09 + 0.07);
    }
  }
  lockerClang(pos, vol = 1) {
    if (!this.ready) return;
    this._cue('locker', pos);
    const t = this.t, g = this._out(pos, 0.5);
    for (const [f, a] of [[210, 1], [523, 0.6], [811, 0.45], [1307, 0.3], [1820, 0.2]]) {
      const o = this._osc('sine', f * (0.97 + Math.random() * 0.06)), og = this.ctx.createGain();
      o.connect(og).connect(g); this._env(og, t, 0.002, 0.12 * a * vol, 0.6 + Math.random() * 0.4); o.start(t); o.stop(t + 1.1);
    }
    g.gain.value = 1;
    this._thud(pos, t, 0.3 * vol);
  }
  schoolBell(pos) {
    if (!this.ready) return;
    this._cue('bell', pos);
    const t = this.t, g = this._out(pos, 0.9), lp = this._filter('lowpass', 2200);
    lp.connect(g);
    const o = this._osc('square', 880), mod = this._osc('square', 24), mg = this.ctx.createGain();
    mg.gain.value = 0.5; const am = this.ctx.createGain(); am.gain.value = 0.5;
    mod.connect(mg).connect(am.gain);
    o.connect(am).connect(lp);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
    g.gain.setValueAtTime(0.06, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    o.start(t); mod.start(t); o.stop(t + 2.7); mod.stop(t + 2.7);
  }
  doorSlam(pos) { if (this.ready) { this._cue('slam', pos); this._thud(pos, this.t, 0.5); this.lockerClang(pos, 0.15); } }
  distantSteps(pos) {
    if (!this.ready) return;
    for (let i = 0; i < 6; i++) setTimeout(() => this.heavyStep(pos, 0.25), i * 520);
  }
  chalkScreech(pos) {
    if (!this.ready) return;
    this._cue('chalk', pos);
    const t = this.t, o = this._osc('sawtooth', 2100), f = this._filter('bandpass', 2600, 8), g = this._out(pos, 0.6);
    const lfo = this._osc('sine', 13), lg = this.ctx.createGain(); lg.gain.value = 300; lfo.connect(lg).connect(o.frequency);
    o.connect(f).connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.start(t); lfo.start(t); o.stop(t + 1); lfo.stop(t + 1);
  }
  // school intercom: two-tone chime
  paChime(pos = null) {
    if (!this.ready) return;
    const t = this.t;
    [[659.3, 0], [523.3, 0.55]].forEach(([f, dt]) => {
      for (const [mult, v] of [[1, 1], [2.01, 0.3], [3.02, 0.12]]) {
        const o = this._osc('sine', f * mult), g = this._out(pos, 0.9);
        o.connect(g); this._env(g, t + dt, 0.01, 0.09 * v, 1.4); o.start(t + dt); o.stop(t + dt + 1.5);
      }
    });
  }
  // garbled speech through a cheap speaker: formant-filtered buzz with syllable rhythm
  paVoice(dur = 3, pos = null) {
    if (!this.ready) return;
    if (pos) this._cue('announce', pos);
    const t = this.t, ctx = this.ctx;
    const src = this._osc('sawtooth', 120);
    const out = this._out(pos, 0.9);
    const hp = this._filter('highpass', 350), lp = this._filter('lowpass', 2600);
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
    shaper.curve = curve;
    const f1 = this._filter('bandpass', 600, 6), f2 = this._filter('bandpass', 1400, 8);
    const mix = ctx.createGain(); mix.gain.value = 0.0001;
    src.connect(f1).connect(mix); src.connect(f2).connect(mix);
    mix.connect(shaper).connect(hp).connect(lp).connect(out);
    out.gain.value = 0.5;
    let k = t;
    while (k < t + dur) {
      const syl = 0.11 + Math.random() * 0.16;
      src.frequency.setValueAtTime(95 + Math.random() * 45, k);
      f1.frequency.setValueAtTime(300 + Math.random() * 600, k);
      f2.frequency.setValueAtTime(900 + Math.random() * 1500, k);
      mix.gain.setValueAtTime(0.0001, k);
      mix.gain.exponentialRampToValueAtTime(0.5, k + 0.03);
      mix.gain.exponentialRampToValueAtTime(0.0001, k + syl);
      k += syl + (Math.random() < 0.15 ? 0.25 : 0.03);
    }
    src.start(t); src.stop(t + dur + 0.3);
    const hiss = this.ctx.createBufferSource(); hiss.buffer = this.noiseBuf;
    const hf = this._filter('bandpass', 3000, 0.7), hg = this._out(pos, 0.4);
    hiss.connect(hf).connect(hg); hg.gain.value = 0.015; hiss.start(t); hiss.stop(t + dur + 0.3);
  }
  clack(pos) {
    if (!this.ready) return;
    const t = this.t;
    for (const [dt, v] of [[0, 1], [0.13, 0.45], [0.22, 0.2]]) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = this._filter('bandpass', 1700 + Math.random() * 500, 2.5), g = this._out(pos, 0.5);
      src.connect(f).connect(g); this._env(g, t + dt, 0.002, 0.45 * v, 0.07);
      src.start(t + dt, Math.random()); src.stop(t + dt + 0.1);
    }
    this._thud(pos, t, 0.2);
  }
  pickup() {
    if (!this.ready) return;
    const t = this.t;
    [660, 990].forEach((f, i) => {
      const o = this._osc('triangle', f), g = this._out(null, 0.3);
      o.connect(g); this._env(g, t + i * 0.07, 0.005, 0.12, 0.35); o.start(t + i * 0.07); o.stop(t + 0.6);
    });
  }
  fuseInsert(pos) {
    if (!this.ready) return;
    this._thud(pos, this.t, 0.4);
    const t = this.t, o = this._osc('sawtooth', 60), f = this._filter('lowpass', 300), g = this._out(pos, 0.3);
    o.frequency.linearRampToValueAtTime(120, t + 0.8);
    o.connect(f).connect(g); this._env(g, t + 0.05, 0.2, 0.15, 0.9); o.start(t); o.stop(t + 1.3);
  }
  powerUp() {
    if (!this.ready) return;
    const t = this.t;
    [261.6, 329.6, 392, 523.2].forEach((fr, i) => {
      const o = this._osc('sine', fr), g = this._out(null, 0.8);
      o.connect(g); this._env(g, t + i * 0.12, 0.05, 0.1, 2.4); o.start(t + i * 0.12); o.stop(t + 3);
    });
  }
  stinger() {
    if (!this.ready) return;
    const t = this.t, g = this._out(null, 0.7);
    for (const f of [233, 247, 349, 370]) {
      const o = this._osc('sawtooth', f), lp = this._filter('lowpass', 1800);
      o.connect(lp).connect(g); o.start(t); o.stop(t + 1.6);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  }
  jumpscare() {
    if (!this.ready) return;
    const t = this.t, g = this._out(null, 0.4);
    const ws = this.ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
    ws.curve = curve; ws.connect(g);
    for (const f of [55, 58.3, 82.4, 110, 116.5]) { const o = this._osc('sawtooth', f); o.connect(ws); o.start(t); o.stop(t + 1.8); }
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.connect(ws); src.start(t); src.stop(t + 1.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  }
  gasp() {
    if (!this.ready) return;
    const t = this.t, src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this._filter('bandpass', 1300, 2), g = this._out(null, 0.2);
    src.connect(f).connect(g); this._env(g, t, 0.05, 0.3, 0.5); src.start(t); src.stop(t + 0.6);
  }
  pant() { if (this.ready) for (let i = 0; i < 3; i++) setTimeout(() => this.gasp(), i * 550); }
  click() {
    if (!this.ready) return;
    const t = this.t, o = this._osc('square', 1800), g = this._out(null, 0);
    o.connect(g); this._env(g, t, 0.001, 0.05, 0.03); o.start(t); o.stop(t + 0.05);
  }
  nvToggle(on) {
    if (!this.ready) return;
    const t = this.t, o = this._osc('sine', on ? 4000 : 2500), g = this._out(null, 0);
    o.frequency.exponentialRampToValueAtTime(on ? 9000 : 800, t + 0.3);
    o.connect(g); this._env(g, t, 0.01, 0.03, 0.3); o.start(t); o.stop(t + 0.35);
  }
  breathIn() {
    if (!this.ready) return;
    const t = this.t, src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this._filter('bandpass', 900, 1.5), g = this._out(null, 0);
    src.connect(f).connect(g); this._env(g, t, 0.15, 0.05, 0.3); src.start(t); src.stop(t + 0.5);
  }
}

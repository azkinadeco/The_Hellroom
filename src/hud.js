import { hideOf } from './config.js';
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = $('hud');
    this.time = $('hud-time');
    this.batt = $('hud-batt'); this.battPct = $('hud-batt-pct'); this.mode = $('hud-mode');
    this.obj = $('hud-obj');
    this.prompt = $('prompt'); this.cross = $('crosshair');
    this.stam = $('m-stamina'); this.breath = $('m-breath'); this.gaze = $('m-gaze'); this.film = $('m-film'); this.fps = $('hud-fps'); this.fpsT = 0;
    this.toastEl = $('toast'); this.toastT = 0;
    this.louvers = $('louvers');
    this.objectives = $('objectives'); this.objT = 0;
    this.captionEl = $('caption'); this.capT = 0;
    this._last = {};
    this.watch = $('hud-watch'); this.watchFill = $('watch-fill');
    this.ring = $('sound-ring'); this.pings = [];
  }
  show(v) { this.el.classList.toggle('hidden', !v); }
  toast(msg, dur = 2.6) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastT = dur;
  }
  caption(text, dur = 2.4) {
    this.captionEl.textContent = text;
    this.captionEl.classList.add('show');
    this.capT = dur;
  }
  // a sound at screen angle a (0 = straight ahead, clockwise), loudness 0..1
  ping(a, k, resident) {
    const near = this.pings.find((q) => Math.abs(((q.a - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.35 && q.res === resident);
    if (near) { near.a = a; near.k = Math.max(near.k, k); near.t = 1.6; return; }
    this.pings.push({ a, k, res: resident, t: 1.6, el: null });
    if (this.pings.length > 8) { const o = this.pings.shift(); if (o.el) o.el.remove(); }
  }
  updateRing(dt) {
    for (const q of this.pings) {
      q.t -= dt;
      if (!q.el) { q.el = document.createElementNS('http://www.w3.org/2000/svg', 'path'); this.ring.appendChild(q.el); }
      const R = 74, w = 0.22 + q.k * 0.25, a0 = q.a - w, a1 = q.a + w;
      const P = (a) => `${(Math.sin(a) * R).toFixed(1)} ${(-Math.cos(a) * R).toFixed(1)}`;
      q.el.setAttribute('d', `M ${P(a0)} A ${R} ${R} 0 0 1 ${P(a1)}`);
      q.el.setAttribute('class', q.res ? 'res' : 'env');
      q.el.style.opacity = (Math.min(1, q.t / 0.6) * (0.35 + 0.65 * q.k)).toFixed(2);
    }
    for (const q of this.pings) if (q.t <= 0 && q.el) q.el.remove();
    this.pings = this.pings.filter((q) => q.t > 0);
  }
  showObjectives(text, dur = 4) { this.objectives.textContent = text; this.objectives.classList.add('show'); this.objT = dur; }
  _set(el, key, val, prop = 'textContent') { if (this._last[key] !== val) { this._last[key] = val; el[prop] = val; } }

  update(dt, g) {
    const p = g.player;
    const t = Math.floor(g.time);
    const hh = String(Math.floor(t / 3600)).padStart(2, '0'), mm = String(Math.floor(t / 60) % 60).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
    this._set(this.time, 'time', `${hh}:${mm}:${ss}`);
    const b = Math.ceil(p.battery);
    this._set(this.battPct, 'bp', b + '%');
    this.batt.style.width = (b / 100 * 36) + 'px';
    this.batt.parentElement.classList.toggle('low', b < 20);
    this._set(this.mode, 'mode', (p.zooming ? `ZOOM ${(g.baseFov / g.camera.fov).toFixed(1)}x  ` : '') + (p.nightVision ? 'NIGHT' : p.flashlight ? 'LAMP' : 'SP'));
    const inv = p.inventory;
    const need = g.def.fuses;
    const lines = [`SEKRING  ${g.fusesInstalled + inv.fuses}/${need}${g.fusesInstalled ? `  (${g.fusesInstalled} terpasang)` : ''}`];
    if (inv.keys) lines.push(`KUNCI    ×${inv.keys}`);
    if (inv.erasers) lines.push(`PENGHAPUS ×${inv.erasers}  [${g.input.touch ? 'LEMPAR' : g.input.keyName('throw')}]`);
    if (inv.wedges) lines.push(`GANJAL PINTU ×${inv.wedges}  [jongkok + ${g.input.touch ? 'AKSI' : g.input.keyName('interact')} di pintu]`);
    if (inv.alarms) lines.push(`JAM WEKER ×${inv.alarms}  [${g.input.touch ? 'WEKER' : g.input.keyName('alarm')}]`);
    document.body.classList.toggle('can-throw', inv.erasers > 0 && !p.hidden);
    document.body.classList.toggle('can-alarm', inv.alarms > 0 && !p.hidden);
    if (g.input.touch) { this.knockT = (this.knockT || 0) - dt; if (this.knockT <= 0) { this.knockT = 0.25; document.body.classList.toggle('can-knock', !!g.wallAhead()); } }
    if (g.powered) lines.push('LISTRIK MENYALA — CARI PINTU KELUAR');
    this._set(this.obj, 'obj', lines.join('\n'));

    const target = g.interactor.target;
    const label = target ? g.interactor.label(target) : '';
    const key = g.input.touch ? 'AKSI' : g.input.keyName('interact');
    const html = label ? `<b>${key}</b>${label}` : '';
    this._set(this.prompt, 'prompt', html, 'innerHTML');
    this.cross.classList.toggle('on', !!label);

    const st = p.stamina / 100;
    this.stam.classList.toggle('show', st < 0.98 && !p.hidden);
    this.stam.classList.toggle('warn', p.exhausted);
    this.stam.querySelector('i').style.width = (st * 100) + '%';
    const br = p.breath / 100;
    this.breath.classList.toggle('show', !!p.hidden);
    this.breath.classList.toggle('warn', br < 0.3);
    this.breath.querySelector('i').style.width = (br * 100) + '%';
    const gz = g.gazeFx || 0;
    this.gaze.classList.toggle('show', gz > 0.02);
    this.gaze.classList.toggle('warn', gz > 0.6);
    this.gaze.querySelector('i').style.width = (gz * 100) + '%';
    const showFps = !!g.settings.fps;
    if (this._last.fpsOn !== showFps) { this._last.fpsOn = showFps; this.fps.classList.toggle('hidden', !showFps); }
    if (showFps && (this.fpsT -= dt) <= 0) { this.fpsT = 0.5; this.fps.textContent = `${Math.round(1 / Math.max(g.frameEma, 1e-3))} FPS · ${Math.round(g.vhs.scale * 100)}%`; }
    const fm = g.filmFx;
    this.film.classList.toggle('show', !!fm);
    if (fm) this.film.querySelector('i').style.width = (fm.f * 100) + '%';
    const gzs = gz.toFixed(2);
    if (this._last.gz !== gzs) { this._last.gz = gzs; this.el.style.setProperty('--gaze', gzs); }
    const ov = p.hidden ? hideOf(p.hidden).overlay : null;
    this.louvers.classList.toggle('show', ov === 'louvers');
    this.louvers.classList.toggle('peek', ov === 'peek');
    document.body.classList.toggle('hiding', !!p.hidden);
    if (this._touch !== g.input.touch) { this._touch = g.input.touch; document.body.classList.toggle('touch', !!g.input.touch); }
    { // the eye: fills as the most alert resident notices you, red while you are hunted
      let w = 0; for (const e of g.entities) w = Math.max(w, e.awareness || 0);
      const hunt = g.chasers.size > 0;
      this.watchLv = (this.watchLv || 0) + ((hunt ? 1 : Math.min(w, 1)) - (this.watchLv || 0)) * Math.min(1, dt * 8);
      const show = (hunt || this.watchLv > 0.04) && p.alive;
      this._set(this.watch, 'wshow', show ? 'watch show' + (hunt ? ' hunt' : '') : 'watch', 'className');
      const y = (24 - 24 * this.watchLv).toFixed(1);
      if (this._last.wy !== y) { this._last.wy = y; this.watchFill.setAttribute('y', y); }
    }
    if (g.input.touch) {
      const tb = this._tb || (this._tb = Object.fromEntries([...document.querySelectorAll('.tbtn')].map((b) => [b.dataset.action, b])));
      if (tb.flashlight) tb.flashlight.classList.toggle('on', !!p.flashlight && !p.nightVision);
      if (tb.nightvision) tb.nightvision.classList.toggle('on', !!p.nightVision);
      if (tb.crouch) tb.crouch.classList.toggle('on', !!p.crouched);
      if (tb.map) tb.map.classList.toggle('on', !!(g.automap && g.automap.open));
    }

    this.updateRing(dt);
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
    if (this.capT > 0) { this.capT -= dt; if (this.capT <= 0) this.captionEl.classList.remove('show'); }
    if (this.objT > 0) { this._set(this.objectives, 'objtxt', g.objectiveText()); this.objT -= dt; if (this.objT <= 0) this.objectives.classList.remove('show'); }
  }
}

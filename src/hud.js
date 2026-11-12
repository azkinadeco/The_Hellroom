const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = $('hud');
    this.time = $('hud-time');
    this.batt = $('hud-batt'); this.battPct = $('hud-batt-pct'); this.mode = $('hud-mode');
    this.obj = $('hud-obj');
    this.prompt = $('prompt'); this.cross = $('crosshair');
    this.stam = $('m-stamina'); this.breath = $('m-breath');
    this.toastEl = $('toast'); this.toastT = 0;
    this.louvers = $('louvers');
    this.objectives = $('objectives'); this.objT = 0;
    this.captionEl = $('caption'); this.capT = 0;
    this._last = {};
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
    this._set(this.mode, 'mode', p.nightVision ? 'NIGHT' : p.flashlight ? 'LAMP' : 'SP');
    const inv = p.inventory;
    const need = g.def.fuses;
    const lines = [`SEKRING  ${g.fusesInstalled + inv.fuses}/${need}${g.fusesInstalled ? `  (${g.fusesInstalled} terpasang)` : ''}`];
    if (inv.keys) lines.push(`KUNCI    ×${inv.keys}`);
    if (inv.erasers) lines.push(`PENGHAPUS ×${inv.erasers}  [${g.input.touch ? 'LEMPAR' : 'G'}]`);
    document.body.classList.toggle('can-throw', inv.erasers > 0 && !p.hidden);
    if (g.powered) lines.push('LISTRIK MENYALA — CARI PINTU KELUAR');
    this._set(this.obj, 'obj', lines.join('\n'));

    const target = g.interactor.target;
    const label = target ? g.interactor.label(target) : '';
    const key = g.input.touch ? 'AKSI' : 'E';
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
    this.louvers.classList.toggle('show', !!p.hidden && p.hidden.kind !== 'stall');
    document.body.classList.toggle('hiding', !!p.hidden);

    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
    if (this.capT > 0) { this.capT -= dt; if (this.capT <= 0) this.captionEl.classList.remove('show'); }
    if (this.objT > 0) { this._set(this.objectives, 'objtxt', g.objectiveText()); this.objT -= dt; if (this.objT <= 0) this.objectives.classList.remove('show'); }
  }
}

import { Assets } from './assets.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Game } from './game.js';
import { LEVELS, DIFFICULTY, endlessDef, DEV_ROOMS, RESIDENTS } from './config.js';
import { ENTITY_INFO } from './ai/creatures.js';
import { ModelViewer } from './viewer.js';
import { INTRO, ENDING, NOTES, TAPES } from './story.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'hellroom.save.v2';

window.addEventListener('error', (e) => showError(e.message + (e.filename ? `\n${e.filename}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason && (e.reason.stack || e.reason))));
function showError(msg) { const el = $('error'); el.textContent = '⚠ ' + msg; el.classList.remove('hidden'); console.error(msg); }

// ---------------------------------------------------------------- save data
const defaults = { hints: [], tapes: [], met: [], endingSeen: false, notesRead: [], bestFloor: 0, unlocked: 1, best: {}, diff: 'normal', settings: { sens: 1, volume: 0.8, quality: 'low', screen: 'vhs', invertY: false, subs: true } };
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s) {
      const st = { ...defaults.settings, ...s.settings };
      if (s.settings && s.settings.vhs === false && !s.settings.screen) st.screen = 'clear'; // old toggle
      delete st.vhs;
      return { ...defaults, ...s, settings: st };
    }
  } catch (_) { /* private mode */ }
  return structuredClone(defaults);
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* ignore */ } }

// ---------------------------------------------------------------- screens
let current = 'loading', returnTo = 'title';
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  current = id;
}
function hideAll() { for (const s of document.querySelectorAll('.screen')) s.classList.remove('active'); current = null; }

const assets = new Assets();
const audio = new Audio();
const input = new Input($('game'));
const hud = new HUD();
let game;
let pendingLevel = 0;
let pendingDef = null;     // endless-mode / test-room level definition
let pendingGod = false;    // test rooms: invulnerable
let viewer = null, beastViewer = null;
let noteFromArchive = false;
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const ui = {
  scare(clear) {
    const el = $('scare');
    el.className = clear ? 'soft' : 'hard';
    void el.offsetWidth; el.classList.add('go');
  },
  pause() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    input.enabled = false; input.unlock(); audio.suspend();
    show('pause');
  },
  resume() {
    hideAll();
    game.state = 'playing';
    input.enabled = true; input.lock(); audio.resume();
  },
  showNote(title, body) {
    game.state = 'note';
    input.enabled = false; releasePointer();
    $('note-title').textContent = title; $('note-body').textContent = body;
    show('note');
  },
  showDeath(cause) {
    $('scare').className = '';
    input.enabled = false; releasePointer();
    hud.show(false); $('touch-layer').classList.add('hidden');
    if (game.def.endless) {
      const cleared = game.def.floor - 1;
      cause += `\n\nLantai yang berhasil dilewati: ${cleared}  ·  Rekor: ${save.bestFloor}`;
      $('btn-retry').textContent = 'Mulai Lagi dari Lantai -1';
    } else $('btn-retry').textContent = 'Putar Ulang';
    $('dead-cause').textContent = cause;
    show('dead');
  },
  showWin() {
    input.enabled = false; releasePointer();
    hud.show(false); $('touch-layer').classList.add('hidden');
    const t = Math.floor(game.time);
    if (game.def.endless) {
      save.bestFloor = Math.max(save.bestFloor, game.def.floor);
      persist();
      $('win-title').textContent = `${game.def.code} SELESAI`;
      $('win-stats').innerHTML = [['Waktu lantai ini', fmt(t)], ['Lantai dilewati', game.def.floor], ['Rekor terdalam', save.bestFloor],
        ['Terlihat oleh penghuni', `${game.stats.spotted}×`]].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
      $('win-text').textContent = 'Di balik pintu darurat ada tangga. Tangga itu hanya mengarah ke bawah.';
      $('btn-next').textContent = `Turun ke Lantai ${-(game.def.floor + 1)}`;
      show('win');
      return;
    }
    const key = game.def.id + ':' + game.diffKey;
    if (!game.def.test) {
      const prev = save.best[key];
      if (!prev || t < prev) save.best[key] = t;
      save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, game.levelIndex + 2));
      persist();
    }
    $('win-title').textContent = `${game.def.code} SELESAI`;
    $('win-stats').innerHTML = [
      ['Waktu rekaman', fmt(t)], ['Rekor', save.best[key] ? fmt(save.best[key]) : '—'], ['Catatan dibaca', `${game.stats.notes}/${game.def.notes}`],
      ['Terlihat oleh penghuni', `${game.stats.spotted}×`], ['Kaset rahasia', game.stats.tape ? 'ditemukan' : '—'], ['Kesulitan', DIFFICULTY[game.diffKey].label],
    ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
    const last = game.levelIndex >= LEVELS.length - 1;
    if (last && !game.def.test) { showEnding(t); return; }
    $('win-text').textContent = last ? ENDING : 'Pintu darurat terbuka ke… lorong lain. Sekolah ini lebih dalam dari yang kamu kira.';
    $('btn-next').textContent = last ? 'Main Lagi dari Awal' : 'Level Berikutnya';
    show('win');
  },
};

let ignoreUnlock = false;
function releasePointer() { if (document.pointerLockElement) { ignoreUnlock = true; input.unlock(); } }
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) return;
  if (ignoreUnlock) { ignoreUnlock = false; return; }
  if (game && game.state === 'playing' && !input.touch) ui.pause();
});

function startLevel(index, test = null) {
  pendingLevel = index;
  pendingDef = null; pendingGod = false;
  let def = LEVELS[index];
  if (test) {
    const ents = test.resident === 'default' ? def.entities : test.resident === 'none' ? [] : [{ type: test.resident }];
    pendingDef = def = { ...def, entities: ents, test: true };
    pendingGod = test.god;
  }
  $('intro-code').textContent = def.code;
  $('intro-name').textContent = def.name;
  $('intro-sub').textContent = def.subtitle;
  $('intro-text').textContent = index === 0 ? INTRO.join('\n\n') : '';
  show('intro');
}

function startEndless(floor) {
  pendingLevel = -1;
  pendingDef = endlessDef(floor, Math.floor(Math.random() * 1e6)); pendingGod = false;
  $('intro-code').textContent = 'MODE TANPA UJUNG · ' + pendingDef.code;
  $('intro-name').textContent = pendingDef.name;
  $('intro-sub').textContent = pendingDef.subtitle;
  $('intro-text').textContent = floor === 1 ? `Setiap lantai dibuat acak dan makin berbahaya. Seberapa dalam kamu bisa turun?\nRekor: ${save.bestFloor} lantai.` : '';
  show('intro');
}

function beginPlay() {
  audio.init();
  goFullscreen();
  try {
    game.loadLevel(pendingLevel, save.diff, pendingDef);
    game.godMode = pendingGod;
  } catch (e) { showError(e.stack || e); return; }
  hideAll();
  hud.show(true);
  $('touch-layer').classList.toggle('hidden', !input.touch);
  game.state = 'playing';
  input.enabled = true;
  input.lock();
  hud.toast(game.def.name, 3);
  setTimeout(() => game.state === 'playing' && hud.showObjectives(game.objectiveText(), 6), 1500);
}

function goFullscreen() {
  if (!input.touch) return;
  const el = document.documentElement;
  try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); } catch (_) { /* ignore */ }
  try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_) { /* ignore */ }
}

function quitToMenu() {
  game.state = 'menu';
  game.unload();
  audio.setAmbience(false);
  audio.resume();
  hud.show(false);
  $('touch-layer').classList.add('hidden');
  input.enabled = false; releasePointer();
  buildTitle();
  show('title');
}

// ---------------------------------------------------------------- menus
function buildTitle() {
  const btn = document.querySelector('#title [data-go="play"]');
  btn.textContent = save.unlocked > 1 ? `▶ Lanjutkan — ${LEVELS[save.unlocked - 1].code}` : '▶ Mainkan';
  document.querySelector('#title .tag').textContent = 'Rekaman Handycam · 1996' + (save.endingSeen ? '  ·  ★ ENDING TERBUKA' : '');
}
// resident portrait for a card; unseen residents stay a dark silhouette
function portrait(kind, seen) {
  if (!kind) return '<span class="portrait none"></span>';
  return seen ? `<span class="portrait" style="background-image:url('assets/ui/portraits/${kind}.jpg')"></span>`
    : '<span class="portrait unknown">?</span>';
}
function buildLevels() {
  const list = $('level-list'); list.innerHTML = '';
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button');
    b.className = 'level-item';
    // levels unlock in order; every map can still be tried from Pilih Room (uji)
    b.disabled = i + 1 > save.unlocked;
    const best = save.best[l.id + ':' + save.diff];
    const kind = l.entities[0] && l.entities[0].type, seen = kind && save.met.includes(kind);
    b.innerHTML = `${portrait(kind, seen)}<span class="code">${l.code}</span><span><div class="nm">${l.name}</div><div class="sub">${b.disabled ? 'Terkunci' : l.subtitle}</div></span><span class="best">${best ? `${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}` : ''}</span>`;
    b.onclick = () => startLevel(i);
    list.appendChild(b);
  });
  const dl = $('diff-list'); dl.innerHTML = '';
  for (const [k, d] of Object.entries(DIFFICULTY)) {
    const b = document.createElement('button');
    b.textContent = d.label; b.classList.toggle('on', save.diff === k);
    b.onclick = () => { save.diff = k; persist(); buildLevels(); };
    dl.appendChild(b);
  }
}
function buildArchive() {
  const list = $('archive-list'); list.innerHTML = '';
  const found = new Set(save.notesRead), tapes = new Set(save.tapes.map(String));
  let total = 0, have = 0;
  // residents met so far
  const hb = document.createElement('h3'); hb.textContent = 'Penghuni'; list.appendChild(hb);
  const grid = document.createElement('div'); grid.className = 'beast-grid'; list.appendChild(grid);
  const met = new Set(save.met);
  for (const k of [...LEVELS.flatMap((l) => l.entities.map((e) => e.type)), ...RESIDENTS, 'pupil'].filter((k, i, a) => a.indexOf(k) === i)) {
    total++; const ok = met.has(k); if (ok) have++;
    const b = document.createElement('button');
    b.className = 'archive-item' + (ok ? '' : ' locked');
    b.innerHTML = ok ? `${portrait(k, true)}<span>${ENTITY_INFO[k].name}</span>` : `${portrait(k, false)}<span>??? — belum ditemui</span>`;
    b.disabled = !ok;
    b.onclick = () => openBeast(k);
    grid.appendChild(b);
  }
  LEVELS.forEach((l) => {
    const h = document.createElement('h3'); h.textContent = `${l.code} — ${l.name}`; list.appendChild(h);
    const add = (label, ok, title, body) => {
      total++; if (ok) have++;
      const b = document.createElement('button');
      b.className = 'archive-item' + (ok ? '' : ' locked');
      b.textContent = ok ? label : '??? — belum ditemukan';
      b.disabled = !ok;
      b.onclick = () => { noteFromArchive = true; $('note-title').textContent = title; $('note-body').textContent = body; show('note'); };
      list.appendChild(b);
    };
    (NOTES[l.id] || []).forEach((n, i) => add('📄 ' + n.title, found.has(l.id + ':' + i), n.title, n.body));
    const tp = TAPES[l.id];
    if (tp) add('📼 ' + tp.title, tapes.has(String(l.id)), tp.title, tp.body);
  });
  $('archive-count').textContent = `${have}/${total} ditemukan  ·  Rekor Mode Tanpa Ujung: ${save.bestFloor} lantai`;
}
// test rooms: every level unlocked, pick the resident, optional invulnerability
const roomOpts = { resident: 'default', god: false };
function buildRooms() {
  const list = $('room-list'); list.innerHTML = '';
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button');
    b.className = 'level-item';
    const res = l.entities.map((e) => ENTITY_INFO[e.type].name).join(', ');
    b.innerHTML = `${portrait(l.entities[0] && l.entities[0].type, true)}<span class="code">${l.code}</span><span><div class="nm">${l.name}</div><div class="sub">Penghuni: ${res}</div></span>`;
    b.onclick = () => { viewer && viewer.stop(); startLevel(i, { ...roomOpts }); };
    list.appendChild(b);
  });
  const sel = $('room-resident');
  sel.innerHTML = [['default', 'Bawaan level'], ['none', 'Tanpa penghuni (jelajah bebas)'], ...RESIDENTS.map((k) => [k, ENTITY_INFO[k].name])]
    .map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  sel.value = roomOpts.resident;
  sel.onchange = () => { roomOpts.resident = sel.value; };
  $('room-god').checked = roomOpts.god;
  $('room-god').onchange = () => { roomOpts.god = $('room-god').checked; };
  // model gallery
  if (!viewer) viewer = new ModelViewer($('viewer-canvas'), assets);
  const pick = $('viewer-pick'); pick.innerHTML = '';
  const showModel = (k) => {
    for (const b of pick.children) b.classList.toggle('on', b.dataset.k === k);
    const clips = viewer.show(k);
    const cl = $('viewer-clips'); cl.innerHTML = '';
    clips.forEach((n) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { viewer.playClip(n); for (const x of cl.children) x.classList.toggle('on', x === b); }; cl.appendChild(b); });
    $('viewer-desc').textContent = ENTITY_INFO[k].hint || ENTITY_INFO[k].death;
  };
  [...RESIDENTS, 'pupil'].forEach((k) => {
    const b = document.createElement('button'); b.textContent = ENTITY_INFO[k].name; b.dataset.k = k;
    b.onclick = () => showModel(k); pick.appendChild(b);
  });
  showModel(RESIDENTS[0]);
  viewer.start();
}

function openBeast(k) {
  const info = ENTITY_INFO[k];
  $('beast-name').textContent = info.name;
  $('beast-lore').textContent = info.lore || '';
  $('beast-tip').textContent = info.hint || info.death;
  show('beast');
  if (!beastViewer) beastViewer = new ModelViewer($('beast-canvas'), assets);
  const clips = beastViewer.show(k);
  const cl = $('beast-clips'); cl.innerHTML = '';
  clips.forEach((n) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { beastViewer.playClip(n); for (const x of cl.children) x.classList.toggle('on', x === b); }; cl.appendChild(b); });
  beastViewer.start();
}

// final level cleared: the tape plays out, then credits
function showEnding(t) {
  save.endingSeen = true; persist();
  const lines = ENDING.split('\n\n');
  const box = $('ending-lines'); box.innerHTML = '';
  lines.forEach((ln, i) => { const p = document.createElement('p'); p.textContent = ln; p.style.animationDelay = (0.6 + i * 2.6) + 's'; box.appendChild(p); });
  const met = new Set(save.met);
  const cast = LEVELS.map((l) => l.entities[0].type).filter((k, i, a) => a.indexOf(k) === i)
    .map((k) => `<div class="cast">${portrait(k, met.has(k))}<span>${met.has(k) ? ENTITY_INFO[k].name : '???'}</span></div>`).join('');
  $('ending-cast').innerHTML = cast;
  $('ending-stats').textContent = `Waktu rekaman terakhir ${fmt(t)}  ·  Kaset rahasia ${save.tapes.length}/${LEVELS.length}  ·  Penghuni ditemui ${save.met.length}`;
  $('ending-credits').style.animationDelay = (1 + lines.length * 2.6) + 's';
  show('ending');
}

function buildSettings() {
  const s = save.settings;
  $('set-sens').value = s.sens; $('set-vol').value = s.volume; $('set-quality').value = s.quality;
  $('set-screen').value = s.screen; $('set-inv').checked = s.invertY; $('set-subs').checked = s.subs;
}
function readSettings() {
  const s = save.settings;
  s.sens = +$('set-sens').value; s.volume = +$('set-vol').value; s.quality = $('set-quality').value;
  s.screen = $('set-screen').value; s.invertY = $('set-inv').checked; s.subs = $('set-subs').checked;
  persist();
  if (game) game.applySettings();
}
for (const id of ['set-sens', 'set-vol', 'set-quality', 'set-screen', 'set-inv', 'set-subs']) $(id).addEventListener('input', readSettings);

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  audio.init();
  const go = b.dataset.go;
  if (go === 'play') { startLevel(save.unlocked - 1); return; }
  if (go === 'endless') { startEndless(1); return; }
  if (go === 'archive') buildArchive();
  if (go === 'levels') buildLevels();
  if (go === 'rooms') buildRooms();
  if (current === 'rooms' && go !== 'rooms' && viewer) viewer.stop();
  if (current === 'beast' && beastViewer) beastViewer.stop();
  if (go === 'settings') { buildSettings(); returnTo = b.dataset.from === 'pause' ? 'pause' : 'title'; }
  if (go === 'title' && current === 'settings' && returnTo === 'pause') { show('pause'); return; }
  show(go);
});
$('intro-go').onclick = beginPlay;
$('note-close').onclick = () => {
  if (noteFromArchive) { noteFromArchive = false; show('archive'); return; }
  hideAll(); game.state = 'playing'; input.enabled = true; input.lock();
};
$('btn-resume').onclick = () => ui.resume();
$('btn-restart').onclick = () => { audio.resume(); pendingLevel = game.levelIndex; beginPlay(); };
$('btn-quit').onclick = quitToMenu;
$('btn-retry').onclick = () => { if (game.def.endless) { startEndless(1); return; } pendingLevel = game.levelIndex; beginPlay(); };
$('btn-dead-menu').onclick = quitToMenu;
$('btn-win-menu').onclick = quitToMenu;
$('btn-end-menu').onclick = quitToMenu;
$('btn-end-again').onclick = () => startLevel(0);
$('btn-next').onclick = () => { if (game.def.endless) { startEndless(game.def.floor + 1); return; } const n = game.levelIndex + 1; startLevel(n >= LEVELS.length ? 0 : n); };
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && current === 'note') $('note-close').click();
  if ((e.code === 'Enter' || e.code === 'Space') && current === 'intro') { e.preventDefault(); beginPlay(); }
});

// ---------------------------------------------------------------- boot
async function boot() {
  await assets.load((f) => { $('load-bar').style.width = (f * 100).toFixed(0) + '%'; });
  game = new Game({ canvas: $('game'), assets, audio, input, hud, settings: save.settings, ui });
  game.hintsSeen = new Set(save.hints || []);
  game.onHint = (id) => { save.hints = [...game.hintsSeen]; persist(); };
  game.onTape = (id) => { if (!save.tapes.map(String).includes(String(id))) { save.tapes.push(id); persist(); } };
  game.met = new Set(save.met || []);
  game.onMeet = (kind) => { if (save.met.includes(kind)) return false; save.met.push(kind); persist(); return true; };
  game.onNoteRead = (key) => { if (!save.notesRead.includes(key)) { save.notesRead.push(key); persist(); } };
  window.__game = game; // debug handle
  if (!DEV_ROOMS) $('btn-rooms').remove();
  buildTitle();
  show('title');
  let last = performance.now();
  const frame = (now) => {
    game.realDt = Math.min(0.25, (now - last) / 1000);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      game.update(dt);
      if (game.state !== 'menu') game.render(now / 1000);
    } catch (e) { showError(e.stack || String(e)); game.state = 'paused'; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
boot();

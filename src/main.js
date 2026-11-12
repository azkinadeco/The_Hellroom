import { Assets } from './assets.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Game } from './game.js';
import { LEVELS, DIFFICULTY } from './config.js';
import { INTRO, ENDING } from './story.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'hellroom.save.v2';

window.addEventListener('error', (e) => showError(e.message + (e.filename ? `\n${e.filename}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason && (e.reason.stack || e.reason))));
function showError(msg) { const el = $('error'); el.textContent = '⚠ ' + msg; el.classList.remove('hidden'); console.error(msg); }

// ---------------------------------------------------------------- save data
const defaults = { hints: [], unlocked: 1, best: {}, diff: 'normal', settings: { sens: 1, volume: 0.8, quality: 'low', vhs: true, invertY: false, subs: true } };
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) return { ...defaults, ...s, settings: { ...defaults.settings, ...s.settings } }; } catch (_) { /* private mode */ }
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

const ui = {
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
    input.enabled = false; releasePointer();
    hud.show(false); $('touch-layer').classList.add('hidden');
    $('dead-cause').textContent = cause;
    show('dead');
  },
  showWin() {
    input.enabled = false; releasePointer();
    hud.show(false); $('touch-layer').classList.add('hidden');
    const t = Math.floor(game.time);
    const key = game.def.id + ':' + game.diffKey;
    const prev = save.best[key];
    if (!prev || t < prev) save.best[key] = t;
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, game.levelIndex + 2));
    persist();
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    $('win-title').textContent = `${game.def.code} SELESAI`;
    $('win-stats').innerHTML = [
      ['Waktu rekaman', fmt(t)], ['Rekor', fmt(save.best[key])], ['Catatan dibaca', `${game.stats.notes}/${game.def.notes}`],
      ['Terlihat oleh penghuni', `${game.stats.spotted}×`], ['Kesulitan', DIFFICULTY[game.diffKey].label],
    ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
    const last = game.levelIndex >= LEVELS.length - 1;
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

function startLevel(index) {
  pendingLevel = index;
  const def = LEVELS[index];
  $('intro-code').textContent = def.code;
  $('intro-name').textContent = def.name;
  $('intro-sub').textContent = def.subtitle;
  $('intro-text').textContent = index === 0 ? INTRO.join('\n\n') : '';
  show('intro');
}

function beginPlay() {
  audio.init();
  goFullscreen();
  try {
    game.loadLevel(pendingLevel, save.diff);
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
}
function buildLevels() {
  const list = $('level-list'); list.innerHTML = '';
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button');
    b.className = 'level-item';
    b.disabled = i + 1 > save.unlocked;
    const best = save.best[l.id + ':' + save.diff];
    b.innerHTML = `<span class="code">${l.code}</span><span><div class="nm">${l.name}</div><div class="sub">${b.disabled ? 'Terkunci' : l.subtitle}</div></span><span class="best">${best ? `${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}` : ''}</span>`;
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
function buildSettings() {
  const s = save.settings;
  $('set-sens').value = s.sens; $('set-vol').value = s.volume; $('set-quality').value = s.quality;
  $('set-vhs').checked = s.vhs; $('set-inv').checked = s.invertY; $('set-subs').checked = s.subs;
}
function readSettings() {
  const s = save.settings;
  s.sens = +$('set-sens').value; s.volume = +$('set-vol').value; s.quality = $('set-quality').value;
  s.vhs = $('set-vhs').checked; s.invertY = $('set-inv').checked; s.subs = $('set-subs').checked;
  persist();
  if (game) game.applySettings();
}
for (const id of ['set-sens', 'set-vol', 'set-quality', 'set-vhs', 'set-inv', 'set-subs']) $(id).addEventListener('input', readSettings);

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  audio.init();
  const go = b.dataset.go;
  if (go === 'play') { startLevel(save.unlocked - 1); return; }
  if (go === 'levels') buildLevels();
  if (go === 'settings') { buildSettings(); returnTo = b.dataset.from === 'pause' ? 'pause' : 'title'; }
  if (go === 'title' && current === 'settings' && returnTo === 'pause') { show('pause'); return; }
  show(go);
});
$('intro-go').onclick = beginPlay;
$('note-close').onclick = () => { hideAll(); game.state = 'playing'; input.enabled = true; input.lock(); };
$('btn-resume').onclick = () => ui.resume();
$('btn-restart').onclick = () => { audio.resume(); pendingLevel = game.levelIndex; beginPlay(); };
$('btn-quit').onclick = quitToMenu;
$('btn-retry').onclick = () => { pendingLevel = game.levelIndex; beginPlay(); };
$('btn-dead-menu').onclick = quitToMenu;
$('btn-win-menu').onclick = quitToMenu;
$('btn-next').onclick = () => { const n = game.levelIndex + 1; startLevel(n >= LEVELS.length ? 0 : n); };
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
  window.__game = game; // debug handle
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

import { Assets } from './assets.js';
import { Audio } from './audio.js';
import { Input, DEFAULT_BINDS, BIND_LABELS, keyLabel } from './input.js';
import { HUD } from './hud.js';
import { Game } from './game.js';
import { LEVELS, DIFFICULTY, endlessDef, DEV_ROOMS, RESIDENTS, ENDLESS_MODS, VERSION, NG_CAST, PERKS } from './config.js';
import { ENTITY_INFO } from './ai/creatures.js';
import { ModelViewer } from './viewer.js';
import { BADGES, awardBadges, gradeRun, parOf } from './badges.js';
import { INTRO, ENDING, NOTES, TAPES, FILMS, FILM_NEED, TIPS, ENDING_TRUE, TRUE_FILMS } from './story.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'hellroom.save.v2';

window.addEventListener('error', (e) => showError(e.message + (e.filename ? `\n${e.filename}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason && (e.reason.stack || e.reason))));
function showError(msg) { const el = $('error'); el.textContent = '⚠ ' + msg; el.classList.remove('hidden'); console.error(msg); }

// ---------------------------------------------------------------- save data
const defaults = { trueEnding: false, ng: false, stats: { time: 0, deaths: {}, wins: 0, escapes: 0, floors: 0, knocks: 0, peeks: 0, noticed: 0 }, endlessRun: null, daily: {}, badges: [], ranks: {}, film: {}, hints: [], tapes: [], met: [], endingSeen: false, notesRead: [], bestFloor: 0, unlocked: 1, best: {}, diff: 'normal', settings: { sens: 1, volume: 0.8, quality: 'high', screen: 'vhs', invertY: false, subs: true, gfx: 2, fov: 72, bob: true, calm: false, bigText: false, vibrate: true, assist: true, fps: false, autoRes: true, bright: 1, soundRing: false, crouchMode: 'toggle', sprintMode: 'hold', fpsCap: 0, scare: 'penuh' } };
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s) {
      const st = { ...defaults.settings, ...s.settings };
      if (s.settings && s.settings.vhs === false && !s.settings.screen) st.screen = 'clear'; // old toggle
      delete st.vhs;
      if ((st.gfx || 0) < 2) { st.quality = 'high'; st.gfx = 2; }   // batch 18: new graphics default
      return { ...defaults, ...s, settings: st };
    }
  } catch (_) { /* private mode */ }
  return structuredClone(defaults);
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* ignore */ } }

// ---------------------------------------------------------------- screens
let current = 'splash', returnTo = 'title';
let pendingBrain = false;
function show(id) {
  for (const s of document.querySelectorAll('.screen')) if (s.id !== 'splash') s.classList.toggle('active', s.id === id);   // the intro fades out on its own
  current = id;
  // keyboard and controller users land on the obvious button
  requestAnimationFrame(() => { if (current !== id) return; const scr = $(id), f = focusables(); const t = (scr && [...scr.querySelectorAll('.primary')].find((b) => f.includes(b))) || f[0]; if (t) t.focus({ preventScroll: true }); });
}
function focusables() {
  const scr = document.querySelector('.screen.active');
  return scr ? [...scr.querySelectorAll('button, select, input')].filter((e) => !e.disabled && e.offsetParent !== null) : [];
}
function moveFocus(d) {
  const f = focusables(); if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  const t = f[i < 0 ? (d > 0 ? 0 : f.length - 1) : (i + d + f.length) % f.length];
  t.focus(); t.scrollIntoView({ block: 'nearest' });
}
// left / right on a slider or a select
function nudge(d) {
  const el = document.activeElement;
  if (!el || !focusables().includes(el)) return false;
  if (el.tagName === 'SELECT') { el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + d)); }
  else if (el.type === 'range') { const st = +el.step || 1; el.value = Math.max(+el.min, Math.min(+el.max, +el.value + d * st * 2)); }
  else return false;
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
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
  faceFlash(kind) {
    const el = $('scare-face');
    el.style.backgroundImage = `url('assets/ui/portraits/${kind}.jpg')`;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  },
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
    countRun('dead', game.killer && game.killer.kind);
    lastDeath = { key: levelKey(game.def), k: game.floorK, x: game.player.pos.x, z: game.player.pos.z };
    if (game.def.daily) $('btn-retry').textContent = 'Coba Lagi';
    else if (game.def.endless) {
      save.endlessRun = null;
      const cleared = game.def.floor - 1;
      cause += `\n\nLantai yang berhasil dilewati: ${cleared}  ·  Rekor: ${save.bestFloor}`;
      $('btn-retry').textContent = 'Mulai Lagi dari Lantai -1';
    } else $('btn-retry').textContent = 'Putar Ulang';
    cause += badgeLine(awardBadges({ g: game, save, win: false, story: false }));
    persist();
    $('dead-cause').textContent = cause;
    $('btn-checkpoint').classList.toggle('hidden', !game.checkpoint);
    if (game.checkpoint) $('btn-checkpoint').textContent = `Lanjut dari Panel (${game.checkpoint.fusesInstalled}/${game.def.fuses})`;
    $('dead-map').classList.toggle('hidden', !(game.def && !game.def.noMap && !game.diff.noMap && game.drawDebrief($('dead-map'))));
    show('dead');
  },
  showWin() {
    input.enabled = false; releasePointer();
    hud.show(false); $('touch-layer').classList.add('hidden');
    const t = Math.floor(game.time);
    countRun('win'); lastDeath = null;
    $('perk-pick').classList.add('hidden'); $('btn-next').disabled = false;
    $('btn-share').classList.add('hidden');
    if (game.def.daily) {
      const prev = save.daily[game.def.daily], isBest = !prev || t < prev;
      save.daily = { [game.def.daily]: isBest ? t : prev };   // only today is kept
      const newB = awardBadges({ g: game, save, win: true, story: false });
      persist();
      $('win-title').textContent = 'REKAMAN HARIAN SELESAI';
      $('win-rank').textContent = '';
      $('win-stats').innerHTML = [['Waktu', fmt(t)], ['Terbaik hari ini', fmt(save.daily[game.def.daily]) + (isBest ? '  ★' : '')], ['Terlihat oleh penghuni', `${game.stats.spotted}×`], ['Kesulitan', DIFFICULTY[game.diffKey].label]]
        .map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
      $('win-text').textContent = 'Besok bangunannya berbeda. Hari ini kamu masih bisa mencoba lebih cepat.' + badgeLine(newB);
      $('btn-next').textContent = 'Coba Lebih Cepat';
      $('btn-share').classList.remove('hidden'); $('btn-share').textContent = 'Salin hasil';
      show('win');
      return;
    }
    if (game.def.endless) {
      save.endlessRun = { seed: game.def.runSeed ?? Math.floor(Math.random() * 1e6), floor: game.def.floor + 1, perks: (save.endlessRun && save.endlessRun.perks) || [] };
      save.bestFloor = Math.max(save.bestFloor, game.def.floor);
      const newB = awardBadges({ g: game, save, win: true, story: false });
      persist();
      $('win-title').textContent = `${game.def.code} SELESAI`;
      $('win-stats').innerHTML = [['Waktu lantai ini', fmt(t)], ['Lantai dilewati', game.def.floor], ['Rekor terdalam', save.bestFloor],
        ['Terlihat oleh penghuni', `${game.stats.spotted}×`]].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
      $('win-rank').textContent = '';
      $('win-text').textContent = 'Di balik pintu darurat ada tangga. Tangga itu hanya mengarah ke bawah.' + badgeLine(newB);
      $('btn-next').textContent = `Turun ke Lantai ${-(game.def.floor + 1)}`;
      // pick one of three provisions for the rest of the run
      if (!game.def.daily) {
        const keys = Object.keys(PERKS); for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
        const want = game.def.hell ? 2 : 1, picked = [];
        const box = $('perk-pick'); box.innerHTML = `<h3>${want > 1 ? 'Lantai Neraka dilewati: pilih dua bekal' : 'Pilih satu bekal'}</h3>`; box.classList.remove('hidden');
        $('btn-next').disabled = true;
        for (const k of keys.slice(0, 3)) {
          const P = PERKS[k], b = document.createElement('button'); b.className = 'perk';
          b.innerHTML = `<span class="pi">${P.icon}</span><b>${P.name}</b><small>${P.desc}</small>`;
          b.onclick = () => {
            const i = picked.indexOf(k);
            if (i >= 0) picked.splice(i, 1); else { picked.push(k); if (picked.length > want) picked.shift(); }
            for (const o of box.querySelectorAll('.perk')) o.classList.toggle('on', picked.includes(o.dataset.k));
            save.endlessRun.chosen = [...picked]; persist();
            $('btn-next').disabled = picked.length < want; if (picked.length >= want) $('btn-next').focus();
          };
          b.dataset.k = k;
          box.appendChild(b);
        }
      }
      show('win');
      return;
    }
    const key = game.def.id + ':' + game.diffKey + (game.def.ng ? ':ng' : '');
    const gr = gradeRun(game);
    let newB = [];
    if (!game.def.test) {
      const order = 'CBAS';
      if (order.indexOf(gr.rank) > order.indexOf(save.ranks[key] || ' ')) save.ranks[key] = gr.rank;
      newB = awardBadges({ g: game, save, win: true, story: true, rank: gr.rank });
      const prev = save.best[key];
      if (!prev || t < prev) save.best[key] = t;
      save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, game.levelIndex + 2));
      persist();
    }
    $('win-title').textContent = `${game.def.code} SELESAI`;
    $('win-stats').innerHTML = [
      ['Waktu rekaman', `${fmt(t)}  (par ${fmt(parOf(game.def))})`], ['Rekor', save.best[key] ? fmt(save.best[key]) : '—'], ['Catatan dibaca', `${game.stats.notes}/${game.def.notes}`],
      ['Terlihat oleh penghuni', `${game.stats.spotted}×`], ['Kaset rahasia', game.stats.tape ? 'ditemukan' : '—'], ['Bukti direkam', game.stats.films ? `${game.stats.films} penghuni` : '—'], ['Kesulitan', DIFFICULTY[game.diffKey].label + (game.stats.retries ? `  ·  ${game.stats.retries}× lanjut dari panel` : '')],
    ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
    $('win-rank').textContent = gr.rank; $('win-rank').dataset.rank = gr.rank;
    const last = game.levelIndex >= LEVELS.length - 1;
    if (last && !game.def.test) { showEnding(t, gr, newB); return; }
    $('win-text').textContent = (last ? ENDING : 'Pintu darurat terbuka ke… lorong lain. Sekolah ini lebih dalam dari yang kamu kira.') + badgeLine(newB);
    $('btn-next').textContent = last ? 'Main Lagi dari Awal' : 'Bab Berikutnya';
    show('win');
  },
};

// lifetime numbers for the archive; called whenever a run ends or is left
let lastDeath = null;
const levelKey = (def) => (def.endless ? 'e' + def.seed : 's' + def.id);
function countRun(how, killer = null) {
  const S = save.stats = { ...defaults.stats, ...save.stats, deaths: { ...(save.stats && save.stats.deaths) } };
  S.time += Math.max(0, Math.round(game.time - (game.countedT || 0))); game.countedT = game.time;
  S.escapes += (game.stats.escapes || 0) - (game.countedEsc || 0); game.countedEsc = game.stats.escapes || 0;
  for (const [k, from] of [['knocks', 'knocks'], ['peeks', 'peeks'], ['noticed', 'doorsNoticed']]) { const v = game.stats[from] || 0, key = 'counted_' + k; S[k] = (S[k] || 0) + v - (game[key] || 0); game[key] = v; }
  if (how === 'dead' && killer) S.deaths[killer] = (S.deaths[killer] || 0) + 1;
  if (how === 'win') { S.wins++; if (game.def.endless && !game.def.daily) S.floors++; }
  // the last dozen runs, newest first (training and test rooms are not runs)
  if (!game.def.test && (how === 'win' || how === 'dead')) {
    const H = save.history || (save.history = []);
    H.unshift({ at: Date.now(), code: game.def.code, name: game.def.name, diff: game.diffKey, t: Math.round(game.time), how, killer: how === 'dead' ? killer : null, spotted: game.stats.spotted || 0 });
    H.length = Math.min(H.length, 12);
  }
}
const badgeLine = (list) => (list.length ? '\n\n' + list.map((b) => `${b.icon} Lencana baru: ${b.name}`).join('\n') : '');
let ignoreUnlock = false;
function releasePointer() { if (document.pointerLockElement) { ignoreUnlock = true; input.unlock(); } }
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) return;
  if (ignoreUnlock) { ignoreUnlock = false; return; }
  if (game && game.state === 'playing' && !input.touch) ui.pause();
});

const ngOn = () => !!(save.ng && save.endingSeen);
function startLevel(index, test = null) {
  pendingLevel = index;
  pendingDef = null; pendingGod = false;
  let def = LEVELS[index];
  if (test) {
    const ents = test.resident === 'default' ? def.entities : test.resident === 'none' ? [] : [{ type: test.resident }];
    pendingDef = def = { ...def, entities: ents, test: true };
    pendingGod = test.god; pendingBrain = !!test.brain;
  } else if (ngOn()) {
    pendingDef = def = { ...def, ng: true, entities: [{ type: NG_CAST[index] }], lightsOff: Math.min(0.7, def.lightsOff + 0.12), batteries: Math.max(2, def.batteries - 1),
      subtitle: 'PUTARAN KEDUA · Gedungnya sama. Penghuninya bukan yang kamu kenal.' };
  }
  $('intro-code').textContent = def.code;
  $('intro-name').textContent = def.name;
  $('intro-sub').textContent = def.subtitle;
  $('intro-text').textContent = index === 0 && !test ? INTRO.join('\n\n') : tipLine();
  show('intro');
}

const tipLine = () => 'Tip: ' + TIPS[Math.floor(Math.random() * TIPS.length)];
const modText = (def) => (def.mods && def.mods.length ? def.mods.map((k) => `☠ ${ENDLESS_MODS[k].name} — ${ENDLESS_MODS[k].desc}`).join('\n') : '');
// one seed per run: the whole descent is fixed the moment you start it, and a
// run you walked away from can be picked up at the floor you had reached
function startEndless(floor, seed = null) {
  if (seed === null) seed = Math.floor(Math.random() * 1e6);
  const prev = save.endlessRun && save.endlessRun.seed === seed && floor > 1 ? save.endlessRun : null;
  const perks = prev ? [...(prev.perks || []), ...[].concat(prev.chosen || [])] : [];
  save.endlessRun = { seed, floor, perks }; persist();
  pendingLevel = -1;
  pendingDef = endlessDef(floor, seed); pendingDef.runSeed = seed; pendingGod = false;
  for (const k of perks) if (PERKS[k]) PERKS[k].apply(pendingDef);
  pendingDef.perks = perks;
  $('intro-code').textContent = 'JURANG · ' + pendingDef.code;
  $('intro-name').textContent = pendingDef.name;
  $('intro-sub').textContent = pendingDef.subtitle;
  const perkLine = perks.length ? 'Bekal: ' + perks.map((k) => PERKS[k] ? PERKS[k].icon + ' ' + PERKS[k].name : k).join(', ') : '';
  $('intro-text').textContent = [floor === 1 ? `Setiap lantai dibuat acak dan makin berbahaya. Seberapa dalam kamu bisa turun?\nRekor: ${save.bestFloor} lantai.` : tipLine(), modText(pendingDef), perkLine].filter(Boolean).join('\n\n');
  show('intro');
}
// Rekaman Harian: one fixed floor per calendar day, the same for everyone; best time is kept
const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
function startDaily() {
  const date = today(), floor = 3 + (date % 4);
  pendingLevel = -1; pendingGod = false;
  pendingDef = { ...endlessDef(floor, date % 999983), daily: date, code: 'REKAMAN HARIAN', subtitle: `${String(date).slice(6)}/${String(date).slice(4, 6)}/${String(date).slice(0, 4)} · bangunan yang sama untuk semua orang hari ini.` };
  const rec = save.daily[date];
  $('intro-code').textContent = 'REKAMAN HARIAN';
  $('intro-name').textContent = pendingDef.name;
  $('intro-sub').textContent = pendingDef.subtitle;
  $('intro-text').textContent = [rec ? `Waktu terbaikmu hari ini: ${fmt(rec)}` : 'Keluar secepat mungkin. Waktu terbaikmu hari ini akan dicatat.', modText(pendingDef)].filter(Boolean).join('\n\n');
  show('intro');
}

// Ruang Latihan: a small floor with a slow resident that cannot kill you, and a list of
// things to try (crouch, lean, knock, hide and hold your breath, wedge a door, escape)
function startTraining() {
  pendingLevel = -1; pendingGod = true; pendingBrain = false;
  const base = endlessDef(1, 4711);
  pendingDef = { ...base, id: 'training', training: true, test: true, endless: false, code: 'LATIHAN', name: 'Ruang Latihan', mods: [], odd: 0,
    subtitle: 'Tidak ada yang bisa mati di sini. Belum.', entities: [{ type: 'clock' }], fuses: 1, keys: 0, wedges: 2, lightsOff: 0.1, flicker: 0.05 };
  $('intro-code').textContent = 'LATIHAN';
  $('intro-name').textContent = pendingDef.name;
  $('intro-sub').textContent = pendingDef.subtitle;
  $('intro-text').textContent = 'Jam Berlidah berpatroli di lantai ini, tapi tangkapannya tidak membunuhmu.\nIkuti daftar di kanan atas: jongkok, mengintip, mengetuk, bersembunyi, mengganjal pintu, dan lolos dari kejaran.';
  show('intro');
}

function beginPlay(cp = null) {
  audio.init();
  goFullscreen();
  try {
    const retries = cp ? game.retries : 0;
    game.loadLevel(pendingLevel, save.diff, pendingDef);
    game.godMode = pendingGod; game.brainView = !!(pendingDef && pendingDef.test) && pendingBrain;
    if (cp) { game.retries = retries; game.restore(cp); }
    game.countedT = game.time; game.countedEsc = game.stats.escapes || 0; for (const k of ['knocks', 'peeks', 'noticed']) game['counted_' + k] = game.stats[{ knocks: 'knocks', peeks: 'peeks', noticed: 'doorsNoticed' }[k]] || 0;
    if (lastDeath && lastDeath.key === levelKey(game.def)) game.placeGrave(lastDeath);
  } catch (e) { showError(e.stack || e); return; }
  hideAll();
  hud.show(true);
  $('touch-layer').classList.toggle('hidden', !input.touch);
  game.state = 'playing';
  input.enabled = true;
  input.lock();
  hud.toast(cp ? 'Rekaman dilanjutkan dari kotak panel' : game.def.name, 3);
  setTimeout(() => game.state === 'playing' && hud.showObjectives(game.objectiveText(), 6), 1500);
}

function goFullscreen() {
  if (!input.touch) return;
  const el = document.documentElement;
  try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); } catch (_) { /* ignore */ }
  try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_) { /* ignore */ }
}

function quitToMenu() {
  if (game.floors && game.floors.length) { countRun('quit'); persist(); }
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
  const L = LEVELS[save.unlocked - 1];
  const btn = document.querySelector('#title [data-go="play"]');
  btn.querySelector('.cont-k').textContent = save.unlocked > 1 ? 'Lanjutkan' : 'Mulai';
  btn.querySelector('.cont-s').textContent = `${L.code} · ${L.name}`;
  const er = save.endlessRun, dr = save.daily[today()];
  $('mode-endless-sub').textContent = er && er.floor > 1 ? `Lanjutkan dari Lantai ${-er.floor}.` + (save.bestFloor ? ` Rekor: ${save.bestFloor} lantai.` : '') : 'Lantai demi lantai ke bawah, setiap lantai dibuat acak.' + (save.bestFloor ? ` Rekor: ${save.bestFloor} lantai.` : '');
  // today's tape: who lives there and what is wrong with it
  { const date = today(), dd = endlessDef(3 + (date % 4), date % 999983), who = dd.entities.map((e) => (ENTITY_INFO[e.type] || {}).name || e.type).join(' & ');
    $('mode-daily-who').textContent = `Hari ini: ${dd.name} · ${who}` + (dd.mods && dd.mods.length ? ' · ' + dd.mods.map((k) => ENDLESS_MODS[k].name).join(', ') : ''); }
  { const pk = er && er.floor > 1 ? [...(er.perks || []), ...[].concat(er.chosen || [])] : [];
    $('mode-endless-perks').textContent = pk.length ? 'Bekal: ' + pk.map((k) => PERKS[k] ? PERKS[k].icon + ' ' + PERKS[k].name : k).join(', ') : ''; }
  $('mode-daily-sub').textContent = dr ? `Hari ini selesai dalam ${fmt(dr)}. Kembali besok untuk kaset baru.` : 'Satu lantai yang sama untuk semua pemain, berganti setiap hari.';
  document.querySelector('#title .tag').textContent = save.trueEnding ? '★★ Akhir sebenarnya ditemukan' : save.endingSeen ? '★ Rekaman terakhir sudah diputar' : 'Rekaman ditemukan · 1996';
}
// the camcorder clock in the corner of the title screen
setInterval(() => {
  const el = $('title-clock'); if (!el || current !== 'title') return;
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  el.textContent = `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}, 1000);
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
    // levels unlock in order; every map can still be tried from Ruang Uji
    b.disabled = i + 1 > save.unlocked;
    const rk = l.id + ':' + save.diff + (ngOn() ? ':ng' : '');
    const best = save.best[rk];
    const kind = ngOn() ? NG_CAST[i] : l.entities[0] && l.entities[0].type, seen = kind && save.met.includes(kind);
    b.innerHTML = `${portrait(kind, seen)}<span class="code">${l.code}</span><span><div class="nm">${l.name}</div><div class="sub">${b.disabled ? 'Terkunci' : l.subtitle}</div></span><span class="best">${save.ranks[rk] ? `<b class="rank" data-rank="${save.ranks[rk]}">${save.ranks[rk]}</b> ` : ''}${best ? `${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}` : ''}</span>`;
    b.onclick = () => startLevel(i);
    list.appendChild(b);
  });
  const ngb = $('ng-toggle');
  ngb.classList.toggle('hidden', !save.endingSeen);
  ngb.textContent = `Putaran Kedua: ${ngOn() ? 'AKTIF — penghuni ditukar, lebih gelap' : 'mati'}`;
  ngb.classList.toggle('on', ngOn());
  ngb.onclick = () => { save.ng = !save.ng; persist(); buildLevels(); };
  const dl = $('diff-list'); dl.innerHTML = '';
  for (const [k, d] of Object.entries(DIFFICULTY)) {
    const b = document.createElement('button');
    b.textContent = d.label; b.classList.toggle('on', save.diff === k);
    b.onclick = () => { save.diff = k; persist(); buildLevels(); };
    dl.appendChild(b);
  }
  $('diff-desc').textContent = (DIFFICULTY[save.diff] || {}).desc || '';
}
function buildArchive() {
  const list = $('archive-list'); list.innerHTML = '';
  const found = new Set(save.notesRead), tapes = new Set(save.tapes.map(String));
  let total = 0, have = 0;
  // residents met so far
  const hb = document.createElement('h3'); hb.textContent = 'Penghuni'; list.appendChild(hb);
  const grid = document.createElement('div'); grid.className = 'beast-grid'; list.appendChild(grid);
  const met = new Set(save.met);
  for (const k of [...LEVELS.flatMap((l) => l.entities.map((e) => e.type)), ...RESIDENTS].filter((k, i, a) => a.indexOf(k) === i)) {
    total++; const ok = met.has(k); if (ok) have++;
    const b = document.createElement('button');
    b.className = 'archive-item' + (ok ? '' : ' locked');
    const filmed = (save.film[k] || 0) >= FILM_NEED;
    total++; if (filmed) have++;
    b.innerHTML = ok ? `${portrait(k, true)}<span>${ENTITY_INFO[k].name}</span>${filmed ? '<span class="tapeicon">📼</span>' : ''}` : `${portrait(k, false)}<span>??? — belum ditemui</span>`;
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
  const hs = document.createElement('h3'); hs.textContent = 'Statistik'; list.appendChild(hs);
  const S = { ...defaults.stats, ...save.stats }, dead = Object.entries(S.deaths || {}).sort((a, b) => b[1] - a[1]);
  const nDead = dead.reduce((n, d) => n + d[1], 0), hh = Math.floor(S.time / 3600), mm = Math.floor(S.time / 60) % 60;
  for (const [a, b] of [['Lama merekam', `${hh} jam ${mm} menit`], ['Bab & lantai diselesaikan', S.wins], ['Rekaman terputus (mati)', nDead],
    ['Paling sering membunuhmu', dead.length ? `${ENTITY_INFO[dead[0][0]] ? ENTITY_INFO[dead[0][0]].name : dead[0][0]} (${dead[0][1]}×)` : '—'], ['Lolos dari kejaran', S.escapes], ['Ketukan di dinding', S.knocks || 0], ['Intipan dari balik sudut', S.peeks || 0], ['Pintu yang diperiksa penghuni', S.noticed || 0], ['Lantai Jurang dilewati', S.floors]]) {
    const d = document.createElement('div'); d.className = 'archive-item stat'; d.innerHTML = `<span>${a}</span><b>${b}</b>`; list.appendChild(d);
  }
  if ((save.history || []).length) {
    const hh2 = document.createElement('h3'); hh2.textContent = 'Riwayat rekaman'; list.appendChild(hh2);
    for (const r of save.history) {
      const d = document.createElement('div'); d.className = 'archive-item stat hist';
      const when = new Date(r.at), day = `${String(when.getDate()).padStart(2, '0')}/${String(when.getMonth() + 1).padStart(2, '0')} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
      const res = r.how === 'win' ? `✓ ${fmt(r.t)}` : `✕ ${r.killer && ENTITY_INFO[r.killer] ? ENTITY_INFO[r.killer].name : 'terputus'}`;
      d.innerHTML = `<span>${r.code} · ${r.name}<small class="dim"> ${day} · ${(DIFFICULTY[r.diff] || {}).label || ''} · terlihat ${r.spotted}×</small></span><b class="${r.how}">${res}</b>`;
      list.appendChild(d);
    }
  }
  const hl = document.createElement('h3'); hl.textContent = `Lencana  ${save.badges.length}/${BADGES.length}`; list.appendChild(hl);
  for (const b of BADGES) {
    const ok = save.badges.includes(b.id);
    const d = document.createElement('div');
    d.className = 'archive-item badge' + (ok ? '' : ' locked');
    d.innerHTML = `<span class="bicon">${ok ? b.icon : '·'}</span><span><b>${b.name}</b><br><small>${b.desc}</small></span>`;
    list.appendChild(d);
  }
  $('archive-count').textContent = `${have}/${total} ditemukan  ·  Rekor mode Jurang: ${save.bestFloor} lantai`;
}
// test rooms: every level unlocked, pick the resident, optional invulnerability
const roomOpts = { resident: 'default', god: false, brain: false };
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
  sel.innerHTML = [['default', 'Bawaan bab'], ['none', 'Tanpa penghuni (jelajah bebas)'], ...RESIDENTS.map((k) => [k, ENTITY_INFO[k].name])]
    .map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  sel.value = roomOpts.resident;
  sel.onchange = () => { roomOpts.resident = sel.value; };
  $('room-god').checked = roomOpts.god;
  $('room-god').onchange = () => { roomOpts.god = $('room-god').checked; };
  $('room-brain').checked = roomOpts.brain;
  $('room-brain').onchange = () => { roomOpts.brain = $('room-brain').checked; };
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
  RESIDENTS.forEach((k) => {
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
  const sec = save.film[k] || 0, fb = $('beast-film');
  fb.classList.toggle('locked', sec < FILM_NEED);
  fb.textContent = sec >= FILM_NEED ? FILMS[k] : `Belum ada rekaman (${Math.floor(sec / FILM_NEED * 100)}%). Arahkan zoom kamera (Z) ke penghuni ini sampai meteran bukti penuh.`;
  show('beast');
  if (!beastViewer) beastViewer = new ModelViewer($('beast-canvas'), assets);
  const clips = beastViewer.show(k);
  const cl = $('beast-clips'); cl.innerHTML = '';
  clips.forEach((n) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { beastViewer.playClip(n); for (const x of cl.children) x.classList.toggle('on', x === b); }; cl.appendChild(b); });
  beastViewer.start();
}

// final level cleared: the tape plays out, then credits
function showEnding(t, gr = null, newB = []) {
  const nFilm = RESIDENTS.filter((k) => (save.film[k] || 0) >= FILM_NEED).length;
  const truth = save.tapes.length >= LEVELS.length && nFilm >= TRUE_FILMS;
  save.endingSeen = true; if (truth) save.trueEnding = true;
  newB = newB.concat(awardBadges({ g: game, save, win: false, story: false }));
  persist();
  $('ending-other').textContent = truth ? '★ Akhir yang sebenarnya' : save.trueEnding ? '' : `Ada akhir lain. Ia butuh keenam kaset rahasia (${save.tapes.length}/${LEVELS.length}) dan bukti enam penghuni (${Math.min(nFilm, TRUE_FILMS)}/${TRUE_FILMS}).`;
  const lines = (truth ? ENDING_TRUE : ENDING).split('\n\n');
  const box = $('ending-lines'); box.innerHTML = '';
  lines.forEach((ln, i) => { const p = document.createElement('p'); p.textContent = ln; p.style.animationDelay = (0.6 + i * 2.6) + 's'; box.appendChild(p); });
  const met = new Set(save.met);
  const cast = LEVELS.map((l) => l.entities[0].type).filter((k, i, a) => a.indexOf(k) === i)
    .map((k) => `<div class="cast">${portrait(k, met.has(k))}<span>${met.has(k) ? ENTITY_INFO[k].name : '???'}</span></div>`).join('');
  $('ending-cast').innerHTML = cast;
  $('ending-stats').textContent = (gr ? `Peringkat ${gr.rank}  ·  ` : '') + (newB.length ? newB.map((b) => `${b.icon} ${b.name}`).join('  ·  ') + '  ·  ' : '') + `Waktu rekaman terakhir ${fmt(t)}  ·  Kaset rahasia ${save.tapes.length}/${LEVELS.length}  ·  Penghuni ditemui ${save.met.length}`;
  $('ending-credits').style.animationDelay = (1 + lines.length * 2.6) + 's';
  show('ending');
}

function buildSettings() {
  const s = save.settings;
  $('set-sens').value = s.sens; $('set-vol').value = s.volume; $('set-quality').value = s.quality;
  $('set-screen').value = s.screen; $('set-inv').checked = s.invertY; $('set-subs').checked = s.subs;
  $('set-fov').value = s.fov; $('set-fov-val').textContent = s.fov + '°'; $('set-bob').checked = s.bob; $('set-calm').checked = s.calm; $('set-big').checked = s.bigText; $('set-vib').checked = s.vibrate; $('set-assist').checked = s.assist; $('set-fps').checked = !!s.fps; $('set-scare').value = s.scare || 'penuh'; $('set-cap').checked = s.fpsCap === 30; $('set-crouch').value = s.crouchMode || 'toggle'; $('set-sprint').value = s.sprintMode || 'hold'; $('set-ring').checked = !!s.soundRing; $('set-bright').value = s.bright || 1; $('set-bright-val').textContent = Math.round((s.bright || 1) * 100) + '%'; $('set-autores').checked = s.autoRes !== false;
  $('save-msg').textContent = ''; $('save-code').classList.add('hidden'); resetArmed = false; $('save-reset').textContent = 'Hapus semua progres';
  buildBinds();
}
// ---- progress as a code: copy it out, paste it in on another device
let resetArmed = false;
const encodeSave = () => btoa(unescape(encodeURIComponent(JSON.stringify(save))));
function copyText(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false); } catch (_) { /* fall through */ }
  return Promise.resolve(false);
}
$('save-export').onclick = async () => {
  const code = encodeSave(), ok = await copyText(code);
  const ta = $('save-code'); ta.classList.remove('hidden'); ta.value = code; ta.select();
  $('save-msg').textContent = ok ? 'Kode progres disalin. Simpan di tempat aman.' : 'Salin kode di atas secara manual.';
};
$('save-import').onclick = () => {
  const ta = $('save-code');
  if (ta.classList.contains('hidden') || !ta.value.trim()) { ta.classList.remove('hidden'); ta.value = ''; ta.focus(); $('save-msg').textContent = 'Tempel kodenya, lalu tekan tombol ini sekali lagi.'; return; }
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(ta.value.trim()))));
    if (!data || typeof data !== 'object' || !data.settings || !Array.isArray(data.met)) throw new Error('bentuk');
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    $('save-msg').textContent = 'Progres dimuat. Memuat ulang…';
    setTimeout(() => location.reload(), 600);
  } catch (_) { $('save-msg').textContent = 'Kode tidak valid. Progresmu tidak diubah.'; }
};
$('save-reset').onclick = () => {
  if (!resetArmed) { resetArmed = true; $('save-reset').textContent = 'Yakin? Tekan sekali lagi'; $('save-msg').textContent = 'Semua bab, arsip, lencana, dan rekor akan hilang. Pengaturan tetap.'; return; }
  const keep = save.settings;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...structuredClone(defaults), settings: keep })); } catch (_) { /* ignore */ }
  location.reload();
};
$('btn-share').onclick = async () => {
  const d = String(game.def.daily), t = save.daily[game.def.daily];
  const text = `THE HELLROOM · Rekaman Harian ${d.slice(6)}/${d.slice(4, 6)}/${d.slice(0, 4)}\n${game.def.name} — ${fmt(t)} (${DIFFICULTY[game.diffKey].label}, terlihat ${game.stats.spotted}×)`;
  $('btn-share').textContent = (await copyText(text)) ? 'Tersalin ✓' : 'Gagal menyalin';
};
function buildBinds() {
  const s = save.settings, list = $('bind-list'); list.innerHTML = '';
  const binds = { ...DEFAULT_BINDS, ...(s.binds || {}) };
  for (const a of Object.keys(DEFAULT_BINDS)) {
    const b = document.createElement('button');
    b.className = 'bind'; b.innerHTML = `<span>${BIND_LABELS[a]}</span><b>${keyLabel(binds[a])}</b>`;
    b.onclick = () => {
      b.classList.add('wait'); b.querySelector('b').textContent = 'tekan tombol…';
      input.capture = (code) => {
        if (code !== 'Escape') {
          // a key holds one action: whoever had it takes this action's old key
          const other = Object.keys(binds).find((k) => k !== a && binds[k] === code);
          if (other) binds[other] = binds[a];
          binds[a] = code;
          s.binds = binds; persist(); if (game) game.applySettings();
        }
        buildBinds();
      };
    };
    list.appendChild(b);
  }
  $('bind-reset').onclick = () => { delete s.binds; persist(); if (game) game.applySettings(); buildBinds(); };
  for (const el of document.querySelectorAll('.kb-only')) el.classList.toggle('hidden', input.touch);
}
function readSettings() {
  const s = save.settings;
  s.sens = +$('set-sens').value; s.volume = +$('set-vol').value; s.quality = $('set-quality').value;
  s.screen = $('set-screen').value; s.invertY = $('set-inv').checked; s.subs = $('set-subs').checked;
  s.fov = +$('set-fov').value; $('set-fov-val').textContent = s.fov + '°'; s.bob = $('set-bob').checked; s.calm = $('set-calm').checked; s.bigText = $('set-big').checked; s.vibrate = $('set-vib').checked; s.assist = $('set-assist').checked; s.fps = $('set-fps').checked; s.scare = $('set-scare').value; s.fpsCap = $('set-cap').checked ? 30 : 0; s.crouchMode = $('set-crouch').value; s.sprintMode = $('set-sprint').value; s.soundRing = $('set-ring').checked; s.bright = +$('set-bright').value; $('set-bright-val').textContent = Math.round(s.bright * 100) + '%'; s.autoRes = $('set-autores').checked;
  persist();
  if (game) game.applySettings();
}
for (const id of ['set-sens', 'set-vol', 'set-quality', 'set-screen', 'set-inv', 'set-subs', 'set-fov', 'set-bob', 'set-calm', 'set-big', 'set-vib', 'set-assist', 'set-fps', 'set-autores', 'set-bright', 'set-ring', 'set-crouch', 'set-sprint', 'set-cap', 'set-scare']) $(id).addEventListener('input', readSettings);

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  audio.init();
  const go = b.dataset.go;
  if (go === 'play') { startLevel(save.unlocked - 1); return; }
  if (go === 'endless') { const r = save.endlessRun; if (r && r.floor > 1) startEndless(r.floor, r.seed); else startEndless(1); return; }
  if (go === 'daily') { startDaily(); return; }
  if (go === 'training') { startTraining(); return; }
  if (go === 'modes') buildTitle();
  if (go === 'archive') buildArchive();
  if (go === 'levels') buildLevels();
  if (go === 'rooms') buildRooms();
  if (current === 'rooms' && go !== 'rooms' && viewer) viewer.stop();
  if (current === 'beast' && beastViewer) beastViewer.stop();
  if (go === 'settings') { buildSettings(); returnTo = b.dataset.from === 'pause' ? 'pause' : 'title'; }
  if (go === 'title' && current === 'settings' && returnTo === 'pause') { show('pause'); return; }
  show(go);
});
$('intro-go').onclick = () => beginPlay();
$('btn-checkpoint').onclick = () => { pendingLevel = game.levelIndex; beginPlay(game.checkpoint); };
$('note-close').onclick = () => {
  if (noteFromArchive) { noteFromArchive = false; show('archive'); return; }
  hideAll(); game.state = 'playing'; input.enabled = true; input.lock();
};
$('btn-resume').onclick = () => ui.resume();
$('btn-restart').onclick = () => { audio.resume(); pendingLevel = game.levelIndex; beginPlay(); };
$('btn-quit').onclick = quitToMenu;
$('btn-retry').onclick = () => { if (game.def.daily) { startDaily(); return; } if (game.def.endless) { startEndless(1); return; } pendingLevel = game.levelIndex; beginPlay(); };
$('btn-dead-menu').onclick = quitToMenu;
$('btn-win-menu').onclick = quitToMenu;
$('btn-end-menu').onclick = quitToMenu;
$('btn-end-again').onclick = () => startLevel(0);
$('btn-next').onclick = () => { if (game.def.daily) { startDaily(); return; } if (game.def.endless) { startEndless(game.def.floor + 1, game.def.runSeed); return; } const n = game.levelIndex + 1; startLevel(n >= LEVELS.length ? 0 : n); };
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && current === 'note') $('note-close').click();
  if ((e.code === 'Enter' || e.code === 'Space') && current === 'intro' && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); beginPlay(); }
  if (!current || (game && game.state === 'playing')) return;
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); moveFocus(e.code === 'ArrowDown' ? 1 : -1); }
  else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && document.activeElement.tagName === 'BUTTON') { e.preventDefault(); moveFocus(e.code === 'ArrowRight' ? 1 : -1); }
  else if (e.code === 'Enter' && document.activeElement.type === 'checkbox') document.activeElement.click();
});

// controller in the menus: A confirms the obvious button, Start resumes, B goes back
function padMenus() {
  const e = input.pad.edges;
  if (!e.size || (game && game.state === 'playing')) return;
  const click = (sel) => { const b = document.querySelector(sel); if (b) b.click(); };
  if (e.has(12)) moveFocus(-1);
  if (e.has(13)) moveFocus(1);
  if (e.has(14) && !nudge(-1)) moveFocus(-1);
  if (e.has(15) && !nudge(1)) moveFocus(1);
  if (current === 'pause' && (e.has(9) || e.has(1))) { ui.resume(); return; }
  const af = document.activeElement;
  if (e.has(0) && af && focusables().includes(af) && af.tagName !== 'SELECT' && af.type !== 'range') { af.click(); return; }
  if (e.has(0)) click({ title: '#title [data-go="play"]', calib: '#calib-ok', intro: '#intro-go', note: '#note-close', dead: '#btn-retry', win: '#btn-next', ending: '#btn-end-menu' }[current] || '.none');
  else if (e.has(1)) click(`#${current} .back[data-go], #btn-dead-menu, #btn-win-menu`.replace('#btn-dead-menu', current === 'dead' ? '#btn-dead-menu' : '.none').replace('#btn-win-menu', current === 'win' ? '#btn-win-menu' : '.none'));
}

// ---------------------------------------------------------------- boot
// Studio intro: the logo stays at least a few seconds while the tape loads,
// then the signal tears and the title comes up. Click, tap or a key skips once loaded.
const SPLASH_MIN = 3.6;
const splashStart = performance.now();
if ((save.settings || {}).screen === 'clear') document.body.classList.add('clear-screen');
function endSplash() {
  return new Promise((resolve) => {
    const el = $('splash'), skip = $('splash-skip');
    let done = false;
    const go = () => {
      if (done) return; done = true;
      removeEventListener('keydown', go); el.removeEventListener('pointerdown', go);
      el.classList.add('tear');
      setTimeout(() => { el.classList.add('out'); resolve(); }, 450);
      setTimeout(() => { el.classList.remove('active', 'out', 'tear'); el.style.display = 'none'; }, 1400);
    };
    $('load-bar').parentElement.classList.add('done');
    const left = Math.max(0, SPLASH_MIN * 1000 - (performance.now() - splashStart));
    if (left > 400) { skip.classList.add('show'); addEventListener('keydown', go); el.addEventListener('pointerdown', go); }
    setTimeout(go, left);
  });
}

// First launch: a brightness test card drawn through the game's own tone curve
function calibrate() {
  return new Promise((resolve) => {
    const cv = $('calib-canvas'), c = cv.getContext('2d'), sl = $('calib-bright');
    sl.value = save.settings.bright || 1;
    const draw = () => {
      const b = +sl.value, tone = (v) => Math.round(255 * Math.pow(v, 1 / b));
      c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
      // the faint symbol (should be barely visible) and the clear one
      for (const [x, v] of [[140, 0.035], [340, 0.16]]) {
        const t = tone(v); c.fillStyle = `rgb(${t},${t},${t})`;
        c.beginPath(); c.ellipse(x, 62, 26, 34, 0, 0, Math.PI * 2); c.fill();
        c.fillRect(x - 34, 92, 68, 48);
        c.fillStyle = '#000'; c.beginPath(); c.arc(x - 9, 58, 5, 0, 7); c.arc(x + 9, 58, 5, 0, 7); c.fill();
      }
      $('calib-val').textContent = Math.round(b * 100) + '%';
    };
    sl.oninput = draw; draw();
    show('calib');
    $('calib-ok').onclick = () => { save.settings.bright = +sl.value; save.calibrated = true; persist(); game.settings = save.settings; game.applySettings(); resolve(); };
  });
}

async function boot() {
  await assets.load((f) => { $('load-bar').style.width = (f * 100).toFixed(0) + '%'; });
  game = new Game({ canvas: $('game'), assets, audio, input, hud, settings: save.settings, ui });
  game.hintsSeen = new Set(save.hints || []);
  game.onHint = (id) => { save.hints = [...game.hintsSeen]; persist(); };
  game.onTape = (id) => { if (!save.tapes.map(String).includes(String(id))) { save.tapes.push(id); persist(); } };
  game.met = new Set(save.met || []);
  game.onMeet = (kind) => { if (save.met.includes(kind)) return false; save.met.push(kind); persist(); return true; };
  game.film = save.film;
  game.onFilm = () => persist();
  game.onTrainingDone = () => { save.trained = true; const nb = awardBadges({ g: game, save, win: false, story: false }); if (nb.length) hud.toast(nb.map((b) => `${b.icon} Lencana baru: ${b.name}`).join('\n'), 4); persist(); setTimeout(() => { if (game.def && game.def.training) quitToMenu(); }, 5000); };
  game.onNoteRead = (key) => { if (!save.notesRead.includes(key)) { save.notesRead.push(key); persist(); } };
  window.__game = game; // debug handle
  if (!DEV_ROOMS) $('btn-rooms').remove();
  $('version').textContent = 'v' + VERSION + (DEV_ROOMS ? ' · uji' : '');
  // installable + offline where the page is served securely
  try { if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (_) { /* sandboxed frames refuse service workers */ }
  buildTitle();
  await endSplash();
  if (!save.calibrated) await calibrate();
  show('title');
  let last = performance.now();
  let stillFrames = 0;
  const frame = (now) => {
    // 30 fps cap (saves battery and heat on laptops and phones): skip every other display frame
    if (save.settings.fpsCap === 30 && now - last < 1000 / 31) { requestAnimationFrame(frame); return; }
    game.realDt = Math.min(0.25, (now - last) / 1000);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      input.poll(dt); padMenus();
      game.update(dt);
      if (game.state === 'playing') game.autoRes(game.realDt);
      // paused, reading a note, on the death or win screen: the picture behind does not change,
      // so draw it a few times (to settle) and then stop drawing the 3D world altogether
      const still = game.state === 'paused' || game.state === 'note' || game.state === 'dead' || game.state === 'won';
      stillFrames = still ? stillFrames + 1 : 0;
      if (game.state !== 'menu' && stillFrames < 4) game.render(now / 1000);
    } catch (e) { showError(e.stack || String(e)); game.state = 'paused'; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
boot();

// Loads Blender-exported GLB models and baked textures. Every asset has a
// procedural fallback so the game still runs if a file is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MODEL_KEYS = [
  'student_desk', 'teacher_desk', 'chalkboard', 'school_locker', 'locker_bank',
  'door_classroom', 'door_locked', 'exit_door', 'ceiling_light', 'wall_clock',
  'bookshelf', 'trash_bin', 'water_fountain', 'cardboard_box', 'chair_fallen',
  'fuse_box', 'item_eraser', 'item_fuse', 'item_key', 'item_battery', 'item_note', 'item_tape',
  'entity_monitor', 'entity_substitute', 'entity_pupil',
];
export const TEXTURE_KEYS = ['floor_tile', 'floor_classroom', 'wall_hall', 'wall_classroom', 'ceiling_tile', 'stain_decal'];

// Rough sizes used for fallback boxes [w, h, d] and their color
const FALLBACK = {
  student_desk: [0.7, 0.76, 1.1, 0x9a6b3f], teacher_desk: [1.5, 0.76, 0.75, 0x7a5030],
  chalkboard: [3.2, 1.25, 0.06, 0x24372c, 0.9], school_locker: [0.6, 1.95, 0.55, 0xb8922e],
  locker_bank: [2.4, 1.95, 0.5, 0x4d8a86], ceiling_light: [1.2, 0.08, 0.6, 0xf2f4e8, -0.08],
  wall_clock: [0.35, 0.35, 0.05, 0xeeeeee, -0.17], bookshelf: [1.2, 1.8, 0.35, 0x6b4a2b],
  trash_bin: [0.35, 0.5, 0.35, 0x556655], water_fountain: [0.45, 1.0, 0.35, 0xaaaaaa],
  cardboard_box: [0.55, 0.5, 0.55, 0xa07a4a], chair_fallen: [0.45, 0.4, 0.8, 0x9a6b3f],
  fuse_box: [0.6, 0.8, 0.15, 0x777777, 1.0], item_fuse: [0.04, 0.12, 0.04, 0xffaa55, -0.06],
  item_key: [0.09, 0.02, 0.03, 0xd4a640, -0.01], item_battery: [0.1, 0.06, 0.05, 0x333333, -0.03],
  item_eraser: [0.14, 0.03, 0.055, 0x8a5a32, -0.015],
  item_note: [0.21, 0.005, 0.28, 0xf0eedc, 0], item_tape: [0.19, 0.025, 0.1, 0x111111, -0.012],
  entity_monitor: [0.6, 2.5, 0.4, 0x8a8f99], entity_substitute: [0.5, 1.8, 0.35, 0xe8e4dc],
  entity_pupil: [0.45, 1.15, 0.35, 0xd8b420],
};

export class Assets {
  constructor() {
    this.models = {};
    this.animations = {};
    this.textures = {};
    this.missing = [];
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    const total = MODEL_KEYS.length + TEXTURE_KEYS.length;
    let done = 0;
    const tick = () => onProgress && onProgress(++done / total);
    // Some static hosts refuse .glb; fall back to a base64 copy (<name>.glb.txt).
    const loadModel = (k) => loader.loadAsync(`assets/models/${k}.glb`).catch(async () => {
      const r = await fetch(`assets/models/${k}.glb.txt`);
      if (!r.ok) throw new Error('missing ' + k);
      const bin = atob((await r.text()).trim());
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return loader.parseAsync(buf.buffer, 'assets/models/');
    });
    const modelJobs = MODEL_KEYS.map((k) => loadModel(k)
      .then((g) => { this.models[k] = g.scene; this.animations[k] = g.animations || []; })
      .catch(() => { this.models[k] = makeFallbackModel(k); this.animations[k] = []; this.missing.push(k); })
      .finally(tick));
    const texJobs = TEXTURE_KEYS.map((k) => texLoader.loadAsync(`assets/textures/${k}.png`)
      .then((t) => { this.textures[k] = t; })
      .catch(() => { this.textures[k] = makeFallbackTexture(k); this.missing.push(k + '.png'); })
      .finally(tick));
    await Promise.all([...modelJobs, ...texJobs]);
    for (const k of TEXTURE_KEYS) {
      const t = this.textures[k];
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = k.startsWith('wall') ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      t.anisotropy = 4;
      t.needsUpdate = true;
    }
    for (const k of MODEL_KEYS) prepareModel(this.models[k]);
    if (this.missing.length) console.warn('[assets] using fallbacks for:', this.missing.join(', '));
  }
}

function prepareModel(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const m = o.material;
    if (m && m.name && m.name.startsWith('Emit')) m.userData.emissive = true;
  });
}

function makeFallbackModel(k) {
  const [w, h, d, color, y = 0] = FALLBACK[k] || [0.5, 0.5, 0.5, 0xff00ff];
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  if (k === 'ceiling_light') { mat.name = 'EmitLight'; mat.emissive = new THREE.Color(0xf2f4e8); mat.userData.emissive = true; }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.y = y < 0 ? y + h / 2 + (k.startsWith('item') ? 0 : 0) : y + h / 2;
  if (k === 'ceiling_light') mesh.position.y = -h / 2;
  if (k === 'chalkboard' || k === 'fuse_box' || k === 'wall_clock') mesh.position.z = d / 2;
  if (k.startsWith('item')) mesh.position.y = 0;
  g.add(mesh);
  if (k === 'school_locker' || k.startsWith('door')) {
    const pivot = new THREE.Group();
    pivot.name = k === 'school_locker' ? 'Door' : 'DoorLeaf';
    if (k === 'school_locker') { pivot.position.set(-w / 2, 0, d / 2); mesh.scale.z = 0.95; }
    else {
      mesh.geometry = new THREE.BoxGeometry(1.0, 2.15, 0.05);
      mesh.position.set(0.5, 1.075, 0);
      pivot.position.set(-0.5, 0, 0);
      g.remove(mesh); pivot.add(mesh); g.add(pivot);
      if (k === 'door_locked') mat.color.set(0x666a70);
      return g;
    }
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), new THREE.MeshStandardMaterial({ color: 0xa88326 }));
    leaf.position.set(w / 2, h / 2, 0.015);
    pivot.add(leaf); g.add(pivot);
  }
  if (k === 'exit_door') {
    mesh.geometry = new THREE.BoxGeometry(2.0, 2.4, 0.1);
    mesh.position.set(0, 1.2, 0);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.05), new THREE.MeshStandardMaterial({ name: 'EmitExitSign', color: 0x00ff66, emissive: 0x00ff66 }));
    sign.position.set(0, 2.6, 0.08); g.add(sign);
    for (const [n, x] of [['LeafL', -0.9], ['LeafR', 0.9]]) {
      const p = new THREE.Group(); p.name = n; p.position.set(x, 0, 0.06);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.88, 2.25, 0.05), new THREE.MeshStandardMaterial({ color: 0x777b80 }));
      l.position.set(x < 0 ? 0.45 : -0.45, 1.12, 0); p.add(l); g.add(p);
    }
  }
  if (k === 'fuse_box') {
    for (let i = 1; i <= 3; i++) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.025), new THREE.MeshStandardMaterial({ name: 'EmitLamp' + i, color: 0x550000, emissive: 0x330000 }));
      lamp.name = 'Lamp' + i; lamp.position.set(-0.15 + (i - 1) * 0.15, 1.7, 0.16); g.add(lamp);
      const slot = new THREE.Object3D(); slot.name = 'Slot' + i; slot.position.set(-0.15 + (i - 1) * 0.15, 1.35, 0.16); g.add(slot);
    }
  }
  if (k.startsWith('entity')) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(w * 0.45, 12, 8), mat);
    head.position.y = h + w * 0.2; head.name = 'Head'; g.add(head);
  }
  return g;
}

function makeFallbackTexture(k) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rnd = (a, b) => a + Math.random() * (b - a);
  if (k === 'floor_tile') {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#3f7a6e' : '#d9d2bb';
      g.fillRect(x * 64, y * 64, 64, 64);
    }
  } else if (k === 'floor_classroom') {
    g.fillStyle = '#b8a27a'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(60,40,20,${rnd(0.05, 0.15)})`; g.fillRect(rnd(0, 256), rnd(0, 256), 2, 2); }
  } else if (k.startsWith('wall')) {
    g.fillStyle = k === 'wall_hall' ? '#d8ccaa' : '#e3d9a8'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = k === 'wall_hall' ? '#3f7a6e' : '#a8875a'; g.fillRect(0, 154, 256, 102);
    g.fillStyle = '#4a3020'; g.fillRect(0, 150, 256, 8);
  } else if (k === 'ceiling_tile') {
    g.fillStyle = '#e4e0d2'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#a8a596'; g.lineWidth = 4; g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 128, 128, 128); g.strokeRect(128, 0, 128, 128); g.strokeRect(0, 128, 128, 128);
  } else {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 120);
    gr.addColorStop(0, 'rgba(40,30,15,0.6)'); gr.addColorStop(1, 'rgba(40,30,15,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

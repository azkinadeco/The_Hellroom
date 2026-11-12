// Small turntable for inspecting the residents' Blender models in the menu.
import * as THREE from 'three';

export class ModelViewer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.assets = assets;
    this.renderer = null;
    this.running = false;
    this.yaw = 0.6; this.pitch = 0.15; this.auto = true;
    this.clock = new THREE.Clock();
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; this.auto = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.01;
      this.pitch = Math.max(-0.3, Math.min(0.9, this.pitch + (e.clientY - drag.y) * 0.006));
      drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
  }

  _init() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0c0b);
    this.scene.fog = new THREE.Fog(0x0b0c0b, 6, 14);
    this.camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.05, 50);
    this.scene.add(new THREE.HemisphereLight(0xd8dccf, 0x1a1512, 0.9));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.2); key.position.set(2, 4, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fa6ff, 1.2); rim.position.set(-3, 2, -3); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 40), new THREE.MeshStandardMaterial({ color: 0x2a2b28, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
  }

  show(kind) {
    this._init();
    if (this.obj) this.scene.remove(this.obj);
    const key = 'entity_' + kind;
    this.obj = this.assets.models[key].clone(true);
    this.scene.add(this.obj);
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.clips = this.assets.animations[key] || [];
    const box = new THREE.Box3().setFromObject(this.obj);
    const size = box.getSize(new THREE.Vector3());
    this.target = new THREE.Vector3(0, size.y * 0.5, 0);
    this.dist = Math.max(size.x, size.y, size.z) * 1.9 + 0.6;
    this.playClip(this.clips.find((c) => c.name === 'Idle') ? 'Idle' : this.clips[0]?.name);
    return this.clips.map((c) => c.name);
  }

  playClip(name) {
    if (!this.mixer) return;
    this.mixer.stopAllAction();
    const c = this.clips.find((k) => k.name === name);
    if (c) this.mixer.clipAction(c).reset().play();
  }

  start() {
    this._init();
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (w && (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio()))) {
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      }
      const dt = this.clock.getDelta();
      if (this.auto) this.yaw += dt * 0.4;
      if (this.mixer) this.mixer.update(dt);
      if (this.target) {
        const c = Math.cos(this.pitch);
        this.camera.position.set(Math.sin(this.yaw) * c * this.dist, this.target.y + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * c * this.dist);
        this.camera.lookAt(this.target);
      }
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }
}

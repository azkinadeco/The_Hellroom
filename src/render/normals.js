// Normal maps derived from the baked colour textures (height = luminance),
// so tiles, grout, bricks and planks catch the light instead of looking printed.
import * as THREE from 'three';

export function normalFromTexture(tex, strength = 2.0) {
  const img = tex.image;
  if (!img || !img.width) return null;
  const W = Math.min(512, img.width), H = Math.min(512, img.height);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const src = g.getImageData(0, 0, W, H).data;
  const h = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) h[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
  const out = g.createImageData(W, H), o = out.data;
  const at = (x, y) => h[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = (y * W + x) * 4;
    o[k] = (nx * 0.5 + 0.5) * 255; o[k + 1] = (ny * 0.5 + 0.5) * 255; o[k + 2] = (nz * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const n = new THREE.CanvasTexture(c);
  n.colorSpace = THREE.NoColorSpace;
  n.wrapS = tex.wrapS; n.wrapT = tex.wrapT; n.anisotropy = tex.anisotropy;
  return n;
}

// how glossy each surface texture is (0 = matt). Polished floors pick up a
// sheen of the light around them at grazing angles.
export const GLOSS = {
  floor_tile: 0.55, hosp_floor: 0.6, marble: 0.6, mall_floor: 0.45, pool_floor: 0.7, pool_wall: 0.45, lift_wall: 0.6,
  floor_classroom: 0.3, paving: 0.1, gallery_wall: 0.1, cell_wall: 0.15, hosp_wall: 0.2, mall_wall: 0.25, wall_hall: 0.15,
};
// relief strength per texture (sobel scale)
export const RELIEF = { wall_classroom: 0.9, wall_hall: 1.1, hosp_wall: 1.0, mall_wall: 1.0, gallery_wall: 0.8, bk_carpet: 1.2, asphalt: 1.5, forest_ground: 1.5, ceiling_tile: 1.4, paving: 2.5, cell_wall: 3.0, floor_classroom: 2.0 };

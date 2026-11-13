// Entity-only shading layered on top of bake.js's uniform-baked Lambert.
// Level light reaches residents as one omni "bake" value, which flattens
// them into silhouettes. This adds, for entity materials only:
//  - form shading: the baked light is given an overhead direction (lit from
//    the ceiling fixtures), so heads, shoulders and ribs read as volumes;
//  - a subtle fresnel rim that separates the shape from dark backgrounds;
//  - a camera-aligned sheen (the flashlight sits at the camera) for wet and
//    glossy parts: gums, teeth, eyes, raincoat, steel;
//  - a warm scattering tint at the terminator for skin and flesh.
// Emissive (Emit*) materials are left alone; they already glow. bake.js is
// not modified: its onBeforeCompile runs first and we patch after it.
import * as THREE from 'three';

// rim, sheen, sheen exponent, scatter, top-light shaping, soft alpha edge
const PRESETS = {
  skin: [0.2, 0.18, 14, 0.35, 0.8, 0],
  wet: [0.24, 0.9, 42, 0.25, 0.7, 0],
  gloss: [0.2, 0.45, 26, 0, 0.75, 0],      // raincoat, mask, leather shoes, plaster
  metal: [0.2, 0.7, 30, 0, 0.6, 0],
  cloth: [0.14, 0.03, 6, 0, 0.85, 0],
  paper: [0.12, 0.02, 6, 0.12, 0.85, 0],
  dark: [0.1, 0.25, 20, 0, 0.6, 0],         // holes, sockets, throats
  smoke: [0, 0, 8, 0, 0, 0.75],
  smokeCore: [0.03, 0, 8, 0, 0.25, 0.35],
};
// surface detail: blotchy mottling, fine pores / weave, vein-blue and flush-red tint
const DETAIL = {
  skin: [0.3, 0.16, 0.5], wet: [0.16, 0.08, 0.35], gloss: [0.12, 0.06, 0], metal: [0.14, 0.1, 0],
  cloth: [0.2, 0.18, 0], paper: [0.16, 0.1, 0], dark: [0.1, 0.05, 0], smoke: [0, 0, 0], smokeCore: [0, 0, 0],
};

// First matching rule wins. Generic on purpose: any resident model (including
// ones added later) is classified from its glTF material names. A model can
// force a preset by putting the preset name in the material name (e.g.
// "ThingWet", "ArmourMetal", "CoatCloth", "HideSkin", "VeilSmoke").
const RULES = [
  [/^Emit/, null],
  [/Smoke|Mist|Fog|Veil|Ghost/, 'smoke'],
  [/^Shade/, 'smokeCore'],
  [/Hole|Socket|Inside|Throat|Pupil$|EyeHole|MouthHole|Void|Cavity|Dark$/, 'dark'],
  [/Wet|Tear|Ball|Iris|Cornea|Gum|Mouth|Lip|Tongue|Teeth|Tooth|Fang|Raw|Slime|Mucus|Saliva|Blood|Gore|Organ|Gut|Vein|Tendril|Nail|Claw|Talon/, 'wet'],
  [/Metal|Steel|Iron|Chrome|Brass|Gold|Silver|Whistle|Horn|Button|Buckle|Chain|Wire|Blade|Ruler(?!Wood)|Badge/, 'metal'],
  [/Gloss|Raincoat|Vinyl|Rubber|Plastic|Toggle|Mask|Porcelain|Ceramic|Plaster|Bone|Skull|Chitin|Shell|Shoe|Sneaker|Sole|Lens|Leather/, 'gloss'],
  [/Paper|Bag|Card|Ink|Chalk|Smear|Crack|Fold|Dust/, 'paper'],
  [/Cloth|Fabric|Shirt|Coat|Suit|Pants|Skirt|Dress|Sock|Hair|Rag|Cardigan|Uniform|Knit|Wool/, 'cloth'],
  [/Skin|Flesh|Flush|Hide|Lid|Pale|Body|Muscle|Gaper|Cent|Eye/, 'skin'],
];

export function presetFor(m) {
  const name = m.name || '';
  for (const [re, p] of RULES) if (re.test(name)) return p;
  // unnamed / unknown: warm, light, reddish surfaces are treated as skin
  const c = m.color;
  if (c && c.r > c.g * 1.12 && c.r > c.b * 1.15 && c.r > 0.12) return 'skin';
  return 'cloth';
}

const COOL = new THREE.Color(0.55, 0.62, 0.74);
const NOISE3 = `
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

// per-vertex path: merged resident parts carry attribute lookId = index here
const KINDS = Object.keys(PRESETS);
export const lookIndex = (m) => Math.max(0, KINDS.indexOf(presetFor(m) || 'cloth'));
const LA = KINDS.map((k) => new THREE.Vector4(...PRESETS[k].slice(0, 4)));
const LB = KINDS.map((k) => new THREE.Vector2(PRESETS[k][4], PRESETS[k][5]));
const LC = KINDS.map((k) => new THREE.Vector3(...DETAIL[k]));

const FRAG_DETAIL = `#include <map_fragment>
        if (vL3.x + vL3.y > 0.0) {
          float near = smoothstep(7.0, 1.2, length(vViewPosition));
          float mot = vn3(vOP * 9.0) * 0.6 + vn3(vOP * 23.0) * 0.4;           // blotches
          float pore = vn3(vOP * 95.0) * 0.5 + vn3(vOP * 210.0) * 0.5;       // pores / weave
          diffuseColor.rgb *= 1.0 + (mot - 0.5) * vL3.x * 1.6 + (pore - 0.5) * vL3.y * 1.4 * near;
          // living skin: blue under the thin parts, red flush in patches
          float veinT = smoothstep(0.62, 0.8, vn3(vOP * 14.0 + 3.1));
          float flush = smoothstep(0.5, 0.85, vn3(vOP * 5.0 + 7.7));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.85, 1.12), veinT * vL3.z * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 0.86, 0.84), flush * vL3.z * 0.7);
        }`;
const FRAG_LIGHT = `{
          vec3 eN = normalize(normal);
          vec3 eV = normalize(vViewPosition);
          float ndv = clamp(dot(eN, eV), 0.0, 1.0);
          vec3 eW = normalize((vec4(eN, 0.0) * viewMatrix).xyz);
          float amb = (vBake.x + vBake.y * uFlicker) * uPower;
          // vertex colour = albedo x baked AO once merged; dark creases still dull the sheen
          float ao = 1.0;
          #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
            ao = clamp(max(vColor.r, max(vColor.g, vColor.b)) * 2.2, 0.35, 1.0);
          #endif
          // overhead direction for the omni baked light
          float top = 0.5 + 0.5 * smoothstep(-0.75, 0.95, eW.y);
          reflectedLight.indirectDiffuse *= mix(1.0, top, vL2.x);
          // direct light (flashlight) reaching this point, albedo removed
          vec3 alb = max(diffuseColor.rgb, vec3(0.03));
          float dl = clamp(dot(reflectedLight.directDiffuse / alb, vec3(0.3333)), 0.0, 4.0);
          // sheen: the flashlight is at the eye, so N.H ~ N.V
          float sp = pow(ndv, vL1.z) * vL1.y * (dl * 0.75 + amb * 0.22) * ao * ao;
          // fresnel rim keeps the outline readable against dark corridors
          float fr = pow(1.0 - ndv, 3.0);
          vec3 rim = vRim * fr * vL1.x * (0.045 + amb * 0.32 + dl * 0.28) * ao;
          // warm scattering band at the terminator (skin / flesh)
          float band = ndv * (1.0 - ndv) * 4.0;
          vec3 sss = vSSS * diffuseColor.rgb * vL1.w * band * (dl * 0.45 + amb * 0.3);
          totalEmissiveRadiance += vec3(sp) * vec3(1.0, 0.97, 0.9) + rim + sss;
          // smoke: thin out toward the silhouette for a soft volumetric edge
          diffuseColor.a *= mix(1.0, smoothstep(0.05, 0.75, ndv), vL2.y);
        }
        #include <aomap_fragment>`;
const VARY = '\nvarying vec4 vL1;\nvarying vec2 vL2;\nvarying vec3 vL3;\nvarying vec3 vRim;\nvarying vec3 vSSS;\nvarying vec3 vOP;';

export function applyEntityLook(obj) {
  const mats = obj.userData.bakeMats || [];
  for (const m of mats) {
    if (m.userData.entityLook) continue;
    const perVertex = /^MergedVCLook/.test(m.name || '');
    const kind = perVertex ? 'vertex' : presetFor(m);
    if (!kind || m.userData.emissive) continue;
    m.userData.entityLook = kind;
    let uni, vsDecl, vsBody;
    if (perVertex) {
      uni = { uLA: { value: LA }, uLB: { value: LB }, uLC: { value: LC } };
      const N = KINDS.length;
      vsDecl = `\nattribute float lookId;\nuniform vec4 uLA[${N}];\nuniform vec2 uLB[${N}];\nuniform vec3 uLC[${N}];`;
      vsBody = `{ int li = int(lookId + 0.5); vL1 = uLA[li]; vL2 = uLB[li]; vL3 = uLC[li];
        vec3 vc = vec3(1.0);
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
          vc = color.rgb;
        #endif
        vRim = mix(vec3(0.55, 0.62, 0.74), vc, 0.35); vSSS = mix(vec3(0.95, 0.32, 0.22), vc, 0.25); }`;
    } else {
      const p = PRESETS[kind];
      // rim takes a little of the surface colour so pale skin rims pale, cloth rims dim
      uni = {
        uLook: { value: new THREE.Vector4(p[0], p[1], p[2], p[3]) },
        uLook2: { value: new THREE.Vector2(p[4], p[5]) },
        uLook3: { value: new THREE.Vector3(...DETAIL[kind]) },
        uRimCol: { value: COOL.clone().lerp(m.color, 0.35) },
        uSSSCol: { value: new THREE.Color(0.95, 0.32, 0.22).lerp(m.color, 0.25) },
      };
      vsDecl = '\nuniform vec4 uLook;\nuniform vec2 uLook2;\nuniform vec3 uLook3;\nuniform vec3 uRimCol;\nuniform vec3 uSSSCol;';
      vsBody = 'vL1 = uLook; vL2 = uLook2; vL3 = uLook3; vRim = uRimCol; vSSS = uSSSCol;';
    }
    m.userData.look = uni;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prev.call(m, shader, renderer);
      Object.assign(shader.uniforms, uni);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>' + VARY + vsDecl)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP = position;\n ' + vsBody);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>' + VARY + NOISE3)
        .replace('#include <map_fragment>', FRAG_DETAIL)
        .replace('#include <aomap_fragment>', FRAG_LIGHT);
    };
    m.customProgramCacheKey = () => 'bake-uniform-entlook' + (perVertex ? '-v' : '');
    m.needsUpdate = true;
  }
  return obj;
}

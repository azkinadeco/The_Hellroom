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

function presetFor(m) {
  const name = m.name || '';
  for (const [re, p] of RULES) if (re.test(name)) return p;
  // unnamed / unknown: warm, light, reddish surfaces are treated as skin
  const c = m.color;
  if (c && c.r > c.g * 1.12 && c.r > c.b * 1.15 && c.r > 0.12) return 'skin';
  return 'cloth';
}

const COOL = new THREE.Color(0.55, 0.62, 0.74);

export function applyEntityLook(obj) {
  const mats = obj.userData.bakeMats || [];
  for (const m of mats) {
    if (m.userData.entityLook) continue;
    const kind = presetFor(m);
    if (!kind || m.userData.emissive) continue;
    const p = PRESETS[kind];
    m.userData.entityLook = kind;
    // rim takes a little of the surface colour so pale skin rims pale, cloth rims dim
    const rimCol = COOL.clone().lerp(m.color, 0.35);
    const sss = new THREE.Color(0.95, 0.32, 0.22).lerp(m.color, 0.25);
    const uLook = { value: new THREE.Vector4(p[0], p[1], p[2], p[3]) };
    const uLook2 = { value: new THREE.Vector2(p[4], p[5]) };
    const uRimCol = { value: rimCol };
    const uSSSCol = { value: sss };
    m.userData.look = { uLook, uLook2, uRimCol, uSSSCol };
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prev.call(m, shader, renderer);
      shader.uniforms.uLook = uLook;
      shader.uniforms.uLook2 = uLook2;
      shader.uniforms.uRimCol = uRimCol;
      shader.uniforms.uSSSCol = uSSSCol;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uLook;\nuniform vec2 uLook2;\nuniform vec3 uRimCol;\nuniform vec3 uSSSCol;')
        .replace('#include <aomap_fragment>', `{
          vec3 eN = normalize(normal);
          vec3 eV = normalize(vViewPosition);
          float ndv = clamp(dot(eN, eV), 0.0, 1.0);
          vec3 eW = normalize((vec4(eN, 0.0) * viewMatrix).xyz);
          float amb = (vBake.x + vBake.y * uFlicker) * uPower;
          float ao = 1.0;
          #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
            ao = vColor.r;
          #endif
          // overhead direction for the omni baked light
          float top = 0.5 + 0.5 * smoothstep(-0.75, 0.95, eW.y);
          reflectedLight.indirectDiffuse *= mix(1.0, top, uLook2.x);
          // direct light (flashlight) reaching this point, albedo removed
          vec3 alb = max(diffuseColor.rgb, vec3(0.03));
          float dl = clamp(dot(reflectedLight.directDiffuse / alb, vec3(0.3333)), 0.0, 4.0);
          // sheen: the flashlight is at the eye, so N.H ~ N.V
          float sp = pow(ndv, uLook.z) * uLook.y * (dl * 0.75 + amb * 0.22) * ao * ao;
          // fresnel rim keeps the outline readable against dark corridors
          float fr = pow(1.0 - ndv, 3.0);
          vec3 rim = uRimCol * fr * uLook.x * (0.045 + amb * 0.32 + dl * 0.28) * ao;
          // warm scattering band at the terminator (skin / flesh)
          float band = ndv * (1.0 - ndv) * 4.0;
          vec3 sss = uSSSCol * diffuseColor.rgb * uLook.w * band * (dl * 0.45 + amb * 0.3);
          totalEmissiveRadiance += vec3(sp) * vec3(1.0, 0.97, 0.9) + rim + sss;
          // smoke: thin out toward the silhouette for a soft volumetric edge
          diffuseColor.a *= mix(1.0, smoothstep(0.05, 0.75, ndv), uLook2.y);
        }
        #include <aomap_fragment>`);
    };
    m.customProgramCacheKey = () => 'bake-uniform-entlook';
    m.needsUpdate = true;
  }
  return obj;
}

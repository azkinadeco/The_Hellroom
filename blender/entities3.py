"""Batch 6 entities: one resident per story level.

  entity_pale       Si Pucat       eyeless pale crawler with a vertical toothed slit
  entity_masked     Guru Bertopeng tall teacher in a blank white mask, steel ruler
  entity_gaper      Si Penganga    skinless crouching ghoul with an unhinged jaw
  entity_shade      Bayang Kelas   smoke shadow with many glowing eye pairs
  entity_eyes       Mata Papan     eye cluster with tendrils that lives in walls
  entity_centipede  Kelabang       many bodies fused into one crawling column

Same conventions as entities.py: joint empties + <Joint>_geo meshes, the
creature faces Blender -Y, geometry is written in world space, clips are baked
per frame from pose functions (rotation deltas in degrees).
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
import hr_lib as L
from hr_lib import mat, look_matrix
from entities import (Rig, mirror_pos, add, keyed, clip, sym, torso, finger_set, _finish_entity, hand,
                      hanging_hand, eye, mlimb, muscle, bulk, arm_sculpt, leg_sculpt, ribs, teeth_arc, cloth_folds, displace, basis, ortho, lerp3)

T = 2 * math.pi


# ---------------------------------------------------------------- helpers --
def blob(mb, c, r, material, seed=0, amp=0.15, segs=14, rings=10, freq=3.0):
    """Lumpy ellipsoid (organic masses, smoke puffs)."""
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, T) for _ in range(6)]
    c = Vector(c)

    def rad(th, phi):
        return 1 + amp * (math.sin(freq * th + ph[0]) * math.sin(freq * phi + ph[1]) * 0.6 +
                          math.sin(2 * freq * th + ph[2]) * math.cos(freq * 0.7 * phi + ph[3]) * 0.4 +
                          math.sin(freq * 1.3 * phi + ph[4]) * 0.3)

    verts = [tuple(c + Vector((0, 0, r[2] * rad(0, 0))))]
    for i in range(1, rings):
        th = math.pi * i / rings
        for j in range(segs):
            phi = T * j / segs
            k = rad(th, phi)
            verts.append(tuple(c + Vector((r[0] * math.sin(th) * math.cos(phi) * k,
                                           r[1] * math.sin(th) * math.sin(phi) * k,
                                           r[2] * math.cos(th) * k))))
    verts.append(tuple(c + Vector((0, 0, -r[2] * rad(math.pi, 0)))))
    faces = []
    bot = len(verts) - 1
    for j in range(segs):
        faces.append((0, 1 + (j + 1) % segs, 1 + j))
    for i in range(rings - 2):
        a, b = 1 + i * segs, 1 + (i + 1) * segs
        for j in range(segs):
            jj = (j + 1) % segs
            faces.append((a + j, a + jj, b + jj, b + j))
    a = 1 + (rings - 2) * segs
    for j in range(segs):
        faces.append((a + j, a + (j + 1) % segs, bot))
    new = mb.raw(verts, faces, material, smooth=True)
    bmesh.ops.recalc_face_normals(mb.bm, faces=new)
    return new


def xf(M, p):
    return tuple(M @ Vector(p))


def spike(mb, base, tip, r, material, segs=5):
    mb.limb(base, tip, r, r * 0.12, material, segs=segs, caps=False)


def wiggle(p0, p1, n, amp, seed, normal=(0, 1, 0)):
    """Points from p0 to p1 with a sideways meander."""
    rnd = random.Random(seed)
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    side = d.cross(Vector(normal))
    if side.length < 1e-6:
        side = d.orthogonal()
    side.normalize()
    a, b = rnd.uniform(0, T), rnd.uniform(1.5, 3.0)
    return [p0 + d * (k / (n - 1)) + side * amp * math.sin(a + b * k / (n - 1) * math.pi) * (k / (n - 1))
            for k in range(n)]


def claw_fingers(mb, wrist, fwd, side_vec, n, length, r, material, tip_mat=None, spread=0.02, droop=0.03, seed=0):
    """Fingers fanning forward from a wrist (hands planted on the floor)."""
    rnd = random.Random(seed)
    w, f, sv = Vector(wrist), Vector(fwd).normalized(), Vector(side_vec).normalized()
    for i in range(n):
        o = (i - (n - 1) / 2)
        ln = length * (1 - abs(o) * 0.12) * rnd.uniform(0.92, 1.05)
        base = w + sv * o * spread
        dirv = (f + sv * o * 0.22).normalized()
        pts = [base, base + dirv * ln * 0.45 + Vector((0, 0, 0.012)), base + dirv * ln + Vector((0, 0, -droop))]
        mb.tube(pts, lambda t: r * (1 - 0.45 * t), material, segs=5)
        if tip_mat is not None:
            spike(mb, pts[-1], pts[-1] + dirv * 0.025 + Vector((0, 0, -0.012)), r * 0.55, tip_mat, segs=4)


# ============================================================== SI PUCAT ===
def entity_pale():
    skin = mat("PaleSkin", "#d9d0c8", rough=0.25)
    flush = mat("PaleFlush", "#b07476", rough=0.3)
    vein = mat("PaleVein", "#8b5a66", rough=0.3)
    mouth = mat("PaleMouth", "#3a050a", rough=0.4, double=True)
    gum = mat("PaleGum", "#9c2f3a", rough=0.2)
    lip = mat("PaleLip", "#b4545a", rough=0.2)
    teeth = mat("PaleTeeth", "#efe6d2", rough=0.2)
    nail = mat("PaleNail", "#3b2a28", rough=0.3)

    P = mirror_pos({
        "Hips": (0, 0.40, 0.80), "Spine": (0, 0.12, 0.84), "Chest": (0, -0.2, 0.86),
        "Neck": (0, -0.40, 0.87), "Head": (0, -0.55, 0.88),
        "ShoulderL": (0.16, -0.28, 0.82), "ElbowL": (0.26, -0.40, 0.46), "HandL": (0.24, -0.55, 0.05),
        "HipL": (0.13, 0.44, 0.76), "KneeL": (0.19, 0.22, 0.42), "FootL": (0.17, 0.52, 0.06),
    })
    rig = Rig()
    rig.skeleton(P)
    for i, (x, a) in enumerate(((0.05, 1), (-0.05, -1), (0.0, 0))):
        rig.joint(f"Tail{i}", (x, 0.56, 0.84), "Hips")
    UP = (0, 0, 1)

    # ---- haunches: bony pelvis, wing bones
    m = rig.mb("Hips")
    blob(m, (0, 0.44, 0.80), (0.15, 0.17, 0.12), skin, seed=1, amp=0.05, segs=18, rings=12)
    for s in (-1, 1):
        m.sphere((0.07, 0.11, 0.06), (s * 0.08, 0.47, 0.86), skin, rot=(8, 0, 0), segs=12, rings=8)   # pelvic wing
        m.tube([(s * 0.13, 0.36, 0.86), (s * 0.15, 0.45, 0.86), (s * 0.12, 0.56, 0.82)], 0.014, skin, segs=8)
    for k in range(4):
        m.sphere((0.016, 0.02, 0.014), (0, 0.38 + k * 0.05, 0.925 - k * 0.012), skin, segs=8, rings=5)

    # ---- long back: spine knobs, dorsal spikes, flank ribs
    m = rig.mb("Spine")
    mlimb(m, (0, 0.42, 0.8), (0, -0.16, 0.85), [(0, 0.11), (0.3, 0.1), (0.55, 0.115), (0.8, 0.13), (1, 0.13)],
          skin, segs=20, sx=1.0, sy=0.95, up=UP)
    m.sphere((0.08, 0.17, 0.05), (0, 0.15, 0.735), flush, segs=12, rings=8)                  # sunken belly
    for k in range(6):
        y = 0.24 - k * 0.07
        for s in (-1, 1):
            pts = [(s * 0.126 * math.sin(a), y + 0.02 * math.cos(a), 0.84 + 0.122 * math.cos(a)) for a in
                   [0.35 + 2.0 * i / 7 for i in range(8)]]
            m.tube(pts, lambda q: 0.012 * (0.6 + 0.4 * math.sin(q * math.pi)), skin, segs=6)
    for k in range(9):
        y = 0.36 - k * 0.065
        z = 0.95 + 0.006 * math.sin(k)
        m.sphere((0.02, 0.026, 0.018), (0, y, z - 0.012), skin, segs=8, rings=5)
        mlimb(m, (0, y + 0.01, z - 0.01), (0, y + 0.045, z + 0.045 + 0.012 * math.sin(k * 1.3)),
              [(0, 0.016), (0.5, 0.009), (1, 0.002)], flush, segs=7, caps=True)              # dorsal spike

    # ---- chest: deep keel, scapulae riding high
    m = rig.mb("Chest")
    blob(m, (0, -0.2, 0.85), (0.15, 0.2, 0.135), skin, seed=2, amp=0.04, segs=18, rings=12)
    for s in (-1, 1):
        m.sphere((0.07, 0.11, 0.03), (s * 0.095, -0.22, 0.975), skin, rot=(0, s * 24, 0), segs=12, rings=8)
        m.tube([(s * 0.04, -0.13, 0.99), (s * 0.12, -0.24, 0.99), (s * 0.15, -0.3, 0.93)], 0.012, skin, segs=6)
        for k in range(4):
            y = -0.08 - k * 0.07
            pts = [(s * 0.15 * math.sin(a), y, 0.85 + 0.135 * math.cos(a)) for a in [0.75 + 1.7 * i / 7 for i in range(8)]]
            m.tube(pts, lambda q: 0.012 * (0.6 + 0.4 * math.sin(q * math.pi)), skin, segs=6)
    m.sphere((0.06, 0.16, 0.05), (0, -0.2, 0.735), skin, segs=12, rings=8)                    # keel
    for k in range(4):
        y = -0.3 - k * 0.055
        mlimb(m, (0, y, 0.975), (0, y + 0.03, 1.045), [(0, 0.016), (0.5, 0.009), (1, 0.002)], flush, segs=7)

    # ---- neck: ringed, stretched, tendons
    m = rig.mb("Neck")
    mlimb(m, (0, -0.32, 0.9), (0, -0.64, 0.89), [(0, 0.08), (0.4, 0.058), (1, 0.052)], skin, segs=14, sy=1.1,
          up=UP)
    for k in range(4):
        y = -0.42 - k * 0.055
        m.lathe([(0.062 - k * 0.002, -0.009), (0.068 - k * 0.002, 0.0), (0.062 - k * 0.002, 0.009)], flush,
                M=Matrix.Translation((0, y, 0.894)) @ Matrix.Rotation(math.radians(90), 4, "X"), segs=14, close=False)
    for s in (-1, 1):
        m.tube([(s * 0.04, -0.34, 0.86), (s * 0.044, -0.5, 0.86), (s * 0.04, -0.63, 0.86)], 0.011, skin, segs=6)
    m.tube([(0, -0.34, 0.83), (0, -0.5, 0.84), (0, -0.62, 0.845)], 0.014, skin, segs=6)       # windpipe

    # ---- head: long smooth eyeless egg; the face is one vertical toothed slit
    m = rig.mb("Head")
    Mh = Matrix.Translation((0, -0.77, 0.9)) @ Matrix.Rotation(math.radians(14), 4, "X")
    hr = (0.13, 0.215, 0.158)
    m.sphere(hr, (0, 0, 0), skin, segs=24, rings=18, M=Mh)
    m.sphere((0.11, 0.16, 0.12), (0, 0.07, 0.03), skin, segs=18, rings=12, M=Mh)           # back of skull
    m.sphere((0.05, hr[1] * 1.002, 0.132), (0, 0, 0), mouth, segs=16, rings=16, M=Mh)

    def front_y(x, z):
        v = 1 - (x / hr[0]) ** 2 - (z / hr[2]) ** 2
        return -hr[1] * math.sqrt(max(v, 0.0))

    def wid(z):
        return 0.05 * math.sqrt(max(0.0, 1 - (z / 0.132) ** 2))

    for s in (-1, 1):
        lips, gums = [], []
        for i in range(17):
            z = -0.132 + 0.264 * i / 16
            x = s * (wid(z) + 0.005)
            lips.append(xf(Mh, (x, front_y(x, z) - 0.003, z)))
            gx = s * (wid(z) - 0.004)
            gums.append(xf(Mh, (gx, front_y(gx, z) + 0.004, z)))
        m.tube(lips, lambda t: 0.006 + 0.014 * math.sin(t * math.pi) ** 0.7, lip, segs=8)
        m.tube(gums, lambda t: 0.004 + 0.01 * math.sin(t * math.pi) ** 0.7, gum, segs=6)
        for i in range(14):
            z = -0.112 + 0.224 * i / 13 + s * 0.006
            x = s * (wid(z) - 0.002)
            ln = 0.028 + 0.016 * math.sin(i * 1.7) ** 2 + 0.01 * (1 - abs(z) / 0.13)
            tx = x - s * ln
            base = (x, front_y(x, z) + 0.002, z)
            tip = (tx, front_y(tx, z) * 1.02 - 0.006, z - 0.004 * s)
            m.limb(xf(Mh, base), xf(Mh, tip), 0.007, 0.0012, teeth, segs=6, sx=1.0, sy=0.7)
        for k in range(1):                                              # second, inner row
            for i in range(8):
                z = -0.09 + 0.18 * i / 7
                x = s * (wid(z) * 0.55)
                base = (x, front_y(x, z) + 0.03 + 0.015 * k, z)
                tip = (x - s * 0.02, front_y(x, z) + 0.01 + 0.015 * k, z + 0.004)
                m.limb(xf(Mh, base), xf(Mh, tip), 0.0055, 0.001, teeth, segs=5)
        # skull plates showing under taut skin
        pts = [xf(Mh, (s * 0.11 * math.sin(a), -0.215 * math.cos(a) * 0.35 + 0.05, 0.145 * math.cos(a) * 0.95))
               for a in [0.3 + i * 0.22 for i in range(8)]]
        m.tube(pts, 0.007, skin, segs=6)
        m.tube([xf(Mh, (s * 0.06, -0.17, 0.08)), xf(Mh, (s * 0.1, -0.12, 0.075)), xf(Mh, (s * 0.12, -0.04, 0.07))],
               0.0045, vein, segs=5)
    for k in range(5):                                                  # crest of small spikes
        y = 0.08 - k * 0.05
        mlimb(m, xf(Mh, (0, y, 0.15 - k * 0.004)), xf(Mh, (0, y + 0.025, 0.185 - k * 0.006)),
              [(0, 0.012), (1, 0.002)], flush, segs=6)

    # ---- limbs: long, sinewy, clawed
    for s, sx in (("L", 1), ("R", -1)):
        sh, el, ha = Vector(P["Shoulder" + s]), Vector(P["Elbow" + s]), Vector(P["Hand" + s])
        wr = ha + Vector((0, 0.02, 0.035))
        arm_sculpt(rig.mb("Shoulder" + s), rig.mb("Elbow" + s), sh, el, wr, sx, skin, scale=1.15, tendon=skin)
        m = rig.mb("Elbow" + s)
        m.tube([el + Vector((sx * 0.02, 0.02, 0)), (el + wr) / 2 + Vector((sx * 0.026, 0.0, 0)),
                wr + Vector((sx * 0.015, 0, 0.03))], 0.005, vein, segs=5)
        hand(rig.mb("Hand" + s), wr, (sx * 0.12, -1, -0.25), (0, 0, -1), (-sx, 0, 0), 0.17, skin, nail,
             curl=0.35, r=0.0085, splay=0.18, bony=1.5, claw=0.03, palm_len=0.08, seed=3 + sx, thumb_curl=0.4)
        hp, kn, ft = Vector(P["Hip" + s]), Vector(P["Knee" + s]), Vector(P["Foot" + s])
        an = ft + Vector((0, 0, 0.035))
        leg_sculpt(rig.mb("Hip" + s), rig.mb("Knee" + s), hp, kn, an, sx, skin, scale=1.15, kneecap=flush)
        m = rig.mb("Foot" + s)
        m.sphere((0.03, 0.04, 0.03), ft + Vector((0, 0.03, -0.015)), skin, segs=10, rings=6)
        hand(m, ft + Vector((0, 0.03, -0.035)), (0, -1, -0.08), (0, 0, -1), (-sx, 0, 0), 0.085, skin, nail,
             curl=0.4, r=0.009, palm_len=0.12, nfing=4, thumb=False, splay=0.16, bony=1.3, claw=0.025,
             palm_scale=(1.0, 1.8, 1.0), rel=[0.85, 1.0, 0.95, 0.8], seed=14 + sx)

    # ---- tails: two whip tendrils and a short stub (concept)
    for i, (x, a) in enumerate(((0.05, 1), (-0.05, -1), (0.0, 0))):
        m = rig.mb(f"Tail{i}")
        L0 = 1.0 if i < 2 else 0.45
        pts = []
        for k in range(14):
            q = k / 13
            pts.append((x + a * (0.18 * q + 0.08 * math.sin(q * 5)) * L0, 0.56 + 0.75 * q * L0,
                        0.84 + 0.18 * math.sin(q * 2.6) * L0 - 0.15 * q * q * L0 + (0.08 * q if i == 1 else 0)))
        m.tube(pts, lambda q: 0.024 * (1 - 0.85 * q) + 0.002, skin, segs=8)
        for k in range(2, 10, 2):
            m.sphere((0.008 * (1 - k / 14),) * 3, Vector(pts[k]) + Vector((0, 0, 0.016 * (1 - k / 14))), flush,
                     segs=6, rings=4)
    rig.build(auto_smooth=75)

    def idle(f):
        p = f / 58.0 * T
        tw = 1.0 if (f % 29) in (11, 12) else 0.0                         # occasional twitch
        return {
            "Hips": {"loc": (0, 0, 0.008 * math.sin(p))},
            "Spine": (1.5 * math.sin(p), 0, 0),
            "Chest": (-1.5 * math.sin(p), 0, 1.5 * math.sin(p * 0.5)),
            "Neck": (-4 + 3 * math.sin(p + 1), 0, 6 * math.sin(p * 0.5)),
            "Head": (4 * math.sin(p * 2) + tw * 9, 12 * math.sin(p * 0.5 + 0.4) + tw * 14, 16 * math.sin(p * 0.5)),
            "ShoulderL": (2 * math.sin(p), 0, 0), "ShoulderR": (-2 * math.sin(p), 0, 0),
            "Tail0": (6 * math.sin(p + 0.3), 0, 9 * math.sin(p)), "Tail1": (6 * math.sin(p + 1.9), 0, -9 * math.sin(p + 1)),
            "Tail2": (4 * math.sin(p * 2), 0, 5 * math.sin(p)),
        }

    def gait(f, n, amp, bound):
        p = f / n * T
        out = {"Hips": {"rot": (0, 3 * amp * math.sin(p), 4 * amp * math.sin(p)),
                        "loc": (0.01 * math.sin(p), 0, 0.02 * amp * math.sin(2 * p) ** 2)},
               "Spine": (6 * amp * math.sin(2 * p) * bound, 0, -3 * math.sin(p)),
               "Chest": (0, -4 * math.sin(p), 5 * math.sin(p)),
               "Neck": (-5 * math.sin(2 * p + 0.6), 0, -4 * math.sin(p)),
               "Head": (5 * math.sin(2 * p), 0, -6 * math.sin(p)),
               "Tail0": (8 * math.sin(2 * p), 0, 14 * math.sin(p)), "Tail1": (8 * math.sin(2 * p + 1), 0, 14 * math.sin(p + 0.8)),
               "Tail2": (5 * math.sin(2 * p), 0, 8 * math.sin(p))}
        for s, ph in (("L", 0.0), ("R", math.pi)):
            qa = p + ph
            ql = p + (ph if bound else ph + math.pi) + 0.8
            out["Shoulder" + s] = sym(s, (26 * amp * math.sin(qa), 0, 0))
            out["Elbow" + s] = (-18 * amp * max(0.0, math.cos(qa)), 0, 0)
            out["Hand" + s] = (-14 * amp * math.sin(qa) + 10 * amp * max(0.0, math.cos(qa)), 0, 0)
            out["Hip" + s] = (24 * amp * math.sin(ql), 0, 0)
            out["Knee" + s] = (-22 * amp * max(0.0, math.cos(ql)), 0, 0)
            out["Foot" + s] = (-12 * amp * math.sin(ql), 0, 0)
        return out

    def walk(f):
        return gait(f, 24, 1.0, False)

    def run(f):
        return gait(f, 13, 1.45, True)

    crouch = {"Hips": {"loc": (0, 0.1, -0.06)}, "Chest": (10, 0, 0), "Neck": (-6, 0, 0), "Head": (-8, 0, 0),
              "ShoulderL": (12, 0, 0), "ShoulderR": (12, 0, 0), "HipL": (-10, 0, 0), "HipR": (-10, 0, 0)}
    lunge = {"Hips": {"loc": (0, -0.5, 0.14)}, "Spine": (-8, 0, 0), "Chest": (-14, 0, 0), "Neck": (-22, 0, 0),
             "Head": (-18, 0, 0), "ShoulderL": (-32, 0, 10), "ShoulderR": (-32, 0, -10),
             "ElbowL": (-15, 0, 0), "ElbowR": (-15, 0, 0), "HipL": (35, 0, 0), "HipR": (35, 0, 0),
             "KneeL": (-25, 0, 0), "KneeR": (-25, 0, 0)}
    bite = add(lunge, {"Head": (16, 0, 8), "Neck": (6, 0, 0)})

    def attack(f):
        return keyed([(0, idle(0)), (6, crouch), (11, lunge), (15, bite), (19, lunge), (22, bite)], f)

    clips = [clip(rig, "Idle", 2.4, idle), clip(rig, "Walk", 1.0, walk), clip(rig, "Run", 0.55, run),
             clip(rig, "Attack", 0.95, attack)]
    return _finish_entity("entity_pale", rig, clips, [("Idle", 0), ("Walk", 6), ("Run", 4), ("Attack", 15)],
                          view=(1.2, -1.4, 0.55))


# ======================================================= GURU BERTOPENG ====
def entity_masked():
    shirt = mat("MaskShirt", "#4d4b35", rough=0.9, double=True)
    shirt_d = mat("MaskShirtDark", "#35341f", rough=0.9)
    pants = mat("MaskPants", "#232227", rough=0.85)
    skin = mat("MaskSkin", "#cbbfb1", rough=0.55)
    vein = mat("MaskVein", "#8e7a76", rough=0.6)
    face = mat("MaskWhite", "#e7e3d9", rough=0.35)
    hole = mat("MaskHole", "#040303", rough=1.0)
    hair = mat("MaskHair", "#17130f", rough=0.9)
    shoe = mat("MaskShoe", "#121110", rough=0.4)
    steel = mat("RulerSteel", "#a9aca9", rough=0.3, metal=0.75)
    ink = mat("RulerInk", "#2a2a2a", rough=0.5)

    P = mirror_pos({
        "Hips": (0, 0, 1.06), "Spine": (0, 0, 1.18), "Chest": (0, 0, 1.42),
        "Neck": (0, 0.01, 1.76), "Head": (0, 0.0, 1.86),
        "ShoulderL": (0.21, 0.0, 1.68), "ElbowL": (0.25, 0.02, 1.28), "HandL": (0.27, 0.0, 0.86),
        "HipL": (0.1, 0.0, 1.02), "KneeL": (0.105, 0.0, 0.56), "FootL": (0.105, 0.0, 0.08),
    })
    rig = Rig()
    rig.skeleton(P)

    m = rig.mb("Hips")
    torso(m, [(0.0, 0.95), (0.15, 0.96), (0.163, 1.05), (0.158, 1.14), (0.0, 1.15)], pants, sy=0.72)
    m.lathe([(0.19, 0.88), (0.182, 0.98), (0.172, 1.12)], shirt, segs=18, sy=0.74, close=False)   # untucked hem
    m = rig.mb("Spine")
    torso(m, [(0.0, 1.1), (0.172, 1.1), (0.166, 1.3), (0.0, 1.32)], shirt, sy=0.68)
    m = rig.mb("Chest")
    torso(m, [(0.0, 1.26), (0.168, 1.26), (0.182, 1.44), (0.198, 1.6), (0.15, 1.71), (0.06, 1.75), (0.0, 1.755)],
          shirt, sy=0.6, segs=20)
    for s in (-1, 1):
        m.sphere((0.07, 0.065, 0.06), (s * 0.19, 0.0, 1.655), shirt, segs=12, rings=8)
        m.box((0.075, 0.012, 0.11), (s * 0.05, -0.115, 1.68), shirt_d, rot=(12, s * -22, 0), bevel=0.004)  # collar
    m.box((0.08, 0.01, 0.08), (0.09, -0.118, 1.5), shirt_d, bevel=0.004)                                # pocket
    for z in (1.6, 1.48, 1.36, 1.24):
        m.sphere((0.008, 0.005, 0.008), (0.0, -0.118 + (1.6 - z) * 0.02, z), shirt_d, segs=6, rings=4)
    m.ribbon([(0.0, -0.119, 1.66), (0.0, -0.125, 1.25), (0.0, -0.128, 1.12)], 0.012, shirt_d)
    m = rig.mb("Neck")
    m.limb((0, 0.01, 1.7), (0, 0.0, 1.86), 0.045, 0.04, skin, segs=10)
    m.tube([(0.025, -0.03, 1.72), (0.02, -0.035, 1.8)], 0.006, vein, segs=4)

    m = rig.mb("Head")
    m.sphere((0.1, 0.11, 0.115), (0, 0.025, 1.955), hair, segs=16, rings=10)
    m.sphere((0.094, 0.062, 0.128), (0, -0.04, 1.945), face, segs=18, rings=12)         # blank mask
    for s in (-1, 1):
        m.sphere((0.021, 0.012, 0.013), (s * 0.036, -0.094, 1.975), hole, rot=(0, s * -8, 0), segs=10, rings=6)
        m.sphere((0.02, 0.02, 0.01), (s * 0.036, -0.088, 1.995), face, segs=8, rings=5)   # brow bump
        for k in range(4):                                                               # hair strands
            x0 = s * (0.06 + k * 0.012)
            m.tube([(x0, 0.0, 2.04), (x0 * 1.25, 0.02, 1.95), (x0 * 1.2, 0.0 + k * 0.01, 1.84 - k * 0.02)],
                   lambda t: 0.012 * (1 - 0.7 * t), hair, segs=4)
    m.sphere((0.012, 0.012, 0.032), (0, -0.103, 1.935), face, segs=8, rings=6)          # nose ridge
    m.box((0.034, 0.006, 0.004), (0, -0.098, 1.88), hole)                              # mouth slit
    m.cyl(0.004, 0.2, (0, 0.0, 1.955), hair, rot=(0, 90, 0), segs=6)                    # strap

    for s, sx in (("L", 1), ("R", -1)):
        sh, el, ha = Vector(P["Shoulder" + s]), Vector(P["Elbow" + s]), Vector(P["Hand" + s])
        rig.mb("Shoulder" + s).limb(sh, el, 0.058, 0.048, shirt, segs=10)
        m = rig.mb("Elbow" + s)
        m.lathe([(0.05, 0.0), (0.055, 0.03), (0.05, 0.06)], shirt_d, M=look_matrix(el + Vector((0, 0, 0.03)), el),
                segs=10, close=False)                                                   # rolled sleeve
        m.limb(el, ha + Vector((0, 0, 0.04)), 0.033, 0.026, skin, segs=10)
        m.tube([el + Vector((sx * 0.01, -0.025, -0.05)), (el + ha) / 2 + Vector((sx * 0.012, -0.024, 0)),
                ha + Vector((0, -0.02, 0.08))], 0.005, vein, segs=4)
        finger_set(rig.mb("Hand" + s), ha + Vector((0, 0, 0.02)), s, 0.15, skin, spread=0.009, r=0.0065,
                   curl=0.3 if s == "L" else 0.55, palm=(0.016, 0.04, 0.055))
        hp, kn, ft = Vector(P["Hip" + s]), Vector(P["Knee" + s]), Vector(P["Foot" + s])
        rig.mb("Hip" + s).limb(hp, kn, 0.078, 0.06, pants, segs=10)
        m = rig.mb("Knee" + s)
        m.limb(kn, ft + Vector((0, 0, 0.06)), 0.058, 0.05, pants, segs=10)
        m = rig.mb("Foot" + s)
        m.box((0.09, 0.27, 0.075), (ft.x, -0.07, 0.04), shoe, bevel=0.03, segs=2)
    # steel ruler gripped in the right hand, pointing down and forward
    m = rig.mb("HandR")
    p0 = Vector((-0.285, 0.06, 0.8))
    p1 = Vector((-0.25, -0.62, 0.42))
    R = look_matrix(p0, p1)
    ln = (p1 - p0).length
    m.box((0.036, 0.004, ln), (0, 0, ln / 2), steel, M=R)
    for k in range(1, 20):
        z = ln * k / 20
        w = 0.014 if k % 5 else 0.022
        m.box((w, 0.0045, 0.003), (0.018 - w / 2, 0, z), ink, M=R)
    rig.build()

    base = {"Spine": (5, 0, 0), "Chest": (6, 0, 0), "Neck": (10, 0, 0), "Head": (-4, 8, 0),
            "ShoulderL": (2, 0, 4), "ShoulderR": (-8, 0, -5), "ElbowL": (-6, 0, 0), "ElbowR": (-14, 0, 0),
            "HandL": (0, 0, 0), "HandR": (6, 0, 0)}

    def idle(f):
        p = f / 58.0 * T
        return add(base, {"Hips": {"loc": (0, 0, 0.005 * math.sin(2 * p))},
                          "Chest": (1.5 * math.sin(2 * p), 0, 2 * math.sin(p)),
                          "Head": (3 * math.sin(p), 18 * math.sin(p * 0.5) ** 3, 8 * math.sin(p + 0.4)),
                          "ShoulderR": (3 * math.sin(p), 0, 0), "HandR": (5 * math.sin(p * 2), 0, 0)})

    def walk(f, n=30, amp=1.0):
        p = f / n * T
        out = {"Hips": {"rot": (0, 2 * math.sin(p), 5 * math.sin(p)),
                        "loc": (0.012 * math.sin(p), 0, -0.02 * math.sin(p) ** 2)},
               "Chest": (0, -2 * math.sin(p), -4 * math.sin(p)),
               "Head": (2 * math.sin(2 * p), 8, 3 * math.sin(p))}
        for s, ph in (("L", 0.0), ("R", math.pi)):
            q = p + ph
            out["Hip" + s] = (-24 * amp * math.sin(q), 0, 0)
            out["Knee" + s] = (6 + 44 * amp * max(0.0, math.cos(q)) ** 1.5, 0, 0)
            out["Foot" + s] = (10 * math.sin(q), 0, 0)
            sw = 16 * amp * math.sin(q) if s == "L" else 6 * amp * math.sin(q)
            out["Shoulder" + s] = sym(s, (sw, 0, 2))
        return add(base, out)

    def run(f):
        p = f / 17.0 * T
        out = add(walk(f * 30 / 17.0, 30, 1.5),
                  {"Spine": (14, 0, 0), "Chest": (8, 0, 0), "Neck": (-6, 0, 0), "Head": (-12, 0, 0),
                   "Hips": {"loc": (0, 0, -0.05 - 0.03 * math.sin(2 * p))},
                   "ShoulderR": (-30, 0, -10), "ElbowR": (-30, 0, 0)})
        return out

    raise_ = add(base, {"ShoulderR": (-175, 0, -15), "ElbowR": (-50, 0, 0), "HandR": (-20, 0, 0),
                        "Chest": (-8, 0, -10), "Head": (-10, 0, 0), "ShoulderL": (-30, 0, 20)})
    strike = add(base, {"ShoulderR": (-55, 0, 8), "ElbowR": (-5, 0, 0), "HandR": (20, 0, 0),
                        "Chest": (18, 0, 8), "Spine": (10, 0, 0), "Head": (12, 0, 0), "ShoulderL": (-40, 0, 25),
                        "Hips": {"loc": (0, -0.25, -0.05)}})

    def attack(f):
        return keyed([(0, idle(0)), (9, raise_), (14, raise_), (18, strike), (24, strike), (30, idle(0))], f)

    tap_up = add(base, {"ShoulderR": (-60, 0, -25), "ElbowR": (-70, 0, 0), "HandR": (-30, 0, 0),
                        "ShoulderL": (-35, 0, -10), "ElbowL": (-60, 0, 0), "Head": (14, 0, 0)})
    tap_hit = add(tap_up, {"ElbowR": (-40, 0, 0), "HandR": (10, 0, 0)})

    def tap(f):
        return keyed([(0, idle(0)), (7, tap_up), (10, tap_hit), (15, tap_up), (18, tap_hit), (23, tap_up),
                      (29, idle(0))], f)

    clips = [clip(rig, "Idle", 2.4, idle), clip(rig, "Walk", 1.25, walk), clip(rig, "Run", 0.7, run),
             clip(rig, "Attack", 1.25, attack), clip(rig, "Tap", 1.2, tap)]
    return _finish_entity("entity_masked", rig, clips,
                          [("Idle", 0), ("Walk", 8), ("Attack", 12), ("Tap", 10)], view=(0.9, -1.8, 0.35))


# ========================================================= SI PENGANGA ====
def entity_gaper():
    skin = mat("GaperSkin", "#bd9488", rough=0.32)
    flush = mat("GaperFlush", "#a3605a", rough=0.32)
    raw = mat("GaperRaw", "#7d2a2c", rough=0.25)
    gum = mat("GaperGum", "#a8343e", rough=0.2)
    lip = mat("GaperLip", "#8c2a31", rough=0.22)
    teeth = mat("GaperTeeth", "#e6dab8", rough=0.25)
    inside = mat("GaperInside", "#2a0507", rough=0.5, double=True)
    cheek = mat("GaperMouthWall", "#5a1015", rough=0.3, double=True)
    socket = mat("GaperSocket", "#1a0809", rough=1.0)
    nail = mat("GaperNail", "#3e2724", rough=0.35)
    glint = mat("EmitGaperGlint", "#ffe6c8", rough=0.5, emit="#ffd9b0", strength=1.6)

    P = mirror_pos({
        "Hips": (0, 0.06, 0.8), "Spine": (0, 0.02, 0.94), "Chest": (0, -0.08, 1.16),
        "Neck": (0, -0.2, 1.38), "Head": (0, -0.27, 1.5),
        "ShoulderL": (0.205, -0.12, 1.31), "ElbowL": (0.31, -0.2, 0.9), "HandL": (0.29, -0.3, 0.4),
        "HipL": (0.11, 0.06, 0.76), "KneeL": (0.23, -0.3, 0.56), "FootL": (0.19, 0.04, 0.09),
    })
    rig = Rig()
    rig.skeleton(P)
    rig.joint("Tail", (0, 0.15, 0.8), "Hips")
    FWD = (0, -1, 0)

    # ---- pelvis: bony hips, sunken buttocks, iliac crests
    m = rig.mb("Hips")
    blob(m, (0, 0.07, 0.8), (0.135, 0.105, 0.1), skin, seed=11, amp=0.05, segs=16, rings=10)
    for s in (-1, 1):
        m.sphere((0.07, 0.065, 0.075), (s * 0.06, 0.13, 0.77), skin, segs=12, rings=8)
        m.tube([(s * 0.135, 0.06, 0.86), (s * 0.12, -0.02, 0.85), (s * 0.075, -0.07, 0.8), (s * 0.03, -0.075, 0.74)],
               lambda q: 0.016 * (1 - 0.4 * q), skin, segs=6)                             # iliac crest
        m.tube([(s * 0.12, -0.02, 0.84), (s * 0.07, -0.05, 0.72), (s * 0.02, -0.06, 0.7)], 0.006, flush, segs=4)
    m.sphere((0.05, 0.04, 0.045), (0, -0.05, 0.71), skin, segs=10, rings=6)

    # ---- abdomen: starved waist, abdominal grooves, lumbar knobs
    m = rig.mb("Spine")
    mlimb(m, (0, 0.05, 0.82), (0, -0.04, 1.1), muscle(0, 0.1, 1, 0.105, belly=-0.022, at=0.5), skin, segs=16,
          sx=1.25, sy=0.82, up=FWD)
    for s in (-1, 1):
        m.tube([(s * 0.03, -0.07, 0.86), (s * 0.034, -0.085, 0.96), (s * 0.03, -0.1, 1.06)], 0.012, skin, segs=6)
        for k in range(3):
            z = 0.89 + k * 0.06
            m.sphere((0.024, 0.012, 0.022), (s * 0.03, -0.083 - k * 0.006, z), skin, segs=8, rings=5)
    for k in range(5):
        m.sphere((0.016, 0.014, 0.014), (0, 0.105 - k * 0.012, 0.84 + k * 0.055), skin, segs=8, rings=5)

    # ---- ribcage: a starved barrel with every rib showing
    m = rig.mb("Chest")
    c0, c1 = Vector((0, -0.02, 1.02)), Vector((0, -0.15, 1.38))
    mlimb(m, c0, c1, [(0, 0.1), (0.2, 0.135), (0.45, 0.155), (0.7, 0.15), (0.88, 0.12), (1.0, 0.075)], skin,
          segs=22, sx=1.14, sy=0.8, up=FWD)
    sv, nv, dv = ortho(c1 - c0, FWD)
    Mc = basis(c0, sv, nv, dv)
    Lc = (c1 - c0).length
    for k in range(8):
        zt = Lc * (0.78 - k * 0.075)
        rr = [0.15, 0.155, 0.157, 0.155, 0.15, 0.143, 0.133, 0.12][k] + 0.006
        for s in (-1, 1):
            pts = []
            for i in range(9):
                q = i / 8
                a = 0.32 + 2.3 * q
                pts.append(tuple(Mc @ Vector((s * rr * 1.14 * math.sin(a), rr * 0.8 * math.cos(a), zt - 0.05 * (1 - q)))))
            m.tube(pts, lambda q: 0.0105 * (0.7 + 0.3 * math.sin(q * math.pi)), skin, segs=5)
    m.tube([tuple(Mc @ Vector((0, 0.128, Lc * 0.86))), tuple(Mc @ Vector((0, 0.13, Lc * 0.5))),
            tuple(Mc @ Vector((0, 0.11, Lc * 0.22)))], 0.014, skin, segs=6)                   # sternum
    for s in (-1, 1):
        m.tube([tuple(Mc @ Vector((s * 0.02, 0.1, Lc * 0.95))), tuple(Mc @ Vector((s * 0.1, 0.07, Lc * 0.97))),
                (s * 0.19, -0.12, 1.33)], 0.013, skin, segs=6)                                 # clavicle
        Ms = basis(Mc @ Vector((s * 0.08, -0.105, Lc * 0.72)), sv, nv, dv)
        m.sphere((0.065, 0.02, 0.085), (0, 0, 0), skin, segs=10, rings=6, M=Ms)             # scapula
        m.tube([tuple(Ms @ Vector((s * -0.05, -0.012, 0.06))), tuple(Ms @ Vector((s * 0.05, -0.016, 0.03)))],
               0.008, skin, segs=4)
        m.sphere((0.05, 0.022, 0.04), tuple(Mc @ Vector((s * 0.07, 0.115, Lc * 0.8))), skin, segs=10, rings=6)
    for k in range(7):
        m.sphere((0.014, 0.014, 0.012), tuple(Mc @ Vector((0, -0.127 + abs(k - 3) * 0.002, Lc * (0.12 + k * 0.13)))),
                 skin, segs=8, rings=5)                                                   # spine knobs
    m.sphere((0.06, 0.03, 0.12), tuple(Mc @ Vector((0.05, 0.11, Lc * 0.25))), raw, segs=10, rings=6)  # torn patch

    # ---- neck: tendons, windpipe, vertebrae
    m = rig.mb("Neck")
    n0, n1 = Vector((0, -0.13, 1.3)), Vector((0, -0.28, 1.56))
    mlimb(m, n0, n1, muscle(0, 0.05, 1, 0.046, belly=-0.006), skin, segs=12, sx=1.1, sy=0.9, up=FWD)
    for s in (-1, 1):
        m.tube([(s * 0.03, -0.19, 1.31), (s * 0.045, -0.24, 1.42), (s * 0.065, -0.27, 1.54)], 0.012, skin, segs=6)
    m.sphere((0.016, 0.018, 0.022), (0, -0.215, 1.4), skin, segs=8, rings=5)                # adam's apple
    for k in range(3):
        m.sphere((0.012, 0.012, 0.012), (0, -0.115 - k * 0.04, 1.36 + k * 0.06), skin, segs=6, rings=4)

    # ---- head: bald bony skull with a lipless, unhinged grin
    m = rig.mb("Head")
    hc = Vector((0, -0.31, 1.665))
    blob(m, hc + Vector((0, 0.02, 0.0)), (0.105, 0.128, 0.122), skin, seed=13, amp=0.025, segs=22, rings=16)
    m.sphere((0.098, 0.1, 0.095), hc + Vector((0, 0.05, 0.035)), skin, segs=16, rings=10)    # vault
    m.tube([hc + Vector((0.1 * math.sin(a), 0.02 - 0.128 * math.cos(a), 0.008 - 0.012 * abs(math.sin(a)) +
                         0.006 * math.cos(3 * a))) for a in [math.radians(-70 + 140 * k / 10) for k in range(11)]],
           lambda q: 0.006 + 0.012 * math.sin(q * math.pi) ** 0.6, skin, segs=8)              # brow ridge
    for s in (-1, 1):
        sc = hc + Vector((s * 0.043, -0.1, -0.03))
        m.sphere((0.036, 0.014, 0.033), sc + Vector((0, -0.006, 0)), socket, segs=14, rings=8)  # eye socket
        m.sphere((0.0035, 0.002, 0.0035), sc + Vector((s * 0.006, -0.025, 0.002)), glint, segs=6, rings=4)
        m.tube([hc + Vector((s * 0.055, -0.1, -0.072)), hc + Vector((s * 0.088, -0.06, -0.068)),
                hc + Vector((s * 0.1, -0.005, -0.045))], 0.014, skin, segs=6)                 # cheekbone
    m.sphere((0.016, 0.01, 0.022), hc + Vector((0, -0.125, -0.075)), socket, segs=8, rings=5)  # nasal cavity
    blob(m, hc + Vector((0, -0.065, -0.1)), (0.08, 0.065, 0.05), skin, seed=15, amp=0.04, segs=14, rings=8)  # maxilla

    ucen, lcen = Vector((0, -0.335, 1.548)), Vector((0, -0.365, 1.215))
    up, lo = [], []
    for i in range(15):
        a = math.radians(-78 + 156 * i / 14)
        up.append(ucen + Vector((0.074 * math.sin(a), -0.088 * math.cos(a), 0.012 * (1 - math.cos(a)))))
        lo.append(lcen + Vector((0.082 * math.sin(a), -0.1 * math.cos(a), 0.05 * (1 - math.cos(a)))))
    m.tube(up, 0.02, gum, segs=8)
    m.tube([p + Vector((0, -0.012, 0.012)) for p in up[1:-1]], 0.009, lip, segs=6)
    for i, p in enumerate(up[1:-1]):
        o = (p - ucen)
        o.z = 0
        front = 1 - abs(i - 6) / 6
        ln = 0.04 + 0.03 * front + (0.012 if i in (2, 10) else 0)
        tip = p + Vector((o.x * 0.12, o.y * 0.12, -ln))
        m.limb(p + Vector((0, 0, -0.004)), tip, 0.0115, 0.006, teeth, segs=6, sx=1.0, sy=0.6)
    m.tube(lo, 0.021, gum, segs=8)
    m.tube([p + Vector((0, -0.014, -0.012)) for p in lo[1:-1]], 0.009, lip, segs=6)
    for i, p in enumerate(lo[1:-1]):
        o = (p - lcen)
        o.z = 0
        front = 1 - abs(i - 6) / 6
        ln = 0.035 + 0.022 * front
        m.limb(p + Vector((0, 0, 0.006)), p + Vector((o.x * 0.1, o.y * 0.1, ln)), 0.011, 0.005, teeth, segs=6,
               sx=1.0, sy=0.6)
    # mandible: chin, jaw angles and the long ramus back up to the hinge
    blob(m, lcen + Vector((0, -0.075, -0.045)), (0.07, 0.05, 0.045), skin, seed=16, amp=0.05, segs=12, rings=8)
    for s in (-1, 1):
        m.tube([lo[0 if s < 0 else -1] + Vector((s * 0.008, 0.01, -0.02)), lcen + Vector((s * 0.088, 0.04, 0.03)),
                hc + Vector((s * 0.1, 0.015, -0.2)), hc + Vector((s * 0.1, 0.03, -0.09))],
               lambda q: 0.02 * (1 - 0.35 * q), skin, segs=7)
        m.tube([lo[2 if s < 0 else -3] + Vector((s * 0.02, 0, -0.03)), lcen + Vector((s * 0.09, -0.02, -0.02)),
                lcen + Vector((s * 0.09, 0.03, 0.02))], 0.012, flush, segs=5)
        # mouth wall: stretched raw cheek between the jaws
        ia, ib = (1, 4) if s < 0 else (11, 14)
        verts, faces = [], []
        for j, i in enumerate(range(ia, ib)):
            for f in range(6):
                q = f / 5
                pnt = up[i].lerp(lo[i], q) + Vector((s * 0.016 * math.sin(q * math.pi), 0, 0))
                verts.append(tuple(pnt))
        for j in range(ib - ia - 1):
            for f in range(5):
                a = j * 6 + f
                faces.append((a, a + 1, a + 7, a + 6))
        m.raw(verts, faces, cheek, smooth=True)
        for k in range(3):                                              # skin strands still holding on
            i = (2, 3, 1)[k] if s < 0 else (12, 11, 13)[k]
            q0, q1 = 0.1 + 0.25 * k, 0.55 + 0.15 * k
            m.tube([up[i].lerp(lo[i], q0) + Vector((s * 0.02, -0.004, 0)),
                    up[i].lerp(lo[i], (q0 + q1) / 2) + Vector((s * 0.03, -0.01, 0)),
                    up[i].lerp(lo[i], q1) + Vector((s * 0.02, -0.004, 0))], 0.0045, skin, segs=4)
    m.sphere((0.075, 0.075, 0.17), (0, -0.33, 1.38), inside, segs=14, rings=10)             # throat
    m.tube([Vector((0, -0.31, 1.3)), Vector((0, -0.38, 1.24)), Vector((0, -0.43, 1.235))],
           lambda q: 0.03 * (1 - 0.3 * q), gum, segs=8)                                     # tongue
    piv = Vector((0, -0.28, 1.5))
    for v in m.bm.verts:                                                # big skull, as in the concept
        v.co = piv + (v.co - piv) * 1.16

    # ---- arms: bony, knotted, hands to the knees
    for s, sx in (("L", 1), ("R", -1)):
        sh, el, ha = Vector(P["Shoulder" + s]), Vector(P["Elbow" + s]), Vector(P["Hand" + s])
        wr = ha + Vector((0, 0.0, 0.02))
        arm_sculpt(rig.mb("Shoulder" + s), rig.mb("Elbow" + s), sh, el, wr, sx, skin, scale=1.0, tendon=skin)
        rig.mb("Elbow" + s).sphere((0.016, 0.016, 0.016), wr + Vector((sx * 0.012, 0.008, 0.005)), skin, segs=6, rings=4)
        hand(rig.mb("Hand" + s), wr, (0.0, -0.18, -1), (-sx, 0.2, 0), (0, -1, 0), 0.135, skin, nail,
             curl=0.55, r=0.0072, spread=1.0, splay=0.16, bony=1.6, claw=0.02, seed=3 + sx)
        # ---- legs: thin, deep-bent, long splayed toes
        hp, kn, ft = Vector(P["Hip" + s]), Vector(P["Knee" + s]), Vector(P["Foot" + s])
        leg_sculpt(rig.mb("Hip" + s), rig.mb("Knee" + s), hp, kn, ft + Vector((0, 0, 0.03)), sx, skin, scale=1.0,
                   kneecap=flush)
        m = rig.mb("Foot" + s)
        m.sphere((0.03, 0.035, 0.03), ft + Vector((0, 0.025, -0.03)), skin, segs=10, rings=6)    # heel
        hand(m, ft + Vector((0, 0.03, -0.055)), (0, -1, -0.05), (0, 0, -1), (-sx, 0, 0), 0.07, skin, nail,
             curl=0.5, r=0.0085, palm_len=0.13, nfing=5, thumb=False, splay=0.12, bony=1.2,
             palm_scale=(1.0, 1.9, 1.0), rel=[1.0, 0.92, 0.85, 0.78, 0.68], seed=14 + sx)

    # ---- tail: long, thin, curling round to the front
    m = rig.mb("Tail")
    tp = [(0, 0.15, 0.82), (0.02, 0.3, 0.75), (0.07, 0.43, 0.58), (0.15, 0.46, 0.38), (0.27, 0.38, 0.22),
          (0.37, 0.2, 0.15), (0.42, 0.0, 0.18), (0.4, -0.15, 0.27), (0.33, -0.22, 0.35), (0.27, -0.2, 0.39)]
    m.tube(tp, lambda q: 0.03 * (1 - 0.86 * q) + 0.002, skin, segs=8)
    for k in range(1, 8):
        p0 = Vector(tp[k])
        m.sphere((0.012 * (1 - k / 9),) * 3, p0 + Vector((0, 0, 0.022 * (1 - k / 9))), flush, segs=6, rings=4)
    rig.build(auto_smooth=75)

    def idle(f):
        p = f / 48.0 * T
        tw = 1.0 if (f % 24) in (5, 6, 17) else 0.0
        return {"Hips": {"loc": (0, 0, 0.012 * math.sin(2 * p))},
                "Chest": (3 * math.sin(2 * p), 0, 3 * math.sin(p)),
                "Neck": (2 * math.sin(p), 0, 0),
                "Head": (4 * math.sin(2 * p) - tw * 8, 10 * math.sin(p) + tw * 16, 6 * math.sin(p * 0.5)),
                "ShoulderL": (4 * math.sin(p), 0, 0), "ShoulderR": (-4 * math.sin(p), 0, 0),
                "HandL": (6 * math.sin(p * 2), 0, 0),
                "Tail": (6 * math.sin(p + 0.5), 0, 10 * math.sin(p))}

    poses = {
        "Pose1": {"ShoulderR": (-80, 0, -15), "ElbowR": (-10, 0, 0), "Head": (6, -22, 10), "Chest": (8, 0, -12),
                  "Hips": {"loc": (0, -0.08, 0)}},
        "Pose2": {"Hips": {"loc": (0, 0.0, -0.16)}, "Spine": (18, 0, 0), "Chest": (16, 0, 0), "Neck": (-14, 0, 0),
                  "Head": (-20, 0, 0), "KneeL": (20, 0, 0), "KneeR": (20, 0, 0), "HipL": (-20, 0, 0), "HipR": (-20, 0, 0),
                  "ShoulderL": (-30, 0, 20), "ShoulderR": (-30, 0, -20)},
        "Pose3": {"ShoulderL": (-30, 0, 70), "ShoulderR": (-30, 0, -70), "ElbowL": (-30, 0, 0), "ElbowR": (-30, 0, 0),
                  "Head": (-10, 28, 0), "Chest": (-10, 0, 0), "Spine": (-6, 0, 0), "Hips": {"loc": (0, 0, 0.12)},
                  "KneeL": (-12, 0, 0), "KneeR": (-12, 0, 0), "HipL": (10, 0, 0), "HipR": (10, 0, 0)},
        "Pose4": {"Hips": {"loc": (0, -0.22, -0.04)}, "HipL": (-40, 0, 0), "KneeL": (30, 0, 0), "HipR": (25, 0, 0),
                  "ShoulderL": (-60, 0, 10), "ShoulderR": (20, 0, -10), "Chest": (14, 0, 6), "Head": (-14, -10, -8)},
    }

    def pose_fn(name):
        def fn(f):
            j = 1.5 * math.sin(f * 1.7)
            return add(poses[name], {"Head": (j, 0, -j), "Tail": (4 * j, 0, 8 + 3 * j)})
        return fn

    lunge = {"Hips": {"loc": (0, -0.45, 0.12)}, "Spine": (8, 0, 0), "Chest": (12, 0, 0), "Neck": (-26, 0, 0),
             "Head": (-24, 0, 0), "ShoulderL": (-85, 0, 30), "ShoulderR": (-85, 0, -30),
             "ElbowL": (-10, 0, 0), "ElbowR": (-10, 0, 0), "HipL": (30, 0, 0), "HipR": (30, 0, 0),
             "KneeL": (-30, 0, 0), "KneeR": (-30, 0, 0)}
    grab = add(lunge, {"ShoulderL": (10, 0, -40), "ShoulderR": (10, 0, 40), "ElbowL": (-40, 0, 0),
                       "ElbowR": (-40, 0, 0), "Head": (14, 0, 0)})

    def attack(f):
        return keyed([(0, idle(0)), (5, poses["Pose2"]), (10, lunge), (14, grab), (20, grab)], f)

    clips = [clip(rig, "Idle", 2.0, idle)] + [clip(rig, n, 0.5, pose_fn(n)) for n in poses] + \
        [clip(rig, "Attack", 0.85, attack)]
    return _finish_entity("entity_gaper", rig, clips, [("Idle", 0), ("Pose1", 0), ("Pose3", 0), ("Attack", 14)],
                          view=(1.0, -1.7, 0.35))


# ========================================================= BAYANG KELAS ====
def entity_shade():
    core = mat("ShadeCore", "#020203", rough=1.0, alpha=0.93)
    soft = mat("ShadeSmoke", "#09090b", rough=1.0, alpha=0.42)
    eye = mat("EmitShadeEye", "#ffffff", rough=0.5, emit="#f4f6ff", strength=6.0)
    rig = Rig()
    rig.joint("Hips", (0, 0, 0.95))
    rig.joint("Chest", (0, 0, 1.4), "Hips")
    rig.joint("Head", (0, -0.03, 1.88), "Chest")
    rig.joint("ArmL", (0.36, 0.0, 1.45), "Chest")
    rig.joint("ArmR", (-0.36, 0.0, 1.45), "Chest")
    wisps = []
    for i in range(7):
        a = T * i / 7 + 0.3
        nm = f"Wisp{i}"
        rig.joint(nm, (0.3 * math.cos(a), 0.22 * math.sin(a), 0.62), "Hips")
        wisps.append((nm, a))

    halo = mat("EmitShadeHalo", "#c8d2ff", rough=1.0, emit="#aab8ff", strength=1.2, alpha=0.07)
    wisp = mat("ShadeSmokeThin", "#0c0c10", rough=1.0, alpha=0.22)

    def eyes2(m, c, r, sp, look=(0, -1, 0)):
        for e in (-1, 1):
            p = Vector(c) + Vector((e * sp / 2, 0, 0))
            m.sphere((r, r * 0.55, r * 0.75), p, eye, segs=10, rings=6)
            m.sphere((r * 2.2, r * 0.9, r * 1.8), p + Vector((0, 0.012, 0)), halo, segs=10, rings=6)

    m = rig.mb("Hips")
    blob(m, (0, 0.0, 0.92), (0.38, 0.28, 0.46), core, seed=21, amp=0.22, segs=20, rings=14, freq=2.5)
    blob(m, (0, 0.06, 0.92), (0.56, 0.42, 0.62), soft, seed=22, amp=0.28, segs=18, rings=12, freq=2.0)
    blob(m, (0, 0.1, 0.8), (0.72, 0.55, 0.7), wisp, seed=122, amp=0.3, segs=16, rings=10, freq=2.2)
    m = rig.mb("Chest")
    blob(m, (0, 0.0, 1.48), (0.4, 0.27, 0.4), core, seed=23, amp=0.2, segs=20, rings=14, freq=2.5)
    blob(m, (0, 0.08, 1.5), (0.6, 0.38, 0.55), soft, seed=24, amp=0.28, segs=18, rings=12, freq=2.0)
    blob(m, (0, 0.12, 1.55), (0.78, 0.5, 0.66), wisp, seed=124, amp=0.32, segs=16, rings=10, freq=2.2)
    for s_ in (-1, 1):                                                      # hunched shoulders
        blob(m, (s_ * 0.3, 0.02, 1.68), (0.2, 0.18, 0.14), core, seed=125 + s_, amp=0.2, segs=14, rings=9)
    for s_ in (-1, 1):                                                        # small eye pairs on the chest
        for (x, z, sp, r) in ((0.17, 1.66, 0.05, 0.016), (0.24, 1.12, 0.045, 0.013), (0.06, 1.3, 0.04, 0.011)):
            eyes2(m, (s_ * x, -0.36 + abs(x) * 0.15, z), r, sp)
    m = rig.mb("Head")
    blob(m, (0, -0.02, 1.95), (0.24, 0.2, 0.25), core, seed=25, amp=0.12, segs=18, rings=12, freq=2.5)
    blob(m, (0, 0.08, 2.0), (0.34, 0.26, 0.34), soft, seed=26, amp=0.25, segs=16, rings=10, freq=2.0)
    eyes2(m, (0, -0.25, 1.96), 0.03, 0.14)
    eyes2(m, (0.06, -0.22, 2.08), 0.012, 0.035)
    for k in range(5):                                                        # rising smoke horns
        a = 0.5 + k * 0.5
        m.tube(wiggle((0.15 * math.cos(a) - 0.1, 0.05, 2.1), (0.32 * math.cos(a) - 0.15, 0.1, 2.45 + 0.05 * k), 8, 0.07,
                      k + 30), lambda t: 0.07 * (1 - 0.85 * t), core, segs=7)
        m.tube(wiggle((0.15 * math.cos(a) - 0.1, 0.1, 2.1), (0.4 * math.cos(a) - 0.2, 0.2, 2.6 + 0.05 * k), 7, 0.1,
                      k + 60), lambda t: 0.1 * (1 - 0.8 * t), wisp, segs=7)
    for s_, nm in ((1, "ArmL"), (-1, "ArmR")):
        m = rig.mb(nm)
        blob(m, (s_ * 0.42, 0.04, 1.42), (0.22, 0.2, 0.38), core, seed=27 + s_, amp=0.22, segs=16, rings=11)
        blob(m, (s_ * 0.5, 0.1, 1.38), (0.3, 0.26, 0.45), soft, seed=29 + s_, amp=0.3, segs=14, rings=10)
        eyes2(m, (s_ * 0.4, -0.235, 1.55), 0.02, 0.06)
        arm = wiggle((s_ * 0.5, 0.0, 1.25), (s_ * 0.72, -0.15, 0.45), 9, 0.08, 40 + s_)
        m.tube(arm, lambda t: 0.09 * (1 - 0.7 * t), core, segs=8)
        for f in range(4):                                                    # long smoky fingers
            tip = arm[-1] + Vector((s_ * (0.03 * f - 0.04), -0.08 - 0.02 * f, -0.22 - 0.03 * (f % 2)))
            m.tube(wiggle(arm[-1], tip, 5, 0.025, 90 + f + s_), lambda t: 0.02 * (1 - 0.85 * t), core, segs=5)
        m.tube(wiggle((s_ * 0.5, 0.05, 1.2), (s_ * 0.8, 0.15, 0.35), 7, 0.12, 41 + s_),
               lambda t: 0.13 * (1 - 0.8 * t), soft, segs=6)
    for nm, a in wisps:
        m = rig.mb(nm)
        b = Vector((0.3 * math.cos(a), 0.22 * math.sin(a), 0.62))
        tip = Vector((0.62 * math.cos(a), 0.45 * math.sin(a) + 0.1, 0.02))
        m.tube(wiggle(b + Vector((0, 0, 0.12)), tip, 9, 0.12, 50 + int(a * 10)), lambda t: 0.13 * (1 - 0.88 * t), core,
               segs=8)
        m.tube(wiggle(b + Vector((0, 0.05, 0.1)), tip * 1.15 + Vector((0, 0.1, 0.0)), 7, 0.15, 60 + int(a * 10)),
               lambda t: 0.16 * (1 - 0.85 * t), soft, segs=7)
        m.tube(wiggle(b + Vector((0, 0.08, 0.2)), tip * 1.35 + Vector((0, 0.15, 0.05)), 6, 0.2, 70 + int(a * 10)),
               lambda t: 0.2 * (1 - 0.8 * t), wisp, segs=6)
    rig.build(auto_smooth=80)

    def idle(f):
        p = f / 72.0 * T
        out = {"Hips": {"rot": (2 * math.sin(p), 3 * math.sin(p + 1), 4 * math.sin(p)),
                        "loc": (0.02 * math.sin(p), 0, 0.04 * math.sin(2 * p))},
               "Chest": (3 * math.sin(2 * p + 0.5), 4 * math.sin(p), 6 * math.sin(p + 0.3)),
               "Head": (5 * math.sin(2 * p + 1.0), 6 * math.sin(p + 2), 10 * math.sin(p + 0.8)),
               "ArmL": (8 * math.sin(p + 0.4), 6 * math.sin(2 * p), 6 * math.sin(p)),
               "ArmR": (8 * math.sin(p + 2.4), -6 * math.sin(2 * p + 1), -6 * math.sin(p))}
        for i, (nm, a) in enumerate(wisps):
            q = p * 2 + i * 1.3
            out[nm] = (10 * math.sin(q), 10 * math.cos(q * 0.5 + i), 0)
        return out

    def move(f):
        p = f / 48.0 * T
        out = add(idle(f * 1.5), {"Hips": (10, 0, 0), "Chest": (8, 0, 0), "Head": (-12, 0, 0),
                                  "ArmL": (25, 0, 0), "ArmR": (25, 0, 0)})
        for i, (nm, a) in enumerate(wisps):
            out = add(out, {nm: (28 + 8 * math.sin(p * 2 + i), 0, 0)})
        return out

    reach = add(idle(0), {"Hips": {"rot": (14, 0, 0), "loc": (0, -0.45, 0.05)}, "Chest": (16, 0, 0),
                          "Head": (-18, 0, 0), "ArmL": (-70, 0, 30), "ArmR": (-70, 0, -30)})
    engulf = add(reach, {"Head": (10, 0, 0), "ArmL": (-40, 0, -25), "ArmR": (-40, 0, 25), "Chest": (10, 0, 0)})

    def attack(f):
        return keyed([(0, idle(0)), (8, reach), (14, engulf), (20, engulf)], f)

    clips = [clip(rig, "Idle", 3.0, idle), clip(rig, "Move", 2.0, move), clip(rig, "Attack", 0.85, attack)]
    return _finish_entity("entity_shade", rig, clips, [("Idle", 0), ("Move", 10), ("Attack", 14)],
                          view=(0.8, -1.8, 0.3), humanoid=False)


# =========================================================== MATA PAPAN ====
def entity_eyes():
    flesh = mat("EyeFlesh", "#6e4043", rough=0.25)
    lid = mat("EyeLid", "#83595a", rough=0.3)
    vein = mat("EyeTendril", "#2c181b", rough=0.25)
    ball = mat("EyeBall", "#030202", rough=0.05)
    sclera = mat("EyeCornea", "#3b1a1b", rough=0.1)
    iris = mat("EyeIris", "#1a0d0b", rough=0.08)
    glint = mat("EmitEyeGlint", "#ffffff", rough=0.5, emit="#ffffff", strength=1.6)
    tear = mat("EyeTear", "#0b0304", rough=0.3, double=True)

    rig = Rig()
    rig.joint("Hips", (0, 0, 0))
    rig.joint("Head", (0, -0.1, 1.5), "Hips")
    tendrils = []
    rnd = random.Random(7)
    for i in range(12):
        a = T * i / 12 + rnd.uniform(-0.15, 0.15)
        if math.sin(a) < -0.75:                    # leave the bottom to the roots
            a += 0.5
        base = Vector((0.3 * math.cos(a), -0.06, 1.52 + 0.27 * math.sin(a)))
        nm = f"Tendril{i}"
        rig.joint(nm, tuple(base), "Head")
        tendrils.append((nm, a, base))

    rr = random.Random(77)
    m = rig.mb("Hips")                                                        # roots crawling to the floor
    for k, x in enumerate((-0.26, -0.13, -0.02, 0.09, 0.21)):
        pts = wiggle((x * 0.8, -0.09, 1.3), (x * 2.2 + rr.uniform(-0.1, 0.1), -0.06, 0.0), 10, 0.09, 70 + k)
        m.tube(pts, lambda t: 0.055 * (1 - 0.65 * t) + 0.006 * math.sin(t * 25), vein, segs=8)
        for j in (3, 6):
            m.tube(wiggle(pts[j], (pts[j].x * 1.6 + rr.uniform(-0.25, 0.25), -0.04, pts[j].z * 0.4), 6, 0.05, 80 + k + j),
                   lambda t: 0.024 * (1 - 0.85 * t), vein, segs=6)
        for j in range(1, 9, 2):                                              # knots along the root
            m.sphere((0.03 * (1 - j / 12),) * 3, pts[j], vein, segs=8, rings=6)

    m = rig.mb("Head")
    blob(m, (0, -0.06, 1.5), (0.36, 0.13, 0.33), flesh, seed=31, amp=0.1, segs=26, rings=18)
    lobes = (((0.3, -0.06, 1.65), (0.17, 0.11, 0.16)), ((-0.28, -0.06, 1.63), (0.17, 0.11, 0.16)),
             ((0.17, -0.08, 1.27), (0.2, 0.11, 0.15)), ((-0.19, -0.08, 1.3), (0.18, 0.11, 0.14)),
             ((0.0, -0.08, 1.8), (0.19, 0.11, 0.13)), ((0.02, -0.07, 1.18), (0.13, 0.1, 0.1)),
             ((0.36, -0.04, 1.44), (0.1, 0.09, 0.12)), ((-0.37, -0.04, 1.45), (0.1, 0.09, 0.12)),
             ((0.19, -0.05, 1.86), (0.11, 0.08, 0.09)), ((-0.2, -0.05, 1.84), (0.1, 0.08, 0.09)))
    for i, (c, r) in enumerate(lobes):
        blob(m, c, r, flesh if i % 3 else lid, seed=32 + i, amp=0.14, segs=16, rings=11)
    for k in range(12):                                                       # surface veins
        a0 = rr.uniform(0, T)
        r0 = rr.uniform(0.08, 0.3)
        c = Vector((r0 * math.cos(a0), -0.17, 1.5 + r0 * math.sin(a0) * 0.9))
        d = Vector((math.cos(a0 + 0.6), 0, math.sin(a0 + 0.6)))
        pts = [c + d * 0.05 * j + Vector((0, -0.012 * math.sin(j * 0.8), 0.01 * math.sin(j * 1.7 + k))) for j in range(6)]
        m.tube(pts, lambda t: 0.009 * (1 - 0.6 * t), vein, segs=5)
    eyes = [((-0.15, 1.6), 0.105), ((0.15, 1.62), 0.1), ((0.0, 1.82), 0.062), ((-0.14, 1.36), 0.08),
            ((0.1, 1.34), 0.074), ((0.3, 1.44), 0.052), ((-0.31, 1.56), 0.05), ((0.31, 1.72), 0.038),
            ((-0.23, 1.82), 0.032), ((0.19, 1.88), 0.028)]
    for i, ((x, z), r) in enumerate(eyes):
        yb = -0.22
        c = Vector((x, yb + 0.02, z))
        look = Vector((x * 0.25, -1, (z - 1.5) * 0.3)).normalized()
        m.sphere((r * 1.45, 0.06, r * 1.3), (x, yb + 0.05, z), lid, segs=16, rings=10)          # swollen socket
        eye(m, c, look, r, sclera, iris, ball, glint, iris_r=0.78, segs=16, lid=lid, lid_open=0.62, lid_r=0.2)
        n = 2 if r > 0.05 else 1
        for k in range(n):                                                     # black tears
            x0 = x + (k - (n - 1) / 2) * r * 0.7
            ln = 0.14 + r * 3.2 + 0.06 * k
            pts = []
            for j in range(9):
                q = j / 8
                pts.append((x0 + 0.01 * math.sin(j * 1.9 + i), yb - 0.012 + 0.03 * q * q - r * 0.35 * (1 - q),
                            z - r * 0.85 - ln * q))
            m.tube(pts, lambda q: 0.009 * (1 - 0.4 * q) + 0.004 * math.sin(q * 9) ** 2, tear, segs=6)
            m.sphere((0.013, 0.011, 0.017), pts[-1], tear, segs=8, rings=6)
    for nm, a, b in tendrils:
        m = rig.mb(nm)
        d = Vector((math.cos(a), 0, math.sin(a)))
        ln = 0.8 + 0.5 * random.Random(int(a * 100)).random()
        tip = b + d * ln + Vector((0, 0.05, 0))
        pts = wiggle(b, tip, 12, 0.12, int(a * 100), normal=(0, 1, 0))
        for j, p in enumerate(pts):
            p.y -= 0.04 * math.sin(j / 11 * math.pi)                           # arch off the wall
        m.tube(pts, lambda t: 0.05 * (1 - 0.9 * t) + 0.004 * math.sin(t * 30) ** 2, vein, segs=7)
        m.sphere((0.007,) * 3, pts[-1], vein, segs=6, rings=4)
        for k, j in enumerate((3, 5, 8)):                                     # branches
            p = pts[j]
            side = Vector((-d.z, 0, d.x)) * (1 if k % 2 == 0 else -1)
            bt = p + (d * 0.6 + side * 0.8).normalized() * (0.3 + 0.1 * k)
            bp = wiggle(p, bt, 7, 0.05, int(a * 100) + k)
            m.tube(bp, lambda t: 0.022 * (1 - 0.85 * t), vein, segs=6)
            if k < 2:
                tw = bp[4] + (side * 0.7 + d * 0.3).normalized() * 0.14
                m.tube(wiggle(bp[4], tw, 4, 0.02, int(a * 100) + 9 + k), lambda t: 0.01 * (1 - 0.8 * t), vein, segs=5)
    rig.build(auto_smooth=75)

    def bend(a, deg):
        """Euler (deg) bending a wall tendril with direction angle a toward the viewer (-Y)."""
        d = Vector((math.cos(a), 0, math.sin(a)))
        ax = d.cross(Vector((0, -1, 0))).normalized()
        return ax * deg

    def spread(a, deg):
        return (0, deg, 0)

    def idle(f):
        p = f / 72.0 * T
        out = {"Head": (1.5 * math.sin(2 * p), 0, 1.5 * math.sin(p)), "Hips": {"loc": (0, -0.01 * math.sin(2 * p), 0)}}
        for i, (nm, a, b) in enumerate(tendrils):
            q = p * 2 + i * 1.7
            bv = bend(a, 8 * math.sin(q))
            out[nm] = (bv.x, 9 * math.sin(q * 0.5 + i), bv.z)
        return out

    def stare(f):
        p = f / 36.0 * T
        out = {"Head": (2 * math.sin(4 * p), 0, 2 * math.sin(3 * p)), "Hips": {"loc": (0, -0.12, 0)}}
        for i, (nm, a, b) in enumerate(tendrils):
            q = p * 3 + i * 1.3
            bv = bend(a, 22 + 6 * math.sin(q))
            out[nm] = (bv.x, 4 * math.sin(q * 2), bv.z)
        return out

    def lunge_pose(k):
        out = {"Head": (-8 * k, 0, 0), "Hips": {"loc": (0, -0.12 - 0.5 * k, 0.05 * k)}}
        for nm, a, b in tendrils:
            bv = bend(a, 22 + 50 * k)
            out[nm] = (bv.x, 0, bv.z)
        return out

    def attack(f):
        return keyed([(0, stare(0)), (6, lunge_pose(0.4)), (11, lunge_pose(1.0)), (20, lunge_pose(1.0))], f)

    clips = [clip(rig, "Idle", 3.0, idle), clip(rig, "Stare", 1.5, stare), clip(rig, "Attack", 0.85, attack)]
    return _finish_entity("entity_eyes", rig, clips, [("Idle", 0), ("Stare", 8), ("Attack", 12)],
                          view=(0.35, -1.8, 0.1), humanoid=False)


# ============================================================= KELABANG ====
def entity_centipede():
    skin = mat("CentSkin", "#ad8a7e", rough=0.4)
    shade = mat("CentShade", "#77534b", rough=0.45)
    raw = mat("CentRaw", "#7b3733", rough=0.35)
    mouth = mat("CentMouth", "#180404", rough=0.8)
    nail = mat("CentNail", "#4a3430", rough=0.5)

    rig = Rig()
    rig.joint("Hips", (0, 0.1, 0.55))
    rig.joint("Chest", (0, -0.02, 0.95), "Hips")
    rig.joint("Head", (0, -0.08, 1.42), "Chest")
    arm_z = (1.24, 1.08, 0.92)
    for s, sx in (("L", 1), ("R", -1)):
        for k, z in enumerate(arm_z):
            rig.joint(f"Arm{s}{k}", (sx * 0.16, -0.06, z), "Chest")
    seg_y = [0.1, 0.5, 0.9, 1.3, 1.7]
    seg_z = [0.55, 0.52, 0.5, 0.48, 0.46]
    for i in range(1, 5):
        rig.joint(f"Seg{i}", (0, seg_y[i], seg_z[i]), "Hips" if i == 1 else f"Seg{i - 1}")
    for i in range(5):
        for s, sx in (("L", 1), ("R", -1)):
            rig.joint(f"Leg{s}{i}", (sx * 0.15, seg_y[i] + 0.04, seg_z[i] - 0.04), "Hips" if i == 0 else f"Seg{i}")

    teeth = mat("CentTeeth", "#ddd2b8", rough=0.25)
    gum = mat("CentGum", "#8a2f33", rough=0.25)
    eyew = mat("CentEyeWhite", "#cfc4b6", rough=0.15)
    iris = mat("CentIris", "#2a1a12", rough=0.1)
    glint = mat("EmitCentGlint", "#ffffff", rough=0.5, emit="#fff4e0", strength=1.4)
    FWD = Vector((0, -1, 0))
    UP = Vector((0, 0, 1))

    def face(m, M, k, scream=1.0):
        """A whole human head: long skull, sunken eyes, open screaming mouth."""
        m.sphere((0.075, 0.085, 0.115), (0, 0.01, 0.02), skin, segs=14, rings=10, M=M)          # cranium
        m.sphere((0.06, 0.06, 0.07), (0, -0.02, -0.09), skin, segs=10, rings=7, M=M)           # jaw mass
        m.tube([xf(M, (0.055 * math.sin(a), -0.075 * math.cos(a) + 0.005, 0.035 - 0.01 * abs(math.sin(a))))
                for a in (-1.0, -0.5, 0.0, 0.5, 1.0)], lambda q: 0.004 + 0.006 * math.sin(q * math.pi), skin, segs=5)
        for sd in (-1, 1):
            m.sphere((0.022, 0.012, 0.016), (sd * 0.031, -0.072, 0.01), shade, segs=8, rings=5, M=M)     # socket
            if k % 3 != 2:
                m.sphere((0.0105,) * 3, (sd * 0.031, -0.075, 0.01), eyew, segs=8, rings=5, M=M)
                m.sphere((0.006, 0.003, 0.006), (sd * 0.031, -0.085, 0.01), iris, segs=6, rings=4, M=M)
                if k < 4:
                    m.sphere((0.002,) * 3, (sd * 0.031 - 0.002, -0.0875, 0.013), glint, segs=4, rings=3, M=M)
            m.tube([xf(M, (sd * 0.05, -0.055, -0.01)), xf(M, (sd * 0.055, -0.06, -0.07)),
                    xf(M, (sd * 0.04, -0.05, -0.15))], lambda q: 0.017 * (1 - 0.3 * q), skin, segs=5)  # sagging cheek
            m.sphere((0.014, 0.02, 0.026), (sd * 0.078, 0.0, 0.0), skin, segs=6, rings=4, M=M)  # ear
        m.sphere((0.011, 0.017, 0.024), (0, -0.088, -0.018), skin, segs=6, rings=5, M=M)        # nose
        mh = 0.055 + 0.02 * scream
        m.sphere((0.026, 0.03, mh), (0, -0.062, -0.1), mouth, segs=10, rings=7, M=M)          # scream
        lip = [xf(M, (0.03 * math.sin(a), -0.068 - 0.008 * math.cos(a) ** 2, -0.1 + mh * 0.95 * math.cos(a)))
               for a in [T * j / 10 for j in range(11)]]
        m.tube(lip, 0.006, gum, segs=4, caps=False)
        for j in range(4):
            x = -0.013 + 0.0087 * j
            m.sphere((0.004, 0.003, 0.008), (x, -0.07, -0.1 + mh * 0.82), teeth, segs=5, rings=3, M=M)
        m.sphere((0.035, 0.032, 0.03), (0, -0.045, -0.1 - mh - 0.01), skin, segs=8, rings=5, M=M)  # chin

    def prone_body(m, y, z, i):
        """A human lying face down: back, shoulder blades, spine, buttocks."""
        mlimb(m, (0, y + 0.25, z - 0.01), (0, y - 0.25, z + 0.01),
              [(0, 0.12), (0.25, 0.14), (0.55, 0.12), (0.85, 0.15), (1, 0.12)], skin, segs=14, sx=1.55, sy=1.0, up=UP)
        for s in (-1, 1):
            m.sphere((0.08, 0.1, 0.035), (s * 0.085, y - 0.14, z + 0.12), shade, rot=(0, s * 18, 0), segs=10, rings=6)
            m.sphere((0.085, 0.08, 0.07), (s * 0.07, y + 0.2, z + 0.06), skin, segs=10, rings=7)     # buttock
            for r_ in range(3):
                yy = y - 0.04 + r_ * 0.05
                m.tube([(s * 0.06, yy, z + 0.13), (s * 0.14, yy + 0.01, z + 0.1), (s * 0.19, yy + 0.02, z + 0.03)],
                       0.009, skin, segs=5)
        for k in range(8):
            m.sphere((0.016, 0.02, 0.013), (0, y - 0.21 + k * 0.05, z + 0.135 - abs(k - 3.5) * 0.004), skin,
                     segs=6, rings=4)
        if i % 2 == 1:
            m.sphere((0.06, 0.12, 0.04), (0.07 * (1 if i == 1 else -1), y, z + 0.11), raw, segs=10, rings=6)

    # body segments: prone human torsos fused end to end
    for i in range(5):
        prone_body(rig.mb("Hips" if i == 0 else f"Seg{i}"), seg_y[i], seg_z[i], i)
    m = rig.mb("Seg4")                                                     # a figure lying on the tail end
    face(m, Matrix.Translation((0, 2.0, 0.53)) @ Matrix.Rotation(math.radians(-80), 4, "X") @
         Matrix.Scale(0.95, 4), 7, scream=0.3)
    mlimb(m, (0, 1.88, 0.5), (0, 1.96, 0.52), [(0, 0.05), (1, 0.05)], skin, segs=8)
    for s in (-1, 1):                                                      # its arms flung back along the body
        mlimb(m, (s * 0.17, 1.82, 0.6), (s * 0.24, 1.55, 0.66), [(0, 0.04), (0.4, 0.043), (1, 0.03)], skin, segs=8)
        mlimb(m, (s * 0.24, 1.55, 0.66), (s * 0.22, 1.3, 0.62), [(0, 0.032), (0.4, 0.035), (1, 0.022)], skin, segs=8)
        hand(m, (s * 0.22, 1.3, 0.62), (0, -1, -0.1), (0, 0, -1), (-s, 0, 0), 0.08, skin, None, curl=0.4, r=0.0075,
             segs=5, knuckles=False, lite=True, seed=40 + s)

    # upright front torso: ribs, sternum, abdomen
    m = rig.mb("Chest")
    torso(m, [(0.0, 0.6), (0.17, 0.62), (0.15, 0.8), (0.165, 1.0), (0.19, 1.18), (0.17, 1.3), (0.08, 1.36),
              (0.0, 1.37)], skin, sy=0.62, y=-0.02, segs=20)
    ribs(m, 0, -0.02, 1.16, 5, 0.06, 0.17, 0.11, skin, r=0.009, sweep=(0.25, 1.9), droop=0.04, shrink=0.12)
    for k in range(3):
        for s in (-1, 1):
            m.sphere((0.045, 0.02, 0.035), (s * 0.048, -0.112, 0.8 + k * 0.075), skin, segs=8, rings=5)  # abs
    for s in (-1, 1):
        m.sphere((0.085, 0.04, 0.06), (s * 0.08, -0.11, 1.18), skin, segs=12, rings=7)             # pecs
        m.tube([(s * 0.02, -0.12, 1.32), (s * 0.12, -0.1, 1.33), (s * 0.18, -0.06, 1.3)], 0.012, skin, segs=6)
    m.sphere((0.06, 0.03, 0.08), (0.12, -0.1, 0.98), raw, segs=8, rings=5)

    # head cluster: screaming faces melting into each other
    m = rig.mb("Head")
    faces = [((0.0, -0.13, 1.5), 0, -5, 1.0), ((0.0, -0.08, 1.75), 0, 12, 0.95), ((0.15, -0.07, 1.6), 50, 0, 0.9),
             ((-0.15, -0.06, 1.61), -50, 0, 0.9), ((0.1, 0.0, 1.84), 80, 25, 0.8), ((-0.12, -0.01, 1.43), -70, -15, 0.8),
             ((0.06, 0.06, 1.97), 20, 40, 0.75)]
    for k, (c, yaw, pitch, sc) in enumerate(faces):
        M = Matrix.Translation(c) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ \
            Matrix.Rotation(math.radians(-pitch), 4, "X") @ Matrix.Scale(sc, 4)
        mlimb(m, (0, -0.02, 1.3), c, [(0, 0.06), (1, 0.05 * sc)], skin, segs=8)  # neck stalk
        face(m, M, k, scream=1.0 - 0.15 * (k % 3))

    # six arms grasping forward; the lowest pair walks on its palms
    for s, sx in (("L", 1), ("R", -1)):
        for k, z in enumerate(arm_z):
            m = rig.mb(f"Arm{s}{k}")
            sh = Vector((sx * 0.16, -0.06, z))
            if k < 2:
                el = Vector((sx * (0.36 + 0.03 * k), -0.24, z - 0.1))
                ha = Vector((sx * (0.42 + 0.05 * k), -0.5 + 0.05 * k, z - 0.05 - 0.1 * k))
            else:
                el = Vector((sx * 0.36, -0.3, 0.55))
                ha = Vector((sx * 0.4, -0.45, 0.05))
            m.sphere((0.045, 0.045, 0.045), sh, skin, segs=10, rings=6)
            mlimb(m, sh, el, [(0, 0.045), (0.4, 0.052), (1, 0.035)], skin, segs=8, up=FWD)
            mlimb(m, el, ha, [(0, 0.036), (0.4, 0.04), (1, 0.024)], skin, segs=8, sx=1.15, up=FWD)
            fwd = (ha - el).normalized()
            if k < 2:
                hand(m, ha, fwd, Vector((0, 0, -1)) + Vector((-sx * 0.3, 0, 0)), Vector((0, 0, 1)).cross(fwd) * sx,
                     0.09, skin, nail, curl=0.45 + 0.15 * k, r=0.0075, segs=5, knuckles=False, lite=True,
                     splay=0.18, seed=k + sx * 3)
            else:
                hand(m, ha + Vector((0, 0.03, 0.0)), (sx * 0.3, -1, -0.1), (0, 0, -1), (-sx, 0, 0), 0.085, skin, nail,
                     curl=0.25, r=0.0078, segs=5, knuckles=False, lite=True, splay=0.2, palm_len=0.08, seed=9 + sx)
    # legs along the body (alternating human legs and arms)
    for i in range(5):
        for s, sx in (("L", 1), ("R", -1)):
            m = rig.mb(f"Leg{s}{i}")
            b = Vector((sx * 0.15, seg_y[i] + 0.04, seg_z[i] - 0.04))
            kn = Vector((sx * 0.38, seg_y[i] + 0.0, seg_z[i] + 0.2))
            ft = Vector((sx * 0.46, seg_y[i] + 0.08, 0.04))
            if (i + (s == "R")) % 2 == 0:                                     # leg
                mlimb(m, b, kn, [(0, 0.07), (0.4, 0.074), (1, 0.05)], skin, segs=8, up=UP)
                m.sphere((0.035, 0.03, 0.035), kn + Vector((0, 0, 0.03)), skin, segs=8, rings=5)
                mlimb(m, kn, ft + Vector((0, 0, 0.05)), [(0, 0.05), (0.4, 0.054), (1, 0.03)], skin,
                      segs=8, up=FWD)
                m.sphere((0.035, 0.05, 0.03), ft + Vector((0, 0.02, 0.0)), skin, segs=8, rings=5)
                hand(m, ft + Vector((0, 0.02, -0.01)), (0, -1, -0.05), (0, 0, -1), (-sx, 0, 0), 0.04, skin, nail,
                     curl=0.3, r=0.0085, palm_len=0.13, nfing=5, thumb=False, segs=5, knuckles=False, lite=True,
                     palm_scale=(1.0, 2.2, 1.0), rel=[1.0, 0.9, 0.85, 0.8, 0.7], seed=20 + i)
            else:                                                             # arm
                mlimb(m, b, kn, [(0, 0.05), (0.4, 0.056), (1, 0.038)], skin, segs=8, up=UP)
                mlimb(m, kn, ft + Vector((0, 0, 0.03)), [(0, 0.037), (0.4, 0.0415), (1, 0.026)], skin,
                      segs=8, up=FWD)
                hand(m, ft + Vector((0, 0.03, 0.0)), (sx * 0.4, -1, -0.15), (0, 0, -1), (-sx, 0, 0), 0.075, skin,
                     nail, curl=0.3, r=0.0075, segs=5, knuckles=False, lite=True, palm_len=0.075, seed=30 + i)
    rig.build(auto_smooth=75)

    def legs(p, amp, out):
        for i in range(5):
            for s, ph in (("L", 0.0), ("R", math.pi)):
                q = p - i * 1.1 + ph
                out[f"Leg{s}{i}"] = sym(s, (-22 * amp * math.sin(q), -14 * amp * max(0.0, math.cos(q)), 0))
        return out

    def idle(f):
        p = f / 60.0 * T
        out = {"Hips": {"loc": (0, 0, 0.01 * math.sin(2 * p))}, "Chest": (-2 * math.sin(p), 0, 4 * math.sin(p)),
               "Head": (4 * math.sin(2 * p), 6 * math.sin(p + 1), 10 * math.sin(p))}
        for i in range(1, 5):
            out[f"Seg{i}"] = (0, 0, 3 * math.sin(p - i * 0.7))
        for s, sx in (("L", 1), ("R", -1)):
            for k in range(2):
                q = p * 2 + k * 1.4 + (0 if s == "L" else 2)
                out[f"Arm{s}{k}"] = sym(s, (-10 * math.sin(q), 0, 12 * math.sin(q * 0.5)))
        return legs(p * 0.25, 0.25, out)

    def crawl(f, n, amp):
        p = f / n * T
        out = {"Hips": {"rot": (0, 3 * math.sin(p), 4 * math.sin(p)), "loc": (0, 0, 0.02 * math.sin(2 * p))},
               "Chest": (4 * amp, -4 * math.sin(p), -6 * math.sin(p)),
               "Head": (5 * math.sin(2 * p), 8 * math.sin(p), 12 * math.sin(p + 1))}
        for i in range(1, 5):
            out[f"Seg{i}"] = (0, 2 * math.sin(p - i), 8 * amp * math.sin(p - i * 0.9))
        for s, ph in (("L", 0.0), ("R", math.pi)):
            for k in range(3):
                q = p + ph + k * 0.9
                if k < 2:
                    out[f"Arm{s}{k}"] = sym(s, (-14 * amp * math.sin(q), 0, 16 * amp * math.sin(q)))
                else:
                    out[f"Arm{s}{k}"] = sym(s, (24 * amp * math.sin(q), -12 * amp * max(0.0, math.cos(q)), 0))
        return legs(p * 2, amp, out)

    def walk(f):
        return crawl(f, 28, 1.0)

    def run(f):
        return crawl(f, 16, 1.4)

    rear = {"Hips": {"loc": (0, 0.12, 0.02)}, "Chest": (-22, 0, 0), "Head": (-12, 0, 0),
            "ArmL0": (-40, 0, 30), "ArmR0": (-40, 0, -30), "ArmL1": (-30, 0, 40), "ArmR1": (-30, 0, -40),
            "ArmL2": (-20, 0, 0), "ArmR2": (-20, 0, 0)}
    strike = {"Hips": {"loc": (0, -0.5, 0.0)}, "Chest": (24, 0, 0), "Head": (14, 0, 0),
              "ArmL0": (-10, 0, -40), "ArmR0": (-10, 0, 40), "ArmL1": (0, 0, -45), "ArmR1": (0, 0, 45),
              "ArmL2": (-25, 0, 0), "ArmR2": (-25, 0, 0)}

    def attack(f):
        return keyed([(0, idle(0)), (9, rear), (15, strike), (24, strike)], f)

    clips = [clip(rig, "Idle", 2.5, idle), clip(rig, "Walk", 1.15, walk), clip(rig, "Run", 0.65, run),
             clip(rig, "Attack", 1.0, attack)]
    return _finish_entity("entity_centipede", rig, clips, [("Idle", 0), ("Walk", 7), ("Attack", 15)],
                          view=(1.4, -1.3, 0.55), humanoid=False)


ASSETS = {
    "entity_pale": entity_pale,
    "entity_gaper": entity_gaper,
    "entity_shade": entity_shade,
    "entity_eyes": entity_eyes,
    "entity_centipede": entity_centipede,
}

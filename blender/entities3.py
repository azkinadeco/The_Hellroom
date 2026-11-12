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
from entities import Rig, mirror_pos, add, keyed, clip, sym, torso, finger_set, _finish_entity

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
    skin = mat("PaleSkin", "#cdc4bd", rough=0.3)
    flush = mat("PaleFlush", "#a0676a", rough=0.35)
    mouth = mat("PaleMouth", "#4a080d", rough=0.5, double=True)
    lip = mat("PaleLip", "#b3797a", rough=0.3)
    teeth = mat("PaleTeeth", "#ece4d2", rough=0.3)
    nail = mat("PaleNail", "#3b2a28", rough=0.4)

    P = mirror_pos({
        "Hips": (0, 0.40, 0.80), "Spine": (0, 0.12, 0.84), "Chest": (0, -0.2, 0.86),
        "Neck": (0, -0.40, 0.87), "Head": (0, -0.55, 0.88),
        "ShoulderL": (0.16, -0.28, 0.82), "ElbowL": (0.26, -0.40, 0.46), "HandL": (0.24, -0.55, 0.05),
        "HipL": (0.13, 0.44, 0.76), "KneeL": (0.19, 0.22, 0.42), "FootL": (0.17, 0.52, 0.06),
    })
    rig = Rig()
    rig.skeleton(P)

    m = rig.mb("Hips")
    blob(m, (0, 0.42, 0.80), (0.15, 0.17, 0.12), skin, seed=1, amp=0.06)
    m = rig.mb("Spine")
    m.limb((0, 0.4, 0.8), (0, -0.14, 0.85), 0.115, 0.135, skin, segs=14, bulge=0.012)
    for k in range(5):                                                   # flank ribs
        y = 0.22 - k * 0.075
        for s in (-1, 1):
            pts = [(s * 0.128 * math.sin(a), y, 0.835 + 0.12 * math.cos(a)) for a in
                   [0.5 + 1.9 * i / 6 for i in range(7)]]
            m.tube(pts, 0.011, flush, segs=5, caps=False)
    for k in range(9):                                                   # dorsal ridge
        y = 0.36 - k * 0.07
        z = 0.94 + 0.012 * math.sin(k)
        spike(m, (0, y, z - 0.02), (0, y + 0.035, z + 0.05 - abs(k - 4) * 0.004), 0.024, flush)
    m = rig.mb("Chest")
    blob(m, (0, -0.2, 0.86), (0.155, 0.2, 0.14), skin, seed=2, amp=0.05)
    for s in (-1, 1):
        m.sphere((0.065, 0.1, 0.035), (s * 0.095, -0.22, 0.975), skin, rot=(0, s * 20, 0), segs=10, rings=6)
        for k in range(4):
            y = -0.08 - k * 0.07
            pts = [(s * 0.145 * math.sin(a), y, 0.86 + 0.13 * math.cos(a)) for a in
                   [0.7 + 1.7 * i / 6 for i in range(7)]]
            m.tube(pts, 0.01, flush, segs=5, caps=False)
    for k in range(4):
        y = -0.3 - k * 0.06
        spike(m, (0, y, 0.98), (0, y + 0.03, 1.04), 0.02, flush)
    m = rig.mb("Neck")
    m.limb((0, -0.32, 0.9), (0, -0.62, 0.89), 0.075, 0.055, skin, segs=12)
    for k in range(3):
        y = -0.42 - k * 0.06
        m.lathe([(0.066 - k * 0.004, -0.008), (0.07 - k * 0.004, 0.0), (0.066 - k * 0.004, 0.008)], flush,
                M=Matrix.Translation((0, y, 0.895)) @ Matrix.Rotation(math.radians(90), 4, "X"), segs=12,
                close=False)

    # head: long smooth egg, face is one vertical toothed slit
    m = rig.mb("Head")
    Mh = Matrix.Translation((0, -0.76, 0.9)) @ Matrix.Rotation(math.radians(14), 4, "X")
    m.sphere((0.125, 0.205, 0.15), (0, 0, 0), skin, segs=20, rings=14, M=Mh)
    m.sphere((0.042, 0.212, 0.124), (0, 0, 0), mouth, segs=12, rings=14, M=Mh)       # slit follows the egg

    def front_y(x, z):
        v = 1 - (x / 0.125) ** 2 - (z / 0.15) ** 2
        return -0.205 * math.sqrt(max(v, 0.0))

    def wid(z):
        return 0.046 * math.sqrt(max(0.0, 1 - (z / 0.124) ** 2))

    for s in (-1, 1):
        lips = []
        for i in range(13):
            z = -0.124 + 0.248 * i / 12
            x = s * (wid(z) + 0.004)
            lips.append(xf(Mh, (x, front_y(x, z) - 0.002, z)))
        m.tube(lips, lambda t: 0.006 + 0.011 * math.sin(t * math.pi), lip, segs=6)
        for i in range(10):
            z = -0.1 + 0.2 * i / 9 + s * 0.008
            x = s * wid(z)
            tx = x - s * (0.03 + 0.012 * math.sin(i * 1.7) ** 2)
            base = (x, front_y(x, z) - 0.006, z)
            tip = (tx, front_y(tx, z) * 1.035 - 0.004, z + 0.004 * s)
            m.limb(xf(Mh, base), xf(Mh, tip), 0.0075, 0.0012, teeth, segs=5)
    for s in (-1, 1):                                                    # faint skull ridges
        pts = [xf(Mh, (s * 0.1 * math.sin(a), 0.205 * math.cos(a) * -0.2, 0.14 * math.cos(a) + 0.0))
               for a in [0.4 + i * 0.25 for i in range(6)]]
        m.tube(pts, 0.008, flush, segs=5)

    for s, sx in (("L", 1), ("R", -1)):
        sh, el, ha = Vector(P["Shoulder" + s]), Vector(P["Elbow" + s]), Vector(P["Hand" + s])
        m = rig.mb("Shoulder" + s)
        m.limb(sh, el, 0.05, 0.036, skin, segs=10, bulge=0.008)
        m = rig.mb("Elbow" + s)
        m.sphere((0.038, 0.04, 0.04), el, skin, segs=8, rings=6)
        m.limb(el, ha + Vector((0, 0, 0.03)), 0.035, 0.025, skin, segs=10)
        m.tube([el + Vector((sx * 0.02, 0.02, 0)), (el + ha) / 2 + Vector((sx * 0.025, 0.0, 0)),
                ha + Vector((sx * 0.015, 0, 0.06))], 0.008, flush, segs=4)
        m = rig.mb("Hand" + s)
        m.sphere((0.035, 0.05, 0.016), ha + Vector((0, -0.02, 0.0)), skin, segs=10, rings=6)
        claw_fingers(m, ha + Vector((0, -0.05, 0.0)), (sx * 0.15, -1, 0), (1, 0.0, 0), 4, 0.17, 0.0085, skin,
                     nail, spread=0.016, droop=0.035, seed=3)
        m.tube([ha + Vector((-sx * 0.025, -0.02, 0)), ha + Vector((-sx * 0.07, -0.07, 0.0)),
                ha + Vector((-sx * 0.09, -0.12, -0.02))], lambda t: 0.009 * (1 - 0.4 * t), skin, segs=5)
        hp, kn, ft = Vector(P["Hip" + s]), Vector(P["Knee" + s]), Vector(P["Foot" + s])
        rig.mb("Hip" + s).limb(hp, kn, 0.07, 0.045, skin, segs=10, bulge=0.012)
        m = rig.mb("Knee" + s)
        m.limb(kn, ft + Vector((0, 0, 0.03)), 0.042, 0.03, skin, segs=10)
        m.sphere((0.04, 0.045, 0.045), kn, flush, segs=8, rings=6)
        m = rig.mb("Foot" + s)
        m.sphere((0.035, 0.06, 0.022), ft + Vector((0, -0.03, -0.02)), skin, segs=10, rings=6)
        claw_fingers(m, ft + Vector((0, -0.07, -0.025)), (0, -1, 0), (1, 0, 0), 4, 0.1, 0.008, skin, nail,
                     spread=0.014, droop=0.02, seed=4)
    rig.build()

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
        }

    def gait(f, n, amp, bound):
        p = f / n * T
        out = {"Hips": {"rot": (0, 3 * amp * math.sin(p), 4 * amp * math.sin(p)),
                        "loc": (0.01 * math.sin(p), 0, 0.02 * amp * math.sin(2 * p) ** 2)},
               "Spine": (6 * amp * math.sin(2 * p) * bound, 0, -3 * math.sin(p)),
               "Chest": (0, -4 * math.sin(p), 5 * math.sin(p)),
               "Neck": (-5 * math.sin(2 * p + 0.6), 0, -4 * math.sin(p)),
               "Head": (5 * math.sin(2 * p), 0, -6 * math.sin(p))}
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
    skin = mat("GaperSkin", "#b59287", rough=0.3)
    raw = mat("GaperRaw", "#7d2c2c", rough=0.3)
    gum = mat("GaperGum", "#9a3e43", rough=0.3)
    teeth = mat("GaperTeeth", "#dbd0b0", rough=0.35)
    inside = mat("GaperInside", "#2a0507", rough=0.6, double=True)
    socket = mat("GaperSocket", "#0e0405", rough=1.0)
    nail = mat("GaperNail", "#3a2422", rough=0.5)

    P = mirror_pos({
        "Hips": (0, 0.06, 0.8), "Spine": (0, 0.02, 0.94), "Chest": (0, -0.08, 1.16),
        "Neck": (0, -0.2, 1.38), "Head": (0, -0.27, 1.5),
        "ShoulderL": (0.2, -0.12, 1.3), "ElbowL": (0.31, -0.2, 0.9), "HandL": (0.29, -0.3, 0.38),
        "HipL": (0.12, 0.06, 0.76), "KneeL": (0.23, -0.3, 0.56), "FootL": (0.19, 0.04, 0.07),
    })
    rig = Rig()
    rig.skeleton(P)

    m = rig.mb("Hips")
    blob(m, (0, 0.07, 0.8), (0.15, 0.12, 0.12), skin, seed=11, amp=0.06)
    m = rig.mb("Spine")
    m.limb((0, 0.05, 0.82), (0, -0.06, 1.12), 0.1, 0.12, skin, segs=12)
    m.sphere((0.06, 0.03, 0.13), (0, -0.07, 0.96), raw, rot=(-18, 0, 0), segs=10, rings=8)   # stripped belly
    m = rig.mb("Chest")
    blob(m, (0, -0.1, 1.2), (0.17, 0.125, 0.16), skin, seed=12, amp=0.05)
    for k in range(4):
        z = 1.08 + k * 0.055
        for s in (-1, 1):
            pts = [(s * 0.165 * math.sin(a), -0.1 - 0.125 * math.cos(a) * 1.02, z + 0.01 * math.sin(a))
                   for a in [0.35 + i * 0.32 for i in range(6)]]
            m.tube(pts, 0.009, raw, segs=4, caps=False)
    for s in (-1, 1):
        m.tube([(s * 0.03, -0.21, 1.33), (s * 0.11, -0.19, 1.34), (s * 0.19, -0.13, 1.31)], 0.012, skin, segs=5)
        m.sphere((0.07, 0.04, 0.07), (s * 0.085, -0.19, 1.24), raw, rot=(0, 0, s * 25), segs=10, rings=6)  # torn pectoral
    for k in range(6):
        spike(m, (0, 0.0 + k * 0.01, 1.05 + k * 0.06), (0, 0.05 + k * 0.01, 1.07 + k * 0.06), 0.02, skin)
    m = rig.mb("Neck")
    m.limb((0, -0.12, 1.32), (0, -0.29, 1.55), 0.058, 0.05, skin, segs=10)
    for s in (-1, 1):
        m.tube([(s * 0.04, -0.15, 1.35), (s * 0.035, -0.27, 1.5)], 0.012, raw, segs=4)

    m = rig.mb("Head")
    hc = Vector((0, -0.32, 1.64))
    blob(m, hc, (0.105, 0.12, 0.11), skin, seed=13, amp=0.05, segs=16, rings=12)
    m.sphere((0.085, 0.05, 0.022), hc + Vector((0, -0.075, 0.03)), skin, segs=10, rings=6)            # brow
    for s in (-1, 1):
        m.sphere((0.03, 0.022, 0.026), hc + Vector((s * 0.042, -0.1, -0.008)), socket, segs=8, rings=6)
        m.sphere((0.004, 0.003, 0.004), hc + Vector((s * 0.044, -0.12, -0.006)), teeth, segs=6, rings=4)
    m.sphere((0.012, 0.012, 0.02), hc + Vector((0, -0.118, -0.04)), socket, segs=6, rings=4)
    # upper jaw arc + teeth
    up = []
    for i in range(12):
        a = math.radians(-75 + 150 * i / 11)
        up.append(Vector((0.078 * math.sin(a), -0.3 - 0.11 * math.cos(a), 1.56)))
    m.tube(up, 0.02, gum, segs=6)
    for i, p in enumerate(up[1:-1]):
        ln = 0.05 if i in (1, 8) else 0.035
        m.limb(p + Vector((0, 0, -0.005)), p + Vector((p.x * 0.05, -0.006, -ln)), 0.012, 0.006, teeth, segs=5)
    # unhinged lower jaw hanging to the chest
    lo = []
    for i in range(12):
        a = math.radians(-80 + 160 * i / 11)
        lo.append(Vector((0.085 * math.sin(a), -0.36 - 0.12 * math.cos(a), 1.2 + 0.05 * (1 - math.cos(a)))))
    m.tube(lo, 0.026, gum, segs=6)
    for p in lo[1:-1]:
        m.limb(p + Vector((0, 0, 0.01)), p + Vector((0, -0.004, 0.045)), 0.012, 0.005, teeth, segs=5)
    m.sphere((0.072, 0.075, 0.16), (0, -0.37, 1.38), inside, segs=12, rings=10)                     # throat
    m.limb((0, -0.33, 1.28), (0, -0.46, 1.25), 0.035, 0.026, gum, segs=8)                         # tongue
    for s in (-1, 1):                                                                              # cheek skin
        m.tube([(s * 0.08, -0.3, 1.55), (s * 0.095, -0.33, 1.42), (s * 0.09, -0.35, 1.25)], 0.024, raw, segs=6)
        m.tube([(s * 0.06, -0.36, 1.56), (s * 0.068, -0.4, 1.4), (s * 0.06, -0.43, 1.26)], 0.003, teeth, segs=3)

    for s, sx in (("L", 1), ("R", -1)):
        sh, el, ha = Vector(P["Shoulder" + s]), Vector(P["Elbow" + s]), Vector(P["Hand" + s])
        m = rig.mb("Shoulder" + s)
        m.limb(sh, el, 0.055, 0.04, skin, segs=10, bulge=0.01)
        m.tube([sh + Vector((sx * 0.02, -0.04, -0.05)), (sh + el) / 2 + Vector((0, -0.04, 0)), el + Vector((0, -0.03, 0.05))],
               0.016, raw, segs=4)
        m = rig.mb("Elbow" + s)
        m.sphere((0.04, 0.04, 0.045), el, skin, segs=8, rings=6)
        m.limb(el, ha + Vector((0, 0, 0.04)), 0.038, 0.028, skin, segs=10)
        finger_set(rig.mb("Hand" + s), ha + Vector((0, 0, 0.02)), s, 0.14, skin, spread=0.011, r=0.0075,
                   curl=0.5, palm=(0.018, 0.045, 0.05))
        hp, kn, ft = Vector(P["Hip" + s]), Vector(P["Knee" + s]), Vector(P["Foot" + s])
        m = rig.mb("Hip" + s)
        m.limb(hp, kn, 0.075, 0.05, skin, segs=10, bulge=0.01)
        m.tube([hp + Vector((sx * 0.05, -0.05, -0.03)), (hp + kn) / 2 + Vector((sx * 0.05, -0.045, 0)),
                kn + Vector((sx * 0.02, -0.03, 0.05))], 0.02, raw, segs=4)
        m = rig.mb("Knee" + s)
        m.sphere((0.045, 0.045, 0.045), kn, skin, segs=8, rings=6)
        m.limb(kn, ft + Vector((0, 0, 0.04)), 0.045, 0.032, skin, segs=10)
        m = rig.mb("Foot" + s)
        m.sphere((0.04, 0.07, 0.025), ft + Vector((0, -0.04, -0.035)), skin, segs=10, rings=6)
        claw_fingers(m, ft + Vector((0, -0.09, -0.045)), (0, -1, 0), (1, 0, 0), 4, 0.07, 0.009, skin, nail,
                     spread=0.016, droop=0.015, seed=14)
    rig.build()

    def idle(f):
        p = f / 48.0 * T
        tw = 1.0 if (f % 24) in (5, 6, 17) else 0.0
        return {"Hips": {"loc": (0, 0, 0.012 * math.sin(2 * p))},
                "Chest": (3 * math.sin(2 * p), 0, 3 * math.sin(p)),
                "Neck": (2 * math.sin(p), 0, 0),
                "Head": (4 * math.sin(2 * p) - tw * 8, 10 * math.sin(p) + tw * 16, 6 * math.sin(p * 0.5)),
                "ShoulderL": (4 * math.sin(p), 0, 0), "ShoulderR": (-4 * math.sin(p), 0, 0),
                "HandL": (6 * math.sin(p * 2), 0, 0)}

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
            return add(poses[name], {"Head": (j, 0, -j)})
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
    eye = mat("EmitShadeEye", "#ffffff", rough=0.5, emit="#f4f6ff", strength=8.0)
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

    m = rig.mb("Hips")
    blob(m, (0, 0.0, 0.92), (0.4, 0.3, 0.46), core, seed=21, amp=0.2, freq=2.5)
    blob(m, (0, 0.06, 0.92), (0.58, 0.42, 0.62), soft, seed=22, amp=0.25, freq=2.0)
    m = rig.mb("Chest")
    blob(m, (0, 0.0, 1.48), (0.42, 0.28, 0.42), core, seed=23, amp=0.18, freq=2.5)
    blob(m, (0, 0.08, 1.5), (0.6, 0.38, 0.55), soft, seed=24, amp=0.25, freq=2.0)
    for s in (-1, 1):                                                         # small eye pairs on the chest
        for (x, z, sp, r) in ((0.17, 1.66, 0.05, 0.016), (0.24, 1.12, 0.045, 0.013)):
            for e in (-1, 1):
                m.sphere((r, r * 0.6, r * 0.8), (s * x + e * sp / 2, -0.37, z), eye, segs=8, rings=5)
    m = rig.mb("Head")
    blob(m, (0, -0.02, 1.95), (0.25, 0.2, 0.24), core, seed=25, amp=0.12, freq=2.5)
    blob(m, (0, 0.08, 2.0), (0.34, 0.26, 0.34), soft, seed=26, amp=0.25, freq=2.0)
    for e in (-1, 1):
        m.sphere((0.03, 0.016, 0.026), (e * 0.07, -0.255, 1.96), eye, segs=10, rings=6)
    for k in range(4):                                                        # rising smoke horns
        a = 0.6 + k * 0.6
        m.tube(wiggle((0.15 * math.cos(a) - 0.1, 0.05, 2.1), (0.3 * math.cos(a) - 0.15, 0.1, 2.45 + 0.05 * k), 6, 0.06,
                      k + 30), lambda t: 0.07 * (1 - 0.85 * t), core, segs=6)
    for s, nm in ((1, "ArmL"), (-1, "ArmR")):
        m = rig.mb(nm)
        blob(m, (s * 0.42, 0.04, 1.42), (0.22, 0.2, 0.38), core, seed=27 + s, amp=0.22)
        blob(m, (s * 0.5, 0.1, 1.38), (0.3, 0.26, 0.45), soft, seed=29 + s, amp=0.3)
        for e in (-1, 1):
            m.sphere((0.02, 0.012, 0.017), (s * 0.4 + e * 0.03, -0.235, 1.55), eye, segs=8, rings=5)
        m.tube(wiggle((s * 0.5, 0.05, 1.2), (s * 0.75, 0.15, 0.4), 7, 0.1, 40 + s),
               lambda t: 0.09 * (1 - 0.8 * t), core, segs=6)
    for nm, a in wisps:
        m = rig.mb(nm)
        b = Vector((0.3 * math.cos(a), 0.22 * math.sin(a), 0.62))
        tip = Vector((0.62 * math.cos(a), 0.45 * math.sin(a) + 0.1, 0.02))
        m.tube(wiggle(b + Vector((0, 0, 0.12)), tip, 7, 0.12, 50 + int(a * 10)), lambda t: 0.13 * (1 - 0.88 * t), core,
               segs=7)
        m.tube(wiggle(b + Vector((0, 0.05, 0.1)), tip * 1.15 + Vector((0, 0.1, 0.0)), 6, 0.15, 60 + int(a * 10)),
               lambda t: 0.16 * (1 - 0.85 * t), soft, segs=6)
    rig.build()

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
    flesh = mat("EyeFlesh", "#5b3739", rough=0.3)
    lid = mat("EyeLid", "#83595a", rough=0.3)
    vein = mat("EyeTendril", "#2c181b", rough=0.25)
    ball = mat("EyeBall", "#040303", rough=0.08)
    glint = mat("EmitEyeGlint", "#ffffff", rough=0.5, emit="#ffffff", strength=1.2)
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

    m = rig.mb("Hips")                                                        # roots crawling to the floor
    for k, x in enumerate((-0.22, -0.08, 0.06, 0.2)):
        pts = wiggle((x * 0.8, -0.09, 1.28), (x * 2.2, -0.06, 0.0), 8, 0.09, 70 + k)
        m.tube(pts, lambda t: 0.05 * (1 - 0.6 * t), vein, segs=6)
        m.tube(wiggle(pts[3], (x * 3.2 + 0.1, -0.04, 0.35), 5, 0.05, 80 + k), lambda t: 0.022 * (1 - 0.8 * t), vein,
               segs=5)
    m = rig.mb("Head")
    blob(m, (0, -0.08, 1.5), (0.36, 0.12, 0.32), flesh, seed=31, amp=0.1, segs=18, rings=12)
    for i, (c, r) in enumerate((((0.3, -0.05, 1.64), (0.17, 0.1, 0.16)), ((-0.28, -0.05, 1.62), (0.16, 0.1, 0.16)),
                                ((0.16, -0.06, 1.26), (0.2, 0.1, 0.15)), ((-0.18, -0.06, 1.3), (0.18, 0.1, 0.14)),
                                ((0.0, -0.06, 1.8), (0.18, 0.1, 0.12)), ((0.02, -0.05, 1.2), (0.12, 0.09, 0.1)))):
        blob(m, c, r, flesh, seed=32 + i, amp=0.14, segs=12, rings=8)
    eyes = [((-0.14, 1.6), 0.078), ((0.13, 1.61), 0.074), ((0.0, 1.79), 0.046), ((-0.12, 1.37), 0.06),
            ((0.07, 1.35), 0.056), ((0.27, 1.43), 0.042), ((-0.29, 1.56), 0.04), ((0.3, 1.7), 0.03)]
    for i, ((x, z), r) in enumerate(eyes):
        yb = -0.215
        m.sphere((r * 1.4, 0.05, r * 1.25), (x, yb + 0.03, z), lid, segs=14, rings=8)
        m.sphere((r, r * 0.55, r * 0.85), (x, yb - 0.012, z), ball, segs=14, rings=8)
        m.sphere((r * 0.18, r * 0.1, r * 0.18), (x - r * 0.3, yb - 0.012 - r * 0.5, z + r * 0.3), glint, segs=6,
                 rings=4)
        n = 2 if r > 0.05 else 1
        for k in range(n):
            x0 = x + (k - (n - 1) / 2) * r * 0.6
            pts = [(x0, yb - 0.002, z - r * 0.8)]
            ln = 0.12 + r * 3 + 0.05 * k
            for j in range(1, 6):
                pts.append((x0 + 0.008 * math.sin(j * 1.9 + i), yb + 0.012 * j / 5 - 0.002, z - r * 0.8 - ln * j / 5))
            m.ribbon(pts, 0.014 if k == 0 else 0.01, tear, normal=(0, -1, 0))
    for nm, a, b in tendrils:
        m = rig.mb(nm)
        d = Vector((math.cos(a), 0, math.sin(a)))
        ln = 0.75 + 0.45 * random.Random(int(a * 100)).random()
        tip = b + d * ln + Vector((0, 0.04, 0))
        pts = wiggle(b, tip, 9, 0.12, int(a * 100), normal=(0, 1, 0))
        m.tube(pts, lambda t: 0.04 * (1 - 0.9 * t), vein, segs=6)
        for k, j in enumerate((3, 5)):                                    # branches
            p = pts[j]
            side = Vector((-d.z, 0, d.x)) * (1 if k == 0 else -1)
            bt = p + (d * 0.6 + side * 0.8).normalized() * (0.25 + 0.1 * k)
            m.tube(wiggle(p, bt, 5, 0.04, int(a * 100) + k), lambda t: 0.018 * (1 - 0.85 * t), vein, segs=5)
    rig.build()

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

    # body segments: prone human torsos fused end to end
    for i in range(5):
        m = rig.mb("Hips" if i == 0 else f"Seg{i}")
        y, z = seg_y[i], seg_z[i]
        blob(m, (0, y, z), (0.21, 0.27, 0.16), skin, seed=40 + i, amp=0.08, segs=10, rings=7)
        for s in (-1, 1):
            m.sphere((0.08, 0.1, 0.06), (s * 0.1, y + 0.12, z + 0.06), shade, segs=10, rings=6)   # shoulder blade
        for k in range(4):
            spike(m, (0, y - 0.15 + k * 0.1, z + 0.12), (0, y - 0.13 + k * 0.1, z + 0.15), 0.022, shade)
        if i % 2 == 1:
            m.sphere((0.06, 0.12, 0.05), (0.06 * (1 if i == 1 else -1), y, z + 0.1), raw, segs=8, rings=5)
    m = rig.mb("Seg4")                                                     # a head at the tail end, face down
    m.sphere((0.085, 0.11, 0.09), (0, 2.02, 0.48), skin, segs=12, rings=8)
    m.sphere((0.05, 0.03, 0.04), (0, 2.08, 0.43), mouth, segs=8, rings=5)
    m.limb((0, 1.82, 0.5), (0, 1.96, 0.49), 0.06, 0.055, skin, segs=8)

    # upright front torso
    m = rig.mb("Chest")
    torso(m, [(0.0, 0.6), (0.17, 0.62), (0.16, 0.8), (0.17, 1.0), (0.19, 1.18), (0.17, 1.3), (0.08, 1.36), (0.0, 1.37)],
          skin, sy=0.62, y=-0.02, segs=18)
    for k in range(3):
        for s in (-1, 1):
            m.sphere((0.05, 0.02, 0.035), (s * 0.05, -0.115, 0.82 + k * 0.08), shade, segs=8, rings=5)  # abs
    for s in (-1, 1):
        m.sphere((0.08, 0.04, 0.06), (s * 0.08, -0.11, 1.17), skin, segs=10, rings=6)
    m.sphere((0.06, 0.03, 0.08), (0.12, -0.1, 0.98), raw, segs=8, rings=5)

    # head cluster: screaming faces melting into each other
    m = rig.mb("Head")
    faces = [((0.0, -0.13, 1.5), 0, -5, 1.0), ((0.0, -0.08, 1.74), 0, 12, 0.95), ((0.14, -0.07, 1.6), 50, 0, 0.9),
             ((-0.14, -0.06, 1.6), -50, 0, 0.9), ((0.1, 0.0, 1.82), 80, 25, 0.8), ((-0.11, -0.01, 1.44), -70, -15, 0.8),
             ((0.06, 0.06, 1.95), 20, 40, 0.75)]
    for k, (c, yaw, pitch, sc) in enumerate(faces):
        M = Matrix.Translation(c) @ Matrix.Rotation(math.radians(yaw), 4, "Z") @ \
            Matrix.Rotation(math.radians(-pitch), 4, "X") @ Matrix.Scale(sc, 4)
        m.limb((0, -0.02, 1.3), c, 0.055, 0.05 * sc, skin, segs=6)
        m.sphere((0.072, 0.08, 0.125), (0, 0, 0), skin, segs=10, rings=7, M=M)               # long skull
        for sd in (-1, 1):
            m.sphere((0.02, 0.014, 0.016), (sd * 0.03, -0.07, 0.03), mouth, segs=6, rings=4, M=M)  # sockets
            m.tube([xf(M, (sd * 0.05, -0.04, 0.0)), xf(M, (sd * 0.05, -0.05, -0.08)), xf(M, (sd * 0.035, -0.04, -0.17))],
                   0.018, shade, segs=5)                                                      # sagging cheeks
        m.sphere((0.01, 0.014, 0.02), (0, -0.083, -0.005), skin, segs=6, rings=4, M=M)        # nose
        m.sphere((0.03, 0.03, 0.065 + 0.012 * (k % 2)), (0, -0.058, -0.085), mouth, segs=8, rings=6, M=M)  # scream
        m.sphere((0.04, 0.035, 0.03), (0, -0.03, -0.16), skin, segs=8, rings=5, M=M)          # stretched chin

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
            m.limb(sh, el, 0.048, 0.038, skin, segs=6)
            m.limb(el, ha, 0.037, 0.03, skin, segs=6)
            fwd = (ha - el).normalized()
            if k < 2:
                claw_fingers(m, ha, fwd, Vector((0, 0, 1)).cross(fwd) * -sx, 4, 0.09, 0.008, skin, nail,
                             spread=0.014, droop=-0.01, seed=k)
            else:
                m.sphere((0.04, 0.05, 0.015), ha + Vector((0, -0.02, -0.03)), skin, segs=8, rings=5)
                claw_fingers(m, ha + Vector((0, -0.05, -0.035)), (sx * 0.3, -1, 0), (1, 0, 0), 4, 0.08, 0.008, skin,
                             nail, spread=0.015, droop=0.01, seed=9)
    # legs along the body (alternating human legs and arms)
    for i in range(5):
        for s, sx in (("L", 1), ("R", -1)):
            m = rig.mb(f"Leg{s}{i}")
            b = Vector((sx * 0.15, seg_y[i] + 0.04, seg_z[i] - 0.04))
            kn = Vector((sx * 0.38, seg_y[i] + 0.0, seg_z[i] + 0.2))
            ft = Vector((sx * 0.46, seg_y[i] + 0.08, 0.04))
            if (i + (s == "R")) % 2 == 0:                                     # leg
                m.limb(b, kn, 0.07, 0.05, skin, segs=6, bulge=0.01)
                m.limb(kn, ft + Vector((0, 0, 0.03)), 0.048, 0.034, skin, segs=6)
                m.box((0.07, 0.17, 0.05), (ft.x, ft.y - 0.05, 0.025), skin, bevel=0.02, segs=1)
            else:                                                             # arm
                m.limb(b, kn, 0.05, 0.04, skin, segs=6)
                m.limb(kn, ft + Vector((0, 0, 0.02)), 0.037, 0.029, skin, segs=6)
                m.sphere((0.04, 0.05, 0.015), ft + Vector((0, -0.01, -0.01)), skin, segs=8, rings=5)
                claw_fingers(m, ft + Vector((0, -0.04, -0.015)), (sx * 0.4, -1, 0), (1, 0, 0), 3, 0.07, 0.007, skin,
                             nail, spread=0.013, droop=0.01, seed=20 + i)
    rig.build()

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
                          view=(1.4, -1.3, 0.55), humanoid=False, budget=20000)


ASSETS = {
    "entity_pale": entity_pale,
    "entity_masked": entity_masked,
    "entity_gaper": entity_gaper,
    "entity_shade": entity_shade,
    "entity_eyes": entity_eyes,
    "entity_centipede": entity_centipede,
}

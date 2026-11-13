"""Batch 18 residents built from the user's concept art.

  entity_spider  Laba-Laba Kaki  dark veined spider body walking on four huge
                                 hairy human legs (+ four thin spider legs), a
                                 pale long-haired woman hanging upside down
                                 from its maw, screaming
  entity_clock   Jam Kakek       weathered grandfather clock on two massive
                                 hairy human legs; trunk open on a long pink
                                 tongue hung on fleshy strings, brass pendulum

Same conventions as entities3.py: joint empties + <Joint>_geo meshes, the
creature faces Blender -Y (three.js +Z), geometry is written in world space,
clips are baked per frame from pose functions (rotation deltas in degrees).
Legs are driven by a small analytic two-bone IK so feet really plant and
step (Leg.solve), the rest of each pose is hand keyed.
"""
import bisect
import math
import random
from mathutils import Vector, Matrix, Euler
import hr_lib as L
from hr_lib import mat
from entities import (Rig, keyed, clip, sym, add, norm, crack, ellipsoid_point, mlimb, bulk, basis, ortho, hand,
                      eye, teeth_arc, displace, lerp3, arm_sculpt, _finish_entity)
from entities3 import blob, wiggle, xf

T = 2 * math.pi
UP = Vector((0, 0, 1))


# ---------------------------------------------------------------- helpers --
def thorns(mb, items, material):
    """Batch of 3-sided spikes [(base, tip, r)] -> 3 tris each (bristles)."""
    verts, faces = [], []
    for base, tip, r in items:
        b, t = Vector(base), Vector(tip)
        d = (t - b).normalized()
        a = d.orthogonal().normalized()
        c = d.cross(a)
        i = len(verts)
        for k in range(3):
            ang = T * k / 3
            verts.append(tuple(b + (a * math.cos(ang) + c * math.sin(ang)) * r))
        verts.append(tuple(t))
        faces += [(i, i + 1, i + 3), (i + 1, i + 2, i + 3), (i + 2, i, i + 3)]
    if verts:
        mb.raw(verts, faces, material, smooth=False)


def fur(mb, faces, n, ln, w, material, flow=None, seed=0, lean=0.6, sink=0.002):
    """n single-triangle hairs scattered over `faces` (area weighted), leaning
    along flow(p) (callable or vector, default down). Material double-sided."""
    rnd = random.Random(seed)
    faces = [f for f in faces if f.is_valid]
    if not faces:
        return
    acc, tot = [], 0.0
    for f in faces:
        f.normal_update()
        tot += f.calc_area()
        acc.append(tot)
    verts, tris = [], []
    for _ in range(n):
        f = faces[min(len(faces) - 1, bisect.bisect(acc, rnd.random() * tot))]
        vs = [v.co for v in f.verts]
        a, b = rnd.random(), rnd.random()
        if a + b > 1:
            a, b = 1 - a, 1 - b
        p = vs[0] + (vs[1] - vs[0]) * a + (vs[2] - vs[0]) * b
        nr = f.normal.copy()
        fl = Vector(flow(p) if callable(flow) else (flow or (0, 0, -1)))
        t = fl - nr * fl.dot(nr)
        if t.length < 1e-5:
            t = nr.orthogonal()
        t.normalize()
        j = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.35
        d = (nr * (1 - lean) + t * lean + j).normalized()
        if d.dot(nr) < 0.05:
            d = (d + nr * 0.3).normalized()
        ll = ln * rnd.uniform(0.55, 1.35)
        side = nr.cross(d)
        if side.length < 1e-5:
            side = d.orthogonal()
        side = side.normalized() * w * rnd.uniform(0.35, 0.6)
        base = p - nr * sink
        i = len(verts)
        verts += [tuple(base - side), tuple(base + side), tuple(base + d * ll)]
        tris.append((i, i + 1, i + 2))
    mb.raw(verts, tris, material, smooth=False)


def tint(mb, faces, material, pred):
    """Re-assign `material` to the faces (already in mb) where pred(face)."""
    if material not in mb.mats:
        mb.mats.append(material)
    mi = mb.mats.index(material)
    for f in faces:
        if f.is_valid:
            f.normal_update()
            if pred(f):
                f.material_index = mi


def frame3(a, b):
    a = Vector(a).normalized()
    b = Vector(b)
    b = (b - a * b.dot(a))
    b = b.normalized() if b.length > 1e-8 else a.orthogonal().normalized()
    c = a.cross(b)
    return Matrix((a, b, c)).transposed()


def deg(m3):
    e = m3.to_euler("XYZ")
    return (math.degrees(e.x), math.degrees(e.y), math.degrees(e.z))


def body_of(pose, name, pivot):
    """(R, pivot, dloc) of a joint whose parent is the scene root."""
    v = norm(pose).get(name, {"rot": (0, 0, 0), "loc": (0, 0, 0)})
    R = Euler([math.radians(a) for a in v["rot"]], "XYZ").to_matrix()
    return R, Vector(pivot), Vector(v["loc"])


class Leg:
    """Two-bone leg (hip -> knee -> ankle) on a root-parented body. solve()
    writes local rotation deltas for the three joints so the ankle reaches a
    world target; the knee stays in the plane of its rest pole."""

    def __init__(self, names, H, K, A):
        self.names = names
        self.H, self.K, self.A = Vector(H), Vector(K), Vector(A)
        self.l1 = (self.K - self.H).length
        self.l2 = (self.A - self.K).length
        self.n0 = (self.K - self.H).cross(self.A - self.H).normalized()
        ah = (self.A - self.H).normalized()
        self.pole = ((self.K - self.H) - ah * (self.K - self.H).dot(ah)).normalized()
        self.F0 = frame3(self.K - self.H, self.n0)
        self.G0 = frame3(self.A - self.K, self.n0)

    def solve(self, body, target, out, foot=None, pole_bias=None):
        R, P, dl = body
        l1, l2 = self.l1, self.l2
        H = P + dl + R @ (self.H - P)
        pole = R @ self.pole
        if pole_bias is not None:
            pole = (pole + Vector(pole_bias)).normalized()
        d = Vector(target) - H
        dist = max(abs(l1 - l2) + 1e-3, min(d.length, (l1 + l2) * 0.999))
        dn = d.normalized()
        ca = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))
        sa = math.sqrt(1 - ca * ca)
        pp = pole - dn * pole.dot(dn)
        pp = pp.normalized() if pp.length > 1e-6 else dn.orthogonal().normalized()
        K = H + dn * l1 * ca + pp * l1 * sa
        A = H + dn * dist
        n1 = (K - H).cross(A - H).normalized()
        R1 = frame3(K - H, n1) @ self.F0.transposed()
        R2 = frame3(A - K, n1) @ self.G0.transposed()
        out[self.names[0]] = deg(R.transposed() @ R1)
        out[self.names[1]] = deg(R1.transposed() @ R2)
        if self.names[2]:
            out[self.names[2]] = deg(R2.transposed() @ (foot if foot is not None else Matrix.Identity(3)))
        return out


def step(ph, stride, lift, duty):
    """In-place gait cycle: stance slides the foot from front (-Y) to back,
    swing lifts it and brings it forward. -> (dy, dz, swing_t or None)."""
    ph %= 1.0
    if ph < duty:
        t = ph / duty
        return stride * (t - 0.5), 0.0, None
    t = (ph - duty) / (1 - duty)
    s = t * t * (3 - 2 * t)
    return stride * (0.5 - s), lift * math.sin(math.pi * t), t


def foot_pitch(fwd, angle):
    """World rotation tipping a foot that points along fwd: + = toes down."""
    f = Vector((fwd[0], fwd[1], 0)).normalized()
    return Matrix.Rotation(math.radians(angle), 3, UP.cross(f))


def giant_leg(rig, names, H, K, A, skin, shade, hair, k=1.0, fur_n=(150, 130), fur_len=0.035, seed=0,
              lat=None, segs=12, fat=False, fur_w=0.01, hairy=None):
    """Sculpted bare human leg H->K->A (thigh on names[0], shin on names[1]),
    any orientation: the kneecap sits on the convex side of the knee.
    fat=True: smooth heavy sausage thigh (no separate muscle heads)."""
    H, K, A = Vector(H), Vector(K), Vector(A)
    u, v = (K - H).normalized(), (A - K).normalized()
    front = u - v
    front = front.normalized() if front.length > 0.05 else Vector((0, -1, 0))
    side = Vector(lat) if lat is not None else u.cross(v)
    side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
    lt, ls = (K - H).length, (A - K).length
    th, sh = rig.mb(names[0]), rig.mb(names[1])
    tf = []
    if fat:
        tf += mlimb(th, H - u * 0.02 * k, K, [(0, 0.12 * k), (0.3, 0.135 * k), (0.65, 0.13 * k), (1, 0.1 * k)],
                    skin, segs=segs, up=front)
        tf += bulk(th, H, K, 0.5, -front, 0.03 * k, 0.11 * k, 0.36 * lt, skin, segs=9, rings=6)
        tf += bulk(th, H, K, 0.62, front, 0.03 * k, 0.1 * k, 0.3 * lt, skin, segs=9, rings=6)
    else:
        tf += mlimb(th, H - u * 0.06 * k, K, [(0, 0.13 * k), (0.3, 0.12 * k), (0.7, 0.095 * k), (1, 0.08 * k)],
                    skin, segs=segs, up=front)
        tf += bulk(th, H, K, 0.47, front, 0.065 * k, 0.1 * k, 0.36 * lt, skin, segs=10, rings=7)       # quads
        tf += bulk(th, H, K, 0.4, -front, 0.06 * k, 0.095 * k, 0.36 * lt, skin, segs=10, rings=7)      # hamstring
        tf += bulk(th, H, K, 0.35, side, 0.045 * k, 0.085 * k, 0.3 * lt, skin, segs=9, rings=6)         # vastus lat.
        tf += bulk(th, H, K, 0.82, (front - side * 0.5).normalized(), 0.045 * k, 0.065 * k, 0.12 * lt, skin,
                   segs=9, rings=6)                                                                   # teardrop
    sf = []
    a0 = K - v * 0.06 * k
    sf += mlimb(sh, a0, A, [(0, 0.095 * k), (0.3, 0.088 * k), (0.7, 0.062 * k), (1, 0.048 * k)], skin, segs=segs,
                up=front)
    sf += bulk(sh, K, A, 0.27, -front, 0.055 * k, 0.09 * k, 0.26 * ls, skin, segs=9, rings=6)        # calf
    sf += bulk(sh, K, A, 0.3, (-front + side * 0.8).normalized(), 0.04 * k, 0.065 * k, 0.2 * ls, skin,
               segs=7, rings=5)                                                                       # soleus
    sf += bulk(sh, K, A, 0.33, (front + side).normalized(), 0.025 * k, 0.05 * k, 0.24 * ls, skin, segs=7,
               rings=5)                                                                               # tibialis
    # knee: patella + bony condyles, wrinkles above the cap
    sh.sphere((0.062 * k, 0.05 * k, 0.07 * k), (0, 0, 0), skin, segs=8, rings=6,
              M=basis(K + front * 0.06 * k, side, front, (u + (-v)).normalized().cross(side).normalized()))
    for o in (-1, 1):
        sh.sphere((0.07 * k,) * 3, K + side * o * 0.03 * k, skin, segs=7, rings=5)
    for i in range(3):
        c = K - u * (0.06 + 0.035 * i) * k + front * (0.085 - 0.004 * i) * k
        sh.tube([c - side * 0.05 * k, c + front * 0.008 * k, c + side * 0.05 * k], 0.008 * k, shade, segs=4)
    # shin ridge, ankle bones, Achilles tendon
    for o in (-1, 1):
        sh.sphere((0.026 * k,) * 3, A + side * o * 0.048 * k + Vector((0, 0, 0.01)), skin, segs=6, rings=4)
    sh.tube([lerp3(K, A, 0.55) - front * 0.06 * k, lerp3(K, A, 0.85) - front * 0.05 * k, A - front * 0.06 * k
             + Vector((0, 0, -0.04 * k))], lambda q: (0.03 - 0.008 * q) * k, skin, segs=6)
    # veins on the shin
    rnd = random.Random(seed)
    for i in range(2):
        o = (-1) ** i
        pts = [lerp3(K, A, 0.3 + 0.12 * j) + side * o * (0.07 + 0.01 * math.sin(j * 1.7 + i)) * k
               - front * 0.02 * k + Vector((rnd.uniform(-1, 1) * 0.005, 0, 0)) for j in range(6)]
        sh.tube(pts, 0.004 * k, shade, segs=4)
    if hairy is not None:
        # darker hair-covered skin over the back and outer side, in patches
        def dense(f):
            c = f.calc_center_median()
            n = f.normal
            g = math.sin(c.x * 47 + seed) * math.sin(c.y * 41 + 1.3 * seed) * math.sin(c.z * 43 + 0.5)
            return n.dot(-front) * 0.8 + n.dot(side) * 0.3 + 0.45 * g > -0.05
        tint(th, tf, hairy, dense)
        tint(sh, sf, hairy, dense)
    fur(th, tf, fur_n[0], fur_len * k, fur_w * k, hair, flow=-u * 0.3 + v, seed=seed + 1)
    fur(sh, sf, fur_n[1], fur_len * k, fur_w * k, hair, flow=v, seed=seed + 2)


def bare_foot(mb, A, fwd, inner, Lf, skin, shade, nail, hair=None, toe_up=0.0, nail_len=1.0, seed=0,
              toe_len=1.0, segs=10, fur_n=40):
    """Big bare human foot under ankle A, sole on z=0, toes along fwd;
    inner = +1/-1 which side (relative to fwd x up) the big toe is on."""
    A = Vector(A)
    f = Vector((fwd[0], fwd[1], 0)).normalized()
    s = f.cross(UP).normalized()                  # right of the foot
    s_in = s * inner
    base = Vector((A.x, A.y, 0.0))
    w = 0.4 * Lf
    M = basis
    faces = []
    faces += mb.sphere((w * 0.42, Lf * 0.17, Lf * 0.14), (0, 0, 0), skin, segs=segs, rings=6,
                       M=M(base - f * 0.12 * Lf + UP * 0.135 * Lf, s, f, UP))                     # heel
    faces += mb.sphere((w * 0.5, Lf * 0.36, Lf * 0.12), (0, 0, 0), skin, segs=segs + 2, rings=7,
                       M=M(base + f * 0.2 * Lf + UP * 0.11 * Lf - s_in * 0.03 * Lf, s, f, UP))       # body
    faces += mlimb(mb, A + UP * 0.02 * Lf - f * 0.02 * Lf, base + f * 0.22 * Lf + UP * 0.17 * Lf,
                   [(0, 0.15 * Lf), (1, 0.12 * Lf)], skin, segs=segs)                                # ankle->instep
    ball = base + f * 0.52 * Lf + UP * 0.075 * Lf
    faces += mb.sphere((w * 0.56, Lf * 0.1, Lf * 0.08), (0, 0, 0), skin, segs=segs, rings=6,
                       M=M(ball + s_in * 0.02 * Lf, s, f, UP))                                     # ball
    # toes: big toe on the inner side, then four smaller
    rel = [(0.36, 0.22, 0.085), (0.13, 0.17, 0.056), (-0.07, 0.15, 0.052), (-0.24, 0.13, 0.048),
           (-0.39, 0.11, 0.044)]
    rnd = random.Random(seed)
    for i, (off, ln, r) in enumerate(rel):
        ln *= Lf * toe_len * rnd.uniform(0.95, 1.05)
        r *= Lf
        root = ball + s_in * off * w * 1.15 + f * (0.06 - abs(off) * 0.08) * Lf + UP * 0.005 * Lf
        d = (f + s_in * off * 0.25).normalized()
        p1 = root + d * ln * 0.45 + UP * (0.25 * r + toe_up)
        p2 = root + d * ln * 0.85 + UP * (0.05 * r)
        tip = Vector((p2.x, p2.y, r * 0.95))
        pts = [root, p1, p2, tip + d * r * 0.2]
        mb.tube(pts, lambda q, r=r: r * (1.0 - 0.15 * q), skin, segs=7 if i == 0 else 5, caps=False)
        mb.sphere((r * 0.98, r * 1.05, r * 0.95), tip + d * r * 0.1, skin, segs=7 if i == 0 else 5, rings=4)
        mb.sphere((r * 1.05, r * 0.6, r * 0.75), p1 + UP * r * 0.1, shade, segs=5, rings=3)         # knuckle
        # nail: thick plate on top of the tip, overhanging forward
        nl = r * (1.5 if i == 0 else 1.2) * nail_len
        c = tip + UP * r * 0.75 + d * r * 0.35
        sv = d.cross(UP).normalized()
        mb.sphere((r * 0.82, nl * 0.62, r * 0.3), (0, 0, 0), nail, segs=6, rings=3,
                  M=M(c, sv, d, UP) @ Matrix.Rotation(math.radians(-14), 4, "X"))
    # tendons on the top of the foot
    for i in range(3):
        o = 0.25 - i * 0.22
        mb.tube([A + f * 0.06 * Lf + s_in * o * 0.12 * Lf, base + f * 0.36 * Lf + s_in * o * w * 0.8 + UP *
                 0.15 * Lf, ball + s_in * o * w * 1.1 + UP * 0.07 * Lf], 0.012 * Lf, skin, segs=4)
    if hair is not None:
        fur(mb, faces, fur_n, 0.06 * Lf, 0.012 * Lf, hair, flow=f, seed=seed + 7)


def cones(mb, items, material, segs=5):
    """Batch of smooth open cones [(base, tip, r)] -> segs tris each (teeth)."""
    verts, faces = [], []
    for base, tip, r in items:
        b, t = Vector(base), Vector(tip)
        d = (t - b).normalized()
        a = d.orthogonal().normalized()
        c = d.cross(a)
        i = len(verts)
        for k in range(segs):
            ang = T * k / segs
            verts.append(tuple(b + (a * math.cos(ang) + c * math.sin(ang)) * r))
        verts.append(tuple(t))
        faces += [(i + k, i + (k + 1) % segs, i + segs) for k in range(segs)]
    if verts:
        mb.raw(verts, faces, material, smooth=True)


def thin_arm(mb_up, mb_fore, sh, el, wr, sx, skin, k=1.0):
    """Gaunt arm, cheaper than entities.arm_sculpt: bone cores + a few lean
    muscle heads, knobbly elbow."""
    sh, el, wr = Vector(sh), Vector(el), Vector(wr)
    fwd = Vector((0, -1, 0))
    out = Vector((sx, 0, 0))
    mlimb(mb_up, sh, el, [(0, 0.036 * k), (0.4, 0.028 * k), (1, 0.024 * k)], skin, segs=8, up=fwd)
    bulk(mb_up, sh, el, 0.12, out, 0.01 * k, 0.04 * k, 0.07 * k, skin, segs=8, rings=5)          # deltoid
    bulk(mb_up, sh, el, 0.45, fwd, 0.01 * k, 0.026 * k, 0.09 * k, skin, segs=7, rings=5)         # biceps
    a = el + (el - wr).normalized() * 0.02 * k
    mlimb(mb_fore, a, wr, [(0, 0.025 * k), (0.55, 0.019 * k), (1, 0.016 * k)], skin, segs=8, sx=1.2, up=fwd)
    bulk(mb_fore, el, wr, 0.28, (out + fwd).normalized(), 0.008 * k, 0.026 * k, 0.1 * k, skin, segs=7, rings=5)
    mb_fore.sphere((0.02 * k,) * 3, el + (el - wr).normalized() * 0.005, skin, segs=6, rings=4)


def strand(mb, pts, r0, r1, material, segs=4):
    mb.tube(pts, lambda q: r0 + (r1 - r0) * q, material, segs=segs, caps=False)


# ======================================================= LABA-LABA KAKI ===
def entity_spider():
    shell = mat("SpiderShell", "#2b2530", rough=0.42)
    plate = mat("SpiderPlate", "#3a3240", rough=0.38)
    belly = mat("SpiderBelly", "#211b20", rough=0.6)
    vein = mat("EmitSpiderVein", "#a77bff", emit="#8d5cff", strength=3.5, rough=0.4)
    eyeg = mat("EmitSpiderEye", "#e2c8ff", emit="#c49cff", strength=5.0)
    bristle = mat("SpiderBristle", "#141012", rough=0.7, double=True)
    gum = mat("SpiderGum", "#7a5056", rough=0.3)
    gum_d = mat("SpiderGumDark", "#4a2a31", rough=0.4)
    maw = mat("SpiderMaw", "#0e0507", rough=0.8)
    tooth = mat("SpiderTooth", "#a39377", rough=0.35)
    leg = mat("SpiderLegSkin", "#7e6567", rough=0.55)
    leg_d = mat("SpiderLegShade", "#5f4648", rough=0.6)
    hair = mat("SpiderLegHair", "#2e2324", rough=0.8, double=True)
    leg_h = mat("SpiderLegHairy", "#5c4648", rough=0.75)
    nail = mat("SpiderToenail", "#6f5c45", rough=0.4)
    chitin = mat("SpiderChitin", "#18131a", rough=0.35)
    # the hanging woman
    pale = mat("WomanSkin", "#a39694", rough=0.38)
    pale_d = mat("WomanShade", "#7b6a6c", rough=0.45)
    lips = mat("WomanLips", "#5d3b41", rough=0.35)
    mouth = mat("WomanMouth", "#170507", rough=0.8)
    sclera = mat("WomanSclera", "#cfc6b8", rough=0.2)
    iris = mat("WomanIris", "#120d0d", rough=0.2)
    socket = mat("WomanSocket", "#2e1b1e", rough=0.6)
    hairw = mat("WomanHair", "#0c0a0b", rough=0.55, double=True)
    rag = mat("WomanRag", "#2e2c2b", rough=0.95, double=True)
    wnail = mat("WomanNail", "#3d2d2d", rough=0.4)

    C1, R1 = Vector((0, -0.08, 1.27)), (0.48, 0.46, 0.37)         # cephalothorax
    C2, R2 = Vector((0, 0.64, 1.5)), (0.57, 0.58, 0.47)           # abdomen
    CF, RF = Vector((0, -0.45, 1.19)), (0.25, 0.15, 0.24)         # face plate

    W = Matrix.Translation((0, -0.6, 1.02)) @ Matrix.Rotation(math.pi, 4, "Y") @ Matrix.Scale(1.1, 4)  # woman

    def w(x, y, z):
        return W @ Vector((x, y, z))

    rig = Rig()
    rig.joint("Hips", (0, -0.05, 1.22))
    rig.joint("Abdomen", (0, 0.16, 1.36), "Hips")
    for s, sx in (("L", 1), ("R", -1)):
        rig.joint("Fang" + s, (sx * 0.13, -0.56, 1.13), "Hips")
    rig.joint("Spine", tuple(w(0, 0, 0.02)), "Hips")
    rig.joint("Chest", tuple(w(0, 0, 0.24)), "Spine")
    rig.joint("Head", tuple(w(0, -0.015, 0.6)), "Chest")
    arm = {}
    for s, sx in (("L", 1), ("R", -1)):
        sh = w(-sx * 0.155, 0.0, 0.425)
        el = Vector((sx * 0.37, -0.66, 0.37))
        wr = Vector((sx * 0.41, -0.76, 0.14))
        arm[s] = (sh, el, wr)
        rig.joint("Shoulder" + s, tuple(sh), "Chest")
        rig.joint("Elbow" + s, tuple(el), "Shoulder" + s)
        rig.joint("Hand" + s, tuple(wr), "Elbow" + s)

    # human legs: front pair splays forward, rear pair backward, knees high
    legs = {}
    for s, sx in (("L", 1), ("R", -1)):
        for i, (az, hy, hz, kz, reach, kreach) in enumerate(((42, -0.26, 1.2, 2.12, 0.82, 0.24),
                                                           (-42, 0.24, 1.3, 2.04, 0.84, 0.24))):
            a = math.radians(az)
            dv = Vector((sx * math.cos(a), -math.sin(a), 0))
            H = Vector((sx * 0.38, hy, hz))
            K = H + dv * kreach
            K.z = kz
            A = H + dv * reach
            A.z = 0.2
            names = (f"Hip{s}{i}", f"Knee{s}{i}", f"Foot{s}{i}")
            rig.joint(names[0], tuple(H), "Hips")
            rig.joint(names[1], tuple(K), names[0])
            rig.joint(names[2], tuple(A), names[1])
            ff = (Vector((sx * 0.3, -1, 0)) if i == 0 else Vector((sx * 0.45, 1, 0))).normalized()
            legs[(s, i)] = (Leg(names, H, K, A), ff, dv)
    # thin spider legs under the front
    slegs = {}
    for s, sx in (("L", 1), ("R", -1)):
        for i, (c, k_, t_) in enumerate((((0.17, -0.4, 1.02), (0.5, -0.74, 1.24), (0.55, -1.12, 0.0)),
                                         ((0.22, -0.2, 0.99), (0.6, -0.36, 1.12), (0.7, -0.42, 0.0)))):
            c, k_, t_ = Vector((sx * c[0], c[1], c[2])), Vector((sx * k_[0], k_[1], k_[2])), \
                Vector((sx * t_[0], t_[1], t_[2]))
            names = (f"SLeg{s}{i}", f"STib{s}{i}", None)
            rig.joint(names[0], tuple(c), "Hips")
            rig.joint(names[1], tuple(k_), names[0])
            slegs[(s, i)] = Leg(names, c, k_, t_)

    rnd = random.Random(7)
    # ---------------------------------------------------------------- body
    m = rig.mb("Hips")
    m.sphere(R1, C1, shell, segs=20, rings=13)
    m.sphere((0.3, 0.36, 0.2), C1 + Vector((0, 0.02, -0.12)), belly, segs=10, rings=6)
    # carapace plates (veins glow in the gaps between them)
    for k in range(5):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-0.9, 0.7), rnd.uniform(0.3, 1.0)))
        p, n = ellipsoid_point(C1, R1, d)
        blob(m, p - n * 0.04, (rnd.uniform(0.09, 0.13), rnd.uniform(0.1, 0.14), 0.06), plate, seed=k, amp=0.18,
             segs=9, rings=6)
    for k in range(13):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 0.6), rnd.uniform(-0.1, 1.0)))
        crack(m, rnd, C1, tuple(r * 1.005 for r in R1), d, rnd.randint(7, 11), vein, width=0.012, lift=0.006,
              step=0.045)
    # face plate: brow, sunken eyes, nose pits, cheek ridges
    blob(m, CF, RF, shell, seed=11, amp=0.06, segs=14, rings=10)
    for sx in (-1, 1):
        m.tube([(sx * 0.02, -0.6, 1.33), (sx * 0.1, -0.6, 1.36), (sx * 0.19, -0.54, 1.31), (sx * 0.24, -0.44, 1.24)],
               lambda q: 0.035 - 0.015 * q, plate, segs=7)                                   # brow ridge
        m.sphere((0.045, 0.03, 0.035), (sx * 0.095, -0.585, 1.285), maw, segs=8, rings=5)     # socket
        m.sphere((0.016,) * 3, (sx * 0.095, -0.605, 1.285), eyeg, segs=7, rings=4)           # glowing eye
        for j in range(2):                                                                  # small eyes
            m.sphere((0.011,) * 3, (sx * (0.05 + 0.07 * j), -0.555 + 0.02 * j, 1.38 + 0.01 * j), eyeg, segs=5,
                     rings=3)
        m.tube([(sx * 0.06, -0.6, 1.22), (sx * 0.16, -0.56, 1.16), (sx * 0.22, -0.47, 1.06)], 0.026, plate,
               segs=7)                                                                     # cheek ridge
        m.sphere((0.012, 0.01, 0.016), (sx * 0.025, -0.618, 1.215), maw, segs=6, rings=4)     # nose pit
        m.tube([(sx * 0.07, -0.58, 1.12), (sx * 0.12, -0.6, 1.02), (sx * 0.1, -0.62, 0.95)], 0.028, gum, segs=7)
    m.limb((0, -0.6, 1.33), (0, -0.625, 1.23), 0.03, 0.022, plate, segs=8)                     # nose bridge
    for k in range(8):
        d = Vector((rnd.uniform(-1, 1), -1, rnd.uniform(-0.4, 0.8)))
        crack(m, rnd, CF, tuple(r * 1.02 for r in RF), d, rnd.randint(5, 8), vein, width=0.009, lift=0.004,
              step=0.06)
    # maw: ridged fleshy lips round the woman's waist, rows of teeth
    mc = Vector((0, -0.6, 1.06))
    ring = [mc + Vector((0.14 * math.cos(T * k / 16), 0.11 * math.sin(T * k / 16), 0.02 * math.sin(2 * T * k / 16)))
            for k in range(17)]
    m.tube(ring, lambda q: 0.026 + 0.008 * math.sin(q * T * 4), gum_d, segs=5, caps=False)
    m.sphere((0.13, 0.1, 0.06), mc + Vector((0, 0, 0.03)), maw, segs=12, rings=6)
    for k in range(9):                                                     # ridged flesh folds round the maw
        a = math.pi * (0.1 + 0.8 * k / 8)
        x = -0.15 * math.cos(a)
        y = -0.6 - 0.1 * math.sin(a)
        m.tube([(x * 0.7, y + 0.03, 1.2), (x * 1.0, y - 0.015, 1.13), (x * 1.08, y - 0.02, 1.07)],
               lambda q: 0.02 - 0.007 * q, gum if k % 2 else gum_d, segs=6)
    tr = random.Random(4)
    items = []
    for p in ring[:-1]:
        if tr.random() < 0.3:
            continue
        o = ((p - mc).normalized() * -tr.uniform(0.2, 0.7) + Vector((tr.uniform(-.3, .3), 0, -1))).normalized()
        items.append((p, p + o * tr.uniform(0.015, 0.05), tr.uniform(0.006, 0.01)))
    for k in range(10):                                                    # inner row, smaller and crooked
        a = T * k / 10 + 0.2
        p = mc + Vector((0.1 * math.cos(a), 0.075 * math.sin(a), 0.03))
        items.append((p, p + Vector((tr.uniform(-.01, .01), tr.uniform(-.01, .01), -tr.uniform(0.025, 0.04))),
                      0.006))
    cones(m, items, tooth, segs=5)
    # bristles on the head
    items = []
    for k in range(45):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.0, 1.0)))
        p, n = ellipsoid_point(C1, R1, d)
        ln = rnd.uniform(0.05, 0.13)
        items.append((p - n * 0.01, p + (n + Vector((rnd.uniform(-.4, .4), rnd.uniform(0, .5), 0.3))).normalized()
                      * ln, 0.006))
    thorns(m, items, bristle)

    # abdomen: big veined bulb with plates and bristles
    m = rig.mb("Abdomen")
    m.sphere(R2, C2, shell, segs=20, rings=14)
    for k in range(6):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-0.6, 1), rnd.uniform(-0.2, 1.0)))
        p, n = ellipsoid_point(C2, R2, d)
        blob(m, p - n * 0.05, (rnd.uniform(0.11, 0.16), rnd.uniform(0.12, 0.17), 0.07), plate, seed=20 + k,
             amp=0.18, segs=9, rings=6)
    for k in range(16):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 1.0)))
        crack(m, rnd, C2, tuple(r * 1.005 for r in R2), d, rnd.randint(8, 12), vein, width=0.014, lift=0.006,
              step=0.04)
    m.sphere((0.08, 0.06, 0.06), C2 + Vector((0, 0.49, -0.08)), belly, segs=8, rings=5)          # spinnerets
    items = []
    for k in range(60):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 1.0)))
        p, n = ellipsoid_point(C2, R2, d)
        ln = rnd.uniform(0.06, 0.16)
        items.append((p - n * 0.01, p + (n + Vector((0, 0.5, 0))).normalized() * ln, 0.007))
    thorns(m, items, bristle)
    m.limb(C1 + Vector((0, 0.3, 0.02)), C2 + Vector((0, -0.35, -0.1)), 0.18, 0.22, belly, segs=8)    # pedicel

    # fangs (chelicerae) either side of the maw
    for s, sx in (("L", 1), ("R", -1)):
        m = rig.mb("Fang" + s)
        b = Vector((sx * 0.13, -0.56, 1.14))
        k1 = Vector((sx * 0.17, -0.66, 1.0))
        tip = Vector((sx * 0.1, -0.7, 0.86))
        m.limb(b, k1, 0.05, 0.04, shell, segs=10, bulge=0.01)
        crack(m, rnd, (b + k1) / 2, (0.05, 0.05, 0.09), (sx, -1, 0), 4, vein, width=0.007, lift=0.004, step=0.1)
        m.tube([k1, k1 + Vector((sx * 0.0, -0.03, -0.07)), tip], lambda q: 0.03 * (1 - 0.9 * q), chitin, segs=7)
        thorns(m, [(lerp3(b, k1, q) + Vector((sx * 0.04, -0.02, 0)),
                    lerp3(b, k1, q) + Vector((sx * 0.1, -0.04, -0.02)), 0.005) for q in (0.2, 0.45, 0.7)], bristle)

    # ---------------------------------------------------- the hanging woman
    hc = (0, -0.015, 0.63)
    m = rig.mb("Spine")
    m.lathe([(0, -0.16), (0.08, -0.155), (0.125, -0.07), (0.128, 0.02), (0.108, 0.11), (0.1, 0.19), (0.1, 0.245)],
            pale, M=W, segs=16, sy=0.62)
    m.sphere((0.008, 0.005, 0.01), w(0, -0.072, 0.07), pale_d, segs=6, rings=4)                 # navel
    for k in range(4):                                                       # lower ribs / spine bumps
        m.sphere((0.012, 0.01, 0.014), w(0, 0.066, 0.02 + 0.05 * k), pale_d, segs=5, rings=3)
    m = rig.mb("Chest")
    m.lathe([(0.1, 0.18), (0.112, 0.27), (0.125, 0.34), (0.135, 0.4), (0.12, 0.445), (0.07, 0.475), (0, 0.48)],
            pale, M=W, segs=18, sy=0.6)
    for k in range(4):                                                       # ribs show through
        z = 0.37 - k * 0.04
        sc = 1 - k * 0.04
        for sx in (-1, 1):
            pts = [w(sx * 0.13 * sc * math.sin(a), -0.079 * sc * math.cos(a), z - 0.03 * (1 - q))
                   for q, a in ((i / 6, 0.35 + 1.4 * i / 6) for i in range(7))]
            m.tube(pts[::2] if len(pts) > 4 else pts, lambda q: 0.0055 * (0.6 + 0.4 * math.sin(q * math.pi)), pale_d,
                   segs=3)
    m.limb(w(0, -0.078, 0.33), w(0, -0.08, 0.43), 0.012, 0.012, pale, segs=6)                   # sternum
    for sx in (-1, 1):
        m.tube([w(sx * 0.015, -0.07, 0.448), w(sx * 0.08, -0.07, 0.462), w(sx * 0.14, -0.035, 0.455)], 0.011,
               pale, segs=6)                                                 # clavicle
        m.sphere((0.05, 0.04, 0.045), w(sx * 0.07, -0.05, 0.36), pale, segs=8, rings=5)      # small breast
        m.sphere((0.05, 0.03, 0.06), w(sx * 0.07, 0.05, 0.4), pale, segs=8, rings=5)         # shoulder blade
    m.limb(w(0, 0.0, 0.44), w(0, -0.01, 0.57), 0.045, 0.036, pale, segs=8)                   # neck
    for sx in (-1, 1):
        m.tube([w(sx * 0.035, -0.02, 0.45), w(sx * 0.03, -0.04, 0.51), w(sx * 0.03, -0.035, 0.565)], 0.009, pale,
               segs=5)                                                       # neck tendons
    # ragged dark top fallen down over the chest toward the shoulders
    rf = m.lathe([(0.125, 0.25), (0.135, 0.3), (0.146, 0.37), (0.152, 0.42), (0.17, 0.46)], rag, M=W,
                 segs=20, sy=0.66, close=False)
    jr = random.Random(5)
    ph = [jr.uniform(0, T) for _ in range(4)]

    def ragfn(co):
        a = math.atan2(co.y + 0.6, co.x)
        dz = 0.0
        if co.z < 0.55:
            dz = 0.03 * (math.sin(a * 7 + ph[0]) + 0.6 * math.sin(a * 13 + ph[1]) + 0.4 * math.sin(a * 23)) + 0.02
        rr = 0.015 * math.sin(a * 9 + ph[2]) * (0.9 - co.z)
        return (math.cos(a) * rr, math.sin(a) * rr, dz)
    displace(rf, ragfn)
    for k in range(14):                                                      # hanging rag strips
        a = T * k / 14 + jr.uniform(-0.2, 0.2)
        if math.sin(a) < -0.6:                                               # keep the face clear
            continue
        x0, y0 = 0.19 * math.cos(a), -0.6 + 0.13 * math.sin(a)
        z0 = 0.54 + jr.uniform(-0.03, 0.03)
        ln = jr.uniform(0.12, 0.3)
        pts = [Vector((x0, y0, z0)), Vector((x0 * 1.04, y0, z0 - ln * 0.35)),
               Vector((x0 * 1.07 + jr.uniform(-.02, .02), y0, z0 - ln * 0.7)),
               Vector((x0 * 1.08, y0 + jr.uniform(-.02, .02), z0 - ln))]
        m.ribbon(pts, jr.uniform(0.02, 0.05), rag, normal=(math.cos(a), math.sin(a), 0))

    # head: gaunt skull hung upside down, mouth stretched open in a scream
    m = rig.mb("Head")
    m.sphere((0.074, 0.09, 0.098), (0, 0.006, 0.635), pale, segs=14, rings=10, M=W)
    m.sphere((0.083, 0.1, 0.105), (0, 0.024, 0.645), hairw, segs=12, rings=8, M=W)                # hair cap
    for sx in (-1, 1):
        m.sphere((0.024, 0.02, 0.02), (sx * 0.046, -0.068, 0.626), pale, segs=6, rings=4, M=W)     # cheekbone
        m.sphere((0.026, 0.016, 0.022), (sx * 0.031, -0.077, 0.652), socket, segs=8, rings=5, M=W)   # socket
        eye(m, w(sx * 0.031, -0.083, 0.652), (0, -1, 0), 0.0115, sclera, iris, iris, iris_r=0.45,
            up=(0, 0, -1), segs=8)
        m.tube([w(sx * 0.052, -0.07, 0.668), w(sx * 0.03, -0.088, 0.676), w(sx * 0.008, -0.088, 0.672)], 0.008,
               pale, segs=5)                                                 # brow
        m.tube([w(sx * 0.05, -0.068, 0.6), w(sx * 0.035, -0.06, 0.56), w(sx * 0.024, -0.05, 0.53)], 0.012, pale_d,
               segs=5)                                                       # hollow cheek line
        m.sphere((0.006, 0.006, 0.005), w(sx * 0.008, -0.1, 0.616), mouth, segs=6, rings=4)          # nostril
    m.limb(w(0, -0.09, 0.66), w(0, -0.104, 0.62), 0.0075, 0.012, pale, segs=6)                   # nose
    m.sphere((0.027, 0.03, 0.044), (0, -0.075, 0.565), mouth, segs=10, rings=6, M=W)              # scream
    lp = [w(0.029 * math.sin(T * k / 14), -0.093 + 0.006 * abs(math.sin(T * k / 14)), 0.566 + 0.045 *
            math.cos(T * k / 14)) for k in range(15)]
    m.tube(lp, 0.0075, lips, segs=6, caps=False)
    cones(m, [(w(-0.016 + 0.008 * k, -0.085, 0.604), w(-0.016 + 0.008 * k, -0.087, 0.59), 0.0045)
              for k in range(5)], tooth, segs=5)                             # top teeth
    m.sphere((0.033, 0.028, 0.022), (0, -0.07, 0.505), pale, segs=10, rings=6, M=W)               # dropped chin
    for sx in (-1, 1):
        m.tube([w(sx * 0.065, -0.02, 0.6), w(sx * 0.05, -0.05, 0.53), w(sx * 0.022, -0.068, 0.505)], 0.013, pale,
               segs=6)                                                       # jaw line
    # long black hair falling to the floor
    hr = random.Random(9)
    for k in range(28):
        th = hr.uniform(0.0, 1.0) * 0.5 * math.pi + 0.05
        ph_ = hr.uniform(0, T)
        if math.sin(ph_) < -0.55 and th > 0.9:          # keep the face clear
            ph_ += math.pi
        dl = Vector((math.sin(th) * math.cos(ph_), math.sin(th) * math.sin(ph_) * 1.0, math.cos(th)))
        sp = w(hc[0] + dl.x * 0.085, hc[1] + 0.01 + dl.y * 0.1, hc[2] + dl.z * 0.1)
        end = Vector((sp.x * 1.9 + hr.uniform(-0.05, 0.05), sp.y + (sp.y + 0.6) * 0.8 + hr.uniform(-0.04, 0.05),
                      hr.uniform(0.01, 0.07)))
        pts = wiggle(sp, end, 6, hr.uniform(0.01, 0.035), seed=k, normal=(0, 1, 0))
        if k % 2 == 0:
            m.ribbon(pts, hr.uniform(0.03, 0.05), hairw, normal=((sp.x, sp.y + 0.6, 0.001)))
        else:
            strand(m, pts, hr.uniform(0.008, 0.013), 0.003, hairw, segs=4)

    # arms dangling to the floor, fingers clawed
    for s, sx in (("L", 1), ("R", -1)):
        sh, el, wr = arm[s]
        thin_arm(rig.mb("Shoulder" + s), rig.mb("Elbow" + s), sh, el, wr, sx, pale, k=1.2)
        mu = rig.mb("Shoulder" + s)
        for k in range(3):                                                   # rag sleeve strips
            a = sh + Vector((sx * 0.03, -0.02 + 0.03 * k, -0.04))
            mu.ribbon([a, a + Vector((sx * 0.02, 0, -0.12)), a + Vector((sx * 0.035, 0.01, -0.22 - 0.03 * k))], 0.035,
                      rag, normal=(sx, 0, 0))
        mf = rig.mb("Elbow" + s)
        mf.tube([lerp3(el, wr, 0.1) + Vector((sx * 0.01, -0.012, 0)), lerp3(el, wr, 0.6) + Vector((0, -0.016, 0)),
                 wr + Vector((0, -0.01, 0.01))], 0.0035, pale_d, segs=4)     # vein
        mh = rig.mb("Hand" + s)
        d = (wr - el).normalized()
        hand(mh, wr, (d + Vector((sx * 0.25, -0.15, -0.3))).normalized(), Vector((-sx, -0.35, 0)), (0, -1, 0), 0.095,
             pale, wnail, curl=0.5, r=0.0066, spread=1.35, splay=0.3, bony=1.4, seed=3 + (sx > 0), thumb_curl=0.35,
             claw=0.012, segs=5, knuckles=False)

    # ------------------------------------------------- giant human legs
    for (s, i), (lg, ff, dv) in legs.items():
        sx = 1 if s == "L" else -1
        giant_leg(rig, lg.names, lg.H, lg.K, lg.A, leg, leg_d, hair, k=1.9, fur_n=(620, 580), fur_len=0.05,
                  seed=i * 10 + sx, segs=12, fur_w=0.0075, hairy=leg_h)
        # carapace cuff wrapping the thigh root, veined
        mth = rig.mb(lg.names[0])
        u = (lg.K - lg.H).normalized()
        cuff = mlimb(mth, lg.H - u * 0.1, lg.H + u * 0.36, [(0, 0.29), (0.5, 0.33), (0.85, 0.32), (1, 0.27)],
                     shell, segs=10)
        cr = random.Random(30 + i * 2 + sx)

        def cuff_fn(co, H=lg.H, u=u, cr=cr):
            t = (co - H).dot(u)
            if t < 0.22:
                return (0, 0, 0)
            rel = co - H - u * t
            a = math.atan2(rel.z, rel.x * sx + rel.y)
            return tuple(u * (0.05 * math.sin(a * 5 + i) + 0.03 * math.sin(a * 11)))
        displace(cuff, cuff_fn)
        cc = lg.H + u * 0.12
        for k in range(4):
            crack(mth, cr, cc, (0.33, 0.33, 0.33), (cr.uniform(-1, 1), cr.uniform(-1, 1), cr.uniform(-1, 1)), 5,
                  vein, width=0.009, lift=0.008, step=0.12)
        bare_foot(rig.mb(lg.names[2]), lg.A, ff, sx, 0.5, leg, leg_d,
                  nail, hair=hair, seed=i * 3 + sx, segs=7, fur_n=40, nail_len=1.15)

    # thin bristly spider legs
    for (s, i), lg in slegs.items():
        sx = 1 if s == "L" else -1
        c, k_, t_ = lg.H, lg.K, lg.A
        m = rig.mb(lg.names[0])
        m.sphere((0.05, 0.05, 0.045), c, chitin, segs=8, rings=6)
        mid = lerp3(c, k_, 0.5) + Vector((0, 0, 0.04))
        m.tube([c, mid, k_], lambda q: 0.034 - 0.01 * q, chitin, segs=6)
        m.sphere((0.028,) * 3, k_, chitin, segs=8, rings=5)
        items = [(lerp3(c, k_, q) + Vector((0, 0, 0.02)), lerp3(c, k_, q) + Vector((sx * 0.02, 0.02, 0.07)), 0.004)
                 for q in (0.2, 0.35, 0.5, 0.65, 0.8)]
        thorns(m, items, bristle)
        m = rig.mb(lg.names[1])
        meta = lerp3(k_, t_, 0.62) + Vector((sx * 0.04, 0, 0))
        m.tube([k_, lerp3(k_, meta, 0.5) + Vector((sx * 0.015, 0, 0)), meta], lambda q: 0.024 - 0.006 * q, chitin,
               segs=5)
        m.sphere((0.019,) * 3, meta, chitin, segs=6, rings=4)
        m.tube([meta, lerp3(meta, t_, 0.6), t_ + Vector((0, 0, 0.01))], lambda q: 0.016 * (1 - 0.8 * q), chitin,
               segs=5)
        items = []
        for q in [0.1 * j for j in range(1, 10)]:
            p = lerp3(k_, t_, q)
            items.append((p, p + Vector((sx * 0.045, -0.01, 0.03 - 0.02 * q)), 0.0035))
            items.append((p, p + Vector((-sx * 0.035, 0.0, 0.02)), 0.003))
        thorns(m, items, bristle)
    rig.build()

    # ------------------------------------------------------------- motion
    HIPS = rig.pos["Hips"]

    def legs_ik(out, phases, stride, lift, duty, sphases=None, sstride=None, slift=None, plant=None):
        body = body_of(out, "Hips", HIPS)
        for (s, i), (lg, ff, dv) in legs.items():
            tgt = lg.A.copy()
            foot = None
            if phases is not None:
                dy, dz, sw = step(phases[(s, i)], stride, lift, duty)
                tgt += Vector((0, dy, dz))
                if sw is not None:
                    foot = foot_pitch(ff, 30 * math.cos(math.pi * sw) - 8)
            if plant and (s, i) in plant:
                tgt += Vector(plant[(s, i)])
            lg.solve(body, tgt, out, foot=foot)
        for (s, i), lg in slegs.items():
            tgt = lg.A.copy()
            if sphases is not None:
                dy, dz, sw = step(sphases[(s, i)], sstride, slift, duty)
                tgt += Vector((0, dy, dz))
            if plant and ("S", s, i) in plant:
                tgt += Vector(plant[("S", s, i)])
            lg.solve(body, tgt, out)
        return out

    def upper_idle(p, tw=0.0):
        return {
            "Hips": {"loc": (0, 0, 0.025 * math.sin(p)), "rot": (1.5 * math.sin(p + 1), 0, 1.5 * math.sin(0.5 * p))},
            "Abdomen": (3 * math.sin(p + 0.6), 0, 2 * math.sin(0.5 * p)),
            "FangL": (4 * math.sin(3 * p), -6 * max(0, math.sin(2 * p)), 0),
            "FangR": (4 * math.sin(3 * p + 1), 6 * max(0, math.sin(2 * p + 1)), 0),
            "Spine": (4 * math.sin(p), 3 * math.sin(0.5 * p + 1), 0),
            "Chest": (-3 * math.sin(p + 0.5), 0, 2 * math.sin(0.5 * p)),
            "Head": (-5 * math.sin(p + 1) + tw * 10, 6 * math.sin(0.5 * p) + tw * 12, 8 * math.sin(0.5 * p + 0.3)),
            "ShoulderL": (5 * math.sin(p + 1.2), -4 * math.sin(p), 0),
            "ShoulderR": (5 * math.sin(p + 1.6), 4 * math.sin(p + 0.3), 0),
            "ElbowL": (-6 - 4 * math.sin(p + 2), 0, 0), "ElbowR": (-6 - 4 * math.sin(p + 2.4), 0, 0),
            "HandL": (8 * math.sin(2 * p) + tw * 20, 0, 0), "HandR": (8 * math.sin(2 * p + 1) - tw * 15, 0, 0),
        }

    def idle(f):
        p = f / 72.0 * T
        tw = 1.0 if f % 36 in (14, 15, 16) else 0.0
        out = norm(upper_idle(p, tw))
        tap = max(0.0, math.sin(2 * p)) ** 4 * 0.06
        return legs_ik(out, None, 0, 0, 0.6, plant={("S", "L", 0): (0, 0, tap), ("S", "R", 1): (0, 0, tap * 0.5)})

    PH = {("L", 0): 0.0, ("R", 1): 0.0, ("R", 0): 0.5, ("L", 1): 0.5}
    SPH = {("L", 0): 0.25, ("R", 1): 0.25, ("R", 0): 0.75, ("L", 1): 0.75}

    def gait(f, n, stride, lift, duty, amp):
        q = f / n
        p = q * T
        out = norm({
            "Hips": {"loc": (0.02 * amp * math.sin(p), 0, 0.05 * amp * abs(math.cos(2 * p)) - 0.03 * amp),
                     "rot": (4 * (amp - 1) + 2 * math.sin(2 * p), 3 * amp * math.sin(p), 4 * math.sin(p))},
            "Abdomen": (-4 * math.sin(2 * p + 0.8), 0, -5 * math.sin(p + 0.5)),
            "FangL": (10 * math.sin(2 * p), -8 * max(0, math.sin(p)), 0),
            "FangR": (10 * math.sin(2 * p + 1), 8 * max(0, math.sin(p + 2)), 0),
            "Spine": (8 * amp * math.sin(2 * p - 1.0) + 6 * (amp - 1), 5 * math.sin(p - 0.8), 0),
            "Chest": (5 * amp * math.sin(2 * p - 1.6), 0, 4 * math.sin(p)),
            "Head": (-6 * amp * math.sin(2 * p - 2.0), 6 * math.sin(p - 1), 10 * math.sin(p - 0.5)),
        })
        for s, sx in (("L", 1), ("R", -1)):
            o = 0.0 if s == "L" else math.pi
            out = add(out, {"Shoulder" + s: sym(s, (14 * amp * math.sin(2 * p - 1.4 + o * 0.3) + 12 * (amp - 1), -6 *
                                                    math.sin(p + o), 0)),
                            "Elbow" + s: (-10 - 10 * amp * max(0, math.sin(2 * p - 2 + o * 0.3)), 0, 0),
                            "Hand" + s: (12 * math.sin(2 * p - 2.5 + o), 0, 0)})
        phases = {k: q + v for k, v in PH.items()}
        sph = {k: q + v for k, v in SPH.items()}
        return legs_ik(out, phases, stride, lift, duty, sph, stride * 0.7, lift * 0.5)

    def walk(f):
        return gait(f, 36, 0.6, 0.32, 0.62, 1.0)

    def run(f):
        return gait(f, 18, 1.0, 0.42, 0.52, 1.6)

    crouch = add(upper_idle(0), {"Hips": {"loc": (0, 0.14, -0.2), "rot": (-8, 0, 0)}, "Abdomen": (-10, 0, 0),
                                 "FangL": (0, -28, 0), "FangR": (0, 28, 0), "Spine": (18, 0, 0), "Chest": (8, 0, 0),
                                 "Head": (-10, 0, 0), "ShoulderL": (30, -10, 0), "ShoulderR": (30, 10, 0),
                                 "ElbowL": (-25, 0, 0), "ElbowR": (-25, 0, 0)})
    lunge = add(upper_idle(0), {"Hips": {"loc": (0, -0.5, -0.06), "rot": (12, 0, 0)}, "Abdomen": (10, 0, 0),
                                "FangL": (-10, -35, 0), "FangR": (-10, 35, 0), "Spine": (-38, 0, 0),
                                "Chest": (-12, 0, 0), "Head": (25, 0, 0),
                                "ShoulderL": (-105, 0, 25), "ShoulderR": (-105, 0, -25), "ElbowL": (-10, 0, 0),
                                "ElbowR": (-10, 0, 0), "HandL": (-25, 0, 0), "HandR": (-25, 0, 0)})
    grab = add(lunge, {"ShoulderL": (10, 0, -35), "ShoulderR": (10, 0, 35), "ElbowL": (-55, 0, 0),
                       "ElbowR": (-55, 0, 0), "HandL": (-35, 0, 0), "HandR": (-35, 0, 0), "Spine": (6, 0, 0),
                       "FangL": (10, 38, 0), "FangR": (10, -38, 0), "Hips": {"loc": (0, -0.08, 0.03)}})
    plant_l = {("L", 0): (0, -0.3, 0), ("R", 0): (0, -0.3, 0), ("S", "L", 0): (0, -0.35, 0),
               ("S", "R", 0): (0, -0.35, 0), ("S", "L", 1): (0, -0.2, 0), ("S", "R", 1): (0, -0.2, 0)}

    def attack(f):
        out = keyed([(0, upper_idle(0)), (9, crouch), (16, lunge), (21, grab), (26, grab), (34, upper_idle(0))], f)
        # front feet stamp forward during the lunge
        k = max(0.0, min(1.0, (f - 10) / 6.0)) if f < 28 else max(0.0, 1 - (f - 28) / 6.0)
        lift = math.sin(math.pi * max(0.0, min(1.0, (f - 10) / 6.0))) * 0.25 if f < 16 else 0.0
        plant = {kk: (v[0] * k, v[1] * k, (lift if len(kk) == 2 else lift * 0.6)) for kk, v in plant_l.items()}
        return legs_ik(out, None, 0, 0, 0.6, plant=plant)

    clips = [clip(rig, "Idle", 2.4, idle), clip(rig, "Walk", 1.2, walk), clip(rig, "Run", 0.6, run),
             clip(rig, "Attack", 1.13, attack)]
    return _finish_entity("entity_spider", rig, clips, [("Idle", 0), ("Walk", 9), ("Run", 5), ("Attack", 18)],
                          view=(0.55, -1.7, 0.45), humanoid=False, budget=25000)


# ============================================================ JAM KAKEK ===
def entity_clock():
    wood = mat("ClockWood", "#5e4b3a", rough=0.8)
    wood_l = mat("ClockWoodWorn", "#7b705c", rough=0.9)
    wood_d = mat("ClockWoodDark", "#3a2b20", rough=0.85)
    inside = mat("ClockInside", "#1e140e", rough=0.95)
    brass = mat("ClockBrass", "#a7843f", rough=0.38, metal=0.85)
    brass_d = mat("ClockBrassDark", "#6c5326", rough=0.5, metal=0.8)
    ring_m = mat("ClockChapter", "#c6b27c", rough=0.35, metal=0.7)
    ink = mat("ClockInk", "#16110d", rough=0.6)
    blue = mat("ClockMoonSky", "#1d2b4a", rough=0.5)
    glass = mat("GlassClock", "#d6e4ea", rough=0.05, alpha=0.28)
    tongue = mat("ClockTongue", "#c96a78", rough=0.22)
    tongue_d = mat("ClockTongueDark", "#94434f", rough=0.25)
    flesh = mat("ClockFlesh", "#b7606a", rough=0.3)
    skin = mat("ClockLegSkin", "#d2a596", rough=0.5)
    skin_d = mat("ClockLegShade", "#ad7a6c", rough=0.55)
    hair = mat("ClockLegHair", "#35261d", rough=0.8, double=True)
    skin_h = mat("ClockLegHairy", "#a97b6c", rough=0.7)
    nail = mat("ClockToenail", "#cbb06a", rough=0.35)

    rig = Rig()
    CS = Vector((1.15, 1.15, 1.12))          # case is modelled at 1.0 then scaled up vs the legs
    P0 = {}

    def cj(name, pos, parent=None):
        P0[name] = Vector(pos)
        rig.joint(name, tuple(Vector(pos) * CS), parent)
    cj("Hips", (0, 0, 1.2))
    cj("Head", (0, -0.05, 1.68), "Hips")
    dial_c = Vector((0, -0.176, 1.63))
    cj("ClockHour", (0, -0.186, 1.63), "Head")
    cj("ClockMin", (0, -0.192, 1.63), "Head")
    cj("HoodDoor", (0.262, -0.205, 1.69), "Head")
    cj("TrunkDoor", (-0.215, -0.165, 0.95), "Hips")
    cj("Pendulum", (0, 0.07, 1.28), "Hips")
    cj("Tongue0", (0, -0.06, 1.29), "Hips")
    cj("Tongue1", (0, -0.1, 1.0), "Tongue0")
    cj("Tongue2", (0, -0.12, 0.83), "Tongue1")
    legs = {}
    for s, sx in (("L", 1), ("R", -1)):
        H = Vector((sx * 0.24, 0.08, 1.13)) * CS
        K = Vector((sx * 0.7, -0.05, 1.12))
        A = Vector((sx * 0.75, -0.02, 0.24))
        names = ("Hip" + s, "Knee" + s, "Foot" + s)
        rig.joint(names[0], tuple(H), "Hips")
        rig.joint(names[1], tuple(K), names[0])
        rig.joint(names[2], tuple(A), names[1])
        legs[s] = Leg(names, H, K, A)

    rnd = random.Random(3)

    def worn(mb, center, size, n, axis, seed):
        """Lighter peeled patches on a flat face (axis: outward normal)."""
        r = random.Random(seed)
        c = Vector(center)
        nrm = Vector(axis)
        for _ in range(n):
            if abs(nrm.y) > 0.5:
                o = Vector((r.uniform(-.5, .5) * size[0], 0, r.uniform(-.5, .5) * size[1]))
                sz = (r.uniform(0.015, 0.07), 0.003, r.uniform(0.008, 0.05))
            else:
                o = Vector((0, r.uniform(-.5, .5) * size[0], r.uniform(-.5, .5) * size[1]))
                sz = (0.003, r.uniform(0.015, 0.07), r.uniform(0.008, 0.05))
            mb.box(sz, tuple(c + o + nrm * 0.0015), wood_l if r.random() < 0.7 else wood_d,
                   rot=tuple(nrm * r.uniform(-20, 20)))

    # ---------------------------------------------------------- case body
    m = rig.mb("Hips")
    for x in (-0.25, 0.25):                                                 # bracket feet
        for y in (-0.165, 0.165):
            m.box((0.1, 0.1, 0.08), (x, y, 0.07), wood_d, bevel=0.015, segs=2)
    m.box((0.6, 0.42, 0.05), (0, 0, 0.135), wood, bevel=0.012, segs=2)       # skirt moulding
    m.box((0.56, 0.38, 0.44), (0, 0, 0.36), wood, bevel=0.006, segs=1)        # plinth
    m.box((0.42, 0.016, 0.3), (0, -0.195, 0.35), wood, bevel=0.008, segs=1)   # raised panel
    m.box((0.36, 0.01, 0.24), (0, -0.2, 0.35), wood_d, bevel=0.004, segs=1)
    m.box((0.6, 0.42, 0.04), (0, 0, 0.6), wood, bevel=0.012, segs=2)         # base top moulding
    m.box((0.53, 0.35, 0.03), (0, 0, 0.635), wood_d, bevel=0.008, segs=1)
    worn(m, (0, -0.19, 0.36), (0.5, 0.4), 12, (0, -1, 0), 1)
    for sx in (-1, 1):
        worn(m, (sx * 0.28, 0, 0.36), (0.32, 0.4), 6, (sx, 0, 0), 2 + sx)
    # trunk: open box with a dark interior
    z0, z1 = 0.65, 1.3
    zc, hz = (z0 + z1) / 2, z1 - z0
    m.box((0.44, 0.022, hz), (0, 0.139, zc), wood, bevel=0.004)              # back
    for sx in (-1, 1):
        m.box((0.024, 0.3, hz), (sx * 0.208, 0, zc), wood, bevel=0.004)      # sides
        m.box((0.07, 0.03, hz), (sx * 0.185, -0.14, zc), wood, bevel=0.006, segs=1)   # front stiles
        m.box((0.012, 0.01, hz - 0.1), (sx * 0.16, -0.158, zc), wood_d)        # bead
        worn(m, (sx * 0.222, 0, zc), (0.26, 0.6), 5, (sx, 0, 0), 5 + sx)
        worn(m, (sx * 0.19, -0.157, zc), (0.05, 0.6), 3, (0, -1, 0), 8 + sx)
    m.box((0.44, 0.03, 0.07), (0, -0.14, z1 - 0.035), wood, bevel=0.006, segs=1)  # top rail
    m.box((0.44, 0.03, 0.08), (0, -0.14, z0 + 0.04), wood, bevel=0.006, segs=1)   # bottom rail
    m.box((0.37, 0.01, hz - 0.04), (0, 0.124, zc), inside)                     # interior
    m.box((0.38, 0.27, 0.02), (0, 0, z1 - 0.012), inside)
    m.box((0.38, 0.27, 0.01), (0, 0, z0 + 0.005), inside)
    for sx in (-1, 1):
        m.box((0.01, 0.27, hz - 0.04), (sx * 0.19, 0, zc), inside)
    m.box((0.56, 0.4, 0.05), (0, 0, 1.325), wood, bevel=0.012, segs=2)       # waist moulding
    m.box((0.5, 0.35, 0.03), (0, 0, 1.36), wood_d, bevel=0.006, segs=1)
    # pendulum suspension + fleshy gums the strings hang from
    m.box((0.04, 0.02, 0.05), (0, 0.075, z1 - 0.04), brass_d)
    blob(m, (0, -0.02, z1 - 0.035), (0.15, 0.1, 0.035), flesh, seed=4, amp=0.2, segs=12, rings=6)

    # trunk door hanging open on its left hinge
    m = rig.mb("TrunkDoor")
    hinge = Vector(P0["TrunkDoor"])
    Md = Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(-100), 4, "Z") @ Matrix.Translation(-hinge)
    dw, dh = 0.37, 0.55
    m.box((dw, 0.02, dh), (hinge.x + dw / 2 + 0.01, hinge.y, hinge.z), wood, bevel=0.005, segs=1, M=Md)
    m.box((dw - 0.08, 0.012, dh - 0.1), (hinge.x + dw / 2 + 0.01, hinge.y - 0.012, hinge.z), wood_d, bevel=0.004,
          M=Md)
    m.box((0.02, 0.01, 0.03), (hinge.x + dw - 0.02, hinge.y - 0.02, hinge.z), brass, M=Md)       # escutcheon
    for zz in (-0.2, 0.2):
        m.cyl(0.008, 0.06, (hinge.x, hinge.y, hinge.z + zz), brass_d, segs=6)

    # pendulum
    m = rig.mb("Pendulum")
    pv = Vector(P0["Pendulum"])
    m.box((0.012, 0.004, 0.46), (0, pv.y, pv.z - 0.24), brass_d)
    bob = Matrix.Translation((0, pv.y - 0.005, pv.z - 0.5)) @ Matrix.Rotation(math.radians(90), 4, "X")
    m.cyl(0.085, 0.016, (0, 0, 0), brass, segs=20, M=bob, r2=0.08)
    m.sphere((0.07, 0.07, 0.012), (0, 0, -0.008), brass, segs=16, rings=6, M=bob)

    # tongue on its fleshy strings
    m = rig.mb("Tongue0")
    t0, t1, t2 = (Vector(P0[n]) for n in ("Tongue0", "Tongue1", "Tongue2"))
    root = Vector((0, -0.07, 1.12))
    for k, (ax, ay) in enumerate(((-0.17, -0.08), (-0.1, 0.0), (-0.04, -0.1), (0.05, -0.04), (0.11, 0.02),
                                   (0.17, -0.1))):
        a = Vector((ax, ay, 1.282))
        b = root + Vector((ax * 0.35, 0, -0.01 * k))
        mid = lerp3(a, b, 0.5) + Vector((0, -0.01, -0.02))
        m.tube([a, mid, b], lambda q: 0.009 - 0.003 * math.sin(q * math.pi), flesh, segs=5)
        m.sphere((0.016, 0.016, 0.012), a, flesh, segs=6, rings=4)
    m.sphere((0.06, 0.04, 0.05), root, flesh, segs=10, rings=6)
    tf = mlimb(m, root + Vector((0, 0, 0.02)), t1, [(0, 0.05), (0.5, 0.06), (1, 0.066)], tongue, segs=14, sy=0.36,
               up=(0, -1, 0))
    m = rig.mb("Tongue1")
    mlimb(m, t1 + Vector((0, 0, 0.03)), t2, [(0, 0.066), (0.5, 0.072), (1, 0.074)], tongue, segs=14, sy=0.32,
          up=(0, -1, 0))
    m = rig.mb("Tongue2")
    tip = t2 + Vector((0, -0.03, -0.17))
    for sx in (-1, 1):                                                      # two rounded lobes at the tip
        mlimb(m, t2 + Vector((sx * 0.012, 0, 0.03)), tip + Vector((sx * 0.032, 0, 0.01)),
              [(0, 0.05), (0.5, 0.048), (0.85, 0.04), (1, 0.026)], tongue, segs=10, sy=0.42, up=(0, -1, 0))
    for nm, a, b in (("Tongue0", root, t1), ("Tongue1", t1, t2), ("Tongue2", t2, tip + Vector((0, 0, 0.03)))):
        mm = rig.mb(nm)
        mm.tube([a + Vector((0, -0.024, 0)), b + Vector((0, -0.024, 0))], 0.006, tongue_d, segs=5)   # groove
        for j in range(5):                                                  # papillae bumps
            q = rnd.uniform(0.1, 0.9)
            p = lerp3(a, b, q) + Vector((rnd.uniform(-0.04, 0.04), -0.019, 0))
            mm.sphere((0.007, 0.004, 0.007), p, tongue_d, segs=5, rings=3)
    # glistening wet streak
    rig.mb("Tongue2").sphere((0.03, 0.006, 0.05), tip + Vector((0.02, -0.02, 0.07)), tongue, segs=6, rings=4)

    # ------------------------------------------------------- hood (Head)
    m = rig.mb("Head")
    hz0, hz1 = 1.385, 2.0
    hc_, hh = (hz0 + hz1) / 2, hz1 - hz0
    m.box((0.58, 0.4, 0.035), (0, 0, hz0 + 0.0175), wood, bevel=0.01, segs=2)          # hood base moulding
    for sx in (-1, 1):
        m.box((0.024, 0.36, hh), (sx * 0.262, 0, hc_), wood, bevel=0.004)
        worn(m, (sx * 0.276, 0, hc_), (0.3, 0.5), 5, (sx, 0, 0), 20 + sx)
        # turned pillar at the front corner
        prof = [(0.03, 0), (0.03, 0.03), (0.02, 0.05), (0.018, 0.1), (0.022, 0.3), (0.018, 0.5), (0.02, 0.53),
                (0.03, 0.56), (0.03, 0.59)]
        m.lathe(prof, wood, M=Matrix.Translation((sx * 0.245, -0.19, hz0 + 0.02)), segs=10)
        m.cyl(0.008, 0.05, (sx * 0.262, -0.18, 1.5 + 0.0), brass_d, segs=6)            # hinge pins
    m.box((0.55, 0.02, hh), (0, 0.17, hc_), wood)
    m.box((0.44, 0.02, 0.06), (0, -0.19, hz1 - 0.03), wood, bevel=0.005)
    m.box((0.6, 0.42, 0.04), (0, 0, hz1 + 0.02), wood, bevel=0.012, segs=2)            # cornice
    m.box((0.64, 0.44, 0.025), (0, 0, hz1 + 0.05), wood_d, bevel=0.008, segs=1)
    worn(m, (0, -0.22, hz1 + 0.035), (0.6, 0.05), 5, (0, -1, 0), 30)
    # swan-neck pediment
    pz = hz1 + 0.06
    ped = [(-0.3, pz), (0.3, pz), (0.3, pz + 0.06), (0.2, pz + 0.12), (0.11, pz + 0.17), (0.05, pz + 0.12),
           (-0.05, pz + 0.12), (-0.11, pz + 0.17), (-0.2, pz + 0.12), (-0.3, pz + 0.06)]
    m.prism(ped, 0.03, wood, M=Matrix.Translation((0, -0.15, 0)))
    for sx in (-1, 1):
        pts = []
        for k in range(10):
            q = k / 9
            x = sx * (0.3 - 0.21 * q)
            z = pz + 0.06 + 0.12 * math.sin(q * math.pi * 0.62)
            pts.append(Vector((x, -0.17, z)))
        for k in range(1, 7):                                               # scroll curl
            a = k / 6 * math.pi * 1.4
            pts.append(Vector((sx * (0.09 - 0.025 * math.sin(a)), -0.17, pz + 0.155 - 0.03 * (1 - math.cos(a)))))
        m.tube(pts, lambda q: 0.022 - 0.006 * q, wood, segs=6)
        m.cyl(0.024, 0.012, (sx * 0.08, -0.185, pz + 0.13), brass, rot=(90, 0, 0), segs=12)    # rosette
    m.box((0.07, 0.07, 0.06), (0, -0.15, pz + 0.16), wood, bevel=0.008)
    m.lathe([(0, 0), (0.025, 0.0), (0.03, 0.02), (0.018, 0.04), (0.012, 0.06), (0.02, 0.075), (0.012, 0.1),
             (0.004, 0.125), (0, 0.13)], brass, M=Matrix.Translation((0, -0.15, pz + 0.19)), segs=10)   # finial
    # dial: square brass plate with an arch (moon phase)
    dz = dial_c.z
    m.box((0.4, 0.01, 0.4), (0, -0.168, dz), brass, bevel=0.003)
    arch = [(0.2 * math.cos(math.pi * k / 16), dz + 0.2 + 0.16 * math.sin(math.pi * k / 16)) for k in range(17)]
    m.prism([(0.2, dz + 0.19)] + arch[1:-1] + [(-0.2, dz + 0.19)], 0.01, brass, M=Matrix.Translation((0, -0.168, 0)))
    moon = [(0.12 * math.cos(math.pi * k / 14), dz + 0.21 + 0.11 * math.sin(math.pi * k / 14)) for k in range(15)]
    m.prism(moon, 0.006, blue, M=Matrix.Translation((0, -0.176, 0)))
    for x in (-0.06, 0.06):
        m.sphere((0.04, 0.008, 0.04), (x, -0.181, dz + 0.255), brass, segs=12, rings=6)         # moons
    for k in range(5):
        m.sphere((0.006, 0.003, 0.006), (-0.08 + 0.04 * k, -0.18, dz + 0.3 - 0.01 * (k % 2)), ring_m, segs=5, rings=3)
    m.sphere((0.025, 0.006, 0.02), (0, -0.18, dz + 0.215), brass_d, segs=8, rings=4)
    # chapter ring (annulus) with minute track
    rv, rf_ = [], []
    for k in range(48):
        a = T * k / 48
        for r in (0.107, 0.158):
            rv.append(tuple(dial_c + Vector((r * math.cos(a), -0.009, r * math.sin(a)))))
        j = (k + 1) % 48
        rf_.append((2 * k, 2 * k + 1, 2 * j + 1, 2 * j))
    m.raw(rv, rf_, ring_m, smooth=False)
    for r in (0.111, 0.152, 0.157):
        pts = [dial_c + Vector((r * math.cos(T * k / 40), -0.0105, r * math.sin(T * k / 40))) for k in range(41)]
        m.tube(pts, 0.0012, ink, segs=3, caps=False)
    m.sphere((0.105, 0.004, 0.105), dial_c + Vector((0, 0.001, 0)), brass_d, segs=24, rings=6)    # matted centre
    for k in range(60):                                                     # minute ticks
        a = T * k / 60
        r0 = 0.152 if k % 5 else 0.146
        p0 = dial_c + Vector((r0 * math.sin(a), -0.011, r0 * math.cos(a)))
        p1 = dial_c + Vector((0.157 * math.sin(a), -0.011, 0.157 * math.cos(a)))
        if k % 5 == 0:
            m.tube([p0, p1], 0.002, ink, segs=3, caps=False)
    numerals = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"]
    for k, nm in enumerate(numerals):
        a = T * k / 12
        pos = dial_c + Vector((0.131 * math.sin(a), -0.0115, 0.131 * math.cos(a)))
        Mt = Matrix.Translation(pos) @ Matrix.Rotation(a, 4, "Y")
        m.text(nm, 0.034, ink, M=Mt, extrude=0.0012)
    for sx in (-1, 1):                                                      # winding holes, spandrels
        m.cyl(0.011, 0.012, (sx * 0.05, -0.172, dz - 0.05), ink, rot=(90, 0, 0), segs=10)
        m.cyl(0.015, 0.006, (sx * 0.05, -0.171, dz - 0.05), brass_d, rot=(90, 0, 0), segs=10)
        for sz in (-1, 1):
            c = Vector((sx * 0.165, -0.178, dz + sz * 0.165))
            blob(m, c, (0.025, 0.006, 0.025), brass, seed=int(5 + sx + 2 * sz), amp=0.3, segs=8, rings=5)
            m.tube([c + Vector((-sx * 0.02, 0, 0)), c + Vector((-sx * 0.035, -0.002, -sz * 0.012)),
                    c + Vector((-sx * 0.03, -0.002, -sz * 0.03))], 0.004, brass, segs=4)
            m.tube([c + Vector((0, 0, -sz * 0.02)), c + Vector((sx * 0.012, -0.002, -sz * 0.035)),
                    c + Vector((sx * 0.028, -0.002, -sz * 0.03))], 0.004, brass, segs=4)
    m.cyl(0.012, 0.012, tuple(dial_c + Vector((0, -0.016, 0))), brass, rot=(90, 0, 0), segs=10)
    # verdigris / grime blotches on the brass
    for k in range(10):
        a = rnd.uniform(0, T)
        r = rnd.uniform(0.02, 0.19)
        m.sphere((rnd.uniform(0.01, 0.03), 0.002, rnd.uniform(0.01, 0.025)),
                 (r * math.cos(a) * 0.95, -0.174, dz + r * math.sin(a) * 0.95), brass_d, segs=6, rings=3)

    # hands: spade hour hand, long minute hand (built pointing at 12, turned)
    def clock_hand(mb, length, width, ang, y):
        pts = [(-width * 0.25, -0.03), (width * 0.25, -0.03), (width * 0.2, length * 0.55), (width, length * 0.66),
               (width * 0.35, length * 0.72), (0, length), (-width * 0.35, length * 0.72), (-width, length * 0.66),
               (-width * 0.2, length * 0.55)]
        M = Matrix.Translation(dial_c + Vector((0, y, 0))) @ Matrix.Rotation(math.radians(ang), 4, "Y") @ \
            Matrix.Translation((0, 0, 0))
        mb.prism([(x, z) for x, z in pts], 0.003, ink, M=M @ Matrix.Rotation(0, 4, "Y"))
    clock_hand(rig.mb("ClockHour"), 0.085, 0.017, -60, -0.014)
    clock_hand(rig.mb("ClockMin"), 0.135, 0.012, 60, -0.019)

    # hood door, swung open on its right hinge, glass cracked and missing shards
    m = rig.mb("HoodDoor")
    hg = Vector(P0["HoodDoor"])
    Mh = Matrix.Translation(hg) @ Matrix.Rotation(math.radians(115), 4, "Z") @ Matrix.Translation(-hg)
    dwid, z_lo, z_hi = 0.5, hz0 + 0.04, 1.86
    xl, xr = hg.x - dwid, hg.x
    cx = (xl + xr) / 2
    frame_pts = [Vector((xr - 0.02, hg.y, z_lo + 0.02)), Vector((xl + 0.02, hg.y, z_lo + 0.02)),
                 Vector((xl + 0.02, hg.y, z_hi))]
    for k in range(1, 16):
        a = math.pi - math.pi * k / 16
        frame_pts.append(Vector((cx + (dwid / 2 - 0.02) * math.cos(a), hg.y, z_hi + 0.12 * math.sin(a))))
    frame_pts += [Vector((xr - 0.02, hg.y, z_hi)), Vector((xr - 0.02, hg.y, z_lo + 0.02))]
    m.tube([Mh @ p for p in frame_pts], 0.024, wood, segs=4, caps=False)
    m.tube([Mh @ (p + Vector((0, -0.012, 0))) for p in frame_pts], 0.008, wood_l, segs=4, caps=False)
    m.box((0.02, 0.012, 0.04), (xl + 0.03, hg.y - 0.02, 1.62), brass, M=Mh)                      # latch
    # glass shards: sectors round an impact point, shrunk to leave cracks
    # inner outline of the pane (bottom, left, arch, right)
    inner = [(xr - 0.035, z_lo + 0.035), (xl + 0.035, z_lo + 0.035), (xl + 0.035, z_hi)] + \
              [(cx + (dwid / 2 - 0.035) * math.cos(math.pi - math.pi * j / 12), z_hi + 0.105 * math.sin(
                  math.pi * j / 12)) for j in range(1, 12)] + [(xr - 0.035, z_hi)]
    # resample outline evenly
    seg = []
    for a, b in zip(inner, inner[1:] + inner[:1]):
        seg.append((a, b, math.hypot(b[0] - a[0], b[1] - a[1])))
    tot = sum(s_[2] for s_ in seg)
    outline = []
    for k in range(60):
        dlen = tot * k / 60
        for a, b, ln in seg:
            if dlen <= ln:
                t = dlen / ln
                outline.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
                break
            dlen -= ln
    imp = (cx - 0.05, 1.66)
    gr = random.Random(12)
    cuts = sorted(gr.uniform(0, T) for _ in range(9))
    missing = {2, 6}
    for i in range(len(cuts)):
        a0, a1 = cuts[i], cuts[(i + 1) % len(cuts)] + (T if i == len(cuts) - 1 else 0)
        if i in missing:
            continue
        poly = []
        for (px, pz) in outline:
            ang = math.atan2(pz - imp[1], px - imp[0]) % T
            if a0 <= ang <= a1 or a0 <= ang + T <= a1:
                poly.append((px, pz, ang if ang >= a0 else ang + T))
        poly.sort(key=lambda t: t[2])
        if len(poly) < 2:
            continue
        pts2 = [imp] + [(x, z) for x, z, _ in poly]
        cxs = sum(p[0] for p in pts2) / len(pts2)
        czs = sum(p[1] for p in pts2) / len(pts2)
        pts2 = [(cxs + (x - cxs) * 0.95, czs + (z - czs) * 0.95) for x, z in pts2]
        if i == 4:                                       # a shard broken short near the impact
            pts2[0] = (imp[0] + (pts2[1][0] - imp[0]) * 0.4, imp[1] + (pts2[1][1] - imp[1]) * 0.4)
        m.prism(pts2, 0.004, glass, M=Mh @ Matrix.Translation((0, hg.y, 0)))

    for mb in rig.parts.values():                                          # scale the case
        for v in mb.bm.verts:
            v.co = Vector((v.co.x * CS.x, v.co.y * CS.y, v.co.z * CS.z))

    # ---------------------------------------------------------- legs
    for s, sx in (("L", 1), ("R", -1)):
        lg = legs[s]
        giant_leg(rig, lg.names, lg.H, lg.K, lg.A, skin, skin_d, hair, k=1.85, fur_n=(900, 820), fur_len=0.036,
                  seed=40 + sx, segs=16, fat=True, fur_w=0.0075, hairy=skin_h)
        fwd = Vector((sx * 0.22, -1, 0)).normalized()
        bare_foot(rig.mb(lg.names[2]), lg.A, fwd, sx, 0.6, skin, skin_d, nail, hair=hair, seed=50 + sx,
                  segs=12, fur_n=90, nail_len=1.3)
    rig.build()

    # ------------------------------------------------------------ motion
    HIPS = rig.pos["Hips"]

    def legs_ik(out, ph=None, stride=0, lift=0, duty=0.6, plant=None):
        body = body_of(out, "Hips", HIPS)
        for s, sx in (("L", 1), ("R", -1)):
            lg = legs[s]
            tgt = lg.A.copy()
            foot = None
            if ph is not None:
                dy, dz, sw = step(ph[s], stride, lift, duty)
                tgt += Vector((0, dy, dz))
                if sw is not None:
                    foot = foot_pitch((sx * 0.22, -1, 0), 28 * math.cos(math.pi * sw) - 6)
            if plant and s in plant:
                tgt += Vector(plant[s])
            lg.solve(body, tgt, out, foot=foot)
        return out

    def idle(f):
        p = f / 60.0 * T
        tick = math.floor(f / 15.0)
        out = norm({
            "Hips": {"loc": (0, 0, 0.015 * math.sin(p)), "rot": (1.5 * math.sin(p), 1.2 * math.sin(0.5 * p), 0)},
            "Head": (0, 0, 2 * math.sin(0.5 * p)),
            "ClockMin": (0, 6 * tick, 0), "ClockHour": (0, 0.5 * tick, 0),
            "HoodDoor": (0, 0, 6 * math.sin(p + 0.5)),
            "TrunkDoor": (0, 0, -4 * math.sin(p + 1.2)),
            "Pendulum": (0, 9 * math.sin(p * 2), 0),
            "Tongue0": (4 * math.sin(p), 3 * math.sin(p * 2 + 0.3), 0),
            "Tongue1": (6 * math.sin(p - 0.6), 4 * math.sin(p * 2 - 0.4), 0),
            "Tongue2": (10 * math.sin(p - 1.2), 6 * math.sin(p * 2 - 1.0), 0),
        })
        return legs_ik(out)

    def gait(f, n, stride, lift, duty, amp):
        q = f / n
        p = q * T
        hop = 0.06 * (amp - 1) * abs(math.sin(2 * p))
        out = norm({
            "Hips": {"loc": (0.05 * amp * math.sin(p), 0, 0.035 * amp * abs(math.sin(2 * p)) - 0.03 + hop),
                     "rot": (3 + 5 * (amp - 1) + 2 * math.sin(2 * p), -7 * amp * math.sin(p), 5 * math.sin(p))},
            "Head": (-2 * math.sin(2 * p - 0.6), 3 * amp * math.sin(p - 0.5), -2 * math.sin(p)),
            "ClockMin": (0, 360 * q, 0), "ClockHour": (0, 30 * q, 0),
            "HoodDoor": (0, 0, 14 * amp * math.sin(p * 2 - 0.4)),
            "TrunkDoor": (0, 0, -12 * amp * math.sin(p * 2 + 0.2)),
            "Pendulum": (0, 22 * amp * math.sin(p - 0.8), 0),
            "Tongue0": (8 * amp * math.sin(2 * p - 1.0), 10 * amp * math.sin(p - 1.0), 0),
            "Tongue1": (10 * amp * math.sin(2 * p - 1.6), 12 * amp * math.sin(p - 1.5), 0),
            "Tongue2": (14 * amp * math.sin(2 * p - 2.2), 16 * amp * math.sin(p - 2.0), 0),
        })
        return legs_ik(out, {"L": q, "R": q + 0.5}, stride, lift, duty)

    def walk(f):
        return gait(f, 36, 0.62, 0.2, 0.62, 1.0)

    def run(f):
        return gait(f, 18, 0.95, 0.3, 0.5, 1.6)

    rest = {"Pendulum": (0, 0, 0)}
    wind = {"Hips": {"loc": (0, 0.1, -0.04), "rot": (-12, 0, 0)}, "Head": (-6, 0, 0),
            "Tongue0": (35, 0, 0), "Tongue1": (40, 0, 0), "Tongue2": (30, 0, 0), "HoodDoor": (0, 0, -40),
            "TrunkDoor": (0, 0, 10), "Pendulum": (0, -25, 0), "ClockMin": (0, 180, 0), "ClockHour": (0, 60, 0)}
    strike = {"Hips": {"loc": (0, -0.3, -0.1), "rot": (28, 0, 0)}, "Head": (10, 0, 0),
              "Tongue0": (-112, 0, 0), "Tongue1": (-6, 0, 0), "Tongue2": (-4, 0, 0), "HoodDoor": (0, 0, 25),
              "TrunkDoor": (0, 0, -18), "Pendulum": (0, 30, 0), "ClockMin": (0, 540, 0), "ClockHour": (0, 120, 0)}
    whip = add(strike, {"Tongue0": (15, 0, 0), "Tongue1": (-40, 0, 0), "Tongue2": (-55, 0, 0),
                        "Hips": {"rot": (4, 0, 0)}})
    recoil = {"Hips": {"loc": (0, -0.12, -0.04), "rot": (14, 0, 0)}, "Tongue0": (-40, 0, 0), "Tongue1": (20, 0, 0),
              "Tongue2": (30, 0, 0), "ClockMin": (0, 640, 0), "ClockHour": (0, 140, 0)}

    def attack(f):
        out = keyed([(0, rest), (10, wind), (16, strike), (20, whip), (25, recoil), (34, {"ClockMin": (0, 720, 0),
                                                                                         "ClockHour": (0, 150, 0)})],
                    f)
        k = max(0.0, min(1.0, (f - 9) / 6.0)) if f < 26 else max(0.0, 1 - (f - 26) / 8.0)
        lift = math.sin(math.pi * max(0.0, min(1.0, (f - 9) / 6.0))) * 0.15 if f < 15 else 0.0
        return legs_ik(out, plant={"L": (0, -0.25 * k, lift), "R": (0, 0.1 * k, 0)})

    clips = [clip(rig, "Idle", 2.0, idle), clip(rig, "Walk", 1.2, walk), clip(rig, "Run", 0.6, run),
             clip(rig, "Attack", 1.13, attack)]
    return _finish_entity("entity_clock", rig, clips, [("Idle", 0), ("Walk", 9), ("Run", 5), ("Attack", 17)],
                          view=(0.45, -1.7, 0.3), humanoid=False, budget=25000)


ASSETS = {
    "entity_spider": entity_spider,
    "entity_clock": entity_clock,
}

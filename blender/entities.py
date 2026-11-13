"""Articulated entities built as object hierarchies (no armatures).

Joint nodes are Empties with identity rest rotation; geometry for each joint
is a mesh child named <Joint>_geo whose origin sits on the joint. Clips are
per-object actions grouped by NLA track name -> one glTF animation each.

Rotation sign conventions (Blender axes, entity faces -Y):
  X+ : limb hanging down swings BACK (+Y); torso/head bends FORWARD.
  Y+ : tilts toward the entity's left (+X).   Z+ : turns toward its left.
"""
import math
import random
from mathutils import Vector, Matrix
import bpy
import hr_lib as L
from hr_lib import MB, mat, look_matrix

JOINTS = ["Hips", "Spine", "Chest", "Neck", "Head",
          "ShoulderL", "ElbowL", "HandL", "ShoulderR", "ElbowR", "HandR",
          "HipL", "KneeL", "FootL", "HipR", "KneeR", "FootR"]


class Rig:
    def __init__(self):
        self.j = {}
        self.pos = {}
        self.parts = {}

    def joint(self, name, pos, parent=None):
        e = L.empty(name, pos, parent=self.j[parent] if parent else None, size=0.04)
        self.j[name] = e
        self.pos[name] = Vector(pos)
        return e

    def mb(self, joint):
        if joint not in self.parts:
            self.parts[joint] = MB()
        return self.parts[joint]

    def build(self, auto_smooth=40):
        for jn, mb in self.parts.items():
            mb.obj(jn + "_geo", origin=self.pos[jn], parent=self.j[jn], auto_smooth=auto_smooth)

    def skeleton(self, p):
        """p: dict of joint world positions (all 17)."""
        self.joint("Hips", p["Hips"])
        self.joint("Spine", p["Spine"], "Hips")
        self.joint("Chest", p["Chest"], "Spine")
        self.joint("Neck", p["Neck"], "Chest")
        self.joint("Head", p["Head"], "Neck")
        for s in "LR":
            self.joint("Shoulder" + s, p["Shoulder" + s], "Chest")
            self.joint("Elbow" + s, p["Elbow" + s], "Shoulder" + s)
            self.joint("Hand" + s, p["Hand" + s], "Elbow" + s)
            self.joint("Hip" + s, p["Hip" + s], "Hips")
            self.joint("Knee" + s, p["Knee" + s], "Hip" + s)
            self.joint("Foot" + s, p["Foot" + s], "Knee" + s)

    def objs(self):
        return [self.j[n] for n in JOINTS if n in self.j] + [o for n, o in self.j.items() if n not in JOINTS]


def mirror_pos(p):
    out = dict(p)
    for k, v in list(p.items()):
        if k.endswith("L"):
            out[k[:-1] + "R"] = (-v[0], v[1], v[2])
    return out


# ------------------------------------------------------------- pose math ---
def norm(pose):
    out = {}
    for k, v in pose.items():
        if isinstance(v, dict):
            out[k] = {"rot": tuple(v.get("rot", (0, 0, 0))), "loc": tuple(v.get("loc", (0, 0, 0)))}
        else:
            out[k] = {"rot": tuple(v), "loc": (0, 0, 0)}
    return out


def add(*poses):
    out = {}
    for p in poses:
        for k, v in norm(p).items():
            o = out.setdefault(k, {"rot": (0, 0, 0), "loc": (0, 0, 0)})
            o["rot"] = tuple(a + b for a, b in zip(o["rot"], v["rot"]))
            o["loc"] = tuple(a + b for a, b in zip(o["loc"], v["loc"]))
    return out


def lerp_pose(a, b, t):
    a, b = norm(a), norm(b)
    out = {}
    for k in set(a) | set(b):
        va = a.get(k, {"rot": (0, 0, 0), "loc": (0, 0, 0)})
        vb = b.get(k, {"rot": (0, 0, 0), "loc": (0, 0, 0)})
        out[k] = {"rot": tuple(x + (y - x) * t for x, y in zip(va["rot"], vb["rot"])),
                  "loc": tuple(x + (y - x) * t for x, y in zip(va["loc"], vb["loc"]))}
    return out


def keyed(keys, f):
    """keys: [(frame, pose), ...] sorted -> smoothstep blend."""
    if f <= keys[0][0]:
        return norm(keys[0][1])
    for (f0, p0), (f1, p1) in zip(keys[:-1], keys[1:]):
        if f0 <= f <= f1:
            t = (f - f0) / max(f1 - f0, 1e-6)
            t = t * t * (3 - 2 * t)
            return lerp_pose(p0, p1, t)
    return norm(keys[-1][1])


def clip(rig, name, seconds, fn):
    n = int(round(seconds * L.FPS))
    frames = list(range(0, n + 1))
    L.bake_clip(name, rig.objs(), frames, fn, loc_objs=("Hips",))
    return (name, seconds)


def sym(side, v):
    """Mirror a (rx, ry, rz) for the right side (flip Y and Z rotations)."""
    return v if side == "L" else (v[0], -v[1], -v[2])


# --------------------------------------------------------- shape helpers ---
def ellipsoid_point(c, r, d):
    """Point on ellipsoid (centre c, radii r) in direction d, plus normal."""
    d = Vector(d).normalized()
    s = 1.0 / math.sqrt((d.x / r[0]) ** 2 + (d.y / r[1]) ** 2 + (d.z / r[2]) ** 2)
    p = Vector(c) + d * s
    n = Vector(((p.x - c[0]) / r[0] ** 2, (p.y - c[1]) / r[1] ** 2, (p.z - c[2]) / r[2] ** 2)).normalized()
    return p, n


def crack(mb, rnd, c, r, start_dir, steps, material, width=0.0025, lift=0.0012, step=0.05):
    """Jagged hairline crack running over an ellipsoid surface."""
    d = Vector(start_dir).normalized()
    heading = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
    pts, nrm = [], []
    for k in range(steps):
        p, n = ellipsoid_point(c, r, d)
        pts.append(p + n * lift)
        nrm.append(n)
        t = heading - n * heading.dot(n)
        if t.length < 1e-4:
            t = n.orthogonal()
        t.normalize()
        jit = n.cross(t) * rnd.uniform(-0.9, 0.9)
        heading = (t + jit * 0.6).normalized()
        d = (p + heading * step * max(r) * 4 - Vector(c))
        d = Vector((d.x / r[0], d.y / r[1], d.z / r[2])).normalized()
        d = Vector((d.x * r[0], d.y * r[1], d.z * r[2]))
    mb.ribbon(pts, width, material, normal=nrm)


def torso(mb, prof, material, segs=16, sy=0.7, x=0.0, y=0.0, close=True):
    return mb.lathe(prof, material, M=Matrix.Translation((x, y, 0)), segs=segs, sy=sy, close=close)


def finger_set(mb, wrist, side, length, material, spread=0.012, r=0.0065, curl=0.25, n=4, palm=None,
               thumb=True):
    """Fingers hanging down from a palm whose plane is YZ (palm faces body)."""
    sx = 1 if side == "L" else -1
    w = Vector(wrist)
    pl = palm or (0.016, 0.042, 0.06)
    mb.sphere(pl, w + Vector((0, 0, -pl[2] * 0.85)), material, segs=10, rings=7)
    base_z = w.z - pl[2] * 1.6
    for i in range(n):
        y = (i - (n - 1) / 2) * spread * 2.0
        ln = length * (1.0 - abs(i - (n - 1) / 2 - 0.4) * 0.12)
        pts = []
        for k in range(5):
            t = k / 4
            pts.append(Vector((w.x - sx * curl * ln * t * t * 0.6, w.y + y - 0.008 * t, base_z - ln * t +
                               0.004)))
        mb.tube(pts, lambda t, r=r: r * (1 - 0.35 * t), material, segs=5)
    if thumb:
        tb = [Vector((w.x - sx * 0.006, w.y - pl[1] * 0.8, w.z - pl[2] * 0.8)),
              Vector((w.x - sx * 0.012, w.y - pl[1] * 1.25, w.z - pl[2] * 1.5)),
              Vector((w.x - sx * 0.02, w.y - pl[1] * 1.3, w.z - pl[2] * 1.5 - length * 0.35))]
        mb.tube(tb, lambda t: r * 1.05 * (1 - 0.3 * t), material, segs=5)


# ------------------------------------------------------- anatomy helpers ---
# Shared by every resident: sculpted limbs, jointed hands with nails, wet
# eyes, ribs, cloth folds. All geometry is written in world space.
def basis(o, x, y, z):
    """Matrix with columns x, y, z (local axes) and origin o. Always right
    handed (x is flipped if needed) so normals never get mirrored inside out."""
    x, y, z = Vector(x), Vector(y), Vector(z)
    if x.cross(y).dot(z) < 0:
        x = -x
    return Matrix(((x[0], y[0], z[0], o[0]), (x[1], y[1], z[1], o[1]),
                   (x[2], y[2], z[2], o[2]), (0, 0, 0, 1)))


def ortho(d, n):
    """(side, n', d) orthonormal frame: d main axis, n' = n made normal to d."""
    d = Vector(d).normalized()
    n = Vector(n)
    n = n - d * n.dot(d)
    if n.length < 1e-6:
        n = d.orthogonal()
    n.normalize()
    return n.cross(d).normalized(), n, d


def mlimb(mb, p0, p1, prof, material, segs=12, sx=1.0, sy=1.0, caps=True, up=None):
    """Limb from p0 to p1 with a sculpted radius profile prof=[(t, r), ...]
    (t = 0..1 along the bone). `up` orients the sx/sy cross-section (local Y)."""
    p0, p1 = Vector(p0), Vector(p1)
    ln = (p1 - p0).length
    r0, r1 = prof[0][1], prof[-1][1]
    out = []
    if caps:
        for k in range(3):
            a = math.pi / 2 * (1 - k / 3)
            out.append((r0 * math.cos(a), -r0 * math.sin(a) * 0.7))
    out += [(r, ln * t) for t, r in prof]
    if caps:
        for k in range(1, 4):
            a = math.pi / 2 * k / 3
            out.append((r1 * math.cos(a), ln + r1 * math.sin(a) * 0.7))
    if up is None:
        M = look_matrix(p0, p1)
    else:
        s, n, d = ortho(p1 - p0, up)
        M = basis(p0, s, n, d)
    return mb.lathe(out, material, M=M, segs=segs, sx=sx, sy=sy)


def bulk(mb, p0, p1, t, toward, off, r, ln, material, flat=0.85, segs=12, rings=8):
    """Muscle mass: an ellipsoid along the bone p0->p1 at fraction t, pushed
    `off` metres toward `toward`; r = thickness, ln = half length."""
    p0, p1 = Vector(p0), Vector(p1)
    sv, nv, dv = ortho(p1 - p0, toward)
    c = p0 + (p1 - p0) * t + nv * off
    return mb.sphere((r * flat, r, ln), (0, 0, 0), material, segs=segs, rings=rings, M=basis(c, sv, nv, dv))


def arm_sculpt(mb_up, mb_fore, sh, el, wr, sx, skin, scale=1.0, lean=0.0, tendon=None):
    """Sinewy arm: thin bone cores with deltoid, biceps, triceps and forearm
    masses so the silhouette bulges and pinches like real anatomy."""
    sh, el, wr = Vector(sh), Vector(el), Vector(wr)
    k = scale
    out = Vector((sx, 0, 0))
    fwd = Vector((0, -1, 0))
    mlimb(mb_up, sh + Vector((0, 0, 0.02)), el, [(0, 0.034 * k), (0.5, 0.027 * k), (1, 0.024 * k)], skin, segs=12, up=fwd)
    bulk(mb_up, sh, el, 0.08, out, 0.012 * k, 0.042 * k, 0.07 * k, skin)                 # deltoid
    bulk(mb_up, sh, el, 0.45, fwd, 0.012 * k, 0.029 * k, 0.1 * k, skin)                  # biceps
    bulk(mb_up, sh, el, 0.38, -fwd, 0.011 * k, 0.031 * k, 0.12 * k, skin)                # triceps
    a = el + (el - wr).normalized() * 0.025 * k
    mlimb(mb_fore, a, wr, [(0, 0.026 * k), (0.6, 0.019 * k), (1, 0.017 * k)], skin, segs=12, sx=1.2, up=fwd)
    bulk(mb_fore, el, wr, 0.27, (out + fwd).normalized(), 0.01 * k, 0.03 * k, 0.11 * k, skin)   # brachioradialis
    bulk(mb_fore, el, wr, 0.3, (-out + fwd * 0.3).normalized(), 0.008 * k, 0.025 * k, 0.1 * k, skin)  # flexors
    mb_fore.sphere((0.018 * k,) * 3, el - fwd * 0.012 * k, skin, segs=8, rings=6)            # olecranon
    if tendon is not None:
        for o in (-0.5, 0.5):
            mb_fore.tube([lerp3(el, wr, 0.55) + Vector((o * 0.012 * sx, -0.016 * k, 0)),
                          wr + Vector((o * 0.01 * sx, -0.014 * k, 0.01))], 0.0035 * k, tendon, segs=5)


def leg_sculpt(mb_th, mb_sh, hp, kn, an, sx, skin, scale=1.0, kneecap=None):
    hp, kn, an = Vector(hp), Vector(kn), Vector(an)
    k = scale
    out = Vector((sx, 0, 0))
    fwd = Vector((0, -1, 0))
    mlimb(mb_th, hp + Vector((0, 0, 0.03)), kn, [(0, 0.055 * k), (0.6, 0.04 * k), (1, 0.034 * k)], skin, segs=12,
          up=fwd)
    bulk(mb_th, hp, kn, 0.45, fwd, 0.014 * k, 0.05 * k, 0.17 * k, skin)                  # quadriceps
    bulk(mb_th, hp, kn, 0.4, -fwd, 0.012 * k, 0.045 * k, 0.17 * k, skin)                 # hamstrings
    bulk(mb_th, hp, kn, 0.3, -out, 0.012 * k, 0.04 * k, 0.12 * k, skin)                  # adductors
    bulk(mb_th, hp, kn, 0.8, (fwd - out * 0.4).normalized(), 0.012 * k, 0.032 * k, 0.06 * k, skin)   # vastus medialis
    a = kn + (kn - an).normalized() * 0.03 * k
    mlimb(mb_sh, a, an, [(0, 0.036 * k), (0.5, 0.024 * k), (1, 0.019 * k)], skin, segs=12, up=fwd)
    bulk(mb_sh, kn, an, 0.28, -fwd, 0.016 * k, 0.04 * k, 0.12 * k, skin)                 # calf
    bulk(mb_sh, kn, an, 0.3, (fwd + out).normalized(), 0.008 * k, 0.024 * k, 0.12 * k, skin)  # tibialis
    mb_sh.sphere((0.028 * k, 0.02 * k, 0.03 * k), kn + fwd * 0.03 * k, kneecap or skin, segs=10, rings=6)


def muscle(t0, r0, t1, r1, belly=0.0, at=0.45, knob=0.0):
    """Profile helper: taper r0->r1 with a muscle belly and joint knobs."""
    pts = []
    for k in range(9):
        t = k / 8
        r = r0 + (r1 - r0) * t
        r += belly * math.exp(-((t - at) / 0.22) ** 2)
        r += knob * (math.exp(-(t / 0.08) ** 2) + math.exp(-((1 - t) / 0.08) ** 2))
        pts.append((t0 + (t1 - t0) * t, r))
    return pts


def chain(base, d, n, lens, bends, r_fn, sub=(0.5, 1.0)):
    """Points of a jointed digit: segment lengths `lens`, each joint bending
    the direction toward n by bends[i] radians. Returns (pts, radii, dir, n)."""
    d, n = Vector(d).normalized(), Vector(n).normalized()
    p = Vector(base)
    pts, rad = [p.copy()], [r_fn(0.0, True)]
    tot = sum(lens)
    acc = 0.0
    for i, (ln, b) in enumerate(zip(lens, bends)):
        if b:
            d, n = (d * math.cos(b) + n * math.sin(b)).normalized(), (n * math.cos(b) - d * math.sin(b)).normalized()
        for h in sub:
            pts.append(p + d * ln * h)
            acc_h = (acc + ln * h) / tot
            rad.append(r_fn(acc_h, h == 1.0 and i < len(lens) - 1))
        p = p + d * ln
        acc += ln
    return pts, rad, d, n


def hand(mb, wrist, d, n, t, length, skin, nail=None, curl=0.35, r=0.0065, spread=1.0, splay=0.1,
         thumb=True, thumb_curl=0.25, palm_len=None, nfing=4, knuckles=True, segs=6, bony=1.0, seed=0,
         claw=0.0, tip_mat=None, palm_scale=(1.0, 1.0, 1.0), rel=None, lite=False):
    """Anatomical hand. d: finger direction, n: palm normal (fingers curl
    toward it), t: across the palm toward the thumb. length = middle finger.
    claw > 0 turns the nails into hooked claws of that length."""
    rnd = random.Random(seed)
    sv, n, d = ortho(d, n)
    t = Vector(t)
    t = (t - d * t.dot(d) - n * t.dot(n)).normalized()
    w = Vector(wrist)
    pl = palm_len or length * 0.85
    pw = r * 1.15 * nfing * spread
    th = r * 1.35
    Mp = basis(w + d * pl * 0.5, t, n, d)
    ps = palm_scale
    mb.sphere((pw * 1.08 * ps[0], th * ps[1], pl * 0.58 * ps[2]), (0, 0, 0), skin, segs=8 if lite else 12,
              rings=6 if lite else 8, M=Mp)
    if not lite:
        mb.sphere((pw * 0.75 * ps[0], th * 1.1 * ps[1], pl * 0.25 * ps[2]), (0, 0, -pl * 0.32), skin, segs=10, rings=6,
                  M=Mp)   # heel
    rel = rel or [0.9, 1.0, 0.94, 0.74, 0.7]
    for i in range(nfing):
        u = 1 - 2 * i / max(1, nfing - 1)                       # +1 index (thumb side) .. -1 pinky
        fl = length * rel[min(i, 4)] * rnd.uniform(0.96, 1.04)
        dv = (d + t * u * splay).normalized()
        base = w + d * pl * 0.96 + t * u * pw * 0.8 - n * th * 0.15
        cl = curl * rnd.uniform(0.85, 1.15)

        def rf(q, joint, fl=fl):
            return r * (1.0 - 0.32 * q) * (1.0 + (0.16 * bony if joint else 0.0))
        pts, rad, de, ne = chain(base, dv, n, [fl * 0.45, fl * 0.31, fl * 0.24], [cl * 0.5, cl, cl * 0.8], rf,
                                 sub=(1.0,) if lite else (0.5, 1.0))
        mb.tube(pts, lambda q, rad=rad: rad[min(len(rad) - 1, int(round(q * (len(rad) - 1))))], skin, segs=segs)
        tip = pts[-1]
        if not lite:
            mb.sphere((rad[-1],) * 3, tip, skin, segs=segs, rings=4)
        if knuckles and bony > 0:
            mb.sphere((r * 1.05, r * 0.7 * bony, r * 1.0), (0, 0, 0), skin, segs=6, rings=4,
                      M=basis(base - n * th * 0.55, t, n, d))
        if nail is not None:
            s2 = de.cross(ne).normalized()
            if claw > 0:
                c0 = tip - ne * rad[-1] * 0.3
                c1 = c0 + de * claw * 0.6 + ne * claw * 0.25
                c2 = c1 + de * claw * 0.25 + ne * claw * 0.55
                mb.tube([c0, c1, c2], lambda q: rad[-1] * 0.85 * (1 - 0.9 * q), nail, segs=5)
            else:
                Mn = basis(tip - de * fl * 0.07 - ne * rad[-1] * 0.62, s2, ne, de)
                mb.sphere((rad[-1] * 0.85, rad[-1] * 0.3, fl * 0.1), (0, 0, 0), tip_mat or nail, segs=6, rings=3, M=Mn)
    if thumb:
        base = w + d * pl * 0.22 + t * pw * 0.95 + n * th * 0.35
        dv = (d * 0.55 + t * 0.62 + n * 0.3).normalized()
        tl = length * 0.62

        def rft(q, joint):
            return r * 1.15 * (1.0 - 0.3 * q) * (1.0 + (0.14 * bony if joint else 0.0))
        pts, rad, de, ne = chain(base, dv, n, [tl * 0.42, tl * 0.33, tl * 0.25], [0.0, thumb_curl, thumb_curl], rft,
                                 sub=(1.0,) if lite else (0.5, 1.0))
        mb.tube(pts, lambda q, rad=rad: rad[min(len(rad) - 1, int(round(q * (len(rad) - 1))))], skin, segs=segs)
        if not lite:
            mb.sphere((rad[-1],) * 3, pts[-1], skin, segs=segs, rings=4)
        if nail is not None and claw <= 0:
            s2 = de.cross(ne).normalized()
            Mn = basis(pts[-1] - de * tl * 0.07 - ne * rad[-1] * 0.62, s2, ne, de)
            mb.sphere((rad[-1] * 0.85, rad[-1] * 0.3, tl * 0.1), (0, 0, 0), tip_mat or nail, segs=6, rings=3, M=Mn)


def hanging_hand(mb, wrist, side, length, skin, nail=None, **kw):
    """Hand hanging at the side, palm toward the body, thumb forward (-Y)."""
    sx = 1 if side == "L" else -1
    return hand(mb, wrist, (0, 0, -1), (-sx, 0, 0), (0, -1, 0), length, skin, nail, **kw)


def eye(mb, c, look, r, sclera, iris, pupil, glint=None, iris_r=0.52, up=(0, 0, 1), segs=14, lid=None,
        lid_open=0.75, lid_r=0.16):
    """Wet eyeball: sclera, domed iris, pupil, a pin-point glint, optional lid rim."""
    c = Vector(c)
    x, y, z = ortho(look, up)          # z = look, y = up
    M = basis(c, x, y, z)
    mb.sphere((r, r, r), (0, 0, 0), sclera, segs=segs, rings=max(6, segs * 2 // 3), M=M)
    ir = r * iris_r
    zc = math.sqrt(max(r * r - ir * ir, 0.0))
    mb.sphere((ir, ir, r * 0.15), (0, 0, zc), iris, segs=segs, rings=5, M=M)
    mb.sphere((ir * 0.48, ir * 0.48, r * 0.1), (0, 0, r * 0.94), pupil, segs=max(8, segs - 4), rings=4, M=M)
    if glint is not None:
        g = (Vector((-0.28, 0.32, 0.9))).normalized() * r * 1.035
        mb.sphere((r * 0.11, r * 0.11, r * 0.05), tuple(g), glint, segs=6, rings=4, M=M)
    if lid is not None:
        # puffy lid ring round the visible part of the eye (ellipse, wider than tall)
        pts = []
        a0 = math.acos(max(-1.0, min(1.0, lid_open)))
        for k in range(17):
            ph = 2 * math.pi * k / 16
            v = Vector((math.cos(ph) * math.sin(a0) * 1.15, math.sin(ph) * math.sin(a0) * 0.8, math.cos(a0)))
            pts.append(tuple(M @ (v * r * 1.02)))
        mb.tube(pts, lambda q: r * lid_r * (1.25 if 0.1 < q < 0.4 else 1.0), lid, segs=6, caps=False)


def displace(faces, fn):
    """Move every vertex of `faces` by fn(co) -> offset vector."""
    for v in {v for f in faces for v in f.verts}:
        v.co += Vector(fn(v.co.copy()))


def cloth_folds(faces, cx, cy, amp, freq, z0, z1, seed=0, bottom=True, sway=0.0):
    """Radial vertical folds on a lathed garment (stronger toward the hem)."""
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]

    def fn(co):
        if not (z0 <= co.z <= z1):
            return (0, 0, 0)
        k = (z1 - co.z) / (z1 - z0) if bottom else (co.z - z0) / (z1 - z0)
        a = math.atan2(co.y - cy, co.x - cx)
        w = amp * (0.25 + 0.75 * k) * (math.sin(a * freq + ph[0] + sway * co.z) +
                                      0.45 * math.sin(a * freq * 2.3 + ph[1]) + 0.25 * math.sin(a * 3 + ph[2]))
        return (math.cos(a) * w, math.sin(a) * w, 0)
    displace(faces, fn)


def ribs(mb, cx, cy, z_top, n, dz, rx, ry, material, r=0.008, sweep=(0.3, 2.4), droop=0.05, shrink=0.0,
         segs=5, lift=0.0):
    """Rib arcs (both sides) round an elliptic torso; front ends droop lower."""
    for k in range(n):
        z = z_top - k * dz
        sc = 1 - shrink * k / max(1, n - 1)
        for s in (-1, 1):
            pts = []
            for i in range(8):
                q = i / 7
                a = sweep[0] + (sweep[1] - sweep[0]) * q
                pts.append((cx + s * (rx * sc + lift) * math.sin(a), cy - (ry * sc + lift) * math.cos(a),
                            z - droop * (1 - q)))
            mb.tube(pts, lambda q: r * (0.65 + 0.35 * math.sin(q * math.pi)), material, segs=segs)


def teeth_arc(mb, pts, out, ln, r, material, seed=0, jitter=0.25, segs=5, every=1):
    """One tooth per point, pointing along out(p) (callable or vector)."""
    rnd = random.Random(seed)
    for i, p in enumerate(pts[::every]):
        p = Vector(p)
        o = Vector(out(p) if callable(out) else out).normalized()
        L = ln * rnd.uniform(1 - jitter, 1 + jitter)
        mb.limb(p, p + o * L, r * rnd.uniform(0.85, 1.1), r * 0.15, material, segs=segs)


def lerp3(a, b, t):
    return Vector(a) + (Vector(b) - Vector(a)) * t


# ======================================================== HALL MONITOR ====
def entity_monitor():
    skin = mat("MonitorSkin", "#c4c7c2", rough=0.55)
    cloth = mat("MonitorCloth", "#27314a", rough=0.85)
    sash = mat("MonitorSash", "#c4652a", rough=0.7, double=True)
    stripe = mat("SashReflect", "#d7d9cf", rough=0.35, metal=0.3, double=True)
    belt = mat("MonitorBelt", "#151515", rough=0.5)
    shoe = mat("MonitorShoe", "#1b1918", rough=0.4)
    hole = mat("MouthHole", "#030202", rough=1.0)
    badge = mat("BadgeCard", "#ece9df", rough=0.6)
    lany = mat("Lanyard", "#2f5b8f", rough=0.8, double=True)
    metal = mat("Whistle", "#d0d3d5", rough=0.25, metal=0.6)
    cord = mat("WhistleCord", "#5c1a1a", rough=0.8)

    P = mirror_pos({
        "Hips": (0, 0, 1.28), "Spine": (0, 0, 1.40), "Chest": (0, 0, 1.56),
        "Neck": (0, 0.0, 2.0), "Head": (0, 0.0, 2.14),
        "ShoulderL": (0.205, 0.0, 1.95), "ElbowL": (0.215, 0.0, 1.38), "HandL": (0.222, 0.0, 0.83),
        "HipL": (0.1, 0.0, 1.25), "KneeL": (0.105, 0.0, 0.68), "FootL": (0.105, 0.0, 0.09),
    })
    rig = Rig()
    rig.skeleton(P)

    # pelvis + belt
    m = rig.mb("Hips")
    torso(m, [(0.0, 1.16), (0.09, 1.17), (0.13, 1.23), (0.138, 1.31), (0.128, 1.42), (0.0, 1.43)], cloth, sy=0.72)
    m.lathe([(0.132, 1.375), (0.134, 1.385), (0.134, 1.415), (0.13, 1.425)], belt, segs=16, sy=0.74, close=False)
    m.box((0.05, 0.012, 0.035), (0.0, -0.099, 1.4), metal, bevel=0.004)
    # abdomen
    m = rig.mb("Spine")
    torso(m, [(0.0, 1.38), (0.12, 1.38), (0.112, 1.48), (0.118, 1.58), (0.0, 1.6)], cloth, sy=0.7)
    # chest: gaunt narrow ribcage with shoulder knobs
    m = rig.mb("Chest")
    chest_prof = [(0.0, 1.54), (0.12, 1.55), (0.145, 1.66), (0.155, 1.8), (0.15, 1.92), (0.12, 1.99),
                  (0.06, 2.03), (0.0, 2.035)]
    torso(m, chest_prof, cloth, sy=0.62, segs=18)
    for s in (-1, 1):
        m.sphere((0.065, 0.06, 0.06), (s * 0.19, 0.0, 1.95), cloth, segs=12, rings=8)
    # collar
    m.lathe([(0.06, 1.99), (0.062, 2.02), (0.052, 2.045)], cloth, segs=14, sy=0.9, close=False)

    def rad_at(z):
        for (r0, z0), (r1, z1) in zip(chest_prof[:-1], chest_prof[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / max(z1 - z0, 1e-6)
        return 0.12

    # diagonal safety sash: left shoulder -> right waist
    top, low = Vector((0.15, 0.0, 2.0)), Vector((-0.13, 0.0, 1.52))
    cen = (top + low) / 2
    u = (top - low).normalized()
    A = (top - low).length / 2
    v = Vector((0, 1, 0))
    wdir = u.cross(v).normalized()
    ring, nrms = [], []
    nseg = 28
    for k in range(nseg + 1):
        a = 2 * math.pi * k / nseg
        p = cen + u * A * math.cos(a)
        depth = rad_at(p.z) * 0.62 + 0.016
        widthx = rad_at(p.z) + 0.016
        p.y = depth * math.sin(a) * 1.05
        # keep the band hugging the torso in x as well
        if abs(p.x) > widthx:
            p.x = math.copysign(widthx, p.x)
        ring.append(p)
        nrms.append(Vector((p.x * 0.4, p.y, 0.15)).normalized())
    # ribbon width direction = wdir; build as quad strip manually
    vs, fs = [], []
    for i, p in enumerate(ring):
        vs.append(p + wdir * 0.045)
        vs.append(p - wdir * 0.045)
    for i in range(nseg):
        a = 2 * i
        fs.append((a, a + 2, a + 3, a + 1))
    m.raw(vs, fs, sash, smooth=True)
    vs2 = []
    for i, p in enumerate(ring):
        n = nrms[i]
        vs2.append(p + wdir * 0.009 + n * 0.0015)
        vs2.append(p - wdir * 0.009 + n * 0.0015)
    m.raw(vs2, fs, stripe, smooth=True)
    # lanyard + blank badge
    lp = [Vector((0.05, 0.03, 2.03)), Vector((0.065, -0.02, 2.0)), Vector((0.05, -0.08, 1.9)),
          Vector((0.012, -0.098, 1.79)), Vector((0.0, -0.1, 1.77))]
    m.tube(lp, 0.005, lany, segs=4)
    m.tube([Vector((-p.x, p.y, p.z)) for p in lp], 0.005, lany, segs=4)
    m.box((0.075, 0.004, 0.1), (0.0, -0.104, 1.71), badge, bevel=0.003)
    m.box((0.02, 0.006, 0.015), (0.0, -0.105, 1.765), metal, bevel=0.002)
    # breast pocket flap
    m.box((0.06, 0.005, 0.04), (-0.07, -0.088, 1.84), cloth, bevel=0.004, rot=(8, 0, 0))

    # neck
    rig.mb("Neck").limb((0, 0.005, 1.98), (0, 0.0, 2.2), 0.042, 0.04, skin, segs=10)
    # head: smooth pale egg, no eyes, single round mouth hole, whistle on a cord
    m = rig.mb("Head")
    hc = Vector((0, -0.01, 2.33))
    hr = (0.118, 0.134, 0.2)
    egg = []
    for k in range(13):
        t = k / 12
        phi = math.pi * t
        rr = math.sin(phi) * (1.0 + 0.12 * (t - 0.5))     # slightly wider at the crown
        egg.append((rr * hr[0], hc.z - hr[2] * math.cos(phi)))
    m.lathe(egg, skin, M=Matrix.Translation((0, hc.y, 0)), segs=22, sy=hr[1] / hr[0])
    # mouth: single round dark hole low on the face, with a soft lip ring
    d = Vector((0, -1, -0.75)).normalized()
    # find the egg surface along d by marching inward
    pr = hc + d * 0.3
    for _ in range(200):
        z = pr.z
        t = max(0.0, min(1.0, math.acos(max(-1, min(1, (hc.z - z) / hr[2]))) / math.pi))
        rr = math.sin(math.pi * t) * (1.0 + 0.12 * (t - 0.5))
        if (pr.x / (rr * hr[0] + 1e-9)) ** 2 + ((pr.y - hc.y) / (rr * hr[1] + 1e-9)) ** 2 <= 1.0:
            break
        pr = pr - d * 0.002
    mp = pr
    mn = Vector((0, -0.93, -0.36)).normalized()
    R = Matrix.Translation(mp) @ mn.to_track_quat("Z", "Y").to_matrix().to_4x4()
    m.sphere((0.03, 0.03, 0.006), (0, 0, 0.0), hole, segs=18, rings=6, M=R)
    m.lathe([(0.026, 0.0), (0.031, 0.006), (0.037, 0.004), (0.042, -0.006)], skin, M=R, segs=18, close=False)
    # cord from the mouth down to a silver whistle
    wpos = mp + Vector((0.0, -0.03, -0.13))
    m.tube([mp + Vector((0, -0.004, -0.004)), mp + Vector((0.002, -0.022, -0.04)), mp + Vector((0.006, -0.032, -0.09)),
            wpos + Vector((0, 0, 0.022))], 0.0026, cord, segs=4)
    m.cyl(0.016, 0.05, wpos, metal, rot=(0, 90, 0), segs=14)
    m.box((0.034, 0.016, 0.013), wpos + Vector((0.034, 0, 0.008)), metal, bevel=0.003)
    m.cyl(0.007, 0.003, wpos + Vector((-0.008, 0, 0.02)), metal, rot=(90, 0, 0), segs=8)

    for s, sx in (("L", 1), ("R", -1)):
        sh, el, ha = P["Shoulder" + s], P["Elbow" + s], P["Hand" + s]
        rig.mb("Shoulder" + s).limb(sh, el, 0.05, 0.04, cloth, segs=10)
        m = rig.mb("Elbow" + s)
        cuff = Vector((ha[0], ha[1], 0.95))
        m.limb(el, cuff, 0.041, 0.036, cloth, segs=10)
        m.cyl(0.039, 0.025, cuff + Vector((0, 0, 0.0)), cloth, segs=10)
        m.limb(cuff + Vector((0, 0, 0.02)), ha, 0.024, 0.021, skin, segs=8)
        m.sphere((0.024, 0.026, 0.026), Vector(el), cloth, segs=10, rings=6)
        # long thin hand with long fingers reaching to the knees
        finger_set(rig.mb("Hand" + s), ha, s, 0.24, skin, spread=0.0105, r=0.0068, curl=0.35,
                   palm=(0.017, 0.038, 0.07))
        hp, kn, ft = P["Hip" + s], P["Knee" + s], P["Foot" + s]
        rig.mb("Hip" + s).limb(hp, kn, 0.07, 0.05, cloth, segs=10)
        m = rig.mb("Knee" + s)
        m.limb(kn, (kn[0], kn[1], 0.25), 0.05, 0.043, cloth, segs=10)
        m.lathe([(0.046, 0.23), (0.046, 0.26)], cloth, M=Matrix.Translation((kn[0], kn[1], 0)), segs=10)
        m.limb((kn[0], 0.0, 0.25), ft, 0.027, 0.026, skin, segs=8)
        # long narrow shoe
        m = rig.mb("Foot" + s)
        m.box((0.085, 0.27, 0.06), (ft[0], -0.08, 0.035), shoe, bevel=0.025, segs=2)
        m.box((0.09, 0.27, 0.015), (ft[0], -0.08, 0.0075), belt, bevel=0.005)
    rig.build()

    # ------------------------------------------------------------ clips --
    base = {
        "Spine": (14, 0, 0), "Chest": (17, 0, 0), "Neck": (22, 0, 0), "Head": (-16, 0, 0),
        "ShoulderL": (-26, 0, 4), "ShoulderR": (-26, 0, -4),
        "ElbowL": (-12, 0, 0), "ElbowR": (-12, 0, 0), "HandL": (-8, 0, 0), "HandR": (-8, 0, 0),
        "HipL": (-10, 0, 0), "HipR": (-10, 0, 0), "KneeL": (16, 0, 0), "KneeR": (16, 0, 0),
        "FootL": (-6, 0, 0), "FootR": (-6, 0, 0), "Hips": {"loc": (0, 0, -0.03)},
    }
    T = 2 * math.pi

    def idle(f):
        p = f / 60.0 * T
        return add(base, {
            "Hips": {"rot": (0, 2.0 * math.sin(p), 0), "loc": (0.012 * math.sin(p), 0, 0.006 * math.sin(2 * p))},
            "Spine": (1.5 * math.sin(2 * p), -1.5 * math.sin(p), 0),
            "Chest": (1.0 * math.sin(2 * p + 0.5), 0, 2 * math.sin(p)),
            "Neck": (2 * math.sin(p + 1), 0, 0),
            "Head": (3 * math.sin(2 * p), 14 * math.sin(p), 6 * math.sin(p + 0.7)),
            "ShoulderL": (3 * math.sin(p + 0.5), 0, -2 * math.sin(p)),
            "ShoulderR": (-3 * math.sin(p + 0.5), 0, -2 * math.sin(p)),
            "ElbowL": (-3 * math.sin(p), 0, 0), "ElbowR": (3 * math.sin(p), 0, 0),
        })

    def walk(f, n=36, amp=1.0):
        p = f / n * T
        out = {}
        bob = -0.045 * math.sin(p) ** 2
        out["Hips"] = {"rot": (0, 3 * math.sin(p), 7 * math.sin(p)), "loc": (0.02 * math.sin(p), 0, bob)}
        out["Spine"] = (2 * math.sin(2 * p), 0, -4 * math.sin(p))
        out["Chest"] = (0, -2 * math.sin(p), -5 * math.sin(p))
        out["Neck"] = (3 * math.sin(2 * p + 0.6), 0, 2 * math.sin(p))
        out["Head"] = (-3 * math.sin(2 * p + 0.6), 6 * math.sin(p * 0.5) ** 2 * 0 + 5 * math.sin(p), 0)
        for s, ph in (("L", 0.0), ("R", math.pi)):
            q = p + ph
            thigh = -28 * math.sin(q)
            knee = 8 + 48 * max(0.0, math.cos(q)) ** 1.5
            out["Hip" + s] = (thigh, 0, 0)
            out["Knee" + s] = (knee, 0, 0)
            out["Foot" + s] = (-0.45 * thigh - 0.2 * knee + 6 * math.sin(q), 0, 0)
            out["Shoulder" + s] = sym(s, (22 * math.sin(q), 0, 3))
            out["Elbow" + s] = (-10 - 12 * max(0.0, -math.sin(q)), 0, 0)
            out["Hand" + s] = (6 * math.sin(q - 0.8), 0, 0)
        return add(base, out)

    def run(f):
        n = 21
        p = f / n * T
        out = {"Hips": {"rot": (0, 7 * math.sin(p), 10 * math.sin(p)),
                        "loc": (0.03 * math.sin(p), -0.03, -0.12 - 0.06 * math.sin(2 * p + 0.8))},
               "Spine": (22 + 4 * math.sin(2 * p), 0, -7 * math.sin(p)),
               "Chest": (14, -4 * math.sin(p), -9 * math.sin(p)),
               "Neck": (6, 0, 4 * math.sin(p)),
               "Head": (-34 + 6 * math.sin(2 * p), 10 * math.sin(p + 0.5), 0)}
        for s, ph in (("L", 0.0), ("R", math.pi)):
            q = p + ph
            thigh = -46 * math.sin(q) - 14
            knee = 18 + 78 * max(0.0, math.cos(q)) ** 1.2
            out["Hip" + s] = (thigh, 0, 0)
            out["Knee" + s] = (knee, 0, 0)
            out["Foot" + s] = (-0.35 * thigh - 0.25 * knee, 0, 0)
            out["Shoulder" + s] = sym(s, (-30 + 55 * math.sin(q), 0, 14 + 10 * math.cos(q)))
            out["Elbow" + s] = (-30 - 25 * max(0.0, -math.sin(q)), 0, 0)
            out["Hand" + s] = (-10 + 10 * math.sin(q), 0, 0)
        return add({k: v for k, v in base.items() if k not in ("Hips",)}, out)

    rest_idle = idle(0)
    wind = add(base, {"Hips": {"loc": (0, 0.08, -0.02)}, "Spine": (-10, 0, 0), "Chest": (-10, 0, 0),
                      "Neck": (-4, 0, 0), "Head": (-12, 0, 0),
                      "ShoulderL": (-130, 0, 38), "ShoulderR": (-130, 0, -38),
                      "ElbowL": (-25, 0, 0), "ElbowR": (-25, 0, 0), "HandL": (20, 0, 0), "HandR": (20, 0, 0),
                      "HipL": (6, 0, 0), "HipR": (-14, 0, 0), "KneeR": (14, 0, 0)})
    lunge = add(base, {"Hips": {"loc": (0, -0.55, -0.16)}, "Spine": (22, 0, 0), "Chest": (16, 0, 0),
                       "Neck": (0, 0, 0), "Head": (-30, 0, 0),
                       "ShoulderL": (-75, 0, 26), "ShoulderR": (-75, 0, -26),
                       "ElbowL": (8, 0, 0), "ElbowR": (8, 0, 0), "HandL": (-15, 0, 0), "HandR": (-15, 0, 0),
                       "HipL": (-58, 0, 0), "KneeL": (60, 0, 0), "FootL": (8, 0, 0),
                       "HipR": (24, 0, 0), "KneeR": (20, 0, 0), "FootR": (10, 0, 0)})
    grab = add(lunge, {"ShoulderL": (5, 0, -36), "ShoulderR": (5, 0, 36), "ElbowL": (-48, 0, -10),
                       "ElbowR": (-48, 0, 10), "HandL": (-25, 0, 0), "HandR": (-25, 0, 0),
                       "Head": (8, 0, 10), "Hips": {"loc": (0, -0.08, 0.0)}})

    def attack(f):
        return keyed([(0, rest_idle), (8, wind), (14, lunge), (19, grab), (24, grab), (30, rest_idle)], f)

    clips = [clip(rig, "Idle", 2.0, idle), clip(rig, "Walk", 1.2, walk), clip(rig, "Run", 0.7, run),
             clip(rig, "Attack", 1.0, attack)]
    return _finish_entity("entity_monitor", rig, clips,
                          [("Idle", 0), ("Walk", 9), ("Run", 5), ("Attack", 8), ("Attack", 18)])


# ========================================================== SUBSTITUTE ====
def entity_substitute():
    plaster = mat("Plaster", "#ddd8cb", rough=0.75)
    cracks = mat("PlasterCrack", "#2e2a25", rough=0.9, double=True)
    smear = mat("ChalkSmear", "#8d9189", rough=1.0)
    chalk = mat("ChalkX", "#fbfbf6", rough=1.0, double=True)
    card = mat("Cardigan", "#77736a", rough=0.95)
    knit = mat("CardiganRib", "#68645c", rough=0.95)
    blouse = mat("Blouse", "#c9bfa7", rough=0.85, double=True)
    skirt = mat("Skirt", "#3d3c3a", rough=0.9)
    shoe = mat("TeacherShoe", "#3a2a1e", rough=0.45)
    button = mat("Button", "#2a2420", rough=0.4)
    wood = mat("RulerWood", "#c7a46b", rough=0.6)
    tick = mat("RulerInk", "#1a1a1a", rough=0.6)
    rnd = random.Random(19)

    P = mirror_pos({
        "Hips": (0, 0, 0.95), "Spine": (0, 0, 1.02), "Chest": (0, 0, 1.16),
        "Neck": (0, 0.0, 1.43), "Head": (0, 0.0, 1.53),
        "ShoulderL": (0.18, 0.0, 1.40), "ElbowL": (0.2, 0.0, 1.11), "HandL": (0.205, 0.0, 0.85),
        "HipL": (0.085, 0.0, 0.92), "KneeL": (0.09, 0.0, 0.49), "FootL": (0.09, 0.0, 0.07),
    })
    rig = Rig()
    rig.skeleton(P)

    # long skirt with pleat waves (on Hips)
    m = rig.mb("Hips")
    fs = m.lathe([(0.0, 1.0), (0.125, 1.0), (0.14, 0.92), (0.165, 0.75), (0.2, 0.5), (0.235, 0.3),
                  (0.236, 0.29), (0.0, 0.3)], skirt, segs=24, sy=0.82)
    for v in {v for f in fs for v in f.verts}:
        if v.co.z < 0.9 and (v.co.x ** 2 + v.co.y ** 2) > 0.01:
            a = math.atan2(v.co.y, v.co.x)
            k = (0.9 - v.co.z) / 0.6
            v.co.x += math.cos(a) * 0.01 * k * math.sin(a * 9)
            v.co.y += math.sin(a) * 0.01 * k * math.sin(a * 9)
    m.lathe([(0.13, 0.97), (0.132, 1.0), (0.128, 1.02)], knit, segs=20, sy=0.82, close=False)
    # cardigan waist / abdomen
    m = rig.mb("Spine")
    torso(m, [(0.0, 0.98), (0.13, 0.98), (0.135, 1.05), (0.125, 1.12), (0.128, 1.2), (0.0, 1.21)], card, sy=0.72)
    m.lathe([(0.137, 0.98), (0.14, 1.0), (0.136, 1.02)], knit, segs=18, sy=0.74, close=False)
    # chest
    m = rig.mb("Chest")
    torso(m, [(0.0, 1.14), (0.125, 1.15), (0.14, 1.25), (0.145, 1.32), (0.135, 1.39), (0.09, 1.43),
              (0.0, 1.44)], card, sy=0.68, segs=18)
    for s in (-1, 1):
        m.sphere((0.06, 0.055, 0.05), (s * 0.165, 0, 1.39), card, segs=12, rings=8)
    # V of the blouse showing in the open cardigan + buttons + collar
    m.raw([(-0.055, -0.093, 1.425), (0.055, -0.093, 1.425), (0.0, -0.1, 1.25)], [(2, 1, 0)], blouse)
    m.tube([(-0.06, -0.091, 1.43), (-0.012, -0.1, 1.26), (0.0, -0.1, 1.15), (0.0, -0.1, 0.98)], 0.007, knit, segs=5)
    m.tube([(0.06, -0.091, 1.43), (0.012, -0.1, 1.26), (0.0, -0.1, 1.15)], 0.007, knit, segs=5)
    for z in (1.23, 1.14, 1.06):
        m.cyl(0.008, 0.006, (0.0, -0.104 if z > 1.12 else -0.098, z), button, rot=(90, 0, 0), segs=8)
    m.box((0.07, 0.006, 0.06), (0.075, -0.088, 1.07), card, bevel=0.004)   # pocket
    # neck (plaster)
    m = rig.mb("Neck")
    m.limb((0, 0.005, 1.4), (0, 0.0, 1.57), 0.05, 0.045, plaster, segs=12)
    crack(m, rnd, (0, 0.005, 1.48), (0.05, 0.05, 0.1), (-1, -1, 0.3), 6, cracks, step=0.03)
    # head: mannequin
    m = rig.mb("Head")
    hc, hr = Vector((0, -0.005, 1.645)), (0.083, 0.1, 0.118)
    m.sphere(hr, hc, plaster, segs=20, rings=14)
    # narrower chin / jaw blended into the lower head
    m.sphere((0.062, 0.07, 0.06), hc + Vector((0, -0.018, -0.06)), plaster, segs=14, rings=8)
    # small mannequin nose
    np_, nn = ellipsoid_point(hc, hr, (0, -1, -0.1))
    m.sphere((0.011, 0.016, 0.026), np_ + Vector((0, 0.004, -0.004)), plaster, segs=10, rings=7, rot=(-14, 0, 0))
    # molded hair: cap set back from the forehead + bun
    m.sphere((0.09, 0.098, 0.085), hc + Vector((0, 0.022, 0.04)), plaster, segs=16, rings=10)
    m.sphere((0.05, 0.045, 0.045), hc + Vector((0, 0.105, 0.03)), plaster, segs=12, rings=8)
    # smeared eyes + chalk X
    for sx in (-1, 1):
        ep, en = ellipsoid_point(hc, hr, (sx * 0.42, -1, 0.12))
        Rm = en.to_track_quat("Z", "Y").to_matrix().to_4x4()
        m.sphere((0.034, 0.027, 0.006), Vector((0, 0, -0.003)), smear, segs=12, rings=6,
                 M=Matrix.Translation(ep) @ Rm @ Matrix.Rotation(math.radians(sx * 12), 4, "Z"))
        for ang in (40, -40):
            pts, nrm = [], []
            for k in range(7):
                t = (k / 6 - 0.5) * 0.06
                d = Vector((sx * 0.42 + t * math.cos(math.radians(ang)) * 9, -1,
                            0.12 + t * math.sin(math.radians(ang)) * 9 * 0.85))
                p, n = ellipsoid_point(hc, hr, d)
                pts.append(p + n * 0.0035)
                nrm.append(n)
            m.ribbon(pts, 0.007, chalk, normal=nrm)
    for k in range(4):
        d = (rnd.uniform(-1, 1), rnd.uniform(-1, 0.2), rnd.uniform(0.2, 1))
        crack(m, rnd, hc, hr, d, 9, cracks, step=0.035)
    crack(m, rnd, hc, hr, (0.5, -1, -0.4), 7, cracks, step=0.03)

    for s, sx in (("L", 1), ("R", -1)):
        sh, el, ha = Vector(P["Shoulder" + s]), Vector(P["Elbow" + s]), Vector(P["Hand" + s])
        rig.mb("Shoulder" + s).limb(sh, el, 0.048, 0.042, card, segs=10)
        m = rig.mb("Elbow" + s)
        m.sphere((0.04, 0.04, 0.04), el, card, segs=10, rings=6)
        m.limb(el, ha + Vector((0, 0, 0.05)), 0.042, 0.04, card, segs=10)
        m.lathe([(0.042, ha.z + 0.02), (0.044, ha.z + 0.055)], knit, M=Matrix.Translation((ha.x, ha.y, 0)), segs=10)
        m.limb(ha + Vector((0, 0, 0.05)), ha, 0.024, 0.022, plaster, segs=8)
        hm = rig.mb("Hand" + s)
        finger_set(hm, ha, s, 0.075, plaster, spread=0.0085, r=0.0075, curl=0.2, palm=(0.018, 0.036, 0.048))
        crack(hm, rnd, ha + Vector((0, 0, -0.04)), (0.018, 0.036, 0.048), (sx, -0.3, 0.2), 5, cracks, step=0.03)
        hp, kn, ft = Vector(P["Hip" + s]), Vector(P["Knee" + s]), Vector(P["Foot" + s])
        rig.mb("Hip" + s).limb(hp + Vector((0, 0, -0.05)), kn, 0.06, 0.045, plaster, segs=8)
        m = rig.mb("Knee" + s)
        m.limb(kn, ft, 0.045, 0.03, plaster, segs=10, bulge=0.006)
        crack(m, rnd, kn + Vector((0, 0, -0.22)), (0.04, 0.04, 0.2), (sx * 0.3, -1, 0.0), 6, cracks, step=0.025)
        m = rig.mb("Foot" + s)
        m.box((0.07, 0.2, 0.05), (ft.x, -0.05, 0.028), shoe, bevel=0.022, segs=2)
        m.box((0.035, 0.035, 0.035), (ft.x, 0.03, 0.0175), shoe, bevel=0.006)
        m.tube([(ft.x - 0.036, -0.02, 0.06), (ft.x, -0.035, 0.068), (ft.x + 0.036, -0.02, 0.06)], 0.004, shoe, segs=4)
    rig.build()
    # ruler held in the right hand (extra node "Ruler", child of HandR)
    ha = Vector(P["HandR"])
    rm = MB()
    grip = ha + Vector((0, -0.01, -0.07))
    Lr = 0.6
    rm.box((0.034, 0.006, Lr), (0, 0, -Lr / 2 + 0.05), wood, bevel=0.0015)
    for k in range(1, 24):
        z = 0.05 - k * 0.025
        big = k % 4 == 0
        for fy in (-0.0031, 0.0031):
            rm.box((0.014 if big else 0.007, 0.001, 0.0016), (-0.017 + (0.007 if big else 0.0035), fy, z), tick)
    rm.cyl(0.0035, 0.007, (0, 0, -Lr + 0.07), tick, rot=(90, 0, 0), segs=8)
    ro = rm.obj("Ruler")
    ro.parent = None
    ro.matrix_world = Matrix.Translation(grip) @ Matrix.Rotation(math.radians(-10), 4, "X") @ \
        Matrix.Rotation(math.radians(8), 4, "Y") @ Matrix.Rotation(math.radians(90), 4, "Z")
    bpy.context.view_layer.update()
    L.set_parent(ro, rig.j["HandR"])
    # bake ruler world rotation into data so the node keeps a pure offset
    rot = ro.matrix_basis.to_3x3().to_4x4()
    ro.data.transform(rot)
    ro.matrix_basis = Matrix.Translation(ro.matrix_basis.to_translation())

    still = {"Neck": (4, 0, 0), "Head": (2, 0, 0), "ShoulderL": (0, 0, 3), "ShoulderR": (0, 0, -3),
             "ElbowL": (-6, 0, 0), "ElbowR": (-10, 0, 0)}
    pose1 = add(still, {"Chest": (0, 0, -10), "ShoulderR": (-88, 0, 12), "ElbowR": (2, 0, 0),
                        "HandR": (8, 0, 0), "Head": (0, 16, -6), "Neck": (6, 0, 0),
                        "ShoulderL": (8, 0, 4), "Spine": (4, 0, 0)})
    pose2 = add(still, {"Spine": (14, 0, 0), "Chest": (10, 0, 0), "Neck": (0, 0, 0), "Head": (-20, 0, 0),
                        "ShoulderL": (-78, 0, -8), "ShoulderR": (-74, 0, 6), "ElbowL": (-14, 0, 0),
                        "ElbowR": (-8, 0, 0), "HandL": (-15, 0, 0), "HandR": (-30, 0, 0),
                        "HipL": (-3, 0, 0), "KneeL": (4, 0, 0), "Hips": {"loc": (0, -0.03, -0.01)}})
    pose3 = add(still, {"Neck": (0, 40, 0), "Head": (6, 50, 8), "ShoulderL": (0, 0, 18), "ShoulderR": (6, 0, -6),
                        "Chest": (0, -6, 0), "HandL": (0, 0, -20), "ElbowL": (-30, 0, 0), "HandR": (-20, 0, 0)})
    pose4 = add(still, {"Spine": (-8, 0, 12), "Chest": (-6, 0, 14), "Head": (-6, -10, 0),
                        "ShoulderR": (-165, 0, -18), "ElbowR": (-55, 0, 0), "HandR": (-30, 0, 0),
                        "ShoulderL": (-62, 0, -10), "ElbowL": (-25, 0, 0),
                        "HipL": (-4, 0, 0), "KneeL": (6, 0, 0), "HipR": (3, 0, 0)})
    clips = [clip(rig, "Idle", 1.0, lambda f: still)]
    for nm, ps in (("Pose1", pose1), ("Pose2", pose2), ("Pose3", pose3), ("Pose4", pose4)):
        clips.append(clip(rig, nm, 0.1, lambda f, ps=ps: ps))
    return _finish_entity("entity_substitute", rig, clips,
                          [("Idle", 0), ("Pose1", 0), ("Pose2", 0), ("Pose3", 0), ("Pose4", 0)],
                          view=(-1.0, -1.6, 0.35))


# =============================================================== PUPIL ====
def entity_pupil():
    coat = mat("Raincoat", "#d6aa1c", rough=0.35)
    coat_d = mat("RaincoatSeam", "#a98414", rough=0.4)
    skin = mat("PupilSkin", "#d9d2c8", rough=0.6)
    bag = mat("PaperBag", "#b08a58", rough=0.95)
    bag_d = mat("PaperBagFold", "#86643d", rough=0.95)
    eye = mat("EyeHole", "#050403", rough=1.0, double=True)
    sock = mat("Sock", "#e4e0d6", rough=0.9)
    shoe = mat("Sneaker", "#8a2a25", rough=0.7)
    sole = mat("SneakerSole", "#ecebe5", rough=0.6)
    tog = mat("Toggle", "#2a2622", rough=0.5)
    rnd = random.Random(29)
    P = mirror_pos({
        "Hips": (0, 0, 0.56), "Spine": (0, 0, 0.6), "Chest": (0, 0, 0.7),
        "Neck": (0, 0.0, 0.85), "Head": (0, 0.0, 0.89),
        "ShoulderL": (0.12, 0.0, 0.83), "ElbowL": (0.135, 0.0, 0.66), "HandL": (0.14, 0.0, 0.49),
        "HipL": (0.06, 0.0, 0.54), "KneeL": (0.062, 0.0, 0.3), "FootL": (0.062, 0.0, 0.055),
    })
    rig = Rig()
    rig.skeleton(P)
    # coat skirt (Hips) - oversized flare
    m = rig.mb("Hips")
    fs = m.lathe([(0.0, 0.64), (0.15, 0.64), (0.17, 0.55), (0.2, 0.4), (0.225, 0.26), (0.226, 0.245),
                  (0.215, 0.25), (0.0, 0.27)], coat, segs=22, sy=0.85)
    for v in {v for f in fs for v in f.verts}:
        if v.co.z < 0.5 and (v.co.x ** 2 + v.co.y ** 2) > 0.01:
            a = math.atan2(v.co.y, v.co.x)
            k = (0.5 - v.co.z) / 0.25
            w = 0.012 * k * (math.sin(a * 5 + 1) + 0.5 * math.sin(a * 11))
            v.co.x += math.cos(a) * w
            v.co.y += math.sin(a) * w
    # front seam + toggles + pockets
    m.box((0.012, 0.004, 0.36), (0.0, -0.186, 0.44), coat_d)
    for s in (-1, 1):
        m.box((0.075, 0.012, 0.03), (s * 0.1, -0.165, 0.47), coat_d, bevel=0.004, rot=(-12, 0, s * -18))
    # coat chest
    m = rig.mb("Chest")
    torso(m, [(0.0, 0.6), (0.15, 0.6), (0.155, 0.7), (0.15, 0.8), (0.12, 0.86), (0.05, 0.89), (0.0, 0.89)],
          coat, sy=0.82, segs=20)
    for s in (-1, 1):
        m.sphere((0.065, 0.06, 0.055), (s * 0.115, 0.0, 0.825), coat, segs=12, rings=8)
    m.box((0.012, 0.004, 0.27), (0.0, -0.128, 0.73), coat_d)
    for z in (0.81, 0.72, 0.63):
        m.box((0.035, 0.012, 0.012), (0.0, -0.133, z), tog, bevel=0.004)
    # bunched hood behind the neck
    m.sphere((0.11, 0.06, 0.055), (0.0, 0.085, 0.87), coat, segs=14, rings=8)
    m.lathe([(0.075, 0.84), (0.085, 0.87), (0.07, 0.9)], coat, segs=16, sy=0.95, close=False)
    # neck
    rig.mb("Neck").limb((0, 0, 0.84), (0, 0, 0.93), 0.03, 0.03, skin, segs=8)
    # head: paper grocery bag (open end down over the shoulders)
    m = rig.mb("Head")
    W, D, z0, z1 = 0.25, 0.19, 0.8, 1.15
    nx, ny, nz = 7, 5, 10

    def wob(x, y, z):
        return (0.007 * math.sin(x * 41 + z * 17) * math.cos(y * 37 + z * 29) +
                0.004 * math.sin(z * 90 + x * 13) + rnd.uniform(-0.004, 0.004))

    def panel(origin, ux, uz, nu, nv, nrm, gusset=False):
        verts, faces = [], []
        for j in range(nv + 1):
            for i in range(nu + 1):
                u, v = i / nu, j / nv
                p = Vector(origin) + Vector(ux) * u + Vector(uz) * v
                d = wob(p.x, p.y, p.z)
                if gusset:
                    d -= 0.018 * (1 - abs(u - 0.5) * 2) * (1 - v * 0.3)   # side fold pushed in
                if j == 0:
                    d += 0.01
                verts.append(p + Vector(nrm) * d)
        for j in range(nv):
            for i in range(nu):
                a = j * (nu + 1) + i
                faces.append((a, a + 1, a + nu + 2, a + nu + 1))
        return verts, faces

    H = z1 - z0
    # front (-Y) / back (+Y) / sides
    for (o, ux, nrm, nu, gus) in (((-W / 2, -D / 2, z0), (W, 0, 0), (0, -1, 0), nx, False),
                                  ((W / 2, D / 2, z0), (-W, 0, 0), (0, 1, 0), nx, False),
                                  ((W / 2, -D / 2, z0), (0, D, 0), (1, 0, 0), ny, True),
                                  ((-W / 2, D / 2, z0), (0, -D, 0), (-1, 0, 0), ny, True)):
        vs, fs_ = panel(o, ux, (0, 0, H), nu, nz, nrm, gus)
        faces = m.raw(vs, fs_, bag, smooth=True)
        for f in faces:
            f.normal_update()
            if f.normal.dot(Vector(nrm)) < 0:
                f.normal_flip()
    # top (closed bottom of the bag) with a fold seam
    m.box((W, D, 0.006), (0, 0, z1 + 0.002), bag, rot=(0, 1.5, 0))
    m.box((W * 0.98, 0.02, 0.008), (0, 0.03, z1 + 0.006), bag_d)
    # inside (dark) so the open bottom and the eye holes read as hollow
    m.box((W - 0.06, D - 0.075, H - 0.02), (0, 0, z0 + H / 2), eye)
    # torn / folded rim at the bottom
    rim = []
    for k in range(25):
        t = k / 24
        per = 2 * (W + D)
        s = t * per
        if s < W:
            p = (-W / 2 + s, -D / 2 - 0.004)
        elif s < W + D:
            p = (W / 2 + 0.004, -D / 2 + (s - W))
        elif s < 2 * W + D:
            p = (W / 2 - (s - W - D), D / 2 + 0.004)
        else:
            p = (-W / 2 - 0.004, D / 2 - (s - 2 * W - D))
        rim.append((p[0], p[1], z0 + 0.03 + (0.006 if k % 2 else -0.004)))
    m.tube(rim, 0.006, bag_d, segs=4, caps=False)
    # two uneven cut eye holes on the front face
    for (cx, cz, rx, rz, rot) in ((-0.055, 1.0, 0.026, 0.02, 12), (0.058, 0.988, 0.021, 0.027, -18)):
        pts = []
        for k in range(9):
            a = 2 * math.pi * k / 9
            f = rnd.uniform(0.75, 1.2)
            x = math.cos(a) * rx * f
            z = math.sin(a) * rz * f
            ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
            pts.append((cx + x * ca - z * sa, -D / 2 - 0.018, cz + x * sa + z * ca))
        m.raw(pts, [list(range(9))], eye)
    # a crease line across the front
    m.ribbon([(-W / 2, -D / 2 - 0.009, 0.9 + 0.01 * k % 2) for k in range(1)] +
             [(W / 2, -D / 2 - 0.009, 0.91)], 0.004, bag_d)

    for s, sx in (("L", 1), ("R", -1)):
        sh, el, ha = Vector(P["Shoulder" + s]), Vector(P["Elbow" + s]), Vector(P["Hand" + s])
        rig.mb("Shoulder" + s).limb(sh, el, 0.058, 0.052, coat, segs=10)
        m = rig.mb("Elbow" + s)
        m.sphere((0.05, 0.05, 0.05), el, coat, segs=10, rings=6)
        cuff = ha + Vector((0, 0, -0.02))
        m.lathe([(0.05, el.z), (0.055, el.z - 0.08), (0.064, cuff.z + 0.01), (0.066, cuff.z),
                 (0.05, cuff.z + 0.005), (0.0, cuff.z + 0.03)], coat,
                M=Matrix.Translation((el.x, el.y, 0)), segs=10)
        hm = rig.mb("Hand" + s)
        finger_set(hm, ha + Vector((0, 0, -0.02)), s, 0.045, skin, spread=0.0065, r=0.0055, curl=0.3,
                   palm=(0.013, 0.026, 0.032))
        hp, kn, ft = Vector(P["Hip" + s]), Vector(P["Knee" + s]), Vector(P["Foot" + s])
        rig.mb("Hip" + s).limb(hp, kn, 0.034, 0.027, skin, segs=8)
        m = rig.mb("Knee" + s)
        m.limb(kn, ft + Vector((0, 0, 0.06)), 0.026, 0.022, skin, segs=8)
        m.limb(ft + Vector((0, 0, 0.11)), ft, 0.025, 0.026, sock, segs=8)
        m = rig.mb("Foot" + s)
        m.box((0.07, 0.15, 0.05), (ft.x, -0.035, 0.032), shoe, bevel=0.02, segs=2)
        m.box((0.074, 0.155, 0.018), (ft.x, -0.035, 0.009), sole, bevel=0.006)
        m.box((0.03, 0.05, 0.004), (ft.x, -0.06, 0.057), sole, rot=(-18, 0, 0))
    rig.build()

    T = 2 * math.pi
    base = {"Neck": (6, 0, 0), "Head": (4, 0, 0), "ShoulderL": (0, 0, 6), "ShoulderR": (0, 0, -6),
            "ElbowL": (-8, 0, 0), "ElbowR": (-8, 0, 0)}

    def idle(f):
        p = f / 60.0 * T
        return add(base, {
            "Hips": {"rot": (0, 4 * math.sin(p), 0), "loc": (0.012 * math.sin(p), 0, 0)},
            "Spine": (0, -2 * math.sin(p), 0), "Chest": (2 * math.sin(2 * p), -2 * math.sin(p), 0),
            "Head": (3 * math.sin(2 * p + 1), 10 * math.sin(p + 0.6), 0),
            "ShoulderL": (4 * math.sin(p + 0.3), 0, 0), "ShoulderR": (-4 * math.sin(p + 0.3), 0, 0),
            "HipL": (0, -4 * math.sin(p), 0), "HipR": (0, -4 * math.sin(p), 0),
            "FootL": (0, 4 * math.sin(p), 0), "FootR": (0, 4 * math.sin(p), 0)})

    def walk(f):
        p = f / 27.0 * T
        out = {"Hips": {"rot": (0, 5 * math.sin(p), 6 * math.sin(p)),
                        "loc": (0.015 * math.sin(p), 0, -0.012 * math.sin(p) ** 2)},
               "Spine": (6, 0, -3 * math.sin(p)), "Chest": (2, -3 * math.sin(p), -3 * math.sin(p)),
               "Head": (4 * math.sin(2 * p), 7 * math.sin(p), 0)}
        for s, ph in (("L", 0.0), ("R", math.pi)):
            q = p + ph
            out["Hip" + s] = (-16 * math.sin(q), 0, 0)
            out["Knee" + s] = (6 + 22 * max(0.0, math.cos(q)) ** 1.5, 0, 0)
            out["Foot" + s] = (8 * math.sin(q), 0, 0)
            out["Shoulder" + s] = sym(s, (7 * math.sin(q), 0, 2))
        return add(base, out)

    up = add(base, {"Spine": (-8, 0, 0), "Chest": (-12, 0, 0), "Neck": (-30, 0, 0), "Head": (-22, 0, 0),
                    "ShoulderL": (-150, 0, 30), "ShoulderR": (-150, 0, -30), "ElbowL": (-20, 0, 0),
                    "ElbowR": (-20, 0, 0), "HandL": (0, 0, 0), "Hips": {"loc": (0, 0.02, 0.02)}})

    def scream(f):
        if f <= 5:
            return keyed([(0, idle(0)), (5, up)], f)
        if f <= 36:
            k = (f - 5) / 31.0
            fl = math.sin(k * T * 5)
            fl2 = math.sin(k * T * 5 + 1.7)
            env = math.sin(k * math.pi) ** 0.5
            return add(up, {"ShoulderL": (22 * fl * env, 0, 18 * fl2 * env),
                            "ShoulderR": (-22 * fl * env, 0, 18 * fl2 * env),
                            "ElbowL": (-25 * max(0, fl2) * env, 0, 0), "ElbowR": (-25 * max(0, -fl2) * env, 0, 0),
                            "Head": (4 * fl2 * env, 9 * math.sin(k * T * 7) * env, 0),
                            "Chest": (0, 3 * fl * env, 0),
                            "Hips": {"loc": (0.006 * fl * env, 0, 0)}})
        return keyed([(36, up), (45, idle(0))], f)

    clips = [clip(rig, "Idle", 2.0, idle), clip(rig, "Walk", 0.9, walk), clip(rig, "Scream", 1.5, scream)]
    return _finish_entity("entity_pupil", rig, clips, [("Idle", 0), ("Walk", 7), ("Scream", 14)])


# ----------------------------------------------------------------- finish --
AO_SKIP = ("Emit", "Shade", "Glass")


def _vertex_ao(distance=0.08, samples=32, strength=0.7, gamma=1.4):
    """Bake Cycles ambient occlusion into a per-vertex colour (COLOR_0).
    The game multiplies it into the diffuse colour, so creases between
    fingers, ribs, folds and lips get contact shading under the flat baked
    level light. Emissive / translucent materials are left at white."""
    scn = bpy.context.scene
    meshes = [o for o in scn.objects if o.type == "MESH"]
    if not meshes:
        return
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = samples
    scn.world.light_settings.distance = distance
    for o in meshes:
        me = o.data
        a = me.color_attributes.get("AO") or me.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
        me.color_attributes.active_color = a
        try:
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
        except Exception:
            pass
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    for o in meshes:
        me = o.data
        a = me.color_attributes["AO"]
        skip = set()
        for poly in me.polygons:
            m = me.materials[poly.material_index] if me.materials else None
            if m is not None and m.name.startswith(AO_SKIP):
                skip.update(poly.vertices)
        for i, d in enumerate(a.data):
            v = 1.0 if i in skip else (1 - strength) + strength * max(0.0, min(1.0, d.color[0])) ** gamma
            d.color = (v, v, v, 1.0)


def _export_entity(name):
    path = L.os.path.join(L.MODELS, name + ".glb")
    bpy.context.scene.frame_set(0)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_apply=True, export_animations=False,
        export_cameras=False, export_lights=False, export_yup=True, export_texcoords=False,
        export_normals=True, export_materials="EXPORT", export_extras=False, use_selection=False,
        export_colors=True, export_frame_range=False, export_def_bones=False)
    if L.ANIMS:
        L.add_animations(path, L.ANIMS)
    return path


def _pack_colors(path):
    """Re-encode float COLOR_0 as normalized unsigned bytes (4 B per vertex
    instead of 16) and repack the binary chunk."""
    import struct
    js, rest = L._read_glb(path)
    bin_len = struct.unpack("<I", rest[0:4])[0]
    binb = rest[8:8 + bin_len]
    tail = rest[8 + bin_len:]
    repl = {}
    for m in js["meshes"]:
        for prim in m["primitives"]:
            a = prim["attributes"].get("COLOR_0")
            if a is None:
                continue
            acc = js["accessors"][a]
            if acc["componentType"] != 5126:
                continue
            bv = js["bufferViews"][acc["bufferView"]]
            off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
            n = acc["count"] * 4
            vals = struct.unpack("<%df" % n, binb[off:off + n * 4])
            repl[acc["bufferView"]] = bytes(max(0, min(255, int(round(v * 255)))) for v in vals)
            acc["componentType"] = 5121
            acc["normalized"] = True
            acc.pop("byteOffset", None)
    if not repl:
        return
    out = bytearray()
    for i, bv in enumerate(js["bufferViews"]):
        while len(out) % 4:
            out.append(0)
        data = repl.get(i)
        if data is None:
            o = bv.get("byteOffset", 0)
            data = binb[o:o + bv["byteLength"]]
        bv["byteOffset"] = len(out)
        bv["byteLength"] = len(data)
        bv.pop("byteStride", None) if i in repl else None
        out += data
    while len(out) % 4:
        out.append(0)
    js["buffers"][0]["byteLength"] = len(out)
    L._write_glb(path, js, struct.pack("<II", len(out), 0x004E4942) + bytes(out) + tail)


def _finish_entity(name, rig, clips, shots, view=(0.9, -1.7, 0.35), humanoid=True, budget=25000, ao=True,
                   ao_dist=0.08, ao_strength=0.7):
    bpy.context.view_layer.update()
    tris, meshes = L.tri_count(), L.mesh_count()
    if ao and not L.os.environ.get("HR_NOAO"):
        _vertex_ao(distance=ao_dist, strength=ao_strength)
    path = _export_entity(name)
    _pack_colors(path)
    kb = L.os.path.getsize(path) / 1024.0
    info = dict(tris=tris, meshes=meshes, kb=round(kb, 1))
    if tris > budget:
        info["WARN"] = f"TRIS>{budget}"
    nodes, anims = L.glb_info(name)
    missing = [j for j in (JOINTS if humanoid else ["Hips", "Head"]) if j not in nodes]
    if missing:
        info["WARN"] = "missing joints " + ",".join(missing)
    info["clips"] = " ".join(f"{n}:{d}s" for n, d in sorted(anims.items()))
    print(f"   -> {path}  {info}")
    if L.DO_PREVIEW:
        # previews are rendered from the re-imported GLB (the real deliverable)
        L.preview_glb(name, [(None, 0)] + shots, view=view, size=300)
    return info


ASSETS = {
}

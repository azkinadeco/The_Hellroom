"""Batch 18 residents, built from the user's concept art (Image Aset/):

  entity_weaver  Penenun Tulang   flayed woman on a mound of bones, a spine of eyes and hands coiled round her
  entity_echo    Gema Retak       split screaming faces on a flayed core, eight sinew arms ending in hands
  entity_squid   Perempuan Gurita gaunt grey-violet woman whose lower body is spine, organs and octopus arms

Conventions as entities3.py: joint empties + <Joint>_geo meshes, the creature faces Blender -Y (three.js +Z),
geometry is written in world space, clips are baked per frame from pose functions (rotation deltas in degrees).
Faces are sculpted procedurally: a sphere grid, dense at the front, displaced by a radius function
(head_fn) so eye sockets, brow, nose, cheekbones and a screaming mouth pit come out of one smooth surface.
"""
import math
import random
from mathutils import Vector as V, Matrix
import hr_lib as L
from hr_lib import mat
from entities import Rig, add, keyed, sym, mlimb, muscle, bulk, basis, ortho, chain, hand, cloth_folds, _finish_entity
from entities3 import blob

T = 2 * math.pi
UP = V((0, 0, 1))
FWD = V((0, -1, 0))


# ================================================================ helpers ===
def aa(axis, deg):
    """Euler (deg) for a rotation of `deg` about `axis` (exact, not summed)."""
    e = Matrix.Rotation(math.radians(deg), 3, V(axis).normalized()).to_euler("XYZ")
    return (math.degrees(e.x), math.degrees(e.y), math.degrees(e.z))


def clip5(rig, name, seconds, fn, locs=("Hips",)):
    n = int(round(seconds * L.FPS))
    L.bake_clip(name, rig.objs(), list(range(n + 1)), fn, loc_objs=locs)
    return (name, seconds)


def sm(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def spline(ctrl, n):
    P = [V(p) for p in ctrl]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    segs = len(ctrl) - 1
    out = []
    for k in range(n):
        u = k / (n - 1) * segs
        i = min(int(u), segs - 1)
        t = u - i
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                          (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    return out


def resample(ctrl, n):
    """n points at equal arc length along a Catmull-Rom curve through ctrl; returns (pts, length)."""
    dense = spline(ctrl, max(80, len(ctrl) * 40))
    cum = [0.0]
    for a, b in zip(dense, dense[1:]):
        cum.append(cum[-1] + (b - a).length)
    tot = cum[-1]
    out, j = [], 0
    for k in range(n):
        s = tot * k / (n - 1)
        while j < len(cum) - 2 and cum[j + 1] < s:
            j += 1
        t = (s - cum[j]) / max(cum[j + 1] - cum[j], 1e-9)
        out.append(dense[j].lerp(dense[j + 1], min(1.0, t)))
    return out, tot


def tangent(pts, i):
    return (pts[min(len(pts) - 1, i + 1)] - pts[max(0, i - 1)]).normalized()


def strand(mb, pts, w_fn, nrm, material):
    """Tapered flat ribbon (hair clump, rag strip). nrm: vector or per-point list."""
    verts, faces = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        d = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        nv = V(nrm[i]) if isinstance(nrm, list) else V(nrm)
        side = d.cross(nv)
        if side.length < 1e-6:
            side = d.orthogonal()
        side = side.normalized() * max(0.0015, w_fn(i / (n - 1))) * 0.5
        verts += [tuple(p + side), tuple(p - side)]
    for i in range(n - 1):
        a = 2 * i
        faces.append((a, a + 1, a + 3, a + 2))
    return mb.raw(verts, faces, material, smooth=True)


def tooth(mb, base, tip, r, material):
    base, tip = V(base), V(tip)
    mb.tube([base, base.lerp(tip, 0.5), tip], lambda q: r * (1 - 0.8 * q), material, segs=4)


def bone(mb, a, b, r, material, knob=None, segs=5):
    """Long bone: slim shaft with knobbly ends."""
    a, b = V(a), V(b)
    d = b - a
    up = UP if abs(d.normalized().z) < 0.9 else V((1, 0, 0))
    sv, nv, dv = ortho(d, up)
    mid = (a + b) / 2 + nv * d.length * 0.03
    mb.tube([a, mid, b], lambda q: r * (1 - 0.3 * math.sin(math.pi * q)), material, segs=segs)
    for e, s in ((a, -1), (b, 1)):
        mb.sphere((r * 1.75, r * 1.3, r * 1.4), (0, 0, 0), knob or material, segs=segs, rings=4,
                  M=basis(e + dv * s * r * 0.4, sv, nv, dv))


def eye5(mb, c, look, r, em, up=(0, 0, 1), lid=None, lid_open=0.55, segs=10, glint=None, iris_r=0.55,
         lid_r=0.2, lid_segs=4):
    """Light wet eyeball. em = dict(sclera, iris, pupil)."""
    c = V(c)
    x, y, z = ortho(look, up)
    M = basis(c, x, y, z)
    mb.sphere((r, r, r), (0, 0, 0), em["sclera"], segs=segs, rings=max(5, segs * 2 // 3), M=M)
    ir = r * iris_r
    zc = math.sqrt(max(r * r - ir * ir, 0.0))
    mb.sphere((ir, ir, r * 0.17), (0, 0, zc), em["iris"], segs=max(7, segs - 2), rings=3, M=M)
    mb.sphere((ir * 0.42, ir * 0.42, r * 0.1), (0, 0, r * 0.985), em["pupil"], segs=6, rings=2, M=M)
    if glint is not None:
        g = V((-0.3, 0.33, 0.89)).normalized() * r * 1.04
        mb.sphere((r * 0.12, r * 0.12, r * 0.05), tuple(g), glint, segs=5, rings=3, M=M)
    if lid is not None:
        a0 = math.acos(max(-1.0, min(1.0, lid_open)))
        pts = []
        nl = 13 if lid_segs > 3 else 9
        for k in range(nl):
            ph = T * k / (nl - 1)
            v = V((math.cos(ph) * math.sin(a0) * 1.18, math.sin(ph) * math.sin(a0) * 0.85, math.cos(a0)))
            pts.append(M @ (v * r * 1.03))
        mb.tube(pts, lambda q: r * lid_r * (1.3 if 0.1 < q < 0.4 else 1.0), lid, segs=lid_segs, caps=False)


def lite_hand(mb, wrist, d, n, length, skin, nail=None, curl=0.4, splay=0.18, r=0.0055, nf=4, segs=4, seed=0,
              claw=0.0, thumb=True):
    """Cheap anatomical hand: palm, jointed fingers, thumb, optional hooked nails."""
    rnd = random.Random(seed)
    sv, nv, dv = ortho(d, n)
    w = V(wrist)
    pl = length * 0.8
    pw = r * 1.15 * nf
    Mp = basis(w + dv * pl * 0.5, sv, nv, dv)
    mb.sphere((pw, r * 1.45, pl * 0.58), (0, 0, 0), skin, segs=8, rings=5, M=Mp)
    rel = [0.9, 1.0, 0.94, 0.76]
    tips = []
    for i in range(nf):
        u = 1 - 2 * i / max(1, nf - 1)
        fl = length * rel[i % 4] * rnd.uniform(0.94, 1.05)
        dvv = (dv + sv * u * splay).normalized()
        base = w + dv * pl * 0.95 + sv * u * pw * 0.72
        cl = curl * rnd.uniform(0.75, 1.25)
        pts, rad, de, ne = chain(base, dvv, nv, [fl * 0.45, fl * 0.31, fl * 0.24], [cl * 0.5, cl, cl * 0.8],
                                 lambda q, j: r * (1 - 0.3 * q) * (1.18 if j else 1.0))
        mb.tube(pts, lambda q, rad=rad: rad[min(len(rad) - 1, int(round(q * (len(rad) - 1))))], skin, segs=segs)
        tips.append((pts[-1], de, ne, rad[-1]))
    if thumb:
        base = w + dv * pl * 0.25 + sv * pw * 0.95 + nv * r
        tdv = (dv * 0.55 + sv * 0.7 + nv * 0.35).normalized()
        tl = length * 0.6
        pts, rad, de, ne = chain(base, tdv, nv, [tl * 0.45, tl * 0.32, tl * 0.23], [0.0, curl * 0.6, curl * 0.6],
                                 lambda q, j: r * 1.12 * (1 - 0.3 * q) * (1.15 if j else 1.0))
        mb.tube(pts, lambda q, rad=rad: rad[min(len(rad) - 1, int(round(q * (len(rad) - 1))))], skin, segs=segs)
        tips.append((pts[-1], de, ne, rad[-1]))
    if nail is not None:
        for (p, de, ne, rr) in tips:
            cl = max(claw, rr * 1.4)
            c0 = p - de * rr * 0.6 - ne * rr * 0.4
            c1 = p + de * cl * 0.6 + ne * cl * 0.15
            c2 = p + de * cl * 0.9 + ne * cl * 0.6
            mb.tube([c0, c1, c2], lambda q, rr=rr: rr * 0.85 * (1 - 0.85 * q), nail, segs=3)


def bone_hand(mb, wrist, d, n, length, material, r=0.0055, curl=0.4, splay=0.22, seed=0):
    """Skeletal hand: carpal knot, metacarpals and knobbly phalanges."""
    rnd = random.Random(seed)
    sv, nv, dv = ortho(d, n)
    w = V(wrist)
    mb.sphere((r * 2.7, r * 1.3, r * 1.9), (0, 0, 0), material, segs=6, rings=4, M=basis(w + dv * r * 1.3, sv, nv, dv))
    pl = length * 0.42
    rel = [0.9, 1.0, 0.95, 0.78]
    for i in range(4):
        u = 1 - 2 * i / 3
        b0 = w + dv * r * 2.6 + sv * u * r * 1.5
        k = w + dv * pl + sv * u * r * 2.7
        mb.tube([b0, (b0 + k) / 2 - nv * r * 0.3, k], lambda q: r * (0.62 + 0.4 * abs(2 * q - 1) ** 3), material,
                segs=4)
        fl = length * 0.6 * rel[i] * rnd.uniform(0.92, 1.06)
        cl = curl * rnd.uniform(0.6, 1.3)
        pts, rad, de, ne = chain(k, (dv + sv * u * splay).normalized(), nv, [fl * 0.45, fl * 0.31, fl * 0.24],
                                 [cl * 0.4, cl, cl * 0.8], lambda q, j: r * (0.86 - 0.35 * q) * (1.3 if j else 0.85))
        mb.tube(pts, lambda q, rad=rad: rad[min(len(rad) - 1, int(round(q * (len(rad) - 1))))], material, segs=4)
    base = w + dv * r * 2.0 + sv * r * 2.6
    tl = length * 0.55
    pts, rad, de, ne = chain(base, (dv * 0.5 + sv * 0.85).normalized(), nv, [tl * 0.4, tl * 0.33, tl * 0.27],
                             [0.0, curl * 0.5, curl * 0.6], lambda q, j: r * (0.95 - 0.35 * q) * (1.3 if j else 0.85))
    mb.tube(pts, lambda q, rad=rad: rad[min(len(rad) - 1, int(round(q * (len(rad) - 1))))], material, segs=4)


# ------------------------------------------------------- sculpted heads ---
def sdir(az, el):
    ce = math.cos(el)
    return V((ce * math.sin(az), -ce * math.cos(az), math.sin(el)))


def angles(d):
    return math.atan2(d.x, -d.y), math.asin(max(-1.0, min(1.0, d.z)))


def gauss(az, el, a0, e0, wa, we):
    return math.exp(-((az - a0) / wa) ** 2 - ((el - e0) / we) ** 2)


def head_fn(rx=0.074, ry=0.094, rz=0.102, open_=1.0, mdepth=0.58, mw=0.46, third=False, gaunt=0.0, sock=0.15,
            eye_az=0.42, eye_el=0.12, extra=(), nose=1.0):
    """Radius function of a human head (local frame, face toward -Y). Returns (fn, prm) where
    fn(unit dir) -> surface point and prm = (mouth elevation, mouth half-width, mouth half-height)."""
    em = -0.46 - 0.22 * open_
    we = 0.09 + 0.31 * open_

    def k_of(az, el):
        k = 1.0
        for s in (-1, 1):
            k -= sock * gauss(az, el, s * eye_az, eye_el, 0.17, 0.12)
            k += 0.045 * gauss(az, el, s * 0.4, eye_el + 0.19, 0.3, 0.07)          # brow
            k += 0.06 * gauss(az, el, s * 0.8, -0.08, 0.2, 0.12)                   # cheekbone
            k -= gaunt * gauss(az, el, s * 0.66, -0.4, 0.22, 0.16)                 # hollow cheek
            k -= 0.03 * gauss(az, el, s * 1.15, 0.25, 0.2, 0.2)                    # temple
        k += nose * (0.12 * gauss(az, el, 0, -0.1, 0.13, 0.15) + 0.05 * gauss(az, el, 0, -0.22, 0.12, 0.06))
        k += 0.07 * gauss(az, el, 0, em - we * 1.3, 0.3, 0.12)                     # chin
        for s in (-1, 1):
            k += 0.05 * gauss(az, el, s * 1.25, -0.7, 0.25, 0.2)                    # jaw angle
            k += 0.03 * gauss(az, el, s * mw * 1.1, em, 0.12, we * 0.8)            # mouth corners
        if third:
            k -= 0.13 * gauss(az, el, 0, 0.5, 0.11, 0.09)
        for (a0, e0, wa, we_, amt) in extra:
            k += amt * gauss(az, el, a0, e0, wa, we_)
        return k

    def fn(d):
        az, el = angles(d)
        fy = max(0.0, -d.y)
        x = d.x * rx * (1 + 0.06 * max(d.z, 0.0))
        y = d.y * ry * (1 - 0.1 * fy * fy)
        z = d.z * rz
        if d.z < 0:
            z *= 1 + (0.2 + 0.55 * open_) * fy * fy                               # dropped jaw
            x *= 1 - 0.28 * (-d.z) * fy                                           # narrow chin
            y *= 1 - 0.12 * (-d.z) * (1 - fy)
        p = V((x, y, z)) * k_of(az, el)
        g = gauss(az, el, 0, em, mw, we)
        p.y += mdepth * ry * 1.1 * g                                             # mouth carved straight back
        p.z += 0.15 * mdepth * rz * g * (el - em) / max(we, 1e-3)
        return p
    return fn, (em, mw, we)


def surf_mesh(mb, fn, material, M, segs=30, rings=22, keep=None, mats=None, invert=False, scale=1.0):
    """Sphere-topology surface p = fn(dir); grid is denser at the face (-Y) and the equator.
    keep(dir) drops faces (open shells), mats(dir) -> material override per face."""
    lons = []
    for j in range(segs):
        s = -1 + 2 * j / segs
        lons.append(math.pi * (0.45 * s + 0.55 * s * abs(s)))
    lats = []
    for i in range(1, rings):
        t = -1 + 2 * i / rings
        lats.append(-math.pi / 2 * (0.5 * t + 0.5 * t * abs(t)))
    dirs = [UP.copy()]
    for el in lats:
        for az in lons:
            dirs.append(sdir(az, el))
    dirs.append(-UP)
    bot = len(dirs) - 1

    def idx(i, j):
        return 1 + i * segs + (j % segs)
    faces = [(0, idx(0, j + 1), idx(0, j)) for j in range(segs)]
    for i in range(len(lats) - 1):
        for j in range(segs):
            faces.append((idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)))
    last = len(lats) - 1
    faces += [(idx(last, j), idx(last, j + 1), bot) for j in range(segs)]
    sel, cd = [], []
    for f in faces:
        c = sum((dirs[k] for k in f), V()).normalized()
        if keep is None or keep(c):
            sel.append(f)
            cd.append(c)
    used = sorted({k for f in sel for k in f})
    remap = {k: n for n, k in enumerate(used)}
    R3 = M.to_3x3()
    verts = [tuple(M @ (fn(dirs[k]) * scale)) for k in used]
    new = mb.raw(verts, [tuple(remap[k] for k in f) for f in sel], material, smooth=True)
    for f, c in zip(new, cd):
        f.normal_update()
        want = (R3 @ c) * (-1 if invert else 1)
        if f.normal.dot(want) < 0:
            f.normal_flip()
        if mats is not None:
            m = mats(c)
            if m is not None:
                if m not in mb.mats:
                    mb.mats.append(m)
                f.material_index = mb.mats.index(m)
    return new


def patch_mesh(mb, fn, material, M, a0, a1, lo_fn, hi_fn, cols=8, rows=6, scale=1.006):
    """Smooth-edged surface patch over the head between az a0..a1 and el lo_fn(az)..hi_fn(az)."""
    verts, faces = [], []
    for j in range(cols):
        az = a0 + (a1 - a0) * j / (cols - 1)
        lo, hi = lo_fn(az), hi_fn(az)
        for i in range(rows):
            verts.append(tuple(M @ (fn(sdir(az, lo + (hi - lo) * i / (rows - 1))) * scale)))
    for j in range(cols - 1):
        for i in range(rows - 1):
            faces.append((j * rows + i, (j + 1) * rows + i, (j + 1) * rows + i + 1, j * rows + i + 1))
    new = mb.raw(verts, faces, material, smooth=True)
    c = M.translation
    for f in new:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - c) < 0:
            f.normal_flip()
    return new


def cap_mesh(mb, fn, material, M, lo_fn, segs=26, rows=7, scale=1.035, top=1.5):
    """Hair cap: rows of points from the hairline el=lo_fn(az) up to the crown (smooth edge)."""
    verts, faces = [], []
    for j in range(segs):
        s = -1 + 2 * j / segs
        az = math.pi * (0.45 * s + 0.55 * s * abs(s))
        lo = lo_fn(az)
        for i in range(rows):
            el = lo + (top - lo) * (i / (rows - 1)) ** 0.8
            verts.append(tuple(M @ (fn(sdir(az, el)) * scale)))
    verts.append(tuple(M @ (fn(UP) * scale)))
    pole = len(verts) - 1
    for j in range(segs):
        jj = (j + 1) % segs
        for i in range(rows - 1):
            faces.append((j * rows + i, jj * rows + i, jj * rows + i + 1, j * rows + i + 1))
        faces.append((j * rows + rows - 1, jj * rows + rows - 1, pole))
    new = mb.raw(verts, faces, material, smooth=True)
    c = M.translation
    for f in new:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - c) < 0:
            f.normal_flip()
    return new


def S(fn, M, az, el, lift=0.0):
    d = sdir(az, el)
    return M @ (fn(d) + d * lift)


def surf_fiber(mb, fn, M, ae, r, material, lift=0.002, segs=4, n=7):
    dense = spline([V((a, e, 0)) for a, e in ae], n) if len(ae) > 2 else [V(ae[0] + (0,)).lerp(V(ae[1] + (0,)), k / (n - 1)) for k in range(n)]
    pts = [S(fn, M, q.x, q.y, lift) for q in dense]
    mb.tube(pts, lambda q: r * (0.5 + 0.5 * math.sin(math.pi * min(1.0, 0.15 + 0.85 * q))), material, segs=segs)


def mouth_parts(mb, fn, M, prm, mt, scale=1.0, n_up=8, n_lo=7, lip_r=0.0045, teeth=True, tooth_r=0.0045, half=0,
                lip=None):
    """Lip ring and teeth round the mouth pit. half=+1/-1 keeps only that side (split faces)."""
    em, mw, we = prm
    if half == 0:
        ws = [T * k / 22 for k in range(23)]
    else:
        ws = [(-math.pi / 2 + math.pi * k / 11) + (0 if half > 0 else math.pi) for k in range(12)]
    ring = [S(fn, M, 0.86 * mw * math.cos(w), em + 0.86 * we * math.sin(w), 0.0015) for w in ws]
    mb.tube(ring, lip_r * scale, lip or mt["lip"], segs=5, caps=half != 0)
    if not teeth:
        return
    R3 = M.to_3x3()
    down = R3 @ V((0, 0, -1))
    pc = M @ (fn(sdir(0, em)) * 0.92)
    rnd = random.Random(int(scale * 1000))
    for i in range(n_up):
        w = math.pi * (0.2 + 0.6 * i / (n_up - 1))
        if half and math.cos(w) * half < 0.05:
            continue
        b = S(fn, M, 0.76 * mw * math.cos(w), em + 0.74 * we * math.sin(w), -0.001)
        ln = (0.006 + 0.004 * math.sin(w) ** 4 + rnd.uniform(-0.001, 0.002)) * scale
        tooth(mb, b, b + (pc - b) * 0.12 + down * ln, tooth_r * scale, mt["teeth"])
    for i in range(n_lo):
        w = math.pi * (1.22 + 0.56 * i / (n_lo - 1))
        if half and math.cos(w) * half < 0.05:
            continue
        b = S(fn, M, 0.76 * mw * math.cos(w), em + 0.74 * we * math.sin(w), -0.001)
        ln = (0.005 + rnd.uniform(-0.001, 0.002)) * scale
        tooth(mb, b, b + (pc - b) * 0.12 - down * ln, tooth_r * 0.9 * scale, mt["teeth"])


def hairline(az, front=0.62, back=-0.6):
    a = abs(az)
    if a < 0.55:
        return front
    if a < 1.5:
        return front * (1 - (a - 0.55) / 0.95)
    if a < 2.3:
        return -(a - 1.5) / 0.8 * 0.55
    return back


def grow_hair(mb, roots, M, fn, material, n_pts, step, grav, init, seed=0, attract=None, attract_k=0.0,
              width=(0.032, 0.006), coll=(), noise=0.12, tube_r=0.0, lift=1.03, centre=None):
    """Hair clumps grown from scalp points (az, el): integrate a direction under gravity/attraction,
    pushed out of the skull and of `coll` spheres. Flat tapered ribbons (double-sided material) or tubes."""
    rnd = random.Random(seed)
    Mi = M.inverted()
    R3 = M.to_3x3()
    hc = M.translation.copy() if centre is None else V(centre)
    for (az, el) in roots:
        d = sdir(az, el)
        p = M @ (fn(d) * lift)
        out = (R3 @ d).normalized()
        v = ((R3 @ V(init)).normalized() * 0.65 + out * 0.35).normalized()
        pts = [p.copy()]
        n = max(3, int(n_pts * rnd.uniform(0.7, 1.15)))
        jit = V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * noise
        for k in range(n):
            g = V(grav)
            if attract is not None:
                g = g + (V(attract) - p).normalized() * attract_k
            v = (v + g + jit * 0.3).normalized()
            p = p + v * step
            lp = Mi @ p
            if lp.length > 1e-6:
                surf = fn(lp.normalized()).length * (lift + 0.012)
                if lp.length < surf:
                    p = M @ (lp.normalized() * surf)
            for c, r in coll:
                w = p - V(c)
                if w.length < r:
                    p = V(c) + w.normalized() * r
            pts.append(p.copy())
        if tube_r > 0:
            mb.tube(pts, lambda q: tube_r * (1 - 0.75 * q), material, segs=4)
        else:
            nrm = []
            for p in pts:
                q = p - V((hc.x, hc.y, min(p.z, hc.z)))
                nrm.append(q if q.length > 1e-5 else out)
            w0, w1 = width[0] * rnd.uniform(0.75, 1.2), width[1]
            strand(mb, pts, lambda q, w0=w0, w1=w1: w0 + (w1 - w0) * q ** 0.8, nrm, material)


def scalp_roots(n, seed, az_rng=(-math.pi, math.pi), el_top=1.45, front=0.62, back=-0.6):
    rnd = random.Random(seed)
    out = []
    while len(out) < n:
        az = rnd.uniform(*az_rng)
        el = rnd.uniform(-0.6, el_top)
        if el > hairline(az, front, back) + 0.03:
            out.append((az, el))
    return out


# ------------------------------------------------------- body building ---
def bone_coil(rig, ctrl, jspec, mt, em, r_fn, step_k=1.8, seed=0, hands=(), hand_len=0.085, eye_from=0.05,
              axis=(0.0, 0.0), hand_mat=None, eye_every=2):
    """The serpent spine: vertebrae along a curve, each with an eye on its outer flank, red discs between,
    knobbly processes, and small grasping hands. jspec: [(joint, u_start, parent)].
    Returns {hand joint: (root, dir)}."""
    rnd = random.Random(seed)
    dense, tot = resample(ctrl, 500)
    for name, u0, parent in jspec:
        rig.joint(name, tuple(dense[int(u0 * 499)]), parent)
    verts = []
    u = 0.0
    while u <= 1.0:
        verts.append(u)
        u += r_fn(u) * step_k / tot
    hand_at = {}
    for hk, hu in enumerate(hands):
        best = min(range(len(verts)), key=lambda i: abs(verts[i] - hu[0]))
        hand_at[best] = (hk, hu)
    out = {}
    for vi, u in enumerate(verts):
        i = int(u * 499)
        p = dense[i]
        t = (dense[min(499, i + 2)] - dense[max(0, i - 2)]).normalized()
        R = r_fn(u) * rnd.uniform(0.93, 1.07)
        s = R * step_k
        jn = [n for n, u0, _ in jspec if u0 <= u + 1e-6][-1]
        mb = rig.mb(jn)
        o = V((p.x - axis[0], p.y - axis[1], 0.0))
        o = o - t * o.dot(t)
        if o.length < 1e-4:
            o = t.orthogonal()
        o.normalize()
        uv = t.cross(o).normalized()
        if uv.z < 0 or (abs(uv.z) < 0.2 and uv.dot(FWD) < 0):
            uv = -uv
        B = basis(p, o, uv, t)
        mb.lathe([(0, -0.47 * s), (0.78 * R, -0.45 * s), (0.98 * R, -0.33 * s), (1.03 * R, 0), (0.98 * R, 0.33 * s),
                  (0.78 * R, 0.45 * s), (0, 0.47 * s)], mt["bone"], M=B, segs=8, sy=1.1)
        mb.lathe([(0.74 * R, 0.42 * s), (0.83 * R, 0.5 * s), (0.74 * R, 0.58 * s)], mt["disc"], M=B, segs=6,
                 close=False)
        sp = rnd.uniform(0.9, 1.25)
        mb.tube([p + uv * 0.8 * R, p + uv * 1.4 * R * sp - t * 0.18 * R, p + uv * 1.85 * R * sp - t * 0.45 * R],
                lambda q: R * 0.34 * (1 - 0.55 * q), mt["bone"], segs=4)
        wv = (uv * 0.55 + o * 0.85).normalized()
        mb.tube([p + wv * 0.8 * R - t * 0.15 * R, p + wv * 1.35 * R + t * 0.1 * R, p + wv * 1.55 * R + uv * 0.2 * R],
                lambda q: R * 0.24 * (1 - 0.45 * q), mt["bone"], segs=4)                  # transverse wing
        if u >= eye_from and R > 0.026 and (vi % 3 != 2 if eye_every == 2 else vi % 3 == 0) and vi not in hand_at:
            er = 0.42 * R
            oe = (o - uv * 0.25).normalized()
            look = (oe + FWD * 0.3 + uv * 0.1 * rnd.uniform(-1, 1)).normalized()
            c = p + oe * (0.93 * R - er * 0.4) + t * rnd.uniform(-0.1, 0.1) * R
            eye5(mb, c, look, er, em, up=uv, lid=mt["lidc"], lid_open=rnd.uniform(0.3, 0.6), segs=7, lid_r=0.24,
                 lid_segs=3, iris_r=0.64)
        if vi in hand_at:
            hk, (hu, twist) = hand_at[vi]
            dirv = (o * 0.85 + uv * 0.55 + t * twist).normalized()
            root = p + dirv * R * 0.85
            hn = f"SHand{hk}"
            rig.joint(hn, tuple(root), jn)
            hm = rig.mb(hn)
            wr = root + dirv * 0.11
            sv = dirv.cross(t).normalized()
            for k in (-1, 1):
                hm.tube([root + sv * k * 0.008, (root + wr) / 2 + sv * k * 0.01, wr + sv * k * 0.006],
                        lambda q: 0.0085 * (1 - 0.2 * q), hand_mat or mt["bone"], segs=4)
            lite_hand(hm, wr, (dirv + t * 0.3 * twist).normalized(), -uv, hand_len, hand_mat or mt["bone"],
                      curl=rnd.uniform(0.35, 0.7), splay=0.3, r=0.0058, seed=seed + hk)
            out[hn] = (root, dirv)
    return out


def bone_mound(mb, mt, em, R=0.42, H=0.3, seed=0, nb=20, ns=12, ne=5, col_r=0.12, col_top=0.66, nk=4):
    """Mound of tangled bones, red sinew and eyes the body sits in (origin floor centre)."""
    rnd = random.Random(seed)
    base = blob(mb, (0, 0, 0.0), (R * 0.9, R * 0.84, H), mt["boned"], seed=seed, amp=0.22, segs=16,
                rings=8, freq=4.0)
    for v in {v for f in base for v in f.verts}:
        if v.co.z < 0.004:
            v.co.z = 0.004

    def hz(x, y):
        q = (x / R) ** 2 + (y / (R * 0.92)) ** 2
        return H * math.sqrt(max(0.0, 1 - q)) if q < 1 else 0.02

    for k in range(nb):                                                  # tangled long bones
        a = rnd.uniform(0, T)
        rr = R * math.sqrt(rnd.uniform(0.05, 0.85))
        c = V((rr * math.cos(a), rr * math.sin(a) * 0.92, 0))
        c.z = hz(c.x, c.y) - 0.01
        ln = rnd.uniform(0.17, 0.34)
        b = rnd.uniform(0, T)
        dv = V((math.cos(b), math.sin(b), rnd.uniform(-0.45, 0.45) if k % 4 else rnd.uniform(0.8, 1.6))).normalized()
        a0, a1 = c - dv * ln / 2, c + dv * ln / 2
        if k % 4:
            a0.z = max(a0.z, min(hz(a0.x, a0.y), c.z + 0.05) - 0.02, 0.025)
            a1.z = max(a1.z, min(hz(a1.x, a1.y), c.z + 0.05) - 0.02, 0.025)
        else:
            a0.z, a1.z = max(0.03, a0.z - 0.04), a1.z - 0.04
        bone(mb, a0, a1, rnd.uniform(0.012, 0.02), mt["bone"], knob=mt["boned"] if k % 3 == 0 else None, segs=4)
    for k in range(nk):                                                  # skull knobs / femoral heads
        a = rnd.uniform(0, T)
        rr = R * rnd.uniform(0.3, 0.75)
        x, y = rr * math.cos(a), rr * math.sin(a) * 0.9
        rad = rnd.uniform(0.03, 0.045)
        mb.sphere((rad, rad * 0.95, rad * 0.85), (x, y, hz(x, y) - rad * 0.3), mt["bone"], segs=8, rings=6)
    for k in range(ns):                                                  # sinew draped to the floor
        a0 = T * k / ns + rnd.uniform(-0.2, 0.2)
        tw = rnd.uniform(0.5, 1.3) * (1 if k % 2 else -1)
        r_end = R * rnd.uniform(0.95, 1.3)
        pts = []
        for i in range(9):
            s = i / 8
            a = a0 + tw * s
            rr = col_r + (r_end - col_r) * s ** 1.3
            x, y = rr * math.cos(a), rr * math.sin(a)
            z = col_top + (0.015 - col_top) * s ** 0.8
            z = max(z, hz(x, y) + 0.012 + 0.015 * math.sin(s * 9 + k)) if s < 0.95 else 0.012
            pts.append(V((x, y, z)))
        rr0 = rnd.uniform(0.012, 0.02)
        mb.tube(pts, lambda q, rr0=rr0: rr0 * (1 - 0.6 * q) + 0.004, mt["muscle"] if k % 3 else mt["fiber"], segs=5)
    for k in range(ne):                                                  # eyes in the heap
        a = rnd.uniform(-2.8, -0.3)
        rr = R * rnd.uniform(0.4, 0.8)
        x, y = rr * math.cos(a), rr * math.sin(a)
        c = V((x, y, hz(x, y) - 0.004))
        n = V((x / R, y / R, 0.7)).normalized()
        eye5(mb, c, (n + FWD * 0.6).normalized(), rnd.uniform(0.016, 0.022), em, lid=mt["lidc"], lid_open=0.4,
             segs=8, lid_segs=3)


def sinew_column(mb, mt, z0, z1, r, n=7, seed=0, twist=2.4, tr=0.03):
    """Twisted bundle of sinew cords (the stalk between mound and torso)."""
    rnd = random.Random(seed)
    mb.cyl(r * 0.85, z1 - z0, (0, 0, (z0 + z1) / 2), mt["dark"], segs=10)
    for k in range(n):
        a0 = T * k / n
        pts = []
        for i in range(9):
            s = i / 8
            a = a0 + twist * s
            rr = r * (1 + 0.15 * math.sin(s * math.pi * 2 + k) + 0.9 * (1 - s) ** 3)
            pts.append(V((rr * math.cos(a), rr * math.sin(a), z0 + (z1 - z0) * s)))
        mb.tube(pts, tr * rnd.uniform(0.8, 1.15), mt["muscle"] if k % 2 else mt["fiber"], segs=5)


def flayed_torso(mbC, mbS, mt, z0, zr, zs, seed=0, stumps=True, guts=True, w=1.0, lite=False, nribs=7):
    """Skinless female torso: striated pectoral fans, exposed ribcage, sternum, clavicles, deltoid stumps;
    the abdomen below is an open cavity of coiled gut and fat bound by sinew."""
    rnd = random.Random(seed)
    # ---- chest
    prof = [(0, 0.118), (0.3, 0.14), (0.6, 0.15), (0.85, 0.14), (1.0, 0.09)]
    prof = [(t, r * w) for t, r in prof]
    c0, c1 = V((0, 0.0, zr - 0.04)), V((0, 0.0, zs + 0.02))
    mlimb(mbC, c0, c1, prof, mt["cavity"], segs=18, sx=1.22, sy=0.78, up=FWD)
    Lc = (c1 - c0).length

    def ring(z):
        t = max(0.0, min(1.0, (z - c0.z) / Lc))
        for (ta, ra), (tb, rb) in zip(prof, prof[1:]):
            if ta <= t <= tb:
                r = ra + (rb - ra) * (t - ta) / (tb - ta)
                return r * 1.22, r * 0.78
        return prof[-1][1] * 1.22, prof[-1][1] * 0.78

    for k in range(nribs):                                               # ribs
        zt = zs - 0.085 - k * 0.046
        rx, ry = ring(zt)
        for s in (-1, 1):
            pts = []
            for i in range(8):
                q = i / 7
                a = 0.35 + (2.25 + 0.06 * k) * q
                pts.append(V((s * (rx + 0.006) * math.sin(a), (ry + 0.006) * math.cos(a), zt - 0.055 * q - 0.004 * k)))
            mbC.tube(pts, lambda q: 0.0088 * (0.7 + 0.3 * math.sin(q * math.pi)), mt["bone"], segs=4)
    fy = -ring(zs - 0.15)[1] - 0.012
    mbC.tube([V((0, fy + 0.006, zs - 0.035)), V((0, fy - 0.002, zs - 0.15)), V((0, fy + 0.008, zr + 0.1))],
             lambda q: 0.011 * (1 - 0.4 * q), mt["tendon"], segs=6)                   # sternum
    for s in (-1, 1):
        # pectoral muscle and a fan of striated fibres sternum -> humerus
        mbC.sphere((0.075, 0.026, 0.068), (s * 0.085, fy + 0.014, zs - 0.1), mt["muscle"], segs=10, rings=6,
                   rot=(0, s * 12, 0))
        H = V((s * 0.17 * w, -0.055, zs - 0.05))
        for i in range(8 if lite else 10):
            P = V((s * 0.012, fy - 0.004, zs - 0.025 - i * (0.019 if lite else 0.015)))
            mid = P.lerp(H, 0.45) + V((0, -0.026 - 0.0012 * i, -0.012 + 0.003 * i))
            mbC.tube([P, P.lerp(mid, 0.5) + V((0, -0.006, 0)), mid, mid.lerp(H, 0.5) + V((0, -0.005, 0)), H],
                     lambda q: 0.0078 * (0.6 + 0.4 * math.sin(math.pi * q)), mt["fiber"] if i % 2 else mt["muscle"],
                     segs=4)
        mbC.tube([V((s * 0.02, fy + 0.01, zs + 0.005)), V((s * 0.1, fy + 0.008, zs + 0.025)),
                  V((s * 0.17 * w, -0.03, zs + 0.01))], 0.0085, mt["tendon"], segs=5)          # clavicle
        for i in range(2):                                                # trapezius
            mbC.tube([V((s * 0.035, 0.02 + i * 0.012, zs + 0.11 - i * 0.02)), V((s * 0.11, 0.03, zs + 0.06)),
                      V((s * 0.17 * w, 0.0 + i * 0.015, zs + 0.0))], lambda q: 0.018 * (1 - 0.4 * q),
                     mt["muscle"] if i % 2 else mt["fiber"], segs=5)
        mbC.sphere((0.065, 0.028, 0.085), (s * 0.085, 0.095, zs - 0.11), mt["muscle"], segs=10, rings=6)  # scapula
        for i in range(0):                                                # serratus fingers
            z = zs - 0.17 - i * 0.04
            rx, ry = ring(z)
            mbC.tube([V((s * rx * 0.93, -ry * 0.45, z)), V((s * (rx + 0.008), 0.0, z + 0.02)),
                      V((s * rx * 0.9, ry * 0.5, z + 0.05))], lambda q: 0.009 * math.sin(0.3 + q * 2.5),
                     mt["fiber"], segs=4)
        if stumps:
            sh = V((s * 0.185 * w, -0.012, zs - 0.045))
            mlimb(mbC, sh + V((-s * 0.03, 0, 0.02)), sh + V((s * 0.035, 0.0, -0.07)),
                  [(0, 0.045), (0.5, 0.05), (1, 0.036)], mt["dark"], segs=9, up=FWD)
            for i in range(7):                                            # deltoid fibres
                a = -1.0 + 0.33 * i
                p0 = sh + V((-s * 0.03, 0.045 * math.sin(a), 0.055))
                mbC.tube([p0, sh + V((s * 0.05, 0.06 * math.sin(a), 0.02)), sh + V((s * 0.045, 0.05 * math.sin(a), -0.04)),
                          sh + V((s * 0.015, 0.03 * math.sin(a), -0.07))], lambda q: 0.0095 * (1 - 0.5 * q),
                         mt["fiber"] if i % 2 else mt["muscle"], segs=4)
            for i in range(3):                                            # torn ends
                p0 = sh + V((s * 0.02, -0.03 + 0.03 * i, -0.055))
                mbC.tube([p0, p0 + V((s * 0.01, 0.005, -0.03)), p0 + V((s * 0.004, 0.0, -0.05 - 0.02 * i))],
                         lambda q: 0.008 * (1 - 0.85 * q), mt["dark"] if i % 2 else mt["fiber"], segs=4)
    # ---- abdomen
    mlimb(mbS, (0, 0.01, z0 - 0.06), (0, 0.0, zr + 0.06), [(0, 0.105 * w), (0.5, 0.115 * w), (1, 0.128 * w)],
          mt["dark"], segs=14, sx=1.15, sy=0.95, up=FWD)
    if not guts:
        return
    tubes = ((0.024 * w, z0 + 0.02, zr - 0.05, 46), (0.016 * w, z0, zr - 0.02, 40))
    for g, (gr, zlo, zhi, n) in enumerate(tubes[:1] if lite else tubes):
        pts = []
        ph, z, dph, dz = rnd.uniform(-0.8, 0.8), rnd.uniform(zlo, zhi), 0.18, 0.0
        for i in range(n):                                              # bowel: wandering coil on the belly
            dph += rnd.uniform(-0.14, 0.14)
            dph = max(-0.26, min(0.26, dph))
            dz += rnd.uniform(-0.012, 0.012)
            dz = max(-0.02, min(0.02, dz))
            ph += dph
            z += dz
            if abs(ph) > 1.2:
                dph = -dph
                ph = math.copysign(1.2, ph)
            if not zlo < z < zhi:
                dz = -dz
                z = max(zlo, min(zhi, z))
            rr = (0.122 + 0.01 * g) * w
            pts.append(V((math.sin(ph) * rr * 1.05, -math.cos(ph) * rr, z)))
        mbS.tube(pts, lambda q, gr=gr: gr * (0.85 + 0.15 * math.sin(q * 60)), mt["gut"] if g == 0 else mt["fiber"],
                 segs=6 - g)
    for k in range(6 if lite else 10):                                   # fat beads below the ribs
        ph = rnd.uniform(-0.9, 0.9)
        z = rnd.uniform(zr - 0.07, zr + 0.01)
        r = rnd.uniform(0.012, 0.02)
        mbS.sphere((r, r, r * 0.9), (math.sin(ph) * 0.135 * w, -math.cos(ph) * 0.13 * w, z), mt["fat"], segs=6, rings=4)
    for k in range(3 if lite else 4):                                    # sinew bands binding the gut
        a0 = T * k / 4 + 0.4
        pts = []
        for i in range(13):
            s = i / 12
            a = a0 + 1.5 * math.pi * s * (1 if k % 2 else -1)
            pts.append(V((math.cos(a) * 0.15 * w, math.sin(a) * 0.145 * w, z0 - 0.04 + (zr - z0 + 0.02) * s)))
        mbS.tube(pts, lambda q: 0.011 * (0.7 + 0.3 * math.sin(q * 9)), mt["muscle"] if k % 2 else mt["fiber"], segs=5)
    for s in (-1, 1):                                                    # torn rectus flaps
        p0 = V((s * 0.05, -0.13 * w, zr + 0.02))
        mbS.tube([p0, p0 + V((s * 0.01, -0.02, -0.06)), p0 + V((s * 0.02, -0.01, -0.13))],
                 lambda q: 0.018 * (1 - 0.7 * q), mt["muscle"], segs=5)


def flayed_neck(mb, mt, a, b, r=0.048):
    a, b = V(a), V(b)
    mlimb(mb, a, b, muscle(0, r, 1, r * 0.92, belly=-0.004), mt["muscle"], segs=12, sx=1.1, sy=0.95, up=FWD)
    for s in (-1, 1):
        mb.tube([a + V((s * 0.025, -0.045, 0.0)), a.lerp(b, 0.5) + V((s * 0.04, -0.035, 0)),
                 b + V((s * 0.055, 0.0, 0.0))], lambda q: 0.012 * (1 - 0.2 * q), mt["fiber"], segs=5)
        for i in range(3):
            x = s * (0.012 + 0.012 * i)
            mb.tube([a + V((x, -0.05 + 0.005 * i, 0.01)), b + V((x * 1.1, -0.05 + 0.01 * i, -0.01))], 0.0055,
                    mt["fiber"] if i % 2 else mt["muscle"], segs=4)
    mb.tube([a + V((0, -0.05, 0.03)), b + V((0, -0.052, -0.04))], 0.011, mt["lidc"], segs=6)  # windpipe


def tongue(mb, mt, start, ctrl, r=0.014, fork=True, seed=0):
    pts, _ = resample([start] + list(ctrl), 12)
    mb.tube(pts, lambda q: r * (1 - 0.35 * q), mt["tongue"], segs=7)
    if fork:
        end, d = pts[-1], tangent(pts, len(pts) - 1)
        sv = d.cross(UP).normalized() if abs(d.z) < 0.9 else V((1, 0, 0))
        for s in (-1, 1):
            p1 = end + d * 0.03 + sv * s * 0.018
            p2 = p1 + d * 0.025 + sv * s * 0.02 + UP * 0.012
            p3 = p2 + sv * s * 0.005 + UP * 0.02 - d * 0.01
            mb.tube([end, p1, p2, p3], lambda q: r * 0.62 * (1 - 0.85 * q), mt["tongue"], segs=5)


def flesh_mats(prefix, skin, iris, hair="#141216", hand="#d6c4a8"):
    m = dict(
        muscle=mat(prefix + "Muscle", "#913430", rough=0.32),
        dark=mat(prefix + "MuscleDk", "#5a1818", rough=0.4),
        fiber=mat(prefix + "Fiber", "#b24a42", rough=0.28),
        tendon=mat(prefix + "Tendon", "#d8c3aa", rough=0.35),
        bone=mat(prefix + "Bone", "#d2c7a7", rough=0.55),
        boned=mat(prefix + "BoneDk", "#9a8d70", rough=0.6),
        disc=mat(prefix + "Disc", "#7a2622", rough=0.35),
        lidc=mat(prefix + "Lid", "#9c4a44", rough=0.3),
        cavity=mat(prefix + "Cavity", "#320a0c", rough=0.5),
        gut=mat(prefix + "Gut", "#c27f6c", rough=0.22),
        fat=mat(prefix + "Fat", "#cfae6c", rough=0.35),
        skin=mat(prefix + "Skin", skin, rough=0.4),
        lip=mat(prefix + "Lip", "#7d1d22", rough=0.25),
        mouth=mat(prefix + "Mouth", "#220405", rough=0.6, double=True),
        socket=mat(prefix + "Socket", "#4a1414", rough=0.4),
        teeth=mat(prefix + "Teeth", "#e0d3b0", rough=0.3),
        tongue=mat(prefix + "Tongue", "#a8374a", rough=0.2),
        hair=mat(prefix + "Hair", hair, rough=0.5, double=True),
        hand=mat(prefix + "Hand", hand, rough=0.45),
        nail=mat(prefix + "Nail", "#4a3530", rough=0.4),
        glint=mat("EmitEyeWet", "#ffffff", rough=0.5, emit="#ffffff", strength=1.2),
    )
    em = dict(sclera=mat(prefix + "Sclera", "#e6ddd0", rough=0.12), iris=mat(prefix + "Iris", iris, rough=0.1),
              pupil=mat(prefix + "Pupil", "#040303", rough=0.1))
    return m, em


def flayed_face_mats(mt, prm, third=False, eye_az=0.42, eye_el=0.12, muscle_lo=-0.12):
    em_, mw, we = prm

    def fm(c):
        az, el = angles(c)
        if gauss(az, el, 0, em_, mw, we) > 0.45:
            return mt["mouth"]
        for s in (-1, 1):
            if gauss(az, el, s * eye_az, eye_el, 0.17, 0.12) > 0.5:
                return mt["socket"]
        if third and gauss(az, el, 0, 0.5, 0.11, 0.09) > 0.5:
            return mt["socket"]
        return None
    return fm


def nose_piece(mb, fn, M, skin, nostril, scale=1.0):
    """Crisp nose: bridge capsule, tip and alae laid on the sculpted base."""
    R3 = M.to_3x3()
    b0, b1 = S(fn, M, 0, 0.06, -0.004), S(fn, M, 0, -0.2, 0.006 * scale)
    fwd = R3 @ FWD
    tip = b1 + fwd * 0.004 * scale
    mb.tube([b0, b0.lerp(tip, 0.5) + fwd * 0.002, tip], lambda q: (0.0065 + 0.005 * q) * scale, skin, segs=6)
    mb.sphere((0.009 * scale,) * 3, tip, skin, segs=7, rings=5)
    for s in (-1, 1):
        a = S(fn, M, s * 0.13, -0.24, 0.0)
        mb.sphere((0.007 * scale, 0.008 * scale, 0.006 * scale), a, skin, segs=6, rings=4)
        mb.sphere((0.0035 * scale, 0.003 * scale, 0.0025 * scale), S(fn, M, s * 0.06, -0.27, 0.003), nostril,
                  segs=5, rings=3)


def face_fibers(mb, fn, M, mt, prm, scale=1.0, under_eye=True, patch=True, sides=(-1, 1), chin=True, nm=5, nz=2):
    """Flayed cheeks: a raw muscle patch with a torn edge, striated fibre bundles laid over it
    (masseter, zygomatic, mentalis) and red streaks under the eyes."""
    em_, mw, we = prm
    r = 0.0047 * scale
    if patch:
        for s in sides:
            patch_mesh(mb, fn, mt["muscle"], M, s * 0.34, s * 1.5,
                       lambda a: -0.92 + 0.07 * math.sin(a * 13),
                       lambda a: -0.06 - 0.18 * (abs(a) - 0.34) + 0.07 * math.sin(a * 17), cols=9, rows=6,
                       scale=1.004)
    for s in sides:
        for j in range(nm):
            a0 = s * (0.7 + 0.65 / nm * j)
            surf_fiber(mb, fn, M, [(a0 + s * 0.04, -0.12), (a0 + s * 0.03, -0.35), (a0 - s * 0.01, -0.6),
                                   (a0 - s * 0.08, -0.88)], r * 0.85, mt["fiber"] if j % 2 else mt["dark"], lift=0.0025, n=6)
        for j in range(nz):
            surf_fiber(mb, fn, M, [(s * (0.86 + 0.05 * j), -0.04 - 0.05 * j), (s * (0.7 + 0.03 * j), em_ + 0.2),
                                   (s * mw * (1.0 + 0.08 * j), em_ + 0.02 - 0.06 * j)], r * 0.9,
                       mt["dark"] if j % 2 else mt["fiber"], lift=0.004)
        if under_eye:
            for j in range(2):
                a0 = s * (0.3 + 0.1 * j)
                surf_fiber(mb, fn, M, [(a0, 0.0), (a0 + s * 0.02, -0.15), (a0 + s * 0.05, -0.32 - 0.04 * j)],
                           r * 0.75, mt["muscle"], lift=0.0025)
    for j in range(3 if chin else 0):
        a0 = (j - 1) * 0.11
        surf_fiber(mb, fn, M, [(a0, em_ - we * 0.95), (a0 * 1.2, em_ - we * 1.3), (a0 * 1.4, -1.25)], r,
                   mt["fiber"] if j % 2 else mt["muscle"], lift=0.003)


def tri_report(rig):
    import os
    if not os.environ.get("HR_TRIS"):
        return
    import bpy
    rows = []
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            rows.append((sum(len(p.vertices) - 2 for p in o.data.polygons), o.name))
    for n, nm in sorted(rows, reverse=True):
        print(f"      {nm:16s} {n}")


# ============================================================ PENENUN TULANG
def entity_weaver():
    mt, em = flesh_mats("Weaver", "#d4ad9c", "#5d86b4")
    rig = Rig()
    J = rig.joint
    J("Hips", (0, 0, 0.3))
    J("Spine", (0, 0, 0.76), "Hips")
    J("Chest", (0, 0, 1.12), "Spine")
    J("Neck", (0, -0.01, 1.5), "Chest")
    J("Head", (0, -0.035, 1.63), "Neck")
    HC = V((0, -0.06, 1.8))
    Mh = Matrix.Translation(HC) @ Matrix.Rotation(math.radians(-9), 4, "X") @ Matrix.Scale(1.12, 4)
    fn, prm = head_fn(rx=0.074, ry=0.094, rz=0.103, open_=1.0, third=True, gaunt=0.03)
    em_, mw, we = prm
    mouth_c = Mh @ (fn(sdir(0, em_)) * 0.8)
    J("Tongue", tuple(mouth_c), "Head")
    J("Hair", tuple(Mh @ V((0, 0.07, -0.02))), "Head")

    # ---- torso, neck
    flayed_torso(rig.mb("Chest"), rig.mb("Spine"), mt, z0=0.74, zr=1.12, zs=1.47, seed=3, nribs=6)
    rig.mb("Spine").sphere((0.07, 0.05, 0.06), (0.05, -0.085, 1.1), mt["muscle"], segs=10, rings=6)    # liver lobe
    flayed_neck(rig.mb("Neck"), mt, (0, 0.0, 1.45), (0, -0.035, 1.68))

    # ---- head: sculpted face, third eye, screaming mouth, flayed cheeks
    m = rig.mb("Head")
    surf_mesh(m, fn, mt["skin"], Mh, segs=26, rings=19, mats=flayed_face_mats(mt, prm, third=True))
    for s in (-1, 1):
        c = S(fn, Mh, s * 0.42, 0.12, -0.005)
        eye5(m, c, (Mh.to_3x3() @ sdir(s * 0.15, 0.05)), 0.0185, em, lid=mt["lidc"], lid_open=0.72, segs=10,
             glint=mt["glint"], iris_r=0.5, up=Mh.to_3x3() @ UP)
    c = S(fn, Mh, 0, 0.5, -0.006)
    eye5(m, c, Mh.to_3x3() @ sdir(0, 0.25), 0.016, em, lid=mt["lidc"], lid_open=0.68, segs=10, glint=mt["glint"],
         iris_r=0.5, up=Mh.to_3x3() @ UP)
    mouth_parts(m, fn, Mh, prm, mt, scale=1.12)
    nose_piece(m, fn, Mh, mt["skin"], mt["mouth"], scale=1.12)
    face_fibers(m, fn, Mh, mt, prm, scale=1.12)
    # hair: a dark cap and clumps swept back into the spine
    cap_mesh(m, fn, mt["hair"], Mh, lambda a: hairline(a) + 0.02)
    grow_hair(m, scalp_roots(46, 5), Mh, fn, mt["hair"], 7, 0.035, (0, 0.1, -0.45), (0, 1, 0.2), seed=6,
              width=(0.034, 0.012))

    m = rig.mb("Hair")
    roots = scalp_roots(25, 8, az_rng=(1.9, 4.38))
    roots = [((a + math.pi) % T - math.pi, e) for a, e in roots]
    grow_hair(m, roots, Mh, fn, mt["hair"], 13, 0.04, (0.02, 0.03, -0.5), (0.1, 1, -0.4), seed=9,
              attract=(0.16, 0.2, 1.3), attract_k=0.25, width=(0.04, 0.008))
    grow_hair(m, roots[:5], Mh, fn, mt["hair"], 12, 0.04, (0.02, 0.03, -0.5), (0.1, 1, -0.4), seed=10,
              attract=(0.16, 0.2, 1.3), attract_k=0.25, tube_r=0.016)

    # ---- tongue: long forked, lolling out and to the side
    tongue(rig.mb("Tongue"), mt, mouth_c, [mouth_c + V((0.01, -0.06, -0.015)), mouth_c + V((-0.03, -0.095, -0.06)),
                                           mouth_c + V((-0.02, -0.11, -0.12)), mouth_c + V((0.02, -0.1, -0.15))],
           r=0.012)

    # ---- the coiled spine of eyes and hands
    ctrl = [(0.02, 0.1, 1.64), (0.1, 0.15, 1.52), (0.2, 0.16, 1.37), (0.28, 0.12, 1.21), (0.32, 0.03, 1.06),
            (0.31, -0.11, 0.94), (0.19, -0.25, 0.87), (0.0, -0.3, 0.83), (-0.21, -0.25, 0.8), (-0.32, -0.08, 0.76),
            (-0.3, 0.12, 0.71), (-0.15, 0.27, 0.66), (0.08, 0.29, 0.6), (0.26, 0.17, 0.54), (0.31, -0.03, 0.47),
            (0.24, -0.2, 0.39), (0.12, -0.29, 0.31)]

    def rc(u):
        return 0.042 + 0.04 * sm(u / 0.38) - 0.02 * sm((u - 0.8) / 0.2)
    jspec = [("CoilA0", 0.0, "Chest"), ("CoilA1", 0.17, "CoilA0"), ("CoilA2", 0.33, "CoilA1"),
             ("CoilB0", 0.48, "Spine"), ("CoilB1", 0.65, "CoilB0"), ("CoilB2", 0.82, "CoilB1")]
    shands = bone_coil(rig, ctrl, jspec, mt, em, rc, step_k=1.8, seed=21,
                       hands=[(0.17, 0.2), (0.34, -0.2), (0.62, -0.3), (0.84, 0.2)],
                       hand_mat=mt["hand"])

    # ---- mound of bones she drags herself on
    m = rig.mb("Hips")
    bone_mound(m, mt, em, R=0.47, H=0.32, seed=31, nb=26, ns=10, ne=3, col_r=0.15, col_top=0.5, nk=3)
    sinew_column(m, mt, 0.18, 0.8, 0.115, n=8, seed=32, tr=0.034)
    for k in range(6):                                                   # bones knotted in the stalk
        a = T * k / 6 + 0.5
        z0 = 0.26 + 0.06 * (k % 3)
        bone(m, (0.15 * math.cos(a), 0.15 * math.sin(a), z0),
             (0.12 * math.cos(a + 0.9), 0.12 * math.sin(a + 0.9), z0 + 0.32), 0.015, mt["bone"])
    drags = []
    static = [(-1.6, 0.44)]
    for k, (a, rr) in enumerate([(-2.15, 0.38), (-0.95, 0.38), (-2.9, 0.36), (-0.25, 0.36)] + static):
        dv = V((math.cos(a), math.sin(a), 0))
        root = dv * rr * 0.75 + V((0, 0, 0.12))
        if k < 4:
            nm = f"Drag{k}"
            J(nm, tuple(root), "Hips")
            mm = rig.mb(nm)
            drags.append((nm, dv))
        else:
            mm = m
        wr = dv * (rr + 0.12) + V((0, 0, 0.035))
        bone(mm, root, wr, 0.014, mt["bone"])
        bone_hand(mm, wr + dv * 0.01, (dv - UP * 0.2).normalized(), -UP, 0.17, mt["bone"], r=0.0072, curl=0.5,
                  splay=0.3, seed=40 + k)
    rig.build(auto_smooth=60)
    tri_report(rig)

    # ---------------------------------------------------------------- clips
    coil = ["CoilA0", "CoilA1", "CoilA2", "CoilB0", "CoilB1", "CoilB2"]

    def drag_pose(p, amp, out):
        for i, (nm, dv) in enumerate(drags):
            q = p + (0 if i in (0, 3) else math.pi)
            lift = 28 * amp * max(0.0, math.sin(q))
            sweep = -30 * amp * math.cos(q)
            sg = 1 if UP.cross(dv).dot(FWD) > 0 else -1
            ax = dv.cross(UP)
            r = aa(ax, lift)
            out[nm] = (r[0], r[1], r[2] + sg * sweep * min(1.0, abs(dv.x) * 1.6))
        return out

    def hands_pose(p, amp, out):
        for k, (hn, (root, dv)) in enumerate(shands.items()):
            ax = dv.cross(UP).normalized()
            r = aa(ax, amp * 18 * math.sin(p + k * 1.3))
            out[hn] = (r[0], r[1], r[2] + amp * 10 * math.sin(p * 0.5 + k))
        return out

    def idle(f):
        p = f / 90.0 * T
        tw = 1.0 if (f % 45) in (20, 21, 22) else 0.0
        out = {"Hips": {"loc": (0, 0, 0.006 * math.sin(2 * p))},
               "Spine": (2 * math.sin(p), 0, 3 * math.sin(p + 0.5)),
               "Chest": (-2 + 2 * math.sin(2 * p), 1.5 * math.sin(p), -2 * math.sin(p)),
               "Neck": (3 * math.sin(p + 1), 0, 4 * math.sin(p)),
               "Head": (-3 + 4 * math.sin(2 * p) + 9 * tw, 8 * math.sin(p + 0.3) + 14 * tw, 10 * math.sin(p)),
               "Tongue": (8 * math.sin(3 * p), 6 * math.sin(2 * p), 16 * math.sin(2 * p + 1)),
               "Hair": (3 * math.sin(p), 0, 4 * math.sin(p + 1))}
        for k, nm in enumerate(coil):
            out[nm] = (2.5 * math.sin(2 * p + k), 2 * math.sin(2 * p + k * 0.7), 3 * math.sin(p + k * 0.9))
        hands_pose(2 * p, 1.0, out)
        return drag_pose(p, 0.12, out)

    def crawl(f, n, amp, lean):
        p = f / n * T
        out = {"Hips": {"rot": (3 * amp * math.sin(2 * p), 2 * amp * math.sin(p), 5 * amp * math.sin(p)),
                        "loc": (0.015 * amp * math.sin(p), -0.035 * amp * math.sin(2 * p),
                                0.015 * amp * abs(math.sin(p)))},
               "Spine": (lean + 3 * amp * math.sin(2 * p + 1), -3 * amp * math.sin(p), -5 * amp * math.sin(p)),
               "Chest": (lean * 0.7 + 3 * amp * math.sin(2 * p + 1.5), -2 * amp * math.sin(p), -4 * amp * math.sin(p)),
               "Neck": (4 * amp * math.sin(2 * p + 1.8), 0, 3 * math.sin(p)),
               "Head": (-lean * 1.2 + 6 * amp * math.sin(2 * p + 2), 6 * amp * math.sin(p), 8 * math.sin(p)),
               "Tongue": (15 * amp * math.sin(2 * p + 1), 0, 25 * amp * math.sin(p)),
               "Hair": (6 * amp * math.sin(2 * p + 2.5), 0, 6 * amp * math.sin(p + 1))}
        for k, nm in enumerate(coil):
            out[nm] = (5 * amp * math.sin(2 * p - k * 0.9), 3 * amp * math.sin(p - k * 0.7), 6 * amp * math.sin(p - k))
        hands_pose(2 * p, 1.3 * amp, out)
        return drag_pose(p, amp, out)

    def walk(f):
        return crawl(f, 36, 1.0, 6)

    def run(f):
        return crawl(f, 18, 1.5, 14)

    def reach_hands(deg, out):
        for k, (hn, (root, dv)) in enumerate(shands.items()):
            ax = dv.cross(FWD)
            if ax.length < 1e-3:
                continue
            out[hn] = aa(ax, deg)
        return out
    rear = reach_hands(-25, {"Hips": {"loc": (0, 0.08, 0.02)}, "Spine": (-10, 0, 0), "Chest": (-12, 0, 0),
                             "Neck": (-8, 0, 0), "Head": (-16, 0, 0), "Tongue": (30, 0, 10), "Hair": (-8, 0, 0),
                             "CoilA0": (-6, 0, 0), "CoilB0": (-5, 0, 0)})
    lunge = reach_hands(45, {"Hips": {"loc": (0, -0.38, 0.04), "rot": (6, 0, 0)}, "Spine": (22, 0, 0),
                             "Chest": (16, 0, 0), "Neck": (-10, 0, 0), "Head": (-12, 0, 0), "Tongue": (-70, 0, 0),
                             "Hair": (10, 0, 0), "CoilA0": (8, 0, 0), "CoilB0": (6, 0, 0)})
    lunge = drag_pose(math.pi / 2, 1.2, lunge)
    grab = add(lunge, reach_hands(25, {"Spine": (6, 0, 0), "Head": (14, 0, 0), "Tongue": (30, 0, 0)}))

    def attack(f):
        return keyed([(0, idle(0)), (8, rear), (14, lunge), (19, grab), (30, grab)], f)

    clips = [clip5(rig, "Idle", 3.0, idle), clip5(rig, "Walk", 1.2, walk), clip5(rig, "Run", 0.6, run),
             clip5(rig, "Attack", 1.0, attack)]
    return _finish_entity("entity_weaver", rig, clips, [("Idle", 0), ("Walk", 9), ("Attack", 16)],
                          view=(0.75, -1.7, 0.3), humanoid=False)


# ================================================================ GEMA RETAK
def sinew_arm(rig, base, ctrl, parent, mt, seed=0, r0=0.034, r1=0.02, hand_len=0.13, n=16, splits=(0.36, 0.7),
              palm=(0, -1, -0.4), twist=9.0):
    """Long tentacle-arm of twisted muscle cords ending in a human hand. Joints base, base+'b', base+'c'."""
    rnd = random.Random(seed)
    pts, tot = resample(ctrl, n)
    names = [base, base + "b", base + "c"]
    idx = [0, int(round(splits[0] * (n - 1))), int(round(splits[1] * (n - 1))), n - 1]
    rig.joint(names[0], tuple(pts[0]), parent)
    rig.joint(names[1], tuple(pts[idx[1]]), names[0])
    rig.joint(names[2], tuple(pts[idx[2]]), names[1])
    iw = int(round(0.86 * (n - 1)))
    ph = rnd.uniform(0, T)
    tans = [tangent(pts, i) for i in range(n)]
    fr = []
    side = tans[0].cross(UP) if abs(tans[0].z) < 0.95 else tans[0].cross(FWD)
    for i in range(n):
        side = side - tans[i] * side.dot(tans[i])
        side.normalize()
        fr.append((side.copy(), tans[i].cross(side).normalized()))

    def rad(i):
        return r0 + (r1 - r0) * i / (n - 1)
    for si in range(3):
        a, b = idx[si], min(idx[si + 1] + (1 if si < 2 else 0), iw if si == 2 else n)
        m = rig.mb(names[si])
        seg = list(range(a, b + 1)) if si < 2 else list(range(a, iw + 1))
        m.tube([pts[i] for i in seg], lambda q, seg=seg: rad(seg[0] + q * (seg[-1] - seg[0])), mt["muscle"], segs=5)
        for k, mm in ((0, mt["fiber"]), (1, mt["fiber"])):
            fp = []
            for i in seg:
                ang = ph + k * math.pi + twist * i / (n - 1)
                sv, uv = fr[i]
                fp.append(pts[i] + (sv * math.cos(ang) + uv * math.sin(ang)) * rad(i) * 0.82)
            m.tube(fp, lambda q, seg=seg: rad(seg[0] + q * (seg[-1] - seg[0])) * 0.42, mm, segs=3)
    m = rig.mb(names[2])
    m.tube(pts[iw - 1:], lambda q: 0.019 * (1 - 0.15 * q), mt["hand"], segs=6)            # pale wrist
    d = tans[-1]
    lite_hand(m, pts[-1], d, V(palm), hand_len, mt["hand"], curl=rnd.uniform(0.25, 0.6), splay=0.32, r=0.0068,
              seed=seed)
    return names, (pts[-1] - pts[0]).normalized()


def entity_echo():
    mt, em = flesh_mats("Echo", "#cfa48f", "#7d9cbc", hand="#d5bca5")
    porc = mat("EchoPorcelain", "#e6dacd", rough=0.22)
    porc_lip = mat("EchoPorcelainLip", "#b98f86", rough=0.3)
    pem = dict(sclera=mat("EchoPorcSclera", "#efe8de", rough=0.1), iris=mat("EchoPorcIris", "#8aa0b4", rough=0.1),
               pupil=em["pupil"])
    rig = Rig()
    J = rig.joint
    J("Hips", (0, 0, 0.3))
    J("Spine", (0, 0, 0.74), "Hips")
    J("Chest", (0, 0, 1.08), "Spine")
    J("Neck", (0.03, -0.02, 1.47), "Chest")
    J("Head", (0.03, -0.05, 1.6), "Neck")
    HC = V((0.03, -0.07, 1.8))
    Mh = Matrix.Translation(HC) @ Matrix.Rotation(math.radians(-8), 4, "Z") @ Matrix.Rotation(math.radians(-8), 4, "X") \
        @ Matrix.Scale(1.12, 4)
    fn, prm = head_fn(open_=1.0, gaunt=0.03)
    em_, mw, we = prm
    mouth_c = Mh @ (fn(sdir(0, em_)) * 0.75)
    J("Tongue", tuple(mouth_c), "Head")
    J("Hair", tuple(Mh @ V((0, 0.07, -0.02))), "Head")
    J("FaceB", (-0.15, -0.09, 1.38), "Chest")
    J("FaceC", (0.11, -0.1, 1.15), "Chest")

    # ---- core body
    flayed_torso(rig.mb("Chest"), rig.mb("Spine"), mt, z0=0.72, zr=1.08, zs=1.43, seed=5, stumps=False, w=1.05,
                 lite=True, nribs=5)
    flayed_neck(rig.mb("Neck"), mt, (0.0, 0.0, 1.4), (0.03, -0.05, 1.66), r=0.05)

    # ---- the split head: two halves pulled apart over raw flesh, eyes on both halves
    m = rig.mb("Head")
    for s in (1, -1):
        Ms = Mh @ Matrix.Translation((s * 0.022, 0.004, 0)) @ Matrix.Rotation(math.radians(s * 9), 4, "Z") \
            @ Matrix.Rotation(math.radians(-s * 6), 4, "Y")
        keep = (lambda c, s=s: c.x * s > 0.02)
        surf_mesh(m, fn, mt["skin"], Ms, segs=22, rings=16, keep=keep, mats=flayed_face_mats(mt, prm))
        surf_mesh(m, fn, mt["muscle"], Ms, segs=16, rings=10, keep=keep, invert=True, scale=0.93)
        R3 = Ms.to_3x3()
        eye5(m, S(fn, Ms, s * 0.42, 0.12, -0.005), R3 @ sdir(s * 0.2, 0.05), 0.0185, em, lid=mt["lidc"],
             lid_open=0.75, segs=10, glint=mt["glint"], iris_r=0.5, up=R3 @ UP)
        eye5(m, S(fn, Ms, s * 0.27, 0.46, -0.004), R3 @ sdir(s * 0.15, 0.3), 0.013, em, lid=mt["lidc"],
             lid_open=0.6, segs=7, iris_r=0.55, up=R3 @ UP, lid_segs=3)
        mouth_parts(m, fn, Ms, prm, mt, scale=1.12, half=s)
        face_fibers(m, fn, Ms, mt, prm, scale=1.12, sides=(s,), chin=False, under_eye=False, nm=3, nz=1)
        patch_mesh(m, fn, mt["hair"], Ms, s * 0.03, s * math.pi, lambda a: hairline(a) + 0.02, lambda a: 1.52,
                   cols=12, rows=6, scale=1.035)
        p0, p1 = S(fn, Ms, s * 0.06, 0.05), S(fn, Ms, s * 0.08, -0.25)
        m.tube([p0, p1 + V((0, -0.004, 0))], lambda q: 0.009 * (1 + 0.3 * q), mt["skin"], segs=6)      # half nose
    blob(m, Mh @ V((0, 0.01, -0.01)), (0.026, 0.088, 0.105), mt["muscle"], seed=51, amp=0.12, segs=10, rings=8)
    for k, (z, dz) in enumerate(((0.05, -0.02), (-0.02, 0.015), (-0.07, -0.01))):   # strands bridging the split
        a, b = Mh @ V((0.024, -0.07 + 0.01 * k, z)), Mh @ V((-0.024, -0.068 + 0.006 * k, z + dz))
        m.tube([a, (a + b) / 2 + V((0, -0.006, -0.006)), b], 0.0032, mt["fiber"] if k % 2 else mt["lidc"], segs=4)
    m = rig.mb("Hair")
    for s, sd in ((1, 61), (-1, 62)):
        Ms = Mh @ Matrix.Translation((s * 0.022, 0.004, 0)) @ Matrix.Rotation(math.radians(s * 9), 4, "Z")
        roots = [(a, e) for a, e in scalp_roots(19, sd, az_rng=(0.6, 3.1))]
        roots = [(s * a, e) for a, e in roots]
        grow_hair(m, roots, Ms, fn, mt["hair"], 11, 0.04, (0.03, 0.04, -0.5), (0.15, 1, -0.3), seed=sd,
                  attract=(0.22, 0.2, 1.38), attract_k=0.25, width=(0.04, 0.008))
    tongue(rig.mb("Tongue"), mt, mouth_c, [mouth_c + V((0.0, -0.06, -0.01)), mouth_c + V((0.03, -0.1, -0.05)),
                                           mouth_c + V((0.02, -0.12, -0.1)), mouth_c + V((-0.02, -0.1, -0.14))],
           r=0.012)

    # ---- porcelain mask face (left of the chest), cracked across
    m = rig.mb("FaceB")
    MB = Matrix.Translation((-0.2, -0.18, 1.44)) @ Matrix.Rotation(math.radians(-12), 4, "Z") @ \
        Matrix.Rotation(math.radians(16), 4, "Y") @ Matrix.Scale(1.2, 4)
    fnB, prmB = head_fn(open_=0.0, mdepth=0.22, mw=0.24, sock=0.12, gaunt=0.0)
    front = (lambda c: abs(angles(c)[0]) < 1.45 and angles(c)[1] > -1.25)
    up_piece = (lambda c: front(c) and angles(c)[1] > -0.3)
    lo_piece = (lambda c: front(c) and not up_piece(c))
    MB2 = MB @ Matrix.Translation((0.006, -0.01, -0.02)) @ Matrix.Rotation(math.radians(9), 4, "Y")
    for Mx, kp in ((MB, up_piece), (MB2, lo_piece)):
        surf_mesh(m, fnB, porc, Mx, segs=22, rings=16, keep=kp, mats=lambda c: mt["mouth"] if gauss(
            *angles(c), 0, prmB[0], prmB[1], prmB[2]) > 0.6 else None)
        surf_mesh(m, fnB, mt["muscle"], Mx, segs=14, rings=10, keep=kp, invert=True, scale=0.94)
    R3 = MB.to_3x3()
    for s in (-1, 1):
        eye5(m, S(fnB, MB, s * 0.42, 0.12, -0.004), R3 @ sdir(s * 0.08, 0.0), 0.0185, pem, lid=porc, lid_open=0.6,
             segs=10, iris_r=0.55, up=R3 @ UP)
    mouth_parts(m, fnB, MB2, prmB, mt, scale=1.2, teeth=False, lip=porc_lip)
    blob(m, MB @ V((0, 0.07, -0.01)), (0.07, 0.06, 0.09), mt["muscle"], seed=52, amp=0.15, segs=10, rings=7)
    for k, (a, e) in enumerate(((1.3, 0.5), (1.4, -0.1), (1.25, -0.7), (-1.35, 0.3), (-1.3, -0.5))):  # flesh holding the mask
        p0 = S(fnB, MB if e > -0.3 else MB2, a, e)
        p2 = V((-0.13 + 0.02 * math.sin(k * 2.3), 0.01 * k, 1.36 + 0.05 * math.sin(k * 1.7)))
        m.tube([p0, p0.lerp(p2, 0.5) + V((0.0, 0.02, -0.02 * math.cos(k))), p2], lambda q, k=k: (0.006 + 0.003 * (k % 2)) *
               (1 + 0.5 * q), mt["fiber"] if k % 2 else mt["muscle"], segs=4)

    # ---- third face: screaming, half buried in the chest
    m = rig.mb("FaceC")
    MC = Matrix.Translation((0.14, -0.19, 1.2)) @ Matrix.Rotation(math.radians(18), 4, "Z") @ \
        Matrix.Rotation(math.radians(-14), 4, "X") @ Matrix.Rotation(math.radians(-12), 4, "Y") @ Matrix.Scale(1.05, 4)
    fnC, prmC = head_fn(open_=1.0, gaunt=0.07, sock=0.18)
    surf_mesh(m, fnC, mt["skin"], MC, segs=20, rings=15, keep=lambda c: abs(angles(c)[0]) < 1.75,
              mats=flayed_face_mats(mt, prmC))
    R3 = MC.to_3x3()
    for s in (-1, 1):
        eye5(m, S(fnC, MC, s * 0.42, 0.12, -0.006), R3 @ sdir(-s * 0.1, 0.1), 0.017, em, lid=mt["lidc"],
             lid_open=0.8, segs=9, iris_r=0.45, up=R3 @ UP)
    mouth_parts(m, fnC, MC, prmC, mt, scale=1.05, n_up=6, n_lo=5)
    nose_piece(m, fnC, MC, mt["skin"], mt["mouth"], scale=1.05)
    face_fibers(m, fnC, MC, mt, prmC, scale=1.05, under_eye=False, nm=3, nz=1)
    blob(m, MC @ V((0, 0.06, 0)), (0.075, 0.06, 0.1), mt["muscle"], seed=53, amp=0.15, segs=10, rings=7)
    for k in range(2):                                                  # brow wrinkles of the scream
        surf_fiber(m, fnC, MC, [(-0.45, 0.44 + 0.09 * k), (0, 0.48 + 0.09 * k), (0.45, 0.44 + 0.09 * k)], 0.0022,
                   mt["skin"], lift=0.001, n=6)

    # ---- spine coil, shorter: up the back to the head, once round the belly
    ctrl = [(0.05, 0.1, 1.62), (0.16, 0.16, 1.5), (0.26, 0.15, 1.33), (0.31, 0.06, 1.15), (0.29, -0.1, 1.0),
            (0.13, -0.25, 0.92), (-0.1, -0.27, 0.88), (-0.27, -0.15, 0.84), (-0.31, 0.05, 0.79), (-0.18, 0.24, 0.73),
            (0.05, 0.27, 0.66), (0.21, 0.12, 0.56), (0.2, -0.06, 0.46)]

    def rc(u):
        return 0.04 + 0.03 * sm(u / 0.35) - 0.022 * sm((u - 0.82) / 0.18)
    jspec = [("CoilA0", 0.0, "Chest"), ("CoilA1", 0.25, "CoilA0"), ("CoilB0", 0.5, "Spine"), ("CoilB1", 0.76, "CoilB0")]
    shands = bone_coil(rig, ctrl, jspec, mt, em, rc, step_k=2.1, seed=23, hands=[], eye_every=3)

    # ---- eight sinew arms
    arm_ctrl = {
        "ArmL0": [(0.13, 0.05, 1.42), (0.27, 0.06, 1.46), (0.38, 0.02, 1.58), (0.42, -0.02, 1.74), (0.52, -0.06, 1.86),
                  (0.68, -0.1, 1.9)],
        "ArmL1": [(0.16, 0.05, 1.3), (0.3, 0.06, 1.27), (0.45, 0.0, 1.36), (0.6, -0.05, 1.43), (0.78, -0.1, 1.37),
                  (0.93, -0.14, 1.33)],
        "ArmL2": [(0.17, 0.04, 1.17), (0.3, 0.05, 1.12), (0.44, 0.0, 1.17), (0.58, -0.06, 1.1), (0.7, -0.1, 0.98),
                  (0.8, -0.15, 0.9)],
        "ArmL3": [(0.16, 0.03, 1.03), (0.26, 0.02, 0.93), (0.36, -0.02, 0.85), (0.5, -0.06, 0.83), (0.62, -0.1, 0.7),
                  (0.67, -0.15, 0.56)],
        "ArmR0": [(-0.13, 0.05, 1.44), (-0.26, 0.07, 1.52), (-0.33, 0.02, 1.66), (-0.4, -0.04, 1.8), (-0.5, -0.08, 1.9),
                  (-0.62, -0.11, 1.97)],
        "ArmR1": [(-0.16, 0.05, 1.32), (-0.32, 0.07, 1.34), (-0.5, 0.02, 1.3), (-0.66, -0.03, 1.2), (-0.8, -0.08, 1.2),
                  (-0.95, -0.12, 1.25)],
        "ArmR2": [(-0.17, 0.04, 1.18), (-0.3, 0.05, 1.1), (-0.42, 0.0, 1.02), (-0.58, -0.05, 1.0), (-0.72, -0.09, 1.04),
                  (-0.86, -0.13, 1.0)],
        "ArmR3": [(-0.16, 0.03, 1.02), (-0.24, 0.02, 0.9), (-0.3, -0.03, 0.77), (-0.42, -0.06, 0.67), (-0.55, -0.09, 0.61),
                  (-0.69, -0.13, 0.56)],
    }
    arms = {}
    for k, (nm, c) in enumerate(arm_ctrl.items()):
        palm = (0, -1, -0.5) if nm[-1] in "01" else (0, -1, 0.3)
        arms[nm] = sinew_arm(rig, nm, c, "Chest", mt, seed=70 + k, palm=palm)

    # ---- mound
    m = rig.mb("Hips")
    bone_mound(m, mt, em, R=0.5, H=0.32, seed=33, nb=17, ns=6, ne=2, col_r=0.15, col_top=0.5, nk=3)
    sinew_column(m, mt, 0.18, 0.78, 0.115, n=6, seed=34, tr=0.036)
    for k in range(3):
        a = T * k / 3 + 0.3
        bone(m, (0.15 * math.cos(a), 0.15 * math.sin(a), 0.28), (0.12 * math.cos(a + 0.9), 0.12 * math.sin(a + 0.9), 0.6),
             0.015, mt["bone"])
    for k, a in enumerate((-2.0,)):
        dv = V((math.cos(a), math.sin(a), 0))
        root = dv * 0.32 + V((0, 0, 0.1))
        wr = dv * 0.52 + V((0, 0, 0.035))
        bone(m, root, wr, 0.013, mt["bone"])
        bone_hand(m, wr + dv * 0.01, (dv - UP * 0.2).normalized(), -UP, 0.16, mt["bone"], r=0.007, curl=0.5,
                  splay=0.3, seed=80 + k)
    rig.build(auto_smooth=60)
    tri_report(rig)

    # ---------------------------------------------------------------- clips
    def arm_rot(nm, lift, fwd, curl_b=0.0, curl_c=0.0, out=None):
        out = {} if out is None else out
        D = arms[nm][1].copy()
        D.z = 0
        D.normalize()
        A = D.cross(UP)
        sg = 1 if UP.cross(D).dot(FWD) > 0 else -1
        r = aa(A, lift)
        out[nm] = (r[0], r[1], r[2] + sg * fwd)
        out[nm + "b"] = aa(A, curl_b)
        out[nm + "c"] = aa(A, curl_c)
        return out

    def arms_all(fn_, out):
        for k, nm in enumerate(arm_ctrl):
            arm_rot(nm, *fn_(k, nm, int(nm[-1]), 1 if nm[3] == "L" else -1), out=out)
        return out

    def idle(f):
        p = f / 90.0 * T
        tw = 1.0 if (f % 30) in (11, 12) else 0.0
        out = {"Hips": {"loc": (0, 0, 0.006 * math.sin(2 * p))}, "Spine": (2 * math.sin(p), 0, 2 * math.sin(p + 1)),
               "Chest": (2 * math.sin(2 * p), 2 * math.sin(p), -3 * math.sin(p)), "Neck": (3 * math.sin(p + 1), 0, 0),
               "Head": (-4 + 5 * math.sin(2 * p), 8 * math.sin(p) + 12 * tw, 8 * math.sin(p + 2)),
               "FaceB": (4 * math.sin(p + 2), 5 * math.sin(2 * p), 6 * math.sin(p)),
               "FaceC": (5 * math.sin(2 * p + 1) - 8 * tw, 0, 5 * math.sin(p + 3)),
               "Tongue": (8 * math.sin(3 * p), 0, 14 * math.sin(2 * p)), "Hair": (3 * math.sin(p), 0, 3 * math.sin(p + 1)),
               "CoilA0": (2 * math.sin(2 * p), 0, 2 * math.sin(p)), "CoilA1": (2 * math.sin(2 * p + 1), 0, 2 * math.sin(p + 1)),
               "CoilB0": (2 * math.sin(2 * p + 2), 0, 2 * math.sin(p + 2)), "CoilB1": (2 * math.sin(2 * p + 3), 0, 2 * math.sin(p + 3))}
        for k, hn in enumerate(shands):
            out[hn] = (14 * math.sin(2 * p + k), 0, 10 * math.sin(p + k))
        return arms_all(lambda k, nm, i, sd: (8 * math.sin(p * 2 + k * 0.8), 6 * math.sin(p + k),
                                              14 * math.sin(p * 2 + k * 0.8 - 0.8), 18 * math.sin(p * 2 + k * 0.8 - 1.6)),
                        out)

    def still(base):
        def fn_(f):
            j = 1.2 * math.sin(f * 1.9)
            return add(base, {"Head": (j, 0, -j), "FaceC": (0, -j, j), "Tongue": (3 * j, 0, 4 * j)})
        return fn_

    poses = {
        "Pose1": arms_all(lambda k, nm, i, sd: (30 - 6 * i, 8, 25, 30 - 10 * (i % 2)),
                          {"Head": (-22, 10, 12), "Neck": (-8, 0, 0), "Chest": (-6, 4, 0), "FaceB": (-10, 10, -15),
                           "FaceC": (-15, 0, 10), "Tongue": (20, 0, 20), "Hips": {"loc": (0, 0, 0.03)}}),
        "Pose2": arms_all(lambda k, nm, i, sd: (5 + 4 * i, 55 + 6 * i, -10, -25),
                          {"Head": (14, -6, -10), "Neck": (8, 0, 0), "Chest": (10, 0, 0), "Spine": (6, 0, 0),
                           "FaceB": (8, 0, 20), "FaceC": (10, 0, -15), "Hips": {"loc": (0, -0.1, 0)}}),
        "Pose3": arms_all(lambda k, nm, i, sd: (-20 - 4 * i, -12, -25 * (1 if k % 2 else -1), 30 * (1 if k % 3 else -1)),
                          {"Head": (6, 26, -32), "Chest": (0, 8, 22), "Spine": (0, 6, 8), "FaceB": (0, -15, -25),
                           "FaceC": (-6, 10, 25), "Tongue": (-20, 0, -25), "Hips": {"loc": (0.04, 0, -0.02)}}),
        "Pose4": arms_all(lambda k, nm, i, sd: (-8 + 6 * i, 85, 45, 50),
                          {"Head": (24, -10, 6), "Neck": (12, 0, 0), "Chest": (14, 0, -6), "Spine": (8, 0, 0),
                           "FaceB": (14, 0, 25), "FaceC": (-18, 0, -20), "Tongue": (30, 0, 0)}),
    }

    def walk(f):
        p = f / 42.0 * T
        out = {"Hips": {"rot": (2 * math.sin(2 * p), 2 * math.sin(p), 4 * math.sin(p)),
                        "loc": (0.015 * math.sin(p), -0.04 * math.sin(2 * p), 0.01 * abs(math.sin(p)))},
               "Spine": (5 + 3 * math.sin(2 * p + 1), -3 * math.sin(p), -4 * math.sin(p)),
               "Chest": (4 + 2 * math.sin(2 * p + 1.5), 0, -4 * math.sin(p)),
               "Head": (-5 + 5 * math.sin(2 * p + 2), 8 * math.sin(p), 6 * math.sin(p)),
               "FaceB": (4 * math.sin(2 * p), 0, 6 * math.sin(p + 1)), "FaceC": (4 * math.sin(2 * p + 2), 0, 0),
               "Tongue": (12 * math.sin(2 * p + 1), 0, 20 * math.sin(p)), "Hair": (5 * math.sin(2 * p + 2), 0, 5 * math.sin(p)),
               "CoilA0": (3 * math.sin(2 * p), 0, 3 * math.sin(p)), "CoilB0": (3 * math.sin(2 * p + 1), 0, 4 * math.sin(p + 1)),
               "CoilB1": (3 * math.sin(2 * p + 2), 0, 4 * math.sin(p + 2))}

        def gait(k, nm, i, sd):
            q = p + (0 if (i + (sd > 0)) % 2 == 0 else math.pi)
            if i >= 2:                                                   # the low arms pull it along
                return (-15 + 30 * max(0.0, math.sin(q)), -35 * math.cos(q), -15 + 20 * max(0.0, math.sin(q)), -20)
            return (10 * math.sin(q), 20 * math.sin(q + 1), 15 * math.sin(2 * p + k), 20 * math.sin(2 * p + k - 1))
        return arms_all(gait, out)

    rear = arms_all(lambda k, nm, i, sd: (35 - 8 * i, -25, 30, 35),
                    {"Hips": {"loc": (0, 0.08, 0.03)}, "Spine": (-8, 0, 0), "Chest": (-12, 0, 0), "Head": (-20, 0, 0),
                     "FaceB": (-12, 0, 0), "FaceC": (-15, 0, 0), "Tongue": (25, 0, 0)})
    strike = arms_all(lambda k, nm, i, sd: (10 - 6 * i, 70, -20, -30),
                      {"Hips": {"loc": (0, -0.34, 0.02)}, "Spine": (16, 0, 0), "Chest": (14, 0, 0), "Head": (-6, 0, 0),
                       "FaceB": (10, 0, 15), "FaceC": (0, 0, -10), "Tongue": (-60, 0, 0)})
    clutch = add(strike, arms_all(lambda k, nm, i, sd: (0, 18, -25, -35), {"Head": (12, 0, 0), "Tongue": (30, 0, 0)}))

    def attack(f):
        return keyed([(0, idle(0)), (8, rear), (15, strike), (20, clutch), (30, clutch)], f)

    clips = [clip5(rig, "Idle", 3.0, idle)] + [clip5(rig, n, 0.5, still(poses[n])) for n in poses] + \
        [clip5(rig, "Walk", 1.4, walk), clip5(rig, "Attack", 1.0, attack)]
    return _finish_entity("entity_echo", rig, clips, [("Idle", 0), ("Pose2", 0), ("Pose4", 0), ("Attack", 18)],
                          view=(0.4, -1.8, 0.3), humanoid=False)


# ========================================================= PEREMPUAN GURITA
def tentacle_geo(mb, pts, u0, u1, rr, lat, mt, seed=0, sucker_to=0.97, spike_to=0.68, curl_from=0.7, segs=8,
                 spikes=True, gn=31):
    """Octopus arm piece: tapered tube, pale sucker rings along the side (inside the curl near the tip) and bony
    spikes along the top. pts span global u0..u1, rr(u) radius, lat = lateral vector (top = tangent x lat)."""
    rnd = random.Random(seed)
    n = len(pts)
    us = [u0 + (u1 - u0) * i / (n - 1) for i in range(n)]
    mb.tube(pts, lambda q: rr(u0 + (u1 - u0) * q), mt["tent"], segs=segs)
    lat = V(lat)
    for i in range(n):
        u = us[i]
        gi = int(round(u * (gn - 1)))
        t = tangent(pts, i)
        upn = t.cross(lat)
        if upn.length < 1e-4:
            continue
        upn.normalize()
        sidev = upn.cross(t).normalized()
        r = rr(u)
        if gi % 2 == 0 and 0.06 < u < sucker_to and i < n - 1:
            if u < curl_from:
                sd = 1 if (gi // 2) % 2 else -1
                dv = (sidev * sd * 0.9 - upn * 0.4).normalized()
            else:
                dv = (upn * 0.9 + sidev * 0.3 * (1 if gi % 4 else -1)).normalized()
            rs = r * 0.55
            x, y, z = ortho(dv, t)
            mb.cyl(rs, rs * 0.7, (0, 0, 0), mt["sucker"], segs=6, M=basis(pts[i] + dv * r * 0.8, x, y, z))
        if spikes and gi % 3 == 1 and 0.05 < u < spike_to and i < n - 1:
            b = pts[i] + upn * r * 0.8
            h = 0.028 * (1 - u) + 0.012
            tip = b + upn * h - t * h * 0.45 + sidev * rnd.uniform(-0.3, 0.3) * h
            mb.tube([b, b.lerp(tip, 0.5) + upn * h * 0.08, tip], lambda q, r=r: r * 0.3 * (1 - 0.85 * q), mt["spike"],
                    segs=4)


def octo_arm(rig, base, a, parent, mt, L=1.0, seed=0, lat=0.06, curl=1.0, n=31, r0=0.066, r1=0.009, twist=0.0):
    """Floor tentacle radiating from the hub at angle a: runs out along the floor, tip curls up and back.
    Joints base, base+'b', base+'c'."""
    rh = V((math.cos(a), math.sin(a), 0))
    th = V((-math.sin(a), math.cos(a), 0))
    prof = [(0.1, 0.3, 0), (0.24, 0.16, 0), (0.42, 0.065, 0.3), (0.62, 0.045, 0.6), (0.8, 0.05, 0.2),
            (0.95, 0.085, -0.4), (1.04, 0.18, -0.6), (1.03, 0.29, -0.2), (0.95, 0.31, 0.3), (0.91, 0.25, 0.5)]
    ctrl = []
    for i, (r, z, l) in enumerate(prof):
        rr_ = r if i < 2 else 0.24 + (r - 0.24) * L
        zz = z if i < 5 else 0.05 + (z - 0.05) * curl
        ctrl.append(rh * rr_ + UP * zz + th * l * lat + th * twist * max(0, i - 4) * 0.03)
    pts, _ = resample(ctrl, n)
    names = [base, base + "b", base + "c"]
    idx = [0, int(0.34 * (n - 1)), int(0.64 * (n - 1)), n - 1]
    rig.joint(names[0], tuple(pts[0]), parent)
    rig.joint(names[1], tuple(pts[idx[1]]), names[0])
    rig.joint(names[2], tuple(pts[idx[2]]), names[1])

    def rr(u):
        return r1 + (r0 - r1) * (1 - u) ** 1.15
    for k in range(3):
        a0, a1 = idx[k], min(n - 1, idx[k + 1] + 1)
        tentacle_geo(rig.mb(names[k]), pts[a0:a1 + 1], a0 / (n - 1), a1 / (n - 1), rr, th, mt, seed=seed + k)
    return names, rh


def vert_column(mb, pts, R, mt, seed=0):
    """Plain vertebral column (no eyes) along pts, processes pointing forward/out."""
    rnd = random.Random(seed)
    for i, p in enumerate(pts):
        t = tangent(pts, i)
        o = (FWD - t * FWD.dot(t)).normalized()
        sv = t.cross(o).normalized()
        r = R * rnd.uniform(0.9, 1.1)
        s = (pts[min(len(pts) - 1, i + 1)] - pts[max(0, i - 1)]).length / (2 if 0 < i < len(pts) - 1 else 1)
        B = basis(p, sv, o, t)
        mb.lathe([(0, -0.46 * s), (0.8 * r, -0.44 * s), (r, -0.3 * s), (1.04 * r, 0), (r, 0.3 * s), (0.8 * r, 0.44 * s),
                  (0, 0.46 * s)], mt["bone"], M=B, segs=8, sx=1.15)
        mb.tube([p + o * r * 0.8, p + o * r * 1.6 - t * r * 0.3], lambda q: r * 0.3 * (1 - 0.5 * q), mt["bone"], segs=4)
        for sd in (-1, 1):
            mb.tube([p + sv * sd * r * 0.9, p + sv * sd * r * 1.55 + o * r * 0.3 - t * r * 0.2],
                    lambda q: r * 0.22 * (1 - 0.4 * q), mt["bone"], segs=4)


def entity_squid():
    UZ = 0.07                                                            # upper body raised over the column
    mt = dict(
        skin=mat("SquidSkin", "#a395ab", rough=0.42), face=mat("SquidFace", "#d8d2d4", rough=0.38),
        vein=mat("SquidVein", "#5d4370", rough=0.4), socket=mat("SquidSocket", "#150a0d", rough=0.6),
        mouth=mat("SquidMouth", "#12040a", rough=0.6, double=True), lip=mat("SquidLip", "#3b1a25", rough=0.3),
        teeth=mat("SquidTeeth", "#c4b493", rough=0.3), hair=mat("SquidHair", "#0b0a0d", rough=0.22, double=True),
        rag=mat("SquidRag", "#1d1c1f", rough=0.9, double=True), gauze=mat("SquidGauze", "#5e5b58", rough=0.9, double=True),
        tent=mat("SquidTent", "#6d5779", rough=0.28), tentd=mat("SquidTentDk", "#47344f", rough=0.3),
        sucker=mat("SquidSucker", "#cdb9ab", rough=0.35), spike=mat("SquidSpike", "#cbbd9e", rough=0.45),
        bone=mat("SquidBone", "#d4c7a6", rough=0.5), flesh=mat("SquidFlesh", "#4f3651", rough=0.35),
        nail=mat("SquidNail", "#231a22", rough=0.35), glint=mat("EmitEyeWet", "#ffffff", rough=0.5, emit="#ffffff",
                                                                   strength=1.2),
    )
    organs = [mat("SquidOrganG", "#6f7a3c", rough=0.2), mat("SquidOrganB", "#3d5068", rough=0.2),
              mat("SquidOrganO", "#b36a2e", rough=0.2), mat("SquidOrganR", "#7a2531", rough=0.2)]
    em = dict(sclera=mat("SquidSclera", "#b3a59b", rough=0.12), iris=mat("SquidIris", "#3a0f12", rough=0.1),
              pupil=mat("SquidPupil", "#030202", rough=0.1))
    rig = Rig()
    J = rig.joint
    J("Hips", (0, 0.03, 0.26))
    J("Spine", (0, 0.03, 0.6), "Hips")
    J("Chest", (0, 0.02, 1.0 + UZ), "Spine")
    J("Neck", (0, -0.08, 1.5 + UZ), "Chest")
    J("Head", (0, -0.13, 1.62 + UZ), "Neck")
    HC = V((0, -0.19, 1.75 + UZ))
    Mh = Matrix.Translation(HC) @ Matrix.Rotation(math.radians(9), 4, "Z") @ Matrix.Rotation(math.radians(-8), 4, "Y") \
        @ Matrix.Rotation(math.radians(-4), 4, "X") @ Matrix.Scale(1.1, 4)
    P = {"ShoulderL": (0.17, -0.09, 1.45 + UZ), "ElbowL": (0.4, -0.14, 1.24 + UZ), "HandL": (0.49, -0.38, 1.03 + UZ),
         "ShoulderR": (-0.17, -0.09, 1.45 + UZ), "ElbowR": (-0.39, -0.31, 1.3 + UZ), "HandR": (-0.5, -0.57, 1.12 + UZ)}
    for sd in "LR":
        J("Shoulder" + sd, P["Shoulder" + sd], "Chest")
        J("Elbow" + sd, P["Elbow" + sd], "Shoulder" + sd)
        J("Hand" + sd, P["Hand" + sd], "Elbow" + sd)
    J("HairL", tuple(Mh @ V((0.06, -0.02, 0.02))), "Head")
    J("HairR", tuple(Mh @ V((-0.06, -0.02, 0.02))), "Head")
    J("HairB", tuple(Mh @ V((0, 0.06, 0.02))), "Head")

    # ---- gaunt torso leaning forward, wrapped in black rags
    m = rig.mb("Chest")
    c0, c1 = V((0, 0.03, 0.97 + UZ)), V((0, -0.1, 1.49 + UZ))
    prof = [(0, 0.098), (0.25, 0.092), (0.55, 0.118), (0.8, 0.128), (0.92, 0.11), (1.0, 0.06)]
    mlimb(m, c0, c1, prof, mt["skin"], segs=16, sx=1.3, sy=0.74, up=FWD)
    sv, nv, dv = ortho(c1 - c0, FWD)
    Mt = basis(c0, sv, nv, dv)
    Lt = (c1 - c0).length

    def tp(x, y, t):
        return Mt @ V((x, y, Lt * t))
    for k in range(4):                                                   # starved ribs at the flanks
        t = 0.2 + 0.1 * k
        for s in (-1, 1):
            m.tube([tp(s * 0.1, -0.05, t + 0.02), tp(s * 0.128, 0.0, t), tp(s * 0.112, 0.055, t - 0.03)],
                   0.006, mt["skin"], segs=4)
    for s in (-1, 1):
        m.tube([tp(s * 0.015, 0.085, 0.95), tp(s * 0.09, 0.082, 0.97), tp(s * 0.17, 0.02, 0.92)], 0.008, mt["skin"],
               segs=5)                                                   # collarbones
        m.sphere((0.045, 0.05, 0.045), P["Shoulder" + ("L" if s > 0 else "R")], mt["skin"], segs=10, rings=6)
    dress = mlimb(m, tp(0, 0, 0.05), tp(0, 0, 0.84), [(0, 0.118), (0.35, 0.115), (0.7, 0.136), (0.9, 0.138), (1.0, 0.13)],
                  mt["rag"], segs=18, sx=1.32, sy=0.8, caps=False, up=FWD)
    cloth_folds(dress, 0, -0.02, 0.01, 7, 0.9, 1.6, seed=8, bottom=True)
    rnd = random.Random(91)
    for f in dress:
        for v in f.verts:
            v.co += V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.004
    for k in range(22):                                                  # ragged hem strips
        a = T * k / 22 + rnd.uniform(-0.1, 0.1)
        top = tp(math.cos(a) * 0.115 * 1.32, math.sin(a) * 0.115 * 0.8, 0.08)
        ln = rnd.uniform(0.08, 0.32)
        out = V((math.cos(a), math.sin(a) * 0.6, 0)).normalized()
        pts = [top + V((0, 0, -ln * q)) + out * (0.01 + 0.03 * q * q) + V((rnd.uniform(-1, 1) * 0.01 * q, 0, 0))
               for q in (0, 0.33, 0.66, 1.0)]
        strand(m, pts, lambda q: 0.05 * (1 - 0.75 * q), out, mt["rag"] if k % 3 else mt["gauze"])
    for k in range(7):                                                   # grey gauze over the chest
        x = -0.1 + 0.035 * k
        top = tp(x * 1.2, -0.11, 0.88 - 0.04 * abs(x) * 4)
        ln = rnd.uniform(0.15, 0.4)
        pts = [top + V((rnd.uniform(-0.01, 0.01), -0.01 - 0.015 * q, -ln * q)) for q in (0, 0.3, 0.65, 1.0)]
        strand(m, pts, lambda q: 0.05 * (1 - 0.6 * q), FWD, mt["gauze"])

    # ---- neck, head, hair
    m = rig.mb("Neck")
    mlimb(m, (0, -0.06, 1.44 + UZ), Mh @ V((0, 0.02, -0.07)), muscle(0, 0.04, 1, 0.036, belly=-0.004), mt["skin"],
          segs=10, up=FWD)
    for s in (-1, 1):
        m.tube([V((s * 0.02, -0.1, 1.47 + UZ)), Mh @ V((s * 0.045, -0.0, -0.06))], 0.008, mt["skin"], segs=5)
    m = rig.mb("Head")
    fn, prm = head_fn(rx=0.07, ry=0.09, rz=0.1, open_=0.85, gaunt=0.09, sock=0.22, mdepth=0.62)
    em_, mw, we = prm

    def fmats(c):
        az, el = angles(c)
        if gauss(az, el, 0, em_, mw, we) > 0.45:
            return mt["mouth"]
        for s in (-1, 1):
            if gauss(az, el, s * 0.42, 0.1, 0.17, 0.12) > 0.55:
                return mt["socket"]
        return None
    surf_mesh(m, fn, mt["face"], Mh, segs=28, rings=20, mats=fmats)
    R3 = Mh.to_3x3()
    for s in (-1, 1):                                                    # sunken black eye hollows, smudged
        c = s * 0.42
        patch_mesh(m, fn, mt["socket"], Mh, c - 0.27, c + 0.27,
                   lambda a, c=c: 0.1 - 0.24 * math.sqrt(max(0.0, 1 - ((a - c) / 0.27) ** 2)) - 0.03 * math.sin(a * 23),
                   lambda a, c=c: 0.1 + 0.15 * math.sqrt(max(0.0, 1 - ((a - c) / 0.27) ** 2)), cols=9, rows=5,
                   scale=1.003)
        surf_fiber(m, fn, Mh, [(c + s * 0.05, -0.08), (c + s * 0.08, -0.3), (c + s * 0.06, -0.5)], 0.003,
                   mt["socket"], lift=0.0005, n=5)                       # dark tear streak
        eye5(m, S(fn, Mh, s * 0.42, 0.1, -0.009), R3 @ sdir(s * 0.05, -0.02), 0.0145, em, lid=mt["socket"],
             lid_open=0.55, segs=10, glint=mt["glint"], iris_r=0.62, up=R3 @ UP)
        for j in range(2):                                               # veins at the temples
            surf_fiber(m, fn, Mh, [(s * (1.0 + 0.2 * j), 0.5), (s * (1.1 + 0.15 * j), 0.2), (s * (1.05 + 0.1 * j), -0.2)],
                       0.0018, mt["vein"], lift=0.0008, n=6)
    mouth_parts(m, fn, Mh, prm, dict(mt, lip=mt["lip"]), scale=1.1, n_up=6, n_lo=5, tooth_r=0.004)
    nose_piece(m, fn, Mh, mt["face"], mt["socket"], scale=1.0)
    cap_mesh(m, fn, mt["hair"], Mh, lambda a: hairline(a, front=0.55) + 0.02)
    hcoll = [(V((0, -0.05, 1.36 + UZ)), 0.15), (V((0.17, -0.09, 1.46 + UZ)), 0.07), (V((-0.17, -0.09, 1.46 + UZ)), 0.07),
             (V((0, -0.1, 1.5 + UZ)), 0.06)]
    for nm, rng, cnt, sd in (("HairL", (0.3, 2.0), 20, 101), ("HairR", (-2.0, -0.3), 20, 102),
                             ("HairB", (1.9, 4.38), 22, 103)):
        roots = scalp_roots(cnt, sd, az_rng=rng, front=0.55)
        roots = [((a + math.pi) % T - math.pi, e) for a, e in roots]
        mm = rig.mb(nm)
        init = (0, 0.4, -1) if nm == "HairB" else ((1 if nm == "HairL" else -1) * 0.5, 0.0, -1)
        grow_hair(mm, roots, Mh, fn, mt["hair"], 14, 0.038, (0, 0.02, -0.7), init, seed=sd, width=(0.03, 0.006),
                  coll=hcoll, noise=0.18)
        grow_hair(mm, roots[:3], Mh, fn, mt["hair"], 13, 0.038, (0, 0.02, -0.7), init, seed=sd + 7, coll=hcoll,
                  tube_r=0.011)

    # ---- long bony arms with clawed hands
    for sd, sx in (("L", 1), ("R", -1)):
        sh, el, ha = V(P["Shoulder" + sd]), V(P["Elbow" + sd]), V(P["Hand" + sd])
        mu, mf = rig.mb("Shoulder" + sd), rig.mb("Elbow" + sd)
        mlimb(mu, sh, el, muscle(0, 0.034, 1, 0.025, belly=0.005, knob=0.004), mt["skin"], segs=10, up=FWD)
        bulk(mu, sh, el, 0.12, V((sx, 0, 0.3)), 0.01, 0.036, 0.06, mt["skin"], segs=10, rings=6)
        mf.sphere((0.02, 0.02, 0.022), el + (el - sh).normalized() * 0.008, mt["skin"], segs=8, rings=5)   # elbow
        mlimb(mf, el, ha, muscle(0, 0.026, 1, 0.017, belly=0.004), mt["skin"], segs=10, up=FWD)
        for k in range(2):
            o = V((sx * 0.012 * (1 - 2 * k), -0.01, 0.008))
            mf.tube([el.lerp(ha, 0.1) + o, el.lerp(ha, 0.5) + o * 1.3 + V((0, -0.008, 0)), ha + o * 0.6], 0.0035,
                    mt["vein"], segs=4)
            mu.tube([sh.lerp(el, 0.2) + o, sh.lerp(el, 0.6) + o * 1.4, el + o], 0.0035, mt["vein"], segs=4)
        for k in range(4):                                               # torn sleeve rags hanging off the arm
            q = 0.15 + 0.2 * k
            top = sh.lerp(el, q) + V((0, 0.0, -0.03))
            ln = 0.1 + 0.06 * ((k * 7) % 3)
            strand(mu, [top, top + V((0.005 * sx, 0.01, -ln * 0.5)), top + V((0.01 * sx, 0.02, -ln))],
                   lambda u: 0.05 * (1 - 0.7 * u), V((sx, 0, 0)), mt["gauze"] if k % 2 else mt["rag"])
        if sd == "L":
            d, n, t = (0.08, -0.45, -1), (0.1, 0.8, -0.3), (-1, -0.2, 0)
        else:
            d, n, t = (-0.12, -1, -0.35), (0, 0.25, -1), (1, 0, 0)
        hand(rig.mb("Hand" + sd), ha, d, n, t, 0.125, mt["skin"], mt["nail"], curl=0.42, r=0.0062, spread=1.0,
             splay=0.2, bony=1.6, claw=0.026, seed=5 + sx, segs=5)

    # ---- lower body: exposed spine, coloured organs, wrapping tentacles
    m = rig.mb("Spine")
    core = mlimb(m, (0, 0.04, 0.3), (0, 0.03, 1.02 + UZ), [(0, 0.13), (0.4, 0.105), (0.75, 0.11), (1, 0.11)],
                 mt["flesh"], segs=12, sx=1.15, up=FWD)
    cloth_folds(core, 0, 0.03, 0.012, 5, 0.3, 1.1, seed=4)
    col, _ = resample([(0.03, -0.1, 0.34), (0.04, -0.115, 0.55), (0.025, -0.11, 0.8), (0.0, -0.09, 1.0 + UZ)], 12)
    vert_column(m, col, 0.032, mt, seed=3)
    rnd = random.Random(17)
    for k in range(16):                                                  # glossy coloured organs
        a = rnd.uniform(-2.6, -0.5) if k % 3 else rnd.uniform(-3.1, 0.3)
        z = rnd.uniform(0.4, 0.95 + UZ)
        r = rnd.uniform(0.026, 0.042)
        c = V((math.cos(a) * 0.135, math.sin(a) * 0.12 + 0.03, z))
        m.sphere((r, r * 0.85, r * 1.3), c, organs[k % 4], segs=8, rings=6, rot=(rnd.uniform(-30, 30), 0, a * 57))
    for k in range(3):                                                   # tentacles wrapped round the column
        a0 = T * k / 3
        pts = []
        for i in range(16):
            q = i / 15
            a = a0 + 2.4 * q * (1 if k % 2 else -1)
            rr = 0.145 + 0.015 * math.sin(q * 9)
            pts.append(V((math.cos(a) * rr * 1.1, math.sin(a) * rr + 0.03, 0.32 + (0.62 + UZ) * q)))
        tentacle_geo(m, pts, 0.15, 0.85, lambda u: 0.042 * (1.1 - 0.5 * u), UP, mt, seed=k, spikes=False,
                     curl_from=2.0, segs=7, gn=16)
    for k in range(9):                                                   # torn flesh at the waist
        a = T * k / 9 + 0.2
        top = V((math.cos(a) * 0.13, math.sin(a) * 0.095 + 0.02, 1.0 + UZ))
        m.tube([top, top + V((math.cos(a) * 0.012, math.sin(a) * 0.01, -0.06)),
                top + V((math.cos(a) * 0.005, math.sin(a) * 0.004, -0.1 - 0.04 * (k % 3)))],
               lambda q: 0.011 * (1 - 0.8 * q), mt["skin"] if k % 2 else mt["flesh"], segs=4)
    m = rig.mb("Hips")
    blob(m, (0, 0.03, 0.1), (0.2, 0.19, 0.17), mt["tentd"], seed=19, amp=0.16, segs=14, rings=8)
    # free tentacles curling up from the hips
    for k, (root, ctrl) in enumerate((((0.1, -0.04, 0.58), [(0.1, -0.04, 0.58), (0.22, -0.1, 0.62), (0.3, -0.12, 0.76),
                                                            (0.28, -0.1, 0.88), (0.22, -0.08, 0.86), (0.23, -0.07, 0.8)]),
                                      ((-0.08, -0.06, 0.42), [(-0.08, -0.06, 0.42), (-0.17, -0.16, 0.4), (-0.24, -0.22, 0.5),
                                                              (-0.25, -0.2, 0.62), (-0.19, -0.18, 0.62), (-0.2, -0.17, 0.56)]))):
        nm = f"BodyTent{k}"
        J(nm, root, "Spine")
        pts, _ = resample(ctrl, 16)
        tentacle_geo(rig.mb(nm), pts, 0.25, 1.0, lambda u: 0.004 + 0.034 * (1 - u), V((0, 1, 0.3)), mt, seed=30 + k,
                     segs=7, curl_from=0.6)
    # ---- eight floor tentacles
    octo = []
    rnd = random.Random(23)
    for i in range(8):
        a = T * i / 8 + 0.2 + rnd.uniform(-0.12, 0.12)
        front = max(0.0, -math.sin(a))
        L = rnd.uniform(0.85, 1.1) * (1.08 if front > 0.5 else 1.0)
        nm, rh = octo_arm(rig, f"Tent{i}", a, "Hips", mt, L=L, seed=40 + i, lat=rnd.uniform(-0.1, 0.1),
                          curl=rnd.uniform(0.8, 1.35), twist=rnd.uniform(-1, 1), r0=0.078)
        octo.append((nm, rh))
    rig.build(auto_smooth=60)
    tri_report(rig)

    # ---------------------------------------------------------------- clips
    def tents(out, fn_):
        for i, (nms, rh) in enumerate(octo):
            A = rh.cross(UP)
            la, lb, lc, sw = fn_(i, rh)
            r = aa(A, la)
            out[nms[0]] = (r[0], r[1], r[2] + sw)
            out[nms[1]] = aa(A, lb)
            out[nms[2]] = aa(A, lc)
        return out

    def idle(f):
        p = f / 78.0 * T
        tw = 1.0 if (f % 39) in (14, 15) else 0.0
        out = {"Hips": {"loc": (0, 0, 0.008 * math.sin(2 * p))},
               "Spine": (2 * math.sin(p), 2 * math.sin(p + 1), 2 * math.sin(p)),
               "Chest": (3 + 2 * math.sin(2 * p), -2 * math.sin(p), 3 * math.sin(p + 0.5)),
               "Neck": (3 * math.sin(2 * p + 1), 0, 4 * math.sin(p)),
               "Head": (4 * math.sin(2 * p) - 10 * tw, 6 * math.sin(p) + 18 * tw, 8 * math.sin(p + 1) - 10 * tw),
               "ShoulderL": (4 * math.sin(p), 0, 3 * math.sin(p + 1)), "ShoulderR": (-4 * math.sin(p), 0, -3 * math.sin(p)),
               "ElbowL": (-4 * math.sin(p + 1), 0, 0), "ElbowR": (4 * math.sin(p + 2), 0, 0),
               "HandL": (12 * math.sin(2 * p), 0, 0), "HandR": (-12 * math.sin(2 * p + 1), 0, 0),
               "HairL": (3 * math.sin(p), 4 * math.sin(p + 1), 0), "HairR": (3 * math.sin(p + 1), -4 * math.sin(p), 0),
               "HairB": (4 * math.sin(p + 2), 0, 0),
               "BodyTent0": (8 * math.sin(2 * p), 6 * math.sin(p), 10 * math.sin(p + 1)),
               "BodyTent1": (6 * math.sin(2 * p + 2), 8 * math.sin(p + 1), -8 * math.sin(p))}
        return tents(out, lambda i, rh: (3 * math.sin(p + i), 6 * math.sin(p + i - 0.8), 14 * math.sin(p + i - 1.6),
                                         3 * math.sin(p * 0.5 + i)))

    def gait(f, n, amp, lean):
        p = f / n * T
        out = {"Hips": {"rot": (0, 3 * amp * math.sin(p), 5 * amp * math.sin(p)),
                        "loc": (0.012 * amp * math.sin(p), -0.03 * amp * math.sin(2 * p), 0.02 * amp * abs(math.sin(p)))},
               "Spine": (lean * 0.5 + 3 * math.sin(2 * p), -4 * amp * math.sin(p), -4 * amp * math.sin(p)),
               "Chest": (lean + 3 * amp * math.sin(2 * p + 1), 3 * amp * math.sin(p), 5 * amp * math.sin(p)),
               "Neck": (-lean * 0.5 + 3 * math.sin(2 * p + 2), 0, -3 * math.sin(p)),
               "Head": (-lean * 0.7 + 5 * amp * math.sin(2 * p + 2), -4 * math.sin(p), -6 * math.sin(p)),
               "HairL": (6 * amp * math.sin(2 * p + 2), 5 * math.sin(p), 0), "HairR": (6 * amp * math.sin(2 * p + 2.4), -5 * math.sin(p), 0),
               "HairB": (8 * amp * math.sin(2 * p + 2.5), 0, 4 * math.sin(p)),
               "BodyTent0": (14 * amp * math.sin(2 * p), 0, 12 * math.sin(p)), "BodyTent1": (12 * amp * math.sin(2 * p + 1), 0, -10 * math.sin(p))}
        for s, ph in (("L", 0.0), ("R", math.pi)):
            q = p + ph
            out["Shoulder" + s] = sym(s, (-lean * 1.5 - 22 * amp * math.sin(q), 0, 6 * math.sin(q)))
            out["Elbow" + s] = (-10 - 12 * amp * max(0.0, math.cos(q)), 0, 0)
            out["Hand" + s] = (20 * amp * math.sin(q + 0.6), 0, 0)

        def tg(i, rh):
            front = -rh.y
            q = p + i * T / 8 * 3
            reach = max(0.0, math.sin(q))
            return (-14 * amp * reach + 3, 10 * amp * math.sin(q - 0.7), 22 * amp * math.sin(q - 1.4) - 6 * amp * reach,
                    18 * amp * math.cos(q) * (0.4 + 0.6 * abs(rh.x)) * (1 if rh.x < 0 else -1) * (1 if front > -0.5 else 0.5))
        return tents(out, tg)

    def walk(f):
        return gait(f, 36, 1.0, 6)

    def run(f):
        return gait(f, 18, 1.5, 16)

    rear = {"Hips": {"loc": (0, 0.06, 0.04)}, "Spine": (-6, 0, 0), "Chest": (-16, 0, 0), "Neck": (-6, 0, 0),
            "Head": (-14, 0, 0), "ShoulderL": (-105, 0, 25), "ShoulderR": (-105, 0, -25), "ElbowL": (-30, 0, 0),
            "ElbowR": (-30, 0, 0), "HandL": (-25, 0, 0), "HandR": (-25, 0, 0), "BodyTent0": (-20, 0, 0),
            "BodyTent1": (-15, 0, 0), "HairB": (-10, 0, 0)}
    lunge = {"Hips": {"loc": (0, -0.42, 0.05)}, "Spine": (16, 0, 0), "Chest": (22, 0, 0), "Neck": (-10, 0, 0),
             "Head": (-16, 0, 0), "ShoulderL": (-70, 0, -15), "ShoulderR": (-70, 0, 15), "ElbowL": (-5, 0, 0),
             "ElbowR": (-5, 0, 0), "HandL": (-20, 0, 0), "HandR": (-20, 0, 0), "BodyTent0": (25, 0, 0),
             "BodyTent1": (25, 0, 0), "HairL": (12, 0, 0), "HairR": (12, 0, 0), "HairB": (16, 0, 0)}
    tents(rear, lambda i, rh: (-8 if rh.y < 0 else 2, 10, 20, 0))
    tents(lunge, lambda i, rh: (-22 if rh.y < 0 else 4, -10, -15, 0))
    grab = add(lunge, {"ShoulderL": (12, 0, -25), "ShoulderR": (12, 0, 25), "ElbowL": (-45, 0, 0),
                       "ElbowR": (-45, 0, 0), "HandL": (40, 0, 0), "HandR": (40, 0, 0), "Head": (10, 0, 0)})

    def attack(f):
        return keyed([(0, idle(0)), (8, rear), (14, lunge), (19, grab), (30, grab)], f)

    clips = [clip5(rig, "Idle", 2.6, idle), clip5(rig, "Walk", 1.2, walk), clip5(rig, "Run", 0.6, run),
             clip5(rig, "Attack", 1.0, attack)]
    return _finish_entity("entity_squid", rig, clips, [("Idle", 0), ("Walk", 9), ("Attack", 16)],
                          view=(0.7, -1.7, 0.35), humanoid=False)


ASSETS = {
    "entity_weaver": entity_weaver,
    "entity_echo": entity_echo,
    "entity_squid": entity_squid,
}

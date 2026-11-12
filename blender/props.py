"""Static / lightly articulated props."""
import math
import random
from mathutils import Vector, Matrix
import hr_lib as L
from hr_lib import MB, mat

# ------------------------------------------------------------ materials ----
def M(name):
    defs = {
        "Wood": ("#9a6b3f", 0.55, 0.0),
        "WoodDark": ("#5e3d22", 0.6, 0.0),
        "WoodLight": ("#b58a5a", 0.6, 0.0),
        "Steel": ("#a3a9ad", 0.4, 0.5),
        "SteelDark": ("#4a4f53", 0.5, 0.4),
        "Rubber": ("#1c1c1c", 0.85, 0.0),
        "LockerYellow": ("#b8922e", 0.5, 0.3),
        "LockerTeal": ("#4d8a86", 0.52, 0.3),
        "LockerInterior": ("#1b1a17", 0.9, 0.2),
        "Brass": ("#b8964c", 0.35, 0.6),
        "Paper": ("#e9e4d4", 0.85, 0.0),
        "FramePaint": ("#5f6a64", 0.55, 0.3),
        "DoorWood": ("#8f5f36", 0.5, 0.0),
        "DoorSteel": ("#7a8085", 0.45, 0.35),
        "ExitSteel": ("#56625c", 0.5, 0.3),
        "Plate": ("#1d2124", 0.5, 0.2),
        "Plastic": ("#2a2b2d", 0.45, 0.0),
        "Chalkboard": ("#24372c", 0.85, 0.0),
        "ChalkSmudge": ("#2e4336", 0.9, 0.0),
        "Chalk": ("#e6e8df", 0.95, 0.0),
        "Aluminium": ("#b7b9b6", 0.35, 0.5),
        "Felt": ("#2c2a28", 0.95, 0.0),
        "HousingWhite": ("#d9d8cf", 0.5, 0.2),
        "ClockFace": ("#f0ecdf", 0.7, 0.0),
        "Black": ("#111111", 0.5, 0.0),
        "HandRed": ("#a3241b", 0.5, 0.0),
        "BookRed": ("#7d2a22", 0.7, 0.0),
        "BookBlue": ("#2d3e5c", 0.7, 0.0),
        "BookGreen": ("#3e5a3a", 0.7, 0.0),
        "BookTan": ("#b59a68", 0.7, 0.0),
        "BinPlastic": ("#4a5a5a", 0.6, 0.0),
        "BinInside": ("#232a2a", 0.8, 0.0),
        "Stainless": ("#b9bdbd", 0.3, 0.5),
        "Chrome": ("#d6d8d8", 0.18, 0.6),
        "Cardboard": ("#a8804f", 0.85, 0.0),
        "CardboardDark": ("#7d5b35", 0.9, 0.0),
        "Tape": ("#c8b583", 0.35, 0.0),
        "Marker": ("#161616", 0.6, 0.0),
        "PanelGrey": ("#7c827b", 0.5, 0.3),
        "Ceramic": ("#e6e0cf", 0.3, 0.0),
        "HazardYellow": ("#d8b22a", 0.5, 0.0),
        "AppleRed": ("#8f1b16", 0.35, 0.0),
        "SeatTeal": ("#3f6e68", 0.45, 0.0),
        "Glass": ("#9fb3b0", 0.1, 0.0),
    }
    dbl = {"Chalk", "ChalkSmudge", "HousingWhite", "HazardYellow", "Black", "Paper", "Marker"}
    if name == "WireGlass":
        return mat(name, "#8fa8a4", rough=0.08, alpha=0.32)
    if name == "EmitLight":
        return mat(name, "#f2f4e8", rough=0.5, emit="#f2f4e8", strength=3.0)
    if name == "EmitExitSign":
        return mat(name, "#38ff6a", rough=0.5, emit="#38ff6a", strength=4.0, double=True)
    if name == "EmitLockRed":
        return mat(name, "#ff2a1a", rough=0.4, emit="#ff2a1a", strength=3.0)
    if name.startswith("EmitLamp"):
        return mat(name, "#5a0d08", rough=0.3, emit="#c4140a", strength=1.5)
    c, r, m = defs[name]
    return mat(name, c, rough=r, metal=m, double=name in dbl)


# ------------------------------------------------------------ helpers ------
def arc_panel(mb, cx, cy, z0, h, width, radius, thick, material, tilt=0.0, n=8):
    """Curved panel, convex toward +Y, spanning z0..z0+h, tilted about X."""
    span = width / radius
    vs = []
    for i in range(n + 1):
        a = (i / n - 0.5) * span
        for rr in (radius, radius + thick):
            x = cx + rr * math.sin(a)
            y = cy - radius + rr * math.cos(a)
            vs.append((x, y, z0))
            vs.append((x, y, z0 + h))
    fs = []
    for i in range(n):
        b, c = 4 * i, 4 * (i + 1)
        fs += [(b, c, c + 1, b + 1),            # inner
               (b + 2, b + 3, c + 3, c + 2),    # outer
               (b, b + 2, c + 2, c),            # bottom
               (b + 1, c + 1, c + 3, b + 3)]    # top
    e = 4 * n
    fs += [(0, 1, 3, 2), (e, e + 2, e + 3, e + 1)]
    Mt = Matrix.Translation((cx, cy, z0)) @ Matrix.Rotation(math.radians(tilt), 4, "X") @ \
        Matrix.Translation((-cx, -cy, -z0))
    faces = mb.raw(vs, fs, material, smooth=True, M=Mt)
    import bmesh
    bmesh.ops.recalc_face_normals(mb.bm, faces=faces)
    return faces


def chair_geo(mb, y0=0.0, seat_h=0.44, with_legs=True):
    """Student chair centred at (0, y0); occupant faces -Y."""
    wood, steel, rub = M("Wood"), M("Steel"), M("Rubber")
    sw, sd = 0.40, 0.38
    # seat (slightly scooped look via two boxes)
    mb.box((sw, sd, 0.022), (0, y0, seat_h), wood, bevel=0.008, segs=2)
    # backrest: one curved panel wrapping toward the sitter
    arc_panel(mb, 0.0, y0 + sd / 2 + 0.03, seat_h + 0.2, 0.2, 0.40, 0.45, 0.016, wood, tilt=-8)
    if with_legs:
        r = 0.011
        for sx in (-1, 1):
            x = sx * (sw / 2 - 0.03)
            # front leg
            mb.tube([(x, y0 - sd / 2 + 0.04, 0.012), (x, y0 - sd / 2 + 0.05, seat_h - 0.01)],
                    r, steel, segs=8)
            # rear leg continuing up to backrest
            mb.tube([(x, y0 + sd / 2 - 0.02, 0.012), (x, y0 + sd / 2 - 0.01, seat_h - 0.01),
                     (x, y0 + sd / 2 + 0.03, seat_h + 0.22), (x * 0.95, y0 + sd / 2 + 0.035, seat_h + 0.38)],
                    r, steel, segs=8)
            for yy in (y0 - sd / 2 + 0.04, y0 + sd / 2 - 0.02):
                mb.cyl(0.014, 0.024, (x, yy, 0.012), rub, segs=8)
            # side stretcher
            mb.tube([(x, y0 - sd / 2 + 0.045, 0.16), (x, y0 + sd / 2 - 0.015, 0.16)], 0.007, steel, segs=6)
        # under-seat rails
        mb.box((sw - 0.04, 0.02, 0.02), (0, y0 - sd / 2 + 0.05, seat_h - 0.025), steel)
        mb.box((sw - 0.04, 0.02, 0.02), (0, y0 + sd / 2 - 0.02, seat_h - 0.025), steel)


# ------------------------------------------------------------ assets -------
def student_desk():
    mb = MB()
    wood, wdark, steel, sdark, rub = (M("Wood"), M("WoodDark"), M("Steel"),
                                      M("SteelDark"), M("Rubber"))
    dy = -0.30          # desk centre (front part)
    top_h = 0.74
    # tabletop with dark T-mould edge
    mb.box((0.65, 0.5, 0.022), (0, dy, top_h - 0.011 - 0.003), wood, bevel=0.004)
    mb.box((0.656, 0.506, 0.012), (0, dy, top_h - 0.024), wdark, bevel=0.003)
    # book basket under the top (open toward the chair, +Y)
    bz = 0.60
    mb.box((0.56, 0.40, 0.008), (0, dy + 0.02, bz), sdark)                 # floor
    mb.box((0.56, 0.008, 0.10), (0, dy - 0.18, bz + 0.05), sdark)          # front
    for sx in (-1, 1):
        mb.box((0.008, 0.40, 0.10), (sx * 0.28, dy + 0.02, bz + 0.05), sdark)
    # wire lip at the open side
    mb.tube([(-0.28, dy + 0.22, bz + 0.04), (0.28, dy + 0.22, bz + 0.04)], 0.004, steel, segs=6)
    # legs: two U-frames
    for sx in (-1, 1):
        x = sx * 0.27
        mb.tube([(x, dy - 0.2, 0.012), (x, dy - 0.2, top_h - 0.03)], 0.013, steel, segs=8)
        mb.tube([(x, dy + 0.2, 0.012), (x, dy + 0.2, top_h - 0.03)], 0.013, steel, segs=8)
        mb.tube([(x, dy - 0.2, 0.08), (x, dy + 0.2, 0.08)], 0.009, steel, segs=6)
        for yy in (dy - 0.2, dy + 0.2):
            mb.cyl(0.016, 0.024, (x, yy, 0.012), rub, segs=8)
    # connecting bar from desk to chair on the right side (-X), floor level
    mb.tube([(-0.27, dy + 0.2, 0.08), (-0.27, 0.42, 0.08)], 0.011, steel, segs=8)
    mb.tube([(-0.27, 0.2, 0.08), (-0.17, 0.21, 0.08)], 0.009, steel, segs=6)
    chair_geo(mb, y0=0.30)
    ob = mb.obj("StudentDesk")
    return L.finish("student_desk", view=(1.1, -1.4, 0.9))


def teacher_desk():
    mb = MB()
    wood, wdark, steel, paper = M("Wood"), M("WoodDark"), M("Steel"), M("Paper")
    W, D, H = 1.5, 0.75, 0.76
    mb.box((W, D, 0.035), (0, 0, H - 0.0175), wood, bevel=0.006, segs=2)
    # pedestals
    for (x0, x1) in ((-0.72, -0.30), (0.30, 0.72)):
        cx, w = (x0 + x1) / 2, x1 - x0
        mb.box((w, D - 0.04, H - 0.07), (cx, 0, (H - 0.07) / 2 + 0.03), wood, bevel=0.004)
        mb.box((w - 0.02, D - 0.06, 0.03), (cx, 0, 0.015), wdark)          # plinth
    # modesty panel (front, -Y)
    mb.box((0.62, 0.02, 0.45), (0, -D / 2 + 0.04, H - 0.035 - 0.225), wood, bevel=0.003)
    # drawers on the teacher side (+Y)
    yb = D / 2 - 0.02
    def drawer(cx, z, w, h):
        mb.box((w, 0.016, h), (cx, yb + 0.006, z), wdark, bevel=0.004)
        mb.box((0.11, 0.012, 0.014), (cx, yb + 0.024, z + h * 0.15), steel, bevel=0.004)
    for i in range(3):
        drawer(0.51, 0.16 + i * 0.205, 0.38, 0.185)
    drawer(-0.51, 0.585, 0.38, 0.13)
    drawer(-0.51, 0.27, 0.38, 0.4)
    drawer(0.0, 0.665, 0.55, 0.08)
    # props on top
    rnd = random.Random(4)
    top = H
    # stack of books
    cols = [M("BookRed"), M("BookBlue"), M("BookGreen")]
    z = top
    for i, (bw, bd, bh) in enumerate(((0.26, 0.20, 0.035), (0.24, 0.18, 0.03), (0.22, 0.17, 0.04))):
        mb.box((bw, bd, bh), (-0.5, -0.05, z + bh / 2), cols[i], rot=(0, 0, rnd.uniform(-12, 12)), bevel=0.003)
        mb.box((bw - 0.01, bd - 0.012, bh - 0.008), (-0.5 + 0.004, -0.05 + 0.0, z + bh / 2), paper,
               rot=(0, 0, 0))
        z += bh
    # loose papers
    for i in range(4):
        mb.box((0.21, 0.28, 0.0015), (0.05 + rnd.uniform(-0.1, 0.1), 0.05 + rnd.uniform(-0.05, 0.05),
                                      top + 0.001 + i * 0.0016), paper, rot=(0, 0, rnd.uniform(-25, 25)))
    # mug of pencils
    mb.lathe([(0.0, top), (0.04, top), (0.042, top + 0.1), (0.036, top + 0.1), (0.034, top + 0.012),
              (0.0, top + 0.012)], M("SeatTeal"), M=Matrix.Translation((-0.15, 0.22, 0)), segs=14)
    for i in range(3):
        a = i * 2.1
        mb.tube([(-0.15 + math.cos(a) * 0.01, 0.22 + math.sin(a) * 0.01, top + 0.02),
                 (-0.15 + math.cos(a) * 0.03, 0.22 + math.sin(a) * 0.03, top + 0.17)], 0.004,
                M("HazardYellow"), segs=6)
    # apple
    apple = [(0.0, -0.035)] + [(0.04 * math.sin(math.pi * k / 8) * (1 + 0.08 * math.sin(math.pi * k / 4)),
                                -0.036 * math.cos(math.pi * k / 8)) for k in range(1, 8)] + [(0.008, 0.032), (0.0, 0.026)]
    mb.lathe(apple, M("AppleRed"), M=Matrix.Translation((0.5, -0.15, top + 0.036)), segs=14)
    mb.tube([(0.5, -0.15, top + 0.06), (0.503, -0.148, top + 0.085)], 0.003, wdark, segs=5)
    mb.obj("TeacherDesk")
    return L.finish("teacher_desk", view=(1.0, -1.5, 1.0))


def _scribble(rnd, x0, z0, w, h, n=40):
    pts = []
    for k in range(n):
        t = k / (n - 1)
        pts.append((x0 + t * w, z0 + math.sin(t * w * 90 + rnd.uniform(0, .4)) * h * 0.4 +
                    rnd.uniform(-h, h) * 0.25))
    return pts


def chalkboard():
    mb = MB()
    board, smudge, chalk = M("Chalkboard"), M("ChalkSmudge"), M("Chalk")
    alu, felt = M("Aluminium"), M("Felt")
    W, Hh, z0 = 3.2, 1.25, 0.9
    zc = z0 + Hh / 2
    # backing board + surface
    mb.box((W, 0.018, Hh), (0, -0.009, zc), board)
    # aluminium frame
    fw = 0.04
    mb.box((W + 2 * fw, 0.035, fw), (0, -0.0175, z0 + Hh + fw / 2), alu, bevel=0.006)
    mb.box((W + 2 * fw, 0.035, fw), (0, -0.0175, z0 - fw / 2), alu, bevel=0.006)
    for sx in (-1, 1):
        mb.box((fw, 0.035, Hh), (sx * (W / 2 + fw / 2), -0.0175, zc), alu, bevel=0.006)
    # chalk tray
    tz = z0 - fw
    mb.box((W, 0.075, 0.008), (0, -0.0375 - 0.01, tz - 0.004), alu)
    mb.box((W, 0.008, 0.02), (0, -0.08, tz + 0.002), alu, bevel=0.003)
    rnd = random.Random(7)
    ys = -0.0195
    # chalk sticks + eraser
    for i in range(5):
        x = rnd.uniform(-1.3, 1.3)
        mb.cyl(0.0055, rnd.uniform(0.03, 0.08), (x, -0.05, tz + 0.0055), chalk, rot=(0, 90, rnd.uniform(-30, 30)), segs=6)
    mb.box((0.15, 0.05, 0.025), (0.9, -0.048, tz + 0.0125), felt, bevel=0.004)
    mb.box((0.15, 0.05, 0.012), (0.9, -0.048, tz + 0.031), M("WoodLight"), bevel=0.003)
    # smudge patches (slightly lighter green, irregular blobs)
    for i in range(9):
        cx, cz = rnd.uniform(-1.4, 1.4), rnd.uniform(z0 + 0.15, z0 + Hh - 0.15)
        rx, rz = rnd.uniform(0.15, 0.45), rnd.uniform(0.07, 0.2)
        n = 10
        pts = []
        for k in range(n):
            a = 2 * math.pi * k / n
            f = rnd.uniform(0.7, 1.15)
            pts.append((cx + math.cos(a) * rx * f, cz + math.sin(a) * rz * f))
        mb.raw([(p[0], ys + 0.0003 * (i % 3), p[1]) for p in pts], [list(range(n))[::-1]], smudge)
    # wide eraser swipe arcs
    for i in range(3):
        cx, cz = rnd.uniform(-1.0, 1.0), rnd.uniform(z0 + 0.3, z0 + 0.9)
        pts = [(cx + t * 0.9 - 0.45, ys - 0.0012, cz + math.sin(t * math.pi) * 0.12) for t in [k / 12 for k in range(13)]]
        mb.ribbon(pts, 0.09, smudge)
    yc = ys - 0.002
    # written lines: date, faint math, and a message
    mb.text("STAY  IN  YOUR  SEATS", 0.13, chalk, extrude=0.0,
            M=Matrix.Translation((-0.25, yc, z0 + 0.95)) @ Matrix.Rotation(math.radians(1.5), 4, "Y"))
    mb.text("DO NOT LOOK AT THE HALL MONITOR", 0.055, chalk, extrude=0.0,
            M=Matrix.Translation((-0.35, yc, z0 + 0.78)))
    # tally marks block (left)
    for g in range(6):
        for k in range(4):
            x = -1.45 + g * 0.11 + k * 0.018
            mb.ribbon([(x, yc, z0 + 0.42), (x + rnd.uniform(-0.006, 0.006), yc, z0 + 0.52)], 0.005, chalk)
        mb.ribbon([(-1.46 + g * 0.11, yc, z0 + 0.44), (-1.46 + g * 0.11 + 0.075, yc, z0 + 0.5)], 0.005, chalk)
    # squiggly "handwriting" lines right side
    for row in range(4):
        pts = _scribble(rnd, 0.35, z0 + 0.5 - row * 0.09, rnd.uniform(0.5, 0.95), 0.03, n=36)
        mb.ribbon([(p[0], yc, p[1]) for p in pts], 0.006, chalk)
    # a box diagram with arrow (left top)
    sq = [(-1.4, z0 + 1.0), (-1.05, z0 + 1.0), (-1.05, z0 + 0.8), (-1.4, z0 + 0.8), (-1.4, z0 + 1.0)]
    mb.ribbon([(p[0], yc, p[1]) for p in sq], 0.007, chalk)
    mb.ribbon([(-1.0, yc, z0 + 0.9), (-0.72, yc, z0 + 0.88)], 0.007, chalk)
    mb.ribbon([(-0.76, yc, z0 + 0.92), (-0.72, yc, z0 + 0.88), (-0.76, yc, z0 + 0.84)], 0.007, chalk)
    mb.obj("Chalkboard")
    return L.finish("chalkboard", view=(0.35, -1.6, 0.25), wall=True)


# ------------------------------------------------------------- lockers -----
def locker_body(mb, x0, w, d, h, color, interior=True, front_y=None):
    """Locker carcass spanning x in [x0, x0+w], y in [-d/2, d/2]."""
    t = 0.015
    cx = x0 + w / 2
    inside = M("LockerInterior")
    plinth = 0.08
    fy = -d / 2 + 0.02  # front face of carcass (door sits in front of it)
    # plinth
    mb.box((w, d - 0.03, plinth), (cx, 0.0, plinth / 2), M("SteelDark"))
    # sides
    for sx in (0, 1):
        x = x0 + t / 2 + sx * (w - t)
        mb.box((t, d - 0.02, h - plinth), (x, 0.01, plinth + (h - plinth) / 2), color)
    mb.box((w, d - 0.02, t), (cx, 0.01, h - t / 2), color, bevel=0.003)          # top
    mb.box((w - 2 * t, d - 0.02, t), (cx, 0.01, plinth + t / 2), color)           # bottom
    mb.box((w, t, h - plinth), (cx, d / 2 - t / 2, plinth + (h - plinth) / 2), color)  # back
    # front frame strips around opening
    fz0, fz1 = plinth + 0.03, h - 0.03
    mb.box((w, 0.02, 0.03), (cx, fy + 0.01, h - 0.015), color)
    mb.box((w, 0.02, 0.03), (cx, fy + 0.01, plinth + 0.015), color)
    if interior:
        e = 0.002
        iw, idp = w - 2 * t - 2 * e, d - 0.02 - t - 0.02
        icx, icy = cx, (fy + 0.02 + (d / 2 - t)) / 2
        ih = h - plinth - 2 * t
        izc = plinth + t + ih / 2
        mb.box((0.004, idp, ih), (x0 + t + 0.002 + e, icy, izc), inside)
        mb.box((0.004, idp, ih), (x0 + w - t - 0.002 - e, icy, izc), inside)
        mb.box((iw, 0.004, ih), (icx, d / 2 - t - 0.002 - e, izc), inside)
        mb.box((iw, idp, 0.004), (icx, icy, plinth + t + 0.002 + e), inside)
        mb.box((iw, idp, 0.004), (icx, icy, h - t - 0.002 - e), inside)
        # shelf + hook
        mb.box((iw, idp * 0.8, 0.012), (icx, icy + idp * 0.1, 1.72), inside)
        mb.tube([(icx, d / 2 - t - 0.004, 1.6), (icx, d / 2 - t - 0.05, 1.6), (icx, d / 2 - t - 0.06, 1.63)],
                0.005, M("Steel"), segs=6)
    return fy


def door_geo(mb, x0, x1, z0, z1, y_front, color, real_slits=True, dent=None, handle=True,
             number=None, n_slits=5):
    """Locker door panel lying in x[x0,x1], z[z0,z1], front face at y_front,
    thickness extending +Y by 0.02. Slits are real gaps if real_slits."""
    t = 0.02
    yc = y_front + t / 2
    w = x1 - x0
    st = 0.07          # stile width beside slits
    sh, sg = 0.03, 0.04   # slit height, gap between slits
    top_band = 0.07
    slit_top = z1 - top_band
    slit_bot = slit_top - n_slits * sh - (n_slits - 1) * sg
    steel = M("Steel")
    if real_slits:
        # top band, stiles, bars between slits, lower panel
        mb.box((w, t, top_band), (x0 + w / 2, yc, z1 - top_band / 2), color)
        mb.box((st, t, slit_top - slit_bot), (x0 + st / 2, yc, (slit_top + slit_bot) / 2), color)
        mb.box((st, t, slit_top - slit_bot), (x1 - st / 2, yc, (slit_top + slit_bot) / 2), color)
        for i in range(n_slits - 1):
            zt = slit_top - (i + 1) * sh - i * sg
            mb.box((w - 2 * st, t, sg), (x0 + w / 2, yc, zt - sg / 2), color)
        for i in range(n_slits):
            # little stamped hood above each slit (protrudes outward)
            zt = slit_top - i * (sh + sg)
            mb.box((w - 2 * st, 0.002, 0.026), (x0 + w / 2, y_front - 0.008, zt - 0.006), color,
                   rot=(-35, 0, 0))
        lower_top = slit_bot
    else:
        lower_top = z1
        mb.box((w, t, z1 - slit_bot), (x0 + w / 2, yc, (z1 + slit_bot) / 2), color)
        for i in range(n_slits):
            zt = slit_top - i * (sh + sg)
            mb.box((w - 2 * st, 0.004, sh), (x0 + w / 2, y_front - 0.0005, zt - sh / 2), M("LockerInterior"))
            mb.box((w - 2 * st, 0.002, 0.026), (x0 + w / 2, y_front - 0.008, zt - 0.006), color,
                   rot=(-35, 0, 0))
        lower_top = slit_bot
    # lower panel (optionally dented)
    zl0, zl1 = z0, lower_top
    if dent is None:
        mb.box((w, t, zl1 - zl0), (x0 + w / 2, yc, (zl0 + zl1) / 2), color)
    else:
        nx, nz = 10, 24
        dx, dz, dr, depth = dent
        verts, faces = [], []
        for j in range(nz + 1):
            for i in range(nx + 1):
                x = x0 + w * i / nx
                z = zl0 + (zl1 - zl0) * j / nz
                rr = ((x - dx) ** 2 + ((z - dz) * 0.8) ** 2) / dr ** 2
                yy = y_front + depth * math.exp(-rr * 2.5) if rr < 1.5 else y_front
                verts.append((x, yy, z))
        for j in range(nz):
            for i in range(nx):
                a = j * (nx + 1) + i
                faces.append((a, a + 1, a + nx + 2, a + nx + 1))
        mb.raw(verts, faces, color, smooth=True)
        mb.box((w, 0.004, zl1 - zl0), (x0 + w / 2, y_front + t - 0.002, (zl0 + zl1) / 2), color)
    # perimeter folded edge look
    mb.box((w, t + 0.002, 0.012), (x0 + w / 2, yc, z0 + 0.006), color, bevel=0.003)
    if handle:
        hx = x1 - 0.06
        mb.box((0.05, 0.012, 0.16), (hx, y_front - 0.004, 1.02), M("SteelDark"), bevel=0.004)
        mb.box((0.03, 0.022, 0.06), (hx, y_front - 0.012, 1.04), steel, bevel=0.006, segs=2)
    if number is not None:
        mb.box((0.07, 0.004, 0.03), (x0 + w / 2, y_front - 0.002, z1 - 0.035), M("Brass"), bevel=0.002)
    return slit_bot


def school_locker():
    W, D, H = 0.6, 0.55, 1.95
    yel = M("LockerYellow")
    mb = MB()
    fy = locker_body(mb, -W / 2, W, D, H, yel)
    # small vent holes on sides near bottom (dark insets) for detail
    for sx in (-1, 1):
        for k in range(3):
            mb.box((0.003, 0.2, 0.012), (sx * (W / 2 + 0.0005), 0.02, 0.2 + k * 0.025), M("LockerInterior"))
    body = mb.obj("LockerBody")
    # door: hinge at left edge (viewer's left = -X), front face y = -D/2
    dm = MB()
    x0, x1 = -W / 2 + 0.008, W / 2 - 0.008
    y_front = -D / 2
    door_geo(dm, x0, x1, 0.095, H - 0.012, y_front, yel, real_slits=True, number=True)
    # hinge knuckles
    for z in (0.3, 1.0, 1.7):
        dm.cyl(0.008, 0.08, (x0 - 0.002, y_front + 0.004, z), M("Steel"), segs=8)
    hinge = (-W / 2 + 0.004, y_front, 0.0)
    door = dm.obj("Door", origin=hinge, parent=body)
    info = L.finish("school_locker", view=(0.9, -1.6, 0.5), target_z=0.97)
    # extra preview: door open so the slits + interior can be checked
    door.rotation_euler = (0, 0, math.radians(-100))
    L.preview("school_locker_open", view=(0.6, -1.7, 0.45), target_z=0.97)
    return info


def locker_bank():
    W, D, H = 2.4, 0.5, 1.95
    cols = [M("LockerTeal"), M("LockerYellow"), M("LockerTeal"), M("LockerYellow")]
    mb = MB()
    for i in range(4):
        x0 = -W / 2 + i * 0.6
        fy = locker_body(mb, x0, 0.6, D, H, cols[i], interior=False)
        dent = (x0 + 0.36, 0.62, 0.13, 0.022) if i == 2 else None
        door_geo(mb, x0 + 0.01, x0 + 0.59, 0.095, H - 0.012, -D / 2, cols[i], real_slits=False,
                 dent=dent, number=True)
        mb.box((0.56, 0.02, 0.005), (x0 + 0.3, -D / 2 + 0.005, H - 0.0025 - 0.005), cols[i])
    # padlock on locker 2 (index 1)
    px, pz, py = -W / 2 + 0.6 + 0.54, 1.0, -D / 2 - 0.03
    brass, steel = M("Brass"), M("Steel")
    mb.box((0.04, 0.018, 0.045), (px, py - 0.006, pz - 0.035), brass, bevel=0.006, segs=2)
    mb.tube([(px - 0.012, py - 0.006, pz - 0.015)] +
            [(px + math.cos(math.pi * (1 - k / 8)) * 0.012, py - 0.006 + 0.0, pz + 0.005 + math.sin(math.pi * k / 8) * 0.014)
             for k in range(9)] + [(px + 0.012, py - 0.006, pz - 0.015)], 0.0028, steel, segs=6)
    # scuffs / a sticker on locker 4
    mb.box((0.08, 0.002, 0.06), (W / 2 - 0.3 + 0.1, -D / 2 - 0.0015, 1.35), M("Paper"), rot=(0, 12, 0))
    mb.obj("LockerBank")
    return L.finish("locker_bank", view=(0.7, -1.6, 0.4), target_z=0.97)


# --------------------------------------------------------------- doors -----
def door_frame(mb, ow, oh, wall=0.2, paint=None, casing=0.07):
    """Frame lining an opening ow x oh in a wall of thickness `wall`
    centred on y=0. Jambs are 0.05 thick (clear width ow-0.1)."""
    paint = paint or M("FramePaint")
    j = 0.05
    for sx in (-1, 1):
        mb.box((j, wall + 0.004, oh), (sx * (ow / 2 - j / 2), 0, oh / 2), paint)
    mb.box((ow, wall + 0.004, j), (0, 0, oh - j / 2), paint)
    # casings on both faces
    for sy in (-1, 1):
        y = sy * (wall / 2 + 0.008)
        for sx in (-1, 1):
            mb.box((casing, 0.016, oh + casing), (sx * (ow / 2 + casing / 2 - 0.01), y, (oh + casing) / 2),
                   paint, bevel=0.004)
        mb.box((ow + 2 * casing - 0.02, 0.016, casing), (0, y, oh + casing / 2), paint, bevel=0.004)
    # door stop strip
    st = 0.015
    for sx in (-1, 1):
        mb.box((st, 0.03, oh - j), (sx * (ow / 2 - j - st / 2), 0.04, (oh - j) / 2), paint)
    mb.box((ow - 2 * j, 0.03, st), (0, 0.04, oh - j - st / 2), paint)


def lever(mb, x, z, y, side, steel):
    """Lever handle on face at y (side=-1 front, +1 back); lever points -X."""
    mb.cyl(0.03, 0.01, (x, y + side * 0.005, z), steel, rot=(90, 0, 0), segs=16)
    mb.cyl(0.009, 0.05, (x, y + side * 0.03, z), steel, rot=(90, 0, 0), segs=8)
    mb.tube([(x, y + side * 0.055, z), (x - 0.11, y + side * 0.055, z - 0.005), (x - 0.125, y + side * 0.045, z - 0.006)],
            0.009, steel, segs=8)


def leaf_slab(mb, x0, x1, z0, z1, t, material, window=None, kick=True):
    """Door slab with an optional rectangular window hole
    window=(wx0, wx1, wz0, wz1). Slab centred on y=0."""
    if window is None:
        mb.box((x1 - x0, t, z1 - z0), ((x0 + x1) / 2, 0, (z0 + z1) / 2), material, bevel=0.004)
    else:
        wx0, wx1, wz0, wz1 = window
        parts = [(x0, wx0, z0, z1), (wx1, x1, z0, z1), (wx0, wx1, z0, wz0), (wx0, wx1, wz1, z1)]
        for (a, b, c, d) in parts:
            mb.box((b - a, t, d - c), ((a + b) / 2, 0, (c + d) / 2), material)
        # slight edge bevel strips
        mb.box((x1 - x0, t + 0.002, 0.01), ((x0 + x1) / 2, 0, z0 + 0.005), material, bevel=0.003)
        mb.box((x1 - x0, t + 0.002, 0.01), ((x0 + x1) / 2, 0, z1 - 0.005), material, bevel=0.003)


def window_glass(mb, wx0, wx1, wz0, wz1, t, trim, wired=True):
    glass, wire = M("WireGlass"), M("SteelDark")
    mb.box((wx1 - wx0, 0.006, wz1 - wz0), ((wx0 + wx1) / 2, 0, (wz0 + wz1) / 2), glass)
    for sy in (-1, 1):
        y = sy * (t / 2 + 0.004)
        b = 0.015
        mb.box((wx1 - wx0 + 2 * b, 0.008, b), ((wx0 + wx1) / 2, y, wz1 + b / 2), trim, bevel=0.002)
        mb.box((wx1 - wx0 + 2 * b, 0.008, b), ((wx0 + wx1) / 2, y, wz0 - b / 2), trim, bevel=0.002)
        mb.box((b, 0.008, wz1 - wz0), (wx0 - b / 2, y, (wz0 + wz1) / 2), trim, bevel=0.002)
        mb.box((b, 0.008, wz1 - wz0), (wx1 + b / 2, y, (wz0 + wz1) / 2), trim, bevel=0.002)
    if wired:
        g = 0.025 if (wx1 - wx0) < 0.2 else 0.04
        x = wx0 + g
        while x < wx1 - 0.005:
            mb.box((0.0015, 0.0075, wz1 - wz0), (x, 0, (wz0 + wz1) / 2), wire)
            x += g
        z = wz0 + g
        while z < wz1 - 0.005:
            mb.box((wx1 - wx0, 0.0075, 0.0015), ((wx0 + wx1) / 2, 0, z), wire)
            z += g


def _door(name, leaf_mat, locked=False):
    ow, oh = 1.1, 2.2
    frame = MB()
    door_frame(frame, ow, oh, paint=M("FramePaint"))
    # hinge knuckles on the frame side
    for z in (0.25, 1.05, 1.9):
        frame.cyl(0.011, 0.1, (-0.5, -0.0, z), M("Steel"), segs=8)
    fo = frame.obj(name + "Frame")
    lm = MB()
    t = 0.045
    x0, x1, z0, z1 = -0.495, 0.495, 0.01, 2.145
    steel = M("Steel")
    if not locked:
        win = (0.18, 0.32, 1.05, 1.9)
        leaf_slab(lm, x0, x1, z0, z1, t, leaf_mat, window=win)
        window_glass(lm, *win, t, M("SteelDark"))
        # room number plate
        for sy in (-1, 1):
            y = sy * (t / 2 + 0.003)
            lm.box((0.16, 0.006, 0.07), (0.25, y, 1.98 - 0.02 - 0.03 + 0.12 - 0.12), M("Plate"), bevel=0.002)
        plate = Matrix.Translation((0.25, -t / 2 - 0.0065, 1.93))
        lm.text("113", 0.045, M("Paper"), M=plate, extrude=0.0)
    else:
        leaf_slab(lm, x0, x1, z0, z1, t, leaf_mat)
        # raised steel panels
        for (cz, hh) in ((1.55, 0.9), (0.55, 0.7)):
            for sy in (-1, 1):
                lm.box((0.72, 0.006, hh), (0, sy * (t / 2 + 0.002), cz), leaf_mat, bevel=0.004)
        # keypad / lock plate (front)
        y = -t / 2
        lm.box((0.09, 0.012, 0.16), (0.38, y - 0.006, 1.22), M("Plate"), bevel=0.004)
        lm.box((0.06, 0.006, 0.03), (0.38, y - 0.013, 1.27), M("EmitLockRed"), bevel=0.002)
        for r in range(3):
            for c in range(3):
                lm.box((0.014, 0.006, 0.012), (0.36 + c * 0.02, y - 0.013, 1.225 - r * 0.02), steel, bevel=0.002)
        lm.cyl(0.006, 0.006, (0.405, y - 0.014, 1.165), M("EmitLockRed"), rot=(90, 0, 0), segs=8)
        # sign plate
        lm.box((0.36, 0.004, 0.12), (0, y - 0.002, 1.7), M("HazardYellow"), bevel=0.002)
        lm.text("NO ENTRY", 0.05, M("Black"), M=Matrix.Translation((0, y - 0.0045, 1.7)), extrude=0.0)
        # deadbolt cylinder
        lm.cyl(0.02, 0.012, (0.43, y - 0.006, 1.38), steel, rot=(90, 0, 0), segs=12)
    # handles both sides
    for sy in (-1, 1):
        lever(lm, 0.43, 1.0, sy * t / 2, sy, steel)
        lm.box((0.9, 0.003, 0.22), (0, sy * (t / 2 + 0.0015), 0.13), M("Steel"))   # kick plate
    leaf = lm.obj("DoorLeaf", origin=(-0.5, 0.0, 0.0), parent=fo)
    info = L.finish(name.lower() if False else ("door_locked" if locked else "door_classroom"),
                    view=(0.8, -1.7, 0.5), target_z=1.1)
    leaf.rotation_euler = (0, 0, math.radians(55))
    L.preview(("door_locked" if locked else "door_classroom") + "_open", view=(0.9, -1.6, 0.6), target_z=1.1)
    return info


def door_classroom():
    return _door("Door", M("DoorWood"))


def door_locked():
    return _door("Locked", M("DoorSteel"), locked=True)


def exit_door():
    ow, oh = 2.0, 2.4
    paint = M("FramePaint")
    fr = MB()
    door_frame(fr, ow, oh, paint=paint, casing=0.08)
    steel = M("Steel")
    # EXIT sign above (front face of wall, y = -0.1)
    sy0 = -0.1
    sz = 2.68
    fr.box((0.42, 0.06, 0.2), (0, sy0 - 0.03 - 0.016, sz), M("Plastic"), bevel=0.01, segs=2)
    fr.box((0.38, 0.004, 0.16), (0, sy0 - 0.078, sz), M("Black"))
    fr.text("EXIT", 0.11, M("EmitExitSign"), M=Matrix.Translation((0, sy0 - 0.081, sz + 0.004)), extrude=0.0)
    for s in (-1, 1):
        cx = s * 0.165
        fr.raw([(cx - s * 0.0, sy0 - 0.081, sz + 0.03), (cx + s * 0.02, sy0 - 0.081, sz),
                (cx, sy0 - 0.081, sz - 0.03)], [(0, 1, 2) if s < 0 else (2, 1, 0)], M("EmitExitSign"))
    fr.box((0.06, 0.03, 0.03), (0, sy0 - 0.03, sz + 0.115), M("Plastic"))
    # closer arms (static, on the frame head) for detail
    for s in (-1, 1):
        fr.box((0.28, 0.06, 0.06), (s * 0.55, -0.135, 2.3), M("SteelDark"), bevel=0.01)
    fo = fr.obj("ExitFrame")
    leaves = []
    t = 0.05
    for side, nm in ((-1, "LeafL"), (1, "LeafR")):
        lm = MB()
        hx = side * 0.9                     # hinge x
        # leaf spans from hinge toward centre
        a, b = (hx, -0.004) if side < 0 else (0.004, hx)
        lo, hi = min(a, b), max(a, b)
        win = (lo + 0.3, hi - 0.3, 1.45, 1.9)
        leaf_slab(lm, lo, hi, 0.01, 2.295, t, M("ExitSteel"), window=win)
        window_glass(lm, *win, t, M("SteelDark"))
        # push bar (front -Y)
        y = -t / 2
        bx0, bx1 = lo + 0.08, hi - 0.06
        for xx in (bx0, bx1):
            lm.box((0.06, 0.06, 0.09), (xx, y - 0.03, 1.0), M("SteelDark"), bevel=0.01, segs=2)
        lm.box((bx1 - bx0, 0.045, 0.06), ((bx0 + bx1) / 2, y - 0.045, 1.0), steel, bevel=0.012, segs=2)
        lm.box((bx1 - bx0 - 0.06, 0.004, 0.025), ((bx0 + bx1) / 2, y - 0.068, 1.0), M("EmitLockRed")
               if False else M("HazardYellow"))
        # pull handle (back)
        lm.box((0.03, 0.02, 0.3), (lo + 0.15 if side > 0 else hi - 0.15, t / 2 + 0.03, 1.05), steel, bevel=0.008)
        for zz in (0.92, 1.18):
            lm.box((0.02, 0.03, 0.02), (lo + 0.15 if side > 0 else hi - 0.15, t / 2 + 0.015, zz), steel)
        lm.box((hi - lo - 0.04, 0.003, 0.25), ((lo + hi) / 2, -t / 2 - 0.0015, 0.14), steel)
        # hinges
        for z in (0.3, 1.15, 2.0):
            lm.cyl(0.012, 0.12, (hx, -t / 2, z), steel, segs=6)
        leaves.append(lm.obj(nm, origin=(hx, 0.0, 0.0), parent=fo))
    info = L.finish("exit_door", view=(0.6, -1.7, 0.45), target_z=1.3)
    leaves[0].rotation_euler = (0, 0, math.radians(-60))
    leaves[1].rotation_euler = (0, 0, math.radians(60))
    L.preview("exit_door_open", view=(0.6, -1.7, 0.6), target_z=1.3)
    return info


# ---------------------------------------------------------- small props ----
def ceiling_light():
    mb = MB()
    hw, hd, ht = M("HousingWhite"), M("EmitLight"), M("SteelDark")
    W, D, H = 1.2, 0.6, 0.08
    # pan / housing: top plate, sides sloping slightly
    mb.box((W - 0.04, D - 0.04, 0.01), (0, 0, -0.005), hw)
    verts = []
    # sloped side skirt as a lathe-like frame (8 verts top, 8 bottom)
    def rect(w, d, z):
        return [(-w / 2, -d / 2, z), (w / 2, -d / 2, z), (w / 2, d / 2, z), (-w / 2, d / 2, z)]
    top = rect(W - 0.04, D - 0.04, -0.01)
    bot = rect(W, D, -0.07)
    verts = top + bot
    faces = [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)]
    mb.raw(verts, faces, hw)
    # bottom flange frame
    fl = 0.03
    for sy in (-1, 1):
        mb.box((W, fl, 0.012), (0, sy * (D / 2 - fl / 2), -0.074), hw, bevel=0.003)
    for sx in (-1, 1):
        mb.box((fl, D - 2 * fl, 0.012), (sx * (W / 2 - fl / 2), 0, -0.074), hw, bevel=0.003)
    # diffuser panels (recessed a few mm above the flange)
    mb.box((W - 2 * fl, D - 2 * fl, 0.004), (0, 0, -0.068), hd)
    # centre spine and cross bars
    mb.box((W - 2 * fl, 0.02, 0.008), (0, 0, -0.074), hw, bevel=0.002)
    for x in (-0.3, 0.3):
        mb.box((0.012, D - 2 * fl, 0.006), (x, 0, -0.073), hw)
    # dead insects silhouette smudges inside the diffuser
    rnd = random.Random(3)
    for i in range(5):
        mb.box((0.02, 0.01, 0.001), (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.25, 0.25), -0.0705), ht,
               rot=(0, 0, rnd.uniform(0, 180)))
    mb.obj("CeilingLight")
    return L.finish("ceiling_light", view=(0.8, -1.2, -1.2), floor=False, target_z=-0.04)


def wall_clock():
    mb = MB()
    R = 0.175
    # rim: revolve around Y (front -Y); build around Z then rotate
    rot = Matrix.Rotation(math.radians(90), 4, "X")   # Z -> -Y
    prof = [(0.0, 0.0), (R - 0.01, 0.0), (R, 0.004), (R + 0.002, 0.03), (R - 0.004, 0.05),
            (R - 0.016, 0.052), (R - 0.02, 0.04), (R - 0.022, 0.03), (0.0, 0.03)]
    mb.lathe(prof, M("Black"), M=rot, segs=32)
    # face disc
    mb.cyl(R - 0.02, 0.004, (0, -0.032, 0), M("ClockFace"), rot=(90, 0, 0), segs=32)
    # ticks
    for k in range(60):
        a = 2 * math.pi * k / 60
        big = k % 5 == 0
        rr = R - 0.04 if big else R - 0.033
        ln = 0.022 if big else 0.007
        wd = 0.006 if big else 0.0018
        mb.box((wd, 0.001, ln), (math.sin(a) * rr, -0.0345, math.cos(a) * rr), M("Black"),
               rot=(0, math.degrees(a), 0))
    for txt, a in (("12", 0), ("3", 90), ("6", 180), ("9", 270)):
        rr = R - 0.072
        mb.text(txt, 0.03, M("Black"), extrude=0.0,
                M=Matrix.Translation((math.sin(math.radians(a)) * rr, -0.035, math.cos(math.radians(a)) * rr - 0.0)))
    # glass cover
    mb.lathe([(0.0, 0.052), (R - 0.018, 0.048), (R - 0.016, 0.046)], M("WireGlass"), M=rot, segs=32, close=False)
    body = mb.obj("ClockBody")
    hm = MB()
    hm.raw([(-0.007, -0.038, -0.02), (0.007, -0.038, -0.02), (0.004, -0.038, 0.075), (0.0, -0.038, 0.085),
            (-0.004, -0.038, 0.075)], [(0, 1, 2, 3, 4)], M("Black"))
    hm.raw([(-0.007, -0.0372, -0.02), (0.007, -0.0372, -0.02), (0.004, -0.0372, 0.075), (0.0, -0.0372, 0.085),
            (-0.004, -0.0372, 0.075)], [(4, 3, 2, 1, 0)], M("Black"))
    hour = hm.obj("HourHand", parent=body)
    mm = MB()
    mm.raw([(-0.005, -0.040, -0.025), (0.005, -0.040, -0.025), (0.0025, -0.040, 0.12), (0.0, -0.040, 0.13),
            (-0.0025, -0.040, 0.12)], [(0, 1, 2, 3, 4)], M("Black"))
    mm.raw([(-0.005, -0.0392, -0.025), (0.005, -0.0392, -0.025), (0.0025, -0.0392, 0.12), (0.0, -0.0392, 0.13),
            (-0.0025, -0.0392, 0.12)], [(4, 3, 2, 1, 0)], M("Black"))
    mm.cyl(0.008, 0.006, (0, -0.041, 0), M("Black"), rot=(90, 0, 0), segs=12)
    minute = mm.obj("MinuteHand", parent=body)
    sm = MB()
    sm.box((0.0016, 0.001, 0.16), (0, -0.0425, 0.045), M("HandRed"))
    sm.cyl(0.005, 0.003, (0, -0.0435, 0), M("HandRed"), rot=(90, 0, 0), segs=10)
    sec = sm.obj("SecondHand", parent=body)
    # set a creepy time for the preview only (3:33)
    hour.rotation_euler = (0, math.radians(3.55 * 30), 0)
    minute.rotation_euler = (0, math.radians(33 * 6), 0)
    sec.rotation_euler = (0, math.radians(200), 0)
    info_pre = None
    L.preview("wall_clock", view=(0.3, -1.6, 0.2), wall=True)
    for o in (hour, minute, sec):
        o.rotation_euler = (0, 0, 0)
    old = L.DO_PREVIEW
    L.DO_PREVIEW = False
    info = L.finish("wall_clock")
    L.DO_PREVIEW = old
    return info


def bookshelf():
    mb = MB()
    wood, wdark = M("Wood"), M("WoodDark")
    W, D, H = 1.2, 0.35, 1.8
    t = 0.022
    for sx in (-1, 1):
        mb.box((t, D, H), (sx * (W / 2 - t / 2), 0, H / 2), wood, bevel=0.003)
    mb.box((W, D, t), (0, 0, H - t / 2), wood, bevel=0.003)
    mb.box((W - 2 * t, D - 0.02, 0.08), (0, -0.01, 0.04), wood)          # kick base
    mb.box((W - 2 * t, 0.008, H - t - 0.08), (0, D / 2 - 0.004, (H - t + 0.08) / 2), wdark)
    shelves = [0.08, 0.44, 0.8, 1.16, 1.5]
    for z in shelves[1:]:
        mb.box((W - 2 * t, D - 0.02, 0.02), (0, -0.01, z), wood)
    rnd = random.Random(11)
    cols = [M("BookRed"), M("BookBlue"), M("BookGreen"), M("BookTan"), M("WoodDark")]
    paper = M("Paper")
    tops = shelves[1:] + [H - t]
    for si, z0 in enumerate(shelves):
        z0 = z0 + (0.04 if si == 0 else 0.01)
        ztop = tops[si] - 0.01
        x = -W / 2 + t + 0.005
        xmax = W / 2 - t - 0.005
        gap_at = rnd.uniform(-0.3, 0.3)
        while x < xmax - 0.02:
            if abs(x - gap_at) < 0.04 and si != 2:
                # gap, then a leaning book
                x += 0.12
                th = rnd.uniform(0.022, 0.035)
                bh = min(rnd.uniform(0.2, 0.27), ztop - z0 - 0.03)
                ang = 18
                mb.box((th, 0.2, bh), (x - 0.05, -0.04, z0 + bh / 2 * math.cos(math.radians(ang)) + 0.015),
                       rnd.choice(cols), rot=(0, -ang, 0))
                gap_at = 99
                continue
            if si == 2 and x > 0.1 and x < 0.45:
                # a horizontal stack
                zz = z0
                for k in range(4):
                    bh = rnd.uniform(0.025, 0.04)
                    mb.box((rnd.uniform(0.24, 0.3), rnd.uniform(0.17, 0.22), bh), (0.27, -0.04, zz + bh / 2),
                           rnd.choice(cols), rot=(0, 0, rnd.uniform(-6, 6)))
                    zz += bh
                x = 0.46
                continue
            th = rnd.uniform(0.02, 0.05)
            bh = min(rnd.uniform(0.18, 0.3), ztop - z0 - 0.005)
            bd = rnd.uniform(0.17, 0.24)
            if x + th > xmax:
                break
            c = rnd.choice(cols)
            mb.box((th, bd, bh), (x + th / 2, -D / 2 + bd / 2 + 0.02 + rnd.uniform(0, 0.02), z0 + bh / 2), c)
            if rnd.random() < 0.35:
                # spine label band
                mb.box((th + 0.001, 0.002, 0.02), (x + th / 2, -D / 2 + 0.019, z0 + bh * 0.75), paper)
            x += th + rnd.uniform(0.0, 0.004)
    mb.obj("Bookshelf")
    return L.finish("bookshelf", view=(0.8, -1.6, 0.5), target_z=0.9)


def trash_bin():
    mb = MB()
    pl, ins = M("BinPlastic"), M("BinInside")
    prof_o = [(0.0, 0.0), (0.15, 0.0), (0.155, 0.01), (0.175, 0.5), (0.182, 0.505), (0.183, 0.525)]
    mb.lathe(prof_o, pl, segs=20, close=False)
    prof_i = [(0.172, 0.525), (0.165, 0.5), (0.145, 0.03), (0.0, 0.03)]
    mb.lathe(prof_i, ins, segs=20, close=False)
    mb.lathe([(0.183, 0.525), (0.172, 0.525)], pl, segs=20, close=False)
    # ribs
    for k in range(4):
        z = 0.12 + k * 0.1
        r = 0.15 + (0.175 - 0.15) * z / 0.5
        mb.cyl(r + 0.004, 0.012, (0, 0, z), pl, segs=20)
    rnd = random.Random(2)
    paper = M("Paper")
    for i in range(5):
        a = rnd.uniform(0, 6.28)
        rr = rnd.uniform(0.0, 0.1)
        m = mb.sphere((0.05, 0.045, 0.04), (math.cos(a) * rr, math.sin(a) * rr, 0.44 + rnd.uniform(0, 0.06)),
                      paper, rot=(rnd.uniform(0, 90), rnd.uniform(0, 90), 0), segs=7, rings=5)
        for f in m:
            for v in f.verts:
                v.co += Vector((rnd.uniform(-.008, .008), rnd.uniform(-.008, .008), rnd.uniform(-.008, .008)))
    mb.obj("TrashBin")
    return L.finish("trash_bin", view=(0.9, -1.4, 1.0))


def water_fountain():
    mb = MB()
    ss, ch = M("Stainless"), M("Chrome")
    dark = M("SteelDark")
    # back splash plate on wall
    mb.box((0.46, 0.012, 0.3), (0, -0.006, 0.93), ss, bevel=0.004)
    # basin: rounded box protruding 0.42
    bz = 0.86
    mb.box((0.42, 0.40, 0.11), (0, -0.212, bz), ss, bevel=0.03, segs=3)
    # recessed bowl
    mb.box((0.34, 0.30, 0.012), (0, -0.215, bz + 0.05), dark, bevel=0.004)
    mb.cyl(0.02, 0.004, (0, -0.2, bz + 0.057), ch, segs=12)            # drain
    # bubbler
    mb.cyl(0.018, 0.04, (0.07, -0.29, bz + 0.075), ch, segs=12)
    mb.sphere((0.02, 0.02, 0.016), (0.07, -0.29, bz + 0.097), ch, segs=12, rings=6)
    mb.cyl(0.008, 0.012, (0.07, -0.29, bz + 0.112), ch, segs=8)
    # push button on front face
    mb.cyl(0.03, 0.02, (0.0, -0.418, bz), ch, rot=(90, 0, 0), segs=16)
    mb.cyl(0.04, 0.008, (0.0, -0.412, bz), ss, rot=(90, 0, 0), segs=16)
    # under-basin shroud/bracket and drain pipe trap
    mb.box((0.3, 0.06, 0.25), (0, -0.03, bz - 0.18), ss, bevel=0.01)
    pipe = [(0, -0.2, bz - 0.06), (0, -0.2, bz - 0.25), (0, -0.17, bz - 0.33), (0, -0.12, bz - 0.33),
            (0, -0.09, bz - 0.27), (0, -0.06, bz - 0.27), (0, -0.0, bz - 0.27)]
    mb.tube(pipe, 0.02, ch, segs=10)
    # wall escutcheon
    mb.cyl(0.04, 0.01, (0, -0.005, bz - 0.27), ch, rot=(90, 0, 0), segs=14)
    mb.obj("WaterFountain")
    return L.finish("water_fountain", view=(1.0, -1.4, 0.6), wall=True, target_z=0.7)


def cardboard_box():
    mb = MB()
    cb, cd, tape, mk = M("Cardboard"), M("CardboardDark"), M("Tape"), M("Marker")
    W, D, H = 0.5, 0.4, 0.34
    t = 0.006
    # walls
    mb.box((W, t, H), (0, -D / 2 + t / 2, H / 2), cb)
    mb.box((W, t, H), (0, D / 2 - t / 2, H / 2), cb)
    mb.box((t, D - 2 * t, H), (-W / 2 + t / 2, 0, H / 2), cb)
    mb.box((t, D - 2 * t, H), (W / 2 - t / 2, 0, H / 2), cb)
    mb.box((W - 2 * t, D - 2 * t, t), (0, 0, t / 2 + 0.05), cd)     # inner false bottom (dark)
    mb.box((W - 0.02, D - 0.02, 0.002), (0, 0, 0.001), cb)
    # flaps: long flaps open at angles, short flaps folded in
    hinge_z = H
    for sy, ang in ((-1, 115), (1, -80)):
        # long flaps hinged on long edges, length D/2
        M_ = Matrix.Translation((0, sy * D / 2, hinge_z)) @ Matrix.Rotation(math.radians(ang), 4, "X")
        mb.box((W - 0.004, D / 2, t), (0, -sy * D / 4, 0), cb if sy < 0 else cd, M=M_)
    for sx, ang in ((-1, -60), (1, 35)):
        M_ = Matrix.Translation((sx * W / 2, 0, hinge_z)) @ Matrix.Rotation(math.radians(ang), 4, "Y")
        mb.box((W / 2 - 0.05, D - 0.01, t), (-sx * (W / 4 - 0.025), 0, 0), cb, M=M_)
    # tape strips on the front
    mb.box((0.07, 0.002, 0.12), (0, -D / 2 - 0.001, H - 0.06), tape)
    mb.box((0.07, 0.002, 0.08), (0, -D / 2 - 0.001, 0.04), tape)
    # marker text
    mb.text("LOST + FOUND", 0.045, mk, extrude=0.0, M=Matrix.Translation((0.0, -D / 2 - 0.0015, H * 0.5)) @
            Matrix.Rotation(math.radians(-3), 4, "Y"))
    mb.obj("CardboardBox")
    return L.finish("cardboard_box", view=(1.0, -1.5, 1.0))


def chair_fallen():
    mb = MB()
    chair_geo(mb, y0=0.0)
    # tipped over onto its side (rests on seat edge, leg ends and backrest edge)
    bm = mb.bm
    import bmesh
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90), 3, "Y"), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(8), 3, "X"), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(30), 3, "Z"), verts=bm.verts)
    ob = mb.obj("ChairFallen")
    # floor/centre the mesh
    import bpy
    bpy.context.view_layer.update()
    mn = Vector((min(v.co.x for v in ob.data.vertices), min(v.co.y for v in ob.data.vertices),
                 min(v.co.z for v in ob.data.vertices)))
    mx = Vector((max(v.co.x for v in ob.data.vertices), max(v.co.y for v in ob.data.vertices), 0))
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    ob.data.transform(Matrix.Translation(-off))
    return L.finish("chair_fallen", view=(1.0, -1.4, 0.9))


def fuse_box():
    mb = MB()
    pg, dark, steel, brass = M("PanelGrey"), M("LockerInterior"), M("Steel"), M("Brass")
    cer = M("Ceramic")
    W, H, D = 0.6, 0.8, 0.15
    z0, z1 = 1.0, 1.8
    zc = (z0 + z1) / 2
    t = 0.012
    yf = -D
    # box shell (open front)
    mb.box((W, t, H), (0, -t / 2, zc), pg)                                     # back
    for sx in (-1, 1):
        mb.box((t, D, H), (sx * (W / 2 - t / 2), -D / 2, zc), pg)
    for sz in (z0 + t / 2, z1 - t / 2):
        mb.box((W, D, t), (0, -D / 2, sz), pg)
    # front lip frame
    lip = 0.03
    for sx in (-1, 1):
        mb.box((lip, 0.01, H), (sx * (W / 2 - lip / 2), yf - 0.005, zc), pg, bevel=0.003)
    for sz in (z0 + lip / 2, z1 - lip / 2):
        mb.box((W, 0.01, lip), (0, yf - 0.005, sz), pg, bevel=0.003)
    # interior dark back plate (mounting board)
    mb.box((W - 2 * t - 0.004, 0.006, H - 2 * t - 0.004), (0, -t - 0.003, zc), dark)
    # fuse sockets (vertical fuses, centre at socket z)
    slot_z = 1.36
    slot_y = -0.075
    xs = (-0.16, 0.0, 0.16)
    for i, x in enumerate(xs):
        mb.box((0.07, 0.05, 0.19), (x, -t - 0.025 - 0.006, slot_z), cer, bevel=0.006)    # ceramic base
        for zz in (slot_z - 0.052, slot_z + 0.052):
            mb.box((0.04, 0.02, 0.018), (x, slot_y + 0.02, zz), brass, bevel=0.003)       # clip blocks
            for sx in (-1, 1):
                mb.box((0.004, 0.024, 0.02), (x + sx * 0.016, slot_y + 0.005, zz), brass)  # clip jaws
        # label plate under each slot
        mb.box((0.06, 0.004, 0.03), (x, -t - 0.058, slot_z - 0.13), M("Paper"))
        mb.text(str(i + 1), 0.022, M("Marker"), extrude=0.0, M=Matrix.Translation((x, -t - 0.0605, slot_z - 0.13)))
        # lamp bezel
        mb.cyl(0.022, 0.012, (x, -t - 0.012, 1.62), steel, rot=(90, 0, 0), segs=14)
    # warning sticker top-left inside
    mb.raw([(-0.06, -t - 0.0065, 1.69), (0.06, -t - 0.0065, 1.69), (0.0, -t - 0.0065, 1.77)], [(2, 1, 0)],
           M("HazardYellow"))
    mb.raw([(-0.006, -t - 0.007, 1.75), (0.012, -t - 0.007, 1.735), (-0.004, -t - 0.007, 1.725),
            (0.008, -t - 0.007, 1.70), (-0.012, -t - 0.007, 1.728), (0.003, -t - 0.007, 1.735)],
           [(5, 4, 3, 2, 1, 0)], M("Black"))
    # open door, hinged on the left, swung ~110 deg
    hx, hy = -W / 2, yf - 0.01
    Md = Matrix.Translation((hx, hy, 0)) @ Matrix.Rotation(math.radians(-110), 4, "Z")
    mb.box((W, 0.012, H), (W / 2, -0.006, zc), pg, bevel=0.003, M=Md)
    mb.box((0.03, 0.02, 0.08), (W - 0.05, -0.02, zc), steel, bevel=0.005, M=Md)
    mb.box((W * 0.5, 0.002, 0.3), (W / 2, 0.0015, zc + 0.1), M("Paper"), M=Md)   # schematic on door inside
    # breaker lever on the right side
    mb.box((0.05, 0.08, 0.14), (W / 2 + 0.025, -D / 2, 1.5), pg, bevel=0.006)
    mb.tube([(W / 2 + 0.05, -D / 2, 1.5), (W / 2 + 0.1, -D / 2, 1.5), (W / 2 + 0.1, -D / 2 - 0.02, 1.62)], 0.009,
            steel, segs=8)
    mb.cyl(0.016, 0.05, (W / 2 + 0.1, -D / 2 - 0.025, 1.645), M("HandRed"), rot=(-10, 0, 0), segs=10)
    # conduit to ceiling
    mb.cyl(0.02, 3.0 - z1, (0.18, -0.03, z1 + (3.0 - z1) / 2), steel, segs=10)
    mb.cyl(0.026, 0.03, (0.18, -0.03, z1 + 0.015), steel, segs=10)
    for zz in (2.2, 2.7):
        mb.box((0.06, 0.03, 0.015), (0.18, -0.02, zz), steel)
    body = mb.obj("FuseBox")
    for i, x in enumerate(xs):
        L.empty(f"Slot{i + 1}", (x, slot_y, slot_z), parent=body, size=0.03)
        lm = MB()
        lm.lathe([(0.0, 0.0), (0.016, 0.0), (0.016, 0.008), (0.012, 0.016), (0.0, 0.02)], M(f"EmitLamp{i + 1}"),
                 M=Matrix.Rotation(math.radians(90), 4, "X"), segs=12)
        lm.obj(f"Lamp{i + 1}", origin=(0, 0, 0), parent=body).location = (x, -t - 0.018, 1.62)
    return L.finish("fuse_box", max_meshes=6, view=(0.8, -1.6, 0.3), wall=True, target_z=1.4)


ASSETS = {
    "student_desk": student_desk,
    "teacher_desk": teacher_desk,
    "chalkboard": chalkboard,
    "school_locker": school_locker,
    "locker_bank": locker_bank,
    "door_classroom": door_classroom,
    "door_locked": door_locked,
    "exit_door": exit_door,
    "ceiling_light": ceiling_light,
    "wall_clock": wall_clock,
    "bookshelf": bookshelf,
    "trash_bin": trash_bin,
    "water_fountain": water_fountain,
    "cardboard_box": cardboard_box,
    "chair_fallen": chair_fallen,
    "fuse_box": fuse_box,
}

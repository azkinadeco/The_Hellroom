"""Batch 3 props: restroom + gymnasium.

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z). Wall-mounted pieces have their origin on the wall plane.
"""
import math
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "StallPaint": ("#a7907a", 0.5, 0.2),
        "StallEdge": ("#6b5a4a", 0.5, 0.3),
        "MirrorSilver": ("#c9cfd0", 0.06, 0.8),
        "Grime": ("#3b3328", 0.95, 0.0),
        "BleacherWood": ("#b8864f", 0.55, 0.0),
        "BleacherFrame": ("#5b6166", 0.5, 0.4),
        "BackboardWhite": ("#e8e6dd", 0.45, 0.0),
        "RimOrange": ("#c4521c", 0.4, 0.4),
        "NetWhite": ("#dcdad2", 0.9, 0.0),
        "PaintRed": ("#8f2a22", 0.6, 0.0),
    }
    if name in extra:
        c, r, mt = extra[name]
        return mat(name, c, rough=r, metal=mt, double=name in ("NetWhite",))
    return M(name)


# ---------------------------------------------------------------- toilet stall
def toilet_stall():
    """Hideable stall 0.95w x 1.4d x 1.95h. Back (+Y) sits against a wall.
    Child `Door` (pivot on the hinge at the left post, front face) swings out
    with negative rotation, same as school_locker. 0.25 m gap under the door
    so the player can see feet passing by."""
    W, D, H = 0.95, 1.4, 1.95
    gap = 0.25
    paint, edge, steel = _m("StallPaint"), _m("StallEdge"), M("Steel")
    mb = MB()
    t = 0.03
    # side partitions (raised off the floor like real stalls)
    for sx in (-1, 1):
        mb.box((t, D, H - gap), (sx * (W / 2 - t / 2), 0, gap + (H - gap) / 2), paint, bevel=0.004)
        # floor feet
        for sy in (-1, 1):
            mb.cyl(0.02, gap, (sx * (W / 2 - t / 2), sy * (D / 2 - 0.08), gap / 2), steel, segs=8)
    # front posts beside the door
    post = 0.16
    for sx in (-1, 1):
        mb.box((post, t, H - 0.05), (sx * (W / 2 - post / 2), -D / 2 + t / 2, (H - 0.05) / 2 + 0.05), paint, bevel=0.004)
    # head rail across the top
    mb.box((W, 0.04, 0.04), (0, -D / 2 + 0.02, H + 0.02), steel, bevel=0.005)
    # toilet bowl + tank against the back
    cer = M("Ceramic")
    mb.cyl(0.19, 0.38, (0, D / 2 - 0.42, 0.19), cer, segs=20, r2=0.15)
    mb.cyl(0.21, 0.03, (0, D / 2 - 0.42, 0.395), cer, segs=20)
    mb.cyl(0.17, 0.02, (0, D / 2 - 0.42, 0.405), _m("Grime"), segs=20)
    mb.box((0.42, 0.18, 0.36), (0, D / 2 - 0.12, 0.62), cer, bevel=0.02)
    mb.box((0.06, 0.02, 0.02), (-0.12, D / 2 - 0.22, 0.76), M("Chrome"))
    # toilet paper roll on the right partition
    mb.cyl(0.055, 0.11, (W / 2 - 0.09, 0.15, 0.7), M("Paper"), rot=(0, 90, 0), segs=14)
    # graffiti scratches on the inside of the left partition
    for k in range(5):
        mb.box((0.002, 0.12 + 0.03 * k, 0.006), (-W / 2 + t + 0.001, -0.1 + 0.05 * k, 1.2 + 0.07 * k), M("Marker"),
               rot=(15 * (k % 2 * 2 - 1), 0, 0))
    body = mb.obj("StallBody")
    # door
    dm = MB()
    x0, x1 = -W / 2 + post + 0.005, W / 2 - post - 0.005
    y_front = -D / 2
    dm.box((x1 - x0, t, H - 0.05 - gap), ((x0 + x1) / 2, y_front + t / 2, gap + (H - 0.05 - gap) / 2), paint, bevel=0.004)
    dm.box((x1 - x0, t * 1.3, 0.02), ((x0 + x1) / 2, y_front + t / 2, gap + 0.01), edge)
    # latch indicator (red = occupied)
    dm.box((0.05, 0.015, 0.03), (x1 - 0.06, y_front - 0.006, 1.05), _m("PaintRed"))
    dm.cyl(0.012, 0.03, (x1 - 0.06, y_front - 0.01, 0.95), steel, rot=(90, 0, 0), segs=8)
    for z in (gap + 0.15, H - 0.25):
        dm.cyl(0.008, 0.08, (x0 - 0.002, y_front + 0.004, z), steel, segs=8)
    door = dm.obj("Door", origin=(x0 - 0.002, y_front, 0.0), parent=body)
    info = L.finish("toilet_stall", budget=3000, view=(1.0, -2.0, 0.6), target_z=1.0)
    door.rotation_euler = (0, 0, math.radians(-95))
    L.preview("toilet_stall_open", view=(0.8, -2.0, 0.5), target_z=1.0)
    return info


# ---------------------------------------------------------------- sink + mirror
def sink_counter():
    """Wall-mounted double sink with a grimy mirror above. 1.6 w.
    Origin on the wall plane at floor level; front = -Y."""
    W, Dp = 1.6, 0.5
    mb = MB()
    cer, chrome = M("Ceramic"), M("Chrome")
    # counter slab + apron
    mb.box((W, Dp, 0.06), (0, -Dp / 2, 0.84), cer, bevel=0.01)
    mb.box((W, 0.03, 0.18), (0, -Dp + 0.015, 0.74), _m("StallPaint"), bevel=0.004)
    for sx in (-0.4, 0.4):
        # bowl (dark inside reads as a basin from above)
        mb.cyl(0.17, 0.012, (sx, -Dp / 2 + 0.02, 0.873), _m("Grime"), segs=20)
        mb.cyl(0.19, 0.15, (sx, -Dp / 2 + 0.02, 0.78), cer, segs=20, r2=0.12)
        # faucet
        mb.cyl(0.015, 0.16, (sx, -0.06, 0.95), chrome, segs=10)
        mb.tube([(sx, -0.06, 1.02), (sx, -0.12, 1.04), (sx, -0.17, 1.0)], 0.012, chrome, segs=8)
        mb.cyl(0.02, 0.02, (sx + 0.07, -0.06, 0.9), chrome, segs=10)
    # pipes under
    for sx in (-0.4, 0.4):
        mb.tube([(sx, -0.25, 0.7), (sx, -0.25, 0.5), (sx, -0.05, 0.45), (sx, -0.01, 0.45)], 0.02, M("Steel"), segs=8)
    # mirror with steel frame and dark grime patches
    mb.box((W - 0.1, 0.02, 0.8), (0, -0.012, 1.55), M("Steel"), bevel=0.005)
    mb.box((W - 0.16, 0.004, 0.74), (0, -0.024, 1.55), _m("MirrorSilver"))
    for (x, z, w, h) in ((-0.5, 1.3, 0.22, 0.12), (0.35, 1.8, 0.3, 0.08), (0.6, 1.25, 0.1, 0.25)):
        mb.box((w, 0.002, h), (x, -0.027, z), _m("Grime"))
    # crack lines across the mirror
    mb.tube([(-0.2, -0.028, 1.9), (-0.05, -0.028, 1.65), (0.1, -0.028, 1.6), (0.32, -0.028, 1.28)], 0.002, M("Black"), segs=4)
    mb.obj("SinkCounter")
    return L.finish("sink_counter", view=(0.8, -1.8, 0.5), target_z=1.1)


# ---------------------------------------------------------------- bleachers
def bleachers():
    """Four-tier wooden bleachers 3.0w x 2.0d x 1.5h. Lowest seat at the front
    (-Y), highest at the back (+Y, against a wall). Origin floor centre."""
    W, D = 3.0, 2.0
    tiers = 4
    wood, frame = _m("BleacherWood"), _m("BleacherFrame")
    mb = MB()
    step = D / tiers
    for i in range(tiers):
        y = -D / 2 + step * (i + 0.5)
        z = 0.4 + i * 0.36
        mb.box((W, step * 0.55, 0.05), (0, y - step * 0.15, z), wood, bevel=0.008)          # seat plank
        mb.box((W, step * 0.35, 0.04), (0, y + step * 0.28, z - 0.18), wood, bevel=0.006)   # foot board
        mb.box((W, 0.02, 0.36), (0, y + step * 0.48, z - 0.18), frame)                      # riser
    # steel stringers
    for sx in (-W / 2 + 0.05, 0, W / 2 - 0.05):
        for i in range(tiers):
            y = -D / 2 + step * (i + 0.5)
            z = 0.4 + i * 0.36
            mb.box((0.05, 0.05, z), (sx, y, z / 2), frame)
        mb.box((0.05, D, 0.05), (sx, 0, 0.03), frame)
    # side rails
    for sx in (-1, 1):
        mb.tube([(sx * W / 2, -D / 2 + 0.1, 0.9), (sx * W / 2, D / 2 - 0.05, 0.4 + (tiers - 1) * 0.36 + 0.5)], 0.02, M("Steel"), segs=8)
    # a forgotten gym bag + scattered papers
    mb.box((0.45, 0.22, 0.2), (0.7, -D / 2 + step * 1.5 - step * 0.15, 0.4 + 0.36 + 0.13), _m("PaintRed"), bevel=0.05)
    mb.box((0.21, 0.28, 0.002), (-0.9, -D / 2 + step * 0.5 - step * 0.15, 0.4 + 0.027), M("Paper"), rot=(0, 0, 20))
    mb.obj("Bleachers")
    return L.finish("bleachers", budget=3000, view=(1.2, -1.8, 0.7), target_z=0.8)


# ---------------------------------------------------------------- basketball hoop
def basketball_hoop():
    """Wall-mounted hoop: backboard 1.2w x 0.8h (z 2.05..2.85), rim at 2.3 m
    (the school ceiling is only 3 m). Origin on the wall plane at floor level,
    front = -Y."""
    mb = MB()
    steel = M("SteelDark")
    # wall brackets
    for sx in (-0.4, 0.4):
        mb.box((0.06, 0.45, 0.06), (sx, -0.225, 2.6), steel)
        mb.tube([(sx, -0.02, 2.2), (sx, -0.42, 2.58)], 0.022, steel, segs=8)
    # backboard + painted target square
    bb_y = -0.47
    mb.box((1.2, 0.03, 0.8), (0, bb_y, 2.45), _m("BackboardWhite"), bevel=0.01)
    for (w, h, x, z) in ((0.6, 0.03, 0, 2.62), (0.6, 0.03, 0, 2.3), (0.03, 0.35, -0.3, 2.46), (0.03, 0.35, 0.3, 2.46)):
        mb.box((w, 0.004, h), (x, bb_y - 0.017, z), _m("PaintRed"))
    mb.box((1.2, 0.035, 0.04), (0, bb_y, 2.05), M("Steel"))
    # rim
    rim_c = (0, bb_y - 0.26, 2.3)
    pts = [(rim_c[0] + math.cos(a) * 0.23, rim_c[1] + math.sin(a) * 0.23, rim_c[2])
           for a in [k * 2 * math.pi / 20 for k in range(21)]]
    mb.tube(pts, 0.011, _m("RimOrange"), segs=6)
    mb.box((0.14, 0.04, 0.03), (0, bb_y - 0.035, 2.3), _m("RimOrange"))
    # torn net: strands hanging down and inwards
    for k in range(12):
        a = k * 2 * math.pi / 12
        if k in (3, 8):
            continue  # missing strands
        x0, y0 = rim_c[0] + math.cos(a) * 0.22, rim_c[1] + math.sin(a) * 0.22
        x1, y1 = rim_c[0] + math.cos(a) * 0.13, rim_c[1] + math.sin(a) * 0.13
        mb.tube([(x0, y0, 2.29), (x1, y1, 2.0 + 0.04 * (k % 3))], 0.004, _m("NetWhite"), segs=4)
    mb.obj("Hoop")
    return L.finish("basketball_hoop", view=(1.0, -1.8, 0.4), target_z=2.2)


ASSETS = {
    "toilet_stall": toilet_stall,
    "sink_counter": sink_counter,
    "bleachers": bleachers,
    "basketball_hoop": basketball_hoop,
}

"""Batch 19 props: variety pass. Many small, cheap objects for every level so
rooms stop looking copy-pasted (school, hospital, detention, mall, pool,
museum and generic clutter).

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z). Wall pieces: back on the wall plane (y = 0), sticking out -Y,
geometry at its real height (the game places them with y = 0). Materials
are single sided and opaque so the game merges each prop into one draw call;
only a few "Emit..." materials (screens, exit sign) add a second one.
"""
import math
import random
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "Navy": ("#27324a", 0.8, 0.0),
        "RedBag": ("#8e2a24", 0.8, 0.0),
        "Olive": ("#5a5f3a", 0.85, 0.0),
        "BagBlack": ("#1e1f22", 0.85, 0.0),
        "Pink": ("#c9768e", 0.7, 0.0),
        "Ocean": ("#2c5f8a", 0.4, 0.0),
        "Land": ("#8a9a5a", 0.6, 0.0),
        "Gold": ("#b8923c", 0.35, 0.7),
        "PianoBlack": ("#151313", 0.25, 0.0),
        "Ivory": ("#ece6d2", 0.35, 0.0),
        "Orange": ("#c8641e", 0.7, 0.0),
        "White": ("#e8e6de", 0.5, 0.0),
        "OffWhite": ("#d6d2c4", 0.55, 0.0),
        "Red": ("#a8261f", 0.45, 0.0),
        "RedDark": ("#5e1714", 0.7, 0.0),
        "Green": ("#2f6a3a", 0.5, 0.0),
        "GreenTank": ("#2c5a3a", 0.4, 0.3),
        "Blue": ("#2c5d9a", 0.45, 0.0),
        "LightBlue": ("#8fb8cf", 0.25, 0.0),
        "Yellow": ("#d9b02a", 0.45, 0.0),
        "Teal": ("#2f7f7a", 0.45, 0.0),
        "Grey": ("#7f8384", 0.6, 0.0),
        "GreyLight": ("#b4b6b2", 0.55, 0.1),
        "Dark": ("#1b1c1d", 0.6, 0.0),
        "Rust": ("#7a4a2c", 0.9, 0.3),
        "Stone": ("#a49d8c", 0.85, 0.0),
        "StoneDark": ("#6e685c", 0.9, 0.0),
        "Bone": ("#d8ccae", 0.75, 0.0),
        "Terracotta": ("#a85a36", 0.8, 0.0),
        "Celadon": ("#8fae9a", 0.3, 0.0),
        "Porcelain": ("#e6e4dc", 0.25, 0.0),
        "Cobalt": ("#2b3f8a", 0.3, 0.0),
        "Paint": ("#3a5a7a", 0.6, 0.0),
        "Leather": ("#3a2a22", 0.6, 0.0),
        "Cushion": ("#4a2c2a", 0.7, 0.0),
        "Fabric": ("#3b4652", 0.9, 0.0),
        "Towel": ("#ecebe4", 0.95, 0.0),
        "TowelBlue": ("#5a8fb8", 0.95, 0.0),
        "Kick1": ("#d84a3a", 0.5, 0.0),
        "Kick2": ("#3a8ad8", 0.5, 0.0),
        "Kick3": ("#e8c23a", 0.5, 0.0),
        "Noodle": ("#4ab86a", 0.5, 0.0),
        "Debris": ("#8a8578", 0.95, 0.0),
        "Tile": ("#d8d4c4", 0.8, 0.0),
        "PaperOld": ("#d9cfb0", 0.9, 0.0),
        "Ink": ("#1a1a1a", 0.7, 0.0),
        "InkRed": ("#8a1a14", 0.6, 0.0),
        "InkGreen": ("#1f5a2c", 0.6, 0.0),
        "InkBlue": ("#1f3a6a", 0.6, 0.0),
        "Poster1": ("#e4d48a", 0.8, 0.0),
        "Poster2": ("#9fc4d0", 0.8, 0.0),
        "Poster3": ("#e8c0a8", 0.8, 0.0),
        "Kraft": ("#b08a5a", 0.85, 0.0),
        "BagWhite": ("#e4e0d4", 0.8, 0.0),
        "Plush1": ("#c87a9a", 0.95, 0.0),
        "Plush2": ("#7ab0c8", 0.95, 0.0),
        "Plush3": ("#d8c060", 0.95, 0.0),
        "Can1": ("#b02a24", 0.4, 0.3),
        "Can2": ("#2a6ab0", 0.4, 0.3),
        "Can3": ("#e0d060", 0.4, 0.3),
        "Jar": ("#a8b89a", 0.3, 0.0),
        "Specimen": ("#8a7a5a", 0.6, 0.0),
        "Clay": ("#9a6a4a", 0.85, 0.0),
    }
    if name == "EmitVend":
        return mat(name, "#d8e8f0", rough=0.5, emit="#c8e0f0", strength=0.7)
    if name == "EmitAtm":
        return mat(name, "#4a7a9a", rough=0.4, emit="#5a9ac8", strength=0.8)
    if name == "EmitExit":
        return mat(name, "#38ff6a", rough=0.5, emit="#38ff6a", strength=3.0)
    if name in extra:
        c, r, mt = extra[name]
        return mat(name, c, rough=r, metal=mt)
    return M(name)


def _chair(mb, x, y, z, steel, wood, rot=0.0, M_=None):
    """Steel-frame school chair with a plywood seat and back, seat top at
    z + 0.45. Faces -Y. Optional extra transform M_ (applied after)."""
    T = L._mat4((x, y, z), (0, 0, rot))
    if M_ is not None:
        T = M_ @ T
    mb.box((0.42, 0.4, 0.025), (0, 0, 0.44), wood, M=T)
    mb.box((0.4, 0.025, 0.22), (0, 0.2, 0.72), wood, M=T)
    for sx in (-0.19, 0.19):
        for sy in (-0.18, 0.18):
            mb.cyl(0.012, 0.44, (sx, sy, 0.22), steel, segs=4, M=T)
        mb.cyl(0.012, 0.42, (sx, 0.19, 0.64), steel, segs=4, M=T)


# =====================================================================
# school
# =====================================================================
def globe_stand():
    """Classroom globe, 0.32 m, on a wooden pedestal stand 1.0 m tall with
    a brass meridian ring, tilted 23 degrees."""
    mb = MB()
    wd, br = M("WoodDark"), _m("Gold")
    mb.lathe([(0.0, 0.0), (0.2, 0.0), (0.2, 0.03), (0.14, 0.05), (0.04, 0.1), (0.035, 0.55), (0.06, 0.6), (0.0, 0.62)], wd, segs=10)
    T = L._mat4((0, 0, 0.82), (23, 0, 0))
    mb.sphere((0.16, 0.16, 0.16), (0, 0, 0), _m("Ocean"), segs=14, rings=8, M=T)
    rnd = random.Random(4)
    for _ in range(6):
        a, b = rnd.uniform(0, 6.28), rnd.uniform(-0.9, 0.9)
        p = (0.155 * math.cos(b) * math.cos(a), 0.155 * math.cos(b) * math.sin(a), 0.155 * math.sin(b))
        mb.sphere((0.06, 0.05, 0.035), p, _m("Land"), segs=6, rings=4,
                  rot=(math.degrees(-b) + 90, 0, math.degrees(a) + 90), M=T)
    pts = [(0.185 * math.sin(t), 0, 0.185 * math.cos(t)) for t in [math.pi * (i / 10) for i in range(11)]]
    mb.tube([(T @ L.Vector(p))[:] for p in pts], 0.008, br, segs=4)
    mb.obj("Globe")
    return L.finish("globe_stand", budget=800, view=(1.2, -1.6, 1.0), target_z=0.6)


def upright_piano():
    """Old upright piano 1.45 wide, 0.58 deep, 1.25 tall, lid closed, the
    fall board open on yellowed keys, a sheet of music on the stand."""
    mb = MB()
    bk, iv = _m("PianoBlack"), _m("Ivory")
    mb.box((1.45, 0.42, 1.25), (0, 0.08, 0.625), bk, bevel=0.01)
    mb.box((1.49, 0.46, 0.04), (0, 0.08, 1.27), bk, bevel=0.008)
    mb.box((1.45, 0.24, 0.06), (0, -0.25, 0.72), bk)           # key bed
    mb.box((1.3, 0.16, 0.03), (0, -0.27, 0.765), iv)            # white keys
    for i in range(18):
        x = -0.6 + i * 1.2 / 17
        if i % 7 in (2, 6):
            continue
        mb.box((0.012, 0.09, 0.022), (x, -0.23, 0.79), bk)
    for sx in (-0.69, 0.69):
        mb.box((0.06, 0.3, 0.8), (sx, -0.2, 0.4), bk)             # cheeks + legs
        mb.box((0.07, 0.07, 0.06), (sx, -0.33, 0.03), bk)
    mb.box((1.3, 0.04, 0.2), (0, -0.14, 0.9), bk)               # fall board
    mb.box((0.5, 0.02, 0.3), (0, -0.12, 1.06), _m("PaperOld"), rot=(-12, 0, 0))
    for x in (-0.08, 0.0, 0.08):
        mb.box((0.03, 0.08, 0.015), (x, -0.16, 0.05), _m("Gold"))
    mb.box((0.9, 0.02, 0.5), (0, -0.135, 0.35), M("WoodDark"))  # lower panel
    mb.obj("Piano")
    # stool
    mb = MB()
    mb.box((0.6, 0.34, 0.06), (0, -0.75, 0.5), bk, bevel=0.01)
    mb.box((0.56, 0.3, 0.03), (0, -0.75, 0.535), _m("Cushion"))
    for sx in (-0.26, 0.26):
        for sy in (-0.88, -0.62):
            mb.cyl(0.02, 0.48, (sx, sy, 0.24), bk, segs=6)
    mb.obj("PianoStool")
    return L.finish("upright_piano", budget=900, view=(1.4, -2.0, 1.1), target_z=0.7)


def bag_pile():
    """Five school backpacks dumped in a heap, 0.9 x 0.7."""
    mb = MB()
    cols = ["Navy", "RedBag", "Olive", "BagBlack", "Pink"]
    rnd = random.Random(11)
    spots = [(-0.22, 0.05, 0.0, 70), (0.2, -0.05, 0.0, 95), (0.0, 0.18, 0.0, 10), (-0.05, -0.05, 0.2, 80), (0.3, 0.2, 0.0, -20)]
    for c, (x, y, z, tilt) in zip(cols, spots):
        T = L._mat4((x, y, z + 0.15), (tilt, 0, rnd.uniform(0, 360)))
        m = _m(c)
        mb.box((0.32, 0.18, 0.4), (0, 0, 0.0), m, bevel=0.05, M=T)
        mb.box((0.26, 0.06, 0.18), (0, -0.11, -0.06), m, bevel=0.025, M=T)      # front pocket
        mb.box((0.3, 0.06, 0.1), (0, 0.01, 0.2), m, bevel=0.03, M=T)            # flap
        for sx in (-0.08, 0.08):
            mb.box((0.04, 0.02, 0.34), (sx, 0.1, 0.0), M("Rubber"), M=T)        # straps
    mb.obj("Bags")
    return L.finish("bag_pile", budget=900, view=(1.0, -1.4, 1.0), target_z=0.2)


def umbrella_stand():
    """Metal bucket umbrella stand with three closed umbrellas, 0.3 across."""
    mb = MB()
    mb.lathe([(0.0, 0.0), (0.13, 0.0), (0.15, 0.45), (0.155, 0.47), (0.14, 0.47), (0.12, 0.02), (0.0, 0.02)], M("SteelDark"), segs=12)
    rnd = random.Random(3)
    for i, c in enumerate(["BagBlack", "RedBag", "Navy"]):
        a = i * 2.1
        x, y = 0.05 * math.cos(a), 0.05 * math.sin(a)
        lean = rnd.uniform(6, 14)
        T = L._mat4((x, y, 0.05), (lean * math.cos(a + 1.5), lean * math.sin(a + 1.5), 0))
        mb.cyl(0.045, 0.62, (0, 0, 0.4), _m(c), r2=0.012, segs=7, M=T)
        mb.cyl(0.006, 0.12, (0, 0, 0.77), M("Steel"), segs=4, M=T)
        pts = [(0, 0, 0.83), (0, 0, 0.9)] + [(0.035 - 0.035 * math.cos(t), 0, 0.9 + 0.035 * math.sin(t)) for t in (0.8, 1.6, 2.4, 3.1)]
        mb.tube([(T @ L.Vector(p))[:] for p in pts], 0.01, M("WoodDark"), segs=4)
    mb.obj("Umbrellas")
    return L.finish("umbrella_stand", budget=600, view=(0.9, -1.4, 0.9), target_z=0.5)


def stacked_chairs():
    """Five school chairs stacked on each other, 0.45 x 0.45, 1.3 m."""
    mb = MB()
    st, wd = M("SteelDark"), M("WoodLight")
    for i in range(5):
        _chair(mb, 0.0, -0.035 * i, i * 0.11, st, wd, rot=(i % 2) * 3.0 - 1.5)
    mb.obj("ChairStack")
    return L.finish("stacked_chairs", budget=1200, view=(1.2, -1.6, 1.0), target_z=0.7)


def projector_cart():
    """Steel AV trolley with an overhead projector on top and a cable."""
    mb = MB()
    st = M("Steel")
    for z in (0.15, 0.72):
        mb.box((0.7, 0.5, 0.025), (0, 0, z), st, bevel=0.006)
    for sx in (-0.33, 0.33):
        for sy in (-0.23, 0.23):
            mb.cyl(0.014, 0.66, (sx, sy, 0.42), st, segs=6)
            mb.cyl(0.035, 0.03, (sx, sy, 0.04), M("Rubber"), rot=(0, 90, 0), segs=8)
    g = _m("GreyLight")
    mb.box((0.42, 0.42, 0.14), (0, 0, 0.805), g, bevel=0.015)
    mb.box((0.34, 0.34, 0.01), (0, 0, 0.88), _m("LightBlue"))
    mb.box((0.04, 0.04, 0.42), (0, 0.19, 1.08), g)
    mb.box((0.16, 0.12, 0.1), (0, 0.13, 1.32), g, bevel=0.01)
    mb.cyl(0.04, 0.06, (0, 0.07, 1.32), M("Black"), rot=(90, 0, 0), segs=10)
    mb.box((0.3, 0.3, 0.16), (0.05, 0.02, 0.24), M("Cardboard"))
    mb.tube([(0.2, 0.2, 0.8), (0.3, 0.26, 0.6), (0.36, 0.2, 0.3), (0.4, 0.0, 0.02), (0.6, -0.2, 0.01)], 0.008, M("Black"), segs=4)
    mb.obj("ProjectorCart")
    return L.finish("projector_cart", budget=700, view=(1.2, -1.6, 1.0), target_z=0.6)


def sports_rack():
    """Steel ball cart 1.0 x 0.5 with basketballs, volleyballs and footballs,
    plus a hoop of skipping rope on the side."""
    mb = MB()
    st = M("Steel")
    for z in (0.12, 0.62):
        mb.box((1.0, 0.5, 0.02), (0, 0, z), st)
    for sx in (-0.48, 0.48):
        for sy in (-0.23, 0.23):
            mb.cyl(0.012, 0.95, (sx, sy, 0.47), st, segs=4)
    for z in (0.35, 0.85):
        for sy in (-0.23, 0.23):
            mb.cyl(0.008, 0.96, (0, sy, z), st, rot=(0, 90, 0), segs=4)
    balls = [("Orange", 0.12), ("White", 0.105), ("Orange", 0.12), ("BagBlack", 0.11)]
    k = 0
    for z0 in (0.13, 0.63):
        for i in range(4):
            c, r = balls[(i + k) % 4]
            mb.sphere((r, r, r), (-0.36 + i * 0.24, (i % 2) * 0.04 - 0.02, z0 + r), _m(c), segs=10, rings=6)
        k += 1
    mb.tube([(0.5, -0.1 + 0.12 * math.cos(t), 0.6 + 0.2 * math.sin(t)) for t in [i * 0.7 for i in range(10)]], 0.008, _m("Red"), segs=4)
    mb.obj("BallCart")
    return L.finish("sports_rack", budget=1300, view=(1.2, -1.8, 1.0), target_z=0.5)


def water_dispenser():
    """Office water dispenser with an upturned 19 l gallon bottle, 0.32 x
    0.32, 1.42 m. Red and blue taps, drip tray, cups."""
    mb = MB()
    w = _m("OffWhite")
    mb.box((0.32, 0.32, 0.95), (0, 0, 0.475), w, bevel=0.015)
    mb.box((0.26, 0.04, 0.24), (0, -0.16, 0.62), _m("Grey"))
    mb.box((0.2, 0.12, 0.02), (0, -0.2, 0.52), M("SteelDark"))
    for x, c in ((-0.06, "Red"), (0.06, "Blue")):
        mb.box((0.04, 0.05, 0.05), (x, -0.19, 0.7), _m(c))
    mb.lathe([(0.0, 0.95), (0.05, 0.95), (0.05, 1.0), (0.13, 1.06), (0.135, 1.36), (0.11, 1.42), (0.0, 1.43)], _m("LightBlue"), segs=12)
    mb.cyl(0.035, 0.12, (0.2, 0.0, 0.8), M("Paper"), r2=0.03, segs=6)
    mb.obj("Dispenser")
    return L.finish("water_dispenser", budget=500, view=(1.0, -1.6, 0.9), target_z=0.7)


def cleaning_cart():
    """Janitor's cart: yellow mop bucket with wringer on castors, a mop
    standing in it, a grey bin bag and spray bottles. 0.9 x 0.45."""
    mb = MB()
    y = M("HazardYellow")
    mb.box((0.9, 0.45, 0.06), (0, 0, 0.1), _m("Grey"), bevel=0.01)
    for sx in (-0.4, 0.4):
        for sy in (-0.18, 0.18):
            mb.cyl(0.035, 0.03, (sx, sy, 0.035), M("Rubber"), rot=(0, 90, 0), segs=8)
    mb.lathe([(0.0, 0.13), (0.15, 0.13), (0.19, 0.45), (0.17, 0.45), (0.0, 0.16)], y, segs=12, M=L._mat4((-0.2, 0, 0)))
    mb.box((0.2, 0.18, 0.18), (-0.2, 0.0, 0.55), _m("Grey"), bevel=0.01)
    mb.cyl(0.014, 1.2, (-0.16, 0.05, 0.85), _m("Blue"), rot=(-6, 8, 0), segs=5)
    mb.cyl(0.07, 0.12, (-0.2, 0.0, 0.42), _m("Debris"), r2=0.1, segs=8)
    mb.sphere((0.2, 0.18, 0.24), (0.22, 0.0, 0.36), _m("Dark"), segs=8, rings=5)
    mb.tube([(-0.45, 0.2, 0.13), (-0.45, 0.2, 0.9), (0.45, 0.2, 0.9), (0.45, 0.2, 0.13)], 0.012, M("SteelDark"), segs=4)
    for x, c in ((0.15, "Blue"), (0.3, "Green")):
        mb.cyl(0.035, 0.18, (x, 0.12, 0.85), _m(c), segs=6)
        mb.box((0.03, 0.05, 0.05), (x, 0.1, 0.96), _m("White"))
    mb.obj("JanitorCart")
    return L.finish("cleaning_cart", budget=800, view=(1.3, -1.8, 1.0), target_z=0.5)


# =====================================================================
# hospital
# =====================================================================
def oxygen_tanks():
    """Two green oxygen cylinders chained on a little two-wheel trolley,
    0.55 wide, 1.35 m."""
    mb = MB()
    st = M("Steel")
    mb.box((0.55, 0.3, 0.03), (0, 0, 0.06), st)
    mb.tube([(-0.27, 0.15, 0.06), (-0.27, 0.17, 1.15), (0.27, 0.17, 1.15), (0.27, 0.15, 0.06)], 0.014, st, segs=5)
    for sx in (-0.24, 0.24):
        mb.cyl(0.08, 0.04, (sx, 0.16, 0.08), M("Rubber"), rot=(0, 90, 0), segs=10)
    for sx in (-0.13, 0.13):
        mb.lathe([(0.0, 0.07), (0.1, 0.07), (0.1, 1.08), (0.08, 1.15), (0.03, 1.18), (0.0, 1.18)], _m("GreenTank"), segs=12, M=L._mat4((sx, 0.02, 0)))
        mb.cyl(0.018, 0.08, (sx, 0.02, 1.22), M("Brass"), segs=6)
        mb.cyl(0.03, 0.02, (sx, -0.02, 1.25), M("ClockFace"), rot=(90, 0, 0), segs=8)
        mb.box((0.1, 0.005, 0.16), (sx, -0.1, 0.75), _m("White"))
    mb.tube([(-0.25, 0.0, 0.8), (0.0, -0.11, 0.82), (0.25, 0.0, 0.8)], 0.006, st, segs=4)
    mb.obj("O2")
    return L.finish("oxygen_tanks", budget=700, view=(1.1, -1.6, 1.0), target_z=0.7)


def crash_cart():
    """Red emergency crash cart 0.75 x 0.5 x 1.0: five drawers with steel
    pulls, a defibrillator and a box of gloves on top, a drip pole."""
    mb = MB()
    r = _m("Red")
    mb.box((0.75, 0.5, 0.88), (0, 0, 0.52), r, bevel=0.015)
    mb.box((0.79, 0.54, 0.03), (0, 0, 0.975), _m("GreyLight"), bevel=0.008)
    for i, h in enumerate((0.1, 0.1, 0.14, 0.18, 0.22)):
        z = 0.92 - sum((0.1, 0.1, 0.14, 0.18, 0.22)[:i]) - h / 2 - 0.02
        mb.box((0.7, 0.01, h - 0.02), (0, -0.252, z), _m("RedDark"))
        mb.box((0.2, 0.025, 0.02), (0, -0.265, z + h / 2 - 0.04), M("Steel"))
    for sx in (-0.33, 0.33):
        for sy in (-0.2, 0.2):
            mb.cyl(0.04, 0.035, (sx, sy, 0.045), M("Rubber"), rot=(0, 90, 0), segs=8)
    mb.box((0.36, 0.26, 0.2), (-0.12, 0.04, 1.09), _m("Dark"), bevel=0.02)
    mb.box((0.14, 0.01, 0.1), (-0.16, -0.091, 1.12), _m("GreyLight"))
    for x in (-0.25, -0.22):
        mb.box((0.06, 0.1, 0.03), (x + 0.2, -0.04, 1.205), _m("Orange"))
    mb.box((0.18, 0.1, 0.1), (0.24, 0.0, 1.04), _m("LightBlue"))
    mb.cyl(0.01, 1.0, (0.35, 0.22, 1.4), M("Steel"), segs=5)
    mb.tube([(-0.12, -0.08, 1.1), (0.05, -0.28, 0.95), (0.2, -0.26, 0.7)], 0.008, M("Black"), segs=4)
    mb.obj("CrashCart")
    return L.finish("crash_cart", budget=700, view=(1.2, -1.6, 1.0), target_z=0.7)


def vending_machine():
    """Drinks vending machine 0.9 x 0.75 x 1.85: lit display window full of
    cans and bottles, selection buttons, coin slot, pick-up flap, a faded
    'MINUMAN DINGIN' header."""
    mb = MB()
    body = _m("Red")
    mb.box((0.9, 0.6, 1.85), (0, 0.075, 0.925), body, bevel=0.02)
    mb.box((0.9, 0.15, 0.58), (0, -0.3, 0.29), body)              # base under the window
    mb.box((0.9, 0.15, 0.23), (0, -0.3, 1.735), body)             # header
    mb.box((0.1, 0.15, 1.04), (-0.4, -0.3, 1.1), body)            # left jamb
    mb.box((0.2, 0.15, 1.04), (0.35, -0.3, 1.1), body)            # button side
    mb.box((0.62, 0.01, 0.12), (-0.05, -0.38, 1.73), _m("White"))
    mb.text("MINUMAN DINGIN", 0.055, _m("RedDark"), M=L._mat4((-0.05, -0.386, 1.73)), extrude=0.0)
    cans = ["Can1", "Can2", "Can3", "White"]
    for row in range(4):
        z = 0.7 + row * 0.25
        mb.box((0.6, 0.14, 0.012), (-0.05, -0.3, z - 0.01), M("Steel"))
        for i in range(6):
            mb.cyl(0.032, 0.11, (-0.3 + i * 0.09, -0.31, z + 0.055), _m(cans[(i + row) % 4]), segs=6)
    mb.box((0.14, 0.01, 0.8), (0.35, -0.38, 1.15), _m("GreyLight"))
    for i in range(6):
        mb.box((0.05, 0.02, 0.04), (0.35, -0.39, 1.45 - i * 0.07), _m("Dark"))
    mb.box((0.03, 0.02, 0.08), (0.35, -0.39, 0.9), M("SteelDark"))
    mb.box((0.5, 0.02, 0.16), (-0.05, -0.38, 0.32), M("Black"))
    mb.obj("VendBody")
    mb = MB()
    mb.box((0.6, 0.01, 1.04), (-0.05, -0.228, 1.1), _m("EmitVend"))
    mb.obj("VendLight")
    return L.finish("vending_machine", budget=1300, view=(1.2, -2.0, 1.2), target_z=1.0)


def specimen_fridge():
    """Lab fridge 0.7 x 0.65 x 1.75 with an open-frame door window: shelves
    of jars with grey things in them, a biohazard label, a temperature log."""
    mb = MB()
    w = _m("OffWhite")
    mb.box((0.7, 0.62, 0.2), (0, 0.01, 0.1), w, bevel=0.01)
    mb.box((0.7, 0.62, 0.15), (0, 0.01, 1.675), w, bevel=0.01)
    for sx in (-0.33, 0.33):
        mb.box((0.04, 0.62, 1.4), (sx, 0.01, 0.9), w)
    mb.box((0.66, 0.04, 1.4), (0, 0.3, 0.9), _m("GreyLight"))
    mb.box((0.62, 0.02, 0.06), (0, -0.31, 1.58), w)
    mb.box((0.62, 0.02, 0.06), (0, -0.31, 0.22), w)
    mb.box((0.03, 0.04, 0.5), (0.27, -0.33, 1.0), M("Steel"))
    for z in (0.5, 0.85, 1.2):
        mb.box((0.62, 0.56, 0.01), (0, 0.02, z), M("Steel"))
        for i in range(4):
            x = -0.22 + i * 0.15
            mb.cyl(0.05, 0.16, (x, 0.0 + (i % 2) * 0.12, z + 0.085), _m("Jar"), segs=6)
            mb.sphere((0.035, 0.035, 0.04), (x, (i % 2) * 0.12, z + 0.07), _m("Specimen"), segs=6, rings=4)
            mb.cyl(0.052, 0.02, (x, (i % 2) * 0.12, z + 0.17), _m("Dark"), segs=6)
    mb.box((0.12, 0.005, 0.12), (-0.2, -0.32, 1.66), M("HazardYellow"), rot=(0, 45, 0))
    mb.box((0.2, 0.005, 0.26), (0.1, -0.324, 1.0), M("Paper"))
    mb.obj("Fridge")
    return L.finish("specimen_fridge", budget=1200, view=(1.2, -2.0, 1.1), target_z=0.9)


def supply_rack():
    """Chrome wire shelving 1.2 x 0.45 x 1.8, four shelves of medical
    supplies: boxes, bottles, rolled bandages, a sagging bag of IV fluid."""
    mb = MB()
    st = M("Chrome")
    for sx in (-0.58, 0.58):
        for sy in (-0.2, 0.2):
            mb.cyl(0.012, 1.8, (sx, sy, 0.9), st, segs=5)
    for z in (0.12, 0.6, 1.1, 1.6):
        mb.box((1.18, 0.42, 0.015), (0, 0, z), st)
    rnd = random.Random(9)
    for z in (0.12, 0.6, 1.1, 1.6):
        x = -0.52
        while x < 0.48:
            k = rnd.random()
            if k < 0.45:
                w, h = rnd.uniform(0.14, 0.24), rnd.uniform(0.1, 0.3)
                mb.box((w, rnd.uniform(0.2, 0.36), h), (x + w / 2, rnd.uniform(-0.04, 0.04), z + h / 2 + 0.008),
                       _m(rnd.choice(["White", "LightBlue", "OffWhite"])), rot=(0, 0, rnd.uniform(-8, 8)))
                x += w + 0.03
            elif k < 0.75:
                for j in range(3):
                    mb.cyl(0.03, 0.16, (x + 0.04 + j * 0.065, -0.08, z + 0.088), _m(rnd.choice(["White", "Blue", "Can3"])), segs=6)
                x += 0.22
            else:
                mb.sphere((0.08, 0.04, 0.11), (x + 0.08, -0.05, z + 0.11), _m("LightBlue"), segs=6, rings=4)
                x += 0.2
    mb.obj("SupplyRack")
    return L.finish("supply_rack", budget=1400, view=(1.2, -2.0, 1.2), target_z=0.9)


def bedside_cabinet():
    """Hospital bedside locker 0.45 x 0.45 x 0.8 with a drawer and a door,
    a jug, a cup and a get-well card on top, and an over-bed table on its
    C-shaped stand beside it."""
    mb = MB()
    w = _m("OffWhite")
    mb.box((0.45, 0.45, 0.78), (0, 0, 0.41), w, bevel=0.012)
    mb.box((0.41, 0.01, 0.16), (0, -0.227, 0.69), _m("GreyLight"))
    mb.box((0.41, 0.01, 0.5), (0, -0.227, 0.3), _m("GreyLight"))
    mb.box((0.12, 0.02, 0.02), (0, -0.24, 0.72), M("Steel"))
    mb.box((0.02, 0.02, 0.1), (0.16, -0.24, 0.4), M("Steel"))
    for sx in (-0.19, 0.19):
        for sy in (-0.19, 0.19):
            mb.cyl(0.025, 0.02, (sx, sy, 0.01), M("Rubber"), segs=6)
    mb.cyl(0.05, 0.18, (-0.1, 0.05, 0.89), _m("LightBlue"), r2=0.04, segs=8)
    mb.cyl(0.035, 0.08, (0.08, -0.05, 0.84), _m("White"), segs=8)
    mb.box((0.1, 0.005, 0.13), (0.12, 0.12, 0.865), _m("Poster3"), rot=(10, 0, 20))
    st = M("Steel")
    mb.box((0.06, 0.5, 0.03), (0.55, 0.0, 0.03), st)
    mb.cyl(0.015, 0.82, (0.55, 0.2, 0.44), st, segs=5)
    mb.box((0.36, 0.7, 0.03), (0.55, -0.05, 0.86), _m("Grey"), bevel=0.008)
    mb.box((0.12, 0.2, 0.02), (0.55, -0.15, 0.885), _m("PaperOld"))
    mb.obj("Bedside")
    return L.finish("bedside_cabinet", budget=600, view=(1.2, -1.7, 1.0), target_z=0.5)


# =====================================================================
# detention
# =====================================================================
def steel_toilet():
    """Prison toilet-sink combo in brushed steel against the wall (+Y):
    seatless bowl, sink in the top of the cabinet, push buttons. 0.6 wide."""
    mb = MB()
    s = M("Stainless")
    mb.box((0.6, 0.3, 1.05), (0, 0.15 - 0.3, 0.525), s, bevel=0.02)
    mb.box((0.36, 0.18, 0.06), (0, -0.21, 1.0), M("SteelDark"))
    mb.lathe([(0.0, 0.0), (0.16, 0.0), (0.2, 0.3), (0.22, 0.42), (0.2, 0.43), (0.15, 0.32), (0.0, 0.3)], s, segs=12, sy=1.25, M=L._mat4((0, -0.48, 0)))
    for x in (-0.12, 0.12):
        mb.cyl(0.025, 0.02, (x, -0.31, 0.85), M("Brass"), rot=(90, 0, 0), segs=8)
    mb.cyl(0.015, 0.08, (0, -0.25, 1.06), s, rot=(60, 0, 0), segs=5)
    mb.cyl(0.06, 0.005, (0, -0.48, 0.31), _m("Rust"), segs=10)
    mb.obj("SteelToilet")
    return L.finish("steel_toilet", budget=500, view=(1.2, -1.6, 1.0), target_z=0.5)


def wall_chains():
    """Steel plate bolted to the wall at 1.9 m with two eye rings and chains
    hanging to a pair of open shackles. Wall piece."""
    mb = MB()
    st, rs = M("SteelDark"), _m("Rust")
    mb.box((0.7, 0.03, 0.18), (0, -0.015, 1.9), st, bevel=0.005)
    for x in (-0.3, -0.1, 0.1, 0.3):
        mb.cyl(0.015, 0.02, (x, -0.035, 1.9), M("Steel"), rot=(90, 0, 0), segs=6)
    for k, x0 in enumerate((-0.2, 0.2)):
        z = 1.84
        for i in range(7):
            r = 0.035
            ang = 90 if i % 2 else 0
            pts = [(r * 0.6 * math.cos(t), 0, r * math.sin(t)) for t in [j * math.pi / 3 for j in range(7)]]
            T = L._mat4((x0 + 0.01 * math.sin(i + k), -0.06, z), (0, 0, ang))
            mb.tube([(T @ L.Vector(p))[:] for p in pts], 0.007, rs if (i + k) % 3 == 0 else st, segs=3, caps=False)
            z -= 0.06
        T = L._mat4((x0, -0.06, z - 0.03))
        pts = [(0.05 * math.cos(t), 0.05 * math.sin(t) * 0.3, -0.05 * math.sin(t) - 0.02) for t in [j * math.pi / 6 for j in range(-1, 8)]]
        mb.tube([(T @ L.Vector(p))[:] for p in pts], 0.012, st, segs=5)
    mb.obj("Chains")
    return L.finish("wall_chains", budget=900, view=(1.0, -2.0, 0.5), target_z=1.6, wall=True)


def intercom_panel():
    """Wall intercom at 1.45 m: steel box with speaker slots, a call
    button, a dead red lamp and a label 'PANGGIL PETUGAS'. Wall piece."""
    mb = MB()
    st = M("PanelGrey")
    mb.box((0.22, 0.05, 0.32), (0, -0.025, 1.45), st, bevel=0.008)
    for i in range(6):
        mb.box((0.12, 0.004, 0.008), (0, -0.052, 1.54 - i * 0.02), M("Black"))
    mb.cyl(0.025, 0.02, (0, -0.058, 1.38), _m("Red"), rot=(90, 0, 0), segs=8)
    mb.cyl(0.01, 0.01, (0.07, -0.054, 1.58), _m("RedDark"), rot=(90, 0, 0), segs=6)
    mb.box((0.26, 0.004, 0.05), (0, -0.003, 1.25), M("Paper"))
    mb.text("PANGGIL PETUGAS", 0.022, _m("Ink"), M=L._mat4((0, -0.006, 1.25)), extrude=0.0)
    mb.cyl(0.012, 1.1, (0.08, -0.012, 2.1), M("SteelDark"), segs=4)
    mb.obj("Intercom")
    return L.finish("intercom_panel", budget=500, view=(0.6, -2.0, 0.3), target_z=1.45, wall=True)


def barred_cabinet():
    """Steel records cabinet 0.9 x 0.45 x 1.6 whose doors are bars, with a
    padlock: files and folders visible behind the bars."""
    mb = MB()
    st = M("SteelDark")
    mb.box((0.9, 0.42, 0.04), (0, 0, 0.02), st)
    mb.box((0.9, 0.42, 0.04), (0, 0, 1.58), st)
    mb.box((0.9, 0.02, 1.6), (0, 0.2, 0.8), st)
    for sx in (-0.44, 0.44):
        mb.box((0.02, 0.42, 1.6), (sx, 0, 0.8), st)
    for z in (0.55, 1.07):
        mb.box((0.86, 0.38, 0.015), (0, 0.01, z), st)
    for i in range(9):
        mb.cyl(0.008, 1.52, (-0.4 + i * 0.1, -0.2, 0.8), M("Steel"), segs=4)
    for z in (0.3, 1.3):
        mb.box((0.88, 0.02, 0.03), (0, -0.2, z), M("Steel"))
    mb.box((0.05, 0.03, 0.06), (0.02, -0.225, 0.8), M("Brass"), bevel=0.008)
    rnd = random.Random(5)
    for z in (0.04, 0.565, 1.085):
        x = -0.4
        while x < 0.38:
            w = rnd.uniform(0.04, 0.09)
            h = rnd.uniform(0.3, 0.44)
            mb.box((w, 0.3, h), (x + w / 2, 0.02, z + h / 2), _m(rnd.choice(["Kraft", "PaperOld", "Navy", "Olive"])), rot=(0, rnd.uniform(-6, 6), 0))
            x += w + 0.01
    mb.obj("BarCabinet")
    return L.finish("barred_cabinet", budget=900, view=(1.2, -2.0, 1.0), target_z=0.8)


def punish_stool():
    """Tall wooden stool in the corner with a paper dunce cap on the seat and
    a cardboard sign on a string: 'SAYA TIDAK AKAN MENGULANGI'."""
    mb = MB()
    wd = M("Wood")
    mb.cyl(0.18, 0.04, (0, 0, 0.78), wd, segs=12)
    for a in range(4):
        t = a * math.pi / 2 + math.pi / 4
        mb.tube([(0.12 * math.cos(t), 0.12 * math.sin(t), 0.77), (0.2 * math.cos(t), 0.2 * math.sin(t), 0.0)], 0.018, wd, segs=4)
    mb.tube([(0.16 * math.cos(t), 0.16 * math.sin(t), 0.28) for t in [i * math.pi / 4 for i in range(9)]], 0.01, wd, segs=4, caps=False)
    mb.cyl(0.12, 0.42, (0, 0, 1.01), M("Paper"), r2=0.0, segs=10)
    mb.box((0.36, 0.006, 0.16), (0, -0.2, 0.62), M("Cardboard"), rot=(8, 0, 0))
    mb.text("SAYA TIDAK AKAN", 0.032, M("Marker"), M=L._mat4((0, -0.212, 0.645), (8, 0, 0)), extrude=0.0)
    mb.text("MENGULANGI", 0.04, M("Marker"), M=L._mat4((0, -0.206, 0.6), (8, 0, 0)), extrude=0.0)
    mb.tube([(-0.15, -0.2, 0.7), (0, -0.17, 0.8), (0.15, -0.2, 0.7)], 0.003, M("Black"), segs=3, caps=False)
    mb.obj("Stool")
    return L.finish("punish_stool", budget=900, view=(1.0, -1.8, 0.8), target_z=0.7)


def file_boxes():
    """Stack of archive boxes, 0.8 x 0.4, labelled with years, one lid off
    and papers spilling."""
    mb = MB()
    rnd = random.Random(21)
    lay = [(-0.2, 0, 0), (0.2, 0, 0), (-0.18, 0, 1), (0.22, 0, 1), (0.0, 0, 2)]
    for i, (x, y, lv) in enumerate(lay):
        c = _m(["Kraft", "OffWhite", "Kraft", "Grey", "Kraft"][i])
        z = lv * 0.3
        rot = rnd.uniform(-8, 8)
        T = L._mat4((x, y, z), (0, 0, rot))
        mb.box((0.38, 0.4, 0.28), (0, 0, 0.14), c, M=T)
        mb.box((0.39, 0.41, 0.04), (0, 0, 0.29), c, M=T)
        mb.box((0.18, 0.005, 0.08), (0, -0.203, 0.15), M("Paper"), M=T)
        mb.box((0.08, 0.006, 0.03), (0, -0.204, 0.23), M("Black"), M=T)
        mb.text(str(1987 + i * 2), 0.04, M("Marker"), M=T @ L._mat4((0, -0.207, 0.15)), extrude=0.0)
    for k in range(5):
        mb.box((0.21, 0.3, 0.003), (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, -0.25), 0.003 + k * 0.002), M("Paper"), rot=(0, 0, rnd.uniform(0, 180)))
    mb.obj("Archive")
    return L.finish("file_boxes", budget=900, view=(1.2, -1.8, 1.0), target_z=0.4)


# =====================================================================
# mall
# =====================================================================
def atm_machine():
    """Free-standing ATM 0.75 x 0.7 x 1.6 in a steel surround with a lit
    blue screen, keypad, card slot, receipt slot and an 'ATM' header."""
    mb = MB()
    b = _m("GreyLight")
    mb.box((0.75, 0.7, 1.6), (0, 0, 0.8), b, bevel=0.02)
    mb.box((0.79, 0.74, 0.34), (0, 0, 1.75), _m("Blue"), bevel=0.02)
    mb.text("ATM", 0.2, _m("White"), M=L._mat4((0, -0.371, 1.72)), extrude=0.0)
    mb.box((0.6, 0.3, 0.06), (0, -0.4, 1.0), M("SteelDark"), rot=(-20, 0, 0))
    mb.box((0.5, 0.06, 0.38), (0, -0.33, 1.3), M("Black"), rot=(12, 0, 0))
    for r in range(4):
        for c in range(3):
            mb.box((0.04, 0.02, 0.03), (-0.1 + c * 0.05, -0.43 - r * 0.012, 1.01 + r * 0.03 - 0.04), M("Steel"), rot=(-20, 0, 0))
    mb.box((0.1, 0.02, 0.012), (0.18, -0.38, 1.12), M("Black"))
    mb.box((0.12, 0.02, 0.012), (0.18, -0.36, 0.86), M("Black"))
    mb.box((0.3, 0.02, 0.08), (0, -0.36, 0.7), M("Black"))
    mb.obj("ATM")
    mb = MB()
    mb.box((0.4, 0.01, 0.28), (0, -0.365, 1.31), _m("EmitAtm"), rot=(12, 0, 0))
    mb.obj("ATMScreen")
    return L.finish("atm_machine", budget=800, view=(1.2, -2.0, 1.2), target_z=1.0)


def potted_palm():
    """Big glazed pot with a tired indoor palm, 0.6 across, 1.9 m."""
    mb = MB()
    mb.lathe([(0.0, 0.0), (0.2, 0.0), (0.3, 0.3), (0.3, 0.55), (0.32, 0.6), (0.28, 0.6), (0.0, 0.56)], _m("Teal"), segs=14)
    mb.cyl(0.27, 0.02, (0, 0, 0.56), M("WoodDark"), segs=12)
    mb.tube([(0, 0, 0.5), (0.03, 0.02, 1.0), (0.05, 0.0, 1.5)], lambda t: 0.05 - 0.02 * t, _m("Leather"), segs=6)
    rnd = random.Random(8)
    for i in range(8):
        a = i * 2 * math.pi / 8 + rnd.uniform(-0.2, 0.2)
        L_ = rnd.uniform(0.6, 0.85)
        droop = rnd.uniform(0.3, 0.6)
        base = (0.05, 0.0, 1.5)
        for j in range(4):
            t0, t1 = j / 4, (j + 1) / 4
            p0 = (base[0] + math.cos(a) * L_ * t0, base[1] + math.sin(a) * L_ * t0, base[2] + 0.3 * t0 - droop * t0 * t0)
            p1 = (base[0] + math.cos(a) * L_ * t1, base[1] + math.sin(a) * L_ * t1, base[2] + 0.3 * t1 - droop * t1 * t1)
            mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2)
            ln = math.dist(p0, p1)
            pitch = math.degrees(math.atan2(p1[2] - p0[2], math.hypot(p1[0] - p0[0], p1[1] - p0[1])))
            w = 0.16 * (1 - t0 * 0.6)
            mb.box((ln, w, 0.012), mid, _m("Olive" if (i + j) % 3 else "Land"), rot=(0, -pitch, math.degrees(a)))
    mb.obj("Palm")
    return L.finish("potted_palm", budget=700, view=(1.2, -1.8, 1.0), target_z=0.9)


def recycle_bins():
    """Row of three sorting bins (yellow/green/red: plastik, organik, B3)
    with swing lids, 1.2 x 0.4 x 0.95."""
    mb = MB()
    for i, (c, t) in enumerate((("Yellow", "ANORGANIK"), ("Green", "ORGANIK"), ("Red", "B3"))):
        x = -0.4 + i * 0.4
        m = _m(c)
        mb.box((0.36, 0.38, 0.82), (x, 0, 0.41), m, bevel=0.02)
        mb.box((0.38, 0.4, 0.1), (x, 0, 0.88), m, bevel=0.02)
        mb.box((0.2, 0.02, 0.06), (x, -0.2, 0.86), M("Black"))
        mb.box((0.24, 0.004, 0.08), (x, -0.191, 0.62), _m("White"))
        mb.text(t, 0.035 if len(t) > 4 else 0.05, _m("Ink"), M=L._mat4((x, -0.195, 0.62)), extrude=0.0)
    mb.box((1.22, 0.06, 0.05), (0, 0.2, 0.05), M("SteelDark"))
    mb.obj("Bins")
    return L.finish("recycle_bins", budget=900, view=(1.0, -2.0, 0.9), target_z=0.5)


def massage_chair():
    """Coin-operated massage chair 0.8 x 1.2: padded leatherette seat, deep
    back, arm shells with the coin box, footrest pod."""
    mb = MB()
    lt, sh = _m("Leather"), _m("GreyLight")
    mb.box((0.8, 0.75, 0.42), (0, 0.05, 0.21), sh, bevel=0.04)
    mb.box((0.56, 0.6, 0.14), (0, 0.0, 0.48), lt, bevel=0.05)
    mb.box((0.6, 0.3, 0.85), (0, 0.42, 0.78), sh, bevel=0.06, rot=(-14, 0, 0))
    mb.box((0.5, 0.12, 0.7), (0, 0.29, 0.86), lt, bevel=0.05, rot=(-14, 0, 0))
    mb.box((0.36, 0.2, 0.16), (0, 0.35, 1.25), lt, bevel=0.06, rot=(-14, 0, 0))
    for sx in (-0.34, 0.34):
        mb.box((0.14, 0.7, 0.3), (sx, 0.0, 0.62), sh, bevel=0.05)
        mb.box((0.12, 0.5, 0.06), (sx, -0.02, 0.79), lt, bevel=0.025)
    mb.box((0.46, 0.3, 0.36), (0, -0.48, 0.2), sh, bevel=0.05, rot=(20, 0, 0))
    mb.box((0.12, 0.08, 0.12), (0.34, -0.38, 0.86), _m("Dark"), bevel=0.01)
    mb.box((0.03, 0.01, 0.04), (0.34, -0.425, 0.88), M("Brass"))
    mb.obj("MassageChair")
    return L.finish("massage_chair", budget=900, view=(1.4, -2.0, 1.0), target_z=0.6)


def claw_machine():
    """Claw crane 0.85 x 0.85 x 1.95: cabinet, four posts round an open
    (glassless) play box full of plush toys, gantry and claw, marquee."""
    mb = MB()
    p = _m("Pink")
    mb.box((0.85, 0.85, 0.85), (0, 0, 0.425), p, bevel=0.02)
    mb.box((0.3, 0.02, 0.2), (0.18, -0.43, 0.62), _m("Dark"))
    mb.box((0.24, 0.16, 0.08), (-0.15, -0.5, 0.86), _m("Dark"), bevel=0.01)
    mb.cyl(0.012, 0.08, (-0.2, -0.5, 0.94), M("Steel"), segs=5)
    mb.sphere((0.025, 0.025, 0.025), (-0.2, -0.5, 0.99), _m("Red"), segs=6, rings=4)
    mb.cyl(0.025, 0.02, (-0.06, -0.5, 0.91), _m("Yellow"), segs=8)
    for sx in (-0.4, 0.4):
        for sy in (-0.4, 0.4):
            mb.box((0.04, 0.04, 0.9), (sx, sy, 1.3), M("Chrome"))
    mb.box((0.85, 0.85, 0.2), (0, 0, 1.85), p, bevel=0.02)
    mb.box((0.7, 0.01, 0.12), (0, -0.426, 1.85), _m("Yellow"))
    mb.text("AMBIL HADIAH", 0.05, _m("RedDark"), M=L._mat4((0, -0.432, 1.85)), extrude=0.0)
    rnd = random.Random(2)
    for i in range(14):
        c = _m(rnd.choice(["Plush1", "Plush2", "Plush3"]))
        x, y = rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3)
        z = 0.9 + rnd.uniform(0.0, 0.12)
        mb.sphere((0.08, 0.07, 0.07), (x, y, z), c, segs=6, rings=4)
        if i % 3 == 0:
            mb.sphere((0.03, 0.03, 0.035), (x - 0.04, y, z + 0.07), c, segs=5, rings=3)
            mb.sphere((0.03, 0.03, 0.035), (x + 0.04, y, z + 0.07), c, segs=5, rings=3)
    mb.box((0.78, 0.04, 0.03), (0, 0.1, 1.73), M("Steel"))
    mb.cyl(0.004, 0.3, (0.1, 0.1, 1.57), M("Steel"), segs=3)
    for k in range(3):
        a = k * 2.1
        mb.tube([(0.1, 0.1, 1.42), (0.1 + 0.05 * math.cos(a), 0.1 + 0.05 * math.sin(a), 1.36), (0.1 + 0.03 * math.cos(a), 0.1 + 0.03 * math.sin(a), 1.3)], 0.006, M("Chrome"), segs=3)
    mb.cyl(0.03, 0.05, (0.1, 0.1, 1.44), M("Chrome"), segs=8)
    mb.obj("Claw")
    return L.finish("claw_machine", budget=1400, view=(1.3, -2.0, 1.2), target_z=1.0)


def queue_posts():
    """Three chrome queue stanchions in a line 2.4 m long with two sagging
    red retractable belts. Runs along X."""
    mb = MB()
    ch = M("Chrome")
    for x in (-1.2, 0.0, 1.2):
        mb.lathe([(0.0, 0.0), (0.16, 0.0), (0.16, 0.025), (0.03, 0.04), (0.025, 0.9), (0.035, 0.93), (0.035, 0.97), (0.0, 0.98)], ch, segs=10, M=L._mat4((x, 0, 0)))
    for x0 in (-1.2, 0.0):
        pts = [(x0 + 0.035 + t * 1.13, 0.0, 0.9 - 0.06 * math.sin(math.pi * t)) for t in [i / 6 for i in range(7)]]
        mb.ribbon(pts, 0.05, _m("Red"), normal=(0, -1, 0))
        mb.ribbon(list(reversed(pts)), 0.05, _m("Red"), normal=(0, 1, 0))
    mb.obj("Queue")
    return L.finish("queue_posts", budget=600, view=(1.0, -2.0, 0.8), target_z=0.5)


def shopping_bags():
    """Four shopping bags left on the floor, kraft, white and red, rope
    handles, one tipped over. 0.8 x 0.5."""
    mb = MB()
    spec = [(-0.25, 0.05, 0, "Kraft", (0.32, 0.14, 0.4)), (0.1, 0.1, 15, "BagWhite", (0.36, 0.16, 0.44)),
            (0.25, -0.12, -20, "Red", (0.26, 0.12, 0.3))]
    for x, y, rz, c, (w, d, h) in spec:
        T = L._mat4((x, y, 0), (0, 0, rz))
        mb.box((w, d, h), (0, 0, h / 2), _m(c), M=T)
        mb.box((w * 0.5, 0.004, h * 0.3), (0, -d / 2 - 0.002, h * 0.6), _m("Ink"), M=T)
        for sy in (-d / 2 + 0.01, d / 2 - 0.01):
            mb.tube([(T @ L.Vector(p))[:] for p in [(-w * 0.2, sy, h), (-w * 0.12, sy, h + 0.1), (w * 0.12, sy, h + 0.1), (w * 0.2, sy, h)]], 0.005, M("Black"), segs=3, caps=False)
    T = L._mat4((-0.05, -0.22, 0.08), (0, 90, 70))
    mb.box((0.3, 0.14, 0.36), (0, 0, 0), _m("Kraft"), M=T)
    mb.box((0.25, 0.18, 0.003), (-0.28, -0.3, 0.002), M("Paper"), rot=(0, 0, 30))
    mb.obj("Bags")
    return L.finish("shopping_bags", budget=600, view=(1.0, -1.6, 1.0), target_z=0.2)


# =====================================================================
# pool
# =====================================================================
def lounge_chair():
    """White plastic sun lounger 0.65 x 1.9, backrest raised, slatted."""
    mb = MB()
    w = _m("White")
    for sx in (-0.29, 0.29):
        mb.box((0.04, 1.3, 0.05), (sx, 0.25, 0.33), w, bevel=0.01)
        mb.box((0.04, 0.7, 0.05), (sx, -0.6, 0.6), w, bevel=0.01, rot=(-45, 0, 0))
        for y in (0.8, -0.35):
            mb.box((0.05, 0.06, 0.33), (sx, y, 0.165), w)
    for i in range(10):
        mb.box((0.56, 0.08, 0.02), (0, 0.85 - i * 0.12, 0.36), w)
    for i in range(5):
        y = -0.38 - i * 0.12 * math.cos(math.radians(45))
        mb.box((0.56, 0.08, 0.02), (0, y, 0.39 + (i + 0.5) * 0.12 * math.sin(math.radians(45))), w, rot=(-45, 0, 0))
    mb.box((0.04, 0.3, 0.03), (0, -0.35, 0.22), w, rot=(50, 0, 0))
    mb.box((0.5, 0.35, 0.006), (0.0, 0.3, 0.375), _m("TowelBlue"), rot=(0, 0, 6))
    mb.obj("Lounger")
    return L.finish("lounge_chair", budget=600, view=(1.6, -1.6, 1.0), target_z=0.4)


def towel_cart():
    """Chrome towel trolley 0.9 x 0.5 x 1.1, three shelves of folded towels
    (white and blue), a few dropped on the floor."""
    mb = MB()
    ch = M("Chrome")
    for sx in (-0.43, 0.43):
        for sy in (-0.23, 0.23):
            mb.cyl(0.012, 1.0, (sx, sy, 0.55), ch, segs=5)
            mb.cyl(0.03, 0.03, (sx, sy, 0.03), M("Rubber"), rot=(0, 90, 0), segs=6)
    for z in (0.1, 0.5, 0.9):
        mb.box((0.88, 0.48, 0.015), (0, 0, z), ch)
    rnd = random.Random(6)
    for z in (0.1, 0.5, 0.9):
        for i in range(3):
            n = rnd.randint(2, 5)
            for j in range(n):
                mb.box((0.26, 0.3, 0.06), (-0.29 + i * 0.29 + rnd.uniform(-0.01, 0.01), 0, z + 0.04 + j * 0.06), _m("Towel" if (i + j) % 3 else "TowelBlue"), rot=(0, 0, rnd.uniform(-5, 5)))
    mb.box((0.5, 0.4, 0.02), (0.3, -0.5, 0.01), _m("Towel"), rot=(0, 0, 20))
    mb.obj("TowelCart")
    return L.finish("towel_cart", budget=1400, view=(1.2, -1.8, 1.0), target_z=0.6)


def lifering_stand():
    """Wooden post 1.6 m with a red-white life ring hanging on a hook, a
    coiled rope and a small sign 'PELAMPUNG'."""
    mb = MB()
    mb.box((0.1, 0.1, 1.6), (0, 0.05, 0.8), M("WoodDark"))
    mb.box((0.3, 0.3, 0.06), (0, 0.05, 0.03), _m("StoneDark"))
    mb.box((0.3, 0.02, 0.1), (0, -0.01, 1.5), _m("White"))
    mb.text("PELAMPUNG", 0.03, _m("InkRed"), M=L._mat4((0, -0.022, 1.5)), extrude=0.0)
    T = L._mat4((0, -0.07, 1.08), (90, 0, 0))
    prof = [(0.24 + 0.07 * math.cos(a), 0.07 * math.sin(a)) for a in [i * 2 * math.pi / 6 for i in range(7)]]
    mb.lathe(prof, _m("Orange"), segs=12, close=False, M=T)
    for k in range(4):
        a = k * 90 + 45
        mb.box((0.08, 0.15, 0.145), (0.24 * math.cos(math.radians(a)), 0.24 * math.sin(math.radians(a)), 0), _m("White"), rot=(0, 0, a), M=T)
    mb.tube([(0.1 * math.cos(t), -0.07 + 0.02 * math.sin(t * 3), 0.85 + 0.05 * math.sin(t)) for t in [i * 0.8 for i in range(12)]], 0.01, _m("OffWhite"), segs=4)
    mb.obj("LifeRing")
    return L.finish("lifering_stand", budget=800, view=(1.0, -1.8, 0.8), target_z=0.9)


def pool_robot():
    """Pool-cleaning robot 0.45 x 0.4 with roller brushes, handle and its
    long blue floating cable coiled beside it."""
    mb = MB()
    mb.box((0.42, 0.36, 0.2), (0, 0, 0.17), _m("Blue"), bevel=0.05)
    mb.box((0.36, 0.3, 0.06), (0, 0, 0.29), _m("Dark"), bevel=0.02)
    for sy in (-0.17, 0.17):
        mb.cyl(0.07, 0.44, (0, sy, 0.07), _m("White"), rot=(0, 90, 0), segs=8)
    mb.tube([(-0.15, 0, 0.3), (-0.15, 0, 0.42), (0.15, 0, 0.42), (0.15, 0, 0.3)], 0.015, _m("Dark"), segs=4)
    pts = [(0.2, 0.0, 0.25), (0.32, 0.05, 0.05)]
    for i in range(22):
        t = i * 0.55
        r = 0.22 + 0.01 * i
        pts.append((0.65 + r * math.cos(t), 0.2 + r * math.sin(t), 0.02 + 0.012 * (i % 4)))
    mb.tube(pts, 0.013, _m("LightBlue"), segs=4)
    mb.obj("PoolRobot")
    return L.finish("pool_robot", budget=700, view=(1.2, -1.6, 1.0), target_z=0.15)


def kickboard_rack():
    """Steel rack 1.0 x 0.4 x 1.2 with a row of foam kickboards and pool
    noodles standing in a bin beside it."""
    mb = MB()
    st = M("Steel")
    for sx in (-0.5, 0.5):
        mb.box((0.03, 0.4, 0.03), (sx, 0, 0.015), st)
        mb.cyl(0.012, 1.0, (sx, 0.15, 0.5), st, segs=4)
    mb.cyl(0.012, 1.0, (0, 0.15, 0.95), st, rot=(0, 90, 0), segs=4)
    mb.cyl(0.012, 1.0, (0, -0.15, 0.08), st, rot=(0, 90, 0), segs=4)
    for i in range(8):
        x = -0.42 + i * 0.12
        mb.box((0.04, 0.3, 0.46), (x, 0.0, 0.33), _m(["Kick1", "Kick2", "Kick3"][i % 3]), bevel=0.018, rot=(0, 0, 0) if i % 2 else (-8, 0, 0))
    mb.cyl(0.13, 0.4, (0.7, 0.0, 0.2), M("BinPlastic"), segs=10)
    for k in range(5):
        a = k * 1.25
        mb.cyl(0.035, 1.3, (0.7 + 0.06 * math.cos(a), 0.06 * math.sin(a), 0.68), _m(["Noodle", "Kick3", "Kick1", "Kick2", "Noodle"][k]),
               rot=(8 * math.sin(a), 8 * math.cos(a), 0), segs=6)
    mb.obj("Kickboards")
    return L.finish("kickboard_rack", budget=900, view=(1.2, -1.8, 1.0), target_z=0.6)


# =====================================================================
# museum
# =====================================================================
def armour_stand():
    """Suit of plate armour on a wooden base, 1.85 m, holding a halberd."""
    mb = MB()
    s = M("Steel")
    mb.box((0.6, 0.5, 0.08), (0, 0, 0.04), M("WoodDark"), bevel=0.01)
    for sx in (-0.11, 0.11):
        mb.box((0.12, 0.26, 0.07), (sx, -0.05, 0.115), s, bevel=0.02)
        mb.limb((sx, 0, 0.15), (sx, 0, 0.5), 0.06, 0.065, s, segs=5)
        mb.sphere((0.07, 0.07, 0.06), (sx, -0.01, 0.52), s, segs=6, rings=4)
        mb.limb((sx, 0, 0.55), (sx * 1.1, 0, 0.92), 0.07, 0.085, s, segs=5)
    mb.lathe([(0.0, 0.88), (0.17, 0.9), (0.2, 1.0), (0.17, 1.12), (0.19, 1.3), (0.2, 1.42), (0.12, 1.5), (0.0, 1.52)], s, segs=8, sy=0.7)
    mb.box((0.06, 0.01, 0.3), (0, -0.14, 1.2), M("SteelDark"))
    for sx in (-1, 1):
        mb.sphere((0.1, 0.1, 0.08), (sx * 0.22, 0, 1.43), s, segs=6, rings=4)
        mb.limb((sx * 0.25, 0, 1.38), (sx * 0.28, -0.04, 1.1), 0.05, 0.05, s, segs=5)
        mb.limb((sx * 0.28, -0.04, 1.1), (sx * 0.24, -0.2, 0.98), 0.048, 0.045, s, segs=5)
        mb.sphere((0.05, 0.05, 0.06), (sx * 0.23, -0.24, 0.96), s, segs=6, rings=4)
    mb.lathe([(0.0, 1.5), (0.11, 1.52), (0.12, 1.65), (0.1, 1.78), (0.0, 1.82)], s, segs=8)
    mb.box((0.16, 0.02, 0.02), (0, -0.12, 1.68), M("Black"))
    mb.cyl(0.015, 2.2, (0.23, -0.24, 1.1), M("WoodDark"), segs=5)
    mb.prism([(0.0, 0.0), (0.18, 0.06), (0.2, 0.2), (0.0, 0.16)], 0.01, s, M=L._mat4((0.23, -0.24, 2.0)))
    mb.cyl(0.03, 0.28, (0.23, -0.24, 2.26), s, r2=0.0, segs=4)
    mb.obj("Armour")
    return L.finish("armour_stand", budget=1600, view=(1.2, -2.0, 1.0), target_z=1.0)


def sarcophagus():
    """Painted wooden sarcophagus 0.7 x 2.0 lying on a low stone dais, its
    lid carved with a face and crossed arms, paint flaking."""
    mb = MB()
    mb.box((0.95, 2.25, 0.25), (0, 0, 0.125), _m("Stone"), bevel=0.015)
    mb.box((0.62, 1.95, 0.42), (0, 0, 0.46), _m("Gold"), bevel=0.04)
    prof = [(0.0, -0.95), (0.18, -0.92), (0.24, -0.6), (0.3, -0.1), (0.31, 0.3), (0.27, 0.62), (0.22, 0.72), (0.2, 0.92), (0.0, 0.98)]
    # lid: lathed along Y (head at +Y... game front -Y: head to -Y)
    mb.lathe(prof, _m("Paint"), segs=10, sy=0.45,
             M=L._mat4((0, 0, 0.68), (90, 0, 0)))
    mb.sphere((0.16, 0.08, 0.2), (0, -0.78, 0.82), _m("Gold"), segs=10, rings=6)
    for sx in (-0.06, 0.06):
        mb.box((0.04, 0.01, 0.015), (sx, -0.86, 0.86), M("Black"))
    mb.box((0.38, 0.12, 0.22), (0, -0.82, 0.74), _m("Cobalt"), bevel=0.02)
    for sx in (-1, 1):
        mb.cyl(0.035, 0.42, (0, -0.25, 0.86), _m("Gold"), rot=(0, 90, sx * 30), segs=6)
    for i in range(5):
        mb.box((0.5, 0.02, 0.03), (0, 0.1 + i * 0.15, 0.82), _m("Gold" if i % 2 else "Terracotta"))
    mb.obj("Sarcophagus")
    return L.finish("sarcophagus", budget=1000, view=(1.6, -1.8, 1.4), target_z=0.5)


def fossil_skeleton():
    """Small theropod skeleton on a black plinth 1.8 x 0.6: vertebrae along
    an S-curve, ribs, skull with jaw, two legs, a tail held up on a rod."""
    mb = MB()
    bn = _m("Bone")
    mb.box((1.8, 0.6, 0.3), (0, 0, 0.15), _m("Dark"), bevel=0.01)
    mb.box((0.3, 0.005, 0.12), (0, -0.303, 0.15), M("Brass"))
    spine = []
    for i in range(20):
        t = i / 19
        x = -0.85 + 1.7 * t
        z = 1.0 + 0.18 * math.sin(t * math.pi * 1.2 + 0.4) - 0.25 * (t - 0.5) ** 2
        spine.append((x, 0, z))
    for i, (x, y, z) in enumerate(spine):
        r = 0.035 if 4 < i < 14 else 0.022
        mb.box((0.06, r * 1.6, r * 2.2), (x, y, z), bn)
        if 6 <= i <= 12:
            for sy in (-1, 1):
                mb.tube([(x, 0, z), (x + 0.02, sy * 0.13, z - 0.1), (x + 0.03, sy * 0.12, z - 0.26), (x + 0.02, sy * 0.04, z - 0.32)], 0.008, bn, segs=3, caps=False)
    hx, hy, hz = spine[-1]
    mb.box((0.28, 0.12, 0.13), (hx + 0.12, 0, hz + 0.02), bn, bevel=0.03)
    mb.box((0.24, 0.1, 0.03), (hx + 0.12, 0, hz - 0.08), bn, rot=(0, 12, 0))
    mb.box((0.04, 0.125, 0.04), (hx + 0.08, 0, hz + 0.04), M("Black"))
    hip = spine[7]
    for sy in (-0.1, 0.1):
        mb.limb((hip[0], sy, hip[2] - 0.05), (hip[0] + 0.12, sy, 0.6), 0.03, 0.025, bn, segs=5)
        mb.limb((hip[0] + 0.12, sy, 0.6), (hip[0] - 0.05, sy, 0.38), 0.025, 0.02, bn, segs=5)
        mb.box((0.18, 0.06, 0.02), (hip[0] + 0.02, sy, 0.31), bn)
    sh = spine[13]
    for sy in (-0.07, 0.07):
        mb.tube([(sh[0], sy, sh[2] - 0.08), (sh[0] + 0.08, sy - 0.02, sh[2] - 0.2), (sh[0] + 0.14, sy, sh[2] - 0.22)], 0.012, bn, segs=4)
    for p in (spine[3], spine[10]):
        mb.cyl(0.008, p[2] - 0.3, (p[0], 0.0, 0.3 + (p[2] - 0.3) / 2), M("SteelDark"), segs=4)
    mb.obj("Fossil")
    return L.finish("fossil_skeleton", budget=1600, view=(1.0, -2.0, 0.9), target_z=0.7)


def map_table():
    """Glass-topped museum map table 1.4 x 0.9: an old map of the town in a
    wooden frame, a brass magnifier and a card on top."""
    mb = MB()
    wd = M("WoodDark")
    mb.box((1.4, 0.9, 0.1), (0, 0, 0.82), wd, bevel=0.01)
    for sx in (-0.62, 0.62):
        for sy in (-0.37, 0.37):
            mb.box((0.07, 0.07, 0.78), (sx, sy, 0.39), wd)
    mb.box((1.2, 0.04, 0.06), (0, -0.37, 0.15), wd)
    mb.box((1.26, 0.76, 0.006), (0, 0, 0.873), _m("PaperOld"))
    rnd = random.Random(12)
    for _ in range(9):
        w, d = rnd.uniform(0.08, 0.3), rnd.uniform(0.06, 0.2)
        mb.box((w, d, 0.002), (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.28, 0.28), 0.877), _m(rnd.choice(["Land", "Celadon", "Terracotta"])))
    mb.tube([(-0.6, rnd.uniform(-0.3, 0.3), 0.879)] + [(-0.6 + i * 0.15, 0.3 * math.sin(i * 0.9), 0.879) for i in range(1, 9)], 0.008, _m("Ocean"), segs=3, caps=False)
    mb.box((1.3, 0.8, 0.008), (0, 0, 0.885), _m("LightBlue"))
    mb.cyl(0.05, 0.01, (0.4, -0.2, 0.895), M("Brass"), segs=10)
    mb.box((0.12, 0.02, 0.012), (0.48, -0.25, 0.895), wd, rot=(0, 0, -30))
    mb.box((0.15, 0.1, 0.004), (-0.45, -0.3, 0.892), M("Paper"))
    mb.obj("MapTable")
    return L.finish("map_table", budget=700, view=(1.2, -1.6, 1.4), target_z=0.6)


def vase_set():
    """Stepped stone plinth 1.2 x 0.5 with three ceramic vases: celadon,
    blue-and-white, terracotta."""
    mb = MB()
    mb.box((1.2, 0.5, 0.7), (0, 0, 0.35), _m("Stone"), bevel=0.01)
    mb.box((0.5, 0.4, 0.2), (0.25, 0.02, 0.8), _m("StoneDark"), bevel=0.01)
    mb.lathe([(0.0, 0.7), (0.08, 0.7), (0.15, 0.82), (0.16, 0.95), (0.06, 1.12), (0.05, 1.2), (0.08, 1.24), (0.0, 1.24)], _m("Celadon"), segs=12, M=L._mat4((-0.35, 0, 0)))
    mb.lathe([(0.0, 0.9), (0.06, 0.9), (0.12, 1.02), (0.13, 1.2), (0.09, 1.36), (0.04, 1.44), (0.06, 1.5), (0.0, 1.5)], _m("Porcelain"), segs=12, M=L._mat4((0.25, 0.02, 0)))
    for z in (1.08, 1.22):
        mb.cyl(0.135, 0.03, (0.25, 0.02, z), _m("Cobalt"), segs=12)
    mb.lathe([(0.0, 0.7), (0.1, 0.7), (0.12, 0.76), (0.07, 0.86), (0.08, 0.92), (0.0, 0.92)], _m("Terracotta"), segs=10, M=L._mat4((-0.05, -0.1, 0)))
    mb.box((0.2, 0.004, 0.1), (0, -0.252, 0.55), M("Brass"))
    mb.obj("Vases")
    return L.finish("vase_set", budget=900, view=(1.2, -1.8, 1.0), target_z=0.8)


def info_sign():
    """Museum stand-up sign on a chrome post: 'JANGAN DISENTUH' with a
    smaller line under it, slanted reading panel at 1 m."""
    mb = MB()
    ch = M("Chrome")
    mb.cyl(0.16, 0.025, (0, 0, 0.0125), ch, segs=12)
    mb.cyl(0.018, 0.92, (0, 0, 0.47), ch, segs=6)
    T = L._mat4((0, 0, 1.0), (-30, 0, 0))
    mb.box((0.42, 0.02, 0.3), (0, 0, 0), M("Black"), M=T)
    mb.box((0.38, 0.004, 0.26), (0, -0.012, 0), _m("OffWhite"), M=T)
    mb.text("JANGAN", 0.05, _m("InkRed"), M=T @ L._mat4((0, -0.015, 0.06)), extrude=0.0)
    mb.text("DISENTUH", 0.05, _m("InkRed"), M=T @ L._mat4((0, -0.015, -0.01)), extrude=0.0)
    mb.text("koleksi 1996", 0.025, _m("Ink"), M=T @ L._mat4((0, -0.015, -0.08)), extrude=0.0)
    mb.obj("InfoSign")
    return L.finish("info_sign", budget=900, view=(0.6, -1.8, 0.6), target_z=0.8)


# =====================================================================
# generic clutter
# =====================================================================
def fire_extinguisher():
    """Red APAR fire extinguisher on a wall bracket, its top at 1.2 m, a
    red 'APAR' sign above it. Wall piece."""
    mb = MB()
    r = _m("Red")
    mb.lathe([(0.0, 0.62), (0.08, 0.62), (0.085, 0.65), (0.085, 1.05), (0.06, 1.12), (0.02, 1.14), (0.0, 1.14)], r, segs=12, M=L._mat4((0, -0.12, 0)))
    mb.box((0.04, 0.06, 0.06), (0, -0.12, 1.17), _m("Dark"))
    mb.box((0.14, 0.025, 0.02), (0.05, -0.12, 1.2), M("Steel"), rot=(0, -12, 0))
    mb.cyl(0.025, 0.03, (0.04, -0.17, 1.13), M("ClockFace"), rot=(90, 0, 0), segs=8)
    mb.tube([(-0.03, -0.12, 1.16), (-0.1, -0.15, 1.05), (-0.09, -0.17, 0.8), (-0.06, -0.16, 0.7)], 0.01, M("Black"), segs=4)
    mb.box((0.12, 0.03, 0.04), (0, -0.015, 1.0), M("SteelDark"))
    mb.box((0.03, 0.09, 0.03), (0, -0.06, 0.98), M("SteelDark"))
    mb.box((0.26, 0.005, 0.14), (0, -0.003, 1.42), r)
    mb.text("APAR", 0.08, _m("White"), M=L._mat4((0, -0.007, 1.42)), extrude=0.0)
    mb.obj("APAR")
    return L.finish("fire_extinguisher", budget=500, view=(1.0, -2.0, 0.3), target_z=1.0, wall=True)


def wall_speaker():
    """School PA speaker box high on the wall (2.45 m), angled down, cloth
    grille and a conduit running up to the ceiling. Wall piece."""
    mb = MB()
    T = L._mat4((0, -0.1, 2.45), (-15, 0, 0))
    mb.box((0.36, 0.16, 0.26), (0, 0, 0), M("WoodDark"), bevel=0.01, M=T)
    mb.box((0.3, 0.01, 0.2), (0, -0.081, 0), _m("Fabric"), M=T)
    mb.box((0.06, 0.1, 0.03), (0, 0.06, 0.16), M("SteelDark"), M=T)
    mb.cyl(0.01, 0.5, (0.12, -0.012, 2.75), M("SteelDark"), segs=4)
    mb.obj("Speaker")
    return L.finish("wall_speaker", budget=300, view=(1.0, -2.0, 0.3), target_z=2.45, wall=True)


def mop_bucket():
    """Grey plastic bucket with a string mop standing in it and a rag."""
    mb = MB()
    mb.lathe([(0.0, 0.0), (0.13, 0.0), (0.16, 0.3), (0.15, 0.3), (0.12, 0.02), (0.0, 0.02)], _m("Grey"), segs=12)
    mb.cyl(0.13, 0.01, (0, 0, 0.2), _m("Debris"), segs=12)
    mb.tube([(-0.15, 0, 0.29), (0, 0, 0.42), (0.15, 0, 0.29)], 0.005, M("Steel"), segs=3, caps=False)
    mb.cyl(0.013, 1.35, (0.02, 0.03, 0.82), M("WoodLight"), rot=(9, -6, 0), segs=5)
    mb.cyl(0.07, 0.12, (0.0, 0.0, 0.2), _m("OffWhite"), r2=0.05, segs=8)
    mb.box((0.25, 0.2, 0.01), (0.25, -0.15, 0.005), _m("Debris"), rot=(0, 0, 25))
    mb.obj("MopBucket")
    return L.finish("mop_bucket", budget=400, view=(1.0, -1.6, 0.8), target_z=0.5)


def _carton(mb, size, loc, rz, rnd, flaps=False, tilt=(0, 0)):
    T = L._mat4(loc, (tilt[0], tilt[1], rz))
    w, d, h = size
    mb.box((w, d, h), (0, 0, h / 2), M("Cardboard"), M=T)
    if not flaps:
        mb.box((w + 0.002, 0.06, h + 0.002), (0, 0, h / 2), M("Tape"), M=T)
    else:
        mb.box((w, d * 0.5, 0.005), (0, -d * 0.55, h + 0.1), M("CardboardDark"), rot=(-60, 0, 0), M=T)
        mb.box((w * 0.5, d, 0.005), (w * 0.52, 0, h + 0.08), M("CardboardDark"), rot=(0, 70, 0), M=T)
    if rnd.random() < 0.6:
        mb.box((w * 0.4, 0.004, h * 0.25), (0, -d / 2 - 0.002, h * 0.6), M("Paper"), M=T)


def box_pile_a():
    """Storeroom pile: four sealed cartons of mixed sizes, one on top
    skewed. 1.1 x 0.7."""
    mb = MB()
    rnd = random.Random(31)
    _carton(mb, (0.6, 0.5, 0.45), (-0.25, 0.05, 0), 4, rnd)
    _carton(mb, (0.45, 0.4, 0.35), (0.3, -0.05, 0), -10, rnd)
    _carton(mb, (0.5, 0.42, 0.4), (-0.22, 0.05, 0.45), 18, rnd)
    _carton(mb, (0.3, 0.3, 0.25), (0.3, 0.0, 0.35), 40, rnd, flaps=True)
    mb.obj("BoxPileA")
    return L.finish("box_pile_a", budget=400, view=(1.2, -1.6, 1.0), target_z=0.4)


def box_pile_b():
    """Tall stack of five identical moving boxes leaning, a fallen one on
    the floor with its flaps open. 0.9 x 0.9, 1.6 m."""
    mb = MB()
    rnd = random.Random(32)
    for i in range(4):
        _carton(mb, (0.5, 0.4, 0.35), (0.02 * i - 0.15, 0.01 * i, i * 0.35), rnd.uniform(-6, 6), rnd)
    _carton(mb, (0.5, 0.4, 0.35), (0.35, -0.3, 0.2), 30, rnd, flaps=True, tilt=(0, 90))
    for k in range(3):
        mb.box((0.21, 0.3, 0.003), (0.3 + rnd.uniform(-0.2, 0.3), -0.5 + rnd.uniform(-0.1, 0.1), 0.002 + k * 0.002), M("Paper"), rot=(0, 0, rnd.uniform(0, 180)))
    mb.obj("BoxPileB")
    return L.finish("box_pile_b", budget=400, view=(1.2, -1.6, 1.0), target_z=0.6)


def box_pile_c():
    """Wooden pallet with a shrink-wrapped block of cartons and a strap."""
    mb = MB()
    wd = M("WoodLight")
    for x in (-0.5, 0.0, 0.5):
        mb.box((0.1, 1.0, 0.1), (x, 0, 0.05), wd)
    for i in range(7):
        mb.box((1.2, 0.1, 0.02), (0, -0.45 + i * 0.15, 0.11), wd)
    rnd = random.Random(33)
    for lv in range(2):
        for ix in (-0.3, 0.3):
            for iy in (-0.22, 0.22):
                _carton(mb, (0.56, 0.42, 0.36), (ix, iy, 0.12 + lv * 0.36), rnd.uniform(-2, 2), rnd)
    mb.box((1.22, 0.03, 0.04), (0, -0.44, 0.6), _m("Blue"))
    mb.obj("BoxPileC")
    return L.finish("box_pile_c", budget=700, view=(1.2, -1.6, 1.0), target_z=0.4)


def paper_pile():
    """Stacks of old exam papers and folders on the floor, sheets scattered
    round them. 1.2 x 0.8."""
    mb = MB()
    rnd = random.Random(41)
    for (x, y, n) in ((-0.2, 0.05, 6), (0.18, 0.1, 9), (0.05, -0.15, 3)):
        z = 0.0
        for k in range(n):
            h = rnd.uniform(0.02, 0.05)
            mb.box((0.3, 0.22, h), (x + rnd.uniform(-0.02, 0.02), y + rnd.uniform(-0.02, 0.02), z + h / 2),
                   _m(rnd.choice(["PaperOld", "Kraft", "OffWhite"])) if k % 3 else M("Paper"), rot=(0, 0, rnd.uniform(-12, 12)))
            z += h
    for k in range(10):
        mb.box((0.21, 0.29, 0.002), (rnd.uniform(-0.55, 0.55), rnd.uniform(-0.4, 0.4), 0.001 + k * 0.0015), M("Paper") if k % 2 else _m("PaperOld"), rot=(0, 0, rnd.uniform(0, 180)))
    mb.obj("Papers")
    return L.finish("paper_pile", budget=400, view=(1.0, -1.4, 1.2), target_z=0.1)


def fallen_tile():
    """A ceiling tile come down: cracked 0.6 m panel on the floor in three
    pieces, dust and debris, a bent T-bar."""
    mb = MB()
    rnd = random.Random(43)
    t = _m("Tile")
    mb.prism([(-0.3, -0.3), (0.12, -0.3), (0.0, 0.05), (-0.3, 0.12)], 0.015, t, M=L._mat4((0, 0, 0.0075), (0, 0, 8)), axis="Z")
    mb.prism([(0.12, -0.3), (0.3, -0.3), (0.3, 0.3), (0.05, 0.18), (0.0, 0.05)], 0.015, t, M=L._mat4((0.06, 0.03, 0.03), (6, -4, -10)), axis="Z")
    mb.prism([(-0.3, 0.12), (0.0, 0.05), (0.05, 0.18), (0.3, 0.3), (-0.3, 0.3)], 0.015, t, M=L._mat4((-0.05, 0.1, 0.0075), (0, 0, 15)), axis="Z")
    for _ in range(12):
        s = rnd.uniform(0.02, 0.06)
        mb.box((s, s, s * 0.5), (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), s * 0.25), _m("Debris"), rot=(0, 0, rnd.uniform(0, 90)))
    mb.box((0.9, 0.02, 0.03), (0.1, -0.35, 0.015), M("Aluminium"), rot=(0, 0, 20))
    mb.box((1.0, 0.8, 0.002), (0, 0, 0.001), _m("Debris"))
    mb.obj("FallenTile")
    return L.finish("fallen_tile", budget=300, view=(1.0, -1.4, 1.2), target_z=0.05)


def chair_broken():
    """School chair lying on its back with a snapped leg beside it."""
    mb = MB()
    T = L._mat4((0, 0.0, 0.2), (-100, 0, 20))
    st, wd = M("SteelDark"), M("WoodLight")
    mb.box((0.42, 0.4, 0.025), (0, 0, 0.44 - 0.45), wd, M=T)
    mb.box((0.4, 0.025, 0.22), (0, 0.2, 0.27), wd, M=T)
    for sx in (-0.19, 0.19):
        mb.cyl(0.012, 0.42, (sx, 0.19, 0.19), st, segs=4, M=T)
    for sx, sy, ln in ((-0.19, -0.18, 0.44), (0.19, -0.18, 0.2), (-0.19, 0.18, 0.44), (0.19, 0.18, 0.44)):
        mb.cyl(0.012, ln, (sx, sy, -0.01 - ln / 2), st, segs=4, M=T)
    mb.cyl(0.012, 0.24, (0.3, -0.35, 0.012), st, rot=(0, 90, 40), segs=4)
    mb.box((0.16, 0.12, 0.012), (-0.35, -0.3, 0.006), wd, rot=(0, 0, 50))
    mb.obj("BrokenChair")
    return L.finish("chair_broken", budget=400, view=(1.2, -1.6, 1.0), target_z=0.2)


def pipe_bundle():
    """Three pipes 3 m long run along the wall just under the ceiling
    (2.55 - 2.8 m) on steel brackets, one with a valve wheel and a rusty
    drip stain under a joint. Spans X, wall piece."""
    mb = MB()
    for z, r, c, y in ((2.78, 0.06, M("SteelDark"), -0.1), (2.62, 0.045, _m("Rust"), -0.22), (2.66, 0.03, _m("Green"), -0.06)):
        mb.cyl(r, 3.0, (0, y, z), c, rot=(0, 90, 0), segs=8, caps=False)
        for x in (-1.0, 0.5):
            mb.cyl(r + 0.012, 0.05, (x, y, z), c, rot=(0, 90, 0), segs=8)
    for x in (-1.3, 0.0, 1.3):
        mb.box((0.04, 0.28, 0.03), (x, -0.14, 2.56), M("Steel"))
        mb.box((0.04, 0.02, 0.3), (x, -0.01, 2.7), M("Steel"))
    T = L._mat4((0.5, -0.22, 2.62), (90, 0, 0))
    mb.cyl(0.015, 0.12, (0, 0, 0.06), M("Steel"), segs=5, M=T)
    prof = [(0.07 + 0.01 * math.cos(a), 0.01 * math.sin(a)) for a in [i * 2 * math.pi / 4 for i in range(5)]]
    mb.lathe(prof, _m("Red"), segs=10, close=False, M=T @ L._mat4((0, 0, 0.12)))
    mb.box((0.12, 0.004, 0.9), (-1.0, -0.002, 2.1), _m("Rust"))
    mb.obj("Pipes")
    return L.finish("pipe_bundle", budget=700, view=(0.8, -2.0, 0.4), target_z=2.5, wall=True)


def fuse_cabinet():
    """Grey electrical distribution cabinet 0.6 x 0.25 x 1.2 on the wall at
    0.5 m, warning triangle, conduits to the ceiling, door slightly ajar.
    Wall piece (not the level's interactive fuse box)."""
    mb = MB()
    g = M("PanelGrey")
    mb.box((0.6, 0.22, 1.2), (0, -0.11, 1.1), g, bevel=0.01)
    mb.box((0.56, 0.02, 1.14), (0.04, -0.235, 1.1), g, rot=(0, 0, -8))
    mb.prism([(-0.07, 0.0), (0.07, 0.0), (0.0, 0.12)], 0.004, M("HazardYellow"), M=L._mat4((0.04, -0.25, 1.4)))
    mb.text("!", 0.08, M("Black"), M=L._mat4((0.04, -0.253, 1.44)), extrude=0.0)
    mb.box((0.02, 0.03, 0.12), (0.3, -0.255, 1.1), M("Black"))
    mb.box((0.2, 0.004, 0.06), (0.04, -0.252, 0.9), M("Paper"))
    mb.text("PANEL B", 0.03, _m("Ink"), M=L._mat4((0.04, -0.255, 0.9)), extrude=0.0)
    for x in (-0.18, 0.0, 0.18):
        mb.cyl(0.02, 1.3, (x, -0.06, 2.35), M("SteelDark"), segs=5)
    mb.obj("ElecCab")
    return L.finish("fuse_cabinet", budget=500, view=(1.2, -2.0, 0.3), target_z=1.3, wall=True)


def _poster(name, title, lines, paper, ink, w=0.6, h=0.8, z=1.55, tape=True, yo=0.0):
    mb = MB()
    mb.box((w, 0.003, h), (0, yo - 0.0015, z), _m(paper))
    mb.box((w - 0.08, 0.002, h * 0.36), (0, yo - 0.0035, z + h * 0.12), _m("OffWhite"))
    mb.box((w - 0.16, 0.002, h * 0.22), (0, yo - 0.0045, z + h * 0.12), _m(ink))
    mb.text(title, 0.052 * w / 0.6, _m(ink), M=L._mat4((0, yo - 0.004, z + h * 0.38)), extrude=0.0)
    for i, ln in enumerate(lines):
        mb.text(ln, 0.036 * w / 0.6, _m("Ink"), M=L._mat4((0, yo - 0.004, z - h * 0.18 - i * h * 0.085)), extrude=0.0)
    if tape:
        for sx in (-1, 1):
            for sz in (-1, 1):
                mb.box((0.06, 0.003, 0.025), (sx * (w / 2 - 0.02), yo - 0.004, z + sz * (h / 2 - 0.01)), M("Tape"), rot=(0, sx * sz * 30, 0))
    mb.obj(name)


def poster_a():
    """Taped school poster 'JAGA KEBERSIHAN' with three rules. Wall piece."""
    _poster("PosterA", "JAGA KEBERSIHAN", ["BUANG SAMPAH", "PADA TEMPATNYA"], "Poster1", "InkGreen")
    return L.finish("poster_a", budget=900, view=(0.4, -2.0, 0.1), target_z=1.55, wall=True)


def poster_b():
    """Taped poster 'DILARANG BERLARI' (hospital/pool/school). Wall piece."""
    _poster("PosterB", "DILARANG BERLARI", ["DI LORONG", "JANGAN MENOLEH"], "Poster2", "InkBlue")
    return L.finish("poster_b", budget=900, view=(0.4, -2.0, 0.1), target_z=1.55, wall=True)


def poster_c():
    """Framed notice 'CUCI TANGAN' / 'HARAP TENANG', red title. Wall piece."""
    mb = MB()
    w, h, z = 0.5, 0.7, 1.55
    mb.box((w + 0.06, 0.012, h + 0.06), (0, -0.006, z), M("WoodDark"))
    mb.obj("Frame")
    _poster("PosterC", "HARAP TENANG", ["JAM BESUK", "SUDAH BERAKHIR"], "Poster3", "InkRed", w=w, h=h, z=z, tape=False, yo=-0.0125)
    return L.finish("poster_c", budget=900, view=(0.4, -2.0, 0.1), target_z=1.55, wall=True)


def cctv_camera():
    """CCTV dome-less box camera on a wall arm at 2.6 m, angled down, cable
    up to the ceiling. Wall piece."""
    mb = MB()
    mb.box((0.1, 0.03, 0.14), (0, -0.015, 2.6), _m("OffWhite"))
    mb.tube([(0, -0.03, 2.62), (0, -0.16, 2.66), (0, -0.22, 2.62)], 0.015, _m("OffWhite"), segs=5)
    T = L._mat4((0, -0.3, 2.6), (-20, 0, 0))
    mb.box((0.1, 0.24, 0.09), (0, 0, 0), _m("OffWhite"), bevel=0.01, M=T)
    mb.box((0.12, 0.26, 0.012), (0, -0.02, 0.055), _m("OffWhite"), M=T)
    mb.cyl(0.03, 0.02, (0, -0.125, 0), M("Black"), rot=(90, 0, 0), segs=8, M=T)
    mb.cyl(0.006, 0.4, (0.03, -0.012, 2.85), M("Black"), segs=4)
    mb.obj("CCTV")
    return L.finish("cctv_camera", budget=300, view=(1.2, -1.6, 0.3), target_z=2.6, wall=True)


def emergency_light():
    """Twin-head emergency light box on the wall at 2.45 m, battery box with
    a green charge LED (dead) and two spot heads. Wall piece."""
    mb = MB()
    mb.box((0.34, 0.09, 0.12), (0, -0.045, 2.45), _m("OffWhite"), bevel=0.01)
    mb.box((0.02, 0.005, 0.01), (0.12, -0.092, 2.42), _m("Green"))
    for sx in (-0.11, 0.11):
        T = L._mat4((sx, -0.11, 2.53), (-30, 0, sx * 120))
        mb.cyl(0.04, 0.08, (0, 0, 0), _m("OffWhite"), rot=(90, 0, 0), segs=8, M=T)
        mb.cyl(0.032, 0.005, (0, -0.042, 0), _m("LightBlue"), rot=(90, 0, 0), segs=8, M=T)
    mb.obj("EmLight")
    return L.finish("emergency_light", budget=300, view=(1.0, -2.0, 0.3), target_z=2.45, wall=True)


def exit_sign():
    """Lit green 'KELUAR' box sign with a running figure and arrow, on a
    short bracket from the wall at 2.5 m. Wall piece."""
    mb = MB()
    mb.box((0.42, 0.06, 0.18), (0, -0.05, 2.5), _m("White"), bevel=0.006)
    mb.box((0.04, 0.03, 0.03), (0, -0.01, 2.6), M("Steel"))
    mb.obj("ExitBox")
    mb = MB()
    mb.box((0.38, 0.005, 0.14), (0, -0.083, 2.5), _m("EmitExit"))
    mb.obj("ExitFace")
    mb = MB()
    mb.text("KELUAR", 0.07, _m("White"), M=L._mat4((0.05, -0.087, 2.49)), extrude=0.0)
    mb.prism([(-0.17, 2.5), (-0.12, 2.54), (-0.12, 2.52), (-0.09, 2.52), (-0.09, 2.48), (-0.12, 2.48), (-0.12, 2.46)], 0.003, _m("White"), M=L._mat4((0, -0.087, 0)))
    mb.obj("ExitText")
    return L.finish("exit_sign", budget=500, view=(0.5, -2.0, 0.2), target_z=2.5, wall=True)


ASSETS = {
    # school
    "globe_stand": globe_stand, "upright_piano": upright_piano, "bag_pile": bag_pile,
    "umbrella_stand": umbrella_stand, "stacked_chairs": stacked_chairs, "projector_cart": projector_cart,
    "sports_rack": sports_rack, "water_dispenser": water_dispenser, "cleaning_cart": cleaning_cart,
    # hospital
    "oxygen_tanks": oxygen_tanks, "crash_cart": crash_cart, "vending_machine": vending_machine,
    "specimen_fridge": specimen_fridge, "supply_rack": supply_rack, "bedside_cabinet": bedside_cabinet,
    # detention
    "steel_toilet": steel_toilet, "wall_chains": wall_chains, "intercom_panel": intercom_panel,
    "barred_cabinet": barred_cabinet, "punish_stool": punish_stool, "file_boxes": file_boxes,
    # mall
    "atm_machine": atm_machine, "potted_palm": potted_palm, "recycle_bins": recycle_bins,
    "massage_chair": massage_chair, "claw_machine": claw_machine, "queue_posts": queue_posts,
    "shopping_bags": shopping_bags,
    # pool
    "lounge_chair": lounge_chair, "towel_cart": towel_cart, "lifering_stand": lifering_stand,
    "pool_robot": pool_robot, "kickboard_rack": kickboard_rack,
    # museum
    "armour_stand": armour_stand, "sarcophagus": sarcophagus, "fossil_skeleton": fossil_skeleton,
    "map_table": map_table, "vase_set": vase_set, "info_sign": info_sign,
    # generic
    "fire_extinguisher": fire_extinguisher, "wall_speaker": wall_speaker, "mop_bucket": mop_bucket,
    "box_pile_a": box_pile_a, "box_pile_b": box_pile_b, "box_pile_c": box_pile_c,
    "paper_pile": paper_pile, "fallen_tile": fallen_tile, "chair_broken": chair_broken,
    "pipe_bundle": pipe_bundle, "fuse_cabinet": fuse_cabinet,
    "poster_a": poster_a, "poster_b": poster_b, "poster_c": poster_c,
    "cctv_camera": cctv_camera, "emergency_light": emergency_light, "exit_sign": exit_sign,
}

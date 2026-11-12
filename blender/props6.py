"""Batch 11 props: a real Indonesian school, 1996 (LEVEL 0).

Conventions as in props.py: metres, origin at floor level, front = Blender -Y
(three.js +Z). Wall-mounted pieces have their back on the wall plane (y = 0)
and stick out towards -Y; their origin height is given in the game (opts.y).
"""
import math
import random
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "DeskWood": ("#a8743f", 0.6, 0.0),
        "DeskTop": ("#b98a55", 0.5, 0.0),
        "ChairSteel": ("#3b4a3f", 0.5, 0.35),
        "Gold": ("#b8923a", 0.35, 0.7),
        "FlagRed": ("#b0201c", 0.7, 0.0),
        "FlagWhite": ("#ecebe4", 0.7, 0.0),
        "PhotoDark": ("#2b2622", 0.8, 0.0),
        "PhotoFace": ("#6b5f52", 0.8, 0.0),
        "Cork": ("#a07a4c", 0.95, 0.0),
        "PaperA": ("#e7e1cc", 0.85, 0.0),
        "PaperB": ("#c9d7d0", 0.85, 0.0),
        "PaperC": ("#e3c9a8", 0.85, 0.0),
        "WindowFrame": ("#6b4a2b", 0.6, 0.0),
        "WindowGlass": ("#1a2328", 0.12, 0.3),
        "Iron": ("#2b2d2e", 0.5, 0.5),
        "Pot": ("#8a4b2e", 0.8, 0.0),
        "Soil": ("#2c2118", 1.0, 0.0),
        "Leaf": ("#3d5a2c", 0.7, 0.0),
        "LeafDark": ("#2a4220", 0.7, 0.0),
        "Bark": ("#4a3a2c", 0.95, 0.0),
        "Concrete": ("#bdb7a8", 0.9, 0.0),
        "ConcretePaint": ("#d8d0bb", 0.8, 0.0),
        "Mattress": ("#d9d6c8", 0.9, 0.0),
        "Curtain": ("#8fb3a6", 0.9, 0.0),
        "MedWhite": ("#e6e6df", 0.5, 0.1),
        "RedCross": ("#b32a24", 0.6, 0.0),
        "Formica": ("#d6c9a6", 0.5, 0.0),
        "JarGlass": ("#c2d6d0", 0.1, 0.0),
        "Snack1": ("#c9472f", 0.6, 0.0),
        "Snack2": ("#e0b43c", 0.6, 0.0),
        "Snack3": ("#3e7cb0", 0.6, 0.0),
        "Straw": ("#c7a764", 0.95, 0.0),
        "LampGlow": ("#fff1cc", 0.4, 0.0),
    }
    if name in extra:
        c, r, mt = extra[name]
        if name in ("WindowGlass",):
            return mat(name, c, rough=r, metal=mt, alpha=0.82)
        if name == "JarGlass":
            return mat(name, c, rough=r, metal=mt, alpha=0.35)
        if name == "LampGlow":
            return mat(name, c, rough=r, emit=c, strength=2.0)
        return mat(name, c, rough=r, metal=mt)
    return M(name)


# ------------------------------------------------------------- desk pair
def _chair(mb, x, y, steel, wood):
    """Steel-frame school chair with wooden seat and back, facing -Y."""
    for sx in (-0.17, 0.17):
        for sy in (-0.17, 0.17):
            mb.box((0.022, 0.022, 0.44), (x + sx, y + sy, 0.22), steel)
    mb.box((0.4, 0.38, 0.022), (x, y, 0.45), wood, bevel=0.005)
    for sx in (-0.17, 0.17):
        mb.box((0.022, 0.022, 0.38), (x + sx, y + 0.18, 0.64), steel)
    mb.box((0.4, 0.02, 0.16), (x, y + 0.19, 0.74), wood, bevel=0.004)


def desk_pair():
    """Two-seat wooden school desk (1.2 x 0.5) with two chairs behind it.
    Origin floor centre of the footprint (~1.2 x 0.95); students face -Y."""
    mb = MB()
    wood, top, steel = _m("DeskWood"), _m("DeskTop"), _m("ChairSteel")
    dy = -0.22                                   # desk centre
    mb.box((1.2, 0.5, 0.03), (0, dy, 0.72), top, bevel=0.006)
    for sx in (-0.56, 0.56):
        mb.box((0.04, 0.46, 0.7), (sx, dy, 0.35), wood)
    mb.box((1.1, 0.02, 0.36), (0, dy - 0.23, 0.52), wood)          # modesty panel
    mb.box((1.1, 0.4, 0.015), (0, dy + 0.02, 0.58), wood)          # book shelf
    rnd = random.Random(11)
    for i in range(3):                                              # books / a satchel
        x = rnd.uniform(-0.45, 0.45)
        mb.box((0.17, 0.24, 0.025 + rnd.random() * 0.02), (x, dy + 0.03, 0.6), M(rnd.choice(["BookRed", "BookBlue", "BookGreen"])))
    mb.box((0.2, 0.28, 0.008), (0.25, dy + 0.02, 0.739), M("Paper"))
    for k in range(4):                                              # carved scratches
        mb.box((rnd.uniform(0.05, 0.15), 0.004, 0.001), (rnd.uniform(-0.5, 0.5), dy + rnd.uniform(-0.2, 0.2), 0.7355), M("WoodDark"),
               rot=(0, 0, rnd.uniform(-40, 40)))
    for x in (-0.3, 0.3):
        _chair(mb, x + rnd.uniform(-0.03, 0.03), 0.25 + rnd.uniform(-0.03, 0.04), steel, wood)
    mb.obj("DeskPair")
    return L.finish("desk_pair", budget=1600, view=(1.3, -1.7, 1.1), target_z=0.5)


# --------------------------------------------- emblem and portraits above the board
def wall_frames():
    """Gold bird emblem in a frame between two dark framed portraits (generic,
    faded silhouettes). Origin at the centre of the group, back on the wall."""
    mb = MB()
    gold, frame = _m("Gold"), M("WoodDark")
    # centre emblem frame
    mb.box((0.46, 0.025, 0.54), (0, -0.0125, 0), frame, bevel=0.006)
    mb.box((0.4, 0.008, 0.48), (0, -0.028, 0), _m("FlagWhite"))
    # stylised bird: body, spread wings, head, shield on the chest
    mb.sphere((0.05, 0.012, 0.08), (0, -0.036, 0.0), gold, segs=10, rings=6)
    for s in (-1, 1):
        for k in range(5):
            mb.box((0.11, 0.006, 0.022), (s * (0.07 + k * 0.012), -0.035, 0.02 + k * 0.03), gold, rot=(0, s * (25 + k * 6), 0))
        mb.box((0.035, 0.006, 0.07), (s * 0.03, -0.035, -0.12), gold, rot=(0, s * 20, 0))
    mb.sphere((0.025, 0.01, 0.028), (0.012, -0.036, 0.11), gold, segs=8, rings=5)
    mb.box((0.06, 0.01, 0.07), (0, -0.042, -0.01), _m("FlagRed"), bevel=0.01)
    mb.box((0.14, 0.006, 0.03), (0, -0.036, -0.19), _m("FlagWhite"))
    # two faded portraits
    for s in (-1, 1):
        x = s * 0.62
        mb.box((0.42, 0.025, 0.52), (x, -0.0125, -0.02), frame, bevel=0.006)
        mb.box((0.36, 0.008, 0.46), (x, -0.028, -0.02), _m("PhotoDark"))
        mb.sphere((0.06, 0.006, 0.075), (x, -0.033, 0.06), _m("PhotoFace"), segs=10, rings=6)
        mb.box((0.26, 0.006, 0.16), (x, -0.033, -0.14), _m("PhotoFace"), bevel=0.03)
    mb.obj("WallFrames")
    return L.finish("wall_frames", budget=1400, view=(0.2, -2.2, 0.0), target_z=0.0, floor=False)


def flag_stand():
    """Red-and-white flag on a wooden pole in a heavy base, ~2 m."""
    mb = MB()
    mb.cyl(0.16, 0.06, (0, 0, 0.03), M("WoodDark"), segs=14)
    mb.cyl(0.08, 0.08, (0, 0, 0.1), M("WoodDark"), segs=12)
    mb.cyl(0.016, 1.95, (0, 0, 1.05), M("WoodLight"), segs=8)
    mb.sphere((0.03, 0.03, 0.04), (0, 0, 2.05), _m("Gold"), segs=10, rings=6)
    # cloth hanging in folds
    pts_r, pts_w = [], []
    for k in range(9):
        t = k / 8
        x = 0.02 + t * 0.62
        y = 0.035 * math.sin(t * math.pi * 2.3)
        pts_r.append((x, y, 1.95 - t * 0.12))
        pts_w.append((x, y, 1.73 - t * 0.12))
    mb.ribbon(pts_r, 0.2, _m("FlagRed"))
    mb.ribbon(pts_w, 0.2, _m("FlagWhite"))
    mb.ribbon([(p[0], p[1] + 0.002, p[2]) for p in pts_r], 0.2, _m("FlagRed"), normal=(0, 1, 0))
    mb.ribbon([(p[0], p[1] + 0.002, p[2]) for p in pts_w], 0.2, _m("FlagWhite"), normal=(0, 1, 0))
    mb.obj("FlagStand")
    return L.finish("flag_stand", budget=800, view=(1.4, -2.0, 0.8), target_z=1.1)


def class_cabinet():
    """Wooden classroom cabinet 1.0 x 0.48 x 1.8, glass upper doors, books."""
    mb = MB()
    wood, dark = M("Wood"), M("WoodDark")
    W, D, H = 1.0, 0.48, 1.8
    mb.box((W, D, 0.04), (0, 0, H - 0.02), dark, bevel=0.005)
    mb.box((W, D, 0.06), (0, 0, 0.03), dark)
    for sx in (-1, 1):
        mb.box((0.03, D, H - 0.1), (sx * (W / 2 - 0.015), 0, H / 2), wood)
    mb.box((W, 0.02, H - 0.1), (0, D / 2 - 0.01, H / 2), wood)
    for z in (0.75, 1.25):
        mb.box((W - 0.06, D - 0.04, 0.02), (0, 0.01, z), wood)
    mb.box((W - 0.04, 0.02, 0.68), (0, -D / 2 + 0.01, 0.4), wood, bevel=0.004)       # lower doors
    mb.box((0.004, 0.025, 0.66), (0, -D / 2 - 0.002, 0.4), dark)
    for sx in (-0.06, 0.06):
        mb.box((0.02, 0.02, 0.06), (sx, -D / 2 - 0.012, 0.55), M("Brass"))
    rnd = random.Random(5)
    for z in (0.77, 1.27):
        x = -W / 2 + 0.06
        while x < W / 2 - 0.1:
            w = rnd.uniform(0.03, 0.06); h = rnd.uniform(0.22, 0.34)
            mb.box((w, 0.24, h), (x + w / 2, 0.02, z + 0.01 + h / 2), M(rnd.choice(["BookRed", "BookBlue", "BookGreen", "BookTan", "Paper"])))
            x += w + 0.004
    for sx in (-1, 1):                                                              # glass doors
        mb.box((W / 2 - 0.03, 0.012, 0.95), (sx * W / 4, -D / 2 + 0.01, 1.25), _m("JarGlass"))
        mb.box((W / 2 - 0.03, 0.02, 0.03), (sx * W / 4, -D / 2 + 0.01, 1.72), wood)
        mb.box((W / 2 - 0.03, 0.02, 0.03), (sx * W / 4, -D / 2 + 0.01, 0.78), wood)
    mb.obj("ClassCabinet")
    return L.finish("class_cabinet", budget=1500, view=(0.9, -2.0, 1.0), target_z=0.9)


def broom_set():
    """Palm-fibre broom and a tin dustpan leaning in a corner."""
    mb = MB()
    mb.limb((0.0, 0.05, 0.05), (0.05, 0.12, 1.25), 0.012, 0.012, M("WoodLight"), segs=6)
    mb.lathe([(0.0, 0.0), (0.09, 0.0), (0.05, 0.3), (0.012, 0.42)], _m("Straw"), M=L.look_matrix((0.0, 0.0, 0.0), (0.0, 0.03, 0.4)), segs=10)
    mb.box((0.26, 0.02, 0.2), (0.16, 0.08, 0.1), M("SteelDark"), rot=(-12, 0, 0))
    mb.limb((0.16, 0.1, 0.18), (0.18, 0.14, 0.7), 0.01, 0.01, M("WoodLight"), segs=6)
    mb.obj("BroomSet")
    return L.finish("broom_set", budget=500, view=(1.4, -1.8, 0.8), target_z=0.6)


def ceiling_fan():
    """Ceiling fan, origin on the ceiling, hanging down 0.5 m."""
    mb = MB()
    mb.cyl(0.07, 0.04, (0, 0, -0.02), M("HousingWhite"), segs=12)
    mb.cyl(0.012, 0.36, (0, 0, -0.22), M("HousingWhite"), segs=8)
    mb.cyl(0.11, 0.1, (0, 0, -0.44), M("HousingWhite"), segs=16)
    for k in range(3):
        a = k * 120
        mb.box((0.62, 0.11, 0.008), (0.38 * math.cos(math.radians(a)), 0.38 * math.sin(math.radians(a)), -0.47), M("HousingWhite"),
               rot=(8, 0, a))
    mb.obj("CeilingFan")
    return L.finish("ceiling_fan", budget=500, view=(1.2, -1.6, -0.6), target_z=-0.4, floor=False)


def notice_board():
    """Cork wall magazine (mading), 1.6 x 0.95, pinned papers. Origin centre."""
    mb = MB()
    mb.box((1.66, 0.03, 1.0), (0, -0.015, 0), M("WoodDark"), bevel=0.006)
    mb.box((1.56, 0.01, 0.9), (0, -0.033, 0), _m("Cork"))
    rnd = random.Random(19)
    for i in range(11):
        w, h = rnd.uniform(0.15, 0.3), rnd.uniform(0.18, 0.32)
        x, z = rnd.uniform(-0.65, 0.65), rnd.uniform(-0.3, 0.3)
        mb.box((w, 0.003, h), (x, -0.04 - i * 0.0006, z), _m(rnd.choice(["PaperA", "PaperA", "PaperB", "PaperC"])), rot=(0, rnd.uniform(-6, 6), 0))
        mb.sphere((0.008,) * 3, (x, -0.045, z + h / 2 - 0.02), _m(rnd.choice(["FlagRed", "Snack3", "Snack2"])), segs=6, rings=4)
    mb.box((0.9, 0.004, 0.08), (0, -0.04, 0.38), _m("FlagWhite"))
    mb.obj("NoticeBoard")
    return L.finish("notice_board", budget=800, view=(0.3, -2.0, 0.1), target_z=0.0, floor=False)


def school_window():
    """Wooden window frame with dark glass and iron bars, 2.2 wide, sill at
    0.95 m, top at 2.35 m. Origin on the wall at floor level."""
    mb = MB()
    fr, glass, iron = _m("WindowFrame"), _m("WindowGlass"), _m("Iron")
    W, z0, z1 = 2.2, 0.95, 2.35
    mb.box((W + 0.1, 0.07, 0.06), (0, -0.035, z0 - 0.03), fr)
    mb.box((W + 0.1, 0.05, 0.06), (0, -0.025, z1 + 0.03), fr)
    for x in (-W / 2, -W / 6, W / 6, W / 2):
        mb.box((0.06, 0.05, z1 - z0), (x, -0.025, (z0 + z1) / 2), fr)
    mb.box((W, 0.05, 0.04), (0, -0.025, z1 - 0.32), fr)
    mb.box((W, 0.006, z1 - z0), (0, -0.012, (z0 + z1) / 2), glass)
    for k in range(9):                                     # vent louvres above
        pass
    for i in range(10):                                    # bars
        x = -W / 2 + 0.11 + i * (W - 0.22) / 9
        mb.box((0.014, 0.014, z1 - z0 - 0.05), (x, -0.07, (z0 + z1) / 2), iron)
    mb.box((W, 0.016, 0.016), (0, -0.07, z0 + 0.25), iron)
    mb.box((W, 0.016, 0.016), (0, -0.07, z1 - 0.2), iron)
    mb.box((W + 0.16, 0.1, 0.03), (0, -0.06, z0 - 0.065), M("PanelGrey"))   # concrete sill
    mb.obj("SchoolWindow")
    return L.finish("school_window", budget=700, view=(0.4, -2.4, 1.7), target_z=1.6)


def hall_bench():
    """Long wooden bench 1.6 x 0.42 x 0.46."""
    mb = MB()
    mb.box((1.6, 0.36, 0.04), (0, 0, 0.44), M("Wood"), bevel=0.006)
    for x in (-0.7, 0.7):
        for y in (-0.13, 0.13):
            mb.box((0.05, 0.05, 0.42), (x, y, 0.21), M("WoodDark"))
        mb.box((0.05, 0.3, 0.04), (x, 0, 0.1), M("WoodDark"))
    mb.box((1.4, 0.04, 0.05), (0, 0, 0.1), M("WoodDark"))
    mb.obj("HallBench")
    return L.finish("hall_bench", budget=400, view=(1.2, -1.8, 0.9), target_z=0.3)


def potted_plant():
    """Big clay pot with a leafy plant, ~1.2 m."""
    mb = MB()
    mb.lathe([(0.0, 0.0), (0.17, 0.0), (0.22, 0.4), (0.24, 0.42), (0.24, 0.45), (0.0, 0.45)], _m("Pot"), segs=16)
    mb.cyl(0.21, 0.01, (0, 0, 0.43), _m("Soil"), segs=14)
    rnd = random.Random(8)
    for k in range(14):
        a = rnd.uniform(0, 2 * math.pi)
        tilt = rnd.uniform(10, 35)
        L_ = rnd.uniform(0.45, 0.8)
        x1, y1 = math.cos(a) * L_ * math.sin(math.radians(tilt)), math.sin(a) * L_ * math.sin(math.radians(tilt))
        pts = [(0.02 * math.cos(a), 0.02 * math.sin(a), 0.44), (x1 * 0.6, y1 * 0.6, 0.44 + L_ * 0.75), (x1, y1, 0.44 + L_ * 0.95)]
        mb.ribbon(pts, rnd.uniform(0.07, 0.11), _m("Leaf" if k % 3 else "LeafDark"), normal=(-math.sin(a), math.cos(a), 0))
        mb.ribbon([(p[0], p[1], p[2] + 0.002) for p in pts], 0.08, _m("LeafDark"), normal=(math.sin(a), -math.cos(a), 0))
    mb.obj("PottedPlant")
    return L.finish("potted_plant", budget=900, view=(1.3, -1.7, 1.0), target_z=0.6)


def trophy_case():
    """Glass trophy cabinet 1.2 x 0.48 x 1.9 with cups and plaques."""
    mb = MB()
    W, D, H = 1.2, 0.48, 1.9
    mb.box((W, D, 0.7), (0, 0, 0.35), M("WoodDark"), bevel=0.005)
    mb.box((W, D, 0.04), (0, 0, H - 0.02), M("WoodDark"))
    for sx in (-1, 1):
        mb.box((0.04, D, H - 0.7), (sx * (W / 2 - 0.02), 0, 0.7 + (H - 0.7) / 2), M("WoodDark"))
    mb.box((W, 0.02, H - 0.7), (0, D / 2 - 0.01, 0.7 + (H - 0.7) / 2), _m("PhotoDark"))
    for z in (1.1, 1.5):
        mb.box((W - 0.08, D - 0.06, 0.012), (0, 0.01, z), _m("JarGlass"))
    rnd = random.Random(23)
    for z in (0.71, 1.11, 1.51):
        for x in (-0.38, -0.12, 0.14, 0.38):
            if rnd.random() < 0.25:
                continue
            h = rnd.uniform(0.18, 0.32)
            mb.box((0.08, 0.08, 0.04), (x, 0.02, z + 0.02), M("Black"))
            mb.lathe([(0.0, 0.0), (0.02, 0.0), (0.012, h * 0.4), (0.05, h * 0.7), (0.055, h), (0.0, h * 0.85)], _m("Gold"),
                     M=L._mat4((x, 0.02, z + 0.04)), segs=12)
    mb.box((W - 0.04, 0.012, H - 0.74), (0, -D / 2 + 0.01, 0.7 + (H - 0.7) / 2), _m("JarGlass"))
    mb.obj("TrophyCase")
    return L.finish("trophy_case", budget=2200, view=(0.9, -2.1, 1.1), target_z=1.0)


def pillar():
    """Square painted concrete column, 3.6 m (one storey incl. slab)."""
    mb = MB()
    mb.box((0.36, 0.36, 3.6), (0, 0, 1.8), _m("ConcretePaint"), bevel=0.01)
    mb.box((0.42, 0.42, 0.25), (0, 0, 0.125), M("PanelGrey"), bevel=0.01)
    mb.box((0.4, 0.4, 0.06), (0, 0, 3.0), _m("ConcretePaint"), bevel=0.01)
    mb.obj("Pillar")
    return L.finish("pillar", budget=200, view=(1.4, -2.0, 1.0), target_z=1.8)


def flagpole():
    """Courtyard flagpole on a stepped concrete base, 8 m, flag at half mast."""
    mb = MB()
    mb.box((1.6, 1.6, 0.2), (0, 0, 0.1), _m("Concrete"), bevel=0.01)
    mb.box((1.0, 1.0, 0.2), (0, 0, 0.3), _m("Concrete"), bevel=0.01)
    mb.cyl(0.06, 8.0, (0, 0, 4.4), M("Steel"), segs=12)
    mb.sphere((0.09,) * 3, (0, 0, 8.45), _m("Gold"), segs=10, rings=6)
    mb.cyl(0.005, 7.8, (0.075, 0, 4.4), M("Paper"), segs=4)
    pts_r, pts_w = [], []
    for k in range(10):
        t = k / 9
        x = 0.08 + t * 1.5
        y = 0.08 * math.sin(t * math.pi * 1.8)
        pts_r.append((x, y, 5.6 - t * 0.6))
        pts_w.append((x, y, 5.1 - t * 0.6))
    for pts, m in ((pts_r, "FlagRed"), (pts_w, "FlagWhite")):
        mb.ribbon(pts, 0.5, _m(m))
        mb.ribbon([(p[0], p[1] + 0.002, p[2]) for p in pts], 0.5, _m(m), normal=(0, 1, 0))
    mb.obj("Flagpole")
    return L.finish("flagpole", budget=900, view=(5.0, -9.0, 4.0), target_z=4.0, lens=40)


def tree_big():
    """Old courtyard tree: twisted trunk, heavy dark crown, ~6.5 m."""
    mb = MB()
    rnd = random.Random(31)
    bark = _m("Bark")
    mb.limb((0, 0, 0), (0.25, 0.1, 2.6), 0.42, 0.28, bark, segs=10)
    mb.limb((0.25, 0.1, 2.5), (1.4, 0.4, 4.0), 0.22, 0.12, bark, segs=8)
    mb.limb((0.25, 0.1, 2.5), (-1.0, -0.6, 4.3), 0.2, 0.1, bark, segs=8)
    mb.limb((0.25, 0.1, 2.6), (0.2, 0.3, 5.0), 0.22, 0.1, bark, segs=8)
    for k in range(5):                                         # roots
        a = k * 2 * math.pi / 5 + 0.3
        mb.limb((0, 0, 0.3), (math.cos(a) * 0.9, math.sin(a) * 0.9, 0.0), 0.16, 0.05, bark, segs=6)
    for k in range(4):                                         # hanging aerial roots
        x, y = rnd.uniform(-1.2, 1.4), rnd.uniform(-0.8, 0.8)
        mb.limb((x, y, 4.2), (x + 0.05, y, 2.0 + rnd.random()), 0.025, 0.015, bark, segs=5)
    for k in range(13):
        x, y, z = rnd.uniform(-1.9, 2.0), rnd.uniform(-1.6, 1.6), rnd.uniform(4.1, 6.2)
        r = rnd.uniform(0.9, 1.4)
        mb.sphere((r, r * rnd.uniform(0.8, 1.1), r * 0.7), (x, y, z), _m("LeafDark" if k % 2 else "Leaf"), segs=10, rings=6)
    mb.obj("TreeBig")
    return L.finish("tree_big", budget=3200, view=(6.0, -9.0, 3.0), target_z=3.2, lens=40)


def lamp_post():
    """Courtyard lamp post 4.4 m with a glowing lantern."""
    mb = MB()
    mb.cyl(0.14, 0.3, (0, 0, 0.15), M("SteelDark"), segs=10)
    mb.cyl(0.05, 4.1, (0, 0, 2.2), M("SteelDark"), segs=8)
    mb.cyl(0.18, 0.04, (0, 0, 4.25), M("SteelDark"), segs=12)
    mb.cyl(0.12, 0.28, (0, 0, 4.1), _m("LampGlow"), segs=12)
    mb.cyl(0.05, 0.06, (0, 0, 4.3), M("SteelDark"), segs=8)
    mb.obj("LampPost")
    return L.finish("lamp_post", budget=400, view=(2.0, -4.0, 2.5), target_z=2.2)


def uks_bed():
    """Clinic bed with a thin mattress, pillow and folded blanket, 0.9 x 1.95."""
    mb = MB()
    steel = M("Steel")
    for x in (-0.42, 0.42):
        for y in (-0.92, 0.92):
            mb.cyl(0.018, 0.5, (x, y, 0.25), steel, segs=8)
        mb.box((0.03, 1.9, 0.03), (x, 0, 0.42), steel)
    mb.box((0.9, 0.03, 0.5), (0, -0.95, 0.75), steel)
    mb.box((0.88, 1.9, 0.12), (0, 0, 0.5), _m("Mattress"), bevel=0.03)
    mb.box((0.55, 0.3, 0.1), (0, -0.72, 0.61), _m("FlagWhite"), bevel=0.04)
    mb.box((0.84, 0.5, 0.06), (0, 0.55, 0.59), _m("Curtain"), bevel=0.02)
    mb.obj("UksBed")
    return L.finish("uks_bed", budget=900, view=(1.6, -1.8, 1.2), target_z=0.4)


def folding_screen():
    """Three-panel cloth screen on a steel frame, ~1.7 m."""
    mb = MB()
    for k, (x, a) in enumerate(((-0.55, 20), (0, 0), (0.55, -20))):
        rot = (0, 0, a)
        mb.box((0.52, 0.02, 1.4), (x, 0.08 * (k != 1), 0.9), _m("Curtain"), rot=rot)
        for dx in (-0.27, 0.27):
            mb.box((0.02, 0.02, 1.65), (x + dx * math.cos(math.radians(a)), 0.08 * (k != 1) + dx * math.sin(math.radians(a)), 0.83), M("Steel"), rot=rot)
    mb.obj("FoldingScreen")
    return L.finish("folding_screen", budget=500, view=(1.0, -2.2, 1.0), target_z=0.9)


def medicine_cabinet():
    """White steel medicine cabinet with a red cross, bottles inside."""
    mb = MB()
    W, D, H = 0.9, 0.4, 1.8
    mb.box((W, D, H), (0, 0, H / 2), _m("MedWhite"), bevel=0.01)
    mb.box((W - 0.06, 0.012, 0.9), (0, -D / 2 - 0.004, 1.3), _m("JarGlass"))
    mb.box((0.22, 0.006, 0.06), (0, -D / 2 - 0.01, 0.6), _m("RedCross"))
    mb.box((0.06, 0.006, 0.22), (0, -D / 2 - 0.01, 0.6), _m("RedCross"))
    rnd = random.Random(4)
    for z in (0.95, 1.35):
        for i in range(6):
            x = -0.34 + i * 0.13
            h = rnd.uniform(0.1, 0.2)
            mb.cyl(0.03, h, (x, -0.05, z + h / 2), _m(rnd.choice(["Formalin", "MedWhite", "Snack3"])) if False else _m(rnd.choice(["MedWhite", "Snack3", "Pot"])), segs=8)
    mb.obj("MedicineCabinet")
    return L.finish("medicine_cabinet", budget=900, view=(0.9, -2.0, 1.0), target_z=0.9)


def canteen_table():
    """Long canteen table 0.8 x 1.9 with a bench on each side."""
    mb = MB()
    mb.box((0.8, 1.9, 0.04), (0, 0, 0.75), _m("Formica"), bevel=0.006)
    for y in (-0.8, 0.8):
        mb.box((0.06, 0.06, 0.73), (0, y, 0.365), M("SteelDark"))
        mb.box((1.6, 0.05, 0.04), (0, y, 0.12), M("SteelDark"))
    for x in (-0.62, 0.62):
        mb.box((0.28, 1.85, 0.035), (x, 0, 0.44), M("Wood"), bevel=0.005)
        for y in (-0.8, 0.8):
            mb.box((0.04, 0.04, 0.43), (x, y, 0.21), M("SteelDark"))
    rnd = random.Random(2)
    for k in range(3):
        mb.cyl(0.11, 0.02, (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.7, 0.7), 0.78), M("HousingWhite"), segs=12)
    mb.cyl(0.04, 0.12, (0.2, 0.3, 0.83), _m("JarGlass"), segs=10)
    mb.obj("CanteenTable")
    return L.finish("canteen_table", budget=900, view=(1.6, -1.9, 1.2), target_z=0.5)


def canteen_counter():
    """Food stall counter 2.4 wide: glass snack jars, a cooler box, signboard.
    Back against the wall (+Y)."""
    mb = MB()
    W, D, H = 2.4, 0.7, 0.95
    mb.box((W, D, H), (0, 0, H / 2), M("Wood"), bevel=0.01)
    mb.box((W + 0.04, D + 0.04, 0.04), (0, 0, H + 0.02), _m("Formica"))
    mb.box((W - 0.1, 0.01, 0.4), (0, -D / 2 - 0.004, 0.55), _m("Snack3"))
    rnd = random.Random(9)
    for i in range(7):
        x = -1.05 + i * 0.33
        h = rnd.uniform(0.22, 0.3)
        mb.cyl(0.1, h, (x, -0.12, H + 0.04 + h / 2), _m("JarGlass"), segs=12, caps=False)
        mb.cyl(0.095, h * 0.6, (x, -0.12, H + 0.04 + h * 0.3), _m(rnd.choice(["Snack1", "Snack2", "Snack3", "PaperC"])), segs=10)
        mb.cyl(0.105, 0.04, (x, -0.12, H + 0.06 + h), _m(rnd.choice(["Snack1", "Snack3"])), segs=12)
    mb.box((0.5, 0.35, 0.3), (0.8, 0.15, H + 0.19), _m("Snack3"), bevel=0.02)
    mb.box((W, 0.03, 0.3), (0, D / 2 - 0.02, 2.0), M("Wood"))
    mb.box((W - 0.2, 0.01, 0.2), (0, D / 2 - 0.04, 2.0), _m("FlagWhite"))
    for x in (-W / 2 + 0.05, W / 2 - 0.05):
        mb.box((0.04, 0.04, 1.05), (x, D / 2 - 0.03, 1.45), M("Wood"))
    mb.obj("CanteenCounter")
    return L.finish("canteen_counter", budget=2000, view=(1.2, -2.6, 1.4), target_z=1.0)


ASSETS = {
    "desk_pair": desk_pair,
    "wall_frames": wall_frames,
    "flag_stand": flag_stand,
    "class_cabinet": class_cabinet,
    "broom_set": broom_set,
    "ceiling_fan": ceiling_fan,
    "notice_board": notice_board,
    "school_window": school_window,
    "hall_bench": hall_bench,
    "potted_plant": potted_plant,
    "trophy_case": trophy_case,
    "pillar": pillar,
    "flagpole": flagpole,
    "tree_big": tree_big,
    "lamp_post": lamp_post,
    "uks_bed": uks_bed,
    "folding_screen": folding_screen,
    "medicine_cabinet": medicine_cabinet,
    "canteen_table": canteen_table,
    "canteen_counter": canteen_counter,
}

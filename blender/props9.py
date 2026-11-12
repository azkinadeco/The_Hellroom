"""Batch 14 props: the three-storey mall (LEVEL 3) and the housing estate
that somehow sits inside it.

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z). Wall pieces: back on the wall plane (y = 0), sticking out -Y.
"""
import math
import random
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "Shutter": ("#8d9295", 0.45, 0.5),
        "ShutterDark": ("#5b6063", 0.5, 0.5),
        "Marble": ("#d9d6cf", 0.25, 0.0),
        "Water": ("#5f9fae", 0.1, 0.0),
        "KioskRed": ("#a8342c", 0.5, 0.0),
        "KioskCream": ("#e6dcc0", 0.5, 0.0),
        "Fabric1": ("#6b4e7a", 0.9, 0.0),
        "Fabric2": ("#b88a3a", 0.9, 0.0),
        "Fabric3": ("#3f6f6a", 0.9, 0.0),
        "Fabric4": ("#a14a4a", 0.9, 0.0),
        "Sofa": ("#7a5a3c", 0.9, 0.0),
        "SofaCushion": ("#9a7650", 0.9, 0.0),
        "TVCase": ("#3a3631", 0.5, 0.0),
        "Screen": ("#20302c", 0.2, 0.0),
        "Lace": ("#ece6d6", 0.9, 0.0),
        "MailRed": ("#b2382c", 0.5, 0.2),
        "CarPaint": ("#6f7f5a", 0.35, 0.4),
        "CarGlass": ("#1b2427", 0.1, 0.3),
        "Tyre": ("#141414", 0.9, 0.0),
        "Headlamp": ("#e8e2c8", 0.3, 0.0),
        "Blanket": ("#5a6e8a", 0.9, 0.0),
    }
    c, r, mt = extra[name]
    if name == "Water":
        return mat(name, c, rough=r, metal=mt, alpha=0.7)
    return mat(name, c, rough=r, metal=mt)


def rolling_shutter():
    """Closed rolling shop shutter 3.0 x 2.6 with its box and padlock. Back on
    the wall plane, origin at floor level."""
    mb = MB()
    W, H = 2.96, 2.55
    for k in range(int(H / 0.08)):
        mb.box((W, 0.03, 0.07), (0, -0.03, 0.04 + k * 0.08), _m("Shutter" if k % 2 else "ShutterDark"))
    mb.box((W + 0.1, 0.3, 0.32), (0, -0.15, H + 0.16), _m("ShutterDark"), bevel=0.01)
    mb.box((W, 0.05, 0.06), (0, -0.05, 0.03), M("SteelDark"))
    mb.box((0.06, 0.03, 0.08), (0.6, -0.08, 0.1), M("Brass"))
    rnd = random.Random(14)
    for k in range(5):                                   # spray-paint tags
        mb.box((rnd.uniform(0.2, 0.6), 0.002, rnd.uniform(0.05, 0.12)), (rnd.uniform(-1.2, 1.2), -0.047, rnd.uniform(0.3, 1.6)),
               _m(rnd.choice(["Fabric4", "Fabric1", "KioskRed"])), rot=(0, rnd.uniform(-20, 20), 0))
    mb.obj("RollingShutter")
    return L.finish("rolling_shutter", budget=1300, view=(0.5, -3.5, 1.4), target_z=1.3)


def plaza_fountain():
    """Round marble fountain, 4 m across, dry tiers, a little standing water."""
    mb = MB()
    mb.lathe([(0.0, 0.0), (2.0, 0.0), (2.0, 0.55), (1.8, 0.55), (1.8, 0.15), (0.0, 0.15)], _m("Marble"), segs=32)
    mb.cyl(1.79, 0.02, (0, 0, 0.3), _m("Water"), segs=32)
    mb.cyl(0.25, 1.4, (0, 0, 0.85), _m("Marble"), segs=16)
    mb.lathe([(0.0, 1.4), (0.9, 1.45), (0.95, 1.6), (0.0, 1.55)], _m("Marble"), segs=24)
    mb.cyl(0.12, 0.6, (0, 0, 1.9), _m("Marble"), segs=12)
    mb.lathe([(0.0, 2.15), (0.45, 2.2), (0.48, 2.3), (0.0, 2.28)], _m("Marble"), segs=20)
    mb.sphere((0.14,) * 3, (0, 0, 2.42), _m("Marble"), segs=12, rings=8)
    mb.obj("PlazaFountain")
    return L.finish("plaza_fountain", budget=1500, view=(3.5, -5.0, 2.5), target_z=1.0)


def mall_kiosk():
    """Small island kiosk 2.0 x 1.2 with a striped canopy."""
    mb = MB()
    mb.box((2.0, 1.2, 1.0), (0, 0, 0.5), _m("KioskCream"), bevel=0.02)
    mb.box((2.1, 1.3, 0.05), (0, 0, 1.02), _m("KioskRed"))
    for x in (-0.95, 0.95):
        for y in (-0.55, 0.55):
            mb.cyl(0.025, 1.3, (x, y, 1.65), M("Chrome"), segs=8)
    for k in range(6):
        mb.box((2.2 / 6, 1.45, 0.05), (-1.1 + (k + 0.5) * 2.2 / 6, 0, 2.32), _m("KioskRed" if k % 2 else "KioskCream"), rot=(0, 0, 0))
    rnd = random.Random(3)
    for k in range(6):
        mb.box((0.18, 0.12, rnd.uniform(0.1, 0.25)), (rnd.uniform(-0.8, 0.8), rnd.uniform(-0.4, 0.4), 1.1), _m(rnd.choice(["Fabric1", "Fabric2", "Fabric3"])))
    mb.obj("MallKiosk")
    return L.finish("mall_kiosk", budget=700, view=(2.0, -3.0, 1.6), target_z=1.1)


def clothes_rack():
    """Round chrome clothes rack with hanging garments, 1.2 across."""
    mb = MB()
    mb.cyl(0.3, 0.04, (0, 0, 0.02), M("Chrome"), segs=14)
    mb.cyl(0.025, 1.35, (0, 0, 0.7), M("Chrome"), segs=8)
    mb.lathe([(0.55, 1.35), (0.58, 1.35), (0.58, 1.38), (0.55, 1.38)], M("Chrome"), segs=20)
    rnd = random.Random(21)
    for k in range(16):
        a = k * 2 * math.pi / 16
        x, y = 0.56 * math.cos(a), 0.56 * math.sin(a)
        mb.box((0.04, 0.45, 0.75), (x, y, 0.95), _m(rnd.choice(["Fabric1", "Fabric2", "Fabric3", "Fabric4"])), rot=(0, 0, math.degrees(a) + 90))
    mb.obj("ClothesRack")
    return L.finish("clothes_rack", budget=700, view=(1.6, -2.0, 1.3), target_z=0.9)


def house_sofa():
    """Old three-seat living-room sofa with lace covers, facing -Y."""
    mb = MB()
    mb.box((2.0, 0.85, 0.42), (0, 0, 0.21), _m("Sofa"), bevel=0.04)
    for x in (-0.62, 0.0, 0.62):
        mb.box((0.6, 0.7, 0.14), (x, -0.05, 0.48), _m("SofaCushion"), bevel=0.05)
        mb.box((0.36, 0.01, 0.3), (x, 0.31, 0.78), _m("Lace"))
    mb.box((2.0, 0.22, 0.55), (0, 0.32, 0.65), _m("Sofa"), bevel=0.05)
    for x in (-1.0, 1.0):
        mb.box((0.18, 0.85, 0.62), (x, 0, 0.31), _m("Sofa"), bevel=0.05)
    mb.obj("HouseSofa")
    return L.finish("house_sofa", budget=600, view=(1.6, -2.4, 1.2), target_z=0.4)


def crt_tv():
    """Wooden TV cabinet with a fat 1990s CRT set and a VCR."""
    mb = MB()
    mb.box((1.1, 0.45, 0.6), (0, 0, 0.3), M("WoodDark"), bevel=0.01)
    mb.box((1.0, 0.02, 0.5), (0, -0.226, 0.3), M("Wood"))
    mb.box((0.62, 0.5, 0.5), (0, 0.02, 0.86), _m("TVCase"), bevel=0.04)
    mb.box((0.5, 0.02, 0.38), (-0.03, -0.235, 0.87), _m("Screen"), bevel=0.02)
    mb.box((0.42, 0.3, 0.08), (0, 0.0, 0.64), M("Black"), bevel=0.005)
    mb.tube([(0.1, 0.1, 1.11), (0.2, 0.1, 1.4)], 0.004, M("Chrome"), segs=4)
    mb.tube([(-0.1, 0.1, 1.11), (-0.25, 0.12, 1.38)], 0.004, M("Chrome"), segs=4)
    mb.obj("CrtTv")
    return L.finish("crt_tv", budget=500, view=(1.0, -2.0, 1.1), target_z=0.7)


def family_table():
    """Dining table for six with a lace cloth and chairs, 1.6 x 0.9."""
    mb = MB()
    mb.box((1.6, 0.9, 0.04), (0, 0, 0.75), M("Wood"), bevel=0.01)
    mb.box((1.4, 0.7, 0.005), (0, 0, 0.773), _m("Lace"))
    for x in (-0.72, 0.72):
        for y in (-0.38, 0.38):
            mb.box((0.06, 0.06, 0.73), (x, y, 0.365), M("WoodDark"))
    for x in (-0.5, 0.0, 0.5):
        for s in (-1, 1):
            y = s * 0.62
            mb.box((0.42, 0.4, 0.04), (x, y, 0.45), M("Wood"))
            for dx in (-0.18, 0.18):
                for dy in (-0.16, 0.16):
                    mb.box((0.035, 0.035, 0.45), (x + dx, y + dy, 0.22), M("WoodDark"))
            mb.box((0.42, 0.04, 0.45), (x, y + s * 0.2, 0.7), M("Wood"))
    mb.cyl(0.11, 0.02, (0.3, 0.1, 0.785), M("HousingWhite"), segs=12)
    mb.obj("FamilyTable")
    return L.finish("family_table", budget=900, view=(1.8, -2.2, 1.5), target_z=0.6)


def house_bed():
    """Wooden double bed with a mosquito-net frame and a rumpled blanket."""
    mb = MB()
    mb.box((1.6, 2.05, 0.3), (0, 0, 0.25), M("WoodDark"), bevel=0.01)
    mb.box((1.5, 1.95, 0.2), (0, 0, 0.5), _m("Lace"), bevel=0.04)
    mb.box((1.5, 1.2, 0.08), (0, -0.35, 0.63), _m("Blanket"), bevel=0.03, rot=(0, 2, 0))
    for x in (-0.4, 0.4):
        mb.box((0.55, 0.32, 0.12), (x, 0.78, 0.65), _m("Lace"), bevel=0.05)
    mb.box((1.6, 0.06, 1.0), (0, 1.02, 0.6), M("WoodDark"), bevel=0.01)
    for x in (-0.78, 0.78):
        for y in (-1.0, 1.0):
            mb.box((0.04, 0.04, 2.0), (x, y, 1.0), M("Wood"))
    mb.obj("HouseBed")
    return L.finish("house_bed", budget=600, view=(1.8, -2.4, 1.6), target_z=0.6)


def mailbox():
    """Red mailbox on a post by the gate."""
    mb = MB()
    mb.box((0.08, 0.08, 1.1), (0, 0, 0.55), M("WoodDark"))
    mb.box((0.36, 0.26, 0.3), (0, 0, 1.25), _m("MailRed"), bevel=0.02)
    mb.box((0.2, 0.01, 0.025), (0, -0.135, 1.3), M("Black"))
    mb.obj("Mailbox")
    return L.finish("mailbox", budget=200, view=(1.0, -1.8, 1.2), target_z=0.9)


def old_car():
    """Boxy 1980s sedan, 4.3 x 1.65, parked with flat tyres."""
    mb = MB()
    paint, glass = _m("CarPaint"), _m("CarGlass")
    mb.box((1.65, 4.3, 0.55), (0, 0, 0.55), paint, bevel=0.05)
    mb.prism([(-0.78, 0.82), (0.78, 0.82), (0.66, 1.3), (-0.66, 1.3)], 2.0, paint, axis="Y", M=L._mat4((0, 0.15, 0)))
    for y in (-0.88, 1.17):
        mb.box((1.3, 0.04, 0.4), (0, y, 1.06), glass, rot=(28 if y < 0 else -28, 0, 0))
    for x in (-0.8, 0.8):
        mb.box((0.02, 1.75, 0.36), (x * 0.97, 0.15, 1.06), glass)
    for x in (-0.78, 0.78):
        for y in (-1.35, 1.35):
            mb.cyl(0.3, 0.2, (x, y, 0.27), _m("Tyre"), rot=(0, 90, 0), segs=14)
    for x in (-0.55, 0.55):
        mb.box((0.3, 0.02, 0.14), (x, -2.15, 0.62), _m("Headlamp"))
    mb.box((1.7, 0.1, 0.12), (0, -2.17, 0.38), M("Chrome"))
    mb.box((1.7, 0.1, 0.12), (0, 2.17, 0.38), M("Chrome"))
    mb.obj("OldCar")
    return L.finish("old_car", budget=900, view=(3.4, -4.4, 2.0), target_z=0.7)


def house_roof():
    """Gable roof of terracotta tiles for a 9 x 9 m house; origin at the
    centre of the eaves (sits on the walls at 3.0 m)."""
    mb = MB()
    W, D, Hh, o = 9.0, 9.0, 2.6, 0.45
    tile, wood = _m("KioskRed"), M("WoodDark")
    for s in (-1, 1):
        e = s * (W / 2 + o)
        pts = [(0.0, Hh), (e, -0.1), (e, -0.24), (0.0, Hh - 0.14)]
        if s < 0:
            pts = list(reversed(pts))
        mb.prism(pts, D + 2 * o, tile, axis="Y")
        for k in range(1, 12):                                   # tile courses
            t = k / 12
            mb.box((0.05, D + 2 * o, 0.04), (e * (1 - t), 0, Hh * t - 0.1 * (1 - t) + 0.02), _m("Fabric4"))
    for y in (-D / 2, D / 2):
        mb.prism([(-W / 2, 0.0), (W / 2, 0.0), (0.0, Hh - 0.05)], 0.1, _m("KioskCream"), axis="Y", M=L._mat4((0, y, 0)))
    mb.box((0.18, D + 2 * o + 0.1, 0.16), (0, 0, Hh + 0.02), tile)
    mb.box((W + 2 * o, 0.06, 0.2), (0, -D / 2 - o, -0.05), wood)
    mb.box((W + 2 * o, 0.06, 0.2), (0, D / 2 + o, -0.05), wood)
    mb.obj("HouseRoof")
    return L.finish("house_roof", budget=600, view=(9.0, -12.0, 6.0), target_z=1.0, lens=40, floor=False)


def store_shelf():
    """Low-poly double-sided gondola shelf 1.2 x 0.6 x 1.6 stocked with
    product blocks (one box per shelf row and side)."""
    mb = MB()
    mb.box((1.2, 0.08, 1.6), (0, 0, 0.8), M("PanelGrey"))
    mb.box((1.2, 0.6, 0.1), (0, 0, 0.05), M("SteelDark"))
    rnd = random.Random(77)
    cols = ["Fabric1", "Fabric2", "Fabric3", "Fabric4", "KioskCream", "KioskRed"]
    for z in (0.12, 0.55, 1.0):
        mb.box((1.2, 0.6, 0.025), (0, 0, z), M("SteelDark"))
        for side in (-1, 1):
            x0 = -0.58
            while x0 < 0.5:
                w = rnd.uniform(0.18, 0.4)
                w = min(w, 0.58 - x0)
                mb.box((w - 0.02, 0.24, rnd.uniform(0.18, 0.34)), (x0 + w / 2, side * 0.16, z + 0.14), _m(rnd.choice(cols)))
                x0 += w
    mb.obj("StoreShelf")
    return L.finish("store_shelf", budget=500, view=(1.6, -2.2, 1.3), target_z=0.8)


ASSETS = {
    "store_shelf": store_shelf,
    "rolling_shutter": rolling_shutter,
    "plaza_fountain": plaza_fountain,
    "mall_kiosk": mall_kiosk,
    "clothes_rack": clothes_rack,
    "house_sofa": house_sofa,
    "crt_tv": crt_tv,
    "family_table": family_table,
    "house_bed": house_bed,
    "mailbox": mailbox,
    "old_car": old_car,
    "house_roof": house_roof,
}

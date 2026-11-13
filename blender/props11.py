"""Batch 18 props: the Pakuwon-style mall rebuild (LEVEL 3).

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z). Wall pieces: back on the wall plane (y = 0), sticking out -Y.
Materials whose name starts with "Emit" stay unlit-bright in the game.
"""
import math
import random
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "Gloss": ("#e9e6df", 0.18, 0.0),
        "GlossGrey": ("#b9b7b2", 0.25, 0.0),
        "Chrome": ("#d6d8d8", 0.18, 0.7),
        "SteelDk": ("#3c4043", 0.45, 0.5),
        "Red": ("#a8261f", 0.45, 0.0),
        "RedDark": ("#5e1714", 0.7, 0.0),
        "Yellow": ("#d9b02a", 0.45, 0.0),
        "Blue": ("#2c5d9a", 0.45, 0.0),
        "Pink": ("#d88aa3", 0.5, 0.0),
        "Teal": ("#2f7f7a", 0.45, 0.0),
        "Cream": ("#e6dcc0", 0.6, 0.0),
        "Grey": ("#7f8384", 0.6, 0.0),
        "Dark": ("#1b1c1d", 0.6, 0.0),
        "Wood": ("#8a6440", 0.55, 0.0),
        "WoodPale": ("#c7a77a", 0.55, 0.0),
        "Tile": ("#c9c4b8", 0.35, 0.0),
        "TileDark": ("#8d887d", 0.5, 0.0),
        "Grime": ("#6b6250", 0.95, 0.0),
        "Leaf": ("#5b5a2e", 0.85, 0.0),
        "LeafDead": ("#7a6a3a", 0.9, 0.0),
        "Trunk": ("#5a4632", 0.9, 0.0),
        "Soil": ("#2e261d", 0.95, 0.0),
        "Fabric": ("#3b3f52", 0.9, 0.0),
        "Seat": ("#7a1d1f", 0.85, 0.0),
        "Rubber": ("#151515", 0.9, 0.0),
        "Basket": ("#a8acad", 0.35, 0.6),
        "Coin": ("#b8964c", 0.35, 0.7),
        "Popcorn": ("#ead9a0", 0.9, 0.0),
    }
    if name == "EmitScreen":
        return mat(name, "#cfd6d8", rough=0.6, emit="#aebfc4", strength=0.6)
    if name == "EmitMenu":
        return mat(name, "#e8d8a8", rough=0.6, emit="#e8d0a0", strength=0.8)
    if name == "EmitArcade":
        return mat(name, "#3a7f9a", rough=0.4, emit="#4fb6d8", strength=1.2)
    if name == "EmitBulb":
        return mat(name, "#f4ead0", rough=0.4, emit="#f4e2b8", strength=2.0)
    if name == "EmitMap":
        return mat(name, "#d8dccf", rough=0.6, emit="#c8d0c0", strength=0.7)
    if name == "EmitRed":
        return mat(name, "#d02a20", rough=0.5, emit="#ff2a1a", strength=1.5)
    if name == "Glass":
        return mat(name, "#9fb4b8", rough=0.1, alpha=0.25)
    c, r, mt = extra[name]
    return mat(name, c, rough=r, metal=mt)


# ------------------------------------------------------------- mannequin ----
def _seg(mb, p0, p1, r0, r1, m, segs=6):
    """Cheap tapered limb: a closed frustum from p0 to p1."""
    from mathutils import Vector
    ln = (Vector(p1) - Vector(p0)).length
    mb.lathe([(0.0, -r0 * 0.5), (r0, 0.0), (r1, ln), (0.0, ln + r1 * 0.5)], m, M=L.look_matrix(p0, p1), segs=segs)


def _mannequin(mb, s=1.0):
    g = _m("Gloss")
    # chrome pole on a round base
    mb.cyl(0.24 * s, 0.03, (0, 0, 0.015), _m("Chrome"), segs=12)
    mb.cyl(0.018, 0.5 * s, (0, 0.06 * s, 0.25 * s), _m("Chrome"), segs=6)
    # legs, feet
    for x in (-0.09, 0.09):
        _seg(mb, (x * s, 0, 0.94 * s), (x * 1.1 * s, 0.0, 0.5 * s), 0.075 * s, 0.055 * s, g)
        _seg(mb, (x * 1.1 * s, 0.0, 0.5 * s), (x * 1.15 * s, 0.01, 0.1 * s), 0.055 * s, 0.04 * s, g)
        mb.box((0.08 * s, 0.22 * s, 0.06 * s), (x * 1.15 * s, -0.05 * s, 0.06 * s), g, bevel=0.02)
    # torso: hips, waist, chest, shoulders
    mb.lathe([(0.0, 0.86 * s), (0.15 * s, 0.9 * s), (0.17 * s, 1.0 * s), (0.12 * s, 1.14 * s), (0.15 * s, 1.3 * s),
              (0.17 * s, 1.42 * s), (0.08 * s, 1.5 * s), (0.045 * s, 1.56 * s), (0.0, 1.57 * s)], g, segs=10, sy=0.62)
    # arms hanging slightly away from the body
    for x in (-1, 1):
        _seg(mb, (x * 0.19 * s, 0, 1.43 * s), (x * 0.23 * s, 0.02 * s, 1.16 * s), 0.045 * s, 0.035 * s, g)
        _seg(mb, (x * 0.23 * s, 0.02 * s, 1.16 * s), (x * 0.24 * s, -0.04 * s, 0.92 * s), 0.035 * s, 0.03 * s, g)
    # neck and the featureless egg of a head
    mb.cyl(0.04 * s, 0.1 * s, (0, 0, 1.58 * s), g)
    mb.sphere((0.095 * s, 0.11 * s, 0.13 * s), (0, -0.01 * s, 1.73 * s), g, rot=(10, 0, 0), segs=10, rings=6)


def mannequin():
    """Glossy white shop mannequin on a chrome stand, faceless egg head, 1.85 m."""
    mb = MB()
    _mannequin(mb)
    mb.obj("Mannequin")
    return L.finish("mannequin", budget=1400, view=(1.2, -2.4, 1.3), target_z=1.0)


def mannequin_bust():
    """Headless half mannequin on a tall chrome pole (window display)."""
    mb = MB()
    g = _m("Gloss")
    mb.cyl(0.2, 0.03, (0, 0, 0.015), _m("Chrome"), segs=14)
    mb.cyl(0.02, 1.0, (0, 0, 0.5), _m("Chrome"), segs=6)
    mb.lathe([(0.0, 0.95), (0.14, 0.98), (0.16, 1.08), (0.12, 1.2), (0.15, 1.36), (0.17, 1.48), (0.07, 1.56), (0.04, 1.62), (0.0, 1.62)], g, segs=12, sy=0.62)
    mb.obj("MannequinBust")
    return L.finish("mannequin_bust", budget=500, view=(1.0, -2.0, 1.3), target_z=1.1)


# ---------------------------------------------------------- kiddie ride ----
def kiddie_ride():
    """Coin-operated kiddie ride: a faded red car-shaped elephant on a
    platform with a coin box, 1.4 x 0.9."""
    mb = MB()
    mb.box((1.4, 0.9, 0.22), (0, 0, 0.11), _m("Yellow"), bevel=0.04)
    mb.box((1.3, 0.8, 0.02), (0, 0, 0.225), _m("Grime"))
    body = _m("Pink")
    mb.sphere((0.42, 0.3, 0.32), (0.05, 0, 0.62), body, segs=14, rings=10)
    mb.sphere((0.22, 0.2, 0.22), (-0.42, 0, 0.82), body, segs=12, rings=8)        # head
    for y in (-0.19, 0.19):                                                         # ears
        mb.cyl(0.17, 0.03, (-0.36, y * 1.15, 0.86), body, rot=(90, 0, 0), segs=12)
    mb.limb((-0.6, 0, 0.78), (-0.72, 0, 0.45), 0.07, 0.045, body, segs=8)           # trunk
    mb.limb((-0.72, 0, 0.45), (-0.66, -0.0, 0.32), 0.045, 0.04, body, segs=6)
    for x in (-0.22, 0.3):
        for y in (-0.16, 0.16):
            mb.cyl(0.08, 0.32, (x, y, 0.37), body, segs=8)
    mb.box((0.36, 0.34, 0.07), (0.12, 0, 0.95), _m("Red"), bevel=0.02)            # saddle
    mb.cyl(0.015, 0.3, (-0.18, 0, 1.02), _m("Chrome"), rot=(90, 0, 0), segs=6)     # handle bar
    for y in (-0.06, 0.06):                                                         # dead black eyes
        mb.sphere((0.03, 0.03, 0.03), (-0.6, y * 1.6, 0.9), _m("Dark"), segs=6, rings=4)
    mb.box((0.18, 0.16, 0.5), (0.6, 0.3, 0.45), _m("Red"), bevel=0.02)             # coin box
    mb.box((0.04, 0.005, 0.08), (0.6, 0.215, 0.6), _m("Coin"))
    mb.obj("KiddieRide")
    return L.finish("kiddie_ride", budget=1800, view=(1.8, -2.4, 1.3), target_z=0.6)


# ------------------------------------------------------------ trolley ----
def shopping_trolley():
    """Wire supermarket trolley, 0.95 long, handle at the back (+Y)."""
    mb = MB()
    b, r = _m("Basket"), _m("Rubber")
    # basket as a frame with sparse wires
    L0, W0, z0, z1 = 0.85, 0.52, 0.45, 0.95
    for x in (-W0 / 2, W0 / 2):
        mb.tube([(x, -L0 / 2, z1), (x, L0 / 2, z1)], 0.008, b, segs=4)
        mb.tube([(x * 0.85, -L0 / 2 + 0.05, z0), (x * 0.85, L0 / 2 - 0.15, z0)], 0.008, b, segs=4)
        for k in range(5):
            y = -L0 / 2 + 0.05 + k * (L0 - 0.15) / 4
            mb.tube([(x * 0.85, y, z0), (x, y - 0.05, z1)], 0.006, b, segs=4)
    for y in (-L0 / 2, L0 / 2):
        mb.tube([(-W0 / 2, y, z1), (W0 / 2, y, z1)], 0.008, b, segs=4)
    for k in range(4):
        z = z0 + (k + 0.5) * (z1 - z0) / 4
        mb.tube([(-W0 / 2, -L0 / 2, z), (W0 / 2, -L0 / 2, z)], 0.005, b, segs=4)
    mb.box((W0 * 0.85, L0 - 0.15, 0.01), (0, -0.05, z0), b)
    # chassis, handle, wheels
    for x in (-0.22, 0.22):
        mb.tube([(x, -0.42, 0.1), (x, 0.42, 0.1), (x, 0.46, 1.0)], 0.012, b, segs=4)
    mb.cyl(0.018, 0.56, (0, 0.47, 1.02), _m("Red"), rot=(0, 90, 0), segs=8)
    mb.box((0.4, 0.5, 0.01), (0, 0.05, 0.14), b)
    for x in (-0.22, 0.22):
        for y in (-0.4, 0.4):
            mb.cyl(0.05, 0.03, (x, y, 0.05), r, rot=(0, 90, 0), segs=8)
    mb.obj("ShoppingTrolley")
    return L.finish("shopping_trolley", budget=1600, view=(1.6, -1.8, 1.2), target_z=0.6)


def checkout_lane():
    """Supermarket checkout: counter 2.0 x 0.7 with a belt, register on a post,
    bag rack and a dead red lane lamp. Faces -Y (the cashier stands at +Y)."""
    mb = MB()
    mb.box((2.0, 0.7, 0.85), (0, 0, 0.425), _m("Cream"), bevel=0.02)
    mb.box((1.3, 0.45, 0.02), (-0.3, 0, 0.86), _m("Rubber"))
    mb.box((0.5, 0.6, 0.06), (0.72, 0, 0.88), _m("SteelDk"))
    mb.box((0.36, 0.3, 0.12), (0.72, 0.1, 0.97), _m("Dark"), bevel=0.01)          # register
    mb.box((0.3, 0.04, 0.22), (0.72, 0.05, 1.18), _m("Dark"), rot=(15, 0, 0))
    mb.cyl(0.025, 1.3, (-0.95, 0.3, 1.5), _m("Chrome"), segs=6)
    mb.box((0.22, 0.12, 0.16), (-0.95, 0.3, 2.2), _m("Red"), bevel=0.01)
    mb.box((0.06, 0.006, 0.08), (-0.95, 0.237, 2.2), _m("Cream"))
    mb.box((0.6, 0.35, 0.02), (1.2, -0.15, 0.6), _m("Chrome"))
    mb.obj("CheckoutLane")
    return L.finish("checkout_lane", budget=500, view=(1.8, -2.4, 1.4), target_z=0.8)


# ------------------------------------------------------------ food court ----
def food_stall():
    """Food-court stall front 2.8 wide: counter, steel hood and a lit menu
    board with blank picture panels. Back on the wall plane."""
    mb = MB()
    W = 2.8
    mb.box((W, 0.6, 1.05), (0, -0.35, 0.525), _m("Tile"), bevel=0.01)
    mb.box((W + 0.04, 0.66, 0.05), (0, -0.37, 1.07), _m("SteelDk"))
    mb.box((W, 0.02, 1.05), (0, -0.66, 0.525), _m("TileDark"))
    mb.box((1.0, 0.36, 0.3), (-0.6, -0.42, 1.25), _m("Glass"))                   # sneeze guard / display
    for x in (-0.95, -0.6, -0.25):
        mb.box((0.28, 0.24, 0.05), (x, -0.42, 1.12), _m("Grime"))                  # empty trays
    mb.box((W, 0.5, 0.35), (0, -0.25, 2.55), _m("SteelDk"))                        # hood
    mb.box((W - 0.2, 0.04, 0.55), (0, -0.52, 2.1), _m("EmitMenu"))                 # menu board
    for k in range(4):
        mb.box((0.48, 0.006, 0.34), (-0.92 + k * 0.62, -0.545, 2.1), _m("Grime"))  # sun-faded food photos
    mb.box((0.5, 0.36, 0.5), (1.0, -0.2, 1.33), _m("Chrome"))                      # rice cooker / warmer
    mb.box((0.5, 0.02, 0.06), (1.0, -0.39, 1.4), _m("Dark"))
    mb.obj("FoodStall")
    return L.finish("food_stall", budget=500, view=(1.0, -3.6, 1.6), target_z=1.3)


def cafe_table():
    """Round café table with two chairs, 1.5 across. One chair pulled out."""
    mb = MB()
    mb.cyl(0.38, 0.03, (0, 0, 0.74), _m("WoodPale"), segs=16)
    mb.cyl(0.03, 0.72, (0, 0, 0.37), _m("SteelDk"), segs=6)
    mb.cyl(0.22, 0.02, (0, 0, 0.01), _m("SteelDk"), segs=12)
    for a, d in ((0, 0.55), (180, 0.72)):
        r = math.radians(a)
        cx, cy = math.sin(r) * d, -math.cos(r) * d
        mb.box((0.42, 0.42, 0.04), (cx, cy, 0.46), _m("Wood"))
        bx, by = math.sin(r) * (d + 0.2), -math.cos(r) * (d + 0.2)
        mb.box((0.42, 0.04, 0.42), (bx, by, 0.7), _m("Wood"), rot=(0, 0, -a))
        for sx in (-0.18, 0.18):
            for sy in (-0.18, 0.18):
                mb.cyl(0.015, 0.45, (cx + sx, cy + sy, 0.225), _m("SteelDk"), segs=4)
    mb.cyl(0.04, 0.09, (0.12, 0.05, 0.8), _m("Cream"), segs=8)                     # cup left behind
    mb.obj("CafeTable")
    return L.finish("cafe_table", budget=700, view=(1.6, -2.0, 1.4), target_z=0.5)


# ------------------------------------------------------------ cinema ----
def cinema_screen():
    """A cinema screen 6.0 x 2.3 with black masking, showing nothing but a
    faint grey glow. Wall piece."""
    mb = MB()
    mb.box((6.4, 0.06, 2.62), (0, -0.03, 1.55), _m("Dark"))
    mb.box((6.0, 0.02, 2.3), (0, -0.07, 1.6), _m("EmitScreen"))
    mb.box((6.6, 0.25, 0.25), (0, -0.12, 0.12), _m("RedDark"))
    mb.obj("CinemaScreen")
    return L.finish("cinema_screen", budget=100, view=(0.0, -7.0, 1.6), target_z=1.6, lens=35)


def cinema_seats():
    """Row of four red cinema seats 2.4 wide with cup holders, facing -Y."""
    mb = MB()
    for k in range(4):
        x = -0.9 + k * 0.6
        mb.box((0.52, 0.5, 0.14), (x, -0.02, 0.44), _m("Seat"), rot=(-4, 0, 0))
        mb.box((0.52, 0.12, 0.62), (x, 0.24, 0.78), _m("Seat"), rot=(-12, 0, 0))
    for k in range(5):
        x = -1.2 + k * 0.6
        mb.box((0.07, 0.6, 0.62), (x, 0.03, 0.31), _m("Dark"))
        mb.box((0.09, 0.5, 0.04), (x, 0.0, 0.64), _m("Dark"))
        mb.cyl(0.04, 0.06, (x, -0.22, 0.66), _m("Dark"), segs=6)
    mb.obj("CinemaSeats")
    return L.finish("cinema_seats", budget=900, view=(1.4, -2.6, 1.4), target_z=0.6)


def popcorn_cart():
    """Glass popcorn machine on a red cart, half full of old popcorn."""
    mb = MB()
    mb.box((0.7, 0.5, 0.8), (0, 0, 0.4), _m("Red"), bevel=0.02)
    mb.box((0.62, 0.42, 0.6), (0, 0, 1.11), _m("Glass"))
    mb.box((0.56, 0.36, 0.18), (0, 0, 0.9), _m("Popcorn"))
    mb.box((0.7, 0.5, 0.1), (0, 0, 1.46), _m("Red"), bevel=0.02)
    for x in (-0.31, 0.31):
        for y in (-0.21, 0.21):
            mb.cyl(0.012, 0.6, (x, y, 1.11), _m("Chrome"), segs=4)
    mb.cyl(0.1, 0.1, (0, 0, 1.3), _m("Chrome"), segs=10)
    for x in (-0.25, 0.25):
        mb.cyl(0.06, 0.04, (x, -0.26, 0.06), _m("Rubber"), rot=(0, 90, 0), segs=8)
    mb.obj("PopcornCart")
    return L.finish("popcorn_cart", budget=500, view=(1.2, -1.8, 1.3), target_z=0.8)


# ------------------------------------------------------------ arcade ----
def arcade_cabinet():
    """Upright arcade cabinet 0.75 wide, the screen still faintly lit."""
    mb = MB()
    mb.box((0.75, 0.75, 0.95), (0, 0.05, 0.475), _m("Dark"), bevel=0.02)
    mb.box((0.75, 0.5, 0.9), (0, 0.18, 1.4), _m("Dark"), bevel=0.02)
    mb.box((0.75, 0.3, 0.2), (0, -0.22, 0.98), _m("Blue"), rot=(-20, 0, 0))          # control deck
    for x in (-0.2, 0.15, 0.25):
        mb.cyl(0.025, 0.05, (x, -0.26, 1.04), _m("Red"), segs=8)
    mb.box((0.6, 0.02, 0.48), (0, -0.075, 1.38), _m("EmitArcade"), rot=(-8, 0, 0))
    mb.box((0.75, 0.3, 0.22), (0, 0.1, 1.95), _m("Yellow"), bevel=0.02)            # marquee
    mb.box((0.62, 0.006, 0.12), (0, -0.054, 1.95), _m("Red"))
    mb.box((0.06, 0.006, 0.1), (0, -0.33, 0.6), _m("Coin"))
    mb.obj("ArcadeCabinet")
    return L.finish("arcade_cabinet", budget=400, view=(1.2, -2.0, 1.4), target_z=1.0)


# ------------------------------------------------------------ boulevard ----
def shutter_half():
    """Rolling shutter stuck halfway: slats from 1.3 m up to the 2.55 m box.
    Back on the wall plane."""
    mb = MB()
    W = 2.96
    for k in range(16):
        mb.box((W, 0.03, 0.07), (0, -0.03, 1.32 + k * 0.078), _m("GlossGrey" if k % 2 else "Grey"))
    mb.box((W, 0.05, 0.07), (0, -0.05, 1.3), _m("SteelDk"))
    mb.box((W + 0.1, 0.3, 0.32), (0, -0.15, 2.71), _m("SteelDk"), bevel=0.01)
    mb.box((0.05, 0.03, 0.14), (-0.9, -0.08, 1.24), M("Brass"))                       # handle
    mb.obj("ShutterHalf")
    return L.finish("shutter_half", budget=400, view=(0.5, -3.5, 1.8), target_z=1.8)


def info_totem():
    """Mall directory totem 0.7 x 2.1: lit floor plan, red YOU-ARE-HERE dot."""
    mb = MB()
    mb.box((0.7, 0.3, 2.1), (0, 0, 1.05), _m("SteelDk"), bevel=0.02)
    mb.box((0.56, 0.02, 1.2), (0, -0.155, 1.25), _m("EmitMap"))
    rnd = random.Random(33)
    for _ in range(14):
        w, h = rnd.uniform(0.06, 0.18), rnd.uniform(0.05, 0.16)
        mb.box((w, 0.004, h), (rnd.uniform(-0.22, 0.22), -0.167, rnd.uniform(0.75, 1.75)), _m(rnd.choice(["Blue", "Teal", "Yellow", "Grey", "Pink"])))
    mb.box((0.5, 0.004, 0.06), (0, -0.167, 1.25), _m("Cream"))
    mb.cyl(0.025, 0.006, (0.05, -0.168, 1.1), _m("Red"), rot=(90, 0, 0), segs=8)
    mb.box((0.56, 0.02, 0.16), (0, -0.155, 1.98), _m("Red"))
    mb.obj("InfoTotem")
    return L.finish("info_totem", budget=300, view=(0.8, -2.2, 1.4), target_z=1.1)


def planter_bench():
    """Square granite planter 1.8 x 1.8 with a seat ledge and a dying palm."""
    mb = MB()
    mb.box((1.8, 1.8, 0.45), (0, 0, 0.225), _m("TileDark"), bevel=0.02)
    mb.box((1.9, 1.9, 0.06), (0, 0, 0.48), _m("Tile"), bevel=0.02)
    mb.box((1.5, 1.5, 0.02), (0, 0, 0.5), _m("Soil"))
    pts = [(0, 0, 0.5), (0.05, 0.02, 1.2), (0.12, 0.0, 1.9), (0.16, -0.03, 2.35)]
    mb.tube(pts, 0.08, _m("Trunk"), segs=8)
    rnd = random.Random(5)
    top = pts[-1]
    for k in range(8):
        a = k * 2 * math.pi / 8 + rnd.uniform(-0.2, 0.2)
        ln = rnd.uniform(0.8, 1.15)
        droop = rnd.uniform(0.5, 1.1)
        p1 = (top[0] + math.cos(a) * ln * 0.5, top[1] + math.sin(a) * ln * 0.5, top[2] + 0.1)
        p2 = (top[0] + math.cos(a) * ln, top[1] + math.sin(a) * ln, top[2] - droop)
        mb.ribbon([top, p1, p2], 0.22, _m("LeafDead" if k % 3 == 0 else "Leaf"), normal=(0, 0, 1))
    for _ in range(4):                                                                 # fallen fronds
        x, y = rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6)
        mb.box((0.5, 0.12, 0.01), (x, y, 0.52), _m("LeafDead"), rot=(0, 0, rnd.uniform(0, 180)))
    mb.obj("PlanterBench")
    return L.finish("planter_bench", budget=900, view=(2.2, -2.8, 1.8), target_z=1.0)


def stroller():
    """Abandoned baby stroller with its hood up, facing -Y."""
    mb = MB()
    f = _m("SteelDk")
    for x in (-0.22, 0.22):
        mb.tube([(x, -0.35, 0.1), (x, -0.05, 0.45), (x, 0.3, 0.1)], 0.012, f, segs=4)
        mb.tube([(x, -0.05, 0.45), (x, 0.3, 1.0)], 0.012, f, segs=4)
        for y in (-0.35, 0.3):
            mb.cyl(0.08, 0.03, (x, y, 0.08), _m("Rubber"), rot=(0, 90, 0), segs=10)
    mb.cyl(0.015, 0.48, (0, 0.3, 1.0), _m("Rubber"), rot=(0, 90, 0), segs=6)
    mb.box((0.44, 0.6, 0.22), (0, -0.05, 0.55), _m("Fabric"), bevel=0.04)
    mb.box((0.44, 0.08, 0.4), (0, 0.22, 0.75), _m("Fabric"), rot=(-20, 0, 0), bevel=0.03)
    mb.lathe([(0.0, 0.0), (0.24, 0.0), (0.24, 0.02), (0.0, 0.02)], _m("Fabric"), segs=12,
             M=L._mat4(loc=(0, 0.12, 0.72), rot=(0, 90, 0)), close=True)
    mb.sphere((0.23, 0.3, 0.26), (0, 0.06, 0.74), _m("Fabric"), segs=12, rings=6)    # hood
    mb.obj("Stroller")
    return L.finish("stroller", budget=900, view=(1.4, -1.6, 1.0), target_z=0.6)


def wet_floor_sign():
    """Yellow A-frame 'AWAS LANTAI LICIN' warning sign."""
    mb = MB()
    y = _m("Yellow")
    mb.box((0.3, 0.02, 0.62), (0, -0.1, 0.31), y, rot=(-10, 0, 0))
    mb.box((0.3, 0.02, 0.62), (0, 0.1, 0.31), y, rot=(10, 0, 0))
    mb.box((0.18, 0.004, 0.16), (0, -0.165, 0.38), _m("Dark"), rot=(-10, 0, 0))
    mb.obj("WetFloorSign")
    return L.finish("wet_floor_sign", budget=100, view=(0.8, -1.2, 0.6), target_z=0.35)


def info_desk():
    """Customer-service desk 2.6 x 0.9: red front panel, counter, an old
    paging microphone and a stack of LOST CHILD forms."""
    mb = MB()
    mb.box((2.6, 0.8, 1.05), (0, 0, 0.525), _m("Cream"), bevel=0.03)
    mb.box((2.7, 0.04, 0.6), (0, -0.42, 0.6), _m("Red"))
    mb.box((2.7, 0.9, 0.04), (0, -0.02, 1.07), _m("WoodPale"))
    mb.cyl(0.06, 0.03, (0.6, 0.15, 1.1), _m("Dark"), segs=10)
    mb.tube([(0.6, 0.15, 1.1), (0.6, 0.12, 1.3), (0.55, 0.05, 1.38)], 0.008, _m("SteelDk"), segs=4)
    mb.sphere((0.03, 0.03, 0.04), (0.54, 0.03, 1.4), _m("Dark"), segs=8, rings=6)
    for k in range(5):
        mb.box((0.21, 0.29, 0.004), (-0.6 + k * 0.02, 0.1, 1.095 + k * 0.004), M("Paper"), rot=(0, 0, k * 7))
    mb.box((0.5, 0.5, 0.05), (-1.6, 0.5, 0.025), _m("Dark"))                           # monitor stand behind
    mb.obj("InfoDesk")
    return L.finish("info_desk", budget=500, view=(1.6, -3.0, 1.6), target_z=0.8)


def atrium_stage():
    """Event stage 6 x 3 m in the grand atrium: black riser, truss gate and a
    blank banner, a microphone stand left in the middle. Back at +Y."""
    mb = MB()
    mb.box((6.0, 3.0, 0.45), (0, 0, 0.225), _m("Dark"), bevel=0.01)
    mb.box((6.04, 0.04, 0.42), (0, -1.52, 0.22), _m("RedDark"))
    tr = _m("Chrome")
    for x in (-2.9, 2.9):
        for dy in (-0.15, 0.15):
            for dx in (-0.15, 0.15):
                mb.cyl(0.02, 3.6, (x + dx, 1.2 + dy, 2.25), tr, segs=4)
    for dy in (-0.15, 0.15):
        for dz in (-0.15, 0.15):
            mb.cyl(0.02, 6.1, (0, 1.2 + dy, 3.9 + dz), tr, rot=(0, 90, 0), segs=4)
    mb.box((5.4, 0.03, 2.2), (0, 1.25, 2.55), _m("Cream"))                            # blank banner
    mb.box((5.4, 0.032, 0.3), (0, 1.25, 1.55), _m("Red"))
    mb.cyl(0.12, 0.02, (0.2, -0.3, 0.46), _m("Dark"), segs=10)
    mb.cyl(0.01, 1.4, (0.2, -0.3, 1.15), _m("Dark"), segs=4)
    mb.sphere((0.03, 0.03, 0.05), (0.2, -0.33, 1.87), _m("Dark"), segs=8, rings=6)
    for x in (-2.0, 2.0):                                                              # speaker stacks
        mb.box((0.6, 0.5, 1.0), (x, 0.6, 0.95), _m("Dark"), bevel=0.02)
        mb.cyl(0.18, 0.02, (x, 0.34, 1.05), _m("Grey"), rot=(90, 0, 0), segs=12)
    mb.obj("AtriumStage")
    return L.finish("atrium_stage", budget=1500, view=(5.0, -7.0, 3.2), target_z=1.6, lens=35)


def atrium_chandelier():
    """Ring chandelier 4 m across hung from three cables, a few bulbs still
    working. Origin at its lowest point; cables reach 3 m up."""
    mb = MB()
    R = 2.0
    pts = [(R * math.cos(a), R * math.sin(a), 0.2) for a in [k * 2 * math.pi / 24 for k in range(25)]]
    mb.tube(pts, 0.05, _m("Coin"), segs=6, caps=False)
    pts2 = [(R * 0.6 * math.cos(a), R * 0.6 * math.sin(a), 0.6) for a in [k * 2 * math.pi / 16 for k in range(17)]]
    mb.tube(pts2, 0.04, _m("Coin"), segs=6, caps=False)
    for k in range(3):
        a = k * 2 * math.pi / 3
        mb.tube([(R * math.cos(a), R * math.sin(a), 0.2), (0, 0, 3.0)], 0.01, _m("SteelDk"), segs=4)
    for k in range(12):
        a = k * 2 * math.pi / 12
        on = k % 4 != 1
        mb.sphere((0.09, 0.09, 0.11), (R * math.cos(a), R * math.sin(a), 0.06), _m("EmitBulb" if on else "Grey"), segs=8, rings=6)
    for k in range(6):
        a = k * 2 * math.pi / 6 + 0.3
        mb.sphere((0.07, 0.07, 0.09), (R * 0.6 * math.cos(a), R * 0.6 * math.sin(a), 0.48), _m("EmitBulb"), segs=8, rings=6)
    mb.obj("AtriumChandelier")
    return L.finish("atrium_chandelier", budget=2000, view=(3.0, -5.0, 2.5), target_z=0.6, floor=False)


def fountain_basin():
    """The grand atrium's dry fountain: a 9 x 6 m tiled basin with a 6 cm lip,
    grime where the water stood, dead jets, coins and a cracked centre."""
    mb = MB()
    W, D = 9.0, 6.0
    mb.box((W, D, 0.02), (0, 0, 0.01), _m("Tile"))
    for (sx, sy, x, y) in ((W, 0.3, 0, -D / 2), (W, 0.3, 0, D / 2), (0.3, D, -W / 2, 0), (0.3, D, W / 2, 0)):
        mb.box((sx + 0.02, sy, 0.07), (x, y, 0.035), _m("TileDark"), bevel=0.01)
    mb.box((W - 1.0, D - 1.0, 0.004), (0, 0, 0.022), _m("Grime"))
    mb.box((W - 2.4, D - 2.4, 0.004), (0, 0, 0.025), _m("TileDark"))
    rnd = random.Random(8)
    for i in range(5):
        for j in range(3):
            x, y = -3.2 + i * 1.6, -1.8 + j * 1.8
            mb.cyl(0.06, 0.08, (x, y, 0.06), _m("Chrome"), segs=6)
    for _ in range(30):
        mb.box((0.025, 0.025, 0.003), (rnd.uniform(-3.5, 3.5), rnd.uniform(-2.2, 2.2), 0.029), _m("Coin"), rot=(0, 0, rnd.uniform(0, 90)))
    for _ in range(6):                                                                  # cracks
        x, y = rnd.uniform(-2, 2), rnd.uniform(-1.4, 1.4)
        mb.box((rnd.uniform(0.6, 1.6), 0.015, 0.004), (x, y, 0.03), _m("Dark"), rot=(0, 0, rnd.uniform(0, 180)))
    mb.obj("FountainBasin")
    return L.finish("fountain_basin", budget=1200, view=(6.0, -8.0, 5.0), target_z=0.0, lens=35)


def sale_banner():
    """Hanging red banner 2.4 x 0.8 'SALE 70%' printed in white blocks,
    for the gallery fascias. Wall piece, hangs below its origin height."""
    mb = MB()
    mb.box((2.4, 0.01, 0.8), (0, -0.01, -0.4), _m("Red"))
    mb.text("SALE 70%", 0.36, _m("Cream"), M=L._mat4(loc=(0, -0.018, -0.42)), extrude=0.0, bold=True)
    mb.obj("SaleBanner")
    return L.finish("sale_banner", budget=1500, view=(0.0, -3.0, -0.4), target_z=-0.4, floor=False)


ASSETS = {
    "mannequin": mannequin,
    "mannequin_bust": mannequin_bust,
    "kiddie_ride": kiddie_ride,
    "shopping_trolley": shopping_trolley,
    "checkout_lane": checkout_lane,
    "food_stall": food_stall,
    "cafe_table": cafe_table,
    "cinema_screen": cinema_screen,
    "cinema_seats": cinema_seats,
    "popcorn_cart": popcorn_cart,
    "arcade_cabinet": arcade_cabinet,
    "shutter_half": shutter_half,
    "info_totem": info_totem,
    "planter_bench": planter_bench,
    "stroller": stroller,
    "wet_floor_sign": wet_floor_sign,
    "info_desk": info_desk,
    "atrium_stage": atrium_stage,
    "atrium_chandelier": atrium_chandelier,
    "fountain_basin": fountain_basin,
    "sale_banner": sale_banner,
}

"""Small pickup items. Origin = centre of the object's bounding box."""
import math
import random
from mathutils import Vector, Matrix
import bpy
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _center(ob):
    """Move mesh data so the bbox centre is at the object origin (0,0,0)."""
    vs = [v.co for v in ob.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    ob.data.transform(Matrix.Translation(-(mn + mx) / 2))
    return ob


def item_fuse():
    """Cartridge fuse, long axis along Blender Z (three.js Y)."""
    mb = MB()
    glass = mat("FuseGlass", "#cfe0dc", rough=0.05, alpha=0.35)
    brass = M("Brass")
    fil = mat("EmitFilament", "#ff8a2a", rough=0.5, emit="#ff7a1a", strength=2.5)
    Lh = 0.12
    cap = 0.022
    mb.cyl(0.0145, Lh - 2 * cap + 0.004, (0, 0, 0), glass, segs=16)
    for s in (-1, 1):
        z = s * (Lh / 2 - cap / 2)
        mb.cyl(0.0165, cap, (0, 0, z), brass, segs=16)
        mb.cyl(0.0175, 0.004, (0, 0, s * (Lh / 2 - cap + 0.002)), brass, segs=16)
        mb.cyl(0.012, 0.004, (0, 0, s * (Lh / 2 + 0.001)), brass, segs=16, r2=0.008 if s > 0 else 0.012)
    # filament: thin wavy wire with a thicker "element" bead in the middle
    pts = [(0.0025 * math.sin(k * 1.3), 0.0, -0.038 + 0.076 * k / 16) for k in range(17)]
    mb.tube(pts, 0.0011, fil, segs=5)
    mb.sphere((0.0028, 0.0028, 0.006), (0, 0, 0), fil, segs=8, rings=5)
    # printed rating band
    mb.cyl(0.0147, 0.008, (0, 0, -0.022), mat("FuseLabel", "#2b2b2b", rough=0.5), segs=16)
    ob = mb.obj("Fuse")
    return L.finish("item_fuse", view=(1.0, -1.6, 0.4), floor=False)


def item_key():
    """Old brass key lying flat (thin in Z), long axis along X, tag hangs at +X? no:
    bow at -X, bit at +X. Red paper tag tied to the bow."""
    mb = MB()
    brass = mat("KeyBrass", "#c09a48", rough=0.32, metal=0.6)
    tag = mat("TagRed", "#a5221b", rough=0.85)
    string = mat("String", "#d8cfb5", rough=0.9)
    # bow: ring (torus-like via lathe of circle profile around Z)
    R, r = 0.016, 0.0035
    prof = [(R + r * math.cos(a), r * math.sin(a)) for a in [math.pi / 2 - 2 * math.pi * k / 10 for k in range(11)]]
    prof = [(R + r * math.cos(math.radians(-90 + 36 * k)), r * math.sin(math.radians(-90 + 36 * k))) for k in range(11)]
    mb.lathe(prof, brass, M=Matrix.Translation((-0.03, 0, 0)), segs=20, close=False, sy=1.0)
    # decorative collar + shaft
    mb.cyl(0.0042, 0.006, (-0.012, 0, 0), brass, rot=(0, 90, 0), segs=10)
    mb.cyl(0.0052, 0.003, (-0.007, 0, 0), brass, rot=(0, 90, 0), segs=10)
    mb.cyl(0.0032, 0.06, (0.024, 0, 0), brass, rot=(0, 90, 0), segs=10)
    mb.sphere((0.0035, 0.0035, 0.0035), (0.054, 0, 0), brass, segs=8, rings=5)
    # bit (teeth) hanging toward -Y
    mb.prism([(0.036, 0.0), (0.052, 0.0), (0.052, -0.012), (0.047, -0.012), (0.047, -0.016),
              (0.042, -0.016), (0.042, -0.009), (0.036, -0.009)], 0.004, brass, axis="Z",
             M=Matrix.Translation((0, -0.002, 0)))
    # tag: string loop + rectangular tag with hole, slightly bent
    mb.tube([(-0.045, 0.0, 0.0), (-0.055, 0.004, 0.0), (-0.066, 0.012, 0.0005), (-0.074, 0.02, 0.001)], 0.0008, string,
            segs=4, caps=False)
    T = Matrix.Translation((-0.09, 0.032, 0.001)) @ Matrix.Rotation(math.radians(-35), 4, "Z")
    mb.prism([(-0.02, -0.012), (0.012, -0.012), (0.02, 0.0), (0.012, 0.012), (-0.02, 0.012)], 0.0008, tag,
             axis="Z", M=T)
    mb.cyl(0.0035, 0.0012, (0, 0, 0), mat("TagEyelet", "#c8c0aa", rough=0.6), segs=10,
           M=T @ Matrix.Translation((0.012, 0, 0)))
    ob = mb.obj("Key")
    _center(ob)
    return L.finish("item_key", view=(0.5, -1.0, 1.4))


def item_battery():
    """Camcorder battery pack, ~0.1 x 0.056 x 0.034, contacts on +X end."""
    mb = MB()
    body = mat("BatteryBody", "#26282b", rough=0.45)
    label = mat("BatteryLabel", "#d9a72b", rough=0.5)
    gold = mat("Contacts", "#c9a24a", rough=0.3, metal=0.6)
    W, D, H = 0.1, 0.056, 0.034
    mb.box((W, D, H), (0, 0, 0), body, bevel=0.005, segs=2)
    mb.box((W * 0.7, D + 0.001, H * 0.32), (-0.008, 0, 0.002), label, bevel=0.001)
    mb.box((W * 0.7, 0.0012, H * 0.08), (-0.008, -D / 2 - 0.0006, -0.007), mat("BatteryStripe", "#b8261c", rough=0.5))
    mb.text("9.6V  2100mAh", 0.0065, body, extrude=0.0, M=Matrix.Translation((-0.01, -D / 2 - 0.0012, 0.004)))
    # grip ridges on top
    for k in range(6):
        mb.box((0.003, D * 0.7, 0.0015), (0.03 + k * 0.006 - 0.05, 0, H / 2 + 0.0005), body)
    # contacts
    for k in range(3):
        mb.box((0.002, 0.008, 0.012), (W / 2 + 0.0005, -0.015 + k * 0.015, -0.004), gold)
    # rail slot
    mb.box((W * 0.85, 0.006, 0.003), (0, 0, -H / 2 - 0.0004), mat("BatterySlot", "#111214", rough=0.6))
    ob = mb.obj("Battery")
    return L.finish("item_battery", view=(1.0, -1.4, 0.9))


def item_note():
    """Lined paper, lying flat (normal +Z), 0.21 (X) x 0.28 (Y), slightly crumpled."""
    mb = MB()
    paper = mat("NotePaper", double=True, color="#ece6d2", rough=0.9)
    lines = mat("NoteLines", double=True, color="#7c98bf", rough=0.9)
    margin = mat("NoteMargin", double=True, color="#c46b6b", rough=0.9)
    ink = mat("NoteInk", double=True, color="#1e2340", rough=0.7)
    rnd = random.Random(5)
    W, H = 0.21, 0.28
    fx = [(rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.6, 1.4)) for _ in range(5)]

    def h(x, y):
        z = 0.0
        # two folds + random crumples + curled corner
        z += 0.004 * abs(math.sin((y / H) * math.pi * 1.5))
        z += 0.003 * abs(math.sin((x / W) * math.pi))
        for (a, b, f) in fx:
            z += 0.0016 * math.sin(f * 30 * x + a * 3) * math.cos(f * 26 * y + b * 3)
        cx, cy = x - W / 2, y - H / 2
        if cx > 0.06 and cy > 0.09:
            z += ((cx - 0.06) + (cy - 0.09)) ** 2 * 0.9
        return z

    nx, ny = 10, 14
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            x, y = -W / 2 + W * i / nx, -H / 2 + H * j / ny
            verts.append((x, y, h(x + W / 2, y + H / 2)))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    # top surface + bottom (flipped) slightly below
    mb.raw(verts, faces, paper, smooth=True)
    mb.raw([(v[0], v[1], v[2] - 0.0006) for v in verts], [tuple(reversed(f)) for f in faces], paper, smooth=True)

    def on(x, y, lift=0.0004):
        return (x, y, h(x + W / 2, y + H / 2) + lift)

    def line(x0, x1, y, mat_, w=0.0007, n=10):
        mb.ribbon([on(x0 + (x1 - x0) * k / n, y) for k in range(n + 1)], w, mat_, normal=(0, 0, 1))

    y = H / 2 - 0.035
    while y > -H / 2 + 0.01:
        line(-W / 2 + 0.003, W / 2 - 0.003, y, lines)
        y -= 0.0071 * 1.0 + 0.0
    mb.ribbon([on(-W / 2 + 0.032, -H / 2 + 0.002 + (H - 0.004) * k / 12, 0.0005) for k in range(13)], 0.0008, margin,
              normal=(0, 0, 1))
    # handwriting scrawl lines (ink) on the first rows
    yy = H / 2 - 0.035 + 0.003
    for row in range(9):
        x0 = -W / 2 + 0.038
        ln = rnd.uniform(0.09, 0.16) if row != 8 else 0.06
        pts = []
        n = int(ln / 0.0025)
        for k in range(n + 1):
            x = x0 + ln * k / n
            pts.append(on(x, yy - row * 0.0142 + 0.0022 * math.sin(k * 1.9 + row) * (1 if k % 7 else 0.2), 0.0007))
        mb.ribbon(pts, 0.0009, ink, normal=(0, 0, 1))
    ob = mb.obj("Note")
    _center(ob)
    return L.finish("item_note", view=(0.4, -0.9, 1.6))


def item_tape():
    """VHS cassette lying flat (label side up = +Z), 0.187 x 0.103 x 0.025;
    spine label faces -Y."""
    mb = MB()
    plastic = mat("VHSPlastic", "#151515", rough=0.4)
    window = mat("VHSWindow", "#3a3e44", rough=0.1, alpha=0.6)
    reel = mat("VHSTape", "#2b1d14", rough=0.35, metal=0.2)
    hub = mat("VHSHub", "#d8d8d2", rough=0.5)
    label = mat("VHSLabel", "#efe9d6", rough=0.9)
    ink = mat("VHSInk", "#1d2a73", rough=0.6)
    W, D, H = 0.187, 0.103, 0.025
    mb.box((W, D, H), (0, 0, 0), plastic, bevel=0.002)
    # window recess on top showing reels
    mb.box((0.09, 0.03, 0.001), (0, 0.012, H / 2 + 0.0002), window)
    for s in (-1, 1):
        mb.cyl(0.026, 0.002, (s * 0.046, 0.012, H / 2 - 0.0005), reel, segs=18)
        mb.cyl(0.011, 0.0025, (s * 0.046, 0.012, H / 2 - 0.0002), hub, segs=12)
    # top label
    mb.box((0.13, 0.026, 0.0006), (0, -0.03, H / 2 + 0.0003), label)
    # handwritten-looking text (sheared)
    mb.text("DON'T ERASE", 0.011, ink, extrude=0.0, align="LEFT",
            M=Matrix.Translation((-0.058, -0.03, H / 2 + 0.0008)) @ Matrix.Rotation(math.radians(-90), 4, "X") @
            Matrix.Shear("XY", 4, (0.25, 0)) @ Matrix.Rotation(math.radians(2), 4, "Y"))
    # spine label (front, -Y)
    mb.box((0.145, 0.0006, 0.016), (0, -D / 2 - 0.0003, 0), label)
    mb.text("HALL B  11/12", 0.0085, ink, extrude=0.0,
            M=Matrix.Translation((0, -D / 2 - 0.0008, 0)) @ Matrix.Shear("XY", 4, (0.25, 0)))
    # screw holes / feet
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.cyl(0.003, 0.001, (sx * 0.08, sy * 0.04, -H / 2 - 0.0003), hub, segs=8)
    ob = mb.obj("Tape")
    return L.finish("item_tape", view=(0.6, -1.2, 1.1))


def item_eraser():
    """Chalkboard eraser lying felt-side down: wooden block 0.14 x 0.055 x 0.03
    on a grey felt pad dusted with chalk. Throwable distraction item."""
    mb = MB()
    wood = mat("EraserWood", "#8a5a32", rough=0.55)
    felt = mat("EraserFelt", "#5a5a58", rough=1.0)
    dust = mat("ChalkDust", "#e8e6dc", rough=1.0)
    stamp = mat("EraserInk", "#2a1c12", rough=0.7)
    W, D = 0.14, 0.055
    mb.box((W, D, 0.018), (0, 0, 0.011 + 0.009), wood, bevel=0.005, segs=2)
    mb.box((W * 1.002, D * 1.002, 0.012), (0, 0, 0.006), felt, bevel=0.001)
    # chalk dust smudges on the felt edge and sides
    random.seed(7)
    for _ in range(9):
        x = random.uniform(-W / 2 + 0.01, W / 2 - 0.01)
        s = random.choice((-1, 1))
        mb.box((random.uniform(0.008, 0.02), 0.0008, random.uniform(0.004, 0.009)),
               (x, s * (D / 2 + 0.0006), random.uniform(0.004, 0.009)), dust)
    mb.box((W * 0.96, D * 0.9, 0.0006), (0, 0, -0.0002), dust)
    # finger grooves along the top
    for s in (-1, 1):
        mb.box((W * 0.8, 0.004, 0.003), (0, s * 0.014, 0.0295), stamp)
    ob = mb.obj("Eraser")
    _center(ob)
    return L.finish("item_eraser", view=(0.5, -1.0, 0.9))


def item_alarm():
    """Wind-up twin-bell alarm clock standing upright, about 0.11 x 0.15 x 0.06 m.
    Face towards Blender -Y (three.js +Z). Decoy item: the player winds it,
    sets it down and it rings a few seconds later."""
    mb = MB()
    body = mat("AlarmBody", "#9c2f26", rough=0.35, metal=0.3)
    chrome = mat("AlarmChrome", "#c9ccd0", rough=0.2, metal=0.8)
    face = mat("AlarmFace", "#efe8d2", rough=0.8)
    ink = mat("AlarmInk", "#1c1a17", rough=0.7)
    R = 0.05
    mb.cyl(R, 0.044, (0, 0, R + 0.012), body, rot=(90, 0, 0), segs=24)
    mb.cyl(R + 0.004, 0.006, (0, -0.02, R + 0.012), chrome, rot=(90, 0, 0), segs=24)
    mb.cyl(R - 0.004, 0.003, (0, -0.0235, R + 0.012), face, rot=(90, 0, 0), segs=24)
    # hour marks and hands (stuck at one minute to twelve)
    for k in range(12):
        a = math.radians(k * 30)
        mb.box((0.003, 0.0012, 0.008), (math.sin(a) * 0.038, -0.0252, R + 0.012 + math.cos(a) * 0.038), ink, rot=(0, math.degrees(a), 0))
    mb.box((0.0035, 0.0012, 0.026), (-0.004, -0.0256, R + 0.012 + 0.012), ink, rot=(0, -18, 0))
    mb.box((0.0025, 0.0012, 0.034), (-0.0016, -0.026, R + 0.012 + 0.016), ink, rot=(0, -6, 0))
    mb.cyl(0.004, 0.003, (0, -0.0262, R + 0.012), chrome, rot=(90, 0, 0), segs=10)
    # legs
    for s in (-1, 1):
        mb.limb((s * 0.028, 0.0, 0.022), (s * 0.042, 0.0, 0.0), 0.005, 0.004, chrome, segs=8)
        mb.sphere((0.006, 0.006, 0.004), (s * 0.042, 0, 0.002), chrome, segs=8, rings=5)
    # twin bells, posts, hammer and carry handle
    for s in (-1, 1):
        mb.limb((s * 0.022, 0, R * 2 + 0.006), (s * 0.03, 0, R * 2 + 0.022), 0.003, 0.003, chrome, segs=6)
        mb.sphere((0.024, 0.024, 0.014), (s * 0.032, 0, R * 2 + 0.03), chrome, rot=(0, s * 24, 0), segs=14, rings=7)
        mb.sphere((0.004, 0.004, 0.004), (s * 0.038, 0, R * 2 + 0.045), chrome, segs=6, rings=4)
    mb.limb((0, 0, R * 2 + 0.008), (0, 0, R * 2 + 0.03), 0.002, 0.002, chrome, segs=6)
    mb.sphere((0.006, 0.006, 0.006), (0, 0, R * 2 + 0.032), chrome, segs=8, rings=5)
    pts = [(math.sin(math.radians(a)) * 0.03, 0, R * 2 + 0.038 + math.cos(math.radians(a)) * 0.02) for a in range(-80, 81, 20)]
    mb.tube(pts, 0.0022, chrome, segs=6)
    # winding key on the back
    mb.cyl(0.003, 0.012, (0, 0.028, R + 0.004), chrome, rot=(90, 0, 0), segs=8)
    mb.box((0.02, 0.003, 0.012), (0, 0.035, R + 0.004), chrome, bevel=0.001)
    ob = mb.obj("Alarm")
    _center(ob)
    return L.finish("item_alarm", view=(0.6, -1.5, 0.5))


ASSETS = {
    "item_alarm": item_alarm,
    "item_eraser": item_eraser,
    "item_fuse": item_fuse,
    "item_key": item_key,
    "item_battery": item_battery,
    "item_note": item_note,
    "item_tape": item_tape,
}

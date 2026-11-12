"""Batch 13 props: the tall poolrooms (LEVEL 4).

Conventions as in props.py: metres, origin floor level, front = Blender -Y
(three.js +Z).
"""
import hr_lib as L
from hr_lib import MB, mat
from props import M


def _m(name):
    extra = {
        "TileWhite": ("#e9eef0", 0.25, 0.0),
        "TileBlue": ("#5aa6b8", 0.3, 0.0),
        "Fibre": ("#d8b13a", 0.35, 0.0),
        "Board": ("#e8e4d8", 0.4, 0.0),
        "Tread": ("#4c8fa4", 0.6, 0.0),
    }
    c, r, mt = extra[name]
    return mat(name, c, rough=r, metal=mt)


def slide_top():
    """Start platform of a water slide: tiled block with four steps rising to
    0.95 m and chrome hand rails. The slide leaves towards -Y."""
    mb = MB()
    tile, chrome = _m("TileWhite"), M("Chrome")
    for k in range(4):
        h = 0.24 * (k + 1)
        mb.box((1.1, 0.3, h), (0, 0.75 - k * 0.3, h / 2), tile, bevel=0.01)
        mb.box((1.1, 0.3, 0.02), (0, 0.75 - k * 0.3, h + 0.01), _m("Tread"))
    mb.box((1.1, 0.5, 0.96), (0, -0.5, 0.48), tile, bevel=0.01)
    mb.box((1.1, 0.5, 0.02), (0, -0.5, 0.97), _m("Tread"))
    for x in (-0.6, 0.6):
        mb.tube([(x, 0.95, 0.1), (x, 0.9, 0.95), (x, 0.0, 1.95), (x, -0.55, 1.95), (x, -0.7, 1.6)], 0.025, chrome, segs=6)
        mb.tube([(x, -0.7, 1.6), (x, -0.72, 0.96)], 0.025, chrome, segs=6)
    mb.box((1.3, 0.04, 0.06), (0, -0.62, 2.0), _m("Fibre"))
    mb.obj("SlideTop")
    return L.finish("slide_top", budget=900, view=(1.6, -2.2, 1.4), target_z=0.9)


def diving_board():
    """Diving board on a tiled plinth, sticking 2.4 m out towards -Y."""
    mb = MB()
    mb.box((0.8, 0.8, 0.5), (0, 0.4, 0.25), _m("TileWhite"), bevel=0.01)
    mb.box((0.55, 2.8, 0.06), (0, -0.9, 0.56), _m("Board"), bevel=0.01)
    mb.box((0.5, 2.6, 0.005), (0, -0.95, 0.592), _m("Tread"))
    mb.box((0.3, 0.3, 0.12), (0, 0.15, 0.47), M("Chrome"))
    for x in (-0.38, 0.38):
        mb.tube([(x, 0.7, 0.5), (x, 0.6, 1.4), (x, -0.1, 1.4), (x, -0.15, 0.6)], 0.022, M("Chrome"), segs=6)
    mb.obj("DivingBoard")
    return L.finish("diving_board", budget=500, view=(1.8, -2.4, 1.3), target_z=0.6)


ASSETS = {
    "slide_top": slide_top,
    "diving_board": diving_board,
}

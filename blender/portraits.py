"""Batch 9: horror portraits of each resident for the level cards / archive.

Re-imports each exported GLB, poses it on its Idle clip and renders a dark,
under-lit head-and-shoulders shot to assets/ui/portraits/<kind>.png.
"""
import math
import os
import bpy
from mathutils import Vector
import hr_lib as L

OUT = os.path.join(os.path.dirname(L.MODELS), "ui", "portraits")
os.makedirs(OUT, exist_ok=True)

# kind: (objects to frame, view direction, framing margin)
SHOTS = {
    "pale": (["Head_geo", "Neck_geo"], (-0.15, -1.0, 0.1), 1.05),
    "gaper": (["Head_geo", "Neck_geo"], (0.35, -1.0, -0.05), 1.15),
    "shade": (["Head_geo", "Chest_geo"], (0.2, -1.0, 0.0), 1.05),
    "eyes": (["Head_geo"], (0.0, -1.0, 0.0), 0.95),
    "centipede": (["Head_geo"], (0.3, -1.0, 0.0), 1.05),
}


def _portrait(kind):
    L.reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(L.MODELS, f"entity_{kind}.glb"))
    for o in bpy.context.scene.objects:
        if o.animation_data:
            o.animation_data.action = bpy.data.actions.get(f"Idle_{o.name}")
    bpy.context.scene.frame_set(8)
    bpy.context.view_layer.update()
    names, view, margin = SHOTS[kind]
    objs = [bpy.data.objects[n] for n in names if n in bpy.data.objects]
    mn, mx = L._bbox(objs)
    ctr = (mn + mx) / 2
    rad = max((mx - mn).length / 2, 0.05)
    scn = bpy.context.scene
    cam_d = bpy.data.cameras.new("pc"); cam_d.lens = 85
    cam = bpy.data.objects.new("pc", cam_d); scn.collection.objects.link(cam)
    fov = 2 * math.atan(18.0 / 85)
    d = Vector(view).normalized()
    cam.location = ctr + d * (rad / math.sin(fov / 2) * margin)
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scn.camera = cam

    def light(kind_, energy, off, color, size=0.5):
        ld = bpy.data.lights.new("l", kind_); ld.energy = energy; ld.color = color
        if kind_ == "AREA":
            ld.size = size
        lo = bpy.data.objects.new("l", ld); scn.collection.objects.link(lo)
        lo.location = ctr + Vector(off) * max(rad, 0.15) * 4
        lo.rotation_euler = (ctr - lo.location).normalized().to_track_quat("-Z", "Y").to_euler()

    s = max(rad, 0.15) ** 2 * 40
    light("AREA", 38 * s, (-0.6, -1.0, -0.9), (1.0, 0.78, 0.55), 0.6)     # flashlight from below
    light("AREA", 70 * s, (0.8, 1.2, 0.6), (0.9, 0.12, 0.08), 0.8)       # red rim from behind
    light("AREA", 5 * s, (1.0, -0.6, 0.4), (0.6, 0.7, 1.0), 1.0)        # faint cold fill
    w = scn.world; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.004, 0.003, 0.003, 1)
    r = scn.render
    r.engine = "BLENDER_EEVEE"; r.resolution_x = 256; r.resolution_y = 320; r.resolution_percentage = 100
    r.image_settings.file_format = "PNG"
    e = scn.eevee; e.taa_render_samples = 24; e.use_gtao = True; e.use_bloom = True; e.bloom_intensity = 0.03
    scn.view_settings.view_transform = "Filmic"; scn.view_settings.look = "High Contrast"
    r.filepath = os.path.join(OUT, kind + ".png")
    bpy.ops.render.render(write_still=True)
    return {"out": r.filepath}


ASSETS = {f"portrait_{k}": (lambda k=k: _portrait(k)) for k in SHOTS}

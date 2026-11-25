"""Blender (headless) model pipeline for Uyuyan Ejderha.

Run: blender -b -P tools/process_models.py -- <kind> <input> <output.glb>
kinds: thief (Boris FBX: drop pedestal, split limbs, tintable 'skin'), static (join + decimate), baby.
"""
import sys
import bpy
import mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
kind, src, out = argv[0], argv[1], argv[2]
target_tris = int(argv[3]) if len(argv) > 3 else 4000
height = float(argv[4]) if len(argv) > 4 else 1.7

bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath=src)
else:
    bpy.ops.import_scene.gltf(filepath=src)

# Bake every transform into the meshes and drop armatures/empties (these models are static).
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)


def bbox(o):
    pts = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def tris(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def decimate(o, ratio):
    if ratio >= 1:
        return
    m = o.modifiers.new('dec', 'DECIMATE')
    m.ratio = max(0.01, ratio)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


meshes = [o for o in bpy.data.objects if o.type == 'MESH']

if kind == 'thief':
    # The black display disc under the feet: the lowest, flattest part.
    lowest = min(meshes, key=lambda o: bbox(o)[0].z)
    mn, mx = bbox(lowest)
    if (mx.z - mn.z) < 0.3 * (mx.x - mn.x):
        bpy.data.objects.remove(lowest, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    limbs = [o for o in meshes if o.data.materials and o.data.materials[0].name.startswith('Material_111')]
    limbs.sort(key=lambda o: (bbox(o)[0].z + bbox(o)[1].z) / 2)
    legs, arms = limbs[:2], limbs[2:]
    for group, label in ((legs, 'leg'), (arms, 'arm')):
        group.sort(key=lambda o: (bbox(o)[0].x + bbox(o)[1].x) / 2)
        for o, side in zip(group, ('R', 'L')):
            o.name = f'{label}_{side}'
            lo, hi = bbox(o)
            bpy.context.scene.cursor.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z - (hi.z - lo.z) * 0.08)
            bpy.ops.object.select_all(action='DESELECT')
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # Purple → one tintable material called 'skin'.
    skin = bpy.data.materials.new('skin')
    skin.use_nodes = True
    skin.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.73, 0.0, 1.0, 1.0)
    skin.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.45
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for i, m in enumerate(o.data.materials):
            if m and m.name.split('.')[0] in ('Material_111', 'Material_84', 'Material_96'):
                o.data.materials[i] = skin
    rest = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith(('arm_', 'leg_'))]
    total = sum(tris(o) for o in bpy.data.objects if o.type == 'MESH')
    eye_mats = ('Material_143', 'Material_192')
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        # Eyes are nested spheres (white + pupil): too much decimation lets the pupil swallow the white.
        is_eye = any(m and m.name.split('.')[0] in eye_mats for m in o.data.materials)
        decimate(o, 0.5 if is_eye else target_tris / total)
    bpy.ops.object.select_all(action='DESELECT')
    for o in rest:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rest[0]
    bpy.ops.object.join()
    rest[0].name = 'body'
else:
    total = sum(tris(o) for o in meshes)
    for o in meshes:
        decimate(o, target_tris / total)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    meshes[0].name = 'body'

# Stand on the ground, centred, at the wanted height.
objs = [o for o in bpy.data.objects if o.type == 'MESH']
mn = mathutils.Vector((min(bbox(o)[0].x for o in objs), min(bbox(o)[0].y for o in objs), min(bbox(o)[0].z for o in objs)))
mx = mathutils.Vector((max(bbox(o)[1].x for o in objs), max(bbox(o)[1].y for o in objs), max(bbox(o)[1].z for o in objs)))
k = height / (mx.z - mn.z)
shift = mathutils.Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))
for o in objs:
    o.location = (o.location + shift) * k
    o.scale = (k, k, k)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
print('RESULT', [(o.name, tris(o), tuple(round(v, 2) for v in o.location)) for o in bpy.data.objects if o.type == 'MESH'])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True)

"""Bake the high-poly Easter egg (333k tris, vertex colours) onto a ~1k-triangle egg.

Run: blender -b -P tools/bake_egg.py -- <in.glb> <out.glb> [size]
Result: low-poly egg (height 0.9, centred) with a colour map and a normal map.
"""
import sys
import bpy
import mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
size = int(argv[2]) if len(argv) > 2 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
highs = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in highs:
    o.select_set(True)
bpy.context.view_layer.objects.active = highs[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

# Centre and scale to 0.9 m tall.
pts = [high.matrix_world @ v.co for v in high.data.vertices]
mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
k = 0.9 / (mx.z - mn.z)
c = (mn + mx) / 2
for v in high.data.vertices:
    v.co = (v.co - c) * k
dims = (mx - mn) * k

# Emission material on the high poly: its vertex colours become the bakeable colour.
hm = bpy.data.materials.new('high')
hm.use_nodes = True
nt = hm.node_tree
nt.nodes.clear()
attr = nt.nodes.new('ShaderNodeVertexColor')
emit = nt.nodes.new('ShaderNodeEmission')
outn = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(attr.outputs['Color'], emit.inputs['Color'])
nt.links.new(emit.outputs['Emission'], outn.inputs['Surface'])
high.data.materials.clear()
high.data.materials.append(hm)

# Low poly: a UV sphere shrink-wrapped onto the egg surface.
bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=0.5)
low = bpy.context.active_object
low.name = 'egg'
low.scale = (dims.x, dims.y, dims.z)
bpy.ops.object.transform_apply(scale=True)
sw = low.modifiers.new('wrap', 'SHRINKWRAP')
sw.target = high
sw.wrap_method = 'NEAREST_SURFACEPOINT'
bpy.ops.object.modifier_apply(modifier=sw.name)
bpy.ops.object.shade_smooth()
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')

col_img = bpy.data.images.new('egg_color', size, size)
nrm_img = bpy.data.images.new('egg_normal', size, size)
nrm_img.colorspace_settings.name = 'Non-Color'
lm = bpy.data.materials.new('egg')
lm.use_nodes = True
lt = lm.node_tree
bsdf = lt.nodes['Principled BSDF']
tc = lt.nodes.new('ShaderNodeTexImage')
tc.image = col_img
tn = lt.nodes.new('ShaderNodeTexImage')
tn.image = nrm_img
nmap = lt.nodes.new('ShaderNodeNormalMap')
lt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
lt.links.new(tn.outputs['Color'], nmap.inputs['Color'])
lt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
bsdf.inputs['Roughness'].default_value = 0.35
low.data.materials.append(lm)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 8
scene.cycles.device = 'CPU'
bake = scene.render.bake
bake.use_selected_to_active = True
bake.cage_extrusion = 0.06
bake.max_ray_distance = 0.2
bpy.ops.object.select_all(action='DESELECT')
high.select_set(True)
low.select_set(True)
bpy.context.view_layer.objects.active = low

lt.nodes.active = tn
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
lt.nodes.active = tc
bpy.ops.object.bake(type='EMIT')
for img in (col_img, nrm_img):
    img.pack()

bpy.data.objects.remove(high, do_unlink=True)
low.data.calc_loop_triangles()
print('RESULT tris', len(low.data.loop_triangles), 'dims', tuple(round(v, 3) for v in dims))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_image_format='AUTO')

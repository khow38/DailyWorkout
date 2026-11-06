"""Author an editable CC0-derived female face study and a textured GLB bust.

Requires bpy 4.2 and MPFB source plus the MakeHuman system asset pack.
No game geometry, trailer pixels, generated portraits, or paid assets are used.
The existing workout models are not modified by this authoring command.
"""
import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mpfb', required=True, type=Path)
    parser.add_argument('--system-assets', required=True, type=Path)
    parser.add_argument('--work', required=True, type=Path)
    parser.add_argument('--skip-renders', action='store_true', help='Export sources/GLB without regenerating inspection PNGs')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    recipe = json.loads((root / 'assets/face-study-recipe.json').read_text('utf-8'))
    args.work.mkdir(parents=True, exist_ok=True)
    os.environ['BLENDER_USER_RESOURCES'] = str(args.work / 'blender-resources')
    import bpy
    import addon_utils
    import bmesh
    from mathutils import Vector

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    repo = bpy.context.preferences.extensions.repos.new(
        name='Face study authoring', module='face_study',
        custom_directory=str(args.mpfb.resolve() / 'src'))
    repo.use_custom_directory = True
    addon_utils.enable('bl_ext.face_study.mpfb', default_set=True)
    from bl_ext.face_study.mpfb.services.humanservice import HumanService
    from bl_ext.face_study.mpfb.services.targetservice import TargetService

    macro = TargetService.get_default_macro_info_dict()
    macro.update(recipe['macro'])
    human = HumanService.create_human(macro_detail_dict=macro)
    human.name = 'FaceStudy_skin'
    targets = args.mpfb / 'src/mpfb/data/targets'
    inputs = [root / 'assets/face-study-recipe.json', args.mpfb / 'src/mpfb/data/3dobjs/base.obj']
    for name, amount in recipe['targets'].items():
        target = targets / (name + '.target.gz')
        if not target.is_file():
            raise FileNotFoundError(target)
        TargetService.load_target(human, str(target), weight=amount)
        inputs.append(target)
    bpy.context.view_layer.update()

    def asset(relative, kind):
        p = args.system_assets / relative
        if not p.is_file():
            raise FileNotFoundError(p)
        obj = HumanService.add_mhclo_asset(
            str(p), human, asset_type=kind, subdiv_levels=1,
            material_type='GAMEENGINE', set_up_rigging=False)
        obj.name = 'FaceStudy_' + kind.lower()
        return obj

    eyes = asset('eyes/high-poly/high-poly.mhclo', 'Eyes')
    brows = asset('eyebrows/eyebrow009/eyebrow009.mhclo', 'Eyebrows')
    lashes = asset('eyelashes/eyelashes02/eyelashes02.mhclo', 'Eyelashes')
    hair = asset('hair/long01/long01.mhclo', 'Hair')

    def pbr(name, color, roughness, texture=None, alpha=False):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*color, 1)
        shader.inputs['Roughness'].default_value = roughness
        shader.inputs['Specular IOR Level'].default_value = 0.28
        if texture:
            path = args.system_assets / texture
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = bpy.data.images.load(str(path), check_existing=True)
            mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
            if alpha:
                mat.node_tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
                mat.surface_render_method = 'DITHERED'
                mat.use_backface_culling = False
        return mat

    def apply_material(obj, mat):
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        for face in obj.data.polygons:
            face.material_index = 0

    skin = pbr('Skin_porcelain_rose', (0.7, 0.48, 0.4), 0.48,
               'skins/young_asian_female/young_lightskinned_female_diffuse3.png')
    skin.node_tree.nodes.get('Principled BSDF').inputs['Subsurface Weight'].default_value = 0.055
    apply_material(human, skin)
    apply_material(eyes, pbr('Eyes_brown', (0.7, 0.65, 0.6), 0.21, 'eyes/materials/brown_eye.png', True))
    apply_material(brows, pbr('Brows_soft', (0.06, 0.025, 0.02), 0.8,
                             'eyebrows/eyebrow009/eyebrow009.png', True))
    apply_material(lashes, pbr('Lashes', (0.02, 0.015, 0.01), 0.7,
                              'eyelashes/eyelashes02/eyelashes02.png', True))
    hair_mat = pbr('Hair_dark_chestnut', (0.045, 0.025, 0.02), 0.62,
                   'hair/long01/long01_diffuse.png', True)
    tex = next(n for n in hair_mat.node_tree.nodes if n.type == 'TEX_IMAGE')
    tint = hair_mat.node_tree.nodes.new('ShaderNodeMixRGB')
    tint.blend_type = 'MULTIPLY'; tint.inputs[0].default_value = 1
    tint.inputs[2].default_value = (0.065, 0.058, 0.06, 1)
    hair_mat.node_tree.links.new(tex.outputs['Color'], tint.inputs[1])
    hair_mat.node_tree.links.new(tint.outputs[0], hair_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    apply_material(hair, hair_mat)
    subsurf = human.modifiers.new('Sculpt surface refinement', 'SUBSURF')
    subsurf.levels = 2
    subsurf.render_levels = 2
    bpy.context.view_layer.update()

    # Keep the anatomical source, named shape keys and asset fit data editable.
    bpy.ops.file.pack_all()
    source_blend = root / 'assets/face-study-source.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(source_blend))

    # Bake the evaluated surfaces, then crop only the review copy to a bust.
    objects = [human, eyes, brows, lashes, hair]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = human
    bpy.ops.object.convert(target='MESH')
    bpy.context.view_layer.update()
    top = max((human.matrix_world @ v.co).z for v in human.data.vertices)
    bottom = top - 0.40
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        remove = [v for v in bm.verts if (obj.matrix_world @ v.co).z < bottom]
        bmesh.ops.delete(bm, geom=remove, context='VERTS')
        if obj is human:
            boundary = [e for e in bm.edges if e.is_boundary and
                        all((obj.matrix_world @ v.co).z < bottom + 0.018 for v in e.verts)]
            if boundary:
                bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
        bm.to_mesh(obj.data)
        bm.free()
        for poly in obj.data.polygons:
            poly.use_smooth = True

    # A high-neck training top follows the shoulders; it is separate geometry.
    shirt_mesh = human.data.copy()
    shirt = bpy.data.objects.new('FaceStudy_training_top', shirt_mesh)
    bpy.context.collection.objects.link(shirt)
    shirt.matrix_world = human.matrix_world.copy()
    bm = bmesh.new()
    bm.from_mesh(shirt_mesh)
    cut = top - 0.24
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                          plane_co=(0, 0, cut), plane_no=(0, 0, 1), clear_outer=True, dist=0.00001)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.0022
    bm.to_mesh(shirt_mesh)
    bm.free()
    apply_material(shirt, pbr('Training_top_ink', (0.028, 0.04, 0.055), 0.78))
    objects.append(shirt)

    # Replace the coarse reference hair with a fitted scalp and authored strands.
    import random
    rng = random.Random(91)
    objects.remove(hair)
    bpy.data.objects.remove(hair, do_unlink=True)
    scalp_mesh = human.data.copy()
    hair = bpy.data.objects.new('FaceStudy_hair_scalp', scalp_mesh)
    bpy.context.collection.objects.link(hair)
    bm = bmesh.new(); bm.from_mesh(scalp_mesh)
    def is_scalp(v):
        x,y,z = v.co; z -= top-0.265
        return (z > 0.25 and y > -0.11) or (z > 0.13 and y > 0.018)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not is_scalp(v)], context='VERTS')
    bm.normal_update()
    for v in bm.verts: v.co += v.normal*0.001
    bm.to_mesh(scalp_mesh); bm.free()
    apply_material(hair, pbr('Hair_scalp', (0.016, 0.012, 0.011), 0.68))
    objects.append(hair)
    strand_materials = [pbr('Hair_strands_' + str(i),
                           (0.018+i*0.002, 0.012+i*0.0014, 0.012+i*0.0013), 0.57)
                        for i in range(7)]
    curve = bpy.data.curves.new('Center_part_strands', 'CURVE')
    curve.dimensions = '3D'; curve.resolution_u = 3
    curve.bevel_depth = 0.00021; curve.bevel_resolution = 0
    for mat in strand_materials: curve.materials.append(mat)
    def sample_path(points, phase):
        controls = [Vector(p) for p in points]
        sampled = []
        for k in range(32):
            u = k/31*(len(controls)-1)
            seg = min(int(u), len(controls)-2); t = u-seg
            a,b,c,d = [controls[max(0,min(len(controls)-1,i))] for i in (seg-1,seg,seg+1,seg+2)]
            pos = 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
            pos.x += 0.0007*math.sin(phase+k*0.4)
            pos.y += 0.001*math.cos(phase+k*0.3)
            sampled.append(pos)
        return sampled

    def add_strand(points, phase):
        sampled = sample_path(points, phase)
        spline = curve.splines.new('POLY'); spline.points.add(len(sampled)-1)
        spline.material_index = rng.randrange(len(strand_materials))
        for i, (p, co) in enumerate(zip(spline.points, sampled)):
            p.co = (*co, 1)
            p.radius = 0.4 if i==0 else max(0.06, min(0.9, (len(sampled)-i)/8))
    for side in (-1, 1):
        for j in range(700):
            q = rng.random(); phase = rng.random()*math.tau
            depth = -0.111 + 0.145*q
            extent = 0.86 + rng.random()*0.20
            # Front layers sweep beside the cheeks; back layers drape behind the neck.
            points = [
                (side*(0.001+0.003*rng.random()), depth, top-0.105+0.116*math.sqrt(max(0.1,1-((depth+0.04)/0.10)**2))),
                (side*0.035, depth-0.003, top-0.10+0.106*math.sqrt(max(0.1,1-((depth+0.04)/0.10)**2))),
                (side*(0.068+0.01*math.sin(q*math.pi)), depth+0.018*(1-q), top-0.06),
                (side*(0.078+0.009*math.sin(q*math.pi)), depth+0.055*(1-q), top-0.14),
                (side*(0.084+0.012*q), depth+0.018+0.055*(1-q), top-0.24*extent),
                (side*(0.095+0.008*math.sin(phase)), depth+0.04+0.05*(1-q), top-0.37*extent)]
            add_strand(points, phase)
        # Face-framing locks soften the center part and cover the hairline.
        for j in range(150):
            q = rng.random(); phase = rng.random()*math.tau
            add_strand([
                (side*0.003, -0.113+q*0.008, top-0.018+q*0.013),
                (side*0.032, -0.123+q*0.006, top-0.033+q*0.01),
                (side*0.062, -0.124+q*0.007, top-0.074+q*0.01),
                (side*0.075, -0.075+q*0.008, top-0.145),
                (side*0.076, -0.025+q*0.01, top-0.225),
                (side*(0.086+q*0.01), 0.005+q*0.01, top-0.30-q*0.055)], phase)
    # Rear volume has a separate flow so orbiting does not reveal an empty back.
    for j in range(600):
        x = rng.uniform(-0.095, 0.095); phase = rng.random()*math.tau
        add_strand([
            (x*0.6, 0.005, top-0.012-0.035*(x/0.10)**2),
            (x*0.9, 0.045, top-0.055),
            (x, 0.061, top-0.12),
            (x*1.1, 0.07, top-0.22),
            (x*1.15+0.006*math.sin(phase), 0.077, top-0.37+rng.uniform(-0.02,0.025))],phase)

    # Continuous dark locks sit under the fine strands, preserving hair density.
    lock_vertices, lock_faces = [], []
    def append_lock(rows):
        start = len(lock_vertices)
        for row in rows: lock_vertices.extend(row)
        for r in range(len(rows)-1):
            for k in range(31):
                a = start+r*32+k
                lock_faces.append((a, a+1, a+33, a+32))
    for side in (-1, 1):
        rows = []
        for j in range(65):
            q=j/64; depth=-0.111+0.145*q; extent=0.96+0.035*math.sin(q*9)
            pts=[
                (side*0.003,depth,top-0.107+0.116*math.sqrt(max(0.1,1-((depth+0.04)/0.10)**2))),
                (side*0.033,depth,top-0.102+0.106*math.sqrt(max(0.1,1-((depth+0.04)/0.10)**2))),
                (side*(0.066+0.01*math.sin(q*math.pi)),depth+0.020*(1-q),top-0.06),
                (side*(0.076+0.009*math.sin(q*math.pi)),depth+0.005+0.055*(1-q),top-0.14),
                (side*(0.082+0.012*q),depth+0.020+0.055*(1-q),top-0.24*extent),
                (side*0.092,depth+0.042+0.05*(1-q),top-0.35*extent)]
            rows.append(sample_path(pts,q*2))
        append_lock(rows)
    rows=[]
    for j in range(65):
        x=-0.095+j/64*0.19
        rows.append(sample_path([(x*0.6,0.003,top-0.014-0.035*(x/0.10)**2),
            (x*0.9,0.043,top-0.055),(x,0.059,top-0.12),(x*1.1,0.068,top-0.22),
            (x*1.15,0.075,top-0.35+0.012*math.cos(x*90))],0))
    append_lock(rows)
    lock_mesh=bpy.data.meshes.new('Hair_lock_surfaces')
    lock_mesh.from_pydata(lock_vertices,[],lock_faces);lock_mesh.update()
    locks=bpy.data.objects.new('FaceStudy_hair_locks',lock_mesh)
    bpy.context.collection.objects.link(locks)
    for p in lock_mesh.polygons:p.use_smooth=True
    apply_material(locks,pbr('Hair_underlay',(0.012,0.009,0.008),0.64))
    objects.append(locks)
    strands = bpy.data.objects.new('FaceStudy_hair_strands', curve)
    bpy.context.collection.objects.link(strands)
    bpy.ops.object.select_all(action='DESELECT'); strands.select_set(True)
    bpy.context.view_layer.objects.active = strands
    bpy.ops.object.convert(target='MESH')
    objects.append(strands)

    # Center at the middle of the portrait. glTF converts Z-up to Y-up.
    center_z = top - 0.265
    for obj in objects:
        for v in obj.data.vertices:
            v.co.z -= center_z
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = human
    glb = root / 'assets/face-study.glb'
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(root / 'assets/face-study.blend'))
    bpy.ops.export_scene.gltf(
        filepath=str(glb), export_format='GLB', use_selection=True,
        export_animations=False, export_yup=True, export_extras=True,
        export_image_format='AUTO', export_materials='EXPORT')

    # Independent neutral renders are inspection evidence, not retouched artwork.
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 850
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('Portrait studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (0.26, 0.28, 0.32, 1)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value = 0.45
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'

    def aim(obj, target):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

    for name, location, energy, size, color in [
        ('Softbox_key', (-0.6, -0.8, 0.9), 28, 0.7, (1, 0.9, 0.83)),
        ('Softbox_fill', (0.65, -0.4, 0.4), 12, 0.65, (0.78, 0.85, 1)),
        ('Hair_rim', (0.25, 0.5, 0.65), 26, 0.5, (1, 0.88, 0.75))]:
        data = bpy.data.lights.new(name, 'AREA'); data.energy = energy; data.shape = 'DISK'; data.size = size; data.color = color
        light = bpy.data.objects.new(name, data); scene.collection.objects.link(light); light.location = location; aim(light, (0, 0, 0.1))
    cam_data = bpy.data.cameras.new('Portrait_camera')
    cam = bpy.data.objects.new('Portrait_camera', cam_data); scene.collection.objects.link(cam)
    scene.camera = cam; cam_data.lens = 68
    views = [] if args.skip_renders else [('front', (0, -0.82, 0.17)), ('quarter', (0.43, -0.74, 0.17)), ('side', (0.82, -0.04, 0.17))]
    for name, position in views:
        cam.location = position; aim(cam, (0, -0.015, 0.105))
        scene.render.filepath = str(args.work / ('face-study-' + name + '.png'))
        bpy.ops.render.render(write_still=True)
    # Record the source revision and asset bundles used by the authoring path.
    asset_inputs = []
    for relative in ['eyes/high-poly', 'eyebrows/eyebrow009', 'eyelashes/eyelashes02',
                     'hair/long01', 'skins/young_asian_female']:
        asset_inputs.extend(p for p in (args.system_assets / relative).rglob('*') if p.is_file())
    asset_inputs.append(args.system_assets / 'eyes/materials/brown_eye.png')
    manifest = {
        'recipe': recipe, 'glb_sha256': hashlib.sha256(glb.read_bytes()).hexdigest(),
        'glb_bytes': glb.stat().st_size, 'meshes': len(objects),
        'vertices': sum(len(o.data.vertices) for o in objects),
        'triangles': sum(len(p.vertices)-2 for o in objects for p in o.data.polygons),
        'source': str(source_blend.name), 'bpy_version': bpy.app.version_string,
        'mpfb_commit': subprocess.check_output(['git', '-C', str(args.mpfb), 'rev-parse', 'HEAD'], text=True).strip(),
        'system_asset_pack': 'https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip',
        'asset_bundle_sha256': {str(p.relative_to(args.system_assets)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(asset_inputs)},
        'inputs': {str(p.relative_to(args.mpfb) if p.is_relative_to(args.mpfb) else p.name): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},
        'limitations': ['Visual study only; not integrated with workout rig or body customization', 'No trailer pixels or commercial game asset data used']
    }
    (root / 'assets/face-study-manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({k: manifest[k] for k in ['glb_bytes', 'meshes', 'vertices']}, indent=2))


if __name__ == '__main__':
    main()
    # Windows bpy 4.2's shutdown crashed with 0xC0000005 after successful Cycles
    # exports in this environment, including wm.quit_blender(). Exit only after
    # main returns and every synchronous save/render/manifest write succeeded.
    # Exceptions never reach this path. This is a standalone authoring process.
    if os.name == 'nt':
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0)

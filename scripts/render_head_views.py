"""
Render the head from +Y, -Y, +X, -X so we can visually confirm which
direction is the front of the face before placing any new geometry.

Run: blender.exe --background --python scripts/render_head_views.py
"""

import bpy
import os
import math

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NEUTRAL_FBX = os.path.join(REPO_ROOT, 'assets', 'animations', 'Neutral Idle.fbx')
OUT_DIR = os.path.join(REPO_ROOT, 'scratch_renders')


def log(msg):
    print(f'[render] {msg}', flush=True)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=NEUTRAL_FBX)

    armature = None
    mesh_obj = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
        elif obj.type == 'MESH':
            mesh_obj = obj

    head_bone = armature.pose.bones.get('mixamorig:Head')
    head_world = armature.matrix_world @ head_bone.head
    log(f'Head world position: {head_world}')

    # Give the mesh a bright, unlit-ish material so shape reads clearly without needing real lights.
    mat = bpy.data.materials.new('DebugMat')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.85, 0.85, 0.88, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.6
    mesh_obj.data.materials.clear()
    mesh_obj.data.materials.append(mat)

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = 400
    scene.render.resolution_y = 400
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'

    cam_data = bpy.data.cameras.new('Cam')
    cam_data.lens = 50
    cam_data.clip_start = 0.0001
    cam_data.clip_end = 10
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    dist = 0.02
    height = head_world.z

    views = {
        'plus_y': (head_world.x, head_world.y + dist, height),
        'minus_y': (head_world.x, head_world.y - dist, height),
        'plus_x': (head_world.x + dist, head_world.y, height),
        'minus_x': (head_world.x - dist, head_world.y, height),
    }

    for name, pos in views.items():
        cam.location = pos
        direction = head_world - cam.location
        rot_quat = direction.to_track_quat('-Z', 'Y')
        cam.rotation_euler = rot_quat.to_euler()

        scene.render.filepath = os.path.join(OUT_DIR, f'head_{name}.png')
        bpy.ops.render.render(write_still=True)
        log(f'Rendered {name} -> {scene.render.filepath}')


if __name__ == '__main__':
    main()

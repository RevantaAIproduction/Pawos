"""
Import the exported character_pawos.glb and render front/side views to
visually verify eye/eyebrow/mouth placement before wiring into the app.

Run: blender.exe --background --python scripts/render_glb_check.py
"""

import bpy
import os
from mathutils import Vector

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
GLB_PATH = os.path.join(REPO_ROOT, 'assets', 'characters', 'character_pawos.glb')
OUT_DIR = os.path.join(REPO_ROOT, 'scratch_renders')


def log(msg):
    print(f'[glb_check] {msg}', flush=True)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

    armature = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
    head_bone = armature.pose.bones.get('mixamorig:Head')
    head_world = armature.matrix_world @ head_bone.head
    log(f'Head world position: {head_world}')

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = 500
    scene.render.resolution_y = 500
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'

    cam_data = bpy.data.cameras.new('Cam')
    cam_data.lens = 50
    cam_data.clip_start = 0.0001
    cam_data.clip_end = 10
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    dist = 0.015
    views = {
        'front_close': (head_world.x, head_world.y - dist, head_world.z),
        'front_medium': (head_world.x, head_world.y - dist * 3, head_world.z - 0.01),
    }

    for name, pos in views.items():
        cam.location = pos
        direction = head_world - Vector(pos)
        rot_quat = direction.to_track_quat('-Z', 'Y')
        cam.rotation_euler = rot_quat.to_euler()
        scene.render.filepath = os.path.join(OUT_DIR, f'glb_{name}.png')
        bpy.ops.render.render(write_still=True)
        log(f'Rendered {name}')


if __name__ == '__main__':
    main()

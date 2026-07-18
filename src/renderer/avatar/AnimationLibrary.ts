/**
 * Canonical animation name -> source FBX file, for the existing production
 * animation library at assets/animations/. These files are not modified,
 * not regenerated, and not duplicated — this is purely a name->file lookup.
 *
 * All 21 clips share the same Mixamo skeleton (`mixamorig:*` bone names),
 * so one clip's file supplies the base skinned mesh + skeleton (see
 * AssetManager.BASE_MESH_ANIMATION) while every other file only contributes
 * its AnimationClip, applied to that same shared skeleton.
 */
export type AnimationName =
  | 'neutral'
  | 'happy'
  | 'happyIdle'
  | 'happyHandGesture'
  | 'thinking'
  | 'talking'
  | 'typing'
  | 'standingUp'
  | 'walking'
  | 'flying'
  | 'cheeringWhileSitting'
  | 'thankful'
  | 'rejected'
  | 'sadIdle'
  | 'angry'
  | 'sittingAngry'
  | 'sittingLaughing'
  | 'excited'
  | 'salute'
  | 'dropKick'
  | 'climbingToTop';

export const ANIMATION_FILES: Record<AnimationName, string> = {
  neutral: 'Neutral Idle.fbx',
  happy: 'Happy.fbx',
  happyIdle: 'Happy Idle.fbx',
  happyHandGesture: 'Happy Hand Gesture.fbx',
  thinking: 'Thinking.fbx',
  talking: 'Talking.fbx',
  typing: 'Typing.fbx',
  standingUp: 'Standing Up.fbx',
  walking: 'Start Walking.fbx',
  flying: 'Flying.fbx',
  cheeringWhileSitting: 'Cheering While Sitting.fbx',
  thankful: 'Thankful.fbx',
  rejected: 'Rejected.fbx',
  sadIdle: 'Sad Idle.fbx',
  angry: 'Angry.fbx',
  sittingAngry: 'Sitting Angry.fbx',
  sittingLaughing: 'Sitting Laughing.fbx',
  excited: 'Excited.fbx',
  salute: 'Salute.fbx',
  dropKick: 'Drop Kick.fbx',
  climbingToTop: 'Climbing To Top.fbx',
};

export const ANIMATION_NAMES = Object.keys(ANIMATION_FILES) as AnimationName[];

/** The file whose mesh + skeleton is used as the visible model. */
export const BASE_MESH_ANIMATION: AnimationName = 'neutral';

/** Clips that should loop continuously rather than play once. */
export const LOOPING_ANIMATIONS: ReadonlySet<AnimationName> = new Set<AnimationName>([
  'neutral',
  'happyIdle',
  'thinking',
  'talking',
  'typing',
  'walking',
  'flying',
  'sadIdle',
  'sittingAngry',
  'sittingLaughing',
]);

import type { AvatarGesture, AvatarSpeechSegmentTiming } from '@/types/avatar';

export type VRMSemanticMotion =
  | 'idle'
  | 'welcome'
  | 'self_intro'
  | 'explain'
  | 'explain_left'
  | 'explain_right'
  | 'guide_left'
  | 'guide_right'
  | 'guide_front'
  | 'confirm'
  | 'comfort'
  | 'alert'
  | 'offer_help'
  | 'thanks'
  | 'count_one'
  | 'count_two'
  | 'count_continue'
  | 'count_three'
  | 'emphasize'
  | 'small_ack'
  | 'goodbye';

export type VrmBoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand';

export type RotationOffset = { x?: number; y?: number; z?: number };
export type VrmGesturePose = Partial<Record<VrmBoneName, RotationOffset>>;

export type GesturePrimitive =
  | 'head_nod_small'
  | 'head_nod_medium'
  | 'head_nod_strong'
  | 'head_turn_left'
  | 'head_turn_right'
  | 'head_tilt_left'
  | 'head_tilt_right'
  | 'head_raise'
  | 'head_lower'
  | 'torso_turn_left'
  | 'torso_turn_right'
  | 'torso_lean_forward'
  | 'torso_lean_left'
  | 'torso_lean_right'
  | 'chest_open'
  | 'posture_attention'
  | 'posture_relaxed'
  | 'right_arm_open'
  | 'right_arm_raise_low'
  | 'right_arm_raise_mid'
  | 'right_arm_raise_high'
  | 'right_arm_extend_left'
  | 'right_arm_extend_front'
  | 'right_arm_present'
  | 'right_hand_wave'
  | 'left_arm_open'
  | 'left_arm_raise_low'
  | 'left_arm_raise_mid'
  | 'left_arm_raise_high'
  | 'left_arm_extend_right'
  | 'left_arm_extend_front'
  | 'left_arm_present'
  | 'left_hand_wave'
  | 'both_hands_open'
  | 'both_hands_small_open'
  | 'both_hands_present'
  | 'hands_return_neutral'
  | 'wrist_outward'
  | 'wrist_inward'
  | 'right_wrist_soft_rotate'
  | 'wrist_soft_rotate';

export type GestureDirection = 'left' | 'right' | 'front' | null;
export type GestureGaze = 'left' | 'right' | 'front' | 'user';

export type VRMCoSpeechGesture =
  | 'beat_left'
  | 'beat_right'
  | 'small_open'
  | 'small_nod'
  | 'medium_nod'
  | 'small_present'
  | 'small_emphasis';

export interface GestureDefinition {
  primitives: readonly GesturePrimitive[];
  pose: VrmGesturePose;
  duration: number;
  gaze: GestureGaze;
  holdRatio: number;
}

export interface GestureCue {
  key: string;
  text: string;
  primaryGesture: VRMSemanticMotion | null;
  secondaryGesture: VRMSemanticMotion | null;
  coSpeechGesture: VRMCoSpeechGesture;
  direction: GestureDirection;
  emphasis: boolean;
  hold: number;
  startAt: number;
}

export interface CoSpeechDefinition {
  pose: VrmGesturePose;
  duration: number;
}

export const GESTURE_PRIMITIVES: Record<GesturePrimitive, VrmGesturePose> = {
  head_nod_small: { neck: { x: 0.025 }, head: { x: 0.07 } },
  head_nod_medium: { neck: { x: 0.045 }, head: { x: 0.12 } },
  head_nod_strong: { neck: { x: 0.065 }, head: { x: 0.17 } },
  head_turn_left: { neck: { y: -0.12 }, head: { y: -0.2 } },
  head_turn_right: { neck: { y: 0.12 }, head: { y: 0.2 } },
  head_tilt_left: { neck: { z: 0.035 }, head: { z: 0.075 } },
  head_tilt_right: { neck: { z: -0.035 }, head: { z: -0.075 } },
  head_raise: { neck: { x: -0.025 }, head: { x: -0.07 } },
  head_lower: { neck: { x: 0.035 }, head: { x: 0.1 } },
  torso_turn_left: {
    hips: { y: -0.035 }, spine: { y: -0.08 }, chest: { y: -0.12 }, upperChest: { y: -0.17 },
  },
  torso_turn_right: {
    hips: { y: 0.035 }, spine: { y: 0.08 }, chest: { y: 0.12 }, upperChest: { y: 0.17 },
  },
  torso_lean_forward: { spine: { x: 0.035 }, chest: { x: 0.055 }, upperChest: { x: 0.06 } },
  torso_lean_left: { spine: { z: 0.025 }, chest: { z: 0.045 }, upperChest: { z: 0.055 } },
  torso_lean_right: { spine: { z: -0.025 }, chest: { z: -0.045 }, upperChest: { z: -0.055 } },
  chest_open: { chest: { x: -0.025 }, upperChest: { x: -0.055 } },
  posture_attention: { spine: { x: -0.035 }, chest: { x: -0.045 }, upperChest: { x: -0.06 } },
  posture_relaxed: { spine: { x: 0.015 }, chest: { z: 0.012 }, upperChest: { z: 0.018 } },
  right_arm_open: {
    rightShoulder: { y: -0.06, z: 0.12 },
    rightUpperArm: { x: -0.14, y: -0.13, z: 0.64 },
    rightLowerArm: { x: -0.22, y: -0.08, z: 0.22 },
    rightHand: { x: 0.04, y: -0.12, z: 0.06 },
  },
  right_arm_raise_low: {
    rightShoulder: { z: 0.08 }, rightUpperArm: { x: -0.1, y: -0.08, z: 0.38 },
  },
  right_arm_raise_mid: {
    rightShoulder: { y: -0.07, z: 0.15 }, rightUpperArm: { x: -0.18, y: -0.13, z: 0.98 },
  },
  right_arm_raise_high: {
    rightShoulder: { y: -0.08, z: 0.19 }, rightUpperArm: { x: -0.2, y: -0.15, z: 1.2 },
  },
  right_arm_extend_left: {
    rightShoulder: { y: -0.1, z: 0.22 },
    rightUpperArm: { x: -0.13, y: -0.25, z: 1.2 },
    rightLowerArm: { x: -0.14, y: -0.12, z: 0.1 },
    rightHand: { x: 0.02, y: -0.16, z: 0.08 },
  },
  right_arm_extend_front: {
    rightShoulder: { y: -0.11, z: 0.13 },
    rightUpperArm: { x: -0.48, y: -0.34, z: 0.68 },
    rightLowerArm: { x: -0.24, y: -0.18, z: 0.18 },
    rightHand: { x: -0.08, y: -0.12, z: 0.08 },
  },
  right_arm_present: {
    rightShoulder: { y: -0.06, z: 0.12 },
    rightUpperArm: { x: -0.26, y: -0.18, z: 0.72 },
    rightLowerArm: { x: -0.3, y: -0.12, z: 0.42 },
    rightHand: { x: -0.04, y: -0.12, z: 0.08 },
  },
  right_hand_wave: { rightLowerArm: { x: -0.25, z: 0.6 }, rightHand: { x: 0.08, y: -0.14, z: 0.1 } },
  left_arm_open: {
    leftShoulder: { y: 0.06, z: -0.12 },
    leftUpperArm: { x: -0.14, y: 0.13, z: -0.64 },
    leftLowerArm: { x: -0.22, y: 0.08, z: -0.22 },
    leftHand: { x: 0.04, y: 0.12, z: -0.06 },
  },
  left_arm_raise_low: {
    leftShoulder: { z: -0.08 }, leftUpperArm: { x: -0.1, y: 0.08, z: -0.38 },
  },
  left_arm_raise_mid: {
    leftShoulder: { y: 0.07, z: -0.15 }, leftUpperArm: { x: -0.18, y: 0.13, z: -0.98 },
  },
  left_arm_raise_high: {
    leftShoulder: { y: 0.08, z: -0.19 }, leftUpperArm: { x: -0.2, y: 0.15, z: -1.2 },
  },
  left_arm_extend_right: {
    leftShoulder: { y: 0.1, z: -0.22 },
    leftUpperArm: { x: -0.13, y: 0.25, z: -1.2 },
    leftLowerArm: { x: -0.14, y: 0.12, z: -0.1 },
    leftHand: { x: 0.02, y: 0.16, z: -0.08 },
  },
  left_arm_extend_front: {
    leftShoulder: { y: 0.11, z: -0.13 },
    leftUpperArm: { x: -0.48, y: 0.34, z: -0.68 },
    leftLowerArm: { x: -0.24, y: 0.18, z: -0.18 },
    leftHand: { x: -0.08, y: 0.12, z: -0.08 },
  },
  left_arm_present: {
    leftShoulder: { y: 0.06, z: -0.12 },
    leftUpperArm: { x: -0.26, y: 0.18, z: -0.72 },
    leftLowerArm: { x: -0.3, y: 0.12, z: -0.42 },
    leftHand: { x: -0.04, y: 0.12, z: -0.08 },
  },
  left_hand_wave: { leftLowerArm: { x: -0.25, z: -0.6 }, leftHand: { x: 0.08, y: 0.14, z: -0.1 } },
  both_hands_open: {
    rightShoulder: { z: 0.13 }, rightUpperArm: { x: -0.18, y: -0.13, z: 0.72 },
    rightLowerArm: { x: -0.28, y: -0.1, z: 0.3 }, rightHand: { y: -0.12, z: 0.07 },
    leftShoulder: { z: -0.13 }, leftUpperArm: { x: -0.18, y: 0.13, z: -0.72 },
    leftLowerArm: { x: -0.28, y: 0.1, z: -0.3 }, leftHand: { y: 0.12, z: -0.07 },
  },
  both_hands_small_open: {
    rightShoulder: { z: 0.07 }, rightUpperArm: { x: -0.12, y: -0.08, z: 0.38 },
    rightLowerArm: { x: -0.2, y: -0.06, z: 0.18 }, rightHand: { y: -0.08, z: 0.05 },
    leftShoulder: { z: -0.07 }, leftUpperArm: { x: -0.12, y: 0.08, z: -0.38 },
    leftLowerArm: { x: -0.2, y: 0.06, z: -0.18 }, leftHand: { y: 0.08, z: -0.05 },
  },
  both_hands_present: {
    rightShoulder: { z: 0.1 }, rightUpperArm: { x: -0.42, y: -0.25, z: 0.58 },
    rightLowerArm: { x: -0.3, y: -0.14, z: 0.28 }, rightHand: { x: -0.08, y: -0.1 },
    leftShoulder: { z: -0.1 }, leftUpperArm: { x: -0.42, y: 0.25, z: -0.58 },
    leftLowerArm: { x: -0.3, y: 0.14, z: -0.28 }, leftHand: { x: -0.08, y: 0.1 },
  },
  hands_return_neutral: {},
  wrist_outward: { rightHand: { y: -0.14, z: 0.08 }, leftHand: { y: 0.14, z: -0.08 } },
  wrist_inward: { rightHand: { y: 0.1, z: -0.05 }, leftHand: { y: -0.1, z: 0.05 } },
  right_wrist_soft_rotate: { rightHand: { x: 0.06, y: -0.08 } },
  wrist_soft_rotate: { rightHand: { x: 0.06, y: -0.08 }, leftHand: { x: 0.06, y: 0.08 } },
};

function composePose(primitives: readonly GesturePrimitive[]): VrmGesturePose {
  const pose: VrmGesturePose = {};
  for (const primitive of primitives) {
    const primitivePose = GESTURE_PRIMITIVES[primitive];
    for (const [boneName, offset] of Object.entries(primitivePose) as [VrmBoneName, RotationOffset][]) {
      const current = pose[boneName] ?? {};
      pose[boneName] = {
        x: (current.x ?? 0) + (offset.x ?? 0),
        y: (current.y ?? 0) + (offset.y ?? 0),
        z: (current.z ?? 0) + (offset.z ?? 0),
      };
    }
  }
  return pose;
}

function defineGesture(
  primitives: readonly GesturePrimitive[],
  duration: number,
  gaze: GestureGaze = 'user',
  holdRatio = 0.42,
): GestureDefinition {
  return { primitives, pose: composePose(primitives), duration, gaze, holdRatio };
}

export const VRM_GESTURE_DEFINITIONS: Record<VRMSemanticMotion, GestureDefinition> = {
  idle: defineGesture(['hands_return_neutral'], 0, 'user', 0),
  welcome: defineGesture(['posture_relaxed', 'chest_open', 'right_arm_raise_mid', 'right_hand_wave', 'head_nod_small'], 2.4),
  self_intro: defineGesture(['chest_open', 'both_hands_small_open', 'head_nod_small'], 2.1),
  explain: defineGesture(['right_arm_open', 'head_nod_small'], 2),
  explain_left: defineGesture(['right_arm_open', 'torso_lean_left', 'head_tilt_left', 'wrist_outward'], 2.1, 'user'),
  explain_right: defineGesture(['left_arm_open', 'torso_lean_right', 'head_tilt_right', 'wrist_outward'], 2.1, 'user'),
  guide_left: defineGesture(['posture_attention', 'right_arm_extend_left', 'torso_turn_left', 'head_turn_left', 'wrist_outward'], 2.7, 'left', 0.48),
  guide_right: defineGesture(['posture_attention', 'left_arm_extend_right', 'torso_turn_right', 'head_turn_right', 'wrist_outward'], 2.7, 'right', 0.48),
  // A forward direction should read as a clear one-hand point, not a two-arm
  // presentation. Keep the torso slightly forward and leave the head neutral.
  guide_front: defineGesture(['right_arm_extend_front', 'torso_lean_forward'], 2.3, 'front', 0.46),
  confirm: defineGesture(['head_nod_medium', 'right_arm_raise_low', 'wrist_soft_rotate'], 1.25),
  comfort: defineGesture(['posture_relaxed', 'torso_lean_forward', 'right_arm_open', 'head_tilt_left'], 2.2),
  alert: defineGesture(['posture_attention', 'chest_open', 'both_hands_small_open', 'head_raise'], 1.9, 'user', 0.5),
  offer_help: defineGesture(['right_arm_open', 'torso_lean_forward', 'head_nod_small', 'wrist_outward'], 2.1),
  thanks: defineGesture(['both_hands_small_open', 'torso_lean_forward', 'head_nod_medium'], 1.65),
  count_one: defineGesture(['right_arm_present', 'head_nod_small', 'posture_attention'], 1.45),
  count_two: defineGesture(['left_arm_present', 'head_nod_small', 'posture_attention'], 1.45),
  // Internal continuation used only inside a detected enumeration sequence.
  // It keeps the right arm in the same presentation area while the wrist and
  // nod mark the next item, avoiding a right/left/right arm sweep.
  count_continue: defineGesture(['right_arm_present', 'right_wrist_soft_rotate', 'head_nod_medium'], 1.35, 'user', 0.38),
  // Finish an enumeration with one clear forward presentation instead of the
  // previous two-arm open/backward pose. The slight forward lean makes this a
  // natural closing emphasis while keeping the gesture distinct from one/two.
  count_three: defineGesture(['right_arm_present', 'torso_lean_forward', 'head_nod_medium'], 1.55, 'user', 0.4),
  emphasize: defineGesture(['right_arm_present', 'head_nod_strong', 'posture_attention'], 1.55),
  small_ack: defineGesture(['head_nod_small', 'right_arm_raise_low'], 1),
  goodbye: defineGesture(['posture_relaxed', 'left_arm_raise_high', 'left_hand_wave', 'head_nod_small'], 2.7),
};

export const VRM_CO_SPEECH_DEFINITIONS: Record<VRMCoSpeechGesture, CoSpeechDefinition> = {
  beat_left: {
    pose: composePose(['left_arm_raise_low', 'wrist_soft_rotate']),
    duration: 0.72,
  },
  beat_right: {
    pose: composePose(['right_arm_raise_low', 'wrist_soft_rotate']),
    duration: 0.72,
  },
  small_open: {
    pose: composePose(['both_hands_small_open']),
    duration: 0.9,
  },
  small_nod: {
    pose: composePose(['head_nod_small']),
    duration: 0.62,
  },
  medium_nod: {
    pose: composePose(['head_nod_medium']),
    duration: 0.78,
  },
  small_present: {
    pose: composePose(['right_arm_raise_low', 'wrist_outward']),
    duration: 0.85,
  },
  small_emphasis: {
    pose: composePose(['head_nod_small', 'posture_attention']),
    duration: 0.7,
  },
};

export const SEMANTIC_GESTURE_PRIORITY: Record<VRMSemanticMotion, number> = {
  idle: 0,
  goodbye: 100,
  alert: 90,
  guide_left: 80,
  guide_right: 80,
  guide_front: 80,
  welcome: 70,
  comfort: 65,
  self_intro: 60,
  offer_help: 55,
  count_one: 54,
  count_two: 54,
  count_continue: 54,
  count_three: 54,
  emphasize: 52,
  confirm: 50,
  thanks: 45,
  explain: 30,
  explain_left: 30,
  explain_right: 30,
  small_ack: 20,
};

const RULES: readonly { pattern: RegExp; motion: VRMSemanticMotion }[] = [
  { pattern: /再见|下次见|期待再次|祝您旅途愉快|一路平安/, motion: 'goodbye' },
  { pattern: /谢谢|感谢|多谢/, motion: 'thanks' },
  { pattern: /不要着急|别着急|不用担心|请放心|很抱歉|理解您的心情/, motion: 'comfort' },
  { pattern: /航班.*(?:取消|延误|异常)|请注意|注意安全|务必|警告|异常/, motion: 'alert' },
  { pattern: /左手边|(?:向|往)?左(?:边|侧|转|走|行)|左转/, motion: 'guide_left' },
  { pattern: /右手边|(?:向|往)?右(?:边|侧|转|走|行)|右转/, motion: 'guide_right' },
  { pattern: /向前|往前|直行|一直走|继续前行|前方直走|(?:请)?(?:跟|随)我来/, motion: 'guide_front' },
  { pattern: /您好|你好|欢迎|早上好|下午好|晚上好/, motion: 'welcome' },
  { pattern: /我是.*(?:数字人|客服|助手)|这里是.*(?:服务台|服务中心)|由我来为您服务/, motion: 'self_intro' },
  { pattern: /我可以.*(?:帮助|帮您|为您)|我来帮您|可以为您|可以帮助|可以帮您|可以协助|需要我.*帮助/, motion: 'offer_help' },
  { pattern: /^(?:第一|首先|第一步)/, motion: 'count_one' },
  { pattern: /^(?:第二|其次|第二步)/, motion: 'count_two' },
  { pattern: /^(?:第三|最后|最后一步)/, motion: 'count_three' },
  { pattern: /好的|没问题|已经.*(?:确认|完成)|确认完成|明白/, motion: 'confirm' },
  { pattern: /重点|特别|一定要|尤其|请记住/, motion: 'emphasize' },
];

interface TextSegment {
  text: string;
  startIndex: number;
}

function splitGestureSegments(text: string): TextSegment[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const raw: TextSegment[] = [];
  let buffer = '';
  let segmentStart = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (!buffer) segmentStart = index;
    if (/[。！？!?；;，,\n]/.test(char)) {
      const value = buffer.trim();
      if (value) raw.push({ text: value, startIndex: segmentStart });
      buffer = '';
    } else {
      buffer += char;
    }
  }
  const tail = buffer.trim();
  if (tail) raw.push({ text: tail, startIndex: segmentStart });

  const merged: TextSegment[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index];
    if (/^(第一|首先|第一步|第二|其次|第二步|第三|最后|最后一步)$/.test(current.text) && raw[index + 1]) {
      merged.push({
        text: `${current.text}，${raw[index + 1].text}`,
        startIndex: current.startIndex,
      });
      index += 1;
    } else {
      merged.push(current);
    }
  }
  return merged.slice(0, 16);
}

function classifySegment(text: string, fallback: VRMSemanticMotion): VRMSemanticMotion {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.motion;
  }
  return fallback;
}

function directionForMotion(motion: VRMSemanticMotion | null): GestureDirection {
  if (motion === 'guide_left') return 'left';
  if (motion === 'guide_right') return 'right';
  if (motion === 'guide_front') return 'front';
  return null;
}

function coSpeechForSegment(
  motion: VRMSemanticMotion | null,
  segmentIndex: number,
): VRMCoSpeechGesture {
  if (motion === 'alert' || motion === 'emphasize') return 'small_emphasis';
  if (motion === 'confirm' || motion === 'thanks') return 'medium_nod';
  // Directional semantic gestures own the arms; their secondary layer must not
  // add another arm target on top of the point.
  if (motion === 'guide_left' || motion === 'guide_right' || motion === 'guide_front') {
    return 'small_nod';
  }
  // The farewell already owns the waving arm. Keep its secondary layer on the
  // head so a simultaneous two-arm beat cannot make the transition look busy.
  if (motion === 'goodbye') return 'small_nod';
  if (motion === 'count_one' || motion === 'count_two') return 'small_present';
  if (motion === 'count_continue' || motion === 'count_three') return 'small_nod';
  const pool: readonly VRMCoSpeechGesture[] = [
    'beat_right', 'small_nod', 'beat_left', 'small_open', 'small_present',
  ];
  return pool[segmentIndex % pool.length];
}

function applyGestureContinuityPolicy(cues: readonly GestureCue[]): GestureCue[] {
  const directionalOptimized = cues.map((cue, cueIndex): GestureCue => {
    if (cue.primaryGesture !== 'guide_front' || !/(?:跟|随)我来/.test(cue.text)) {
      return cue;
    }

    const specificDirectionFollows = cues
      .slice(cueIndex + 1, cueIndex + 3)
      .some((nextCue) => (
        nextCue.primaryGesture === 'guide_left' || nextCue.primaryGesture === 'guide_right'
      ));
    if (!specificDirectionFollows) return cue;

    // “跟我来，目标在右/左手边” has one useful pointing direction. Keep the
    // invitation as a nod so the explicit side point is not preceded by a
    // competing forward-arm gesture.
    return {
      ...cue,
      primaryGesture: null,
      secondaryGesture: null,
      coSpeechGesture: 'small_nod',
      direction: null,
      emphasis: false,
      hold: 0,
    };
  });

  const closingOptimized = directionalOptimized.map((cue, cueIndex): GestureCue => {
    if (cue.primaryGesture !== 'thanks') return cue;

    // “谢谢……祝您……” is one conversational closing unit. Playing a two-hand
    // thanks pose immediately before a farewell wave makes both arms travel
    // between unrelated poses. Let the thanks phrase use a nod and reserve the
    // single visible arm gesture for the farewell itself.
    const farewellFollows = directionalOptimized
      .slice(cueIndex + 1, cueIndex + 3)
      .some((nextCue) => nextCue.primaryGesture === 'goodbye');
    if (!farewellFollows) return cue;

    return {
      ...cue,
      primaryGesture: null,
      secondaryGesture: null,
      coSpeechGesture: 'medium_nod',
      direction: null,
      emphasis: false,
      hold: 0,
    };
  });

  const enumerationCueIndices = closingOptimized.flatMap((cue, cueIndex) => (
    cue.primaryGesture === 'count_one'
    || cue.primaryGesture === 'count_two'
    || cue.primaryGesture === 'count_three'
      ? [cueIndex]
      : []
  ));
  if (enumerationCueIndices.length < 3) return closingOptimized;

  const firstEnumerationIndex = enumerationCueIndices[0];
  const lastEnumerationIndex = enumerationCueIndices.at(-1)!;
  return closingOptimized.map((cue, cueIndex): GestureCue => {
    const isEnumerationCue = cue.primaryGesture === 'count_one'
      || cue.primaryGesture === 'count_two'
      || cue.primaryGesture === 'count_three';
    if (
      !isEnumerationCue
      || cueIndex === firstEnumerationIndex
      || cueIndex === lastEnumerationIndex
    ) {
      return cue;
    }

    // Keep every enumeration marker visible, but connect middle markers with
    // the same arm used by the opening/closing poses. Standalone count motions
    // remain unchanged for direct/manual playback.
    const continuationDefinition = VRM_GESTURE_DEFINITIONS.count_continue;
    return {
      ...cue,
      primaryGesture: 'count_continue',
      secondaryGesture: null,
      coSpeechGesture: 'small_nod',
      direction: null,
      emphasis: false,
      hold: continuationDefinition.duration * continuationDefinition.holdRatio,
    };
  });
}

export function fallbackMotionFromLegacyGesture(gesture: AvatarGesture): VRMSemanticMotion {
  if (gesture === 'comfort' || gesture === 'alert' || gesture === 'confirm') return gesture;
  if (gesture === 'point') return 'guide_front';
  return 'explain';
}

function buildPlanForSegments(
  segments: TextSegment[],
  fallbackMotion: VRMSemanticMotion,
  speechDuration: number | undefined,
  exactStarts?: readonly number[],
): GestureCue[] {
  if (!segments.length) return [];

  const sourceLength = Math.max(
    segments.at(-1)!.startIndex + segments.at(-1)!.text.length,
    1,
  );
  let explainCount = 0;
  let confirmCount = 0;
  let previousMotion: VRMSemanticMotion | null = null;

  const cues: GestureCue[] = segments.map((segment, segmentIndex) => {
    let motion: VRMSemanticMotion | null = classifySegment(segment.text, fallbackMotion);
    if (motion === 'explain') {
      const pool: readonly (VRMSemanticMotion | null)[] = [
        'explain_left', null, null, 'explain_right', null,
      ];
      motion = pool[explainCount % pool.length];
      explainCount += 1;
    } else if (motion === 'confirm') {
      const pool: readonly (VRMSemanticMotion | null)[] = ['confirm', null, 'small_ack'];
      motion = pool[confirmCount % pool.length];
      confirmCount += 1;
    }

    if (motion && motion === previousMotion && motion !== 'guide_left' && motion !== 'guide_right') {
      motion = motion === 'offer_help' ? 'explain_right' : 'small_ack';
    }
    if (motion) previousMotion = motion;

    const relativeCharacterStart = Math.min(1, segment.startIndex / sourceLength);
    const startAt = exactStarts?.[segmentIndex] ?? (
      speechDuration && speechDuration > 0.5
        ? 0.12 + (relativeCharacterStart * Math.max(0.5, speechDuration - 0.35))
        : 0.12 + (segment.startIndex / 6.5)
    );
    const definition = motion ? VRM_GESTURE_DEFINITIONS[motion] : null;
    const secondaryGesture = motion === 'comfort' && /帮|帮助/.test(segment.text)
      ? 'offer_help'
      : null;

    return {
      key: `${segment.startIndex}:${motion ?? 'speaking_idle'}`,
      text: segment.text,
      primaryGesture: motion,
      secondaryGesture,
      coSpeechGesture: coSpeechForSegment(motion, segmentIndex),
      direction: directionForMotion(motion),
      emphasis: motion === 'alert' || motion === 'emphasize',
      hold: definition ? definition.duration * definition.holdRatio : 0,
      startAt,
    };
  });

  return applyGestureContinuityPolicy(cues);
}

export function buildGesturePlan(
  replyText: string,
  fallbackMotion: VRMSemanticMotion = 'explain',
  speechDuration?: number,
): GestureCue[] {
  return buildPlanForSegments(
    splitGestureSegments(replyText),
    fallbackMotion,
    speechDuration,
  );
}

export function buildGesturePlanFromSpeechSegments(
  speechSegments: readonly AvatarSpeechSegmentTiming[],
  fallbackMotion: VRMSemanticMotion = 'explain',
): GestureCue[] {
  let characterOffset = 0;
  const segments = speechSegments.map((segment) => {
    const planSegment = { text: segment.text.trim(), startIndex: characterOffset };
    characterOffset += planSegment.text.length + 1;
    return planSegment;
  }).filter((segment) => segment.text);

  return buildPlanForSegments(
    segments,
    fallbackMotion,
    undefined,
    speechSegments.map((segment) => segment.startTime),
  );
}

export type MotionLabGroup = 'Idle' | 'Generated' | 'Existing';

export type MotionLabEntry = {
  id: string;
  label: string;
  group: MotionLabGroup;
  index: number;
  duration: number;
  sourceFile: string;
  qaPrompts?: readonly string[];
};

export const MOTION_LAB_MODEL_PATH = '/motion-lab/kefu2-lab.model3.json';

export const MOTION_LAB_IDLE: MotionLabEntry = {
  id: 'idle',
  label: 'Reset / Idle',
  group: 'Idle',
  index: 0,
  duration: 3.1,
  sourceFile: 'wuhan1/daiji.motion3.json',
};

export const MOTION_LAB_GENERATED: readonly MotionLabEntry[] = [
  {
    id: 'point_right',
    label: 'Point Right',
    group: 'Generated',
    index: 0,
    duration: 1.9,
    sourceFile: 'generated-motions/point_right.motion3.json',
    qaPrompts: [
      '是否明显抬起右侧手臂',
      '是否具有方向引导感',
      '是否更像 present / wave',
      '头和身体方向是否协调',
      '动作是否过大',
      '结束是否回 neutral',
    ],
  },
  {
    id: 'point_front',
    label: 'Point Front',
    group: 'Generated',
    index: 1,
    duration: 1.8,
    sourceFile: 'generated-motions/point_front.motion3.json',
    qaPrompts: [
      '是否保持基本正面',
      '是否像“请往前走 / 前方”',
      '是否只是普通抬手',
      '是否自然回 neutral',
    ],
  },
  {
    id: 'comfort',
    label: 'Comfort',
    group: 'Generated',
    index: 2,
    duration: 2.2,
    sourceFile: 'generated-motions/comfort.motion3.json',
    qaPrompts: [
      '是否柔和',
      '是否像安抚而不是低头',
      '是否过于轻微',
      '是否和说话微动作有明显区别',
      '是否自然回 neutral',
    ],
  },
] as const;

export const MOTION_LAB_EXISTING: readonly MotionLabEntry[] = [
  {
    id: 'greet',
    label: 'Greet',
    group: 'Existing',
    index: 0,
    duration: 4.1,
    sourceFile: 'wuhan1/greet.motion3.json',
  },
  {
    id: 'present',
    label: 'Present',
    group: 'Existing',
    index: 1,
    duration: 4.467,
    sourceFile: 'wuhan1/present.motion3.json',
  },
  {
    id: 'confirm_candidate',
    label: 'Confirm candidate',
    group: 'Existing',
    index: 2,
    duration: 0.867,
    sourceFile: 'wuhan1/youzhonghui01.motion3.json',
  },
  {
    id: 'alert_candidate',
    label: 'Alert candidate',
    group: 'Existing',
    index: 3,
    duration: 1.367,
    sourceFile: 'wuhan1/youdahui01.motion3.json',
  },
] as const;

'use client';

import type { DisplayObject } from '@pixi/display';
import { MutableRefObject, useEffect, useRef, useState } from 'react';
import type { Live2DAction, VisemeFrame } from '@/types/terminal';
import { LIVE2D_MODEL, LIVE2D_MODEL_URL, MOTION_DEFINITIONS, type SemanticMotion } from '@/components/avatar/live2d/modelConfig';

type Live2DAvatarProps = {
  status: string;
  emotion?: string;
  replyText?: string;
  viewMode?: AvatarViewMode;
  visemeTrackRef?: MutableRefObject<VisemeFrame[]>;
  speechTimeRef?: MutableRefObject<number>;
  speakingRef?: MutableRefObject<boolean>;
  mouthOpenRef?: MutableRefObject<number>;
  mouthFormRef?: MutableRefObject<number>;
  action?: Live2DAction | string;
  /** Optional lab trigger: replay the same semantic command without remounting. */
  motionRequestId?: number;
  onMotionState?: (motion: string) => void;
};

export type AvatarViewMode = 'full' | 'half';

type RuntimeWindow = Window & typeof globalThis & {
  PIXI?: unknown;
  Live2DCubismCore?: unknown;
};

type EmotionPreset = {
  browY: number;
  browForm: number;
  eyeOpen: number;
  mouthForm: number;
  angleX: number;
  angleY: number;
  bodyX: number;
  cheek: number;
};

type ActionGesture = {
  angleX: number;
  angleY: number;
  angleZ: number;
  bodyX: number;
  bodyY: number;
  bodyZ: number;
  upper: number;
  armLA: number;
  armRA: number;
  armLB: number;
  armRB: number;
  handR: number;
  handL: number;
  handAngleR: number;
  handAngleL: number;
  bust: number;
  tempo: number;
  amplitude: number;
};

type SequencedActionGesture = ActionGesture & {
  duration: number;
};

type MotionCue = {
  key: string;
  startAt: number;
  motion: SemanticMotion;
};

type GuideDirection = 'guide_left' | 'guide_right';

type SpeakingSchedulerState = {
  primaryMotion: SemanticMotion | null;
  directionLock: GuideDirection | null;
  alertLocked: boolean;
  primaryPlayed: boolean;
  auxiliaryCount: number;
  nextAuxiliaryAt: number;
  motionAvailableAt: number;
  lastPlayedMotion: SemanticMotion | null;
  lastPlayedAtByMotion: Map<SemanticMotion, number>;
};

type GazeMode = 'idle' | 'listening' | 'speaking';

type GazeTarget = {
  x: number;
  y: number;
  holdSeconds: number;
};

type RuntimeMotion = {
  setIsLoop?: (loop: boolean) => void;
};

type RuntimeMotionManager = {
  loadMotion?: (group: string, index: number) => Promise<RuntimeMotion | undefined>;
  stopAllMotions?: () => void;
  groups?: { idle: string };
  on?: (event: 'motionFinish', handler: () => void) => void;
  off?: (event: 'motionFinish', handler: () => void) => void;
};

type RuntimeLive2DModel = {
  anchor?: { set: (x: number, y?: number) => void };
  scale?: { set: (x: number, y?: number) => void };
  position?: { set: (x: number, y: number) => void };
  internalModel?: {
    width?: number;
    height?: number;
    motionManager?: RuntimeMotionManager;
    on?: (event: 'beforeModelUpdate' | 'beforeMotionUpdate' | 'afterMotionUpdate', handler: () => void) => void;
    off?: (event: 'beforeModelUpdate' | 'beforeMotionUpdate' | 'afterMotionUpdate', handler: () => void) => void;
    coreModel?: {
      getParameterCount?: () => number;
      getParameterIndex?: (parameterId: string) => number;
      setParameterValueById?: (parameterId: string, value: number, weight?: number) => void;
      getParameterValueById?: (parameterId: string) => number;
      getParameterDefaultValue?: (parameterIndex: number) => number;
      getModel?: () => { parameters: { ids: string[] } };
    };
  };
  expression?: (id?: number | string) => Promise<boolean>;
  motion?: (group: string, index?: number, priority?: number) => Promise<boolean>;
  destroy?: (options?: Record<string, unknown>) => void;
};

type RuntimeLive2DDisplayObject = DisplayObject & RuntimeLive2DModel;

const CUBISM_CORE_SCRIPT = '/live2d/live2dcubismcore.min.js';
const MOTION_PRIORITY_IDLE = 1;
const MOTION_PRIORITY_NORMAL = 2;
const MOTION_PRIORITY_FORCE = 3;
const MOTION_CUE_START_OFFSET_SEC = 0.08;
const MOTION_CUE_MIN_GAP_SEC = 1.25;
const MOTION_CUE_MAX_GAP_SEC = 2.05;
const MOTION_MAX_CUES = 10;
const MOTION_SEGMENT_MAX_CHARS = 18;
const MOTION_INTER_GESTURE_GAP_SEC = 2.2;
const MOTION_REPEAT_COOLDOWN_SEC = 6;
const MOTION_AUXILIARY_START_SEC = 6;
const MOTION_AUXILIARY_INTERVAL_SEC = 6;
const MOTION_MAX_AUXILIARY_COUNT = 2;
const BLINK_INTERVAL_MIN_SEC = 2.8;
const BLINK_INTERVAL_MAX_SEC = 6.2;
const BLINK_CLOSE_SEC = 0.13;
const BLINK_HOLD_SEC = 0.04;
const BLINK_OPEN_SEC = 0.12;
const BLINK_CLOSED_VALUE = 0.08;
const SPEAKING_CONTINUOUS_SCALE = 0.28;
const SPEAKING_GESTURE_HEAD_SCALE = 0.32;
const SPEAKING_GESTURE_BODY_SCALE = 0.24;
const SPEAKING_DIRECT_PARAMETER_WEIGHT = 0.24;
const POSE_PARAMETERS = [
  'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
  'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ',
  'ParamEyeBallX', 'ParamEyeBallY', 'ParamBreath',
  'ParamBreath2', 'Param7', 'Param9', 'Param10', 'Param11',
];

const SEGMENT_MOTION_RULES: Array<{ motion: SemanticMotion; pattern: RegExp }> = [
  { motion: 'goodbye', pattern: /再见|下次见|一路平安|旅途愉快|祝您.*愉快|期待再次/ },
  { motion: 'welcome', pattern: /欢迎|您好|你好|早上好|下午好|晚上好|很高兴为您服务/ },
  { motion: 'guide_left', pattern: /左侧|左边|向左|往左|左转/ },
  { motion: 'guide_right', pattern: /右侧|右边|向右|往右|右转/ },
  { motion: 'alert', pattern: /紧急|马上|立即|延误|取消|异常|警报|危险|注意|请注意|不要|禁止|关闭|停止|高压/ },
  { motion: 'comfort', pattern: /别着急|不用担心|请放心|我来|帮您|协助|稍等|可以先|建议您先|没关系|理解/ },
  { motion: 'confirm', pattern: /好的|可以|已为您|没问题|完成|谢谢|不客气|确认|收到|明白/ },
  // kefu3 has no guide_front asset. Direction-neutral navigation uses explain
  // instead of inventing a right-hand direction.
  { motion: 'explain', pattern: /登机口|值机|安检|行李|出口|电梯|扶梯|前方|直行|楼|层|到达|出发|柜台|区域|航站楼|路线|导航|这边|那边|前往/ },
];

const AUXILIARY_MOTION_SEQUENCES: Record<SemanticMotion, SemanticMotion[]> = {
  idle: [],
  welcome: ['confirm', 'explain'],
  guide_left: ['explain', 'confirm'],
  guide_right: ['explain', 'confirm'],
  explain: ['confirm', 'explain'],
  confirm: ['explain', 'confirm'],
  comfort: ['explain', 'confirm'],
  alert: ['explain', 'alert'],
  goodbye: [],
};

const EMOTION_PRESETS: Record<string, EmotionPreset> = {
  neutral: { browY: 0, browForm: 0, eyeOpen: 1, mouthForm: 0, angleX: 0, angleY: 0, bodyX: 0, cheek: 0 },
  smile: { browY: 0.28, browForm: 0.14, eyeOpen: 0.92, mouthForm: 0.45, angleX: 0, angleY: 0.4, bodyX: 0.6, cheek: 0.36 },
  shy: { browY: 0.18, browForm: -0.08, eyeOpen: 0.84, mouthForm: 0.18, angleX: -1.5, angleY: -2.2, bodyX: -1.2, cheek: 0.18 },
  sad: { browY: -0.34, browForm: -0.22, eyeOpen: 0.78, mouthForm: -0.38, angleX: 0.4, angleY: -3.2, bodyX: -0.8, cheek: 0 },
  angry: { browY: -0.52, browForm: 0.28, eyeOpen: 0.86, mouthForm: -0.18, angleX: 2.5, angleY: 0.8, bodyX: 1.6, cheek: 0 },
  surprised: { browY: 0.52, browForm: 0.12, eyeOpen: 1.22, mouthForm: 0.12, angleX: 0, angleY: 3.2, bodyX: 0.6, cheek: 0 },
};

const ACTION_GESTURES: Record<Live2DAction, ActionGesture> = {
  explain: {
    angleX: 0,
    angleY: 0.4,
    angleZ: 0,
    bodyX: 0.2,
    bodyY: 0.2,
    bodyZ: 0.2,
    upper: 0.65,
    armLA: 0.48,
    armRA: 0.48,
    armLB: 0.28,
    armRB: 0.22,
    handR: 0,
    handL: 0,
    handAngleR: 0.08,
    handAngleL: -0.08,
    bust: 0.35,
    tempo: 3.2,
    amplitude: 0.55,
  },
  point: {
    angleX: -1.8,
    angleY: 0.8,
    angleZ: -1.2,
    bodyX: -1.1,
    bodyY: 0.55,
    bodyZ: -0.65,
    upper: 1.55,
    armLA: 0.16,
    armRA: 0.12,
    armLB: 0.72,
    armRB: 0.96,
    handR: 1,
    handL: 0,
    handAngleR: -0.45,
    handAngleL: 0.12,
    bust: 0.75,
    tempo: 3.8,
    amplitude: 0.72,
  },
  comfort: {
    angleX: 0.6,
    angleY: -1.2,
    angleZ: 0.7,
    bodyX: 0.3,
    bodyY: -0.45,
    bodyZ: 0.45,
    upper: 0.9,
    armLA: 0.8,
    armRA: 0.72,
    armLB: 0.34,
    armRB: 0.42,
    handR: 0,
    handL: 0,
    handAngleR: 0.25,
    handAngleL: -0.25,
    bust: 0.25,
    tempo: 2.4,
    amplitude: 0.38,
  },
  alert: {
    angleX: 2.2,
    angleY: 1.4,
    angleZ: 1.1,
    bodyX: 1.4,
    bodyY: 0.65,
    bodyZ: 0.85,
    upper: 1.8,
    armLA: 0.26,
    armRA: 0.3,
    armLB: 0.88,
    armRB: 0.7,
    handR: 1,
    handL: 1,
    handAngleR: 0.55,
    handAngleL: -0.5,
    bust: 0.95,
    tempo: 5.1,
    amplitude: 0.86,
  },
  confirm: {
    angleX: 0,
    angleY: 1.5,
    angleZ: -0.35,
    bodyX: 0,
    bodyY: 0.75,
    bodyZ: -0.25,
    upper: 1.15,
    armLA: 0.36,
    armRA: 0.34,
    armLB: 0.58,
    armRB: 0.44,
    handR: 1,
    handL: 0,
    handAngleR: 0.3,
    handAngleL: -0.14,
    bust: 0.55,
    tempo: 3.5,
    amplitude: 0.62,
  },
};

const ACTION_GESTURE_SEQUENCES: Record<Live2DAction, SequencedActionGesture[]> = {
  explain: [
    {
      ...ACTION_GESTURES.explain,
      duration: 0.58,
      upper: 0.82,
      armLA: 0.28,
      armRA: 0.72,
      armLB: 0.46,
      armRB: 0.18,
      handAngleR: 0.42,
      handAngleL: -0.22,
      bodyZ: -0.35,
    },
    {
      ...ACTION_GESTURES.explain,
      duration: 0.72,
      angleX: -1.2,
      upper: 1.32,
      armLA: 0.18,
      armRA: 0.22,
      armLB: 0.86,
      armRB: 0.54,
      handR: 1,
      handAngleR: -0.28,
      handAngleL: 0.2,
      bodyZ: -0.75,
      amplitude: 0.82,
    },
    {
      ...ACTION_GESTURES.explain,
      duration: 0.64,
      angleX: 1.1,
      upper: 1.18,
      armLA: 0.78,
      armRA: 0.26,
      armLB: 0.24,
      armRB: 0.84,
      handL: 1,
      handAngleR: 0.16,
      handAngleL: -0.42,
      bodyZ: 0.65,
      amplitude: 0.78,
    },
    {
      ...ACTION_GESTURES.explain,
      duration: 0.56,
      upper: 0.72,
      armLA: 0.48,
      armRA: 0.46,
      armLB: 0.34,
      armRB: 0.3,
      handAngleR: 0.08,
      handAngleL: -0.08,
      bodyY: 0.65,
    },
  ],
  point: [
    {
      ...ACTION_GESTURES.point,
      duration: 0.48,
      angleX: -0.8,
      angleY: 1.6,
      upper: 1.1,
      armLA: 0.52,
      armRA: 0.42,
      armLB: 0.34,
      armRB: 0.46,
      handR: 1,
      handAngleR: 0.2,
      bodyZ: -0.25,
    },
    {
      ...ACTION_GESTURES.point,
      duration: 0.76,
      angleX: -3.2,
      angleY: 2.3,
      angleZ: -2.1,
      bodyX: -2.2,
      bodyY: 1.25,
      bodyZ: -1.45,
      upper: 2.15,
      armLA: -0.04,
      armRA: -0.16,
      armLB: 1.08,
      armRB: 1.36,
      handR: 1,
      handL: 0,
      handAngleR: -0.72,
      handAngleL: 0.3,
      amplitude: 1,
    },
    {
      ...ACTION_GESTURES.point,
      duration: 0.7,
      angleX: -1.4,
      angleY: 1.2,
      angleZ: 0.75,
      bodyX: -0.7,
      bodyY: 0.85,
      bodyZ: 0.55,
      upper: 1.72,
      armLA: 0.24,
      armRA: 0.04,
      armLB: 0.58,
      armRB: 1.12,
      handR: 1,
      handAngleR: -0.18,
      handAngleL: 0.18,
      tempo: 4.6,
      amplitude: 0.92,
    },
    {
      ...ACTION_GESTURES.point,
      duration: 0.56,
      angleX: 0.2,
      angleY: 1.45,
      angleZ: -0.3,
      bodyX: 0.2,
      bodyY: 0.85,
      bodyZ: -0.2,
      upper: 1.18,
      armLA: 0.34,
      armRA: 0.24,
      armLB: 0.68,
      armRB: 0.62,
      handR: 1,
      handAngleR: 0.28,
    },
  ],
  comfort: [
    {
      ...ACTION_GESTURES.comfort,
      duration: 0.62,
      angleY: -1.6,
      upper: 0.78,
      armLA: 0.86,
      armRA: 0.78,
      armLB: 0.26,
      armRB: 0.28,
      handAngleR: 0.32,
      handAngleL: -0.32,
    },
    {
      ...ACTION_GESTURES.comfort,
      duration: 0.74,
      angleX: 0.8,
      angleY: -1.8,
      bodyY: -0.8,
      upper: 1.22,
      armLA: 0.54,
      armRA: 0.5,
      armLB: 0.62,
      armRB: 0.66,
      handR: 0,
      handL: 0,
      handAngleR: 0.18,
      handAngleL: -0.18,
      tempo: 2.1,
      amplitude: 0.58,
    },
    {
      ...ACTION_GESTURES.comfort,
      duration: 0.68,
      angleX: -0.55,
      angleY: -0.9,
      bodyZ: -0.35,
      upper: 0.95,
      armLA: 0.32,
      armRA: 0.34,
      armLB: 0.42,
      armRB: 0.5,
      handAngleR: -0.16,
      handAngleL: 0.16,
      amplitude: 0.52,
    },
    {
      ...ACTION_GESTURES.comfort,
      duration: 0.56,
      angleY: -0.6,
      upper: 0.72,
      armLA: 0.72,
      armRA: 0.66,
      armLB: 0.3,
      armRB: 0.34,
      handAngleR: 0.2,
      handAngleL: -0.2,
    },
  ],
  alert: [
    {
      ...ACTION_GESTURES.alert,
      duration: 0.42,
      angleY: 2.2,
      upper: 1.4,
      armLA: 0.36,
      armRA: 0.18,
      armLB: 0.38,
      armRB: 0.72,
      handR: 1,
      handL: 0,
      handAngleR: 0.5,
    },
    {
      ...ACTION_GESTURES.alert,
      duration: 0.56,
      angleX: 3.4,
      angleY: 2.5,
      angleZ: 1.8,
      bodyX: 2.1,
      bodyY: 1.2,
      bodyZ: 1.3,
      upper: 2.2,
      armLA: -0.02,
      armRA: 0.02,
      armLB: 1.12,
      armRB: 0.95,
      handR: 1,
      handL: 1,
      handAngleR: 0.82,
      handAngleL: -0.78,
      tempo: 6.2,
      amplitude: 1,
    },
    {
      ...ACTION_GESTURES.alert,
      duration: 0.5,
      angleX: -1.8,
      angleY: 1.8,
      angleZ: -1.4,
      bodyX: -0.8,
      bodyZ: -0.9,
      upper: 1.95,
      armLA: 0.22,
      armRA: -0.12,
      armLB: 0.76,
      armRB: 1.28,
      handR: 1,
      handL: 1,
      handAngleR: -0.52,
      handAngleL: 0.48,
      amplitude: 0.96,
    },
    {
      ...ACTION_GESTURES.alert,
      duration: 0.46,
      angleY: 1.1,
      bodyY: 0.8,
      upper: 1.28,
      armLA: 0.44,
      armRA: 0.32,
      armLB: 0.46,
      armRB: 0.52,
      handR: 1,
      handL: 0,
      handAngleR: 0.28,
    },
  ],
  confirm: [
    {
      ...ACTION_GESTURES.confirm,
      duration: 0.46,
      angleY: 1.9,
      upper: 0.9,
      armLA: 0.48,
      armRA: 0.42,
      armLB: 0.36,
      armRB: 0.42,
      handR: 1,
      handAngleR: 0.18,
    },
    {
      ...ACTION_GESTURES.confirm,
      duration: 0.62,
      angleY: 2.4,
      angleZ: -0.9,
      bodyY: 1.05,
      bodyZ: -0.55,
      upper: 1.55,
      armLA: 0.22,
      armRA: 0.08,
      armLB: 0.78,
      armRB: 0.86,
      handR: 1,
      handL: 0,
      handAngleR: 0.62,
      handAngleL: -0.18,
      amplitude: 0.86,
    },
    {
      ...ACTION_GESTURES.confirm,
      duration: 0.58,
      angleX: 0.9,
      angleY: 1.2,
      angleZ: 0.45,
      bodyZ: 0.45,
      upper: 1.28,
      armLA: 0.16,
      armRA: 0.28,
      armLB: 0.96,
      armRB: 0.52,
      handR: 1,
      handL: 1,
      handAngleR: -0.16,
      handAngleL: -0.52,
      amplitude: 0.8,
    },
    {
      ...ACTION_GESTURES.confirm,
      duration: 0.5,
      angleY: 1.1,
      upper: 0.82,
      armLA: 0.44,
      armRA: 0.4,
      armLB: 0.42,
      armRB: 0.36,
      handR: 0,
      handL: 0,
      handAngleR: 0.08,
      handAngleL: -0.08,
    },
  ],
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const lerp = (from: number, to: number, alpha: number) => from + ((to - from) * alpha);
const smoothstep = (value: number) => {
  const x = clamp01(value);
  return x * x * (3 - (2 * x));
};

function blendGesture(from: ActionGesture, to: ActionGesture, alpha: number): ActionGesture {
  const t = smoothstep(alpha);
  return {
    angleX: lerp(from.angleX, to.angleX, t),
    angleY: lerp(from.angleY, to.angleY, t),
    angleZ: lerp(from.angleZ, to.angleZ, t),
    bodyX: lerp(from.bodyX, to.bodyX, t),
    bodyY: lerp(from.bodyY, to.bodyY, t),
    bodyZ: lerp(from.bodyZ, to.bodyZ, t),
    upper: lerp(from.upper, to.upper, t),
    armLA: lerp(from.armLA, to.armLA, t),
    armRA: lerp(from.armRA, to.armRA, t),
    armLB: lerp(from.armLB, to.armLB, t),
    armRB: lerp(from.armRB, to.armRB, t),
    handR: lerp(from.handR, to.handR, t),
    handL: lerp(from.handL, to.handL, t),
    handAngleR: lerp(from.handAngleR, to.handAngleR, t),
    handAngleL: lerp(from.handAngleL, to.handAngleL, t),
    bust: lerp(from.bust, to.bust, t),
    tempo: lerp(from.tempo, to.tempo, t),
    amplitude: lerp(from.amplitude, to.amplitude, t),
  };
}

export function resolveSequencedGesture(action: Live2DAction, time: number, isSpeaking: boolean): ActionGesture {
  const sequence = ACTION_GESTURE_SEQUENCES[action] ?? ACTION_GESTURE_SEQUENCES.explain;
  if (!isSpeaking || sequence.length === 0) {
    return ACTION_GESTURES[action] ?? ACTION_GESTURES.explain;
  }

  const cycleDuration = sequence.reduce((sum, item) => sum + item.duration, 0);
  let localTime = ((time % cycleDuration) + cycleDuration) % cycleDuration;

  for (let index = 0; index < sequence.length; index += 1) {
    const current = sequence[index];
    if (localTime <= current.duration) {
      const next = sequence[(index + 1) % sequence.length];
      return blendGesture(current, next, localTime / Math.max(current.duration, 1e-3));
    }

    localTime -= current.duration;
  }

  return sequence[0];
}

function loadScript(src: string) {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (document.querySelector(`script[src="${src}"]`)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

function sampleVisemeFrame(
  track: VisemeFrame[],
  time: number,
  cursorRef: MutableRefObject<number>,
): VisemeFrame | null {
  if (!track.length) {
    return null;
  }

  let cursor = Math.min(cursorRef.current, track.length - 1);
  while (cursor + 1 < track.length && track[cursor + 1].t <= time) {
    cursor += 1;
  }
  while (cursor > 0 && track[cursor].t > time) {
    cursor -= 1;
  }
  cursorRef.current = cursor;

  const current = track[cursor];
  const next = track[cursor + 1];
  if (!current) {
    return null;
  }
  if (!next || time <= current.t) {
    return current;
  }

  const span = Math.max(next.t - current.t, 1e-3);
  const alpha = clamp01((time - current.t) / span);
  return {
    t: time,
    y: lerp(current.y, next.y, alpha),
    f: lerp(current.f, next.f, alpha),
  };
}

function randomBetween(min: number, max: number): number {
  return min + (Math.random() * (max - min));
}

function resolveBlink(
  nowSeconds: number,
  nextBlinkAtRef: MutableRefObject<number>,
  blinkStartAtRef: MutableRefObject<number | null>,
): number {
  if (nextBlinkAtRef.current <= 0) {
    nextBlinkAtRef.current = nowSeconds + randomBetween(BLINK_INTERVAL_MIN_SEC, BLINK_INTERVAL_MAX_SEC);
  }

  if (blinkStartAtRef.current === null) {
    if (nowSeconds < nextBlinkAtRef.current) {
      return 1;
    }
    blinkStartAtRef.current = nowSeconds;
  }

  const elapsed = nowSeconds - blinkStartAtRef.current;
  if (elapsed < BLINK_CLOSE_SEC) {
    return lerp(1, BLINK_CLOSED_VALUE, elapsed / BLINK_CLOSE_SEC);
  }
  if (elapsed < BLINK_CLOSE_SEC + BLINK_HOLD_SEC) {
    return BLINK_CLOSED_VALUE;
  }
  if (elapsed < BLINK_CLOSE_SEC + BLINK_HOLD_SEC + BLINK_OPEN_SEC) {
    const reopenElapsed = elapsed - BLINK_CLOSE_SEC - BLINK_HOLD_SEC;
    return lerp(BLINK_CLOSED_VALUE, 1, reopenElapsed / BLINK_OPEN_SEC);
  }

  blinkStartAtRef.current = null;
  nextBlinkAtRef.current = nowSeconds + randomBetween(BLINK_INTERVAL_MIN_SEC, BLINK_INTERVAL_MAX_SEC);
  return 1;
}

function createGazeTarget(mode: GazeMode): GazeTarget {
  const limits = mode === 'listening'
    ? { x: 0.07, y: 0.035, minHold: 2.4, maxHold: 4.6 }
    : mode === 'speaking'
      ? { x: 0.1, y: 0.045, minHold: 1.9, maxHold: 4 }
      : { x: 0.18, y: 0.08, minHold: 1.8, maxHold: 4.4 };
  const glanceScale = Math.random() < 0.16 ? 1 : 0.52;
  const centeredRandom = () => Math.random() + Math.random() - 1;

  return {
    x: centeredRandom() * limits.x * glanceScale,
    y: centeredRandom() * limits.y * glanceScale,
    holdSeconds: randomBetween(limits.minHold, limits.maxHold),
  };
}

function normalizeAction(action: Live2DAction | string | undefined): Live2DAction {
  if (
    action === 'point' ||
    action === 'comfort' ||
    action === 'alert' ||
    action === 'confirm' ||
    action === 'explain'
  ) {
    return action;
  }

  if (action === 'guide_left' || action === 'guide_right') {
    return 'point';
  }

  if (action === 'welcome' || action === 'goodbye') {
    return 'confirm';
  }

  return 'explain';
}

function normalizeSemanticMotion(action: Live2DAction | string | undefined): SemanticMotion {
  if (action === 'waiting' || action === 'idle') {
    return 'idle';
  }
  if (
    action === 'welcome'
    || action === 'guide_left'
    || action === 'guide_right'
    || action === 'explain'
    || action === 'confirm'
    || action === 'comfort'
    || action === 'alert'
    || action === 'goodbye'
  ) {
    return action;
  }
  if (action === 'point') {
    return 'guide_right';
  }

  return 'explain';
}

function detectExplicitGuideDirection(text: string): GuideDirection | null {
  const leftMatch = text.search(/左侧|左边|向左|往左|左转/);
  const rightMatch = text.search(/右侧|右边|向右|往右|右转/);

  if (leftMatch < 0) return rightMatch < 0 ? null : 'guide_right';
  if (rightMatch < 0) return 'guide_left';
  return leftMatch <= rightMatch ? 'guide_left' : 'guide_right';
}

function createSpeakingSchedulerState(): SpeakingSchedulerState {
  return {
    primaryMotion: null,
    directionLock: null,
    alertLocked: false,
    primaryPlayed: false,
    auxiliaryCount: 0,
    nextAuxiliaryAt: MOTION_AUXILIARY_START_SEC,
    motionAvailableAt: 0,
    lastPlayedMotion: null,
    lastPlayedAtByMotion: new Map(),
  };
}

function resolveDirectionLockedMotion(
  motion: SemanticMotion,
  directionLock: GuideDirection | null,
): SemanticMotion {
  if ((motion === 'guide_left' || motion === 'guide_right') && directionLock) {
    return directionLock;
  }
  return motion;
}

function selectAuxiliaryMotion(
  state: SpeakingSchedulerState,
): SemanticMotion | null {
  const primaryMotion = state.primaryMotion;
  if (!primaryMotion) return null;

  const sequence = AUXILIARY_MOTION_SEQUENCES[primaryMotion];
  if (sequence.length === 0) return null;

  for (let offset = 0; offset < sequence.length; offset += 1) {
    const index = (state.auxiliaryCount + offset) % sequence.length;
    const candidate = resolveDirectionLockedMotion(sequence[index], state.directionLock);
    if (candidate !== state.lastPlayedMotion || sequence.length === 1) {
      return candidate;
    }
  }

  return sequence[state.auxiliaryCount % sequence.length] ?? null;
}

function splitReplyMotionSegments(replyText: string): string[] {
  const text = replyText.replace(/\s+/g, ' ').trim();
  if (!text) {
    return [];
  }

  const segments: string[] = [];
  let buffer = '';

  for (const char of text) {
    buffer += char;
    if (/[\n。！？!?；;，,、]/.test(char) || buffer.length >= MOTION_SEGMENT_MAX_CHARS) {
      const segment = buffer.trim();
      if (segment) {
        segments.push(segment);
      }
      buffer = '';
    }
  }

  const tail = buffer.trim();
  if (tail) {
    segments.push(tail);
  }

  return segments.slice(0, MOTION_MAX_CUES);
}

function deriveMotionFromTextSegment(segment: string, fallbackMotion: SemanticMotion): SemanticMotion {
  for (const rule of SEGMENT_MOTION_RULES) {
    if (rule.pattern.test(segment)) {
      return rule.motion;
    }
  }

  return fallbackMotion;
}

function buildMotionCues(
  replyText: string,
  baseAction: Live2DAction | string | undefined,
): MotionCue[] {
  const segments = splitReplyMotionSegments(replyText);
  if (segments.length === 0) {
    return [];
  }

  const cues: MotionCue[] = [];
  let startAt = MOTION_CUE_START_OFFSET_SEC;
  const fallbackMotion = normalizeSemanticMotion(baseAction);
  let previousMotion: SemanticMotion | null = null;

  segments.forEach((segment, index) => {
    const motion = deriveMotionFromTextSegment(segment, fallbackMotion);
    const compactLength = segment.replace(/\s/g, '').length;
    const gap = clamp(0.92 + (compactLength * 0.045), MOTION_CUE_MIN_GAP_SEC, MOTION_CUE_MAX_GAP_SEC);

    // Sentence/TTS segmentation can be much denser than meaningful gesture
    // changes. Collapse consecutive equal semantics so a motion is never fired
    // merely because another sentence entered the queue.
    if (motion !== previousMotion) {
      cues.push({
        key: `${index}:${motion}`,
        startAt,
        motion,
      });
      previousMotion = motion;
    }

    startAt += gap;
  });

  return cues;
}

export default function Live2DAvatar({
  status,
  emotion = 'neutral',
  replyText = '',
  viewMode = 'half',
  visemeTrackRef,
  speechTimeRef,
  speakingRef,
  mouthOpenRef,
  mouthFormRef,
  action = 'explain',
  motionRequestId,
  onMotionState,
}: Live2DAvatarProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const visemeCursorRef = useRef(0);
  const lastSpeechTimeRef = useRef(0);
  const emotionRef = useRef(emotion);
  const actionRef = useRef<Live2DAction | string>(action);
  const labRequestRef = useRef(motionRequestId);
  const onMotionStateRef = useRef(onMotionState);
  const statusRef = useRef(status);
  const viewModeRef = useRef<AvatarViewMode>(viewMode);
  const resizeModelRef = useRef<(() => void) | null>(null);
  const lastMotionAtRef = useRef(0);
  const lastMotionDurationRef = useRef(0);
  const lastSemanticMotionRef = useRef<SemanticMotion>(normalizeSemanticMotion(action));
  const replyTextRef = useRef(replyText);
  const motionCuesRef = useRef<MotionCue[]>(buildMotionCues(replyText, action));
  const playedMotionCueKeysRef = useRef<Set<string>>(new Set());
  const lastMotionCueSignatureRef = useRef(`${normalizeSemanticMotion(action)}:${replyText}`);
  const wasSpeakingRef = useRef(false);
  const nextBlinkAtRef = useRef(0);
  const blinkStartAtRef = useRef<number | null>(null);
  const gazeXRef = useRef(0);
  const gazeYRef = useRef(0);
  const gazeTargetXRef = useRef(0);
  const gazeTargetYRef = useRef(0);
  const nextGazeTargetAtRef = useRef(0);
  const gazeModeRef = useRef<GazeMode>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  useEffect(() => {
    labRequestRef.current = motionRequestId;
    onMotionStateRef.current = onMotionState;
  }, [motionRequestId, onMotionState]);

  useEffect(() => {
    const semanticMotion = normalizeSemanticMotion(action);
    const signature = `${semanticMotion}:${replyText}`;
    const previousReplyText = replyTextRef.current;
    const isSameReplyStream =
      replyText.length >= previousReplyText.length &&
      replyText.startsWith(previousReplyText) &&
      lastMotionCueSignatureRef.current.startsWith(`${semanticMotion}:`);

    replyTextRef.current = replyText;
    actionRef.current = action;
    motionCuesRef.current = buildMotionCues(replyText, action);
    lastMotionCueSignatureRef.current = signature;

    if (!isSameReplyStream) {
      playedMotionCueKeysRef.current.clear();
    }
  }, [action, replyText]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    viewModeRef.current = viewMode;
    resizeModelRef.current?.();
  }, [viewMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let motionRequestToken = 0;
    let consumedLabRequest = labRequestRef.current;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupModelUpdate: (() => void) | null = null;
    let app: {
      destroy: (removeView?: boolean, stageOptions?: boolean | Record<string, unknown>) => void;
      stage: { addChild: (child: unknown) => void; removeChild: (child: unknown) => void };
      view: HTMLCanvasElement;
      renderer: { resize: (width: number, height: number) => void };
      ticker: { add: (fn: (delta: number) => void) => void; remove: (fn: (delta: number) => void) => void };
    } | null = null;
    let model: RuntimeLive2DDisplayObject | null = null;

    const init = async () => {
      try {
        await loadScript(CUBISM_CORE_SCRIPT);

        const live2DWindow = window as RuntimeWindow;
        if (!live2DWindow.Live2DCubismCore) {
          throw new Error('Live2D Cubism Core is unavailable.');
        }

        const [PIXI, live2d] = await Promise.all([
          import('pixi.js'),
          import('pixi-live2d-display/cubism4'),
        ]);

        if (cancelled) {
          return;
        }

        live2DWindow.PIXI = PIXI;
        live2d.Live2DModel.registerTicker(PIXI.Ticker);

        const pixiApp = new PIXI.Application({
          autoStart: true,
          antialias: true,
          backgroundAlpha: 0,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          powerPreference: 'high-performance',
          width: Math.max(host.clientWidth, 1),
          height: Math.max(host.clientHeight, 1),
        });

        app = pixiApp as typeof app;
        host.appendChild(pixiApp.view as HTMLCanvasElement);

        const live2dModel = (await live2d.Live2DModel.from(LIVE2D_MODEL_URL, {
          autoInteract: false,
          idleMotionGroup: MOTION_DEFINITIONS.idle.group,
          motionPreload: live2d.MotionPreloadStrategy.ALL,
        })) as unknown as RuntimeLive2DDisplayObject;

        if (cancelled || !live2dModel) {
          live2dModel?.destroy?.({ children: true });
          return;
        }

        model = live2dModel;
        model.anchor?.set(0.5, 1);
        pixiApp.stage.addChild(model);
        // The library ignores an empty idleMotionGroup option, used by the legacy manifest.
        if (model.internalModel?.motionManager?.groups) {
          model.internalModel.motionManager.groups.idle = MOTION_DEFINITIONS.idle.group;
        }

        const playSemanticMotion = async (
          semanticMotion: SemanticMotion,
          priority = MOTION_PRIORITY_FORCE,
        ): Promise<boolean> => {
          if (!model?.motion) {
            return false;
          }

          const requestToken = motionRequestToken + 1;
          motionRequestToken = requestToken;
          const definition = MOTION_DEFINITIONS[semanticMotion];
          const motionManager = model.internalModel?.motionManager;
          const runtimeMotion = await motionManager?.loadMotion?.(definition.group, definition.index);

          if (cancelled || requestToken !== motionRequestToken || !model?.motion) {
            return false;
          }

          if (!runtimeMotion) {
            throw new Error(`Could not load ${definition.group}[${definition.index}]`);
          }
          runtimeMotion.setIsLoop?.(semanticMotion === 'idle');
          motionManager?.stopAllMotions?.();

          const started = await model.motion(
            definition.group,
            definition.index,
            semanticMotion === 'idle' ? MOTION_PRIORITY_IDLE : priority,
          );
          if (!started && !cancelled && requestToken === motionRequestToken) {
            throw new Error(`Motion request rejected: ${semanticMotion}`);
          }
          if (started && !cancelled && requestToken === motionRequestToken) {
            onMotionStateRef.current?.(semanticMotion);
          }
          return started;
        };

        await playSemanticMotion('idle');

        const resize = () => {
          if (!model) {
            return;
          }

          const width = Math.max(host.clientWidth, 1);
          const height = Math.max(host.clientHeight, 1);
          pixiApp.renderer.resize(width, height);

          const internalWidth = model.internalModel?.width ?? 1;
          const internalHeight = model.internalModel?.height ?? 1;
          const fullScale = Math.min((width * 0.78) / internalWidth, (height * 0.94) / internalHeight);
          const isHalfBody = viewModeRef.current === 'half';
          const scale = isHalfBody ? fullScale * 2 : fullScale;
          const positionY = isHalfBody ? height * 2 : height * 0.96;

          model.scale?.set(scale);
          model.position?.set(width * 0.52, positionY);
        };

        resizeModelRef.current = resize;
        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        const coreModel = model.internalModel?.coreModel;
        const motionPose = new Map<string, number>();
        const parameterIds = coreModel?.getModel?.().parameters.ids ?? [];
        const supportedParameterCache = new Map<string, boolean>();
        const setParam = (parameterId: string, value: number, weight?: number) => {
          const setParameterValueById = coreModel?.setParameterValueById;
          if (!coreModel || !setParameterValueById) {
            return;
          }

          let isSupported = supportedParameterCache.get(parameterId);
          if (isSupported === undefined) {
            const parameterIndex = coreModel.getParameterIndex?.(parameterId);
            const parameterCount = coreModel.getParameterCount?.();
            isSupported = parameterIndex === undefined
              || parameterCount === undefined
              || (parameterIndex >= 0 && parameterIndex < parameterCount);
            supportedParameterCache.set(parameterId, isSupported);
          }

          if (!isSupported) {
            return;
          }

          // Preserve the motion pose and add only a small runtime offset, rather than
          // blending it toward a competing pose (or the SDK's larger built-in breath).
          const motionValue = motionPose.get(parameterId);
          if (LIVE2D_MODEL === 'kefu3' && motionValue !== undefined && weight !== undefined) {
            setParameterValueById.call(coreModel, parameterId, motionValue + value * weight);
          } else {
            setParameterValueById.call(coreModel, parameterId, value, weight);
          }
        };

        let previousPoseTime = performance.now();
        const restoreUnanimatedPose = () => {
          if (LIVE2D_MODEL !== 'kefu3') return;
          const now = performance.now();
          const weight = 1 - Math.exp(-Math.min(now - previousPoseTime, 100) / 100);
          previousPoseTime = now;
          // Reset before motion evaluation: authored curves win; parameters omitted
          // by the next motion (especially wait's arms) ease back to the moc defaults.
          for (const id of POSE_PARAMETERS) {
            const index = parameterIds.indexOf(id);
            if (index < 0) continue;
            const neutral = coreModel?.getParameterDefaultValue?.(index) ?? 0;
            coreModel?.setParameterValueById?.(id, neutral, weight);
          }
        };
        const captureMotionPose = () => {
          if (LIVE2D_MODEL !== 'kefu3') return;
          for (const id of POSE_PARAMETERS) {
            if (parameterIds.includes(id)) {
              motionPose.set(id, coreModel?.getParameterValueById?.(id) ?? 0);
            }
          }
        };

        let speakingScheduler = createSpeakingSchedulerState();
        let idleRequestedAfterSpeech = false;

        const startScheduledMotion = (
          semanticMotion: SemanticMotion,
          speechTime: number,
          nowSeconds: number,
          priority: number,
          label: 'primary' | 'semantic' | 'auxiliary',
        ) => {
          const definition = MOTION_DEFINITIONS[semanticMotion];
          lastMotionAtRef.current = nowSeconds;
          lastMotionDurationRef.current = definition.duration + 0.12;
          speakingScheduler.motionAvailableAt =
            speechTime + lastMotionDurationRef.current + MOTION_INTER_GESTURE_GAP_SEC;
          speakingScheduler.lastPlayedMotion = semanticMotion;
          speakingScheduler.lastPlayedAtByMotion.set(semanticMotion, speechTime);

          if (!speakingScheduler.primaryMotion || label === 'primary') {
            speakingScheduler.primaryMotion = semanticMotion;
          } else if (
            label === 'semantic'
            && semanticMotion !== 'explain'
            && semanticMotion !== 'confirm'
          ) {
            speakingScheduler.primaryMotion = semanticMotion;
          }
          if (semanticMotion === 'alert') {
            speakingScheduler.alertLocked = true;
            speakingScheduler.primaryMotion = 'alert';
          }

          void playSemanticMotion(semanticMotion, priority).catch((error: unknown) => {
            console.warn(`Live2D ${label} motion failed: ${semanticMotion}`, error);
          });
        };

        const updateModel = () => {
          const nowSeconds = performance.now() / 1000;
          const speechTime = speechTimeRef?.current ?? 0;
          const currentStatus = statusRef.current;
          const isSpeaking = speakingRef?.current ?? currentStatus === 'SPEAKING';
          const isListening = currentStatus === 'LISTENING';
          const visemeTrack = visemeTrackRef?.current ?? [];
          const hasRealtimeMouthSignal = isSpeaking && mouthOpenRef !== undefined;
          const currentAction = normalizeAction(actionRef.current);
          const currentSemanticMotion = normalizeSemanticMotion(actionRef.current);

          const speechTimeReset = speechTime < lastSpeechTimeRef.current - 0.05;
          if (speechTimeReset) {
            visemeCursorRef.current = 0;
            playedMotionCueKeysRef.current.clear();
          }
          lastSpeechTimeRef.current = speechTime;

          const preset = EMOTION_PRESETS[emotionRef.current] ?? EMOTION_PRESETS.neutral;
          const visemeFrame = isSpeaking && !hasRealtimeMouthSignal
            ? sampleVisemeFrame(visemeTrack, speechTime, visemeCursorRef)
            : null;
          const mouthOpen = clamp01(
            hasRealtimeMouthSignal
              ? (mouthOpenRef?.current ?? 0) * 1.12
              : (visemeFrame?.y ?? (isSpeaking ? (mouthOpenRef?.current ?? 0) * 1.15 : 0)),
          );
          const mouthForm = clamp(
            hasRealtimeMouthSignal
              ? (mouthFormRef?.current ?? 0)
              : (visemeFrame?.f ?? preset.mouthForm),
            -1,
            1,
          );
          const blink = resolveBlink(nowSeconds, nextBlinkAtRef, blinkStartAtRef);
          const breath = Math.sin(nowSeconds * 1.8) * 0.45;
          const idleSwing = Math.sin(nowSeconds * 1.1) * 3.5;
          const listeningLean = isListening ? Math.sin(nowSeconds * 2.6) * 4.5 : 0;
          const speakingNod = isSpeaking ? Math.sin(nowSeconds * 3.2) * 0.65 : 0;
          const gesture = resolveSequencedGesture(currentAction, speechTime, isSpeaking);
          const gazeMode: GazeMode = isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle';

          if (
            gazeModeRef.current !== gazeMode ||
            nextGazeTargetAtRef.current <= 0 ||
            nowSeconds >= nextGazeTargetAtRef.current
          ) {
            const nextGazeTarget = createGazeTarget(gazeMode);
            gazeTargetXRef.current = nextGazeTarget.x;
            gazeTargetYRef.current = nextGazeTarget.y;
            nextGazeTargetAtRef.current = nowSeconds + nextGazeTarget.holdSeconds;
            gazeModeRef.current = gazeMode;
          }

          const gazeEase = isListening ? 0.055 : isSpeaking ? 0.035 : 0.04;
          gazeXRef.current = lerp(gazeXRef.current, gazeTargetXRef.current, gazeEase);
          gazeYRef.current = lerp(gazeYRef.current, gazeTargetYRef.current, gazeEase);
          const secondsSinceMotion = nowSeconds - lastMotionAtRef.current;
          const isSemanticMotionActive =
            secondsSinceMotion >= 0 && secondsSinceMotion < lastMotionDurationRef.current;
          const speakingOverlayWeight = isSemanticMotionActive
            ? SPEAKING_DIRECT_PARAMETER_WEIGHT * 0.45
            : SPEAKING_DIRECT_PARAMETER_WEIGHT;
          const gazeWeight = isSpeaking
            ? (isSemanticMotionActive ? 0.12 : 0.24)
            : isListening ? 0.62 : 0.48;
          const semanticMotionChanged = currentSemanticMotion !== lastSemanticMotionRef.current;
          const startedSpeaking = isSpeaking && !wasSpeakingRef.current;
          const stoppedSpeaking = !isSpeaking && wasSpeakingRef.current;

          if (startedSpeaking || speechTimeReset) {
            speakingScheduler = createSpeakingSchedulerState();
            idleRequestedAfterSpeech = false;
            const explicitDirection = detectExplicitGuideDirection(replyTextRef.current);
            const directSemantic = actionRef.current === 'guide_left' || actionRef.current === 'guide_right'
              ? actionRef.current
              : null;
            speakingScheduler.directionLock = explicitDirection ?? directSemantic;
            playedMotionCueKeysRef.current.clear();
            // A new speech round must not inherit the previous round's motion
            // cooldown or direction/semantic lock.
            lastMotionAtRef.current = Number.NEGATIVE_INFINITY;
            lastMotionDurationRef.current = 0;
          } else if (!speakingScheduler.directionLock) {
            speakingScheduler.directionLock = detectExplicitGuideDirection(replyTextRef.current);
          }

          if (stoppedSpeaking) {
            idleRequestedAfterSpeech = true;
          }

          if (
            !isSpeaking
            && idleRequestedAfterSpeech
            && secondsSinceMotion >= lastMotionDurationRef.current
          ) {
            idleRequestedAfterSpeech = false;
            void playSemanticMotion('idle').catch((error: unknown) => {
              console.warn('Live2D idle recovery failed:', error);
            });
          } else if (labRequestRef.current !== undefined) {
            if (consumedLabRequest !== labRequestRef.current) {
              consumedLabRequest = labRequestRef.current;
              void playSemanticMotion(currentSemanticMotion).catch((error: unknown) => {
                console.warn('Live2D lab motion failed:', error);
                onMotionStateRef.current?.('error');
              });
            }
          } else if (isSpeaking) {
            const playedCueKeys = playedMotionCueKeysRef.current;
            const motionCues = motionCuesRef.current;
            const dueCue = motionCues.find((cue) => cue.startAt <= speechTime && !playedCueKeys.has(cue.key));
            const canStartMotion = speechTime >= speakingScheduler.motionAvailableAt;
            const rawCandidate = dueCue?.motion
              ?? (!speakingScheduler.primaryPlayed && speechTime >= MOTION_CUE_START_OFFSET_SEC
                ? currentSemanticMotion
                : null);

            if (rawCandidate) {
              const candidate = resolveDirectionLockedMotion(
                rawCandidate,
                speakingScheduler.directionLock,
              );
              const isBlockedComfortSwitch =
                speakingScheduler.alertLocked && candidate === 'comfort';
              const lastSameMotionAt = speakingScheduler.lastPlayedAtByMotion.get(candidate);
              const repeatCooldownReady =
                lastSameMotionAt === undefined
                || speechTime - lastSameMotionAt >= MOTION_REPEAT_COOLDOWN_SEC;

              if (isBlockedComfortSwitch) {
                if (dueCue) playedCueKeys.add(dueCue.key);
              } else if (canStartMotion && repeatCooldownReady) {
                if (dueCue) playedCueKeys.add(dueCue.key);
                const label = speakingScheduler.primaryPlayed ? 'semantic' : 'primary';
                speakingScheduler.primaryPlayed = true;
                startScheduledMotion(
                  candidate,
                  speechTime,
                  nowSeconds,
                  MOTION_PRIORITY_FORCE,
                  label,
                );
              }
            } else if (
              canStartMotion
              && speakingScheduler.primaryPlayed
              && speakingScheduler.auxiliaryCount < MOTION_MAX_AUXILIARY_COUNT
              && speechTime >= speakingScheduler.nextAuxiliaryAt
            ) {
              const auxiliaryMotion = selectAuxiliaryMotion(speakingScheduler);
              if (auxiliaryMotion) {
                const lastSameMotionAt = speakingScheduler.lastPlayedAtByMotion.get(auxiliaryMotion);
                const repeatCooldownReady =
                  lastSameMotionAt === undefined
                  || speechTime - lastSameMotionAt >= MOTION_REPEAT_COOLDOWN_SEC;

                if (repeatCooldownReady) {
                  speakingScheduler.auxiliaryCount += 1;
                  speakingScheduler.nextAuxiliaryAt =
                    speechTime + MOTION_AUXILIARY_INTERVAL_SEC;
                  startScheduledMotion(
                    auxiliaryMotion,
                    speechTime,
                    nowSeconds,
                    MOTION_PRIORITY_NORMAL,
                    'auxiliary',
                  );
                }
              }
            }
          } else if (semanticMotionChanged) {
            const definition = MOTION_DEFINITIONS[currentSemanticMotion];
            lastMotionAtRef.current = nowSeconds;
            lastMotionDurationRef.current = definition.duration + 0.12;
            lastSemanticMotionRef.current = currentSemanticMotion;
            void playSemanticMotion(currentSemanticMotion).catch((error: unknown) => {
              console.warn(`Live2D semantic motion failed: ${currentSemanticMotion}`, error);
            });
          }
          // Track the incoming semantic command, not a text-derived cue. Otherwise
          // finishing a spoken cue can accidentally replay the original gesture.
          lastSemanticMotionRef.current = currentSemanticMotion;
          wasSpeakingRef.current = isSpeaking;

          setParam('ParamEyeLOpen', clamp(preset.eyeOpen * blink, 0, 1.5));
          setParam('ParamEyeROpen', clamp(preset.eyeOpen * blink, 0, 1.5));
          setParam('ParamEyeBallX', gazeXRef.current, gazeWeight);
          setParam('ParamEyeBallY', gazeYRef.current, gazeWeight);
          setParam('ParamBrowLY', preset.browY);
          setParam('ParamBrowRY', preset.browY);
          setParam('ParamBrowLForm', preset.browForm);
          setParam('ParamBrowRForm', preset.browForm);
          setParam(
            'ParamBreath',
            breath,
            isSpeaking ? speakingOverlayWeight : SPEAKING_DIRECT_PARAMETER_WEIGHT,
          );

          if (!isSpeaking) {
            // The wait motion owns the idle pose; runtime naturalness remains a light overlay.
            setParam('ParamAngleX', preset.angleX + idleSwing + (isListening ? listeningLean : 0), SPEAKING_DIRECT_PARAMETER_WEIGHT);
            setParam('ParamAngleY', preset.angleY + speakingNod, SPEAKING_DIRECT_PARAMETER_WEIGHT);
            setParam('ParamAngleZ', Math.sin(nowSeconds * 0.8) * 1.4, SPEAKING_DIRECT_PARAMETER_WEIGHT);
            setParam('ParamBodyAngleX', preset.bodyX + (idleSwing * 0.18), SPEAKING_DIRECT_PARAMETER_WEIGHT);
            setParam('ParamBodyAngleY', speakingNod * 0.35, SPEAKING_DIRECT_PARAMETER_WEIGHT);
            setParam('ParamBodyAngleZ', Math.sin(nowSeconds * 0.55) * 0.9, SPEAKING_DIRECT_PARAMETER_WEIGHT);
          } else {
            // Wuhan assets verify only these head/body IDs for the sequenced gesture bias.
            // Low-weight writes preserve motion3 as the owner of large semantic movement.
            setParam(
              'ParamAngleX',
              preset.angleX +
                (idleSwing * SPEAKING_CONTINUOUS_SCALE) +
                (gesture.angleX * SPEAKING_GESTURE_HEAD_SCALE),
              speakingOverlayWeight,
            );
            setParam(
              'ParamAngleY',
              preset.angleY + speakingNod + (gesture.angleY * SPEAKING_GESTURE_HEAD_SCALE),
              speakingOverlayWeight,
            );
            setParam(
              'ParamAngleZ',
              (Math.sin(nowSeconds * 0.8) * 1.4 * SPEAKING_CONTINUOUS_SCALE) +
                (gesture.angleZ * SPEAKING_GESTURE_HEAD_SCALE),
              speakingOverlayWeight,
            );
            setParam(
              'ParamBodyAngleX',
              preset.bodyX +
                (idleSwing * 0.18 * SPEAKING_CONTINUOUS_SCALE) +
                (gesture.bodyX * SPEAKING_GESTURE_BODY_SCALE),
              speakingOverlayWeight,
            );
            setParam(
              'ParamBodyAngleY',
              (speakingNod * 0.35) + (gesture.bodyY * SPEAKING_GESTURE_BODY_SCALE),
              speakingOverlayWeight,
            );
            setParam(
              'ParamBodyAngleZ',
              (Math.sin(nowSeconds * 0.55) * 0.9 * SPEAKING_CONTINUOUS_SCALE) +
                (gesture.bodyZ * SPEAKING_GESTURE_BODY_SCALE),
              speakingOverlayWeight,
            );
          }

          setParam('ParamMouthOpenY', clamp(mouthOpen * 1.35, 0, 1.6));
          setParam('ParamMouthForm', mouthForm);
          setParam('ParamCheek', clamp(preset.cheek, 0, 1));
        };

        const onMotionFinish = () => onMotionStateRef.current?.('idle');
        model.internalModel?.motionManager?.on?.('motionFinish', onMotionFinish);
        model.internalModel?.on?.('beforeMotionUpdate', restoreUnanimatedPose);
        model.internalModel?.on?.('afterMotionUpdate', captureMotionPose);
        model.internalModel?.on?.('beforeModelUpdate', updateModel);
        cleanupModelUpdate = () => {
          model?.internalModel?.motionManager?.off?.('motionFinish', onMotionFinish);
          model?.internalModel?.off?.('beforeMotionUpdate', restoreUnanimatedPose);
          model?.internalModel?.off?.('afterMotionUpdate', captureMotionPose);
          model?.internalModel?.off?.('beforeModelUpdate', updateModel);
        };

        setLoadError(null);
        setIsReady(true);
      } catch (error) {
        console.error('Live2D avatar init failed:', error);
        if (!cancelled) {
          setLoadError('Live2D runtime failed to initialize.');
          setIsReady(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      motionRequestToken += 1;
      resizeObserver?.disconnect();
      resizeObserver = null;
      resizeModelRef.current = null;
      cleanupModelUpdate?.();

      if (model && app) {
        app.stage.removeChild(model);
      }
      model?.destroy?.({ children: true });
      app?.destroy(true, { children: true });
    };
  }, [mouthFormRef, mouthOpenRef, speakingRef, speechTimeRef, visemeTrackRef]);

  return (
    <div className="relative flex h-full w-full items-end justify-center overflow-hidden pointer-events-none">
      <div
        ref={hostRef}
        className="h-full w-full translate-y-[16px] drop-shadow-[0_22px_46px_rgba(0,0,0,0.44)]"
      />

      {!isReady && !loadError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-cyan-300/20 bg-black/25 px-4 py-2 text-[11px] tracking-[0.26em] text-cyan-100/75">
            LIVE2D INITIALIZING
          </div>
        </div>
      )}

      {loadError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
          <div className="rounded-[20px] border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm text-amber-100/90">
            {loadError}
          </div>
        </div>
      )}
    </div>
  );
}

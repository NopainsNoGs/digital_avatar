'use client';

import { MutableRefObject, useEffect, useRef, useState } from 'react';
import type { Object3D, Quaternion } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VRM_MODEL_URL, VRM_MODEL_VERSION } from '@/components/avatar/vrm/modelConfig';
import {
  buildGesturePlan,
  buildGesturePlanFromSpeechSegments,
  fallbackMotionFromLegacyGesture,
  SEMANTIC_GESTURE_PRIORITY,
  VRM_CO_SPEECH_DEFINITIONS,
  VRM_GESTURE_DEFINITIONS,
  type GestureCue,
  type RotationOffset,
  type VrmGesturePose,
  type VrmBoneName,
  type VRMCoSpeechGesture,
  type VRMSemanticMotion,
} from '@/components/avatar/vrm/gesturePlanner';
import type {
  AvatarEmotion,
  AvatarGesture,
  AvatarSpeechSegmentTiming,
  AvatarViewMode,
} from '@/types/avatar';
import type { TerminalState, VisemeFrame } from '@/types/terminal';

export type { VRMSemanticMotion } from '@/components/avatar/vrm/gesturePlanner';

export type VRMTurnState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'RETURNING_TO_IDLE'
  | 'ERROR';

export type VRMBehaviorDebugSnapshot = {
  turnState: VRMTurnState;
  semanticGesture: VRMSemanticMotion | null;
  coSpeechGesture: VRMCoSpeechGesture | null;
  speaking: boolean;
  gestureLocked: boolean;
  returningToIdle: boolean;
};

type ThreeAvatarProps = {
  status?: TerminalState;
  emotion?: AvatarEmotion;
  gesture?: AvatarGesture;
  viewMode?: AvatarViewMode;
  audioUrl?: string | null;
  visemeTrack?: VisemeFrame[];
  visemeTrackRef?: MutableRefObject<VisemeFrame[]>;
  speechSegmentsRef?: MutableRefObject<AvatarSpeechSegmentTiming[]>;
  speechTimeRef?: MutableRefObject<number>;
  speakingRef?: MutableRefObject<boolean>;
  mouthOpenRef?: MutableRefObject<number>;
  mouthFormRef?: MutableRefObject<number>;
  replyText?: string;
  semanticMotion?: VRMSemanticMotion;
  motionRequestId?: number;
  onMotionState?: (motion: VRMSemanticMotion) => void;
  onCoSpeechState?: (motion: VRMCoSpeechGesture | null) => void;
  onTurnState?: (state: VRMTurnState) => void;
  onBehaviorDebug?: (snapshot: VRMBehaviorDebugSnapshot) => void;
};

type BoneRuntime = {
  node: Object3D;
  baseQuaternion: Quaternion;
};

type BlinkRuntime = {
  nextBlinkAt: number;
  blinkStartAt: number | null;
};

type GazeMode = 'idle' | 'listening' | 'speaking';

type GazeRuntime = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  nextTargetAt: number;
  mode: GazeMode;
};

type GestureRuntime = {
  motion: VRMSemanticMotion;
  startedAt: number;
  duration: number;
  lockedUntil: number;
};

type CoSpeechRuntime = {
  motion: VRMCoSpeechGesture;
  startedAt: number;
  duration: number;
};

const AVATAR_EMOTIONS: readonly AvatarEmotion[] = [
  'neutral',
  'smile',
  'shy',
  'sad',
  'angry',
  'surprised',
] as const;

const EMOTION_EXPRESSION_CANDIDATES: Record<AvatarEmotion, readonly string[]> = {
  neutral: ['neutral', 'Neutral'],
  smile: ['happy', 'joy', 'Joy'],
  shy: ['relaxed', 'fun', 'Fun'],
  sad: ['sad', 'sorrow', 'Sorrow'],
  angry: ['angry', 'Angry'],
  surprised: ['surprised', 'Surprised', 'unknown'],
};

const MOUTH_EXPRESSION_NAMES = ['aa', 'ih', 'ou', 'ee', 'oh'] as const;
type MouthExpressionName = (typeof MOUTH_EXPRESSION_NAMES)[number];
const MOUTH_EXPRESSION_CANDIDATES: Record<MouthExpressionName, readonly string[]> = {
  aa: ['aa', 'a'],
  ih: ['ih', 'i'],
  ou: ['ou', 'u'],
  ee: ['ee', 'e'],
  oh: ['oh', 'o'],
};
const BLINK_EXPRESSION_NAMES = ['blink', 'blinkLeft', 'blinkRight', 'blink_l', 'blink_r'] as const;
const VRM_BONE_NAMES: readonly VrmBoneName[] = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
];

const MOTION_INTER_GESTURE_GAP_SEC = 0.28;
const MOTION_REPEAT_COOLDOWN_SEC = 5;
const MOTION_GLOBAL_COOLDOWN_SEC = 2.5;
const ENUMERATION_MOTION_COOLDOWN_SEC = 1.1;
const SPEAKING_SUPPLEMENT_INTERVAL_SEC = 5;
const SPEAKING_MAX_SUPPLEMENT_COUNT = 4;
const DIRECTION_GESTURE_LOCK_SEC = 1.65;
const DEFAULT_GESTURE_LOCK_SEC = 0.72;
const RETURN_TO_IDLE_DURATION_SEC = 0.45;
const SMILE_EXPRESSION_WEIGHT = 0.55;
const SMILE_MOUTH_OPEN_MAX = 0.58;

const BLINK_INTERVAL_MIN_SEC = 3;
const BLINK_INTERVAL_MAX_SEC = 6;
const BLINK_CLOSE_SEC = 0.1;
const BLINK_HOLD_SEC = 0.045;
const BLINK_OPEN_SEC = 0.14;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, alpha: number) => from + ((to - from) * alpha);

function isEnumerationMotion(motion: VRMSemanticMotion | null): boolean {
  return motion === 'count_one'
    || motion === 'count_two'
    || motion === 'count_continue'
    || motion === 'count_three';
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - (2 * t));
}

function resolveGestureEnvelope(elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed < 0 || elapsed >= duration) return 0;
  const progress = elapsed / duration;
  if (progress < 0.2) return smoothstep(progress / 0.2);
  if (progress < 0.7) return 1;
  return 1 - smoothstep((progress - 0.7) / 0.3);
}

const TURN_BASE_POSES: Record<VRMTurnState, VrmGesturePose> = {
  IDLE: {},
  LISTENING: {
    spine: { x: -0.012 },
    chest: { x: -0.018 },
    upperChest: { x: -0.022 },
    neck: { x: -0.01 },
    head: { x: -0.018 },
  },
  THINKING: {
    chest: { x: 0.008 },
    neck: { y: -0.025, z: 0.012 },
    head: { y: -0.045, z: 0.025 },
  },
  SPEAKING: {
    spine: { x: -0.008 },
    chest: { x: -0.018 },
    upperChest: { x: -0.026 },
  },
  RETURNING_TO_IDLE: {},
  ERROR: {
    chest: { x: 0.012 },
    head: { x: 0.025 },
  },
};

function addRotationOffsets(...offsets: (RotationOffset | undefined)[]): RotationOffset {
  return offsets.reduce<RotationOffset>((result, offset) => ({
    x: (result.x ?? 0) + (offset?.x ?? 0),
    y: (result.y ?? 0) + (offset?.y ?? 0),
    z: (result.z ?? 0) + (offset?.z ?? 0),
  }), {});
}

function scaleRotationOffset(offset: RotationOffset | undefined, weight: number): RotationOffset {
  return {
    x: (offset?.x ?? 0) * weight,
    y: (offset?.y ?? 0) * weight,
    z: (offset?.z ?? 0) * weight,
  };
}

function terminalStateToTurnState(status: TerminalState): VRMTurnState {
  if (status === 'LISTENING' || status === 'THINKING' || status === 'ERROR') return status;
  return status === 'SPEAKING' ? 'SPEAKING' : 'IDLE';
}

function computeBasePose(state: VRMTurnState): VrmGesturePose {
  return TURN_BASE_POSES[state];
}

function computeSemanticPose(motion: VRMSemanticMotion): VrmGesturePose {
  return VRM_GESTURE_DEFINITIONS[motion].pose;
}

function computeCoSpeechPose(motion: VRMCoSpeechGesture | null): VrmGesturePose {
  return motion ? VRM_CO_SPEECH_DEFINITIONS[motion].pose : {};
}

function randomBetween(min: number, max: number): number {
  return min + (Math.random() * (max - min));
}

function resolveBlinkWeight(nowSeconds: number, runtime: BlinkRuntime): number {
  if (runtime.nextBlinkAt <= 0) {
    runtime.nextBlinkAt = nowSeconds + randomBetween(BLINK_INTERVAL_MIN_SEC, BLINK_INTERVAL_MAX_SEC);
  }

  if (runtime.blinkStartAt === null) {
    if (nowSeconds < runtime.nextBlinkAt) {
      return 0;
    }
    runtime.blinkStartAt = nowSeconds;
  }

  const elapsed = nowSeconds - runtime.blinkStartAt;
  if (elapsed < BLINK_CLOSE_SEC) {
    return clamp01(elapsed / BLINK_CLOSE_SEC);
  }
  if (elapsed < BLINK_CLOSE_SEC + BLINK_HOLD_SEC) {
    return 1;
  }
  if (elapsed < BLINK_CLOSE_SEC + BLINK_HOLD_SEC + BLINK_OPEN_SEC) {
    const reopenElapsed = elapsed - BLINK_CLOSE_SEC - BLINK_HOLD_SEC;
    return 1 - clamp01(reopenElapsed / BLINK_OPEN_SEC);
  }

  runtime.blinkStartAt = null;
  runtime.nextBlinkAt = nowSeconds + randomBetween(BLINK_INTERVAL_MIN_SEC, BLINK_INTERVAL_MAX_SEC);
  return 0;
}

function scheduleGazeTarget(runtime: GazeRuntime, mode: GazeMode, nowSeconds: number) {
  const limits = mode === 'listening'
    ? { x: 0.035, y: 0.018, minHold: 2.5, maxHold: 4.8 }
    : mode === 'speaking'
      ? { x: 0.055, y: 0.028, minHold: 2, maxHold: 4.2 }
      : { x: 0.09, y: 0.045, minHold: 1.9, maxHold: 4.6 };
  const glanceScale = Math.random() < 0.15 ? 1 : 0.5;
  const centeredRandom = () => Math.random() + Math.random() - 1;

  runtime.targetX = centeredRandom() * limits.x * glanceScale;
  runtime.targetY = centeredRandom() * limits.y * glanceScale;
  runtime.nextTargetAt = nowSeconds + randomBetween(limits.minHold, limits.maxHold);
  runtime.mode = mode;
}

function sampleViseme(track: VisemeFrame[], time: number, cursorRef: MutableRefObject<number>) {
  if (!track.length) {
    return 0;
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
    return 0;
  }
  if (!next || time <= current.t) {
    return clamp01(current.y);
  }

  const span = Math.max(next.t - current.t, 1e-3);
  const alpha = clamp01((time - current.t) / span);
  return clamp01(current.y + (next.y - current.y) * alpha);
}

function disposeMaterial(material: unknown) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    Object.values(item).forEach((value) => {
      if (
        value &&
        typeof value === 'object' &&
        'isTexture' in value &&
        value.isTexture === true &&
        'dispose' in value &&
        typeof value.dispose === 'function'
      ) {
        value.dispose();
      }
    });

    if ('dispose' in item && typeof item.dispose === 'function') {
      item.dispose();
    }
  });
}

export default function ThreeAvatar({
  status = 'IDLE',
  emotion = 'neutral',
  gesture = 'explain',
  viewMode = 'half',
  audioUrl,
  visemeTrack = [],
  visemeTrackRef,
  speechSegmentsRef,
  speechTimeRef,
  speakingRef,
  mouthOpenRef,
  mouthFormRef,
  replyText = '',
  semanticMotion,
  motionRequestId,
  onMotionState,
  onCoSpeechState,
  onTurnState,
  onBehaviorDebug,
}: ThreeAvatarProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const statusRef = useRef<TerminalState>(status);
  const emotionRef = useRef(emotion);
  const gestureRef = useRef<AvatarGesture>(gesture);
  const replyTextRef = useRef(replyText);
  const semanticMotionRef = useRef(semanticMotion);
  const labRequestRef = useRef(motionRequestId);
  const onMotionStateRef = useRef(onMotionState);
  const onCoSpeechStateRef = useRef(onCoSpeechState);
  const onTurnStateRef = useRef(onTurnState);
  const onBehaviorDebugRef = useRef(onBehaviorDebug);
  const viewModeRef = useRef<AvatarViewMode>(viewMode);
  const visemeRef = useRef(visemeTrack);
  const visemeCursorRef = useRef(0);
  const lastVisemeTimeRef = useRef(0);
  const blinkRuntimeRef = useRef<BlinkRuntime>({ nextBlinkAt: 0, blinkStartAt: null });
  const gazeRuntimeRef = useRef<GazeRuntime>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    nextTargetAt: 0,
    mode: 'idle',
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    gestureRef.current = gesture;
    replyTextRef.current = replyText;
    semanticMotionRef.current = semanticMotion;
  }, [gesture, replyText, semanticMotion]);

  useEffect(() => {
    labRequestRef.current = motionRequestId;
    onMotionStateRef.current = onMotionState;
    onCoSpeechStateRef.current = onCoSpeechState;
    onTurnStateRef.current = onTurnState;
    onBehaviorDebugRef.current = onBehaviorDebug;
  }, [motionRequestId, onBehaviorDebug, onCoSpeechState, onMotionState, onTurnState]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    visemeRef.current = visemeTrack;
    visemeCursorRef.current = 0;
  }, [visemeTrack]);

  // Legacy optional compatibility only. AvatarBehavior uses the SpeechTimeline refs instead.
  useEffect(() => {
    const prev = audioRef.current;
    if (prev) {
      prev.pause();
      prev.removeAttribute('src');
      prev.load();
    }

    if (!audioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    audio.setAttribute('playsinline', 'true');
    audio.crossOrigin = 'anonymous';
    void audio.play().catch(() => {});
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let currentVrm: VRM | null = null;
    let renderer: import('three').WebGLRenderer | null = null;
    let disposeVrm: (() => void) | null = null;
    let boneRuntime: Partial<Record<VrmBoneName, BoneRuntime>> = {};
    let emotionExpressionNames: Partial<Record<AvatarEmotion, string>> = {};
    let mouthExpressionNames: Partial<Record<MouthExpressionName, string>> = {};
    let blinkExpressionNames: string[] = [];
    let consumedLabRequest = labRequestRef.current;

    const init = async () => {
      try {
        const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }, THREE] = await Promise.all([
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('@pixiv/three-vrm'),
          import('three'),
        ]);

        if (cancelled) {
          return;
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
        let appliedViewMode: AvatarViewMode | null = null;
        const applyCameraFraming = () => {
          const nextViewMode = viewModeRef.current;
          if (appliedViewMode === nextViewMode) {
            return;
          }

          if (nextViewMode === 'full') {
            camera.position.set(0, 0.92, 3.35);
            camera.lookAt(0, 0.88, 0);
          } else {
            camera.position.set(0, 1.43, 1.7);
            camera.lookAt(0, 1.42, 0);
          }
          appliedViewMode = nextViewMode;
        };
        applyCameraFraming();

        const webglRenderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        });
        webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
        webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        host.appendChild(webglRenderer.domElement);
        renderer = webglRenderer;

        scene.add(new THREE.AmbientLight(0xffffff, 1.35));
        scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x5a6472, 1.1));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
        keyLight.position.set(1, 2, 3);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xddeaff, 0.75);
        fillLight.position.set(-2, 1.2, 2);
        scene.add(fillLight);

        const clock = new THREE.Clock();
        const offsetEuler = new THREE.Euler();
        const offsetQuaternion = new THREE.Quaternion();
        const targetQuaternion = new THREE.Quaternion();
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        const resize = () => {
          const width = host.clientWidth || 1;
          const height = host.clientHeight || 1;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          webglRenderer.setSize(width, height, false);
        };

        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        let activeGesture: GestureRuntime | null = null;
        let activeCoSpeech: CoSpeechRuntime | null = null;
        let turnState = terminalStateToTurnState(statusRef.current);
        let returningStartedAt: number | null = null;
        let wasPlaybackActive = false;
        let lastSpeechTime = 0;
        let gesturePlan: GestureCue[] = [];
        let gesturePlanSignature = '';
        let playedCueKeys = new Set<string>();
        let motionAvailableAt = 0;
        let supplementCount = 0;
        let nextSupplementAt = SPEAKING_SUPPLEMENT_INTERVAL_SEC;
        let lockedDirection: 'left' | 'right' | 'front' | null = null;
        let pendingSecondaryMotion: VRMSemanticMotion | null = null;
        let lastSemanticStartedAt = Number.NEGATIVE_INFINITY;
        let lastDebugSignature = '';
        const lastPlayedAtByMotion = new Map<VRMSemanticMotion, number>();

        const setTurnState = (nextState: VRMTurnState) => {
          if (turnState === nextState) return;
          turnState = nextState;
          onTurnStateRef.current?.(nextState);
        };

        const setActiveCoSpeech = (motion: VRMCoSpeechGesture, now: number) => {
          const definition = VRM_CO_SPEECH_DEFINITIONS[motion];
          activeCoSpeech = { motion, startedAt: now, duration: definition.duration };
          onCoSpeechStateRef.current?.(motion);
        };

        const clearCoSpeech = () => {
          if (!activeCoSpeech) return;
          activeCoSpeech = null;
          onCoSpeechStateRef.current?.(null);
        };

        const setActiveMotion = (motion: VRMSemanticMotion, now: number, speechTime = 0) => {
          if (motion === 'idle') {
            activeGesture = null;
            onMotionStateRef.current?.('idle');
            return;
          }
          const definition = VRM_GESTURE_DEFINITIONS[motion];
          activeGesture = {
            motion,
            startedAt: now,
            duration: definition.duration,
            lockedUntil: now + (
              motion === 'guide_left' || motion === 'guide_right' || motion === 'guide_front'
                ? DIRECTION_GESTURE_LOCK_SEC
                : DEFAULT_GESTURE_LOCK_SEC
            ),
          };
          motionAvailableAt = speechTime + definition.duration + MOTION_INTER_GESTURE_GAP_SEC;
          lastSemanticStartedAt = speechTime;
          lastPlayedAtByMotion.set(motion, speechTime);
          onMotionStateRef.current?.(motion);
        };

        loader.load(
          VRM_MODEL_URL,
          (gltf) => {
            if (cancelled) {
              gltf.scene.traverse((node) => {
                const mesh = node as { isMesh?: boolean; geometry?: { dispose?: () => void }; material?: unknown };
                if (mesh.isMesh) {
                  mesh.geometry?.dispose?.();
                  disposeMaterial(mesh.material);
                }
              });
              return;
            }

            const vrm = gltf.userData.vrm as VRM | undefined;
            if (!vrm) {
              if (!cancelled) {
                setLoadError('VRM model loaded, but no VRM data was found.');
              }
              return;
            }

            // rotateVRM0 is version-aware; VRM1 remains in its native orientation.
            VRMUtils.rotateVRM0(vrm);

            // Normalize arbitrary authoring scale and place the feet on y=0.
            vrm.scene.updateMatrixWorld(true);
            const sourceBounds = new THREE.Box3().setFromObject(vrm.scene);
            const sourceHeight = sourceBounds.max.y - sourceBounds.min.y;
            if (Number.isFinite(sourceHeight) && sourceHeight > 0.1) {
              vrm.scene.scale.setScalar(1.72 / sourceHeight);
            }
            vrm.scene.updateMatrixWorld(true);
            const normalizedBounds = new THREE.Box3().setFromObject(vrm.scene);
            const center = normalizedBounds.getCenter(new THREE.Vector3());
            vrm.scene.position.set(-center.x, -normalizedBounds.min.y, -center.z);
            const leftArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
            const rightArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
            const leftNeutralArmZ = VRM_MODEL_VERSION === 'VRM0' ? 1.2 : -1.2;
            if (leftArm) {
              leftArm.rotation.z = leftNeutralArmZ;
            }
            if (rightArm) {
              rightArm.rotation.z = -leftNeutralArmZ;
            }

            // Capture the existing lowered-arm neutral pose before any procedural offsets.
            boneRuntime = {};
            for (const boneName of VRM_BONE_NAMES) {
              const node = vrm.humanoid.getNormalizedBoneNode(boneName);
              if (node) {
                boneRuntime[boneName] = {
                  node,
                  baseQuaternion: node.quaternion.clone(),
                };
              }
            }

            const expressionManager = vrm.expressionManager;
            emotionExpressionNames = {};
            mouthExpressionNames = {};
            blinkExpressionNames = [];
            if (expressionManager) {
              for (const avatarEmotion of AVATAR_EMOTIONS) {
                const expressionName = EMOTION_EXPRESSION_CANDIDATES[avatarEmotion]
                  .find((candidate) => expressionManager.getExpression(candidate) !== null);
                if (expressionName) {
                  emotionExpressionNames[avatarEmotion] = expressionName;
                }
              }
              for (const mouthName of MOUTH_EXPRESSION_NAMES) {
                const expressionName = MOUTH_EXPRESSION_CANDIDATES[mouthName]
                  .find((candidate) => expressionManager.getExpression(candidate) !== null);
                if (expressionName) {
                  mouthExpressionNames[mouthName] = expressionName;
                }
              }
              if (expressionManager.getExpression('blink')) {
                blinkExpressionNames = ['blink'];
              } else {
                blinkExpressionNames = BLINK_EXPRESSION_NAMES
                  .filter((expressionName) => expressionManager.getExpression(expressionName) !== null);
              }
            }

            if (vrm.lookAt) {
              vrm.lookAt.autoUpdate = false;
            }
            vrm.scene.traverse((obj) => {
              obj.frustumCulled = false;
            });

            currentVrm = vrm;
            disposeVrm = () => {
              scene.remove(vrm.scene);
              vrm.scene.traverse((node) => {
                const mesh = node as { isMesh?: boolean; geometry?: { dispose?: () => void }; material?: unknown };
                if (mesh.isMesh) {
                  mesh.geometry?.dispose?.();
                  disposeMaterial(mesh.material);
                }
              });
              VRMUtils.deepDispose(vrm.scene);
            };
            if (!cancelled) {
              setLoadError(null);
            }
            scene.add(vrm.scene);
          },
          undefined,
          (error) => {
            if (!cancelled) {
              setLoadError(`Missing ${VRM_MODEL_URL} or failed to parse it.`);
            }
            console.error('VRM load failed:', error);
          },
        );

        const render = () => {
          if (cancelled) {
            return;
          }

          frameId = requestAnimationFrame(render);

          const delta = Math.min(clock.getDelta(), 0.05);
          const elapsedTime = clock.elapsedTime;
          applyCameraFraming();

          const vrm = currentVrm;
          const currentStatus = statusRef.current;
          const legacyAudio = audioRef.current;
          const legacyAudioSpeaking = Boolean(legacyAudio && !legacyAudio.paused && !legacyAudio.ended);
          const playbackActive = legacyAudioSpeaking || (
            speakingRef ? speakingRef.current : currentStatus === 'SPEAKING'
          );
          const speechTime = speechTimeRef?.current ?? 0;
          const liveTrack = visemeTrackRef?.current?.length ? visemeTrackRef.current : visemeRef.current;
          const exactSpeechSegments = speechSegmentsRef?.current ?? [];
          const exactSegmentSignature = exactSpeechSegments
            .map((segment) => `${segment.index}:${segment.startTime.toFixed(3)}:${segment.text}`)
            .join('|');
          const nextPlanSignature = exactSpeechSegments.length
            ? `segments:${exactSegmentSignature}|${gestureRef.current}`
            : `fallback:${replyTextRef.current}|${gestureRef.current}`;
          if (nextPlanSignature !== gesturePlanSignature) {
            gesturePlanSignature = nextPlanSignature;
            const fallbackMotion = fallbackMotionFromLegacyGesture(gestureRef.current);
            gesturePlan = exactSpeechSegments.length
              ? buildGesturePlanFromSpeechSegments(exactSpeechSegments, fallbackMotion)
              : buildGesturePlan(replyTextRef.current, fallbackMotion);
          }

          if (currentStatus === 'ERROR') {
            activeGesture = null;
            clearCoSpeech();
            returningStartedAt = null;
            setTurnState('ERROR');
          } else if (playbackActive) {
            returningStartedAt = null;
            setTurnState('SPEAKING');
          } else if (turnState === 'SPEAKING' || wasPlaybackActive) {
            activeGesture = null;
            clearCoSpeech();
            pendingSecondaryMotion = null;
            blinkRuntimeRef.current.blinkStartAt = null;
            blinkRuntimeRef.current.nextBlinkAt = elapsedTime
              + randomBetween(BLINK_INTERVAL_MIN_SEC, BLINK_INTERVAL_MAX_SEC);
            returningStartedAt = elapsedTime;
            onMotionStateRef.current?.('idle');
            setTurnState('RETURNING_TO_IDLE');
          } else if (turnState === 'RETURNING_TO_IDLE') {
            if (
              currentStatus === 'LISTENING'
              || currentStatus === 'THINKING'
            ) {
              returningStartedAt = null;
              setTurnState(terminalStateToTurnState(currentStatus));
            } else if (
              returningStartedAt !== null
              && elapsedTime - returningStartedAt >= RETURN_TO_IDLE_DURATION_SEC
            ) {
              for (const runtime of Object.values(boneRuntime)) {
                if (runtime) runtime.node.quaternion.copy(runtime.baseQuaternion);
              }
              returningStartedAt = null;
              setTurnState('IDLE');
            }
          } else {
            const nextRestingState = currentStatus === 'LISTENING' || currentStatus === 'THINKING'
              ? currentStatus
              : 'IDLE';
            setTurnState(nextRestingState);
          }

          if (activeGesture && elapsedTime - activeGesture.startedAt >= activeGesture.duration) {
            activeGesture = null;
            onMotionStateRef.current?.('idle');
          }
          if (activeCoSpeech && elapsedTime - activeCoSpeech.startedAt >= activeCoSpeech.duration) {
            clearCoSpeech();
          }

          const requestedLabMotion = semanticMotionRef.current;
          if (labRequestRef.current !== consumedLabRequest && requestedLabMotion) {
            consumedLabRequest = labRequestRef.current;
            setActiveMotion(requestedLabMotion, elapsedTime, speechTime);
          }

          const startedNewSpeech = turnState === 'SPEAKING' && (
            !wasPlaybackActive || speechTime < lastSpeechTime - 0.05
          );
          if (startedNewSpeech) {
            playedCueKeys = new Set<string>();
            motionAvailableAt = 0;
            supplementCount = 0;
            nextSupplementAt = SPEAKING_SUPPLEMENT_INTERVAL_SEC;
            lockedDirection = null;
            pendingSecondaryMotion = null;
            lastPlayedAtByMotion.clear();
            lastSemanticStartedAt = Number.NEGATIVE_INFINITY;
            clearCoSpeech();
          }

          if (turnState === 'SPEAKING') {
            const dueCue = gesturePlan.find((cue) => (
              cue.startAt <= speechTime && !playedCueKeys.has(cue.key)
            ));
            if (dueCue && !dueCue.primaryGesture) {
              playedCueKeys.add(dueCue.key);
              if (!activeCoSpeech) setActiveCoSpeech(dueCue.coSpeechGesture, elapsedTime);
            } else {
              const candidate = pendingSecondaryMotion ?? dueCue?.primaryGesture ?? null;
              const activePriority = activeGesture
                ? SEMANTIC_GESTURE_PRIORITY[activeGesture.motion]
                : 0;
              const candidatePriority = candidate ? SEMANTIC_GESTURE_PRIORITY[candidate] : 0;
              const directionSwitch = Boolean(
                candidate
                && activeGesture
                && (
                  candidate === 'guide_left'
                  || candidate === 'guide_right'
                  || candidate === 'guide_front'
                )
                && candidate !== activeGesture.motion,
              );
              const gestureLocked = Boolean(
                activeGesture && elapsedTime < activeGesture.lockedUntil,
              );
              const isLowPriorityContinuation = candidate === 'explain'
                || candidate === 'explain_left'
                || candidate === 'explain_right'
                || candidate === 'small_ack';
              const canInterruptForPhrase = Boolean(
                candidate
                && activeGesture
                && elapsedTime - activeGesture.startedAt >= 0.35
                && (!gestureLocked || candidatePriority > activePriority || directionSwitch)
                && (
                  candidatePriority > activePriority
                  || directionSwitch
                  || (!isLowPriorityContinuation && !gestureLocked)
                ),
              );
              const motionCooldown = isEnumerationMotion(candidate)
                ? ENUMERATION_MOTION_COOLDOWN_SEC
                : MOTION_GLOBAL_COOLDOWN_SEC;
              const globalCooldownReady = speechTime - lastSemanticStartedAt >= motionCooldown;
              const canStartMotion = (
                !activeGesture
                && speechTime >= motionAvailableAt
                && globalCooldownReady
              ) || canInterruptForPhrase;
              if (canStartMotion) {
                if (candidate) {
                  const lastSameMotionAt = lastPlayedAtByMotion.get(candidate);
                  const repeatReady = lastSameMotionAt === undefined
                    || speechTime - lastSameMotionAt >= MOTION_REPEAT_COOLDOWN_SEC;
                  if (repeatReady) {
                    if (pendingSecondaryMotion) {
                      pendingSecondaryMotion = null;
                    } else if (dueCue) {
                      playedCueKeys.add(dueCue.key);
                      if (dueCue.direction) lockedDirection = dueCue.direction;
                      pendingSecondaryMotion = dueCue.secondaryGesture;
                      setActiveCoSpeech(dueCue.coSpeechGesture, elapsedTime);
                    }
                    setActiveMotion(candidate, elapsedTime, speechTime);
                    nextSupplementAt = speechTime + SPEAKING_SUPPLEMENT_INTERVAL_SEC;
                  } else if (dueCue) {
                    playedCueKeys.add(dueCue.key);
                    if (!activeCoSpeech) setActiveCoSpeech(dueCue.coSpeechGesture, elapsedTime);
                  }
                }
              }
            }

            if (
              !activeGesture
              && !activeCoSpeech
              && supplementCount < SPEAKING_MAX_SUPPLEMENT_COUNT
              && speechTime >= nextSupplementAt
            ) {
              const supplementPool: readonly VRMCoSpeechGesture[] = lockedDirection
                ? ['small_nod', 'beat_left', 'beat_right']
                : ['small_open', 'beat_right', 'small_nod', 'beat_left'];
              setActiveCoSpeech(
                supplementPool[supplementCount % supplementPool.length],
                elapsedTime,
              );
              supplementCount += 1;
              nextSupplementAt = speechTime + SPEAKING_SUPPLEMENT_INTERVAL_SEC;
            }
          } else if (wasPlaybackActive) {
            supplementCount = 0;
            nextSupplementAt = SPEAKING_SUPPLEMENT_INTERVAL_SEC;
            lockedDirection = null;
            pendingSecondaryMotion = null;
          }

          wasPlaybackActive = playbackActive;
          lastSpeechTime = speechTime;

          const activeMotion = activeGesture?.motion ?? 'idle';
          const gestureElapsed = activeGesture ? elapsedTime - activeGesture.startedAt : 0;
          const gestureStrength = activeGesture
            ? resolveGestureEnvelope(gestureElapsed, activeGesture.duration)
            : 0;
          const coSpeechElapsed = activeCoSpeech ? elapsedTime - activeCoSpeech.startedAt : 0;
          const coSpeechStrength = activeCoSpeech
            ? resolveGestureEnvelope(coSpeechElapsed, activeCoSpeech.duration)
            : 0;
          const isSpeaking = turnState === 'SPEAKING';
          const isListening = turnState === 'LISTENING';
          const activeEmotion: AvatarEmotion = isSpeaking ? emotionRef.current : 'neutral';
          const gazeMode: GazeMode = isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle';
          const gazeRuntime = gazeRuntimeRef.current;

          if (turnState === 'RETURNING_TO_IDLE') {
            gazeRuntime.targetX = 0;
            gazeRuntime.targetY = 0;
          } else if (
            gazeRuntime.mode !== gazeMode ||
            gazeRuntime.nextTargetAt <= 0 ||
            elapsedTime >= gazeRuntime.nextTargetAt
          ) {
            scheduleGazeTarget(gazeRuntime, gazeMode, elapsedTime);
          }

          const gazeDamping = 1 - Math.exp(-(isListening ? 3.8 : 2.8) * delta);
          gazeRuntime.x = lerp(gazeRuntime.x, gazeRuntime.targetX, gazeDamping);
          gazeRuntime.y = lerp(gazeRuntime.y, gazeRuntime.targetY, gazeDamping);

          const isGestureLocked = Boolean(
            activeGesture && elapsedTime < activeGesture.lockedUntil,
          );
          const debugSnapshot: VRMBehaviorDebugSnapshot = {
            turnState,
            semanticGesture: activeGesture?.motion ?? null,
            coSpeechGesture: activeCoSpeech?.motion ?? null,
            speaking: playbackActive,
            gestureLocked: isGestureLocked,
            returningToIdle: turnState === 'RETURNING_TO_IDLE',
          };
          const debugSignature = JSON.stringify(debugSnapshot);
          if (debugSignature !== lastDebugSignature) {
            lastDebugSignature = debugSignature;
            onBehaviorDebugRef.current?.(debugSnapshot);
          }

          if (vrm?.expressionManager) {
            const manager = vrm.expressionManager;
            const sampleTime = legacyAudioSpeaking ? legacyAudio?.currentTime ?? 0 : speechTime;

            if (sampleTime < lastVisemeTimeRef.current - 0.05) {
              visemeCursorRef.current = 0;
            }
            lastVisemeTimeRef.current = sampleTime;

            const sampledMouthOpen = legacyAudioSpeaking
              ? sampleViseme(visemeRef.current, legacyAudio?.currentTime ?? 0, visemeCursorRef)
              : isSpeaking
                ? mouthOpenRef
                  ? clamp01(mouthOpenRef.current)
                  : sampleViseme(liveTrack, speechTime, visemeCursorRef)
                : 0;
            const mouthOpen = activeEmotion === 'smile'
              ? Math.min(sampledMouthOpen, SMILE_MOUTH_OPEN_MAX)
              : sampledMouthOpen;
            const mouthForm = isSpeaking ? clamp(mouthFormRef?.current ?? 0, -1, 1) : 0;
            // The airport model's emotion presets are full-face morphs. In
            // particular, Joy can include closed eyes and an open/smiling
            // mouth, so retaining the reply emotion after speech makes the
            // avatar look stuck even though visemes are already zero.
            const activeEmotionExpression = emotionExpressionNames[activeEmotion]
              ?? emotionExpressionNames.neutral;
            const activeEmotionWeight = activeEmotion === 'smile'
              ? SMILE_EXPRESSION_WEIGHT
              : 1;

            for (const avatarEmotion of AVATAR_EMOTIONS) {
              const expressionName = emotionExpressionNames[avatarEmotion];
              if (expressionName) {
                manager.setValue(
                  expressionName,
                  expressionName === activeEmotionExpression ? activeEmotionWeight : 0,
                );
              }
            }

            const wideMouth = Math.max(0, mouthForm);
            const roundedMouth = Math.max(0, -mouthForm);
            const aaWeight = mouthOpen * (1 - (0.25 * Math.abs(mouthForm)));
            const mouthWeights: Record<(typeof MOUTH_EXPRESSION_NAMES)[number], number> = {
              aa: aaWeight,
              ih: mouthOpen * wideMouth * 0.18,
              ee: mouthOpen * wideMouth * 0.25,
              ou: mouthOpen * roundedMouth * 0.22,
              oh: mouthOpen * roundedMouth * 0.18,
            };
            for (const mouthName of MOUTH_EXPRESSION_NAMES) {
              const expressionName = mouthExpressionNames[mouthName];
              if (expressionName) {
                manager.setValue(expressionName, mouthWeights[mouthName]);
              }
            }

            const blinkWeight = turnState === 'RETURNING_TO_IDLE'
              ? 0
              : resolveBlinkWeight(elapsedTime, blinkRuntimeRef.current);
            for (const expressionName of blinkExpressionNames) {
              manager.setValue(expressionName, blinkWeight);
            }
          }

          const activeDefinition = VRM_GESTURE_DEFINITIONS[activeMotion];
          if (vrm?.lookAt) {
            const guideGaze = activeDefinition.gaze === 'left'
              ? -0.18 * gestureStrength
              : activeDefinition.gaze === 'right'
                ? 0.18 * gestureStrength
                : 0;
            vrm.lookAt.yaw = THREE.MathUtils.radToDeg(gazeRuntime.x + guideGaze);
            const guidePitch = activeDefinition.gaze === 'front' ? 0.035 * gestureStrength : 0;
            vrm.lookAt.pitch = THREE.MathUtils.radToDeg(gazeRuntime.y + guidePitch);
          }

          if (vrm) {
            const basePose = computeBasePose(turnState);
            const semanticPose = computeSemanticPose(activeMotion);
            const coSpeechPose = computeCoSpeechPose(activeCoSpeech?.motion ?? null);
            const poseDamping = 1 - Math.exp(
              -(turnState === 'RETURNING_TO_IDLE' ? 10 : 5.5) * delta,
            );
            const microbehaviorStrength = turnState === 'RETURNING_TO_IDLE' || turnState === 'ERROR'
              ? 0
              : activeGesture
                ? 0.22
                : turnState === 'LISTENING'
                  ? 0.38
                  : turnState === 'THINKING'
                    ? 0.24
                    : turnState === 'SPEAKING'
                      ? 0.78
                      : 1;
            const coSpeechLayerWeight = activeGesture ? 0.24 : 0.58;
            const emotionMotionScale = activeMotion === 'comfort' && activeEmotion === 'sad'
              ? 0.88
              : activeMotion === 'alert' && activeEmotion === 'surprised'
                ? 1.08
                : 1;
            const smileBodyStrength = activeEmotion === 'smile'
              ? activeGesture ? 0.35 : 0.65
              : 0;
            const hasPrimitive = (primitive: string) => activeDefinition.primitives.includes(
              primitive as (typeof activeDefinition.primitives)[number],
            );
            const nodAmplitude = hasPrimitive('head_nod_strong')
              ? 0.035
              : hasPrimitive('head_nod_medium')
                ? 0.026
                : hasPrimitive('head_nod_small')
                  ? 0.017
                  : 0;

            for (const boneName of VRM_BONE_NAMES) {
              const runtime = boneRuntime[boneName];
              if (!runtime) {
                continue;
              }

              const armGestureSign = (
                boneName.startsWith('left') || boneName.startsWith('right')
              ) && VRM_MODEL_VERSION === 'VRM1'
                ? -1
                : 1;
              const semanticOffset = scaleRotationOffset(
                semanticPose[boneName],
                gestureStrength * emotionMotionScale,
              );
              semanticOffset.z = (semanticOffset.z ?? 0) * armGestureSign;
              const coSpeechOffset = scaleRotationOffset(
                coSpeechPose[boneName],
                coSpeechStrength * coSpeechLayerWeight,
              );
              coSpeechOffset.z = (coSpeechOffset.z ?? 0) * armGestureSign;

              if (hasPrimitive('right_hand_wave') && gestureStrength > 0) {
                if (boneName === 'rightLowerArm') {
                  semanticOffset.z = (semanticOffset.z ?? 0)
                    + Math.sin(gestureElapsed * 6.6) * 0.075 * gestureStrength;
                } else if (boneName === 'rightHand') {
                  semanticOffset.z = (semanticOffset.z ?? 0)
                    + Math.sin(gestureElapsed * 8.2) * 0.14 * gestureStrength;
                }
              } else if (hasPrimitive('left_hand_wave') && gestureStrength > 0) {
                if (boneName === 'leftLowerArm') {
                  semanticOffset.y = (semanticOffset.y ?? 0)
                    + Math.sin(gestureElapsed * 7.2) * 0.08 * gestureStrength;
                } else if (boneName === 'leftHand') {
                  semanticOffset.z = (semanticOffset.z ?? 0)
                    + Math.sin(gestureElapsed * 8.8) * 0.2 * gestureStrength;
                }
              }

              if (boneName === 'head' && nodAmplitude > 0) {
                semanticOffset.x = (semanticOffset.x ?? 0)
                  + Math.sin(gestureElapsed * 3.5) * nodAmplitude * gestureStrength;
              }
              if (activeMotion === 'comfort' && activeEmotion === 'sad' && boneName === 'spine') {
                semanticOffset.x = (semanticOffset.x ?? 0) + 0.015 * gestureStrength;
              } else if (
                activeMotion === 'alert'
                && activeEmotion === 'surprised'
                && boneName === 'upperChest'
              ) {
                semanticOffset.x = (semanticOffset.x ?? 0) - 0.025 * gestureStrength;
              }

              const microOffset: RotationOffset = {};
              if (boneName === 'spine') {
                microOffset.x = Math.sin(elapsedTime * 1.5) * 0.015 * microbehaviorStrength;
                microOffset.z = Math.sin((isSpeaking ? speechTime : elapsedTime) * 0.72)
                  * 0.006 * microbehaviorStrength;
              } else if (boneName === 'upperChest') {
                const swayClock = isSpeaking ? speechTime : elapsedTime;
                microOffset.x = Math.sin(elapsedTime * 1.35) * 0.008 * microbehaviorStrength;
                microOffset.y = Math.sin(swayClock * 0.58) * (isListening ? 0.003 : 0.007)
                  * microbehaviorStrength;
                microOffset.z = Math.sin(swayClock * 0.76) * (isSpeaking ? 0.008 : 0.006)
                  * microbehaviorStrength;
              } else if (boneName === 'neck' && isListening) {
                microOffset.x = -0.012 * microbehaviorStrength;
                microOffset.z = 0.012 * microbehaviorStrength;
              } else if (boneName === 'head') {
                microOffset.x = -gazeRuntime.y * 0.16 * microbehaviorStrength;
                microOffset.y = gazeRuntime.x * 0.2 * microbehaviorStrength;
                if (isListening) {
                  microOffset.x -= 0.02 * microbehaviorStrength;
                  microOffset.z = 0.025 * microbehaviorStrength;
                } else if (isSpeaking) {
                  microOffset.x += Math.sin(speechTime * 2.6) * 0.025 * microbehaviorStrength;
                  microOffset.z = Math.sin(speechTime * 0.92) * 0.008 * microbehaviorStrength;
                }
              }

              const emotionOffset: RotationOffset = {};
              if (smileBodyStrength > 0) {
                const smileSway = Math.sin(speechTime * 1.15);
                const smileTilt = Math.sin((speechTime * 0.82) + 0.7);
                if (boneName === 'upperChest') {
                  emotionOffset.y = smileSway * 0.006 * smileBodyStrength;
                  emotionOffset.z = smileTilt * 0.004 * smileBodyStrength;
                } else if (boneName === 'neck') {
                  emotionOffset.y = smileSway * 0.01 * smileBodyStrength;
                  emotionOffset.z = smileTilt * 0.006 * smileBodyStrength;
                } else if (boneName === 'head') {
                  emotionOffset.y = smileSway * 0.02 * smileBodyStrength;
                  emotionOffset.z = smileTilt * 0.01 * smileBodyStrength;
                }
              }

              const composedOffset = addRotationOffsets(
                basePose[boneName],
                semanticOffset,
                coSpeechOffset,
                microOffset,
                emotionOffset,
              );
              offsetEuler.set(
                composedOffset.x ?? 0,
                composedOffset.y ?? 0,
                composedOffset.z ?? 0,
                'XYZ',
              );
              offsetQuaternion.setFromEuler(offsetEuler);
              targetQuaternion.copy(runtime.baseQuaternion).multiply(offsetQuaternion);
              runtime.node.quaternion.slerp(targetQuaternion, poseDamping);
            }
          }

          vrm?.update(delta);
          webglRenderer.render(scene, camera);
        };

        render();
      } catch (error) {
        if (!cancelled) {
          setLoadError('Failed to initialize Three.js / VRM runtime.');
        }
        console.error('ThreeAvatar init failed:', error);
      }
    };

    void init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      resizeObserver = null;

      if (currentVrm) {
        disposeVrm?.();
      }
      boneRuntime = {};
      emotionExpressionNames = {};
      mouthExpressionNames = {};
      blinkExpressionNames = [];

      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
  }, [mouthFormRef, mouthOpenRef, speakingRef, speechSegmentsRef, speechTimeRef, visemeTrackRef]);

  return (
    // 1. 把 items-start 改成 items-center，让它在垂直方向上居中
    <div className="relative flex h-[420px] w-full max-w-[820px] items-center justify-center overflow-hidden pointer-events-auto md:h-[520px] xl:h-[600px] [mask-image:linear-gradient(to_bottom,black_75%,transparent_100%)]">
      
      {/* 2. 删掉负边距(-mt-6)，加上 translate-x 和 translate-y 来向右下方平移 */}
      <div 
        ref={hostRef} 
        className="h-full w-full outline-none drop-shadow-2xl translate-x-[40px] translate-y-[35px]" 
      />

      {loadError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
          <div className="rounded-[20px] border border-amber-300/20 bg-black/45 px-5 py-4 text-sm text-amber-100/90">
            {loadError}
          </div>
        </div>
      )}
    </div>
  );
}

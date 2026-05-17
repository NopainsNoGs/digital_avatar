'use client';

import type { DisplayObject } from '@pixi/display';
import { MutableRefObject, useEffect, useRef, useState } from 'react';
import type { VisemeFrame } from '@/types/terminal';

type Live2DAvatarProps = {
  status: string;
  emotion?: string;
  visemeTrackRef?: MutableRefObject<VisemeFrame[]>;
  speechTimeRef?: MutableRefObject<number>;
  speakingRef?: MutableRefObject<boolean>;
  mouthOpenRef?: MutableRefObject<number>;
};

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

type RuntimeLive2DModel = {
  anchor?: { set: (x: number, y?: number) => void };
  scale?: { set: (x: number, y?: number) => void };
  position?: { set: (x: number, y: number) => void };
  internalModel?: {
    width?: number;
    height?: number;
    coreModel?: {
      setParameterValueById?: (parameterId: string, value: number, weight?: number) => void;
    };
  };
  expression?: (id?: number | string) => Promise<boolean>;
  destroy?: (options?: Record<string, unknown>) => void;
};

type RuntimeLive2DDisplayObject = DisplayObject & RuntimeLive2DModel;

const CUBISM_CORE_SCRIPT = '/live2d/live2dcubismcore.min.js';
const LIVE2D_MODEL_PATH = '/avatar/avatar.model3.json';

const EMOTION_PRESETS: Record<string, EmotionPreset> = {
  neutral: { browY: 0, browForm: 0, eyeOpen: 1, mouthForm: 0, angleX: 0, angleY: 0, bodyX: 0, cheek: 0 },
  smile: { browY: 0.28, browForm: 0.14, eyeOpen: 0.92, mouthForm: 0.45, angleX: 0, angleY: 0.4, bodyX: 0.6, cheek: 0.36 },
  shy: { browY: 0.18, browForm: -0.08, eyeOpen: 0.84, mouthForm: 0.18, angleX: -1.5, angleY: -2.2, bodyX: -1.2, cheek: 0.18 },
  sad: { browY: -0.34, browForm: -0.22, eyeOpen: 0.78, mouthForm: -0.38, angleX: 0.4, angleY: -3.2, bodyX: -0.8, cheek: 0 },
  angry: { browY: -0.52, browForm: 0.28, eyeOpen: 0.86, mouthForm: -0.18, angleX: 2.5, angleY: 0.8, bodyX: 1.6, cheek: 0 },
  surprised: { browY: 0.52, browForm: 0.12, eyeOpen: 1.22, mouthForm: 0.12, angleX: 0, angleY: 3.2, bodyX: 0.6, cheek: 0 },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const lerp = (from: number, to: number, alpha: number) => from + ((to - from) * alpha);

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

function resolveBlink(nowSeconds: number) {
  const phase = nowSeconds % 4.6;
  if (phase < 4.15) {
    return 1;
  }
  if (phase < 4.28) {
    return lerp(1, 0.08, (phase - 4.15) / 0.13);
  }
  if (phase < 4.4) {
    return lerp(0.08, 1, (phase - 4.28) / 0.12);
  }
  return 1;
}

export default function Live2DAvatar({
  status,
  emotion = 'neutral',
  visemeTrackRef,
  speechTimeRef,
  speakingRef,
  mouthOpenRef,
}: Live2DAvatarProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const visemeCursorRef = useRef(0);
  const lastSpeechTimeRef = useRef(0);
  const emotionRef = useRef(emotion);
  const statusRef = useRef(status);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupTicker: (() => void) | null = null;
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

        const live2dModel = (await live2d.Live2DModel.from(LIVE2D_MODEL_PATH, {
          autoInteract: false,
        })) as unknown as RuntimeLive2DDisplayObject;

        if (cancelled || !live2dModel) {
          live2dModel?.destroy?.({ children: true });
          return;
        }

        model = live2dModel;
        model.anchor?.set(0.5, 1);
        pixiApp.stage.addChild(model);

        await model.expression?.('hide_watermark').catch(() => undefined);

        const resize = () => {
          if (!model) {
            return;
          }

          const width = Math.max(host.clientWidth, 1);
          const height = Math.max(host.clientHeight, 1);
          pixiApp.renderer.resize(width, height);

          const internalWidth = model.internalModel?.width ?? 1;
          const internalHeight = model.internalModel?.height ?? 1;
          const scale = Math.min((width * 0.78) / internalWidth, (height * 0.94) / internalHeight);

          model.scale?.set(scale);
          model.position?.set(width * 0.52, height * 0.96);
        };

        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        const updateModel = () => {
          if (!model?.internalModel?.coreModel?.setParameterValueById) {
            return;
          }

          const coreModel = model.internalModel.coreModel;
          const setParameterValueById = coreModel.setParameterValueById;
          if (!setParameterValueById) {
            return;
          }
          const setParam = setParameterValueById.bind(coreModel);
          const nowSeconds = performance.now() / 1000;
          const speechTime = speechTimeRef?.current ?? 0;
          const currentStatus = statusRef.current;
          const isSpeaking = speakingRef?.current ?? currentStatus === 'SPEAKING';
          const isListening = currentStatus === 'LISTENING';
          const visemeTrack = visemeTrackRef?.current ?? [];

          if (speechTime < lastSpeechTimeRef.current - 0.05) {
            visemeCursorRef.current = 0;
          }
          lastSpeechTimeRef.current = speechTime;

          const preset = EMOTION_PRESETS[emotionRef.current] ?? EMOTION_PRESETS.neutral;
          const visemeFrame = isSpeaking ? sampleVisemeFrame(visemeTrack, speechTime, visemeCursorRef) : null;
          const mouthOpen = clamp01(
            visemeFrame?.y ?? (isSpeaking ? (mouthOpenRef?.current ?? 0) * 1.15 : 0),
          );
          const mouthForm = clamp(visemeFrame?.f ?? preset.mouthForm, -1, 1);
          const blink = resolveBlink(nowSeconds);
          const breath = Math.sin(nowSeconds * 1.8) * 0.45;
          const idleSwing = Math.sin(nowSeconds * 1.1) * 3.5;
          const listeningLean = isListening ? Math.sin(nowSeconds * 2.6) * 4.5 : 0;
          const speakingNod = isSpeaking ? Math.sin(nowSeconds * 7.2) * 1.8 : 0;

          setParam('ParamEyeLOpen', clamp(preset.eyeOpen * blink, 0, 1.5));
          setParam('ParamEyeROpen', clamp(preset.eyeOpen * blink, 0, 1.5));
          setParam('ParamEyeBallX', Math.sin(nowSeconds * 0.4) * 0.18);
          setParam('ParamEyeBallY', Math.cos(nowSeconds * 0.33) * 0.08);
          setParam('ParamBrowLY', preset.browY);
          setParam('ParamBrowRY', preset.browY);
          setParam('ParamBrowLForm', preset.browForm);
          setParam('ParamBrowRForm', preset.browForm);
          setParam('ParamAngleX', preset.angleX + idleSwing + (isListening ? listeningLean : 0));
          setParam('ParamAngleY', preset.angleY + speakingNod);
          setParam('ParamAngleZ', Math.sin(nowSeconds * 0.8) * 1.4);
          setParam('ParamBodyAngleX', preset.bodyX + (idleSwing * 0.18));
          setParam('ParamBodyAngleY', speakingNod * 0.35);
          setParam('ParamBodyAngleZ', Math.sin(nowSeconds * 0.55) * 0.9);
          setParam('ParamBreath', breath);
          setParam('ParamMouthOpenY', clamp(mouthOpen * 1.35, 0, 1.6));
          setParam('ParamMouthForm', mouthForm);
          setParam('ParamCheekPuff', clamp(preset.cheek, 0, 1));
          setParam('cheek2', clamp(preset.cheek, 0, 1));
        };

        pixiApp.ticker.add(updateModel);
        cleanupTicker = () => {
          pixiApp.ticker.remove(updateModel);
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
      resizeObserver?.disconnect();
      resizeObserver = null;
      cleanupTicker?.();

      if (model && app) {
        app.stage.removeChild(model);
      }
      model?.destroy?.({ children: true });
      app?.destroy(true, { children: true });
    };
  }, [mouthOpenRef, speakingRef, speechTimeRef, visemeTrackRef]);

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

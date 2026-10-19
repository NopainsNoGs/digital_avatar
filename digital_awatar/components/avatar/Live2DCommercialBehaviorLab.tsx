'use client';

import type { DisplayObject } from '@pixi/display';
import { useEffect, useRef, useState } from 'react';
import {
  COMMERCIAL_BEHAVIOR_DEFINITIONS,
  COMMERCIAL_PARAMETER_IDS,
  STATIC_COMMERCIAL_NEUTRAL,
  VERIFIED_COMMERCIAL_PARAMETER_RANGES,
  getCommercialBehaviorParameterIds,
  getCommercialBehaviorPeakArmValue,
  sampleCommercialBehavior,
  type CommercialBehaviorDefinition,
  type CommercialBehaviorVariantId,
  type CommercialParameterId,
} from '@/components/avatar/live2d/commercialBehaviors';

type LabStatus = 'initializing' | 'ready' | 'playing' | 'error';
type ResetSource = 'runtime baseline' | 'static verified neutral';
type ArmScreenSide = 'unconfirmed' | 'screen left' | 'screen right';

type RuntimeWindow = Window & typeof globalThis & {
  PIXI?: unknown;
  Live2DCubismCore?: unknown;
};

type RuntimeCoreModel = {
  getParameterValueById?: (parameterId: string) => number;
  setParameterValueById?: (parameterId: string, value: number, weight?: number) => void;
};

type RuntimeInternalModel = {
  width?: number;
  height?: number;
  coreModel?: RuntimeCoreModel;
  motionManager?: { stopAllMotions?: () => void };
  on?: (event: 'beforeModelUpdate', handler: () => void) => void;
  off?: (event: 'beforeModelUpdate', handler: () => void) => void;
};

type RuntimeLive2DModel = {
  anchor?: { set: (x: number, y?: number) => void };
  scale?: { set: (x: number, y?: number) => void };
  position?: { set: (x: number, y: number) => void };
  internalModel?: RuntimeInternalModel;
  destroy?: (options?: Record<string, unknown>) => void;
};

type RuntimeLive2DDisplayObject = DisplayObject & RuntimeLive2DModel;

type RuntimePixiApplication = {
  destroy: (removeView?: boolean, stageOptions?: boolean | Record<string, unknown>) => void;
  stage: {
    addChild: (child: unknown) => void;
    removeChild: (child: unknown) => void;
  };
  view: HTMLCanvasElement;
  renderer: { resize: (width: number, height: number) => void };
};

type ActivePreview = {
  definition: CommercialBehaviorDefinition;
  startedAt: number | null;
};

const CUBISM_CORE_SCRIPT = '/live2d/live2dcubismcore.min.js';
const COMMERCIAL_LAB_MODEL_PATH = '/wuhan/wuhan/kefu2.model3.json';

const BEHAVIOR_SECTIONS: readonly {
  title: string;
  eyebrow: string;
  variantIds: readonly CommercialBehaviorVariantId[];
}[] = [
  {
    title: 'Attention & greeting',
    eyebrow: 'FOUNDATION',
    variantIds: ['listening', 'thinking', 'welcome'],
  },
  {
    title: 'Speaking variation',
    eyebrow: 'EXPLAIN',
    variantIds: ['explain_a', 'explain_b', 'explain_c'],
  },
  {
    title: 'Airport guidance',
    eyebrow: 'GUIDANCE',
    variantIds: [
      'guide_arm_soft',
      'guide_arm_clear',
      'guide_no_arm_side',
      'guide_front',
    ],
  },
  {
    title: 'Service response',
    eyebrow: 'SERVICE',
    variantIds: [
      'confirm_nod',
      'confirm_small_arm',
      'comfort',
      'alert',
      'goodbye',
    ],
  },
];

const STATUS_LABELS: Record<LabStatus, string> = {
  initializing: 'INITIALIZING MODEL',
  ready: 'NEUTRAL / READY',
  playing: 'PROCEDURAL PREVIEW',
  error: 'LAB ERROR',
};

let cubismCoreLoadPromise: Promise<void> | null = null;

function loadCubismCore(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  const live2DWindow = window as RuntimeWindow;
  if (live2DWindow.Live2DCubismCore) {
    return Promise.resolve();
  }

  if (cubismCoreLoadPromise) {
    return cubismCoreLoadPromise;
  }

  cubismCoreLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${CUBISM_CORE_SCRIPT}"]`,
    );
    const script = existingScript ?? document.createElement('script');

    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
    const handleLoad = () => {
      cleanup();
      if ((window as RuntimeWindow).Live2DCubismCore) {
        resolve();
        return;
      }
      reject(new Error('Live2D Cubism Core loaded without exposing its runtime.'));
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Failed to load script: ${CUBISM_CORE_SCRIPT}`));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existingScript) {
      script.src = CUBISM_CORE_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    cubismCoreLoadPromise = null;
    throw error;
  });

  return cubismCoreLoadPromise;
}

function clampToVerifiedRange(parameterId: CommercialParameterId, value: number): number {
  const range = VERIFIED_COMMERCIAL_PARAMETER_RANGES[parameterId];
  return Math.min(Math.max(value, range.min), range.max);
}

function formatParameters(definition: CommercialBehaviorDefinition): string {
  const parameterIds = getCommercialBehaviorParameterIds(definition);
  return parameterIds.length === 0
    ? 'None'
    : parameterIds.map((parameterId) => `${parameterId} @ 1.00`).join(' · ');
}

export default function Live2DCommercialBehaviorLab() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<RuntimeLive2DDisplayObject | null>(null);
  const baselineRef = useRef<Record<CommercialParameterId, number>>({
    ...STATIC_COMMERCIAL_NEUTRAL,
  });
  const activePreviewRef = useRef<ActivePreview | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<LabStatus>('initializing');
  const [activeVariantId, setActiveVariantId] = useState<CommercialBehaviorVariantId>('idle');
  const [resetSource, setResetSource] = useState<ResetSource>('static verified neutral');
  const [armScreenSide, setArmScreenSide] = useState<ArmScreenSide>('unconfirmed');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const restoreBaseline = () => {
    const coreModel = modelRef.current?.internalModel?.coreModel;
    const setParameterValueById = coreModel?.setParameterValueById;
    if (!coreModel || !setParameterValueById) {
      return;
    }

    const setParameter = setParameterValueById.bind(coreModel);
    COMMERCIAL_PARAMETER_IDS.forEach((parameterId) => {
      setParameter(parameterId, baselineRef.current[parameterId], 1);
    });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let app: RuntimePixiApplication | null = null;
    let model: RuntimeLive2DDisplayObject | null = null;
    let updateModel: (() => void) | null = null;

    const initialize = async () => {
      try {
        await loadCubismCore();
        const [PIXI, live2d] = await Promise.all([
          import('pixi.js'),
          import('pixi-live2d-display/cubism4'),
        ]);

        if (cancelled) {
          return;
        }

        (window as RuntimeWindow).PIXI = PIXI;
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
        }) as unknown as RuntimePixiApplication;

        app = pixiApp;
        host.appendChild(pixiApp.view);

        const live2dModel = (await live2d.Live2DModel.from(COMMERCIAL_LAB_MODEL_PATH, {
          autoInteract: false,
          motionPreload: live2d.MotionPreloadStrategy.NONE,
        })) as unknown as RuntimeLive2DDisplayObject;

        if (cancelled) {
          live2dModel.destroy?.({ children: true });
          return;
        }

        const internalModel = live2dModel.internalModel;
        const coreModel = internalModel?.coreModel;
        if (!coreModel?.setParameterValueById) {
          throw new Error('The loaded Cubism core model does not expose parameter writes.');
        }

        model = live2dModel;
        modelRef.current = live2dModel;
        live2dModel.anchor?.set(0.5, 1);
        pixiApp.stage.addChild(live2dModel);
        internalModel?.motionManager?.stopAllMotions?.();

        const getParameterValueById = coreModel.getParameterValueById;
        let capturedAllParameters = typeof getParameterValueById === 'function';
        const baseline = { ...STATIC_COMMERCIAL_NEUTRAL };

        if (getParameterValueById) {
          const getParameter = getParameterValueById.bind(coreModel);
          COMMERCIAL_PARAMETER_IDS.forEach((parameterId) => {
            const value = getParameter(parameterId);
            if (Number.isFinite(value)) {
              baseline[parameterId] = value;
            } else {
              capturedAllParameters = false;
            }
          });
        }

        baselineRef.current = baseline;
        setResetSource(capturedAllParameters ? 'runtime baseline' : 'static verified neutral');

        updateModel = () => {
          const currentCoreModel = modelRef.current?.internalModel?.coreModel;
          const setParameterValueById = currentCoreModel?.setParameterValueById;
          if (!currentCoreModel || !setParameterValueById) {
            return;
          }

          const setParameter = setParameterValueById.bind(currentCoreModel);
          COMMERCIAL_PARAMETER_IDS.forEach((parameterId) => {
            setParameter(parameterId, baselineRef.current[parameterId], 1);
          });

          const activePreview = activePreviewRef.current;
          if (!activePreview) {
            return;
          }

          const now = performance.now() / 1000;
          if (activePreview.startedAt === null) {
            activePreview.startedAt = now;
          }
          const elapsedTime = now - activePreview.startedAt;
          const sample = sampleCommercialBehavior(activePreview.definition, elapsedTime);
          COMMERCIAL_PARAMETER_IDS.forEach((parameterId) => {
            const contribution = sample[parameterId];
            if (!contribution) {
              return;
            }
            const targetValue = clampToVerifiedRange(
              parameterId,
              baselineRef.current[parameterId] + contribution.value,
            );
            setParameter(parameterId, targetValue, contribution.weight);
          });
        };

        internalModel?.on?.('beforeModelUpdate', updateModel);

        const resize = () => {
          const currentModel = modelRef.current;
          if (!currentModel) {
            return;
          }
          const width = Math.max(host.clientWidth, 1);
          const height = Math.max(host.clientHeight, 1);
          pixiApp.renderer.resize(width, height);

          const internalWidth = Math.max(currentModel.internalModel?.width ?? 1, 1);
          const internalHeight = Math.max(currentModel.internalModel?.height ?? 1, 1);
          const scale = Math.min((width * 0.82) / internalWidth, (height * 0.95) / internalHeight);
          currentModel.scale?.set(scale);
          currentModel.position?.set(width * 0.5, height * 0.98);
        };

        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        if (!cancelled) {
          setStatus('ready');
          setErrorMessage(null);
        }
      } catch (error) {
        console.error('Live2D commercial behavior lab initialization failed:', error);
        if (!cancelled) {
          setErrorMessage('Live2D model failed to initialize. Check the browser console.');
          setStatus('error');
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      activePreviewRef.current = null;
      resizeObserver?.disconnect();
      resizeObserver = null;

      if (updateModel) {
        model?.internalModel?.off?.('beforeModelUpdate', updateModel);
      }
      modelRef.current = null;
      if (model && app) {
        app.stage.removeChild(model);
      }
      model?.destroy?.({ children: true });
      app?.destroy(true, { children: true });
    };
  }, []);

  const resetToNeutral = () => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    activePreviewRef.current = null;
    restoreBaseline();
    setActiveVariantId('idle');
    setStatus(modelRef.current ? 'ready' : status);
  };

  const playBehavior = (variantId: CommercialBehaviorVariantId) => {
    const definition = COMMERCIAL_BEHAVIOR_DEFINITIONS[variantId];
    if (!modelRef.current || status === 'initializing' || status === 'error') {
      return;
    }
    if (definition.duration === 0) {
      resetToNeutral();
      return;
    }

    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
    }

    // A true reset happens before every preview, including values omitted by the
    // next behavior. This prevents a prior arm or head value from leaking forward.
    activePreviewRef.current = null;
    restoreBaseline();
    activePreviewRef.current = {
      definition,
      startedAt: null,
    };
    setActiveVariantId(variantId);
    setStatus('playing');
    setErrorMessage(null);

    completionTimerRef.current = window.setTimeout(() => {
      activePreviewRef.current = null;
      restoreBaseline();
      setActiveVariantId('idle');
      setStatus('ready');
      completionTimerRef.current = null;
    }, Math.ceil(definition.duration * 1000));
  };

  const renderBehaviorButton = (variantId: CommercialBehaviorVariantId) => {
    const definition = COMMERCIAL_BEHAVIOR_DEFINITIONS[variantId];
    const parameterSummary = formatParameters(definition);
    const peakArmValue = getCommercialBehaviorPeakArmValue(definition);
    const isActive = activeVariantId === variantId && status === 'playing';

    return (
      <button
        key={variantId}
        type="button"
        aria-pressed={isActive}
        disabled={status === 'initializing' || status === 'error'}
        onClick={() => playBehavior(variantId)}
        className={`rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-45 ${
          isActive
            ? 'border-cyan-300/70 bg-cyan-300/14 shadow-[0_0_30px_rgba(34,211,238,0.12)]'
            : 'border-white/10 bg-white/[0.035] hover:border-cyan-300/35 hover:bg-white/[0.07]'
        }`}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-sm font-semibold tracking-wide text-white">{definition.label}</span>
          <span className="shrink-0 font-mono text-[10px] text-cyan-100/65">
            {definition.duration.toFixed(2)} s
          </span>
        </span>
        <span className="mt-2 block text-xs leading-5 text-slate-400">{definition.purpose}</span>
        <span className="mt-3 block font-mono text-[9px] leading-4 text-slate-500">
          PARAMS&nbsp; {parameterSummary}
        </span>
        <span className="mt-1 block font-mono text-[9px] text-slate-500">
          PEAK ARM&nbsp; {peakArmValue.toFixed(2)}
        </span>
      </button>
    );
  };

  const activeDefinition = COMMERCIAL_BEHAVIOR_DEFINITIONS[activeVariantId];

  return (
    <main
      className="h-screen overflow-y-auto bg-[#071015] text-slate-100"
      style={{
        backgroundImage:
          'radial-gradient(circle at 17% 15%, rgba(34, 211, 238, 0.12), transparent 32%), radial-gradient(circle at 84% 5%, rgba(14, 165, 233, 0.11), transparent 28%), linear-gradient(180deg, #081319 0%, #05090d 100%)',
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[1580px] flex-col px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-amber-100">
                LAB ONLY
              </span>
              <span className="font-mono text-[10px] tracking-[0.18em] text-slate-500">
                KEFU2 / PROCEDURAL PARAMETERS / BATCH 9A
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">
              Commercial Live2D Behavior Lab
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              直接采样商业行为时间线，不播放 generated motion3；不连接语音、会话、WebSocket 或后端。
            </p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border border-white/10 bg-black/20 px-3 py-2 sm:self-auto">
            <span
              className={`h-2 w-2 rounded-full ${
                status === 'error'
                  ? 'bg-rose-400'
                  : status === 'playing'
                    ? 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]'
                    : 'bg-emerald-400'
              }`}
            />
            <span className="font-mono text-[10px] tracking-[0.16em] text-slate-300">
              {STATUS_LABELS[status]}
            </span>
          </div>
        </header>

        <div className="grid flex-1 gap-5 xl:grid-cols-[minmax(500px,0.9fr)_minmax(620px,1.1fr)]">
          <div className="flex flex-col gap-5">
            <section className="relative min-h-[620px] overflow-hidden rounded-[30px] border border-white/10 bg-black/25 shadow-[0_24px_80px_rgba(0,0,0,0.34)] xl:sticky xl:top-7 xl:h-[calc(100vh-3.5rem)] xl:min-h-0">
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(103, 232, 249, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(103, 232, 249, 0.055) 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                  maskImage: 'linear-gradient(to bottom, black, transparent 92%)',
                }}
              />
              <div ref={hostRef} className="absolute inset-0" aria-label="Live2D behavior viewport" />

              <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3 sm:inset-x-5 sm:top-5">
                <div className="rounded-2xl border border-white/10 bg-[#071015]/82 px-4 py-3 shadow-xl backdrop-blur-xl">
                  <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500">
                    CURRENT BEHAVIOR
                  </p>
                  <p className="mt-1 text-base font-semibold text-white">{activeDefinition.label}</p>
                  <p className="mt-1 font-mono text-[9px] text-cyan-100/60">
                    {activeDefinition.id} · {activeDefinition.duration.toFixed(2)} s
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#071015]/82 px-4 py-3 text-right font-mono text-[9px] leading-5 text-slate-300 shadow-xl backdrop-blur-xl">
                  <div>RESET&nbsp; {resetSource.toUpperCase()}</div>
                  <div>WEIGHT&nbsp; 1.00 EXPLICIT</div>
                  <div>ARM SIDE&nbsp; {armScreenSide.toUpperCase()}</div>
                </div>
              </div>

              <div className="absolute inset-x-4 bottom-4 grid gap-2 sm:inset-x-5 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={status === 'initializing' || status === 'error'}
                  onClick={resetToNeutral}
                  className="rounded-2xl border border-emerald-300/30 bg-[#071015]/88 px-4 py-3 text-left backdrop-blur-xl transition hover:border-emerald-200/60 hover:bg-emerald-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-45"
                >
                  <span className="block text-sm font-semibold text-emerald-50">Idle / True Reset</span>
                  <span className="mt-1 block font-mono text-[9px] text-emerald-100/55">
                    PURPOSE&nbsp; No semantic gesture; restore a true neutral baseline
                  </span>
                  <span className="mt-1 block font-mono text-[9px] text-emerald-100/55">
                    PARAMS&nbsp; All 9 verified parameters → baseline @ 1.00
                  </span>
                  <span className="mt-1 block font-mono text-[9px] text-emerald-100/55">
                    Duration 0.00 s · Peak arm 0.00
                  </span>
                </button>
                <div className="rounded-2xl border border-white/10 bg-[#071015]/88 px-4 py-3 backdrop-blur-xl">
                  <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-500">
                    OWNERSHIP GUARD
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    No mouth, eye-open, EyeBallY, audio, or generated motion files.
                  </p>
                </div>
              </div>

              {status === 'initializing' && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full border border-cyan-300/20 bg-[#071015]/75 px-5 py-3 text-xs tracking-[0.2em] text-cyan-100 backdrop-blur-xl">
                    LOADING FORMAL KEFU2 MODEL
                  </div>
                </div>
              )}
              {errorMessage && (
                <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-rose-300/25 bg-rose-950/85 px-4 py-3 text-sm text-rose-100 backdrop-blur-xl">
                  {errorMessage}
                </div>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-5">
            {BEHAVIOR_SECTIONS.map((section) => (
              <section
                key={section.eyebrow}
                className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl"
              >
                <div className="mb-4">
                  <p className="text-[10px] font-bold tracking-[0.22em] text-cyan-300">
                    {section.eyebrow}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{section.title}</h2>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {section.variantIds.map(renderBehaviorButton)}
                </div>
              </section>
            ))}

            <section className="rounded-[26px] border border-amber-300/20 bg-amber-300/[0.045] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
              <p className="text-[10px] font-bold tracking-[0.22em] text-amber-200">
                DIRECTION CALIBRATION
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">Confirm the rendered arm side</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                CDI only proves a right-side arm-like control. It does not prove which screen side it occupies.
                This selection stays in local React state and is never persisted.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={status === 'initializing' || status === 'error'}
                  onClick={() => playBehavior('guide_arm_clear')}
                  className="rounded-xl border border-cyan-300/25 bg-cyan-300/8 px-4 py-3 text-sm font-semibold text-cyan-50 transition hover:border-cyan-200/55 disabled:opacity-45"
                >
                  Play Arm-side Guide
                </button>
                <button
                  type="button"
                  disabled={status === 'initializing' || status === 'error'}
                  onClick={() => playBehavior('guide_no_arm_side')}
                  className="rounded-xl border border-violet-300/25 bg-violet-300/8 px-4 py-3 text-sm font-semibold text-violet-50 transition hover:border-violet-200/55 disabled:opacity-45"
                >
                  Play Opposite-side Guide
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={armScreenSide === 'screen left'}
                  onClick={() => setArmScreenSide('screen left')}
                  className={`rounded-xl border px-4 py-3 text-sm transition ${
                    armScreenSide === 'screen left'
                      ? 'border-amber-200 bg-amber-200/15 text-amber-50'
                      : 'border-white/10 bg-black/15 text-slate-300 hover:border-amber-200/35'
                  }`}
                >
                  Mark arm side = screen left
                </button>
                <button
                  type="button"
                  aria-pressed={armScreenSide === 'screen right'}
                  onClick={() => setArmScreenSide('screen right')}
                  className={`rounded-xl border px-4 py-3 text-sm transition ${
                    armScreenSide === 'screen right'
                      ? 'border-amber-200 bg-amber-200/15 text-amber-50'
                      : 'border-white/10 bg-black/15 text-slate-300 hover:border-amber-200/35'
                  }`}
                >
                  Mark arm side = screen right
                </button>
              </div>
              <p className="mt-3 font-mono text-[10px] tracking-[0.14em] text-amber-100/65">
                CURRENT: {armScreenSide.toUpperCase()} · HUMAN CONFIRMATION REQUIRED
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

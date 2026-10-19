'use client';

import type { DisplayObject } from '@pixi/display';
import { useEffect, useRef, useState } from 'react';
import Live2DAvatar from '@/components/Live2DAvatar';
import { KEFU3_MOTIONS, LIVE2D_MODEL_URL, type SemanticMotion } from '@/components/avatar/live2d/modelConfig';
import {
  MOTION_LAB_EXISTING,
  MOTION_LAB_GENERATED,
  MOTION_LAB_IDLE,
  MOTION_LAB_MODEL_PATH,
  type MotionLabEntry,
} from '@/lib/live2dMotionLabCatalog';

type LabStatus = 'initializing' | 'idle' | 'loading' | 'playing' | 'error';

type RuntimeWindow = Window & typeof globalThis & {
  PIXI?: unknown;
  Live2DCubismCore?: unknown;
};

type RuntimeMotion = {
  setIsLoop?: (loop: boolean) => void;
};

type RuntimeMotionManager = {
  loadMotion?: (group: string, index: number) => Promise<RuntimeMotion | undefined>;
  stopAllMotions?: () => void;
};

type RuntimeLive2DModel = {
  anchor?: { set: (x: number, y?: number) => void };
  scale?: { set: (x: number, y?: number) => void };
  position?: { set: (x: number, y: number) => void };
  internalModel?: {
    width?: number;
    height?: number;
    motionManager?: RuntimeMotionManager;
  };
  motion?: (group: string, index?: number, priority?: number) => Promise<boolean>;
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

const CUBISM_CORE_SCRIPT = '/live2d/live2dcubismcore.min.js';
const MOTION_PRIORITY_IDLE = 1;
const MOTION_PRIORITY_FORCE = 3;

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

const STATUS_LABELS: Record<LabStatus, string> = {
  initializing: 'INITIALIZING MODEL',
  idle: 'IDLE / READY',
  loading: 'LOADING MOTION',
  playing: 'PLAYING ONCE',
  error: 'LAB ERROR',
};

export default function Live2DMotionLab() {
  const [legacy, setLegacy] = useState(false);
  return (
    <>
      <nav className="fixed right-4 top-2 z-50 flex gap-2 rounded-lg bg-slate-900 p-2 text-sm text-white">
        <button onClick={() => setLegacy(false)} aria-pressed={!legacy}>kefu3 正式渲染验收</button>
        <button onClick={() => setLegacy(true)} aria-pressed={legacy}>旧 kefu2 Motion Lab</button>
      </nav>
      {legacy ? <LegacyMotionLab /> : <Kefu3MotionPreview />}
    </>
  );
}

function Kefu3MotionPreview() {
  const [action, setAction] = useState<SemanticMotion>('idle');
  const [requestId, setRequestId] = useState(0);
  const [activeMotion, setActiveMotion] = useState('loading');
  const [speaking, setSpeaking] = useState(false);
  const [schedulerTest, setSchedulerTest] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [motionLog, setMotionLog] = useState<string[]>([]);
  const [halfBody, setHalfBody] = useState(false);
  const speakingRef = useRef(false);
  const speechTimeRef = useRef(0);
  const mouthOpenRef = useRef(0);
  const mouthFormRef = useRef(0);

  useEffect(() => {
    speakingRef.current = speaking;
    let frame = 0;
    const start = performance.now();
    const animate = () => {
      const time = (performance.now() - start) / 1000;
      speechTimeRef.current = time;
      mouthOpenRef.current = speaking ? (Math.sin(time * 12) + 1) * 0.38 : 0;
      mouthFormRef.current = speaking ? Math.sin(time * 4) * 0.6 : 0;
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frame);
  }, [speaking]);

  useEffect(() => {
    if (!schedulerTest) return;
    const timer = window.setTimeout(() => {
      setSpeaking(false);
      setSchedulerTest(false);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [schedulerTest]);

  const reportMotionState = (motion: string) => {
    setActiveMotion(motion);
    if (schedulerTest && motion !== 'idle') {
      setMotionLog((current) => [
        ...current,
        `${speechTimeRef.current.toFixed(1)}s ${motion}`,
      ]);
    }
  };

  const startSchedulerTest = (motion: SemanticMotion, text: string) => {
    speechTimeRef.current = 0;
    setMotionLog([]);
    setAction(motion);
    setReplyText(text);
    setSchedulerTest(true);
    setSpeaking(true);
  };

  return (
    <main className="h-screen overflow-y-auto bg-slate-950 px-6 pb-6 pt-16 text-white">
      <h1 className="text-2xl font-semibold">kefu3 正式渲染验收</h1>
      <p className="my-3 text-sm text-slate-300">复用正式 Live2DAvatar；按钮仅传语义动作。口型测试模拟 SpeechTimeline 的实时 refs，不连接后端。</p>
      <p className="mb-4 font-mono text-xs text-slate-400">{LIVE2D_MODEL_URL}</p>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="h-[520px] rounded-xl bg-slate-900" aria-label="正式模型预览">
          <Live2DAvatar status={speaking ? 'SPEAKING' : 'IDLE'} action={action} replyText={replyText}
            motionRequestId={schedulerTest ? undefined : requestId} onMotionState={reportMotionState}
            viewMode={halfBody ? 'half' : 'full'} speakingRef={speakingRef}
            speechTimeRef={speechTimeRef} mouthOpenRef={mouthOpenRef} mouthFormRef={mouthFormRef} />
        </section>
        <section>
          <p role="status" data-testid="motion-status" className="mb-4">当前动作：{activeMotion}</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(KEFU3_MOTIONS) as SemanticMotion[]).map((name) => (
              <button key={name} className="rounded-lg bg-slate-800 p-3 text-left hover:bg-slate-700"
                disabled={activeMotion === 'loading'}
                onClick={() => { setSchedulerTest(false); setReplyText(''); setAction(name); setRequestId((id) => id + 1); }}>
                {name === 'idle' ? 'idle / waiting' : name}
              </button>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2 text-sm">
            <button className="rounded-lg bg-cyan-900 p-2 text-left hover:bg-cyan-800" onClick={() => startSchedulerTest(
              'explain',
              '我是机场智慧客服，主要负责介绍服务流程。办理过程分为三个步骤。第一步准备有效证件。第二步核对行程信息。第三步按照页面提示继续办理。整个过程中我会持续说明相关事项。',
            )}>20 秒调度：explain</button>
            <button className="rounded-lg bg-cyan-900 p-2 text-left hover:bg-cyan-800" onClick={() => startSchedulerTest(
              'guide_right',
              '请向右行进，安检口在您的右侧。沿当前通道继续前行约一百米。经过服务区后继续保持当前方向。看到扶梯后上二层即可。',
            )}>20 秒调度：guide_right</button>
            <button className="rounded-lg bg-cyan-900 p-2 text-left hover:bg-cyan-800" onClick={() => startSchedulerTest(
              'alert',
              '请注意，您的航班出现取消异常。我理解您现在比较着急，接下来说明后续处理方式。工作人员会核对行程并提供后续安排。',
            )}>20 秒调度：alert 锁定</button>
          </div>
          <label className="mt-6 block"><input type="checkbox" checked={speaking} onChange={(event) => setSpeaking(event.target.checked)} /> 模拟实时口型</label>
          <label className="mt-3 block"><input type="checkbox" checked={halfBody} onChange={(event) => setHalfBody(event.target.checked)} /> 半身视图</label>
          <p className="mt-4 break-words font-mono text-xs text-cyan-200" data-testid="scheduler-log">
            调度记录：{motionLog.length > 0 ? motionLog.join(' → ') : '尚未运行'}
          </p>
          <p className="mt-5 text-sm text-slate-400">逐个播放应自动回 idle；也可在动作中途点击另一动作，检查手臂恢复、左右方向及嘴型。</p>
        </section>
      </div>
    </main>
  );
}

function LegacyMotionLab() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<RuntimeLive2DDisplayObject | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const playbackTokenRef = useRef(0);
  const [status, setStatus] = useState<LabStatus>('initializing');
  const [activeMotion, setActiveMotion] = useState<MotionLabEntry>(MOTION_LAB_IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let app: RuntimePixiApplication | null = null;
    let model: RuntimeLive2DDisplayObject | null = null;

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

        const live2DWindow = window as RuntimeWindow;
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
        }) as unknown as RuntimePixiApplication;

        app = pixiApp;
        host.appendChild(pixiApp.view);

        const live2dModel = (await live2d.Live2DModel.from(MOTION_LAB_MODEL_PATH, {
          autoInteract: false,
          motionPreload: live2d.MotionPreloadStrategy.ALL,
        })) as unknown as RuntimeLive2DDisplayObject;

        if (cancelled) {
          live2dModel.destroy?.({ children: true });
          return;
        }

        model = live2dModel;
        modelRef.current = live2dModel;
        live2dModel.anchor?.set(0.5, 1);
        pixiApp.stage.addChild(live2dModel);

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
          const scale = Math.min((width * 0.84) / internalWidth, (height * 0.94) / internalHeight);

          currentModel.scale?.set(scale);
          currentModel.position?.set(width * 0.5, height * 0.98);
        };

        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        live2dModel.internalModel?.motionManager?.stopAllMotions?.();
        await live2dModel.motion?.(
          MOTION_LAB_IDLE.group,
          MOTION_LAB_IDLE.index,
          MOTION_PRIORITY_IDLE,
        );

        if (!cancelled) {
          setActiveMotion(MOTION_LAB_IDLE);
          setErrorMessage(null);
          setStatus('idle');
        }
      } catch (error) {
        console.error('Live2D motion lab initialization failed:', error);
        if (!cancelled) {
          setErrorMessage('Live2D model failed to initialize. Check the lab manifest and browser console.');
          setStatus('error');
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      playbackTokenRef.current += 1;
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      resizeObserver?.disconnect();
      resizeObserver = null;
      modelRef.current = null;

      if (model && app) {
        app.stage.removeChild(model);
      }
      model?.destroy?.({ children: true });
      app?.destroy(true, { children: true });
    };
  }, []);

  const resetToIdle = async () => {
    const model = modelRef.current;
    if (!model) {
      return;
    }

    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    setStatus('loading');
    setErrorMessage(null);
    model.internalModel?.motionManager?.stopAllMotions?.();

    try {
      const started = await model.motion?.(
        MOTION_LAB_IDLE.group,
        MOTION_LAB_IDLE.index,
        MOTION_PRIORITY_IDLE,
      );

      if (playbackTokenRef.current !== token) {
        return;
      }
      if (!started) {
        throw new Error('Idle motion request was rejected.');
      }

      setActiveMotion(MOTION_LAB_IDLE);
      setStatus('idle');
    } catch (error) {
      console.error('Live2D motion lab idle reset failed:', error);
      if (playbackTokenRef.current === token) {
        setErrorMessage('Could not restore the idle motion.');
        setStatus('error');
      }
    }
  };

  const playMotion = async (entry: MotionLabEntry) => {
    const model = modelRef.current;
    if (!model) {
      return;
    }

    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    setActiveMotion(entry);
    setErrorMessage(null);
    setStatus('loading');

    try {
      const motionManager = model.internalModel?.motionManager;
      const runtimeMotion = await motionManager?.loadMotion?.(entry.group, entry.index);

      if (playbackTokenRef.current !== token) {
        return;
      }

      runtimeMotion?.setIsLoop?.(false);
      motionManager?.stopAllMotions?.();

      const started = await model.motion?.(entry.group, entry.index, MOTION_PRIORITY_FORCE);
      if (playbackTokenRef.current !== token) {
        return;
      }
      if (!started) {
        throw new Error(`Motion request was rejected for ${entry.group}[${entry.index}].`);
      }

      setStatus('playing');
      completionTimerRef.current = window.setTimeout(() => {
        if (playbackTokenRef.current !== token) {
          return;
        }

        const currentModel = modelRef.current;
        currentModel?.internalModel?.motionManager?.stopAllMotions?.();
        const idleRequest = currentModel?.motion?.(
          MOTION_LAB_IDLE.group,
          MOTION_LAB_IDLE.index,
          MOTION_PRIORITY_IDLE,
        );

        void idleRequest?.then((idleStarted) => {
          if (playbackTokenRef.current !== token) {
            return;
          }
          if (!idleStarted) {
            setErrorMessage('Motion finished, but the idle reset request was rejected.');
            setStatus('error');
            return;
          }

          setActiveMotion(MOTION_LAB_IDLE);
          setStatus('idle');
          completionTimerRef.current = null;
        }).catch((error: unknown) => {
          console.error('Live2D motion lab automatic idle reset failed:', error);
          if (playbackTokenRef.current === token) {
            setErrorMessage('Motion finished, but automatic idle reset failed.');
            setStatus('error');
          }
        });
      }, Math.ceil(entry.duration * 1000));
    } catch (error) {
      console.error('Live2D motion lab playback failed:', error);
      if (playbackTokenRef.current === token) {
        setErrorMessage(`Could not play ${entry.label}.`);
        setStatus('error');
      }
    }
  };

  const controlsDisabled = status === 'initializing' || status === 'loading';

  const renderMotionButton = (entry: MotionLabEntry) => {
    const isActive = activeMotion.id === entry.id && status === 'playing';

    return (
      <button
        key={entry.id}
        type="button"
        aria-pressed={isActive}
        disabled={controlsDisabled}
        onClick={() => void playMotion(entry)}
        className={`group flex min-h-16 items-center justify-between rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-45 ${
          isActive
            ? 'border-cyan-300/70 bg-cyan-300/14 shadow-[0_0_28px_rgba(34,211,238,0.12)]'
            : 'border-white/10 bg-white/[0.035] hover:border-cyan-300/35 hover:bg-white/[0.07]'
        }`}
      >
        <span>
          <span className="block text-sm font-semibold tracking-wide text-white">{entry.label}</span>
          <span className="mt-1 block font-mono text-[10px] text-slate-400">
            {entry.group}[{entry.index}] · {entry.duration.toFixed(3)} s
          </span>
        </span>
        <span className="ml-4 text-[10px] font-semibold tracking-[0.18em] text-cyan-200/65 transition group-hover:text-cyan-100">
          PLAY
        </span>
      </button>
    );
  };

  return (
    <main
      className="h-screen overflow-y-auto bg-[#071015] text-slate-100"
      style={{
        backgroundImage:
          'radial-gradient(circle at 18% 18%, rgba(34, 211, 238, 0.11), transparent 34%), radial-gradient(circle at 82% 4%, rgba(59, 130, 246, 0.12), transparent 30%), linear-gradient(180deg, #081319 0%, #05090d 100%)',
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-amber-100">
                LAB ONLY
              </span>
              <span className="font-mono text-[10px] tracking-[0.18em] text-slate-500">KEFU2 / MOTION3 / BATCH 8C</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">
              Generated Live2D Motion Visual Lab
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              独立视觉验收页面。每次只播放一个动作；不连接语音、终端会话、协议或后端。
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
            <span className="font-mono text-[10px] tracking-[0.16em] text-slate-300">{STATUS_LABELS[status]}</span>
          </div>
        </header>

        <div className="grid flex-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(400px,0.75fr)]">
          <section className="relative h-[520px] self-start overflow-hidden rounded-[30px] border border-white/10 bg-black/25 shadow-[0_24px_80px_rgba(0,0,0,0.34)] xl:h-[690px]">
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(103, 232, 249, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(103, 232, 249, 0.055) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
                maskImage: 'linear-gradient(to bottom, black, transparent 92%)',
              }}
            />
            <div className="pointer-events-none absolute inset-x-[12%] bottom-[7%] h-[18%] rounded-[50%] bg-cyan-300/8 blur-3xl" />
            <div ref={hostRef} className="absolute inset-0" aria-label="Live2D model viewport" />

            <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3 sm:inset-x-5 sm:top-5">
              <div className="rounded-2xl border border-white/10 bg-[#071015]/80 px-4 py-3 shadow-xl backdrop-blur-xl">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500">CURRENT MOTION</p>
                <p className="mt-1 text-base font-semibold text-white">{activeMotion.label}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#071015]/80 px-4 py-3 text-right font-mono text-[10px] leading-5 text-slate-300 shadow-xl backdrop-blur-xl">
                <div>GROUP&nbsp; {activeMotion.group}</div>
                <div>INDEX&nbsp; {activeMotion.index}</div>
                <div>TIME&nbsp;&nbsp; {activeMotion.duration.toFixed(3)} s</div>
              </div>
            </div>

            {status === 'initializing' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border border-cyan-300/20 bg-[#071015]/75 px-5 py-3 text-xs tracking-[0.2em] text-cyan-100 backdrop-blur-xl">
                  LOADING LAB MANIFEST
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-rose-300/25 bg-rose-950/80 px-4 py-3 text-sm text-rose-100 backdrop-blur-xl">
                {errorMessage}
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-5">
            <section className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.22em] text-cyan-300">GENERATED</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Candidate motions</h2>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/8 px-2.5 py-1 font-mono text-[10px] text-cyan-100/75">
                  {MOTION_LAB_GENERATED.length} MOTIONS
                </span>
              </div>
              <div className="grid gap-2.5">{MOTION_LAB_GENERATED.map(renderMotionButton)}</div>
            </section>

            <section className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
              <div className="mb-4">
                <p className="text-[10px] font-bold tracking-[0.22em] text-violet-300">REFERENCE</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Existing motion controls</h2>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {MOTION_LAB_EXISTING.map(renderMotionButton)}
              </div>
            </section>

            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => void resetToIdle()}
              className="flex min-h-14 items-center justify-between rounded-2xl border border-emerald-300/25 bg-emerald-300/8 px-5 text-left transition hover:border-emerald-200/50 hover:bg-emerald-300/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span>
                <span className="block text-sm font-semibold text-emerald-50">Reset / Idle</span>
                <span className="mt-0.5 block font-mono text-[10px] text-emerald-100/55">Idle[0] · daiji.motion3.json</span>
              </span>
              <span className="text-[10px] font-bold tracking-[0.18em] text-emerald-200/75">RESET</span>
            </button>

            <section className="rounded-[26px] border border-white/10 bg-black/20 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.22em] text-amber-200">VISUAL QA</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Manual acceptance prompts</h2>
                </div>
                <span className="text-[10px] text-slate-500">不自动调参</span>
              </div>

              <div className="grid gap-3">
                {MOTION_LAB_GENERATED.map((entry) => (
                  <article
                    key={`${entry.id}-qa`}
                    className={`rounded-2xl border p-4 transition ${
                      activeMotion.id === entry.id
                        ? 'border-amber-200/35 bg-amber-200/[0.07]'
                        : 'border-white/[0.08] bg-white/[0.025]'
                    }`}
                  >
                    <h3 className="text-sm font-semibold text-white">{entry.label}</h3>
                    <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-slate-400 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      {entry.qaPrompts?.map((prompt) => (
                        <li key={prompt} className="flex gap-2">
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-200/70" />
                          <span>{prompt}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>

            <p className="px-1 pb-2 text-[11px] leading-5 text-slate-500">
              Reference motion JSON currently declares Loop=true. This lab changes only the loaded in-memory motion instance to one-shot, then returns to the real idle motion. Source assets remain untouched.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

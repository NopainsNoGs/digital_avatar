'use client';

import { useEffect, useRef, useState } from 'react';
import ThreeAvatar, {
  type VRMBehaviorDebugSnapshot,
  type VRMTurnState,
} from '@/components/ThreeAvatar';
import {
  buildGesturePlan,
  type GestureCue,
  type VRMCoSpeechGesture,
  type VRMSemanticMotion,
} from '@/components/avatar/vrm/gesturePlanner';
import { VRM_MODEL_URL, VRM_MODEL_VERSION } from '@/components/avatar/vrm/modelConfig';
import type { AvatarSpeechSegmentTiming } from '@/types/avatar';
import type { TerminalState } from '@/types/terminal';

const LAB_MOTIONS: readonly VRMSemanticMotion[] = [
  'idle', 'welcome', 'self_intro', 'explain_left', 'explain_right',
  'guide_left', 'guide_right', 'guide_front', 'confirm', 'comfort',
  'alert', 'offer_help', 'thanks', 'count_one', 'count_two',
  'count_three', 'emphasize', 'small_ack', 'goodbye',
];

const ACCEPTANCE_TEXTS = [
  '您好，我是机场智能服务数字人，可以帮助您查询航班和路线。',
  '请先向左走，到前方扶梯后继续直行，然后右转即可看到安检口。',
  '您的航班已经取消，请不要着急，我可以帮您前往服务台办理改签。',
  '第一，请准备好身份证。第二，请确认登机牌。最后，请提前到达登机口。',
  '好的，已经为您确认完成，谢谢您的使用，祝您旅途愉快。',
] as const;

const ACCEPTANCE_AUDIO_URLS = [
  '/vrm-demo-audio/test-1.wav',
  '/vrm-demo-audio/test-2.wav',
  '/vrm-demo-audio/test-3.wav',
  '/vrm-demo-audio/test-4.wav',
  '/vrm-demo-audio/test-5.wav',
] as const;

export default function VRMBehaviorLab() {
  const [motion, setMotion] = useState<VRMSemanticMotion>('idle');
  const [motionRequestId, setMotionRequestId] = useState(0);
  const [activeMotion, setActiveMotion] = useState<VRMSemanticMotion>('idle');
  const [activeCoSpeech, setActiveCoSpeech] = useState<VRMCoSpeechGesture | null>(null);
  const [turnState, setTurnState] = useState<VRMTurnState>('IDLE');
  const [terminalStatus, setTerminalStatus] = useState<TerminalState>('IDLE');
  const [speaking, setSpeaking] = useState(false);
  const [serverStreamEnded, setServerStreamEnded] = useState(false);
  const [activeAudioSources, setActiveAudioSources] = useState(0);
  const [behaviorDebug, setBehaviorDebug] = useState<VRMBehaviorDebugSnapshot>({
    turnState: 'IDLE',
    semanticGesture: null,
    coSpeechGesture: null,
    speaking: false,
    gestureLocked: false,
    returningToIdle: false,
  });
  const [viewMode, setViewMode] = useState<'full' | 'half'>('full');
  const [textPlayback, setTextPlayback] = useState(false);
  const [testText, setTestText] = useState<string>(ACCEPTANCE_TEXTS[0]);
  const [plannedCues, setPlannedCues] = useState<GestureCue[]>(() => (
    buildGesturePlan(ACCEPTANCE_TEXTS[0])
  ));
  const [playbackTimeoutMs, setPlaybackTimeoutMs] = useState<number | null>(null);
  const [voiceLabel, setVoiceLabel] = useState('尚未播放');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [motionLog, setMotionLog] = useState<string[]>([]);
  const speakingRef = useRef(false);
  const speechTimeRef = useRef(0);
  const speechSegmentsRef = useRef<AvatarSpeechSegmentTiming[]>([]);
  const mouthOpenRef = useRef(0);
  const mouthFormRef = useRef(0);
  const playbackGenerationRef = useRef(0);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const demoAudioRef = useRef<HTMLAudioElement | null>(null);

  const cancelDemoVoice = () => {
    const audio = demoAudioRef.current;
    if (audio) {
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
      demoAudioRef.current = null;
    }
    const utterance = speechUtteranceRef.current;
    if (utterance) {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      speechUtteranceRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const finishTextPlayback = (playbackGeneration: number) => {
    if (playbackGeneration !== playbackGenerationRef.current) return;
    demoAudioRef.current = null;
    speechUtteranceRef.current = null;
    setServerStreamEnded(true);
    setActiveAudioSources(0);
    speakingRef.current = false;
    setSpeaking(false);
    setTerminalStatus('IDLE');
    setTextPlayback(false);
    setPlaybackTimeoutMs(null);
  };

  useEffect(() => {
    speakingRef.current = speaking;
    if (!speaking) {
      mouthOpenRef.current = 0;
      mouthFormRef.current = 0;
    }
  }, [speaking]);

  useEffect(() => {
    let frameId = 0;
    let previous = performance.now();
    const animate = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (speakingRef.current) {
        const demoAudio = demoAudioRef.current;
        speechTimeRef.current = demoAudio && !demoAudio.paused
          ? demoAudio.currentTime
          : speechTimeRef.current + delta;
        mouthOpenRef.current = (Math.sin(speechTimeRef.current * 12) + 1) * 0.36;
        mouthFormRef.current = Math.sin(speechTimeRef.current * 3.7) * 0.55;
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => () => {
    const audio = demoAudioRef.current;
    if (audio) {
      audio.pause();
      demoAudioRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (playbackTimeoutMs === null) return;
    const playbackGeneration = playbackGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (playbackGeneration !== playbackGenerationRef.current) return;
      setServerStreamEnded(true);
      setActiveAudioSources(0);
      speakingRef.current = false;
      setSpeaking(false);
      setTerminalStatus('IDLE');
      setTextPlayback(false);
      setPlaybackTimeoutMs(null);
    }, playbackTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [playbackTimeoutMs]);

  const requestMotion = (nextMotion: VRMSemanticMotion) => {
    playbackGenerationRef.current += 1;
    cancelDemoVoice();
    speakingRef.current = false;
    setSpeaking(false);
    setTerminalStatus('IDLE');
    setServerStreamEnded(true);
    setActiveAudioSources(0);
    setTextPlayback(false);
    setPlaybackTimeoutMs(null);
    setMotion(nextMotion);
    setMotionRequestId((current) => current + 1);
  };

  const parseAndPlay = (durationOverride?: number, textOverride?: string) => {
    playbackGenerationRef.current += 1;
    const playbackGeneration = playbackGenerationRef.current;
    cancelDemoVoice();
    speakingRef.current = false;
    setSpeaking(false);
    setTerminalStatus('IDLE');
    setServerStreamEnded(true);
    setActiveAudioSources(0);
    setPlaybackTimeoutMs(null);
    const playbackText = (textOverride ?? testText).trim();
    const cues = buildGesturePlan(playbackText);
    setPlannedCues(cues);
    setMotionLog([]);
    speechTimeRef.current = 0;
    speechSegmentsRef.current = cues.map((cue, index) => ({
      index,
      text: cue.text,
      startTime: cue.startAt,
    }));
    setTextPlayback(true);
    setVoiceError(null);

    if (durationOverride !== undefined) {
      speakingRef.current = true;
      setSpeaking(true);
      setTerminalStatus('SPEAKING');
      setServerStreamEnded(false);
      setActiveAudioSources(1);
      setVoiceLabel('计时模拟（无语音）');
      setPlaybackTimeoutMs(durationOverride * 1000);
      return;
    }

    const startSpeaking = (label: string) => {
      if (playbackGeneration !== playbackGenerationRef.current) return;
      speechTimeRef.current = 0;
      speakingRef.current = true;
      setSpeaking(true);
      setTerminalStatus('SPEAKING');
      setServerStreamEnded(false);
      setActiveAudioSources(1);
      setVoiceLabel(label);
    };

    const playBrowserFallback = () => {
      if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
        setVoiceError('当前浏览器不支持语音合成，请使用 Chrome 或 Edge 录制演示。');
        setTextPlayback(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(playbackText);
      utterance.lang = 'zh-CN';
      utterance.rate = 1.08;
      utterance.pitch = 1.02;
      utterance.volume = 1;

      const chineseVoices = window.speechSynthesis.getVoices().filter((voice) => (
        /^zh(?:-|_)/i.test(voice.lang)
      ));
      utterance.voice = chineseVoices.find((voice) => (
        /xiaoxiao|xiaoyi|huihui|tingting|female|女/i.test(voice.name)
      )) ?? chineseVoices[0] ?? null;

      utterance.onstart = () => startSpeaking(
        `${utterance.voice?.name ?? '浏览器中文默认语音'}（自定义文本后备）`,
      );
      utterance.onend = () => finishTextPlayback(playbackGeneration);
      utterance.onerror = (event) => {
        if (playbackGeneration !== playbackGenerationRef.current) return;
        setVoiceError(`语音播放失败：${event.error}`);
        finishTextPlayback(playbackGeneration);
      };
      speechUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    };

    const presetIndex = ACCEPTANCE_TEXTS.findIndex((text) => text === playbackText);
    if (presetIndex < 0) {
      playBrowserFallback();
      return;
    }

    const audio = new Audio(ACCEPTANCE_AUDIO_URLS[presetIndex]);
    let fallbackStarted = false;
    const fallbackAfterAudioFailure = () => {
      if (fallbackStarted || playbackGeneration !== playbackGenerationRef.current) return;
      fallbackStarted = true;
      demoAudioRef.current = null;
      setVoiceError('CosyVoice 固定音频加载失败，已切换浏览器语音。');
      playBrowserFallback();
    };
    audio.preload = 'auto';
    audio.onplaying = () => startSpeaking('CosyVoice 中文女（1.08×）');
    audio.onended = () => finishTextPlayback(playbackGeneration);
    audio.onerror = fallbackAfterAudioFailure;
    demoAudioRef.current = audio;
    void audio.play().catch(fallbackAfterAudioFailure);
  };

  const reportMotionState = (nextMotion: VRMSemanticMotion) => {
    setActiveMotion(nextMotion);
    if (speakingRef.current && nextMotion !== 'idle') {
      setMotionLog((current) => [
        ...current,
        `${speechTimeRef.current.toFixed(1)}s ${nextMotion}`,
      ]);
    }
  };

  const reportTurnState = (nextState: VRMTurnState) => {
    setTurnState(nextState);
    setMotionLog((current) => [
      ...current,
      `${speechTimeRef.current.toFixed(1)}s [${nextState}]`,
    ]);
  };

  const simulateSpeakingStart = () => {
    playbackGenerationRef.current += 1;
    cancelDemoVoice();
    speechTimeRef.current = 0;
    speakingRef.current = true;
    setSpeaking(true);
    setTerminalStatus('SPEAKING');
    setServerStreamEnded(false);
    setActiveAudioSources(1);
    setMotionLog([]);
  };

  const simulateSpeakingEnd = () => {
    playbackGenerationRef.current += 1;
    cancelDemoVoice();
    setServerStreamEnded(true);
    setActiveAudioSources(0);
    speakingRef.current = false;
    setSpeaking(false);
    setTerminalStatus('IDLE');
    setTextPlayback(false);
    setPlaybackTimeoutMs(null);
  };

  const testReturnToIdle = () => {
    simulateSpeakingStart();
    setMotion('guide_right');
    setMotionRequestId((current) => current + 1);
    setPlaybackTimeoutMs(1800);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-6 text-white md:px-8">
      <h1 className="text-2xl font-semibold">VRM 文本驱动动作验收</h1>
      <p className="mt-2 text-sm text-slate-300">
        正式 ThreeAvatar + 规则型 Gesture Planner；文本按 phrase 规划，动作由 speechTime 到点触发。
      </p>
      <p className="mt-2 font-mono text-xs text-slate-400">
        {VRM_MODEL_VERSION} · {VRM_MODEL_URL}
      </p>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(390px,0.75fr)]">
        <section className="flex min-h-[620px] items-center justify-center overflow-hidden rounded-2xl bg-slate-900">
          <ThreeAvatar
            status={terminalStatus}
            emotion="neutral"
            gesture="explain"
            replyText={textPlayback ? testText : ''}
            semanticMotion={textPlayback ? undefined : motion}
            motionRequestId={motionRequestId}
            onMotionState={reportMotionState}
            onCoSpeechState={setActiveCoSpeech}
            onTurnState={reportTurnState}
            onBehaviorDebug={setBehaviorDebug}
            viewMode={viewMode}
            speakingRef={speakingRef}
            speechSegmentsRef={speechSegmentsRef}
            speechTimeRef={speechTimeRef}
            mouthOpenRef={mouthOpenRef}
            mouthFormRef={mouthFormRef}
          />
        </section>

        <section className="space-y-5 rounded-2xl bg-slate-900 p-5">
          <div>
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <p className="rounded bg-slate-950 p-2">TurnState<br /><strong className="text-cyan-300">{turnState}</strong></p>
              <p className="rounded bg-slate-950 p-2">Semantic<br /><strong>{behaviorDebug.semanticGesture ?? activeMotion}</strong></p>
              <p className="rounded bg-slate-950 p-2">Co-speech<br /><strong>{activeCoSpeech ?? 'none'}</strong></p>
              <p className="rounded bg-slate-950 p-2">Speaking<br /><strong>{String(speaking)}</strong></p>
              <p className="rounded bg-slate-950 p-2">ServerStreamEnded<br /><strong>{String(serverStreamEnded)}</strong></p>
              <p className="rounded bg-slate-950 p-2">ActiveAudioSources<br /><strong>{activeAudioSources}</strong></p>
              <p className="rounded bg-slate-950 p-2">GestureLocked<br /><strong>{String(behaviorDebug.gestureLocked)}</strong></p>
              <p className="rounded bg-slate-950 p-2">ReturningToIdle<br /><strong>{String(behaviorDebug.returningToIdle)}</strong></p>
            </div>
            <p className="mb-3 text-sm" role="status">当前动作：<strong>{activeMotion}</strong></p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LAB_MOTIONS.map((name) => (
                <button key={name} type="button"
                  className="rounded-lg bg-slate-800 p-2 text-left text-xs hover:bg-slate-700"
                  onClick={() => requestMotion(name)}>
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pt-5">
            <label className="text-sm font-medium" htmlFor="gesture-test-text">文本测试</label>
            <textarea id="gesture-test-text"
              className="mt-2 min-h-28 w-full rounded-lg border border-white/10 bg-slate-950 p-3 text-sm outline-none focus:border-cyan-400"
              value={testText}
              onChange={(event) => {
                setTestText(event.target.value);
                setPlannedCues(buildGesturePlan(event.target.value));
              }} />
            <div className="mt-2 flex flex-wrap gap-2">
              {ACCEPTANCE_TEXTS.map((text, index) => (
                <button key={text} type="button"
                  className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                  onClick={() => {
                    setTestText(text);
                    setPlannedCues(buildGesturePlan(text));
                  }}>
                  测试 {index + 1}
                </button>
              ))}
            </div>
            <button type="button"
              className="mt-3 w-full rounded-lg bg-cyan-900 p-3 text-sm hover:bg-cyan-800"
              onClick={() => parseAndPlay()}>
              语音解析并播放
            </button>
            <p className="mt-2 text-xs text-slate-400">
              当前声音：<span className="text-cyan-200">{voiceLabel}</span>
            </p>
            {voiceError && (
              <p className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-200">
                {voiceError}
              </p>
            )}
          </div>

          <div className="border-t border-white/10 pt-5">
            <p className="mb-2 text-sm font-medium">状态机验收</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button type="button" className="rounded bg-emerald-900 p-2 hover:bg-emerald-800" onClick={simulateSpeakingStart}>模拟 SPEAKING START</button>
              <button type="button" className="rounded bg-rose-900 p-2 hover:bg-rose-800" onClick={simulateSpeakingEnd}>模拟 SPEAKING END</button>
              <button type="button" className="rounded bg-slate-800 p-2 hover:bg-slate-700" onClick={testReturnToIdle}>测试 return-to-idle</button>
              <button type="button" className="rounded bg-slate-800 p-2 hover:bg-slate-700" onClick={() => {
                setTestText(ACCEPTANCE_TEXTS[1]);
                setPlannedCues(buildGesturePlan(ACCEPTANCE_TEXTS[1]));
                parseAndPlay(undefined, ACCEPTANCE_TEXTS[1]);
              }}>测试连续 gesture</button>
              <button type="button" className="rounded bg-slate-800 p-2 hover:bg-slate-700" onClick={() => parseAndPlay(20)}>测试 20 秒 speaking</button>
              <button type="button" className="rounded bg-slate-800 p-2 hover:bg-slate-700" onClick={() => parseAndPlay()}>测试文本 segment gesture</button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-950 p-3 text-xs">
            {plannedCues.length ? plannedCues.map((cue) => (
              <p key={cue.key} className="mb-2 last:mb-0">
                <span className="text-slate-300">{cue.text}</span>
                <span className="mx-2 text-slate-600">→</span>
                <strong className="text-cyan-300">{cue.primaryGesture ?? 'speaking_idle'}</strong>
                <span className="ml-2 text-slate-500">@ {cue.startAt.toFixed(1)}s</span>
              </p>
            )) : <p className="text-slate-500">请输入文本。</p>}
          </div>

          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={speaking}
                onChange={(event) => {
                  setTextPlayback(false);
                  setPlaybackTimeoutMs(null);
                  if (event.target.checked) {
                    simulateSpeakingStart();
                  } else {
                    simulateSpeakingEnd();
                  }
                }} />
              模拟实时口型
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={viewMode === 'half'}
                onChange={(event) => setViewMode(event.target.checked ? 'half' : 'full')} />
              半身视图
            </label>
          </div>

          <p className="break-words font-mono text-xs text-cyan-200">
            调度记录：{motionLog.length ? motionLog.join(' → ') : '尚未运行'}
          </p>
        </section>
      </div>
    </main>
  );
}

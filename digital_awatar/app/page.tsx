'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import Live2DAvatar from '@/components/Live2DAvatar';
import type { AvatarViewMode } from '@/components/Live2DAvatar';
import { useTerminalSocket } from '@/hooks/useTerminalSocket';

const EMOTION_LABELS: Record<string, string> = {
  neutral: '平稳',
  smile: '积极',
  shy: '安抚',
  sad: '焦虑',
  angry: '高压',
  surprised: '突发',
};

const CAPTURE_LABELS: Record<string, string> = {
  idle: '待机',
  preparing: '准备中',
  recording: '采集中',
  'fallback-audio': '仅语音',
  error: '异常',
};

const TERMINAL_STATUS_LABELS: Record<string, string> = {
  IDLE: '系统待命',
  LISTENING: '旅客讲话中',
  THINKING: '意图分析中',
  SPEAKING: '数字人播报中',
  ERROR: '服务异常',
};

function resolveSocketUrl() {
  if (process.env.NEXT_PUBLIC_TERMINAL_WS_URL) {
    return process.env.NEXT_PUBLIC_TERMINAL_WS_URL;
  }

  if (typeof window === 'undefined') {
    return 'ws://localhost:8000/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:8000/ws`;
}

function SignalTile({
  label,
  value,
  tone = 'text-white',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-white/35">{label}</p>
      <p className={`text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export default function TerminalPage() {
  const socketUrl = resolveSocketUrl();
  const [avatarViewMode, setAvatarViewMode] = useState<AvatarViewMode>('half');
  const {
    status,
    currentResponse,
    visibleReplyText,
    mouthOpenRef,
    avatarVisemeTrackRef,
    avatarSpeechTimeRef,
    avatarSpeakingRef,
    cameraVideoRef,
    captureState,
    captureError,
    liveUserEmotion,
    startRecording,
    stopRecording,
    resetTerminal,
  } = useTerminalSocket(socketUrl);

  const avatarEmotion = currentResponse?.emotionMode || 'neutral';
  const fusedEmotion = currentResponse?.userEmotionAnalysis?.finalEmotion || liveUserEmotion?.facialEmotion?.emotion || 'neutral';
  const statusLabel = TERMINAL_STATUS_LABELS[status] || status;
  const captureLabel = CAPTURE_LABELS[captureState] || captureState;
  const replyDisplayText = visibleReplyText;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b16] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#15335c_0%,#07111f_42%,#040914_78%,#02050d_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_20%_20%,rgba(0,229,255,0.16),transparent_22%),radial-gradient(circle_at_80%_18%,rgba(77,169,255,0.12),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(190,242,100,0.08),transparent_28%)]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-3 py-4 md:px-6">
        <section className="relative w-full max-w-[1260px] overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,33,0.94),rgba(4,8,18,0.98))] shadow-[0_35px_120px_rgba(0,0,0,0.55)]">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(125,147,177,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(125,147,177,0.18)_1px,transparent_1px)] [background-size:30px_30px]" />
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />

          <div className="relative flex flex-col">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-cyan-200/70">
                  Transit Hub Digital Human
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-[0.08em] text-white md:text-[30px]">
                  交通终端智能服务中枢
                </h1>
                <p className="mt-2 text-sm text-white/45">
                  中部区域集中部署，保留数字人、摄像头采集和播报交互三条主链路。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-medium tracking-[0.18em] text-cyan-100">
                  {statusLabel}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs tracking-[0.18em] text-white/60">
                  摄像头 {captureLabel}
                </span>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs tracking-[0.18em] text-emerald-100">
                  用户情绪 {EMOTION_LABELS[fusedEmotion] || fusedEmotion}
                </span>
              </div>
            </header>

            <div className="grid gap-4 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-h-0 flex-col gap-4">
                <section className="relative min-h-[420px] overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,22,38,0.88),rgba(7,12,24,0.94))]">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,229,255,0.12),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(0,100,255,0.12),transparent_42%)]" />
                  <div className="pointer-events-none absolute inset-x-[12%] bottom-6 h-24 rounded-full bg-cyan-300/20 blur-[80px]" />
                  <div className="absolute left-5 top-5 z-20 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] tracking-[0.2em] text-white/60">
                      AVATAR CORE
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] tracking-[0.2em] text-white/60">
                      口播风格 {EMOTION_LABELS[avatarEmotion] || avatarEmotion}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAvatarViewMode((mode) => (mode === 'half' ? 'full' : 'half'))}
                      className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[11px] tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/18"
                    >
                      {avatarViewMode === 'half' ? '切换全身' : '切换半身'}
                    </button>
                  </div>

                  <div className="absolute right-5 top-5 z-20 hidden gap-2 md:flex">
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] tracking-[0.18em] text-cyan-100">
                      WebSocket {socketUrl.replace(/^wss?:\/\//, '')}
                    </span>
                  </div>

                  <div className="relative z-10 flex h-full items-center justify-center px-4 py-12 md:px-8 md:py-14">
                    <div className="relative w-full max-w-[400px] aspect-[4/5] min-h-[420px]">
                      <Live2DAvatar
                        status={status}
                        emotion={avatarEmotion}
                        viewMode={avatarViewMode}
                        mouthOpenRef={mouthOpenRef}
                        visemeTrackRef={avatarVisemeTrackRef}
                        speechTimeRef={avatarSpeechTimeRef}
                        speakingRef={avatarSpeakingRef}
                      />

                      {status === 'THINKING' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[20px] bg-black/32 backdrop-blur-[2px]">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300"></div>
                          <p className="mt-4 text-xs tracking-[0.2em] text-cyan-100/90 animate-pulse">
                            神经中枢处理中...
                          </p>
                        </div>
                      )}

                      {status === 'IDLE' && (
                        <div className="pointer-events-none absolute inset-0 rounded-[20px] bg-black/6 transition-opacity" />
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-[30px] border border-white/10 bg-black/25 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
                  <AnimatePresence mode="wait">
                    {status !== 'IDLE' || currentResponse?.replyText ? (
                      <motion.div
                        key="active-response"
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                      >
                        <div className="mb-4 flex items-center gap-3">
                          <span className={`h-2.5 w-2.5 rounded-full ${status === 'LISTENING' ? 'bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.75)]' : 'bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.65)]'}`} />
                          <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                            {status === 'LISTENING' ? '旅客采集中' : status === 'SPEAKING' ? '数字人播报中' : '系统处理结果'}
                          </p>
                        </div>

                        {currentResponse?.transcript && (
                          <p className="mb-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-white/45">
                            识别文本：{currentResponse.transcript}
                          </p>
                        )}

                        <p className="text-[22px] font-medium leading-[1.65] tracking-[0.04em] text-white md:text-[28px]">
                          {replyDisplayText || '正在准备播报内容...'}
                        </p>

                        {currentResponse?.actionCard && (
                          <div className="mt-4 rounded-[24px] border border-cyan-300/20 bg-cyan-300/8 px-4 py-4">
                            <p className="text-[11px] uppercase tracking-[0.26em] text-cyan-100/80">
                              {currentResponse.actionCard.type}
                            </p>
                            <p className="mt-2 text-lg font-semibold text-white">
                              {currentResponse.actionCard.title}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-white/65">
                              {currentResponse.actionCard.content}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="idle-response"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex min-h-[164px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-4 text-center"
                      >
                        <p className="text-xs uppercase tracking-[0.42em] text-white/25">
                          System Standby
                        </p>
                        <p className="mt-4 max-w-xl text-base leading-relaxed text-white/45">
                          面向线下终端，旅客按住说话后即可触发摄像头采样、语音识别、情绪融合和数字人播报。
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              </div>

              <aside className="flex flex-col gap-4">
                <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,18,31,0.96),rgba(7,12,24,0.94))] p-4 shadow-[0_22px_60px_rgba(0,0,0,0.32)]">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/40">
                        Camera Sensor
                      </p>
                      <p className="mt-1 text-sm text-white/70">旅客面部采集与多模态情绪实时监控</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] tracking-[0.2em] text-white/55">
                      {captureLabel}
                    </span>
                  </div>

                  <div className="relative overflow-hidden rounded-[26px] border border-cyan-300/15 bg-[#060b15] p-3">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_50%_18%,rgba(31,129,255,0.22),transparent_42%),linear-gradient(180deg,#0a1526_0%,#050913_100%)]">
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                      />

                      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_22%,transparent_78%,rgba(255,255,255,0.03))]" />
                      <div className="pointer-events-none absolute inset-0 camera-grid" />
                      <div className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-200/75 to-transparent camera-scan" />

                      <div className="pointer-events-none absolute left-4 top-4 h-6 w-6 rounded-tl-xl border-l-2 border-t-2 border-cyan-200/80" />
                      <div className="pointer-events-none absolute right-4 top-4 h-6 w-6 rounded-tr-xl border-r-2 border-t-2 border-cyan-200/80" />
                      <div className="pointer-events-none absolute bottom-4 left-4 h-6 w-6 rounded-bl-xl border-b-2 border-l-2 border-cyan-200/80" />
                      <div className="pointer-events-none absolute bottom-4 right-4 h-6 w-6 rounded-br-xl border-b-2 border-r-2 border-cyan-200/80" />

                      <div className="absolute left-4 top-4 rounded-full border border-cyan-300/20 bg-black/25 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-cyan-100/85 backdrop-blur-xl">
                        Face Tracking
                      </div>

                      {captureState === 'idle' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/62 px-8 text-center">
                          <p className="text-xs uppercase tracking-[0.38em] text-white/30">Camera Standby</p>
                          <p className="mt-3 text-sm leading-relaxed text-white/50">
                            按住说话后自动打开摄像头与麦克风，完成当前回合采集。
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <SignalTile
                      label="Face"
                      value={liveUserEmotion?.facialEmotion?.emotion || 'n/a'}
                      tone="text-cyan-100"
                    />
                    <SignalTile
                      label="Prosody"
                      value={liveUserEmotion?.prosodyEmotion?.emotion || 'n/a'}
                      tone="text-amber-100"
                    />
                    <SignalTile
                      label="Text"
                      value={currentResponse?.userEmotionAnalysis?.textEmotion?.emotion || 'n/a'}
                      tone="text-emerald-100"
                    />
                    <SignalTile
                      label="Fused"
                      value={currentResponse?.userEmotionAnalysis?.finalEmotion || 'n/a'}
                    />
                  </div>

                  {captureError && (
                    <p className="mt-4 rounded-[22px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-relaxed text-amber-100/85">
                      {captureError}
                    </p>
                  )}
                </section>

                <section className="rounded-[30px] border border-white/10 bg-black/25 p-5 backdrop-blur-2xl">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/40">
                        Interaction Console
                      </p>
                      <p className="mt-1 text-sm text-white/65">收音、重置与线下终端状态控制</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] tracking-[0.18em] text-white/55">
                      {EMOTION_LABELS[avatarEmotion] || avatarEmotion}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={resetTerminal}
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/55 transition-all hover:bg-white/[0.1] hover:text-white active:scale-95"
                      title="重置系统"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    </button>

                    <button
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onMouseLeave={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      onTouchCancel={stopRecording}
                      onContextMenu={(event) => event.preventDefault()}
                      onDragStart={(event) => event.preventDefault()}
                      className={`flex h-14 flex-1 items-center justify-center rounded-full px-6 text-sm font-semibold tracking-[0.24em] text-white transition-all duration-300 select-none touch-none ${
                        status === 'LISTENING'
                          ? 'bg-gradient-to-r from-rose-500 to-orange-500 shadow-[0_0_34px_rgba(251,113,133,0.45)]'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_0_34px_rgba(34,211,238,0.28)] hover:scale-[1.02]'
                      }`}
                    >
                      {status === 'LISTENING' ? '松开发送' : '按住说话'}
                    </button>
                  </div>

                  <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-white/55">
                    {status === 'IDLE'
                      ? '当前处于待命状态，适合线下终端轮询等待。'
                      : status === 'LISTENING'
                        ? '正在同时采集语音和面部信号，本轮结束后统一回传。'
                        : status === 'THINKING'
                          ? '后端正在做 ASR、情绪融合和流式回复生成。'
                          : status === 'SPEAKING'
                            ? '音频流与嘴型帧已下发，前端按播报节奏驱动数字人。'
                            : '链路异常，请检查后端日志。'}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

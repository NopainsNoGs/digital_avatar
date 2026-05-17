import { useEffect, useRef, useState } from 'react';
import { useUserMultimodalCapture } from '@/hooks/useUserMultimodalCapture';
import {
  ActionCard,
  AgentResponse,
  ClientEmotionContextPayload,
  TerminalState,
  UserEmotionAnalysis,
  VisemeFrame,
} from '../types/terminal';

interface AudioChunkMetadata {
  type: 'AUDIO_CHUNK';
  streamId: string;
  chunkIndex: number;
  sampleRate: number;
  channels: number;
  format: 'pcm_s16le';
  chunkDurationSec: number;
  visemeFps?: number;
  visemeChunk?: VisemeFrame[];
}

interface ScheduledVisemeFrame extends VisemeFrame {
  at: number;
  endAt: number;
}

type SocketMessage =
  | { type: 'STATUS_UPDATE'; status: TerminalState }
  | {
      type: 'TEXT_STREAM_START';
      payload: { transcript: string; replyText: string; emotionMode?: string; actionCard?: ActionCard | null };
    }
  | { type: 'TEXT_STREAM_DELTA'; payload: { delta: string; replyText: string } }
  | {
      type: 'TEXT_STREAM_END';
      payload: { replyText: string; emotionMode?: string; actionCard?: ActionCard | null };
    }
  | { type: 'AGENT_STATE_DELTA'; payload: { emotionMode?: string; actionCard?: ActionCard | null } }
  | { type: 'USER_EMOTION_ANALYSIS'; payload: UserEmotionAnalysis }
  | { type: 'AUDIO_STREAM_START'; payload: { streamId: string; sampleRate: number; channels: number; format: string } }
  | { type: 'AUDIO_STREAM_END'; payload: { streamId: string; totalSamples: number; sampleRate: number } }
  | { type: 'AGENT_REPLY'; status: TerminalState; payload: AgentResponse }
  | { type: 'ERROR'; status?: TerminalState; payload: { message: string } };

type BrowserAudioContext = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

const SUBTITLE_REVEAL_CHARS_PER_SEC = 7;
const SUBTITLE_REVEAL_CATCHUP_CHARS_PER_SEC = 18;

function resolveBackendAssetUrl(assetUrl: string | null | undefined, wsUrl: string) {
  if (!assetUrl) {
    return undefined;
  }

  if (/^https?:\/\//i.test(assetUrl)) {
    return assetUrl;
  }

  const backendHttpOrigin = wsUrl
    .replace(/^ws:\/\//i, 'http://')
    .replace(/^wss:\/\//i, 'https://')
    .replace(/\/ws\/?$/i, '');

  return `${backendHttpOrigin}${assetUrl.startsWith('/') ? assetUrl : `/${assetUrl}`}`;
}

function unpackBinaryPacket(packet: ArrayBuffer): { metadata: AudioChunkMetadata; payload: ArrayBuffer } {
  const headerView = new DataView(packet);
  const metadataLength = headerView.getUint32(0, true);
  const metadataBytes = new Uint8Array(packet, 4, metadataLength);
  const metadata = JSON.parse(new TextDecoder().decode(metadataBytes)) as AudioChunkMetadata;
  const payload = packet.slice(4 + metadataLength);
  return { metadata, payload };
}

function pcm16ToFloat32(pcmBytes: ArrayBuffer): Float32Array {
  const pcmView = new Int16Array(pcmBytes);
  const float32 = new Float32Array(pcmView.length);

  for (let index = 0; index < pcmView.length; index += 1) {
    float32[index] = pcmView[index] / 32768;
  }

  return float32;
}

export function useTerminalSocket(wsUrl: string) {
  const [status, setStatus] = useState<TerminalState>('IDLE');
  const [currentResponse, setCurrentResponse] = useState<AgentResponse | null>(null);
  const [visibleReplyText, setVisibleReplyText] = useState('');
  const {
    cameraVideoRef,
    captureState,
    captureError,
    liveUserEmotion,
    startCapture,
    stopCapture,
  } = useUserMultimodalCapture();

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playbackCursorRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentStreamIdRef = useRef<string | null>(null);
  const serverStreamEndedRef = useRef(false);
  const mouthLoopFrameRef = useRef<number | null>(null);
  const mouthOpenRef = useRef(0);
  const visemeFramesRef = useRef<ScheduledVisemeFrame[]>([]);
  const visemeCursorRef = useRef(0);
  const streamHasVisemeRef = useRef(false);
  const avatarVisemeTrackRef = useRef<VisemeFrame[]>([]);
  const avatarSpeechTimeRef = useRef(0);
  const avatarSpeechStartAtRef = useRef<number | null>(null);
  const avatarSpeakingRef = useRef(false);
  // 原始 LLM 文本持续累积在这里，真正渲染到 UI 的字幕由音频播放节奏解锁。
  const bufferedReplyTextRef = useRef('');
  const visibleReplyLengthRef = useRef(0);
  const subtitleLoopFrameRef = useRef<number | null>(null);
  const subtitleLastTickAtRef = useRef<number | null>(null);
  const subtitleUnlockedRef = useRef(false);

  const mergeCurrentResponse = (patch: Partial<AgentResponse>) => {
    const normalizedPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Partial<AgentResponse>;

    setCurrentResponse((previous) => ({
      transcript: previous?.transcript ?? '',
      replyText: previous?.replyText ?? '',
      ...previous,
      ...normalizedPatch,
    }));
  };

  const stopSubtitleReveal = () => {
    if (subtitleLoopFrameRef.current !== null) {
      cancelAnimationFrame(subtitleLoopFrameRef.current);
      subtitleLoopFrameRef.current = null;
    }
    subtitleLastTickAtRef.current = null;
  };

  const resetBufferedReplyState = () => {
    bufferedReplyTextRef.current = '';
    visibleReplyLengthRef.current = 0;
    subtitleUnlockedRef.current = false;
    setVisibleReplyText('');
    stopSubtitleReveal();
  };

  const resetSubtitleDisplay = () => {
    visibleReplyLengthRef.current = 0;
    subtitleUnlockedRef.current = false;
    setVisibleReplyText('');
    stopSubtitleReveal();
  };

  const updateBufferedReplyText = (replyText: string) => {
    bufferedReplyTextRef.current = replyText;

    if (!subtitleUnlockedRef.current) {
      return;
    }

    const visibleLength = visibleReplyLengthRef.current;
    setVisibleReplyText(replyText.slice(0, Math.min(visibleLength, replyText.length)));
  };

  const flushVisibleReplyText = () => {
    const fullReplyText = bufferedReplyTextRef.current;
    visibleReplyLengthRef.current = fullReplyText.length;
    setVisibleReplyText(fullReplyText);
  };

  const stopMouthMonitor = () => {
    if (mouthLoopFrameRef.current !== null) {
      cancelAnimationFrame(mouthLoopFrameRef.current);
      mouthLoopFrameRef.current = null;
    }
    avatarSpeechTimeRef.current = 0;
    avatarSpeakingRef.current = false;
    mouthOpenRef.current = 0;
  };

  const maybeFinishPlayback = () => {
    if (!serverStreamEndedRef.current || activeSourcesRef.current.size > 0) {
      return;
    }

    playbackCursorRef.current = audioContextRef.current?.currentTime ?? 0;
    currentStreamIdRef.current = null;
    avatarSpeechStartAtRef.current = null;
    avatarSpeakingRef.current = false;
    flushVisibleReplyText();
    stopSubtitleReveal();
    stopMouthMonitor();
    setStatus('IDLE');
  };

  const startSubtitleReveal = () => {
    subtitleUnlockedRef.current = true;

    if (subtitleLoopFrameRef.current !== null) {
      return;
    }

    const tick = (timestamp: number) => {
      const targetReplyText = bufferedReplyTextRef.current;
      const previousTickAt = subtitleLastTickAtRef.current ?? timestamp;
      const elapsedMs = Math.max(timestamp - previousTickAt, 0);
      subtitleLastTickAtRef.current = timestamp;

      if (targetReplyText.length > visibleReplyLengthRef.current) {
        // 正在播报时慢速追字，播报结束后快速补齐剩余字幕，避免最后几个字明显落后。
        const charsPerSecond = serverStreamEndedRef.current
          ? SUBTITLE_REVEAL_CATCHUP_CHARS_PER_SEC
          : SUBTITLE_REVEAL_CHARS_PER_SEC;
        const nextLength = Math.min(
          targetReplyText.length,
          visibleReplyLengthRef.current + Math.max(1, Math.round((elapsedMs / 1000) * charsPerSecond)),
        );

        visibleReplyLengthRef.current = nextLength;
        setVisibleReplyText(targetReplyText.slice(0, nextLength));
      }

      const hasPendingText = visibleReplyLengthRef.current < bufferedReplyTextRef.current.length;
      const shouldContinue =
        activeSourcesRef.current.size > 0 ||
        (!serverStreamEndedRef.current && currentStreamIdRef.current !== null) ||
        hasPendingText;

      if (!shouldContinue) {
        stopSubtitleReveal();
        return;
      }

      subtitleLoopFrameRef.current = requestAnimationFrame(tick);
    };

    subtitleLoopFrameRef.current = requestAnimationFrame(tick);
  };

  const startMouthMonitor = () => {
    if (mouthLoopFrameRef.current !== null) {
      return;
    }

    const tick = () => {
      const audioContext = audioContextRef.current;
      if (!audioContext) {
        stopMouthMonitor();
        return;
      }

      const now = audioContext.currentTime;
      avatarSpeechTimeRef.current = avatarSpeechStartAtRef.current === null
        ? 0
        : Math.max(0, now - avatarSpeechStartAtRef.current);

      if (streamHasVisemeRef.current && visemeFramesRef.current.length > 0) {
        const visemeFrames = visemeFramesRef.current;
        let cursor = visemeCursorRef.current;

        while (cursor + 1 < visemeFrames.length && visemeFrames[cursor + 1].at <= now) {
          cursor += 1;
        }
        visemeCursorRef.current = cursor;

        const currentFrame = visemeFrames[cursor];
        const hasActiveFrame =
          currentFrame !== undefined &&
          now >= currentFrame.at - 0.01 &&
          now <= currentFrame.endAt + 0.02;

        mouthOpenRef.current = hasActiveFrame ? currentFrame.y : 0;

        if (cursor > 120) {
          visemeFramesRef.current = visemeFrames.slice(cursor - 1);
          visemeCursorRef.current = 1;
        }
      } else if (analyserRef.current) {
        const analyser = analyserRef.current;
        const samples = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(samples);

        let energy = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const centered = (samples[index] - 128) / 128;
          energy += centered * centered;
        }

        const rms = Math.sqrt(energy / samples.length);
        mouthOpenRef.current = Math.min(rms * 4.5, 1);
      }

      const hasPendingViseme =
        streamHasVisemeRef.current &&
        visemeFramesRef.current.some((frame) => frame.endAt >= now - 0.05);
      const shouldContinue =
        activeSourcesRef.current.size > 0 ||
        (!serverStreamEndedRef.current && currentStreamIdRef.current !== null) ||
        hasPendingViseme;
      avatarSpeakingRef.current = shouldContinue;

      if (!shouldContinue) {
        stopMouthMonitor();
        return;
      }

      mouthLoopFrameRef.current = requestAnimationFrame(tick);
    };

    mouthLoopFrameRef.current = requestAnimationFrame(tick);
  };

  const scheduleVisemeChunk = (
    visemeChunk: VisemeFrame[] | undefined,
    startAt: number,
    chunkDurationSec: number,
    relativeStartSec: number,
    visemeFps = 60,
  ) => {
    if (!visemeChunk || visemeChunk.length === 0) {
      return;
    }

    streamHasVisemeRef.current = true;
    const defaultFrameDuration = 1 / visemeFps;

    const scheduledFrames = visemeChunk.map((frame, index) => {
      const nextFrame = visemeChunk[index + 1];
      const relativeEnd = nextFrame
        ? nextFrame.t
        : Math.min(frame.t + defaultFrameDuration, chunkDurationSec);

      return {
        ...frame,
        at: startAt + frame.t,
        endAt: startAt + Math.max(relativeEnd, frame.t + 0.008),
      };
    });

    visemeFramesRef.current.push(...scheduledFrames);
    avatarVisemeTrackRef.current.push(
      ...visemeChunk.map((frame) => ({
        ...frame,
        t: relativeStartSec + frame.t,
      })),
    );

    if (avatarVisemeTrackRef.current.length > 1200) {
      avatarVisemeTrackRef.current = avatarVisemeTrackRef.current.slice(-600);
    }
  };

  const flushScheduledAudio = () => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // 这里多数是节点已经播放完成，直接忽略即可。
      }
    });

    activeSourcesRef.current.clear();
    playbackCursorRef.current = audioContextRef.current?.currentTime ?? 0;
    currentStreamIdRef.current = null;
    serverStreamEndedRef.current = false;
    streamHasVisemeRef.current = false;
    visemeFramesRef.current = [];
    visemeCursorRef.current = 0;
    avatarVisemeTrackRef.current = [];
    avatarSpeechTimeRef.current = 0;
    avatarSpeechStartAtRef.current = null;
    avatarSpeakingRef.current = false;
    resetSubtitleDisplay();
    stopMouthMonitor();
  };

  const ensureAudioEngine = async () => {
    if (typeof window === 'undefined') {
      return null;
    }

    if (!audioContextRef.current) {
      const AudioContextCtor = window.AudioContext ?? (window as BrowserAudioContext).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('当前浏览器不支持 Web Audio API');
      }

      const audioContext = new AudioContextCtor();
      const gainNode = audioContext.createGain();
      const analyserNode = audioContext.createAnalyser();

      analyserNode.fftSize = 2048;
      gainNode.gain.value = 1.0;

      gainNode.connect(analyserNode);
      analyserNode.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      masterGainRef.current = gainNode;
      analyserRef.current = analyserNode;
      playbackCursorRef.current = audioContext.currentTime;
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  };

  const scheduleAudioChunk = async (metadata: AudioChunkMetadata, pcmBytes: ArrayBuffer) => {
    const audioContext = await ensureAudioEngine();
    if (!audioContext || !masterGainRef.current) {
      return;
    }

    const channelData = pcm16ToFloat32(pcmBytes);
    const audioBuffer = audioContext.createBuffer(metadata.channels, channelData.length, metadata.sampleRate);
    audioBuffer.getChannelData(0).set(channelData);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(masterGainRef.current);

    const startAt = Math.max(audioContext.currentTime + 0.03, playbackCursorRef.current);
    if (avatarSpeechStartAtRef.current === null) {
      avatarSpeechStartAtRef.current = startAt;
    }
    const relativeStartSec = Math.max(0, startAt - avatarSpeechStartAtRef.current);
    source.start(startAt);
    playbackCursorRef.current = startAt + audioBuffer.duration;
    activeSourcesRef.current.add(source);
    scheduleVisemeChunk(
      metadata.visemeChunk,
      startAt,
      metadata.chunkDurationSec,
      relativeStartSec,
      metadata.visemeFps ?? 60,
    );

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      maybeFinishPlayback();
    };

    setStatus('SPEAKING');
    startSubtitleReveal();
    startMouthMonitor();
  };

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => console.log('前端：已连接至 Python 中枢大脑');

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data) as SocketMessage;

        switch (data.type) {
          case 'STATUS_UPDATE':
            setStatus(data.status);
            return;
          case 'TEXT_STREAM_START':
            resetBufferedReplyState();
            updateBufferedReplyText(data.payload.replyText);
            mergeCurrentResponse({
              transcript: data.payload.transcript,
              replyText: data.payload.replyText,
              emotionMode: data.payload.emotionMode,
              actionCard: data.payload.actionCard,
              videoUrl: null,
            });
            return;
          case 'TEXT_STREAM_DELTA':
            updateBufferedReplyText(data.payload.replyText);
            mergeCurrentResponse({ replyText: data.payload.replyText });
            return;
          case 'AGENT_STATE_DELTA':
            mergeCurrentResponse({
              emotionMode: data.payload.emotionMode,
              actionCard: data.payload.actionCard,
            });
            return;
          case 'USER_EMOTION_ANALYSIS':
            mergeCurrentResponse({
              userEmotionAnalysis: data.payload,
            });
            return;
          case 'TEXT_STREAM_END':
            updateBufferedReplyText(data.payload.replyText);
            mergeCurrentResponse({
              replyText: data.payload.replyText,
              emotionMode: data.payload.emotionMode,
              actionCard: data.payload.actionCard,
            });
            return;
          case 'AUDIO_STREAM_START':
            if (currentStreamIdRef.current && currentStreamIdRef.current !== data.payload.streamId) {
              flushScheduledAudio();
            }

            currentStreamIdRef.current = data.payload.streamId;
            serverStreamEndedRef.current = false;
            streamHasVisemeRef.current = false;
            visemeFramesRef.current = [];
            visemeCursorRef.current = 0;
            avatarVisemeTrackRef.current = [];
            avatarSpeechTimeRef.current = 0;
            avatarSpeechStartAtRef.current = null;
            avatarSpeakingRef.current = false;
            return;
          case 'AUDIO_STREAM_END':
            serverStreamEndedRef.current = true;
            maybeFinishPlayback();
            return;
          case 'AGENT_REPLY':
            if (data.payload.replyText) {
              updateBufferedReplyText(data.payload.replyText);
            }
            mergeCurrentResponse({
              ...data.payload,
              videoUrl: resolveBackendAssetUrl(data.payload.videoUrl, wsUrl),
            });
            return;
          case 'ERROR':
            console.error('后端流式链路报错:', data.payload.message);
            setStatus(data.status ?? 'ERROR');
            return;
          default:
            return;
        }
      }

      if (event.data instanceof ArrayBuffer) {
        const { metadata, payload } = unpackBinaryPacket(event.data);
        if (metadata.type === 'AUDIO_CHUNK') {
          await scheduleAudioChunk(metadata, payload);
        }
        return;
      }

      if (event.data instanceof Blob) {
        const buffer = await event.data.arrayBuffer();
        const { metadata, payload } = unpackBinaryPacket(buffer);
        if (metadata.type === 'AUDIO_CHUNK') {
          await scheduleAudioChunk(metadata, payload);
        }
      }
    };

    socketRef.current = ws;

    return () => {
      socketRef.current = null;
      flushScheduledAudio();
      resetBufferedReplyState();
      void stopCapture();
      ws.close();

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close();
      }
    };
  }, [wsUrl]);

  const primeAudioPlayback = async () => {
    const audioContext = await ensureAudioEngine();
    if (!audioContext || !masterGainRef.current) {
      return;
    }

    const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGainRef.current);
    source.start(0);
  };

  const startRecording = async () => {
    try {
      await primeAudioPlayback();
      const recordingStream = await startCapture();
      const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      mediaRecorder.current = preferredMimeType
        ? new MediaRecorder(recordingStream, { mimeType: preferredMimeType })
        : new MediaRecorder(recordingStream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = async () => {
        const emotionContext = await stopCapture();
        const audioBlob = new Blob(audioChunks.current, { type: preferredMimeType || 'audio/webm' });

        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          flushScheduledAudio();
          if (emotionContext) {
            socketRef.current.send(
              JSON.stringify({
                type: 'USER_EMOTION_CONTEXT',
                payload: emotionContext as ClientEmotionContextPayload,
              }),
            );
          }
          socketRef.current.send(audioBlob);
          setStatus('THINKING');
        }
      };

      mediaRecorder.current.start();
      setStatus('LISTENING');
    } catch (error) {
      console.error('录音或多模态采集启动失败:', error);
      void stopCapture();
      alert('请允许浏览器使用麦克风；如需表情识别，还需要允许摄像头权限。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
    }
  };

  const sendTextInput = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) {
      return false;
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket 尚未连接，忽略本次文本调试请求');
      return false;
    }

    await primeAudioPlayback();
    flushScheduledAudio();
    setStatus('THINKING');
    socketRef.current.send(
      JSON.stringify({
        type: 'TEXT_INPUT',
        text: cleanText,
      }),
    );
    return true;
  };

  const resetTerminal = () => {
    flushScheduledAudio();
    resetBufferedReplyState();
    void stopCapture();
    setStatus('IDLE');
    setCurrentResponse(null);
  };

  return {
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
    sendTextInput,
    resetTerminal,
  };
}

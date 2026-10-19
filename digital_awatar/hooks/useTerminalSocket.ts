import { useEffect, useState } from 'react';
import { useSpeechTimeline } from '@/hooks/useSpeechTimeline';
import { useTerminalAudioEngine } from '@/hooks/useTerminalAudioEngine';
import { useTerminalRecorder } from '@/hooks/useTerminalRecorder';
import { useTerminalTransport } from '@/hooks/useTerminalTransport';
import { unpackBinaryPacket } from '@/lib/terminalProtocol';
import type { AudioChunkMetadata, ServerSocketMessage } from '@/types/terminalProtocol';
import {
  ActionCard,
  AgentResponse,
  Live2DAction,
  TerminalState,
} from '../types/terminal';

function normalizeLive2DAction(action: string | undefined | null): Live2DAction | undefined {
  if (
    action === 'explain' ||
    action === 'point' ||
    action === 'comfort' ||
    action === 'alert' ||
    action === 'confirm'
  ) {
    return action;
  }

  return undefined;
}

function deriveLive2DAction(
  replyText: string | undefined,
  emotionMode?: string,
  actionCard?: ActionCard | null,
  explicitAction?: string | null,
): Live2DAction {
  const normalizedAction = normalizeLive2DAction(explicitAction);
  if (normalizedAction) {
    return normalizedAction;
  }

  if (actionCard?.type === 'NAVIGATE') {
    return 'point';
  }
  if (actionCard?.type === 'ALERT') {
    return 'alert';
  }

  const text = replyText ?? '';
  if (/登机口|值机|安检|行李|出口|电梯|扶梯|左|右|前方|直行|楼|层|到达|出发|柜台|区域|航站楼|路线|导航/.test(text)) {
    return 'point';
  }
  if (/别着急|不用担心|请放心|我来|帮您|协助|稍等|可以先|建议您先|安抚/.test(text) || emotionMode === 'shy' || emotionMode === 'sad') {
    return 'comfort';
  }
  if (/紧急|马上|立即|延误|取消|异常|警报|危险|注意|高压/.test(text) || emotionMode === 'angry' || emotionMode === 'surprised') {
    return 'alert';
  }
  if (/好的|可以|已为您|没问题|完成|谢谢|不客气|确认|祝您/.test(text) || emotionMode === 'smile') {
    return 'confirm';
  }

  return 'explain';
}

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

// Legacy Public Hook Name: this facade now orchestrates the terminal session subsystems.
export function useTerminalSocket(wsUrl: string) {
  const [status, setStatus] = useState<TerminalState>('IDLE');
  const [currentResponse, setCurrentResponse] = useState<AgentResponse | null>(null);
  const recorder = useTerminalRecorder();
  const {
    cameraVideoRef,
    captureState,
    captureError,
    liveUserEmotion,
  } = recorder;
  const audioEngine = useTerminalAudioEngine();
  const speechTimeline = useSpeechTimeline({
    audioEngine,
    onPlaybackComplete: () => setStatus('IDLE'),
  });
  const {
    visibleReplyText,
    mouthOpenRef,
    mouthFormRef,
    avatarVisemeTrackRef,
    avatarSpeechSegmentsRef,
    avatarSpeechTimeRef,
    avatarSpeakingRef,
  } = speechTimeline;

  const mergeCurrentResponse = (patch: Partial<AgentResponse>) => {
    const normalizedPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Partial<AgentResponse>;

    setCurrentResponse((previous) => {
      const nextResponse = {
        transcript: previous?.transcript ?? '',
        replyText: previous?.replyText ?? '',
        ...previous,
        ...normalizedPatch,
      };
      const nextAction = deriveLive2DAction(
        nextResponse.replyText,
        nextResponse.emotionMode,
        nextResponse.actionCard,
        normalizedPatch.live2dAction,
      );

      return {
        ...nextResponse,
        live2dAction: nextAction,
      };
    });
  };

  const flushScheduledAudio = () => {
    audioEngine.stopAll();
    speechTimeline.resetPlayback();
  };

  const scheduleAudioChunk = async (metadata: AudioChunkMetadata, pcmBytes: ArrayBuffer) => {
    const scheduledChunk = await audioEngine.schedulePcmChunk(
      metadata,
      pcmBytes,
      speechTimeline.maybeFinishPlayback,
    );
    if (!scheduledChunk) {
      return;
    }

    speechTimeline.attachScheduledChunk(metadata, scheduledChunk.startAt);
    setStatus('SPEAKING');
    speechTimeline.startPresentation();
  };
  const handleServerMessage = (data: ServerSocketMessage) => {
    switch (data.type) {
      case 'STATUS_UPDATE':
        setStatus(data.status);
        return;
      case 'TEXT_STREAM_START':
        speechTimeline.resetText();
        speechTimeline.updateReplyText(data.payload.replyText);
        mergeCurrentResponse({
          transcript: data.payload.transcript,
          replyText: data.payload.replyText,
          emotionMode: data.payload.emotionMode,
          actionCard: data.payload.actionCard,
          live2dAction: data.payload.live2dAction,
          videoUrl: null,
        });
        return;
      case 'TEXT_STREAM_DELTA':
        speechTimeline.updateReplyText(data.payload.replyText);
        mergeCurrentResponse({ replyText: data.payload.replyText });
        return;
      case 'AGENT_STATE_DELTA':
        mergeCurrentResponse({
          emotionMode: data.payload.emotionMode,
          actionCard: data.payload.actionCard,
          live2dAction: data.payload.live2dAction,
        });
        return;
      case 'USER_EMOTION_ANALYSIS':
        mergeCurrentResponse({
          userEmotionAnalysis: data.payload,
        });
        return;
      case 'TEXT_STREAM_END':
        speechTimeline.updateReplyText(data.payload.replyText);
        mergeCurrentResponse({
          replyText: data.payload.replyText,
          emotionMode: data.payload.emotionMode,
          actionCard: data.payload.actionCard,
          live2dAction: data.payload.live2dAction,
        });
        return;
      case 'AUDIO_STREAM_START':
        if (
          speechTimeline.getCurrentStreamId()
          && speechTimeline.getCurrentStreamId() !== data.payload.streamId
        ) {
          flushScheduledAudio();
        }

        speechTimeline.beginStream(data.payload.streamId);
        setStatus('SPEAKING');
        return;
      case 'AUDIO_STREAM_END':
        speechTimeline.markStreamEnded();
        return;
      case 'AGENT_REPLY':
        if (data.payload.replyText) {
          speechTimeline.updateReplyText(data.payload.replyText);
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
  };

  const handleBinaryMessage = async (packet: ArrayBuffer) => {
    let decodedPacket: ReturnType<typeof unpackBinaryPacket>;
    try {
      decodedPacket = unpackBinaryPacket(packet);
    } catch (error) {
      console.error('无效 AUDIO_CHUNK binary packet，已忽略:', error);
      return;
    }
    await scheduleAudioChunk(decodedPacket.metadata, decodedPacket.payload);
  };

  const transport = useTerminalTransport({
    wsUrl,
    onJsonMessage: handleServerMessage,
    onBinaryMessage: handleBinaryMessage,
  });
  const startRecording = () => recorder.startRecording({
    beforeStart: audioEngine.prime,
    onStarted: () => setStatus('LISTENING'),
    onSettled: () => setStatus('IDLE'),
    onCompleted: ({ audioBlob, emotionContext }) => {
      if (transport.isOpen()) {
        flushScheduledAudio();
        if (emotionContext) {
          transport.sendJson({
            type: 'USER_EMOTION_CONTEXT',
            payload: emotionContext,
          });
        }
        transport.sendBinary(audioBlob);
        setStatus('THINKING');
      } else {
        setStatus('IDLE');
      }
    },
  });

  const stopRecording = () => {
    recorder.stopRecording();
  };

  useEffect(() => {
    return () => {
      transport.close();
      flushScheduledAudio();
      speechTimeline.resetText();
      recorder.cancelRecording();
      void audioEngine.close();
    };
  }, [wsUrl]);
  const sendTextInput = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) {
      return false;
    }

    if (!transport.isOpen()) {
      console.warn('WebSocket 尚未连接，忽略本次文本调试请求');
      return false;
    }

    await audioEngine.prime();
    flushScheduledAudio();
    setStatus('THINKING');
    transport.sendJson({
      type: 'TEXT_INPUT',
      text: cleanText,
    });
    return true;
  };

  const resetTerminal = () => {
    recorder.cancelRecording();
    flushScheduledAudio();
    speechTimeline.resetText();
    setStatus('IDLE');
    setCurrentResponse(null);
  };

  return {
    status,
    currentResponse,
    visibleReplyText,
    mouthOpenRef,
    mouthFormRef,
    avatarVisemeTrackRef,
    avatarSpeechSegmentsRef,
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

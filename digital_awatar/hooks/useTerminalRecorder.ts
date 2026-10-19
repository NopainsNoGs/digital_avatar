import { useRef } from 'react';

import { useUserMultimodalCapture } from '@/hooks/useUserMultimodalCapture';
import type { ClientEmotionContextPayload } from '@/types/terminal';

const MIN_RECORDING_DURATION_MS = 350;
const MIN_AUDIO_BLOB_BYTES = 256;

export interface CompletedTerminalRecording {
  audioBlob: Blob;
  emotionContext: ClientEmotionContextPayload | null;
}

interface StartTerminalRecordingOptions {
  beforeStart: () => Promise<void>;
  onStarted: () => void;
  onSettled: () => void;
  onCompleted: (recording: CompletedTerminalRecording) => void;
}

export function useTerminalRecorder() {
  const {
    cameraVideoRef,
    captureState,
    captureError,
    liveUserEmotion,
    startCapture,
    stopCapture,
  } = useUserMultimodalCapture();

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingIntentRef = useRef(false);
  const recordingStartPendingRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);

  const startRecording = async ({
    beforeStart,
    onStarted,
    onSettled,
    onCompleted,
  }: StartTerminalRecordingOptions) => {
    if (
      recordingIntentRef.current
      || recordingStartPendingRef.current
      || mediaRecorder.current !== null
    ) {
      return;
    }

    recordingIntentRef.current = true;
    recordingStartPendingRef.current = true;
    recordingStartedAtRef.current = null;
    discardRecordingRef.current = false;
    audioChunks.current = [];

    try {
      await beforeStart();
      if (!recordingIntentRef.current) {
        await stopCapture();
        onSettled();
        return;
      }

      const recordingStream = await startCapture();
      if (!recordingIntentRef.current) {
        recordingStream.getTracks().forEach((track) => track.stop());
        await stopCapture();
        onSettled();
        return;
      }

      const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = preferredMimeType
        ? new MediaRecorder(recordingStream, { mimeType: preferredMimeType })
        : new MediaRecorder(recordingStream);
      mediaRecorder.current = recorder;
      audioChunks.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const recordingStoppedAt = performance.now();
        const recordingStartedAt = recordingStartedAtRef.current;
        const recordingDurationMs = recordingStartedAt === null
          ? 0
          : Math.max(0, recordingStoppedAt - recordingStartedAt);
        const recordedChunks = audioChunks.current;
        audioChunks.current = [];

        try {
          const emotionContext = await stopCapture();
          const audioBlob = new Blob(recordedChunks, { type: preferredMimeType || 'audio/webm' });

          if (discardRecordingRef.current) {
            onSettled();
            return;
          }

          if (
            recordingDurationMs < MIN_RECORDING_DURATION_MS
            || audioBlob.size < MIN_AUDIO_BLOB_BYTES
          ) {
            console.warn('recording rejected: too short', {
              durationMs: Math.round(recordingDurationMs),
              blobBytes: audioBlob.size,
            });
            onSettled();
            return;
          }

          onCompleted({ audioBlob, emotionContext });
        } catch (error) {
          console.error('录音结束处理失败:', error);
          onSettled();
        } finally {
          recorder.ondataavailable = null;
          recorder.onstop = null;
          if (mediaRecorder.current === recorder) {
            mediaRecorder.current = null;
          }
          audioChunks.current = [];
          recordingIntentRef.current = false;
          recordingStartPendingRef.current = false;
          recordingStartedAtRef.current = null;
          discardRecordingRef.current = false;
        }
      };

      recorder.start();
      recordingStartedAtRef.current = performance.now();
      onStarted();
    } catch (error) {
      const wasCancelled = !recordingIntentRef.current;
      recordingIntentRef.current = false;
      recordingStartedAtRef.current = null;
      audioChunks.current = [];
      mediaRecorder.current = null;
      await stopCapture();
      onSettled();

      if (!wasCancelled) {
        console.error('录音或多模态采集启动失败:', error);
        alert('请允许浏览器使用麦克风；如需表情识别，还需要允许摄像头权限。');
      }
    } finally {
      recordingStartPendingRef.current = false;
    }
  };

  const stopRecording = () => {
    recordingIntentRef.current = false;
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
    }
  };

  const cancelRecording = () => {
    recordingIntentRef.current = false;
    discardRecordingRef.current = true;
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
    } else {
      audioChunks.current = [];
      recordingStartedAtRef.current = null;
      mediaRecorder.current = null;
      void stopCapture();
    }
  };

  return {
    cameraVideoRef,
    captureState,
    captureError,
    liveUserEmotion,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

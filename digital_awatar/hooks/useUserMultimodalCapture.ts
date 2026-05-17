import { useEffect, useRef, useState } from 'react';
import type { ClientEmotionContextPayload, EmotionScores, LiveUserEmotion } from '@/types/terminal';
import {
  accumulateEmotionScores,
  buildClientEmotionContextPayload,
  createEmotionScores,
  createProsodyAccumulator,
  inferFacialEmotionFromLandmarks,
  summarizeFacialEmotion,
  summarizeProsodyEmotion,
  updateProsodyAccumulator,
} from '@/lib/multimodalEmotion';

type CaptureState = 'idle' | 'preparing' | 'recording' | 'fallback-audio' | 'error';

type FaceMeshInstance = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (handler: (results: { multiFaceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>> }) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => Promise<void>;
};

type BrowserWindow = Window & typeof globalThis & {
  FaceMesh?: new (config: { locateFile: (file: string) => string }) => FaceMeshInstance;
  webkitAudioContext?: typeof AudioContext;
};

const FACE_MESH_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';

export function useUserMultimodalCapture() {
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<FaceMeshInstance | null>(null);
  const faceMeshPromiseRef = useRef<Promise<FaceMeshInstance | null> | null>(null);
  const faceLoopFrameRef = useRef<number | null>(null);
  const faceProcessingRef = useRef(false);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micLoopFrameRef = useRef<number | null>(null);
  const faceScoreTotalRef = useRef<EmotionScores>(createEmotionScores());
  const faceSampleCountRef = useRef(0);
  const prosodyAccumulatorRef = useRef(createProsodyAccumulator());
  const prosodyBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const captureStartedAtRef = useRef<number | null>(null);
  const liveUpdateTickRef = useRef(0);
  const isCapturingRef = useRef(false);

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [captureError, setCaptureError] = useState('');
  const [liveUserEmotion, setLiveUserEmotion] = useState<LiveUserEmotion | null>(null);

  const stopFaceLoop = () => {
    if (faceLoopFrameRef.current !== null) {
      cancelAnimationFrame(faceLoopFrameRef.current);
      faceLoopFrameRef.current = null;
    }
  };

  const stopMicLoop = () => {
    if (micLoopFrameRef.current !== null) {
      cancelAnimationFrame(micLoopFrameRef.current);
      micLoopFrameRef.current = null;
    }
  };

  const resetAggregators = () => {
    faceScoreTotalRef.current = createEmotionScores();
    faceSampleCountRef.current = 0;
    prosodyAccumulatorRef.current = createProsodyAccumulator();
    prosodyBufferRef.current = null;
    liveUpdateTickRef.current = 0;
    captureStartedAtRef.current = null;
    setLiveUserEmotion(null);
  };

  const loadScript = async (src: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (document.querySelector(`script[src="${src}"]`)) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`加载脚本失败: ${src}`));
      document.head.appendChild(script);
    });
  };

  const ensureFaceMesh = async () => {
    if (typeof window === 'undefined') {
      return null;
    }

    if (faceMeshRef.current) {
      return faceMeshRef.current;
    }

    if (faceMeshPromiseRef.current) {
      return faceMeshPromiseRef.current;
    }

    faceMeshPromiseRef.current = (async () => {
      await loadScript(FACE_MESH_SCRIPT_URL);

      const FaceMeshCtor = (window as BrowserWindow).FaceMesh;
      if (!FaceMeshCtor) {
        return null;
      }

      const faceMesh = new FaceMeshCtor({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults((results) => {
        const landmarks = results.multiFaceLandmarks?.[0];
        if (!landmarks || landmarks.length === 0) {
          return;
        }

        const facialEmotion = inferFacialEmotionFromLandmarks(landmarks);
        accumulateEmotionScores(faceScoreTotalRef.current, facialEmotion.scores);
        faceSampleCountRef.current += 1;

        if (faceSampleCountRef.current % 3 === 0) {
          const summarized = summarizeFacialEmotion(faceScoreTotalRef.current, faceSampleCountRef.current);
          if (summarized) {
            setLiveUserEmotion((previous) => ({
              ...previous,
              facialEmotion: summarized,
            }));
          }
        }
      });

      faceMeshRef.current = faceMesh;
      return faceMesh;
    })();

    return faceMeshPromiseRef.current;
  };

  const attachPreview = async (stream: MediaStream) => {
    const videoElement = cameraVideoRef.current;
    if (!videoElement || stream.getVideoTracks().length === 0) {
      return;
    }

    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.playsInline = true;

    try {
      await videoElement.play();
    } catch (error) {
      console.warn('摄像头预览启动失败:', error);
    }
  };

  const startFaceLoop = async () => {
    const stream = activeStreamRef.current;
    const videoElement = cameraVideoRef.current;
    if (!stream || !videoElement || stream.getVideoTracks().length === 0) {
      return;
    }

    const faceMesh = await ensureFaceMesh();
    if (!faceMesh) {
      setCaptureError('面部识别模型加载失败，已退回到仅语音与文本情绪判别');
      return;
    }

    const tick = () => {
      if (!isCapturingRef.current) {
        stopFaceLoop();
        return;
      }

      if (videoElement.readyState >= 2 && !faceProcessingRef.current) {
        faceProcessingRef.current = true;
        void faceMesh.send({ image: videoElement })
          .catch((error: unknown) => {
            console.warn('面部识别单帧处理失败:', error);
          })
          .finally(() => {
            faceProcessingRef.current = false;
          });
      }

      faceLoopFrameRef.current = requestAnimationFrame(tick);
    };

    faceLoopFrameRef.current = requestAnimationFrame(tick);
  };

  const startProsodyLoop = async (stream: MediaStream) => {
    if (typeof window === 'undefined') {
      return;
    }

    const AudioContextCtor = window.AudioContext ?? (window as BrowserWindow).webkitAudioContext;
    if (!AudioContextCtor) {
      setCaptureError('当前浏览器不支持录音时的实时声学分析');
      return;
    }

    const audioContext = new AudioContextCtor();
    const analyserNode = audioContext.createAnalyser();
    const sourceNode = audioContext.createMediaStreamSource(stream);

    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.75;

    sourceNode.connect(analyserNode);

    micAudioContextRef.current = audioContext;
    micAnalyserRef.current = analyserNode;
    prosodyBufferRef.current = new Uint8Array(analyserNode.fftSize);

    const tick = () => {
      if (!isCapturingRef.current || !micAnalyserRef.current || !prosodyBufferRef.current) {
        stopMicLoop();
        return;
      }

      micAnalyserRef.current.getByteTimeDomainData(prosodyBufferRef.current);
      updateProsodyAccumulator(prosodyAccumulatorRef.current, prosodyBufferRef.current);

      liveUpdateTickRef.current += 1;
      if (liveUpdateTickRef.current % 6 === 0) {
        const prosodyEmotion = summarizeProsodyEmotion(prosodyAccumulatorRef.current);
        if (prosodyEmotion) {
          setLiveUserEmotion((previous) => ({
            ...previous,
            prosodyEmotion,
          }));
        }
      }

      micLoopFrameRef.current = requestAnimationFrame(tick);
    };

    micLoopFrameRef.current = requestAnimationFrame(tick);
  };

  const startCapture = async () => {
    if (typeof window === 'undefined') {
      throw new Error('当前环境不支持浏览器媒体采集');
    }

    await stopCapture();
    resetAggregators();
    setCaptureError('');
    setCaptureState('preparing');

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 360 },
        },
      });
    } catch (error) {
      console.warn('音视频联合采集失败，尝试回退为仅音频:', error);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setCaptureError('摄像头不可用，当前回合仅使用语音腔调和文本进行情绪融合');
    }

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      setCaptureState('error');
      throw new Error('未获取到麦克风音轨');
    }

    activeStreamRef.current = stream;
    isCapturingRef.current = true;
    captureStartedAtRef.current = performance.now();

    await attachPreview(stream);
    await startProsodyLoop(stream);
    void startFaceLoop();

    setCaptureState(stream.getVideoTracks().length > 0 ? 'recording' : 'fallback-audio');

    return new MediaStream(stream.getAudioTracks());
  };

  const stopCapture = async (): Promise<ClientEmotionContextPayload | null> => {
    isCapturingRef.current = false;
    stopFaceLoop();
    stopMicLoop();

    const captureDurationMs = captureStartedAtRef.current === null ? undefined : performance.now() - captureStartedAtRef.current;
    const facialEmotion = summarizeFacialEmotion(faceScoreTotalRef.current, faceSampleCountRef.current);
    const prosodyEmotion = summarizeProsodyEmotion(prosodyAccumulatorRef.current);
    const contextPayload = buildClientEmotionContextPayload({
      facialEmotion,
      prosodyEmotion,
      captureDurationMs,
    });

    if (micAudioContextRef.current && micAudioContextRef.current.state !== 'closed') {
      await micAudioContextRef.current.close().catch(() => undefined);
    }

    micAudioContextRef.current = null;
    micAnalyserRef.current = null;

    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause();
      cameraVideoRef.current.srcObject = null;
    }

    setCaptureState('idle');
    return contextPayload;
  };

  useEffect(() => {
    return () => {
      void stopCapture();
    };
  }, []);

  return {
    cameraVideoRef,
    captureState,
    captureError,
    liveUserEmotion,
    startCapture,
    stopCapture,
  };
}

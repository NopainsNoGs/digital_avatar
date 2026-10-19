import { useRef } from 'react';

import type { AudioChunkMetadata } from '@/types/terminalProtocol';

type LatencyAwareAudioContext = AudioContext & {
    baseLatency?: number;
    outputLatency?: number;
};

type BrowserAudioContext = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export interface ScheduledPcmChunk {
    startAt: number;
    duration: number;
    endAt: number;
}

const DEFAULT_LIP_SYNC_EXTRA_DELAY_SEC = 0;
const MAX_LIP_SYNC_DELAY_SEC = 0.16;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function resolveLipSyncExtraDelaySec() {
    const configuredDelay = Number(process.env.NEXT_PUBLIC_AVATAR_LIP_SYNC_DELAY_SEC);
    return Number.isFinite(configuredDelay) && configuredDelay >= 0
        ? configuredDelay
        : DEFAULT_LIP_SYNC_EXTRA_DELAY_SEC;
}

function resolveAudibleOutputDelaySec(audioContext: AudioContext) {
    const latencyAwareContext = audioContext as LatencyAwareAudioContext;
    const baseLatency = Number.isFinite(latencyAwareContext.baseLatency)
        ? Number(latencyAwareContext.baseLatency)
        : 0;
    const outputLatency = Number.isFinite(latencyAwareContext.outputLatency)
        ? Number(latencyAwareContext.outputLatency)
        : 0;

    return clamp(baseLatency + outputLatency + resolveLipSyncExtraDelaySec(), 0, MAX_LIP_SYNC_DELAY_SEC);
}

function resolveLipSyncTime(audioContext: AudioContext) {
    return Math.max(0, audioContext.currentTime + resolveAudibleOutputDelaySec(audioContext));
}

function pcm16ToFloat32(pcmBytes: ArrayBuffer): Float32Array {
    const pcmView = new Int16Array(pcmBytes);
    const float32 = new Float32Array(pcmView.length);
    for (let index = 0; index < pcmView.length; index += 1) {
        float32[index] = pcmView[index] / 32768;
    }
    return float32;
}

export function useTerminalAudioEngine() {
    const audioContextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const playbackCursorRef = useRef(0);
    const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    const ensureReady = async () => {
        if (typeof window === 'undefined') {
            return null;
        }

        if (!audioContextRef.current) {
            const AudioContextCtor = window.AudioContext ?? (window as BrowserAudioContext).webkitAudioContext;
            if (!AudioContextCtor) {
                throw new Error('当前浏览器不支持 Web Audio API');
            }

            const audioContext = new AudioContextCtor();
            const masterGain = audioContext.createGain();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            masterGain.gain.value = 1.0;
            masterGain.connect(analyser);
            analyser.connect(audioContext.destination);

            audioContextRef.current = audioContext;
            masterGainRef.current = masterGain;
            analyserRef.current = analyser;
            playbackCursorRef.current = audioContext.currentTime;
        }

        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        return audioContextRef.current;
    };

    const prime = async () => {
        const audioContext = await ensureReady();
        if (!audioContext || !masterGainRef.current) {
            return;
        }

        const silentBuffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
        const source = audioContext.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(masterGainRef.current);
        source.start(0);
    };

    const schedulePcmChunk = async (
        metadata: Pick<AudioChunkMetadata, 'channels' | 'sampleRate'>,
        pcmBuffer: ArrayBuffer,
        onEnded: () => void,
    ): Promise<ScheduledPcmChunk | null> => {
        const audioContext = await ensureReady();
        if (!audioContext || !masterGainRef.current) {
            return null;
        }

        const channelData = pcm16ToFloat32(pcmBuffer);
        const audioBuffer = audioContext.createBuffer(
            metadata.channels,
            channelData.length,
            metadata.sampleRate,
        );
        audioBuffer.getChannelData(0).set(channelData);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(masterGainRef.current);

        const startAt = Math.max(audioContext.currentTime + 0.03, playbackCursorRef.current);
        source.start(startAt);
        playbackCursorRef.current = startAt + audioBuffer.duration;
        activeSourcesRef.current.add(source);
        source.onended = () => {
            activeSourcesRef.current.delete(source);
            onEnded();
        };

        return {
            startAt,
            duration: audioBuffer.duration,
            endAt: startAt + audioBuffer.duration,
        };
    };

    const stopAll = () => {
        for (const source of activeSourcesRef.current) {
            try {
                source.stop();
            } catch {
                // The source may already have finished.
            }
        }
        activeSourcesRef.current.clear();
        if (audioContextRef.current) {
            playbackCursorRef.current = audioContextRef.current.currentTime;
        }
    };

    const resetPlaybackCursor = () => {
        playbackCursorRef.current = audioContextRef.current?.currentTime ?? 0;
    };

    const close = async () => {
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            await audioContextRef.current.close();
        }
    };

    const getAudibleTime = () => {
        if (!audioContextRef.current) {
            return null;
        }
        return resolveLipSyncTime(audioContextRef.current);
    };

    const hasActiveSources = () => activeSourcesRef.current.size > 0;

    const hasPendingAudibleOutput = () => {
        if (!audioContextRef.current) {
            return false;
        }
        return resolveLipSyncTime(audioContextRef.current) < playbackCursorRef.current - 0.02;
    };

    const getAnalyser = () => analyserRef.current;

    return {
        ensureReady,
        prime,
        schedulePcmChunk,
        stopAll,
        close,
        resetPlaybackCursor,
        getAudibleTime,
        hasActiveSources,
        hasPendingAudibleOutput,
        getAnalyser,
    };
}

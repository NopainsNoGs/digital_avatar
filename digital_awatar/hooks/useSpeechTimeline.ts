import { useRef, useState } from 'react';

import type { AudioChunkMetadata } from '@/types/terminalProtocol';
import type { AvatarSpeechSegmentTiming } from '@/types/avatar';
import type { VisemeFrame } from '@/types/terminal';

interface ScheduledVisemeFrame extends VisemeFrame {
    at: number;
    endAt: number;
}

interface SpeechTimelineAudioEngine {
    getAudibleTime: () => number | null;
    getAnalyser: () => AnalyserNode | null;
    hasActiveSources: () => boolean;
    hasPendingAudibleOutput: () => boolean;
    resetPlaybackCursor: () => void;
}

interface UseSpeechTimelineOptions {
    audioEngine: SpeechTimelineAudioEngine;
    onPlaybackComplete: () => void;
}

const SUBTITLE_REVEAL_CHARS_PER_SEC = 7;
const SUBTITLE_REVEAL_CATCHUP_CHARS_PER_SEC = 18;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
    return clamp(value, 0, 1);
}

function lerp(from: number, to: number, progress: number) {
    return from + (to - from) * progress;
}

export function useSpeechTimeline({
    audioEngine,
    onPlaybackComplete,
}: UseSpeechTimelineOptions) {
    const [visibleReplyText, setVisibleReplyText] = useState('');

    const currentStreamIdRef = useRef<string | null>(null);
    const serverStreamEndedRef = useRef(false);
    const mouthLoopFrameRef = useRef<number | null>(null);
    const mouthOpenRef = useRef(0);
    const mouthFormRef = useRef(0);
    const visemeFramesRef = useRef<ScheduledVisemeFrame[]>([]);
    const visemeCursorRef = useRef(0);
    const streamHasVisemeRef = useRef(false);
    const avatarVisemeTrackRef = useRef<VisemeFrame[]>([]);
    const avatarSpeechSegmentsRef = useRef<AvatarSpeechSegmentTiming[]>([]);
    const avatarSpeechTimeRef = useRef(0);
    const avatarSpeechStartAtRef = useRef<number | null>(null);
    const avatarSpeakingRef = useRef(false);
    const bufferedReplyTextRef = useRef('');
    const visibleReplyLengthRef = useRef(0);
    const subtitleLoopFrameRef = useRef<number | null>(null);
    const subtitleLastTickAtRef = useRef<number | null>(null);
    const subtitleUnlockedRef = useRef(false);

    const stopSubtitleReveal = () => {
        if (subtitleLoopFrameRef.current !== null) {
            cancelAnimationFrame(subtitleLoopFrameRef.current);
            subtitleLoopFrameRef.current = null;
        }
        subtitleLastTickAtRef.current = null;
    };

    const resetText = () => {
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

    const updateReplyText = (nextText: string) => {
        bufferedReplyTextRef.current = nextText;

        if (!subtitleUnlockedRef.current) {
            return;
        }

        const visibleLength = visibleReplyLengthRef.current;
        setVisibleReplyText(nextText.slice(0, Math.min(visibleLength, nextText.length)));
    };

    const flushVisibleReplyText = () => {
        visibleReplyLengthRef.current = bufferedReplyTextRef.current.length;
        setVisibleReplyText(bufferedReplyTextRef.current);
    };

    const stopMouthMonitor = () => {
        if (mouthLoopFrameRef.current !== null) {
            cancelAnimationFrame(mouthLoopFrameRef.current);
            mouthLoopFrameRef.current = null;
        }
        avatarSpeechTimeRef.current = 0;
        avatarSpeakingRef.current = false;
        mouthOpenRef.current = 0;
        mouthFormRef.current = 0;
    };

    const completePlayback = () => {
        audioEngine.resetPlaybackCursor();
        currentStreamIdRef.current = null;
        avatarSpeechStartAtRef.current = null;
        avatarSpeakingRef.current = false;
        flushVisibleReplyText();
        stopSubtitleReveal();
        stopMouthMonitor();
        onPlaybackComplete();
    };

    const maybeFinishPlayback = () => {
        if (!serverStreamEndedRef.current) {
            return;
        }
        if (audioEngine.hasActiveSources() || audioEngine.hasPendingAudibleOutput()) {
            return;
        }
        completePlayback();
    };

    const startSubtitleReveal = () => {
        subtitleUnlockedRef.current = true;
        if (subtitleLoopFrameRef.current !== null) {
            return;
        }

        const tick = (timestamp: number) => {
            const targetText = bufferedReplyTextRef.current;
            const previousTimestamp = subtitleLastTickAtRef.current ?? timestamp;
            const elapsedMs = Math.max(0, timestamp - previousTimestamp);
            subtitleLastTickAtRef.current = timestamp;

            if (visibleReplyLengthRef.current < targetText.length) {
                const charsPerSecond = serverStreamEndedRef.current
                    ? SUBTITLE_REVEAL_CATCHUP_CHARS_PER_SEC
                    : SUBTITLE_REVEAL_CHARS_PER_SEC;
                const nextLength = Math.min(
                    targetText.length,
                    visibleReplyLengthRef.current
                        + Math.max(1, Math.round((elapsedMs / 1000) * charsPerSecond)),
                );

                visibleReplyLengthRef.current = nextLength;
                setVisibleReplyText(targetText.slice(0, nextLength));
            }

            const hasPendingText = visibleReplyLengthRef.current < bufferedReplyTextRef.current.length;
            const shouldContinue = audioEngine.hasActiveSources()
                || (!serverStreamEndedRef.current && currentStreamIdRef.current !== null)
                || hasPendingText;
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
            const lipSyncTime = audioEngine.getAudibleTime();
            if (lipSyncTime === null) {
                stopMouthMonitor();
                return;
            }

            if (avatarSpeechStartAtRef.current !== null) {
                avatarSpeechTimeRef.current = Math.max(
                    0,
                    lipSyncTime - avatarSpeechStartAtRef.current,
                );
            } else {
                avatarSpeechTimeRef.current = 0;
            }

            if (streamHasVisemeRef.current && visemeFramesRef.current.length > 0) {
                const frames = visemeFramesRef.current;
                let cursor = visemeCursorRef.current;
                while (cursor + 1 < frames.length && frames[cursor + 1].at <= lipSyncTime) {
                    cursor += 1;
                }
                visemeCursorRef.current = cursor;

                const currentFrame = frames[cursor];
                const nextFrame = frames[cursor + 1];
                const isActiveFrame = currentFrame !== undefined
                    && lipSyncTime >= currentFrame.at - 0.01
                    && lipSyncTime <= currentFrame.endAt + 0.02;

                if (isActiveFrame) {
                    const frameSpan = nextFrame
                        ? Math.max(nextFrame.at - currentFrame.at, 1e-3)
                        : 1;
                    const progress = nextFrame
                        ? clamp01((lipSyncTime - currentFrame.at) / frameSpan)
                        : 0;
                    mouthOpenRef.current = nextFrame
                        ? lerp(currentFrame.y, nextFrame.y, progress)
                        : currentFrame.y;
                    mouthFormRef.current = nextFrame
                        ? lerp(currentFrame.f, nextFrame.f, progress)
                        : currentFrame.f;
                } else {
                    mouthOpenRef.current = 0;
                    mouthFormRef.current = 0;
                }

                if (cursor > 120) {
                    visemeFramesRef.current = frames.slice(cursor - 1);
                    visemeCursorRef.current = 1;
                }
            } else {
                const analyser = audioEngine.getAnalyser();
                if (analyser) {
                    const samples = new Uint8Array(analyser.fftSize);
                    analyser.getByteTimeDomainData(samples);
                    let energy = 0;
                    for (let index = 0; index < samples.length; index += 1) {
                        const centered = (samples[index] - 128) / 128;
                        energy += centered * centered;
                    }

                    const rms = Math.sqrt(energy / samples.length);
                    mouthOpenRef.current = Math.min(rms * 4.5, 1);
                    mouthFormRef.current = 0;
                }
            }

            const pendingViseme = streamHasVisemeRef.current
                && visemeFramesRef.current.some((frame) => frame.endAt >= lipSyncTime - 0.05);
            const pendingOutput = audioEngine.hasPendingAudibleOutput();
            const shouldContinue = audioEngine.hasActiveSources()
                || (!serverStreamEndedRef.current && currentStreamIdRef.current !== null)
                || pendingOutput
                || pendingViseme;
            avatarSpeakingRef.current = shouldContinue;
            if (!shouldContinue) {
                if (serverStreamEndedRef.current && !audioEngine.hasActiveSources()) {
                    completePlayback();
                } else {
                    stopMouthMonitor();
                }
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
        visemeFps: number,
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

    const attachScheduledChunk = (
        metadata: AudioChunkMetadata,
        startAt: number,
    ) => {
        if (avatarSpeechStartAtRef.current === null) {
            avatarSpeechStartAtRef.current = startAt;
        }
        const relativeStartSec = Math.max(
            0,
            startAt - avatarSpeechStartAtRef.current,
        );
        avatarSpeakingRef.current = true;
        if (
            metadata.segmentStart
            && typeof metadata.segmentIndex === 'number'
            && metadata.segmentText
            && !avatarSpeechSegmentsRef.current.some((segment) => segment.index === metadata.segmentIndex)
        ) {
            avatarSpeechSegmentsRef.current.push({
                index: metadata.segmentIndex,
                text: metadata.segmentText,
                startTime: relativeStartSec,
            });
        }
        if (metadata.visemeChunk && metadata.visemeChunk.length > 0) {
            mouthOpenRef.current = clamp01(metadata.visemeChunk[0]?.y ?? mouthOpenRef.current);
            mouthFormRef.current = clamp(
                metadata.visemeChunk[0]?.f ?? mouthFormRef.current,
                -1,
                1,
            );
        }
        scheduleVisemeChunk(
            metadata.visemeChunk,
            startAt,
            metadata.chunkDurationSec,
            relativeStartSec,
            metadata.visemeFps ?? 60,
        );
    };

    const startPresentation = () => {
        startSubtitleReveal();
        startMouthMonitor();
    };

    const getCurrentStreamId = () => currentStreamIdRef.current;

    const beginStream = (streamId: string) => {
        currentStreamIdRef.current = streamId;
        serverStreamEndedRef.current = false;
        streamHasVisemeRef.current = false;
        visemeFramesRef.current = [];
        visemeCursorRef.current = 0;
        avatarVisemeTrackRef.current = [];
        avatarSpeechSegmentsRef.current = [];
        avatarSpeechTimeRef.current = 0;
        avatarSpeechStartAtRef.current = null;
        avatarSpeakingRef.current = true;
    };

    const markStreamEnded = () => {
        serverStreamEndedRef.current = true;
        maybeFinishPlayback();
    };

    const resetPlayback = () => {
        currentStreamIdRef.current = null;
        serverStreamEndedRef.current = false;
        streamHasVisemeRef.current = false;
        visemeFramesRef.current = [];
        visemeCursorRef.current = 0;
        avatarVisemeTrackRef.current = [];
        avatarSpeechSegmentsRef.current = [];
        avatarSpeechTimeRef.current = 0;
        avatarSpeechStartAtRef.current = null;
        avatarSpeakingRef.current = false;
        resetSubtitleDisplay();
        stopMouthMonitor();
    };

    return {
        visibleReplyText,
        mouthOpenRef,
        mouthFormRef,
        avatarVisemeTrackRef,
        avatarSpeechSegmentsRef,
        avatarSpeechTimeRef,
        avatarSpeakingRef,
        getCurrentStreamId,
        beginStream,
        updateReplyText,
        resetText,
        markStreamEnded,
        attachScheduledChunk,
        startPresentation,
        maybeFinishPlayback,
        resetPlayback,
    };
}

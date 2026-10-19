import type { MutableRefObject } from 'react';

import type { EmotionMode, TerminalState, VisemeFrame } from '@/types/terminal';

export type AvatarRendererKind = 'live2d' | 'vrm';

export type AvatarGesture =
  | 'explain'
  | 'point'
  | 'comfort'
  | 'alert'
  | 'confirm';

export type AvatarEmotion = EmotionMode;

export type AvatarViewMode = 'full' | 'half';

export interface AvatarSpeechRuntime {
  visemeTrackRef: MutableRefObject<VisemeFrame[]>;
  segmentTimingsRef: MutableRefObject<AvatarSpeechSegmentTiming[]>;
  speechTimeRef: MutableRefObject<number>;
  speakingRef: MutableRefObject<boolean>;
  mouthOpenRef: MutableRefObject<number>;
  mouthFormRef: MutableRefObject<number>;
}

export interface AvatarSpeechSegmentTiming {
  index: number;
  text: string;
  startTime: number;
}

export interface AvatarBehavior {
  status: TerminalState;
  emotion: AvatarEmotion;
  gesture: AvatarGesture;
  replyText: string;
  speech: AvatarSpeechRuntime;
}

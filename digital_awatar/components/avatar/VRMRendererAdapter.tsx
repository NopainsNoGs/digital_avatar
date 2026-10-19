'use client';

import ThreeAvatar from '@/components/ThreeAvatar';
import type { AvatarBehavior, AvatarViewMode } from '@/types/avatar';

interface VRMRendererAdapterProps {
  behavior: AvatarBehavior;
  viewMode: AvatarViewMode;
}

export default function VRMRendererAdapter({
  behavior,
  viewMode,
}: VRMRendererAdapterProps) {
  return (
    <ThreeAvatar
      status={behavior.status}
      emotion={behavior.emotion}
      gesture={behavior.gesture}
      replyText={behavior.replyText}
      viewMode={viewMode}
      visemeTrackRef={behavior.speech.visemeTrackRef}
      speechSegmentsRef={behavior.speech.segmentTimingsRef}
      speechTimeRef={behavior.speech.speechTimeRef}
      speakingRef={behavior.speech.speakingRef}
      mouthOpenRef={behavior.speech.mouthOpenRef}
      mouthFormRef={behavior.speech.mouthFormRef}
    />
  );
}

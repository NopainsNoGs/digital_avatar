'use client';

import Live2DAvatar from '@/components/Live2DAvatar';
import type { AvatarBehavior, AvatarViewMode } from '@/types/avatar';

interface Live2DRendererAdapterProps {
  behavior: AvatarBehavior;
  viewMode: AvatarViewMode;
}

export default function Live2DRendererAdapter({
  behavior,
  viewMode,
}: Live2DRendererAdapterProps) {
  return (
    <Live2DAvatar
      status={behavior.status}
      emotion={behavior.emotion}
      replyText={behavior.replyText}
      viewMode={viewMode}
      visemeTrackRef={behavior.speech.visemeTrackRef}
      speechTimeRef={behavior.speech.speechTimeRef}
      speakingRef={behavior.speech.speakingRef}
      mouthOpenRef={behavior.speech.mouthOpenRef}
      mouthFormRef={behavior.speech.mouthFormRef}
      action={behavior.gesture}
    />
  );
}

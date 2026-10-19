'use client';

import Live2DRendererAdapter from '@/components/avatar/Live2DRendererAdapter';
import VRMRendererAdapter from '@/components/avatar/VRMRendererAdapter';
import type {
  AvatarBehavior,
  AvatarRendererKind,
  AvatarViewMode,
} from '@/types/avatar';

interface AvatarControllerProps {
  renderer: AvatarRendererKind;
  behavior: AvatarBehavior;
  viewMode: AvatarViewMode;
}

export default function AvatarController({
  renderer,
  behavior,
  viewMode,
}: AvatarControllerProps) {
  if (renderer === 'vrm') {
    return <VRMRendererAdapter behavior={behavior} viewMode={viewMode} />;
  }

  return <Live2DRendererAdapter behavior={behavior} viewMode={viewMode} />;
}

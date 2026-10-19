import type { Metadata } from 'next';
import Live2DCommercialBehaviorLab from '@/components/avatar/Live2DCommercialBehaviorLab';

export const metadata: Metadata = {
  title: 'Commercial Live2D Behavior Lab',
  description: 'Lab-only procedural gesture preview for the kefu2 Live2D rig.',
};

export default function BehaviorLabPage() {
  return <Live2DCommercialBehaviorLab />;
}

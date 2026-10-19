import type { Metadata } from 'next';
import Live2DMotionLab from '@/components/avatar/Live2DMotionLab';

export const metadata: Metadata = {
  title: 'Live2D Motion Visual Lab',
  description: 'Lab-only visual acceptance page for kefu3 semantic Live2D motions.',
};

export default function MotionLabPage() {
  return <Live2DMotionLab />;
}

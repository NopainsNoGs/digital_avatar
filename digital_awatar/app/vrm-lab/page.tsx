import type { Metadata } from 'next';
import VRMBehaviorLab from '@/components/avatar/VRMBehaviorLab';

export const metadata: Metadata = {
  title: 'VRM 3D Behavior Lab',
  description: 'Minimal visual acceptance page for the VRM renderer and semantic motions.',
};

export default function VRMLabPage() {
  return <VRMBehaviorLab />;
}

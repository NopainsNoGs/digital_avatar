// Keep the legacy model available for one-build rollback:
// NEXT_PUBLIC_VRM_MODEL=legacy npm run build
export const VRM_MODEL_VARIANT = process.env.NEXT_PUBLIC_VRM_MODEL === 'legacy'
  ? 'legacy'
  : 'airport';

export const VRM_MODEL_URL = VRM_MODEL_VARIANT === 'legacy'
  ? '/avatar/model.vrm'
  : '/awatar_airport.vrm';

export const VRM_MODEL_VERSION = VRM_MODEL_VARIANT === 'legacy' ? 'VRM0' : 'VRM1';

// Change to 'kefu2' (or set NEXT_PUBLIC_LIVE2D_MODEL=kefu2) to roll back both URL and mapping.
export const LIVE2D_MODEL = process.env.NEXT_PUBLIC_LIVE2D_MODEL === 'kefu2' ? 'kefu2' : 'kefu3';
export const LIVE2D_MODEL_URL = LIVE2D_MODEL === 'kefu2'
  ? '/wuhan/wuhan/kefu2.model3.json'
  : '/wuhan/wuhan/kefu3/kefu3.model3.json';

export const KEFU3_MOTIONS = {
  idle: { group: 'Idle', index: 0, file: 'wait.motion3.json', duration: 3.333 },
  welcome: { group: 'Welcome', index: 0, file: 'welcome.motion3.json', duration: 3.333 },
  guide_left: { group: 'GuideLeft', index: 0, file: 'guide left.motion3.json', duration: 3.3 },
  guide_right: { group: 'GuideRight', index: 0, file: 'guide right.motion3.json', duration: 3.3 },
  explain: { group: 'Explain', index: 0, file: 'explain.motion3.json', duration: 3.967 },
  confirm: { group: 'Confirm', index: 0, file: 'confirm.motion3.json', duration: 1.967 },
  comfort: { group: 'Comfort', index: 0, file: 'comfort.motion3.json', duration: 3.333 },
  alert: { group: 'Alert', index: 0, file: 'alert.motion3.json', duration: 3.333 },
  goodbye: { group: 'Goodbye', index: 0, file: 'goodbye.motion3.json', duration: 3.333 },
} as const;

export type SemanticMotion = keyof typeof KEFU3_MOTIONS;

// Legacy assets have only the empty group and five motions. Keep their original indices.
const KEFU2_INDICES: Record<SemanticMotion, number> = {
  idle: 0, welcome: 2, guide_left: 4, guide_right: 4, explain: 1,
  confirm: 3, comfort: 3, alert: 1, goodbye: 2,
};
export const MOTION_DEFINITIONS: Record<SemanticMotion, { group: string; index: number; duration: number }> = { ...KEFU3_MOTIONS };
if (LIVE2D_MODEL === 'kefu2') {
  for (const name of Object.keys(KEFU3_MOTIONS) as SemanticMotion[]) {
    MOTION_DEFINITIONS[name] = { ...KEFU3_MOTIONS[name], group: '', index: KEFU2_INDICES[name] };
  }
}

export const COMMERCIAL_PARAMETER_IDS = [
  'Param7',
  'Param8',
  'ParamAngleX',
  'ParamAngleY',
  'ParamBodyAngleX',
  'ParamEyeBallX',
  'ParamBreath',
  'ParamBrowLForm',
  'ParamBrowRForm',
] as const;

export type CommercialParameterId = (typeof COMMERCIAL_PARAMETER_IDS)[number];

export type Live2DCommercialBehavior =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'welcome'
  | 'explain'
  | 'guide_arm_side'
  | 'guide_no_arm_side'
  | 'guide_front'
  | 'confirm'
  | 'comfort'
  | 'alert'
  | 'goodbye';

export type CommercialBehaviorVariantId =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'welcome'
  | 'explain_a'
  | 'explain_b'
  | 'explain_c'
  | 'guide_arm_soft'
  | 'guide_arm_clear'
  | 'guide_no_arm_side'
  | 'guide_front'
  | 'confirm_nod'
  | 'confirm_small_arm'
  | 'comfort'
  | 'alert'
  | 'goodbye';

export type CommercialEase = 'smoothstep' | 'cubic_in_out';

export type CommercialParameterTarget = {
  parameterId: CommercialParameterId;
  value: number;
  weight: number;
};

export type BehaviorPhase = {
  duration: number;
  ease: CommercialEase;
  parameterTargets: readonly CommercialParameterTarget[];
};

export type CommercialBehaviorDefinition = {
  id: CommercialBehaviorVariantId;
  behavior: Live2DCommercialBehavior;
  label: string;
  purpose: string;
  duration: number;
  phases: readonly BehaviorPhase[];
};

export type CommercialParameterContribution = {
  value: number;
  weight: number;
};

export type CommercialBehaviorSample = Partial<
  Record<CommercialParameterId, CommercialParameterContribution>
>;

export const VERIFIED_COMMERCIAL_PARAMETER_RANGES: Readonly<
  Record<CommercialParameterId, Readonly<{ min: number; max: number }>>
> = {
  Param7: { min: 0, max: 1 },
  Param8: { min: 0, max: 1 },
  ParamAngleX: { min: -3, max: 3 },
  ParamAngleY: { min: -6, max: 3 },
  ParamBodyAngleX: { min: -5, max: 5 },
  ParamEyeBallX: { min: -0.3, max: 0.2 },
  ParamBreath: { min: 0, max: 0.5 },
  ParamBrowLForm: { min: -1, max: 1 },
  ParamBrowRForm: { min: -1, max: 1 },
};

export const STATIC_COMMERCIAL_NEUTRAL: Readonly<
  Record<CommercialParameterId, number>
> = {
  Param7: 0,
  Param8: 0,
  ParamAngleX: 0,
  ParamAngleY: 0,
  ParamBodyAngleX: 0,
  ParamEyeBallX: 0,
  ParamBreath: 0,
  ParamBrowLForm: 0,
  ParamBrowRForm: 0,
};

// The lab uses a direct, fully effective preview. Keeping this table explicit makes
// every runtime weight reviewable and avoids a hidden global blend constant.
export const COMMERCIAL_PARAMETER_PREVIEW_WEIGHTS: Readonly<
  Record<CommercialParameterId, number>
> = {
  Param7: 1,
  Param8: 1,
  ParamAngleX: 1,
  ParamAngleY: 1,
  ParamBodyAngleX: 1,
  ParamEyeBallX: 1,
  ParamBreath: 1,
  ParamBrowLForm: 1,
  ParamBrowRForm: 1,
};

function targets(
  values: Partial<Record<CommercialParameterId, number>>,
): readonly CommercialParameterTarget[] {
  return COMMERCIAL_PARAMETER_IDS.flatMap((parameterId) => {
    const value = values[parameterId];
    return value === undefined
      ? []
      : [
          {
            parameterId,
            value,
            weight: COMMERCIAL_PARAMETER_PREVIEW_WEIGHTS[parameterId],
          },
        ];
  });
}

function phase(
  duration: number,
  values: Partial<Record<CommercialParameterId, number>>,
  ease: CommercialEase = 'smoothstep',
): BehaviorPhase {
  return { duration, ease, parameterTargets: targets(values) };
}

function defineBehavior(
  definition: Omit<CommercialBehaviorDefinition, 'duration'>,
): CommercialBehaviorDefinition {
  return {
    ...definition,
    duration: definition.phases.reduce((sum, item) => sum + item.duration, 0),
  };
}

export const COMMERCIAL_BEHAVIOR_DEFINITIONS: Readonly<
  Record<CommercialBehaviorVariantId, CommercialBehaviorDefinition>
> = {
  idle: defineBehavior({
    id: 'idle',
    behavior: 'idle',
    label: 'Idle',
    purpose: 'No semantic gesture; natural behavior remains a separate owner.',
    phases: [],
  }),
  listening: defineBehavior({
    id: 'listening',
    behavior: 'listening',
    label: 'Listening',
    purpose: 'A restrained attentive inclination without an arm cue.',
    phases: [
      phase(0.5, { ParamAngleY: -0.55 }),
      phase(0.25, { ParamAngleY: -0.55 }),
      phase(0.65, {}),
    ],
  }),
  thinking: defineBehavior({
    id: 'thinking',
    behavior: 'thinking',
    label: 'Thinking',
    purpose: 'A small, stable head-and-gaze bias that reads as querying.',
    phases: [
      phase(0.55, { ParamAngleX: -0.65, ParamEyeBallX: -0.08 }),
      phase(0.35, { ParamAngleX: -0.65, ParamEyeBallX: -0.08 }),
      phase(0.6, {}),
    ],
  }),
  welcome: defineBehavior({
    id: 'welcome',
    behavior: 'welcome',
    label: 'Welcome',
    purpose: 'Professional greeting with a restrained right-side medium raise.',
    phases: [
      phase(0.55, {
        Param8: 0.36,
        ParamAngleX: -0.45,
        ParamBodyAngleX: -0.22,
        ParamBrowLForm: 0.12,
        ParamBrowRForm: 0.12,
      }),
      phase(0.3, {
        Param8: 0.36,
        ParamAngleX: -0.45,
        ParamBodyAngleX: -0.22,
        ParamBrowLForm: 0.12,
        ParamBrowRForm: 0.12,
      }),
      phase(0.75, {}),
    ],
  }),
  explain_a: defineBehavior({
    id: 'explain_a',
    behavior: 'explain',
    label: 'Explain A',
    purpose: 'Frequent, low-amplitude presentation beat.',
    phases: [
      phase(0.45, { Param8: 0.24, ParamAngleY: -0.3, ParamBodyAngleX: -0.12 }),
      phase(0.2, { Param8: 0.24, ParamAngleY: -0.3, ParamBodyAngleX: -0.12 }),
      phase(0.7, {}),
    ],
  }),
  explain_b: defineBehavior({
    id: 'explain_b',
    behavior: 'explain',
    label: 'Explain B',
    purpose: 'Arm-free head and torso emphasis for quiet speaking intervals.',
    phases: [
      phase(0.4, { ParamAngleY: -0.45, ParamBodyAngleX: 0.18 }),
      phase(0.2, { ParamAngleY: -0.45, ParamBodyAngleX: 0.18 }),
      phase(0.65, {}),
    ],
  }),
  explain_c: defineBehavior({
    id: 'explain_c',
    behavior: 'explain',
    label: 'Explain C',
    purpose: 'A clearer but still restrained coordinated presentation beat.',
    phases: [
      phase(0.55, {
        Param8: 0.33,
        ParamAngleX: -0.55,
        ParamBodyAngleX: -0.28,
        ParamEyeBallX: -0.05,
      }),
      phase(0.25, {
        Param8: 0.33,
        ParamAngleX: -0.55,
        ParamBodyAngleX: -0.28,
        ParamEyeBallX: -0.05,
      }),
      phase(0.75, {}),
    ],
  }),
  guide_arm_soft: defineBehavior({
    id: 'guide_arm_soft',
    behavior: 'guide_arm_side',
    label: 'Guide Arm Side · Soft',
    purpose: 'A calm “this way please” cue on the controllable arm side.',
    phases: [
      phase(0.6, {
        Param8: 0.52,
        ParamAngleX: -1,
        ParamBodyAngleX: -0.5,
        ParamEyeBallX: -0.12,
      }),
      phase(0.4, {
        Param8: 0.52,
        ParamAngleX: -1,
        ParamBodyAngleX: -0.5,
        ParamEyeBallX: -0.12,
      }),
      phase(0.75, {}),
    ],
  }),
  guide_arm_clear: defineBehavior({
    id: 'guide_arm_clear',
    behavior: 'guide_arm_side',
    label: 'Guide Arm Side · Clear',
    purpose: 'A clear directional cue using the verified arm-like control.',
    phases: [
      phase(0.65, {
        Param8: 0.63,
        ParamAngleX: -1.35,
        ParamBodyAngleX: -0.65,
        ParamEyeBallX: -0.16,
      }),
      phase(0.45, {
        Param8: 0.63,
        ParamAngleX: -1.35,
        ParamBodyAngleX: -0.65,
        ParamEyeBallX: -0.16,
      }),
      phase(0.8, {}),
    ],
  }),
  guide_no_arm_side: defineBehavior({
    id: 'guide_no_arm_side',
    behavior: 'guide_no_arm_side',
    label: 'Guide No-Arm Side',
    purpose: 'Opposite-side direction using head, torso, and gaze only.',
    phases: [
      phase(0.55, {
        ParamAngleX: 1.1,
        ParamAngleY: -0.3,
        ParamBodyAngleX: 0.5,
        ParamEyeBallX: 0.14,
      }),
      phase(0.35, {
        ParamAngleX: 1.1,
        ParamAngleY: -0.3,
        ParamBodyAngleX: 0.5,
        ParamEyeBallX: 0.14,
      }),
      phase(0.8, {}),
    ],
  }),
  guide_front: defineBehavior({
    id: 'guide_front',
    behavior: 'guide_front',
    label: 'Guide Front',
    purpose: 'Centered forward guidance without a lateral turn.',
    phases: [
      phase(0.55, { Param8: 0.44, ParamAngleY: -0.8, ParamBreath: 0.12 }),
      phase(0.3, { Param8: 0.44, ParamAngleY: -0.8, ParamBreath: 0.12 }),
      phase(0.8, {}),
    ],
  }),
  confirm_nod: defineBehavior({
    id: 'confirm_nod',
    behavior: 'confirm',
    label: 'Confirm · Nod',
    purpose: 'Short arm-free acknowledgement.',
    phases: [
      phase(0.3, { ParamAngleY: -0.75 }),
      phase(0.1, { ParamAngleY: -0.75 }),
      phase(0.5, {}),
    ],
  }),
  confirm_small_arm: defineBehavior({
    id: 'confirm_small_arm',
    behavior: 'confirm',
    label: 'Confirm · Small Arm',
    purpose: 'Short acknowledgement with an optional restrained arm beat.',
    phases: [
      phase(0.35, { Param8: 0.2, ParamAngleY: -0.65 }),
      phase(0.15, { Param8: 0.2, ParamAngleY: -0.65 }),
      phase(0.55, {}),
    ],
  }),
  comfort: defineBehavior({
    id: 'comfort',
    behavior: 'comfort',
    label: 'Comfort',
    purpose: 'Slow symmetric reassurance without claiming two-arm control.',
    phases: [
      phase(0.7, {
        ParamAngleY: -0.9,
        ParamBreath: 0.16,
        ParamBrowLForm: 0.18,
        ParamBrowRForm: 0.18,
      }),
      phase(0.35, {
        ParamAngleY: -0.9,
        ParamBreath: 0.16,
        ParamBrowLForm: 0.18,
        ParamBrowRForm: 0.18,
      }),
      phase(0.85, {}),
    ],
  }),
  alert: defineBehavior({
    id: 'alert',
    behavior: 'alert',
    label: 'Alert',
    purpose: 'Clear, centered attention signal using the large raise control.',
    phases: [
      phase(0.45, { Param7: 0.7, ParamAngleY: 0.4 }),
      phase(0.45, { Param7: 0.7, ParamAngleY: 0.4 }),
      phase(0.65, {}),
    ],
  }),
  goodbye: defineBehavior({
    id: 'goodbye',
    behavior: 'goodbye',
    label: 'Goodbye',
    purpose: 'Gentle send-off distinct from the welcome pose.',
    phases: [
      phase(0.45, { Param8: 0.3, ParamAngleY: -0.6 }),
      phase(0.25, { Param8: 0.3, ParamAngleY: -0.6 }),
      phase(0.7, {}),
    ],
  }),
};

export const COMMERCIAL_BEHAVIOR_VARIANTS: Readonly<
  Record<Live2DCommercialBehavior, readonly CommercialBehaviorVariantId[]>
> = {
  idle: ['idle'],
  listening: ['listening'],
  thinking: ['thinking'],
  welcome: ['welcome'],
  explain: ['explain_a', 'explain_b', 'explain_c'],
  guide_arm_side: ['guide_arm_soft', 'guide_arm_clear'],
  guide_no_arm_side: ['guide_no_arm_side'],
  guide_front: ['guide_front'],
  confirm: ['confirm_nod', 'confirm_small_arm'],
  comfort: ['comfort'],
  alert: ['alert'],
  goodbye: ['goodbye'],
};

function easeProgress(ease: CommercialEase, value: number): number {
  const t = Math.min(Math.max(value, 0), 1);
  if (ease === 'cubic_in_out') {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  return t * t * (3 - 2 * t);
}

function toTargetMap(
  parameterTargets: readonly CommercialParameterTarget[],
): Map<CommercialParameterId, CommercialParameterContribution> {
  return new Map(
    parameterTargets.map(({ parameterId, value, weight }) => [
      parameterId,
      { value, weight },
    ]),
  );
}

export function sampleCommercialBehavior(
  behavior: CommercialBehaviorDefinition | CommercialBehaviorVariantId,
  elapsedTime: number,
): CommercialBehaviorSample {
  const definition =
    typeof behavior === 'string' ? COMMERCIAL_BEHAVIOR_DEFINITIONS[behavior] : behavior;

  if (!Number.isFinite(elapsedTime) || elapsedTime <= 0 || elapsedTime >= definition.duration) {
    return {};
  }

  let phaseStart = 0;
  let previousTargets = new Map<CommercialParameterId, CommercialParameterContribution>();

  for (const currentPhase of definition.phases) {
    const phaseEnd = phaseStart + currentPhase.duration;
    const currentTargets = toTargetMap(currentPhase.parameterTargets);

    if (elapsedTime <= phaseEnd) {
      const progress =
        currentPhase.duration === 0 ? 1 : (elapsedTime - phaseStart) / currentPhase.duration;
      const eased = easeProgress(currentPhase.ease, progress);
      const parameterIds = new Set([...previousTargets.keys(), ...currentTargets.keys()]);
      const sample: CommercialBehaviorSample = {};

      parameterIds.forEach((parameterId) => {
        const from = previousTargets.get(parameterId) ?? {
          value: 0,
          weight: COMMERCIAL_PARAMETER_PREVIEW_WEIGHTS[parameterId],
        };
        const to = currentTargets.get(parameterId) ?? {
          value: 0,
          weight: from.weight,
        };
        sample[parameterId] = {
          value: from.value + (to.value - from.value) * eased,
          weight: from.weight + (to.weight - from.weight) * eased,
        };
      });

      return sample;
    }

    previousTargets = currentTargets;
    phaseStart = phaseEnd;
  }

  return {};
}

export function getCommercialBehaviorParameterIds(
  definition: CommercialBehaviorDefinition,
): readonly CommercialParameterId[] {
  const used = new Set<CommercialParameterId>();
  definition.phases.forEach((item) => {
    item.parameterTargets.forEach(({ parameterId }) => used.add(parameterId));
  });
  return COMMERCIAL_PARAMETER_IDS.filter((parameterId) => used.has(parameterId));
}

export function getCommercialBehaviorPeakArmValue(
  definition: CommercialBehaviorDefinition,
): number {
  return definition.phases.reduce((peak, item) => {
    const armPeak = item.parameterTargets.reduce((phasePeak, target) => {
      return target.parameterId === 'Param7' || target.parameterId === 'Param8'
        ? Math.max(phasePeak, target.value)
        : phasePeak;
    }, 0);
    return Math.max(peak, armPeak);
  }, 0);
}

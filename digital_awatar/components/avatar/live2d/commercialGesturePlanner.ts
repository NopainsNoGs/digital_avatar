import {
  COMMERCIAL_BEHAVIOR_DEFINITIONS,
  COMMERCIAL_BEHAVIOR_VARIANTS,
  type CommercialBehaviorVariantId,
  type Live2DCommercialBehavior,
} from './commercialBehaviors';

export type CommercialGesturePlanInput = {
  behavior: Live2DCommercialBehavior;
  speechDuration: number;
  replyText?: string;
  replyTextHash?: number;
  stableSeed?: number;
};

export type PlannedCommercialGesture = {
  behavior: Live2DCommercialBehavior;
  variantId: CommercialBehaviorVariantId;
  startTime: number;
  endTime: number;
};

const MIN_QUIET_INTERVAL = 2.4;
const EDGE_QUIET_INTERVAL = 0.35;

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function positiveUint32(value: number): number {
  return value >>> 0;
}

function mixSeed(seed: number, salt: number): number {
  let value = positiveUint32(seed ^ salt);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return positiveUint32(value ^ (value >>> 16));
}

function unitFromSeed(seed: number): number {
  return positiveUint32(seed) / 0xffffffff;
}

export function hashCommercialReplyText(replyText: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < replyText.length; index += 1) {
    hash ^= replyText.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return positiveUint32(hash);
}

export function getCommercialGestureLimit(speechDuration: number): number {
  const duration = Math.max(0, speechDuration);
  if (duration < 2) {
    return 1;
  }
  if (duration <= 5) {
    return 1;
  }
  if (duration <= 10) {
    return 2;
  }
  if (duration <= 20) {
    return 3;
  }
  return Math.floor(duration / 5);
}

function getStableSeed(input: CommercialGesturePlanInput): number {
  if (input.stableSeed !== undefined) {
    return positiveUint32(input.stableSeed);
  }
  if (input.replyTextHash !== undefined) {
    return positiveUint32(input.replyTextHash);
  }
  return hashCommercialReplyText(input.replyText ?? '');
}

function chooseVariant(
  behavior: Live2DCommercialBehavior,
  seed: number,
  index: number,
): CommercialBehaviorVariantId {
  const variants = COMMERCIAL_BEHAVIOR_VARIANTS[behavior];
  return variants[mixSeed(seed, index + 1) % variants.length];
}

function getDesiredGestureCount(
  behavior: Live2DCommercialBehavior,
  speechDuration: number,
  seed: number,
): number {
  if (behavior === 'idle' || speechDuration <= 0) {
    return 0;
  }

  if (behavior !== 'explain') {
    return 1;
  }

  if (speechDuration < 2) {
    return mixSeed(seed, 0x2f) % 2;
  }
  if (speechDuration <= 5) {
    return 1;
  }
  if (speechDuration <= 10) {
    return speechDuration >= 7.4 ? 2 : 1;
  }
  if (speechDuration <= 20) {
    return speechDuration >= 15 ? 3 : 2;
  }

  const preferredSpacing = 5 + unitFromSeed(mixSeed(seed, 0x58)) * 3;
  return Math.min(
    getCommercialGestureLimit(speechDuration),
    Math.max(1, Math.floor(speechDuration / preferredSpacing)),
  );
}

function fitsWithQuietIntervals(
  variants: readonly CommercialBehaviorVariantId[],
  speechDuration: number,
): boolean {
  const gestureDuration = variants.reduce(
    (sum, variantId) => sum + COMMERCIAL_BEHAVIOR_DEFINITIONS[variantId].duration,
    0,
  );
  const internalQuiet = Math.max(0, variants.length - 1) * MIN_QUIET_INTERVAL;
  return gestureDuration + internalQuiet + EDGE_QUIET_INTERVAL * 2 <= speechDuration;
}

function fitsLongReplyCadence(
  variants: readonly CommercialBehaviorVariantId[],
  speechDuration: number,
): boolean {
  if (variants.length === 0) {
    return true;
  }
  const lastDuration =
    COMMERCIAL_BEHAVIOR_DEFINITIONS[variants[variants.length - 1]].duration;
  return (
    EDGE_QUIET_INTERVAL * 2 +
      Math.max(0, variants.length - 1) * 5 +
      lastDuration <=
    speechDuration
  );
}

function placeGestures(
  behavior: Live2DCommercialBehavior,
  variants: readonly CommercialBehaviorVariantId[],
  speechDuration: number,
  seed: number,
): PlannedCommercialGesture[] {
  if (variants.length === 0) {
    return [];
  }

  const totalGestureDuration = variants.reduce(
    (sum, variantId) => sum + COMMERCIAL_BEHAVIOR_DEFINITIONS[variantId].duration,
    0,
  );
  const freeTime = Math.max(0, speechDuration - totalGestureDuration);
  const baseGap = freeTime / (variants.length + 1);
  const internalGap =
    variants.length > 1
      ? Math.max(
          MIN_QUIET_INTERVAL,
          Math.min(
            baseGap,
            (freeTime - EDGE_QUIET_INTERVAL * 2) / (variants.length - 1),
          ),
        )
      : 0;
  const edgeTime = freeTime - internalGap * Math.max(0, variants.length - 1);
  const centeredLead = edgeTime / 2;
  const jitterRoom = Math.max(0, centeredLead - EDGE_QUIET_INTERVAL);
  const stableJitter = (unitFromSeed(mixSeed(seed, 0xa3)) - 0.5) * jitterRoom * 0.3;

  let cursor = Math.max(EDGE_QUIET_INTERVAL, centeredLead + stableJitter);
  return variants.map((variantId) => {
    const definition = COMMERCIAL_BEHAVIOR_DEFINITIONS[variantId];
    const startTime = cursor;
    const endTime = startTime + definition.duration;
    cursor = endTime + internalGap;
    return {
      behavior,
      variantId,
      startTime: roundTime(startTime),
      endTime: roundTime(endTime),
    };
  });
}

function placeLongReplyGestures(
  behavior: Live2DCommercialBehavior,
  variants: readonly CommercialBehaviorVariantId[],
  speechDuration: number,
  seed: number,
): PlannedCommercialGesture[] {
  if (variants.length === 0) {
    return [];
  }

  const lastDuration =
    COMMERCIAL_BEHAVIOR_DEFINITIONS[variants[variants.length - 1]].duration;
  const preferredSpacing = 5 + unitFromSeed(mixSeed(seed, 0x58)) * 3;
  const availableSpacing =
    variants.length > 1
      ? (speechDuration - lastDuration - EDGE_QUIET_INTERVAL * 2) /
        (variants.length - 1)
      : preferredSpacing;
  const spacing = Math.min(preferredSpacing, availableSpacing);
  const occupiedTime = lastDuration + spacing * Math.max(0, variants.length - 1);
  const edgeTime = speechDuration - occupiedTime;
  const centeredLead = edgeTime / 2;
  const jitterRoom = Math.max(0, centeredLead - EDGE_QUIET_INTERVAL);
  const stableJitter = (unitFromSeed(mixSeed(seed, 0xa3)) - 0.5) * jitterRoom * 0.3;
  const firstStart = Math.max(EDGE_QUIET_INTERVAL, centeredLead + stableJitter);

  return variants.map((variantId, index) => {
    const definition = COMMERCIAL_BEHAVIOR_DEFINITIONS[variantId];
    const startTime = firstStart + spacing * index;
    return {
      behavior,
      variantId,
      startTime: roundTime(startTime),
      endTime: roundTime(startTime + definition.duration),
    };
  });
}

export function planCommercialGestures(
  input: CommercialGesturePlanInput,
): readonly PlannedCommercialGesture[] {
  const speechDuration = Math.max(0, input.speechDuration);
  const seed = mixSeed(getStableSeed(input), hashCommercialReplyText(input.behavior));
  const limit = getCommercialGestureLimit(speechDuration);
  let desiredCount = Math.min(
    limit,
    getDesiredGestureCount(input.behavior, speechDuration, seed),
  );

  let variants = Array.from({ length: desiredCount }, (_, index) =>
    chooseVariant(input.behavior, seed, index),
  );

  while (variants.length > 0 && !fitsWithQuietIntervals(variants, speechDuration)) {
    variants = variants.slice(0, -1);
    desiredCount -= 1;
  }

  while (
    speechDuration > 20 &&
    variants.length > 0 &&
    !fitsLongReplyCadence(variants, speechDuration)
  ) {
    variants = variants.slice(0, -1);
    desiredCount -= 1;
  }

  if (desiredCount === 0) {
    return [];
  }

  return speechDuration > 20
    ? placeLongReplyGestures(input.behavior, variants, speechDuration, seed)
    : placeGestures(input.behavior, variants, speechDuration, seed);
}

export const COMMERCIAL_GESTURE_QUIET_INTERVAL_SECONDS = MIN_QUIET_INTERVAL;

import type {
  ClientEmotionContextPayload,
  EmotionMode,
  EmotionScores,
  FacialEmotionSignal,
  ProsodyEmotionSignal,
  ProsodyMetrics,
} from '@/types/terminal';

export interface FaceLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface ProsodyAccumulator {
  frameCount: number;
  activeFrameCount: number;
  rmsSum: number;
  rmsSquareSum: number;
  peakRms: number;
  zcrSum: number;
}

export const EMOTION_MODES: EmotionMode[] = ['neutral', 'smile', 'shy', 'sad', 'angry', 'surprised'];

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function createEmotionScores(): EmotionScores {
  return {
    neutral: 0,
    smile: 0,
    shy: 0,
    sad: 0,
    angry: 0,
    surprised: 0,
  };
}

export function normalizeEmotionScores(scores: Partial<Record<EmotionMode, number>>): EmotionScores {
  const normalized = createEmotionScores();

  EMOTION_MODES.forEach((mode) => {
    normalized[mode] = Math.max(0, scores[mode] ?? 0);
  });

  const total = EMOTION_MODES.reduce((sum, mode) => sum + normalized[mode], 0);
  if (total <= 1e-6) {
    return {
      neutral: 1,
      smile: 0,
      shy: 0,
      sad: 0,
      angry: 0,
      surprised: 0,
    };
  }

  EMOTION_MODES.forEach((mode) => {
    normalized[mode] = round4(normalized[mode] / total);
  });

  return normalized;
}

export function accumulateEmotionScores(target: EmotionScores, scores: EmotionScores) {
  EMOTION_MODES.forEach((mode) => {
    target[mode] += scores[mode];
  });
}

export function averageEmotionScores(totalScores: EmotionScores, sampleCount: number): EmotionScores {
  if (sampleCount <= 0) {
    return normalizeEmotionScores({ neutral: 1 });
  }

  const averaged = createEmotionScores();
  EMOTION_MODES.forEach((mode) => {
    averaged[mode] = totalScores[mode] / sampleCount;
  });

  return normalizeEmotionScores(averaged);
}

export function getDominantEmotion(scores: EmotionScores, sampleCount = 1): { emotion: EmotionMode; confidence: number } {
  const ranked = [...EMOTION_MODES]
    .map((mode) => [mode, scores[mode]] as const)
    .sort((left, right) => right[1] - left[1]);

  const [topMode, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const margin = Math.max(0, topScore - secondScore);
  const sampleConfidence = clamp01(sampleCount / 24);
  const confidence = clamp01((topScore * 0.62) + (margin * 0.78) + (sampleConfidence * 0.2));

  return {
    emotion: topMode,
    confidence: round4(confidence),
  };
}

function landmarkDistance(left: FaceLandmark | undefined, right: FaceLandmark | undefined) {
  if (!left || !right) {
    return 0;
  }

  const deltaX = left.x - right.x;
  const deltaY = left.y - right.y;
  return Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));
}

function landmarkY(landmarks: FaceLandmark[], ...indices: number[]) {
  const values = indices
    .map((index) => landmarks[index]?.y)
    .filter((value): value is number => typeof value === 'number');

  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function inferFacialEmotionFromLandmarks(landmarks: FaceLandmark[]): FacialEmotionSignal {
  if (landmarks.length < 468) {
    return {
      emotion: 'neutral',
      confidence: 0,
      scores: normalizeEmotionScores({ neutral: 1 }),
      sampleCount: 0,
    };
  }

  const faceScale = Math.max(
    landmarkDistance(landmarks[234], landmarks[454]),
    landmarkDistance(landmarks[10], landmarks[152]),
    1e-4,
  );

  const mouthWidth = landmarkDistance(landmarks[61], landmarks[291]) / faceScale;
  const mouthOpen = landmarkDistance(landmarks[13], landmarks[14]) / faceScale;
  const eyeOpen = (
    landmarkDistance(landmarks[159], landmarks[145]) +
    landmarkDistance(landmarks[386], landmarks[374])
  ) / (2 * faceScale);
  const browEyeDistance = (
    landmarkDistance(landmarks[105], landmarks[159]) +
    landmarkDistance(landmarks[334], landmarks[386])
  ) / (2 * faceScale);

  const lipCenterY = landmarkY(landmarks, 13, 14);
  const mouthCornerY = landmarkY(landmarks, 61, 291);
  const cornerLift = clamp01((lipCenterY - mouthCornerY) / 0.04);
  const cornerDrop = clamp01((mouthCornerY - lipCenterY) / 0.05);
  const browLow = clamp01((0.07 - browEyeDistance) / 0.03);
  const browHigh = clamp01((browEyeDistance - 0.095) / 0.04);
  const eyeWide = clamp01((eyeOpen - 0.04) / 0.03);
  const eyeNarrow = clamp01((0.028 - eyeOpen) / 0.015);
  const lipPress = clamp01((0.018 - mouthOpen) / 0.012);
  const mouthBurst = clamp01((mouthOpen - 0.055) / 0.04);
  const wideSmile = clamp01((mouthWidth - 0.42) / 0.12);
  const narrowMouth = clamp01((0.34 - mouthWidth) / 0.08);

  const scores = normalizeEmotionScores({
    neutral: 0.18 + clamp01(1 - Math.abs(mouthOpen - 0.025) / 0.05) * 0.2 + clamp01(1 - Math.abs(eyeOpen - 0.032) / 0.025) * 0.12,
    smile: 0.12 + (wideSmile * 0.6) + (cornerLift * 0.95) + (eyeWide * 0.15),
    shy: 0.1 + (cornerLift * 0.28) + (eyeNarrow * 0.45) + (lipPress * 0.35) + (narrowMouth * 0.25),
    sad: 0.1 + (cornerDrop * 0.7) + (eyeNarrow * 0.35) + (narrowMouth * 0.25),
    angry: 0.1 + (browLow * 0.75) + (lipPress * 0.35) + (clamp01(0.45 - cornerLift) * 0.25) + (eyeNarrow * 0.25),
    surprised: 0.12 + (mouthBurst * 0.75) + (browHigh * 0.55) + (eyeWide * 0.45),
  });

  const dominant = getDominantEmotion(scores, 1);

  return {
    emotion: dominant.emotion,
    confidence: dominant.confidence,
    scores,
    sampleCount: 1,
  };
}

export function summarizeFacialEmotion(totalScores: EmotionScores, sampleCount: number): FacialEmotionSignal | null {
  if (sampleCount <= 0) {
    return null;
  }

  const scores = averageEmotionScores(totalScores, sampleCount);
  const dominant = getDominantEmotion(scores, sampleCount);

  return {
    emotion: dominant.emotion,
    confidence: dominant.confidence,
    scores,
    sampleCount,
  };
}

export function createProsodyAccumulator(): ProsodyAccumulator {
  return {
    frameCount: 0,
    activeFrameCount: 0,
    rmsSum: 0,
    rmsSquareSum: 0,
    peakRms: 0,
    zcrSum: 0,
  };
}

export function updateProsodyAccumulator(accumulator: ProsodyAccumulator, samples: Uint8Array<ArrayBuffer>) {
  if (samples.length === 0) {
    return;
  }

  let energy = 0;
  let crossings = 0;
  let previousSign = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const centered = (samples[index] - 128) / 128;
    energy += centered * centered;

    const sign = centered > 0.01 ? 1 : centered < -0.01 ? -1 : 0;
    if (index > 0 && sign !== 0 && previousSign !== 0 && sign !== previousSign) {
      crossings += 1;
    }
    if (sign !== 0) {
      previousSign = sign;
    }
  }

  const rms = Math.sqrt(energy / samples.length);
  const zcr = crossings / Math.max(samples.length - 1, 1);

  accumulator.frameCount += 1;
  accumulator.rmsSum += rms;
  accumulator.rmsSquareSum += rms * rms;
  accumulator.peakRms = Math.max(accumulator.peakRms, rms);
  accumulator.zcrSum += zcr;

  if (rms > 0.022) {
    accumulator.activeFrameCount += 1;
  }
}

export function summarizeProsodyEmotion(accumulator: ProsodyAccumulator): ProsodyEmotionSignal | null {
  if (accumulator.frameCount <= 0) {
    return null;
  }

  const averageVolume = accumulator.rmsSum / accumulator.frameCount;
  const variance = Math.sqrt(Math.max((accumulator.rmsSquareSum / accumulator.frameCount) - (averageVolume * averageVolume), 0));
  const speechRatio = accumulator.activeFrameCount / accumulator.frameCount;
  const zeroCrossingRate = accumulator.zcrSum / accumulator.frameCount;

  const energyNorm = clamp01((averageVolume - 0.015) / 0.06);
  const peakNorm = clamp01((accumulator.peakRms - 0.04) / 0.28);
  const variationNorm = clamp01(variance / 0.05);
  const activityNorm = clamp01((speechRatio - 0.15) / 0.7);
  const tensionNorm = clamp01((zeroCrossingRate - 0.03) / 0.12);
  const calmNorm = clamp01(1 - (tensionNorm * 0.8) - (variationNorm * 0.4));

  const scores = normalizeEmotionScores({
    neutral: 0.18 + clamp01(1 - Math.abs(energyNorm - 0.38) / 0.38) * 0.22 + calmNorm * 0.12,
    smile: 0.14 + (energyNorm * 0.55) + (activityNorm * 0.25) + (calmNorm * 0.18),
    shy: 0.12 + ((1 - peakNorm) * 0.28) + ((1 - activityNorm) * 0.28) + ((1 - energyNorm) * 0.18) + (calmNorm * 0.12),
    sad: 0.14 + ((1 - energyNorm) * 0.55) + ((1 - activityNorm) * 0.38) + ((1 - variationNorm) * 0.12),
    angry: 0.1 + (peakNorm * 0.75) + (tensionNorm * 0.55) + (variationNorm * 0.35),
    surprised: 0.1 + (peakNorm * 0.48) + (variationNorm * 0.45) + (activityNorm * 0.22),
  });

  const dominant = getDominantEmotion(scores, accumulator.frameCount);
  const metrics: ProsodyMetrics = {
    averageVolume: round4(averageVolume),
    peakVolume: round4(accumulator.peakRms),
    variation: round4(variance),
    speechRatio: round4(speechRatio),
    zeroCrossingRate: round4(zeroCrossingRate),
  };

  return {
    emotion: dominant.emotion,
    confidence: dominant.confidence,
    scores,
    metrics,
    sampleCount: accumulator.frameCount,
  };
}

export function buildClientEmotionContextPayload(options: {
  facialEmotion?: FacialEmotionSignal | null;
  prosodyEmotion?: ProsodyEmotionSignal | null;
  captureDurationMs?: number;
}): ClientEmotionContextPayload | null {
  const hasEmotionSignal = options.facialEmotion || options.prosodyEmotion;
  if (!hasEmotionSignal) {
    return null;
  }

  return {
    facialEmotion: options.facialEmotion ?? null,
    prosodyEmotion: options.prosodyEmotion ?? null,
    captureDurationMs: options.captureDurationMs ? Math.round(options.captureDurationMs) : undefined,
  };
}

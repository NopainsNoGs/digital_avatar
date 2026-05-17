// types/terminal.ts

// 终端所处的真实运行状态
export type TerminalState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';
export type EmotionMode = 'neutral' | 'smile' | 'shy' | 'sad' | 'angry' | 'surprised';
export type EmotionScores = Record<EmotionMode, number>;

export interface VisemeFrame {
  t: number;
  y: number;
  f: number;
}

export interface ActionCard {
  type: 'NAVIGATE' | 'ALERT' | 'INFO';
  title: string;
  content: string;
}

export interface EmotionSignal {
  emotion: EmotionMode;
  confidence: number;
  scores: EmotionScores;
}

export interface FacialEmotionSignal extends EmotionSignal {
  sampleCount: number;
}

export interface ProsodyMetrics {
  averageVolume: number;
  peakVolume: number;
  variation: number;
  speechRatio: number;
  zeroCrossingRate: number;
}

export interface ProsodyEmotionSignal extends EmotionSignal {
  sampleCount: number;
  metrics: ProsodyMetrics;
}

export interface ClientEmotionContextPayload {
  facialEmotion?: FacialEmotionSignal | null;
  prosodyEmotion?: ProsodyEmotionSignal | null;
  captureDurationMs?: number;
}

export interface UserEmotionAnalysis {
  transcript?: string;
  finalEmotion: EmotionMode;
  confidence: number;
  weights: {
    facial: number;
    prosody: number;
    text: number;
  };
  scores: EmotionScores;
  facialEmotion?: FacialEmotionSignal | null;
  prosodyEmotion?: ProsodyEmotionSignal | null;
  textEmotion?: EmotionSignal | null;
}

export interface LiveUserEmotion {
  facialEmotion?: FacialEmotionSignal | null;
  prosodyEmotion?: ProsodyEmotionSignal | null;
}

// 后端下发的真实交互包
export interface AgentResponse {
  transcript: string;       // 旅客说的话 (ASR)
  replyText: string;        // 大模型的回复 (LLM)
  audioUrl?: string;        // 语音流地址 (TTS)
  audioDuration?: number;   // 音频时长 (秒)
  visemeTrack?: VisemeFrame[]; // 口型序列 (Live2D)
  emotionMode?: EmotionMode | string; // 椿的口播 / 表情风格
  actionCard?: ActionCard | null; // 业务弹卡 (可选)
  live2dAction?: string;    // 传给 Live2D 的动作指令 (如: "nod", "smile")
  userEmotionAnalysis?: UserEmotionAnalysis | null; // 用户多模态情绪融合结果
  videoUrl?: string | null; // 视频流
}

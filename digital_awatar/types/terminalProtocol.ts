import type {
  ActionCard,
  AgentResponse,
  ClientEmotionContextPayload,
  EmotionMode,
  Live2DAction,
  TerminalState,
  UserEmotionAnalysis,
  VisemeFrame,
} from './terminal';


export type ClientSocketMessage =
  | {
      type: 'USER_EMOTION_CONTEXT';
      payload: ClientEmotionContextPayload;
    }
  | {
      type: 'TEXT_INPUT';
      text: string;
      emotionContext?: ClientEmotionContextPayload;
    };

export type ServerSocketMessage =
  | { type: 'STATUS_UPDATE'; status: TerminalState }
  | {
      type: 'USER_EMOTION_ANALYSIS';
      payload: UserEmotionAnalysis;
    }
  | {
      type: 'TEXT_STREAM_START';
      payload: {
        transcript: string;
        replyText: string;
        emotionMode?: EmotionMode;
        actionCard?: ActionCard | null;
        live2dAction?: Live2DAction;
      };
    }
  | {
      type: 'TEXT_STREAM_DELTA';
      payload: {
        delta: string;
        replyText: string;
      };
    }
  | {
      type: 'AGENT_STATE_DELTA';
      payload: {
        emotionMode?: EmotionMode;
        actionCard?: ActionCard | null;
        live2dAction?: Live2DAction;
      };
    }
  | {
      type: 'TEXT_STREAM_END';
      payload: {
        replyText: string;
        emotionMode?: EmotionMode;
        actionCard?: ActionCard | null;
        live2dAction?: Live2DAction;
      };
    }
  | {
      type: 'AUDIO_STREAM_START';
      payload: {
        streamId: string;
        sampleRate: number;
        channels: number;
        format: 'pcm_s16le';
      };
    }
  | {
      type: 'AUDIO_STREAM_END';
      payload: {
        streamId: string;
        totalSamples: number;
        sampleRate: number;
      };
    }
  | {
      type: 'AGENT_REPLY';
      status: TerminalState;
      payload: AgentResponse;
    }
  | {
      type: 'ERROR';
      status?: TerminalState;
      payload: { message: string };
    };

export interface AudioChunkMetadata {
  type: 'AUDIO_CHUNK';
  streamId: string;
  chunkIndex: number;
  sampleRate: number;
  channels: number;
  format: 'pcm_s16le';
  chunkDurationSec: number;
  visemeFps?: number;
  visemeChunk?: VisemeFrame[];
  /** Present only on the first audio chunk of a TTS sentence segment. */
  segmentStart?: boolean;
  segmentIndex?: number;
  segmentText?: string;
}

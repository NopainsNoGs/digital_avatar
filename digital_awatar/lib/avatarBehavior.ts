import type {
  AvatarBehavior,
  AvatarEmotion,
  AvatarGesture,
  AvatarSpeechRuntime,
} from '@/types/avatar';
import type { AgentResponse, TerminalState } from '@/types/terminal';

interface CreateAvatarBehaviorOptions {
  status: TerminalState;
  response: AgentResponse | null;
  speech: AvatarSpeechRuntime;
}

function normalizeAvatarEmotion(emotion: AgentResponse['emotionMode']): AvatarEmotion {
  if (
    emotion === 'neutral'
    || emotion === 'smile'
    || emotion === 'shy'
    || emotion === 'sad'
    || emotion === 'angry'
    || emotion === 'surprised'
  ) {
    return emotion;
  }

  return 'neutral';
}

export function mapLegacyLive2DActionToAvatarGesture(
  live2dAction: AgentResponse['live2dAction'],
): AvatarGesture {
  if (
    live2dAction === 'explain'
    || live2dAction === 'point'
    || live2dAction === 'comfort'
    || live2dAction === 'alert'
    || live2dAction === 'confirm'
  ) {
    return live2dAction;
  }

  return 'explain';
}

export function createAvatarBehavior({
  status,
  response,
  speech,
}: CreateAvatarBehaviorOptions): AvatarBehavior {
  return {
    status,
    emotion: normalizeAvatarEmotion(response?.emotionMode),
    gesture: mapLegacyLive2DActionToAvatarGesture(response?.live2dAction),
    replyText: response?.replyText ?? '',
    speech,
  };
}

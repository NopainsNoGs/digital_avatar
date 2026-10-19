import json
import struct
from typing import Any


CLIENT_MESSAGE_TYPES = frozenset({
    "USER_EMOTION_CONTEXT",
    "TEXT_INPUT",
})

SERVER_MESSAGE_TYPES = frozenset({
    "STATUS_UPDATE",
    "USER_EMOTION_ANALYSIS",
    "TEXT_STREAM_START",
    "TEXT_STREAM_DELTA",
    "AGENT_STATE_DELTA",
    "TEXT_STREAM_END",
    "AUDIO_STREAM_START",
    "AUDIO_CHUNK",
    "AUDIO_STREAM_END",
    "AGENT_REPLY",
    "ERROR",
})

TERMINAL_STATES = (
    "IDLE",
    "LISTENING",
    "THINKING",
    "SPEAKING",
    "ERROR",
)

EMOTION_MODES = (
    "neutral",
    "smile",
    "shy",
    "sad",
    "angry",
    "surprised",
)

AUDIO_CHUNK_TYPE = "AUDIO_CHUNK"


def pack_binary_event(metadata: dict[str, Any], payload: bytes) -> bytes:
    """Pack compact UTF-8 metadata and raw payload behind a uint32 LE header."""
    metadata_bytes = json.dumps(metadata, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return struct.pack("<I", len(metadata_bytes)) + metadata_bytes + payload

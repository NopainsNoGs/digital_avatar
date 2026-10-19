import json
import struct
import unittest

from hub_backend.protocol import (
    AUDIO_CHUNK_TYPE,
    CLIENT_MESSAGE_TYPES,
    EMOTION_MODES,
    SERVER_MESSAGE_TYPES,
    TERMINAL_STATES,
    pack_binary_event,
)


class TerminalProtocolContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.metadata = {
            "type": "AUDIO_CHUNK",
            "streamId": "stream-contract-测试",
            "chunkIndex": 0,
            "sampleRate": 22050,
            "channels": 1,
            "format": "pcm_s16le",
            "chunkDurationSec": 0.02,
            "visemeFps": 60,
            "visemeChunk": [
                {"t": 0.0, "y": 0.25, "f": -0.1},
                {"t": 0.016, "y": 0.5, "f": 0.2},
            ],
        }
        self.pcm_payload = b"\x00\x80\xff\x7f\x01\x00\xff\xff"

    def test_emotion_modes_are_frozen_in_order(self) -> None:
        self.assertEqual(
            EMOTION_MODES,
            ("neutral", "smile", "shy", "sad", "angry", "surprised"),
        )

    def test_terminal_states_are_frozen_in_order(self) -> None:
        self.assertEqual(
            TERMINAL_STATES,
            ("IDLE", "LISTENING", "THINKING", "SPEAKING", "ERROR"),
        )

    def test_client_message_types_are_frozen(self) -> None:
        self.assertEqual(
            CLIENT_MESSAGE_TYPES,
            frozenset({"USER_EMOTION_CONTEXT", "TEXT_INPUT"}),
        )

    def test_server_message_types_are_frozen(self) -> None:
        self.assertEqual(
            SERVER_MESSAGE_TYPES,
            frozenset({
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
            }),
        )
        self.assertEqual(AUDIO_CHUNK_TYPE, "AUDIO_CHUNK")

    def test_binary_packet_header_metadata_and_pcm_round_trip(self) -> None:
        packet = pack_binary_event(self.metadata, self.pcm_payload)
        metadata_length = struct.unpack("<I", packet[:4])[0]
        metadata_bytes = packet[4:4 + metadata_length]
        decoded_metadata = json.loads(metadata_bytes.decode("utf-8"))

        self.assertEqual(packet[:4], struct.pack("<I", metadata_length))
        self.assertEqual(metadata_length, len(metadata_bytes))
        self.assertEqual(decoded_metadata, self.metadata)
        self.assertEqual(packet[4 + metadata_length:], self.pcm_payload)

    def test_audio_chunk_metadata_and_viseme_fields_are_preserved(self) -> None:
        packet = pack_binary_event(self.metadata, self.pcm_payload)
        metadata_length = struct.unpack("<I", packet[:4])[0]
        decoded_metadata = json.loads(packet[4:4 + metadata_length].decode("utf-8"))

        self.assertEqual(
            tuple(decoded_metadata),
            (
                "type",
                "streamId",
                "chunkIndex",
                "sampleRate",
                "channels",
                "format",
                "chunkDurationSec",
                "visemeFps",
                "visemeChunk",
            ),
        )
        self.assertEqual(decoded_metadata["type"], "AUDIO_CHUNK")
        self.assertEqual(decoded_metadata["format"], "pcm_s16le")
        self.assertEqual(tuple(decoded_metadata["visemeChunk"][0]), ("t", "y", "f"))
        self.assertEqual(decoded_metadata["visemeChunk"], self.metadata["visemeChunk"])


if __name__ == "__main__":
    unittest.main()

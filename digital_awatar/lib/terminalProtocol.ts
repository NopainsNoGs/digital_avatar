import type { AudioChunkMetadata } from '@/types/terminalProtocol';


function invalidAudioPacket(reason: string): Error {
  return new Error(`Invalid AUDIO_CHUNK packet: ${reason}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateAudioChunkMetadata(value: unknown): asserts value is AudioChunkMetadata {
  if (!isRecord(value)) {
    throw invalidAudioPacket('metadata must be an object');
  }
  if (value.type !== 'AUDIO_CHUNK') {
    throw invalidAudioPacket('metadata.type must be AUDIO_CHUNK');
  }
  if (typeof value.streamId !== 'string' || value.streamId.length === 0) {
    throw invalidAudioPacket('streamId must be a non-empty string');
  }
  if (!Number.isInteger(value.chunkIndex) || Number(value.chunkIndex) < 0) {
    throw invalidAudioPacket('chunkIndex must be a non-negative integer');
  }
  if (!isFiniteNumber(value.sampleRate) || value.sampleRate <= 0) {
    throw invalidAudioPacket('sampleRate must be greater than zero');
  }
  if (!Number.isInteger(value.channels) || Number(value.channels) < 1) {
    throw invalidAudioPacket('channels must be a positive integer');
  }
  if (value.format !== 'pcm_s16le') {
    throw invalidAudioPacket('format must be pcm_s16le');
  }
  if (!isFiniteNumber(value.chunkDurationSec) || value.chunkDurationSec < 0) {
    throw invalidAudioPacket('chunkDurationSec must be non-negative');
  }
  if (value.visemeFps !== undefined && (!isFiniteNumber(value.visemeFps) || value.visemeFps <= 0)) {
    throw invalidAudioPacket('visemeFps must be greater than zero when present');
  }
  if (value.visemeChunk !== undefined) {
    if (!Array.isArray(value.visemeChunk)) {
      throw invalidAudioPacket('visemeChunk must be an array when present');
    }
    for (const frame of value.visemeChunk) {
      if (
        !isRecord(frame)
        || !isFiniteNumber(frame.t)
        || !isFiniteNumber(frame.y)
        || !isFiniteNumber(frame.f)
      ) {
        throw invalidAudioPacket('each visemeChunk frame must contain numeric t/y/f fields');
      }
    }
  }
  if (value.segmentStart !== undefined && typeof value.segmentStart !== 'boolean') {
    throw invalidAudioPacket('segmentStart must be boolean when present');
  }
  if (
    value.segmentIndex !== undefined
    && (!Number.isInteger(value.segmentIndex) || Number(value.segmentIndex) < 0)
  ) {
    throw invalidAudioPacket('segmentIndex must be a non-negative integer when present');
  }
  if (value.segmentText !== undefined && typeof value.segmentText !== 'string') {
    throw invalidAudioPacket('segmentText must be a string when present');
  }
}

export function unpackBinaryPacket(packet: ArrayBuffer): {
  metadata: AudioChunkMetadata;
  payload: ArrayBuffer;
} {
  if (packet.byteLength < 4) {
    throw invalidAudioPacket('packet is shorter than the 4-byte header');
  }

  const metadataLength = new DataView(packet).getUint32(0, true);
  const remainingLength = packet.byteLength - 4;
  if (metadataLength > remainingLength) {
    throw invalidAudioPacket('metadata length exceeds packet bounds');
  }

  let metadata: unknown;
  try {
    const metadataBytes = new Uint8Array(packet, 4, metadataLength);
    const metadataJson = new TextDecoder('utf-8', { fatal: true }).decode(metadataBytes);
    metadata = JSON.parse(metadataJson) as unknown;
  } catch {
    throw invalidAudioPacket('metadata is not valid UTF-8 JSON');
  }

  validateAudioChunkMetadata(metadata);

  const payload = packet.slice(4 + metadataLength);
  if (payload.byteLength % 2 !== 0) {
    throw invalidAudioPacket('pcm_s16le payload byte length must be even');
  }

  return { metadata, payload };
}

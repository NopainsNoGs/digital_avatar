#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIO_DIR="$BUILD_DIR/audio"
VOICE="${DEMO_VOICE:-zh-CN-YunyangNeural}"
RATE="${DEMO_RATE:--3%}"
PITCH="${DEMO_PITCH:--6Hz}"

mkdir -p "$AUDIO_DIR"

for index in 1 2 3 4 5 6; do
  edge-tts \
    --voice "$VOICE" \
    --rate="$RATE" \
    --pitch="$PITCH" \
    --file "$AUDIO_DIR/slide_${index}.txt" \
    --write-media "$AUDIO_DIR/slide_${index}.mp3"
done

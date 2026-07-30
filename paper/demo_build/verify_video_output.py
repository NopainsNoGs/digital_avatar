#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
VIDEO = ROOT_DIR / "dome" / "ChinaVR_Awatar_论文Demo.mp4"
PPTX = ROOT_DIR / "dome" / "ChinaVR_Awatar_论文Demo.pptx"
DURATIONS = ROOT_DIR / "paper" / "demo_build" / "audio" / "durations.json"

assert VIDEO.is_file(), "ChinaVR_Awatar_论文Demo.mp4 missing"
assert VIDEO.stat().st_size > 1_000_000, "review video unexpectedly small"
assert VIDEO.stat().st_mtime > PPTX.stat().st_mtime, "video is older than PPTX"
assert VIDEO.stat().st_mtime > DURATIONS.stat().st_mtime, (
    "video is older than narration manifest"
)

probe = subprocess.run(
    [
        "ffprobe",
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        str(VIDEO),
    ],
    check=True,
    capture_output=True,
    text=True,
)
metadata = json.loads(probe.stdout)
video_stream = next(stream for stream in metadata["streams"] if stream["codec_type"] == "video")
audio_stream = next(stream for stream in metadata["streams"] if stream["codec_type"] == "audio")
duration = float(metadata["format"]["duration"])

assert duration >= 100.0, f"video duration is unexpectedly short: {duration:.3f}s"
assert duration <= 110.0, f"video duration exceeds target: {duration:.3f}s"
assert duration < 120.0, f"video duration exceeds hard limit: {duration:.3f}s"
assert video_stream["codec_name"] == "h264"
assert video_stream["width"] == 1920
assert video_stream["height"] == 1080
assert audio_stream["codec_name"] == "aac"
assert int(audio_stream["sample_rate"]) == 48_000

print(
    json.dumps(
        {
            "duration_seconds": round(duration, 3),
            "video_codec": video_stream["codec_name"],
            "resolution": f"{video_stream['width']}x{video_stream['height']}",
            "audio_codec": audio_stream["codec_name"],
            "audio_sample_rate": int(audio_stream["sample_rate"]),
        },
        ensure_ascii=False,
        indent=2,
    ),
)
print("video output contract: PASS")

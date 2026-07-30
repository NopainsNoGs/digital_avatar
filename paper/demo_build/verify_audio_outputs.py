#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

BUILD_DIR = Path(__file__).resolve().parent
AUDIO_DIR = BUILD_DIR / "audio"
EXPECTED = [AUDIO_DIR / f"slide_{index}.mp3" for index in range(1, 7)]
SETTINGS_FILE = AUDIO_DIR / "synthesis_settings.json"
EXPECTED_SETTINGS = {
    "voice": "zh-CN-YunyangNeural",
    "rate": "+8%",
    "pitch": "-6Hz",
}


def duration_seconds(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


durations = []
assert SETTINGS_FILE.is_file(), "synthesis_settings.json missing"
settings = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
assert settings == EXPECTED_SETTINGS, (
    f"unexpected synthesis settings: {settings!r}"
)
for audio_file in EXPECTED:
    assert audio_file.is_file(), f"{audio_file.name} missing"
    assert audio_file.stat().st_size > 10_000, f"{audio_file.name} too small"
    clip_duration = duration_seconds(audio_file)
    assert clip_duration > 4.0, f"{audio_file.name} unexpectedly short"
    durations.append(clip_duration)

padded_total = sum(durations) + 0.6 * len(durations)
assert padded_total <= 110.0, f"padded narration too long: {padded_total:.3f}s"
assert padded_total >= 100.0, f"padded narration too short: {padded_total:.3f}s"

manifest = {
    **settings,
    "clips": [
        {"slide": index, "seconds": round(seconds, 3)}
        for index, seconds in enumerate(durations, start=1)
    ],
    "padded_total_seconds": round(padded_total, 3),
}
(AUDIO_DIR / "durations.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps(manifest, ensure_ascii=False, indent=2))
print("audio output contract: PASS")

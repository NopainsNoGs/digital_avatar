#!/usr/bin/env python3
import html
import json
import re
import subprocess
import unicodedata
from pathlib import Path

BUILD_DIR = Path(__file__).resolve().parent
AUDIO_DIR = BUILD_DIR / "audio"
TIME_LINE = re.compile(
    r"(?P<start>\d{2}:\d{2}:\d{2}[.,]\d{3})\s+-->\s+"
    r"(?P<end>\d{2}:\d{2}:\d{2}[.,]\d{3})",
)
SILENCE_START = re.compile(r"silence_start:\s*([0-9.]+)")
SILENCE_END = re.compile(
    r"silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)",
)


def seconds(timestamp: str) -> float:
    timestamp = timestamp.replace(",", ".")
    hours, minutes, remainder = timestamp.split(":")
    return int(hours) * 3600 + int(minutes) * 60 + float(remainder)


def normalized_text(value: str) -> str:
    plain = re.sub(r"<[^>]+>", "", html.unescape(value))
    return "".join(
        character
        for character in plain
        if not character.isspace()
        and not unicodedata.category(character).startswith("P")
    )


def parse_vtt(path: Path) -> list[tuple[float, float, str]]:
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    cues = []
    index = 0
    while index < len(lines):
        match = TIME_LINE.fullmatch(lines[index].strip())
        if not match:
            index += 1
            continue
        start = seconds(match.group("start"))
        end = seconds(match.group("end"))
        index += 1
        text_lines = []
        while index < len(lines) and lines[index].strip():
            text_lines.append(lines[index].strip())
            index += 1
        cues.append((start, end, "".join(text_lines)))
    return cues


def duration_seconds(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def silence_intervals(path: Path) -> list[tuple[float, float, float]]:
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            "silencedetect=noise=-42dB:d=0.70",
            "-f",
            "null",
            "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    starts = [float(value) for value in SILENCE_START.findall(result.stderr)]
    ends = [
        (float(end), float(duration))
        for end, duration in SILENCE_END.findall(result.stderr)
    ]
    assert len(starts) == len(ends), f"unpaired silence events in {path.name}"
    return [
        (start, end, duration)
        for start, (end, duration) in zip(starts, ends, strict=True)
    ]


def main() -> None:
    report = []
    rates = []
    for slide in range(1, 7):
        text_path = AUDIO_DIR / f"slide_{slide}.txt"
        audio_path = AUDIO_DIR / f"slide_{slide}.mp3"
        vtt_path = AUDIO_DIR / f"slide_{slide}.vtt"
        for path in (text_path, audio_path, vtt_path):
            assert path.is_file(), f"{path.name} missing"

        source = normalized_text(text_path.read_text(encoding="utf-8"))
        cues = parse_vtt(vtt_path)
        assert cues, f"{vtt_path.name} contains no timing cues"

        previous_end = 0.0
        maximum_cue_gap = 0.0
        for start, end, _ in cues:
            assert start >= previous_end - 0.08, (
                f"{vtt_path.name} has overlapping or non-monotonic cues"
            )
            assert end > start, f"{vtt_path.name} contains an empty cue"
            maximum_cue_gap = max(maximum_cue_gap, start - previous_end)
            previous_end = end
        assert maximum_cue_gap <= 1.0, (
            f"{vtt_path.name} has a {maximum_cue_gap:.3f}s cue gap"
        )

        spoken = normalized_text("".join(cue[2] for cue in cues))
        assert spoken == source, (
            f"{vtt_path.name} text differs from slide_{slide}.txt"
        )

        duration = duration_seconds(audio_path)
        intervals = silence_intervals(audio_path)
        internal = [
            interval
            for interval in intervals
            if interval[0] > 0.20 and interval[1] < duration - 0.30
        ]
        maximum_internal_silence = max(
            (interval[2] for interval in internal),
            default=0.0,
        )
        assert maximum_internal_silence <= 1.0, (
            f"{audio_path.name} has a {maximum_internal_silence:.3f}s "
            "internal silence"
        )

        speech_span = cues[-1][1] - cues[0][0]
        characters_per_second = len(source) / speech_span
        assert 4.0 <= characters_per_second <= 6.2, (
            f"{audio_path.name} rate is {characters_per_second:.3f} chars/s"
        )
        rates.append(characters_per_second)
        report.append(
            {
                "slide": slide,
                "duration_seconds": round(duration, 3),
                "characters": len(source),
                "characters_per_second": round(characters_per_second, 3),
                "maximum_internal_silence_seconds": round(
                    maximum_internal_silence,
                    3,
                ),
                "maximum_cue_gap_seconds": round(maximum_cue_gap, 3),
                "cue_count": len(cues),
            },
        )

    adjacent_jumps = [
        abs(current - previous)
        for previous, current in zip(rates, rates[1:])
    ]
    assert max(adjacent_jumps, default=0.0) <= 1.4, (
        f"adjacent slide rate jump is {max(adjacent_jumps):.3f} chars/s"
    )

    print(json.dumps({"slides": report}, ensure_ascii=False, indent=2))
    print("speech quality contract: PASS")


if __name__ == "__main__":
    main()

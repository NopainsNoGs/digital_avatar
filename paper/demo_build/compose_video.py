#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
BUILD_DIR = ROOT_DIR / "paper" / "demo_build"
RENDERED_DIR = BUILD_DIR / "rendered"
AUDIO_DIR = BUILD_DIR / "audio"
WORK_DIR = BUILD_DIR / "work"
OUTPUT_DIR = ROOT_DIR / "dome"
OUTPUT_VIDEO = OUTPUT_DIR / "ChinaVR_Awatar_论文Demo.mp4"

SLIDES = [RENDERED_DIR / f"slide-{index}.png" for index in range(1, 7)]
AUDIO = [AUDIO_DIR / f"slide_{index}.mp3" for index in range(1, 7)]


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def load_durations() -> list[float]:
    manifest = json.loads(
        (AUDIO_DIR / "durations.json").read_text(encoding="utf-8"),
    )
    clips = sorted(manifest["clips"], key=lambda clip: clip["slide"])
    assert [clip["slide"] for clip in clips] == list(range(1, 7))
    return [float(clip["seconds"]) for clip in clips]


def validate_inputs() -> None:
    for slide in SLIDES:
        assert slide.is_file(), f"{slide.name} missing"
    for audio in AUDIO:
        assert audio.is_file(), f"{audio.name} missing"


def encode_segment(
    slide_path: Path,
    audio_path: Path,
    narration_seconds: float,
    output_path: Path,
) -> None:
    segment_seconds = narration_seconds + 0.60
    fade_out_start = max(0.18, segment_seconds - 0.18)
    video_filter = (
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x050B16,"
        "fade=t=in:st=0:d=0.18,"
        f"fade=t=out:st={fade_out_start:.3f}:d=0.18,"
        "format=yuv420p"
    )
    audio_filter = (
        "adelay=250:all=1,"
        "aformat=sample_rates=48000:channel_layouts=stereo,"
        "apad=pad_dur=0.35"
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-loop",
            "1",
            "-framerate",
            "30",
            "-i",
            str(slide_path),
            "-i",
            str(audio_path),
            "-filter_complex",
            f"[0:v]{video_filter}[v];[1:a]{audio_filter}[a]",
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-t",
            f"{segment_seconds:.3f}",
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-profile:v",
            "high",
            "-level:v",
            "4.1",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(output_path),
        ],
    )


def concatenate_segments(segment_paths: list[Path]) -> None:
    concat_file = WORK_DIR / "segments.txt"
    concat_file.write_text(
        "".join(f"file '{segment.resolve()}'\n" for segment in segment_paths),
        encoding="utf-8",
    )
    temporary_output = WORK_DIR / "ChinaVR_Awatar_论文Demo.tmp.mp4"
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(temporary_output),
        ],
    )
    temporary_output.replace(OUTPUT_VIDEO)


def main() -> None:
    validate_inputs()
    durations = load_durations()
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    segments = []
    for index, (slide_path, audio_path, duration) in enumerate(
        zip(SLIDES, AUDIO, durations, strict=True),
        start=1,
    ):
        segment_path = WORK_DIR / f"segment_{index}.mp4"
        encode_segment(slide_path, audio_path, duration, segment_path)
        segments.append(segment_path)
        print(
            f"encoded slide {index}: narration={duration:.3f}s "
            f"segment={duration + 0.60:.3f}s",
        )

    concatenate_segments(segments)
    print(f"wrote {OUTPUT_VIDEO.relative_to(ROOT_DIR)}")


if __name__ == "__main__":
    main()

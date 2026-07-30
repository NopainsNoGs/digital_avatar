#!/usr/bin/env python3
import html
import json
import re
import subprocess
import zipfile
from fractions import Fraction
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT_DIR / "dome"
EXPECTED = {
    "ChinaVR_Awatar_论文Demo.pptx",
    "ChinaVR_Awatar_逐页中文讲述词.docx",
    "ChinaVR_Awatar_论文Demo.mp4",
}
REQUIRED_TEXT = [
    "95.83%",
    "5.00",
    "813.13",
    "2.79",
    "4.19",
    "99.83%",
    "55.56%",
    "跨说话人",
    "多噪声",
    "自然交互",
]


def archive_text(path: Path) -> tuple[str, list[str]]:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        xml = "\n".join(
            archive.read(name).decode("utf-8", errors="replace")
            for name in names
            if name.endswith(".xml")
        )
    return html.unescape(xml), names


def ffprobe(path: Path) -> dict:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def verify_audio_decode_and_volume(path: Path) -> tuple[float, float]:
    decode = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    assert decode.returncode == 0, f"video decode failed: {decode.stderr}"
    assert not decode.stderr.strip(), f"video decode emitted errors: {decode.stderr}"

    volume = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(path),
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    mean_match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", volume.stderr)
    max_match = re.search(r"max_volume:\s*(-?[0-9.]+) dB", volume.stderr)
    assert mean_match and max_match, "unable to parse volumedetect output"
    mean_volume = float(mean_match.group(1))
    max_volume = float(max_match.group(1))
    assert max_volume < 0.0, f"audio peak clips at {max_volume:.1f} dB"
    assert mean_volume > -26.0, f"audio is too quiet at {mean_volume:.1f} dB"
    return mean_volume, max_volume


def main() -> None:
    actual = {path.name for path in OUTPUT_DIR.iterdir() if path.is_file()}
    assert actual == EXPECTED, f"unexpected dome files: {sorted(actual ^ EXPECTED)}"

    pptx_path = OUTPUT_DIR / "ChinaVR_Awatar_论文Demo.pptx"
    docx_path = OUTPUT_DIR / "ChinaVR_Awatar_逐页中文讲述词.docx"
    video_path = OUTPUT_DIR / "ChinaVR_Awatar_论文Demo.mp4"

    pptx_text, pptx_names = archive_text(pptx_path)
    slide_names = [
        name
        for name in pptx_names
        if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)
    ]
    assert len(slide_names) == 6, f"expected 6 PPT slides, got {len(slide_names)}"
    with zipfile.ZipFile(pptx_path) as pptx:
        presentation_xml = pptx.read("ppt/presentation.xml").decode("utf-8")
        core_xml = pptx.read("docProps/core.xml").decode("utf-8")
    size_match = re.search(
        r"<p:sldSz[^>]*cx=\"(\d+)\"[^>]*cy=\"(\d+)\"",
        presentation_xml,
    )
    assert size_match, "PPT slide size missing"
    slide_width, slide_height = map(int, size_match.groups())
    assert abs(slide_width / slide_height - 16 / 9) < 0.001
    assert "Anonymous" in core_xml

    docx_text, docx_names = archive_text(docx_path)
    assert "word/document.xml" in docx_names
    assert docx_text.count("实测配音：") == 6
    with zipfile.ZipFile(docx_path) as docx:
        docx_core = docx.read("docProps/core.xml").decode("utf-8")
    assert "Anonymous" in docx_core

    for required in REQUIRED_TEXT:
        assert required in pptx_text, f"PPT missing required text: {required}"
        assert required in docx_text, f"DOCX missing required text: {required}"

    metadata = ffprobe(video_path)
    video_stream = next(
        stream for stream in metadata["streams"] if stream["codec_type"] == "video"
    )
    audio_stream = next(
        stream for stream in metadata["streams"] if stream["codec_type"] == "audio"
    )
    duration = float(metadata["format"]["duration"])
    assert duration >= 100.0, f"video is unexpectedly short: {duration:.3f}s"
    assert duration <= 110.0, f"video exceeds target duration: {duration:.3f}s"
    assert duration < 120.0, f"video exceeds absolute duration: {duration:.3f}s"
    narration_manifest = (
        ROOT_DIR / "paper" / "demo_build" / "audio" / "durations.json"
    )
    assert video_path.stat().st_mtime > pptx_path.stat().st_mtime, (
        "video is older than PPTX"
    )
    assert video_path.stat().st_mtime > narration_manifest.stat().st_mtime, (
        "video is older than narration manifest"
    )
    assert video_stream["codec_name"] == "h264"
    assert video_stream["width"] == 1920
    assert video_stream["height"] == 1080
    assert video_stream["pix_fmt"] == "yuv420p"
    assert video_stream["r_frame_rate"] == "30/1"
    average_frame_rate = float(Fraction(video_stream["avg_frame_rate"]))
    assert abs(average_frame_rate - 30.0) < 0.05
    assert audio_stream["codec_name"] == "aac"
    assert int(audio_stream["sample_rate"]) == 48_000
    mean_volume, max_volume = verify_audio_decode_and_volume(video_path)

    report = {
        "deliverables": {
            name: (OUTPUT_DIR / name).stat().st_size for name in sorted(EXPECTED)
        },
        "ppt_slides": len(slide_names),
        "ppt_aspect_ratio": "16:9",
        "docx_narration_sections": docx_text.count("实测配音："),
        "video_duration_seconds": round(duration, 3),
        "video_safety_margin_to_120_seconds": round(120.0 - duration, 3),
        "video_codec": video_stream["codec_name"],
        "video_resolution": f"{video_stream['width']}x{video_stream['height']}",
        "video_frame_rate": video_stream["r_frame_rate"],
        "video_average_frame_rate": round(average_frame_rate, 4),
        "audio_codec": audio_stream["codec_name"],
        "audio_sample_rate": int(audio_stream["sample_rate"]),
        "audio_mean_volume_db": mean_volume,
        "audio_max_volume_db": max_volume,
        "required_text": REQUIRED_TEXT,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()

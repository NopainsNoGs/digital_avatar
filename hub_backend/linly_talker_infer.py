from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import sys
from pathlib import Path


LINLY_TALKER_DIR = Path("/home/czg/czg/python_projects/Linly-Talker")


def _prepare_linly_imports() -> None:
    os.chdir(LINLY_TALKER_DIR)
    os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba_cache")
    Path(os.environ["NUMBA_CACHE_DIR"]).mkdir(parents=True, exist_ok=True)
    linly_path = str(LINLY_TALKER_DIR)
    if linly_path not in sys.path:
        sys.path.insert(0, linly_path)


def _load_wav2lip_class():
    wav2lip_module_path = LINLY_TALKER_DIR / "TFG" / "Wav2Lip.py"
    spec = importlib.util.spec_from_file_location("linly_talker_wav2lip", wav2lip_module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load Wav2Lip module from {wav2lip_module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.Wav2Lip


def generate_video(
    face_image_path: str,
    audio_path: str,
    output_video_path: str,
    talker_method: str = "SadTalker",
    batch_size: int = 1,
    fps: int = 20,
) -> str:
    _prepare_linly_imports()

    face_image = Path(face_image_path).expanduser().resolve()
    driven_audio = Path(audio_path).expanduser().resolve()
    output_video = Path(output_video_path).expanduser().resolve()

    if not face_image.is_file():
        raise FileNotFoundError(f"Face image not found: {face_image}")
    if not driven_audio.is_file():
        raise FileNotFoundError(f"Audio file not found: {driven_audio}")

    output_video.parent.mkdir(parents=True, exist_ok=True)

    if talker_method == "SadTalker":
        from TFG import SadTalker

        talker = SadTalker(lazy_load=True)
        generated_video = talker.test2(
            str(face_image),
            str(driven_audio),
            preprocess="crop",
            still_mode=False,
            use_enhancer=False,
            batch_size=batch_size,
            size=256,
            pose_style=0,
            facerender="facevid2vid",
            exp_scale=1.0,
            use_ref_video=False,
            ref_video=None,
            ref_info="pose",
            use_idle_mode=False,
            length_of_audio=5,
            use_blink=True,
            fps=fps,
            result_dir=str(LINLY_TALKER_DIR / "results"),
        )
    elif talker_method == "Wav2Lip":
        Wav2Lip = _load_wav2lip_class()
        talker = Wav2Lip("checkpoints/wav2lip_gan.pth")
        generated_video = talker.predict(str(face_image), str(driven_audio), batch_size, fps=fps)
    else:
        raise ValueError(f"Unsupported talker method: {talker_method}")

    generated_path = Path(generated_video)
    if not generated_path.is_absolute():
        generated_path = LINLY_TALKER_DIR / generated_path
    generated_path = generated_path.resolve()

    if not generated_path.is_file():
        raise FileNotFoundError(f"Linly-Talker did not create a video: {generated_path}")

    if generated_path != output_video:
        shutil.copy2(generated_path, output_video)

    if not output_video.is_file() or output_video.stat().st_size == 0:
        raise RuntimeError(f"Output video was not created correctly: {output_video}")

    return str(output_video)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Linly-Talker inference for one audio file.")
    parser.add_argument("--face", required=True, help="Absolute path to the source face image.")
    parser.add_argument("--audio", required=True, help="Absolute path to the driving audio file.")
    parser.add_argument("--output", required=True, help="Absolute path for the generated MP4.")
    parser.add_argument("--method", default="SadTalker", choices=("SadTalker", "Wav2Lip"))
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--fps", type=int, default=20)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = generate_video(
        face_image_path=args.face,
        audio_path=args.audio,
        output_video_path=args.output,
        talker_method=args.method,
        batch_size=args.batch_size,
        fps=args.fps,
    )
    print(output_path)


if __name__ == "__main__":
    main()

from __future__ import annotations

import contextlib
import importlib.util
import json
import os
import shutil
import sys
import time
import traceback
from pathlib import Path
from typing import Any


LINLY_TALKER_DIR = Path("/home/czg/czg/python_projects/Linly-Talker")


def _write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _prepare_linly_imports() -> None:
    os.chdir(LINLY_TALKER_DIR)
    linly_path = str(LINLY_TALKER_DIR)
    if linly_path not in sys.path:
        sys.path.insert(0, linly_path)


def _resolve_generated_path(generated_video: str) -> Path:
    generated_path = Path(generated_video)
    if not generated_path.is_absolute():
        generated_path = LINLY_TALKER_DIR / generated_path
    return generated_path.resolve()


def _load_talker() -> Any:
    _prepare_linly_imports()
    os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba_cache")
    Path(os.environ["NUMBA_CACHE_DIR"]).mkdir(parents=True, exist_ok=True)

    wav2lip_module_path = LINLY_TALKER_DIR / "TFG" / "Wav2Lip.py"
    spec = importlib.util.spec_from_file_location("linly_talker_wav2lip", wav2lip_module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load Wav2Lip module from {wav2lip_module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    with contextlib.redirect_stdout(sys.stderr):
        spec.loader.exec_module(module)

        return module.Wav2Lip("checkpoints/wav2lip_gan.pth")


def _cache_face_box(talker: Any, face_path: Path) -> list[int]:
    import cv2

    frame = cv2.imread(str(face_path))
    if frame is None:
        raise FileNotFoundError(f"Face image cannot be read: {face_path}")

    with contextlib.redirect_stdout(sys.stderr):
        detected_faces = talker.face_detect([frame])

    if not detected_faces:
        raise RuntimeError(f"No face detected in source image: {face_path}")

    y1, y2, x1, x2 = detected_faces[0][1]
    return [int(y1), int(y2), int(x1), int(x2)]


def _render_video(talker: Any, request: dict[str, Any], face_boxes: dict[str, list[int]]) -> dict[str, Any]:
    if request.get("method") != "Wav2Lip":
        raise ValueError(f"Unsupported talker method: {request.get('method')}")

    face_path = Path(str(request["face"])).expanduser().resolve()
    audio_path = Path(str(request["audio"])).expanduser().resolve()
    output_path = Path(str(request["output"])).expanduser().resolve()
    batch_size = int(request.get("batch_size", 4))
    fps = int(request.get("fps", 20))

    if not face_path.is_file():
        raise FileNotFoundError(f"Face image not found: {face_path}")
    if not audio_path.is_file():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    face_key = str(face_path)
    if face_key not in face_boxes:
        face_boxes[face_key] = _cache_face_box(talker, face_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    talker.box = face_boxes[face_key]
    talker.fps = fps

    started_at = time.perf_counter()
    with contextlib.redirect_stdout(sys.stderr):
        generated_video = talker.predict(str(face_path), str(audio_path), batch_size, fps=fps)

    generated_path = _resolve_generated_path(generated_video)
    if not generated_path.is_file():
        raise FileNotFoundError(f"Linly-Talker did not create a video: {generated_path}")

    if generated_path != output_path:
        shutil.copy2(generated_path, output_path)

    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError(f"Output video was not created correctly: {output_path}")

    return {
        "type": "render_result",
        "ok": True,
        "output": str(output_path),
        "seconds": round(time.perf_counter() - started_at, 3),
    }


def main() -> int:
    try:
        talker = _load_talker()
        face_boxes: dict[str, list[int]] = {}
        _write_response({"type": "ready", "ok": True})
    except Exception:
        _write_response({"type": "ready", "ok": False, "error": traceback.format_exc()[-4000:]})
        return 1

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            request_type = request.get("type")

            if request_type == "shutdown":
                _write_response({"type": "shutdown", "ok": True})
                return 0

            if request_type == "warmup_face":
                face_path = Path(str(request["face"])).expanduser().resolve()
                face_boxes[str(face_path)] = _cache_face_box(talker, face_path)
                _write_response({"type": "warmup_face_result", "ok": True})
                continue

            if request_type == "render":
                _write_response(_render_video(talker, request, face_boxes))
                continue

            raise ValueError(f"Unsupported worker request type: {request_type}")
        except Exception:
            _write_response({"type": "error", "ok": False, "error": traceback.format_exc()[-4000:]})

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import json
import os
import select
import subprocess
import threading
import time
from pathlib import Path
from typing import Any


LINLY_TALKER_PYTHON = Path("/home/czg/anaconda3/envs/linly_talker/bin/python")
LINLY_TALKER_DIR = Path("/home/czg/czg/python_projects/Linly-Talker")
LINLY_TALKER_FACE_IMAGE = Path("/home/czg/czg/python_projects/Linly-Talker/inputs/avatar.png")
LINLY_TALKER_INFERENCE_SCRIPT = Path(__file__).with_name("linly_talker_infer.py")
LINLY_TALKER_WORKER_SCRIPT = Path(__file__).with_name("linly_talker_worker.py")
LINLY_TALKER_SERVICE_LOG = Path(os.getenv("LINLY_TALKER_SERVICE_LOG", "/tmp/linly_talker_worker.log"))
LINLY_TALKER_METHOD = "Wav2Lip"
LINLY_TALKER_BATCH_SIZE = int(os.getenv("LINLY_TALKER_BATCH_SIZE", "4"))
LINLY_TALKER_FPS = int(os.getenv("LINLY_TALKER_FPS", "20"))
LINLY_TALKER_SERVICE_START_TIMEOUT_SEC = float(os.getenv("LINLY_TALKER_SERVICE_START_TIMEOUT_SEC", "120"))
LINLY_TALKER_SERVICE_CALL_TIMEOUT_SEC = float(os.getenv("LINLY_TALKER_SERVICE_CALL_TIMEOUT_SEC", "180"))

_talker_service_process: subprocess.Popen[str] | None = None
_talker_service_lock = threading.Lock()
_talker_service_inference_lock = threading.Lock()
_talker_service_ready = False
_talker_service_face_cached = False


class VideoGenerationError(RuntimeError):
    pass


def _tail_process_output(output: str | None, limit: int = 4000) -> str:
    if not output:
        return ""
    return output[-limit:]


def _validate_common_inputs(audio_file: Path, face_image: Path) -> None:
    if not LINLY_TALKER_PYTHON.is_file():
        raise FileNotFoundError(f"Linly-Talker Python executable not found: {LINLY_TALKER_PYTHON}")
    if not LINLY_TALKER_DIR.is_dir():
        raise FileNotFoundError(f"Linly-Talker directory not found: {LINLY_TALKER_DIR}")
    if not face_image.is_file():
        raise FileNotFoundError(f"Face image not found: {face_image}")
    if not audio_file.is_file():
        raise FileNotFoundError(f"Audio file not found: {audio_file}")


def _is_talker_service_alive() -> bool:
    return _talker_service_process is not None and _talker_service_process.poll() is None


def _read_talker_worker_response(timeout_sec: float) -> dict[str, Any]:
    process = _talker_service_process
    if process is None or process.stdout is None:
        raise VideoGenerationError("Talker worker process is not running.")

    deadline = time.time() + timeout_sec
    while True:
        if process.poll() is not None:
            line = process.stdout.readline()
            if not line:
                raise VideoGenerationError(
                    "Talker worker exited before returning a response "
                    f"(exit code {process.returncode}). See log: {LINLY_TALKER_SERVICE_LOG}"
                )
        else:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise VideoGenerationError(
                    f"Talker worker did not return a response within {timeout_sec:.0f}s. "
                    f"See log: {LINLY_TALKER_SERVICE_LOG}"
                )
            readable, _, _ = select.select([process.stdout], [], [], remaining)
            if not readable:
                continue
            line = process.stdout.readline()

        line = line.strip()
        if not line:
            continue

        try:
            return json.loads(line)
        except json.JSONDecodeError as exc:
            raise VideoGenerationError(f"Invalid talker worker response: {line[:1000]}") from exc


def _send_talker_worker_request(payload: dict[str, Any], timeout_sec: float) -> dict[str, Any]:
    process = _talker_service_process
    if process is None or process.stdin is None or not _is_talker_service_alive():
        raise VideoGenerationError("Talker worker process is not running.")

    try:
        process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        process.stdin.flush()
    except OSError as exc:
        raise VideoGenerationError(f"Unable to write to talker worker: {exc}") from exc

    response = _read_talker_worker_response(timeout_sec)
    if response.get("ok") is False:
        raise VideoGenerationError(str(response.get("error") or "Talker worker request failed."))
    return response


def _start_talker_service_process() -> None:
    global _talker_service_process

    if _is_talker_service_alive():
        return

    if not LINLY_TALKER_WORKER_SCRIPT.is_file():
        raise FileNotFoundError(f"Talker worker script not found: {LINLY_TALKER_WORKER_SCRIPT}")

    LINLY_TALKER_SERVICE_LOG.parent.mkdir(parents=True, exist_ok=True)
    with LINLY_TALKER_SERVICE_LOG.open("ab") as service_log:
        _talker_service_process = subprocess.Popen(
            [str(LINLY_TALKER_PYTHON), str(LINLY_TALKER_WORKER_SCRIPT)],
            cwd=str(LINLY_TALKER_DIR),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=service_log,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env={
                **os.environ,
                "PYTHONUNBUFFERED": "1",
                "NUMBA_CACHE_DIR": os.getenv("NUMBA_CACHE_DIR", "/tmp/numba_cache"),
            },
        )


def _terminate_talker_process(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return

    try:
        if process.stdin is not None:
            process.stdin.write(json.dumps({"type": "shutdown"}) + "\n")
            process.stdin.flush()
    except OSError:
        pass

    try:
        process.wait(timeout=3)
        return
    except subprocess.TimeoutExpired:
        pass

    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


def warm_up_talker_service() -> None:
    global _talker_service_process
    global _talker_service_ready
    global _talker_service_face_cached

    face_image = LINLY_TALKER_FACE_IMAGE.expanduser().resolve()

    with _talker_service_lock:
        if _talker_service_ready and _talker_service_face_cached and _is_talker_service_alive():
            return

        _talker_service_ready = False
        _talker_service_face_cached = False
        _start_talker_service_process()

        try:
            response = _read_talker_worker_response(LINLY_TALKER_SERVICE_START_TIMEOUT_SEC)
            if response.get("type") != "ready" or response.get("ok") is not True:
                raise VideoGenerationError(str(response.get("error") or "Talker worker failed to start."))

            warmup_response = _send_talker_worker_request(
                {"type": "warmup_face", "face": str(face_image)},
                LINLY_TALKER_SERVICE_CALL_TIMEOUT_SEC,
            )
            if warmup_response.get("ok") is not True:
                raise VideoGenerationError(str(warmup_response.get("error") or "Talker face warmup failed."))

            _talker_service_ready = True
            _talker_service_face_cached = True
        except Exception:
            process = _talker_service_process
            _talker_service_process = None
            _talker_service_ready = False
            _talker_service_face_cached = False
            _terminate_talker_process(process)
            raise



def shutdown_talker_service() -> None:
    global _talker_service_process
    global _talker_service_ready
    global _talker_service_face_cached

    with _talker_service_lock:
        process = _talker_service_process
        _talker_service_process = None
        _talker_service_ready = False
        _talker_service_face_cached = False

    _terminate_talker_process(process)


def _generate_video_via_service(audio_file: Path, face_image: Path, output_file: Path) -> None:
    warm_up_talker_service()

    with _talker_service_inference_lock:
        response = _send_talker_worker_request(
            {
                "type": "render",
                "face": str(face_image),
                "audio": str(audio_file),
                "output": str(output_file),
                "method": LINLY_TALKER_METHOD,
                "batch_size": LINLY_TALKER_BATCH_SIZE,
                "fps": LINLY_TALKER_FPS,
            },
            LINLY_TALKER_SERVICE_CALL_TIMEOUT_SEC,
        )

    if response.get("ok") is not True:
        raise VideoGenerationError(str(response.get("error") or "Talker worker render failed."))


def _generate_video_via_legacy_subprocess(audio_file: Path, face_image: Path, output_file: Path) -> None:
    if not LINLY_TALKER_INFERENCE_SCRIPT.is_file():
        raise FileNotFoundError(f"Linly-Talker inference script not found: {LINLY_TALKER_INFERENCE_SCRIPT}")

    command = [
        str(LINLY_TALKER_PYTHON),
        str(LINLY_TALKER_INFERENCE_SCRIPT),
        "--face",
        str(face_image),
        "--audio",
        str(audio_file),
        "--output",
        str(output_file),
        "--method",
        LINLY_TALKER_METHOD,
        "--batch-size",
        str(LINLY_TALKER_BATCH_SIZE),
        "--fps",
        str(LINLY_TALKER_FPS),
    ]

    subprocess.run(
        command,
        cwd=str(LINLY_TALKER_DIR),
        check=True,
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "NUMBA_CACHE_DIR": os.getenv("NUMBA_CACHE_DIR", "/tmp/numba_cache"),
        },
    )


def auto_generate_video(audio_path: str, output_video_path: str) -> str:
    audio_file = Path(audio_path).expanduser().resolve()
    output_file = Path(output_video_path).expanduser().resolve()
    face_image = LINLY_TALKER_FACE_IMAGE.expanduser().resolve()

    _validate_common_inputs(audio_file, face_image)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        try:
            _generate_video_via_service(audio_file, face_image, output_file)
        except Exception as service_exc:
            print(f"⚠️ Linly-Talker worker 渲染失败，切换到 subprocess 兜底: {service_exc}")
            _generate_video_via_legacy_subprocess(audio_file, face_image, output_file)
    except subprocess.CalledProcessError as exc:
        stderr = _tail_process_output(exc.stderr)
        stdout = _tail_process_output(exc.stdout)
        detail = stderr or stdout or "No subprocess output captured."
        raise VideoGenerationError(
            f"Linly-Talker inference failed with exit code {exc.returncode}: {detail}"
        ) from exc
    except OSError as exc:
        raise VideoGenerationError(f"Unable to execute Linly-Talker subprocess: {exc}") from exc

    if not output_file.is_file() or output_file.stat().st_size == 0:
        raise VideoGenerationError(f"Linly-Talker did not create output video: {output_file}")

    return str(output_file)

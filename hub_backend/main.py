import asyncio
import contextlib
import json
import os
import re
import struct
import sys
import threading
import time
import uuid
from typing import Any

import httpx
import numpy as np
import torch
import torchaudio.transforms as T
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from funasr import AutoModel
from openai import AsyncOpenAI


VISEME_FPS = 60


def build_viseme_track(audio_tensor, sample_rate=22050, fps=VISEME_FPS, time_offset=0.0, verbose=False):
    if verbose:
        print("   -> [后台线程] 开始处理音频张量...")
    audio_tensor = audio_tensor.detach().cpu()

    if audio_tensor.shape[0] > 1:
        audio_tensor = audio_tensor.mean(dim=0, keepdim=True)

    mel_transform = T.MelSpectrogram(
        sample_rate=sample_rate,
        n_fft=1024,
        hop_length=sample_rate // fps,
        n_mels=80,
    ).cpu()

    if verbose:
        print("   -> [后台线程] 正在进行梅尔频谱数学变换 (最耗时步骤)...")
    mels = mel_transform(audio_tensor)[0]
    if verbose:
        print(f"   -> [后台线程] 频谱计算完成，总帧数: {mels.shape[1]}，开始映射嘴型...")

    track = []
    for i in range(mels.shape[1]):
        frame = mels[:, i]
        energy = torch.sum(frame).item()

        low_energy = torch.sum(frame[:20]).item()
        high_energy = torch.sum(frame[40:]).item()
        total_energy = low_energy + high_energy + 1e-6

        mouth_y = min(energy / 150.0, 1.0) if energy > 5.0 else 0.0

        mouth_form = 1.0
        if energy > 10.0:
            if low_energy / total_energy > 0.65:
                mouth_form = -1.0
            elif high_energy / total_energy > 0.5:
                mouth_form = 1.0
            else:
                mouth_form = 0.0

        track.append({
            "t": round(time_offset + (i / fps), 3),
            "y": round(mouth_y, 3),
            "f": round(mouth_form, 3),
        })

    if verbose:
        print("   -> [后台线程] 👄 口型轨迹生成完毕！")
    return track


def generate_viseme_track(audio_tensor, sample_rate=22050, fps=VISEME_FPS):
    return build_viseme_track(audio_tensor, sample_rate=sample_rate, fps=fps, verbose=True)


def generate_viseme_chunk(audio_tensor, sample_rate=22050, fps=VISEME_FPS):
    """
    针对当前音频 chunk 即时生成相对时间嘴型帧。
    这里不等待整段音频，只对每个 TTS chunk 就地做一次轻量频谱映射。
    """
    return build_viseme_track(audio_tensor, sample_rate=sample_rate, fps=fps, time_offset=0.0, verbose=False)


# 强制屏蔽系统代理，防止 httpx 报错
os.environ.pop("http_proxy", None)
os.environ.pop("https_proxy", None)
os.environ.pop("all_proxy", None)
os.environ["NO_PROXY"] = "localhost,127.0.0.1"

# 将 CosyVoice 及其隐藏的第三方核心库加入系统路径
base_dir = os.path.dirname(os.path.abspath(__file__))
cosy_dir = os.path.join(base_dir, "CosyVoice")
static_dir = os.path.join(base_dir, "static")
os.makedirs(static_dir, exist_ok=True)

sys.path.append(cosy_dir)
sys.path.append(os.path.join(cosy_dir, "third_party", "Matcha-TTS"))
sys.path.append(os.path.join(cosy_dir, "third_party", "AcademiCodec"))

from cosyvoice.cli.cosyvoice import CosyVoice


EARLY_SPLIT_PUNCTUATION = set("，,。！？!?；;：:")
EARLY_FORCE_SPLIT_MIN_CHARS = 8
EARLY_FORCE_SPLIT_TARGET_CHARS = 12
EARLY_FORCE_SPLIT_MAX_WAIT_SEC = 0.35
EARLY_FORCE_SPLIT_OPENING_PHRASES: tuple[str, ...] = ()
LLM_KEEPALIVE_INTERVAL_SEC = 240
TTS_SPK_ID = os.getenv("COSYVOICE_SPK_ID", "中文女")
LLM_MODEL_NAME = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
EMOTION_MODE_SEQUENCE = ("neutral", "smile", "shy", "sad", "angry", "surprised")
VALID_EMOTION_MODES = {"neutral", "smile", "shy", "sad", "angry", "surprised"}
VALID_ACTION_CARD_TYPES = {"NAVIGATE", "ALERT", "INFO"}
USER_MODALITY_BASE_WEIGHTS = {
    "facial": 0.35,
    "prosody": 0.25,
    "text": 0.40,
}
TEXT_EMOTION_KEYWORDS: dict[str, tuple[tuple[str, float], ...]] = {
    "smile": (
        ("谢谢", 1.2),
        ("太好了", 1.4),
        ("开心", 1.2),
        ("顺利", 0.8),
        ("终于", 0.7),
        ("辛苦", 0.4),
    ),
    "shy": (
        ("不好意思", 1.5),
        ("麻烦", 0.8),
        ("请问", 0.6),
        ("方便吗", 0.7),
        ("可以吗", 0.7),
        ("想咨询", 0.5),
    ),
    "sad": (
        ("着急", 1.3),
        ("赶时间", 1.3),
        ("来不及", 1.5),
        ("找不到", 1.2),
        ("丢了", 1.6),
        ("没赶上", 1.4),
        ("错过", 1.3),
        ("担心", 1.2),
        ("怎么办", 1.0),
        ("帮帮我", 1.3),
        ("迷路", 1.1),
    ),
    "angry": (
        ("投诉", 1.8),
        ("为什么", 0.9),
        ("怎么回事", 1.6),
        ("太慢", 1.4),
        ("搞错", 1.6),
        ("离谱", 1.6),
        ("生气", 1.8),
        ("气死", 1.8),
        ("不合理", 1.5),
        ("耽误", 1.2),
        ("一直等", 1.2),
    ),
    "surprised": (
        ("怎么会", 1.6),
        ("竟然", 1.5),
        ("居然", 1.5),
        ("突然", 1.2),
        ("天哪", 1.8),
        ("真的吗", 1.2),
        ("什么情况", 1.4),
    ),
}
UNSET = object()
MODELSCOPE_CACHE_ROOT = os.path.expanduser("~/.cache/modelscope/hub")

def resolve_local_model_path(model_name: str) -> str:
    """
    优先走本机 modelscope 缓存，避免每次启动都触发远端检查或下载提示。
    """
    candidate_paths = [
        os.path.join(MODELSCOPE_CACHE_ROOT, "models", "iic", model_name),
        os.path.join(MODELSCOPE_CACHE_ROOT, "iic", model_name),
        os.path.join(MODELSCOPE_CACHE_ROOT, "pretrained_models", model_name),
    ]

    for candidate_path in candidate_paths:
        if os.path.isdir(candidate_path):
            return candidate_path

    return f"iic/{model_name}"


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

print("正在加载 SenseVoice (耳朵) ...")
sensevoice_model_path = resolve_local_model_path("SenseVoiceSmall")
asr_model = AutoModel(
    model=sensevoice_model_path,
    trust_remote_code=True,
    device="cuda:0",
    disable_update=True,
)

print("正在加载 CosyVoice (嘴巴) ... (第一次运行会自动下载约 3GB 模型)")
cosyvoice_model_path = resolve_local_model_path("CosyVoice-300M-SFT")
tts_model = CosyVoice(cosyvoice_model_path)

print("✅ 所有感官器官加载完毕！")
print(f"🧠 当前主 LLM 模型: {LLM_MODEL_NAME}")

custom_http_client = httpx.AsyncClient(trust_env=False)
llm_client = AsyncOpenAI(
    api_key="ollama",
    base_url="http://localhost:11434/v1",
    http_client=custom_http_client,
)
llm_keepalive_task: asyncio.Task | None = None


async def warm_up_llm_model(reason: str) -> None:
    """
    通过一次极小请求把 Ollama 里的 Qwen 先拉进显存，避免首个旅客触发冷启动。
    """
    print(f"♨️ 正在预热 LLM ({reason}) ...")
    try:
        await asyncio.wait_for(
            llm_client.chat.completions.create(
                model=LLM_MODEL_NAME,
                temperature=0.0,
                max_tokens=8,
                messages=[
                    {"role": "system", "content": "你是系统预热请求，只回复一个字。"},
                    {"role": "user", "content": "好"},
                ],
            ),
            timeout=120,
        )
        print(f"♨️ LLM 预热完成 ({reason})")
    except Exception as exc:
        print(f"⚠️ LLM 预热失败 ({reason}): {exc}")


def warm_up_tts_model() -> None:
    """
    先跑一次最小 TTS，把首句 synthesis 的图编译和缓存开销提前吃掉。
    """
    print("♨️ 正在预热 CosyVoice ...")
    try:
        for _ in tts_model.inference_sft("您好，", TTS_SPK_ID, stream=True):
            break
        print("♨️ CosyVoice 预热完成")
    except Exception as exc:
        print(f"⚠️ CosyVoice 预热失败: {exc}")


async def maintain_llm_keepalive() -> None:
    while True:
        await asyncio.sleep(LLM_KEEPALIVE_INTERVAL_SEC)
        await warm_up_llm_model("keepalive")


@app.on_event("startup")
async def startup_event() -> None:
    global llm_keepalive_task

    await warm_up_llm_model("startup")
    await asyncio.to_thread(warm_up_tts_model)
    llm_keepalive_task = asyncio.create_task(maintain_llm_keepalive())


@app.on_event("shutdown")
async def shutdown_event() -> None:
    global llm_keepalive_task

    if llm_keepalive_task is not None:
        llm_keepalive_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await llm_keepalive_task
        llm_keepalive_task = None

    await custom_http_client.aclose()


def sanitize_stream_text(text: str) -> str:
    """去掉流式文本中的换行和 markdown 噪音，避免字幕和 TTS 出现脏字符。"""
    text = text.replace("\r", "").replace("\n", "")
    text = text.replace("```", "")
    return text


def sanitize_stream_json_delta(text: str) -> str:
    """LLM 在 JSON 流里偶尔会混入 markdown fence，这里只做最小清理，保留 JSON 所需空白。"""
    return text.replace("```json", "").replace("```", "").replace("\ufeff", "")


def clean_asr_text(raw_text: str) -> str:
    """清理 SenseVoice 返回的语言标签，保留最终给 LLM 的自然语言文本。"""
    return re.sub(r"<\|.*?\|>", "", raw_text).strip()


def longest_common_prefix_length(left: str, right: str) -> int:
    prefix_length = 0
    for left_char, right_char in zip(left, right):
        if left_char != right_char:
            break
        prefix_length += 1
    return prefix_length


def normalize_emotion_mode(value: Any) -> str:
    if isinstance(value, str) and value in VALID_EMOTION_MODES:
        return value
    return "neutral"


def normalize_reply_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return sanitize_stream_text(value).strip()


def normalize_action_card(value: Any) -> dict[str, str] | None:
    if value is None:
        return None

    if not isinstance(value, dict):
        return None

    card_type = str(value.get("type", "")).upper()
    title = str(value.get("title", "")).strip()
    content = str(value.get("content", "")).strip()

    if card_type not in VALID_ACTION_CARD_TYPES or not title or not content:
        return None

    return {
        "type": card_type,
        "title": title,
        "content": content,
    }


def normalize_agent_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    return {
        "replyText": normalize_reply_text(payload.get("replyText")),
        "emotionMode": normalize_emotion_mode(payload.get("emotionMode")),
        "actionCard": normalize_action_card(payload.get("actionCard")),
    }


def clamp_unit(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, numeric))


def create_empty_emotion_scores() -> dict[str, float]:
    return {mode: 0.0 for mode in EMOTION_MODE_SEQUENCE}


def normalize_emotion_scores(value: Any) -> dict[str, float]:
    scores = create_empty_emotion_scores()
    if isinstance(value, dict):
        for mode in EMOTION_MODE_SEQUENCE:
            try:
                scores[mode] = max(0.0, float(value.get(mode, 0.0)))
            except (TypeError, ValueError):
                scores[mode] = 0.0

    total = sum(scores.values())
    if total <= 1e-6:
        scores["neutral"] = 1.0
        total = 1.0

    return {mode: round(scores[mode] / total, 4) for mode in EMOTION_MODE_SEQUENCE}


def infer_dominant_emotion(scores: dict[str, float], sample_count: int = 1) -> tuple[str, float]:
    ranked_scores = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top_mode, top_score = ranked_scores[0]
    second_score = ranked_scores[1][1] if len(ranked_scores) > 1 else 0.0
    margin = max(0.0, top_score - second_score)
    sample_confidence = min(1.0, max(0.0, sample_count / 24))
    confidence = clamp_unit((top_score * 0.62) + (margin * 0.78) + (sample_confidence * 0.2))
    return top_mode, round(confidence, 4)


def normalize_prosody_metrics(value: Any) -> dict[str, float] | None:
    if not isinstance(value, dict):
        return None

    metrics: dict[str, float] = {}
    for key in ("averageVolume", "peakVolume", "variation", "speechRatio", "zeroCrossingRate"):
        try:
            metrics[key] = round(float(value.get(key, 0.0)), 4)
        except (TypeError, ValueError):
            metrics[key] = 0.0
    return metrics


def normalize_modality_signal(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    sample_count = 0
    try:
        sample_count = max(0, int(value.get("sampleCount", 0)))
    except (TypeError, ValueError):
        sample_count = 0

    raw_emotion = normalize_emotion_mode(value.get("emotion"))
    scores = normalize_emotion_scores(value.get("scores"))
    if not isinstance(value.get("scores"), dict):
        scores = normalize_emotion_scores({raw_emotion: 1.0})

    emotion, inferred_confidence = infer_dominant_emotion(scores, sample_count=sample_count or 1)
    confidence = clamp_unit(value.get("confidence", inferred_confidence))

    signal: dict[str, Any] = {
        "emotion": emotion,
        "confidence": round(confidence, 4),
        "scores": scores,
        "sampleCount": sample_count,
    }

    prosody_metrics = normalize_prosody_metrics(value.get("metrics"))
    if prosody_metrics is not None:
        signal["metrics"] = prosody_metrics

    return signal


def normalize_client_emotion_context(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    context_payload = {
        "facialEmotion": normalize_modality_signal(value.get("facialEmotion")),
        "prosodyEmotion": normalize_modality_signal(value.get("prosodyEmotion")),
        "captureDurationMs": None,
    }

    try:
        capture_duration = int(value.get("captureDurationMs", 0))
    except (TypeError, ValueError):
        capture_duration = 0

    if capture_duration > 0:
        context_payload["captureDurationMs"] = capture_duration

    if context_payload["facialEmotion"] is None and context_payload["prosodyEmotion"] is None:
        return None

    return context_payload


def analyze_text_emotion(text: str) -> dict[str, Any]:
    clean_text = sanitize_stream_text(text).strip()
    scores = create_empty_emotion_scores()
    scores["neutral"] = 0.28

    if not clean_text:
        normalized_scores = normalize_emotion_scores(scores)
        emotion, confidence = infer_dominant_emotion(normalized_scores)
        return {
            "emotion": emotion,
            "confidence": confidence,
            "scores": normalized_scores,
            "sampleCount": 1,
        }

    for mode, keyword_rules in TEXT_EMOTION_KEYWORDS.items():
        for keyword, weight in keyword_rules:
            hit_count = clean_text.count(keyword)
            if hit_count > 0:
                scores[mode] += weight * hit_count

    exclamation_count = clean_text.count("!") + clean_text.count("！")
    question_count = clean_text.count("?") + clean_text.count("？")

    if exclamation_count > 0:
        scores["surprised"] += 0.22 * exclamation_count
        scores["angry"] += 0.12 * exclamation_count

    if question_count > 0:
        scores["shy"] += 0.08 * question_count
        scores["surprised"] += 0.06 * max(question_count - 1, 0)

    if re.search(r"(快点|马上|立刻|赶快|来不及|赶不上)", clean_text):
        scores["sad"] += 0.9
        scores["surprised"] += 0.55

    if re.search(r"(请问|不好意思|麻烦|方便吗|可以吗)", clean_text):
        scores["shy"] += 0.5

    if re.search(r"(谢谢|麻烦你了|辛苦了)", clean_text):
        scores["smile"] += 0.7

    if re.search(r"(投诉|太慢|为什么还|怎么回事|不合理|一直等)", clean_text):
        scores["angry"] += 0.85

    if len(clean_text) <= 10:
        scores["neutral"] += 0.12

    normalized_scores = normalize_emotion_scores(scores)
    emotion, confidence = infer_dominant_emotion(normalized_scores, sample_count=max(1, len(clean_text) // 4))
    return {
        "emotion": emotion,
        "confidence": confidence,
        "scores": normalized_scores,
        "sampleCount": max(1, len(clean_text) // 4),
    }


def fuse_user_emotion_analysis(transcript: str, client_context: dict[str, Any] | None) -> dict[str, Any]:
    facial_emotion = client_context.get("facialEmotion") if client_context else None
    prosody_emotion = client_context.get("prosodyEmotion") if client_context else None
    text_emotion = analyze_text_emotion(transcript)

    modality_map = {
        "facial": facial_emotion,
        "prosody": prosody_emotion,
        "text": text_emotion,
    }

    raw_weights: dict[str, float] = {}
    for modality_name, base_weight in USER_MODALITY_BASE_WEIGHTS.items():
        signal = modality_map[modality_name]
        if signal is None:
            raw_weights[modality_name] = 0.0
            continue

        confidence = clamp_unit(signal.get("confidence", 0.5))
        sample_count = max(1, int(signal.get("sampleCount", 1)))
        sample_factor = 0.8 + min(1.0, sample_count / (24 if modality_name == "facial" else 30)) * 0.2
        confidence_factor = (0.8 + confidence * 0.2) if modality_name == "text" else (0.65 + confidence * 0.35)
        raw_weights[modality_name] = base_weight * sample_factor * confidence_factor

    total_weight = sum(raw_weights.values())
    if total_weight <= 1e-6:
        raw_weights = {"facial": 0.0, "prosody": 0.0, "text": 1.0}
        total_weight = 1.0

    normalized_weights = {
        key: round(raw_weights.get(key, 0.0) / total_weight, 4)
        for key in ("facial", "prosody", "text")
    }

    fused_scores = create_empty_emotion_scores()
    for modality_name, signal in modality_map.items():
        if signal is None:
            continue

        scores = normalize_emotion_scores(signal.get("scores"))
        modality_weight = normalized_weights[modality_name]
        for mode in EMOTION_MODE_SEQUENCE:
            fused_scores[mode] += scores[mode] * modality_weight

    normalized_scores = normalize_emotion_scores(fused_scores)
    final_emotion, confidence = infer_dominant_emotion(normalized_scores)

    return {
        "transcript": transcript,
        "finalEmotion": final_emotion,
        "confidence": confidence,
        "weights": normalized_weights,
        "scores": normalized_scores,
        "facialEmotion": facial_emotion,
        "prosodyEmotion": prosody_emotion,
        "textEmotion": text_emotion,
    }


def build_user_emotion_guidance(user_emotion_analysis: dict[str, Any] | None) -> str:
    if not user_emotion_analysis:
        return "当前回合没有可用的多模态情绪上下文。"

    compact_context = {
        "finalEmotion": user_emotion_analysis["finalEmotion"],
        "confidence": user_emotion_analysis["confidence"],
        "weights": user_emotion_analysis["weights"],
        "facialEmotion": user_emotion_analysis.get("facialEmotion", {}).get("emotion") if user_emotion_analysis.get("facialEmotion") else None,
        "prosodyEmotion": user_emotion_analysis.get("prosodyEmotion", {}).get("emotion") if user_emotion_analysis.get("prosodyEmotion") else None,
        "textEmotion": user_emotion_analysis.get("textEmotion", {}).get("emotion") if user_emotion_analysis.get("textEmotion") else None,
    }

    return (
        "以下是本轮旅客的多模态情绪判别结果，请把它当作回复策略依据之一，但不要把这段信息原样说出来：\n"
        f"{json.dumps(compact_context, ensure_ascii=False)}\n"
        "策略要求：\n"
        "1. finalEmotion 表示旅客状态，不是你要输出的 emotionMode。\n"
        "2. 若 finalEmotion 为 sad 或 shy，先安抚，再给明确位置、步骤或时间。\n"
        "3. 若 finalEmotion 为 angry，先共情降温，再给可执行方案，避免顶撞。\n"
        "4. 若 finalEmotion 为 surprised，优先快速确认关键信息，再简洁指引。\n"
        "5. 你输出的 emotionMode 是椿的口播/表情风格，应服务于安抚和指引。"
    )


def extract_delta_text(chunk: Any) -> str:
    """兼容 OpenAI SDK 在不同模型下返回的 delta 结构。"""
    if not getattr(chunk, "choices", None):
        return ""

    delta = chunk.choices[0].delta
    content = getattr(delta, "content", None)
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            text = getattr(item, "text", None)
            if text:
                parts.append(text)
        return "".join(parts)

    return ""


def decode_partial_json_string(source: str, value_start: int) -> tuple[str | None, bool]:
    """
    从 JSON 字符串值的起点开始做增量解码。
    即使结尾引号还没到，也会返回当前已确认的字符串内容，供前端字幕和 TTS 提前消费。
    """
    decoded_chars: list[str] = []
    index = value_start

    while index < len(source):
        char = source[index]

        if char == '"':
            return "".join(decoded_chars), True

        if char != "\\":
            decoded_chars.append(char)
            index += 1
            continue

        if index + 1 >= len(source):
            return "".join(decoded_chars), False

        escaped = source[index + 1]
        simple_escapes = {
            '"': '"',
            "\\": "\\",
            "/": "/",
            "b": "\b",
            "f": "\f",
            "n": "\n",
            "r": "\r",
            "t": "\t",
        }

        if escaped in simple_escapes:
            decoded_chars.append(simple_escapes[escaped])
            index += 2
            continue

        if escaped == "u":
            unicode_end = index + 6
            if unicode_end > len(source):
                return "".join(decoded_chars), False

            unicode_digits = source[index + 2:unicode_end]
            if not re.fullmatch(r"[0-9a-fA-F]{4}", unicode_digits):
                return "".join(decoded_chars), False

            decoded_chars.append(chr(int(unicode_digits, 16)))
            index = unicode_end
            continue

        return "".join(decoded_chars), False

    return "".join(decoded_chars), False


def extract_json_string_property(source: str, key: str) -> tuple[str | None, bool]:
    pattern = re.search(rf'"{re.escape(key)}"\s*:\s*"', source)
    if not pattern:
        return None, False
    return decode_partial_json_string(source, pattern.end())


def find_complete_json_object(source: str) -> str | None:
    """
    逐字符做括号配对，只要最外层对象闭合就立刻返回。
    这里不能用简单正则，因为 replyText 内部可能还会出现括号和引号。
    """
    start_index = source.find("{")
    if start_index < 0:
        return None

    depth = 0
    in_string = False
    escape_next = False

    for index, char in enumerate(source[start_index:], start=start_index):
        if in_string:
            if escape_next:
                escape_next = False
            elif char == "\\":
                escape_next = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start_index:index + 1]

    return None


class StreamedAgentJSONExtractor:
    """
    面向当前机场场景的增量 JSON 提取器。
    它不等整个对象闭合，而是尽早从流里拿到 emotionMode 和 replyText。
    """

    def __init__(self) -> None:
        self.raw_buffer = ""
        self.reply_text = ""
        self.emotion_mode: str | None = None
        self.action_card: dict[str, str] | None = None
        self.final_payload: dict[str, Any] | None = None

    def feed(self, delta_text: str) -> dict[str, Any]:
        self.raw_buffer += sanitize_stream_json_delta(delta_text)
        json_fragment = self._json_fragment()

        result: dict[str, Any] = {
            "replyText": self.reply_text,
            "replyDelta": "",
            "emotionMode": None,
            "actionCard": UNSET,
            "jsonComplete": False,
        }

        if not json_fragment:
            return result

        emotion_mode, emotion_closed = extract_json_string_property(json_fragment, "emotionMode")
        if emotion_closed and emotion_mode is not None:
            normalized_emotion = normalize_emotion_mode(emotion_mode)
            if normalized_emotion != self.emotion_mode:
                self.emotion_mode = normalized_emotion
                result["emotionMode"] = normalized_emotion

        reply_text, _reply_closed = extract_json_string_property(json_fragment, "replyText")
        if reply_text is not None:
            normalized_reply_text = normalize_reply_text(reply_text)
            if normalized_reply_text != self.reply_text:
                prefix_length = longest_common_prefix_length(self.reply_text, normalized_reply_text)
                result["replyDelta"] = normalized_reply_text[prefix_length:]
                self.reply_text = normalized_reply_text
                result["replyText"] = self.reply_text

        complete_json = find_complete_json_object(json_fragment)
        if complete_json is not None:
            try:
                self.final_payload = normalize_agent_payload(json.loads(complete_json))
                result["jsonComplete"] = True

                if self.final_payload["emotionMode"] != self.emotion_mode:
                    self.emotion_mode = self.final_payload["emotionMode"]
                    result["emotionMode"] = self.emotion_mode

                if self.final_payload["replyText"] != self.reply_text:
                    prefix_length = longest_common_prefix_length(self.reply_text, self.final_payload["replyText"])
                    result["replyDelta"] += self.final_payload["replyText"][prefix_length:]
                    self.reply_text = self.final_payload["replyText"]
                    result["replyText"] = self.reply_text

                if self.final_payload["actionCard"] != self.action_card:
                    self.action_card = self.final_payload["actionCard"]
                    result["actionCard"] = self.action_card
            except Exception as exc:
                print(f"⚠️ JSON 完整对象解析失败，继续使用已提取字段: {exc}")

        return result

    def fallback_payload(self) -> dict[str, Any]:
        return normalize_agent_payload(
            {
                "replyText": self.reply_text,
                "emotionMode": self.emotion_mode or "neutral",
                "actionCard": self.action_card,
            }
        )

    def _json_fragment(self) -> str:
        start_index = self.raw_buffer.find("{")
        if start_index < 0:
            return ""
        return self.raw_buffer[start_index:]


def split_ready_sentences(buffer: str) -> tuple[list[str], str]:
    """
    从流式文本缓冲区中尽可能早地切出可以朗读的句段。
    第 1 步优先以标点为边界，逗号也视为可开口的最小停顿点，用于压缩 TTFA。
    """
    ready_sentences: list[str] = []
    segment_start = 0

    for index, char in enumerate(buffer):
        if char not in EARLY_SPLIT_PUNCTUATION:
            continue

        sentence = sanitize_stream_text(buffer[segment_start:index + 1]).strip()
        if sentence:
            ready_sentences.append(sentence)
        segment_start = index + 1

    remaining = sanitize_stream_text(buffer[segment_start:]).strip()
    return ready_sentences, remaining


def is_speakable_sentence(text: str) -> bool:
    """
    过滤只有标点、没有实际可读内容的碎片，避免白白触发一次 TTS。
    """
    clean_text = sanitize_stream_text(text).strip()
    return bool(re.search(r"[\u4e00-\u9fffA-Za-z0-9]", clean_text))


def force_split_sentence(buffer: str, target_chars: int = EARLY_FORCE_SPLIT_TARGET_CHARS) -> tuple[str | None, str]:
    """
    首句迟迟没有标点时，做一次保守强切，优先把前半句尽快送进 TTS。
    这里不插入额外标点，只截取已有文本，避免和前端字幕内容不一致。
    """
    clean_buffer = sanitize_stream_text(buffer).strip()
    if len(clean_buffer) < EARLY_FORCE_SPLIT_MIN_CHARS:
        return None, clean_buffer

    for phrase in EARLY_FORCE_SPLIT_OPENING_PHRASES:
        if clean_buffer.startswith(phrase) and len(clean_buffer) >= len(phrase):
            return phrase, clean_buffer[len(phrase):].strip()

    split_index = min(len(clean_buffer), target_chars)
    forced_sentence = clean_buffer[:split_index].strip()
    remaining = clean_buffer[split_index:].strip()
    if not forced_sentence:
        return None, clean_buffer
    return forced_sentence, remaining


def audio_tensor_to_pcm16_bytes(audio_tensor: torch.Tensor) -> tuple[bytes, int]:
    """
    将 CosyVoice 输出的 float Tensor 立即转成浏览器可消费的 PCM16 小端字节流。
    这里不落盘，不拼接整段 wav，只返回当前 chunk 的裸音频字节。
    """
    audio_tensor = audio_tensor.detach().cpu()

    if audio_tensor.ndim == 1:
        audio_tensor = audio_tensor.unsqueeze(0)

    if audio_tensor.shape[0] > 1:
        audio_tensor = audio_tensor.mean(dim=0, keepdim=True)

    pcm_int16 = (torch.clamp(audio_tensor.squeeze(0), -1.0, 1.0).numpy() * 32767.0).astype(np.int16)
    return pcm_int16.tobytes(), int(pcm_int16.shape[0])


def pack_binary_event(metadata: dict[str, Any], payload: bytes) -> bytes:
    """
    自定义二进制协议:
    - 前 4 字节: metadata JSON 长度 (little-endian uint32)
    - 中间: UTF-8 JSON metadata
    - 尾部: 原始 PCM 音频字节
    这样前端无需 base64 解码，直接能拿到 ArrayBuffer。
    """
    metadata_bytes = json.dumps(metadata, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return struct.pack("<I", len(metadata_bytes)) + metadata_bytes + payload


async def safe_send_json(websocket: WebSocket, send_lock: asyncio.Lock, payload: dict[str, Any]) -> None:
    async with send_lock:
        await websocket.send_json(payload)


async def safe_send_bytes(websocket: WebSocket, send_lock: asyncio.Lock, payload: bytes) -> None:
    async with send_lock:
        await websocket.send_bytes(payload)


async def receive_user_turn(websocket: WebSocket) -> dict[str, Any]:
    """
    正常路径读取前端发来的录音二进制并做 ASR。
    另外保留一个 TEXT_INPUT 调试入口，便于本地直接验证 LLM/TTS/WebSocket 流式链路。
    """
    pending_emotion_context: dict[str, Any] | None = None

    while True:
        message = await websocket.receive()

        if message["type"] == "websocket.disconnect":
            raise WebSocketDisconnect()

        audio_bytes = message.get("bytes")
        if audio_bytes is not None:
            print(f"📦 收到前端语音包，大小: {len(audio_bytes)} bytes")
            temp_audio_path = os.path.join(base_dir, f"temp_record_{uuid.uuid4().hex}.webm")
            try:
                with open(temp_audio_path, "wb") as audio_file:
                    audio_file.write(audio_bytes)

                res = asr_model.generate(input=temp_audio_path, cache={}, language="zh", use_itn=True)
                return {
                    "text": clean_asr_text(res[0]["text"]),
                    "emotionContext": pending_emotion_context,
                }
            finally:
                if os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

        raw_text = message.get("text")
        if raw_text is None:
            return {"text": "", "emotionContext": pending_emotion_context}

        try:
            payload = json.loads(raw_text)
        except json.JSONDecodeError:
            return {"text": raw_text.strip(), "emotionContext": pending_emotion_context}

        message_type = payload.get("type")
        if message_type == "USER_EMOTION_CONTEXT":
            pending_emotion_context = normalize_client_emotion_context(payload.get("payload"))
            continue

        if message_type == "TEXT_INPUT":
            return {
                "text": str(payload.get("text", "")).strip(),
                "emotionContext": normalize_client_emotion_context(payload.get("emotionContext")) or pending_emotion_context,
            }

        return {"text": "", "emotionContext": pending_emotion_context}


async def stream_llm_reply(
    clean_text: str,
    websocket: WebSocket,
    send_lock: asyncio.Lock,
    sentence_queue: asyncio.Queue[str | None],
    user_emotion_analysis: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    让 LLM 流式输出 JSON，并在对象尚未闭合时就提前提取 emotionMode / replyText。
    只要情绪已拿到，且 replyText 出现第一个可朗读停顿点，就立刻把句段投递给 TTS 队列。
    """
    extractor = StreamedAgentJSONExtractor()
    sentence_buffer = ""
    emotion_ready = False
    first_llm_delta_logged = False
    emotion_ready_logged = False
    first_sentence_logged = False
    sentence_buffer_started_at: float | None = None
    turn_started_at = time.perf_counter()
    current_payload = {
        "transcript": clean_text,
        "replyText": "",
        "emotionMode": "neutral",
        "actionCard": None,
    }

    await safe_send_json(
        websocket,
        send_lock,
        {
            "type": "TEXT_STREAM_START",
            "payload": current_payload,
        },
    )

    try:
        response_stream = await llm_client.chat.completions.create(
            model=LLM_MODEL_NAME,
            temperature=0.3,
            stream=True,
            messages=[
                {
                    "role": "system",
                    "content": """你是一个部署在现代化大型国际机场的 AI 虚拟服务专员，名叫椿。
你的任务是为旅客提供专业、礼貌、简洁、适合 TTS 口播的回复。

你必须只输出一个 JSON 对象，不允许输出 Markdown、解释、代码块或额外文本。
键顺序必须严格保持如下顺序：
{
  "emotionMode": "从 [neutral, smile, shy, sad, angry, surprised] 中选择一个",
  "replyText": "给旅客的中文回复，1 到 2 句，50 字以内，第一句必须尽快给出有效信息，不要只有问候语",
  "actionCard": {"type": "INFO", "title": "核心信息", "content": "具体位置或时间"} 或 null
}

规则：
1. emotionMode 必须先输出。
2. replyText 必须适合语音播报，遇到旅客着急时先安抚再指引。
3. 不要单独输出“您好”“别着急”这种孤立开场，若需要安抚，必须和关键信息放在同一句里。
4. actionCard 只有在能提炼出明确位置、时间或事项时才输出，否则为 null。""",
                },
                {
                    "role": "system",
                    "content": build_user_emotion_guidance(user_emotion_analysis),
                },
                {"role": "user", "content": clean_text},
            ],
        )

        async for chunk in response_stream:
            delta_text = extract_delta_text(chunk)
            if not delta_text:
                continue

            if not first_llm_delta_logged:
                first_llm_delta_logged = True
                print(f"🧠 收到首个 LLM delta，耗时: {time.perf_counter() - turn_started_at:.3f}s")

            parser_result = extractor.feed(delta_text)

            if parser_result["emotionMode"] is not None:
                emotion_ready = True
                current_payload["emotionMode"] = parser_result["emotionMode"]
                if not emotion_ready_logged:
                    emotion_ready_logged = True
                    print(f"🙂 emotionMode 已就绪，耗时: {time.perf_counter() - turn_started_at:.3f}s")
                await safe_send_json(
                    websocket,
                    send_lock,
                    {
                        "type": "AGENT_STATE_DELTA",
                        "payload": {
                            "emotionMode": current_payload["emotionMode"],
                        },
                    },
                )

            reply_delta = parser_result["replyDelta"]
            if reply_delta:
                current_payload["replyText"] = parser_result["replyText"]
                if not sentence_buffer:
                    sentence_buffer_started_at = time.perf_counter()
                sentence_buffer += reply_delta
                await safe_send_json(
                    websocket,
                    send_lock,
                    {
                        "type": "TEXT_STREAM_DELTA",
                        "payload": {
                            "delta": reply_delta,
                            "replyText": current_payload["replyText"],
                        },
                    },
                )

            if parser_result["actionCard"] is not UNSET:
                current_payload["actionCard"] = parser_result["actionCard"]
                await safe_send_json(
                    websocket,
                    send_lock,
                    {
                        "type": "AGENT_STATE_DELTA",
                        "payload": {
                            "actionCard": current_payload["actionCard"],
                        },
                    },
                )

            if emotion_ready and sentence_buffer:
                ready_sentences, sentence_buffer = split_ready_sentences(sentence_buffer)
                used_forced_split = False

                if (
                    not ready_sentences
                    and not first_sentence_logged
                    and sentence_buffer_started_at is not None
                    and len(sanitize_stream_text(sentence_buffer).strip()) >= EARLY_FORCE_SPLIT_MIN_CHARS
                    and (time.perf_counter() - sentence_buffer_started_at) >= EARLY_FORCE_SPLIT_MAX_WAIT_SEC
                ):
                    forced_sentence, sentence_buffer = force_split_sentence(sentence_buffer)
                    if forced_sentence:
                        ready_sentences = [forced_sentence]
                        used_forced_split = True

                for sentence in ready_sentences:
                    if not is_speakable_sentence(sentence):
                        continue
                    if not first_sentence_logged:
                        first_sentence_logged = True
                        print(f"✂️ 首个可播句段已切出，耗时: {time.perf_counter() - turn_started_at:.3f}s")
                    if used_forced_split:
                        print(f"⚡ 首句未等到标点，提前强切送入 TTS: {sentence}")
                    print(f"📝 JSON 首句已就绪，准备送入 TTS: {sentence}")
                    await sentence_queue.put(sentence)

                sentence_buffer_started_at = time.perf_counter() if sentence_buffer else None

        final_payload = extractor.final_payload or extractor.fallback_payload()
        final_payload["replyText"] = final_payload["replyText"] or "好的，请稍等。"

        if final_payload["emotionMode"] != current_payload["emotionMode"]:
            current_payload["emotionMode"] = final_payload["emotionMode"]
            await safe_send_json(
                websocket,
                send_lock,
                {
                    "type": "AGENT_STATE_DELTA",
                    "payload": {
                        "emotionMode": current_payload["emotionMode"],
                    },
                },
            )

        if final_payload["replyText"] != current_payload["replyText"]:
            prefix_length = longest_common_prefix_length(current_payload["replyText"], final_payload["replyText"])
            missing_delta = final_payload["replyText"][prefix_length:]
            current_payload["replyText"] = final_payload["replyText"]
            if missing_delta:
                sentence_buffer += missing_delta
                await safe_send_json(
                    websocket,
                    send_lock,
                    {
                        "type": "TEXT_STREAM_DELTA",
                        "payload": {
                            "delta": missing_delta,
                            "replyText": current_payload["replyText"],
                        },
                    },
                )

        if final_payload["actionCard"] != current_payload["actionCard"]:
            current_payload["actionCard"] = final_payload["actionCard"]
            await safe_send_json(
                websocket,
                send_lock,
                {
                    "type": "AGENT_STATE_DELTA",
                    "payload": {
                        "actionCard": current_payload["actionCard"],
                    },
                },
            )

        if not emotion_ready:
            emotion_ready = True

        if emotion_ready and sentence_buffer:
            ready_sentences, sentence_buffer = split_ready_sentences(sentence_buffer)
            for sentence in ready_sentences:
                if not is_speakable_sentence(sentence):
                    continue
                print(f"📝 JSON 收尾句段送入 TTS: {sentence}")
                await sentence_queue.put(sentence)

        if sentence_buffer.strip() and is_speakable_sentence(sentence_buffer.strip()):
            print(f"📝 JSON 最后一段送入 TTS: {sentence_buffer.strip()}")
            await sentence_queue.put(sentence_buffer.strip())

        await safe_send_json(
            websocket,
            send_lock,
            {
                "type": "TEXT_STREAM_END",
                "payload": {
                    "replyText": current_payload["replyText"],
                    "emotionMode": current_payload["emotionMode"],
                    "actionCard": current_payload["actionCard"],
                },
            },
        )

        return {
            "transcript": clean_text,
            "replyText": current_payload["replyText"],
            "emotionMode": current_payload["emotionMode"],
            "actionCard": current_payload["actionCard"],
            "userEmotionAnalysis": user_emotion_analysis,
        }
    except Exception as exc:
        fallback_payload = {
            "transcript": clean_text,
            "replyText": "系统处理异常，请稍后再试。",
            "emotionMode": "sad",
            "actionCard": None,
            "userEmotionAnalysis": user_emotion_analysis,
        }
        print(f"⚠️ LLM 流式推理失败: {exc}")
        await safe_send_json(
            websocket,
            send_lock,
            {
                "type": "AGENT_STATE_DELTA",
                "payload": {
                    "emotionMode": fallback_payload["emotionMode"],
                },
            },
        )
        await safe_send_json(
            websocket,
            send_lock,
            {
                "type": "TEXT_STREAM_DELTA",
                "payload": {
                    "delta": fallback_payload["replyText"],
                    "replyText": fallback_payload["replyText"],
                },
            },
        )
        await safe_send_json(
            websocket,
            send_lock,
            {
                "type": "TEXT_STREAM_END",
                "payload": {
                    "replyText": fallback_payload["replyText"],
                    "emotionMode": fallback_payload["emotionMode"],
                    "actionCard": None,
                },
            },
        )
        await sentence_queue.put(fallback_payload["replyText"])
        return fallback_payload
    finally:
        await sentence_queue.put(None)


async def stream_sentence_audio(
    sentence: str,
    websocket: WebSocket,
    send_lock: asyncio.Lock,
    stream_id: str,
    chunk_index_start: int,
    turn_started_at: float,
    stream_announced: bool,
) -> tuple[int, int, float | None, bool]:
    """
    把单个句段交给 CosyVoice 的流式生成器。
    由于 CosyVoice 生成是同步阻塞的，这里放到线程里迭代，再把 chunk 通过 asyncio.Queue 桥接回事件循环。
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any] | Exception | None] = asyncio.Queue()
    sample_rate = getattr(tts_model, "sample_rate", 22050)

    def worker() -> None:
        try:
            for output in tts_model.inference_sft(sentence, TTS_SPK_ID, stream=True):
                tts_speech = output["tts_speech"]
                pcm_bytes, sample_count = audio_tensor_to_pcm16_bytes(tts_speech)
                if not pcm_bytes:
                    continue

                viseme_chunk = generate_viseme_chunk(tts_speech, sample_rate=sample_rate, fps=VISEME_FPS)

                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    {
                        "pcm_bytes": pcm_bytes,
                        "sample_count": sample_count,
                        "viseme_chunk": viseme_chunk,
                    },
                )
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, exc)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=worker, daemon=True).start()

    chunk_index = chunk_index_start
    total_samples = 0
    first_chunk_at: float | None = None

    while True:
        item = await queue.get()
        if item is None:
            break

        if isinstance(item, Exception):
            raise item

        if first_chunk_at is None:
            first_chunk_at = time.perf_counter()
            if not stream_announced:
                stream_announced = True
                await safe_send_json(websocket, send_lock, {"type": "STATUS_UPDATE", "status": "SPEAKING"})
                await safe_send_json(
                    websocket,
                    send_lock,
                    {
                        "type": "AUDIO_STREAM_START",
                        "payload": {
                            "streamId": stream_id,
                            "sampleRate": sample_rate,
                            "channels": 1,
                            "format": "pcm_s16le",
                        },
                    },
                )
            print(f"🔈 当前句段首个音频 chunk 已发送，回合累计耗时: {first_chunk_at - turn_started_at:.3f}s")

        pcm_bytes = item["pcm_bytes"]
        sample_count = item["sample_count"]
        viseme_chunk = item["viseme_chunk"]
        total_samples += sample_count

        metadata = {
            "type": "AUDIO_CHUNK",
            "streamId": stream_id,
            "chunkIndex": chunk_index,
            "sampleRate": sample_rate,
            "channels": 1,
            "format": "pcm_s16le",
            "chunkDurationSec": round(sample_count / sample_rate, 6),
            "visemeFps": VISEME_FPS,
            "visemeChunk": viseme_chunk,
        }
        await safe_send_bytes(websocket, send_lock, pack_binary_event(metadata, pcm_bytes))
        chunk_index += 1

    return chunk_index, total_samples, first_chunk_at, stream_announced


async def stream_tts_pipeline(
    websocket: WebSocket,
    send_lock: asyncio.Lock,
    sentence_queue: asyncio.Queue[str | None],
    turn_started_at: float,
) -> dict[str, Any]:
    """
    从句段队列中按顺序取文本，持续推送音频 chunk。
    当前第 1 步只处理音频流，不再等待整段 wav 落盘。
    """
    sample_rate = getattr(tts_model, "sample_rate", 22050)
    stream_id = uuid.uuid4().hex
    started = False
    first_audio_chunk_at: float | None = None
    total_samples = 0
    chunk_index = 0

    try:
        while True:
            sentence = await sentence_queue.get()
            if sentence is None:
                break

            sentence = sentence.strip()
            if not sentence:
                continue

            print(f"🔊 开始流式合成句段: {sentence}")
            chunk_index, sentence_samples, sentence_first_chunk_at, started = await stream_sentence_audio(
                sentence=sentence,
                websocket=websocket,
                send_lock=send_lock,
                stream_id=stream_id,
                chunk_index_start=chunk_index,
                turn_started_at=turn_started_at,
                stream_announced=started,
            )
            total_samples += sentence_samples

            if first_audio_chunk_at is None and sentence_first_chunk_at is not None:
                first_audio_chunk_at = sentence_first_chunk_at
                print(f"🚀 全链路首个音频 chunk 已发送，当前 TTFA: {first_audio_chunk_at - turn_started_at:.3f}s")

        if started:
            await safe_send_json(
                websocket,
                send_lock,
                {
                    "type": "AUDIO_STREAM_END",
                    "payload": {
                        "streamId": stream_id,
                        "totalSamples": total_samples,
                        "sampleRate": sample_rate,
                    },
                },
            )
        else:
            await safe_send_json(websocket, send_lock, {"type": "STATUS_UPDATE", "status": "IDLE"})

        return {
            "started": started,
            "streamId": stream_id if started else None,
            "audioDuration": round(total_samples / sample_rate, 3) if started else 0.0,
            "firstAudioChunkAt": first_audio_chunk_at,
        }
    except Exception as exc:
        print(f"⚠️ TTS 流式合成失败: {exc}")
        await safe_send_json(
            websocket,
            send_lock,
            {
                "type": "ERROR",
                "status": "ERROR",
                "payload": {"message": "语音流生成失败，请稍后再试。"},
            },
        )
        await safe_send_json(websocket, send_lock, {"type": "STATUS_UPDATE", "status": "IDLE"})
        return {
            "started": False,
            "streamId": None,
            "audioDuration": 0.0,
            "firstAudioChunkAt": None,
        }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("终端大屏已连接至中枢大脑")
    send_lock = asyncio.Lock()

    try:
        while True:
            turn_started_at = time.perf_counter()
            user_turn = await receive_user_turn(websocket)
            clean_text = str(user_turn.get("text", "")).strip()
            client_emotion_context = user_turn.get("emotionContext")
            print(f"🎙️ 旅客说: {clean_text}")

            if not clean_text:
                continue

            await safe_send_json(websocket, send_lock, {"type": "STATUS_UPDATE", "status": "THINKING"})
            user_emotion_analysis = fuse_user_emotion_analysis(clean_text, client_emotion_context)
            await safe_send_json(
                websocket,
                send_lock,
                {
                    "type": "USER_EMOTION_ANALYSIS",
                    "payload": user_emotion_analysis,
                },
            )

            sentence_queue: asyncio.Queue[str | None] = asyncio.Queue()
            llm_task = asyncio.create_task(
                stream_llm_reply(
                    clean_text=clean_text,
                    websocket=websocket,
                    send_lock=send_lock,
                    sentence_queue=sentence_queue,
                    user_emotion_analysis=user_emotion_analysis,
                )
            )
            tts_task = asyncio.create_task(
                stream_tts_pipeline(
                    websocket=websocket,
                    send_lock=send_lock,
                    sentence_queue=sentence_queue,
                    turn_started_at=turn_started_at,
                )
            )

            llm_payload, tts_result = await asyncio.gather(llm_task, tts_task)

            await safe_send_json(
                websocket,
                send_lock,
                {
                    "type": "AGENT_REPLY",
                    "status": "SPEAKING" if tts_result["started"] else "IDLE",
                    "payload": {
                        "transcript": clean_text,
                        "replyText": llm_payload["replyText"],
                        "emotionMode": llm_payload["emotionMode"],
                        "actionCard": llm_payload["actionCard"],
                        "audioDuration": tts_result["audioDuration"],
                        "userEmotionAnalysis": llm_payload["userEmotionAnalysis"],
                    },
                },
            )

            if not tts_result["started"]:
                await safe_send_json(websocket, send_lock, {"type": "STATUS_UPDATE", "status": "IDLE"})

    except WebSocketDisconnect:
        print("终端大屏已断开连接")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

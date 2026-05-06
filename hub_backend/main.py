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
import scipy.io.wavfile as wavfile
import httpx
import numpy as np
import torch
import torchaudio.transforms as T
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from funasr import AutoModel
from openai import AsyncOpenAI

try:
    from .video_pipeline import auto_generate_video, shutdown_talker_service, warm_up_talker_service
except ImportError:
    from video_pipeline import auto_generate_video, shutdown_talker_service, warm_up_talker_service


VISEME_FPS = 60


def build_viseme_track(audio_tensor, sample_rate=22050, fps=VISEME_FPS, time_offset=0.0, verbose=False):
    """
    根据音频张量生成数字人口型帧序列。

    参数:
        audio_tensor: CosyVoice 输出的音频 Tensor，形状通常为 [channels, samples]。
        sample_rate: 音频采样率，用于把采样点换算成时间轴。
        fps: 口型轨迹帧率，决定每秒生成多少个口型点。
        time_offset: 当前 chunk 在整段语音里的起始时间偏移。
        verbose: 是否打印后台处理日志，主要用于调试完整音频轨迹。
    返回值：
        track是字典型列表，取值的时候用track[0]['t']
    """
    if verbose:
        print("   -> [后台线程] 开始处理音频张量...")
    # 所有频谱计算都放到 CPU，避免占用推理 GPU 并降低跨线程风险。
    audio_tensor = audio_tensor.detach().cpu()

    if audio_tensor.shape[0] > 1:
        # 前端只消费单声道口型信号，多声道音频先混成 mono。
        audio_tensor = audio_tensor.mean(dim=0, keepdim=True)

    # Mel 频谱用于估计音量和频段分布，再映射到嘴部开合与口型形态。
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

        # 低频/高频比例用于粗略区分圆唇、扁唇等口型趋势。
        low_energy = torch.sum(frame[:20]).item()
        high_energy = torch.sum(frame[40:]).item()
        total_energy = low_energy + high_energy + 1e-6

        # y 控制嘴巴开合，f 控制嘴型方向，前端会按时间 t 插值播放。
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
    """
    为完整音频生成带调试日志的口型轨迹。

    参数:
        audio_tensor: 完整 TTS 音频 Tensor。
        sample_rate: 音频采样率。
        fps: 口型轨迹帧率。
    """
    return build_viseme_track(audio_tensor, sample_rate=sample_rate, fps=fps, verbose=True)


def generate_viseme_chunk(audio_tensor, sample_rate=22050, fps=VISEME_FPS):
    """
    针对当前音频 chunk 即时生成相对时间嘴型帧。
    这里不等待整段音频，只对每个 TTS chunk 就地做一次轻量频谱映射。

    参数:
        audio_tensor: 当前 TTS chunk 的音频 Tensor。
        sample_rate: 当前 chunk 的采样率。
        fps: 前端口型动画期望的帧率。
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
DEFAULT_ASR_DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
ASR_DEVICE = os.getenv("FUNASR_DEVICE", DEFAULT_ASR_DEVICE).strip() or DEFAULT_ASR_DEVICE
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

    参数:
        model_name: modelscope/iic 下的模型目录名，例如 SenseVoiceSmall。
    """
    candidate_paths = [
        os.path.join(MODELSCOPE_CACHE_ROOT, "models", "iic", model_name),
        os.path.join(MODELSCOPE_CACHE_ROOT, "iic", model_name),
        os.path.join(MODELSCOPE_CACHE_ROOT, "pretrained_models", model_name),
    ]

    for candidate_path in candidate_paths:
        # 命中本机缓存后直接返回绝对目录，避免启动时访问网络。
        if os.path.isdir(candidate_path):
            return candidate_path

    return f"iic/{model_name}"


if ASR_DEVICE.startswith("cuda") and not torch.cuda.is_available():
    print(f"⚠️ 请求的 ASR 设备 {ASR_DEVICE} 不可用，自动回退到 CPU")
    ASR_DEVICE = "cpu"


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
print(f"🎛️ SenseVoice 设备: {ASR_DEVICE}")
sensevoice_model_path = resolve_local_model_path("SenseVoiceSmall")
asr_model = AutoModel(
    model=sensevoice_model_path,
    trust_remote_code=True,
    device=ASR_DEVICE,
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
talker_warmup_task: asyncio.Task | None = None


async def warm_up_llm_model(reason: str) -> None:
    """
    通过一次极小请求把 Ollama 里的 Qwen 先拉进显存，避免首个旅客触发冷启动。

    参数:
        reason: 预热触发来源，写入日志用于区分 startup 和 keepalive。
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

    参数:
        无传入参数，直接使用全局 tts_model 和 TTS_SPK_ID。
    """
    print("♨️ 正在预热 CosyVoice ...")
    try:
        for _ in tts_model.inference_sft("您好，", TTS_SPK_ID, stream=True):
            break
        print("♨️ CosyVoice 预热完成")
    except Exception as exc:
        print(f"⚠️ CosyVoice 预热失败: {exc}")


async def maintain_llm_keepalive() -> None:
    """
    周期性唤醒 Ollama 模型，降低长时间空闲后的首字延迟。

    参数:
        无传入参数，依赖全局 LLM_KEEPALIVE_INTERVAL_SEC。
    """
    while True:
        await asyncio.sleep(LLM_KEEPALIVE_INTERVAL_SEC)
        await warm_up_llm_model("keepalive")


async def warm_up_talker_service_background() -> None:
    """
    后台启动并预热 Linly-Talker API，避免第一轮视频生成时才加载 Wav2Lip。

    参数:
        无传入参数，直接复用 video_pipeline 中的固定 Linly-Talker 配置。
    """
    print("♨️ 正在后台预热 Linly-Talker Wav2Lip ...")
    try:
        await asyncio.to_thread(warm_up_talker_service)
        print("♨️ Linly-Talker Wav2Lip 预热完成")
    except Exception as exc:
        print(f"⚠️ Linly-Talker Wav2Lip 预热失败，视频生成时将使用兜底路径: {exc}")


@app.on_event("startup")
async def startup_event() -> None:
    """
    FastAPI 启动钩子，预热 LLM/TTS 并创建后台保活任务。

    参数:
        无传入参数，由 FastAPI 生命周期自动调用。
    """
    global llm_keepalive_task
    global talker_warmup_task

    # Linly-Talker 预热是独立进程，先后台启动以覆盖 LLM/TTS 预热期间的等待时间。
    talker_warmup_task = asyncio.create_task(warm_up_talker_service_background())
    # LLM 是异步请求，TTS 是同步推理；TTS 放到线程里避免阻塞事件循环。
    await warm_up_llm_model("startup")
    await asyncio.to_thread(warm_up_tts_model)
    llm_keepalive_task = asyncio.create_task(maintain_llm_keepalive())


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """
    FastAPI 关闭钩子，取消后台任务并关闭 httpx 连接池。

    参数:
        无传入参数，由 FastAPI 生命周期自动调用。
    """
    global llm_keepalive_task
    global talker_warmup_task

    if llm_keepalive_task is not None:
        # 先 cancel 再等待任务退出，避免关闭时留下悬挂协程。
        llm_keepalive_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await llm_keepalive_task
        llm_keepalive_task = None

    if talker_warmup_task is not None:
        if not talker_warmup_task.done():
            talker_warmup_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await talker_warmup_task
        talker_warmup_task = None

    await asyncio.to_thread(shutdown_talker_service)
    await custom_http_client.aclose()


def sanitize_stream_text(text: str) -> str:
    """
    去掉流式文本中的换行和 markdown 噪音，避免字幕和 TTS 出现脏字符。

    参数:
        text: 来自 LLM 或 JSON 解析结果的原始文本片段。
    """
    text = text.replace("\r", "").replace("\n", "")
    text = text.replace("```", "")
    return text


def sanitize_stream_json_delta(text: str) -> str:
    """
    LLM 在 JSON 流里偶尔会混入 markdown fence，这里只做最小清理，保留 JSON 所需空白。

    参数:
        text: OpenAI/Ollama 流式返回的 JSON 文本增量。
    """
    return text.replace("```json", "").replace("```", "").replace("\ufeff", "")


def clean_asr_text(raw_text: str) -> str:
    """
    清理 SenseVoice 返回的语言标签，保留最终给 LLM 的自然语言文本。

    参数:
        raw_text: ASR 模型返回的原始文本，可能包含 <|zh|> 等标签。
    """
    return re.sub(r"<\|.*?\|>", "", raw_text).strip()


def longest_common_prefix_length(left: str, right: str) -> int:
    """
    计算两个字符串的最长公共前缀长度，用于增量推送缺失文本。流式TTS需要增量朗读，这样才不会卡顿

    参数:
        left: 已经推送或缓存的旧文本。
        right: 新解析出的完整文本。
    """
    prefix_length = 0
    for left_char, right_char in zip(left, right):
        if left_char != right_char:
            break
        prefix_length += 1
    return prefix_length


def normalize_emotion_mode(value: Any) -> str:
    """
    将外部输入规整为前端支持的表情/播报情绪枚举。

    参数:
        value: LLM、前端或回退逻辑传入的候选情绪值。
    """
    if isinstance(value, str) and value in VALID_EMOTION_MODES:
        return value
    return "neutral"


def normalize_reply_text(value: Any) -> str:
    """
    规整 LLM 回复文本，保证后续字幕和 TTS 拿到干净字符串。

    参数:
        value: 可能来自 JSON 字段 replyText 的任意类型值。
    """
    if not isinstance(value, str):
        return ""
    return sanitize_stream_text(value).strip()


def normalize_action_card(value: Any) -> dict[str, str] | None:
    """
    校验并规整前端行动卡片数据。

    参数:
        value: LLM 输出的 actionCard 字段，期望是 dict 或 None。
    """
    if value is None:
        return None

    if not isinstance(value, dict):
        return None

    # 只允许前端已定义的卡片类型，缺少标题或内容时直接丢弃。
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
    """
    规整 LLM 最终 JSON 对象，给下游统一字段结构。

    参数:
        payload: LLM 完整 JSON 解析结果；解析失败时可以为 None。
    """
    payload = payload or {}
    return {
        "replyText": normalize_reply_text(payload.get("replyText")),
        "emotionMode": normalize_emotion_mode(payload.get("emotionMode")),
        "actionCard": normalize_action_card(payload.get("actionCard")),
    }


def clamp_unit(value: Any) -> float:
    """
    将任意数值压到 0 到 1 的闭区间，常用于置信度。

    参数:
        value: 待规整的数字、字符串数字或非法值。
    """
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, numeric))


def create_empty_emotion_scores() -> dict[str, float]:
    """
    创建完整情绪枚举的零分字典。

    参数:
        无传入参数，使用全局 EMOTION_MODE_SEQUENCE。
    """
    return {mode: 0.0 for mode in EMOTION_MODE_SEQUENCE}


def normalize_emotion_scores(value: Any) -> dict[str, float]:
    """
    将情绪分数字典补齐、去负值并归一化。

    参数:
        value: 前端、文本规则或融合逻辑产生的原始情绪分数。
    """
    scores = create_empty_emotion_scores()
    if isinstance(value, dict):
        for mode in EMOTION_MODE_SEQUENCE:
            try:
                scores[mode] = max(0.0, float(value.get(mode, 0.0)))
            except (TypeError, ValueError):
                scores[mode] = 0.0

    total = sum(scores.values())
    if total <= 1e-6:
        # 没有有效分数时默认中性，避免除零并保持前端状态稳定。
        scores["neutral"] = 1.0
        total = 1.0

    return {mode: round(scores[mode] / total, 4) for mode in EMOTION_MODE_SEQUENCE}


def infer_dominant_emotion(scores: dict[str, float], sample_count: int = 1) -> tuple[str, float]:
    """
    从归一化分数中推断主情绪和置信度。

    参数:
        scores: 已归一化的情绪分数字典。
        sample_count: 参与判断的样本数量，用于调节置信度。
    """
    ranked_scores = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top_mode, top_score = ranked_scores[0]
    second_score = ranked_scores[1][1] if len(ranked_scores) > 1 else 0.0
    # 第一名和第二名的差距越大，情绪判断越确定。
    margin = max(0.0, top_score - second_score)
    sample_confidence = min(1.0, max(0.0, sample_count / 24))
    confidence = clamp_unit((top_score * 0.62) + (margin * 0.78) + (sample_confidence * 0.2))
    return top_mode, round(confidence, 4)


def normalize_prosody_metrics(value: Any) -> dict[str, float] | None:
    """
    规整前端传来的语音韵律指标。

    参数:
        value: prosodyEmotion.metrics 字段，期望包含音量、变化度等数字。
    """
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
    """
    规整单个模态的情绪信号，例如 facialEmotion 或 prosodyEmotion。

    参数:
        value: 前端某个模态的情绪信号字典。
    """
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
        # 老格式只有 emotion 没有 scores 时，把该情绪当作满分信号。
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
    """
    规整前端摄像头/麦克风采样得到的多模态上下文。

    参数:
        value: USER_EMOTION_CONTEXT 或 TEXT_INPUT 中携带的 emotionContext。
    """
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

    # 两个主要模态都缺失时，返回 None 让后续逻辑退回文本情绪。
    if context_payload["facialEmotion"] is None and context_payload["prosodyEmotion"] is None:
        return None

    return context_payload


def analyze_text_emotion(text: str) -> dict[str, Any]:
    """
    基于关键词和标点对用户文本做轻量情绪判断。

    参数:
        text: ASR 或文本调试入口得到的用户原文。
    """
    clean_text = sanitize_stream_text(text).strip()
    scores = create_empty_emotion_scores()
    scores["neutral"] = 0.28

    if not clean_text:
        # 空文本无法判断时仍返回标准结构，避免调用方做额外分支。
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
                # 关键词命中次数越多，对应情绪得分越高。
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
    """
    融合前端多模态情绪和后端文本情绪，输出本轮用户状态。

    参数:
        transcript: 本轮用户文本，来自 ASR 或 TEXT_INPUT。
        client_context: 前端上报的 facial/prosody 情绪上下文，可能为空。
    """
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

        # 权重同时考虑模态基础权重、样本量和该模态自身置信度。
        confidence = clamp_unit(signal.get("confidence", 0.5))
        sample_count = max(1, int(signal.get("sampleCount", 1)))
        sample_factor = 0.8 + min(1.0, sample_count / (24 if modality_name == "facial" else 30)) * 0.2
        confidence_factor = (0.8 + confidence * 0.2) if modality_name == "text" else (0.65 + confidence * 0.35)
        raw_weights[modality_name] = base_weight * sample_factor * confidence_factor

    total_weight = sum(raw_weights.values())
    if total_weight <= 1e-6:
        # 没有可用前端信号时，文本情绪作为兜底主信号。
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
    """
    把用户情绪分析结果压缩成给 LLM 的系统提示。

    参数:
        user_emotion_analysis: fuse_user_emotion_analysis 的输出，可能为空。
    """
    if not user_emotion_analysis:
        return "当前回合没有可用的多模态情绪上下文。"

    # 只传 LLM 决策必要字段，避免提示过长影响延迟和稳定性。
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
    """
    兼容 OpenAI SDK 在不同模型下返回的 delta 结构。

    参数:
        chunk: OpenAI/Ollama 流式返回的单个 chunk 对象。
    """
    if not getattr(chunk, "choices", None):
        return ""

    delta = chunk.choices[0].delta
    content = getattr(delta, "content", None)
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        # 某些模型会把 content 拆成对象列表，这里拼回纯文本。
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

    参数:
        source: 已接收到的 JSON 文本片段。
        value_start: 目标字符串值起始位置，也就是开引号之后的索引。
    """
    decoded_chars: list[str] = []
    index = value_start

    while index < len(source):
        char = source[index]

        if char == '"':
            return "".join(decoded_chars), True

        if char != "\\":
            # 普通字符可以立即确认，流式场景下不必等待完整 JSON。
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
            # unicode 转义必须等 4 位十六进制完整到齐后才能解码。
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
    """
    从部分 JSON 文本里提取某个字符串字段。

    参数:
        source: 当前已收到的 JSON 文本片段。
        key: 需要提取的字段名，例如 emotionMode 或 replyText。
    """
    pattern = re.search(rf'"{re.escape(key)}"\s*:\s*"', source)
    if not pattern:
        return None, False
    return decode_partial_json_string(source, pattern.end())


def find_complete_json_object(source: str) -> str | None:
    """
    逐字符做括号配对，只要最外层对象闭合就立刻返回。
    这里不能用简单正则，因为 replyText 内部可能还会出现括号和引号。

    参数:
        source: 可能包含完整 JSON 对象的流式文本缓冲。
    """
    start_index = source.find("{")
    if start_index < 0:
        return None

    depth = 0
    in_string = False
    escape_next = False

    for index, char in enumerate(source[start_index:], start=start_index):
        if in_string:
            # 字符串内部的括号不参与 JSON 对象层级计数。
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
        """
        初始化增量解析状态。

        参数:
            无传入参数，所有状态在实例内部维护。
        """
        self.raw_buffer = ""
        self.reply_text = ""
        self.emotion_mode: str | None = None
        self.action_card: dict[str, str] | None = None
        self.final_payload: dict[str, Any] | None = None

    def feed(self, delta_text: str) -> dict[str, Any]:
        """
        吃入一段 LLM 增量文本，并返回本次解析出的字段变化。

        参数:
            delta_text: LLM 本次流式输出的文本片段。
        """
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

        # emotionMode 必须先到位，前端可以更早切换数字人表情。
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
                # 只把新增部分作为 delta 推给前端，避免重复字幕。
                prefix_length = longest_common_prefix_length(self.reply_text, normalized_reply_text)
                result["replyDelta"] = normalized_reply_text[prefix_length:]
                self.reply_text = normalized_reply_text
                result["replyText"] = self.reply_text

        complete_json = find_complete_json_object(json_fragment)
        if complete_json is not None:
            try:
                # 完整 JSON 闭合后再做一次严格规整，修正增量阶段可能遗漏的字段。
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
        """
        在 JSON 未完整闭合时，用已解析字段构造兜底回复对象。

        参数:
            无传入参数，读取实例缓存的 reply_text/emotion_mode/action_card。
        """
        return normalize_agent_payload(
            {
                "replyText": self.reply_text,
                "emotionMode": self.emotion_mode or "neutral",
                "actionCard": self.action_card,
            }
        )

    def _json_fragment(self) -> str:
        """
        截取从第一个左花括号开始的 JSON 候选片段。

        参数:
            无传入参数，读取实例内 raw_buffer。
        """
        start_index = self.raw_buffer.find("{")
        if start_index < 0:
            return ""
        return self.raw_buffer[start_index:]


def split_ready_sentences(buffer: str) -> tuple[list[str], str]:
    """
    从流式文本缓冲区中尽可能早地切出可以朗读的句段。
    第 1 步优先以标点为边界，逗号也视为可开口的最小停顿点，用于压缩 TTFA。

    参数:
        buffer: 当前尚未送入 TTS 的 replyText 缓冲内容。
    """
    ready_sentences: list[str] = []
    segment_start = 0

    for index, char in enumerate(buffer):
        if char not in EARLY_SPLIT_PUNCTUATION:
            continue

        # 一旦遇到可播停顿点，就把前面的完整片段送入候选队列。
        sentence = sanitize_stream_text(buffer[segment_start:index + 1]).strip()
        if sentence:
            ready_sentences.append(sentence)
        segment_start = index + 1

    remaining = sanitize_stream_text(buffer[segment_start:]).strip()
    return ready_sentences, remaining


def is_speakable_sentence(text: str) -> bool:
    """
    过滤只有标点、没有实际可读内容的碎片，避免白白触发一次 TTS。

    参数:
        text: 准备送入 TTS 的候选句段。
    """
    clean_text = sanitize_stream_text(text).strip()
    return bool(re.search(r"[\u4e00-\u9fffA-Za-z0-9]", clean_text))


def force_split_sentence(buffer: str, target_chars: int = EARLY_FORCE_SPLIT_TARGET_CHARS) -> tuple[str | None, str]:
    """
    首句迟迟没有标点时，做一次保守强切，优先把前半句尽快送进 TTS。
    这里不插入额外标点，只截取已有文本，避免和前端字幕内容不一致。

    参数:
        buffer: 当前没有标点但已经积累到一定长度的文本。
        target_chars: 强切目标字数，默认使用全局首句强切长度。
    """
    clean_buffer = sanitize_stream_text(buffer).strip()
    if len(clean_buffer) < EARLY_FORCE_SPLIT_MIN_CHARS:
        return None, clean_buffer

    for phrase in EARLY_FORCE_SPLIT_OPENING_PHRASES:
        if clean_buffer.startswith(phrase) and len(clean_buffer) >= len(phrase):
            # 预设开场短语可作为独立句段，便于更早开口。
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

    参数:
        audio_tensor: CosyVoice 当前输出的浮点音频 Tensor。
    """
    audio_tensor = audio_tensor.detach().cpu()

    if audio_tensor.ndim == 1:
        audio_tensor = audio_tensor.unsqueeze(0)

    if audio_tensor.shape[0] > 1:
        # WebAudio 播放链路按单声道处理，多声道先混音。
        audio_tensor = audio_tensor.mean(dim=0, keepdim=True)

    # 浏览器端按 signed 16-bit little-endian PCM 解析。
    pcm_int16 = (torch.clamp(audio_tensor.squeeze(0), -1.0, 1.0).numpy() * 32767.0).astype(np.int16)
    return pcm_int16.tobytes(), int(pcm_int16.shape[0])


def pack_binary_event(metadata: dict[str, Any], payload: bytes) -> bytes:
    """
    自定义二进制协议:
    - 前 4 字节: metadata JSON 长度 (little-endian uint32)
    - 中间: UTF-8 JSON metadata
    - 尾部: 原始 PCM 音频字节
    这样前端无需 base64 解码，直接能拿到 ArrayBuffer。

    参数:
        metadata: 当前音频 chunk 的描述信息，会被编码为 JSON。
        payload: 当前音频 chunk 的 PCM 字节数据。
    """
    metadata_bytes = json.dumps(metadata, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return struct.pack("<I", len(metadata_bytes)) + metadata_bytes + payload


async def safe_send_json(websocket: WebSocket, send_lock: asyncio.Lock, payload: dict[str, Any]) -> None:
    """
    串行发送 JSON WebSocket 消息，避免多个协程同时写 socket。

    参数:
        websocket: 当前连接的 FastAPI WebSocket 对象。
        send_lock: 当前连接共享的发送锁。
        payload: 要发送给前端的 JSON 字典。
    """
    async with send_lock:
        await websocket.send_json(payload)


async def safe_send_bytes(websocket: WebSocket, send_lock: asyncio.Lock, payload: bytes) -> None:
    """
    串行发送二进制 WebSocket 消息。

    参数:
        websocket: 当前连接的 FastAPI WebSocket 对象。
        send_lock: 当前连接共享的发送锁。
        payload: 已按自定义协议打包的二进制数据。
    """
    async with send_lock:
        await websocket.send_bytes(payload)


async def receive_user_turn(websocket: WebSocket) -> dict[str, Any]:
    """
    正常路径读取前端发来的录音二进制并做 ASR。
    另外保留一个 TEXT_INPUT 调试入口，便于本地直接验证 LLM/TTS/WebSocket 流式链路。

    参数:
        websocket: 当前浏览器终端连接，用于接收语音包、文本调试消息和情绪上下文。
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
                # SenseVoice 接收文件路径，所以先把浏览器录音包临时落盘。
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
            # 情绪上下文可能先于音频包到达，暂存后绑定到下一轮用户输入。
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

    参数:
        clean_text: 当前回合用户文本，已经过 ASR 标签清洗或文本输入清洗。
        websocket: 当前浏览器终端连接，用于推送字幕、状态和最终回复。
        send_lock: 当前连接共享的发送锁，保证多协程发送顺序安全。
        sentence_queue: LLM 切出的可播句段队列，供 TTS 流水线消费。
        user_emotion_analysis: 本轮用户多模态情绪融合结果，可能为空。
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

    # 先通知前端文本流开始，让 UI 进入可接收增量字幕的状态。
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

        # LLM 每吐出一小段 JSON，就尝试增量解析，前端和 TTS 不等完整对象。
        async for chunk in response_stream:
            delta_text = extract_delta_text(chunk)
            if not delta_text:
                continue

            if not first_llm_delta_logged:
                first_llm_delta_logged = True
                print(f"🧠 收到首个 LLM delta，耗时: {time.perf_counter() - turn_started_at:.3f}s")

            parser_result = extractor.feed(delta_text)

            if parser_result["emotionMode"] is not None:
                # 情绪一旦闭合就先推给前端，数字人表情可以提前变化。
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
                # replyText 增量既推字幕，也进入待切句缓冲区。
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
                # actionCard 可能比完整回复更晚出现，单独作为状态增量推送。
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
                # 只有情绪已就绪后才送 TTS，避免声音已经开始但表情还没同步。
                ready_sentences, sentence_buffer = split_ready_sentences(sentence_buffer)
                used_forced_split = False

                if (
                    not ready_sentences
                    and not first_sentence_logged
                    and sentence_buffer_started_at is not None
                    and len(sanitize_stream_text(sentence_buffer).strip()) >= EARLY_FORCE_SPLIT_MIN_CHARS
                    and (time.perf_counter() - sentence_buffer_started_at) >= EARLY_FORCE_SPLIT_MAX_WAIT_SEC
                ):
                    # 首句无标点但等待过久时强切，降低用户感知首响延迟。
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

        # 流结束后用完整 JSON 做最终校准；若未闭合则使用增量解析的兜底对象。
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
                # 把最终校准中补出来的文本继续送进 TTS 缓冲，避免尾句丢失。
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
            # 收尾阶段把还能按标点切出的句子全部送入 TTS。
            ready_sentences, sentence_buffer = split_ready_sentences(sentence_buffer)
            for sentence in ready_sentences:
                if not is_speakable_sentence(sentence):
                    continue
                print(f"📝 JSON 收尾句段送入 TTS: {sentence}")
                await sentence_queue.put(sentence)

        if sentence_buffer.strip() and is_speakable_sentence(sentence_buffer.strip()):
            # 最后一段即使没有标点，也要作为尾句播报。
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
        # LLM 失败时仍向前端和 TTS 提供一致的兜底回复，避免本轮卡死。
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
        # None 是 TTS 消费者的结束哨兵，确保异常路径也能退出。
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

    参数:
        sentence: 当前要合成的一句或半句文本。
        websocket: 当前浏览器终端连接，用于发送音频流事件。
        send_lock: 当前连接共享的发送锁，保证 JSON 和二进制消息串行发送。
        stream_id: 本轮音频流 ID，前端用它归并多个 chunk。
        chunk_index_start: 当前句段第一个音频 chunk 的全局序号。
        turn_started_at: 本轮用户输入开始处理的时间戳，用于统计延迟。
        stream_announced: 是否已经向前端发送过 AUDIO_STREAM_START。
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any] | Exception | None] = asyncio.Queue()
    sample_rate = getattr(tts_model, "sample_rate", 22050)

    def worker() -> None:
        """
        在线程里同步迭代 CosyVoice，把结果桥接回 asyncio 队列。

        参数:
            无显式传入参数，闭包读取 sentence/sample_rate/loop/queue。
        """
        try:
            for output in tts_model.inference_sft(sentence, TTS_SPK_ID, stream=True):
                tts_speech = output["tts_speech"]
                pcm_bytes, sample_count = audio_tensor_to_pcm16_bytes(tts_speech)
                if not pcm_bytes:
                    continue

                # 每个音频 chunk 同步生成口型 chunk，前端可边播边驱动嘴型。
                viseme_chunk = generate_viseme_chunk(tts_speech, sample_rate=sample_rate, fps=VISEME_FPS)

                # 线程不能直接 await asyncio.Queue，通过 call_soon_threadsafe 回到事件循环。
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

    # CosyVoice 推理是阻塞生成器，放入 daemon 线程避免阻塞 WebSocket 事件循环。
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
                # 首个 chunk 到达时才宣布音频流开始，避免空流让前端误进入播放态。
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

        # metadata 走二进制包头，PCM 走包体，减少 base64 开销。
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

    参数:
        websocket: 当前浏览器终端连接，用于发送音频流和状态消息。
        send_lock: 当前连接共享的发送锁。
        sentence_queue: LLM 生产的可播句段队列，None 表示本轮文本结束。
        turn_started_at: 本轮用户输入开始处理的时间戳，用于统计 TTFA。
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
                # LLM 生产者发送 None 作为结束哨兵，TTS 流水线据此收尾。
                break

            sentence = sentence.strip()
            if not sentence:
                continue

            print(f"🔊 开始流式合成句段: {sentence}")
            # 每个句段顺序合成，chunk_index 会跨句延续，前端可按序播放。
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
            # 所有句段结束后汇报总采样点，前端用它完成播放收尾。
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
        # TTS 失败不抛出到 WebSocket 主循环，当前回合给前端错误态后恢复待机。
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
    print("终端大屏已连接至中枢大脑 (切换为 2D 视频渲染模式)")
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
            await safe_send_json(websocket, send_lock, {"type": "USER_EMOTION_ANALYSIS", "payload": user_emotion_analysis})

            sentence_queue: asyncio.Queue[str | None] = asyncio.Queue()
            
            # 1. 依然让 LLM 去思考并推文本流（保持前端字幕实时性）
            llm_task = asyncio.create_task(
                stream_llm_reply(
                    clean_text=clean_text,
                    websocket=websocket,
                    send_lock=send_lock,
                    sentence_queue=sentence_queue,
                    user_emotion_analysis=user_emotion_analysis,
                )
            )
            
            # 等待 LLM 完全说完
            llm_payload = await llm_task 
            full_reply_text = llm_payload["replyText"]
            print(f"🧠 LLM 思考完毕，准备生成声音: {full_reply_text}")
            
            if full_reply_text and full_reply_text != "系统处理异常，请稍后再试。":
                await safe_send_json(websocket, send_lock, {"type": "STATUS_UPDATE", "status": "SPEAKING"})
                
                # 2. 生成全句的音频（阻塞式）
                audio_filename = f"reply_{uuid.uuid4().hex}.wav"
                video_filename = f"reply_{uuid.uuid4().hex}.mp4"
                audio_path = os.path.join(static_dir, audio_filename)
                video_path = os.path.join(static_dir, video_filename)
                
                print(f"🎙️ 正在生成语音文件...")
                audio_tensors = []
                # 注意这里 stream=False，直接拿完整音频
                for output in tts_model.inference_sft(full_reply_text, TTS_SPK_ID, stream=False):
                    audio_tensors.append(output["tts_speech"])
                
                if audio_tensors:
                    final_tensor = torch.cat(audio_tensors, dim=-1)
                    sample_rate = getattr(tts_model, "sample_rate", 22050)
                    pcm_int16 = (torch.clamp(final_tensor.squeeze(), -1.0, 1.0).numpy() * 32767.0).astype(np.int16)
                    # 将音频保存到硬盘，供给 Linly-Talker 读取
                    wavfile.write(audio_path, sample_rate, pcm_int16)
                    
                    # 3. 召唤 Linly-Talker 进行换脸渲染！
                    print(f"🎬 开始渲染 2D 视频 (优先复用 Linly-Talker API，失败后 subprocess 兜底)...")
                    try:
                        # 调用 Codex 帮你写好的流水线工具
                        final_video = await asyncio.to_thread(auto_generate_video, audio_path, video_path)
                        video_url = f"/static/{os.path.basename(final_video)}"
                        print(f"✅ 视频渲染完毕！分发地址: {video_url}")
                        
                        # 4. 把最终的视频地址发送给前端播放
                        await safe_send_json(
                            websocket,
                            send_lock,
                            {
                                "type": "AGENT_REPLY",
                                "status": "SPEAKING",
                                "payload": {
                                    "transcript": clean_text,
                                    "replyText": full_reply_text,
                                    "emotionMode": llm_payload["emotionMode"],
                                    "actionCard": llm_payload["actionCard"],
                                    "videoUrl": video_url, # 前端就靠这个字段放视频了！
                                    "userEmotionAnalysis": user_emotion_analysis,
                                },
                            },
                        )
                    except Exception as e:
                        print(f"❌ 视频生成失败: {e}")
                        await safe_send_json(websocket, send_lock, {"type": "STATUS_UPDATE", "status": "IDLE"})
            
            # 本回合彻底结束，回到待机
            await safe_send_json(websocket, send_lock, {"type": "STATUS_UPDATE", "status": "IDLE"})

    except WebSocketDisconnect:
        print("终端大屏已断开连接")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

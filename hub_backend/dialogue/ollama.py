import asyncio
import os
from collections.abc import AsyncIterator
from typing import Any

import httpx
from openai import AsyncOpenAI

from .base import DialogueMessage, DialogueProvider


DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1"
DEFAULT_OLLAMA_MODEL = "qwen2.5:7b"


def _extract_delta_text(chunk: Any) -> str:
    """Extract text from an OpenAI-compatible Ollama stream chunk."""
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


class OllamaDialogueProvider(DialogueProvider):
    """Ollama transport through its local OpenAI-compatible endpoint."""

    def __init__(
        self,
        *,
        model_name: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self._model_name = (
            model_name
            if model_name is not None
            else os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL)
        )
        self._base_url = (
            base_url
            if base_url is not None
            else os.getenv("OLLAMA_BASE_URL", DEFAULT_OLLAMA_BASE_URL)
        )
        self._http_client = httpx.AsyncClient(trust_env=False)
        self._client = AsyncOpenAI(
            api_key="ollama",
            base_url=self._base_url,
            http_client=self._http_client,
        )

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self._model_name

    async def stream_text(
        self,
        messages: list[DialogueMessage],
        *,
        temperature: float,
    ) -> AsyncIterator[str]:
        response_stream = await self._client.chat.completions.create(
            model=self.model_name,
            temperature=temperature,
            stream=True,
            messages=messages,
        )

        async for chunk in response_stream:
            delta_text = _extract_delta_text(chunk)
            if delta_text:
                yield delta_text

    async def warm_up(self, reason: str) -> None:
        print(f"♨️ 正在预热 LLM ({reason}) ...")
        try:
            await asyncio.wait_for(
                self._client.chat.completions.create(
                    model=self.model_name,
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

    async def close(self) -> None:
        await self._http_client.aclose()

import os

from .base import DialogueProvider
from .ollama import OllamaDialogueProvider


def create_dialogue_provider() -> DialogueProvider:
    """Create the explicitly configured dialogue provider."""
    provider_name = os.getenv("DIALOGUE_PROVIDER", "ollama").strip().lower()

    if provider_name == "ollama":
        return OllamaDialogueProvider()

    if provider_name == "xunfei":
        raise ValueError("DIALOGUE_PROVIDER='xunfei' is not implemented yet.")

    raise ValueError(
        f"Unsupported DIALOGUE_PROVIDER={provider_name!r}. "
        "Supported providers: ollama. The xunfei provider is not implemented yet."
    )

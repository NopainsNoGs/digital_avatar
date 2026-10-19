from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


DialogueMessage = dict[str, str]


class DialogueProvider(ABC):
    """Provider-neutral interface for streaming dialogue text."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the configured provider identifier."""
        raise NotImplementedError

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name used for dialogue requests."""
        raise NotImplementedError

    @abstractmethod
    def stream_text(
        self,
        messages: list[DialogueMessage],
        *,
        temperature: float,
    ) -> AsyncIterator[str]:
        """Stream provider-neutral textual deltas for one dialogue request."""
        raise NotImplementedError

    @abstractmethod
    async def warm_up(self, reason: str) -> None:
        """Warm the provider if needed without changing startup availability."""
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        """Release transport resources owned by the provider."""
        raise NotImplementedError

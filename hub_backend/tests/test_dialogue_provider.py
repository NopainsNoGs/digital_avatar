import os
import unittest
from unittest.mock import patch

from hub_backend.dialogue.factory import create_dialogue_provider
from hub_backend.dialogue.ollama import (
    DEFAULT_OLLAMA_BASE_URL,
    DEFAULT_OLLAMA_MODEL,
    OllamaDialogueProvider,
)


class DialogueProviderFactoryTests(unittest.TestCase):
    def test_default_provider_is_ollama_without_network_access(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("hub_backend.dialogue.ollama.httpx.AsyncClient") as http_client_class,
            patch("hub_backend.dialogue.ollama.AsyncOpenAI") as openai_class,
        ):
            provider = create_dialogue_provider()

        self.assertIsInstance(provider, OllamaDialogueProvider)
        self.assertEqual(provider.provider_name, "ollama")
        self.assertEqual(provider.model_name, DEFAULT_OLLAMA_MODEL)
        http_client_class.assert_called_once_with(trust_env=False)
        openai_class.assert_called_once_with(
            api_key="ollama",
            base_url=DEFAULT_OLLAMA_BASE_URL,
            http_client=http_client_class.return_value,
        )

    def test_ollama_model_environment_override_is_used(self) -> None:
        with (
            patch.dict(
                os.environ,
                {
                    "DIALOGUE_PROVIDER": "ollama",
                    "OLLAMA_MODEL": "local-test-model",
                },
                clear=True,
            ),
            patch("hub_backend.dialogue.ollama.httpx.AsyncClient"),
            patch("hub_backend.dialogue.ollama.AsyncOpenAI"),
        ):
            provider = create_dialogue_provider()

        self.assertEqual(provider.model_name, "local-test-model")

    def test_unknown_provider_fails_without_silent_fallback(self) -> None:
        with patch.dict(os.environ, {"DIALOGUE_PROVIDER": "unknown"}, clear=True):
            with self.assertRaisesRegex(ValueError, "Unsupported DIALOGUE_PROVIDER"):
                create_dialogue_provider()

    def test_xunfei_is_explicitly_not_implemented(self) -> None:
        with patch.dict(os.environ, {"DIALOGUE_PROVIDER": "xunfei"}, clear=True):
            with self.assertRaisesRegex(ValueError, "not implemented yet"):
                create_dialogue_provider()


if __name__ == "__main__":
    unittest.main()

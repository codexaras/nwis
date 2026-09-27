"""Provider-agnostic LLM wrapper (Gemini or OpenAI via plain REST).

Entirely optional: when LLM_PROVIDER / LLM_API_KEY are not set, `available()` is False and every caller
falls back to rule-based extraction and structured template answers so the whole demo runs offline.
Any network / parsing failure also degrades to the offline path (never a 500).
"""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

from ..config import LLM_API_KEY, LLM_MODEL, LLM_PROVIDER, llm_enabled

DEFAULT_MODELS = {"gemini": "gemini-1.5-flash", "openai": "gpt-4o-mini"}


class LLMClient:
    def __init__(self) -> None:
        self.provider = LLM_PROVIDER
        self.api_key = LLM_API_KEY
        self.model = LLM_MODEL or DEFAULT_MODELS.get(self.provider, "")

    def available(self) -> bool:
        return llm_enabled()

    def describe(self) -> dict[str, Any]:
        return {"enabled": self.available(), "provider": self.provider or None, "model": self.model if self.available() else None}

    def complete(self, system: str, user: str, json_mode: bool = False, max_tokens: int = 1400, temperature: float = 0.2) -> str | None:
        if not self.available():
            return None
        try:
            if self.provider == "gemini":
                return self._gemini(system, user, json_mode, max_tokens, temperature)
            if self.provider == "openai":
                return self._openai(system, user, json_mode, max_tokens, temperature)
        except Exception:  # noqa: BLE001 — degrade to offline path
            return None
        return None

    def complete_json(self, system: str, user: str, max_tokens: int = 1400) -> Any | None:
        raw = self.complete(system, user, json_mode=True, max_tokens=max_tokens)
        if not raw:
            return None
        return parse_json_loosely(raw)

    # -- providers ------------------------------------------------------------------------------
    def _gemini(self, system: str, user: str, json_mode: bool, max_tokens: int, temperature: float) -> str | None:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
        }
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"
        r = httpx.post(url, json=body, timeout=30.0)
        r.raise_for_status()
        data = r.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]

    def _openai(self, system: str, user: str, json_mode: bool, max_tokens: int, temperature: float) -> str | None:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        r = httpx.post("https://api.openai.com/v1/chat/completions", json=body, timeout=30.0,
                       headers={"Authorization": f"Bearer {self.api_key}"})
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


def parse_json_loosely(text: str) -> Any | None:
    """Accepts raw JSON or JSON wrapped in ``` fences / prose."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
    if start >= 0:
        for end in range(len(text), start, -1):
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                continue
    return None


llm = LLMClient()

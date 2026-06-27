from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional
import anthropic
from core.config import get_settings
from core.models import AgentType, WSEvent, WSEventType
import json

settings = get_settings()


class BaseAgent(ABC):
    agent_type: AgentType
    system_prompt: str

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.default_model

    async def stream(
        self,
        messages: list,
        extra_system: str = "",
        max_tokens: int = 8192,
    ) -> AsyncGenerator[str, None]:
        system = self.system_prompt
        if extra_system:
            system += f"\n\n{extra_system}"

        async with self.client.messages.stream(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def run(
        self,
        messages: list,
        extra_system: str = "",
        max_tokens: int = 8192,
    ) -> str:
        full_response = ""
        async for chunk in self.stream(messages, extra_system, max_tokens):
            full_response += chunk
        return full_response

    def build_event(self, build_id: str, event_type: WSEventType, data: dict) -> WSEvent:
        return WSEvent(type=event_type, build_id=build_id, data=data)

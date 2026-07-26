from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    CODE = "code"
    DOCUMENTATION = "documentation"
    CONVERSATION = "conversation"
    STRATEGY_SDK = "strategy_sdk"
    ARCHITECTURE = "architecture"


class Chunk(BaseModel):
    id: str
    source_type: SourceType
    source_id: str
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    org_id: Optional[str] = None
    project_id: Optional[str] = None


class RetrievedChunk(Chunk):
    score: float

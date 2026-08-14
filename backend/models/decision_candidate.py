from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from core.models import utcnow


class DecisionCandidate(BaseModel):
    decision: str
    category: Optional[str] = None
    rationale: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: Optional[str] = None
    source_turn_ids: Optional[List[str]] = None
    project_id: Optional[str] = None
    initiative_id: Optional[str] = None
    extracted_at: datetime = Field(default_factory=utcnow)

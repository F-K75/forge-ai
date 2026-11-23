"""Admin-only human adjudication API (docs/architecture/agent-collaboration-
plan.md §17.3; Revision 2 amended §12.3, PV-2, PV-4, PV-5).

- ``GET  /admin/adjudication/queue``: queue items, metadata only.
- ``GET  /admin/adjudication/items/{item_id}``: the default view: the
  finding, the redacted ±20-line excerpt and the blueprint fragment; never
  the full artifact (PV-4).
- ``POST /admin/adjudication/items/{item_id}/expand``: the full artifact
  (or build prompt), still redacted; requires a purpose.
- ``POST /admin/adjudication/items/{item_id}/label``: submit a label.

Every request writes exactly one ``adjudication_access_log`` row, including
refused ones (PV-5), and every item request re-checks eligibility, so a
revoked consent blocks access at once (PV-2). Admins only (MFA enforced by
``admin_required``).
"""

from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.admin import admin_required
from core import adjudication
from core.database import get_db
from core.models import User

router = APIRouter(prefix="/admin/adjudication", tags=["adjudication"])


class ExpandRequest(BaseModel):
    purpose: str = Field("", max_length=2000)
    target: Literal["artifact", "prompt"] = "artifact"


class LabelRequest(BaseModel):
    verdict: Literal["true_positive", "false_positive", "uncertain"]
    corrected_category: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=4000)


def _http(exc: adjudication.AdjudicationError) -> HTTPException:
    return HTTPException(status_code=getattr(exc, "status_code", 400), detail=str(exc))


@router.get("/queue")
async def list_adjudication_queue(
    status: str = Query(adjudication.STATUS_PENDING),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    admin: User = Depends(admin_required),
) -> Dict[str, Any]:
    db = await get_db()
    try:
        return await adjudication.list_queue(db, adjudicator_id=admin.id, status=status, limit=limit, skip=skip)
    except adjudication.AdjudicationError as exc:
        raise _http(exc) from exc


@router.get("/items/{item_id}")
async def view_adjudication_item(item_id: str, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    db = await get_db()
    try:
        return await adjudication.view_item(db, adjudicator_id=admin.id, item_id=item_id)
    except adjudication.AdjudicationError as exc:
        raise _http(exc) from exc


@router.post("/items/{item_id}/expand")
async def expand_adjudication_item(
    item_id: str, payload: ExpandRequest, admin: User = Depends(admin_required),
) -> Dict[str, Any]:
    db = await get_db()
    try:
        return await adjudication.expand_item(
            db, adjudicator_id=admin.id, item_id=item_id, purpose=payload.purpose, target=payload.target,
        )
    except adjudication.AdjudicationError as exc:
        raise _http(exc) from exc


@router.post("/items/{item_id}/label")
async def label_adjudication_item(
    item_id: str, payload: LabelRequest, admin: User = Depends(admin_required),
) -> Dict[str, Any]:
    db = await get_db()
    try:
        return await adjudication.submit_label(
            db, adjudicator_id=admin.id, item_id=item_id, verdict=payload.verdict,
            corrected_category=payload.corrected_category, notes=payload.notes,
        )
    except adjudication.AdjudicationError as exc:
        raise _http(exc) from exc

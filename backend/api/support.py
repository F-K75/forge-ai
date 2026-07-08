from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List
from datetime import datetime

from core.models import User, SupportTicket, PaginationParams
from core.database import get_db, paginated_query
from core.security import sanitize_string
from api.auth import get_current_user

router = APIRouter(prefix="/support", tags=["support"])


class SupportTicketCreateRequest(BaseModel):
    subject: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=5000)
    priority: str = "normal"


class SupportTicketResponse(BaseModel):
    id: str
    subject: str
    description: str
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime


class PaginatedSupportTickets(BaseModel):
    tickets: List[SupportTicketResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


_VALID_PRIORITIES = {"low", "normal", "high", "urgent"}


@router.post("/tickets", response_model=SupportTicketResponse)
async def create_support_ticket(
    req: SupportTicketCreateRequest, current_user: User = Depends(get_current_user)
):
    priority = req.priority if req.priority in _VALID_PRIORITIES else "normal"
    ticket = SupportTicket(
        user_id=current_user.id,
        subject=sanitize_string(req.subject, max_length=200),
        description=sanitize_string(req.description, max_length=5000),
        priority=priority,
    )
    await (await get_db()).support_tickets.insert_one(ticket.model_dump())
    return SupportTicketResponse(**ticket.model_dump())


@router.get("/tickets", response_model=PaginatedSupportTickets)
async def list_my_support_tickets(
    current_user: User = Depends(get_current_user),
    params: PaginationParams = Depends(),
):
    db = await get_db()
    result = await paginated_query(
        db.support_tickets,
        {"user_id": current_user.id},
        page=params.page,
        per_page=params.per_page,
        sort=[("created_at", -1)],
    )
    tickets = [SupportTicketResponse(**doc) for doc in result.items]
    return PaginatedSupportTickets(
        tickets=tickets,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages,
    )


@router.get("/tickets/{ticket_id}", response_model=SupportTicketResponse)
async def get_support_ticket(ticket_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    doc = await db.support_tickets.find_one(
        {"id": ticket_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    return SupportTicketResponse(**doc)

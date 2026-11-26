"""Root-level A2A discovery and JSON-RPC endpoints.

- `GET /.well-known/agent.json` (public, mounted at the app root): A2A discovery
  card. Contains no project or user data, only the static org blueprint and
  built-in skill catalog, and advertises `/v1/a2a/rpc` as the task endpoint.
- `POST /v1/a2a/rpc` (Bearer auth): A2A JSON-RPC endpoint where the target
  project is chosen per request via `params.metadata.projectId` and authorized
  against the caller's project access before dispatch.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request

from api.auth import get_current_user
from api.protocols import (
    _assert_project_access,
    _ensure_distributed_hooks,
    public_api_base_url,
    read_bounded_json,
)
from core.a2a_adapter import (
    JSONRPC_INVALID_PARAMS,
    JSONRPC_PARSE_ERROR,
    build_public_agent_card,
    get_a2a_gateway,
    jsonrpc_error,
)
from core.database import get_db
from core.models import User

well_known_router = APIRouter(tags=["a2a"])
router = APIRouter(prefix="/a2a", tags=["a2a"])


@well_known_router.get("/.well-known/agent.json")
async def get_public_agent_card():
    """Public A2A Agent Card for discovery (no project-specific data)."""
    return build_public_agent_card(base_url=public_api_base_url()).to_dict()


def _extract_project_selector(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    params = payload.get("params")
    if not isinstance(params, dict):
        return None
    metadata = params.get("metadata")
    if not isinstance(metadata, dict):
        return None
    pid = metadata.get("projectId")
    if isinstance(pid, str) and 1 <= len(pid) <= 64:
        return pid
    return None


@router.post("/rpc")
async def a2a_root_jsonrpc(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """A2A JSON-RPC endpoint; requires `params.metadata.projectId` on every call."""
    try:
        payload = await read_bounded_json(request)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return jsonrpc_error(None, JSONRPC_PARSE_ERROR, "Parse error")

    rpc_id = payload.get("id") if isinstance(payload, dict) else None
    if not isinstance(rpc_id, (str, int)) or (isinstance(rpc_id, str) and len(rpc_id) > 128):
        rpc_id = None
    project_id = _extract_project_selector(payload)
    if project_id is None:
        return jsonrpc_error(rpc_id, JSONRPC_INVALID_PARAMS, "params.metadata.projectId is required")

    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    return await get_a2a_gateway().handle_jsonrpc(
        payload, project_id=project_id, actor=current_user.id
    )

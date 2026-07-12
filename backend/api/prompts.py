from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from api.admin import admin_required
from api.auth import get_current_user
from core.models import User
from prompt_builder import PromptContext, get_prompt_builder, get_template_registry
from prompt_builder.builder import PromptValidationError
from prompt_builder.registry import TemplateNotFoundError
from prompt_builder.templates.base import PromptTemplate
from prompt_builder.token_estimator import estimate_tokens
from prompt_builder.validator import validate as validate_context

router = APIRouter(prefix="/prompts", tags=["prompts"])


class TemplatePayload(BaseModel):
    role: str
    version: str
    identity: str
    responsibilities: List[str] = []
    goals: List[str] = []
    constraints: List[str] = []
    required_inputs: List[str] = []
    output_format: str = ""
    quality_rules: List[str] = []

    def to_template(self) -> PromptTemplate:
        return PromptTemplate(**self.model_dump())


class EstimateTokensRequest(BaseModel):
    text: str = ""
    context: Optional[PromptContext] = None


@router.post("/build")
async def build_prompt_endpoint(context: PromptContext, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    try:
        result = get_prompt_builder().build(context)
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PromptValidationError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc), "errors": [e.model_dump() for e in exc.errors]})
    return result.model_dump()


@router.post("/preview")
async def preview_prompt(context: PromptContext, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Same as /build but explicitly a dry run: does not affect any usage or
    metrics counters (there are none in this pipeline today, but this
    endpoint is the contract that guarantees it stays that way)."""
    try:
        result = get_prompt_builder().build(context)
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PromptValidationError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc), "errors": [e.model_dump() for e in exc.errors]})
    return result.model_dump()


@router.post("/validate")
async def validate_prompt(context: PromptContext, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    try:
        template = get_template_registry().get(context.agent_role, context.template_version)
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    result = validate_context(context, template)
    return result.model_dump()


@router.post("/estimate-tokens")
async def estimate_tokens_endpoint(
    request: EstimateTokensRequest, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    if request.context is not None:
        template = get_template_registry().get(request.context.agent_role, request.context.template_version)
        text = template.render(request.context)
    else:
        text = request.text
    return {"tokens": estimate_tokens(text)}


@router.get("/templates")
async def list_templates(admin: User = Depends(admin_required)) -> Dict[str, Any]:
    templates = get_template_registry().list()
    return {
        "templates": [
            {"role": t.role, "version": t.version, "required_inputs": t.required_inputs} for t in templates
        ]
    }


@router.get("/templates/{role}/{version}")
async def get_template(role: str, version: str, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    try:
        template = get_template_registry().get(role, version)
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {
        "role": template.role,
        "version": template.version,
        "identity": template.identity,
        "responsibilities": template.responsibilities,
        "goals": template.goals,
        "constraints": template.constraints,
        "required_inputs": template.required_inputs,
        "output_format": template.output_format,
        "quality_rules": template.quality_rules,
    }


@router.post("/templates")
async def create_template(payload: TemplatePayload, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    try:
        get_template_registry().create(payload.to_template())
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {"status": "created", "role": payload.role, "version": payload.version}


@router.put("/templates/{role}/{version}")
async def update_template(role: str, version: str, payload: TemplatePayload, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    try:
        get_template_registry().update(role, version, payload.to_template())
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "updated", "role": role, "version": version}


@router.delete("/templates/{role}/{version}")
async def delete_template(role: str, version: str, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    try:
        get_template_registry().delete(role, version)
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "deleted", "role": role, "version": version}

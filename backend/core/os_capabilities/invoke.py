"""Call an existing FastAPI route function in-process, with the caller's identity.

Capability handlers never re-implement business rules or authorization: they
call the same route function the REST API serves (``api.projects.delete_project``
and so on), so project access checks, ``admin_required`` (admin flag + MFA),
plan limits, rate limits and audit logging run exactly as they do over HTTP.

``call_endpoint`` resolves the function's parameters the way FastAPI would:

* ``Depends(get_current_user)`` -> ``ctx.user``
* any other ``Depends(fn)`` (e.g. ``admin_required``) -> ``fn`` called recursively
  with the same rules, so a dependency's own checks still run
* ``Depends()`` on a class (``PaginationParams``) -> built from the input
* a Pydantic request body -> built and validated from the input
* path/query scalars -> taken from the input by name (validated by type), else
  their declared default
* ``Request`` -> ``ctx.metadata["request"]`` when WS-C passes the originating
  request (swap point), else a minimal synthetic one; ``Response`` and
  ``BackgroundTasks`` are fresh objects, and background tasks are scheduled
  after the call returns, as they would be after an HTTP response.

``HTTPException``s map to ``ActionOutcome(status="rejected")`` with an
``OsError`` code in ``ctx.metadata["os_error"]``; other exceptions map to
``"failed"`` without leaking internals.
"""

from __future__ import annotations

import asyncio
import importlib
import inspect
import logging
from typing import Any, Callable, Dict, Optional, Set, Tuple

from fastapi import BackgroundTasks, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.params import Depends as DependsParam
from fastapi.params import Param
from pydantic import BaseModel, TypeAdapter, ValidationError
from pydantic_core import PydanticUndefined

from core.os_contracts import ActionContext, ActionOutcome

logger = logging.getLogger(__name__)

_BACKGROUND: Set[asyncio.Task] = set()

HTTP_TO_OS_ERROR: Dict[int, str] = {
    400: "validation_failed",
    401: "unauthorized",
    402: "budget_exceeded",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    413: "validation_failed",
    422: "validation_failed",
    429: "rate_limited",
}


class MissingArgument(ValueError):
    pass


def resolve_target(target: str) -> Callable[..., Any]:
    """``"api.projects:list_projects"`` -> the function (imported lazily, at call time)."""
    module_name, _, attr = target.partition(":")
    return getattr(importlib.import_module(module_name), attr)


def _signature(func: Callable[..., Any]) -> inspect.Signature:
    # Route modules using ``from __future__ import annotations`` have string annotations.
    try:
        return inspect.signature(func, eval_str=True)
    except Exception:  # noqa: BLE001 - fall back to raw annotations
        return inspect.signature(func)


def _is_model(annotation: Any) -> bool:
    return inspect.isclass(annotation) and issubclass(annotation, BaseModel)


def _synthetic_request() -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/v1/os/capability-action",
        "raw_path": b"/v1/os/capability-action",
        "query_string": b"",
        "headers": [(b"user-agent", b"forge-os")],
        "client": ("forge-os", 0),
        "server": ("forge-os", 0),
        "scheme": "http",
    }
    return Request(scope)


def _model_from(annotation: Any, args: Dict[str, Any], name: str) -> BaseModel:
    value = args.get(name)
    if isinstance(value, dict):
        return annotation.model_validate(value)
    fields = annotation.model_fields
    return annotation.model_validate({k: v for k, v in args.items() if k in fields})


async def _resolve(
    name: str,
    param: inspect.Parameter,
    ctx: ActionContext,
    args: Dict[str, Any],
    background: BackgroundTasks,
) -> Any:
    annotation = param.annotation
    default = param.default

    if annotation is Request or (inspect.isclass(annotation) and issubclass(annotation, Request)):
        return ctx.metadata.get("request") or _synthetic_request()
    if annotation is Response:
        return Response()
    if annotation is BackgroundTasks:
        return background

    if isinstance(default, DependsParam):
        dependency = default.dependency
        if dependency is None:
            # ``Depends()`` on a class (``PaginationParams``): build it the way FastAPI would,
            # resolving its ``Query(...)`` defaults instead of passing the Query objects through.
            return _model_from(annotation, args, name) if _is_model(annotation) else await call_endpoint(
                annotation, ctx, args, background=background
            )
        if getattr(dependency, "__name__", "") == "get_current_user":
            return ctx.user
        return await call_endpoint(dependency, ctx, args, background=background)

    if _is_model(annotation):
        return _model_from(annotation, args, name)

    if name in args:
        value = args[name]
        if annotation is not inspect.Parameter.empty:
            value = TypeAdapter(annotation).validate_python(value)
        return value

    if isinstance(default, Param):
        if default.default is PydanticUndefined or default.default is Ellipsis:
            raise MissingArgument(name)
        return default.default
    if default is inspect.Parameter.empty:
        raise MissingArgument(name)
    return default


async def call_endpoint(
    func: Callable[..., Any],
    ctx: ActionContext,
    args: Dict[str, Any],
    *,
    background: Optional[BackgroundTasks] = None,
) -> Any:
    owns_background = background is None
    background = background or BackgroundTasks()
    kwargs = {}
    params = _signature(func).parameters
    # Dependencies first (as FastAPI solves them): an authorization dependency such as
    # ``admin_required`` denies before any input is looked at.
    for name, param in params.items():
        if isinstance(param.default, DependsParam):
            kwargs[name] = await _resolve(name, param, ctx, args, background)
    for name, param in params.items():
        if name not in kwargs:
            kwargs[name] = await _resolve(name, param, ctx, args, background)
    kwargs = {name: kwargs[name] for name in params}
    result = func(**kwargs)
    if inspect.isawaitable(result):
        result = await result
    if owns_background and background.tasks:
        task = asyncio.create_task(background())
        _BACKGROUND.add(task)
        task.add_done_callback(_BACKGROUND.discard)
    return result


def to_jsonable(result: Any) -> Any:
    if isinstance(result, Response):
        return None
    return jsonable_encoder(result)


def error_outcome(ctx: ActionContext, exc: BaseException) -> ActionOutcome:
    """Map an exception raised by an endpoint (or by input building) to an outcome."""
    if isinstance(exc, HTTPException):
        code = HTTP_TO_OS_ERROR.get(exc.status_code, "internal")
        message = exc.detail if isinstance(exc.detail, str) else "Request rejected"
        retryable = exc.status_code in (429,) or exc.status_code >= 500
        ctx.metadata["os_error"] = {"code": code, "message": message, "retryable": retryable}
        ctx.metadata["http_status"] = exc.status_code
        status = "failed" if exc.status_code >= 500 else "rejected"
        return ActionOutcome(status=status, message=message)
    if isinstance(exc, (ValidationError, MissingArgument)):
        message = f"Missing input: {exc}" if isinstance(exc, MissingArgument) else "Invalid input for this action"
        ctx.metadata["os_error"] = {"code": "validation_failed", "message": message, "retryable": False}
        return ActionOutcome(status="rejected", message=message)
    logger.exception("capability action %s/%s failed", ctx.capability_id, ctx.action)
    ctx.metadata["os_error"] = {"code": "internal", "message": "The action failed", "retryable": True}
    return ActionOutcome(status="failed", message="The action failed")


async def guarded_call(func: Callable[..., Any], ctx: ActionContext, args: Dict[str, Any]) -> Tuple[bool, Any]:
    """``(True, jsonable_result)`` or ``(False, ActionOutcome)``."""
    try:
        return True, to_jsonable(await call_endpoint(func, ctx, args))
    except Exception as exc:  # noqa: BLE001 - mapped to an outcome
        return False, error_outcome(ctx, exc)

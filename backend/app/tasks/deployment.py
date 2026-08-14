"""30-second health check timeout with automatic rollback for deployments.

After a Docker container is started for a deployment, this module polls
the container's health endpoint for up to 30 seconds.  If the endpoint
does not return a successful response within the timeout the deployment
is automatically rolled back (container stopped and removed, status
set to FAILED, and a rollback event emitted over the WebSocket).
"""

import asyncio
import logging
import time

from core.config import get_settings
from core.models import DeploymentStatus, WSEvent, WSEventType

logger = logging.getLogger(__name__)

_SETTINGS = get_settings()

HEALTH_CHECK_TIMEOUT = 30
HEALTH_CHECK_INTERVAL = 2


async def run_health_check_with_rollback(
    deployment_id: str,
    container_url: str,
    emit,
) -> bool:
    """Poll a deployed container's health endpoint and roll back on failure.

    The health check starts immediately after the container is reported
    as LIVE and polls at a fixed interval until either:

    1. The container responds with a 2xx status within the timeout —
       the deployment is confirmed healthy.
    2. The timeout expires without a successful response — the deployment
       is rolled back (container stopped and removed, status set to
       FAILED, and a rollback event emitted over the WebSocket).

    Args:
        deployment_id: The deployment identifier.
        container_url: The base URL of the deployed container
            (e.g. ``http://host:8000``).
        emit: Async callable that sends WSEvent to connected clients.

    Returns:
        True if the health check succeeded, False if rolled back.
    """
    start = time.monotonic()
    health_url = f"{container_url}/health"

    while time.monotonic() - start < HEALTH_CHECK_TIMEOUT:
        try:
            import httpx

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(health_url)
            if response.status_code == 200:
                logger.info(
                    "Health check passed for deployment %s at %s",
                    deployment_id,
                    container_url,
                )
                return True
            logger.warning(
                "Health check returned %d for deployment %s, retrying...",
                response.status_code,
                deployment_id,
            )
        except Exception as exc:
            elapsed = time.monotonic() - start
            logger.warning(
                "Health check failed for deployment %s (%.1fs elapsed): %s",
                deployment_id,
                elapsed,
                exc,
            )

        await asyncio.sleep(HEALTH_CHECK_INTERVAL)

    # Timeout exceeded — roll back.
    logger.warning(
        "Health check timed out after %ds for deployment %s, rolling back",
        HEALTH_CHECK_TIMEOUT,
        deployment_id,
    )
    await _rollback_deployment(deployment_id, container_url, emit)
    return False


async def _rollback_deployment(
    deployment_id: str,
    container_url: str,
    emit,
) -> None:
    """Stop and remove the container, mark the deployment as FAILED."""
    import docker

    try:
        client = _get_docker_client()
        container_name = f"forge-deploy-{deployment_id}"

        try:
            container = client.containers.get(container_name)
            container.stop(timeout=5)
            container.remove()
            logger.info("Rolled back container %s", container_name)
        except docker.errors.NotFound:
            logger.info("Container %s not found during rollback", container_name)

        await emit(
            WSEvent(
                type=WSEventType.BUILD_FAILED,
                build_id=deployment_id,
                data={
                    "deployment_id": deployment_id,
                    "status": DeploymentStatus.FAILED,
                    "error": "Health check timed out — deployment rolled back",
                },
            )
        )
    except Exception as exc:
        logger.exception("Rollback failed for deployment %s: %s", deployment_id, exc)


def _get_docker_client():
    import docker

    return docker.from_env()
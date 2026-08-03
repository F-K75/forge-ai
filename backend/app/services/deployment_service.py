"""Dynamic DB isolation for deployed instances.

Each deployed app gets its own MongoDB database (`mongodb://.../app_<deploy_id>`)
so that deployed applications are isolated from each other and from the
primary Forge database.
"""

import logging
import re

from core.config import get_settings

logger = logging.getLogger(__name__)

_SETTINGS = get_settings()

_DEPLOY_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _validate_deploy_id(deploy_id: str) -> str:
    if not deploy_id:
        raise ValueError("deploy_id is required")
    if not _DEPLOY_ID_RE.match(deploy_id):
        raise ValueError(
            f"Invalid deploy_id {deploy_id!r}: must contain only "
            "letters, digits, hyphens, and underscores"
        )
    return deploy_id


def get_deployed_db_name(deploy_id: str) -> str:
    """Return the per-app database name for a deployment."""
    deploy_id = _validate_deploy_id(deploy_id)
    return f"app_{deploy_id}"


def get_deployed_db_url(deploy_id: str) -> str:
    """Return a MongoDB connection URL scoped to a single deployed app.

    Takes the primary MONGODB_URL from settings and replaces the database
    name with `app_<deploy_id>`.  For example:

        mongodb://host:27017/forge_dev
        → mongodb://host:27017/app_abc123

    If the MONGODB_URL uses the `mongodb+srv` scheme the replacement is
    applied to the path component only, preserving the cluster connection
    string intact.

    Args:
        deploy_id: The deployment identifier (validated to prevent injection).

    Returns:
        A MongoDB URL pointing at the isolated per-app database.

    Raises:
        ValueError: If deploy_id contains unsafe characters.
    """
    deploy_id = _validate_deploy_id(deploy_id)

    mongo_url = _SETTINGS.mongodb_url
    db_name = get_deployed_db_name(deploy_id)

    if mongo_url.startswith("mongodb+srv://"):
        base = mongo_url.rsplit("/", 1)[0]
        return f"{base}/{db_name}"

    if "/" in mongo_url:
        base = mongo_url.rsplit("/", 1)[0]
        return f"{base}/{db_name}"

    return f"{mongo_url}/{db_name}"


async def ensure_deployed_db(deploy_id: str) -> bool:
    """Create the per-app database if it does not already exist.

    In MongoDB creating a database is implicit (it materialises on first
    write), but we proactively verify connectivity so that a misconfigured
    URL fails fast at deploy time rather than at runtime.

    Args:
        deploy_id: The deployment identifier.

    Returns:
        True if the database is reachable and ready.

    Raises:
        ValueError: If deploy_id is invalid.
        ConnectionError: If the MongoDB instance is unreachable.
    """
    from core.database import get_db

    db_url = get_deployed_db_url(deploy_id)
    try:
        db = await get_db()
        target_db = db.client[db_url.rsplit("/", 1)[-1]]
        await target_db.command("ping")
        logger.info("Deployed DB verified for deploy_id=%s", deploy_id)
        return True
    except Exception as exc:
        logger.exception(
            "Failed to connect to deployed DB for deploy_id=%s: %s",
            deploy_id,
            exc,
        )
        raise ConnectionError(
            f"Cannot connect to deployed database for {deploy_id}: {exc}"
        ) from exc


async def cleanup_deployed_db(deploy_id: str) -> None:
    """Drop the per-app database when a deployment is destroyed.

    This is a destructive operation — it removes all data associated with
    the deployed app.  It should only be called when a deployment is
    permanently deleted or replaced.

    Args:
        deploy_id: The deployment identifier.
    """
    from core.database import get_db

    db_url = get_deployed_db_url(deploy_id)
    try:
        db = await get_db()
        db_name = db_url.rsplit("/", 1)[-1]
        await db.client.drop_database(db_name)
        logger.info("Dropped deployed DB %s for deploy_id=%s", db_name, deploy_id)
    except Exception as exc:
        logger.exception(
            "Failed to drop deployed DB for deploy_id=%s: %s", deploy_id, exc
        )
        raise
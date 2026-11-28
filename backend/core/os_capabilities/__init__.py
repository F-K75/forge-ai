"""Forge OS capability layer (WS-D): descriptors, action handlers and no-LLM surface builders.

* :mod:`.descriptors` loads ``core/os_schemas/capabilities.json`` (the synced copy
  of ``shared/os-schemas/capabilities.json``).
* :mod:`.handlers` holds one ``CapabilityActionHandler`` per server-side
  ``(capability_id, action_id)``; WS-C's registry imports :data:`HANDLERS` or
  calls :func:`register_all`.
* :mod:`.data_analyze`, :mod:`.models_compare`, :mod:`.approvals` and
  :mod:`.workflow` are deterministic builders used when no LLM is configured.
"""

from core.os_capabilities.descriptors import (
    CAPABILITIES_FILE,
    action_event_name,
    get_descriptor,
    load_capability_catalog,
    resolve_action_event,
)
from core.os_capabilities.handlers import (
    CLIENT_SIDE_ACTIONS,
    HANDLERS,
    KERNEL_ACTIONS,
    SURFACE_BUILDERS,
    get_handler,
    register_all,
)
from core.os_capabilities.install import install

__all__ = [
    "CAPABILITIES_FILE",
    "CLIENT_SIDE_ACTIONS",
    "HANDLERS",
    "KERNEL_ACTIONS",
    "SURFACE_BUILDERS",
    "action_event_name",
    "get_descriptor",
    "get_handler",
    "install",
    "load_capability_catalog",
    "register_all",
    "resolve_action_event",
]

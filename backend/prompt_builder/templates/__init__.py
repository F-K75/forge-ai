from prompt_builder.templates import (
    architect_v1,
    designer_v1,
    developer_v1,
    devops_v1,
    product_manager_v1,
    qa_v1,
    research_v1,
    security_v1,
)
from prompt_builder.templates.base import PromptTemplate

# TEMPLATE_REGISTRY: (role, version) -> PromptTemplate. This is the static,
# code-defined seed set; registry.py layers create/update/delete on top for
# runtime-managed templates without needing this module to change.
TEMPLATE_REGISTRY: dict[tuple[str, str], PromptTemplate] = {
    ("architect", "v1"): architect_v1.TEMPLATE,
    ("architect", "clarify-v1"): architect_v1.CLARIFY_TEMPLATE,
    ("developer", "v1"): developer_v1.TEMPLATE,
    ("designer", "v1"): designer_v1.TEMPLATE,
    ("qa", "v1"): qa_v1.TEMPLATE,
    ("security", "v1"): security_v1.TEMPLATE,
    ("product_manager", "v1"): product_manager_v1.TEMPLATE,
    ("research", "v1"): research_v1.TEMPLATE,
    ("devops", "v1"): devops_v1.TEMPLATE,
}

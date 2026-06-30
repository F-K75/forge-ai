"""
Orchestration Infrastructure for Forge-AI Multi-Agent Platform.

This package provides:
- Shared JSON data stores (PROJECT_MANIFEST, TASK_REGISTRY, etc.)
- Helper functions for reading/writing orchestration state
- API layer for agent access to orchestration data
- Workflow state management

Usage:
    from orchestration.helpers import (
        load_project_state,
        read_tasks,
        update_task,
        write_log,
        store_engineering_knowledge,
        update_metrics,
        retrieve_dashboard_data,
    )
"""
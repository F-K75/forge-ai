"""
Workflow Engine for AI Engineering Platform Orchestration.

This module provides the autonomous execution engine that controls all agents
in the multi-agent pipeline. It implements:

- Task Scheduler: Continuously finds and prioritizes READY tasks
- Dependency Resolver: Validates prerequisites before execution
- Agent Dispatcher: Automatically invokes appropriate agents
- Retry Engine: Handles validation failures with repair loops
- Event Bus: Publishes/subscribes to workflow events
- State Machine: Enforces valid task state transitions
- Recovery: Restores state after unexpected stops
- Metrics: Automatically updates performance metrics

Usage:
    from orchestration.engine.workflow_engine import WorkflowEngine
    
    engine = WorkflowEngine()
    engine.start()
"""

from .workflow_engine import WorkflowEngine

__all__ = ["WorkflowEngine"]
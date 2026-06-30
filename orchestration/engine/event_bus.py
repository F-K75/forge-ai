"""
Event Bus for the Workflow Engine.

Provides a publish/subscribe system for workflow events.
Allows agents to subscribe to specific event types and react to workflow changes.

Event Types:
- TASK_ASSIGNED: Task has been assigned to an agent
- TASK_STARTED: Task implementation has begun
- TASK_COMPLETED: Task implementation is complete
- VALIDATION_FAILED: Validation check failed
- REPAIR_REQUIRED: Repair cycle has been initiated
- TASK_APPROVED: Task has been approved
- TASK_DONE: Task is fully complete
- STATE_TRANSITION: Task state changed
- WORKFLOW_ADVANCED: Workflow stage changed
- ERROR: Error occurred during execution
"""

from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import threading
import json

from ..helpers import write_log, _timestamp


class EventType(Enum):
    """Enumeration of all workflow event types."""
    TASK_ASSIGNED = "TASK_ASSIGNED"
    TASK_STARTED = "TASK_STARTED"
    TASK_COMPLETED = "TASK_COMPLETED"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    REPAIR_REQUIRED = "REPAIR_REQUIRED"
    TASK_APPROVED = "TASK_APPROVED"
    TASK_DONE = "TASK_DONE"
    STATE_TRANSITION = "STATE_TRANSITION"
    WORKFLOW_ADVANCED = "WORKFLOW_ADVANCED"
    ERROR = "ERROR"
    RECOVERY_STARTED = "RECOVERY_STARTED"
    RECOVERY_COMPLETED = "RECOVERY_COMPLETED"


@dataclass
class Event:
    """Represents a workflow event."""
    event_type: EventType
    task_id: Optional[str]
    agent: Optional[str]
    data: Dict[str, Any]
    timestamp: str = field(default_factory=_timestamp)
    event_id: str = field(default_factory=lambda: f"evt-{datetime.now(timezone.utc).timestamp()}")


EventHandler = Callable[[Event], None]


class EventBus:
    """
    Central event bus for workflow communication.
    
    Implements the publish/subscribe pattern allowing agents to
    react to workflow events without tight coupling.
    """
    
    def __init__(self):
        """Initialize the event bus."""
        self._subscribers: Dict[EventType, List[EventHandler]] = {}
        self._event_history: List[Event] = []
        self._lock = threading.Lock()
        self._max_history = 1000  # Keep last 1000 events
    
    def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """
        Subscribe a handler to a specific event type.
        
        Args:
            event_type: The type of event to subscribe to.
            handler: Callback function that accepts an Event object.
        """
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)
    
    def unsubscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """
        Unsubscribe a handler from an event type.
        
        Args:
            event_type: The type of event to unsubscribe from.
            handler: The handler to remove.
        """
        if event_type in self._subscribers:
            self._subscribers[event_type] = [
                h for h in self._subscribers[event_type] if h != handler
            ]
    
    def publish(self, event: Event) -> None:
        """
        Publish an event to all subscribers.
        
        Args:
            event: The event to publish.
        """
        with self._lock:
            # Add to history
            self._event_history.append(event)
            
            # Trim history if needed
            if len(self._event_history) > self._max_history:
                self._event_history = self._event_history[-self._max_history:]
        
        # Notify subscribers (outside lock to avoid deadlocks)
        handlers = self._subscribers.get(event.event_type, [])
        for handler in handlers:
            try:
                handler(event)
            except Exception as e:
                # Log error but don't crash the event bus
                write_log(
                    agent="event_bus",
                    task=event.task_id or "unknown",
                    action="handler_error",
                    status="ERROR",
                    detail=f"Event handler failed for {event.event_type.value}: {str(e)}"
                )
        
        # Also notify wildcard subscribers (subscribed to all events)
        wildcard_handlers = self._subscribers.get(EventType.ERROR, [])  # Using ERROR as wildcard
        for handler in wildcard_handlers:
            try:
                handler(event)
            except Exception:
                pass
    
    def publish_event(self, event_type: EventType, task_id: Optional[str] = None,
                      agent: Optional[str] = None, **data) -> Event:
        """
        Convenience method to create and publish an event.
        
        Args:
            event_type: The type of event.
            task_id: Optional task ID associated with the event.
            agent: Optional agent name associated with the event.
            **data: Additional event data.
            
        Returns:
            The published Event object.
        """
        event = Event(
            event_type=event_type,
            task_id=task_id,
            agent=agent,
            data=data,
        )
        self.publish(event)
        return event
    
    def get_history(self, event_type: Optional[EventType] = None,
                    task_id: Optional[str] = None,
                    limit: int = 100) -> List[Event]:
        """
        Get event history with optional filtering.
        
        Args:
            event_type: Filter by event type.
            task_id: Filter by task ID.
            limit: Maximum number of events to return.
            
        Returns:
            List of matching events, most recent first.
        """
        with self._lock:
            events = self._event_history.copy()
        
        # Apply filters
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        if task_id:
            events = [e for e in events if e.task_id == task_id]
        
        # Return most recent first
        return list(reversed(events[-limit:]))
    
    def clear_history(self) -> None:
        """Clear the event history."""
        with self._lock:
            self._event_history.clear()
    
    def get_subscriber_count(self, event_type: EventType) -> int:
        """
        Get the number of subscribers for an event type.
        
        Args:
            event_type: The event type to check.
            
        Returns:
            Number of subscribers.
        """
        return len(self._subscribers.get(event_type, []))
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize event bus state to a dictionary.
        
        Returns:
            Dict containing event bus state.
        """
        return {
            "total_events": len(self._event_history),
            "subscriber_counts": {
                event_type.value: len(handlers)
                for event_type, handlers in self._subscribers.items()
            },
            "recent_events": [
                {
                    "event_id": e.event_id,
                    "event_type": e.event_type.value,
                    "task_id": e.task_id,
                    "agent": e.agent,
                    "timestamp": e.timestamp,
                    "data": e.data,
                }
                for e in self._event_history[-10:]  # Last 10 events
            ],
        }


# Global event bus instance
_event_bus: Optional[EventBus] = None


def get_event_bus() -> EventBus:
    """
    Get the global event bus instance (singleton pattern).
    
    Returns:
        The EventBus instance.
    """
    global _event_bus
    if _event_bus is None:
        _event_bus = EventBus()
    return _event_bus


def reset_event_bus() -> None:
    """Reset the global event bus instance (for testing)."""
    global _event_bus
    _event_bus = None
"""
Standalone Unit Test Suite for Forge AI Orchestration Engine.
Runs directly with Python's built-in unittest module with zero external dependencies.
"""

import unittest
import os
import tempfile
import shutil
from pathlib import Path

from orchestration.storage import JSONStorage, StorageError
from orchestration.engine.state_machine import TaskState, TaskStateMachine
from orchestration.engine.dependency_resolver import DependencyResolver, DependencyType
from orchestration.tool_gateway import ToolGateway, ToolStatus


class TestJSONStorage(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="forge_test_storage_")
        self.storage = JSONStorage(lock_timeout=2.0, retry_interval=0.01)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_write_and_read(self):
        path = os.path.join(self.temp_dir, "test.json")
        data = {"project": "forge-ai", "status": "active", "qa_score": 95}
        self.storage.write(path, data)
        loaded = self.storage.read(path)
        self.assertEqual(loaded, data)

    def test_write_creates_parent_directories(self):
        path = os.path.join(self.temp_dir, "nested", "deep", "manifest.json")
        data = {"name": "nested-app"}
        self.storage.write(path, data)
        self.assertTrue(os.path.exists(path))
        loaded = self.storage.read(path)
        self.assertEqual(loaded["name"], "nested-app")

    def test_read_nonexistent_file_raises(self):
        path = os.path.join(self.temp_dir, "nonexistent.json")
        with self.assertRaises(FileNotFoundError):
            self.storage.read(path)

    def test_exists(self):
        path = os.path.join(self.temp_dir, "exists_test.json")
        self.assertFalse(self.storage.exists(path))
        self.storage.write(path, {"val": 1})
        self.assertTrue(self.storage.exists(path))


class TestTaskStateMachine(unittest.TestCase):
    def setUp(self):
        self.sm = TaskStateMachine()

    def test_normal_lifecycle_transitions(self):
        self.assertTrue(self.sm.is_valid_transition(TaskState.READY, TaskState.ASSIGNED))
        self.assertTrue(self.sm.is_valid_transition(TaskState.ASSIGNED, TaskState.IN_PROGRESS))
        self.assertTrue(self.sm.is_valid_transition(TaskState.IN_PROGRESS, TaskState.UNDER_REVIEW))
        self.assertTrue(self.sm.is_valid_transition(TaskState.UNDER_REVIEW, TaskState.VALIDATING))
        self.assertTrue(self.sm.is_valid_transition(TaskState.VALIDATING, TaskState.APPROVED))
        self.assertTrue(self.sm.is_valid_transition(TaskState.APPROVED, TaskState.DONE))

    def test_failure_and_repair_transitions(self):
        # Implementation failure
        self.assertTrue(self.sm.is_valid_transition(TaskState.IN_PROGRESS, TaskState.FAILED))
        # Review rejection
        self.assertTrue(self.sm.is_valid_transition(TaskState.UNDER_REVIEW, TaskState.FAILED))
        # Validation failure
        self.assertTrue(self.sm.is_valid_transition(TaskState.VALIDATING, TaskState.FAILED))
        # Failure to repair
        self.assertTrue(self.sm.is_valid_transition(TaskState.FAILED, TaskState.REPAIRING))
        # Failure to retry
        self.assertTrue(self.sm.is_valid_transition(TaskState.FAILED, TaskState.READY))
        # Repair to revalidation
        self.assertTrue(self.sm.is_valid_transition(TaskState.REPAIRING, TaskState.REVALIDATING))
        # Revalidation to approved
        self.assertTrue(self.sm.is_valid_transition(TaskState.REVALIDATING, TaskState.APPROVED))

    def test_invalid_transitions(self):
        # Cannot jump directly from READY to DONE
        self.assertFalse(self.sm.is_valid_transition(TaskState.READY, TaskState.DONE))
        # Cannot jump directly from READY to APPROVED
        self.assertFalse(self.sm.is_valid_transition(TaskState.READY, TaskState.APPROVED))
        # Terminal state DONE has no transitions
        self.assertEqual(len(self.sm.get_valid_transitions(TaskState.DONE)), 0)


class TestDependencyResolverCycleDetection(unittest.TestCase):
    def setUp(self):
        self.resolver = DependencyResolver()

    def test_cycle_detection_method_exists(self):
        self.assertTrue(hasattr(self.resolver, "detect_cycle"))

    def test_detect_cycle_on_clean_task(self):
        # A nonexistent or clean task should have no cycle
        cycle = self.resolver.detect_cycle("TASK-NONEXISTENT")
        self.assertIsNone(cycle)


class TestToolGatewaySecurity(unittest.TestCase):
    def setUp(self):
        self.gw = ToolGateway()

    def test_path_traversal_blocked(self):
        res = self.gw.execute("filesystem", "read", ["../../../../etc/passwd"])
        self.assertFalse(res["success"])
        self.assertIn("escapes sandbox boundary", str(res.get("error", "")))

    def test_allowed_terminal_commands(self):
        # ls is allowed
        res = self.gw.execute("terminal", "ls", ["-l"])
        self.assertIsNotNone(res.get("exit_code"))

    def test_disallowed_terminal_command(self):
        res = self.gw.execute("terminal", "unauthorized_malicious_binary", ["--arg"])
        self.assertFalse(res["success"])
        self.assertIn("not permitted by security policy", str(res.get("error", "")))

    def test_dangerous_metacharacters_blocked(self):
        res = self.gw.execute("terminal", "ls", ["; rm -rf /"])
        self.assertFalse(res["success"])
        self.assertIn("Blocked token", str(res.get("error", "")))


if __name__ == "__main__":
    unittest.main()

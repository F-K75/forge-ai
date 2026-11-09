"""
Tool Gateway
Abstraction layer between agents and execution tools.
Provides unified interface, access control, and lifecycle management.
"""

import json
import time
import uuid
import hashlib
import subprocess
import tempfile
import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Callable
from enum import Enum
from dataclasses import dataclass, asdict
from datetime import datetime
import logging


class ToolType(Enum):
    FILESYSTEM = "filesystem"
    GIT = "git"
    DOCKER = "docker"
    PLAYWRIGHT = "playwright"
    TERMINAL = "terminal"
    DATABASE = "database"
    SECURITY_SCANNER = "security_scanner"
    HTTP_CLIENT = "http_client"


class ToolStatus(Enum):
    INITIALIZING = "INITIALIZING"
    READY = "READY"
    RUNNING = "RUNNING"
    ERROR = "ERROR"
    DISABLED = "DISABLED"


@dataclass
class ToolExecution:
    tool_id: str
    tool_type: str
    command: str
    args: List[Any]
    started_at: str
    finished_at: Optional[str]
    duration_seconds: float
    success: bool
    exit_code: Optional[int]
    stdout: str
    stderr: str
    error: Optional[str]

    def to_dict(self):
        return asdict(self)


@dataclass
class ToolConfig:
    tool_id: str
    tool_type: str
    name: str
    description: str
    enabled: bool
    permissions: List[str]
    timeout_seconds: int
    max_retries: int
    config: Dict[str, Any]

    def to_dict(self):
        return asdict(self)


class ToolGateway:
    """
    Gateway for executing tools with unified interface.
    Manages tool lifecycle, permissions, and execution tracking.
    """
    
    def __init__(self, config_path: str = "orchestration/tool_config.json"):
        self.config_path = Path(config_path)
        self.logger = logging.getLogger("ToolGateway")
        
        # Tool registry
        self.tools: Dict[str, ToolConfig] = {}
        self.tool_instances: Dict[str, Any] = {}
        self.tool_status: Dict[str, ToolStatus] = {}
        
        # Execution tracking
        self.executions: List[ToolExecution] = []
        self.execution_history: Dict[str, List[ToolExecution]] = {}
        
        # Load configuration
        self._load_config()
    
    def _load_config(self):
        """Load tool configuration from file."""
        if self.config_path.exists():
            try:
                with open(self.config_path) as f:
                    config_data = json.load(f)
                
                for tool_data in config_data.get("tools", []):
                    tool_config = ToolConfig(**tool_data)
                    self.tools[tool_config.tool_id] = tool_config
                    self.tool_status[tool_config.tool_id] = ToolStatus.READY if tool_config.enabled else ToolStatus.DISABLED
                    
                self.logger.info(f"Loaded {len(self.tools)} tool configurations")
            except Exception as e:
                self.logger.error(f"Failed to load tool config: {e}")
        else:
            # Create default configuration
            self._create_default_config()
    
    def _create_default_config(self):
        """Create default tool configuration."""
        default_tools = [
            {
                "tool_id": "filesystem",
                "tool_type": ToolType.FILESYSTEM.value,
                "name": "Filesystem",
                "description": "Read, write, and manage files",
                "enabled": True,
                "permissions": ["read", "write", "list"],
                "timeout_seconds": 30,
                "max_retries": 3,
                "config": {}
            },
            {
                "tool_id": "git",
                "tool_type": ToolType.GIT.value,
                "name": "Git",
                "description": "Git version control operations",
                "enabled": True,
                "permissions": ["read", "write", "commit", "push"],
                "timeout_seconds": 60,
                "max_retries": 3,
                "config": {
                    "default_branch": "main",
                    "require_signed_commits": False
                }
            },
            {
                "tool_id": "docker",
                "tool_type": ToolType.DOCKER.value,
                "name": "Docker",
                "description": "Docker container operations",
                "enabled": True,
                "permissions": ["build", "run", "stop", "ps"],
                "timeout_seconds": 300,
                "max_retries": 2,
                "config": {
                    "allowed_images": ["python:3.12-slim", "node:18-alpine"],
                    "max_containers": 10
                }
            },
            {
                "tool_id": "terminal",
                "tool_type": ToolType.TERMINAL.value,
                "name": "Terminal",
                "description": "Execute shell commands",
                "enabled": True,
                "permissions": ["execute"],
                "timeout_seconds": 120,
                "max_retries": 2,
                "config": {
                    "allowed_commands": ["npm", "pip", "python", "node", "git", "ls"],
                    "blocked_commands": ["rm -rf", "sudo", "chmod 777"],
                    "working_directory": "."
                }
            },
            {
                "tool_id": "playwright",
                "tool_type": ToolType.PLAYWRIGHT.value,
                "name": "Playwright",
                "description": "Browser automation and testing",
                "enabled": True,
                "permissions": ["browse", "screenshot", "test"],
                "timeout_seconds": 60,
                "max_retries": 2,
                "config": {
                    "headless": True,
                    "browser": "chromium"
                }
            },
            {
                "tool_id": "database",
                "tool_type": ToolType.DATABASE.value,
                "name": "Database",
                "description": "Database operations",
                "enabled": True,
                "permissions": ["read", "write", "migrate"],
                "timeout_seconds": 30,
                "max_retries": 3,
                "config": {
                    "allowed_operations": ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER"],
                    "blocked_operations": ["DROP", "TRUNCATE", "GRANT", "REVOKE"]
                }
            },
            {
                "tool_id": "security_scanner",
                "tool_type": ToolType.SECURITY_SCANNER.value,
                "name": "Security Scanner",
                "description": "Security scanning and auditing",
                "enabled": True,
                "permissions": ["scan", "audit"],
                "timeout_seconds": 180,
                "max_retries": 2,
                "config": {
                    "scanners": ["semgrep", "trivy", "bandit"],
                    "severity_threshold": "high"
                }
            },
            {
                "tool_id": "http_client",
                "tool_type": ToolType.HTTP_CLIENT.value,
                "name": "HTTP Client",
                "description": "HTTP request execution",
                "enabled": True,
                "permissions": ["get", "post", "put", "delete"],
                "timeout_seconds": 30,
                "max_retries": 3,
                "config": {
                    "allowed_domains": ["localhost", "127.0.0.1", "api.example.com"],
                    "blocked_domains": ["internal", "admin"],
                    "max_redirects": 5
                }
            }
        ]
        
        config_data = {
            "version": "1.0",
            "tools": default_tools
        }
        
        # Save config
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, "w") as f:
            json.dump(config_data, f, indent=2)
        
        # Load into registry
        for tool_data in default_tools:
            tool_config = ToolConfig(**tool_data)
            self.tools[tool_config.tool_id] = tool_config
            self.tool_status[tool_config.tool_id] = ToolStatus.READY if tool_config.enabled else ToolStatus.DISABLED
        
        self.logger.info(f"Created default config with {len(default_tools)} tools")
    
    def get_tool(self, tool_id: str) -> Optional[ToolConfig]:
        """Get tool configuration by ID."""
        return self.tools.get(tool_id)
    
    def is_tool_enabled(self, tool_id: str) -> bool:
        """Check if tool is enabled."""
        tool = self.tools.get(tool_id)
        return tool.enabled if tool else False
    
    def has_permission(self, tool_id: str, permission: str) -> bool:
        """Check if tool has specific permission."""
        tool = self.tools.get(tool_id)
        return permission in tool.permissions if tool else False
    
    def execute(self, tool_id: str, command: str, args: Optional[List[Any]] = None, 
                timeout: Optional[int] = None, agent_id: str = "unknown") -> Dict[str, Any]:
        """
        Execute a tool command.
        
        Args:
            tool_id: Tool identifier
            command: Command to execute
            args: Command arguments
            timeout: Override default timeout
            agent_id: Agent executing the command
            
        Returns:
            Execution result dictionary
        """
        # Validate tool
        tool = self.tools.get(tool_id)
        if not tool:
            return {
                "success": False,
                "error": f"Tool not found: {tool_id}",
                "exit_code": -1
            }
        
        if not tool.enabled:
            return {
                "success": False,
                "error": f"Tool disabled: {tool_id}",
                "exit_code": -1
            }
        
        # Set timeout
        timeout = timeout or tool.timeout_seconds
        
        # Create execution record
        execution_id = str(uuid.uuid4())
        started_at = datetime.utcnow().isoformat() + "Z"
        
        execution = ToolExecution(
            tool_id=tool_id,
            tool_type=tool.tool_type,
            command=command,
            args=args or [],
            started_at=started_at,
            finished_at=None,
            duration_seconds=0.0,
            success=False,
            exit_code=None,
            stdout="",
            stderr="",
            error=None
        )
        
        try:
            # Update status
            self.tool_status[tool_id] = ToolStatus.RUNNING
            
            # Execute based on tool type
            if tool.tool_type == ToolType.TERMINAL.value:
                result = self._execute_terminal(command, args, timeout)
            elif tool.tool_type == ToolType.GIT.value:
                result = self._execute_git(command, args, timeout)
            elif tool.tool_type == ToolType.DOCKER.value:
                result = self._execute_docker(command, args, timeout)
            elif tool.tool_type == ToolType.FILESYSTEM.value:
                result = self._execute_filesystem(command, args)
            else:
                result = {
                    "success": False,
                    "error": f"Tool type not implemented: {tool.tool_type}",
                    "exit_code": -1
                }
            
            # Update execution record
            execution.finished_at = datetime.utcnow().isoformat() + "Z"
            execution.duration_seconds = (
                datetime.fromisoformat(execution.finished_at[:-1]) - 
                datetime.fromisoformat(started_at[:-1])
            ).total_seconds()
            execution.success = result.get("success", False)
            execution.exit_code = result.get("exit_code", -1)
            execution.stdout = result.get("stdout", "")
            execution.stderr = result.get("stderr", "")
            execution.error = result.get("error")
            
            # Update status
            self.tool_status[tool_id] = ToolStatus.READY
            
            # Store execution
            self.executions.append(execution)
            if tool_id not in self.execution_history:
                self.execution_history[tool_id] = []
            self.execution_history[tool_id].append(execution)
            
            return result
            
        except Exception as e:
            execution.finished_at = datetime.utcnow().isoformat() + "Z"
            execution.duration_seconds = (
                datetime.fromisoformat(execution.finished_at[:-1]) - 
                datetime.fromisoformat(started_at[:-1])
            ).total_seconds()
            execution.success = False
            execution.error = str(e)
            
            self.tool_status[tool_id] = ToolStatus.ERROR
            self.executions.append(execution)
            
            return {
                "success": False,
                "error": str(e),
                "exit_code": -1
            }
    
    def _sanitize_path(self, user_path: Any) -> Path:
        """
        Resolve and validate path within sandbox boundaries.
        Prevents path traversal attacks (e.g., ../../../../etc/passwd).
        """
        base_dir = Path.cwd().resolve()
        target = (base_dir / Path(str(user_path))).resolve()
        if not str(target).startswith(str(base_dir)):
            raise PermissionError(f"Access denied: path '{user_path}' escapes sandbox boundary")
        return target

    def _execute_terminal(self, command: str, args: Optional[List[Any]], timeout: int) -> Dict[str, Any]:
        """Execute terminal command with strict security controls."""
        if not command or not command.strip():
            return {
                "success": False,
                "error": "Empty command provided",
                "exit_code": -1
            }

        # Security: validate base executable against allowed commands
        tool_config = self.tools.get("terminal")
        allowed_commands = (
            tool_config.config.get("allowed_commands", ["npm", "pip", "python", "node", "git", "pytest", "ls", "echo"])
            if tool_config else ["npm", "pip", "python", "node", "git", "pytest", "ls", "echo"]
        )
        base_cmd = os.path.basename(command.strip().split()[0]).lower()
        if base_cmd not in allowed_commands:
            return {
                "success": False,
                "error": f"Command '{base_cmd}' is not permitted by security policy. Allowed: {allowed_commands}",
                "exit_code": -1
            }

        # Check for dangerous metacharacters and blocked commands
        blocked_tokens = ["rm -rf", "sudo", "chmod 777", "eval", "exec", ";", "&&", "||", "`", "$("]
        for arg in [command] + [str(a) for a in (args or [])]:
            arg_lower = arg.lower()
            for blocked in blocked_tokens:
                if blocked in arg_lower:
                    return {
                        "success": False,
                        "error": f"Blocked token '{blocked}' detected in command arguments",
                        "exit_code": -1
                    }

        # Build full command
        full_command = [command] + [str(arg) for arg in args or []]
        
        try:
            result = subprocess.run(
                full_command,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=os.getcwd()
            )
            
            return {
                "success": result.returncode == 0,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": f"Command timed out after {timeout}s",
                "exit_code": -1,
                "stdout": "",
                "stderr": "Timeout"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "exit_code": -1,
                "stdout": "",
                "stderr": str(e)
            }
    
    def _execute_git(self, command: str, args: Optional[List[Any]], timeout: int) -> Dict[str, Any]:
        """Execute git command."""
        git_commands = {
            "status": ["git", "status"],
            "diff": ["git", "diff"],
            "log": ["git", "log"],
            "add": ["git", "add"],
            "commit": ["git", "commit", "-m"],
            "push": ["git", "push"],
            "pull": ["git", "pull"],
            "checkout": ["git", "checkout"],
            "branch": ["git", "branch"]
        }
        
        if command not in git_commands:
            return {
                "success": False,
                "error": f"Unsupported git command: {command}",
                "exit_code": -1
            }
        
        full_command = git_commands[command] + [str(arg) for arg in args or []]
        
        try:
            result = subprocess.run(
                full_command,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=os.getcwd()
            )
            
            return {
                "success": result.returncode == 0,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": f"Git command timed out after {timeout}s",
                "exit_code": -1
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "exit_code": -1
            }
    
    def _execute_docker(self, command: str, args: Optional[List[Any]], timeout: int) -> Dict[str, Any]:
        """Execute docker command."""
        docker_commands = {
            "build": ["docker", "build"],
            "run": ["docker", "run"],
            "stop": ["docker", "stop"],
            "ps": ["docker", "ps"],
            "images": ["docker", "images"],
            "logs": ["docker", "logs"]
        }
        
        if command not in docker_commands:
            return {
                "success": False,
                "error": f"Unsupported docker command: {command}",
                "exit_code": -1
            }
        
        full_command = docker_commands[command] + [str(arg) for arg in args or []]
        
        try:
            result = subprocess.run(
                full_command,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=os.getcwd()
            )
            
            return {
                "success": result.returncode == 0,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": f"Docker command timed out after {timeout}s",
                "exit_code": -1
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "exit_code": -1
            }
    
    def _execute_filesystem(self, command: str, args: Optional[List[Any]]) -> Dict[str, Any]:
        """Execute filesystem operation within sandboxed boundaries."""
        try:
            if command == "read":
                if not args or len(args) < 1:
                    return {"success": False, "error": "Missing filepath argument", "exit_code": -1}
                filepath = self._sanitize_path(args[0])
                if not filepath.exists() or not filepath.is_file():
                    return {
                        "success": False,
                        "error": f"File not found: {filepath}",
                        "exit_code": -1
                    }
                content = filepath.read_text()
                return {
                    "success": True,
                    "exit_code": 0,
                    "stdout": content,
                    "stderr": ""
                }
            
            elif command == "write":
                if not args or len(args) < 2:
                    return {"success": False, "error": "Missing filepath or content arguments", "exit_code": -1}
                filepath = self._sanitize_path(args[0])
                content = args[1]
                filepath.parent.mkdir(parents=True, exist_ok=True)
                filepath.write_text(content)
                return {
                    "success": True,
                    "exit_code": 0,
                    "stdout": f"Written to {filepath}",
                    "stderr": ""
                }
            
            elif command == "list":
                target_dir = args[0] if args and len(args) > 0 else "."
                dirpath = self._sanitize_path(target_dir)
                if not dirpath.exists() or not dirpath.is_dir():
                    return {
                        "success": False,
                        "error": f"Directory not found: {dirpath}",
                        "exit_code": -1
                    }
                files = [f.name for f in dirpath.iterdir()]
                return {
                    "success": True,
                    "exit_code": 0,
                    "stdout": json.dumps(files),
                    "stderr": ""
                }
            
            elif command == "exists":
                if not args or len(args) < 1:
                    return {"success": False, "error": "Missing filepath argument", "exit_code": -1}
                filepath = self._sanitize_path(args[0])
                return {
                    "success": True,
                    "exit_code": 0,
                    "stdout": str(filepath.exists()),
                    "stderr": ""
                }
            
            else:
                return {
                    "success": False,
                    "error": f"Unsupported filesystem command: {command}",
                    "exit_code": -1
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "exit_code": -1
            }
    
    def get_execution_history(self, tool_id: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """Get execution history for a tool or all tools."""
        if tool_id:
            history = self.execution_history.get(tool_id, [])
        else:
            history = self.executions
        
        return [exec.to_dict() for exec in history[-limit:]]
    
    def get_tool_status(self, tool_id: str) -> Optional[str]:
        """Get current status of a tool."""
        status = self.tool_status.get(tool_id)
        return status.value if status else None
    
    def get_all_tools(self) -> List[Dict]:
        """Get all tool configurations."""
        return [tool.to_dict() for tool in self.tools.values()]
    
    def enable_tool(self, tool_id: str) -> bool:
        """Enable a tool."""
        tool = self.tools.get(tool_id)
        if tool:
            tool.enabled = True
            self.tool_status[tool_id] = ToolStatus.READY
            self._save_config()
            return True
        return False
    
    def disable_tool(self, tool_id: str) -> bool:
        """Disable a tool."""
        tool = self.tools.get(tool_id)
        if tool:
            tool.enabled = False
            self.tool_status[tool_id] = ToolStatus.DISABLED
            self._save_config()
            return True
        return False
    
    def _save_config(self):
        """Save tool configuration to file."""
        config_data = {
            "version": "1.0",
            "tools": [tool.to_dict() for tool in self.tools.values()]
        }
        
        with open(self.config_path, "w") as f:
            json.dump(config_data, f, indent=2)


def create_tool_gateway(config_path: str = "orchestration/tool_config.json") -> ToolGateway:
    """Factory function to create ToolGateway instance."""
    return ToolGateway(config_path)


def main():
    """Main entry point for Tool Gateway."""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: tool_gateway.py <command> [args...]")
        print("Commands: list, execute, history, status")
        sys.exit(1)
    
    gateway = create_tool_gateway()
    command = sys.argv[1]
    
    if command == "list":
        tools = gateway.get_all_tools()
        print(json.dumps(tools, indent=2))
    
    elif command == "execute":
        if len(sys.argv) < 4:
            print("Usage: tool_gateway.py execute <tool_id> <command> [args...]")
            sys.exit(1)
        
        tool_id = sys.argv[2] if len(sys.argv) > 2 else ""
        cmd = sys.argv[3] if len(sys.argv) > 3 else ""
        args = sys.argv[4:] if len(sys.argv) > 4 else []
        
        result = gateway.execute(tool_id, cmd, args)
        print(json.dumps(result, indent=2))
    
    elif command == "history":
        tool_id = sys.argv[2] if len(sys.argv) > 2 else None
        if tool_id:
            history = gateway.get_execution_history(tool_id)
        else:
            history = gateway.get_execution_history()
        print(json.dumps(history, indent=2))
    
    elif command == "status":
        tool_id = sys.argv[2] if len(sys.argv) > 2 else None
        if tool_id:
            status = gateway.get_tool_status(tool_id)
            print(f"Tool {tool_id}: {status}")
        else:
            tools = gateway.get_all_tools()
            for tool in tools:
                tool_status = gateway.get_tool_status(tool["tool_id"])
                print(f"{tool['tool_id']}: {tool_status}")
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
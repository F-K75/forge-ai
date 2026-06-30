"""
Evidence Collector Agent
Collects, verifies, and catalogs execution artifacts for task validation.
"""

import json
import hashlib
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional


class EvidenceCollector:
    """Collects and manages evidence artifacts for completed tasks."""
    
    def __init__(self, artifacts_base_path: str = "artifacts"):
        self.base_path = Path(artifacts_base_path)
        self.base_path.mkdir(exist_ok=True)
    
    def calculate_checksum(self, filepath: Path) -> str:
        """Calculate SHA256 checksum of a file."""
        if not filepath.exists():
            return ""
        
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def get_file_size(self, filepath: Path) -> int:
        """Get file size in bytes."""
        if not filepath.exists():
            return 0
        return filepath.stat().st_size
    
    def collect_task_artifacts(self, task_id: str, phase: int) -> Dict[str, Any]:
        """
        Collect all artifacts for a given task.
        
        Args:
            task_id: Task identifier (e.g., SEC-001)
            phase: Phase number
            
        Returns:
            Evidence package dictionary
        """
        task_dir = self.base_path / task_id
        package_id = f"EVPK-{task_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        # Define artifact locations
        artifact_locations = {
            "implementation": {
                "report": f"orchestration/IMPLEMENTATION_REPORT_{task_id}.json",
                "files_modified": f"orchestration/IMPLEMENTATION_REPORT_{task_id}.json",
            },
            "validation": {
                "report": f"orchestration/VALIDATION_REPORT_{task_id}.json",
            },
            "metadata": {
                "task_definition": "orchestration/CURRENT_TASK.json",
                "execution_plan": "orchestration/EXECUTION_PLAN_DETAILED.json",
            }
        }
        
        # Collect artifacts
        artifacts = []
        missing_artifacts = []
        
        # Implementation report
        impl_report_path = Path(f"orchestration/IMPLEMENTATION_REPORT_{task_id}.json")
        if impl_report_path.exists():
            artifacts.append(self._create_artifact_entry(
                artifact_id=f"ART-{task_id}-IMPL-001",
                artifact_type="implementation_report",
                filename=impl_report_path.name,
                location=str(impl_report_path),
                created_by="Implementation Engineer",
                task_id=task_id
            ))
        else:
            missing_artifacts.append({
                "artifact": "implementation_report",
                "expected_producer": "Implementation Engineer",
                "required_action": "Generate implementation report before validation"
            })
        
        # Validation report
        val_report_path = Path(f"orchestration/VALIDATION_REPORT_{task_id}.json")
        if val_report_path.exists():
            artifacts.append(self._create_artifact_entry(
                artifact_id=f"ART-{task_id}-VAL-001",
                artifact_type="validation_report",
                filename=val_report_path.name,
                location=str(val_report_path),
                created_by="Validation Agent",
                task_id=task_id
            ))
        else:
            missing_artifacts.append({
                "artifact": "validation_report",
                "expected_producer": "Validation Agent",
                "required_action": "Run validation before evidence collection"
            })
        
        # Modified files (from implementation report)
        if impl_report_path.exists():
            try:
                with open(impl_report_path) as f:
                    impl_data = json.load(f)
                
                for idx, filepath in enumerate(impl_data.get("modified_files", []), 1):
                    file_path = Path(filepath)
                    if file_path.exists():
                        artifacts.append(self._create_artifact_entry(
                            artifact_id=f"ART-{task_id}-SRC-{idx:03d}",
                            artifact_type="source_code",
                            filename=file_path.name,
                            location=str(file_path),
                            created_by="Implementation Engineer",
                            task_id=task_id
                        ))
                
                for idx, filepath in enumerate(impl_data.get("created_files", []), 1):
                    file_path = Path(filepath)
                    if file_path.exists():
                        artifacts.append(self._create_artifact_entry(
                            artifact_id=f"ART-{task_id}-NEW-{idx:03d}",
                            artifact_type="new_file",
                            filename=file_path.name,
                            location=str(file_path),
                            created_by="Implementation Engineer",
                            task_id=task_id
                        ))
            except Exception as e:
                missing_artifacts.append({
                    "artifact": "implementation_report_parse",
                    "expected_producer": "Implementation Engineer",
                    "required_action": f"Fix implementation report format: {str(e)}"
                })
        
        # Build evidence package
        evidence_package = {
            "package_id": package_id,
            "version": "1.0",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "checksum": self._calculate_package_checksum(artifacts),
            "task_id": task_id,
            "phase": phase,
            "artifact_count": len(artifacts),
            "missing_count": len(missing_artifacts)
        }
        
        # Determine status
        if missing_artifacts:
            status = "BLOCKED"
        else:
            status = "COMPLETE"
        
        return {
            "agent": "Evidence Collector",
            "task_id": task_id,
            "status": status,
            "evidence_package": evidence_package,
            "artifacts": artifacts,
            "missing_artifacts": missing_artifacts,
            "duplicate_artifacts": [],
            "orphan_artifacts": [],
            "storage_summary": {
                "artifact_count": len(artifacts),
                "total_size_bytes": sum(a.get("size_bytes", 0) for a in artifacts)
            },
            "traceability": {
                "task_id": task_id,
                "phase": phase,
                "implementation_report": f"orchestration/IMPLEMENTATION_REPORT_{task_id}.json",
                "validation_inputs": [
                    f"orchestration/VALIDATION_REPORT_{task_id}.json",
                    "orchestration/CURRENT_TASK.json",
                    "orchestration/EXECUTION_PLAN_DETAILED.json"
                ]
            },
            "next_action": "Ready for Validation Agent" if status == "COMPLETE" else "Resolve missing artifacts"
        }
    
    def _create_artifact_entry(
        self,
        artifact_id: str,
        artifact_type: str,
        filename: str,
        location: str,
        created_by: str,
        task_id: str
    ) -> Dict[str, Any]:
        """Create an artifact entry with metadata."""
        filepath = Path(location)
        return {
            "artifact_id": artifact_id,
            "type": artifact_type,
            "filename": filename,
            "location": location,
            "checksum": self.calculate_checksum(filepath),
            "size_bytes": self.get_file_size(filepath),
            "created_by": created_by,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "task_id": task_id,
            "verified": filepath.exists() and filepath.stat().st_size > 0
        }
    
    def _calculate_package_checksum(self, artifacts: List[Dict]) -> str:
        """Calculate checksum for entire evidence package."""
        if not artifacts:
            return hashlib.sha256(b"empty").hexdigest()
        
        # Combine all artifact checksums
        combined = "|".join(a.get("checksum", "") for a in artifacts)
        return hashlib.sha256(combined.encode()).hexdigest()
    
    def collect_phase_artifacts(self, phase: int, task_ids: List[str]) -> Dict[str, Any]:
        """
        Collect all artifacts for an entire phase.
        
        Args:
            phase: Phase number
            task_ids: List of task IDs in the phase
            
        Returns:
            Phase evidence package
        """
        all_artifacts = []
        missing_artifacts = []
        task_packages = []
        
        for task_id in task_ids:
            task_package = self.collect_task_artifacts(task_id, phase)
            task_packages.append(task_package)
            all_artifacts.extend(task_package.get("artifacts", []))
            missing_artifacts.extend(task_package.get("missing_artifacts", []))
        
        package_id = f"EVPK-PHASE{phase}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        
        return {
            "agent": "Evidence Collector",
            "phase": phase,
            "status": "COMPLETE" if not missing_artifacts else "BLOCKED",
            "evidence_package": {
                "package_id": package_id,
                "version": "1.0",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "checksum": self._calculate_package_checksum(all_artifacts),
                "phase": phase,
                "task_count": len(task_ids),
                "artifact_count": len(all_artifacts),
                "missing_count": len(missing_artifacts)
            },
            "artifacts": all_artifacts,
            "missing_artifacts": missing_artifacts,
            "duplicate_artifacts": [],
            "orphan_artifacts": [],
            "storage_summary": {
                "artifact_count": len(all_artifacts),
                "total_size_bytes": sum(a.get("size_bytes", 0) for a in all_artifacts),
                "tasks_collected": len(task_ids)
            },
            "traceability": {
                "phase": phase,
                "task_ids": task_ids,
                "task_packages": [tp.get("evidence_package", {}).get("package_id") for tp in task_packages]
            },
            "next_action": "Ready for Phase Validation" if not missing_artifacts else "Resolve missing artifacts"
        }


def main():
    """Main entry point for Evidence Collector."""
    import sys
    
    if len(sys.argv) < 3:
        print("Usage: evidence_collector.py <task_id> <phase>")
        print("   or: evidence_collector.py --phase <phase> <task_id1> <task_id2> ...")
        sys.exit(1)
    
    collector = EvidenceCollector()
    
    if sys.argv[1] == "--phase":
        phase = int(sys.argv[2])
        task_ids = sys.argv[3:]
        result = collector.collect_phase_artifacts(phase, task_ids)
    else:
        task_id = sys.argv[1]
        phase = int(sys.argv[2])
        result = collector.collect_task_artifacts(task_id, phase)
    
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
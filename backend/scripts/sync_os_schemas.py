"""Copy the canonical Forge OS schemas into the frontend and backend trees.

shared/os-schemas/ is canonical. The frontend Docker build only copies
frontend/ and the backend image only copies backend/, so each keeps a
byte-identical copy that drift tests compare against the canonical files
(frontend/src/os/contracts.test.ts, backend/tests/test_os_contracts.py).

    python backend/scripts/sync_os_schemas.py           # copy
    python backend/scripts/sync_os_schemas.py --check   # exit 1 on drift
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CANONICAL = ROOT / "shared" / "os-schemas"
TARGETS = [ROOT / "frontend" / "src" / "os" / "schemas", ROOT / "backend" / "core" / "os_schemas"]
FILES = ["os-contracts.schema.json", "forge-ember.catalog.json", "capability-index.json", "capabilities.json"]


def main(argv: list[str]) -> int:
    check = "--check" in argv
    drift = []
    for target in TARGETS:
        target.mkdir(parents=True, exist_ok=True)
        for name in FILES:
            src, dst = CANONICAL / name, target / name
            if dst.exists() and dst.read_bytes() == src.read_bytes():
                continue
            if check:
                drift.append(str(dst.relative_to(ROOT)))
            else:
                shutil.copyfile(src, dst)
                print(f"updated {dst.relative_to(ROOT)}")
    if drift:
        print("OS schema copies out of date (run backend/scripts/sync_os_schemas.py):", *drift, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

"""Create a consistent PostgreSQL backup using pg_dump (no database writes).

Usage: python backup_postgres.py [output-directory]
Requires DATABASE_URL and the PostgreSQL pg_dump client on PATH. Store output off-host.
"""
from datetime import datetime, timezone
from pathlib import Path
import os, shutil, subprocess, sys

url = os.environ.get("DATABASE_URL", "").strip()
if not url.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
    raise SystemExit("DATABASE_URL must be set to the PostgreSQL database to back up.")
pg_dump = shutil.which("pg_dump")
if not pg_dump:
    raise SystemExit("pg_dump was not found. Install PostgreSQL client tools and retry.")
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent / "backups"
out.mkdir(parents=True, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
target = out / f"school_postgres_{stamp}.dump"
try:
    subprocess.run([pg_dump, "--dbname", url, "--format=custom", "--no-owner", "--file", str(target)], check=True)
except subprocess.CalledProcessError:
    target.unlink(missing_ok=True)
    raise SystemExit("pg_dump failed. Check connectivity and database backup permissions; no backup was reported as successful.")
print(target)

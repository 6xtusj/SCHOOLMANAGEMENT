"""Restore a pg_dump custom-format backup into a separate, empty PostgreSQL database.

Usage: DATABASE_URL=postgresql://... python restore_postgres.py backup.dump
The script intentionally does not use --clean/--if-exists and never drops objects.
Use a new empty database for recovery drills; verify records before switching production.
"""
from pathlib import Path
import os, shutil, subprocess, sys

url = os.environ.get('DATABASE_URL', '').strip()
if not url.startswith(('postgres://', 'postgresql://', 'postgresql+psycopg://')):
    raise SystemExit('DATABASE_URL must identify the target PostgreSQL database.')
if len(sys.argv) != 2:
    raise SystemExit('Usage: python restore_postgres.py path-to-backup.dump')
backup = Path(sys.argv[1]).expanduser().resolve()
if not backup.is_file() or backup.stat().st_size == 0:
    raise SystemExit('Backup file is missing or empty.')
pg_restore = shutil.which('pg_restore')
if not pg_restore:
    raise SystemExit('pg_restore was not found. Install PostgreSQL client tools.')
confirm = input('This restores into the DATABASE_URL target without dropping objects. Use a NEW EMPTY test database. Type RESTORE to continue: ')
if confirm != 'RESTORE':
    raise SystemExit('Restore cancelled.')
subprocess.run([pg_restore, '--dbname', url, '--no-owner', '--exit-on-error', str(backup)], check=True)
print('Restore command completed. Verify school records and uploaded objects before any production cutover.')

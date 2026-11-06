"""Create a consistent SQLite + uploads backup for the school system.
Run: python backup_school.py [optional-output-directory]
The script intentionally excludes .env, secrets, virtualenvs and frontend dependencies.
"""
from pathlib import Path
from datetime import datetime
import os, sqlite3, sys, zipfile

ROOT = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
except ImportError:
    pass
DB_PATH = Path(os.environ.get('SCHOOL_DB_PATH', ROOT / 'school.db'))
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'backups'
OUT.mkdir(parents=True, exist_ok=True)
stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
tmp_db = OUT / f'school_{stamp}.sqlite3'
archive = OUT / f'school_backup_{stamp}.zip'
if not DB_PATH.exists():
    raise SystemExit(f'Database not found: {DB_PATH}')
with sqlite3.connect(DB_PATH) as source, sqlite3.connect(tmp_db) as target:
    source.backup(target)
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.write(tmp_db, 'school.db')
    uploads = ROOT / 'uploads'
    if uploads.exists():
        for item in uploads.rglob('*'):
            if item.is_file(): zf.write(item, str(Path('uploads') / item.relative_to(uploads)))
    zf.writestr('BACKUP_INFO.txt', f'Created: {datetime.now().isoformat()}\nSource database: {DB_PATH.name}\nRestore: stop the app, preserve the current database and uploads folder, extract school.db and uploads/ from this archive, then start the app and verify records.\n')
tmp_db.unlink(missing_ok=True)
print(archive)

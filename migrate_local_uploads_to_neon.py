"""Copy local uploads into Neon without deleting the source files.

Run after setting DATABASE_URL and UPLOAD_DIR (default: ./uploads):
    python migrate_local_uploads_to_neon.py
The script skips filenames already present in stored_files.
"""
from __future__ import annotations

import hashlib
import mimetypes
import os
import re
from datetime import datetime, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / '.env')
except ImportError:
    pass

from database import connect, uses_postgres


def main():
    if not uses_postgres():
        raise SystemExit('Set DATABASE_URL to your Neon PostgreSQL connection string first.')
    root = Path(os.environ.get('UPLOAD_DIR', Path(__file__).resolve().parent / 'uploads'))
    if not root.is_dir():
        print(f'No local uploads directory found at {root}; nothing to migrate.')
        return
    copied = skipped = failed = 0
    with connect(Path(os.environ.get('SCHOOL_DB_PATH', Path(__file__).resolve().parent / 'school.db'))) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS stored_files (filename TEXT PRIMARY KEY, content BYTEA NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL)')
        for path in sorted(root.iterdir()):
            if not path.is_file() or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,255}', path.name):
                continue
            if conn.execute('SELECT 1 FROM stored_files WHERE filename=?', (path.name,)).fetchone():
                skipped += 1
                continue
            try:
                payload = path.read_bytes()
                conn.execute(
                    'INSERT INTO stored_files(filename,content,content_type,size_bytes,sha256,created_at) VALUES(?,?,?,?,?,?)',
                    (path.name, payload, mimetypes.guess_type(path.name)[0] or 'application/octet-stream',
                     len(payload), hashlib.sha256(payload).hexdigest(), datetime.now(timezone.utc).isoformat()),
                )
                copied += 1
            except Exception as exc:
                failed += 1
                print(f'Could not copy {path.name}: {type(exc).__name__}')
    print(f'Finished. Copied: {copied}; already present: {skipped}; failed: {failed}.')
    print('Original local files were not deleted. Verify the Neon uploads before removing any source copy.')


if __name__ == '__main__':
    main()

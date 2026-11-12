"""Private upload storage backed by the application's primary database.

Production deployments on ephemeral hosts should use PostgreSQL/Neon. Local
filesystem storage remains available for local development only.
"""
from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Callable


class StorageError(RuntimeError):
    pass


class FileStorage:
    def __init__(self, directory, env=None, database_connect: Callable | None = None,
                 database_enabled: bool = False):
        self._env = env if env is not None else os.environ
        self.directory = Path(directory)
        default_mode = 'database' if self._env.get('APP_ENV', 'development').lower() == 'production' else 'local'
        self.mode = self._env.get('UPLOAD_STORAGE', default_mode).strip().lower()
        if self.mode in ('db', 's3'):
            # Treat the former S3 setting as the new Neon-backed mode so an
            # already-configured Render service does not remain stuck on boot.
            self.mode = 'database'
        self._database_connect = database_connect
        self.database_enabled = database_enabled
        if self.mode not in ('local', 'database'):
            raise RuntimeError('UPLOAD_STORAGE must be either database or local.')
        if self.mode == 'database' and (not self._database_connect or not self.database_enabled):
            raise RuntimeError('Database file storage requires DATABASE_URL to point to PostgreSQL.')
        if self.mode == 'local':
            self.directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _safe_name(filename):
        if (not isinstance(filename, str)
                or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,255}', filename)
                or filename in ('.', '..')):
            raise ValueError('Invalid upload filename.')
        return filename

    def save_bytes(self, filename, content, content_type):
        name = self._safe_name(filename)
        if not isinstance(content, (bytes, bytearray, memoryview)):
            raise TypeError('File content must be bytes.')
        payload = bytes(content)
        if self.mode == 'local':
            target = (self.directory / name).resolve()
            if target.parent != self.directory.resolve():
                raise ValueError('Invalid upload filename.')
            self.directory.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
            return
        digest = hashlib.sha256(payload).hexdigest()
        try:
            with self._database_connect() as conn:
                conn.execute('DELETE FROM stored_files WHERE filename=?', (name,))
                conn.execute(
                    'INSERT INTO stored_files(filename, content, content_type, size_bytes, sha256, created_at) '
                    'VALUES(?,?,?,?,?,?)',
                    (name, payload, content_type or 'application/octet-stream', len(payload), digest,
                     __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()),
                )
        except Exception as exc:
            raise StorageError('Could not save the uploaded file to the PostgreSQL database.') from exc

    def save_file(self, upload, filename, content_type):
        content = upload.stream.read()
        upload.stream.seek(0)
        self.save_bytes(filename, content, content_type)

    def read(self, filename):
        name = self._safe_name(filename)
        if self.mode == 'local':
            target = (self.directory / name).resolve()
            if target.parent != self.directory.resolve() or not target.is_file():
                raise FileNotFoundError(name)
            return target.read_bytes()
        try:
            with self._database_connect() as conn:
                row = conn.execute('SELECT content FROM stored_files WHERE filename=?', (name,)).fetchone()
            if row is None:
                raise FileNotFoundError(name)
            value = row['content'] if hasattr(row, 'keys') else row[0]
            return bytes(value)
        except FileNotFoundError:
            raise
        except Exception as exc:
            raise StorageError('Could not read the uploaded file from the PostgreSQL database.') from exc

    def delete(self, filename):
        name = self._safe_name(filename)
        if self.mode == 'local':
            target = (self.directory / name).resolve()
            if target.parent != self.directory.resolve():
                raise ValueError('Invalid upload filename.')
            target.unlink(missing_ok=True)
            return
        try:
            with self._database_connect() as conn:
                conn.execute('DELETE FROM stored_files WHERE filename=?', (name,))
        except Exception as exc:
            raise StorageError('Could not delete the uploaded file from the PostgreSQL database.') from exc

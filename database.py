import re
import sqlite3
import os
from pathlib import Path


DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
APP_ENV = os.environ.get('APP_ENV', 'development').strip().lower()
_is_postgres_url = DATABASE_URL.lower().startswith(('postgres://', 'postgresql://', 'postgresql+psycopg://'))
_CONNECTION_URL = DATABASE_URL.replace('postgresql+psycopg://', 'postgresql://', 1) if DATABASE_URL.lower().startswith('postgresql+psycopg://') else DATABASE_URL
if APP_ENV == 'production' and not _is_postgres_url and os.environ.get('ALLOW_SQLITE_IN_PRODUCTION', '').strip().lower() != 'true':
    raise RuntimeError('Production startup refused: DATABASE_URL must point to PostgreSQL. For a deliberately single-host SQLite deployment only, set ALLOW_SQLITE_IN_PRODUCTION=true and use persistent storage.')
if DATABASE_URL and not _is_postgres_url:
    raise RuntimeError('DATABASE_URL must be a PostgreSQL URL; remove it to use SQLite in development.')
_psycopg = None
_pool = None
_pool_lock = None

try:
    if _is_postgres_url:
        import psycopg
        from psycopg_pool import ConnectionPool
        from threading import Lock
        _psycopg = psycopg
        _pool_lock = Lock()
except ImportError as exc:
    if _is_postgres_url:
        raise RuntimeError('PostgreSQL support requires psycopg and psycopg-pool. Install requirements.txt.') from exc


def uses_postgres():
    return _is_postgres_url


def close_pool():
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def _get_pool():
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                minimum = max(1, int(os.environ.get('DB_POOL_MIN', '1')))
                maximum = max(minimum, int(os.environ.get('DB_POOL_MAX', '8')))
                _pool = ConnectionPool(
                    conninfo=_CONNECTION_URL,
                    min_size=minimum,
                    max_size=maximum,
                    timeout=float(os.environ.get('DB_POOL_TIMEOUT', '10')),
                    max_idle=float(os.environ.get('DB_POOL_MAX_IDLE', '300')),
                    reconnect_timeout=float(os.environ.get('DB_POOL_RECONNECT_TIMEOUT', '30')),
                    kwargs={'connect_timeout': int(os.environ.get('DB_CONNECT_TIMEOUT', '10')),
                            'row_factory': _hybrid_row_factory},
                    open=True,
                )
    return _pool


def database_errors():
    return (sqlite3.Error, _psycopg.Error) if _psycopg else (sqlite3.Error,)


def integrity_errors():
    return (sqlite3.IntegrityError, _psycopg.IntegrityError) if _psycopg else (sqlite3.IntegrityError,)


class HybridRow(dict):
    def __getitem__(self, key):
        if isinstance(key, int):
            return tuple(self.values())[key]
        return super().__getitem__(key)


def _hybrid_row_factory(cursor):
    columns = [column.name for column in cursor.description] if cursor.description else []

    def make_row(values):
        return HybridRow(zip(columns, values))

    return make_row


def _replace_qmark_parameters(query):
    output = []
    quote = None
    index = 0
    while index < len(query):
        char = query[index]
        if quote:
            output.append(char)
            if char == quote:
                if index + 1 < len(query) and query[index + 1] == quote:
                    output.append(query[index + 1])
                    index += 1
                else:
                    quote = None
        elif char in ("'", '"'):
            quote = char
            output.append(char)
        elif char == '?':
            output.append('%s')
        else:
            output.append(char)
        index += 1
    return ''.join(output)


def translate_postgres_query(query):
    table_info = re.fullmatch(r'\s*PRAGMA\s+table_info\((\w+)\)\s*;?\s*', query, re.IGNORECASE)
    if table_info:
        return (
            'SELECT column_name AS name FROM information_schema.columns '
            'WHERE table_schema = current_schema() AND table_name = %s '
            'ORDER BY ordinal_position'
        ), (table_info.group(1).lower(),)

    translated = query
    translated = re.sub(
        r"json_extract\(([\w.]+),\s*'\$\.([\w]+)'\)",
        r"(\1::jsonb ->> '\2')",
        translated,
        flags=re.IGNORECASE,
    )
    translated = re.sub(
        r"json_set\(([\w.]+),\s*'\$\.([\w]+)',\s*'([^']*)'\)",
        r"((\1::jsonb || jsonb_build_object('\2', to_jsonb('\3'::text)))::text)",
        translated,
        flags=re.IGNORECASE,
    )
    translated = re.sub(
        r"json_set\(([\w.]+),\s*'\$\.([\w]+)',\s*\?\)",
        r"((\1::jsonb || jsonb_build_object('\2', to_jsonb(?::text)))::text)",
        translated,
        flags=re.IGNORECASE,
    )
    translated = re.sub(
        r"(\(?[\w.]+::jsonb\s*->>\s*'[\w]+'\)?)\s+IS\s+NOT\s+1",
        r"COALESCE(\1 NOT IN ('1', 'true'), TRUE)",
        translated,
        flags=re.IGNORECASE,
    )
    translated = re.sub(
        r"(\(?[\w.]+::jsonb\s*->>\s*'[\w]+'\)?)\s+COLLATE\s+NOCASE\b",
        r"lower(\1)",
        translated,
        flags=re.IGNORECASE,
    )
    translated = re.sub(r"\s+COLLATE\s+NOCASE\b", '', translated, flags=re.IGNORECASE)
    translated = re.sub(
        r"([\w.]+)\s*<\s*datetime\('now'\s*,\s*'-90 days'\)",
        r"\1::timestamptz < (CURRENT_TIMESTAMP - INTERVAL '90 days')",
        translated,
        flags=re.IGNORECASE,
    )
    translated = re.sub(r'\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b', 'BIGSERIAL PRIMARY KEY', translated, flags=re.IGNORECASE)
    translated = re.sub(r'\bDEFAULT\s+"([^"]*)"', r"DEFAULT '\1'", translated, flags=re.IGNORECASE)

    if re.search(r'\bINSERT\s+OR\s+REPLACE\s+INTO\s+verification_codes\b', translated, re.IGNORECASE):
        translated = re.sub(
            r'\bINSERT\s+OR\s+REPLACE\s+INTO\s+verification_codes\b',
            'INSERT INTO verification_codes',
            translated,
            flags=re.IGNORECASE,
        )
        translated = translated.rstrip().rstrip(';') + (
            ' ON CONFLICT(email) DO UPDATE SET '
            'code=EXCLUDED.code, expires_at=EXCLUDED.expires_at'
        )
    elif re.search(r'\bINSERT\s+OR\s+IGNORE\s+INTO\b', translated, re.IGNORECASE):
        translated = re.sub(r'\bINSERT\s+OR\s+IGNORE\s+INTO\b', 'INSERT INTO', translated, flags=re.IGNORECASE)
        translated = translated.rstrip().rstrip(';') + ' ON CONFLICT DO NOTHING'

    return _replace_qmark_parameters(translated), None


class PostgresConnection:
    def __init__(self, connection, release=None):
        self._connection = connection
        self._release = release
        self._closed = False

    def execute(self, query, parameters=()):
        translated = translate_postgres_query(query)
        if isinstance(translated, tuple):
            query, extra_parameters = translated
            if extra_parameters is not None:
                parameters = extra_parameters
        else:
            query = translated
        return self._connection.execute(query, parameters, prepare=False)

    def __enter__(self):
        return self

    def close(self):
        if self._closed:
            return
        self._closed = True
        if self._release:
            self._release(self._connection)
        else:
            self._connection.close()

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            if exc_type is None:
                self._connection.commit()
            else:
                self._connection.rollback()
        finally:
            self._connection.close()
        return False


class ClosingSQLiteConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def connect(database_path):
    if not uses_postgres():
        database_path = Path(database_path)
        database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(database_path, factory=ClosingSQLiteConnection)
        connection.row_factory = sqlite3.Row
        return connection

    if _psycopg is None:
        raise RuntimeError('PostgreSQL support requires psycopg. Install dependencies from requirements.txt.')
    pool = _get_pool()
    connection = pool.getconn(timeout=float(os.environ.get('DB_POOL_TIMEOUT', '10')))
    return PostgresConnection(connection, release=pool.putconn)

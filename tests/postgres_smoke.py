import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app


if not app.uses_postgres():
    raise RuntimeError('Set DATABASE_URL to a disposable PostgreSQL test database.')

record_id = str(uuid.uuid4())
verification_email = f'{record_id}@school.test'
migration_version = int(record_id.replace('-', '')[:8], 16)

with app.db() as connection:
    connection.execute(
        'INSERT INTO records(id,entity,data,created_date,updated_date) VALUES(?,?,?,?,?)',
        (record_id, 'DatabaseSmokeTest', json.dumps({'role': 'teacher'}), app.now(), app.now()),
    )
    row = connection.execute(
        "SELECT json_extract(data,'$.role') AS role FROM records WHERE id=?",
        (record_id,),
    ).fetchone()
    assert row['role'] == 'teacher'

    connection.execute(
        "UPDATE records SET data=json_set(data,'$.role',?) WHERE id=?",
        ('principal', record_id),
    )
    row = connection.execute(
        "SELECT json_extract(data,'$.role') AS role FROM records WHERE id=?",
        (record_id,),
    ).fetchone()
    assert row[0] == 'principal'

    literal = connection.execute("SELECT '?' AS literal, ? AS value", ('bound',)).fetchone()
    assert literal['literal'] == '?' and literal['value'] == 'bound'

    columns = connection.execute('PRAGMA table_info(records)').fetchall()
    assert any(column['name'] == 'data' for column in columns)

    connection.execute(
        'INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)',
        (migration_version, app.now()),
    )
    connection.execute(
        'INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)',
        (migration_version, app.now()),
    )
    assert connection.execute(
        'SELECT COUNT(*) FROM schema_migrations WHERE version=?',
        (migration_version,),
    ).fetchone()[0] == 1

    connection.execute(
        'INSERT OR REPLACE INTO verification_codes(email,code,expires_at) VALUES(?,?,?)',
        (verification_email, 'first', app.now()),
    )
    connection.execute(
        'INSERT OR REPLACE INTO verification_codes(email,code,expires_at) VALUES(?,?,?)',
        (verification_email, 'second', app.now()),
    )
    assert connection.execute(
        'SELECT code FROM verification_codes WHERE email=?',
        (verification_email,),
    ).fetchone()['code'] == 'second'

    connection.execute('DELETE FROM records WHERE id=?', (record_id,))
    connection.execute('DELETE FROM schema_migrations WHERE version=?', (migration_version,))
    connection.execute('DELETE FROM verification_codes WHERE email=?', (verification_email,))

response = app.app.test_client().get('/healthz')
health = response.get_json()
assert response.status_code == 200 and health['status'] == 'ok'
assert health['database'] == 'ok'
assert health['database_engine'] == 'postgresql'
assert health['durable_database'] is True
print('PostgreSQL schema, query compatibility, conflict handling, and health check passed.')

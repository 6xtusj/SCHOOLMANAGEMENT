import os
import unittest

os.environ['DATABASE_URL'] = ''

from database import translate_postgres_query


def sql_only(query):
    translated = translate_postgres_query(query)
    return translated[0] if isinstance(translated, tuple) else translated


class PostgresTranslationTests(unittest.TestCase):
    def test_table_info_uses_postgres_catalog(self):
        query, parameters = translate_postgres_query('PRAGMA table_info(academic_terms)')
        self.assertIn('information_schema.columns', query)
        self.assertEqual(parameters, ('academic_terms',))

    def test_json_extract_and_qmark_parameters_are_translated(self):
        query = sql_only(
            "SELECT id FROM records WHERE json_extract(data,'$.email')=? AND note='?'"
        )
        self.assertEqual(
            query,
            "SELECT id FROM records WHERE (data::jsonb ->> 'email')=%s AND note='?'",
        )

    def test_json_set_and_json_index_expressions_are_translated(self):
        query = sql_only(
            "UPDATE records SET data=json_set(data,'$.role',?),"
            "updated_date=? WHERE lower(json_extract(data,'$.email'))=?"
        )
        self.assertEqual(
            query,
            "UPDATE records SET data=((data::jsonb || jsonb_build_object('role', "
            "to_jsonb(%s::text)))::text),updated_date=%s "
            "WHERE lower((data::jsonb ->> 'email'))=%s",
        )

    def test_sqlite_insert_conflict_and_ddl_are_translated(self):
        ignored = sql_only(
            'INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)'
        )
        self.assertEqual(
            ignored,
            'INSERT INTO schema_migrations(version,applied_at) VALUES(%s,%s) ON CONFLICT DO NOTHING',
        )
        replaced = sql_only(
            'INSERT OR REPLACE INTO verification_codes(email,code,expires_at) VALUES(?,?,?)'
        )
        self.assertEqual(
            replaced,
            'INSERT INTO verification_codes(email,code,expires_at) VALUES(%s,%s,%s) '
            'ON CONFLICT(email) DO UPDATE SET code=EXCLUDED.code, expires_at=EXCLUDED.expires_at',
        )
        ddl = sql_only(
            'CREATE TABLE login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT)'
        )
        self.assertEqual(
            ddl,
            'CREATE TABLE login_attempts (id BIGSERIAL PRIMARY KEY, email TEXT)',
        )

    def test_sqlite_datetime_and_boolean_comparison_are_translated(self):
        query = sql_only(
            "SELECT id FROM records WHERE created_at < datetime('now','-90 days') "
            "AND json_extract(data,'$.archived') IS NOT 1 "
            "ORDER BY json_extract(data,'$.name') COLLATE NOCASE"
        )
        self.assertEqual(
            query,
            "SELECT id FROM records WHERE created_at::timestamptz < (CURRENT_TIMESTAMP - INTERVAL '90 days') "
            "AND COALESCE((data::jsonb ->> 'archived') NOT IN ('1', 'true'), TRUE) "
            "ORDER BY lower((data::jsonb ->> 'name'))",
        )


if __name__ == '__main__':
    unittest.main()

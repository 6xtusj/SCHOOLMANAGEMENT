import sqlite3
import tempfile
import unittest
from pathlib import Path

from storage import FileStorage, StorageError


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc, tb):
        try:
            return super().__exit__(exc_type, exc, tb)
        finally:
            self.close()


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db_path = self.root / 'test.db'
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('CREATE TABLE stored_files (filename TEXT PRIMARY KEY, content BLOB NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL)')

    def tearDown(self):
        self.temp.cleanup()

    def connect(self):
        conn = sqlite3.connect(self.db_path, factory=ClosingConnection)
        conn.row_factory = sqlite3.Row
        return conn

    def test_database_save_read_delete(self):
        store = FileStorage(self.root / 'uploads', env={'UPLOAD_STORAGE': 'database'},
                            database_connect=self.connect, database_enabled=True)
        payload = b'private school document contents'
        store.save_bytes('receipt.pdf', payload, 'application/pdf')
        self.assertEqual(store.read('receipt.pdf'), payload)
        with self.connect() as conn:
            row = conn.execute('SELECT content_type,size_bytes,sha256 FROM stored_files WHERE filename=?', ('receipt.pdf',)).fetchone()
        self.assertEqual(row['content_type'], 'application/pdf')
        self.assertEqual(row['size_bytes'], len(payload))
        self.assertEqual(len(row['sha256']), 64)
        store.delete('receipt.pdf')
        with self.assertRaises(FileNotFoundError):
            store.read('receipt.pdf')

    def test_local_mode_remains_available(self):
        store = FileStorage(self.root / 'uploads', env={'UPLOAD_STORAGE': 'local'})
        store.save_bytes('photo.jpg', b'image', 'image/jpeg')
        self.assertEqual(store.read('photo.jpg'), b'image')
        store.delete('photo.jpg')
        self.assertFalse((self.root / 'uploads' / 'photo.jpg').exists())

    def test_old_s3_environment_value_maps_to_database(self):
        store = FileStorage(self.root / 'uploads', env={'UPLOAD_STORAGE': 's3'},
                            database_connect=self.connect, database_enabled=True)
        self.assertEqual(store.mode, 'database')

    def test_database_mode_requires_postgresql_connection(self):
        with self.assertRaises(RuntimeError):
            FileStorage(self.root / 'uploads', env={'UPLOAD_STORAGE': 'database'},
                        database_connect=self.connect, database_enabled=False)

    def test_filename_traversal_rejected(self):
        store = FileStorage(self.root / 'uploads', env={'UPLOAD_STORAGE': 'local'})
        with self.assertRaises(ValueError):
            store.save_bytes('../secret.txt', b'x', 'text/plain')


if __name__ == '__main__':
    unittest.main()

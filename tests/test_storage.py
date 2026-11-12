import io
import tempfile
import unittest
from pathlib import Path

from storage import FileStorage


class FakeS3:
    def __init__(self):
        self.objects={}

    def put_object(self,**kwargs):
        self.objects[(kwargs['Bucket'],kwargs['Key'])]={
            'Body':kwargs['Body'],
            'ContentType':kwargs['ContentType'],
        }

    def get_object(self,Bucket,Key):
        stored=self.objects[(Bucket,Key)]
        return {'Body':io.BytesIO(stored['Body'])}

    def delete_object(self,Bucket,Key):
        self.objects.pop((Bucket,Key),None)


class FileStorageTests(unittest.TestCase):
    def test_local_storage_round_trip_and_path_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            storage=FileStorage(directory)
            storage.save_bytes('school.png',b'image','image/png')
            self.assertEqual(storage.read('school.png'),b'image')
            with self.assertRaises(ValueError):
                storage.read('../secret.txt')
            storage.delete('school.png')
            with self.assertRaises(FileNotFoundError):
                storage.read('school.png')

    def test_s3_compatible_storage_keeps_bucket_private_and_round_trips(self):
        client=FakeS3()
        env={
            'UPLOAD_STORAGE':'s3',
            'S3_BUCKET':'private-school-files',
            'S3_ACCESS_KEY_ID':'test-access-key',
            'S3_SECRET_ACCESS_KEY':'test-secret-key',
            'S3_PREFIX':'school/private',
        }
        with tempfile.TemporaryDirectory() as directory:
            storage=FileStorage(Path(directory),env=env,client=client)
            storage.save_bytes('random-id.pdf',b'%PDF-test','application/pdf')
            key=('private-school-files','school/private/random-id.pdf')
            self.assertEqual(client.objects[key]['ContentType'],'application/pdf')
            self.assertEqual(storage.read('random-id.pdf'),b'%PDF-test')
            storage.delete('random-id.pdf')
            self.assertNotIn(key,client.objects)


    def test_r2_uses_the_same_s3_compatible_adapter(self):
        client=FakeS3()
        env={
            'UPLOAD_STORAGE':'s3',
            'S3_BUCKET':'school-private',
            'S3_ENDPOINT_URL':'https://account-id.r2.cloudflarestorage.com',
            'S3_REGION':'auto',
            'S3_ACCESS_KEY_ID':'r2-access',
            'S3_SECRET_ACCESS_KEY':'r2-secret',
        }
        storage=FileStorage('.',env=env,client=client)
        storage.save_bytes('r2-check.pdf',b'%PDF','application/pdf')
        self.assertEqual(storage.read('r2-check.pdf'),b'%PDF')

    def test_s3_storage_requires_explicit_credentials(self):
        with self.assertRaisesRegex(RuntimeError,'S3_BUCKET'):
            FileStorage('.',env={'UPLOAD_STORAGE':'s3'})


if __name__ == '__main__':
    unittest.main()

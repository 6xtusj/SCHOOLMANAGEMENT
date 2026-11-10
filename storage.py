import os
import re
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError


class StorageError(RuntimeError):
    pass


class FileStorage:
    def __init__(self, directory, env=None, client=None):
        self._env=env or os.environ
        self.directory=Path(directory)
        self.mode=self._env.get('UPLOAD_STORAGE','local').strip().lower()
        self.bucket=self._env.get('S3_BUCKET','').strip()
        self.prefix=self._env.get('S3_PREFIX','school-uploads').strip('/')
        self._client=client
        if self.mode not in ('local','s3'):
            raise RuntimeError('UPLOAD_STORAGE must be either local or s3.')
        if self.mode=='s3' and not all((
            self.bucket,
            self._env.get('S3_ACCESS_KEY_ID','').strip(),
            self._env.get('S3_SECRET_ACCESS_KEY','').strip(),
        )):
            raise RuntimeError('S3 uploads require S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.')

    @staticmethod
    def _safe_name(filename):
        if not isinstance(filename,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,255}',filename) or filename in ('.','..'):
            raise ValueError('Invalid upload filename.')
        return filename

    def _key(self, filename):
        name=self._safe_name(filename)
        return f'{self.prefix}/{name}' if self.prefix else name

    def _s3(self):
        if self._client is None:
            endpoint=self._env.get('S3_ENDPOINT_URL','').strip() or None
            region=self._env.get('S3_REGION','auto').strip() or 'auto'
            try:
                self._client=boto3.client(
                    's3',
                    endpoint_url=endpoint,
                    region_name=region,
                    aws_access_key_id=self._env['S3_ACCESS_KEY_ID'],
                    aws_secret_access_key=self._env['S3_SECRET_ACCESS_KEY'],
                )
            except (BotoCoreError,ValueError) as exc:
                raise StorageError('Could not configure external upload storage.') from exc
        return self._client

    def save_bytes(self, filename, content, content_type):
        name=self._safe_name(filename)
        if self.mode=='local':
            target=(self.directory/name).resolve()
            if target.parent!=self.directory.resolve():
                raise ValueError('Invalid upload filename.')
            self.directory.mkdir(parents=True,exist_ok=True)
            target.write_bytes(content)
            return
        try:
            self._s3().put_object(
                Bucket=self.bucket,
                Key=self._key(name),
                Body=content,
                ContentType=content_type or 'application/octet-stream',
            )
        except (BotoCoreError,ClientError) as exc:
            raise StorageError('Could not save the uploaded file to external storage.') from exc

    def save_file(self, upload, filename, content_type):
        content=upload.stream.read()
        upload.stream.seek(0)
        self.save_bytes(filename,content,content_type)

    def read(self, filename):
        name=self._safe_name(filename)
        if self.mode=='local':
            target=(self.directory/name).resolve()
            if target.parent!=self.directory.resolve() or not target.is_file():
                raise FileNotFoundError(name)
            return target.read_bytes()
        try:
            response=self._s3().get_object(Bucket=self.bucket,Key=self._key(name))
            return response['Body'].read()
        except ClientError as exc:
            status=exc.response.get('ResponseMetadata',{}).get('HTTPStatusCode')
            code=exc.response.get('Error',{}).get('Code')
            if status==404 or code in ('NoSuchKey','NotFound'):
                raise FileNotFoundError(name) from exc
            raise StorageError('Could not read the uploaded file from external storage.') from exc
        except BotoCoreError as exc:
            raise StorageError('Could not read the uploaded file from external storage.') from exc

    def delete(self, filename):
        name=self._safe_name(filename)
        if self.mode=='local':
            target=(self.directory/name).resolve()
            if target.parent!=self.directory.resolve():
                raise ValueError('Invalid upload filename.')
            target.unlink(missing_ok=True)
            return
        try:
            self._s3().delete_object(Bucket=self.bucket,Key=self._key(name))
        except (BotoCoreError,ClientError) as exc:
            raise StorageError('Could not delete the uploaded file from external storage.') from exc

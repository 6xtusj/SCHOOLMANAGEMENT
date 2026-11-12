# V9.2 Neon-backed file storage — implementation and verification

## Implemented

- Removed the mandatory S3/R2 production startup requirement.
- Replaced the S3 adapter with a database-backed private file store using PostgreSQL `BYTEA` (Neon).
- Added additive `stored_files` schema migration version 8 with filename, content, MIME type, byte size, SHA-256 and timestamp.
- Preserved the existing `/uploads/<filename>` URI contract and existing application authorization checks for student/staff documents, school logos, public-site images, curriculum files and fee receipts.
- Kept local filesystem uploads as the development default. Production Render Blueprint sets `UPLOAD_STORAGE=database`.
- Removed S3 environment variables, boto3 dependency and object-storage backup scripts from the deployment package.
- Updated README and operations guidance to include uploaded files in PostgreSQL backups.

## Important data-preservation note

The database migration is additive and does not delete school records. Files that existed only in an old local `uploads/` directory are not automatically imported. If that directory contains files that must be retained, import/verify them before deleting the old directory or any persistent disk. The submitted archive did not include an `uploads/` directory. The existing `school.db` and `school_demo.db` files are retained unchanged in the delivered archive; they are not automatically merged into Neon.

## Checks

- Python syntax compilation: performed on changed Python modules.
- Storage behaviour tests: local mode and database mode tested against a temporary SQLite database using the same SQL interface; production backend is PostgreSQL-only by configuration.
- App import/runtime, live Neon connection, Render deployment and browser upload authorization: not verifiable here because no Neon credentials or Render access were provided.
- Frontend source/layout: unchanged.
- ZIP integrity and secret-file exclusion: checked on the final archive.

This update removes the exact S3 startup blocker shown in the supplied Render log. Successful deployment still depends on a valid Render `DATABASE_URL` pointing to the intended Neon database and a valid production `SECRET_KEY`.

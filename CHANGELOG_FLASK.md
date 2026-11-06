# Flask conversion update

- Retained all original React source files and original page/component structure.
- Replaced the hosted Base44 data client with the local Flask API adapter.
- Added schema-driven role-based read/create/update/delete policy evaluation from the supplied entity definitions.
- Added per-record authorization for bulk writes, including row-level policies.
- Added required-field, enum, and basic type validation for entity writes.
- Fixed registration so an invited user activates the existing invitation record rather than creating a duplicate User record.
- Kept local upload handling, password hashing, session authentication, and SQLite persistence.
- Documented external services that still require credentials/configuration (Google OAuth, email delivery, payment gateway).

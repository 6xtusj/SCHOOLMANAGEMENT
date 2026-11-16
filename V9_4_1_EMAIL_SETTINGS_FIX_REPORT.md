# V9.4.1 — Email settings and manual invitation fallback fix

## Changes

1. **Email settings API requests** now use same-origin credentials and include the server-issued CSRF token on PUT/POST requests. This makes the settings-save and test-email requests follow the same session-security flow as the standalone API client.
2. **Response handling** checks the response content type before parsing JSON. If a server, proxy, or older deployment returns an HTML page, the page now shows a useful HTTP-status/deployment diagnostic instead of the misleading `Unexpected token '<'` parser exception.
3. **Unknown API routes** now return JSON for GET, POST, PUT, PATCH, DELETE and OPTIONS rather than allowing Flask's default HTML 404/405 response to leak into API calls.
4. **Invitation/reset manual fallback** keeps the generated secure URL visible whenever the backend returns it, explains the link expiry (7 days for invitations; 1 hour for password reset), and supports copying through the Clipboard API with a legacy copy fallback. A success toast confirms copying; failure explains that the visible link can be selected and copied manually.

## Important behaviour

- Saving email-provider settings only stores the configuration; it does not itself send a message. Use the test-email action to verify delivery.
- A manual copy link is available for portal invitations and password-reset links when the backend has successfully generated and returned the secure link. A test email is not an invitation and has no activation link to copy.
- If the server still returns HTML, the improved message will identify the HTTP status and indicate that the deployed backend may not contain the matching API route. The frontend cannot safely invent invitation/reset tokens; those must be generated and stored by the server.
- Email delivery still depends on a valid provider configuration, sender verification, public application URL, and provider/network availability. This patch does not claim that an external provider has successfully delivered a message.

## Verification

- PASS: Python compilation of `app.py`, `database.py`, and the existing backend test modules.
- PASS: 16 existing database/storage tests.
- PASS: TypeScript JSX transpile/parser checks for `src/pages/AdminSettings.jsx` and `src/components/admin/PortalAccounts.jsx`.
- NOT RUN: Flask workflow tests because Flask is not installed in this execution environment.
- NOT RUN: full Vite production build/lint because project `node_modules` are not present.
- NOT RUN: live Render/Neon, browser, CSRF-session, or external email-provider test; no live credentials or deployed environment access was used.

## Deployment note

Deploy the backend and frontend from this same ZIP together. If only the frontend is updated while the server is still running an older backend, the diagnostic may continue to report an unavailable API route. Do not reset or replace the production database.

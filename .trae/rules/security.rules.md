# Security Rules

- No secrets committed to repo; use env or secret manager.
- Enforce `is_allowed` and role checks server-side for every request.
- Implement RLS/policies in the DB to restrict data by owner/admin.
- Rate limit sensitive endpoints; implement structured logging with redaction.
- Do not expose absolute host paths or internal topology to clients.

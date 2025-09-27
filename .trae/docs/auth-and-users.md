# Auth and Users

## Providers

- Supabase Auth with Google as the only enabled provider.
- No email/password or other providers are enabled.

## Access Gating

- All authenticated users must have `is_allowed = true` in the database to access the application features.
- New users authenticating for the first time default to `is_allowed = false` until approved by an admin.

## Admin Bootstrap

- System starts with one admin user.
- Do not hardcode credentials in code or config committed to the repository.
- Use environment variables or one-time setup scripts to seed the initial admin and immediately rotate any temporary credentials.

## Data Model (initial)

- users: id, email, created_at, is_allowed (bool), role (enum: admin|user), last_login_at
- audit_logs: id, actor_user_id, action, target_type, target_id, meta, created_at

## Policy & RLS Concepts

- Only admins can set `is_allowed` and change roles.
- All data access requires `is_allowed = true`.
- Audit every grant/revoke of `is_allowed` and role changes.

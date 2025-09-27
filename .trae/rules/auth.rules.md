# Auth Rules

- Only Google provider is enabled in Supabase; all others must be disabled.
- All authenticated users must have `is_allowed = true` to access any API endpoint.
- Default new users to `is_allowed = false`.
- Only admins can toggle `is_allowed` and user roles; audit these changes.
- Never hardcode credentials; seed admin via environment or one-time script, then rotate.

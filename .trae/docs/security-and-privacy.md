# Security and Privacy

## Secrets & Config

- Never commit secrets; load via environment or secret manager.
- Rotate bootstrap credentials immediately.

## Least Privilege

- API uses least Docker privileges required.
- Containers run as non-root where possible; drop capabilities; read-only root FS where compatible.

## Data Access Controls

- Enforce checks and roles on every API call.
- Database RLS to restrict rows to owners/admins.

## Filesystem Safety

- All file access is confined to per-server root; perform realpath normalization, deny symlinks, and block path traversal.

## Network Safety

- Restrict exposed ports; randomize RCON secrets; rate-limit sensitive endpoints.

## Logging & PII

- No sensitive data in logs; structured logging with redaction; audit all admin actions.

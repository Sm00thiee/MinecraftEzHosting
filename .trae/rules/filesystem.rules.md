# Filesystem Rules

- File and directory access must be strictly confined to the server's root directory.
- Normalize and validate paths; reject `..`, symlinks, and out-of-root resolutions.
- Read-only access for browsing and file reads; no writes outside controlled operations.
- Enforce size limits and pagination for file content reads.

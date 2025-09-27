# Docker Rules

- Use least-privilege Docker operations from the API.
- Run containers as non-root where possible; drop unneeded capabilities.
- Apply resource limits (CPU/memory) and consider read-only root FS.
- Label containers/volumes with serverId, type, version, owner.
- Implement retries and idempotency for lifecycle actions.

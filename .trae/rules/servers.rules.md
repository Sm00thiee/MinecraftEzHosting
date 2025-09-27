# Servers Rules

- Supported types: fabric, spigot, paper, bukkit.
- Version selection must be dynamic; do not hardcode version lists in code.
- Each server runs in its own container with dedicated volume at /data (mounted from servers/{serverId}).
- Enforce CPU/memory limits on containers.
- Unique, deterministic container names: mc-{serverId}.
- Ports must be validated, reserved on create, and released on delete; prevent collisions.
- Deleting a server must stop the container and optionally remove or retain its volume.

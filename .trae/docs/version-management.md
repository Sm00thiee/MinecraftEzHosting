# Version Management (No Hardcoding)

## Principle

All server versions and builds must be resolved dynamically from upstream sources at request time (or refreshed on a schedule). No hardcoded lists.

## Strategy by Type

- Paper: Resolve latest supported MC version and corresponding latest stable build.
- Spigot/Bukkit: Use build tooling or container-provided installers to assemble the correct server jar for the requested MC version, supporting a "latest" selection where available.
- Fabric: Resolve latest loader, installer, and compatible Minecraft version dynamically.
- Vanilla (if supported): Resolve via official manifest to fetch the latest release/snapshot as requested.

## Resolver Service

- Provide a unified interface: resolve(type, requestedVersion | "latest") -> { mcVersion, buildId, artifactUrl or installerParams }
- Cache results with short TTL; validate on use; handle upstream errors gracefully.
- Unit test against mocked upstream responses to ensure correctness.

# Minecraft Server Management - Vision & Goals

## Problem Statement

Operating multiple Minecraft servers reliably is complex: provisioning, keeping versions up-to-date, securing access, monitoring performance, and safely giving users visibility into logs and files all require careful coordination.

## Core Vision

Build a secure, performant, and user-friendly system that lets a user create, read, update, and delete Minecraft servers where each server runs inside an isolated Docker container.

## Must-Haves

- CRUD servers; each server is one container with isolated filesystem and resources.
- Single initial user at start (admin bootstrap), then managed via Supabase Auth (Google only) and an IsAllowed flag in DB to gate access.
- When a new user authenticates, they cannot access until IsAllowed is set to true by an administrator.
- Server type selection on create: fabric, spigot, paper, bukkit.
- Server version selection is dynamic and up-to-date at runtime (strictly no hardcoded version lists).
- Precise monitoring of both Docker container (CPU, memory, disk, restarts) and the Minecraft server (TPS, player count, tick timings, etc.).
- Introduce a safe and lightweight server mod/plugin for in-server monitoring (opt-in), with strong guardrails to avoid memory leaks and overhead.
- Server management includes read-only access to server logs and browsing the Minecraft server directory while strictly preventing access outside that directory.

## Non-Goals (Initial Phases)

- Public multi-tenant SaaS hardening beyond single-tenant assumptions.
- Complex billing and quota enforcement.
- Cross-host/cluster orchestration (initially target single Docker host; leave room to extend).

## Success Criteria

- Users can self-serve server lifecycle actions with minimal friction.
- Monitoring adds negligible overhead and does not degrade server performance.
- No path traversal or privilege escalation is possible via file/log access.
- Version resolution updates automatically as upstreams release updates.
- Clear operational playbooks and minimal manual maintenance.

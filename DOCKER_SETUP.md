# Docker Setup for MC Server Management

## Overview

This document describes the Docker configuration and setup for the Minecraft Server Management system.

## Problem Fixed

The original issue was that Docker couldn't access the `/opt/minecraft-servers/` path on macOS, causing server creation to fail with mount denial errors.

## Solution Implemented

### 1. Changed Data Path

- Updated `MC_DATA_PATH` from `/opt/minecraft-servers` to `./minecraft-servers` (relative to project root)
- This ensures Docker can access the directory on macOS systems

### 2. Custom Docker Image

- Created `Dockerfile.minecraft` based on `itzg/minecraft-server:java21-alpine`
- Added custom configurations and optimizations
- Pre-configured environment variables for better management

### 3. Docker Compose Configuration

- Added `docker-compose.yml` for easier container management
- Defined network and volume configurations
- Template service for reference

### 4. Build Automation

- Created `scripts/build-docker-image.sh` for easy image building
- Added automatic image building in DockerService when needed
- Image is built automatically if not found

## Files Created/Modified

### New Files:

- `Dockerfile.minecraft` - Custom Minecraft server Docker image
- `docker-compose.yml` - Docker Compose configuration
- `scripts/build-docker-image.sh` - Build script for Docker image
- `minecraft-servers/` - Directory for server data (Docker accessible)

### Modified Files:

- `api/services/docker.ts` - Updated paths and added custom image support

## Usage

### Building the Docker Image

```bash
# Using the build script
./scripts/build-docker-image.sh

# Or manually
docker build -f Dockerfile.minecraft -t mc-server-management:latest .
```

### Server Creation

1. The system now automatically:
   - Builds the custom Docker image if it doesn't exist
   - Creates server directories in `./minecraft-servers/`
   - Mounts directories that Docker can access
   - Uses proper port management and resource limits

2. All server operations (start, stop, restart, delete) now work correctly

## Directory Structure

```
mc-server-management/
├── minecraft-servers/          # Server data directory (Docker accessible)
│   └── [server-id]/           # Individual server directories
│       ├── world/             # Minecraft world data
│       ├── plugins/           # Server plugins
│       ├── logs/              # Server logs
│       └── backups/           # Server backups
├── Dockerfile.minecraft       # Custom Docker image
├── docker-compose.yml         # Docker Compose config
└── scripts/
    └── build-docker-image.sh  # Build script
```

## Environment Variables

The custom Docker image supports all standard Minecraft server environment variables:

- `EULA=TRUE` - Accept Minecraft EULA
- `TYPE` - Server type (PAPER, SPIGOT, FABRIC, etc.)
- `VERSION` - Minecraft version
- `MEMORY` - Server memory allocation
- `ENABLE_RCON` - Enable RCON for remote management
- `RCON_PASSWORD` - RCON password
- `ENABLE_QUERY` - Enable server query
- `ONLINE_MODE` - Online mode setting
- And many more...

## Troubleshooting

### If Docker image build fails:

1. Ensure Docker is running
2. Check internet connection (needs to pull base image)
3. Verify Dockerfile.minecraft exists

### If server creation still fails:

1. Check Docker daemon is running
2. Verify `minecraft-servers` directory exists and is writable
3. Check Docker logs: `docker logs mc-server-[server-id]`

### If containers can't start:

1. Check port conflicts
2. Verify resource limits are reasonable
3. Check Docker system resources

## Benefits of This Setup

1. **Cross-platform compatibility** - Works on macOS, Linux, and Windows
2. **Automatic image management** - Builds image when needed
3. **Better resource control** - Custom image with optimized settings
4. **Easier debugging** - Centralized logging and container management
5. **Scalable** - Easy to add more server types and configurations

## Next Steps

The Docker setup is now complete and functional. You can:

1. Create servers through the web interface
2. Start, stop, and restart servers
3. Monitor server status and logs
4. Delete servers (removes both container and data)

All operations now work correctly with proper Docker integration.

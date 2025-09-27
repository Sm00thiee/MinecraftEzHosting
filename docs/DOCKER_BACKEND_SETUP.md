# Backend Dockerization Plan

This document outlines the plan to containerize the backend application, allowing it to run within a Docker container while still managing Docker containers on the host machine.

## 1. Create a Dockerfile for the Backend

A new `Dockerfile` will be created in the `api` directory (`api/Dockerfile`). This file will define the environment for the backend service.

- **Base Image**: It will use an official Node.js image (e.g., `node:18-alpine`) to ensure a small and secure environment.
- **Dependencies**: It will copy `package.json` and `package-lock.json` to install dependencies using `npm install`. This leverages Docker's layer caching.
- **Source Code**: It will copy the backend source code from the `api` directory.
- **Build Step**: The TypeScript code will be compiled into JavaScript.
- **Exposed Port**: It will expose the port the backend server listens on (e.g., 3001).
- **Start Command**: It will define the command to start the backend server (e.g., `node dist/server.js`).

## 2. Update `docker-compose.yml`

The existing `docker-compose.yml` file will be updated to include the new backend service.

```yaml
version: '3.8'
services:
  # ... other services

  backend:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: mc-server-management-backend
    ports:
      - '3001:3001'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      # Add other necessary environment variables
    networks:
      - default
```

### Key `docker-compose.yml` changes:

- **`build`**: Specifies the build context and Dockerfile for the backend service.
- **`ports`**: Maps the host port to the container port.
- **`volumes`**: This is the crucial part. It mounts the host's Docker socket (`/var/run/docker.sock`) into the container at the same path. This allows the backend service to communicate with the host's Docker daemon. For Windows, the path will be `//var/run/docker.sock`.
- **`environment`**: Passes necessary environment variables from the `.env` file to the backend container.

## 3. Docker Socket and Host Communication

By mounting the Docker socket, the backend, running inside a container, can create, start, stop, and manage other Docker containers on the host machine. The Docker client library used in the backend (e.g., `dockerode`) will automatically use the socket at `/var/run/docker.sock` if available.

## 4. Code Changes in `api/services/docker.ts`

The `docker.ts` service, which is responsible for interacting with Docker, might need to be reviewed.

Currently, it might be configured to connect to the Docker daemon on `localhost`. When running inside a container, it should connect to the Docker daemon via the mounted socket. Most Docker client libraries for Node.js (like `dockerode`) will automatically use the Unix socket if the `DOCKER_HOST` environment variable is not set. We need to ensure no hardcoded connection details are present that would override this default behavior.

Specifically, the instantiation of the Docker client should be checked. For `dockerode`, it should be as simple as:

```typescript
import Docker from 'dockerode';

const docker = new Docker(); // This will use the socket by default
```

If it's currently using TCP connection options, those will need to be removed or made conditional.

## 5. Environment Variable Management

All configuration for the backend should be managed through environment variables, as is standard for containerized applications. This includes:

- Database connection strings
- Supabase credentials
- API keys
- Port numbers

These will be passed into the container via the `environment` section in `docker-compose.yml`.

## 6. Next Steps (Implementation)

1.  Create `api/Dockerfile`.
2.  Modify `docker-compose.yml` to add the `backend` service.
3.  Review and potentially modify `api/services/docker.ts` to ensure it connects to Docker via the socket.
4.  Update the `.env` file with any new or changed variables.
5.  Build and run the new setup using `docker-compose up --build`.

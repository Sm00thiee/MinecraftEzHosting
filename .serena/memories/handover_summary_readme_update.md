Task: Create a precise and comprehensive README for the mc-server-management project.

Context gathered:

- Existing README.md was Vite template and not representative of the project.
- Project is a full-stack app: React + Vite frontend, Express + TypeScript backend (api/), Supabase for auth/DB, Docker for Minecraft servers, Prometheus-based monitoring.
- Key docs are in .trae/docs/ (architecture.md, api-and-data-model.md, etc.).
- Environment variables listed in .env.example; includes Supabase keys, JWT secret, ports, admin bootstrap, MC server paths/ports.
- Docker Compose files present for dev/prod; backend uses dockerode and named pipe on Windows for Docker Desktop.
- Playwright tests present with html reporter; report stored in playwright-report/.
- npm scripts exist for dev, build, docker, security, lint/format.

Plan executed:

- Replace README.md with a comprehensive Markdown including: Overview, Features, Architecture summary (with links to internal docs), Project Structure, Prerequisites, Setup, Running locally, Production via Docker Compose, Environment variables, Testing (Playwright), Security/Secrets, Lint/Format, Useful npm scripts, and Troubleshooting.

Next steps for future contributors:

- Validate any environment-specific notes (e.g., DOCKER_HOST for Windows local dev) and adjust based on actual developer experience.
- Keep README in sync with .trae/docs as features evolve.
- Consider adding CI badges and a license section if applicable.

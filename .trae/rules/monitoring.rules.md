# Monitoring Rules

- Container metrics collection must be lightweight and bounded in memory.
- Plugin/mod must be optional, avoid heavy allocations, and provide safe shutdown.
- Apply sampling intervals, rate limiting, and backpressure to all metric/log streams.
- Redact secrets from logs and metrics.
- Timeouts on all external calls (Docker, RCON, plugin endpoints).

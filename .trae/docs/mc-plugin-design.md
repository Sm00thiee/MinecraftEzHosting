# Minecraft Monitoring Plugin/Mod Design

## Goals

- Provide precise in-game metrics with negligible runtime overhead and zero memory leaks.
- Work across common server platforms: Paper/Spigot/Bukkit plugin and Fabric mod.
- Support secure, push-based telemetry to the management API with bounded buffers and backpressure.
- Be optional: servers function without it; system falls back to Query/RCON when absent.

## Non-Goals

- No admin commands or gameplay features.
- No direct file writes outside the plugin/mod data directory.
- No long-lived blocking I/O on the main server thread.

## Metrics Scope

- Server tick performance: TPS (1m/5m/15m approximations), mean/max tick time, tick overrun count.
- Players: online count, per-world counts, join/quit rate.
- Worlds: loaded chunks, entities (total/by type), tile entities (block entities).
- JVM: heap used/committed/max, GC collections/time (where available via MXBeans).
- Uptime since start, plugin version.
- Optional: per-dimension metrics, command queue length, network ping distribution (coarse).

## Platform Support

1. Paper/Spigot/Bukkit (Java plugin)

- Use server-provided TPS when available (Paper exposes server TPS); otherwise compute via scheduled per-tick task.
- Register listeners: PlayerJoinEvent, PlayerQuitEvent.
- Access per-world stats via Bukkit API: world.getLoadedChunks(), world.getEntities().
- Schedule one repeating task:
  - main-thread sampler at fixed tick cadence (e.g., every 20 ticks) to collect snapshot metrics.
  - off-thread sender to serialize & POST to API.

2. Fabric (Java mod)

- Use Fabric API hooks: TickEvents.END_SERVER_TICK.
- Use ServerPlayerEvents for join/quit tracking.
- Collect world/entity/chunk stats from MinecraftServer and ServerWorld instances.
- Same division of labor: main-thread sampling, async sending.

## Scheduling & Concurrency

- Main-thread job: Read-only sampling using platform-safe APIs.
- Async job: JSON serialization and HTTP/WebSocket send with timeouts and retries.
- Bounded queue between sampler and sender:
  - capacity: default 100 frames (configurable).
  - policy: drop-oldest when full.
- Backoff with jitter on send failures (e.g., 1s -> 2s -> 4s up to max 30s).
- Hard deadline per send (e.g., 1.5s).

## Configuration

- File: plugins/mc-agent/config.yml (Bukkit) or config/mc-agent.toml (Fabric).
- Fields:
  - serverId: string (required)
  - apiUrl: string (required, https URL)
  - token: string (required, bearer token)
  - intervalMs: integer (default 3000, min 1000)
  - maxQueue: integer (default 100, min 10, max 1000)
  - metrics:
    - tps: true
    - players: true
    - entities: true
    - chunks: true
    - jvm: true
  - timeoutsMs: { connect: 1000, read: 1000 }
  - disableOnError: false (if true, auto-disables after sustained failures)

## Data Model (JSON payload)

- endpoint: POST {apiUrl}/v1/servers/{serverId}/metrics
- headers: Authorization: Bearer <token>, Content-Type: application/json
- body:

```
{
  "ts": 1710000000000,
  "agent": { "name": "mc-agent", "version": "1.0.0", "platform": "paper|spigot|bukkit|fabric" },
  "server": { "tps": {"now": 19.8, "m1": 19.9, "m5": 19.95, "m15": 20.0},
               "tickTimeMs": {"avg": 44.0, "p95": 55.0, "max": 80.0},
               "uptimeSec": 3600 },
  "players": { "online": 7, "max": 20 },
  "worlds": [ { "name": "world", "chunks": 230, "entities": 540, "blockEntities": 120 },
               { "name": "world_nether", "chunks": 40, "entities": 60, "blockEntities": 10 } ],
  "jvm": { "heapUsedMb": 1024, "heapCommittedMb": 2048, "heapMaxMb": 4096,
            "gc": [{"name": "G1 Young Generation", "count": 134, "timeMs": 920}]
  }
}
```

- server decides which fields are persisted/aggregated.

## TPS & Tick Time Calculation

- Paper: use available APIs for TPS arrays if present.
- Otherwise: maintain a ring buffer of tick durations by scheduling a 1-tick repeating task capturing System.nanoTime() and computing delta; derive moving averages.
- Ensure minimal allocations: reuse buffers and avoid boxing in tight loops.

## Safety & Performance

- Never perform network I/O on the main thread.
- Cap total sampling + enqueue time to < 2ms on the main thread.
- Use a single scheduled sampler per instance; avoid multiple repeating tasks.
- Avoid reflection and unsafe casts; rely on stable APIs.
- Ensure clean shutdown: cancel tasks, flush bounded queue with a deadline, then stop.

## Security

- HTTPS only, validate apiUrl scheme.
- Token stored in config file; do not log it. Redact secrets in all logs.
- Clock skew tolerant (use server time if API returns a sync hint; otherwise include client ts).
- Do not accept inbound connections; outbound only.

## Failure Modes

- If API unreachable: queue frames up to maxQueue, then drop-oldest; log rate-limited warnings.
- If serialization fails: drop frame and log once per N minutes.
- If sustained failures and disableOnError=true: auto-disable and notify via server log once.

## Packaging & Distribution

- Bukkit/Paper/Spigot: package jar with plugin.yml, target Java 17+ (depending on server baseline).
- Fabric: package mod jar with fabric.mod.json; depend on Fabric API.
- CI builds both artifacts; publish to artifact store. Management system mounts or copies the plugin/mod into the server container automatically if enabled for that server.

## Observability of the Agent

- Agent internal counters: framesSent, framesDropped, lastErrorTs, queueSize.
- Expose lightweight /status log line (not an HTTP port) on startup and every N minutes.

## Pseudocode (Bukkit/Paper)

```
class AgentPlugin extends JavaPlugin {
  BoundedQueue<MetricsFrame> q;
  Sampler sampler; Sender sender;
  @Override public void onEnable() {
    Config cfg = loadConfig();
    q = new BoundedQueue<>(cfg.maxQueue, DropOldest);
    sampler = new Sampler(cfg, q, getServer());
    sender = new Sender(cfg, q);
    runTaskTimer(this, sampler::sample, 0L, ticks(cfg.intervalMs)); // main-thread
    runTaskTimerAsynchronously(this, sender::drainAndSend, 0L, ticks(cfg.intervalMs));
  }
  @Override public void onDisable() {
    sampler.stop(); sender.flushWithDeadline(1000);
  }
}
```

## Pseudocode (Fabric)

```
public class AgentMod implements ModInitializer {
  BoundedQueue<MetricsFrame> q; Sampler s; Sender snd;
  @Override public void onInitialize() {
    Config cfg = loadConfig();
    q = new BoundedQueue<>(cfg.maxQueue, DropOldest);
    s = new Sampler(cfg, q);
    snd = new Sender(cfg, q);
    TickEvents.END_SERVER_TICK.register(server -> s.sample(server));
    startAsync(() -> periodically(snd::drainAndSend, cfg.intervalMs));
  }
}
```

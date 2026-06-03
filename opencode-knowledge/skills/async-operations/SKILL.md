---
name: async-operations
description: Load and save data asynchronously with sync callbacks for thread-safe Bukkit API access
license: MIT
compatibility: opencode
metadata:
  category: database
  difficulty: intermediate
---

# Async Operations Skill

## What I Do

Implement the async-sync bridge pattern: database/network operations run async, Bukkit API callbacks run on the main thread.

## Implementation Pattern

### 1. CompletableFuture Async-Sync Bridge

```java
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AsyncDataService {

    private final MyPlugin plugin;
    private final HikariDataSource dataSource;
    private final ExecutorService dbExecutor;

    public AsyncDataService(MyPlugin plugin) {
        this.plugin = plugin;
        this.dataSource = plugin.getDatabaseManager().getDataSource();
        this.dbExecutor = Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "MyPlugin-DB");
            t.setDaemon(true);
            return t;
        });
    }

    // Load from DB async, apply sync
    public void loadAndApply(Player player) {
        UUID uuid = player.getUniqueId();
        long start = System.currentTimeMillis();

        CompletableFuture.supplyAsync(() -> {
            // ASYNC: Database I/O
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement stmt = conn.prepareStatement(
                     "SELECT * FROM players WHERE uuid = ?")) {
                stmt.setString(1, uuid.toString());
                ResultSet rs = stmt.executeQuery();
                if (rs.next()) {
                    return mapPlayerData(rs);
                }
                return createDefault(uuid);
            } catch (SQLException e) {
                plugin.getLogger().severe("DB load failed for " + uuid + ": " + e.getMessage());
                return createDefault(uuid);
            }
        }, dbExecutor).thenAcceptAsync(data -> {
            // ASYNC: Processed in the worker pool (still async)
            data.computeDerivedValues();
            return data;
        }, dbExecutor).thenAccept(data -> {
            // SYNC: Switch to main thread for Bukkit API
            Bukkit.getScheduler().runTask(plugin, () -> {
                // MAIN THREAD: Safe to use Bukkit API
                if (!player.isOnline()) return;
                cache.put(uuid, data);
                player.sendMessage(Component.text("Your balance: " + data.getBalance())
                    .color(NamedTextColor.GREEN));
                long elapsed = System.currentTimeMillis() - start;
                if (elapsed > 50) {
                    plugin.getLogger().warning("Slow load for " + player.getName() + ": " + elapsed + "ms");
                }
            });
        });
    }
}
```

### 2. Standard Bukkit Scheduler Pattern

```java
// Event handler — fires on main thread
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();

    // STEP 1: Launch async work
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        // THIS RUNS ON A WORKER THREAD
        // Safe: database queries, HTTP calls, file I/O, computations
        try (Connection conn = dataSource.getConnection()) {
            PlayerData data = loadFromDatabase(conn, uuid);
            long balance = data.getBalance();

            // STEP 2: Switch back to main thread for Bukkit API
            Bukkit.getScheduler().runTask(plugin, () -> {
                // THIS RUNS ON MAIN THREAD
                // Safe: player interactions, world changes, inventory
                if (!player.isOnline()) return;
                player.sendMessage("Your balance: " + balance);
                cache.put(uuid, data);
            });
        } catch (SQLException e) {
            plugin.getLogger().severe("Failed to load " + uuid + ": " + e.getMessage());
        }
    });
}
```

### 3. Fire-and-Forget Async Save

```java
public void saveAndForget(UUID uuid, PlayerData data) {
    // No return value needed — just write to DB
    CompletableFuture.runAsync(() -> {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "INSERT INTO players (uuid, name, tokens) VALUES (?, ?, ?) " +
                 "ON DUPLICATE KEY UPDATE name=VALUES(name), tokens=VALUES(tokens)")) {
            stmt.setString(1, uuid.toString());
            stmt.setString(2, data.getName());
            stmt.setInt(3, data.getTokens());
            stmt.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Failed to save " + uuid + ": " + e.getMessage());
        }
    }, dbExecutor);
}
```

### 4. Batch Async Operations

```java
public CompletableFuture<Map<UUID, PlayerData>> loadAllOnline() {
    List<UUID> onlineUUIDs = Bukkit.getOnlinePlayers().stream()
        .map(Player::getUniqueId)
        .collect(Collectors.toList());

    if (onlineUUIDs.isEmpty()) {
        return CompletableFuture.completedFuture(Map.of());
    }

    return CompletableFuture.supplyAsync(() -> {
        Map<UUID, PlayerData> results = new HashMap<>();
        try (Connection conn = dataSource.getConnection()) {
            // Build dynamic IN clause
            String placeholders = onlineUUIDs.stream()
                .map(u -> "?")
                .collect(Collectors.joining(","));
            String sql = "SELECT * FROM players WHERE uuid IN (" + placeholders + ")";

            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                for (int i = 0; i < onlineUUIDs.size(); i++) {
                    stmt.setString(i + 1, onlineUUIDs.get(i).toString());
                }
                ResultSet rs = stmt.executeQuery();
                while (rs.next()) {
                    PlayerData data = mapPlayerData(rs);
                    results.put(data.getUuid(), data);
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Batch load failed: " + e.getMessage());
        }
        return results;
    }, dbExecutor);
}
```

### 5. Error Handling in Async Chains

```java
CompletableFuture.supplyAsync(() -> database.load(uuid), dbExecutor)
    .exceptionally(throwable -> {
        // Handle failure — return fallback
        plugin.getLogger().log(Level.SEVERE, "Load failed for " + uuid, throwable);
        return PlayerData.createDefault(uuid);
    })
    .thenAccept(data -> {
        // This runs whether load succeeded or failed (exceptionally handled it)
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) {
                cache.put(uuid, data);
            }
        });
    });
```

### 6. Dedicated Thread Pool (NOT ForkJoinPool)

```java
// CORRECT: Dedicated pool for DB operations
private final ExecutorService dbExecutor = Executors.newFixedThreadPool(4, r -> {
    Thread t = new Thread(r, "MyPlugin-DB-Worker");
    t.setDaemon(true);
    return t;
});

// WRONG: Using ForkJoinPool.commonPool() — shared with JVM internals
// CompletableFuture.supplyAsync(() -> ...) // Uses ForkJoinPool.commonPool()

// Shutdown in onDisable()
@Override
public void onDisable() {
    dbExecutor.shutdown();
    try {
        if (!dbExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
            dbExecutor.shutdownNow();
        }
    } catch (InterruptedException e) {
        dbExecutor.shutdownNow();
    }
}
```

### 7. Circuit Breaker for External Services

```java
/**
 * Prevents cascading failure when external services (HTTP APIs, remote databases)
 * become slow or unavailable. A single slow service can exhaust your thread pool
 * and cascade into a full plugin outage. The circuit breaker fast-fails after
 * N consecutive failures, giving the service time to recover.
 */
public class CircuitBreaker {
    private enum State { CLOSED, OPEN, HALF_OPEN }
    private State state = State.CLOSED;
    private int failureCount = 0;
    private long lastFailureTime = 0;
    private final int failureThreshold;
    private final long resetTimeoutMs;
    private final JavaPlugin plugin;

    public CircuitBreaker(JavaPlugin plugin, int failureThreshold, long resetTimeoutMs) {
        this.plugin = plugin;
        this.failureThreshold = failureThreshold;
        this.resetTimeoutMs = resetTimeoutMs;
    }

    public synchronized boolean allowRequest() {
        long now = System.currentTimeMillis();
        switch (state) {
            case CLOSED -> { return true; }
            case OPEN -> {
                if (now - lastFailureTime > resetTimeoutMs) {
                    state = State.HALF_OPEN;
                    failureCount = 0;
                    plugin.getLogger().info("Circuit breaker HALF_OPEN — testing external service...");
                    return true;
                }
                return false; // Fast-fail — circuit is open
            }
            case HALF_OPEN -> { return failureCount < 3; }
        }
        return false;
    }

    public synchronized void recordSuccess() {
        if (state == State.HALF_OPEN) {
            state = State.CLOSED;
            failureCount = 0;
            plugin.getLogger().info("Circuit breaker CLOSED — external service recovered.");
        }
    }

    public synchronized void recordFailure() {
        failureCount++;
        lastFailureTime = System.currentTimeMillis();
        if (state == State.CLOSED && failureCount >= failureThreshold) {
            state = State.OPEN;
            plugin.getLogger().warning("Circuit breaker OPEN — external service unavailable. Fast-failing for "
                + resetTimeoutMs + "ms.");
        }
    }
}

// Usage:
private final CircuitBreaker apiBreaker = new CircuitBreaker(plugin, 5, 30_000);

public void fetchRemoteData(Runnable onSuccess) {
    if (!apiBreaker.allowRequest()) {
        plugin.getLogger().warning("Circuit open — using cached data instead.");
        return; // Use stale cache or fallback
    }
    CompletableFuture.supplyAsync(() -> {
        return httpClient.get("https://api.example.com/data"); // May throw
    }, ioExecutor).thenAccept(data -> {
        apiBreaker.recordSuccess();
        Bukkit.getScheduler().runTask(plugin, () -> onSuccess.run());
    }).exceptionally(ex -> {
        apiBreaker.recordFailure();
        plugin.getLogger().severe("API call failed: " + ex.getMessage());
        return null;
    });
}
```

### 8. Timeout Handling for Async Operations

```java
/**
 * Wraps a CompletableFuture with a timeout. If the operation doesn't complete
 * within the timeout, the future is cancelled and a fallback is returned.
 */
public <T> CompletableFuture<T> withTimeout(CompletableFuture<T> future, long timeout, TimeUnit unit, T fallback) {
    return future
        .orTimeout(timeout, unit)
        .exceptionally(ex -> {
            if (ex instanceof TimeoutException) {
                plugin.getLogger().warning("Async operation timed out after " + timeout + " " + unit);
            } else {
                plugin.getLogger().severe("Async operation failed: " + ex.getMessage());
            }
            return fallback;
        });
}

// Usage:
CompletableFuture<PlayerData> loadFuture = db.queryAsync(conn -> loadPlayer(conn, uuid));
loadFuture = withTimeout(loadFuture, 5, TimeUnit.SECONDS, PlayerData.createDefault(uuid));
loadFuture.thenAccept(data -> {
    Bukkit.getScheduler().runTask(plugin, () -> applyToPlayer(player, data));
});
```

## Critical Rules

1. **NEVER call Bukkit API from async thread** — IllegalStateException or silent corruption
2. **ALWAYS use a sync callback** (`runTask` inside async completion) for Bukkit API
3. **Always check `player.isOnline()`** in the sync callback — player may have disconnected
4. **Use a dedicated ExecutorService** — NEVER use ForkJoinPool.commonPool() for I/O operations
5. **Handle exceptions in EVERY async chain** — unhandled exceptions silently kill the task
6. **Shutdown executors gracefully in `onDisable()`** — await termination, then force shutdown
7. **Never load all database rows at once** — load on demand, unload on quit
8. **Use circuit breakers for external HTTP API calls** — prevent cascading failure
9. **Always set timeouts on async operations** — hung operations leak threads
10. **Use `ConcurrentHashMap` for any cache accessed from async threads**

## Thread Safety Summary

```
MAIN THREAD (Safe):
  Bukkit API, Player state, World changes, Inventory, Teleport, Scoreboard, Event firing

ASYNC THREAD (Safe):
  Database queries, HTTP calls, File I/O, Computations, Redis, Serialization

BRIDGE PATTERN:
  1. Event fires (main thread) → 2. CompletableFuture.supplyAsync (worker thread)
  → 3. .thenAccept (still worker) → 4. Bukkit.getScheduler().runTask (back to main)
  → 5. Apply to Bukkit API (main thread)
```

## Thread Pool Sizing Guide

| Plugin Type | DB Threads | I/O Threads | Rationale |
|------------|-----------|-------------|-----------|
| Small (<5 online) | 2 | 2 | Minimal concurrent operations |
| Medium (20-50 online) | 4 | 2 | Multiple concurrent joins/quits |
| Large (100+ online) | 6 | 4 | High join/quit churn, batch saves |
| Network (cross-server) | 8 | 4 | Shared database across servers |

**Formula:** `dbThreads = ceil(activeConnections / 2)`. If your connection pool has 5 connections, a thread pool of 3 is sufficient — more threads than connections just queue waiting for connections.

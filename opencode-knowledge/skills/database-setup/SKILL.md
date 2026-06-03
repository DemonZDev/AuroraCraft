---
name: database-setup
description: Set up HikariCP database connection with async queries, connection monitoring, and production safety patterns
license: MIT
compatibility: opencode
metadata:
  category: database
  difficulty: intermediate
---

# Database Setup Skill

## What I Do

I help you set up a production-ready database connection for Minecraft plugins using HikariCP connection pooling with proper async query patterns, connection monitoring, deadlock prevention, and crash-safe write-ahead patterns.

## When to Use Me

- Setting up MySQL/MariaDB/PostgreSQL/SQLite connection
- Implementing player data persistence
- Creating economy systems with ACID guarantees
- Building cross-server data sync (BungeeCord/Velocity networks)
- Any plugin that needs database storage

## What I Generate

1. **DatabaseManager** with production HikariCP configuration
2. **PoolMonitor** for connection leak detection and health checks
3. **Async query methods** (SELECT, INSERT, batch, upsert)
4. **Repository class** with proper async/sync bridging
5. **Schema versioning** from day one
6. **Deadlock-safe transaction** patterns

## Implementation Pattern

### 1. DatabaseManager with Production HikariCP

```java
package {package}.managers;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import org.bukkit.plugin.java.JavaPlugin;

import java.sql.*;
import java.util.concurrent.*;

public class DatabaseManager {
    private final JavaPlugin plugin;
    private HikariDataSource dataSource;

    public DatabaseManager(JavaPlugin plugin, DatabaseType type) {
        this.plugin = plugin;
        if (type == DatabaseType.SQLITE) {
            connectSQLite();
        } else {
            connectMySQL();
        }
        initializeSchema();
    }

    private void connectMySQL() {
        HikariConfig config = new HikariConfig();

        String host = plugin.getConfig().getString("database.host", "localhost");
        int port = plugin.getConfig().getInt("database.port", 3306);
        String database = plugin.getConfig().getString("database.name", "minecraft");
        String user = plugin.getConfig().getString("database.user", "root");
        String password = plugin.getConfig().getString("database.password", "");

        config.setJdbcUrl("jdbc:mysql://" + host + ":" + port + "/" + database
            + "?useSSL=false&characterEncoding=utf8mb4");
        config.setUsername(user);
        config.setPassword(password);

        // Pool sizing — 2-5 connections for typical plugins
        config.setMaximumPoolSize(5);
        config.setMinimumIdle(2);
        config.setConnectionTimeout(30_000);       // 30s — fail fast
        config.setIdleTimeout(600_000);             // 10min idle lifetime
        config.setMaxLifetime(1_800_000);           // 30min max age (< MySQL wait_timeout)
        config.setLeakDetectionThreshold(60_000);   // 60s — log stack trace if connection held >60s

        // Performance properties — every one matters
        config.addDataSourceProperty("cachePrepStmts", "true");
        config.addDataSourceProperty("prepStmtCacheSize", "250");
        config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
        config.addDataSourceProperty("useServerPrepStmts", "true");
        config.addDataSourceProperty("useLocalSessionState", "true");
        config.addDataSourceProperty("rewriteBatchedStatements", "true");
        config.addDataSourceProperty("cacheResultSetMetadata", "true");
        config.addDataSourceProperty("elideSetAutoCommits", "true");
        config.addDataSourceProperty("maintainTimeStats", "false");

        config.setPoolName(plugin.getName() + "-Pool");
        this.dataSource = new HikariDataSource(config);
    }

    private void connectSQLite() {
        String path = plugin.getDataFolder().getAbsolutePath() + "/data.db";
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:sqlite:" + path);
        config.setMaximumPoolSize(1);  // SQLite: 1 writer
        config.setMinimumIdle(1);
        config.addDataSourceProperty("busy_timeout", "5000");
        config.setConnectionInitSql(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;"
        );
        this.dataSource = new HikariDataSource(config);
    }

    public Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }

    // Pool health monitoring — schedule every 60s
    public void logPoolStats() {
        HikariPoolMXBean pool = dataSource.getHikariPoolMXBean();
        if (pool == null) return;
        int active = pool.getActiveConnections();
        int idle = pool.getIdleConnections();
        int waiting = pool.getThreadsAwaitingConnection();
        plugin.getLogger().info(String.format(
            "[Pool] Active=%d Idle=%d Waiting=%d Max=%d",
            active, idle, waiting, dataSource.getMaximumPoolSize()
        ));
        if (waiting > 0) {
            plugin.getLogger().warning("Threads waiting for connections — increase pool size or check for slow queries!");
        }
    }

    public void shutdown() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
        }
    }

    public HikariDataSource getDataSource() { return dataSource; }

    public enum DatabaseType { MYSQL, SQLITE }
}
```

### 2. Async Query Methods with Proper Error Handling

```java
private final ExecutorService dbExecutor = Executors.newFixedThreadPool(4, r -> {
    Thread t = new Thread(r, plugin.getName() + "-DB");
    t.setDaemon(true);
    return t;
});

/** Execute a write with no return value */
public CompletableFuture<Void> executeAsync(SqlConsumer action) {
    return CompletableFuture.runAsync(() -> {
        try (Connection conn = dataSource.getConnection()) {
            action.accept(conn);
        } catch (SQLException e) {
            throw new RuntimeException("Database error", e);
        }
    }, dbExecutor);
}

/** Execute a query with a return value */
public <T> CompletableFuture<T> queryAsync(SqlFunction<T> query) {
    return CompletableFuture.supplyAsync(() -> {
        try (Connection conn = dataSource.getConnection()) {
            return query.apply(conn);
        } catch (SQLException e) {
            throw new RuntimeException("Database error", e);
        }
    }, dbExecutor);
}

/** Query async, apply result on main thread */
public <T> void queryThenSync(SqlFunction<T> query, java.util.function.Consumer<T> callback) {
    queryAsync(query).thenAccept(result -> {
        org.bukkit.Bukkit.getScheduler().runTask(plugin, () -> callback.accept(result));
    }).exceptionally(ex -> {
        plugin.getLogger().severe("Query failed: " + ex.getMessage());
        return null;
    });
}

@FunctionalInterface public interface SqlConsumer { void accept(Connection conn) throws SQLException; }
@FunctionalInterface public interface SqlFunction<T> { T apply(Connection conn) throws SQLException; }
```

### 3. Schema Versioning (Start Day One)

```java
private static final int CURRENT_SCHEMA = 1;

private void initializeSchema() {
    executeAsync(conn -> {
        try (Statement stmt = conn.createStatement()) {
            stmt.execute("CREATE TABLE IF NOT EXISTS schema_version (version INT NOT NULL)");
            ResultSet rs = stmt.executeQuery("SELECT version FROM schema_version LIMIT 1");
            int v = rs.next() ? rs.getInt("version") : 0;
            applyMigrations(conn, v);
        }
    });
}

private void applyMigrations(Connection conn, int from) throws SQLException {
    if (from < 1) {
        try (Statement stmt = conn.createStatement()) {
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS player_data (
                    uuid CHAR(36) PRIMARY KEY,
                    name VARCHAR(16) NOT NULL,
                    balance DECIMAL(20,2) DEFAULT 0.00,
                    last_seen BIGINT NOT NULL,
                    created_at BIGINT NOT NULL,
                    INDEX idx_last_seen (last_seen)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """);
            stmt.execute("INSERT INTO schema_version VALUES (1) ON DUPLICATE KEY UPDATE version=1");
            plugin.getLogger().info("Applied migration v1.");
        }
    }
    // Add future migrations here — NEVER modify existing ones
}
```

### 4. Deadlock-Safe Atomic Operations

```java
/**
 * Atomic balance transfer with deadlock prevention.
 * ALWAYS locks in UUID order to prevent circular wait deadlocks.
 */
public boolean transferBalance(UUID from, UUID to, double amount) {
    // Sort UUIDs — ALWAYS lock lower UUID first
    UUID first = from.compareTo(to) < 0 ? from : to;
    UUID second = from.compareTo(to) < 0 ? to : from;

    Connection conn = null;
    try {
        conn = dataSource.getConnection();
        conn.setAutoCommit(false);

        // Lock in sorted order
        lockRow(conn, first);
        if (!first.equals(second)) lockRow(conn, second);

        // Deduct (atomic check-and-deduct)
        try (PreparedStatement stmt = conn.prepareStatement(
                "UPDATE player_data SET balance = balance - ? WHERE uuid = ? AND balance >= ?")) {
            stmt.setDouble(1, amount);
            stmt.setString(2, from.toString());
            stmt.setDouble(3, amount);
            if (stmt.executeUpdate() == 0) {
                conn.rollback();
                return false; // Insufficient balance
            }
        }

        // Credit
        try (PreparedStatement stmt = conn.prepareStatement(
                "UPDATE player_data SET balance = balance + ? WHERE uuid = ?")) {
            stmt.setDouble(1, amount);
            stmt.setString(2, to.toString());
            stmt.executeUpdate();
        }

        conn.commit();
        return true;
    } catch (SQLException e) {
        if (conn != null) { try { conn.rollback(); } catch (SQLException ex) {} }
        plugin.getLogger().severe("Transfer failed: " + e.getMessage());
        return false;
    } finally {
        if (conn != null) {
            try { conn.setAutoCommit(true); conn.close(); } catch (SQLException e) {}
        }
    }
}

private void lockRow(Connection conn, UUID uuid) throws SQLException {
    try (PreparedStatement stmt = conn.prepareStatement(
            "SELECT uuid FROM player_data WHERE uuid = ? FOR UPDATE")) {
        stmt.setString(1, uuid.toString());
        stmt.executeQuery();
    }
}
```

### 5. Batch Operations (1 Round-Trip, Not N)

```java
public CompletableFuture<Void> saveAll(Collection<PlayerData> players) {
    return CompletableFuture.runAsync(() -> {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "INSERT INTO player_data (uuid, name, balance, last_seen, created_at) " +
                 "VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE " +
                 "name=VALUES(name), balance=VALUES(balance), last_seen=VALUES(last_seen)")) {

            for (PlayerData data : players) {
                stmt.setString(1, data.getUuid().toString());
                stmt.setString(2, data.getName());
                stmt.setDouble(3, data.getBalance());
                stmt.setLong(4, data.getLastSeen());
                stmt.setLong(5, data.getCreatedAt());
                stmt.addBatch();
            }
            stmt.executeBatch(); // Single round-trip for ALL rows
        } catch (SQLException e) {
            plugin.getLogger().severe("Batch save failed: " + e.getMessage());
        }
    }, dbExecutor);
}
```

### 6. Example Repository with Async/Sync Bridge

```java
public class PlayerRepository {
    private final DatabaseManager db;
    private final JavaPlugin plugin;
    private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();

    public PlayerRepository(JavaPlugin plugin, DatabaseManager db) {
        this.plugin = plugin;
        this.db = db;
    }

    /** Load from DB async, cache and notify on main thread */
    public void loadAndApply(org.bukkit.entity.Player player) {
        UUID uuid = player.getUniqueId();

        // Cache hit — no I/O needed
        PlayerData cached = cache.get(uuid);
        if (cached != null) {
            player.sendMessage(net.kyori.adventure.text.Component.text(
                "Welcome back! Balance: " + cached.getBalance(),
                net.kyori.adventure.text.format.NamedTextColor.GREEN));
            return;
        }

        // Cache miss — load from DB
        db.<PlayerData>queryAsync(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT * FROM player_data WHERE uuid = ?")) {
                stmt.setString(1, uuid.toString());
                ResultSet rs = stmt.executeQuery();
                return rs.next() ? mapRow(rs) : createDefault(uuid);
            }
        }).thenAccept(data -> {
            cache.put(uuid, data);
            org.bukkit.Bukkit.getScheduler().runTask(plugin, () -> {
                if (player.isOnline()) {
                    player.sendMessage(net.kyori.adventure.text.Component.text(
                        "Welcome! Balance: " + data.getBalance(),
                        net.kyori.adventure.text.format.NamedTextColor.GREEN));
                }
            });
        }).exceptionally(ex -> {
            plugin.getLogger().severe("Failed to load " + uuid + ": " + ex.getMessage());
            return null;
        });
    }

    /** Fire-and-forget async save on player quit */
    public void saveAndUnload(UUID uuid) {
        PlayerData data = cache.remove(uuid);
        if (data == null) return;
        db.executeAsync(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "INSERT INTO player_data (uuid, name, balance, last_seen) " +
                    "VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE " +
                    "name=?, balance=?, last_seen=?")) {
                stmt.setString(1, data.getUuid().toString());
                stmt.setString(2, data.getName());
                stmt.setDouble(3, data.getBalance());
                stmt.setLong(4, data.getLastSeen());
                stmt.setString(5, data.getName());
                stmt.setDouble(6, data.getBalance());
                stmt.setLong(7, data.getLastSeen());
                stmt.executeUpdate();
            }
        });
    }

    /** Synchronous save for onDisable() — server is shutting down */
    public void saveAllSync() {
        for (PlayerData data : cache.values()) {
            try (Connection conn = db.getConnection();
                 PreparedStatement stmt = conn.prepareStatement(
                     "INSERT INTO player_data (uuid, name, balance, last_seen) " +
                     "VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=?, balance=?, last_seen=?")) {
                stmt.setString(1, data.getUuid().toString());
                stmt.setString(2, data.getName());
                stmt.setDouble(3, data.getBalance());
                stmt.setLong(4, data.getLastSeen());
                stmt.setString(5, data.getName());
                stmt.setDouble(6, data.getBalance());
                stmt.setLong(7, data.getLastSeen());
                stmt.executeUpdate();
            } catch (SQLException e) {
                plugin.getLogger().severe("Failed to save " + data.getUuid() + ": " + e.getMessage());
            }
        }
        cache.clear();
    }
}
```

### 7. config.yml Database Section

```yaml
database:
  type: mysql  # mysql or sqlite
  host: localhost
  port: 3306
  name: minecraft
  user: root
  password: changeme
```

## Critical Rules

1. **NEVER** query database on main thread — always async with sync callback
2. **ALWAYS** use HikariCP connection pool — never DriverManager.getConnection()
3. **ALWAYS** close connections with try-with-resources
4. **ALWAYS** use PreparedStatement — never string-concatenate SQL
5. **ALWAYS** apply Bukkit API calls on main thread after async query
6. **ALWAYS** shade HikariCP + relocate (but NOT JDBC drivers)
7. **ALWAYS** close connection pool in onDisable()
8. **ALWAYS** lock rows in UUID order to prevent deadlocks
9. **ALWAYS** use `utf8mb4` charset for MySQL (not `utf8`)
10. **ALWAYS** set `busy_timeout` on SQLite connections
11. **ALWAYS** implement schema versioning from day one
12. **ALWAYS** schedule pool health monitoring (every 60s)
13. **NEVER** use `SELECT *` on tables with BLOB/TEXT columns
14. **ALWAYS** batch multiple INSERTs into a single round-trip
15. **ALWAYS** use `ON DUPLICATE KEY UPDATE` for upserts

## Common Mistakes to Avoid

- ❌ Using `DriverManager.getConnection()` — loses connection pooling, prepared statement caching
- ❌ Blocking main thread with database queries — server-wide TPS drop
- ❌ Not closing connections — pool exhaustion → all queries hang
- ❌ SQL injection via string concatenation — complete data loss possible
- ❌ Forgetting to shade HikariCP — NoClassDefFoundError at runtime
- ❌ Relocating JDBC drivers — breaks java.sql.DriverManager string-based class lookup
- ❌ No schema versioning — manual migration nightmares on updates
- ❌ SQLite without WAL mode — writers block all readers
- ❌ MySQL with `utf8` charset — emoji in player names causes silent data truncation
- ❌ Economy operations without atomic check-and-deduct — race condition → duplicated money

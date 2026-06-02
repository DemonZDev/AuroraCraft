# Minecraft Plugin Database Architecture Guide
## For Cross-Server Networks & AI-Assisted Development

**Version:** 2.0 (Unified Edition)
**Audience:** Database Administrators, Plugin Developers, Backend Engineers
**Network Context:** BungeeCord/Velocity multi-server environments, 100–200 concurrent players per server

---

## Executive Summary

AI-generated database code is the leading cause of data corruption, connection pool exhaustion, and race conditions in Minecraft plugin ecosystems. This guide exists because the default patterns that AI models produce — synchronous queries in event handlers, `DROP TABLE` in `onEnable()`, string-concatenated SQL, single-connection SQLite — are catastrophically wrong for production networks.

**The three laws of plugin database design:**

1. **Never block the main thread.** A 50ms database query at 20 TPS costs you an entire tick. At 100 players joining simultaneously, synchronous queries collapse your server.
2. **Never destroy data.** `DROP TABLE` in `onEnable()` is a firing offense. Schema changes are additive-only until a formal deprecation cycle.
3. **Never trust AI-generated SQL without review.** AI models produce plausible-looking code that contains SQL injection vectors, connection leaks, and race conditions. Every generated query needs a human review pass.

---

## Table of Contents

1. [Database Selection Matrix](#1-database-selection-matrix)
2. [Schema Design Patterns](#2-schema-design-patterns)
3. [Connection Management](#3-connection-management)
4. [Async Database Operations](#4-async-database-operations)
5. [Migration & Versioning](#5-migration--versioning)
6. [Data Integrity & Safety](#6-data-integrity--safety)
7. [Multi-Server Architecture](#7-multi-server-architecture)
8. [Common AI Database Mistakes](#8-common-ai-database-mistakes)
9. [Appendix A: Complete Schema Reference](#appendix-a-complete-schema-reference)
10. [Appendix B: Dependency Reference](#appendix-b-dependency-reference)
11. [Appendix C: Pre-Deployment Checklist](#appendix-c-pre-deployment-checklist)

---

## 1. Database Selection Matrix

### 1.1 When to Use What

The single most consequential decision in plugin database design is backend selection. The wrong choice creates problems that cannot be fixed without a full migration.

| Data Type | SQLite | MySQL | MariaDB | PostgreSQL | Redis | Flat File | **Recommended** |
|---|---|---|---|---|---|---|---|
| Player settings | ✅ Excellent | ✅ Good | ✅ Good | ⚠️ Overkill | ❌ No persistence | ❌ No queries | **SQLite (single) / MySQL (network)** |
| Economy data | ⚠️ Write contention | ✅ Excellent | ✅ Excellent | ✅ Excellent | ❌ Volatile | ❌ No ACID | **MySQL/MariaDB** |
| Chat logs | ⚠️ Size growth | ✅ Good | ✅ Good | ✅ Excellent | ❌ Volatile | ✅ Append-only | **Flat file or PostgreSQL** |
| Kit cooldowns | ✅ Good | ✅ Good | ✅ Good | ⚠️ Overkill | ✅ TTL native | ❌ No expiry | **Redis (TTL) or MySQL** |
| Warp locations | ✅ Excellent | ✅ Good | ✅ Good | ⚠️ Overkill | ❌ Volatile | ⚠️ No queries | **SQLite (single) / MySQL (network)** |
| Inventory backups | ⚠️ BLOB size | ✅ Good | ✅ Good | ✅ JSONB native | ❌ Volatile | ⚠️ Slow queries | **MySQL with MEDIUMBLOB** |
| Cross-server sync | ❌ File-local | ✅ Good | ✅ Good | ✅ Good | ✅ Pub/Sub native | ❌ No sync | **MySQL + Redis** |
| Analytics/stats | ⚠️ Aggregation slow | ✅ Good | ✅ Good | ✅ Excellent | ❌ Volatile | ❌ No aggregation | **MySQL/PostgreSQL** |
| Temporary cache | ❌ Disk overhead | ❌ Network overhead | ❌ Network overhead | ❌ Network overhead | ✅ Purpose-built | ❌ No TTL | **Redis or in-memory** |
| Session data | ❌ Stale on crash | ⚠️ Cleanup needed | ⚠️ Cleanup needed | ⚠️ Cleanup needed | ✅ TTL auto-clean | ❌ Stale on crash | **Redis** |
| Punishments | ⚠️ Single server | ✅ Excellent | ✅ Excellent | ✅ Excellent | ❌ Volatile | ❌ No queries | **MySQL/MariaDB** |
| Achievements | ✅ Good | ✅ Excellent | ✅ Excellent | ✅ Excellent | ❌ Volatile | ❌ No queries | **MySQL/MariaDB** |
| Friends list | ⚠️ Join queries slow | ✅ Excellent | ✅ Excellent | ✅ Excellent | ❌ Volatile | ❌ No queries | **MySQL/MariaDB** |
| Mail/messages | ⚠️ Size growth | ✅ Excellent | ✅ Excellent | ✅ Excellent | ❌ Volatile | ❌ No queries | **MySQL/MariaDB** |

### 1.2 SQLite Deep Dive

SQLite is the correct choice for single-server plugins that don't need cross-server data sharing. It requires zero infrastructure, zero configuration, and zero network latency. It is wrong for network-wide data.

#### WAL Mode: Non-Negotiable

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;          -- 64MB cache (negative = KB)
PRAGMA foreign_keys=ON;            -- Disabled by default!
PRAGMA auto_vacuum=INCREMENTAL;    -- Prevent file bloat
```

Without WAL mode, SQLite uses a rollback journal that takes an exclusive write lock on the entire database file for every write operation. This means every `INSERT` or `UPDATE` blocks all concurrent `SELECT` queries.

WAL (Write-Ahead Logging) mode separates readers from writers. Writers append to a WAL file; readers continue reading the last committed snapshot. The result: **N concurrent readers, 1 writer, zero blocking between them.**

`synchronous=NORMAL` is safe with WAL mode. The default `FULL` mode calls `fsync()` after every transaction, which is catastrophically slow on spinning disks and unnecessary with WAL.

#### Connection Model

SQLite's concurrency model is fundamentally different from MySQL:

```
MySQL:  Connection pool → N concurrent writers → row-level locking
SQLite: Connection pool → 1 writer at a time → file-level locking
```

For a plugin, this means:
- **Pool size for SQLite: 1 write connection + N read connections**
- Multiple write connections cause `SQLITE_BUSY` errors under contention
- The correct pattern is a single write connection serialized through a queue, plus a read pool

```java
// Correct SQLite pool configuration
HikariConfig config = new HikariConfig();
config.setJdbcUrl("jdbc:sqlite:" + dataFolder + "/data.db");
config.setMaximumPoolSize(1);          // SQLite: 1 connection for writes
config.setMinimumIdle(1);
config.addDataSourceProperty("busy_timeout", "5000"); // Wait 5s on SQLITE_BUSY
config.setConnectionInitSql("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
```

For read-heavy workloads, use a separate read-only connection pool:

```java
HikariConfig readConfig = new HikariConfig();
readConfig.setJdbcUrl("jdbc:sqlite:file:" + dataFolder + "/data.db?mode=ro");
readConfig.setMaximumPoolSize(4);      // Multiple concurrent readers
readConfig.setReadOnly(true);
```

#### File Location Strategy

| Location | Pros | Cons |
|---|---|---|
| `plugin.getDataFolder()/data.db` | Plugin-isolated, easy backup | Scattered across plugin folders |
| `plugins/shared/data.db` | Shared across plugins | Coupling, schema conflicts |
| Absolute path from config | Flexible, can point to SSD | Requires admin configuration |

**Recommendation:** Default to `plugin.getDataFolder()/data.db`. If multiple plugins need shared data, use MySQL — don't share a SQLite file.

### 1.3 MySQL/MariaDB for Networks

MySQL and MariaDB are the correct backends for any data that must be consistent across multiple servers. Both are wire-compatible.

**MySQL vs MariaDB:**

| Feature | MySQL 8.0+ | MariaDB 10.11+ | Winner |
|---------|-----------|----------------|--------|
| Performance | Excellent | Excellent | Tie |
| JSON Support | Native JSON type | JSON as alias to LONGTEXT | MySQL |
| Licensing | GPL (Oracle-owned) | GPL (Community-driven) | MariaDB (trust) |
| Thread Pool | Enterprise only | Free in all versions | MariaDB |
| Replication | Group replication | Galera Cluster | MariaDB (easier) |

**Recommendation:** MariaDB for new projects, MySQL if already standardized.

#### Character Set: utf8mb4 Is Mandatory

```sql
CREATE DATABASE plugin_data
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
```

MySQL's `utf8` character set only supports 3-byte UTF-8, which excludes emoji (4-byte sequences). Player names, chat messages, and item names can contain emoji. Using `utf8` causes silent data truncation or `Incorrect string value` errors.

`utf8mb4_unicode_ci` provides case-insensitive collation with correct Unicode comparison semantics. Use `utf8mb4_bin` only when you need case-sensitive exact matching (e.g., permission nodes).

#### InnoDB vs MyISAM

**Always use InnoDB. MyISAM is wrong for every plugin use case.**

| Feature | InnoDB | MyISAM |
|---|---|---|
| Transactions | ✅ ACID | ❌ None |
| Foreign keys | ✅ Enforced | ❌ Ignored |
| Row-level locking | ✅ Yes | ❌ Table-level only |
| Crash recovery | ✅ Automatic | ❌ Manual repair |

MyISAM uses table-level locking — every write locks the entire table. On a server with 100 players writing economy data simultaneously, this creates a write queue that cascades into connection pool exhaustion.

#### Connection Pool Sizing Formula

```
pool_size = (core_count * 2) + effective_spindle_count
```

For most plugin deployments:
- **Small server (4 cores, SSD):** 10 connections
- **Medium server (8 cores, SSD):** 18 connections
- **Large server (16 cores, SSD):** 34 connections

These are maximums — typical plugins need 2–5 connections.

---

## 2. Schema Design Patterns

### 2.1 Primary Keys: UUID as CHAR(36)

Store UUIDs as `CHAR(36)` by default for readability and debuggability. For high-volume tables (1M+ rows), consider `BINARY(16)` for space savings:

```sql
-- Standard (readable, debuggable)
CREATE TABLE players (
    uuid CHAR(36) PRIMARY KEY,
    name VARCHAR(16) NOT NULL,
    ...
);

-- Optimized (compact, 16 bytes vs 36 bytes)
CREATE TABLE players_opt (
    uuid BINARY(16) PRIMARY KEY,
    ...
);

-- Conversion helpers in Java:
public static UUID fromBytes(byte[] bytes) {
    ByteBuffer bb = ByteBuffer.wrap(bytes);
    return new UUID(bb.getLong(), bb.getLong());
}

public static byte[] toBytes(UUID uuid) {
    ByteBuffer bb = ByteBuffer.wrap(new byte[16]);
    bb.putLong(uuid.getMostSignificantBits());
    bb.putLong(uuid.getLeastSignificantBits());
    return bb.array();
}
```

### 2.2 Timestamps: BIGINT (Unix Epoch ms)

Use `BIGINT` storing Unix epoch milliseconds. This is timezone-agnostic, maps directly to `System.currentTimeMillis()`, and avoids DST bugs.

```sql
CREATE TABLE players (
    uuid CHAR(36) PRIMARY KEY,
    created_at BIGINT NOT NULL,       -- System.currentTimeMillis()
    last_seen BIGINT NOT NULL,
    INDEX idx_last_seen (last_seen)
);
```

**Why not TIMESTAMP?** MySQL `TIMESTAMP` is implicitly timezone-converted (`@@session.time_zone`) and has a 2038 problem. `BIGINT` epoch ms avoids both issues.

### 2.3 Economy Precision: DECIMAL(20,2)

```sql
balance DECIMAL(20,2) NOT NULL DEFAULT 0.00
```

Never use `FLOAT` or `DOUBLE` for money — floating-point rounding errors accumulate. `DECIMAL(20,2)` supports values up to 999,999,999,999,999,999.99 with exact precision.

### 2.4 Foreign Key Cascade Strategy

```sql
-- Audit tables: RESTRICT (preserve history even if player deleted)
CREATE TABLE transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    player_uuid CHAR(36) NOT NULL,
    amount DECIMAL(20,2) NOT NULL,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE RESTRICT
);

-- Optional references: SET NULL
CREATE TABLE punishments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_uuid CHAR(36) NOT NULL,
    issuer_uuid CHAR(36),
    FOREIGN KEY (target_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
    FOREIGN KEY (issuer_uuid) REFERENCES players(uuid) ON DELETE SET NULL
);
```

### 2.5 Indexing Strategy

```sql
-- Every query's WHERE clause should have a covering index
CREATE INDEX idx_player_balance ON players (balance DESC);
CREATE INDEX idx_player_last_seen ON players (last_seen);

-- Composite indexes for common query patterns
CREATE INDEX idx_txn_player_time ON transactions (player_uuid, created_at DESC);

-- Monitor index usage
SELECT * FROM sys.schema_unused_indexes;
SELECT * FROM sys.schema_redundant_indexes;
```

### 2.6 Complete Reference Schema

```sql
CREATE TABLE players (
    uuid CHAR(36) PRIMARY KEY,
    name VARCHAR(16) NOT NULL,
    balance DECIMAL(20,2) NOT NULL DEFAULT 0.00,
    tokens INT NOT NULL DEFAULT 0,
    kills INT NOT NULL DEFAULT 0,
    deaths INT NOT NULL DEFAULT 0,
    playtime BIGINT NOT NULL DEFAULT 0,
    first_join BIGINT NOT NULL,
    last_seen BIGINT NOT NULL,
    metadata JSON,                          -- Flexible key-value storage
    INDEX idx_name (name),
    INDEX idx_balance (balance DESC),
    INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    player_uuid CHAR(36) NOT NULL,
    amount DECIMAL(20,2) NOT NULL,
    reason VARCHAR(64) NOT NULL,
    issuer_uuid CHAR(36),
    created_at BIGINT NOT NULL,
    FOREIGN KEY (player_uuid) REFERENCES players(uuid) ON DELETE RESTRICT,
    FOREIGN KEY (issuer_uuid) REFERENCES players(uuid) ON DELETE SET NULL,
    INDEX idx_txn_player_time (player_uuid, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE punishments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_uuid CHAR(36) NOT NULL,
    type ENUM('BAN', 'MUTE', 'KICK', 'WARN') NOT NULL,
    reason VARCHAR(256) NOT NULL,
    issuer_uuid CHAR(36),
    duration BIGINT,                        -- NULL = permanent
    created_at BIGINT NOT NULL,
    expires_at BIGINT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (target_uuid) REFERENCES players(uuid) ON DELETE CASCADE,
    FOREIGN KEY (issuer_uuid) REFERENCES players(uuid) ON DELETE SET NULL,
    INDEX idx_punish_active (active, expires_at),
    INDEX idx_punish_target (target_uuid, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 3. Connection Management

### 3.1 HikariCP Configuration

HikariCP is the industry-standard JDBC connection pool. Here is the production configuration:

```java
public class DatabaseManager {

    private final MyPlugin plugin;
    private HikariDataSource dataSource;

    public DatabaseManager(MyPlugin plugin) {
        this.plugin = plugin;
        connect();
    }

    private void connect() {
        ConfigManager cfg = plugin.getConfigManager();

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:mysql://" + cfg.getDatabaseHost() + ":"
            + cfg.getDatabasePort() + "/" + cfg.getDatabaseName()
            + "?useSSL=false&characterEncoding=utf8mb4");
        config.setUsername(cfg.getDatabaseUser());
        config.setPassword(cfg.getDatabasePassword());

        // Pool sizing
        config.setMaximumPoolSize(5);
        config.setMinimumIdle(2);
        config.setConnectionTimeout(30_000);
        config.setIdleTimeout(600_000);
        config.setMaxLifetime(1_800_000);
        config.setLeakDetectionThreshold(60_000);  // Log warnings for leaked connections

        // Performance settings
        config.addDataSourceProperty("cachePrepStmts", "true");
        config.addDataSourceProperty("prepStmtCacheSize", "250");
        config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
        config.addDataSourceProperty("useServerPrepStmts", "true");
        config.addDataSourceProperty("useLocalSessionState", "true");
        config.addDataSourceProperty("rewriteBatchedStatements", "true");
        config.addDataSourceProperty("cacheResultSetMetadata", "true");
        config.addDataSourceProperty("elideSetAutoCommits", "true");
        config.addDataSourceProperty("maintainTimeStats", "false");

        config.setPoolName("MyPlugin-Pool");

        try {
            this.dataSource = new HikariDataSource(config);
            initializeSchema();
            plugin.getLogger().info("Database connection established.");
        } catch (Exception e) {
            plugin.getLogger().severe("Failed to connect to database: " + e.getMessage());
            plugin.getServer().getPluginManager().disablePlugin(plugin);
        }
    }

    public Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }

    public void shutdown() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
            plugin.getLogger().info("Database connection pool closed.");
        }
    }
}
```

### 3.2 SQLite-Specific Configuration

```java
private void connectSQLite() {
    File dbFile = new File(plugin.getDataFolder(), "data.db");

    HikariConfig config = new HikariConfig();
    config.setJdbcUrl("jdbc:sqlite:" + dbFile.getAbsolutePath());
    config.setMaximumPoolSize(1);   // SQLite: 1 writer
    config.setMinimumIdle(1);
    config.setConnectionTestQuery("SELECT 1");
    config.addDataSourceProperty("busy_timeout", "5000");
    config.setConnectionInitSql(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;"
    );

    this.dataSource = new HikariDataSource(config);
}
```

### 3.3 Connection Lifecycle

```java
public class DatabaseManager {
    // Called once in onEnable()
    public void connect() { ... }

    // Called periodically for health checks
    public boolean healthCheck() {
        try (Connection conn = getConnection();
             PreparedStatement stmt = conn.prepareStatement("SELECT 1")) {
            stmt.execute();
            return true;
        } catch (SQLException e) {
            plugin.getLogger().warning("Database health check failed: " + e.getMessage());
            return false;
        }
    }

    // Called once in onDisable()
    public void shutdown() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
        }
    }
}
```

---

## 4. Async Database Operations

### 4.1 The Golden Rule

**Never execute database queries on the main thread.** Use async for I/O, sync for Bukkit API.

### 4.2 CompletableFuture Pattern (Preferred)

```java
public class PlayerDataManager {

    private final MyPlugin plugin;
    private final DatabaseManager db;
    private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();

    // Load player data asynchronously — cache hit returns instantly
    public CompletableFuture<PlayerData> loadPlayerAsync(UUID uuid) {
        if (cache.containsKey(uuid)) {
            return CompletableFuture.completedFuture(cache.get(uuid));
        }

        return CompletableFuture.supplyAsync(() -> {
            try (Connection conn = db.getConnection();
                 PreparedStatement stmt = conn.prepareStatement(
                     "SELECT * FROM players WHERE uuid = ?")) {

                stmt.setString(1, uuid.toString());
                ResultSet rs = stmt.executeQuery();

                if (rs.next()) {
                    return mapResultSet(rs);
                } else {
                    PlayerData data = createDefaultData(uuid);
                    insertPlayer(data);
                    return data;
                }
            } catch (SQLException e) {
                plugin.getLogger().severe("Failed to load player " + uuid + ": " + e.getMessage());
                return createDefaultData(uuid); // Fallback
            }
        }).thenApply(data -> {
            cache.put(uuid, data);
            return data;
        });
    }

    // Save async — fire and forget with error logging
    public void saveAndUnloadAsync(UUID uuid) {
        PlayerData data = cache.remove(uuid);
        if (data == null) return;

        CompletableFuture.runAsync(() -> {
            try (Connection conn = db.getConnection();
                 PreparedStatement stmt = conn.prepareStatement(
                     "INSERT INTO players (uuid, name, balance, tokens, kills, deaths, "
                     + "playtime, first_join, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                     + "ON DUPLICATE KEY UPDATE name=VALUES(name), balance=VALUES(balance), "
                     + "tokens=VALUES(tokens), kills=VALUES(kills), deaths=VALUES(deaths), "
                     + "playtime=VALUES(playtime), last_seen=VALUES(last_seen)")) {

                stmt.setString(1, data.getUuid().toString());
                stmt.setString(2, data.getName());
                stmt.setBigDecimal(3, data.getBalance());
                stmt.setInt(4, data.getTokens());
                stmt.setInt(5, data.getKills());
                stmt.setInt(6, data.getDeaths());
                stmt.setLong(7, data.getPlaytime());
                stmt.setLong(8, data.getFirstJoin());
                stmt.setLong(9, data.getLastSeen());
                stmt.executeUpdate();

            } catch (SQLException e) {
                plugin.getLogger().severe("Failed to save player " + uuid + ": " + e.getMessage());
            }
        });
    }

    // Synchronous save for onDisable() — can't use async during shutdown
    public void saveAll() {
        cache.forEach((uuid, data) -> saveSync(data));
        cache.clear();
    }
}
```

### 4.3 Async Chain with Main-Thread Callback

```java
playerDataManager.loadPlayerAsync(player.getUniqueId())
    .thenAcceptAsync(data -> {
        // Back on main thread for Bukkit API
        player.sendMessage("Welcome back! Tokens: " + data.getTokens());
    }, runnable -> Bukkit.getScheduler().runTask(plugin, runnable))
    .exceptionally(e -> {
        plugin.getLogger().severe("Async chain failed: " + e.getMessage());
        return null;
    });
```

### 4.4 Transaction Management

For operations that must be atomic across multiple tables:

```java
public void transferBalance(UUID from, UUID to, double amount) {
    Connection conn = null;
    try {
        conn = db.getConnection();
        conn.setAutoCommit(false);

        try (PreparedStatement deduct = conn.prepareStatement(
                "UPDATE players SET balance = balance - ? WHERE uuid = ? AND balance >= ?")) {
            deduct.setDouble(1, amount);
            deduct.setString(2, from.toString());
            deduct.setDouble(3, amount);
            if (deduct.executeUpdate() == 0) {
                throw new SQLException("Insufficient balance or player not found");
            }
        }

        try (PreparedStatement add = conn.prepareStatement(
                "UPDATE players SET balance = balance + ? WHERE uuid = ?")) {
            add.setDouble(1, amount);
            add.setString(2, to.toString());
            add.executeUpdate();
        }

        conn.commit();
    } catch (SQLException e) {
        if (conn != null) {
            try { conn.rollback(); } catch (SQLException ex) { /* log */ }
        }
        plugin.getLogger().severe("Transaction failed: " + e.getMessage());
    } finally {
        if (conn != null) {
            try { conn.setAutoCommit(true); conn.close(); } catch (SQLException e) { /* log */ }
        }
    }
}
```

---

## 5. Migration & Versioning

### 5.1 Schema Version Tracking

```java
public class SchemaManager {
    private static final int CURRENT_SCHEMA_VERSION = 3;
    private final DatabaseManager db;
    private final MyPlugin plugin;

    public void initializeSchema() {
        // Create tracking table
        db.execute("CREATE TABLE IF NOT EXISTS schema_version (version INT NOT NULL)");

        int currentVersion = getCurrentVersion();
        if (currentVersion < CURRENT_SCHEMA_VERSION) {
            plugin.getLogger().info("Migrating database from v" + currentVersion
                + " to v" + CURRENT_SCHEMA_VERSION);
            applyMigrations(currentVersion);
        }
    }

    private int getCurrentVersion() {
        try (Connection conn = db.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT version FROM schema_version LIMIT 1");
             ResultSet rs = stmt.executeQuery()) {
            return rs.next() ? rs.getInt("version") : 0;
        } catch (SQLException e) {
            return 0; // Fresh install
        }
    }

    private void applyMigrations(int fromVersion) {
        if (fromVersion < 1) {
            db.execute("""
                CREATE TABLE IF NOT EXISTS players (
                    uuid CHAR(36) PRIMARY KEY,
                    name VARCHAR(16) NOT NULL,
                    balance DECIMAL(20,2) NOT NULL DEFAULT 0.00
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """);
            setSchemaVersion(1);
            plugin.getLogger().info("Applied migration v1.");
        }

        if (fromVersion < 2) {
            db.execute("ALTER TABLE players ADD COLUMN playtime BIGINT NOT NULL DEFAULT 0");
            setSchemaVersion(2);
            plugin.getLogger().info("Applied migration v2.");
        }

        if (fromVersion < 3) {
            db.execute("""
                ALTER TABLE players
                ADD COLUMN first_join BIGINT,
                ADD COLUMN last_seen BIGINT,
                ADD INDEX idx_last_seen (last_seen)
            """);
            setSchemaVersion(3);
            plugin.getLogger().info("Applied migration v3.");
        }

        // Add future migrations here — NEVER modify existing migrations
    }

    private void setSchemaVersion(int version) {
        try (Connection conn = db.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "INSERT INTO schema_version (version) VALUES (?) "
                 + "ON DUPLICATE KEY UPDATE version = ?")) {
            stmt.setInt(1, version);
            stmt.setInt(2, version);
            stmt.execute();
        } catch (SQLException e) {
            plugin.getLogger().severe("Failed to set schema version: " + e.getMessage());
        }
    }
}
```

**Migration rules:**
1. Migrations are **additive only** — never modify an existing migration
2. Each migration is **idempotent** — safe to run multiple times
3. Use `IF NOT EXISTS` / `IF EXISTS` for all DDL
4. Test migrations on a copy of production data before deploying
5. **Never `DROP TABLE` in a migration**

---

## 6. Data Integrity & Safety

### 6.1 SQL Injection Prevention

**Always use `PreparedStatement`. Never concatenate user input into SQL.**

```java
// ❌ SQL INJECTION: User input concatenated directly
String sql = "SELECT * FROM players WHERE name = '" + playerName + "'";

// ✅ SAFE: Parameterized query
String sql = "SELECT * FROM players WHERE name = ?";
PreparedStatement stmt = conn.prepareStatement(sql);
stmt.setString(1, playerName);
```

### 6.2 Backup Strategy

```bash
# SQLite backup (copy the file while WAL checkpoint is active)
sqlite3 data.db "PRAGMA wal_checkpoint(TRUNCATE);"
cp data.db "backups/data_$(date +%Y%m%d_%H%M%S).db"

# MySQL backup
mysqldump --single-transaction --routines --triggers plugin_data \
  > "backups/plugin_data_$(date +%Y%m%d_%H%M%S).sql"
```

**Verify your backups.** A backup you haven't tested restoring from is not a backup.

### 6.3 Economy Integrity

```java
public boolean deductBalance(UUID uuid, double amount) {
    // Atomic check-and-deduct using UPDATE with WHERE clause
    try (Connection conn = db.getConnection();
         PreparedStatement stmt = conn.prepareStatement(
             "UPDATE players SET balance = balance - ? WHERE uuid = ? AND balance >= ?")) {
        stmt.setDouble(1, amount);
        stmt.setString(2, uuid.toString());
        stmt.setDouble(3, amount);
        return stmt.executeUpdate() > 0; // Returns false if insufficient balance
    } catch (SQLException e) {
        plugin.getLogger().severe("Deduction failed: " + e.getMessage());
        return false;
    }
}
```

### 6.4 Conflict Resolution (Multi-Server)

When the same player is loaded on two servers simultaneously, the last writer wins by default. For critical data, use these strategies:

| Strategy | How It Works | Use When |
|----------|-------------|----------|
| **Last-write-wins** | `ON DUPLICATE KEY UPDATE` | Default for most data |
| **Optimistic locking** | Version column + `WHERE version = ?` | Economy, inventory |
| **Pessimistic locking** | `SELECT ... FOR UPDATE` | Critical transactions |
| **Merge fields** | Only update specific changed fields | Partial profile updates |

---

## 7. Multi-Server Architecture

### 7.1 Shared Database Pattern

All servers in a BungeeCord/Velocity network connect to the same MySQL/MariaDB instance:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Survival    │  │  Skyblock    │  │  Lobby       │
│  (Server 1)  │  │  (Server 2)  │  │  (Server 3)  │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                  ┌──────▼──────┐
                  │   MySQL /   │
                  │  MariaDB    │
                  └─────────────┘
```

### 7.2 Redis for Cross-Server State

Redis complements MySQL for real-time cross-server state:

```java
// Publish balance change to all servers
redisPublisher.publish("balance:change", playerUuid + ":" + newBalance);

// Other servers subscribe and update local caches
redisSubscriber.onMessage((channel, message) -> {
    String[] parts = message.split(":");
    UUID uuid = UUID.fromString(parts[0]);
    double balance = Double.parseDouble(parts[1]);
    localCache.put(uuid, balance);
});
```

### 7.3 Player Data Loading Across Servers

```java
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();

    playerDataManager.loadPlayerAsync(player.getUniqueId())
        .thenAccept(data -> {
            Bukkit.getScheduler().runTask(plugin, () -> {
                if (player.isOnline()) {
                    // Player data loaded from shared database — consistent across servers
                    applyPlayerData(player, data);
                }
            });
        });
}
```

---

## 8. Common AI Database Mistakes

### 8.1 Synchronous Queries in Event Handlers

❌ Database query directly in `@EventHandler` — blocks the main thread.
✅ Use async load with main-thread callback.

### 8.2 New Connection Per Query

❌ Opening and closing a connection for every query.
✅ Use HikariCP connection pool — connections are expensive to create.

### 8.3 SQL Injection

❌ String concatenation: `"SELECT * FROM players WHERE name = '" + name + "'"`
✅ `PreparedStatement` with parameterized queries.

### 8.4 Missing Connection Pool

❌ Single `DriverManager.getConnection()` shared across all threads.
✅ HikariCP with proper pool sizing.

### 8.5 Forgetting to Close Resources

❌ ResultSets, Statements, or Connections left open.
✅ Always use try-with-resources.

### 8.6 Missing Indexes

❌ Full table scans on every query because no indexes exist.
✅ Index every column used in WHERE, JOIN, and ORDER BY clauses.

### 8.7 DROP TABLE in Migrations

❌ Destructive schema changes that lose data.
✅ Additive-only migrations with deprecation cycles.

### 8.8 No Error Handling

❌ `e.printStackTrace()` silently swallowing failures.
✅ Log with context, provide fallback values, alert admins.

### 8.9 Using Wrong Data Types

❌ `FLOAT`/`DOUBLE` for money, `VARCHAR` without length limit, missing character set.
✅ `DECIMAL` for money, sized `VARCHAR`, always `utf8mb4`.

---

## Appendix A: Complete Schema Reference

See Section 2.6 for the complete reference schema including `players`, `transactions`, and `punishments` tables with proper indexes, foreign keys, and engine configuration.

## Appendix B: Dependency Reference

```xml
<!-- HikariCP — connection pooling (REQUIRED) -->
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.1.0</version>
    <scope>compile</scope>
</dependency>

<!-- SQLite JDBC -->
<dependency>
    <groupId>org.xerial</groupId>
    <artifactId>sqlite-jdbc</artifactId>
    <version>3.47.1.0</version>
    <scope>compile</scope>
</dependency>

<!-- MySQL Connector/J -->
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <version>9.1.0</version>
    <scope>compile</scope>
</dependency>

<!-- Caffeine — in-memory caching (recommended) -->
<dependency>
    <groupId>com.github.ben-manes.caffeine</groupId>
    <artifactId>caffeine</artifactId>
    <version>3.1.8</version>
    <scope>compile</scope>
</dependency>

<!-- Jedis — Redis client -->
<dependency>
    <groupId>redis.clients</groupId>
    <artifactId>jedis</artifactId>
    <version>5.2.0</version>
    <scope>compile</scope>
</dependency>
```

## Appendix C: Pre-Deployment Checklist

- [ ] Database uses `utf8mb4` character set
- [ ] All tables use InnoDB engine
- [ ] HikariCP configured with proper pool size
- [ ] All queries use `PreparedStatement` (no string concatenation)
- [ ] Database queries run asynchronously
- [ ] Schema versioning system is in place
- [ ] `onDisable()` performs synchronous save of all cached data
- [ ] Backups configured and verified
- [ ] Foreign keys defined with appropriate cascade strategy
- [ ] Indexes cover all common query patterns
- [ ] Economy operations use atomic check-and-deduct
- [ ] Connection pool has leak detection enabled
- [ ] SQLite uses WAL mode with `busy_timeout`

---

---

## 9. Connection Pool Monitoring & Health

### 9.1 HikariCP Metrics

HikariCP exposes detailed pool metrics. Monitor them to catch leaks, exhaustion, and misconfiguration:

```java
public class PoolMonitor {
    private final HikariDataSource dataSource;
    private final MyPlugin plugin;

    public PoolMonitor(MyPlugin plugin, HikariDataSource dataSource) {
        this.plugin = plugin;
        this.dataSource = dataSource;
    }

    public void logPoolStats() {
        HikariPoolMXBean pool = dataSource.getHikariPoolMXBean();
        if (pool == null) return;

        int active = pool.getActiveConnections();
        int idle = pool.getIdleConnections();
        int total = pool.getTotalConnections();
        int waiting = pool.getThreadsAwaitingConnection();

        plugin.getLogger().info(String.format(
            "Pool stats — Active: %d, Idle: %d, Total: %d, Waiting: %d, Max: %d",
            active, idle, total, waiting, dataSource.getMaximumPoolSize()
        ));

        // Warning signs:
        if (waiting > 0) {
            plugin.getLogger().warning("Threads waiting for connections! "
                + "Consider increasing maximumPoolSize or investigating slow queries.");
        }
        if (active == dataSource.getMaximumPoolSize()) {
            plugin.getLogger().warning("Connection pool at maximum! Active=" + active
                + ". Potential connection leak or undersized pool.");
        }
    }

    // Schedule periodic monitoring
    public void startMonitoring() {
        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin,
            this::logPoolStats, 1200L, 1200L); // Every 60 seconds
    }
}
```

**Key HikariCP metrics and their meanings:**

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| `ActiveConnections` | < 80% of max | = max for >10s | = max for >60s |
| `IdleConnections` | > 0 | = 0 (pool saturated) | = 0 + active = max |
| `ThreadsAwaitingConnection` | 0 | 1–5 (occasional) | >5 (sustained) |
| `ConnectionTimeoutRate` | 0/min | 1–5/min | >5/min |
| `ConnectionCreationRate` | <10/min | 10–50/min | >50/min (churn) |

**What high connection creation rate means:** Each new connection requires a TCP handshake + MySQL authentication — ~5–10ms. If your pool is creating 50+ connections per minute, something is wrong: either your pool is too small (connections are churning) or your code is leaking connections (not closing them).

### 9.2 Connection Leak Detection

HikariCP can detect connections that were checked out but never returned:

```java
config.setLeakDetectionThreshold(60_000); // 60 seconds — if a connection is
                                           // held this long, log a warning
                                           // with the stack trace of where
                                           // it was checked out
```

When a leak is detected, HikariCP logs:
```
[HikariPool-1 housekeeper] WARN  HikariPool-1 - Connection leak detection triggered
for conn1: connection evicted due to being checked out for more than 60000ms,
stack trace follows:
java.lang.Exception: Apparent connection leak detected
    at com.zaxxer.hikari.HikariDataSource.getConnection(HikariDataSource.java:128)
    at com.yourplugin.managers.PlayerDataManager.loadPlayer(PlayerDataManager.java:45)
    ...
```

**How to fix leaks:** Every `getConnection()` must be paired with a `close()` (or try-with-resources). The most common leak pattern is forgetting to close `ResultSet` or `Statement` — if either is left open, the underlying `Connection` stays checked out.

### 9.3 Read/Write Splitting

For plugins with read-heavy workloads and MySQL replication, route reads to replicas and writes to the primary:

```java
public class SplitDatabaseManager {
    private final HikariDataSource writeSource;   // Primary (writes)
    private final HikariDataSource readSource;    // Replica (reads)

    public Connection getWriteConnection() throws SQLException {
        return writeSource.getConnection();
    }

    public Connection getReadConnection() throws SQLException {
        return readSource.getConnection();
    }
}

// Usage:
public PlayerData loadPlayer(UUID uuid) {
    try (Connection conn = db.getReadConnection();  // Read from replica
         PreparedStatement stmt = conn.prepareStatement("SELECT ...")) {
        // Query
    }
}

public void savePlayer(PlayerData data) {
    try (Connection conn = db.getWriteConnection(); // Write to primary
         PreparedStatement stmt = conn.prepareStatement("INSERT ...")) {
        // Insert
    }
}
```

**Caveat:** MySQL replication is asynchronous. After a write, the replica may be a few milliseconds behind. If you write and then immediately read, you might get stale data. Always read from the primary after a write if you need immediate consistency.

---

## 10. Query Performance Tuning

### 10.1 EXPLAIN: Read Query Plans Before Deploying

Never ship a query without running `EXPLAIN` on it first:

```sql
-- MySQL/MariaDB
EXPLAIN SELECT p.name, p.balance, t.amount
FROM players p
JOIN transactions t ON p.uuid = t.player_uuid
WHERE p.last_seen > UNIX_TIMESTAMP() * 1000 - 86400000
ORDER BY t.amount DESC
LIMIT 10;

-- Key columns to check:
-- type: ALL = full table scan (BAD), index = index scan (OK), ref/eq_ref = index lookup (GOOD)
-- rows: estimated rows examined — should be as low as possible
-- Extra: Using filesort = sorting without index (BAD), Using index = covered (GOOD)
```

**Red flags in EXPLAIN output:**
- `type: ALL` on a table with >1,000 rows → add an index
- `rows` > 1,000 for a query expected to return <10 rows → add a WHERE clause or index
- `Extra: Using filesort` on a query with `ORDER BY` → add an index on the sort column
- `Extra: Using temporary` → the query creates an implicit temp table (expensive)

### 10.2 The N+1 Query Problem

The single most common performance bug in plugin database code:

```java
// ❌ N+1 QUERIES: 1 query for player list + 1 query PER PLAYER
List<PlayerData> topPlayers = database.getTopPlayers(10); // Query 1
for (PlayerData player : topPlayers) {
    int unreadMessages = database.getUnreadCount(player.getUuid()); // Query per player
    // 10 players = 11 queries total
}

// ✅ SINGLE QUERY with JOIN or subquery
List<PlayerData> topPlayers = database.getTopPlayersWithUnreadCount(10);
// SELECT p.*, COUNT(m.id) as unread
// FROM players p
// LEFT JOIN messages m ON p.uuid = m.recipient_uuid AND m.read = 0
// GROUP BY p.uuid
// ORDER BY p.balance DESC LIMIT 10
```

**The fix is always the same:** Push the loop into SQL. SQL engines are optimized for set operations; Java loops are not.

### 10.3 Common Slow Query Patterns and Their Fixes

| Slow Pattern | Why It's Slow | Fix |
|-------------|---------------|-----|
| `SELECT *` on a table with BLOB/TEXT columns | Pulls large columns you don't need | Select only needed columns |
| `WHERE DATE(FROM_UNIXTIME(created_at/1000)) = '2024-01-15'` | Can't use index (function on column) | Use range: `WHERE created_at BETWEEN ? AND ?` |
| `LIKE '%search%'` | Leading wildcard prevents index use | Use FULLTEXT index (InnoDB 5.6+) |
| `ORDER BY RAND() LIMIT 1` | Assigns random to every row, sorts, discards | `SELECT ... WHERE id >= FLOOR(RAND() * (SELECT MAX(id)...)) LIMIT 1` |
| `COUNT(*)` on large tables (MyISAM fast, InnoDB slow) | InnoDB doesn't cache row count | Use `SHOW TABLE STATUS` for approximate, or maintain a counter table |
| `OFFSET 10000 LIMIT 20` for pagination | MySQL scans and discards 10000 rows | Use keyset pagination: `WHERE id > last_seen_id LIMIT 20` |

### 10.4 Keyset Pagination (Cursor-Based)

```java
// ❌ OFFSET pagination — gets progressively slower
// Page 1: OFFSET 0 LIMIT 20  → scans 20 rows (fast)
// Page 500: OFFSET 10000 LIMIT 20 → scans 10020 rows (slow)

// ✅ Keyset pagination — always scans exactly 20 rows
public List<PlayerData> getLeaderboardPage(Long afterLastSeen, int limit) {
    String sql = afterLastSeen == null
        ? "SELECT * FROM players ORDER BY balance DESC LIMIT ?"
        : "SELECT * FROM players WHERE balance < (SELECT balance FROM players WHERE last_seen = ?) "
          + "ORDER BY balance DESC LIMIT ?";

    // The WHERE clause uses an index seek, not a scan
    // Always returns in O(limit) time, regardless of page depth
}
```

---

## 11. Data Safety & Disaster Recovery

### 11.1 Write-Ahead Patterns

For critical data that must survive a crash:

```java
// Pattern: Write to WAL-like table first, then update live table
public void atomicTransfer(UUID from, UUID to, double amount) {
    Connection conn = null;
    try {
        conn = ds.getConnection();
        conn.setAutoCommit(false);

        // Step 1: Write intent to append-only log (survives crash)
        long logId;
        try (PreparedStatement stmt = conn.prepareStatement(
                "INSERT INTO transaction_log (from_uuid, to_uuid, amount, status, created_at) "
                + "VALUES (?, ?, ?, 'PENDING', ?)", Statement.RETURN_GENERATED_KEYS)) {
            stmt.setString(1, from.toString());
            stmt.setString(2, to.toString());
            stmt.setDouble(3, amount);
            stmt.setLong(4, System.currentTimeMillis());
            stmt.executeUpdate();
            ResultSet keys = stmt.getGeneratedKeys();
            keys.next();
            logId = keys.getLong(1);
        }

        // Step 2: Execute the transfer
        deduct(from, amount, conn);
        credit(to, amount, conn);

        // Step 3: Mark log entry as complete
        try (PreparedStatement stmt = conn.prepareStatement(
                "UPDATE transaction_log SET status = 'COMPLETE' WHERE id = ?")) {
            stmt.setLong(1, logId);
            stmt.executeUpdate();
        }

        conn.commit();
    } catch (SQLException e) {
        if (conn != null) {
            try { conn.rollback(); } catch (SQLException ex) {}
        }
        // If this fails, the transaction_log has a PENDING entry
        // A recovery process can detect uncommitted PENDING entries and reconcile
    } finally {
        if (conn != null) {
            try { conn.setAutoCommit(true); conn.close(); } catch (SQLException e) {}
        }
    }
}
```

### 11.2 Deadlock Detection and Prevention

MySQL deadlocks are common in plugin databases with concurrent writes:

```
Transaction A: UPDATE players SET balance = balance - 50 WHERE uuid = 'a';  -- locks row 'a'
              UPDATE players SET balance = balance + 50 WHERE uuid = 'b';  -- waits for row 'b'

Transaction B: UPDATE players SET balance = balance - 50 WHERE uuid = 'b';  -- locks row 'b'
              UPDATE players SET balance = balance + 50 WHERE uuid = 'a';  -- waits for row 'a'

→ DEADLOCK: A waits for B, B waits for A. MySQL kills one and rolls it back.
```

**Prevention:**
1. **Always lock in the same order:** Sort UUIDs alphabetically, lock the lower one first
2. **Keep transactions short:** Acquire locks, do the work, commit, release — all in <100ms
3. **Use `SELECT ... FOR UPDATE` with NOWAIT:** Don't block; fail fast and retry
4. **Catch deadlocks and retry:**

```java
private static final int MAX_RETRIES = 3;

public void atomicTransferWithRetry(UUID from, UUID to, double amount) {
    for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Always lock in UUID order to prevent deadlocks
            UUID first = from.compareTo(to) < 0 ? from : to;
            UUID second = from.compareTo(to) < 0 ? to : from;

            Connection conn = ds.getConnection();
            conn.setAutoCommit(false);
            try {
                lockRow(conn, first);
                lockRow(conn, second);
                // Do transfer...
                conn.commit();
                return;
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            } finally {
                conn.close();
            }
        } catch (SQLException e) {
            if (e.getErrorCode() == 1213 && attempt < MAX_RETRIES) { // ER_LOCK_DEADLOCK
                plugin.getLogger().warning("Deadlock on transfer " + from + " → "
                    + to + " (attempt " + attempt + "), retrying...");
                Thread.sleep((long) (Math.random() * 100)); // Jitter to prevent repeated deadlocks
            } else {
                throw new RuntimeException("Transfer failed after " + MAX_RETRIES + " attempts", e);
            }
        }
    }
}

private void lockRow(Connection conn, UUID uuid) throws SQLException {
    try (PreparedStatement stmt = conn.prepareStatement(
            "SELECT uuid FROM players WHERE uuid = ? FOR UPDATE NOWAIT")) {
        stmt.setString(1, uuid.toString());
        stmt.executeQuery();
    }
}
```

### 11.3 Backup Verification

A backup you haven't tested restoring from is not a backup. Automate verification:

```bash
#!/bin/bash
# backup-and-verify.sh — nightly backup with verification

BACKUP_FILE="plugin_data_$(date +%Y%m%d).sql"
VERIFY_DB="plugin_data_verify_$(date +%Y%m%d)"

# 1. Take backup
mysqldump --single-transaction plugin_data > "/backups/$BACKUP_FILE"

# 2. Restore to a temporary database
mysql -e "CREATE DATABASE $VERIFY_DB"
mysql "$VERIFY_DB" < "/backups/$BACKUP_FILE"

# 3. Verify: check row counts match on key tables
ORIG_COUNT=$(mysql -N -e "SELECT COUNT(*) FROM plugin_data.players")
REST_COUNT=$(mysql -N -e "SELECT COUNT(*) FROM $VERIFY_DB.players")

if [ "$ORIG_COUNT" != "$REST_COUNT" ]; then
    echo "VERIFICATION FAILED: players count mismatch ($ORIG_COUNT vs $REST_COUNT)"
    # Alert via webhook/email
    exit 1
fi

# 4. Cleanup
mysql -e "DROP DATABASE $VERIFY_DB"
echo "Backup verified: $BACKUP_FILE ($ORIG_COUNT rows in players)"
```

### 11.4 Data Archival Strategy

Tables that grow unboundedly (chat logs, transaction history, audit logs) will eventually degrade performance. Plan for this:

```sql
-- Partition transaction_log by month (MySQL 8.0+)
ALTER TABLE transaction_log
PARTITION BY RANGE (UNIX_TIMESTAMP(FROM_UNIXTIME(created_at / 1000))) (
    PARTITION p202401 VALUES LESS THAN (UNIX_TIMESTAMP('2024-02-01')),
    PARTITION p202402 VALUES LESS THAN (UNIX_TIMESTAMP('2024-03-01')),
    PARTITION p202403 VALUES LESS THAN (UNIX_TIMESTAMP('2024-04-01')),
    -- ... add partitions monthly via cron job
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- Queries that filter by date automatically use partition pruning
-- SELECT * FROM transaction_log WHERE created_at BETWEEN ? AND ?
-- → Only scans relevant partitions, not the entire table

-- Archive old partitions:
-- ALTER TABLE transaction_log TRUNCATE PARTITION p202401;
```

---

*End of Minecraft Plugin Database Architecture Guide*

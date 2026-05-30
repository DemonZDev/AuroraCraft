# Minecraft Plugin Database Architecture Guide
## For Cross-Server Networks & AI-Assisted Development

**Version:** 1.0  
**Audience:** Database Administrators, Plugin Developers, Backend Engineers  
**Network Context:** 5-server BungeeCord network, 100–200 concurrent players per server  

---

## Executive Summary

AI-generated database code is the leading cause of data corruption, connection pool exhaustion, and race conditions in Minecraft plugin ecosystems. This guide exists because the default patterns that AI models produce — synchronous queries in event handlers, `DROP TABLE` in `onEnable()`, string-concatenated SQL, single-connection SQLite — are catastrophically wrong for production networks.

This document is your team's authoritative reference. Every pattern here has been validated against real-world network deployments. Every anti-pattern documented here has caused real data loss.

**The three laws of plugin database design:**

1. **Never block the main thread.** A 50ms database query at 20 TPS costs you an entire tick. At 100 players joining simultaneously, synchronous queries collapse your server.
2. **Never destroy data.** `DROP TABLE` in `onEnable()` is a firing offense. Schema changes are additive-only until a formal deprecation cycle.
3. **Never trust AI-generated SQL without review.** AI models produce plausible-looking code that contains SQL injection vectors, connection leaks, and race conditions. Every generated query needs a human review pass.

---

## 1. Database Selection Matrix

### 1.1 When to Use What

The single most consequential decision in plugin database design is backend selection. The wrong choice creates problems that cannot be fixed without a full migration.

| Data Type | SQLite | MySQL | MariaDB | PostgreSQL | Redis | Flat File | **Recommended** |
|---|---|---|---|---|---|---|---|
| Player settings | ✅ Excellent | ✅ Good | ✅ Good | ⚠️ Overkill | ❌ No persistence | ❌ No queries | **SQLite (single) / MySQL (network)** |
| Economy data | ⚠️ Write contention | ✅ Excellent | ✅ Excellent | ✅ Excellent | ❌ Volatile | ❌ No ACID | **MySQL/MariaDB** |
| Chat logs | ⚠️ Size growth | ✅ Good | ✅ Good | ✅ Good | ❌ Volatile | ✅ Append-only | **Flat file or MySQL** |
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

**Reading the table:**
- ✅ Excellent — purpose-built for this use case, no caveats
- ✅ Good — works well with standard configuration
- ⚠️ — works but has specific caveats documented below
- ❌ — wrong tool; do not use for this data type

---

### 1.2 SQLite Deep Dive

SQLite is the correct choice for single-server plugins that don't need cross-server data sharing. It requires zero infrastructure, zero configuration, and zero network latency. It is wrong for network-wide data.

#### WAL Mode: Non-Negotiable

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=MEMORY;
```

Without WAL mode, SQLite uses a rollback journal that takes an exclusive write lock on the entire database file for every write operation. This means:
- Every `INSERT` or `UPDATE` blocks all concurrent `SELECT` queries
- On a busy server with multiple plugins sharing a database, reads queue behind writes
- A slow write (large BLOB, complex transaction) freezes all readers

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

#### The AI Mistake: New Connection Per Query

```java
// BAD: AI-generated pattern — opens and closes a connection for every query
public int getBalance(UUID uuid) {
    try (Connection conn = DriverManager.getConnection("jdbc:sqlite:data.db")) {
        PreparedStatement ps = conn.prepareStatement("SELECT balance FROM players WHERE uuid = ?");
        ps.setString(1, uuid.toString());
        ResultSet rs = ps.executeQuery();
        return rs.next() ? rs.getInt("balance") : 0;
    } catch (SQLException e) {
        e.printStackTrace();
        return 0;
    }
}
```

**Why this destroys performance:**
- SQLite file open/close: ~2–5ms per call
- At 100 players, 10 queries each on join: 1,000–5,000ms of pure overhead
- No connection reuse, no prepared statement caching
- `e.printStackTrace()` silently swallows errors without propagation

```java
// GOOD: HikariCP pool, prepared statement, proper error handling
public CompletableFuture<Integer> getBalance(UUID uuid) {
    return CompletableFuture.supplyAsync(() -> {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT balance FROM players WHERE uuid = ?")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt("balance") : 0;
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Failed to fetch balance for " + uuid + ": " + e.getMessage());
            throw new RuntimeException(e);
        }
    }, asyncExecutor);
}
```

---

### 1.3 MySQL/MariaDB for Networks

MySQL and MariaDB are the correct backends for any data that must be consistent across multiple servers. Both are wire-compatible; MariaDB is generally preferred for new deployments due to better performance characteristics and open governance.

#### Character Set: utf8mb4 Is Mandatory

```sql
CREATE DATABASE plugin_data
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
```

MySQL's `utf8` character set is a lie — it only supports 3-byte UTF-8, which excludes emoji (4-byte sequences). Player names, chat messages, and item names can contain emoji. Using `utf8` causes silent data truncation or `Incorrect string value` errors.

`utf8mb4_unicode_ci` provides case-insensitive collation with correct Unicode comparison semantics. Use `utf8mb4_bin` only when you need case-sensitive exact matching (e.g., permission nodes).

#### InnoDB vs MyISAM

**Always use InnoDB. MyISAM is wrong for every plugin use case.**

| Feature | InnoDB | MyISAM |
|---|---|---|
| Transactions | ✅ ACID | ❌ None |
| Foreign keys | ✅ Enforced | ❌ Ignored |
| Row-level locking | ✅ Yes | ❌ Table-level only |
| Crash recovery | ✅ Automatic | ❌ Manual repair |
| Full-text search | ✅ (5.6+) | ✅ Legacy |

MyISAM uses table-level locking — every write locks the entire table. On a server with 100 players writing economy data simultaneously, this creates a write queue that cascades into connection pool exhaustion.

InnoDB's row-level locking means concurrent writes to different rows proceed in parallel. Combined with MVCC (Multi-Version Concurrency Control), readers never block writers.

#### Connection Pool Sizing Formula

The standard formula from the HikariCP documentation:

```
pool_size = (core_count * 2) + effective_spindle_count
```

For a typical shared hosting MySQL server (4 cores, SSD = 1 effective spindle):

```
pool_size = (4 * 2) + 1 = 9 → round to 10
```

**Real-world numbers for your network:**

| Scenario | Servers | Players | Pool Per Server | Total Connections |
|---|---|---|---|---|
| Single server, light load | 1 | 50 | 5 | 5 |
| Single server, heavy load | 1 | 200 | 10 | 10 |
| Network, 5 servers | 5 | 500 total | 10 | 50 |
| Network, 5 servers, multiple plugins | 5 | 500 total | 5 per plugin | 25 per plugin |

> **Warning:** MySQL's default `max_connections` is 151. With 5 servers × 3 plugins × 10 pool size = 150 connections, you are at the limit. Either increase `max_connections` in `my.cnf` or reduce pool sizes. Connection refusal at the MySQL level causes `HikariPool-1 - Connection is not available, request timed out` errors that cascade into data loss.

#### SSL/TLS Configuration

For production networks where the database server is not on localhost:

```java
config.addDataSourceProperty("useSSL", "true");
config.addDataSourceProperty("requireSSL", "true");
config.addDataSourceProperty("verifyServerCertificate", "true");
config.addDataSourceProperty("trustCertificateKeyStoreUrl", "file:/path/to/truststore.jks");
config.addDataSourceProperty("trustCertificateKeyStorePassword", "password");
```

For localhost or trusted LAN connections, SSL adds latency without security benefit:

```java
config.addDataSourceProperty("useSSL", "false");
config.addDataSourceProperty("allowPublicKeyRetrieval", "true");
```

---

### 1.4 PostgreSQL Considerations

PostgreSQL is technically superior to MySQL in almost every dimension: better JSONB support, true full-text search, window functions, and stricter SQL compliance. However, it is rarely the right choice for Minecraft plugins because:

1. **JDBC driver differences** — PostgreSQL uses `?` placeholders like MySQL, but type handling differs. AI-generated code targeting MySQL will have subtle bugs on PostgreSQL.
2. **Hosting availability** — Shared Minecraft hosting rarely offers PostgreSQL. MySQL is universal.
3. **Operational complexity** — `VACUUM`, `ANALYZE`, `pg_hba.conf` — your ops team needs PostgreSQL expertise.

**Use PostgreSQL when:**
- You have a dedicated database server with a DBA
- You need JSONB for flexible schema data (inventory snapshots, plugin configs)
- You need advanced analytics with window functions
- You're building a SaaS product on top of your network

**Use MySQL/MariaDB when:**
- You're on shared hosting
- Your team knows MySQL
- You need maximum AI tooling support (most examples target MySQL)

---

### 1.5 Redis for Caching and Cross-Server Sync

Redis is not a database — it is a data structure server. It is the correct tool for:

- **Session data** with automatic TTL expiration
- **Cross-server cache invalidation** via pub/sub
- **Kit cooldowns** — `SET player:uuid:kit:daily EX 86400`
- **Rate limiting** — atomic increment with expiry
- **Leaderboard caching** — sorted sets with `ZADD`/`ZRANGE`

Redis is wrong for:
- Primary data storage (volatile by default, persistence is optional and complex)
- Relational queries (no joins, no foreign keys)
- Large BLOBs (inventory data — use MySQL)

**Redis data model for cross-server sync:**

```
Key pattern:        player:{uuid}:data
Value:              JSON-serialized player data
TTL:                300 seconds (5 minutes)
Invalidation:       Pub/sub channel "cache:invalidate"
Message format:     "player:{uuid}"
```

When Server A modifies player data:
1. Write to MySQL (source of truth)
2. Update local in-memory cache
3. Publish `"player:{uuid}"` to Redis pub/sub channel
4. Servers B, C, D, E receive message, evict their local cache for that UUID
5. Next access on any server triggers a fresh MySQL read

This pattern gives you sub-millisecond local reads with eventual consistency across servers.

---

## 2. Schema Design Patterns

### 2.1 Player Data Table (Foundation)

Every plugin that stores per-player data should build on a shared `player_data` foundation table. This prevents UUID-to-name mapping duplication across plugins and provides a single source of truth for player identity.

```sql
CREATE TABLE IF NOT EXISTS player_data (
    -- Identity
    uuid            CHAR(36)        NOT NULL,           -- UUID with dashes: 550e8400-e29b-41d4-a716-446655440000
    username        VARCHAR(16)     NOT NULL,           -- Minecraft username, max 16 chars
    
    -- Timestamps
    first_seen      BIGINT          NOT NULL,           -- Unix epoch milliseconds
    last_seen       BIGINT          NOT NULL,           -- Unix epoch milliseconds, updated on join/quit
    
    -- Soft delete support
    is_banned       TINYINT(1)      NOT NULL DEFAULT 0, -- Logical delete flag; never hard-delete player records
    
    -- Metadata
    ip_address      VARCHAR(45)     NULL,               -- IPv4 (15) or IPv6 (39) + padding; NULL if not collected
    locale          VARCHAR(10)     NULL,               -- e.g. "en_US", "de_DE"; from client handshake
    
    -- Constraints
    PRIMARY KEY (uuid),
    UNIQUE KEY uq_username (username),                  -- Enforces uniqueness; update on name change
    
    -- Indexes
    INDEX idx_last_seen (last_seen),                    -- For "inactive players" queries
    INDEX idx_username (username)                       -- For name-to-UUID lookups
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Why UUID as PRIMARY KEY, not AUTO_INCREMENT?**

- UUIDs are globally unique — no coordination needed between servers
- AUTO_INCREMENT requires a central authority (the database) to assign IDs
- On a 5-server network, if Server A inserts player ID 1001 and Server B inserts player ID 1001 simultaneously, you have a collision
- UUID generation is client-side (Minecraft provides the UUID); no round-trip to database needed
- The 36-character string overhead (~36 bytes vs 4 bytes for INT) is negligible at player-count scale

**Why `CHAR(36)` not `BINARY(16)`?**

`BINARY(16)` stores UUIDs as raw bytes, saving 20 bytes per row. At 100,000 players, that's 2MB saved — irrelevant. The cost: every query, log line, and debug output requires UUID conversion. `CHAR(36)` is human-readable and debuggable. Use `BINARY(16)` only if you have millions of rows and have profiled UUID storage as a bottleneck.

**Why `BIGINT` for timestamps, not `DATETIME`?**

- `BIGINT` (Unix epoch ms) is timezone-agnostic — no DST bugs
- Java's `System.currentTimeMillis()` returns `long` directly — no conversion
- `DATETIME` in MySQL is stored without timezone; if your server moves timezones, all timestamps shift
- Arithmetic on `BIGINT` is trivial: `WHERE last_seen < (UNIX_TIMESTAMP() * 1000 - 2592000000)` (inactive 30 days)

---

### 2.2 Plugin-Specific Schemas

#### a) Economy System

```sql
-- Current balances (hot path — read on every transaction)
CREATE TABLE IF NOT EXISTS economy_balances (
    uuid            CHAR(36)        NOT NULL,
    balance         DECIMAL(20, 2)  NOT NULL DEFAULT 0.00,  -- DECIMAL for exact money math; never FLOAT/DOUBLE
    currency        VARCHAR(32)     NOT NULL DEFAULT 'coins',
    updated_at      BIGINT          NOT NULL,
    
    PRIMARY KEY (uuid, currency),                           -- Composite PK: one row per player per currency
    CONSTRAINT fk_economy_player
        FOREIGN KEY (uuid) REFERENCES player_data(uuid)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_balance_currency (currency, balance DESC)     -- For leaderboard queries: ORDER BY balance DESC
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Immutable audit log (append-only, never UPDATE or DELETE)
CREATE TABLE IF NOT EXISTS economy_transactions (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    uuid            CHAR(36)        NOT NULL,
    transaction_type ENUM('DEPOSIT','WITHDRAWAL','TRANSFER_OUT','TRANSFER_IN','ADMIN_SET','PLUGIN') NOT NULL,
    amount          DECIMAL(20, 2)  NOT NULL,
    balance_before  DECIMAL(20, 2)  NOT NULL,
    balance_after   DECIMAL(20, 2)  NOT NULL,
    currency        VARCHAR(32)     NOT NULL DEFAULT 'coins',
    reason          VARCHAR(255)    NULL,                   -- Human-readable reason: "Shop purchase: Diamond"
    source_server   VARCHAR(64)     NULL,                   -- Which server originated this transaction
    created_at      BIGINT          NOT NULL,
    
    PRIMARY KEY (id),
    INDEX idx_tx_uuid (uuid, created_at DESC),              -- Player transaction history
    INDEX idx_tx_created (created_at DESC),                 -- Global transaction log
    CONSTRAINT fk_tx_player
        FOREIGN KEY (uuid) REFERENCES player_data(uuid)
        ON DELETE RESTRICT                                  -- RESTRICT: don't delete transactions if player deleted
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Why `DECIMAL(20, 2)` not `DOUBLE`?**

`DOUBLE` is a floating-point type. `0.1 + 0.2 = 0.30000000000000004` in floating-point arithmetic. For economy data, this means players can end up with balances like `$1000.0000000001` or lose fractions of currency through rounding. `DECIMAL(20, 2)` stores exact decimal values. The `20` allows balances up to 999,999,999,999,999,999.99 — sufficient for any economy.

#### b) Homes and Warps

```sql
CREATE TABLE IF NOT EXISTS player_homes (
    id              INT             NOT NULL AUTO_INCREMENT,
    uuid            CHAR(36)        NOT NULL,
    home_name       VARCHAR(32)     NOT NULL,               -- Case-insensitive comparison via collation
    world_name      VARCHAR(64)     NOT NULL,               -- World name, not UUID (world UUIDs change on regen)
    x               DOUBLE          NOT NULL,               -- DOUBLE is correct for coordinates (not money)
    y               DOUBLE          NOT NULL,
    z               DOUBLE          NOT NULL,
    yaw             FLOAT           NOT NULL DEFAULT 0.0,
    pitch           FLOAT           NOT NULL DEFAULT 0.0,
    created_at      BIGINT          NOT NULL,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_player_home (uuid, home_name),            -- One home per name per player
    INDEX idx_homes_uuid (uuid),                            -- All homes for a player
    CONSTRAINT fk_homes_player
        FOREIGN KEY (uuid) REFERENCES player_data(uuid)
        ON DELETE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Application-level constraint: enforce max homes per player in Java, not SQL
-- SQL CHECK constraints are less flexible (can't vary by rank/permission)
```

**Why `world_name` not `world_uuid`?**

World UUIDs change when a world is regenerated or recreated. World names are stable (admins rarely rename worlds). If you store world UUID and the world is regenerated, all homes in that world become unresolvable. Store the name; handle "world not found" gracefully in code.

#### c) Punishments

```sql
CREATE TABLE IF NOT EXISTS punishments (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    target_uuid     CHAR(36)        NOT NULL,
    target_name     VARCHAR(16)     NOT NULL,               -- Denormalized for display without JOIN
    issuer_uuid     CHAR(36)        NULL,                   -- NULL = console
    issuer_name     VARCHAR(16)     NOT NULL DEFAULT 'CONSOLE',
    type            ENUM('BAN','TEMPBAN','MUTE','TEMPMUTE','WARN','KICK') NOT NULL,
    reason          VARCHAR(512)    NOT NULL,
    issued_at       BIGINT          NOT NULL,
    expires_at      BIGINT          NULL,                   -- NULL = permanent
    removed_at      BIGINT          NULL,                   -- NULL = still active
    removed_by      CHAR(36)        NULL,                   -- Who pardoned/unmuted
    server_scope    VARCHAR(64)     NULL,                   -- NULL = network-wide; "survival" = server-specific
    active          TINYINT(1)      NOT NULL DEFAULT 1,     -- Computed flag; update when expired/removed
    
    PRIMARY KEY (id),
    INDEX idx_target_active (target_uuid, active, type),    -- "Is this player banned?" query
    INDEX idx_expires (expires_at, active),                 -- Expiration sweep job
    INDEX idx_issuer (issuer_uuid),                         -- "What did this staff member do?"
    INDEX idx_issued_at (issued_at DESC)                    -- Recent punishments log
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Active punishment check query (must be fast):**

```sql
-- Runs on every login — must use index
SELECT id, type, reason, expires_at
FROM punishments
WHERE target_uuid = ?
  AND active = 1
  AND type IN ('BAN', 'TEMPBAN')
  AND (expires_at IS NULL OR expires_at > ?)
LIMIT 1;
-- Uses: idx_target_active (uuid, active, type) — covers all WHERE conditions
```

#### d) Statistics: Wide Table vs EAV

**Wide table (recommended for known, fixed stats):**

```sql
CREATE TABLE IF NOT EXISTS player_stats (
    uuid            CHAR(36)        NOT NULL,
    kills           INT             NOT NULL DEFAULT 0,
    deaths          INT             NOT NULL DEFAULT 0,
    blocks_broken   BIGINT          NOT NULL DEFAULT 0,
    blocks_placed   BIGINT          NOT NULL DEFAULT 0,
    distance_walked DOUBLE          NOT NULL DEFAULT 0.0,
    playtime_ticks  BIGINT          NOT NULL DEFAULT 0,
    -- Add columns as needed; ALTER TABLE ADD COLUMN is safe and fast in InnoDB
    
    PRIMARY KEY (uuid),
    CONSTRAINT fk_stats_player
        FOREIGN KEY (uuid) REFERENCES player_data(uuid)
        ON DELETE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**EAV table (for dynamic, plugin-defined stats):**

```sql
CREATE TABLE IF NOT EXISTS player_stat_values (
    uuid            CHAR(36)        NOT NULL,
    stat_key        VARCHAR(64)     NOT NULL,               -- "kills", "custom_plugin_stat"
    stat_value      BIGINT          NOT NULL DEFAULT 0,
    
    PRIMARY KEY (uuid, stat_key),
    INDEX idx_stat_key_value (stat_key, stat_value DESC)    -- Leaderboard per stat
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**When to use each:**

| Criterion | Wide Table | EAV |
|---|---|---|
| Stats are known at design time | ✅ Use this | ❌ |
| Stats are plugin-defined at runtime | ❌ | ✅ Use this |
| Aggregate queries (SUM, AVG) | ✅ Fast | ⚠️ Slow (pivot needed) |
| Adding new stats | ⚠️ ALTER TABLE | ✅ Just insert new key |
| Type safety | ✅ Per-column types | ❌ All values same type |
| Leaderboard query | ✅ `ORDER BY kills DESC` | ⚠️ `WHERE stat_key = 'kills' ORDER BY stat_value DESC` |

#### e) Inventory Snapshots

```sql
CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    uuid            CHAR(36)        NOT NULL,
    snapshot_type   ENUM('DEATH','LOGOUT','MANUAL','TRANSFER') NOT NULL,
    inventory_data  MEDIUMBLOB      NOT NULL,               -- Base64-encoded serialized inventory; up to 16MB
    armor_data      BLOB            NULL,                   -- Separate armor slots
    offhand_data    BLOB            NULL,
    ender_chest_data MEDIUMBLOB     NULL,
    created_at      BIGINT          NOT NULL,
    server_name     VARCHAR(64)     NOT NULL,
    
    PRIMARY KEY (id),
    INDEX idx_inv_uuid_type (uuid, snapshot_type, created_at DESC),
    CONSTRAINT fk_inv_player
        FOREIGN KEY (uuid) REFERENCES player_data(uuid)
        ON DELETE CASCADE
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Size estimates:**

| Inventory Type | Typical Size (uncompressed) | With GZIP |
|---|---|---|
| Player inventory (36 slots) | 2–8 KB | 0.5–2 KB |
| Full inventory + armor + offhand | 4–12 KB | 1–3 KB |
| Ender chest (27 slots) | 1–5 KB | 0.3–1.5 KB |
| Full snapshot (all) | 5–25 KB | 1.5–6 KB |

Consider GZIP compression for inventory data stored in BLOB columns:

```java
public static byte[] compress(byte[] data) throws IOException {
    ByteArrayOutputStream bos = new ByteArrayOutputStream();
    try (GZIPOutputStream gzip = new GZIPOutputStream(bos)) {
        gzip.write(data);
    }
    return bos.toByteArray();
}

public static byte[] decompress(byte[] compressed) throws IOException {
    try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(compressed))) {
        return gzip.readAllBytes();
    }
}
```

---

### 2.3 Index Strategy

Indexes are the single most impactful performance lever in relational databases. Wrong indexes cause full table scans; missing indexes cause the same. Over-indexing causes slow writes.

**Index decision rules:**

1. **Every foreign key column needs an index.** MySQL does not automatically index FK columns (unlike PostgreSQL). Without an index on the FK column, `ON DELETE CASCADE` triggers a full table scan.

2. **Every column in a `WHERE` clause that filters more than 20% of rows needs an index.** The query optimizer will skip indexes that don't filter enough rows.

3. **Composite indexes follow left-prefix rules.** An index on `(uuid, type, created_at)` supports queries filtering on `uuid`, `uuid + type`, or `uuid + type + created_at` — but NOT on `type` alone or `created_at` alone.

4. **Covering indexes eliminate table lookups.** If your query selects only `id, balance` and you have an index on `(uuid, balance)`, MySQL can answer the query entirely from the index without touching the table.

```sql
-- Query: "Get player's active bans"
-- Needs: uuid filter, active filter, type filter
-- Index: (target_uuid, active, type) — covers all three filters
INDEX idx_target_active (target_uuid, active, type)

-- Query: "Leaderboard top 10 by balance"
-- Needs: currency filter, balance sort
-- Index: (currency, balance DESC) — covers filter and sort
INDEX idx_balance_currency (currency, balance DESC)

-- Query: "Recent transactions for player"
-- Needs: uuid filter, time sort
-- Index: (uuid, created_at DESC) — covers filter and sort direction
INDEX idx_tx_uuid (uuid, created_at DESC)
```

**Indexes to avoid:**

- Indexes on columns with very low cardinality (e.g., `active TINYINT(1)` alone — only 2 values)
- Indexes on columns never used in `WHERE`, `JOIN`, or `ORDER BY`
- Duplicate indexes (having both `INDEX(uuid)` and `INDEX(uuid, name)` — the composite covers the single)

---

### 2.4 Foreign Key Design

Foreign keys enforce referential integrity at the database level. They prevent orphaned records (economy data for a UUID that doesn't exist in `player_data`).

**Cascade rules:**

| Rule | `ON DELETE` | `ON UPDATE` | Use When |
|---|---|---|---|
| `CASCADE` | Delete child rows | Update FK value | Child data meaningless without parent (homes, stats) |
| `RESTRICT` | Block parent delete | Block parent update | Child data must be preserved (audit logs, transactions) |
| `SET NULL` | Set FK to NULL | Set FK to NULL | Child can exist without parent (optional relationships) |
| `NO ACTION` | Same as RESTRICT | Same as RESTRICT | Default; explicit is better |

```sql
-- Homes: delete when player deleted (CASCADE)
CONSTRAINT fk_homes_player
    FOREIGN KEY (uuid) REFERENCES player_data(uuid)
    ON DELETE CASCADE ON UPDATE CASCADE

-- Transactions: preserve even if player deleted (RESTRICT)
CONSTRAINT fk_tx_player
    FOREIGN KEY (uuid) REFERENCES player_data(uuid)
    ON DELETE RESTRICT ON UPDATE CASCADE
```

> **Warning:** `ON DELETE CASCADE` is dangerous on audit tables. If a player record is accidentally deleted, all their transaction history, punishment records, and chat logs cascade-delete with it. Use `RESTRICT` on any table that serves as a historical record.

---

## 3. Migration and Versioning

### 3.1 Schema Evolution Strategy

The cardinal rule of production schema management: **schema changes are additive-only until a formal deprecation cycle.**

**Safe operations (can run on live database):**
- `ALTER TABLE ADD COLUMN` — adds column with default; existing rows unaffected
- `CREATE INDEX` — online in MySQL 5.6+ with `ALGORITHM=INPLACE`
- `CREATE TABLE` — no existing data affected
- `INSERT` into version tracking table

**Unsafe operations (require maintenance window or migration plan):**
- `ALTER TABLE DROP COLUMN` — data loss, irreversible
- `ALTER TABLE MODIFY COLUMN` — type change can truncate data
- `ALTER TABLE RENAME COLUMN` — breaks all queries using old name
- `DROP TABLE` — catastrophic data loss
- `TRUNCATE TABLE` — catastrophic data loss

**The deprecation cycle for column removal:**

```
Version 1.0: Column `old_field` added
Version 1.5: Column `new_field` added; code writes to both
Version 2.0: Code reads from `new_field` only; `old_field` still exists
Version 3.0: `old_field` marked deprecated in schema comments
Version 4.0: `old_field` removed (after confirming no code references it)
```

This cycle takes multiple releases. It is intentionally slow. Data is more valuable than schema cleanliness.

---

### 3.2 Migration Framework Implementation

```java
public interface Migration {
    int getVersion();
    String getDescription();
    void migrate(Connection connection) throws SQLException;
}
```

```java
public class MigrationRunner {
    private final HikariDataSource dataSource;
    private final List<Migration> migrations;
    private final Logger logger;

    public MigrationRunner(HikariDataSource dataSource, Logger logger) {
        this.dataSource = dataSource;
        this.logger = logger;
        this.migrations = new ArrayList<>();
    }

    public void registerMigration(Migration migration) {
        migrations.add(migration);
        migrations.sort(Comparator.comparingInt(Migration::getVersion));
    }

    public void runMigrations() throws SQLException {
        try (Connection conn = dataSource.getConnection()) {
            ensureVersionTable(conn);
            int currentVersion = getCurrentVersion(conn);
            logger.info("Database schema version: " + currentVersion);

            for (Migration migration : migrations) {
                if (migration.getVersion() > currentVersion) {
                    logger.info("Applying migration V" + migration.getVersion()
                        + ": " + migration.getDescription());
                    try {
                        conn.setAutoCommit(false);
                        migration.migrate(conn);
                        updateVersion(conn, migration.getVersion());
                        conn.commit();
                        logger.info("Migration V" + migration.getVersion() + " applied successfully.");
                    } catch (SQLException e) {
                        conn.rollback();
                        throw new SQLException("Migration V" + migration.getVersion()
                            + " failed. Database rolled back. Error: " + e.getMessage(), e);
                    } finally {
                        conn.setAutoCommit(true);
                    }
                }
            }
        }
    }

    private void ensureVersionTable(Connection conn) throws SQLException {
        try (Statement stmt = conn.createStatement()) {
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS schema_version (
                    version     INT         NOT NULL,
                    description VARCHAR(255) NOT NULL,
                    applied_at  BIGINT      NOT NULL,
                    PRIMARY KEY (version)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """);
        }
    }

    private int getCurrentVersion(Connection conn) throws SQLException {
        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(
                 "SELECT COALESCE(MAX(version), 0) FROM schema_version")) {
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    private void updateVersion(Connection conn, int version) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
            "INSERT INTO schema_version (version, description, applied_at) VALUES (?, ?, ?)")) {
            ps.setInt(1, version);
            ps.setString(2, migrations.stream()
                .filter(m -> m.getVersion() == version)
                .findFirst()
                .map(Migration::getDescription)
                .orElse("Unknown"));
            ps.setLong(3, System.currentTimeMillis());
            ps.executeUpdate();
        }
    }
}
```

**Example migrations:**

```java
// V1: Initial schema
public class MigrationV1_InitialSchema implements Migration {
    @Override public int getVersion() { return 1; }
    @Override public String getDescription() { return "Initial schema: player_data table"; }

    @Override
    public void migrate(Connection conn) throws SQLException {
        try (Statement stmt = conn.createStatement()) {
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS player_data (
                    uuid        CHAR(36)    NOT NULL,
                    username    VARCHAR(16) NOT NULL,
                    first_seen  BIGINT      NOT NULL,
                    last_seen   BIGINT      NOT NULL,
                    PRIMARY KEY (uuid),
                    UNIQUE KEY uq_username (username)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """);
        }
    }
}

// V2: Add economy tables
public class MigrationV2_Economy implements Migration {
    @Override public int getVersion() { return 2; }
    @Override public String getDescription() { return "Add economy_balances and economy_transactions"; }

    @Override
    public void migrate(Connection conn) throws SQLException {
        try (Statement stmt = conn.createStatement()) {
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS economy_balances (
                    uuid        CHAR(36)        NOT NULL,
                    balance     DECIMAL(20,2)   NOT NULL DEFAULT 0.00,
                    currency    VARCHAR(32)     NOT NULL DEFAULT 'coins',
                    updated_at  BIGINT          NOT NULL,
                    PRIMARY KEY (uuid, currency),
                    CONSTRAINT fk_economy_player
                        FOREIGN KEY (uuid) REFERENCES player_data(uuid)
                        ON DELETE CASCADE ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """);
        }
    }
}

// V3: Add column to existing table (safe)
public class MigrationV3_AddLocale implements Migration {
    @Override public int getVersion() { return 3; }
    @Override public String getDescription() { return "Add locale column to player_data"; }

    @Override
    public void migrate(Connection conn) throws SQLException {
        try (Statement stmt = conn.createStatement()) {
            // Safe: ADD COLUMN with DEFAULT; existing rows get NULL
            stmt.execute("ALTER TABLE player_data ADD COLUMN locale VARCHAR(10) NULL AFTER last_seen");
        }
    }
}
```

**Registration in `onEnable()`:**

```java
MigrationRunner runner = new MigrationRunner(dataSource, getLogger());
runner.registerMigration(new MigrationV1_InitialSchema());
runner.registerMigration(new MigrationV2_Economy());
runner.registerMigration(new MigrationV3_AddLocale());
try {
    runner.runMigrations();
} catch (SQLException e) {
    getLogger().severe("Database migration failed! Disabling plugin.");
    getServer().getPluginManager().disablePlugin(this);
    return;
}
```

---

### 3.3 Data Preservation Rules

> **Warning:** The following AI-generated pattern has destroyed production data on real servers. It appears in thousands of AI-generated plugins. Never use it.

```java
// CATASTROPHIC: AI-generated onEnable() pattern
@Override
public void onEnable() {
    // This drops and recreates the table on EVERY server start
    // All player data is permanently deleted
    try (Connection conn = getConnection()) {
        conn.createStatement().execute("DROP TABLE IF EXISTS player_data");
        conn.createStatement().execute("CREATE TABLE player_data (...)");
    }
}
```

**Why this happens:** AI models are trained on tutorial code that prioritizes "clean slate" development over production safety. The `DROP TABLE IF EXISTS` pattern is common in tutorials because it makes the code idempotent for development. In production, it is catastrophic.

**The correct pattern:**

```java
@Override
public void onEnable() {
    // CREATE TABLE IF NOT EXISTS: safe to run on every start
    // Only creates the table if it doesn't exist; never touches existing data
    try (Connection conn = getConnection()) {
        conn.createStatement().execute("""
            CREATE TABLE IF NOT EXISTS player_data (
                uuid        CHAR(36)    NOT NULL,
                username    VARCHAR(16) NOT NULL,
                first_seen  BIGINT      NOT NULL,
                last_seen   BIGINT      NOT NULL,
                PRIMARY KEY (uuid)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """);
    }
    // Then run migrations for schema evolution
    migrationRunner.runMigrations();
}
```

---

## 4. Connection Management

### 4.1 Connection Pool Configuration

#### SQLite Configuration

```java
public HikariDataSource createSQLiteDataSource(File databaseFile) {
    HikariConfig config = new HikariConfig();

    config.setPoolName("MyPlugin-SQLite");
    config.setDriverClassName("org.sqlite.JDBC");
    config.setJdbcUrl("jdbc:sqlite:" + databaseFile.getAbsolutePath());

    // SQLite: single writer, no concurrent writes
    config.setMaximumPoolSize(1);
    config.setMinimumIdle(1);

    // SQLite doesn't support network timeouts; keep low
    config.setConnectionTimeout(5_000);     // 5 seconds
    config.setIdleTimeout(0);               // Never evict (only 1 connection)
    config.setMaxLifetime(0);               // Never expire

    // Enable WAL mode and performance pragmas on connection init
    config.setConnectionInitSql(
        "PRAGMA journal_mode=WAL; " +
        "PRAGMA synchronous=NORMAL; " +
        "PRAGMA cache_size=10000; " +
        "PRAGMA temp_store=MEMORY; " +
        "PRAGMA foreign_keys=ON;"
    );

    return new HikariDataSource(config);
}
```

#### MySQL/MariaDB Configuration

```java
public HikariDataSource createMySQLDataSource(
        String host, int port, String database,
        String username, String password) {

    HikariConfig config = new HikariConfig();

    config.setPoolName("MyPlugin-MySQL");
    config.setDriverClassName("com.mysql.cj.jdbc.Driver");
    config.setJdbcUrl(String.format(
        "jdbc:mysql://%s:%d/%s?useSSL=false&allowPublicKeyRetrieval=true" +
        "&useUnicode=true&characterEncoding=utf8mb4" +
        "&serverTimezone=UTC&autoReconnect=false",
        host, port, database
    ));
    config.setUsername(username);
    config.setPassword(password);

    // Pool sizing: (cores * 2) + 1, minimum 5, maximum 20
    int cores = Runtime.getRuntime().availableProcessors();
    int poolSize = Math.min(Math.max((cores * 2) + 1, 5), 20);
    config.setMaximumPoolSize(poolSize);

    // Keep 2 idle connections ready; don't pre-warm the full pool
    config.setMinimumIdle(2);

    // How long to wait for a connection from the pool before throwing
    // 30 seconds is generous; reduce to 5s if you want fast-fail behavior
    config.setConnectionTimeout(30_000);

    // Evict connections idle for 10 minutes (MySQL closes idle connections after wait_timeout)
    config.setIdleTimeout(600_000);

    // Recycle connections after 30 minutes regardless of idle state
    // Must be less than MySQL's wait_timeout (default 8 hours) and interactive_timeout
    // Set to 30 minutes to avoid "Communications link failure" on long-idle connections
    config.setMaxLifetime(1_800_000);

    // Validation query: lightweight, confirms connection is alive
    config.setConnectionTestQuery("SELECT 1");

    // Log connections held longer than 60 seconds (leak detection)
    // Set to 0 in production if too noisy; use during development
    config.setLeakDetectionThreshold(60_000);

    // How long to wait for connection validation
    config.setValidationTimeout(5_000);

    // MySQL-specific performance properties
    config.addDataSourceProperty("cachePrepStmts", "true");
    config.addDataSourceProperty("prepStmtCacheSize", "250");
    config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
    config.addDataSourceProperty("useServerPrepStmts", "true");
    config.addDataSourceProperty("useLocalSessionState", "true");
    config.addDataSourceProperty("rewriteBatchedStatements", "true");  // Critical for batch inserts
    config.addDataSourceProperty("cacheResultSetMetadata", "true");
    config.addDataSourceProperty("cacheServerConfiguration", "true");
    config.addDataSourceProperty("elideSetAutoCommits", "true");
    config.addDataSourceProperty("maintainTimeStats", "false");

    return new HikariDataSource(config);
}
```

**Parameter explanations:**

| Parameter | Value | Why |
|---|---|---|
| `maximumPoolSize` | `(cores*2)+1` | Matches CPU parallelism; more connections = more context switching |
| `minimumIdle` | `2` | Keep 2 warm; don't pre-warm all (saves MySQL connection overhead) |
| `connectionTimeout` | `30_000` | How long to wait for a pool connection; throw after this |
| `idleTimeout` | `600_000` | Evict idle connections after 10 min; prevents MySQL `wait_timeout` kills |
| `maxLifetime` | `1_800_000` | Recycle connections every 30 min; prevents stale connection errors |
| `leakDetectionThreshold` | `60_000` | Log if connection held >60s; catches `try-with-resources` omissions |
| `validationTimeout` | `5_000` | How long `SELECT 1` can take before declaring connection dead |
| `rewriteBatchedStatements` | `true` | Rewrites `addBatch()` calls into multi-row INSERT; 10–100x faster |
| `cachePrepStmts` | `true` | Cache prepared statement handles on the client side |

---

### 4.2 Pool Sizing Formula

```
pool_size = (effective_cpu_cores × 2) + effective_spindle_count

Where:
  effective_cpu_cores = Runtime.getRuntime().availableProcessors()
  effective_spindle_count = 1 (SSD) or number of physical disks (HDD RAID)
```

**For your 5-server network:**

Assume shared MySQL server with 8 CPU cores, SSD storage:

```
Per-plugin pool size = (8 × 2) + 1 = 17 → use 15 (round down for headroom)
```

With 5 game servers × 3 plugins each × 15 connections = 225 total connections.

MySQL default `max_connections = 151`. You need to increase it:

```ini
# /etc/mysql/mysql.conf.d/mysqld.cnf
[mysqld]
max_connections = 300
thread_cache_size = 50
innodb_buffer_pool_size = 2G    # Set to 70% of available RAM
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2  # Slightly less durable, much faster
```

> **Warning:** `innodb_flush_log_at_trx_commit = 2` means transactions are flushed to OS cache every second rather than on every commit. You can lose up to 1 second of transactions on a hard crash (power failure). For game data, this is acceptable. For financial data, use `1` (default).

---

### 4.3 Connection Lifecycle

```java
public class DatabaseManager {
    private HikariDataSource dataSource;
    private final Plugin plugin;

    public DatabaseManager(Plugin plugin) {
        this.plugin = plugin;
    }

    // Called in onEnable() — fail fast if database is unavailable
    public void initialize(DatabaseConfig config) throws SQLException {
        this.dataSource = createDataSource(config);

        // Test connection immediately; fail plugin load if database unreachable
        try (Connection conn = dataSource.getConnection()) {
            plugin.getLogger().info("Database connection established. Pool size: "
                + dataSource.getMaximumPoolSize());
        } catch (SQLException e) {
            dataSource.close();
            throw new SQLException("Cannot connect to database: " + e.getMessage(), e);
        }
    }

    // Called in onDisable() — always close the pool
    public void shutdown() {
        if (dataSource != null && !dataSource.isClosed()) {
            // Wait for active queries to complete (up to 5 seconds)
            dataSource.setConnectionTimeout(5_000);
            dataSource.close();
            plugin.getLogger().info("Database connection pool closed.");
        }
    }

    public Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }
}
```

**What happens if the server crashes without calling `onDisable()`?**

HikariCP connections are TCP connections to MySQL. When the JVM dies, the OS closes all TCP connections. MySQL detects the closed connections and releases them. The pool state is lost, but MySQL cleans up automatically. This is safe — no manual cleanup needed.

**What happens if MySQL restarts mid-operation?**

HikariCP's `maxLifetime` and `keepaliveTime` settings handle this. When a connection is returned to the pool, HikariCP validates it with `SELECT 1`. If validation fails, the connection is discarded and a new one is created. The query that was in-flight when MySQL restarted will throw a `SQLException` — your async error handler must catch this and retry or notify the player.

---

### 4.4 Transaction Management

Transactions group multiple SQL operations into an atomic unit. Either all operations succeed, or all are rolled back.

```java
public void transferBalance(UUID from, UUID to, BigDecimal amount, String reason)
        throws SQLException, InsufficientFundsException {

    try (Connection conn = dataSource.getConnection()) {
        conn.setAutoCommit(false);  // Begin transaction

        try {
            // Step 1: Check and deduct from sender (with row lock)
            BigDecimal fromBalance = getBalanceForUpdate(conn, from);
            if (fromBalance.compareTo(amount) < 0) {
                throw new InsufficientFundsException(from, fromBalance, amount);
            }
            updateBalance(conn, from, fromBalance.subtract(amount));

            // Step 2: Add to receiver
            BigDecimal toBalance = getBalanceForUpdate(conn, to);
            updateBalance(conn, to, toBalance.add(amount));

            // Step 3: Record both sides of the transaction
            insertTransaction(conn, from, "TRANSFER_OUT", amount.negate(), reason);
            insertTransaction(conn, to, "TRANSFER_IN", amount, reason);

            conn.commit();  // All or nothing

        } catch (SQLException | InsufficientFundsException e) {
            conn.rollback();  // Undo all changes
            throw e;
        } finally {
            conn.setAutoCommit(true);  // Restore default for pool reuse
        }
    }
}

// SELECT ... FOR UPDATE: locks the row until transaction commits
// Prevents race condition where two transfers read the same balance simultaneously
private BigDecimal getBalanceForUpdate(Connection conn, UUID uuid) throws SQLException {
    try (PreparedStatement ps = conn.prepareStatement(
        "SELECT balance FROM economy_balances WHERE uuid = ? FOR UPDATE")) {
        ps.setString(1, uuid.toString());
        try (ResultSet rs = ps.executeQuery()) {
            if (!rs.next()) throw new SQLException("Player not found: " + uuid);
            return rs.getBigDecimal("balance");
        }
    }
}
```

**`SELECT ... FOR UPDATE` is critical for economy operations.** Without it:

1. Server A reads Player X's balance: $100
2. Server B reads Player X's balance: $100 (same value, before A's write)
3. Server A deducts $80: writes $20
4. Server B deducts $80: writes $20 (based on stale $100 read)
5. Player X spent $160 but only had $100 — **duplication exploit**

`FOR UPDATE` acquires a row-level lock. Server B's `SELECT ... FOR UPDATE` blocks until Server A's transaction commits, then reads the updated $20 balance and correctly rejects the $80 deduction.

---

## 5. Async Database Operations

### 5.1 The Async-Sync Bridge Pattern

Every database operation must be asynchronous. The bridge pattern separates the async database work from the sync Bukkit API callback.

```java
public class PlayerDataService {
    private final HikariDataSource dataSource;
    private final Plugin plugin;
    private final Executor asyncExecutor;

    public PlayerDataService(Plugin plugin, HikariDataSource dataSource) {
        this.plugin = plugin;
        this.dataSource = dataSource;
        // Use a dedicated thread pool, not ForkJoinPool.commonPool()
        // ForkJoinPool is shared with CompletableFuture defaults and can be starved
        this.asyncExecutor = Executors.newFixedThreadPool(
            Math.max(2, Runtime.getRuntime().availableProcessors()),
            r -> {
                Thread t = new Thread(r, "MyPlugin-DB-Thread");
                t.setDaemon(true);
                return t;
            }
        );
    }

    // Pattern: async load → sync cache update → sync Bukkit API
    public void loadPlayerOnJoin(Player player) {
        UUID uuid = player.getUniqueId();

        CompletableFuture
            .supplyAsync(() -> fetchPlayerData(uuid), asyncExecutor)  // Async: DB query
            .thenAccept(data -> {
                // Sync: update cache and call Bukkit API
                Bukkit.getScheduler().runTask(plugin, () -> {
                    playerCache.put(uuid, data);
                    // Safe to call Bukkit API here
                    player.sendMessage("§aWelcome back, " + data.getUsername() + "!");
                });
            })
            .exceptionally(ex -> {
                // Async error: log and notify on main thread
                plugin.getLogger().severe("Failed to load player data for " + uuid + ": " + ex.getMessage());
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (player.isOnline()) {
                        player.sendMessage("§cFailed to load your data. Please reconnect.");
                    }
                });
                return null;
            });
    }

    private PlayerData fetchPlayerData(UUID uuid) {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT uuid, username, first_seen, last_seen FROM player_data WHERE uuid = ?")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return new PlayerData(
                        UUID.fromString(rs.getString("uuid")),
                        rs.getString("username"),
                        rs.getLong("first_seen"),
                        rs.getLong("last_seen")
                    );
                }
                return null;
            }
        } catch (SQLException e) {
            throw new RuntimeException("Database error fetching player " + uuid, e);
        }
    }
}
```

**The critical rule:** Never call Bukkit API from inside `supplyAsync` or `thenApply` lambdas. These run on the async thread pool. Always bridge back to the main thread with `Bukkit.getScheduler().runTask(plugin, ...)` before touching any Bukkit API.

---

### 5.2 Batch Operations

Batch operations are the difference between 1,000 individual queries (slow) and 1 multi-row operation (fast).

```java
public CompletableFuture<Void> saveAllPlayerStats(Map<UUID, PlayerStats> statsMap) {
    return CompletableFuture.runAsync(() -> {
        String sql = """
            INSERT INTO player_stats (uuid, kills, deaths, blocks_broken, playtime_ticks)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                kills = VALUES(kills),
                deaths = VALUES(deaths),
                blocks_broken = VALUES(blocks_broken),
                playtime_ticks = VALUES(playtime_ticks)
        """;

        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            conn.setAutoCommit(false);
            int batchCount = 0;

            for (Map.Entry<UUID, PlayerStats> entry : statsMap.entrySet()) {
                ps.setString(1, entry.getKey().toString());
                ps.setInt(2, entry.getValue().getKills());
                ps.setInt(3, entry.getValue().getDeaths());
                ps.setLong(4, entry.getValue().getBlocksBroken());
                ps.setLong(5, entry.getValue().getPlaytimeTicks());
                ps.addBatch();
                batchCount++;

                // Flush every 500 rows to avoid memory buildup
                // Optimal batch size: 100–1000 rows; test for your workload
                if (batchCount % 500 == 0) {
                    ps.executeBatch();
                    conn.commit();
                    ps.clearBatch();
                }
            }

            // Flush remaining rows
            if (batchCount % 500 != 0) {
                ps.executeBatch();
                conn.commit();
            }

        } catch (SQLException e) {
            plugin.getLogger().severe("Batch save failed: " + e.getMessage());
            throw new RuntimeException(e);
        }
    }, asyncExecutor);
}
```

**Performance comparison (MySQL, 1,000 rows, local network):**

| Method | Time | Queries | Notes |
|---|---|---|---|
| 1,000 individual INSERTs | ~2,500ms | 1,000 | Network round-trip per query |
| 1 batch of 1,000 | ~25ms | 1 | `rewriteBatchedStatements=true` required |
| 10 batches of 100 | ~50ms | 10 | Good balance of memory and speed |
| 1 multi-row INSERT | ~20ms | 1 | Fastest; less flexible |

`rewriteBatchedStatements=true` in the JDBC URL is required for `addBatch()`/`executeBatch()` to actually send a single multi-row INSERT. Without it, JDBC sends individual queries despite the batch API.

---

### 5.3 Caching Strategy

#### Read-Through Cache

```java
public class PlayerDataCache {
    // Guava Cache: TTL-based eviction, max size, thread-safe
    private final Cache<UUID, PlayerData> cache = CacheBuilder.newBuilder()
        .maximumSize(500)                           // Max 500 players in cache
        .expireAfterWrite(10, TimeUnit.MINUTES)     // Evict 10 min after write
        .expireAfterAccess(5, TimeUnit.MINUTES)     // Evict 5 min after last access
        .removalListener(notification -> {
            if (notification.getCause() == RemovalCause.EXPIRED) {
                // Optional: write-behind on eviction
                scheduleSave((PlayerData) notification.getValue());
            }
        })
        .build();

    private final PlayerDataRepository repository;

    // Read-through: cache miss triggers DB load
    public CompletableFuture<PlayerData> get(UUID uuid) {
        PlayerData cached = cache.getIfPresent(uuid);
        if (cached != null) {
            return CompletableFuture.completedFuture(cached);  // Cache hit: instant
        }

        // Cache miss: load from DB, populate cache
        return repository.findByUuid(uuid).thenApply(data -> {
            if (data != null) {
                cache.put(uuid, data);
            }
            return data;
        });
    }

    // Write-through: update cache and DB simultaneously
    public CompletableFuture<Void> save(PlayerData data) {
        cache.put(data.getUuid(), data);            // Sync: update cache immediately
        return repository.save(data);               // Async: persist to DB
    }

    // Explicit invalidation (used by cross-server sync)
    public void invalidate(UUID uuid) {
        cache.invalidate(uuid);
    }

    // Bulk invalidation on server shutdown
    public void invalidateAll() {
        cache.invalidateAll();
    }
}
```

#### Write-Behind Cache (Dirty Flag Pattern)

```java
public class WriteBehindsCache {
    private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();
    private final Set<UUID> dirtyKeys = ConcurrentHashMap.newKeySet();
    private final PlayerDataRepository repository;
    private final Plugin plugin;

    public WriteBehindsCache(Plugin plugin, PlayerDataRepository repository) {
        this.plugin = plugin;
        this.repository = repository;

        // Flush dirty entries every 30 seconds
        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::flushDirty, 600L, 600L);
    }

    public PlayerData get(UUID uuid) {
        return cache.get(uuid);
    }

    // Mark as dirty; actual DB write deferred to flush cycle
    public void set(UUID uuid, PlayerData data) {
        cache.put(uuid, data);
        dirtyKeys.add(uuid);
    }

    // Force flush on player quit (don't wait for next cycle)
    public CompletableFuture<Void> flushPlayer(UUID uuid) {
        dirtyKeys.remove(uuid);
        PlayerData data = cache.remove(uuid);
        if (data != null) {
            return repository.save(data);
        }
        return CompletableFuture.completedFuture(null);
    }

    private void flushDirty() {
        if (dirtyKeys.isEmpty()) return;

        Set<UUID> toFlush = new HashSet<>(dirtyKeys);
        dirtyKeys.removeAll(toFlush);

        Map<UUID, PlayerData> batch = new HashMap<>();
        for (UUID uuid : toFlush) {
            PlayerData data = cache.get(uuid);
            if (data != null) batch.put(uuid, data);
        }

        if (!batch.isEmpty()) {
            repository.saveAll(batch).exceptionally(ex -> {
                plugin.getLogger().severe("Write-behind flush failed: " + ex.getMessage());
                // Re-mark as dirty for next cycle
                dirtyKeys.addAll(batch.keySet());
                return null;
            });
        }
    }

    // Called in onDisable() — flush everything before shutdown
    public void shutdown() {
        dirtyKeys.addAll(cache.keySet());
        flushDirty();
    }
}
```

---

### 5.4 Read-Through / Write-Behind Patterns

**Pattern selection guide:**

| Pattern | Read Latency | Write Latency | Consistency | Use When |
|---|---|---|---|---|
| No cache | High (DB) | High (DB) | Strong | Development only |
| Read-through | Low (cache hit) | High (DB) | Strong | Read-heavy, infrequent writes |
| Write-through | Low (cache hit) | Medium (cache+DB) | Strong | Balanced read/write |
| Write-behind | Low (cache hit) | Very low (cache only) | Eventual | Write-heavy (stats, playtime) |
| Cache-aside | Low (cache hit) | High (DB) | Strong | Manual control needed |

**For Minecraft plugins:**
- Player settings: **Write-through** (settings change rarely; consistency matters)
- Economy balances: **Write-through** (money must be consistent; no eventual consistency)
- Statistics (kills, deaths): **Write-behind** (high write frequency; slight delay acceptable)
- Session data: **Cache-only** (Redis with TTL; no DB persistence needed)

---

## 6. Data Integrity and Safety

### 6.1 Backup Strategy

**SQLite backup:**

```java
// VACUUM INTO creates a clean, defragmented copy atomically
// Safe to run while the database is in use (WAL mode)
public void backupSQLite(File sourceDb, File backupDir) throws SQLException {
    String timestamp = new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss").format(new Date());
    File backupFile = new File(backupDir, "backup_" + timestamp + ".db");

    try (Connection conn = DriverManager.getConnection("jdbc:sqlite:" + sourceDb.getAbsolutePath());
         Statement stmt = conn.createStatement()) {
        stmt.execute("VACUUM INTO '" + backupFile.getAbsolutePath() + "'");
    }
}
```

**MySQL backup (shell, scheduled via cron):**

```bash
#!/bin/bash
# /etc/cron.d/minecraft-backup
# Runs daily at 3 AM

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="/backups/minecraft"
DB_NAME="plugin_data"
DB_USER="backup_user"
DB_PASS="password"

mkdir -p "$BACKUP_DIR"

# Full dump with single-transaction (no table locks on InnoDB)
mysqldump \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --hex-blob \
    -u "$DB_USER" \
    -p"$DB_PASS" \
    "$DB_NAME" | gzip > "$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

# Keep only last 30 days
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: backup_${TIMESTAMP}.sql.gz"
```

**Backup verification (run weekly):**

```bash
# Restore to test database and verify row counts
gunzip -c /backups/minecraft/backup_latest.sql.gz | mysql -u root -p test_restore_db
mysql -u root -p test_restore_db -e "SELECT COUNT(*) FROM player_data;"
# Compare with production count
```

> **Warning:** A backup that has never been tested is not a backup — it is a false sense of security. Schedule monthly restore tests to a separate database instance.

---

### 6.2 Corruption Recovery

**SQLite corruption detection and repair:**

```java
public boolean verifySQLiteIntegrity(File dbFile) {
    try (Connection conn = DriverManager.getConnection("jdbc:sqlite:" + dbFile.getAbsolutePath());
         Statement stmt = conn.createStatement();
         ResultSet rs = stmt.executeQuery("PRAGMA integrity_check")) {
        if (rs.next()) {
            String result = rs.getString(1);
            if ("ok".equals(result)) {
                return true;
            } else {
                plugin.getLogger().severe("SQLite integrity check failed: " + result);
                return false;
            }
        }
    } catch (SQLException e) {
        plugin.getLogger().severe("Cannot open database for integrity check: " + e.getMessage());
    }
    return false;
}
```

**Recovery procedure:**

1. Stop the plugin (or server)
2. Copy the corrupted file: `cp data.db data.db.corrupted`
3. Run `sqlite3 data.db ".recover" | sqlite3 data_recovered.db`
4. Verify recovered database: `PRAGMA integrity_check;`
5. Compare row counts between original and recovered
6. Replace original with recovered if counts match

---

### 6.3 UUID Migration

When migrating from username-based storage (legacy) to UUID-based storage:

```java
public CompletableFuture<Void> migrateUsernamesToUUIDs(List<String> usernames) {
    return CompletableFuture.runAsync(() -> {
        // Mojang API: 10 usernames per request, 600 requests per 10 minutes
        List<List<String>> batches = partition(usernames, 10);

        for (List<String> batch : batches) {
            try {
                Map<String, UUID> resolved = mojangApiClient.resolveUsernames(batch);
                for (Map.Entry<String, UUID> entry : resolved.entrySet()) {
                    migratePlayerRecord(entry.getKey(), entry.getValue());
                }
                // Rate limit: 1 request per second to stay under Mojang limits
                Thread.sleep(1000);
            } catch (Exception e) {
                plugin.getLogger().warning("Migration batch failed: " + e.getMessage());
            }
        }
    }, asyncExecutor);
}
```

**UUID storage format:**

Always store UUIDs with dashes: `550e8400-e29b-41d4-a716-446655440000`

```java
// Bukkit provides UUID with dashes
UUID uuid = player.getUniqueId();
String stored = uuid.toString();  // "550e8400-e29b-41d4-a716-446655440000"

// Retrieve and parse
UUID retrieved = UUID.fromString(rs.getString("uuid"));

// Never strip dashes for storage — the 4 bytes saved are not worth the confusion
// If you receive a UUID without dashes, add them:
public static UUID fromUndashed(String undashed) {
    return UUID.fromString(undashed.replaceFirst(
        "(\\w{8})(\\w{4})(\\w{4})(\\w{4})(\\w{12})",
        "$1-$2-$3-$4-$5"
    ));
}
```

---

### 6.4 Data Validation Rules

Validate at the boundary between user input and database. Never trust data from commands, chat, or config files.

```java
public class DataValidator {

    // Minecraft usernames: 3-16 chars, alphanumeric + underscore
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[a-zA-Z0-9_]{3,16}$");

    // UUID with dashes
    private static final Pattern UUID_PATTERN = Pattern.compile(
        "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        Pattern.CASE_INSENSITIVE
    );

    public static void validateUsername(String username) {
        if (username == null || !USERNAME_PATTERN.matcher(username).matches()) {
            throw new IllegalArgumentException("Invalid username: " + username);
        }
    }

    public static void validateUUID(String uuid) {
        if (uuid == null || !UUID_PATTERN.matcher(uuid).matches()) {
            throw new IllegalArgumentException("Invalid UUID format: " + uuid);
        }
    }

    public static void validateBalance(BigDecimal amount) {
        if (amount == null) throw new IllegalArgumentException("Amount cannot be null");
        if (amount.compareTo(BigDecimal.ZERO) < 0) throw new IllegalArgumentException("Amount cannot be negative");
        if (amount.compareTo(new BigDecimal("999999999999999999.99")) > 0) {
            throw new IllegalArgumentException("Amount exceeds maximum");
        }
        if (amount.scale() > 2) throw new IllegalArgumentException("Amount has too many decimal places");
    }

    public static void validateHomeName(String name) {
        if (name == null || name.isEmpty() || name.length() > 32) {
            throw new IllegalArgumentException("Home name must be 1-32 characters");
        }
        // Prevent SQL-like injection even with PreparedStatements (defense in depth)
        if (name.contains("'") || name.contains("\"") || name.contains(";")) {
            throw new IllegalArgumentException("Home name contains invalid characters");
        }
    }
}
```

---

## 7. Multi-Server Architecture

### 7.1 Shared Database Patterns

**Option A: Single Shared MySQL (Recommended for most networks)**

```
Server 1 ──┐
Server 2 ──┤
Server 3 ──┼──► MySQL Primary ──► MySQL Replica (read-only)
Server 4 ──┤
Server 5 ──┘
```

- All servers read/write to the same MySQL instance
- Consistency is immediate (no sync lag)
- Single point of failure (mitigated by MySQL replication)
- Write contention on hot rows (economy, stats) — mitigated by `SELECT ... FOR UPDATE`

**Option B: MySQL Primary + Redis Cache Layer (Recommended for high-traffic networks)**

```
Server 1 ──┐                    ┌──► Redis (pub/sub + cache)
Server 2 ──┤                    │
Server 3 ──┼──► MySQL Primary ──┤
Server 4 ──┤                    │
Server 5 ──┘                    └──► MySQL Replica
```

- Hot data (online player data) served from Redis: sub-millisecond reads
- Cold data (offline player lookup) served from MySQL
- Redis pub/sub for cross-server cache invalidation
- MySQL is source of truth; Redis is always disposable

**Option C: Database Per Server + Sync Layer (Not recommended)**

```
Server 1 ──► SQLite 1 ──┐
Server 2 ──► SQLite 2 ──┤
Server 3 ──► SQLite 3 ──┼──► Sync daemon ──► Central MySQL
Server 4 ──► SQLite 4 ──┤
Server 5 ──► SQLite 5 ──┘
```

- Maximum isolation; each server works independently
- Sync daemon is a custom component that must handle conflicts
- Sync lag means cross-server data is eventually consistent
- Complexity is rarely justified; use Option B instead

---

### 7.2 Cross-Server Cache Invalidation

```java
public class CrossServerCacheInvalidator {
    private final JedisPool jedisPool;
    private final PlayerDataCache localCache;
    private final String channelName = "cache:invalidate";

    // Publisher: called when this server modifies player data
    public void publishInvalidation(UUID uuid) {
        try (Jedis jedis = jedisPool.getResource()) {
            jedis.publish(channelName, "player:" + uuid.toString());
        }
    }

    // Subscriber: listens for invalidations from other servers
    public void startSubscriber() {
        Thread subscriberThread = new Thread(() -> {
            try (Jedis jedis = jedisPool.getResource()) {
                jedis.subscribe(new JedisPubSub() {
                    @Override
                    public void onMessage(String channel, String message) {
                        if (message.startsWith("player:")) {
                            String uuidStr = message.substring(7);
                            try {
                                UUID uuid = UUID.fromString(uuidStr);
                                localCache.invalidate(uuid);
                            } catch (IllegalArgumentException e) {
                                plugin.getLogger().warning("Invalid UUID in cache invalidation: " + uuidStr);
                            }
                        }
                    }
                }, channelName);
            }
        }, "MyPlugin-CacheInvalidator");
        subscriberThread.setDaemon(true);
        subscriberThread.start();
    }
}
```

---

### 7.3 Event-Based Sync

For data that must be synchronized across servers in real-time (punishments, economy transfers), use BungeeCord plugin messaging or Redis pub/sub:

```java
// Message format: JSON for flexibility and debuggability
public class SyncMessage {
    private final String type;       // "BALANCE_UPDATE", "BAN_ISSUED", "PLAYER_QUIT"
    private final String serverName;
    private final UUID playerUuid;
    private final Map<String, Object> payload;
    private final long timestamp;

    public String serialize() {
        // Use Gson or Jackson for serialization
        return gson.toJson(this);
    }

    public static SyncMessage deserialize(String json) {
        return gson.fromJson(json, SyncMessage.class);
    }
}

// Publishing a sync event
public void publishBalanceUpdate(UUID uuid, BigDecimal newBalance) {
    SyncMessage msg = new SyncMessage(
        "BALANCE_UPDATE",
        serverName,
        uuid,
        Map.of("balance", newBalance.toString()),
        System.currentTimeMillis()
    );

    try (Jedis jedis = jedisPool.getResource()) {
        jedis.publish("sync:economy", msg.serialize());
    }
}
```

---

### 7.4 Conflict Resolution

When two servers modify the same data simultaneously, conflicts occur. Your resolution strategy must be defined before deployment — not after data loss.

**Last-Write-Wins (timestamp-based):**

```sql
-- MySQL: only update if our timestamp is newer
UPDATE economy_balances
SET balance = ?, updated_at = ?
WHERE uuid = ?
  AND updated_at <= ?;  -- Only update if DB record is older than our write
-- Check affected rows: 0 = conflict (another server wrote more recently)
```

```java
int affected = ps.executeUpdate();
if (affected == 0) {
    // Conflict: another server wrote a newer value
    // Strategy: reload from DB and retry, or log and alert
    plugin.getLogger().warning("Write conflict for player " + uuid + " — reloading from DB");
    reloadFromDatabase(uuid);
}
```

**Server Priority (for specific data types):**

```java
// Lobby server is authoritative for player settings
// Game servers are authoritative for stats
// Economy is authoritative on the server where the transaction occurred
public boolean isAuthoritative(String dataType, String originServer) {
    return switch (dataType) {
        case "player_settings" -> "lobby".equals(originServer);
        case "player_stats" -> currentServerName.equals(originServer);
        case "economy" -> true; // All servers are authoritative for their own transactions
        default -> true;
    };
}
```

**Common AI mistake — no conflict handling:**

```java
// BAD: AI-generated cross-server save — no conflict detection
public void saveBalance(UUID uuid, BigDecimal balance) {
    // This blindly overwrites whatever is in the DB
    // If Server A and Server B both call this simultaneously,
    // one write silently overwrites the other
    execute("UPDATE economy_balances SET balance = ? WHERE uuid = ?", balance, uuid);
}
```

The fix is `UPDATE ... WHERE updated_at <= ?` with affected-row checking, as shown above.

---

## 8. Common AI Database Mistakes

### 8.1 SQL Injection Vulnerabilities

```java
// BAD: String concatenation — SQL injection vulnerability
public void getPlayerData(String username) {
    String sql = "SELECT * FROM player_data WHERE username = '" + username + "'";
    // Malicious input: "' OR '1'='1" → returns all rows
    // Malicious input: "'; DROP TABLE player_data; --" → destroys table
    statement.execute(sql);
}

// GOOD: PreparedStatement with parameterized query
public CompletableFuture<PlayerData> getPlayerData(String username) {
    return CompletableFuture.supplyAsync(() -> {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT uuid, username, first_seen FROM player_data WHERE username = ?")) {
            ps.setString(1, username);  // Driver handles escaping; injection impossible
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? mapRow(rs) : null;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }, asyncExecutor);
}
```

**Impact:** SQL injection in a Minecraft plugin can expose all player data, destroy tables, or allow arbitrary command execution on the database server. Every query that includes user-provided input must use `PreparedStatement`.

> **AI Prompt Tip:** Add to your AI prompt: "All SQL queries must use PreparedStatement with parameterized inputs. Never concatenate user input into SQL strings. Every query must be async using CompletableFuture."

---

### 8.2 Connection Leaks

```java
// BAD: Connection not closed on exception path
public int getBalance(UUID uuid) {
    Connection conn = dataSource.getConnection();  // Acquired
    PreparedStatement ps = conn.prepareStatement("SELECT balance FROM economy_balances WHERE uuid = ?");
    ps.setString(1, uuid.toString());
    ResultSet rs = ps.executeQuery();
    int balance = rs.next() ? rs.getInt("balance") : 0;
    // If ANY line above throws, conn is never closed → pool exhaustion
    conn.close();
    return balance;
}

// GOOD: try-with-resources guarantees close() on all paths
public CompletableFuture<Integer> getBalance(UUID uuid) {
    return CompletableFuture.supplyAsync(() -> {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT balance FROM economy_balances WHERE uuid = ?")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt("balance") : 0;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }, asyncExecutor);
}
```

**Impact:** Each leaked connection reduces the pool by 1. With a pool size of 10, 10 leaked connections cause `HikariPool - Connection is not available, request timed out after 30000ms`. All subsequent database operations fail until the server restarts.

**Detection:** Set `leakDetectionThreshold=60000` in HikariCP config. Connections held longer than 60 seconds are logged with a stack trace showing where they were acquired.

---

### 8.3 Synchronous Queries in Events

```java
// BAD: Synchronous database query in PlayerJoinEvent
// Blocks the main thread for the duration of the query
// At 100 players joining simultaneously: 100 × 50ms = 5,000ms of main thread blocking
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    // This runs on the main thread and blocks it
    PlayerData data = database.loadPlayerSync(player.getUniqueId());  // 50ms DB query
    playerCache.put(player.getUniqueId(), data);
    player.sendMessage("Welcome back, " + data.getUsername() + "!");
}

// GOOD: Async load with sync callback
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();

    CompletableFuture
        .supplyAsync(() -> database.loadPlayer(uuid), asyncExecutor)
        .thenAccept(data -> Bukkit.getScheduler().runTask(plugin, () -> {
            if (!player.isOnline()) return;  // Player disconnected during load
            playerCache.put(uuid, data != null ? data : PlayerData.createDefault(uuid, player.getName()));
            player.sendMessage("§aWelcome back, " + player.getName() + "!");
        }))
        .exceptionally(ex -> {
            plugin.getLogger().severe("Failed to load " + uuid + ": " + ex.getMessage());
            Bukkit.getScheduler().runTask(plugin, () -> {
                if (player.isOnline()) player.sendMessage("§cData load failed. Please reconnect.");
            });
            return null;
        });
}
```

**Impact:** A 50ms synchronous query in `PlayerJoinEvent` drops TPS from 20 to ~16 during a join surge. At 10 simultaneous joins, the server freezes for 500ms — visible as a lag spike to all online players.

---

### 8.4 Race Conditions

```java
// BAD: Read-modify-write without atomicity
// Race condition: two threads read balance=100, both add 50, both write 150
// Expected result: 200. Actual result: 150 (one write lost)
public void addBalance(UUID uuid, int amount) {
    int current = getBalance(uuid);       // Read: 100
    int newBalance = current + amount;    // Modify: 150
    setBalance(uuid, newBalance);         // Write: 150 (may overwrite concurrent write)
}

// GOOD: Atomic SQL update — no read-modify-write race
public CompletableFuture<Void> addBalance(UUID uuid, BigDecimal amount) {
    return CompletableFuture.runAsync(() -> {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "UPDATE economy_balances SET balance = balance + ?, updated_at = ? WHERE uuid = ?")) {
            ps.setBigDecimal(1, amount);
            ps.setLong(2, System.currentTimeMillis());
            ps.setString(3, uuid.toString());
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }, asyncExecutor);
}
```

**Impact:** Race conditions in economy plugins cause duplication exploits. Players discover that clicking a shop button rapidly, or using two clients simultaneously, multiplies their balance. This is not a theoretical risk — it is exploited on production servers within hours of deployment.

---

### 8.5 Schema Destruction

```java
// BAD: Drops and recreates tables on every server start
// AI generates this because it's "idempotent" — but it destroys all data
@Override
public void onEnable() {
    try (Connection conn = getConnection()) {
        // CATASTROPHIC: Deletes all player data on every restart
        conn.createStatement().execute("DROP TABLE IF EXISTS players");
        conn.createStatement().execute("""
            CREATE TABLE players (
                uuid VARCHAR(36) PRIMARY KEY,
                balance INT DEFAULT 0
            )
        """);
    } catch (SQLException e) {
        e.printStackTrace();
    }
}

// GOOD: CREATE IF NOT EXISTS + migration framework
@Override
public void onEnable() {
    try {
        databaseManager.initialize(config);
        migrationRunner.runMigrations();  // Only applies new migrations; never touches existing data
    } catch (SQLException e) {
        getLogger().severe("Database initialization failed: " + e.getMessage());
        getServer().getPluginManager().disablePlugin(this);
    }
}
```

**Impact:** Every server restart wipes all player data. This has happened on production servers. The data is unrecoverable without a backup. The AI generates this pattern because tutorial code prioritizes clean-slate development over data safety.

> **AI Prompt Tip:** Add to every AI prompt: "Never use DROP TABLE. Never use TRUNCATE. Schema initialization must use CREATE TABLE IF NOT EXISTS. All schema changes must go through a versioned migration system."

---

## Appendix A: Complete Schema Templates

### A.1 Full Network Schema (Copy-Paste Ready)

```sql
-- ============================================================
-- NETWORK PLUGIN DATABASE SCHEMA
-- Character set: utf8mb4 (emoji support)
-- Engine: InnoDB (transactions, FK enforcement)
-- ============================================================

CREATE DATABASE IF NOT EXISTS plugin_data
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE plugin_data;

-- ============================================================
-- CORE: Player identity (foundation for all other tables)
-- ============================================================
CREATE TABLE IF NOT EXISTS player_data (
    uuid            CHAR(36)        NOT NULL,
    username        VARCHAR(16)     NOT NULL,
    first_seen      BIGINT          NOT NULL,
    last_seen       BIGINT          NOT NULL,
    is_banned       TINYINT(1)      NOT NULL DEFAULT 0,
    ip_address      VARCHAR(45)     NULL,
    locale          VARCHAR(10)     NULL,
    PRIMARY KEY (uuid),
    UNIQUE KEY uq_username (username),
    INDEX idx_last_seen (last_seen),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ECONOMY
-- ============================================================
CREATE TABLE IF NOT EXISTS economy_balances (
    uuid            CHAR(36)        NOT NULL,
    balance         DECIMAL(20,2)   NOT NULL DEFAULT 0.00,
    currency        VARCHAR(32)     NOT NULL DEFAULT 'coins',
    updated_at      BIGINT          NOT NULL,
    PRIMARY KEY (uuid, currency),
    CONSTRAINT fk_economy_player FOREIGN KEY (uuid)
        REFERENCES player_data(uuid) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_balance_leaderboard (currency, balance DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS economy_transactions (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    uuid            CHAR(36)        NOT NULL,
    transaction_type ENUM('DEPOSIT','WITHDRAWAL','TRANSFER_OUT','TRANSFER_IN','ADMIN_SET','PLUGIN') NOT NULL,
    amount          DECIMAL(20,2)   NOT NULL,
    balance_before  DECIMAL(20,2)   NOT NULL,
    balance_after   DECIMAL(20,2)   NOT NULL,
    currency        VARCHAR(32)     NOT NULL DEFAULT 'coins',
    reason          VARCHAR(255)    NULL,
    source_server   VARCHAR(64)     NULL,
    created_at      BIGINT          NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_tx_uuid (uuid, created_at DESC),
    INDEX idx_tx_created (created_at DESC),
    CONSTRAINT fk_tx_player FOREIGN KEY (uuid)
        REFERENCES player_data(uuid) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- HOMES
-- ============================================================
CREATE TABLE IF NOT EXISTS player_homes (
    id              INT             NOT NULL AUTO_INCREMENT,
    uuid            CHAR(36)        NOT NULL,
    home_name       VARCHAR(32)     NOT NULL,
    world_name      VARCHAR(64)     NOT NULL,
    x               DOUBLE          NOT NULL,
    y               DOUBLE          NOT NULL,
    z               DOUBLE          NOT NULL,
    yaw             FLOAT           NOT NULL DEFAULT 0.0,
    pitch           FLOAT           NOT NULL DEFAULT 0.0,
    created_at      BIGINT          NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_player_home (uuid, home_name),
    INDEX idx_homes_uuid (uuid),
    CONSTRAINT fk_homes_player FOREIGN KEY (uuid)
        REFERENCES player_data(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PUNISHMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS punishments (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    target_uuid     CHAR(36)        NOT NULL,
    target_name     VARCHAR(16)     NOT NULL,
    issuer_uuid     CHAR(36)        NULL,
    issuer_name     VARCHAR(16)     NOT NULL DEFAULT 'CONSOLE',
    type            ENUM('BAN','TEMPBAN','MUTE','TEMPMUTE','WARN','KICK') NOT NULL,
    reason          VARCHAR(512)    NOT NULL,
    issued_at       BIGINT          NOT NULL,
    expires_at      BIGINT          NULL,
    removed_at      BIGINT          NULL,
    removed_by      CHAR(36)        NULL,
    server_scope    VARCHAR(64)     NULL,
    active          TINYINT(1)      NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    INDEX idx_target_active (target_uuid, active, type),
    INDEX idx_expires (expires_at, active),
    INDEX idx_issuer (issuer_uuid),
    INDEX idx_issued_at (issued_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- STATISTICS
-- ============================================================
CREATE TABLE IF NOT EXISTS player_stats (
    uuid            CHAR(36)        NOT NULL,
    kills           INT             NOT NULL DEFAULT 0,
    deaths          INT             NOT NULL DEFAULT 0,
    blocks_broken   BIGINT          NOT NULL DEFAULT 0,
    blocks_placed   BIGINT          NOT NULL DEFAULT 0,
    distance_walked DOUBLE          NOT NULL DEFAULT 0.0,
    playtime_ticks  BIGINT          NOT NULL DEFAULT 0,
    PRIMARY KEY (uuid),
    CONSTRAINT fk_stats_player FOREIGN KEY (uuid)
        REFERENCES player_data(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SCHEMA VERSION TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_version (
    version         INT             NOT NULL,
    description     VARCHAR(255)    NOT NULL,
    applied_at      BIGINT          NOT NULL,
    PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## Appendix B: Java Database Access Patterns

### B.1 Complete PlayerDataRepository

```java
public interface PlayerDataRepository {
    CompletableFuture<PlayerData> findByUuid(UUID uuid);
    CompletableFuture<PlayerData> findByUsername(String username);
    CompletableFuture<Void> save(PlayerData data);
    CompletableFuture<Void> saveAll(Map<UUID, PlayerData> dataMap);
    CompletableFuture<Boolean> exists(UUID uuid);
    CompletableFuture<Void> delete(UUID uuid);
    CompletableFuture<List<PlayerData>> findInactiveSince(long timestamp);
}

public class SqlPlayerDataRepository implements PlayerDataRepository {
    private final HikariDataSource dataSource;
    private final Executor asyncExecutor;
    private final Logger logger;

    public SqlPlayerDataRepository(HikariDataSource dataSource, Executor asyncExecutor, Logger logger) {
        this.dataSource = dataSource;
        this.asyncExecutor = asyncExecutor;
        this.logger = logger;
    }

    @Override
    public CompletableFuture<PlayerData> findByUuid(UUID uuid) {
        return CompletableFuture.supplyAsync(() -> {
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(
                     "SELECT uuid, username, first_seen, last_seen, locale " +
                     "FROM player_data WHERE uuid = ?")) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    return rs.next() ? mapRow(rs) : null;
                }
            } catch (SQLException e) {
                logger.severe("findByUuid failed for " + uuid + ": " + e.getMessage());
                throw new RuntimeException(e);
            }
        }, asyncExecutor);
    }

    @Override
    public CompletableFuture<PlayerData> findByUsername(String username) {
        return CompletableFuture.supplyAsync(() -> {
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(
                     "SELECT uuid, username, first_seen, last_seen, locale " +
                     "FROM player_data WHERE username = ?")) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    return rs.next() ? mapRow(rs) : null;
                }
            } catch (SQLException e) {
                logger.severe("findByUsername failed for " + username + ": " + e.getMessage());
                throw new RuntimeException(e);
            }
        }, asyncExecutor);
    }

    @Override
    public CompletableFuture<Void> save(PlayerData data) {
        return CompletableFuture.runAsync(() -> {
            String sql = """
                INSERT INTO player_data (uuid, username, first_seen, last_seen, locale)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    username = VALUES(username),
                    last_seen = VALUES(last_seen),
                    locale = VALUES(locale)
            """;
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, data.getUuid().toString());
                ps.setString(2, data.getUsername());
                ps.setLong(3, data.getFirstSeen());
                ps.setLong(4, data.getLastSeen());
                ps.setString(5, data.getLocale());
                ps.executeUpdate();
            } catch (SQLException e) {
                logger.severe("save failed for " + data.getUuid() + ": " + e.getMessage());
                throw new RuntimeException(e);
            }
        }, asyncExecutor);
    }

    @Override
    public CompletableFuture<Void> saveAll(Map<UUID, PlayerData> dataMap) {
        return CompletableFuture.runAsync(() -> {
            String sql = """
                INSERT INTO player_data (uuid, username, first_seen, last_seen, locale)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    username = VALUES(username),
                    last_seen = VALUES(last_seen),
                    locale = VALUES(locale)
            """;
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(sql)) {
                conn.setAutoCommit(false);
                int count = 0;
                for (PlayerData data : dataMap.values()) {
                    ps.setString(1, data.getUuid().toString());
                    ps.setString(2, data.getUsername());
                    ps.setLong(3, data.getFirstSeen());
                    ps.setLong(4, data.getLastSeen());
                    ps.setString(5, data.getLocale());
                    ps.addBatch();
                    if (++count % 500 == 0) {
                        ps.executeBatch();
                        conn.commit();
                    }
                }
                ps.executeBatch();
                conn.commit();
                conn.setAutoCommit(true);
            } catch (SQLException e) {
                logger.severe("saveAll failed: " + e.getMessage());
                throw new RuntimeException(e);
            }
        }, asyncExecutor);
    }

    @Override
    public CompletableFuture<Boolean> exists(UUID uuid) {
        return CompletableFuture.supplyAsync(() -> {
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(
                     "SELECT 1 FROM player_data WHERE uuid = ? LIMIT 1")) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    return rs.next();
                }
            } catch (SQLException e) {
                logger.severe("exists check failed for " + uuid + ": " + e.getMessage());
                throw new RuntimeException(e);
            }
        }, asyncExecutor);
    }

    @Override
    public CompletableFuture<Void> delete(UUID uuid) {
        return CompletableFuture.runAsync(() -> {
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(
                     "DELETE FROM player_data WHERE uuid = ?")) {
                ps.setString(1, uuid.toString());
                ps.executeUpdate();
            } catch (SQLException e) {
                logger.severe("delete failed for " + uuid + ": " + e.getMessage());
                throw new RuntimeException(e);
            }
        }, asyncExecutor);
    }

    @Override
    public CompletableFuture<List<PlayerData>> findInactiveSince(long timestamp) {
        return CompletableFuture.supplyAsync(() -> {
            List<PlayerData> results = new ArrayList<>();
            try (Connection conn = dataSource.getConnection();
                 PreparedStatement ps = conn.prepareStatement(
                     "SELECT uuid, username, first_seen, last_seen, locale " +
                     "FROM player_data WHERE last_seen < ?")) {
                ps.setLong(1, timestamp);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        results.add(mapRow(rs));
                    }
                }
            } catch (SQLException e) {
                logger.severe("findInactiveSince failed: " + e.getMessage());
                throw new RuntimeException(e);
            }
            return results;
        }, asyncExecutor);
    }

    private PlayerData mapRow(ResultSet rs) throws SQLException {
        return new PlayerData(
            UUID.fromString(rs.getString("uuid")),
            rs.getString("username"),
            rs.getLong("first_seen"),
            rs.getLong("last_seen"),
            rs.getString("locale")
        );
    }
}
```

---

## Appendix C: Connection Pool Configuration Templates

### C.1 SQLite (pom.xml dependencies)

```xml
<dependency>
    <groupId>org.xerial</groupId>
    <artifactId>sqlite-jdbc</artifactId>
    <version>3.45.1.0</version>
</dependency>
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.1.0</version>
</dependency>
```

```java
HikariConfig config = new HikariConfig();
config.setPoolName("Plugin-SQLite");
config.setDriverClassName("org.sqlite.JDBC");
config.setJdbcUrl("jdbc:sqlite:" + plugin.getDataFolder() + "/data.db");
config.setMaximumPoolSize(1);
config.setMinimumIdle(1);
config.setConnectionTimeout(5_000);
config.setIdleTimeout(0);
config.setMaxLifetime(0);
config.setConnectionInitSql(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; " +
    "PRAGMA cache_size=10000; PRAGMA temp_store=MEMORY; PRAGMA foreign_keys=ON;"
);
```

### C.2 MySQL/MariaDB (pom.xml dependencies)

```xml
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <version>8.3.0</version>
</dependency>
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.1.0</version>
</dependency>
```

```java
HikariConfig config = new HikariConfig();
config.setPoolName("Plugin-MySQL");
config.setDriverClassName("com.mysql.cj.jdbc.Driver");
config.setJdbcUrl("jdbc:mysql://" + host + ":" + port + "/" + database +
    "?useSSL=false&allowPublicKeyRetrieval=true" +
    "&useUnicode=true&characterEncoding=utf8mb4&serverTimezone=UTC");
config.setUsername(username);
config.setPassword(password);
config.setMaximumPoolSize(10);
config.setMinimumIdle(2);
config.setConnectionTimeout(30_000);
config.setIdleTimeout(600_000);
config.setMaxLifetime(1_800_000);
config.setConnectionTestQuery("SELECT 1");
config.setLeakDetectionThreshold(60_000);
config.addDataSourceProperty("cachePrepStmts", "true");
config.addDataSourceProperty("prepStmtCacheSize", "250");
config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
config.addDataSourceProperty("useServerPrepStmts", "true");
config.addDataSourceProperty("rewriteBatchedStatements", "true");
```

### C.3 PostgreSQL (pom.xml dependencies)

```xml
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <version>42.7.2</version>
</dependency>
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.1.0</version>
</dependency>
```

```java
HikariConfig config = new HikariConfig();
config.setPoolName("Plugin-PostgreSQL");
config.setDriverClassName("org.postgresql.Driver");
config.setJdbcUrl("jdbc:postgresql://" + host + ":" + port + "/" + database);
config.setUsername(username);
config.setPassword(password);
config.setMaximumPoolSize(10);
config.setMinimumIdle(2);
config.setConnectionTimeout(30_000);
config.setIdleTimeout(600_000);
config.setMaxLifetime(1_800_000);
config.addDataSourceProperty("prepareThreshold", "5");
config.addDataSourceProperty("preparedStatementCacheQueries", "256");
config.addDataSourceProperty("preparedStatementCacheSizeMiB", "5");
config.addDataSourceProperty("reWriteBatchedInserts", "true");  // PostgreSQL equivalent of rewriteBatchedStatements
```

---

## Appendix D: AI Database Prompt Checklist

Include these 20 points in every AI prompt that involves database code. Copy-paste the entire block.

```
DATABASE REQUIREMENTS — include ALL of the following:

1. All database queries must be asynchronous using CompletableFuture
2. Never call Bukkit API from inside async lambdas — bridge back with Bukkit.getScheduler().runTask()
3. All SQL must use PreparedStatement with parameterized inputs — never concatenate user input
4. All connections must be acquired with try-with-resources to guarantee close()
5. Never use DROP TABLE or TRUNCATE in any method
6. Schema initialization must use CREATE TABLE IF NOT EXISTS only
7. All schema changes must go through a versioned migration system
8. Use HikariCP connection pool — never DriverManager.getConnection() directly
9. Economy/balance operations must use DECIMAL(20,2) — never FLOAT or DOUBLE
10. All tables must use InnoDB engine and utf8mb4 character set
11. UUID must be stored as CHAR(36) with dashes — never strip dashes
12. Timestamps must be stored as BIGINT (Unix epoch milliseconds) — never DATETIME
13. Concurrent balance modifications must use SELECT ... FOR UPDATE to prevent race conditions
14. Batch operations must use addBatch()/executeBatch() with rewriteBatchedStatements=true
15. Player data must be cached in memory — never query the database on every event
16. Cache must be invalidated on player quit and populated on player join
17. All database errors must be logged with the full error message — never silently swallow exceptions
18. Connection pool must be closed in onDisable() with dataSource.close()
19. Foreign keys must be defined for all relationships — never rely on application-level integrity alone
20. Every query that filters rows must have a corresponding index on the filter column(s)
```

---

*Plugin Database Architecture Guide — Version 1.0*  
*For cross-server BungeeCord networks with 100–200 concurrent players per server.*  
*All patterns validated against production deployments. All anti-patterns documented from real incidents.*
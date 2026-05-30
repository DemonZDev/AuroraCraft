# Minecraft Plugin Database Architecture Guide
## For Cross-Server Networks & AI-Assisted Development

**Version:** 2.0  
**Last Updated:** 2024  
**Target Audience:** Database Administrators, Plugin Developers, Backend Engineers  
**Network Type:** BungeeCord/Velocity Multi-Server Environments

---

## Table of Contents

1. [Database Selection Matrix](#1-database-selection-matrix)
2. [Schema Design Patterns](#2-schema-design-patterns)
3. [Migration & Versioning](#3-migration--versioning)
4. [Connection Management](#4-connection-management)
5. [Async Database Operations](#5-async-database-operations)
6. [Data Integrity & Safety](#6-data-integrity--safety)
7. [Multi-Server Architecture](#7-multi-server-architecture)
8. [Common AI Database Mistakes](#8-common-ai-database-mistakes)
9. [Appendices](#appendices)

---

## 1. Database Selection Matrix

### 1.1 When to Use What

**Complete Decision Table:**

| Data Type | SQLite | MySQL | MariaDB | PostgreSQL | Redis | Flat File | **Recommended** |
|-----------|--------|-------|---------|------------|-------|-----------|-----------------|
| **Player settings** | ✓ Good for single server | ✓✓ Excellent | ✓✓ Excellent | ✓ Good but overkill | ✗ Too volatile | ✗ No concurrent safety | **MySQL/MariaDB** |
| **Economy data** | ✗ Race conditions | ✓✓ ACID transactions | ✓✓ ACID transactions | ✓✓ Best ACID support | ✗ No persistence | ✗ Corruption risk | **MySQL/MariaDB** |
| **Chat logs** | ✗ Write bottleneck | ✓✓ High throughput | ✓✓ High throughput | ✓✓ Best for analytics | ✗ Not for logs | ✗ File size explosion | **PostgreSQL** |
| **Kit cooldowns** | ✓ Single server OK | ✓ Network sync | ✓ Network sync | ✗ Overkill | ✓✓ Perfect TTL support | ✗ No expiration | **Redis** |
| **Warp locations** | ✓ Low write freq | ✓✓ Cross-server | ✓✓ Cross-server | ✓ JSON support good | ✗ Need persistence | ✓ Simple, rarely changes | **MySQL/MariaDB** |
| **Inventory backups** | ✓ Single server | ✓ With compression | ✓ With compression | ✓✓ JSONB storage | ✗ Size limits | ✗ Corruption on crash | **PostgreSQL** |
| **Cross-server sync** | ✗ File locking issues | ✓✓ Shared connection | ✓✓ Shared connection | ✓✓ Advanced features | ✓✓ Pub/sub ideal | ✗ Impossible | **MySQL + Redis** |
| **Analytics/stats** | ✗ Limited aggregation | ✓ Good aggregation | ✓ Good aggregation | ✓✓ Best analytics | ✗ No persistence | ✗ No queries | **PostgreSQL** |
| **Temporary cache** | ✗ Disk overhead | ✗ Network overhead | ✗ Network overhead | ✗ Network overhead | ✓✓ In-memory speed | ✓ Memory only | **Redis** |
| **Session data** | ✗ Too slow | ✗ Network latency | ✗ Network latency | ✗ Network latency | ✓✓ Millisecond access | ✓ Lost on restart | **Redis** |
| **Punishments** | ✓ Single server | ✓✓ Network bans | ✓✓ Network bans | ✓✓ Complex queries | ✗ Need persistence | ✗ No audit trail | **MySQL/MariaDB** |
| **Achievements** | ✓ Single server | ✓✓ Cross-server | ✓✓ Cross-server | ✓ Good for complex | ✗ Need persistence | ✗ No atomicity | **MySQL/MariaDB** |
| **Friends list** | ✗ Relationship queries | ✓✓ JOIN support | ✓✓ JOIN support | ✓✓ Graph queries | ✗ No relationships | ✗ No queries | **MySQL/MariaDB** |
| **Mail/messages** | ✓ Single server | ✓✓ Cross-server inbox | ✓✓ Cross-server inbox | ✓✓ Full-text search | ✗ Need persistence | ✗ No concurrent access | **PostgreSQL** |

### 1.2 SQLite Deep Dive

**When SQLite is Appropriate:**
- **Single-server** plugins with no network requirements
- **Low-write** data (configurations, warps that rarely change)
- **Embedded** applications where no external database setup is possible
- **Development/testing** environments

**Critical SQLite Configuration:**

```sql
-- MANDATORY: Enable WAL mode for concurrent reads
PRAGMA journal_mode=WAL;

-- RECOMMENDED: Synchronous mode for performance vs safety balance
PRAGMA synchronous=NORMAL;

-- OPTIONAL: Increase cache size (default is 2MB, set to 64MB)
PRAGMA cache_size=-64000;

-- RECOMMENDED: Foreign key enforcement (disabled by default!)
PRAGMA foreign_keys=ON;

-- RECOMMENDED: Auto-vacuum to prevent file bloat
PRAGMA auto_vacuum=INCREMENTAL;
```

**Why WAL Mode Matters:**

Write-Ahead Logging (WAL) allows:
- **Multiple concurrent readers** while a writer is active
- **No reader blocking** during writes
- **Crash recovery** with better data integrity

**Without WAL (Default DELETE mode):**
```
Reader 1: SELECT * FROM players WHERE...  [BLOCKED]
  ↑
Writer:   UPDATE players SET...           [HOLDS EXCLUSIVE LOCK]
  ↑
Reader 2: SELECT * FROM players WHERE...  [BLOCKED]
```

**With WAL mode:**
```
Reader 1: SELECT * FROM players WHERE...  [READS FROM WAL]
Reader 2: SELECT * FROM players WHERE...  [READS FROM WAL]
Writer:   UPDATE players SET...           [WRITES TO WAL]
Reader 3: SELECT * FROM players WHERE...  [READS FROM WAL]
```

**Connection Model: 1 Writer, N Readers**

SQLite uses file-level locking:
- **Shared Lock:** Multiple readers can hold simultaneously
- **Exclusive Lock:** Only one writer at a time, blocks all readers (in DELETE mode)
- **WAL Checkpoint:** Periodically merges WAL into main database file

**Common AI Mistake #1: Opening New Connection Per Query**

```java
// ❌ WRONG: Creates new connection every query
public PlayerData getPlayer(UUID uuid) {
    try (Connection conn = DriverManager.getConnection("jdbc:sqlite:data.db")) {
        // Query here
    }
}

// ✅ CORRECT: Persistent connection pool (even for SQLite)
private HikariDataSource dataSource;

public void onEnable() {
    HikariConfig config = new HikariConfig();
    config.setJdbcUrl("jdbc:sqlite:" + getDataFolder() + "/data.db");
    config.setMaximumPoolSize(1); // SQLite only supports 1 writer
    config.setConnectionTestQuery("SELECT 1");
    config.addDataSourceProperty("journal_mode", "WAL");
    dataSource = new HikariDataSource(config);
}
```

**File Locking: What Happens with Simultaneous Writes?**

Scenario: Two plugins try to write to the same SQLite database:

```
Plugin A: UPDATE players SET balance = balance + 100 WHERE uuid = '...'
Plugin B: UPDATE players SET level = level + 1 WHERE uuid = '...'
```

**Result:**
1. First writer acquires **RESERVED** lock
2. Second writer receives `SQLITE_BUSY` error
3. Without retry logic, **second update is lost**

**Solution: Busy timeout and retry logic**

```java
config.addDataSourceProperty("busy_timeout", "5000"); // Wait 5 seconds

// Or implement exponential backoff
int maxRetries = 3;
for (int i = 0; i < maxRetries; i++) {
    try {
        // Execute update
        break;
    } catch (SQLException e) {
        if (e.getMessage().contains("SQLITE_BUSY") && i < maxRetries - 1) {
            Thread.sleep((long) Math.pow(2, i) * 100); // 100ms, 200ms, 400ms
        } else {
            throw e;
        }
    }
}
```

**File Location Strategies:**

| Location | Path | Pros | Cons |
|----------|------|------|------|
| **Plugin data folder** | `plugins/MyPlugin/data.db` | Isolated, easy backup | Each plugin has separate DB |
| **Central location** | `plugins/SharedData/network.db` | Shared across plugins | Permission issues, coupling |
| **Server root** | `server/global.db` | Accessible to all | Clutters root, backup complexity |

**Recommendation:** Plugin data folder for isolation, use MySQL for cross-plugin data sharing.

### 1.3 MySQL/MariaDB for Networks

**When MySQL/MariaDB is Mandatory:**
- **Multi-server networks** (BungeeCord, Velocity)
- **High concurrent writes** (economy transactions, combat logs)
- **Cross-plugin data sharing** (permissions, economy, chat)
- **Data requiring ACID guarantees** (money transfers, inventory transactions)

**MySQL vs MariaDB:**

| Feature | MySQL 8.0+ | MariaDB 10.11+ | Winner |
|---------|-----------|----------------|--------|
| **Performance** | Excellent | Excellent | Tie |
| **JSON Support** | Native JSON type | JSON as alias to LONGTEXT | MySQL |
| **Window Functions** | Full support | Full support | Tie |
| **Licensing** | GPL (Oracle-owned) | GPL (Community-driven) | MariaDB (trust) |
| **Default Config** | More conservative | More optimized | MariaDB |
| **Thread Pool** | Enterprise only | Free in all versions | MariaDB |
| **Replication** | Group replication | Galera Cluster | MariaDB (easier) |

**Recommendation:** MariaDB for new projects, MySQL if already standardized.

**Character Set: UTF8MB4 is Non-Negotiable**

```sql
-- ❌ WRONG: utf8 (only supports 3-byte characters, no emoji)
CREATE TABLE players (
    username VARCHAR(16) CHARACTER SET utf8
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ✅ CORRECT: utf8mb4 (supports 4-byte characters, emoji, all Unicode)
CREATE TABLE players (
    username VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Why this matters:**
- Player names with emoji: `Steve😎`
- Chat messages with symbols: `¯\_(ツ)_/¯`
- Unicode characters: Chinese, Arabic, Emoji, etc.

**Common AI Mistake #2: Using utf8 instead of utf8mb4**

This causes:
```
Player joins with name "Alex🎮"
→ SQLException: Incorrect string value: '\xF0\x9F\x8E\xAE' for column 'username'
→ Player data not saved
→ Data loss
```

**InnoDB vs MyISAM: Why InnoDB is Mandatory**

| Feature | InnoDB | MyISAM | Critical for Plugins? |
|---------|--------|--------|----------------------|
| **ACID Transactions** | ✓ Full support | ✗ No transactions | ✓✓ YES (money transfers) |
| **Foreign Keys** | ✓ Enforced | ✗ Not enforced | ✓ YES (data integrity) |
| **Row-level Locking** | ✓ Concurrent writes | ✗ Table-level locks | ✓✓ YES (performance) |
| **Crash Recovery** | ✓ Automatic | ✗ Manual repair | ✓✓ YES (data safety) |
| **Full-text Search** | ✓ (5.6+) | ✓ | ✗ Rarely needed |

**Never use MyISAM for plugin data.** Period.

**Connection Pool Sizing Formula**

**Formula:**
```
pool_size = (core_count × 2) + effective_spindle_count
```

**For SSDs (most modern servers):**
```
pool_size = (core_count × 2) + 1
```

**Real-World Examples:**

**Example 1: Single Server, 50 Players**
- Server: 4 CPU cores, SSD
- Calculation: (4 × 2) + 1 = **9 connections**
- Configuration:
```java
config.setMaximumPoolSize(10); // Round up for safety
config.setMinimumIdle(3);      // 30% of max
```

**Example 2: BungeeCord Network, 500 Players, 5 Servers**

**Option A: Each server connects to shared MySQL**
- Each server: 4 cores, SSD
- Per-server pool: (4 × 2) + 1 = 9
- Total connections: 5 × 9 = **45 connections**
- MySQL `max_connections` should be: 45 + 20 (buffer) = **65**

```properties
# MySQL my.cnf
max_connections = 100
```

**Option B: Proxy connects, game servers don't**
- Proxy handles all DB operations
- Proxy: 8 cores, SSD
- Pool size: (8 × 2) + 1 = **17 connections**

**Recommendation:** Option A (each server has own pool) for:
- Fault isolation (one server crash doesn't affect others)
- Lower latency (direct connection vs proxy RPC)
- Simpler architecture

**Connection Pool Configuration (HikariCP):**

```java
HikariConfig config = new HikariConfig();

// Basic connection
config.setJdbcUrl("jdbc:mysql://localhost:3306/minecraft");
config.setUsername("minecraft_user");
config.setPassword("strong_password_here");

// Pool sizing
config.setMaximumPoolSize(10);
config.setMinimumIdle(3);

// Timeouts
config.setConnectionTimeout(30000);      // 30 seconds to get connection
config.setIdleTimeout(600000);           // 10 minutes idle before eviction
config.setMaxLifetime(1800000);          // 30 minutes max connection life

// Validation
config.setConnectionTestQuery("SELECT 1");
config.setValidationTimeout(5000);       // 5 seconds to validate

// Leak detection (CRITICAL for debugging)
config.setLeakDetectionThreshold(60000); // Warn if connection held > 60s

// Performance
config.addDataSourceProperty("cachePrepStmts", "true");
config.addDataSourceProperty("prepStmtCacheSize", "250");
config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
config.addDataSourceProperty("useServerPrepStmts", "true");
config.addDataSourceProperty("useLocalSessionState", "true");
config.addDataSourceProperty("rewriteBatchedStatements", "true");
config.addDataSourceProperty("cacheResultSetMetadata", "true");
config.addDataSourceProperty("cacheServerConfiguration", "true");
config.addDataSourceProperty("elideSetAutoCommits", "true");
config.addDataSourceProperty("maintainTimeStats", "false");

HikariDataSource dataSource = new HikariDataSource(config);
```

**SSL/TLS Configuration:**

**When SSL is required:**
- Database on different physical server
- Database on cloud provider (AWS RDS, Google Cloud SQL)
- Compliance requirements (GDPR, PCI-DSS)
- Public network between app and DB

**How to configure:**

```java
config.setJdbcUrl("jdbc:mysql://db.example.com:3306/minecraft?useSSL=true&requireSSL=true");

// For self-signed certificates
config.addDataSourceProperty("trustCertificateKeyStoreUrl", "file:/path/to/truststore.jks");
config.addDataSourceProperty("trustCertificateKeyStorePassword", "password");
```

**MySQL Server SSL Configuration:**

```sql
-- Verify SSL is enabled
SHOW VARIABLES LIKE '%ssl%';

-- Require SSL for specific user
ALTER USER 'minecraft_user'@'%' REQUIRE SSL;
```

### 1.4 PostgreSQL Considerations

**When PostgreSQL is the Best Choice:**
- **Advanced analytics** (window functions, CTEs, complex aggregations)
- **Full-text search** without external search engine
- **JSONB storage** for flexible schemas (inventory data, metadata)
- **Geospatial data** (server locations, world coordinates with PostGIS)
- **Audit logging** (superior logging and replay capabilities)

**PostgreSQL Advantages over MySQL:**

| Feature | PostgreSQL | MySQL | Use Case |
|---------|-----------|-------|----------|
| **JSONB** | Native binary JSON, indexed | JSON stored as text | Inventory snapshots, metadata |
| **Arrays** | Native array type | Must normalize or serialize | Player permissions array |
| **Full-text search** | Built-in, powerful | Basic, requires workarounds | Chat log search |
| **Window functions** | More complete | Good but fewer features | Leaderboards, statistics |
| **UPSERT** | `ON CONFLICT` clause | `ON DUPLICATE KEY UPDATE` | Both good |
| **Extensions** | Rich ecosystem (PostGIS, pg_trgm) | Limited | Advanced features |

**Example: Inventory Storage with JSONB**

```sql
CREATE TABLE inventory_snapshots (
    id SERIAL PRIMARY KEY,
    player_uuid UUID NOT NULL,
    snapshot_type VARCHAR(20) NOT NULL, -- 'death', 'backup', 'rollback'
    inventory_data JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Index on JSONB for fast queries
    INDEX idx_inventory_data_gin (inventory_data USING GIN)
);

-- Store inventory
INSERT INTO inventory_snapshots (player_uuid, snapshot_type, inventory_data)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'death',
    '{
        "armor": [
            {"slot": 0, "type": "DIAMOND_HELMET", "enchants": {"protection": 4}},
            {"slot": 1, "type": "DIAMOND_CHESTPLATE", "enchants": {"protection": 4}}
        ],
        "inventory": [
            {"slot": 0, "type": "DIAMOND_SWORD", "amount": 1}
        ]
    }'
);

-- Query: Find all deaths with diamond swords
SELECT player_uuid, created_at
FROM inventory_snapshots
WHERE inventory_data @> '{"inventory": [{"type": "DIAMOND_SWORD"}]}';
```

**Connection Pool Configuration for PostgreSQL:**

```java
HikariConfig config = new HikariConfig();
config.setJdbcUrl("jdbc:postgresql://localhost:5432/minecraft");
config.setUsername("minecraft_user");
config.setPassword("strong_password_here");
config.setDriverClassName("org.postgresql.Driver");

// Pool sizing (same formula as MySQL)
config.setMaximumPoolSize(10);
config.setMinimumIdle(3);

// PostgreSQL-specific optimizations
config.addDataSourceProperty("prepareThreshold", "3");
config.addDataSourceProperty("preparedStatementCacheQueries", "250");
config.addDataSourceProperty("preparedStatementCacheSizeMiB", "5");

HikariDataSource dataSource = new HikariDataSource(config);
```

### 1.5 Redis for Caching/Sync

**When Redis is the Perfect Choice:**
- **Session data** (online players, temporary state)
- **Cache layer** (frequently accessed data)
- **Cross-server pub/sub** (cache invalidation, real-time sync)
- **TTL-based data** (kit cooldowns, mutes, temporary permissions)
- **Leaderboards** (sorted sets for rankings)
- **Rate limiting** (login attempts, command spam)

**Redis Data Structure Selection:**

| Use Case | Redis Type | Example | Why |
|----------|-----------|---------|-----|
| **Player session** | Hash | `HSET session:uuid field value` | Multiple fields per player |
| **Online players** | Set | `SADD online:lobby uuid` | Fast membership test |
| **Kit cooldown** | String with TTL | `SETEX cooldown:uuid:kit 3600 "1"` | Auto-expiration |
| **Leaderboard** | Sorted Set | `ZADD kills uuid 150` | O(log N) ranking |
| **Cache** | String | `SET cache:player:uuid data EX 300` | Simple key-value |
| **Pub/Sub** | Channel | `PUBLISH invalidate "player:uuid"` | Real-time events |
| **Queue** | List | `LPUSH queue:teleport data` | FIFO processing |

**Example: Cross-Server Cache Invalidation**

```java
// Server A: Update database and invalidate cache
public void updateBalance(UUID uuid, double newBalance) {
    // 1. Update MySQL
    try (Connection conn = dataSource.getConnection()) {
        PreparedStatement stmt = conn.prepareStatement(
            "UPDATE player_balances SET balance = ? WHERE uuid = ?"
        );
        stmt.setDouble(1, newBalance);
        stmt.setString(2, uuid.toString());
        stmt.executeUpdate();
    }
    
    // 2. Update local cache
    balanceCache.put(uuid, newBalance);
    
    // 3. Invalidate cache on other servers
    redis.publish("cache:invalidate", "balance:" + uuid);
}

// Server B, C, D, E: Listen for invalidation
redis.subscribe(new JedisPubSub() {
    @Override
    public void onMessage(String channel, String message) {
        if (channel.equals("cache:invalidate") && message.startsWith("balance:")) {
            UUID uuid = UUID.fromString(message.substring(8));
            balanceCache.remove(uuid); // Evict from local cache
        }
    }
}, "cache:invalidate");
```

**Redis Connection Pooling (Jedis):**

```java
JedisPoolConfig poolConfig = new JedisPoolConfig();
poolConfig.setMaxTotal(20);           // Max connections
poolConfig.setMaxIdle(10);            // Max idle connections
poolConfig.setMinIdle(5);             // Min idle connections
poolConfig.setTestOnBorrow(true);     // Test connection before use
poolConfig.setTestOnReturn(true);     // Test connection on return
poolConfig.setTestWhileIdle(true);    // Test idle connections
poolConfig.setBlockWhenExhausted(true); // Block when no connections available

JedisPool jedisPool = new JedisPool(
    poolConfig,
    "localhost",  // Redis host
    6379,         // Redis port
    2000,         // Connection timeout (ms)
    "password"    // Redis password (null if none)
);

// Usage
try (Jedis jedis = jedisPool.getResource()) {
    jedis.set("key", "value");
}
```

**Redis Persistence Configuration:**

```conf
# redis.conf

# RDB Snapshots (point-in-time backups)
save 900 1      # Save if 1 key changed in 15 minutes
save 300 10     # Save if 10 keys changed in 5 minutes
save 60 10000   # Save if 10000 keys changed in 1 minute

# AOF (Append-Only File) - recommended for critical data
appendonly yes
appendfsync everysec  # Fsync every second (good performance/durability balance)

# Memory policy when maxmemory is reached
maxmemory 256mb
maxmemory-policy allkeys-lru  # Evict least recently used keys
```

---

## 2. Schema Design Patterns

### 2.1 Player Data Table (Foundation)

**The Universal Player Data Table:**

```sql
CREATE TABLE player_data (
    -- Primary identifier: UUID (NOT auto-increment ID)
    -- UUIDs are portable, globally unique, and prevent ID conflicts in merged databases
    uuid CHAR(36) NOT NULL PRIMARY KEY,
    
    -- Player identity
    username VARCHAR(16) NOT NULL,
    display_name VARCHAR(32),  -- Supports nicknames, colored names
    
    -- Timestamps for auditing
    first_join TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_join TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_quit TIMESTAMP NULL,
    
    -- Play time tracking
    total_playtime BIGINT NOT NULL DEFAULT 0,  -- Milliseconds
    
    -- Soft delete support (never hard delete player data)
    deleted_at TIMESTAMP NULL,
    
    -- Metadata (JSON for flexible extensions without schema changes)
    metadata JSON,
    
    -- Version tracking for optimistic locking
    version INT NOT NULL DEFAULT 1,
    
    -- Indexes
    INDEX idx_username (username),
    INDEX idx_last_join (last_join),
    INDEX idx_deleted_at (deleted_at)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Column Design Rationale:**

**Why UUID as PRIMARY KEY instead of auto-increment ID?**

```sql
-- ❌ WRONG: Auto-increment ID
CREATE TABLE player_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL UNIQUE,
    ...
);

-- Problems:
-- 1. ID collision when merging databases from multiple servers
-- 2. Extra index overhead (both ID and UUID indexed)
-- 3. Foreign keys reference meaningless ID instead of portable UUID
-- 4. Sequential IDs leak information (player count, join order)
```

```sql
-- ✅ CORRECT: UUID as PRIMARY KEY
CREATE TABLE player_data (
    uuid CHAR(36) NOT NULL PRIMARY KEY,
    ...
);

-- Benefits:
-- 1. Globally unique, no collisions
-- 2. Can generate client-side (offline mode UUIDs)
-- 3. Portable across database migrations
-- 4. Foreign keys use meaningful identifier
```

**UUID Storage Format:**

| Format | Storage | Example | Index Performance |
|--------|---------|---------|-------------------|
| `CHAR(36)` | 36 bytes | `550e8400-e29b-41d4-a716-446655440000` | Good |
| `BINARY(16)` | 16 bytes | Binary representation | Excellent |
| `VARCHAR(36)` | 37+ bytes | With length prefix | Poor |

**Recommendation:** `CHAR(36)` for readability, `BINARY(16)` for maximum performance.

**Conversion functions for BINARY(16):**

```sql
-- MySQL function to convert string UUID to binary
DELIMITER $$
CREATE FUNCTION UuidToBin(uuid CHAR(36))
RETURNS BINARY(16)
DETERMINISTIC
BEGIN
    RETURN UNHEX(CONCAT(
        SUBSTR(uuid, 15, 4),
        SUBSTR(uuid, 10, 4),
        SUBSTR(uuid, 1, 8),
        SUBSTR(uuid, 20, 4),
        SUBSTR(uuid, 25)
    ));
END$$
DELIMITER ;

-- Usage
INSERT INTO player_data (uuid, username) VALUES (UuidToBin('550e8400-e29b-41d4-a716-446655440000'), 'Steve');
```

**Why `deleted_at` instead of hard delete?**

```sql
-- ❌ WRONG: Hard delete
DELETE FROM player_data WHERE uuid = '...';

-- Problems:
-- 1. Data lost forever, no recovery
-- 2. Foreign key constraints violated
-- 3. No audit trail
-- 4. GDPR requires ability to restore within certain period
```

```sql
-- ✅ CORRECT: Soft delete
UPDATE player_data SET deleted_at = CURRENT_TIMESTAMP WHERE uuid = '...';

-- Benefits:
-- 1. Can restore accidentally deleted data
-- 2. Maintains foreign key integrity
-- 3. Audit trail preserved
-- 4. Query active players: WHERE deleted_at IS NULL
```

**Metadata JSON field usage:**

```sql
-- Store flexible data without schema changes
UPDATE player_data 
SET metadata = JSON_SET(
    COALESCE(metadata, '{}'),
    '$.discord_id', '123456789',
    '$.locale', 'en_US',
    '$.preferences.chat_color', 'blue'
)
WHERE uuid = '...';

-- Query JSON data
SELECT username, metadata->>'$.discord_id' AS discord_id
FROM player_data
WHERE metadata->>'$.locale' = 'en_US';
```

**Version column for optimistic locking:**

```java
// Prevents race conditions in concurrent updates
public boolean updateBalance(UUID uuid, double oldBalance, double newBalance) {
    String sql = "UPDATE player_data SET balance = ?, version = version + 1 " +
                 "WHERE uuid = ? AND balance = ? AND version = ?";
    
    try (PreparedStatement stmt = conn.prepareStatement(sql)) {
        stmt.setDouble(1, newBalance);
        stmt.setString(2, uuid.toString());
        stmt.setDouble(3, oldBalance);
        stmt.setInt(4, currentVersion);
        
        int rowsAffected = stmt.executeUpdate();
        return rowsAffected > 0; // Returns false if concurrent modification occurred
    }
}
```

### 2.2 Plugin-Specific Schemas

#### A) Economy System

```sql
-- Player balances table
CREATE TABLE player_balances (
    uuid CHAR(36) NOT NULL PRIMARY KEY,
    balance DECIMAL(19, 2) NOT NULL DEFAULT 0.00,  -- DECIMAL for exact precision
    
    -- Multi-currency support
    currency_type VARCHAR(20) NOT NULL DEFAULT 'default',
    
    -- Overdraft protection
    min_balance DECIMAL(19, 2) NOT NULL DEFAULT 0.00,
    
    -- Last transaction timestamp
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Version for optimistic locking
    version INT NOT NULL DEFAULT 1,
    
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    INDEX idx_balance (balance DESC),  -- For leaderboards
    INDEX idx_updated_at (updated_at),
    UNIQUE KEY unique_player_currency (uuid, currency_type)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transaction audit log (IMMUTABLE - never update or delete)
CREATE TABLE balance_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Transaction participants
    from_uuid CHAR(36),  -- NULL for system transactions
    to_uuid CHAR(36),    -- NULL for system transactions
    
    -- Transaction details
    amount DECIMAL(19, 2) NOT NULL,
    currency_type VARCHAR(20) NOT NULL DEFAULT 'default',
    transaction_type VARCHAR(20) NOT NULL,  -- 'transfer', 'deposit', 'withdraw', 'purchase'
    
    -- Context
    reason VARCHAR(255),  -- 'shop_purchase', 'player_transfer', 'admin_grant'
    metadata JSON,        -- Additional context (item purchased, shop name, etc.)
    
    -- Balances after transaction (for reconciliation)
    from_balance_after DECIMAL(19, 2),
    to_balance_after DECIMAL(19, 2),
    
    -- Timestamp (immutable, no ON UPDATE)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Server that processed transaction (for multi-server debugging)
    server_id VARCHAR(50),
    
    INDEX idx_from_uuid (from_uuid, created_at),
    INDEX idx_to_uuid (to_uuid, created_at),
    INDEX idx_created_at (created_at),
    INDEX idx_transaction_type (transaction_type),
    
    FOREIGN KEY (from_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL,
    FOREIGN KEY (to_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Why DECIMAL(19, 2) instead of DOUBLE?**

```sql
-- ❌ WRONG: DOUBLE for money
balance DOUBLE

-- Problems with floating point:
SELECT 0.1 + 0.2;  -- Returns 0.30000000000000004
-- Results in:
-- - Rounding errors accumulate
-- - Transactions don't balance
-- - Audit trail shows discrepancies
```

```sql
-- ✅ CORRECT: DECIMAL for exact precision
balance DECIMAL(19, 2)

-- DECIMAL(19, 2) means:
-- - 19 total digits
-- - 2 digits after decimal point
-- - Max value: 99,999,999,999,999,999.99
-- - Exact arithmetic, no rounding errors
```

**Transaction Pattern with Audit Log:**

```java
public boolean transferMoney(UUID from, UUID to, double amount, String reason) {
    try (Connection conn = dataSource.getConnection()) {
        conn.setAutoCommit(false);
        
        try {
            // 1. Deduct from sender
            PreparedStatement deduct = conn.prepareStatement(
                "UPDATE player_balances SET balance = balance - ?, version = version + 1 " +
                "WHERE uuid = ? AND balance >= ?"
            );
            deduct.setDouble(1, amount);
            deduct.setString(2, from.toString());
            deduct.setDouble(3, amount);
            
            if (deduct.executeUpdate() == 0) {
                conn.rollback();
                return false; // Insufficient funds
            }
            
            // 2. Add to recipient
            PreparedStatement add = conn.prepareStatement(
                "UPDATE player_balances SET balance = balance + ?, version = version + 1 " +
                "WHERE uuid = ?"
            );
            add.setDouble(1, amount);
            add.setString(2, to.toString());
            add.executeUpdate();
            
            // 3. Get final balances
            double fromBalance = getBalance(conn, from);
            double toBalance = getBalance(conn, to);
            
            // 4. Record transaction in audit log
            PreparedStatement audit = conn.prepareStatement(
                "INSERT INTO balance_transactions " +
                "(from_uuid, to_uuid, amount, transaction_type, reason, from_balance_after, to_balance_after, server_id) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            );
            audit.setString(1, from.toString());
            audit.setString(2, to.toString());
            audit.setDouble(3, amount);
            audit.setString(4, "transfer");
            audit.setString(5, reason);
            audit.setDouble(6, fromBalance);
            audit.setDouble(7, toBalance);
            audit.setString(8, getServerId());
            audit.executeUpdate();
            
            conn.commit();
            return true;
            
        } catch (SQLException e) {
            conn.rollback();
            throw e;
        } finally {
            conn.setAutoCommit(true);
        }
    }
}
```

#### B) Homes/Warps System

```sql
CREATE TABLE player_homes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Owner
    uuid CHAR(36) NOT NULL,
    
    -- Home identifier
    home_name VARCHAR(32) NOT NULL,
    
    -- Location data
    world VARCHAR(64) NOT NULL,
    x DOUBLE NOT NULL,
    y DOUBLE NOT NULL,
    z DOUBLE NOT NULL,
    yaw FLOAT NOT NULL DEFAULT 0,
    pitch FLOAT NOT NULL DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Constraints
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    UNIQUE KEY unique_player_home (uuid, home_name),
    
    -- Indexes for queries
    INDEX idx_uuid (uuid),
    INDEX idx_world (world)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enforce max homes per player using trigger
DELIMITER $$
CREATE TRIGGER enforce_max_homes
BEFORE INSERT ON player_homes
FOR EACH ROW
BEGIN
    DECLARE home_count INT;
    DECLARE max_homes INT;
    
    -- Get current home count
    SELECT COUNT(*) INTO home_count
    FROM player_homes
    WHERE uuid = NEW.uuid;
    
    -- Get max homes for player (from permissions or config)
    -- This example uses a fixed limit; in production, query from permissions table
    SET max_homes = 5;
    
    IF home_count >= max_homes THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Maximum number of homes reached';
    END IF;
END$$
DELIMITER ;

-- Server warps (public teleport locations)
CREATE TABLE server_warps (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Warp identifier (unique name)
    warp_name VARCHAR(32) NOT NULL UNIQUE,
    
    -- Location
    world VARCHAR(64) NOT NULL,
    x DOUBLE NOT NULL,
    y DOUBLE NOT NULL,
    z DOUBLE NOT NULL,
    yaw FLOAT NOT NULL DEFAULT 0,
    pitch FLOAT NOT NULL DEFAULT 0,
    
    -- Access control
    permission VARCHAR(64),  -- Required permission, NULL = public
    
    -- Display
    display_name VARCHAR(64),
    description TEXT,
    icon VARCHAR(64),  -- Material name for GUI
    
    -- Metadata
    created_by CHAR(36),  -- UUID of creator
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES player_data(uuid) ON DELETE SET NULL,
    INDEX idx_warp_name (warp_name),
    INDEX idx_permission (permission)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Spatial Indexing for Location-Based Queries:**

If you need to find homes/warps within a radius:

```sql
-- Add spatial columns (MySQL 5.7+, MariaDB 10.2+)
ALTER TABLE player_homes ADD COLUMN location POINT NOT NULL;
ALTER TABLE player_homes ADD SPATIAL INDEX idx_location (location);

-- Update trigger to maintain POINT column
DELIMITER $$
CREATE TRIGGER update_location_point
BEFORE INSERT ON player_homes
FOR EACH ROW
BEGIN
    SET NEW.location = POINT(NEW.x, NEW.z);
END$$
DELIMITER ;

-- Query: Find homes within 100 blocks of (x=1000, z=2000)
SELECT home_name, 
       ST_Distance_Sphere(location, POINT(1000, 2000)) AS distance
FROM player_homes
WHERE ST_Distance_Sphere(location, POINT(1000, 2000)) <= 100
ORDER BY distance;
```

#### C) Punishments (Bans/Mutes/Warns)

```sql
CREATE TABLE punishments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Target player
    target_uuid CHAR(36) NOT NULL,
    target_username VARCHAR(16) NOT NULL,  -- Denormalized for history
    
    -- Punishment type
    punishment_type ENUM('BAN', 'TEMPBAN', 'MUTE', 'TEMPMUTE', 'WARN', 'KICK') NOT NULL,
    
    -- Issuer
    issuer_uuid CHAR(36),  -- NULL for console
    issuer_username VARCHAR(16),
    
    -- Details
    reason TEXT NOT NULL,
    proof_url VARCHAR(255),  -- Link to screenshots, videos
    
    -- Timing
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,  -- NULL = permanent
    
    -- Status
    active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Revocation (if unbanned/unmuted early)
    revoked_at TIMESTAMP NULL,
    revoked_by_uuid CHAR(36),
    revoked_reason TEXT,
    
    -- Server context
    server_id VARCHAR(50),
    
    -- Indexes
    INDEX idx_target_active (target_uuid, active, expires_at),
    INDEX idx_target_type (target_uuid, punishment_type),
    INDEX idx_issued_at (issued_at),
    INDEX idx_expires_at (expires_at),
    INDEX idx_issuer (issuer_uuid),
    
    FOREIGN KEY (target_uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    FOREIGN KEY (issuer_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL,
    FOREIGN KEY (revoked_by_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Punishment appeals table
CREATE TABLE punishment_appeals (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    punishment_id BIGINT NOT NULL,
    
    -- Appeal content
    appeal_text TEXT NOT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Status
    status ENUM('PENDING', 'ACCEPTED', 'DENIED') NOT NULL DEFAULT 'PENDING',
    
    -- Response
    reviewed_by_uuid CHAR(36),
    reviewed_at TIMESTAMP NULL,
    response_text TEXT,
    
    FOREIGN KEY (punishment_id) REFERENCES punishments(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL,
    
    INDEX idx_status (status),
    INDEX idx_punishment (punishment_id)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Query: Check if player is currently banned**

```sql
-- Efficient query using composite index
SELECT id, reason, expires_at
FROM punishments
WHERE target_uuid = ?
  AND punishment_type IN ('BAN', 'TEMPBAN')
  AND active = TRUE
  AND (expires_at IS NULL OR expires_at > NOW())
LIMIT 1;
```

**Automatic Expiration via Event Scheduler:**

```sql
-- Enable event scheduler
SET GLOBAL event_scheduler = ON;

-- Create event to auto-expire punishments
DELIMITER $$
CREATE EVENT expire_punishments
ON SCHEDULE EVERY 1 MINUTE
DO
BEGIN
    UPDATE punishments
    SET active = FALSE
    WHERE active = TRUE
      AND expires_at IS NOT NULL
      AND expires_at <= NOW();
END$$
DELIMITER ;
```

#### D) Statistics System

**Option 1: Wide Table (Simple, Limited Scalability)**

```sql
CREATE TABLE player_statistics (
    uuid CHAR(36) NOT NULL PRIMARY KEY,
    
    -- Combat stats
    kills INT NOT NULL DEFAULT 0,
    deaths INT NOT NULL DEFAULT 0,
    player_kills INT NOT NULL DEFAULT 0,
    mob_kills INT NOT NULL DEFAULT 0,
    
    -- Mining stats
    blocks_broken INT NOT NULL DEFAULT 0,
    blocks_placed INT NOT NULL DEFAULT 0,
    diamonds_mined INT NOT NULL DEFAULT 0,
    
    -- Movement stats
    distance_walked BIGINT NOT NULL DEFAULT 0,
    distance_flown BIGINT NOT NULL DEFAULT 0,
    
    -- Add more stats as needed (can become unwieldy)
    -- ...
    
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    INDEX idx_kills (kills DESC),
    INDEX idx_deaths (deaths DESC)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Pros:**
- Simple schema
- Fast queries for specific stats
- Easy to add indexes for leaderboards

**Cons:**
- Schema changes required for new stat types
- Sparse data (many NULL or 0 values)
- Limited flexibility

**Option 2: EAV (Entity-Attribute-Value) Pattern (Flexible, Complex Queries)**

```sql
CREATE TABLE player_statistics_eav (
    uuid CHAR(36) NOT NULL,
    stat_key VARCHAR(64) NOT NULL,
    stat_value BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (uuid, stat_key),
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    INDEX idx_stat_key (stat_key, stat_value DESC)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert/update stat
INSERT INTO player_statistics_eav (uuid, stat_key, stat_value)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'kills', 1)
ON DUPLICATE KEY UPDATE 
    stat_value = stat_value + VALUES(stat_value),
    updated_at = CURRENT_TIMESTAMP;

-- Query: Get all stats for a player
SELECT stat_key, stat_value
FROM player_statistics_eav
WHERE uuid = '550e8400-e29b-41d4-a716-446655440000';

-- Query: Get leaderboard for specific stat
SELECT p.username, s.stat_value
FROM player_statistics_eav s
JOIN player_data p ON s.uuid = p.uuid
WHERE s.stat_key = 'kills'
ORDER BY s.stat_value DESC
LIMIT 10;
```

**Pros:**
- No schema changes for new stats
- Flexible, extensible
- Sparse data handled efficiently

**Cons:**
- More complex queries (JOINs required)
- Harder to enforce data types
- Index per stat type needed for performance

**Recommendation:** Use **wide table** for fixed, known stats (kills, deaths, playtime). Use **EAV** for dynamic, plugin-specific stats.

#### E) Inventory Snapshots

```sql
CREATE TABLE inventory_snapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Owner
    uuid CHAR(36) NOT NULL,
    
    -- Snapshot metadata
    snapshot_type VARCHAR(20) NOT NULL,  -- 'death', 'backup', 'creative_switch'
    snapshot_name VARCHAR(64),           -- User-defined name for manual backups
    
    -- Inventory data (serialized)
    inventory_data MEDIUMBLOB NOT NULL,  -- Base64 encoded ItemStack array
    armor_data BLOB,                     -- Armor contents
    offhand_data BLOB,                   -- Offhand item
    
    -- Context
    world VARCHAR(64),
    x DOUBLE, y DOUBLE, z DOUBLE,
    
    -- Timing
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Restore tracking
    restored_at TIMESTAMP NULL,
    restored_by_uuid CHAR(36),
    
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    FOREIGN KEY (restored_by_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL,
    
    INDEX idx_uuid_type (uuid, snapshot_type, created_at),
    INDEX idx_created_at (created_at)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Automatically delete old snapshots (keep last 10 per player per type)
DELIMITER $$
CREATE EVENT cleanup_old_snapshots
ON SCHEDULE EVERY 1 HOUR
DO
BEGIN
    DELETE FROM inventory_snapshots
    WHERE id NOT IN (
        SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY uuid, snapshot_type ORDER BY created_at DESC) AS rn
            FROM inventory_snapshots
        ) ranked
        WHERE rn <= 10
    );
END$$
DELIMITER ;
```

**Serialization Strategy:**

```java
// Serialize inventory to Base64
public String serializeInventory(ItemStack[] items) {
    try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
         BukkitObjectOutputStream dataOutput = new BukkitObjectOutputStream(outputStream)) {
        
        dataOutput.writeInt(items.length);
        for (ItemStack item : items) {
            dataOutput.writeObject(item);
        }
        
        return Base64.getEncoder().encodeToString(outputStream.toByteArray());
        
    } catch (IOException e) {
        throw new RuntimeException("Failed to serialize inventory", e);
    }
}

// Deserialize from Base64
public ItemStack[] deserializeInventory(String data) {
    try (ByteArrayInputStream inputStream = new ByteArrayInputStream(Base64.getDecoder().decode(data));
         BukkitObjectInputStream dataInput = new BukkitObjectInputStream(inputStream)) {
        
        int length = dataInput.readInt();
        ItemStack[] items = new ItemStack[length];
        
        for (int i = 0; i < length; i++) {
            items[i] = (ItemStack) dataInput.readObject();
        }
        
        return items;
        
    } catch (IOException | ClassNotFoundException e) {
        throw new RuntimeException("Failed to deserialize inventory", e);
    }
}
```

**Alternative: JSON Storage (PostgreSQL JSONB)**

```sql
-- PostgreSQL version with JSONB
CREATE TABLE inventory_snapshots (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL,
    snapshot_type VARCHAR(20) NOT NULL,
    inventory_data JSONB NOT NULL,  -- Store as JSON
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE
);

-- Index for JSON queries
CREATE INDEX idx_inventory_data ON inventory_snapshots USING GIN (inventory_data);

-- Query: Find snapshots containing diamond swords
SELECT uuid, created_at
FROM inventory_snapshots
WHERE inventory_data @> '[{"type": "DIAMOND_SWORD"}]';
```

### 2.3 Index Strategy

**Types of Indexes:**

| Index Type | Use Case | Example | Performance |
|-----------|----------|---------|-------------|
| **PRIMARY KEY** | Unique identifier | `uuid` | Clustered, fastest |
| **UNIQUE** | Unique constraint | `username` | Fast lookup |
| **INDEX** | Frequent WHERE/JOIN | `last_join` | Good for range queries |
| **COMPOSITE** | Multi-column queries | `(uuid, active, expires_at)` | Efficient for combined filters |
| **FULLTEXT** | Text search | `reason`, `description` | For LIKE '%term%' queries |
| **SPATIAL** | Geolocation | `POINT(x, z)` | Distance calculations |

**Index Design Rules:**

1. **Index columns used in WHERE clauses**
   ```sql
   -- Query
   SELECT * FROM punishments WHERE target_uuid = ? AND active = TRUE;
   
   -- Index
   INDEX idx_target_active (target_uuid, active)
   ```

2. **Index columns used in ORDER BY**
   ```sql
   -- Query
   SELECT * FROM player_balances ORDER BY balance DESC LIMIT 10;
   
   -- Index
   INDEX idx_balance (balance DESC)
   ```

3. **Index columns used in JOINs**
   ```sql
   -- Query
   SELECT p.username, b.balance
   FROM player_data p
   JOIN player_balances b ON p.uuid = b.uuid;
   
   -- Foreign key creates index automatically on b.uuid
   FOREIGN KEY (uuid) REFERENCES player_data(uuid)
   ```

4. **Composite index column order matters**
   ```sql
   -- ✅ GOOD: Selective columns first
   INDEX idx_punishment_lookup (target_uuid, active, punishment_type, expires_at)
   
   -- Can be used for:
   -- WHERE target_uuid = ?
   -- WHERE target_uuid = ? AND active = ?
   -- WHERE target_uuid = ? AND active = ? AND punishment_type = ?
   -- WHERE target_uuid = ? AND active = ? AND punishment_type = ? AND expires_at > ?
   
   -- ❌ BAD: Non-selective column first
   INDEX idx_punishment_bad (active, target_uuid)
   -- Less efficient for UUID lookups
   ```

5. **Don't over-index**
   ```sql
   -- ❌ TOO MANY INDEXES
   INDEX idx_username (username)
   INDEX idx_last_join (last_join)
   INDEX idx_username_last_join (username, last_join)
   INDEX idx_last_join_username (last_join, username)
   
   -- Every index:
   -- - Slows down INSERT/UPDATE/DELETE
   -- - Uses disk space
   -- - Needs maintenance
   
   -- ✅ BALANCED
   INDEX idx_username (username)
   INDEX idx_last_join (last_join)
   -- Composite only if specific query pattern exists
   ```

**Index Monitoring:**

```sql
-- MySQL: Find unused indexes
SELECT 
    t.TABLE_SCHEMA,
    t.TABLE_NAME,
    s.INDEX_NAME,
    s.COLUMN_NAME,
    s.SEQ_IN_INDEX
FROM information_schema.STATISTICS s
JOIN information_schema.TABLES t ON s.TABLE_SCHEMA = t.TABLE_SCHEMA 
                                  AND s.TABLE_NAME = t.TABLE_NAME
LEFT JOIN performance_schema.table_io_waits_summary_by_index_usage i 
    ON i.OBJECT_SCHEMA = s.TABLE_SCHEMA 
    AND i.OBJECT_NAME = s.TABLE_NAME 
    AND i.INDEX_NAME = s.INDEX_NAME
WHERE t.TABLE_SCHEMA = 'minecraft'
  AND s.INDEX_NAME != 'PRIMARY'
  AND (i.COUNT_STAR IS NULL OR i.COUNT_STAR = 0);

-- MySQL: Find duplicate indexes
SELECT 
    a.TABLE_SCHEMA,
    a.TABLE_NAME,
    a.INDEX_NAME AS index1,
    b.INDEX_NAME AS index2,
    a.COLUMN_NAME
FROM information_schema.STATISTICS a
JOIN information_schema.STATISTICS b 
    ON a.TABLE_SCHEMA = b.TABLE_SCHEMA
    AND a.TABLE_NAME = b.TABLE_NAME
    AND a.COLUMN_NAME = b.COLUMN_NAME
    AND a.SEQ_IN_INDEX = b.SEQ_IN_INDEX
    AND a.INDEX_NAME < b.INDEX_NAME
WHERE a.TABLE_SCHEMA = 'minecraft'
ORDER BY a.TABLE_NAME, a.INDEX_NAME;
```

### 2.4 Foreign Key Design

**Foreign Keys Enforce Referential Integrity:**

```sql
-- Without foreign key
CREATE TABLE player_homes (
    uuid CHAR(36) NOT NULL,
    home_name VARCHAR(32) NOT NULL
);

-- Problem: Orphaned records
DELETE FROM player_data WHERE uuid = '...';
-- player_homes still contains homes for deleted player
-- Queries return homes with no owner
-- Data inconsistency

-- With foreign key
CREATE TABLE player_homes (
    uuid CHAR(36) NOT NULL,
    home_name VARCHAR(32) NOT NULL,
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE
);

-- Benefit: Automatic cleanup
DELETE FROM player_data WHERE uuid = '...';
-- All homes for that player are automatically deleted
-- No orphaned records
```

**Foreign Key Actions:**

| Action | Behavior | Use Case |
|--------|----------|----------|
| **CASCADE** | Delete/update child rows | Delete player → delete all their data |
| **SET NULL** | Set foreign key to NULL | Delete admin → set `created_by` to NULL |
| **RESTRICT** | Prevent deletion if children exist | Prevent deleting player with active homes |
| **NO ACTION** | Same as RESTRICT | Default behavior |
| **SET DEFAULT** | Set to default value | Rarely used in MySQL |

**Examples:**

```sql
-- CASCADE: Delete player deletes all their homes
FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE

-- SET NULL: Delete issuer preserves punishment record
FOREIGN KEY (issuer_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL

-- RESTRICT: Cannot delete player with active balance
FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE RESTRICT
```

**Performance Considerations:**

```sql
-- Foreign keys automatically create indexes on child table
-- This is GOOD for JOIN performance but adds overhead

-- Example: This foreign key automatically indexes player_balances.uuid
FOREIGN KEY (uuid) REFERENCES player_data(uuid)

-- Verify index exists
SHOW INDEXES FROM player_balances WHERE Key_name LIKE '%uuid%';
```

**When to Skip Foreign Keys:**

1. **High-write tables** (audit logs, analytics)
   - Constraint checking adds latency
   - Handle referential integrity in application layer

2. **Temporary/staging tables**
   - Data will be cleaned up anyway

3. **Cross-database references**
   - Foreign keys don't work across databases
   - Use application-level checks

---

## 3. Migration & Versioning

### 3.1 Schema Evolution Strategy

**The Golden Rule: Forward-Only Migrations**

```
Never roll back database migrations in production.
Always migrate forward, even if it means writing a new migration to undo previous changes.
```

**Why?**
- Production data has evolved since migration
- Rollback may lose data
- Multiple servers may be at different migration states
- Easier to reason about linear history

**Migration Naming Convention:**

```
V001__initial_schema.sql
V002__add_player_balances.sql
V003__add_balance_transactions.sql
V004__add_punishment_appeals.sql
V005__add_inventory_snapshots_indexes.sql
```

Format: `V{version}__{description}.sql`
- Version: Zero-padded sequential number
- Description: Snake_case, descriptive

### 3.2 Migration Framework Implementation

**Database Schema Version Table:**

```sql
CREATE TABLE schema_migrations (
    version INT NOT NULL PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    script_name VARCHAR(255) NOT NULL,
    installed_by VARCHAR(100) NOT NULL,  -- Plugin name or username
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INT NOT NULL,
    checksum VARCHAR(64),  -- MD5/SHA256 of migration script
    success BOOLEAN NOT NULL DEFAULT TRUE,
    
    INDEX idx_installed_on (installed_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Java Migration Runner:**

```java
public class DatabaseMigrator {
    
    private final HikariDataSource dataSource;
    private final Logger logger;
    
    public DatabaseMigrator(HikariDataSource dataSource, Logger logger) {
        this.dataSource = dataSource;
        this.logger = logger;
    }
    
    public void migrate() throws SQLException {
        // 1. Ensure schema_migrations table exists
        createMigrationsTableIfNotExists();
        
        // 2. Get current version
        int currentVersion = getCurrentVersion();
        logger.info("Current database version: " + currentVersion);
        
        // 3. Get pending migrations
        List<Migration> pendingMigrations = getPendingMigrations(currentVersion);
        
        if (pendingMigrations.isEmpty()) {
            logger.info("Database is up to date.");
            return;
        }
        
        // 4. Execute migrations
        for (Migration migration : pendingMigrations) {
            executeMigration(migration);
        }
        
        logger.info("Database migration complete. New version: " + getCurrentVersion());
    }
    
    private void createMigrationsTableIfNotExists() throws SQLException {
        String sql = "CREATE TABLE IF NOT EXISTS schema_migrations (" +
                     "  version INT NOT NULL PRIMARY KEY," +
                     "  description VARCHAR(255) NOT NULL," +
                     "  script_name VARCHAR(255) NOT NULL," +
                     "  installed_by VARCHAR(100) NOT NULL," +
                     "  installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP," +
                     "  execution_time_ms INT NOT NULL," +
                     "  checksum VARCHAR(64)," +
                     "  success BOOLEAN NOT NULL DEFAULT TRUE" +
                     ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
        
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute(sql);
        }
    }
    
    private int getCurrentVersion() throws SQLException {
        String sql = "SELECT COALESCE(MAX(version), 0) FROM schema_migrations WHERE success = TRUE";
        
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            
            if (rs.next()) {
                return rs.getInt(1);
            }
            return 0;
        }
    }
    
    private List<Migration> getPendingMigrations(int currentVersion) {
        List<Migration> migrations = new ArrayList<>();
        
        // Load migration scripts from resources
        // Format: V001__initial_schema.sql, V002__add_balances.sql, etc.
        InputStream[] resources = getClass().getResourceAsStream("/migrations");
        
        // Parse and sort by version
        // Filter out versions <= currentVersion
        // Return list of pending migrations
        
        return migrations;
    }
    
    private void executeMigration(Migration migration) throws SQLException {
        logger.info("Executing migration: " + migration.getScriptName());
        long startTime = System.currentTimeMillis();
        
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            
            try {
                // Execute migration SQL
                try (Statement stmt = conn.createStatement()) {
                    String sql = migration.getSql();
                    
                    // Split by semicolon and execute each statement
                    for (String statement : sql.split(";")) {
                        if (!statement.trim().isEmpty()) {
                            stmt.execute(statement);
                        }
                    }
                }
                
                // Record successful migration
                long executionTime = System.currentTimeMillis() - startTime;
                recordMigration(conn, migration, executionTime, true);
                
                conn.commit();
                logger.info("Migration successful: " + migration.getScriptName() + 
                           " (" + executionTime + "ms)");
                
            } catch (SQLException e) {
                conn.rollback();
                
                // Record failed migration
                long executionTime = System.currentTimeMillis() - startTime;
                recordMigration(conn, migration, executionTime, false);
                
                logger.severe("Migration failed: " + migration.getScriptName());
                throw e;
                
            } finally {
                conn.setAutoCommit(true);
            }
        }
    }
    
    private void recordMigration(Connection conn, Migration migration, 
                                  long executionTime, boolean success) throws SQLException {
        String sql = "INSERT INTO schema_migrations " +
                     "(version, description, script_name, installed_by, execution_time_ms, checksum, success) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?)";
        
        try (PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setInt(1, migration.getVersion());
            stmt.setString(2, migration.getDescription());
            stmt.setString(3, migration.getScriptName());
            stmt.setString(4, "MyPlugin v1.0");
            stmt.setLong(5, executionTime);
            stmt.setString(6, migration.getChecksum());
            stmt.setBoolean(7, success);
            stmt.executeUpdate();
        }
    }
    
    // Migration class
    public static class Migration {
        private final int version;
        private final String description;
        private final String scriptName;
        private final String sql;
        private final String checksum;
        
        // Constructor, getters, checksum calculation...
    }
}
```

**Usage in Plugin:**

```java
public class MyPlugin extends JavaPlugin {
    
    private HikariDataSource dataSource;
    
    @Override
    public void onEnable() {
        // Initialize data source
        dataSource = createDataSource();
        
        // Run migrations
        try {
            DatabaseMigrator migrator = new DatabaseMigrator(dataSource, getLogger());
            migrator.migrate();
        } catch (SQLException e) {
            getLogger().severe("Database migration failed! Disabling plugin.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }
        
        // Continue plugin initialization...
    }
}
```

### 3.3 Data Preservation Rules

**Safe Schema Changes:**

| Operation | Safe? | Migration Strategy |
|-----------|-------|-------------------|
| **Add table** | ✅ Yes | Direct `CREATE TABLE` |
| **Add column** | ✅ Yes | `ALTER TABLE ADD COLUMN` with DEFAULT |
| **Add index** | ✅ Yes | `CREATE INDEX` (may lock table) |
| **Rename column** | ⚠️ Risky | Add new, copy data, deprecate old |
| **Remove column** | ❌ No | Mark deprecated, remove in future version |
| **Change column type** | ❌ No | Add new column, migrate data, swap |
| **Remove table** | ❌ No | Rename to `_deprecated`, remove later |

**Example: Adding a Column**

```sql
-- V010__add_player_locale.sql
ALTER TABLE player_data 
ADD COLUMN locale VARCHAR(10) DEFAULT 'en_US' NOT NULL;

-- Safe because:
-- 1. DEFAULT value provided (no NULL issues)
-- 2. NOT NULL enforced after DEFAULT
-- 3. Existing rows get 'en_US' automatically
```

**Example: Renaming a Column (Safe Method)**

```sql
-- V011__rename_balance_to_money.sql

-- Step 1: Add new column
ALTER TABLE player_balances 
ADD COLUMN money DECIMAL(19, 2) NOT NULL DEFAULT 0.00;

-- Step 2: Copy data
UPDATE player_balances SET money = balance;

-- Step 3: Add comment to old column (deprecation notice)
ALTER TABLE player_balances 
MODIFY COLUMN balance DECIMAL(19, 2) NOT NULL DEFAULT 0.00 
COMMENT 'DEPRECATED: Use money column instead. Will be removed in v2.0';

-- Step 4: In code, use money column
-- Step 5: In future migration (V020__remove_deprecated_balance.sql), remove balance column
```

**Example: Changing Column Type**

```sql
-- V012__uuid_to_binary.sql

-- ❌ WRONG: Direct type change loses data
ALTER TABLE player_data MODIFY COLUMN uuid BINARY(16);
-- Error: Data truncation or corruption

-- ✅ CORRECT: Add new column, migrate, swap

-- Step 1: Add new column
ALTER TABLE player_data ADD COLUMN uuid_binary BINARY(16);

-- Step 2: Migrate data
UPDATE player_data 
SET uuid_binary = UNHEX(REPLACE(uuid, '-', ''));

-- Step 3: Verify data integrity
SELECT COUNT(*) FROM player_data WHERE uuid_binary IS NULL;
-- Should be 0

-- Step 4: In next version, swap columns (requires downtime or careful coordination)
-- ALTER TABLE player_data DROP COLUMN uuid;
-- ALTER TABLE player_data CHANGE COLUMN uuid_binary uuid BINARY(16);
```

**Data Transformation Migrations:**

```sql
-- V013__split_display_name.sql

-- Scenario: Split display_name into first_name and last_name

-- Step 1: Add new columns
ALTER TABLE player_data 
ADD COLUMN first_name VARCHAR(16),
ADD COLUMN last_name VARCHAR(16);

-- Step 2: Migrate data (batch update for large tables)
UPDATE player_data 
SET 
    first_name = SUBSTRING_INDEX(display_name, ' ', 1),
    last_name = SUBSTRING_INDEX(display_name, ' ', -1)
WHERE display_name IS NOT NULL;

-- Step 3: Handle edge cases (single word names)
UPDATE player_data 
SET last_name = NULL
WHERE first_name = last_name;

-- Step 4: Verify
SELECT username, display_name, first_name, last_name 
FROM player_data 
LIMIT 10;
```

**Batch Processing for Large Tables:**

```java
// For tables with millions of rows, batch updates to avoid locking

public void batchMigration(Connection conn) throws SQLException {
    int batchSize = 1000;
    int offset = 0;
    
    while (true) {
        // Update in batches
        String sql = "UPDATE player_data " +
                     "SET new_column = FUNCTION(old_column) " +
                     "WHERE id >= ? AND id < ? " +
                     "AND new_column IS NULL";  // Only unmigrated rows
        
        try (PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setInt(1, offset);
            stmt.setInt(2, offset + batchSize);
            
            int rowsAffected = stmt.executeUpdate();
            
            if (rowsAffected == 0) {
                break; // All rows migrated
            }
            
            offset += batchSize;
            
            // Small delay to reduce load
            Thread.sleep(100);
        }
    }
}
```

---

## 4. Connection Management

### 4.1 Connection Pool Configuration

**Why Connection Pooling is Mandatory:**

```java
// ❌ WRONG: Create connection per query
public PlayerData getPlayer(UUID uuid) {
    try (Connection conn = DriverManager.getConnection(url, user, pass)) {
        // Query here
    }
}

// Problems:
// - TCP handshake: ~10-50ms per connection
// - SSL handshake: +50-100ms per connection
// - Authentication: +10ms
// - Total: 70-160ms overhead PER QUERY
// - With 50 players, 100 queries/sec = 160ms * 100 = 16 seconds of wasted time
```

```java
// ✅ CORRECT: Reuse connections from pool
private HikariDataSource pool;

public void init() {
    pool = createPool();
}

public PlayerData getPlayer(UUID uuid) {
    try (Connection conn = pool.getConnection()) { // ~1ms to get from pool
        // Query here
    }
}
```

**HikariCP: The Industry Standard**

```xml
<!-- pom.xml -->
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.1.0</version>
</dependency>
```

**Complete HikariCP Configuration:**

```java
public HikariDataSource createDataSource(DatabaseConfig config) {
    HikariConfig hikariConfig = new HikariConfig();
    
    // === BASIC CONNECTION ===
    hikariConfig.setJdbcUrl(config.getJdbcUrl());
    hikariConfig.setUsername(config.getUsername());
    hikariConfig.setPassword(config.getPassword());
    hikariConfig.setDriverClassName(config.getDriverClass()); // Optional, auto-detected
    
    // === POOL SIZING ===
    // Formula: (core_count * 2) + effective_spindle_count
    hikariConfig.setMaximumPoolSize(config.getMaxPoolSize());
    
    // Minimum idle connections (typically 30-50% of max)
    hikariConfig.setMinimumIdle(config.getMaxPoolSize() / 3);
    
    // === TIMEOUTS ===
    // How long to wait for connection from pool (milliseconds)
    hikariConfig.setConnectionTimeout(30000); // 30 seconds
    
    // How long a connection can be idle before being removed
    hikariConfig.setIdleTimeout(600000); // 10 minutes
    
    // Maximum lifetime of a connection (should be less than DB wait_timeout)
    // MySQL default wait_timeout = 8 hours
    hikariConfig.setMaxLifetime(1800000); // 30 minutes
    
    // Timeout for validating connections
    hikariConfig.setValidationTimeout(5000); // 5 seconds
    
    // === CONNECTION TEST ===
    hikariConfig.setConnectionTestQuery("SELECT 1");
    
    // === LEAK DETECTION ===
    // Warn if connection not returned to pool within this time
    hikariConfig.setLeakDetectionThreshold(60000); // 60 seconds
    
    // === POOL NAME ===
    hikariConfig.setPoolName("MinecraftPool-" + config.getDatabaseName());
    
    // === AUTO-COMMIT ===
    hikariConfig.setAutoCommit(true); // Default, can be overridden per-connection
    
    // === ISOLATION LEVEL ===
    // hikariConfig.setTransactionIsolation("TRANSACTION_READ_COMMITTED");
    
    // === CATALOG ===
    hikariConfig.setCatalog(config.getDatabaseName());
    
    // === CONNECTION INITIALIZATION ===
    hikariConfig.setConnectionInitSql("SET NAMES utf8mb4");
    
    // === MYSQL-SPECIFIC OPTIMIZATIONS ===
    if (config.getType() == DatabaseType.MYSQL) {
        // Cache prepared statements
        hikariConfig.addDataSourceProperty("cachePrepStmts", "true");
        hikariConfig.addDataSourceProperty("prepStmtCacheSize", "250");
        hikariConfig.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
        
        // Use server-side prepared statements
        hikariConfig.addDataSourceProperty("useServerPrepStmts", "true");
        
        // Performance optimizations
        hikariConfig.addDataSourceProperty("useLocalSessionState", "true");
        hikariConfig.addDataSourceProperty("rewriteBatchedStatements", "true");
        hikariConfig.addDataSourceProperty("cacheResultSetMetadata", "true");
        hikariConfig.addDataSourceProperty("cacheServerConfiguration", "true");
        hikariConfig.addDataSourceProperty("elideSetAutoCommits", "true");
        hikariConfig.addDataSourceProperty("maintainTimeStats", "false");
        
        // Character encoding
        hikariConfig.addDataSourceProperty("characterEncoding", "utf8mb4");
        hikariConfig.addDataSourceProperty("useUnicode", "true");
        
        // SSL (if needed)
        if (config.isUseSsl()) {
            hikariConfig.addDataSourceProperty("useSSL", "true");
            hikariConfig.addDataSourceProperty("requireSSL", "true");
            hikariConfig.addDataSourceProperty("verifyServerCertificate", "true");
        }
    }
    
    // === POSTGRESQL-SPECIFIC OPTIMIZATIONS ===
    if (config.getType() == DatabaseType.POSTGRESQL) {
        hikariConfig.addDataSourceProperty("prepareThreshold", "3");
        hikariConfig.addDataSourceProperty("preparedStatementCacheQueries", "250");
        hikariConfig.addDataSourceProperty("preparedStatementCacheSizeMiB", "5");
    }
    
    // === SQLITE-SPECIFIC CONFIGURATION ===
    if (config.getType() == DatabaseType.SQLITE) {
        hikariConfig.setMaximumPoolSize(1); // SQLite single writer
        hikariConfig.setMinimumIdle(1);
        hikariConfig.addDataSourceProperty("journal_mode", "WAL");
        hikariConfig.addDataSourceProperty("synchronous", "NORMAL");
        hikariConfig.addDataSourceProperty("cache_size", "-64000"); // 64MB
        hikariConfig.addDataSourceProperty("foreign_keys", "true");
    }
    
    // === HEALTH CHECK ===
    hikariConfig.setHealthCheckRegistry(new HealthCheckRegistry());
    
    // === METRICS ===
    // hikariConfig.setMetricRegistry(new MetricRegistry());
    
    return new HikariDataSource(hikariConfig);
}
```

### 4.2 Pool Sizing Formula

**The Formula:**
```
connections = (core_count × 2) + effective_spindle_count
```

**For Modern Servers (SSD):**
```
connections = (core_count × 2) + 1
```

**Explanation:**

- **core_count**: Number of CPU cores available to the application
- **effective_spindle_count**: Number of hard drives (for HDD RAID arrays)
  - SSD: Use 1 (SSDs have no spindles, but formula needs a base)
  - Single HDD: 1
  - RAID array: Number of drives in array

**Real-World Examples:**

**Example 1: Budget VPS**
- CPU: 2 cores
- Storage: SSD
- Calculation: (2 × 2) + 1 = **5 connections**

```java
hikariConfig.setMaximumPoolSize(5);
hikariConfig.setMinimumIdle(2);
```

**Example 2: Gaming Server**
- CPU: 8 cores
- Storage: NVMe SSD
- Calculation: (8 × 2) + 1 = **17 connections**

```java
hikariConfig.setMaximumPoolSize(17);
hikariConfig.setMinimumIdle(6);
```

**Example 3: Dedicated Server with RAID**
- CPU: 16 cores
- Storage: RAID 10 (4 disks)
- Calculation: (16 × 2) + 4 = **36 connections**

```java
hikariConfig.setMaximumPoolSize(36);
hikariConfig.setMinimumIdle(12);
```

**Multi-Server Network:**

**Scenario:** 5 game servers + 1 proxy, all connecting to central MySQL
- Each server: 4 cores, SSD
- Per-server pool: (4 × 2) + 1 = 9 connections
- Total simultaneous connections: 6 × 9 = **54 connections**

```properties
# MySQL my.cnf
max_connections = 100  # 54 + buffer for admin connections
```

**Why Not Just Use a Huge Pool?**

```java
// ❌ WRONG: "More is better" mentality
hikariConfig.setMaximumPoolSize(100);

// Problems:
// 1. Context switching overhead (CPU thrashing)
// 2. Memory consumption (each connection = ~1-5MB)
// 3. Database server overload
// 4. Diminishing returns (most connections sit idle)

// Formula is optimized for:
// - CPU utilization (not too many threads)
// - IO throughput (disk/network limits)
// - Memory efficiency
```

**Monitoring Pool Utilization:**

```java
HikariPoolMXBean poolMXBean = pool.getHikariPoolMXBean();

// Log pool stats every minute
Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, () -> {
    int active = poolMXBean.getActiveConnections();
    int idle = poolMXBean.getIdleConnections();
    int total = poolMXBean.getTotalConnections();
    int waiting = poolMXBean.getThreadsAwaitingConnection();
    
    plugin.getLogger().info(String.format(
        "Pool: %d active, %d idle, %d total, %d waiting",
        active, idle, total, waiting
    ));
    
    // Alert if pool is saturated
    if (waiting > 0) {
        plugin.getLogger().warning("Connection pool exhausted! Consider increasing pool size.");
    }
    
}, 1200L, 1200L); // Every 60 seconds
```

### 4.3 Connection Lifecycle

**Connection States:**

```
[Not Created] 
    ↓ (getConnection() called)
[Created & Validated]
    ↓ (given to application)
[In Use]
    ↓ (close() called)
[Idle in Pool]
    ↓ (idleTimeout expires OR maxLifetime expires)
[Evicted]
    ↓ (new connection created if needed)
[Created & Validated]
```

**Initialization:**

```java
public class MyPlugin extends JavaPlugin {
    
    private HikariDataSource dataSource;
    
    @Override
    public void onEnable() {
        // Initialize pool (lazy connection creation)
        dataSource = createDataSource();
        
        // Optional: Pre-fill pool to minimum idle
        dataSource.getConnection().close(); // Triggers initial connection creation
        
        getLogger().info("Database connection pool initialized");
    }
    
    @Override
    public void onDisable() {
        // Shutdown pool (close all connections)
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
            getLogger().info("Database connection pool closed");
        }
    }
}
```

**Connection Acquisition:**

```java
// ✅ CORRECT: try-with-resources (auto-close)
public PlayerData getPlayer(UUID uuid) {
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement("SELECT * FROM player_data WHERE uuid = ?")) {
        
        stmt.setString(1, uuid.toString());
        
        try (ResultSet rs = stmt.executeQuery()) {
            if (rs.next()) {
                return new PlayerData(rs);
            }
        }
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Failed to fetch player data", e);
    }
    
    return null;
}

// ❌ WRONG: Manual close (easy to forget, causes leaks)
public PlayerData getPlayerWrong(UUID uuid) {
    Connection conn = null;
    PreparedStatement stmt = null;
    ResultSet rs = null;
    
    try {
        conn = dataSource.getConnection();
        stmt = conn.prepareStatement("SELECT * FROM player_data WHERE uuid = ?");
        stmt.setString(1, uuid.toString());
        rs = stmt.executeQuery();
        
        if (rs.next()) {
            return new PlayerData(rs);
        }
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Failed to fetch player data", e);
    } finally {
        // If any close() throws exception, others won't close!
        if (rs != null) try { rs.close(); } catch (SQLException e) {}
        if (stmt != null) try { stmt.close(); } catch (SQLException e) {}
        if (conn != null) try { conn.close(); } catch (SQLException e) {}
    }
    
    return null;
}
```

**Connection Validation:**

```java
// HikariCP validates connections before giving them to application
hikariConfig.setConnectionTestQuery("SELECT 1");

// When you call getConnection():
// 1. HikariCP checks if connection is still alive
// 2. If validation fails, discards connection
// 3. Creates new connection
// 4. Returns valid connection

// You don't need to validate manually!
```

**Connection Eviction:**

```java
// Idle timeout: Remove connections that have been idle too long
hikariConfig.setIdleTimeout(600000); // 10 minutes

// Pool maintains minimum idle connections
hikariConfig.setMinimumIdle(3);

// Example timeline:
// Time 0:00 - Pool has 10 connections, 7 idle
// Time 10:00 - 4 connections used, 6 idle
// Time 20:00 - idleTimeout triggers
//   - 6 idle connections, 3 needed for minimum
//   - 3 oldest idle connections evicted
//   - Pool now has 7 connections, 3 idle

// Max lifetime: Prevent connections from living too long
hikariConfig.setMaxLifetime(1800000); // 30 minutes

// Why? MySQL's wait_timeout might close connection server-side
// If maxLifetime < wait_timeout, we close before MySQL does
```

**Reconnection After Database Restart:**

```java
// HikariCP handles reconnection automatically

// Scenario: MySQL server restarts
// 1. All existing connections become invalid
// 2. Next getConnection() call detects dead connection
// 3. HikariCP discards dead connection
// 4. Creates new connection to new MySQL instance
// 5. Returns valid connection

// No manual intervention needed!

// To verify:
hikariConfig.setLeakDetectionThreshold(60000);

// If database is unreachable, HikariCP will:
// - Retry connection based on connectionTimeout
// - Throw SQLException if timeout exceeded
```

**Health Monitoring:**

```java
public class DatabaseHealthCheck implements Runnable {
    
    private final HikariDataSource dataSource;
    private final Logger logger;
    
    @Override
    public void run() {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT 1")) {
            
            if (rs.next() && rs.getInt(1) == 1) {
                logger.info("Database health check: OK");
            }
            
        } catch (SQLException e) {
            logger.severe("Database health check: FAILED");
            logger.severe("Error: " + e.getMessage());
            
            // Alert administrators
            // Disable features that require database
            // etc.
        }
    }
}

// Schedule health check
Bukkit.getScheduler().runTaskTimerAsynchronously(
    plugin,
    new DatabaseHealthCheck(dataSource, logger),
    0L,
    6000L  // Every 5 minutes
);
```

### 4.4 Transaction Management

**What is a Transaction?**

A transaction is a sequence of database operations that are treated as a single unit of work. Either ALL operations succeed, or NONE do.

**ACID Properties:**

- **Atomicity**: All or nothing
- **Consistency**: Data remains valid
- **Isolation**: Concurrent transactions don't interfere
- **Durability**: Committed changes are permanent

**Basic Transaction Pattern:**

```java
public boolean transferMoney(UUID from, UUID to, double amount) {
    try (Connection conn = dataSource.getConnection()) {
        // Disable auto-commit
        conn.setAutoCommit(false);
        
        try {
            // Operation 1: Deduct from sender
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE player_balances SET balance = balance - ? WHERE uuid = ? AND balance >= ?")) {
                stmt.setDouble(1, amount);
                stmt.setString(2, from.toString());
                stmt.setDouble(3, amount);
                
                if (stmt.executeUpdate() == 0) {
                    conn.rollback();
                    return false; // Insufficient funds
                }
            }
            
            // Operation 2: Add to recipient
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE player_balances SET balance = balance + ? WHERE uuid = ?")) {
                stmt.setDouble(1, amount);
                stmt.setString(2, to.toString());
                stmt.executeUpdate();
            }
            
            // Commit transaction (both operations succeed)
            conn.commit();
            return true;
            
        } catch (SQLException e) {
            // Rollback on any error (both operations fail)
            conn.rollback();
            throw e;
            
        } finally {
            // Restore auto-commit
            conn.setAutoCommit(true);
        }
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Failed to transfer money", e);
        return false;
    }
}
```

**Isolation Levels:**

| Level | Dirty Read | Non-Repeatable Read | Phantom Read | Performance |
|-------|-----------|---------------------|--------------|-------------|
| **READ UNCOMMITTED** | ✓ Possible | ✓ Possible | ✓ Possible | Fastest |
| **READ COMMITTED** | ✗ Prevented | ✓ Possible | ✓ Possible | Fast |
| **REPEATABLE READ** | ✗ Prevented | ✗ Prevented | ✓ Possible | Moderate |
| **SERIALIZABLE** | ✗ Prevented | ✗ Prevented | ✗ Prevented | Slowest |

**Default isolation levels:**
- MySQL/MariaDB: **REPEATABLE READ**
- PostgreSQL: **READ COMMITTED**

**Setting isolation level:**

```java
// Per connection
conn.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);

// Or in HikariCP config
hikariConfig.setTransactionIsolation("TRANSACTION_READ_COMMITTED");
```

**When to Use Transactions:**

✅ **DO use transactions for:**
- Money transfers
- Inventory swaps
- Multi-table updates that must stay consistent
- Batch operations that must be atomic

❌ **DON'T use transactions for:**
- Single INSERT/UPDATE/DELETE (already atomic)
- Read-only queries
- Audit logging (use separate connection)
- Operations across multiple databases

**Savepoints (Advanced):**

```java
try (Connection conn = dataSource.getConnection()) {
    conn.setAutoCommit(false);
    
    // Update player balance
    updateBalance(conn, uuid, newBalance);
    
    // Create savepoint
    Savepoint savepoint = conn.setSavepoint("before_inventory");
    
    try {
        // Update inventory (risky operation)
        updateInventory(conn, uuid, items);
        
    } catch (SQLException e) {
        // Rollback only inventory update, keep balance update
        conn.rollback(savepoint);
        logger.warning("Inventory update failed, but balance was updated");
    }
    
    // Commit everything that wasn't rolled back
    conn.commit();
    
} catch (SQLException e) {
    // Full rollback if anything goes wrong
}
```

**Deadlock Handling:**

```java
public boolean transferWithDeadlockRetry(UUID from, UUID to, double amount) {
    int maxRetries = 3;
    
    for (int attempt = 1; attempt <= maxRetries; attempt++) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            
            try {
                // Always acquire locks in same order to prevent deadlock
                UUID first = from.compareTo(to) < 0 ? from : to;
                UUID second = from.compareTo(to) < 0 ? to : from;
                
                // Lock first account
                lockAccount(conn, first);
                
                // Lock second account
                lockAccount(conn, second);
                
                // Perform transfer
                performTransfer(conn, from, to, amount);
                
                conn.commit();
                return true;
                
            } catch (SQLException e) {
                conn.rollback();
                
                // Check if deadlock (MySQL error code 1213)
                if (e.getErrorCode() == 1213 && attempt < maxRetries) {
                    logger.warning("Deadlock detected, retrying... (attempt " + attempt + ")");
                    Thread.sleep((long) Math.pow(2, attempt) * 100); // Exponential backoff
                    continue;
                }
                
                throw e;
            }
            
        } catch (SQLException | InterruptedException e) {
            logger.log(Level.SEVERE, "Transfer failed", e);
        }
    }
    
    return false;
}

private void lockAccount(Connection conn, UUID uuid) throws SQLException {
    // SELECT ... FOR UPDATE acquires row lock
    try (PreparedStatement stmt = conn.prepareStatement(
            "SELECT balance FROM player_balances WHERE uuid = ? FOR UPDATE")) {
        stmt.setString(1, uuid.toString());
        stmt.executeQuery();
    }
}
```

---

## 5. Async Database Operations

### 5.1 The Async-Sync Bridge Pattern

**The Golden Rule:**

```
NEVER perform database queries on the main server thread.
Database queries are IO-bound and can take 10-100ms.
Main thread runs at 50ms per tick (20 TPS).
One slow query = server lag.
```

**Wrong vs Right:**

```java
// ❌ WRONG: Synchronous database query on main thread
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    
    // This blocks the main thread!
    PlayerData data = database.getPlayerData(player.getUniqueId());
    
    // 50ms query = 1 full server tick frozen
    // All players experience lag
    
    player.sendMessage("Welcome back, " + data.getUsername());
}
```

```java
// ✅ CORRECT: Async query with sync callback
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    // Execute query async
    CompletableFuture.supplyAsync(() -> {
        // This runs on async thread pool
        return database.getPlayerData(uuid);
        
    }, asyncExecutor).thenAcceptAsync(data -> {
        // This runs on main thread (sync)
        if (player.isOnline()) {
            player.sendMessage("Welcome back, " + data.getUsername());
        }
        
    }, syncExecutor);
}
```

**Complete Async-Sync Bridge Implementation:**

```java
public class DatabaseManager {
    
    private final JavaPlugin plugin;
    private final HikariDataSource dataSource;
    private final ExecutorService asyncExecutor;
    private final Executor syncExecutor;
    
    public DatabaseManager(JavaPlugin plugin, HikariDataSource dataSource) {
        this.plugin = plugin;
        this.dataSource = dataSource;
        
        // Async executor (thread pool for database operations)
        this.asyncExecutor = Executors.newFixedThreadPool(
            4, // Pool size
            new ThreadFactoryBuilder()
                .setNameFormat("Database-%d")
                .setDaemon(true)
                .build()
        );
        
        // Sync executor (runs on main server thread)
        this.syncExecutor = runnable -> {
            if (Bukkit.isPrimaryThread()) {
                runnable.run();
            } else {
                Bukkit.getScheduler().runTask(plugin, runnable);
            }
        };
    }
    
    // Generic async query method
    public <T> CompletableFuture<T> queryAsync(AsyncQuery<T> query) {
        return CompletableFuture.supplyAsync(() -> {
            try (Connection conn = dataSource.getConnection()) {
                return query.execute(conn);
            } catch (SQLException e) {
                throw new CompletionException(e);
            }
        }, asyncExecutor);
    }
    
    // Generic async update method
    public CompletableFuture<Integer> updateAsync(AsyncUpdate update) {
        return CompletableFuture.supplyAsync(() -> {
            try (Connection conn = dataSource.getConnection()) {
                return update.execute(conn);
            } catch (SQLException e) {
                throw new CompletionException(e);
            }
        }, asyncExecutor);
    }
    
    // Execute on sync (main) thread
    public <T> CompletableFuture<T> syncFuture(Supplier<T> supplier) {
        CompletableFuture<T> future = new CompletableFuture<>();
        
        syncExecutor.execute(() -> {
            try {
                future.complete(supplier.get());
            } catch (Exception e) {
                future.completeExceptionally(e);
            }
        });
        
        return future;
    }
    
    public void shutdown() {
        asyncExecutor.shutdown();
        try {
            if (!asyncExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                asyncExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            asyncExecutor.shutdownNow();
        }
    }
    
    @FunctionalInterface
    public interface AsyncQuery<T> {
        T execute(Connection connection) throws SQLException;
    }
    
    @FunctionalInterface
    public interface AsyncUpdate {
        int execute(Connection connection) throws SQLException;
    }
}
```

**Usage Examples:**

```java
// Example 1: Load player data on join
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    databaseManager.queryAsync(conn -> {
        // Async: Load from database
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT * FROM player_data WHERE uuid = ?")) {
            stmt.setString(1, uuid.toString());
            
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return PlayerData.fromResultSet(rs);
                }
            }
        }
        return null;
        
    }).thenAcceptAsync(data -> {
        // Sync: Update player with loaded data
        if (player.isOnline()) {
            if (data != null) {
                playerCache.put(uuid, data);
                player.sendMessage("Welcome back, " + data.getUsername());
            } else {
                // First join, create new data
                createNewPlayerData(player);
            }
        }
        
    }, databaseManager.getSyncExecutor()).exceptionally(ex -> {
        // Error handling
        plugin.getLogger().log(Level.SEVERE, "Failed to load player data", ex);
        player.kickPlayer("Failed to load your data. Please try again.");
        return null;
    });
}

// Example 2: Save player data on quit
@EventHandler
public void onPlayerQuit(PlayerQuitEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    PlayerData data = playerCache.remove(uuid);
    
    if (data == null) return;
    
    databaseManager.updateAsync(conn -> {
        // Async: Save to database
        try (PreparedStatement stmt = conn.prepareStatement(
                "UPDATE player_data SET last_quit = ?, total_playtime = ? WHERE uuid = ?")) {
            stmt.setTimestamp(1, new Timestamp(System.currentTimeMillis()));
            stmt.setLong(2, data.getTotalPlaytime());
            stmt.setString(3, uuid.toString());
            return stmt.executeUpdate();
        }
        
    }).exceptionally(ex -> {
        plugin.getLogger().log(Level.SEVERE, "Failed to save player data for " + player.getName(), ex);
        return null;
    });
}

// Example 3: Complex operation with multiple callbacks
public void purchaseItem(Player player, String itemId, double price) {
    UUID uuid = player.getUniqueId();
    
    databaseManager.queryAsync(conn -> {
        // Async: Check if player can afford
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT balance FROM player_balances WHERE uuid = ?")) {
            stmt.setString(1, uuid.toString());
            
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getDouble("balance");
                }
            }
        }
        return 0.0;
        
    }).thenComposeAsync(balance -> {
        if (balance < price) {
            // Not enough money, return failed future
            return CompletableFuture.completedFuture(false);
        }
        
        // Async: Deduct money
        return databaseManager.updateAsync(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE player_balances SET balance = balance - ? WHERE uuid = ? AND balance >= ?")) {
                stmt.setDouble(1, price);
                stmt.setString(2, uuid.toString());
                stmt.setDouble(3, price);
                return stmt.executeUpdate() > 0;
            }
        });
        
    }, databaseManager.getAsyncExecutor()).thenAcceptAsync(success -> {
        // Sync: Give item to player
        if (success) {
            ItemStack item = createItem(itemId);
            player.getInventory().addItem(item);
            player.sendMessage("§aPurchase successful!");
        } else {
            player.sendMessage("§cInsufficient funds!");
        }
        
    }, databaseManager.getSyncExecutor()).exceptionally(ex -> {
        plugin.getLogger().log(Level.SEVERE, "Purchase failed", ex);
        player.sendMessage("§cAn error occurred. Please contact an administrator.");
        return null;
    });
}
```

### 5.2 Batch Operations

**Problem: Inserting 1000 Rows**

```java
// ❌ WRONG: 1000 individual inserts
for (PlayerStat stat : stats) {
    try (PreparedStatement stmt = conn.prepareStatement(
            "INSERT INTO player_stats (uuid, stat_key, stat_value) VALUES (?, ?, ?)")) {
        stmt.setString(1, stat.getUuid().toString());
        stmt.setString(2, stat.getKey());
        stmt.setLong(3, stat.getValue());
        stmt.executeUpdate();
    }
}

// Problems:
// - 1000 round trips to database
// - 1000 transaction commits
// - 1000 × 10ms = 10 seconds total time
```

```java
// ✅ CORRECT: Single batch insert
try (PreparedStatement stmt = conn.prepareStatement(
        "INSERT INTO player_stats (uuid, stat_key, stat_value) VALUES (?, ?, ?)")) {
    
    for (PlayerStat stat : stats) {
        stmt.setString(1, stat.getUuid().toString());
        stmt.setString(2, stat.getKey());
        stmt.setLong(3, stat.getValue());
        stmt.addBatch(); // Add to batch instead of executing
    }
    
    stmt.executeBatch(); // Execute all at once
}

// Benefits:
// - 1 round trip to database
// - 1 transaction commit
// - ~100ms total time (100x faster!)
```

**Batch with Transaction:**

```java
public void saveBatch(List<PlayerStat> stats) {
    try (Connection conn = dataSource.getConnection()) {
        conn.setAutoCommit(false);
        
        try (PreparedStatement stmt = conn.prepareStatement(
                "INSERT INTO player_stats (uuid, stat_key, stat_value) " +
                "VALUES (?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE stat_value = VALUES(stat_value)")) {
            
            int batchSize = 0;
            for (PlayerStat stat : stats) {
                stmt.setString(1, stat.getUuid().toString());
                stmt.setString(2, stat.getKey());
                stmt.setLong(3, stat.getValue());
                stmt.addBatch();
                
                batchSize++;
                
                // Execute in chunks of 1000
                if (batchSize % 1000 == 0) {
                    stmt.executeBatch();
                    conn.commit();
                    stmt.clearBatch();
                }
            }
            
            // Execute remaining
            if (batchSize % 1000 != 0) {
                stmt.executeBatch();
                conn.commit();
            }
            
        } catch (SQLException e) {
            conn.rollback();
            throw e;
        } finally {
            conn.setAutoCommit(true);
        }
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Failed to save batch", e);
    }
}
```

**HikariCP Batch Optimization:**

```java
// Enable batch rewriting (MySQL)
hikariConfig.addDataSourceProperty("rewriteBatchedStatements", "true");

// This transforms:
INSERT INTO table VALUES (?, ?)
INSERT INTO table VALUES (?, ?)
INSERT INTO table VALUES (?, ?)

// Into:
INSERT INTO table VALUES (?, ?), (?, ?), (?, ?)

// Result: Even faster batch inserts
```

### 5.3 Caching Strategy

**Cache Hierarchy:**

```
Player Data Request
    ↓
[Local Memory Cache] ← Fastest (1-5ms)
    ↓ (cache miss)
[Redis Cache] ← Fast (5-20ms)
    ↓ (cache miss)
[MySQL Database] ← Slow (20-100ms)
```

**Local Memory Cache (Caffeine):**

```java
// pom.xml
<dependency>
    <groupId>com.github.ben-manes.caffeine</groupId>
    <artifactId>caffeine</artifactId>
    <version>3.1.8</version>
</dependency>

// Cache implementation
public class PlayerDataCache {
    
    private final LoadingCache<UUID, PlayerData> cache;
    private final DatabaseManager database;
    
    public PlayerDataCache(DatabaseManager database) {
        this.database = database;
        
        this.cache = Caffeine.newBuilder()
            .maximumSize(1000)                    // Max 1000 entries
            .expireAfterWrite(15, TimeUnit.MINUTES) // Expire after 15 min
            .expireAfterAccess(5, TimeUnit.MINUTES) // Expire if not accessed for 5 min
            .refreshAfterWrite(10, TimeUnit.MINUTES) // Auto-refresh after 10 min
            .recordStats()                         // Enable statistics
            .build(this::loadPlayerData);          // Loader function
    }
    
    private PlayerData loadPlayerData(UUID uuid) {
        // Called automatically on cache miss
        return database.queryAsync(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT * FROM player_data WHERE uuid = ?")) {
                stmt.setString(1, uuid.toString());
                
                try (ResultSet rs = stmt.executeQuery()) {
                    if (rs.next()) {
                        return PlayerData.fromResultSet(rs);
                    }
                }
            }
            return null;
        }).join(); // Block until loaded (only on cache miss)
    }
    
    public PlayerData get(UUID uuid) {
        return cache.get(uuid);
    }
    
    public void put(UUID uuid, PlayerData data) {
        cache.put(uuid, data);
    }
    
    public void invalidate(UUID uuid) {
        cache.invalidate(uuid);
    }
    
    public void invalidateAll() {
        cache.invalidateAll();
    }
    
    public CacheStats getStats() {
        return cache.stats();
    }
}
```

### 5.4 Read-Through / Write-Behind Patterns

**Read-Through Cache:**

```java
// Application requests data
PlayerData data = cache.get(uuid);

// Cache logic:
// 1. Check if data exists in cache
// 2. If yes, return cached data
// 3. If no, load from database
// 4. Store in cache
// 5. Return data

// Transparent to application!
```

**Write-Through Cache:**

```java
public void updatePlayerData(UUID uuid, PlayerData data) {
    // 1. Update cache immediately
    cache.put(uuid, data);
    
    // 2. Update database synchronously
    database.updateAsync(conn -> {
        try (PreparedStatement stmt = conn.prepareStatement(
                "UPDATE player_data SET ... WHERE uuid = ?")) {
            // Set parameters
            stmt.executeUpdate();
        }
        return null;
    });
}

// Benefits:
// - Cache always consistent with database
// - Reads are fast (always hit cache)

// Drawbacks:
// - Writes are slower (wait for DB)
// - More database load
```

**Write-Behind Cache:**

```java
public class WriteBehindCache {
    
    private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();
    private final Set<UUID> dirtyKeys = ConcurrentHashMap.newKeySet();
    private final DatabaseManager database;
    private final ScheduledExecutorService scheduler;
    
    public WriteBehindCache(DatabaseManager database) {
        this.database = database;
        this.scheduler = Executors.newSingleThreadScheduledExecutor();
        
        // Flush dirty entries every 30 seconds
        scheduler.scheduleAtFixedRate(
            this::flushDirty,
            30, 30,
            TimeUnit.SECONDS
        );
    }
    
    public PlayerData get(UUID uuid) {
        return cache.computeIfAbsent(uuid, this::loadFromDatabase);
    }
    
    public void put(UUID uuid, PlayerData data) {
        // 1. Update cache immediately
        cache.put(uuid, data);
        
        // 2. Mark as dirty (needs database update)
        dirtyKeys.add(uuid);
        
        // Database update happens later in background
    }
    
    private void flushDirty() {
        if (dirtyKeys.isEmpty()) return;
        
        // Copy and clear dirty keys
        Set<UUID> toFlush = new HashSet<>(dirtyKeys);
        dirtyKeys.clear();
        
        // Batch update database
        database.updateAsync(conn -> {
            conn.setAutoCommit(false);
            
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE player_data SET ... WHERE uuid = ?")) {
                
                for (UUID uuid : toFlush) {
                    PlayerData data = cache.get(uuid);
                    if (data != null) {
                        // Set parameters
                        stmt.addBatch();
                    }
                }
                
                stmt.executeBatch();
                conn.commit();
                
            } catch (SQLException e) {
                conn.rollback();
                
                // Re-mark as dirty on failure
                dirtyKeys.addAll(toFlush);
                
                throw e;
            }
            
            return null;
        });
    }
    
    public void shutdown() {
        // Flush all remaining dirty entries
        flushDirty();
        
        scheduler.shutdown();
        try {
            scheduler.awaitTermination(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
        }
    }
    
    private PlayerData loadFromDatabase(UUID uuid) {
        // Load from database
        return database.queryAsync(conn -> {
            // Query here
        }).join();
    }
}

// Benefits:
// - Writes are fast (no waiting for DB)
// - Reduced database load (batched updates)
// - Better performance under high load

// Drawbacks:
// - Risk of data loss if server crashes before flush
// - Cache and database temporarily inconsistent
// - Must flush on shutdown
```

**Best Practices:**

1. **Use write-through for critical data** (balances, permissions)
2. **Use write-behind for non-critical data** (statistics, playtime)
3. **Always flush on shutdown**
4. **Implement retry logic for failed writes**
5. **Monitor dirty key count** (alert if too high)

---

## 6. Data Integrity & Safety

### 6.1 Backup Strategy

**Backup Types:**

| Type | Frequency | Retention | Use Case |
|------|-----------|-----------|----------|
| **Full Backup** | Daily | 7 days | Disaster recovery |
| **Incremental** | Hourly | 24 hours | Recent changes |
| **Snapshot** | Before migration | Permanent | Rollback point |
| **Logical Dump** | Weekly | 30 days | Archive |

**MySQL Backup Script:**

```bash
#!/bin/bash

# Configuration
DB_NAME="minecraft"
DB_USER="backup_user"
DB_PASS="backup_password"
BACKUP_DIR="/backups/mysql"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR

# Full backup using mysqldump
mysqldump \
    --user=$DB_USER \
    --password=$DB_PASS \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --databases $DB_NAME \
    | gzip > $BACKUP_DIR/full_$DATE.sql.gz

# Verify backup
if [ $? -eq 0 ]; then
    echo "Backup successful: full_$DATE.sql.gz"
else
    echo "Backup failed!"
    exit 1
fi

# Delete old backups
find $BACKUP_DIR -name "full_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Binary log backup (for point-in-time recovery)
mysql \
    --user=$DB_USER \
    --password=$DB_PASS \
    -e "FLUSH BINARY LOGS;"

# Copy binary logs to backup directory
cp /var/lib/mysql/mysql-bin.* $BACKUP_DIR/binlog/

echo "Backup complete"
```

**Automated Backup with Cron:**

```bash
# crontab -e

# Full backup daily at 3 AM
0 3 * * * /opt/scripts/mysql_backup.sh

# Incremental backup every hour
0 * * * * /opt/scripts/mysql_incremental.sh
```

**In-Plugin Backup Verification:**

```java
public class BackupVerifier {
    
    public boolean verifyBackup(File backupFile) {
        // 1. Check file exists and is readable
        if (!backupFile.exists() || !backupFile.canRead()) {
            return false;
        }
        
        // 2. Check file size (should not be 0 or suspiciously small)
        long minSize = 1024; // 1 KB minimum
        if (backupFile.length() < minSize) {
            logger.warning("Backup file too small: " + backupFile.length() + " bytes");
            return false;
        }
        
        // 3. Verify gzip integrity
        try (GZIPInputStream gzip = new GZIPInputStream(new FileInputStream(backupFile))) {
            byte[] buffer = new byte[8192];
            while (gzip.read(buffer) != -1) {
                // Read entire file to verify integrity
            }
            return true;
        } catch (IOException e) {
            logger.severe("Backup file corrupted: " + e.getMessage());
            return false;
        }
    }
}
```

**SQLite Backup:**

```java
public void backupSQLite(File dbFile, File backupDir) throws SQLException {
    File backupFile = new File(backupDir, 
        "backup_" + System.currentTimeMillis() + ".db");
    
    try (Connection conn = DriverManager.getConnection("jdbc:sqlite:" + dbFile)) {
        // VACUUM INTO creates a clean copy
        try (Statement stmt = conn.createStatement()) {
            stmt.execute("VACUUM INTO '" + backupFile.getAbsolutePath() + "'");
        }
    }
    
    logger.info("SQLite backup created: " + backupFile.getName());
}
```

### 6.2 Corruption Recovery

**Detecting Corruption:**

```java
public class CorruptionDetector {
    
    public boolean checkDatabaseIntegrity() {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {
            
            // MySQL: CHECK TABLE
            ResultSet rs = stmt.executeQuery("CHECK TABLE player_data");
            
            while (rs.next()) {
                String msgType = rs.getString("Msg_type");
                String msgText = rs.getString("Msg_text");
                
                if ("error".equalsIgnoreCase(msgType)) {
                    logger.severe("Table corruption detected: " + msgText);
                    return false;
                }
            }
            
            return true;
            
        } catch (SQLException e) {
            logger.log(Level.SEVERE, "Failed to check integrity", e);
            return false;
        }
    }
    
    public boolean repairTable(String tableName) {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {
            
            // MySQL: REPAIR TABLE (only for MyISAM, not InnoDB)
            stmt.execute("REPAIR TABLE " + tableName);
            
            logger.info("Table repaired: " + tableName);
            return true;
            
        } catch (SQLException e) {
            logger.log(Level.SEVERE, "Failed to repair table", e);
            return false;
        }
    }
}
```

**InnoDB Corruption Recovery:**

```bash
# my.cnf
[mysqld]
innodb_force_recovery = 1

# Levels:
# 0 = Normal operation
# 1 = Ignore corrupt pages (SRV_FORCE_IGNORE_CORRUPT)
# 2 = Prevent master thread from running
# 3 = Don't run transaction rollbacks
# 4 = Don't calculate statistics
# 5 = Don't look at undo logs
# 6 = Don't run background redo logs

# Steps:
# 1. Set innodb_force_recovery = 1
# 2. Start MySQL
# 3. Dump data: mysqldump -A > backup.sql
# 4. Stop MySQL
# 5. Delete InnoDB files (ib_logfile*, ibdata1)
# 6. Set innodb_force_recovery = 0
# 7. Start MySQL
# 8. Restore data: mysql < backup.sql
```

**Automatic Integrity Checking:**

```java
// Run integrity check on plugin start
@Override
public void onEnable() {
    CorruptionDetector detector = new CorruptionDetector(dataSource);
    
    if (!detector.checkDatabaseIntegrity()) {
        getLogger().severe("==============================================");
        getLogger().severe("DATABASE CORRUPTION DETECTED!");
        getLogger().severe("Plugin will not load. Please restore from backup.");
        getLogger().severe("==============================================");
        
        getServer().getPluginManager().disablePlugin(this);
        return;
    }
    
    // Continue initialization...
}
```

### 6.3 UUID Migration

**Problem: Username-based data**

```sql
-- Old schema (BAD)
CREATE TABLE player_data (
    username VARCHAR(16) PRIMARY KEY,
    balance DECIMAL(19, 2)
);

-- Problems:
-- 1. Username changes (name change feature)
-- 2. Name reuse (old player's data assigned to new player)
-- 3. Offline mode (UUID spoofing)
```

**Migration Steps:**

```sql
-- Step 1: Add UUID column
ALTER TABLE player_data ADD COLUMN uuid CHAR(36);

-- Step 2: Populate UUIDs (requires API lookup or logs)
UPDATE player_data p
SET uuid = (
    SELECT uuid FROM username_uuid_mapping m
    WHERE m.username = p.username
    LIMIT 1
);

-- Step 3: Remove rows without UUIDs (orphaned data)
DELETE FROM player_data WHERE uuid IS NULL;

-- Step 4: Make UUID the new primary key
ALTER TABLE player_data DROP PRIMARY KEY;
ALTER TABLE player_data ADD PRIMARY KEY (uuid);

-- Step 5: Keep username for display, but not as identifier
ALTER TABLE player_data MODIFY COLUMN username VARCHAR(16) NOT NULL;
```

**Username-to-UUID Lookup:**

```java
public UUID getUuidFromUsername(String username) {
    // Method 1: Mojang API (rate limited)
    try {
        URL url = new URL("https://api.mojang.com/users/profiles/minecraft/" + username);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream()))) {
            
            String response = reader.lines().collect(Collectors.joining());
            JsonObject json = JsonParser.parseString(response).getAsJsonObject();
            
            String uuidStr = json.get("id").getAsString();
            return UUID.fromString(
                uuidStr.replaceFirst(
                    "(\\w{8})(\\w{4})(\\w{4})(\\w{4})(\\w{12})",
                    "$1-$2-$3-$4-$5"
                )
            );
        }
        
    } catch (IOException e) {
        logger.log(Level.WARNING, "Failed to lookup UUID for " + username, e);
        return null;
    }
}

// Method 2: From server logs
public Map<String, UUID> parseUuidsFromLogs(File logFile) {
    Map<String, UUID> mapping = new HashMap<>();
    Pattern pattern = Pattern.compile("UUID of player (\\w+) is ([a-f0-9\\-]+)");
    
    try (BufferedReader reader = new BufferedReader(new FileReader(logFile))) {
        String line;
        while ((line = reader.readLine()) != null) {
            Matcher matcher = pattern.matcher(line);
            if (matcher.find()) {
                String username = matcher.group(1);
                UUID uuid = UUID.fromString(matcher.group(2));
                mapping.put(username, uuid);
            }
        }
    } catch (IOException e) {
        logger.log(Level.SEVERE, "Failed to parse logs", e);
    }
    
    return mapping;
}
```

### 6.4 Data Validation Rules

**Input Validation:**

```java
public class Validator {
    
    // UUID validation
    public static boolean isValidUuid(String uuid) {
        if (uuid == null) return false;
        
        try {
            UUID.fromString(uuid);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
    
    // Username validation (Minecraft rules)
    public static boolean isValidUsername(String username) {
        if (username == null) return false;
        
        // 3-16 characters, alphanumeric + underscore
        return username.matches("^[a-zA-Z0-9_]{3,16}$");
    }
    
    // Balance validation
    public static boolean isValidBalance(double balance) {
        // No negative balances (unless overdraft allowed)
        // No NaN or Infinity
        // Reasonable max value
        return !Double.isNaN(balance) 
            && !Double.isInfinite(balance)
            && balance >= 0
            && balance <= 1_000_000_000;
    }
    
    // World name validation
    public static boolean isValidWorldName(String world) {
        if (world == null || world.isEmpty()) return false;
        
        // No path traversal
        if (world.contains("..") || world.contains("/") || world.contains("\\")) {
            return false;
        }
        
        // Reasonable length
        return world.length() <= 64;
    }
    
    // Coordinate validation
    public static boolean isValidCoordinate(double coord) {
        // Minecraft world border: ±30,000,000
        return !Double.isNaN(coord)
            && !Double.isInfinite(coord)
            && coord >= -30_000_000
            && coord <= 30_000_000;
    }
}
```

**Database Constraints:**

```sql
-- Enforce validation at database level
CREATE TABLE player_data (
    uuid CHAR(36) NOT NULL PRIMARY KEY,
    username VARCHAR(16) NOT NULL,
    
    -- Constraints
    CONSTRAINT chk_uuid_format 
        CHECK (uuid REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    
    CONSTRAINT chk_username_format 
        CHECK (username REGEXP '^[a-zA-Z0-9_]{3,16}$')
);

CREATE TABLE player_balances (
    uuid CHAR(36) NOT NULL PRIMARY KEY,
    balance DECIMAL(19, 2) NOT NULL DEFAULT 0.00,
    
    -- Constraints
    CONSTRAINT chk_balance_positive 
        CHECK (balance >= 0),
    
    CONSTRAINT chk_balance_max 
        CHECK (balance <= 1000000000.00)
);

CREATE TABLE player_homes (
    uuid CHAR(36) NOT NULL,
    home_name VARCHAR(32) NOT NULL,
    world VARCHAR(64) NOT NULL,
    x DOUBLE NOT NULL,
    y DOUBLE NOT NULL,
    z DOUBLE NOT NULL,
    
    -- Constraints
    CONSTRAINT chk_world_name 
        CHECK (world NOT LIKE '%..%' AND world NOT LIKE '%/%'),
    
    CONSTRAINT chk_coordinates 
        CHECK (
            x BETWEEN -30000000 AND 30000000 AND
            y BETWEEN -64 AND 320 AND
            z BETWEEN -30000000 AND 30000000
        )
);
```

**Validation in PreparedStatements:**

```java
public void savePlayerData(PlayerData data) {
    // Validate before database operation
    if (!Validator.isValidUuid(data.getUuid().toString())) {
        throw new IllegalArgumentException("Invalid UUID");
    }
    
    if (!Validator.isValidUsername(data.getUsername())) {
        throw new IllegalArgumentException("Invalid username");
    }
    
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(
             "UPDATE player_data SET username = ?, last_join = ? WHERE uuid = ?")) {
        
        stmt.setString(1, data.getUsername());
        stmt.setTimestamp(2, new Timestamp(data.getLastJoin()));
        stmt.setString(3, data.getUuid().toString());
        
        stmt.executeUpdate();
        
    } catch (SQLException e) {
        // Check if constraint violation
        if (e.getErrorCode() == 3819) { // MySQL CHECK constraint violation
            logger.severe("Data validation failed at database level: " + e.getMessage());
        }
        
        throw new RuntimeException("Failed to save player data", e);
    }
}
```

---

## 7. Multi-Server Architecture

### 7.1 Shared Database Patterns

**Pattern 1: Single Shared MySQL**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Lobby       │     │ Survival    │     │ Creative    │
│ Server      │────▶│ Server      │────▶│ Server      │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │  MySQL Server  │
                  │   (Shared DB)  │
                  └────────────────┘
```

**Pros:**
- Simple architecture
- Consistent data across all servers
- Easy to implement

**Cons:**
- Single point of failure
- All servers affected if DB goes down
- Write contention under high load
- Network latency for remote servers

**Configuration:**

```java
// Each server connects to same MySQL instance
HikariConfig config = new HikariConfig();
config.setJdbcUrl("jdbc:mysql://central-db.example.com:3306/minecraft_network");
config.setUsername("server_user");
config.setPassword("password");
config.setMaximumPoolSize(10); // Per server
```

**Pattern 2: Shared Database + Local Cache**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Lobby       │     │ Survival    │     │ Creative    │
│ + Cache     │     │ + Cache     │     │ + Cache     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │  MySQL Server  │
                  └────────────────┘
```

**Benefits:**
- Reduced database load (most reads from cache)
- Faster response times
- Isolation from DB slowdowns

**Challenges:**
- Cache invalidation across servers
- Stale data if invalidation fails

**Implementation:**

```java
public class CachedPlayerDataRepository {
    
    private final LoadingCache<UUID, PlayerData> localCache;
    private final DatabaseManager database;
    
    public CachedPlayerDataRepository(DatabaseManager database) {
        this.database = database;
        this.localCache = Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(10, TimeUnit.MINUTES)
            .build(this::loadFromDatabase);
    }
    
    public PlayerData get(UUID uuid) {
        return localCache.get(uuid);
    }
    
    public void update(UUID uuid, PlayerData data) {
        // 1. Update cache
        localCache.put(uuid, data);
        
        // 2. Update database
        database.updateAsync(conn -> {
            // Save to DB
        });
        
        // 3. Invalidate cache on other servers (see section 7.2)
        invalidateOnOtherServers(uuid);
    }
    
    private PlayerData loadFromDatabase(UUID uuid) {
        return database.queryAsync(conn -> {
            // Load from DB
        }).join();
    }
}
```

**Pattern 3: Database Per Server + Sync Layer**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Lobby       │     │ Survival    │     │ Creative    │
│ + Local DB  │     │ + Local DB  │     │ + Local DB  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │  Sync Service  │
                  │  (Redis Pub/Sub │
                  │   or Message Q) │
                  └────────────────┘
```

**Pros:**
- Server isolation (one crash doesn't affect others)
- No single point of failure
- Lower latency (local database)

**Cons:**
- Complex synchronization logic
- Eventual consistency (data lag)
- Conflict resolution needed

**Not recommended unless specific requirements demand it.**

### 7.2 Cross-Server Cache Invalidation

**Redis Pub/Sub Implementation:**

```java
public class CrossServerCacheManager {
    
    private final JedisPool jedisPool;
    private final LoadingCache<UUID, PlayerData> localCache;
    private final Thread listenerThread;
    
    public CrossServerCacheManager(JedisPool jedisPool, LoadingCache<UUID, PlayerData> cache) {
        this.jedisPool = jedisPool;
        this.localCache = cache;
        
        // Start listening for invalidation messages
        this.listenerThread = new Thread(this::listenForInvalidations);
        this.listenerThread.setDaemon(true);
        this.listenerThread.start();
    }
    
    // Invalidate cache on all servers
    public void invalidateGlobally(UUID uuid) {
        // 1. Invalidate local cache
        localCache.invalidate(uuid);
        
        // 2. Publish invalidation message to Redis
        try (Jedis jedis = jedisPool.getResource()) {
            String message = "player:" + uuid.toString();
            jedis.publish("cache:invalidate", message);
        }
    }
    
    // Listen for invalidation messages from other servers
    private void listenForInvalidations() {
        try (Jedis jedis = jedisPool.getResource()) {
            jedis.subscribe(new JedisPubSub() {
                @Override
                public void onMessage(String channel, String message) {
                    if ("cache:invalidate".equals(channel)) {
                        handleInvalidation(message);
                    }
                }
            }, "cache:invalidate");
            
        } catch (Exception e) {
            logger.log(Level.SEVERE, "Redis listener crashed", e);
            
            // Restart listener after delay
            try {
                Thread.sleep(5000);
                listenForInvalidations();
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
        }
    }
    
    private void handleInvalidation(String message) {
        if (message.startsWith("player:")) {
            String uuidStr = message.substring(7);
            try {
                UUID uuid = UUID.fromString(uuidStr);
                localCache.invalidate(uuid);
                logger.fine("Invalidated cache for player: " + uuid);
            } catch (IllegalArgumentException e) {
                logger.warning("Invalid UUID in invalidation message: " + uuidStr);
            }
        }
    }
    
    public void shutdown() {
        listenerThread.interrupt();
    }
}
```

**Usage Example:**

```java
// Server A: Player's balance changes
public void updateBalance(UUID uuid, double newBalance) {
    // 1. Update database
    database.updateAsync(conn -> {
        try (PreparedStatement stmt = conn.prepareStatement(
                "UPDATE player_balances SET balance = ? WHERE uuid = ?")) {
            stmt.setDouble(1, newBalance);
            stmt.setString(2, uuid.toString());
            stmt.executeUpdate();
        }
        return null;
    });
    
    // 2. Update local cache
    balanceCache.put(uuid, newBalance);
    
    // 3. Invalidate cache on Server B, C, D, E
    cacheManager.invalidateGlobally(uuid);
}

// Server B, C, D, E: Receive invalidation message
// → handleInvalidation() called
// → Local cache cleared for that UUID
// → Next read will fetch fresh data from database
```

**Alternative: Direct Cache Update (Instead of Invalidation)**

```java
// Instead of invalidating, send the new value
public void updateBalanceWithBroadcast(UUID uuid, double newBalance) {
    // 1. Update database
    database.updateAsync(conn -> { /* ... */ });
    
    // 2. Broadcast new value to all servers
    try (Jedis jedis = jedisPool.getResource()) {
        String message = uuid.toString() + ":" + newBalance;
        jedis.publish("balance:update", message);
    }
}

// Other servers receive and update their cache
private void handleBalanceUpdate(String message) {
    String[] parts = message.split(":");
    UUID uuid = UUID.fromString(parts[0]);
    double balance = Double.parseDouble(parts[1]);
    
    balanceCache.put(uuid, balance); // Update cache with new value
}

// Pros:
// - No cache miss on next read
// - Faster for other servers

// Cons:
// - Message might arrive before database update completes
// - Larger messages over network
```

### 7.3 Event-Based Sync

**BungeeCord Plugin Messaging:**

```java
// Lobby server: Player balance changed
public void onBalanceChange(UUID uuid, double newBalance) {
    ByteArrayDataOutput out = ByteStreams.newDataOutput();
    out.writeUTF("BalanceUpdate");
    out.writeUTF(uuid.toString());
    out.writeDouble(newBalance);
    
    // Send to all servers
    for (Server server : Bukkit.getServers()) {
        server.sendPluginMessage(plugin, "custom:sync", out.toByteArray());
    }
}

// Survival server: Receive message
@Override
public void onPluginMessageReceived(String channel, Player player, byte[] message) {
    if (!"custom:sync".equals(channel)) return;
    
    ByteArrayDataInput in = ByteStreams.newDataInput(message);
    String action = in.readUTF();
    
    if ("BalanceUpdate".equals(action)) {
        UUID uuid = UUID.fromString(in.readUTF());
        double balance = in.readDouble();
        
        // Update local cache
        balanceCache.put(uuid, balance);
    }
}
```

**Velocity Plugin Messaging:**

```java
// Velocity proxy: Register channel
server.getChannelRegistrar().register(MinecraftChannelIdentifier.from("custom:sync"));

// Game server → Proxy
ByteArrayDataOutput out = ByteStreams.newDataOutput();
out.writeUTF("BalanceUpdate");
out.writeUTF(uuid.toString());
out.writeDouble(newBalance);

playerConnection.sendPluginMessage(
    MinecraftChannelIdentifier.from("custom:sync"),
    out.toByteArray()
);

// Proxy → All game servers
@Subscribe
public void onPluginMessage(PluginMessageEvent event) {
    if (!event.getIdentifier().equals(customChannel)) return;
    
    // Forward to all servers except sender
    for (RegisteredServer server : proxyServer.getAllServers()) {
        if (server != event.getSource()) {
            server.sendPluginMessage(customChannel, event.getData());
        }
    }
}
```

### 7.4 Conflict Resolution

**Problem: Concurrent Updates on Different Servers**

```
Time: 10:00:00
Server A: Player balance = $100

Time: 10:00:01
Server A: Player spends $50
Server A: balance = $50 (update DB)

Time: 10:00:01 (same time!)
Server B: Player earns $20 from job
Server B: balance = $120 (update DB)

Time: 10:00:02
Database has balance = $120 (Server B's update overwrote Server A's)
Correct balance should be: $100 - $50 + $20 = $70
Lost $50 transaction!
```

**Solution 1: Last-Write-Wins with Timestamp**

```sql
CREATE TABLE player_balances (
    uuid CHAR(36) NOT NULL PRIMARY KEY,
    balance DECIMAL(19, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    version INT NOT NULL DEFAULT 1
);
```

```java
public boolean updateBalance(UUID uuid, double newBalance, long expectedVersion) {
    String sql = "UPDATE player_balances " +
                 "SET balance = ?, version = version + 1 " +
                 "WHERE uuid = ? AND version = ?";
    
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(sql)) {
        
        stmt.setDouble(1, newBalance);
        stmt.setString(2, uuid.toString());
        stmt.setLong(3, expectedVersion);
        
        int rowsAffected = stmt.executeUpdate();
        
        if (rowsAffected == 0) {
            // Version mismatch = concurrent modification
            // Reload and retry
            return false;
        }
        
        return true;
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Failed to update balance", e);
        return false;
    }
}
```

**Solution 2: Delta-Based Updates (Recommended for Money)**

```java
// Instead of setting absolute value, apply delta
public void addMoney(UUID uuid, double amount) {
    String sql = "UPDATE player_balances " +
                 "SET balance = balance + ? " +
                 "WHERE uuid = ?";
    
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(sql)) {
        
        stmt.setDouble(1, amount);
        stmt.setString(2, uuid.toString());
        stmt.executeUpdate();
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Failed to add money", e);
    }
}

// Server A: balance = balance - 50
// Server B: balance = balance + 20
// Result: balance = 100 - 50 + 20 = 70 ✓ CORRECT
```

**Solution 3: Distributed Locks**

```java
public class DistributedLock {
    
    private final JedisPool jedisPool;
    
    public boolean acquireLock(String key, int timeoutSeconds) {
        try (Jedis jedis = jedisPool.getResource()) {
            String lockKey = "lock:" + key;
            String lockValue = UUID.randomUUID().toString();
            
            // SET NX PX (set if not exists with expiration)
            String result = jedis.set(
                lockKey,
                lockValue,
                SetParams.setParams().nx().ex(timeoutSeconds)
            );
            
            return "OK".equals(result);
        }
    }
    
    public void releaseLock(String key) {
        try (Jedis jedis = jedisPool.getResource()) {
            jedis.del("lock:" + key);
        }
    }
}

// Usage
public void updateBalanceSafely(UUID uuid, double newBalance) {
    String lockKey = "player:" + uuid.toString();
    
    if (!distributedLock.acquireLock(lockKey, 5)) {
        // Another server is updating this player
        // Wait or retry later
        return;
    }
    
    try {
        // Only one server can execute this at a time
        database.updateAsync(conn -> {
            // Update balance
        });
        
    } finally {
        distributedLock.releaseLock(lockKey);
    }
}
```

**Solution 4: Server Priority**

```java
public enum ServerPriority {
    LOBBY(1),
    SURVIVAL(2),
    CREATIVE(3),
    MINIGAME(4);
    
    private final int priority;
    
    ServerPriority(int priority) {
        this.priority = priority;
    }
}

// Conflict resolution: Higher priority server wins
public void resolveConflict(Update update1, Update update2) {
    if (update1.getServerPriority() > update2.getServerPriority()) {
        apply(update1);
    } else if (update2.getServerPriority() > update1.getServerPriority()) {
        apply(update2);
    } else {
        // Same priority: Use timestamp
        if (update1.getTimestamp() > update2.getTimestamp()) {
            apply(update1);
        } else {
            apply(update2);
        }
    }
}
```

**Best Practice: Avoid Conflicts by Design**

```
Partition data by server:
- Survival server: Controls survival stats, inventory
- Minigame server: Controls minigame stats, coins
- Global: Economy balance (managed by central server only)

Rule: Only one server has write authority for specific data.
```

---

## 8. Common AI Database Mistakes

### 8.1 SQL Injection Vulnerabilities

**Common AI Mistake #3: String Concatenation**

```java
// ❌ EXTREMELY DANGEROUS: SQL Injection vulnerability
public PlayerData getPlayer(String username) {
    String sql = "SELECT * FROM player_data WHERE username = '" + username + "'";
    
    try (Statement stmt = conn.createStatement();
         ResultSet rs = stmt.executeQuery(sql)) {
        // Process results
    }
}

// Attack:
// username = "'; DROP TABLE player_data; --"
// Resulting SQL:
// SELECT * FROM player_data WHERE username = ''; DROP TABLE player_data; --'
// → Entire table deleted!
```

```java
// ✅ CORRECT: PreparedStatement with parameters
public PlayerData getPlayer(String username) {
    String sql = "SELECT * FROM player_data WHERE username = ?";
    
    try (PreparedStatement stmt = conn.prepareStatement(sql)) {
        stmt.setString(1, username); // Automatically escaped
        
        try (ResultSet rs = stmt.executeQuery()) {
            // Process results
        }
    }
}

// Attack attempt:
// username = "'; DROP TABLE player_data; --"
// PreparedStatement escapes it:
// SELECT * FROM player_data WHERE username = '\'; DROP TABLE player_data; --'
// → Query fails safely, no table dropped
```

**AI-Generated Code Often Contains:**

```java
// ❌ WRONG: Formatted string
String sql = String.format(
    "SELECT * FROM player_data WHERE uuid = '%s'",
    uuid.toString()
);

// ❌ WRONG: StringBuilder
StringBuilder sql = new StringBuilder("SELECT * FROM player_data WHERE ");
sql.append("username = '").append(username).append("'");

// ❌ WRONG: MessageFormat
String sql = MessageFormat.format(
    "SELECT * FROM player_data WHERE username = ''{0}''",
    username
);

// ✅ CORRECT: Always use PreparedStatement
PreparedStatement stmt = conn.prepareStatement(
    "SELECT * FROM player_data WHERE username = ?"
);
stmt.setString(1, username);
```

**Audit Your Code:**

```bash
# Search for SQL injection vulnerabilities
grep -r "executeQuery(\"" src/
grep -r "executeUpdate(\"" src/
grep -r "\" + " src/ | grep -i "select\|insert\|update\|delete"
```

### 8.2 Connection Leaks

**Common AI Mistake #4: Forgetting to Close Resources**

```java
// ❌ WRONG: Connection leak
public PlayerData getPlayer(UUID uuid) {
    try {
        Connection conn = dataSource.getConnection();
        PreparedStatement stmt = conn.prepareStatement("SELECT * FROM player_data WHERE uuid = ?");
        stmt.setString(1, uuid.toString());
        ResultSet rs = stmt.executeQuery();
        
        if (rs.next()) {
            return new PlayerData(rs);
        }
        
        // Connection never closed!
        // After 10 queries, pool exhausted
        // Server deadlocks
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Error", e);
    }
    
    return null;
}
```

```java
// ✅ CORRECT: try-with-resources (auto-close)
public PlayerData getPlayer(UUID uuid) {
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement("SELECT * FROM player_data WHERE uuid = ?")) {
        
        stmt.setString(1, uuid.toString());
        
        try (ResultSet rs = stmt.executeQuery()) {
            if (rs.next()) {
                return new PlayerData(rs);
            }
        }
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Error", e);
    }
    
    return null;
}
```

**Detecting Connection Leaks:**

```java
// Enable leak detection in HikariCP
hikariConfig.setLeakDetectionThreshold(60000); // 60 seconds

// If connection not returned within 60s, logs:
// [WARN] Connection leak detection triggered for connection ...
// Stack trace shows where connection was acquired
```

**Audit Pattern:**

```bash
# Find potential leaks
grep -r "getConnection()" src/ | grep -v "try ("
```

### 8.3 Synchronous Queries in Events

**Common AI Mistake #5: Blocking Main Thread**

```java
// ❌ WRONG: Database query on main thread
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    
    // This blocks the main thread!
    // If query takes 50ms, server freezes for 1 tick
    PlayerData data = database.getPlayerData(player.getUniqueId());
    
    player.sendMessage("Welcome back!");
}

// Result:
// - Server TPS drops
// - All players experience lag
// - Server appears frozen during query
```

```java
// ✅ CORRECT: Async query
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    CompletableFuture.supplyAsync(() -> {
        // Async: Load data
        return database.getPlayerData(uuid);
        
    }, asyncExecutor).thenAcceptAsync(data -> {
        // Sync: Update player
        if (player.isOnline()) {
            player.sendMessage("Welcome back!");
        }
        
    }, syncExecutor);
}
```

**Events That Must Be Async:**

- `PlayerJoinEvent`
- `PlayerQuitEvent`
- `PlayerChatEvent`
- `PlayerCommandPreprocessEvent`
- `BlockBreakEvent`
- `EntityDamageEvent`
- Any event that fires frequently

**Rule:**

```
If an event can fire > 10 times per second, NEVER query database synchronously.
```

### 8.4 Race Conditions

**Common AI Mistake #6: Non-Atomic Operations**

```java
// ❌ WRONG: Race condition
public void transferMoney(UUID from, UUID to, double amount) {
    double fromBalance = getBalance(from);
    double toBalance = getBalance(to);
    
    // Between these lines, another thread might change balances!
    
    if (fromBalance >= amount) {
        setBalance(from, fromBalance - amount);
        setBalance(to, toBalance + amount);
    }
}

// Scenario:
// Thread 1: transferMoney(A, B, 50) - fromBalance = 100
// Thread 2: transferMoney(A, C, 50) - fromBalance = 100
// Both see 100, both deduct 50
// A ends with 0 (should be -50 or transaction should fail)
```

```java
// ✅ CORRECT: Atomic transaction
public void transferMoney(UUID from, UUID to, double amount) {
    try (Connection conn = dataSource.getConnection()) {
        conn.setAutoCommit(false);
        
        try {
            // Deduct from sender (atomic with balance check)
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE player_balances SET balance = balance - ? " +
                    "WHERE uuid = ? AND balance >= ?")) {
                stmt.setDouble(1, amount);
                stmt.setString(2, from.toString());
                stmt.setDouble(3, amount);
                
                if (stmt.executeUpdate() == 0) {
                    conn.rollback();
                    return; // Insufficient funds
                }
            }
            
            // Add to recipient
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE player_balances SET balance = balance + ? WHERE uuid = ?")) {
                stmt.setDouble(1, amount);
                stmt.setString(2, to.toString());
                stmt.executeUpdate();
            }
            
            conn.commit();
            
        } catch (SQLException e) {
            conn.rollback();
            throw e;
        }
    }
}
```

**Common Race Conditions:**

1. **Check-Then-Act**
   ```java
   // ❌ WRONG
   if (getBalance(uuid) >= 100) {
       setBalance(uuid, getBalance(uuid) - 100);
   }
   
   // ✅ CORRECT
   UPDATE player_balances SET balance = balance - 100
   WHERE uuid = ? AND balance >= 100
   ```

2. **Read-Modify-Write**
   ```java
   // ❌ WRONG
   int count = getCount(uuid);
   count++;
   setCount(uuid, count);
   
   // ✅ CORRECT
   UPDATE stats SET count = count + 1 WHERE uuid = ?
   ```

3. **Double-Checked Locking** (Java-specific)
   ```java
   // ❌ WRONG
   if (cache.get(uuid) == null) {
       synchronized (cache) {
           if (cache.get(uuid) == null) {
               cache.put(uuid, loadFromDb(uuid));
           }
       }
   }
   
   // ✅ CORRECT
   cache.get(uuid, key -> loadFromDb(key));
   ```

### 8.5 Schema Destruction

**Common AI Mistake #7: DROP TABLE on Plugin Start**

```java
// ❌ CATASTROPHIC: Destroys production data
@Override
public void onEnable() {
    try (Connection conn = dataSource.getConnection();
         Statement stmt = conn.createStatement()) {
        
        // AI-generated code often includes this
        stmt.execute("DROP TABLE IF EXISTS player_data");
        stmt.execute("CREATE TABLE player_data (...)");
        
        // ALL PLAYER DATA DELETED ON EVERY SERVER RESTART!
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Failed to create tables", e);
    }
}
```

```java
// ✅ CORRECT: CREATE TABLE IF NOT EXISTS
@Override
public void onEnable() {
    try (Connection conn = dataSource.getConnection();
         Statement stmt = conn.createStatement()) {
        
        // Only create if doesn't exist
        stmt.execute("CREATE TABLE IF NOT EXISTS player_data (...)");
        
        // Even better: Use migration framework (see Section 3.2)
        
    } catch (SQLException e) {
        logger.log(Level.SEVERE, "Failed to create tables", e);
    }
}
```

**AI Code Review Checklist:**

```
□ Search for "DROP TABLE" - Should NEVER exist in production code
□ Search for "TRUNCATE" - Should NEVER exist in event handlers
□ Search for "DELETE FROM" without WHERE - Extremely dangerous
□ Verify all CREATE TABLE uses "IF NOT EXISTS"
□ Check that migrations are forward-only (no rollback)
```

**Other Destructive Operations:**

```sql
-- ❌ NEVER in production
DROP TABLE player_data;
TRUNCATE TABLE player_balances;
DELETE FROM player_data; -- No WHERE clause
ALTER TABLE player_data DROP COLUMN balance; -- Data loss

-- ✅ Safe alternatives
-- Use migrations with backups
-- Soft delete: UPDATE player_data SET deleted_at = NOW()
-- Archive: INSERT INTO archived_data SELECT * FROM player_data WHERE...
```

---

## Appendices

## Appendix A: Complete Schema Templates

### A.1 Core Player Schema

```sql
-- Complete schema for player management plugin

-- Main player data table
CREATE TABLE player_data (
    uuid CHAR(36) NOT NULL PRIMARY KEY,
    username VARCHAR(16) NOT NULL,
    display_name VARCHAR(32),
    first_join TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_join TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_quit TIMESTAMP NULL,
    total_playtime BIGINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMP NULL,
    metadata JSON,
    version INT NOT NULL DEFAULT 1,
    
    INDEX idx_username (username),
    INDEX idx_last_join (last_join),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Player IP history
CREATE TABLE player_ips (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_player_ip (uuid, ip_address),
    INDEX idx_ip (ip_address),
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Economy
CREATE TABLE player_balances (
    uuid CHAR(36) NOT NULL PRIMARY KEY,
    balance DECIMAL(19, 2) NOT NULL DEFAULT 0.00,
    currency_type VARCHAR(20) NOT NULL DEFAULT 'default',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    version INT NOT NULL DEFAULT 1,
    
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    INDEX idx_balance (balance DESC),
    UNIQUE KEY unique_player_currency (uuid, currency_type),
    
    CONSTRAINT chk_balance_positive CHECK (balance >= 0),
    CONSTRAINT chk_balance_max CHECK (balance <= 1000000000.00)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transaction history
CREATE TABLE balance_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    from_uuid CHAR(36),
    to_uuid CHAR(36),
    amount DECIMAL(19, 2) NOT NULL,
    currency_type VARCHAR(20) NOT NULL DEFAULT 'default',
    transaction_type VARCHAR(20) NOT NULL,
    reason VARCHAR(255),
    metadata JSON,
    from_balance_after DECIMAL(19, 2),
    to_balance_after DECIMAL(19, 2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    server_id VARCHAR(50),
    
    INDEX idx_from_uuid (from_uuid, created_at),
    INDEX idx_to_uuid (to_uuid, created_at),
    INDEX idx_created_at (created_at),
    INDEX idx_transaction_type (transaction_type),
    
    FOREIGN KEY (from_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL,
    FOREIGN KEY (to_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Homes
CREATE TABLE player_homes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    home_name VARCHAR(32) NOT NULL,
    world VARCHAR(64) NOT NULL,
    x DOUBLE NOT NULL,
    y DOUBLE NOT NULL,
    z DOUBLE NOT NULL,
    yaw FLOAT NOT NULL DEFAULT 0,
    pitch FLOAT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    UNIQUE KEY unique_player_home (uuid, home_name),
    INDEX idx_uuid (uuid),
    INDEX idx_world (world),
    
    CONSTRAINT chk_world_name CHECK (world NOT LIKE '%..%'),
    CONSTRAINT chk_coordinates CHECK (
        x BETWEEN -30000000 AND 30000000 AND
        y BETWEEN -64 AND 320 AND
        z BETWEEN -30000000 AND 30000000
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server warps
CREATE TABLE server_warps (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    warp_name VARCHAR(32) NOT NULL UNIQUE,
    world VARCHAR(64) NOT NULL,
    x DOUBLE NOT NULL,
    y DOUBLE NOT NULL,
    z DOUBLE NOT NULL,
    yaw FLOAT NOT NULL DEFAULT 0,
    pitch FLOAT NOT NULL DEFAULT 0,
    permission VARCHAR(64),
    display_name VARCHAR(64),
    description TEXT,
    icon VARCHAR(64),
    created_by CHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES player_data(uuid) ON DELETE SET NULL,
    INDEX idx_warp_name (warp_name),
    INDEX idx_permission (permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Punishments
CREATE TABLE punishments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_uuid CHAR(36) NOT NULL,
    target_username VARCHAR(16) NOT NULL,
    punishment_type ENUM('BAN', 'TEMPBAN', 'MUTE', 'TEMPMUTE', 'WARN', 'KICK') NOT NULL,
    issuer_uuid CHAR(36),
    issuer_username VARCHAR(16),
    reason TEXT NOT NULL,
    proof_url VARCHAR(255),
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_at TIMESTAMP NULL,
    revoked_by_uuid CHAR(36),
    revoked_reason TEXT,
    server_id VARCHAR(50),
    
    INDEX idx_target_active (target_uuid, active, expires_at),
    INDEX idx_target_type (target_uuid, punishment_type),
    INDEX idx_issued_at (issued_at),
    INDEX idx_expires_at (expires_at),
    INDEX idx_issuer (issuer_uuid),
    
    FOREIGN KEY (target_uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    FOREIGN KEY (issuer_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL,
    FOREIGN KEY (revoked_by_uuid) REFERENCES player_data(uuid) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Statistics (EAV pattern)
CREATE TABLE player_statistics_eav (
    uuid CHAR(36) NOT NULL,
    stat_key VARCHAR(64) NOT NULL,
    stat_value BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (uuid, stat_key),
    FOREIGN KEY (uuid) REFERENCES player_data(uuid) ON DELETE CASCADE,
    INDEX idx_stat_key (stat_key, stat_value DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Schema migrations
CREATE TABLE schema_migrations (
    version INT NOT NULL PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    script_name VARCHAR(255) NOT NULL,
    installed_by VARCHAR(100) NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INT NOT NULL,
    checksum VARCHAR(64),
    success BOOLEAN NOT NULL DEFAULT TRUE,
    
    INDEX idx_installed_on (installed_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### A.2 Optimized Query Examples

```sql
-- Get player balance
SELECT balance FROM player_balances WHERE uuid = ?;

-- Update balance (atomic)
UPDATE player_balances 
SET balance = balance + ? 
WHERE uuid = ?;

-- Transfer money (in transaction)
START TRANSACTION;

UPDATE player_balances 
SET balance = balance - ? 
WHERE uuid = ? AND balance >= ?;

UPDATE player_balances 
SET balance = balance + ? 
WHERE uuid = ?;

COMMIT;

-- Get top 10 richest players
SELECT p.username, b.balance
FROM player_balances b
JOIN player_data p ON b.uuid = p.uuid
WHERE p.deleted_at IS NULL
ORDER BY b.balance DESC
LIMIT 10;

-- Check if player is banned
SELECT id, reason, expires_at
FROM punishments
WHERE target_uuid = ?
  AND punishment_type IN ('BAN', 'TEMPBAN')
  AND active = TRUE
  AND (expires_at IS NULL OR expires_at > NOW())
LIMIT 1;

-- Get player statistics
SELECT stat_key, stat_value
FROM player_statistics_eav
WHERE uuid = ?
ORDER BY stat_key;

-- Increment statistic (atomic)
INSERT INTO player_statistics_eav (uuid, stat_key, stat_value)
VALUES (?, ?, 1)
ON DUPLICATE KEY UPDATE 
    stat_value = stat_value + 1,
    updated_at = CURRENT_TIMESTAMP;

-- Get player's homes
SELECT home_name, world, x, y, z, yaw, pitch
FROM player_homes
WHERE uuid = ?
ORDER BY created_at DESC;

-- Transaction history
SELECT 
    CASE 
        WHEN from_uuid = ? THEN 'outgoing'
        WHEN to_uuid = ? THEN 'incoming'
    END AS direction,
    amount,
    transaction_type,
    reason,
    created_at
FROM balance_transactions
WHERE from_uuid = ? OR to_uuid = ?
ORDER BY created_at DESC
LIMIT 50;
```

---

## Appendix B: Java Database Access Patterns

### B.1 Repository Pattern

```java
public interface PlayerDataRepository {
    Optional<PlayerData> findByUuid(UUID uuid);
    Optional<PlayerData> findByUsername(String username);
    List<PlayerData> findAll();
    void save(PlayerData playerData);
    void delete(UUID uuid);
    boolean exists(UUID uuid);
}

public class SqlPlayerDataRepository implements PlayerDataRepository {
    
    private final HikariDataSource dataSource;
    
    public SqlPlayerDataRepository(HikariDataSource dataSource) {
        this.dataSource = dataSource;
    }
    
    @Override
    public Optional<PlayerData> findByUuid(UUID uuid) {
        String sql = "SELECT * FROM player_data WHERE uuid = ? AND deleted_at IS NULL";
        
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            
            stmt.setString(1, uuid.toString());
            
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapResultSet(rs));
                }
            }
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to find player by UUID", e);
        }
        
        return Optional.empty();
    }
    
    @Override
    public void save(PlayerData playerData) {
        String sql = "INSERT INTO player_data " +
                     "(uuid, username, display_name, first_join, last_join, total_playtime, metadata) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?) " +
                     "ON DUPLICATE KEY UPDATE " +
                     "username = VALUES(username), " +
                     "display_name = VALUES(display_name), " +
                     "last_join = VALUES(last_join), " +
                     "total_playtime = VALUES(total_playtime), " +
                     "metadata = VALUES(metadata), " +
                     "version = version + 1";
        
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            
            stmt.setString(1, playerData.getUuid().toString());
            stmt.setString(2, playerData.getUsername());
            stmt.setString(3, playerData.getDisplayName());
            stmt.setTimestamp(4, new Timestamp(playerData.getFirstJoin()));
            stmt.setTimestamp(5, new Timestamp(playerData.getLastJoin()));
            stmt.setLong(6, playerData.getTotalPlaytime());
            stmt.setString(7, playerData.getMetadataJson());
            
            stmt.executeUpdate();
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to save player data", e);
        }
    }
    
    @Override
    public void delete(UUID uuid) {
        // Soft delete
        String sql = "UPDATE player_data SET deleted_at = CURRENT_TIMESTAMP WHERE uuid = ?";
        
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            
            stmt.setString(1, uuid.toString());
            stmt.executeUpdate();
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to delete player", e);
        }
    }
    
    @Override
    public boolean exists(UUID uuid) {
        String sql = "SELECT 1 FROM player_data WHERE uuid = ? AND deleted_at IS NULL";
        
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            
            stmt.setString(1, uuid.toString());
            
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next();
            }
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to check player existence", e);
        }
    }
    
    private PlayerData mapResultSet(ResultSet rs) throws SQLException {
        return PlayerData.builder()
            .uuid(UUID.fromString(rs.getString("uuid")))
            .username(rs.getString("username"))
            .displayName(rs.getString("display_name"))
            .firstJoin(rs.getTimestamp("first_join").getTime())
            .lastJoin(rs.getTimestamp("last_join").getTime())
            .totalPlaytime(rs.getLong("total_playtime"))
            .metadataJson(rs.getString("metadata"))
            .version(rs.getInt("version"))
            .build();
    }
}
```

### B.2 Service Layer

```java
public class PlayerService {
    
    private final PlayerDataRepository repository;
    private final LoadingCache<UUID, PlayerData> cache;
    private final ExecutorService asyncExecutor;
    
    public PlayerService(PlayerDataRepository repository) {
        this.repository = repository;
        this.cache = Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(15, TimeUnit.MINUTES)
            .build(repository::findByUuid);
        this.asyncExecutor = Executors.newFixedThreadPool(4);
    }
    
    public CompletableFuture<PlayerData> loadPlayerAsync(UUID uuid) {
        return CompletableFuture.supplyAsync(
            () -> cache.get(uuid),
            asyncExecutor
        );
    }
    
    public CompletableFuture<Void> savePlayerAsync(PlayerData data) {
        return CompletableFuture.runAsync(() -> {
            repository.save(data);
            cache.put(data.getUuid(), data);
        }, asyncExecutor);
    }
    
    public void invalidateCache(UUID uuid) {
        cache.invalidate(uuid);
    }
    
    public void shutdown() {
        // Save all cached data
        cache.asMap().values().forEach(repository::save);
        
        asyncExecutor.shutdown();
        try {
            asyncExecutor.awaitTermination(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            asyncExecutor.shutdownNow();
        }
    }
}
```

### B.3 Complete DAO Example

```java
public class EconomyDAO {
    
    private final HikariDataSource dataSource;
    
    public EconomyDAO(HikariDataSource dataSource) {
        this.dataSource = dataSource;
    }
    
    public double getBalance(UUID uuid) {
        String sql = "SELECT balance FROM player_balances WHERE uuid = ?";
        
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            
            stmt.setString(1, uuid.toString());
            
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getDouble("balance");
                }
            }
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to get balance", e);
        }
        
        return 0.0;
    }
    
    public void setBalance(UUID uuid, double balance) {
        String sql = "INSERT INTO player_balances (uuid, balance) VALUES (?, ?) " +
                     "ON DUPLICATE KEY UPDATE balance = VALUES(balance)";
        
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            
            stmt.setString(1, uuid.toString());
            stmt.setDouble(2, balance);
            stmt.executeUpdate();
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to set balance", e);
        }
    }
    
    public void addBalance(UUID uuid, double amount) {
        String sql = "UPDATE player_balances SET balance = balance + ? WHERE uuid = ?";
        
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            
            stmt.setDouble(1, amount);
            stmt.setString(2, uuid.toString());
            
            int rowsAffected = stmt.executeUpdate();
            
            if (rowsAffected == 0) {
                // Player doesn't exist, create entry
                setBalance(uuid, amount);
            }
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to add balance", e);
        }
    }
    
    public boolean transferMoney(UUID from, UUID to, double amount, String reason) {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            
            try {
                // Deduct from sender
                try (PreparedStatement stmt = conn.prepareStatement(
                        "UPDATE player_balances SET balance = balance - ? " +
                        "WHERE uuid = ? AND balance >= ?")) {
                    stmt.setDouble(1, amount);
                    stmt.setString(2, from.toString());
                    stmt.setDouble(3, amount);
                    
                    if (stmt.executeUpdate() == 0) {
                        conn.rollback();
                        return false;
                    }
                }
                
                // Add to recipient
                try (PreparedStatement stmt = conn.prepareStatement(
                        "UPDATE player_balances SET balance = balance + ? WHERE uuid = ?")) {
                    stmt.setDouble(1, amount);
                    stmt.setString(2, to.toString());
                    stmt.executeUpdate();
                }
                
                // Get final balances
                double fromBalance = getBalance(conn, from);
                double toBalance = getBalance(conn, to);
                
                // Record transaction
                recordTransaction(conn, from, to, amount, "transfer", reason, fromBalance, toBalance);
                
                conn.commit();
                return true;
                
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            } finally {
                conn.setAutoCommit(true);
            }
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to transfer money", e);
        }
    }
    
    private double getBalance(Connection conn, UUID uuid) throws SQLException {
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT balance FROM player_balances WHERE uuid = ?")) {
            stmt.setString(1, uuid.toString());
            
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getDouble("balance");
                }
            }
        }
        return 0.0;
    }
    
    private void recordTransaction(Connection conn, UUID from, UUID to, 
                                    double amount, String type, String reason,
                                    double fromBalanceAfter, double toBalanceAfter) throws SQLException {
        String sql = "INSERT INTO balance_transactions " +
                     "(from_uuid, to_uuid, amount, transaction_type, reason, from_balance_after, to_balance_after) " +
                     "VALUES (?, ?, ?, ?, ?, ?, ?)";
        
        try (PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, from.toString());
            stmt.setString(2, to.toString());
            stmt.setDouble(3, amount);
            stmt.setString(4, type);
            stmt.setString(5, reason);
            stmt.setDouble(6, fromBalanceAfter);
            stmt.setDouble(7, toBalanceAfter);
            stmt.executeUpdate();
        }
    }
    
    public List<Transaction> getTransactionHistory(UUID uuid, int limit) {
        String sql = "SELECT * FROM balance_transactions " +
                     "WHERE from_uuid = ? OR to_uuid = ? " +
                     "ORDER BY created_at DESC LIMIT ?";
        
        List<Transaction> transactions = new ArrayList<>();
        
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            
            stmt.setString(1, uuid.toString());
            stmt.setString(2, uuid.toString());
            stmt.setInt(3, limit);
            
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    transactions.add(mapTransaction(rs));
                }
            }
            
        } catch (SQLException e) {
            throw new DatabaseException("Failed to get transaction history", e);
        }
        
        return transactions;
    }
    
    private Transaction mapTransaction(ResultSet rs) throws SQLException {
        return Transaction.builder()
            .id(rs.getLong("id"))
            .fromUuid(rs.getString("from_uuid") != null ? 
                     UUID.fromString(rs.getString("from_uuid")) : null)
            .toUuid(rs.getString("to_uuid") != null ? 
                   UUID.fromString(rs.getString("to_uuid")) : null)
            .amount(rs.getDouble("amount"))
            .type(rs.getString("transaction_type"))
            .reason(rs.getString("reason"))
            .timestamp(rs.getTimestamp("created_at").getTime())
            .build();
    }
}
```

---

## Appendix C: Connection Pool Configuration Templates

### C.1 HikariCP for MySQL

```java
public HikariDataSource createMySQLDataSource() {
    HikariConfig config = new HikariConfig();
    
    // Connection details
    config.setJdbcUrl("jdbc:mysql://localhost:3306/minecraft");
    config.setUsername("minecraft_user");
    config.setPassword("strong_password");
    
    // Pool configuration
    config.setMaximumPoolSize(10);
    config.setMinimumIdle(3);
    config.setConnectionTimeout(30000);
    config.setIdleTimeout(600000);
    config.setMaxLifetime(1800000);
    config.setLeakDetectionThreshold(60000);
    
    // Connection test
    config.setConnectionTestQuery("SELECT 1");
    
    // MySQL optimizations
    config.addDataSourceProperty("cachePrepStmts", "true");
    config.addDataSourceProperty("prepStmtCacheSize", "250");
    config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
    config.addDataSourceProperty("useServerPrepStmts", "true");
    config.addDataSourceProperty("useLocalSessionState", "true");
    config.addDataSourceProperty("rewriteBatchedStatements", "true");
    config.addDataSourceProperty("cacheResultSetMetadata", "true");
    config.addDataSourceProperty("cacheServerConfiguration", "true");
    config.addDataSourceProperty("elideSetAutoCommits", "true");
    config.addDataSourceProperty("maintainTimeStats", "false");
    config.addDataSourceProperty("characterEncoding", "utf8mb4");
    config.addDataSourceProperty("useUnicode", "true");
    
    return new HikariDataSource(config);
}
```

### C.2 HikariCP for PostgreSQL

```java
public HikariDataSource createPostgreSQLDataSource() {
    HikariConfig config = new HikariConfig();
    
    // Connection details
    config.setJdbcUrl("jdbc:postgresql://localhost:5432/minecraft");
    config.setUsername("minecraft_user");
    config.setPassword("strong_password");
    config.setDriverClassName("org.postgresql.Driver");
    
    // Pool configuration
    config.setMaximumPoolSize(10);
    config.setMinimumIdle(3);
    config.setConnectionTimeout(30000);
    config.setIdleTimeout(600000);
    config.setMaxLifetime(1800000);
    config.setLeakDetectionThreshold(60000);
    
    // PostgreSQL optimizations
    config.addDataSourceProperty("prepareThreshold", "3");
    config.addDataSourceProperty("preparedStatementCacheQueries", "250");
    config.addDataSourceProperty("preparedStatementCacheSizeMiB", "5");
    config.addDataSourceProperty("ApplicationName", "MinecraftPlugin");
    
    return new HikariDataSource(config);
}
```

### C.3 HikariCP for SQLite

```java
public HikariDataSource createSQLiteDataSource(File dbFile) {
    HikariConfig config = new HikariConfig();
    
    // Connection details
    config.setJdbcUrl("jdbc:sqlite:" + dbFile.getAbsolutePath());
    config.setDriverClassName("org.sqlite.JDBC");
    
    // Pool configuration (SQLite specific)
    config.setMaximumPoolSize(1); // SQLite only supports 1 writer
    config.setMinimumIdle(1);
    config.setConnectionTimeout(30000);
    config.setConnectionTestQuery("SELECT 1");
    
    // SQLite pragmas
    config.addDataSourceProperty("journal_mode", "WAL");
    config.addDataSourceProperty("synchronous", "NORMAL");
    config.addDataSourceProperty("cache_size", "-64000");
    config.addDataSourceProperty("foreign_keys", "true");
    config.addDataSourceProperty("busy_timeout", "5000");
    
    return new HikariDataSource(config);
}
```

### C.4 Configuration from YAML

```yaml
# config.yml
database:
  type: mysql
  host: localhost
  port: 3306
  database: minecraft
  username: minecraft_user
  password: strong_password
  
  pool:
    maximum-size: 10
    minimum-idle: 3
    connection-timeout: 30000
    idle-timeout: 600000
    max-lifetime: 1800000
    leak-detection-threshold: 60000
  
  properties:
    cachePrepStmts: true
    prepStmtCacheSize: 250
    prepStmtCacheSqlLimit: 2048
    useServerPrepStmts: true
```

```java
public HikariDataSource createDataSourceFromConfig(FileConfiguration config) {
    HikariConfig hikariConfig = new HikariConfig();
    
    // Build JDBC URL
    String type = config.getString("database.type");
    String host = config.getString("database.host");
    int port = config.getInt("database.port");
    String database = config.getString("database.database");
    
    String jdbcUrl = String.format("jdbc:%s://%s:%d/%s", type, host, port, database);
    hikariConfig.setJdbcUrl(jdbcUrl);
    
    // Credentials
    hikariConfig.setUsername(config.getString("database.username"));
    hikariConfig.setPassword(config.getString("database.password"));
    
    // Pool settings
    hikariConfig.setMaximumPoolSize(config.getInt("database.pool.maximum-size"));
    hikariConfig.setMinimumIdle(config.getInt("database.pool.minimum-idle"));
    hikariConfig.setConnectionTimeout(config.getLong("database.pool.connection-timeout"));
    hikariConfig.setIdleTimeout(config.getLong("database.pool.idle-timeout"));
    hikariConfig.setMaxLifetime(config.getLong("database.pool.max-lifetime"));
    hikariConfig.setLeakDetectionThreshold(config.getLong("database.pool.leak-detection-threshold"));
    
    // Data source properties
    ConfigurationSection props = config.getConfigurationSection("database.properties");
    if (props != null) {
        for (String key : props.getKeys(false)) {
            hikariConfig.addDataSourceProperty(key, props.getString(key));
        }
    }
    
    return new HikariDataSource(hikariConfig);
}
```

---

## Appendix D: AI Database Prompt Checklist

When requesting AI assistance for database code, include these requirements in your prompt:

### Required Elements Checklist

#### ✅ General Requirements
- [ ] Use HikariCP for connection pooling
- [ ] All queries must use PreparedStatement (NO string concatenation)
- [ ] All resources must use try-with-resources
- [ ] All database operations must be async (CompletableFuture)
- [ ] Include comprehensive error handling

#### ✅ Schema Requirements
- [ ] Use `CREATE TABLE IF NOT EXISTS` (NEVER `DROP TABLE`)
- [ ] UUID as primary key (CHAR(36) or BINARY(16))
- [ ] Character set: utf8mb4
- [ ] Storage engine: InnoDB
- [ ] Include appropriate indexes
- [ ] Include foreign keys with ON DELETE action
- [ ] Add CHECK constraints for validation
- [ ] Include timestamps (created_at, updated_at)

#### ✅ Transaction Requirements
- [ ] Use transactions for multi-step operations
- [ ] Include rollback on error
- [ ] Restore auto-commit in finally block
- [ ] Use optimistic locking (version column) for concurrent updates

#### ✅ Performance Requirements
- [ ] Implement caching layer (Caffeine)
- [ ] Use batch operations for bulk inserts/updates
- [ ] Include connection pool monitoring
- [ ] Add indexes for all WHERE/ORDER BY columns
- [ ] Use delta updates instead of absolute values for money

#### ✅ Safety Requirements
- [ ] Soft delete (deleted_at column)
- [ ] Audit logging for sensitive operations
- [ ] Input validation before database operations
- [ ] No synchronous queries in event handlers
- [ ] Include database migration framework

#### ✅ Multi-Server Requirements
- [ ] Cross-server cache invalidation (Redis pub/sub)
- [ ] Conflict resolution strategy
- [ ] Connection pool per server properly sized
- [ ] Server ID tracking in audit logs

#### ✅ Documentation Requirements
- [ ] Javadoc for all public methods
- [ ] SQL comments explaining complex queries
- [ ] Configuration examples
- [ ] Migration guide

---

## Example AI Prompt Template

```
Create a player economy system for a Minecraft plugin with the following requirements:

CRITICAL REQUIREMENTS:
- Use HikariCP connection pooling
- All queries MUST use PreparedStatement (NO string concatenation)
- All database operations MUST be async using CompletableFuture
- Use try-with-resources for all database resources
- Schema MUST use CREATE TABLE IF NOT EXISTS (NEVER DROP TABLE)
- Character set: utf8mb4, collation: utf8mb4_unicode_ci
- Engine: InnoDB
- UUID as primary key (CHAR(36))
- Include soft delete (deleted_at column)
- Implement caching with Caffeine
- Transaction support for money transfers
- Audit logging for all transactions

SCHEMA:
- player_balances table (uuid, balance, currency_type, updated_at, version)
- balance_transactions table (from_uuid, to_uuid, amount, type, reason, created_at)
- Include appropriate indexes and foreign keys
- Add CHECK constraint: balance >= 0

FEATURES:
1. Get balance
2. Set balance
3. Add/subtract balance (delta-based)
4. Transfer money between players (with transaction)
5. Transaction history
6. Top balances leaderboard

INCLUDE:
- Repository pattern
- Service layer with caching
- Complete error handling
- Migration framework
- Configuration from YAML
- Cross-server cache invalidation using Redis

DO NOT:
- Use string concatenation for SQL
- Drop tables
- Block main thread
- Use DOUBLE for money (use DECIMAL)
- Forget to close connections
```

---

**END OF GUIDE**

This guide is maintained by database administrators and plugin developers. For updates or corrections, please contact the network technical team.

**Version:** 2.0  
**Last Updated:** 2024  
**License:** Internal Use Only
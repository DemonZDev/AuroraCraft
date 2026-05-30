---
name: database-setup
description: Set up HikariCP database connection with async queries for Minecraft plugins
license: MIT
compatibility: opencode
metadata:
  category: database
  difficulty: intermediate
---

# Database Setup Skill

## What I Do

I help you set up a production-ready database connection for Minecraft plugins using HikariCP connection pooling with proper async query patterns.

## When to Use Me

Use this skill when:
- Setting up MySQL/MariaDB/PostgreSQL connection
- Implementing player data persistence
- Creating economy systems
- Building any plugin that needs database storage

## What I Generate

1. **DatabaseManager class** with HikariCP connection pool
2. **Async query helper methods** (SELECT, INSERT, UPDATE, DELETE)
3. **Proper resource management** (connection closing, shutdown)
4. **Error handling** with logging
5. **Example repository class** for data access

## Implementation Pattern

### 1. DatabaseManager Class

```java
package {package}.managers;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.function.Function;

public class DatabaseManager {
    private final JavaPlugin plugin;
    private HikariDataSource dataSource;
    
    public DatabaseManager(JavaPlugin plugin) {
        this.plugin = plugin;
        setupConnectionPool();
        createTables();
    }
    
    private void setupConnectionPool() {
        HikariConfig config = new HikariConfig();
        
        // Load from config.yml
        String host = plugin.getConfig().getString("database.host", "localhost");
        int port = plugin.getConfig().getInt("database.port", 3306);
        String database = plugin.getConfig().getString("database.database", "minecraft");
        String username = plugin.getConfig().getString("database.username", "root");
        String password = plugin.getConfig().getString("database.password", "");
        
        config.setJdbcUrl("jdbc:mysql://" + host + ":" + port + "/" + database);
        config.setUsername(username);
        config.setPassword(password);
        
        // Connection pool settings
        config.setMaximumPoolSize(10);
        config.setMinimumIdle(2);
        config.setConnectionTimeout(30000);
        config.setIdleTimeout(600000);
        config.setMaxLifetime(1800000);
        
        // Performance settings
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
        
        this.dataSource = new HikariDataSource(config);
        plugin.getLogger().info("Database connection pool initialized");
    }
    
    private void createTables() {
        executeAsync(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                "CREATE TABLE IF NOT EXISTS player_data (" +
                "uuid VARCHAR(36) PRIMARY KEY, " +
                "name VARCHAR(16) NOT NULL, " +
                "balance BIGINT DEFAULT 0, " +
                "last_seen BIGINT NOT NULL, " +
                "created_at BIGINT NOT NULL" +
                ")"
            )) {
                ps.executeUpdate();
                plugin.getLogger().info("Database tables created/verified");
            }
        }).exceptionally(ex -> {
            plugin.getLogger().severe("Failed to create tables: " + ex.getMessage());
            return null;
        });
    }
    
    /**
     * Execute async query with no return value
     */
    public CompletableFuture<Void> executeAsync(Consumer<Connection> action) {
        return CompletableFuture.runAsync(() -> {
            try (Connection conn = dataSource.getConnection()) {
                action.accept(conn);
            } catch (SQLException e) {
                throw new RuntimeException("Database error", e);
            }
        });
    }
    
    /**
     * Execute async query with return value
     */
    public <T> CompletableFuture<T> queryAsync(Function<Connection, T> query) {
        return CompletableFuture.supplyAsync(() -> {
            try (Connection conn = dataSource.getConnection()) {
                return query.apply(conn);
            } catch (SQLException e) {
                throw new RuntimeException("Database error", e);
            }
        });
    }
    
    /**
     * Execute async query with sync callback on main thread
     */
    public <T> void queryAsyncThenSync(Function<Connection, T> query, Consumer<T> callback) {
        queryAsync(query).thenAccept(result -> {
            Bukkit.getScheduler().runTask(plugin, () -> callback.accept(result));
        }).exceptionally(ex -> {
            plugin.getLogger().severe("Query failed: " + ex.getMessage());
            return null;
        });
    }
    
    public void shutdown() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
            plugin.getLogger().info("Database connection pool closed");
        }
    }
    
    public HikariDataSource getDataSource() {
        return dataSource;
    }
}
```

### 2. Example Repository Class

```java
package {package}.repositories;

import {package}.managers.DatabaseManager;
import {package}.models.PlayerData;
import org.bukkit.entity.Player;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

public class PlayerRepository {
    private final DatabaseManager database;
    
    public PlayerRepository(DatabaseManager database) {
        this.database = database;
    }
    
    public CompletableFuture<PlayerData> load(UUID uuid) {
        return database.queryAsync(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM player_data WHERE uuid = ?"
            )) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        return new PlayerData(
                            UUID.fromString(rs.getString("uuid")),
                            rs.getString("name"),
                            rs.getLong("balance"),
                            rs.getLong("last_seen"),
                            rs.getLong("created_at")
                        );
                    }
                    return null;
                }
            }
        });
    }
    
    public CompletableFuture<Void> save(PlayerData data) {
        return database.executeAsync(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO player_data (uuid, name, balance, last_seen, created_at) " +
                "VALUES (?, ?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE name = ?, balance = ?, last_seen = ?"
            )) {
                ps.setString(1, data.getUuid().toString());
                ps.setString(2, data.getName());
                ps.setLong(3, data.getBalance());
                ps.setLong(4, data.getLastSeen());
                ps.setLong(5, data.getCreatedAt());
                // ON DUPLICATE KEY UPDATE values
                ps.setString(6, data.getName());
                ps.setLong(7, data.getBalance());
                ps.setLong(8, data.getLastSeen());
                ps.executeUpdate();
            }
        });
    }
    
    public CompletableFuture<Void> delete(UUID uuid) {
        return database.executeAsync(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                "DELETE FROM player_data WHERE uuid = ?"
            )) {
                ps.setString(1, uuid.toString());
                ps.executeUpdate();
            }
        });
    }
}
```

### 3. config.yml Section

```yaml
database:
  host: localhost
  port: 3306
  database: minecraft
  username: root
  password: changeme
```

### 4. Dependency (pom.xml)

```xml
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.1.0</version>
</dependency>
```

### 5. Shade Configuration (pom.xml)

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-shade-plugin</artifactId>
    <version>3.5.1</version>
    <configuration>
        <relocations>
            <relocation>
                <pattern>com.zaxxer.hikari</pattern>
                <shadedPattern>{package}.libs.hikari</shadedPattern>
            </relocation>
        </relocations>
    </configuration>
</plugin>
```

## Usage Example

```java
// In main plugin class
private DatabaseManager databaseManager;
private PlayerRepository playerRepository;

@Override
public void onEnable() {
    databaseManager = new DatabaseManager(this);
    playerRepository = new PlayerRepository(databaseManager);
}

@Override
public void onDisable() {
    databaseManager.shutdown();
}

// In listener
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    
    // Load async, apply sync
    playerRepository.load(player.getUniqueId()).thenAccept(data -> {
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (data != null) {
                player.sendMessage("Welcome back! Balance: " + data.getBalance());
            } else {
                // Create new player data
                PlayerData newData = new PlayerData(player);
                playerRepository.save(newData);
            }
        });
    });
}
```

## Critical Rules

1. **NEVER** query database on main thread
2. **ALWAYS** use HikariCP connection pool
3. **ALWAYS** close connections (use try-with-resources)
4. **ALWAYS** use PreparedStatement (prevent SQL injection)
5. **ALWAYS** apply Bukkit API calls on main thread after async query
6. **ALWAYS** shade HikariCP into your JAR
7. **ALWAYS** close connection pool in onDisable()

## Common Mistakes to Avoid

- ❌ Using `DriverManager.getConnection()` directly
- ❌ Blocking main thread with database queries
- ❌ Not closing connections
- ❌ SQL injection via string concatenation
- ❌ Forgetting to shade HikariCP
- ❌ Not handling exceptions properly

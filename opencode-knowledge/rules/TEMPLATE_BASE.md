# Minecraft Plugin Development Rules
## Auto-generated for {SOFTWARE} | {COMPILER} | {LANGUAGE}

> **CRITICAL:** These rules are MANDATORY. Every violation causes compilation errors, runtime crashes, or data corruption. Read this BEFORE writing any code. This document was synthesized from thousands of real-world plugin failures — every rule exists because a production server crashed due to its violation.

---

## Project Configuration

- **Server Software:** {SOFTWARE}
- **Build System:** {COMPILER}
- **Language:** {LANGUAGE}
- **Java Version:** {JAVA_VERSION}
- **API Version:** {API_VERSION}

---

## 1. API Usage Rules

{API_RULES}

---

## 2. Thread Safety Rules

### The Main Thread Law

Minecraft plugins run inside a single JVM process. The server's main game loop processes 20 ticks per second (50ms per tick). **Any operation that blocks the main thread for more than a few milliseconds directly reduces TPS and lags every player on the server.**

```
MAIN THREAD (must run here):
  ✅ All Bukkit/Paper API calls — world, player, inventory, entity, scoreboard
  ✅ Event handlers (@EventHandler methods)
  ✅ Command execution (onCommand)
  ✅ player.sendMessage(), player.teleport(), player.getInventory().addItem()
  ✅ Bukkit.getPlayer(), Bukkit.getOnlinePlayers()
  ✅ Event firing (Bukkit.getPluginManager().callEvent)
  ✅ Scheduler task registration (but NOT the async work itself)

ASYNC THREAD (safe to run here):
  ✅ Database queries (JDBC, HikariCP)
  ✅ HTTP requests (webhooks, REST APIs, Discord webhooks)
  ✅ File I/O (config reads/writes, log files)
  ✅ Heavy computation (pathfinding, world generation, sorting large datasets)
  ✅ Redis operations (Jedis, Lettuce)
  ✅ Adventure Component creation (Components are thread-safe)
```

### The Scheduler Decision Tree

```
Does it modify world/player/inventory/entity?
├── YES → runTask() [SYNC — main thread]
└── NO → Does it do I/O or heavy computation?
    ├── YES → runTaskAsynchronously() [ASYNC — worker thread]
    │         Then (if you need Bukkit API): runTask() [SYNC — main thread]
    └── NO → runTask() [Just do it on main thread, it's fast enough]
```

### The Async-Sync Bridge Pattern (MANDATORY)

Every database call, HTTP request, or file read that feeds data into the Bukkit API must follow this pattern:

```java
// STEP 1: Launch async work from event handler (main thread)
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();

    CompletableFuture.supplyAsync(() -> {
        // STEP 2: I/O on worker thread — NO Bukkit API here
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT * FROM players WHERE uuid = ?")) {
            stmt.setString(1, uuid.toString());
            ResultSet rs = stmt.executeQuery();
            return rs.next() ? mapPlayerData(rs) : createDefault(uuid);
        }
    }, dbExecutor).thenAccept(data -> {
        // STEP 3: Back on main thread for Bukkit API
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (!player.isOnline()) return; // Player may have disconnected
            cache.put(uuid, data);
            player.sendMessage(Component.text("Welcome back! Balance: " + data.getBalance(),
                NamedTextColor.GREEN));
        });
    }).exceptionally(ex -> {
        plugin.getLogger().severe("Failed to load player " + uuid + ": " + ex.getMessage());
        return null;
    });
}
```

**Critical safety checks after ANY async gap:**
- Always check `player.isOnline()` — player may have disconnected during async work
- Always null-check `Bukkit.getPlayer(uuid)` — player reference is stale across async boundaries
- Never assume the world/chunk/entity still exists — it may have been unloaded

### Thread-Safe Collections

```java
// ❌ WRONG — HashMap + async = ConcurrentModificationException
private final Map<UUID, PlayerData> cache = new HashMap<>();

// ✅ CORRECT — thread-safe reads/writes from any thread
private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();

// ✅ ALSO CORRECT — for lists accessed from multiple threads
private final List<Player> queue = new CopyOnWriteArrayList<>();

// ✅ ALSO CORRECT — for sets
private final Set<UUID> banned = ConcurrentHashMap.newKeySet();
```

### Race Condition Prevention (Economy Operations)

```java
// ❌ WRONG — Read-modify-write is not atomic. Two threads can both read 100,
//          both add 50, both write 150 — player keeps 50 extra tokens.
public void addTokens(UUID uuid, int amount) {
    PlayerData data = cache.get(uuid);
    data.setTokens(data.getTokens() + amount); // Race condition!
}

// ✅ CORRECT — Atomic update via compute()
public void addTokens(UUID uuid, int amount) {
    cache.compute(uuid, (k, data) -> {
        if (data == null) return null;
        data.setTokens(data.getTokens() + amount);
        return data;
    });
}

// ✅ BEST — Atomic check-and-deduct via database (survives crashes)
public boolean deductBalance(UUID uuid, double amount) {
    try (Connection conn = ds.getConnection();
         PreparedStatement stmt = conn.prepareStatement(
             "UPDATE players SET balance = balance - ? WHERE uuid = ? AND balance >= ?")) {
        stmt.setDouble(1, amount);
        stmt.setString(2, uuid.toString());
        stmt.setDouble(3, amount);
        return stmt.executeUpdate() > 0; // false = insufficient balance
    } catch (SQLException e) {
        return false;
    }
}
```

### Dedicated Thread Pool (NOT ForkJoinPool)

```java
// ✅ CORRECT — dedicated pool prevents blocking the JVM's shared ForkJoinPool
private final ExecutorService dbExecutor = Executors.newFixedThreadPool(4, r -> {
    Thread t = new Thread(r, "MyPlugin-DB-Worker");
    t.setDaemon(true);
    return t;
});

// Supply work to YOUR pool, not the common pool
CompletableFuture.supplyAsync(() -> dbWork(), dbExecutor);

// Shutdown gracefully in onDisable()
@Override
public void onDisable() {
    dbExecutor.shutdown();
    try {
        if (!dbExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
            dbExecutor.shutdownNow();
        }
    } catch (InterruptedException e) {
        dbExecutor.shutdownNow();
        Thread.currentThread().interrupt();
    }
}
```

{FOLIA_RULES}

---

## 3. Build System Rules

{BUILD_RULES}

---

## 4. Language-Specific Rules

{LANGUAGE_RULES}

---

## 5. AI-Generated Code Risk Statistics

> **Research from 10,000+ AI-generated plugins:** The majority contain critical flaws. These are the most frequent issues:

| Issue | Frequency | Severity | Detection |
|---|---|---|---|
| Synchronous database queries blocking main thread | 78% | CRITICAL | Look for JDBC/HTTP calls in @EventHandler without async wrapper |
| Unthrottled PlayerMoveEvent handlers | 64% | HIGH | Look for expensive operations in onMove() without block-change check |
| Excessive object allocation in hot paths | 52% | MEDIUM | Look for `new Location()`, `new Random()`, String concat in loops |
| Missing caching (repeated database hits) | 41% | MEDIUM | Look for database calls in frequently-called methods without cache check |
| Memory leaks from uncancelled repeating tasks | 33% | HIGH | Look for runTaskTimer without storing returned BukkitTask |
| SQL injection via string concatenation | 28% | CRITICAL | Look for `"SELECT ..." + variable` — grep for `+ "` in SQL strings |
| Adventure API + ChatColor mixing | 25% | MEDIUM | Look for both `NamedTextColor` and `ChatColor` in same file |
| Missing plugin.yml api-version | 22% | HIGH | Check for `api-version:` line in plugin.yml |
| Paper API not marked provided/compileOnly | 20% | CRITICAL | Check JAR size — >20MB means Paper API leaked in |
| HashMap instead of ConcurrentHashMap for async access | 18% | HIGH | Look for `new HashMap<>()` in classes with async methods |
| No isOnline() check after async gap | 15% | HIGH | Look for Bukkit.getPlayer() after .thenAccept() |
| Inventory clicks not cancelled in GUI handlers | 15% | CRITICAL | Look for onClick() without event.setCancelled(true) |
| NMS imports (net.minecraft.server) | 12% | CRITICAL | Grep for `net.minecraft.server` |
| Not closing connections (resource leak) | 10% | HIGH | Look for getConnection() without try-with-resources |
| Catching Exception without logging | 8% | MEDIUM | Look for `catch (Exception e) { }` or bare `e.printStackTrace()` |

> **IMPORTANT:** You are an AI. These are YOUR most common mistakes. Triple-check every line for these patterns. When in doubt, assume the pattern is present until you have verified otherwise.

---

## 6. Compilation & Runtime Error Prevention

### Compilation Errors You MUST Avoid

1. **Cannot find symbol — deprecated/removed methods:**
   - Use {API_PACKAGE} imports only
   - All server APIs must be `{DEPENDENCY_SCOPE}`
   - Repository: {REPOSITORY_URL}
   - NEVER use `player.getItemInHand()` — use `player.getInventory().getItemInMainHand()`
   - NEVER use `ChatColor.RED + "text"` — use Adventure Components

2. **Class name mismatch:**
   - Public class `MyPlugin` MUST be in `MyPlugin.java` — filename and class name must match EXACTLY
   - One public class per file (inner classes are fine)

3. **Plugin not found / Missing dependency:**
   - Maven: verify `<repository>` for PaperMC is declared
   - Gradle: verify `maven("https://repo.papermc.io/repository/maven-public/")` in repositories block
   - All commands declared in plugin.yml's `commands:` section
   - Main class path in plugin.yml matches actual package + class name

4. **plugin.yml syntax errors:**
   - Use spaces, NEVER tabs (YAML forbids tabs)
   - Space after colon: `name: MyPlugin` NOT `name:MyPlugin`
   - Version in quotes: `version: "1.0.0"` (prevents float parsing)
   - api-version in quotes: `api-version: "{API_VERSION}"` (preserves format)

### Runtime Errors You MUST Avoid

1. **ConcurrentModificationException:**
   - Never modify a collection while iterating it
   - Never access HashMap from async threads → use ConcurrentHashMap
   - Never call Bukkit API from async threads → IllegalStateException or silent corruption

2. **NullPointerException — the #1 crash:**
   - Always null-check `Bukkit.getPlayer(name)` — returns null if offline
   - Always null-check `event.getItem()` — can be AIR or null
   - Always null-check `event.getClickedInventory()` — can be null
   - Always null-check after async: `Bukkit.getPlayer(uuid)` may return null if player left
   - Use `Optional` for public API return values, `@Nullable` for internal

3. **NoClassDefFoundError at runtime:**
   - Compile-scope dependencies must be shaded into the JAR
   - Verify with `jar tf MyPlugin.jar | grep "com/zaxxer/hikari"` — should show your relocated path
   - JDBC drivers must be shaded but NOT relocated (breaks DriverManager string-based lookup)

4. **Memory leaks — slow death:**
   - Cancel ALL scheduled tasks in `onDisable()` — store every BukkitTask reference
   - Close database connections in `onDisable()` — use HikariCP shutdown
   - Unregister listeners if you registered them dynamically
   - Clear caches in `onDisable()` — especially static caches
   - Never register listeners per-player without cleanup — use GUIManager pattern instead

5. **ClassCastException — API identity conflict:**
   - Paper API scope MUST be `provided`/`compileOnly` — never `compile`/`implementation`
   - If JAR is >20MB, Paper API is leaking in — fix the scope immediately

---

## 7. Architecture Rules

### Project Structure (Mandatory)

```
src/main/java/{PACKAGE_PATH}/
├── {MAIN_CLASS}.java          ← Main plugin class (wiring harness ONLY — no logic)
├── commands/                   ← Command handlers (input parsing + delegation only)
│   ├── CommandRegistry.java    ← Centralized command registration
│   └── admin/                  ← Admin-only subcommands
├── listeners/                  ← Event listeners (thin — detect event, call manager)
├── managers/                   ← Business logic managers (the heart of your plugin)
├── models/                     ← Data objects (POJOs/records — no Bukkit imports)
├── storage/                    ← Data access layer (DataStorage interface + implementations)
├── hooks/                      ← Third-party plugin integration (VaultHook, PAPIHook)
├── tasks/                      ← Scheduled/repeating task classes
├── utils/                      ← Stateless helper methods (pure functions)
└── api/                        ← Public API facade for other plugins
```

### Package Responsibility Rules

| Package | Contains | Must NOT Contain |
|---------|----------|-----------------|
| `{MAIN_CLASS}.java` | Manager initialization, command/listener registration, shutdown | Business logic, database calls, event handling, utility methods |
| `commands/` | Input parsing, permission checks, delegation to managers | Business logic, database calls, config parsing |
| `listeners/` | Event detection, delegation to managers | Business logic, database queries, state modification |
| `managers/` | Business logic, state management, coordination | Direct config access (use ConfigManager), raw SQL (use Repository) |
| `models/` | Data fields, getters, validation in constructors | Bukkit imports, business logic, I/O |
| `storage/` | CRUD operations, query execution | Business logic, Bukkit API calls |
| `utils/` | Stateless helper functions | Plugin state, constructor state, instance methods |

### Naming Conventions (Strict)

- **Main class:** `{MAIN_CLASS}` (exact plugin name, no suffix)
- **Managers:** `PlayerDataManager`, `ShopManager`, `ArenaManager` — owns state and lifecycle
- **Services:** `EconomyService`, `PermissionService` — stateless business logic
- **Repositories:** `PlayerRepository`, `TransactionRepository` — data access only
- **Listeners:** `PlayerConnectionListener`, `CombatListener` — domain-grouped, not per-event
- **Commands:** `ShopCommand`, `HomeCommand` — FeatureCommand suffix
- **Events:** `TokensChangeEvent`, `PlayerDataLoadEvent` — descriptive noun + Event suffix
- **Models:** `PlayerData`, `ShopItem`, `Transaction` — descriptive nouns, no suffix

### Manager Initialization Order (NON-NEGOTIABLE)

Violating this order causes NullPointerException at startup:

```
1. ConfigManager          ← Everything else reads config. Must be first.
2. DatabaseManager        ← Opens connections. Must be before any data access.
3. CacheManager           ← If used. Depends on database for cache warming.
4. PlayerDataManager      ← Depends on database + config.
5. Domain Managers        ← Shop, Economy, Arena — depend on data managers.
6. GUIManager             ← Depends on nothing but referenced by commands.
7. CommandRegistry        ← Registers commands. Depends on all managers it delegates to.
8. Listeners              ← Register last. They fire IMMEDIATELY on registration.
```

Shutdown order is the **exact reverse** — domain managers first, config last.

### The Manager Pattern (Constructor Injection)

```java
// ✅ CORRECT — constructor injection, testable, lifecycle-safe
public class PlayerDataManager {
    private final {MAIN_CLASS} plugin;
    private final DatabaseManager databaseManager;
    private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();

    public PlayerDataManager({MAIN_CLASS} plugin) {
        this.plugin = plugin;
        this.databaseManager = plugin.getDatabaseManager();
        initializeSchema();
    }

    public void shutdown() {
        saveAll(); // Synchronous — server is shutting down, can't use async
        cache.clear();
    }
}

// ❌ WRONG — static singleton on every manager (survives /reload, leaks memory)
// public class PlayerDataManager {
//     private static PlayerDataManager instance;
//     public static PlayerDataManager getInstance() { ... }
// }
```

**ONE static `getInstance()` is acceptable — on the main plugin class only.** All managers accessed through it.

### The Command Pattern (Input Validation + Delegation)

```java
public class GiveCommand implements CommandExecutor {
    private final PlayerDataManager playerDataManager;

    public GiveCommand(PlayerDataManager pdm) {
        this.playerDataManager = pdm;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        // 1. Type check
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("Players only.", NamedTextColor.RED));
            return true;
        }
        // 2. Permission check (fail fast, before any work)
        if (!sender.hasPermission("myplugin.give")) {
            sender.sendMessage(Component.text("No permission.", NamedTextColor.RED));
            return true;
        }
        // 3. Argument count
        if (args.length < 2) {
            sender.sendMessage(Component.text("Usage: /give <player> <amount>", NamedTextColor.RED));
            return true;
        }
        // 4. Target validation
        Player target = Bukkit.getPlayer(args[0]);
        if (target == null) {
            sender.sendMessage(Component.text("Player not found.", NamedTextColor.RED));
            return true;
        }
        // 5. Numeric validation
        int amount;
        try {
            amount = Integer.parseInt(args[1]);
        } catch (NumberFormatException e) {
            sender.sendMessage(Component.text("Invalid number: " + args[1], NamedTextColor.RED));
            return true;
        }
        if (amount <= 0) {
            sender.sendMessage(Component.text("Amount must be positive.", NamedTextColor.RED));
            return true;
        }
        // 6. All valid — delegate to service
        playerDataManager.addTokens(target.getUniqueId(), amount);
        sender.sendMessage(Component.text("Gave " + amount + " tokens to " + target.getName(),
            NamedTextColor.GREEN));
        return true;
    }
}
```

### The Command Registry (Centralized Registration)

```java
public class CommandRegistry {
    private final {MAIN_CLASS} plugin;

    public CommandRegistry({MAIN_CLASS} plugin) { this.plugin = plugin; }

    public void register() {
        bind("shop", new ShopCommand(plugin.getShopManager()));
        bind("tokens", new TokensCommand(plugin.getPlayerDataManager()));
        bind("myplugin", new MainCommand(plugin));
    }

    private void bind(String name, CommandExecutor executor) {
        PluginCommand cmd = plugin.getCommand(name);
        if (cmd == null) {
            plugin.getLogger().severe("Command '" + name + "' not in plugin.yml!");
            return;
        }
        cmd.setExecutor(executor);
        if (executor instanceof TabCompleter tc) cmd.setTabCompleter(tc);
    }
}
```

---

## 8. Database Rules

### Golden Rules

1. **NEVER** use `DriverManager.getConnection()` directly — always HikariCP
2. **NEVER** block main thread with database queries — always async
3. **NEVER** concatenate user input into SQL — always PreparedStatement
4. **NEVER** use `SELECT *` on tables with BLOB/TEXT columns — select specific columns
5. **ALWAYS** use try-with-resources for Connection, PreparedStatement, ResultSet
6. **ALWAYS** use `ON DUPLICATE KEY UPDATE` for upserts (MySQL) or `INSERT OR REPLACE` (SQLite)
7. **ALWAYS** run EXPLAIN on new queries before shipping — catch missing indexes early
8. **ALWAYS** set `busy_timeout` for SQLite connections — prevents SQLITE_BUSY crashes

### HikariCP Setup (Production Configuration)

```java
public class DatabaseManager {
    private final {MAIN_CLASS} plugin;
    private HikariDataSource dataSource;

    public DatabaseManager({MAIN_CLASS} plugin) {
        this.plugin = plugin;
        connect();
    }

    private void connect() {
        HikariConfig config = new HikariConfig();

        // Connection string
        config.setJdbcUrl("jdbc:mysql://" + getHost() + ":" + getPort() + "/" + getDatabase()
            + "?useSSL=false&characterEncoding=utf8mb4");

        // Pool sizing — 2-5 connections for most plugins
        config.setMaximumPoolSize(5);
        config.setMinimumIdle(2);
        config.setConnectionTimeout(30_000);   // 30s — fail fast, don't hang
        config.setIdleTimeout(600_000);        // 10min — how long an idle connection lives
        config.setMaxLifetime(1_800_000);      // 30min — max connection age (must be < MySQL wait_timeout)
        config.setLeakDetectionThreshold(60_000); // Log warning if connection held >60s

        // Performance — every one of these matters
        config.addDataSourceProperty("cachePrepStmts", "true");
        config.addDataSourceProperty("prepStmtCacheSize", "250");
        config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
        config.addDataSourceProperty("useServerPrepStmts", "true");
        config.addDataSourceProperty("useLocalSessionState", "true");
        config.addDataSourceProperty("rewriteBatchedStatements", "true");
        config.addDataSourceProperty("cacheResultSetMetadata", "true");
        config.addDataSourceProperty("elideSetAutoCommits", "true");
        config.addDataSourceProperty("maintainTimeStats", "false");

        config.setPoolName("{MAIN_CLASS}-Pool");

        try {
            this.dataSource = new HikariDataSource(config);
            initializeSchema();
        } catch (Exception e) {
            plugin.getLogger().severe("Database connection failed: " + e.getMessage());
            plugin.getServer().getPluginManager().disablePlugin(plugin);
        }
    }

    public Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }

    public void shutdown() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
        }
    }
}
```

### SQLite Configuration (Single-Server Plugins)

```java
private void connectSQLite() {
    File dbFile = new File(plugin.getDataFolder(), "data.db");

    HikariConfig config = new HikariConfig();
    config.setJdbcUrl("jdbc:sqlite:" + dbFile.getAbsolutePath());
    config.setMaximumPoolSize(1);     // SQLite: 1 writer at a time
    config.addDataSourceProperty("busy_timeout", "5000"); // Wait 5s on lock
    config.setConnectionInitSql(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;"
    );

    this.dataSource = new HikariDataSource(config);
}
```

**SQLite WAL mode is non-negotiable for any plugin with >1 concurrent user.** Without WAL, a single write blocks all readers. With WAL, readers and writers operate concurrently.

### SQL Injection Prevention (MANDATORY)

```java
// ❌ SQL INJECTION — DO NOT SHIP THIS
String sql = "SELECT * FROM players WHERE name = '" + playerName + "'";
// playerName = "'; DROP TABLE players; --" → disaster

// ✅ CORRECT — parameterized query
PreparedStatement stmt = conn.prepareStatement("SELECT * FROM players WHERE name = ?");
stmt.setString(1, playerName);
```

**This includes dynamic ORDER BY, GROUP BY, and LIMIT clauses.** These can't be parameterized in JDBC — validate them against a whitelist:

```java
private static final Set<String> ALLOWED_SORT_COLUMNS = Set.of("balance", "playtime", "name");

public List<PlayerData> getLeaderboard(String sortBy) {
    if (sortBy == null || !ALLOWED_SORT_COLUMNS.contains(sortBy)) {
        sortBy = "balance"; // Safe default
    }
    // Now it's safe to use in string concatenation
    String sql = "SELECT * FROM players ORDER BY " + sortBy + " DESC LIMIT 10";
}
```

### Schema Versioning (Migrations)

Every plugin needs schema versioning from day one:

```java
private void initializeSchema() {
    db.execute("CREATE TABLE IF NOT EXISTS schema_version (version INT NOT NULL)");
    int currentVersion = getCurrentVersion();

    if (currentVersion < 1) {
        db.execute("CREATE TABLE IF NOT EXISTS player_data (...)"); // v1 schema
        setSchemaVersion(1);
    }
    if (currentVersion < 2) {
        db.execute("ALTER TABLE player_data ADD COLUMN playtime BIGINT DEFAULT 0"); // v2
        setSchemaVersion(2);
    }
    // Add future migrations here — NEVER modify existing migrations
}
```

---

## 9. Performance Rules

### Event Handler Optimization

PlayerMoveEvent fires ~20x per second per player INCLUDING head rotation. At 100 players, that's 2,000 events/second. Unfiltered handlers are the #1 source of server lag.

```java
// ❌ CATASTROPHIC — runs on every head twitch (2,000+ calls/sec at 100 players)
@EventHandler
public void onMove(PlayerMoveEvent event) {
    checkRegion(event.getPlayer()); // EXPENSIVE — runs ALWAYS
}

// ✅ CORRECT — only on block transition (~100 calls/sec at 100 players — 95% reduction)
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Location from = event.getFrom();
    Location to = event.getTo();
    if (from.getBlockX() == to.getBlockX()
        && from.getBlockY() == to.getBlockY()
        && from.getBlockZ() == to.getBlockZ()) {
        return; // Head rotation only — skip
    }
    checkRegion(event.getPlayer(), to);
}

// ✅ BEST — use Paper's PlayerMoveBlockEvent (1.21+)
@EventHandler
public void onMoveBlock(PlayerMoveBlockEvent event) {
    checkRegion(event.getPlayer(), event.getTo());
}
```

### Additional Performance Rules

- **Always set `ignoreCancelled = true`** on @EventHandler unless you specifically need cancelled events
- **Cache parsed MiniMessage/Adventure Components** — parsing is expensive (~3µs vs ~0µs for cached)
- **Cache Bukkit.getOnlinePlayers() in repeating tasks** — each call allocates a new array
- **Use batch operations for bulk database writes** — 1 round-trip for 100 rows vs 100 round-trips
- **Pre-size ArrayLists when size is known** — prevents repeated array reallocation
- **Never use `new Random()` in hot loops** — use `ThreadLocalRandom.current()`
- **Never concatenate Strings in loops** — use StringBuilder or String.join()
- **Use primitives (`int`, `long`) not boxed types (`Integer`, `Long`) in hot paths** — prevents auto-boxing overhead
- **Avoid `Bukkit.getOfflinePlayer(String)` on main thread** — may make blocking Mojang API call
- **Use `ChatColor.translateAlternateColorCodes` once and cache** — don't re-parse color codes on every message

### Most Expensive Operations (Scale of 1-10)

| Operation | Relative Cost | Optimization |
|-----------|--------------|-------------|
| String concatenation in tight loop | 5 | StringBuilder |
| HashMap lookup | 1 | Already fast — don't avoid it |
| ConcurrentHashMap lookup | 1.5 | Worth it for thread safety |
| MiniMessage parsing | 200 | Cache parsed Components |
| `Bukkit.getOnlinePlayers()` | 50 | Cache in repeating tasks, refresh periodically |
| Database SELECT by PK (async) | 50-3000 | Async + cache hit first |
| Database INSERT (async) | 100-5000 | Batch writes |
| PlayerMoveEvent (unfiltered) | 2000/sec × handler cost | Block-change filter |
| `Bukkit.getOfflinePlayer(String)` | 5000-50000 | Use UUID variant, never on main thread |

---

## 10. Configuration Rules

### ConfigManager Pattern

```java
public class ConfigManager {
    private final {MAIN_CLASS} plugin;
    private FileConfiguration config;

    public ConfigManager({MAIN_CLASS} plugin) {
        this.plugin = plugin;
        plugin.saveDefaultConfig(); // Creates config.yml from resources if missing
        this.config = plugin.getConfig();
        validate();
    }

    // Typed accessors with VALIDATED defaults
    // NEVER return raw config values — wrap in typed getters
    // NEVER expose the FileConfiguration to other classes

    public String getDatabaseHost() {
        return config.getString("database.host", "localhost");
    }

    public int getMaxHomes() {
        int val = config.getInt("homes.max-per-player", 3);
        return Math.max(1, Math.min(val, 50)); // Clamp to valid range
    }

    public void reload() {
        plugin.reloadConfig();
        this.config = plugin.getConfig();
        validate();
    }

    private void validate() {
        // Log warnings for invalid config — never crash
        int maxHomes = config.getInt("homes.max-per-player", 3);
        if (maxHomes < 1) plugin.getLogger().warning("homes.max-per-player must be >= 1");
    }
}
```

### Externalize ALL User-Facing Messages

```yaml
# messages.yml — NEVER hardcode messages in Java
prefix: "&8[&b{MAIN_CLASS}&8]&r"
errors:
  no-permission: "{prefix} &cYou don't have permission."
  player-not-found: "{prefix} &cPlayer '{player}' not found."
  invalid-number: "{prefix} &c'{input}' is not a valid number."
```

{MESSAGE_API_RULE}

---

## 11. Code Quality Rules

### Error Handling

```java
// ❌ WRONG — silent failure, impossible to debug
try { dangerousOperation(); }
catch (Exception e) { e.printStackTrace(); } // Lost on server restart

// ✅ CORRECT — log with context, provide fallback
try {
    dangerousOperation();
} catch (SQLException e) {
    plugin.getLogger().severe("Failed to save data for " + playerId + ": " + e.getMessage());
    // Fallback: retry? use backup storage? notify admin?
}
```

### Resource Management

```java
// ALWAYS use try-with-resources for AutoCloseable resources
try (Connection conn = dataSource.getConnection();
     PreparedStatement stmt = conn.prepareStatement(sql);
     ResultSet rs = stmt.executeQuery()) {
    // Process results
} // All three automatically closed, even on exception
```

### What NEVER to Do (Instant Rejection in Code Review)

- ❌ `e.printStackTrace()` in production code → use plugin.getLogger().severe()
- ❌ Empty catch blocks `catch (Exception e) { }` → log and handle
- ❌ `System.out.println()` → use plugin.getLogger()
- ❌ `new Random()` in hot loops → ThreadLocalRandom.current()
- ❌ `String sql = "SELECT..." + variable` → PreparedStatement
- ❌ `player.sendMessage(ChatColor.RED + "Error")` → Adventure Components
- ❌ `HashMap` for async-accessible caches → ConcurrentHashMap
- ❌ `Bukkit.getScheduler().runTaskTimer(...)` without storing the returned BukkitTask
- ❌ `return null` from onTabComplete → return Collections.emptyList()
- ❌ `plugin.getCommand("x").setExecutor(...)` without null check → check for null

---

## 12. Plugin Lifecycle Rules

### onEnable() — Initialization Order

```java
@Override
public void onEnable() {
    // 1. Save default config (creates config.yml from resources)
    saveDefaultConfig();

    // 2. Initialize data layer (config → database)
    configManager = new ConfigManager(this);
    databaseManager = new DatabaseManager(this);

    // 3. Verify critical resources
    if (!databaseManager.isConnected()) {
        getLogger().severe("Database connection failed — disabling plugin.");
        getServer().getPluginManager().disablePlugin(this);
        return;
    }

    // 4. Initialize service layer (managers that depend on data layer)
    playerDataManager = new PlayerDataManager(this);
    shopManager = new ShopManager(this);

    // 5. Initialize presentation layer
    guiManager = new GUIManager();
    registerCommands();    // CommandRegistry
    registerListeners();   // All @EventHandler classes

    // 6. Start background tasks
    startAutoSave();
    startLeaderboardUpdate();

    getLogger().info("{MAIN_CLASS} v" + getDescription().getVersion() + " enabled.");
}
```

### onDisable() — Shutdown Order (REVERSE)

```java
@Override
public void onDisable() {
    // 1. Cancel all scheduled tasks FIRST
    if (autoSaveTask != null) autoSaveTask.cancel();
    if (leaderboardTask != null) leaderboardTask.cancel();

    // 2. Save all in-memory data (SYNCHRONOUS — no time for async during shutdown)
    if (playerDataManager != null) playerDataManager.saveAll();

    // 3. Close connections (reverse of init order)
    if (databaseManager != null) databaseManager.shutdown();

    // 4. Clear static references
    instance = null;

    getLogger().info("{MAIN_CLASS} disabled.");
}
```

### Critical Lifecycle Rules

- **NEVER** call `Bukkit.getServer()` or `getServer()` in constructors — server isn't ready
- **NEVER** register listeners before managers are initialized — listeners fire immediately
- **NEVER** assume `onDisable()` will run — server crashes skip it. Save incrementally, not just on shutdown
- **NEVER** call external APIs in `onEnable()` that could hang — use timeouts or defer to async
- **ALWAYS** verify database connection before proceeding — if DB is down, fail fast with clear error

---

## 13. Reload Safety

### Why `/reload` Is Dangerous and What to Do Instead

`/reload` does NOT restart the JVM. It calls `onDisable()` then `onEnable()` on every plugin. This causes:

1. **Static fields survive** — old plugin instances persist in static references
2. **Thread pools survive** — async callbacks from old plugin keep running
3. **Listeners may duplicate** — if onDisable() doesn't unregister them
4. **Scheduled tasks may duplicate** — same reason

**The safe approach:** NEVER use `/reload`. Implement your own soft reload command that only reloads what needs reloading (config files, message files). For a full reload, restart the server.

```java
public class ReloadSubCommand implements SubCommand {
    @Override
    public void execute(CommandSender sender, String[] args) {
        plugin.getConfigManager().reload();      // Re-read config.yml
        plugin.getMessageManager().reload();      // Re-read messages.yml
        plugin.getShopManager().reloadConfig();   // Re-read shop settings from config
        // DO NOT: clear caches, close/reopen database, re-register commands/listeners
        sender.sendMessage(Component.text("Configuration reloaded.", NamedTextColor.GREEN));
    }
}
```

---

## 14. Testing & Verification

### Pre-Compilation Checklist

- [ ] All imports use {API_PACKAGE}
- [ ] Main class name matches filename exactly
- [ ] plugin.yml has correct main class path
- [ ] All dependencies have correct scope: {DEPENDENCY_SCOPE}
- [ ] Paper repository declared in build file
- [ ] No `ChatColor` imports (use Adventure Components)
- [ ] No `net.minecraft.server` or `org.bukkit.craftbukkit` imports

### Post-Compilation Checklist

- [ ] JAR file is reasonable size (<5MB for typical plugin, <20MB absolute max)
- [ ] No server APIs shaded: `jar tf plugin.jar | grep "org/bukkit"` returns nothing
- [ ] No Adventure leaked: `jar tf plugin.jar | grep "net/kyori"` returns nothing
- [ ] plugin.yml is at JAR root: `jar tf plugin.jar | grep "^plugin.yml$"`
- [ ] Shaded dependencies are relocated: check for your `libs/` package prefix
- [ ] JDBC drivers NOT relocated: check `org/sqlite`, `com/mysql` still at original paths
- [ ] No digital signature files: `jar tf plugin.jar | grep "\.SF$"` returns nothing

### Runtime Testing (On Actual Server)

- [ ] Plugin loads without errors in console
- [ ] All commands work and tab-complete correctly
- [ ] No errors on player join/quit
- [ ] Database connections open and close cleanly
- [ ] `/version YourPlugin` shows correct version (not `${project.version}`)
- [ ] No memory growth after 30+ minutes of use
- [ ] TPS remains stable with plugin enabled

---

## 15. Workflow Rules

### Mandatory Development Workflow

1. **Research Phase:**
   - {RESEARCH_INSTRUCTION}
   - Check latest API documentation for {SOFTWARE}
   - Verify all imports and methods exist in {API_VERSION}

2. **Planning Phase:**
   - Create architecture plan identifying all managers, commands, listeners
   - Generate comprehensive to-do list with clear acceptance criteria
   - Identify all required dependencies (with exact versions)

3. **Implementation Phase:**
   - Work through to-do list sequentially — one item at a time
   - Update to-do list after each completion (mark done, add new discoveries)
   - Implement data layer first (models, database), service layer second (managers), presentation layer last (commands, listeners)
   - Never leave incomplete items — finish or explicitly defer with reason

4. **Compilation Phase:**
   - Run {BUILD_COMMAND}
   - Fix ALL compilation errors before proceeding
   - Retry until clean build with zero warnings

5. **Verification Phase:**
   - Run through pre-compilation, post-compilation, and runtime checklists
   - Verify JAR structure with `jar tf`
   - Check that version in plugin.yml was properly filtered (not `${project.version}`)

6. **Documentation Phase:**
   - Generate README.md with installation instructions, commands, permissions, config reference
   - Document every command with usage examples
   - List all permissions and their defaults

7. **Completion Phase:**
   - Verify ALL to-do items are completed
   - Confirm plugin compiles with zero errors
   - Verify JAR produces no errors on server startup
   - Only then report completion to user

### Critical Workflow Rules

- **NEVER** skip to-do items without explicit removal and reason
- **NEVER** report completion with compilation errors remaining
- **NEVER** leave documentation incomplete
- **ALWAYS** update to-do list after each implementation step
- **ALWAYS** verify the JAR structure before claiming completion
- **ALWAYS** include `api-version` in plugin.yml

---

## Summary

These rules are NON-NEGOTIABLE. Every violation leads to one or more of:
- Compilation failures
- Runtime crashes (NullPointerException, NoClassDefFoundError)
- Data corruption (race conditions, SQL injection)
- Server lag (main thread blocking, unthrottled events)
- Memory leaks (uncancelled tasks, unclosed connections)
- Security vulnerabilities (SQL injection, path traversal, permission bypass)

When in doubt, consult the official {SOFTWARE} documentation and follow these rules strictly. The rules exist because real servers crashed — don't add your plugin to that list.

# Minecraft Plugin Development Rules
## Auto-generated for {SOFTWARE} | {COMPILER} | {LANGUAGE}

> **CRITICAL:** These rules are MANDATORY. Every violation causes compilation errors, runtime crashes, or data corruption. Read this BEFORE writing any code.

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

### Main Thread Requirements

**MUST run on main thread:**
- All world mutations (`block.setType()`, `world.spawnEntity()`, `entity.remove()`)
- All player state changes (`player.teleport()`, `player.openInventory()`, `player.setGameMode()`)
- All inventory operations (`inventory.setItem()`, `player.getInventory().addItem()`)
- All scoreboard operations
- All packet sending (`player.sendMessage()`, `player.sendTitle()`)

**CAN run async:**
- Database queries (JDBC, HikariCP)
- HTTP requests (webhooks, APIs)
- File I/O (config reads/writes)
- Pure computation (sorting, calculations)
- Redis operations

**Scheduler Decision Tree:**
```
Does it modify world/player/inventory? → runTask() [SYNC]
Is it a database query? → runTaskAsynchronously() [ASYNC]
Is it HTTP/file I/O? → runTaskAsynchronously() [ASYNC]
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

> **Codella Research:** The majority of AI-generated plugins contain critical flaws. These are the most frequent issues detected in real-world analysis:

| Issue | Frequency | Severity |
|---|---|---|
| Synchronous database queries blocking main thread | 78% | CRITICAL |
| Unthrottled PlayerMoveEvent handlers | 64% | HIGH |
| Excessive object allocation in hot paths | 52% | MEDIUM |
| Missing caching mechanisms (repeated DB hits) | 41% | MEDIUM |
| Memory leaks from uncancelled repeating tasks | 33% | HIGH |
| SQL injection via string concatenation | 28% | CRITICAL |
| Adventure API + ChatColor mixing | 25% | MEDIUM |
| Missing plugin.yml api-version | 22% | HIGH |
| Paper API not marked provided/compileOnly | 20% | CRITICAL |

> **IMPORTANT:** You are an AI. These are YOUR most common mistakes. Double-check every line for these patterns before declaring code complete.

## 6. Common Error Prevention

### Compilation Errors to Avoid

1. **Cannot find symbol errors:**
   - Use {API_PACKAGE} imports only
   - All server APIs must be `{DEPENDENCY_SCOPE}`
   - Repository: {REPOSITORY_URL}

2. **Class name mismatch:**
   - Main class MUST match filename
   - Public class `MyPlugin` MUST be in `MyPlugin.java`

3. **plugin.yml errors:**
   - Use spaces, NEVER tabs
   - Space after colon: `name: MyPlugin` not `name:MyPlugin`
   - Main class path: `{PACKAGE_PREFIX}.MyPlugin`
   - API version: `api-version: "{API_VERSION}"`

### Runtime Errors to Avoid

1. **ConcurrentModificationException:**
   - Never modify collections while iterating
   - Never call Bukkit API from async threads

2. **NullPointerException:**
   - Always null-check `Bukkit.getPlayer(name)`
   - Always null-check `event.getItem()`
   - Use `Optional` or explicit null checks

3. **Memory leaks:**
   - Cancel all tasks in `onDisable()`
   - Close all database connections in `onDisable()`
   - Unregister all listeners in `onDisable()`

---

## 7. Architecture Rules

### Project Structure
```
src/main/java/{PACKAGE_PATH}/
├── {MAIN_CLASS}.java          ← Main plugin class
├── commands/                   ← Command handlers
├── listeners/                  ← Event listeners
├── managers/                   ← Business logic managers
├── models/                     ← Data models
├── utils/                      ← Utility classes
└── api/                        ← Public API (if exposing)
```

### Naming Conventions

- **Main class:** `{MAIN_CLASS}` (no suffix)
- **Managers:** `PlayerDataManager`, `ShopManager` (owns state)
- **Services:** `EconomyService`, `PermissionService` (stateless)
- **Repositories:** `PlayerRepository`, `ShopRepository` (data access)
- **Listeners:** `PlayerListener`, `CombatListener` (domain-based)
- **Commands:** `ShopCommand`, `TeleportCommand` (feature-based)

### Manager Pattern

```java
public class {MAIN_CLASS} extends JavaPlugin {
    private ConfigManager configManager;
    private DatabaseManager databaseManager;
    private PlayerDataManager playerDataManager;
    
    @Override
    public void onEnable() {
        // Initialize in dependency order
        configManager = new ConfigManager(this);
        databaseManager = new DatabaseManager(this);
        playerDataManager = new PlayerDataManager(this, databaseManager);
        
        // Register commands and listeners
        registerCommands();
        registerListeners();
    }
    
    @Override
    public void onDisable() {
        // Shutdown in reverse order
        if (playerDataManager != null) playerDataManager.shutdown();
        if (databaseManager != null) databaseManager.shutdown();
    }
}
```

---

## 8. Database Rules

### Connection Management

- **NEVER** use `DriverManager.getConnection()` directly
- **ALWAYS** use HikariCP connection pool
- **NEVER** block main thread with database queries
- **ALWAYS** use async queries with sync callbacks

### Correct Pattern

```java
// CORRECT: Async query with sync callback
public void loadPlayerData(Player player) {
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("SELECT * FROM players WHERE uuid = ?")) {
            ps.setString(1, player.getUniqueId().toString());
            ResultSet rs = ps.executeQuery();
            
            if (rs.next()) {
                PlayerData data = new PlayerData(rs);
                
                // Apply to Bukkit API on main thread
                Bukkit.getScheduler().runTask(plugin, () -> {
                    cache.put(player.getUniqueId(), data);
                    player.sendMessage("Data loaded!");
                });
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Failed to load player data: " + e.getMessage());
        }
    });
}
```

### SQL Injection Prevention

- **NEVER** concatenate user input into SQL
- **ALWAYS** use PreparedStatement with placeholders
- **NEVER** trust player names or chat input

```java
// WRONG: SQL injection vulnerability
String sql = "SELECT * FROM players WHERE name = '" + playerName + "'";

// CORRECT: Parameterized query
PreparedStatement ps = conn.prepareStatement("SELECT * FROM players WHERE name = ?");
ps.setString(1, playerName);
```

---

## 9. Performance Rules

### Event Handler Optimization

- **NEVER** use `PlayerMoveEvent` without throttling
- **NEVER** iterate `Bukkit.getOnlinePlayers()` in repeating tasks
- **NEVER** perform expensive operations in high-frequency events

### Correct Patterns

```java
// WRONG: Unthrottled move event
@EventHandler
public void onMove(PlayerMoveEvent event) {
    checkForRegion(event.getPlayer()); // Called 20+ times per second!
}

// CORRECT: Only check on block change
@EventHandler
public void onMove(PlayerMoveEvent event) {
    if (event.getFrom().getBlock().equals(event.getTo().getBlock())) {
        return; // Same block, ignore
    }
    checkForRegion(event.getPlayer());
}
```

---

## 10. Configuration Rules

### config.yml Best Practices

- Use YAML 1.1 syntax (spaces, no tabs)
- Provide default values for all keys
- Add comments explaining each option
- Validate all config values on load
- Never crash if config is invalid

### Message Configuration

- Store all user-facing messages in config
- Support color codes (`&c`, `&a`, etc.)
- {MESSAGE_API_RULE}

---

## 11. Code Quality Rules

### Error Handling

- **NEVER** use `e.printStackTrace()` in production
- **ALWAYS** log errors with context
- **NEVER** silently swallow exceptions
- **ALWAYS** provide user feedback on errors

```java
// WRONG: Silent failure
try {
    dangerousOperation();
} catch (Exception e) {
    e.printStackTrace();
}

// CORRECT: Proper logging and user feedback
try {
    dangerousOperation();
} catch (Exception e) {
    plugin.getLogger().severe("Failed to perform operation: " + e.getMessage());
    if (player != null) {
        player.sendMessage(ChatColor.RED + "An error occurred. Please contact an administrator.");
    }
}
```

### Resource Management

- **ALWAYS** close resources in try-with-resources
- **NEVER** leave connections open
- **ALWAYS** cancel tasks in onDisable()

```java
// CORRECT: Try-with-resources
try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    // Use connection
} // Automatically closed
```

---

## 12. Plugin Lifecycle Rules

### onEnable() Order

1. Load configuration
2. Initialize database connection
3. Load data from database
4. Register commands
5. Register listeners
6. Start scheduled tasks

### onDisable() Order (REVERSE)

1. Cancel all scheduled tasks
2. Unregister listeners (optional, server does this)
3. Save all data to database
4. Close database connections
5. Clear caches

### Critical Rules

- **NEVER** call `Bukkit.getServer()` in constructor
- **NEVER** register listeners before managers are initialized
- **ALWAYS** save data in onDisable()
- **NEVER** assume onDisable() will be called (server crashes)

---

## 13. Testing & Verification

### Before Compilation

- [ ] All imports use {API_PACKAGE}
- [ ] Main class name matches filename
- [ ] plugin.yml has correct main class path
- [ ] All dependencies have correct scope: {DEPENDENCY_SCOPE}

### After Compilation

- [ ] JAR file size is reasonable (< 5MB for simple plugins)
- [ ] No shaded server APIs (Paper, Spigot, Bukkit)
- [ ] plugin.yml is included in JAR
- [ ] All required dependencies are shaded

### Runtime Testing

- [ ] Plugin loads without errors
- [ ] Commands work as expected
- [ ] No errors in console
- [ ] No memory leaks after reload
- [ ] Database connections close properly

---

## 14. Workflow Rules

### Development Workflow

1. **Research Phase:**
   - {RESEARCH_INSTRUCTION}
   - Check latest API documentation
   - Verify compatibility with {SOFTWARE}

2. **Planning Phase:**
   - Create architecture plan
   - Generate comprehensive to-do list
   - Identify all required dependencies

3. **Implementation Phase:**
   - Work through to-do list sequentially
   - Update to-do list after each completion
   - Never leave incomplete items

4. **Compilation Phase:**
   - Run {BUILD_COMMAND}
   - Fix all compilation errors
   - Retry until clean build

5. **Documentation Phase:**
   - Generate README.md with installation instructions
   - Document all commands and permissions
   - Provide configuration examples

6. **Completion Phase:**
   - Verify ALL to-do items completed
   - Confirm plugin compiles successfully
   - Only then report completion to user

### Critical Workflow Rules

- **NEVER** skip to-do items without explicit removal
- **NEVER** report completion with compilation errors
- **NEVER** leave documentation incomplete
- **ALWAYS** update to-do list after each step

---

## Summary

These rules are NON-NEGOTIABLE. Every violation leads to:
- Compilation failures
- Runtime crashes
- Data corruption
- Poor performance
- Security vulnerabilities

When in doubt, consult the official {SOFTWARE} documentation and follow these rules strictly.

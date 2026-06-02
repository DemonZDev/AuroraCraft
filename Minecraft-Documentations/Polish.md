# Minecraft Plugin Code Quality & Polish Standards
## Paper 1.21.4 — Production-Ready Code Review Checklist

> This document is a living reference for plugin developers and code reviewers. Every rule here exists because real production plugins have broken in real servers due to violations of these principles. Read it once, then keep it open during every review.

---

## Table of Contents

1. [Naming Conventions](#1-naming-conventions)
2. [Code Organization & Readability](#2-code-organization--readability)
3. [Documentation Standards](#3-documentation-standards)
4. [Error Handling Elegance](#4-error-handling-elegance)
5. [Resource Management](#5-resource-management)
6. [Plugin Lifecycle Discipline](#6-plugin-lifecycle-discipline)
7. [Configuration & Messaging Standards](#7-configuration--messaging-standards)
8. [Common AI Polish Failures](#8-common-ai-polish-failures)
9. [Appendix A: 30-Point Pre-Commit Checklist](#appendix-a-30-point-pre-commit-checklist)
10. [Appendix B: Code Review Red Flags](#appendix-b-code-review-red-flags)
11. [Appendix C: AI Prompt Engineering Phrases](#appendix-c-ai-prompt-engineering-phrases)
12. [Appendix D: Auto-Format Configuration](#appendix-d-auto-format-configuration)

---

## 1. Naming Conventions

Naming is the single highest-leverage quality investment. A well-named class communicates intent without requiring the reader to open the implementation. Poor naming forces guessing — and guessing introduces bugs.

### 1.1 Class Naming Strategy

#### Main Plugin Class

**Rule:** Name the class exactly after the plugin, in PascalCase, with no suffix.

| Pattern | Verdict | Reason |
|---|---|---|
| `MyPlugin` | ✅ Correct | Clean, matches plugin name, standard |
| `MyPluginPlugin` | ❌ Wrong | Redundant suffix |
| `MyPluginMain` | ❌ Wrong | "Main" is an implementation detail |
| `Main` | ❌ Wrong | Non-descriptive, IDE conflicts |
| `PluginCore` | ❌ Wrong | Vague, doesn't identify the plugin |

```java
// ✅ CORRECT
public final class MyPlugin extends JavaPlugin {
    private static MyPlugin instance;
}

// ❌ INCORRECT
public final class MyPluginMain extends JavaPlugin { }
public final class MyPluginPlugin extends JavaPlugin { }
```

#### Manager / Service / Handler Classes

| Suffix | When to Use | Example |
|---|---|---|
| `Manager` | Owns lifecycle, holds state, coordinates subsystems | `PlayerDataManager`, `ArenaManager` |
| `Service` | Stateless operations, business logic | `EconomyService`, `PermissionService` |
| `Repository` | Data access only — reads/writes to storage | `PlayerRepository` |
| `Handler` | Processes a single type of event or request | `ChatHandler`, `PaymentHandler` |
| `Factory` | Creates instances of complex objects | `ItemFactory` |

#### Command Classes

**Rule:** Use `FeatureCommand` suffix. Commands sort naturally by domain and read as "what this does."

```java
// ✅ CORRECT
HomeCommand, ShopCommand, AdminCommand, BalanceCommand

// ❌ INCORRECT (prefix convention)
CommandHome, CommandShop, CmdBalance
```

#### Listener Classes

**Rule:** Group by domain. For small plugins, one listener per related event set is acceptable. For larger plugins, use one listener class per domain.

```java
// ✅ CORRECT — grouped by domain
PlayerConnectionListener   // JoinEvent, QuitEvent, KickEvent
PlayerCombatListener       // DamageEvent, DeathEvent
InventoryListener          // ClickEvent, CloseEvent, DragEvent

// ✅ ALSO CORRECT — one per event (preferred for large plugins)
PlayerJoinListener         // only PlayerJoinEvent
PlayerQuitListener         // only PlayerQuitEvent

// ❌ INCORRECT — all events in one mega-listener
EventListener  // 40+ @EventHandler methods
```

### 1.2 Field & Variable Naming

```java
// ✅ CORRECT — descriptive, no redundant type suffix
private final Map<UUID, PlayerData> playerCache = new ConcurrentHashMap<>();
private final MyPlugin plugin; // For injected instances

// ❌ INCORRECT — type suffix in name, vague
private final Map<UUID, PlayerData> playerDataCacheMap = new ConcurrentHashMap<>();
private static MyPlugin instance; // Only acceptable for main class singleton
```

### 1.3 Collection Naming

Avoid type suffixes (`List`, `Map`, `Set`) in collection names. The type is already in the declaration:

```java
// ✅ CORRECT
private final Map<UUID, PlayerData> players = new ConcurrentHashMap<>();
private final List<String> permissions = new ArrayList<>();

// ❌ INCORRECT
private final Map<UUID, PlayerData> playerMap = new ConcurrentHashMap<>();
private final List<String> permissionList = new ArrayList<>();
```

---

## 2. Code Organization & Readability

### 2.1 Method Ordering

Within each class, follow this order:
1. Static fields
2. Instance fields
3. Constructor(s)
4. Public methods (in dependency/importance order)
5. Protected methods
6. Private methods
7. Inner classes/interfaces

### 2.2 Method Size

- **Commands:** < 30 lines (validation + delegation only)
- **Event handlers:** < 20 lines (detect event → call manager)
- **Manager methods:** < 50 lines (single responsibility)
- **No method should exceed 80 lines** — refactor if it does

### 2.3 Avoid Deep Nesting

```java
// ❌ BAD — 4 levels of nesting, hard to follow
if (sender instanceof Player) {
    if (args.length > 0) {
        if (target != null) {
            if (amount > 0) {
                // Finally, the actual logic
            }
        }
    }
}

// ✅ GOOD — early returns, flat logic
if (!(sender instanceof Player player)) {
    sender.sendMessage("§cPlayers only.");
    return;
}
if (args.length == 0) {
    sender.sendMessage("§cUsage: /cmd <player> <amount>");
    return;
}
Player target = Bukkit.getPlayer(args[0]);
if (target == null) {
    sender.sendMessage("§cPlayer not found.");
    return;
}
if (amount <= 0) {
    sender.sendMessage("§cAmount must be positive.");
    return;
}
// Logic here — flat, readable
```

### 2.4 Comments: Why, Not What

```java
// ❌ BAD — describes what the code does (obvious)
// Set the player's balance to 100
data.setBalance(100);

// ✅ GOOD — explains why the decision was made
// Default starting balance — must be >= 0 to prevent economy exploit
// via negative-balance transfers (see issue #247)
data.setBalance(100);
```

---

## 3. Documentation Standards

### 3.1 Javadoc on Public API

Every method in the `api/` package must have complete Javadoc:

```java
/**
 * Returns the token balance for a player.
 *
 * @param uuid the player's unique identifier
 * @return the current balance, or 0 if the player has no data loaded
 * @throws IllegalStateException if the plugin is not enabled
 */
public int getTokens(UUID uuid) { ... }
```

### 3.2 plugin.yml Documentation

```yaml
# plugin.yml — use authors (plural, always an array)
authors: [YourName, ContributorName]

# Always include all three description fields
description: A well-crafted plugin for managing player economies.
website: https://github.com/yourorg/myplugin

# api-version must be set
api-version: "1.21"
```

---

## 4. Error Handling Elegance

### 4.1 Never Swallow Exceptions Silently

```java
// ❌ BAD — silent failure, impossible to debug
try {
    playerDataManager.savePlayer(data);
} catch (Exception e) {
    // nothing — or just e.printStackTrace()
}

// ✅ GOOD — log with context, provide fallback
try {
    playerDataManager.savePlayer(data);
} catch (SQLException e) {
    plugin.getLogger().severe("Failed to save player data for " + data.getUuid()
        + ": " + e.getMessage());
    // Consider: retry? fallback storage? notify admin?
}
```

### 4.2 Exception Philosophy for Plugins

- Use **unchecked exceptions** (`RuntimeException`) for programming errors that indicate a bug
- Use **checked exceptions** for recoverable conditions (database errors, network failures)
- Never throw from `onEnable()` without logging — the server will disable the plugin with no explanation
- Always log the context (player UUID, action, timestamp) alongside the exception

### 4.3 Null Safety Patterns

```java
// Pattern 1: Optional for nullable API returns (Java 8+)
public Optional<PlayerData> findPlayerData(UUID uuid) {
    return Optional.ofNullable(cache.get(uuid));
}

// Usage:
playerDataManager.findPlayerData(uuid)
    .ifPresentOrElse(
        data -> player.sendMessage("Balance: " + data.getBalance()),
        () -> player.sendMessage("No data found.")
    );

// Pattern 2: Early return for mandatory values
public void processPlayer(Player player) {
    if (player == null) return;
    // Safe to use player
}

// Pattern 3: Objects.requireNonNull for constructor injection
public ShopManager(MyPlugin plugin) {
    this.plugin = Objects.requireNonNull(plugin, "plugin must not be null");
}
```

---

## 5. Resource Management

### 5.1 Always Use try-with-resources

```java
// ✅ CORRECT — auto-closes Connection, PreparedStatement, ResultSet
try (Connection conn = dataSource.getConnection();
     PreparedStatement stmt = conn.prepareStatement("SELECT * FROM players WHERE uuid = ?");
     ResultSet rs = stmt.executeQuery()) {

    stmt.setString(1, uuid.toString());
    // Process results

} catch (SQLException e) {
    plugin.getLogger().severe("Database error: " + e.getMessage());
}
```

### 5.2 Cancel All Tasks in onDisable()

```java
public class MyPlugin extends JavaPlugin {
    private BukkitTask autoSaveTask;
    private BukkitTask leaderboardTask;

    @Override
    public void onEnable() {
        autoSaveTask = getServer().getScheduler()
            .runTaskTimerAsynchronously(this, this::autoSave, 6000L, 6000L);
        leaderboardTask = getServer().getScheduler()
            .runTaskTimer(this, this::updateLeaderboard, 0L, 1200L);
    }

    @Override
    public void onDisable() {
        if (autoSaveTask != null && !autoSaveTask.isCancelled())
            autoSaveTask.cancel();
        if (leaderboardTask != null && !leaderboardTask.isCancelled())
            leaderboardTask.cancel();
    }
}
```

### 5.3 Close Database Connections

Always call `databaseManager.shutdown()` in `onDisable()`. Close in reverse initialization order.

---

## 6. Plugin Lifecycle Discipline

### 6.1 onEnable() Checklist

```java
@Override
public void onEnable() {
    // 1. Save default config
    saveDefaultConfig();

    // 2. Initialize managers in dependency order
    configManager = new ConfigManager(this);
    databaseManager = new DatabaseManager(this);
    databaseManager.connect();

    // 3. Verify critical resources loaded
    if (!databaseManager.isConnected()) {
        getLogger().severe("Database connection failed — disabling plugin.");
        getServer().getPluginManager().disablePlugin(this);
        return;
    }

    // 4. Register commands and listeners
    registerCommands();
    registerListeners();

    // 5. Log success
    getLogger().info("MyPlugin v" + getDescription().getVersion() + " enabled.");
}
```

### 6.2 onDisable() Checklist

```java
@Override
public void onDisable() {
    // 1. Save all player data (synchronous — no time for async)
    if (playerDataManager != null) playerDataManager.saveAll();

    // 2. Cancel all scheduled tasks
    if (autoSaveTask != null) autoSaveTask.cancel();
    if (leaderboardTask != null) leaderboardTask.cancel();

    // 3. Close connections (reverse order of initialization)
    if (databaseManager != null) databaseManager.shutdown();

    // 4. Clear static reference
    instance = null;

    getLogger().info("MyPlugin disabled.");
}
```

---

## 7. Configuration & Messaging Standards

### 7.1 Externalize All Messages

```yaml
# messages.yml
prefix: "&8[&bMyPlugin&8]&r"
errors:
  no-permission: "{prefix} &cYou don't have permission."
  player-not-found: "{prefix} &cPlayer '{player}' not found."
  invalid-amount: "{prefix} &c'{input}' is not a valid amount."
commands:
  balance: "{prefix} &aYour balance: &e${balance}"
  pay-sent: "{prefix} &aSent &e${amount} &ato &e{target}"
  pay-received: "{prefix} &aReceived &e${amount} &afrom &e{sender}"
```

Never hardcode messages in Java — always use a `MessageManager` with placeholder support:

```java
messageManager.send(player, "commands.balance",
    Map.of("balance", String.valueOf(data.getBalance())));
```

### 7.2 Validate Configuration on Load

```java
private void validateConfig() {
    List<String> errors = new ArrayList<>();

    int startingTokens = config.getInt("economy.starting-tokens", -1);
    if (startingTokens < 0) {
        errors.add("economy.starting-tokens must be >= 0");
    }

    String dbType = config.getString("database.type", "sqlite");
    if (!Set.of("mysql", "sqlite").contains(dbType.toLowerCase())) {
        errors.add("database.type must be 'mysql' or 'sqlite'");
    }

    if (!errors.isEmpty()) {
        errors.forEach(e -> plugin.getLogger().severe("Config error: " + e));
    }
}
```

---

## 8. Common AI Polish Failures

| # | Failure | Detection | Fix |
|---|---------|-----------|-----|
| 1 | Main class named `PluginMain` or `Main` | Grep class declaration | Name class after plugin |
| 2 | `MyPluginPlugin` redundancy | Grep `PluginPlugin` | Remove redundant suffix |
| 3 | Singleton on every manager | Static `getInstance()` on managers | Constructor injection through main class |
| 4 | Hardcoded messages everywhere | `player.sendMessage("§c...")` scattered | Externalize to `messages.yml` |
| 5 | Magic strings in 30+ files | Inconsistent `"§c"` vs `"&c"` vs `ChatColor` | Single `MessageManager` |
| 6 | Empty catch blocks | `catch (Exception e) { }` | Log with context |
| 7 | `e.printStackTrace()` without logging | Console-only, lost on restart | Use `plugin.getLogger().severe()` |
| 8 | No `@Override` annotations | Missing on `onEnable`/`onDisable`/`onCommand` | Always use `@Override` |
| 9 | Public fields | `public int balance;` | Use private fields + getters/setters |
| 10 | Raw types | `List players = new ArrayList();` | Use generics: `List<Player>` |
| 11 | `HashMap` for concurrent access | Async callbacks writing to `HashMap` | `ConcurrentHashMap` |
| 12 | No `final` on immutable fields | `private MyPlugin plugin;` | `private final MyPlugin plugin;` |
| 13 | `plugin.yml` missing `api-version` | Server logs legacy warning | Add `api-version: "1.21"` |
| 14 | `plugin.yml` missing `authors` (use plural) | Single `author:` field | Use `authors: [Name1, Name2]` |
| 15 | No input length validation | `args[0]` used directly | Validate length, type, range |
| 16 | `BukkitRunnable` without cancel | Task runs forever after disable | Store reference, cancel in onDisable |
| 17 | No `isOnline()` after async gap | NPE when player logged off | Null-check + isOnline() after async |
| 18 | Event handlers without `ignoreCancelled` | Processing cancelled events unnecessarily | Set `ignoreCancelled = true` |
| 19 | `MONITOR` priority with event modification | Changes ignored | Use `NORMAL` or lower for modifications |
| 20 | `MONITOR` without `ignoreCancelled = true` | Processing cancelled events in logging | Always pair MONITOR with ignoreCancelled |

---

## Appendix A: 30-Point Pre-Commit Checklist

### Project Setup (5 points)
- [ ] 1. Main class named after plugin, no suffix
- [ ] 2. `api-version` set in `plugin.yml`
- [ ] 3. `authors` (plural) used in `plugin.yml`
- [ ] 4. All commands declared in `plugin.yml`
- [ ] 5. All permissions declared in `plugin.yml`

### Code Quality (10 points)
- [ ] 6. No class > 300 lines
- [ ] 7. No method > 80 lines
- [ ] 8. No > 3 levels of nesting
- [ ] 9. All public methods have `@Override` where applicable
- [ ] 10. All API methods have Javadoc
- [ ] 11. No commented-out code
- [ ] 12. No `System.out.println` — use logger
- [ ] 13. No hardcoded messages in Java
- [ ] 14. No `e.printStackTrace()` — use logger
- [ ] 15. No magic strings/numbers — use constants

### Safety (10 points)
- [ ] 16. No raw types — always use generics
- [ ] 17. All fields private unless there's a reason
- [ ] 18. Immutable fields declared `final`
- [ ] 19. Database queries async
- [ ] 20. Bukkit API calls on main thread
- [ ] 21. `ConcurrentHashMap` for multi-threaded caches
- [ ] 22. All `BukkitTask` refs stored for cancellation
- [ ] 23. Paper API scope is `provided`/`compileOnly`
- [ ] 24. No NMS imports (`net.minecraft.server`)
- [ ] 25. No `getOfflinePlayer(String)` without UUID

### Polish (5 points)
- [ ] 26. `saveDefaultConfig()` called in `onEnable()`
- [ ] 27. Plugin version logged on enable
- [ ] 28. Graceful degradation on error (fallback, not crash)
- [ ] 29. Config validated with useful error messages
- [ ] 30. `.editorconfig` file in repository root

---

## Appendix B: Code Review Red Flags

Visual patterns that indicate problems at a glance:

```
🔴 player.sendMessage("§c...       → Hardcoded message
🔴 } catch (Exception e) { }        → Swallowed exception
🔴 e.printStackTrace();             → Lost error (use logger)
🔴 HashMap<> cache = new            → Not thread-safe (use ConcurrentHashMap)
🔴 implements Listener { 40 lines   → Listener is too thick
🔴 return null;                     → Surprise NPE in caller
🔴 import net.minecraft.server      → NMS — will break on update
🔴 import org.bukkit.craftbukkit    → OBC — will break on update
🔴 static ...Manager instance;      → Singleton on manager (leaks on reload)
🔴 Bukkit.getOfflinePlayer(name)    → Blocking Mojang API call
🔴 getConfig().getString(...)       → Raw config access (use ConfigManager)
🔴 plugin.getCommand("x") without   → Command not in plugin.yml
   null check
```

---

## Appendix C: AI Prompt Engineering Phrases

Include these phrases in your AI prompts for better output quality:

- *"Write production-quality code that passes a professional code review."*
- *"Externalize all user-facing strings to messages.yml."*
- *"Use early returns instead of nested if-else blocks."*
- *"Log all errors with context (player UUID, action, timestamp)."*
- *"Name the main class exactly after the plugin name."*
- *"Use ConcurrentHashMap for all caches accessed from multiple threads."*
- *"Always cancel scheduled tasks in onDisable()."*
- *"Validate all user input before processing — never trust player input."*
- *"Use try-with-resources for all database operations."*
- *"Return Collections.emptyList() from onTabComplete, never null."*

---

## Appendix D: Auto-Format Configuration

### .editorconfig

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 4
insert_final_newline = true
trim_trailing_whitespace = true

[*.yml]
indent_size = 2

[*.xml]
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

### Checkstyle (Google Java Style Guide)

Use the Google Java Style Guide with these Bukkit-specific adjustments:
- Line length: 120 characters (not 100) — Bukkit method chains are verbose
- Allow `instance` as a static field name (for main plugin class only)
- No restriction on `Manager` suffix class naming

---

---

## 9. Testing Minecraft Plugins

### 9.1 Why Plugin Testing Is Hard (And How to Do It Anyway)

Testing Minecraft plugins is genuinely difficult because Bukkit/Paper APIs are deeply intertwined with the server runtime. You can't `new Player()` or `new World()` — these are interfaces backed by complex NMS implementations. Most developers give up and test manually on a live server. This is slow, unreliable, and doesn't scale.

The solution: **MockBukkit** for unit tests, **test server automation** for integration tests.

### 9.2 Unit Testing with MockBukkit

```java
// Add to pom.xml (test scope only):
// <dependency>
//     <groupId>com.github.seeseemelk</groupId>
//     <artifactId>MockBukkit-v1.21</artifactId>
//     <version>3.133.0</version>
//     <scope>test</scope>
// </dependency>

class ShopManagerTest {
    private ServerMock server;
    private MyPlugin plugin;
    private ShopManager shopManager;

    @BeforeEach
    void setUp() {
        server = MockBukkit.mock(); // Creates mock server
        plugin = MockBukkit.load(MyPlugin.class); // Loads your plugin
        shopManager = plugin.getShopManager();
    }

    @AfterEach
    void tearDown() {
        MockBukkit.unmock(); // Clean up — prevents state leaking between tests
    }

    @Test
    void purchaseItem_deductsTokens() {
        // Arrange
        PlayerMock player = server.addPlayer("TestPlayer");
        UUID uuid = player.getUniqueId();
        plugin.getPlayerDataManager().loadPlayerSync(uuid); // Create default data
        int initialTokens = plugin.getPlayerDataManager().getTokens(uuid);

        // Act
        boolean result = shopManager.purchase(uuid, 50);

        // Assert
        assertTrue(result, "Purchase should succeed");
        assertEquals(initialTokens - 50, plugin.getPlayerDataManager().getTokens(uuid),
            "Tokens should be deducted");
    }

    @Test
    void purchaseItem_failsWhenInsufficientTokens() {
        // Arrange
        PlayerMock player = server.addPlayer("PoorPlayer");
        UUID uuid = player.getUniqueId();
        plugin.getPlayerDataManager().loadPlayerSync(uuid);
        plugin.getPlayerDataManager().setTokens(uuid, 10); // Only 10 tokens

        // Act
        boolean result = shopManager.purchase(uuid, 50);

        // Assert
        assertFalse(result, "Purchase should fail with insufficient tokens");
        assertEquals(10, plugin.getPlayerDataManager().getTokens(uuid),
            "Tokens should not change on failed purchase");
    }

    @Test
    void command_pay_sendsMoneyBetweenPlayers() {
        PlayerMock sender = server.addPlayer("Sender");
        PlayerMock receiver = server.addPlayer("Receiver");
        plugin.getPlayerDataManager().loadPlayerSync(sender.getUniqueId());
        plugin.getPlayerDataManager().loadPlayerSync(receiver.getUniqueId());
        plugin.getPlayerDataManager().setTokens(sender.getUniqueId(), 100);

        server.execute("pay", sender, "Receiver", "50");

        assertEquals(50, plugin.getPlayerDataManager().getTokens(sender.getUniqueId()));
        assertEquals(50, plugin.getPlayerDataManager().getTokens(receiver.getUniqueId()));
    }
}
```

### 9.3 Testing Event Handlers

```java
@Test
void onPlayerJoin_loadsPlayerData() {
    PlayerMock player = server.addPlayer("NewPlayer");

    // PlayerJoinEvent is automatically fired by server.addPlayer()
    // Now verify the listener did its job:
    assertTrue(plugin.getPlayerDataManager().isLoaded(player.getUniqueId()),
        "Player data should be loaded on join");
}

@Test
void onInventoryClick_cancelsEventInProtectedGUI() {
    PlayerMock player = server.addPlayer();
    InventoryGUI gui = new ShopGUI(plugin.getShopManager());
    plugin.getGuiManager().openGUI(gui, player);

    // Simulate clicking slot 5
    InventoryView view = player.openInventory(gui.getInventory());
    InventoryClickEvent event = new InventoryClickEvent(view,
        InventoryType.SlotType.CONTAINER, 5, ClickType.LEFT, InventoryAction.PICKUP_ALL);
    server.getPluginManager().callEvent(event);

    assertTrue(event.isCancelled(), "GUI clicks should be cancelled to prevent item theft");
}
```

### 9.4 Testing Async Operations

```java
@Test
void loadPlayerAsync_completesWithData() throws Exception {
    UUID uuid = UUID.randomUUID();
    // Pre-insert data directly into the test database
    plugin.getDatabaseManager().execute("INSERT INTO players (uuid, name, balance) "
        + "VALUES ('" + uuid + "', 'TestPlayer', 100)");

    CompletableFuture<PlayerData> future = plugin.getPlayerDataManager().loadPlayerAsync(uuid);

    // Wait for async completion (with timeout)
    PlayerData data = future.get(5, TimeUnit.SECONDS);

    assertNotNull(data, "Player data should be loaded");
    assertEquals(100, data.getBalance(), "Balance should match database value");
}
```

### 9.5 The Test Pyramid for Plugins

```
       ╱  E2E  ╲          Manual: Deploy to test server, test by hand
      ╱──────────╲         Frequency: Before each release
     ╱ Integration╲        Time: 5-30 min per test
    ╱──────────────╲       
   ╱   Unit Tests   ╲      Integration: Test server automation (deploy + verify)
  ╱──────────────────╲     Frequency: Every commit (CI)
                         Time: 30-120 seconds
                         
                         Unit Tests: MockBukkit, test logic in isolation
                         Frequency: Every save (IDE, pre-commit hook)
                         Time: <5 seconds
```

**Target ratios:**
- 70% unit tests (fast, reliable, test business logic)
- 20% integration tests (test database, config loading, plugin interaction)
- 10% E2E/manual (test actual gameplay behavior)

### 9.6 Test Server Automation

```kotlin
// build.gradle.kts — auto-deploy to test server and run verification
tasks.register<Exec>("integrationTest") {
    dependsOn(tasks.shadowJar)
    workingDir = file("/home/minecraft/test-server")

    // Deploy the JAR
    doFirst {
        copy {
            from(tasks.shadowJar.get().archiveFile)
            into("/home/minecraft/test-server/plugins")
        }
    }

    // Start the server, run verification, stop
    commandLine("bash", "-c", """
        java -jar paper.jar nogui &
        SERVER_PID=$!
        
        # Wait for server to be ready
        for i in {1..60}; do
            if grep -q "Done" logs/latest.log 2>/dev/null; then
                break
            fi
            sleep 1
        done
        
        # Run verification commands via RCON
        # (install an RCON client or use Paper's built-in console pipeline)
        
        kill $SERVER_PID
        wait $SERVER_PID
    """)
}
```

---

## 10. Static Analysis & CI Quality Gates

### 10.1 Tools That Catch Bugs Before Code Review

| Tool | What It Catches | Integration |
|------|----------------|------------|
| **Checkstyle** | Style violations, naming conventions | Maven/Gradle plugin, IDE |
| **SpotBugs** | Null pointer dereferences, infinite loops, resource leaks | Maven/Gradle plugin |
| **PMD** | Unused variables, empty catch blocks, overly complex methods | Maven/Gradle plugin |
| **Error Prone** | Compile-time bug detection (Google's tool) | Compiler plugin |
| **SonarQube** | Aggregated code quality + security hotspots | CI server |

```xml
<!-- Maven: SpotBugs configuration -->
<plugin>
    <groupId>com.github.spotbugs</groupId>
    <artifactId>spotbugs-maven-plugin</artifactId>
    <version>4.8.6.0</version>
    <configuration>
        <effort>Max</effort>
        <threshold>Low</threshold> <!-- Catch everything -->
        <excludeFilterFile>spotbugs-exclude.xml</excludeFilterFile>
    </configuration>
    <executions>
        <execution>
            <goals><goal>check</goal></goals>
        </execution>
    </executions>
</plugin>
```

### 10.2 CI Quality Gate (GitHub Actions)

```yaml
name: Quality Gate

on: [pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin', cache: 'maven' }

      - name: Compile
        run: mvn compile -B

      - name: Checkstyle
        run: mvn checkstyle:check -B

      - name: SpotBugs
        run: mvn spotbugs:check -B

      - name: Tests
        run: mvn test -B

      - name: Dependency Check (vulnerabilities)
        run: mvn dependency-check:check -B

      - name: JaCoCo Coverage
        run: mvn jacoco:report -B

      - name: Coverage Gate
        run: |
          COVERAGE=$(grep -oP 'Total.*?([0-9]+)%' target/site/jacoco/index.html | grep -oP '[0-9]+')
          if [ "$COVERAGE" -lt 60 ]; then
            echo "Coverage $COVERAGE% is below 60% threshold"
            exit 1
          fi
```

---

## 11. Code Coverage Strategy

### 11.1 What to Measure (and What to Ignore)

**Worth measuring:**
- Manager business logic (rules, calculations, validation)
- Command input validation (edge cases: empty args, invalid numbers, missing permissions)
- Event handler logic (guard clauses, state transitions)
- Data access layer (query correctness, error handling)

**Not worth measuring (low ROI):**
- Simple getters/setters (Lombok generates them, they never fail)
- Plugin main class (wiring — tested by integration tests, not unit tests)
- GUI layout code (visual — tested by E2E, not unit tests)
- Constants/configuration classes

**Reasonable targets for a production plugin:**
- 60%+ line coverage overall (focus on business logic, not boilerplate)
- 80%+ branch coverage on manager methods
- 100% coverage on economy transaction code (this is where bugs cost real money)

### 11.2 JaCoCo Configuration

```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.12</version>
    <executions>
        <execution>
            <goals><goal>prepare-agent</goal></goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>test</phase>
            <goals><goal>report</goal></goals>
        </execution>
        <execution>
            <id>check</id>
            <goals><goal>check</goal></goals>
            <configuration>
                <rules>
                    <rule>
                        <element>BUNDLE</element>
                        <limits>
                            <limit>
                                <counter>BRANCH</counter>
                                <value>COVEREDRATIO</value>
                                <minimum>0.60</minimum>
                            </limit>
                        </limits>
                    </rule>
                    <!-- Exclude boilerplate from coverage requirements -->
                    <rule>
                        <element>CLASS</element>
                        <excludes>
                            <exclude>com.yourplugin.MyPlugin</exclude>
                            <exclude>com.yourplugin.models.*</exclude>
                            <exclude>com.yourplugin.inventory.*</exclude>
                        </excludes>
                    </rule>
                </rules>
            </configuration>
        </execution>
    </executions>
</plugin>
```

---

*End of Minecraft Plugin Code Quality & Polish Standards*
*Paper 1.21.4 · Java 21*

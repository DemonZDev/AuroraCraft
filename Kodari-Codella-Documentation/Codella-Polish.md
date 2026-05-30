# Minecraft Plugin Code Quality & Polish Standards
## Paper 1.21.4 — Production-Ready Code Review Checklist

**Version:** 2.0  
**Last Updated:** 2024  
**Author:** dibliomorgans  
**Target Audience:** Plugin developers, code reviewers, AI assistants, development teams

---

## Introduction

This document establishes comprehensive code quality standards for Minecraft plugin development targeting Paper 1.21.4 (backward compatible with Spigot). These standards ensure consistency, maintainability, performance, and professionalism across all plugin codebases.

**Document Purpose:**
- Provide objective criteria for code review
- Eliminate subjective "code style" debates
- Catch AI-generated code deficiencies before commit
- Serve as training material for junior developers
- Act as a prompt engineering reference for AI-assisted development

**How to Use This Guide:**
1. Keep open during code reviews (print or second monitor)
2. Reference specific sections in pull request comments
3. Include relevant sections in AI prompts for better output
4. Use Appendix A as a pre-commit checklist

---

## 1. Naming Conventions

### 1.1 Class Naming Strategy

#### 1.1.1 Main Plugin Class

**RULE:** Use the plugin name exactly as it appears in `plugin.yml`, without suffix.

```java
// ✅ CORRECT
public final class MyPlugin extends JavaPlugin {
    @Override
    public void onEnable() {
        // Implementation
    }
}
```

```java
// ❌ INCORRECT - Redundant suffix
public final class MyPluginPlugin extends JavaPlugin { }

// ❌ INCORRECT - Vague naming
public final class Main extends JavaPlugin { }

// ❌ INCORRECT - Inconsistent with plugin.yml
public final class MyPluginMain extends JavaPlugin { }
```

**WHY:** 
- The class IS the plugin; suffix is redundant
- `Main` is non-searchable and causes conflicts in IDEs
- Consistency with `plugin.yml` name field prevents confusion
- External API consumers expect `MyPlugin.getInstance()`, not `MyPluginPlugin.getInstance()`

> **AI Prevention:** "Name the main class exactly as the plugin name without any suffix like 'Plugin' or 'Main'. If the plugin is called 'SkyWars', the class must be `SkyWars extends JavaPlugin`."

---

#### 1.1.2 Manager Classes

**RULE:** Use descriptive noun + `Manager` suffix. Suffix indicates **purpose**, not generic functionality.

| **Class Name** | **Responsibility** | **When to Use** |
|----------------|-------------------|-----------------|
| `PlayerDataManager` | Player-specific data persistence (load/save) | Managing player state, stats, profiles |
| `DatabaseManager` | Database connections, schema, migrations | Centralized database operations |
| `ConfigManager` | Configuration loading, validation, access | Type-safe config wrapper |
| `CooldownManager` | Cooldown tracking and validation | Temporal restrictions on actions |
| `ArenaManager` | Arena lifecycle (create/delete/join/leave) | Multi-instance game objects |
| `EconomyManager` | Economy integration (Vault, etc.) | External economy system wrapper |

```java
// ✅ CORRECT - Descriptive and specific
public class PlayerDataManager {
    private final Map<UUID, PlayerData> dataCache = new ConcurrentHashMap<>();
    
    public CompletableFuture<PlayerData> loadPlayerData(UUID uuid) {
        // Implementation
    }
    
    public void savePlayerData(UUID uuid) {
        // Implementation
    }
}
```

```java
// ❌ INCORRECT - Vague naming
public class PlayerManager { } // Manages players? Data? Events? Unclear.

// ❌ INCORRECT - Wrong suffix (Service is for stateless business logic)
public class PlayerDataService { } 

// ❌ INCORRECT - Too generic
public class DataManager { } // What kind of data?
```

**RULE:** Use `Service` suffix for **stateless** utility classes providing business logic.

```java
// ✅ CORRECT - Stateless business logic
public class PermissionService {
    public boolean hasPermission(Player player, String permission) {
        return player.hasPermission(permission) || player.isOp();
    }
    
    public boolean hasAnyPermission(Player player, String... permissions) {
        return Arrays.stream(permissions).anyMatch(player::hasPermission);
    }
}
```

**WHY:**
- `Manager` implies **stateful** coordination (holds cache, tracks objects)
- `Service` implies **stateless** operations (pure functions, external API wrappers)
- Searchability: grep for `*Manager.java` finds all state coordinators
- API clarity: `playerDataManager.loadData()` vs `playerService.loadData()` — the former clearly manages state

---

#### 1.1.3 Listener Classes

**RULE:** One event per listener class. Name as `<Event Subject><Event Action>Listener`.

```java
// ✅ CORRECT - Single responsibility
public class PlayerJoinListener implements Listener {
    
    @EventHandler(priority = EventPriority.NORMAL)
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        // Join logic only
    }
}
```

```java
// ✅ CORRECT - Another example
public class BlockBreakListener implements Listener {
    
    @EventHandler
    public void onBlockBreak(BlockBreakEvent event) {
        // Block break logic
    }
}
```

```java
// ❌ INCORRECT - Multiple unrelated events
public class PlayerListener implements Listener {
    
    @EventHandler
    public void onJoin(PlayerJoinEvent event) { }
    
    @EventHandler
    public void onQuit(PlayerQuitEvent event) { }
    
    @EventHandler
    public void onChat(AsyncPlayerChatEvent event) { }
    
    @EventHandler
    public void onDamage(EntityDamageByEntityEvent event) { }
}
```

**WHY:**
- Single Responsibility Principle: easier to test, maintain, disable
- Performance: unregister specific listeners without affecting others
- Clarity: `PlayerJoinListener` is instantly recognizable; `PlayerListener` requires inspection
- Team collaboration: merge conflicts reduced when events isolated

**EXCEPTION:** Group **closely related** events when they share substantial state.

```java
// ✅ ACCEPTABLE - Shared combat state
public class CombatTagListener implements Listener {
    private final Map<UUID, Long> combatTag = new HashMap<>();
    
    @EventHandler
    public void onPlayerDamagePlayer(EntityDamageByEntityEvent event) {
        // Tag both players as in combat
    }
    
    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        // Prevent combat logging
        if (combatTag.containsKey(event.getPlayer().getUniqueId())) {
            event.getPlayer().setHealth(0);
        }
    }
}
```

> **AI Prevention:** "Create separate listener classes for each event. Name them as `<Subject><Action>Listener`. For example, `PlayerJoinListener` for join events, `BlockBreakListener` for block break events. Never create a generic `PlayerListener` handling multiple unrelated events."

---

#### 1.1.4 Command Classes

**RULE:** Prefix with `Command`, followed by the command name in PascalCase.

```java
// ✅ CORRECT
public class CommandHome implements CommandExecutor {
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, 
                           String label, String[] args) {
        // Implementation
        return true;
    }
}
```

```java
// ✅ CORRECT - Multi-word command
public class CommandSetSpawn implements CommandExecutor {
    // Implementation
}
```

```java
// ❌ INCORRECT - Suffix instead of prefix
public class HomeCommand implements CommandExecutor { }

// ❌ INCORRECT - Vague naming
public class CommandHandler implements CommandExecutor { }
```

**WHY:**
- Prefix groups all commands alphabetically in package explorers
- Suffix convention (`HomeCommand`) splits commands across alphabet
- Consistency with Bukkit naming: `Command`, `CommandMap`, `CommandExecutor`
- Searchability: `Command*` finds all command classes instantly

**ALTERNATIVE:** For complex command trees, use suffix pattern with subcommand package.

```java
// ✅ ACCEPTABLE - Complex command structure
// File: commands/HomeCommand.java
public class HomeCommand implements CommandExecutor {
    private final Map<String, SubCommand> subCommands = new HashMap<>();
    
    public HomeCommand() {
        subCommands.put("set", new SetHomeSubCommand());
        subCommands.put("delete", new DeleteHomeSubCommand());
        subCommands.put("list", new ListHomesSubCommand());
    }
}

// File: commands/subcommands/SetHomeSubCommand.java
public class SetHomeSubCommand implements SubCommand {
    // Implementation
}
```

---

#### 1.1.5 Utility Classes

**RULE:** Suffix with `Utils` or `Util`. Make class `final` with private constructor. All methods `static`.

```java
// ✅ CORRECT
public final class ChatUtils {
    
    private ChatUtils() {
        throw new AssertionError("Utility class cannot be instantiated");
    }
    
    public static String colorize(String message) {
        return ChatColor.translateAlternateColorCodes('&', message);
    }
    
    public static void broadcast(String message) {
        Bukkit.broadcastMessage(colorize(message));
    }
}
```

```java
// ✅ CORRECT - Specialized utility
public final class LocationUtils {
    
    private LocationUtils() { }
    
    public static String serialize(Location loc) {
        return String.format("%s,%.2f,%.2f,%.2f", 
            loc.getWorld().getName(), loc.getX(), loc.getY(), loc.getZ());
    }
    
    public static Location deserialize(String serialized) {
        // Implementation
    }
}
```

```java
// ❌ INCORRECT - Not final, has instance methods
public class Utils {
    public void doSomething() { } // Should be static
}

// ❌ INCORRECT - Too generic
public final class Helper { } // Helper for what?

// ❌ INCORRECT - Can be instantiated
public final class StringUtils {
    public static String reverse(String s) {
        return new StringBuilder(s).reverse().toString();
    }
    // Missing private constructor!
}
```

**WHEN TO USE UTILITY CLASSES:**
- Pure functions with no state (mathematical operations, formatting)
- Converting between types (serialization, parsing)
- Common validations

**WHEN NOT TO USE:**
- Dumping ground for "miscellaneous" methods → refactor into domain classes
- Methods requiring plugin instance → use manager classes
- Methods with side effects (database writes, file I/O) → use service classes

> **Warning:** Utility classes are often a code smell indicating missing domain objects. Before creating `PlayerUtils`, ask: "Should this be a method on `Player` or `PlayerData`?"

---

#### 1.1.6 API Classes

**RULE:** Suffix with `API`. Provide static accessor. Design for external consumption.

```java
// ✅ CORRECT
public class MyPluginAPI {
    private static MyPluginAPI instance;
    private final MyPlugin plugin;
    
    private MyPluginAPI(MyPlugin plugin) {
        this.plugin = plugin;
    }
    
    public static MyPluginAPI getInstance() {
        return instance;
    }
    
    static void initialize(MyPlugin plugin) {
        if (instance != null) {
            throw new IllegalStateException("API already initialized");
        }
        instance = new MyPluginAPI(plugin);
    }
    
    /**
     * Gets player balance.
     * 
     * @param uuid Player UUID
     * @return Balance or 0 if player not found
     */
    public double getBalance(UUID uuid) {
        // Implementation
    }
}
```

**API DESIGN PRINCIPLES:**
1. **Immutability:** Return defensive copies, not internal state
2. **Documentation:** Every public method has Javadoc
3. **Versioning:** Deprecate, don't break. Add `@Deprecated(since = "2.0", forRemoval = true)`
4. **Thread-safety:** Document which methods are async-safe
5. **Null contracts:** Use `@Nullable` / `@NotNull` annotations

---

#### 1.1.7 Exception Classes

**RULE:** Suffix with `Exception`. Extend appropriate base class.

```java
// ✅ CORRECT - Checked exception for recoverable errors
public class PlayerDataNotFoundException extends Exception {
    public PlayerDataNotFoundException(UUID uuid) {
        super("Player data not found for UUID: " + uuid);
    }
}

// ✅ CORRECT - Unchecked exception for programming errors
public class InvalidConfigurationException extends RuntimeException {
    public InvalidConfigurationException(String key, String reason) {
        super(String.format("Invalid configuration key '%s': %s", key, reason));
    }
}
```

**EXCEPTION HIERARCHY GUIDELINES:**
- **Checked exceptions (`Exception`):** Recoverable conditions caller must handle (file not found, network timeout)
- **Unchecked exceptions (`RuntimeException`):** Programming errors (null argument, invalid state)
- Never extend `Throwable` or `Error` directly

---

### 1.2 Method Naming Patterns

#### 1.2.1 General Method Naming

**RULE:** Use **verb-first** imperative form. Methods perform actions.

```java
// ✅ CORRECT
public void loadConfiguration() { }
public void savePlayerData(UUID uuid) { }
public void sendMessage(Player player, String message) { }
public void registerCommands() { }
public void cancelTask(int taskId) { }
```

```java
// ❌ INCORRECT - Noun-first
public void configurationLoad() { }
public void playerDataSave(UUID uuid) { }

// ❌ INCORRECT - Vague verb
public void doStuff() { }
public void handle() { }
public void process() { }
```

**SPECIFIC VERB GUIDELINES:**

| **Operation** | **Verb** | **Example** |
|--------------|----------|-------------|
| Retrieve data | `get`, `fetch`, `find`, `load` | `getPlayer()`, `fetchData()` |
| Store data | `save`, `store`, `persist`, `write` | `saveConfig()` |
| Create object | `create`, `build`, `make` | `createArena()` |
| Remove object | `delete`, `remove`, `destroy` | `removePlayer()` |
| Boolean query | `is`, `has`, `can`, `should` | `isEnabled()`, `hasPermission()` |
| Modify state | `set`, `update`, `change` | `setHealth()` |
| Execute action | `execute`, `run`, `perform` | `executeCommand()` |

---

#### 1.2.2 Event Handler Methods

**RULE:** Name event handler methods `on<EventName>` with clear verb.

```java
// ✅ CORRECT
public class PlayerJoinListener implements Listener {
    
    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        // Implementation
    }
}
```

```java
// ❌ INCORRECT - Vague naming
@EventHandler
public void handleJoin(PlayerJoinEvent event) { }

@EventHandler
public void join(PlayerJoinEvent event) { }

@EventHandler
public void playerJoinEvent(PlayerJoinEvent event) { }
```

**WHY:**
- Convention established by Bukkit API (`onEnable()`, `onDisable()`)
- Searchable: `on[A-Z]` regex finds all event handlers
- Clear distinction from business logic methods

---

#### 1.2.3 Boolean Getter Conventions

**RULE:** Prefix with `is`, `has`, `can`, `should` based on semantic meaning.

| **Prefix** | **Meaning** | **Example** | **Returns True When** |
|-----------|-------------|-------------|---------------------|
| `is` | State check | `isEnabled()`, `isOnline()`, `isFrozen()` | Object has property |
| `has` | Possession | `hasPermission()`, `hasEnoughMoney()` | Object possesses something |
| `can` | Capability | `canFly()`, `canBuild()`, `canAfford()` | Action is possible |
| `should` | Recommendation | `shouldRespawn()`, `shouldSave()` | Action recommended |

```java
// ✅ CORRECT
public boolean isEnabled() {
    return this.enabled;
}

public boolean hasPermission(Player player, String permission) {
    return player.hasPermission(permission);
}

public boolean canAfford(Player player, double amount) {
    return getBalance(player) >= amount;
}

public boolean shouldAutoSave() {
    return getConfig().getBoolean("auto-save", true);
}
```

```java
// ❌ INCORRECT - Wrong prefix
public boolean checkPermission(Player player, String perm) { } // Use hasPermission
public boolean getEnabled() { } // Use isEnabled
public boolean affordable(Player p, double amt) { } // Use canAfford
```

**NON-BOOLEAN GETTERS:** Never prefix with `is/has/can`.

```java
// ✅ CORRECT
public Player getPlayer(UUID uuid) { }
public List<String> getPlayerNames() { }

// ❌ INCORRECT
public Player isPlayer(UUID uuid) { } // Returns Player, not boolean!
```

---

#### 1.2.4 Asynchronous Method Naming

**RULE:** Suffix async methods with `Async` or return `CompletableFuture<T>`.

```java
// ✅ CORRECT - CompletableFuture indicates async
public CompletableFuture<PlayerData> loadPlayerData(UUID uuid) {
    return CompletableFuture.supplyAsync(() -> {
        // Database query
        return database.getPlayerData(uuid);
    });
}

// ✅ CORRECT - Explicit async suffix
public void loadPlayerDataAsync(UUID uuid, Consumer<PlayerData> callback) {
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        PlayerData data = database.getPlayerData(uuid);
        Bukkit.getScheduler().runTask(plugin, () -> callback.accept(data));
    });
}
```

```java
// ❌ INCORRECT - Async operation, no indication in name
public PlayerData loadPlayerData(UUID uuid) {
    // Blocking database call on main thread!
    return database.getPlayerData(uuid);
}
```

**WHY:**
- Prevents accidental blocking of main thread
- Signals to caller that result won't be immediate
- Code review: `Async` suffix triggers scrutiny of thread-safety

---

#### 1.2.5 Command Executor Methods

**RULE:** Override `onCommand()` but delegate to descriptive methods.

```java
// ✅ CORRECT - Thin coordinator
public class CommandHome implements CommandExecutor {
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, 
                           String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only players can use this command");
            return true;
        }
        
        if (args.length == 0) {
            return teleportHome(player);
        }
        
        switch (args[0].toLowerCase()) {
            case "set" -> {
                return setHome(player, args);
            }
            case "delete" -> {
                return deleteHome(player, args);
            }
            case "list" -> {
                return listHomes(player);
            }
            default -> {
                return false; // Shows usage
            }
        }
    }
    
    private boolean teleportHome(Player player) {
        // Implementation
        return true;
    }
    
    private boolean setHome(Player player, String[] args) {
        // Implementation
        return true;
    }
    
    private boolean deleteHome(Player player, String[] args) {
        // Implementation
        return true;
    }
    
    private boolean listHomes(Player player) {
        // Implementation
        return true;
    }
}
```

**WHY:**
- `onCommand()` becomes a routing table (under 30 lines)
- Subcommand methods are testable in isolation
- Clear method names document available subcommands

---

### 1.3 Variable & Field Naming

#### 1.3.1 Field Naming

**RULE:** Use descriptive nouns. Avoid abbreviations unless universally recognized.

```java
// ✅ CORRECT
private final MyPlugin plugin;
private final Map<UUID, PlayerData> playerDataCache;
private final DatabaseManager databaseManager;
private final ConfigManager configManager;
private int maxPlayersPerArena;
private boolean debugMode;
```

```java
// ❌ INCORRECT - Abbreviations
private final MyPlugin pl; // Use 'plugin'
private final Map<UUID, PlayerData> pdCache; // Use 'playerDataCache'
private final DatabaseManager dbMgr; // Use 'databaseManager'
private int maxPPA; // Use 'maxPlayersPerArena'
private boolean dbg; // Use 'debugMode'
```

**EXCEPTION:** Well-known abbreviations are acceptable in limited scope.

```java
// ✅ ACCEPTABLE in loop scope
for (Player p : Bukkit.getOnlinePlayers()) {
    // p is obvious in 3-line loop
}

// ✅ ACCEPTABLE - universal abbreviations
UUID uuid = player.getUniqueId();
int id = task.getTaskId();
```

---

#### 1.3.2 Plugin Instance Field

**RULE:** Always name the plugin instance field `plugin`, never `instance` or abbreviations.

```java
// ✅ CORRECT
public class PlayerDataManager {
    private final MyPlugin plugin;
    
    public PlayerDataManager(MyPlugin plugin) {
        this.plugin = plugin;
    }
}
```

```java
// ❌ INCORRECT
private final MyPlugin instance; // Reserved for singleton pattern
private final MyPlugin pl; // Unclear abbreviation
private final MyPlugin main; // Vague
```

**WHY:**
- `instance` suggests singleton pattern (confusing in manager class)
- `plugin` is universally understood in Bukkit ecosystem
- Consistency across all classes

---

#### 1.3.3 Logger Field

**RULE:** Name logger field `logger` (instance) or `LOGGER` (static final).

```java
// ✅ CORRECT - Instance logger
public class DatabaseManager {
    private final Logger logger;
    
    public DatabaseManager(MyPlugin plugin) {
        this.logger = plugin.getLogger();
    }
}

// ✅ CORRECT - Static logger
public class ConfigManager {
    private static final Logger LOGGER = Logger.getLogger(ConfigManager.class.getName());
}
```

```java
// ❌ INCORRECT
private final Logger log; // Ambiguous (verb or noun?)
private final Logger LOG; // Mixed case constant
```

---

#### 1.3.4 Collection Field Naming

**RULE:** Use plural nouns. Specify what the collection contains, not the collection type.

```java
// ✅ CORRECT - Descriptive plurals
private final Map<UUID, PlayerData> playerData;
private final Set<UUID> frozenPlayers;
private final List<Arena> activeArenas;
private final Queue<Player> joinQueue;
```

```java
// ❌ INCORRECT - Includes type in name
private final Map<UUID, PlayerData> playerDataMap; // Redundant
private final Set<UUID> frozenPlayersSet; // Redundant
private final List<Arena> arenaList; // Redundant

// ❌ INCORRECT - Singular when plural expected
private final Map<UUID, PlayerData> playerDataCache; // "Cache" obscures plural

// ❌ ACCEPTABLE but verbose
private final Map<UUID, PlayerData> playerDataByUuid; // Clear but wordy
```

**WHY:**
- Type is visible in declaration; don't repeat in name (DRY principle)
- `playerData.get(uuid)` reads naturally
- Refactoring collection type doesn't require renaming variable

---

#### 1.3.5 Constant Naming

**RULE:** Use `UPPER_SNAKE_CASE` for `static final` primitive/String constants.

```java
// ✅ CORRECT
public class GameConstants {
    public static final int MAX_PLAYERS = 16;
    public static final double DEFAULT_BALANCE = 1000.0;
    public static final String PERMISSION_ADMIN = "myplugin.admin";
    public static final long COOLDOWN_MILLIS = 5000L;
}
```

```java
// ❌ INCORRECT - Wrong case
public static final int maxPlayers = 16; // Use UPPER_SNAKE_CASE
public static final String PermissionAdmin = "..."; // Use UPPER_SNAKE_CASE
```

**EXCEPTION:** `static final` objects use normal naming.

```java
// ✅ CORRECT - Immutable object, not primitive
private static final Logger logger = Logger.getLogger(...);
private static final Pattern UUID_PATTERN = Pattern.compile("...");
```

---

#### 1.3.6 Local Variable Naming

**RULE:** Use full words in method body. Abbreviate only in short loops.

```java
// ✅ CORRECT
public void processPlayers() {
    List<Player> onlinePlayers = new ArrayList<>(Bukkit.getOnlinePlayers());
    
    for (Player player : onlinePlayers) {
        UUID playerUuid = player.getUniqueId();
        PlayerData playerData = getPlayerData(playerUuid);
        // Process...
    }
}

// ✅ ACCEPTABLE - Short loop with obvious context
for (int i = 0; i < args.length; i++) {
    String arg = args[i];
    // Process arg...
}
```

```java
// ❌ INCORRECT - Unclear abbreviations
List<Player> plrs = new ArrayList<>(Bukkit.getOnlinePlayers());
UUID uid = player.getUniqueId();
PlayerData pd = getPlayerData(uid);
```

---

### 1.4 Constants & Enums

#### 1.4.1 When to Use Constants

**RULE:** Extract magic numbers and strings to named constants.

```java
// ✅ CORRECT
public class TeleportCommand implements CommandExecutor {
    private static final int TELEPORT_DELAY_SECONDS = 5;
    private static final int MIN_ARGUMENTS = 1;
    private static final String PERMISSION_TELEPORT = "myplugin.teleport";
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, 
                           String label, String[] args) {
        if (args.length < MIN_ARGUMENTS) {
            return false;
        }
        
        if (!sender.hasPermission(PERMISSION_TELEPORT)) {
            sender.sendMessage("No permission");
            return true;
        }
        
        // Schedule teleport with delay
        scheduleTeleport(TELEPORT_DELAY_SECONDS);
        return true;
    }
}
```

```java
// ❌ INCORRECT - Magic numbers and strings
@Override
public boolean onCommand(CommandSender sender, Command command, 
                       String label, String[] args) {
    if (args.length < 1) { // What does 1 represent?
        return false;
    }
    
    if (!sender.hasPermission("myplugin.teleport")) { // Hardcoded string
        sender.sendMessage("No permission");
        return true;
    }
    
    scheduleTeleport(5); // What does 5 represent?
    return true;
}
```

**WHY:**
- Self-documenting: `TELEPORT_DELAY_SECONDS` explains `5`
- Maintainability: Change value in one place
- Refactoring: Extract to config file easily
- Code review: Named constants reduce cognitive load

---

#### 1.4.2 Enum Usage

**RULE:** Use enums for fixed sets of related constants.

```java
// ✅ CORRECT
public enum GameState {
    WAITING,
    STARTING,
    IN_PROGRESS,
    ENDING,
    RESTARTING;
    
    public boolean isActive() {
        return this == IN_PROGRESS;
    }
    
    public boolean canJoin() {
        return this == WAITING || this == STARTING;
    }
}

// Usage
public class Arena {
    private GameState state = GameState.WAITING;
    
    public void startGame() {
        if (!state.canJoin()) {
            throw new IllegalStateException("Cannot start game in state: " + state);
        }
        state = GameState.STARTING;
    }
}
```

```java
// ❌ INCORRECT - String constants instead of enum
public class Arena {
    public static final String STATE_WAITING = "waiting";
    public static final String STATE_STARTING = "starting";
    public static final String STATE_RUNNING = "running";
    
    private String state = STATE_WAITING; // Typos possible, no type safety
    
    public void startGame() {
        if (state.equals(STATE_WAITING)) { // Can accidentally assign "waitting"
            state = STATE_STARTING;
        }
    }
}
```

**ENUM ADVANTAGES:**
- Type safety: compiler prevents invalid values
- Autocomplete: IDE suggests all enum values
- Switch exhaustiveness: compiler warns on missing cases
- Behavior encapsulation: methods like `isActive()` belong on enum

---

### 1.5 Package Naming Rules

**RULE:** Use reverse domain notation. All lowercase, no underscores.

```
// ✅ CORRECT
com.dibliomorgans.myplugin
com.dibliomorgans.myplugin.commands
com.dibliomorgans.myplugin.listeners
com.dibliomorgans.myplugin.managers
com.dibliomorgans.myplugin.models
com.dibliomorgans.myplugin.utils
```

```
// ❌ INCORRECT
MyPlugin // Missing domain
com.dibliomorgans.MyPlugin // Capital letters
com.dibliomorgans.my_plugin // Underscores
```

**STANDARD PACKAGE STRUCTURE:**

```
com.dibliomorgans.myplugin/
├── MyPlugin.java (main class)
├── commands/
│   ├── CommandHome.java
│   ├── CommandWarp.java
│   └── CommandTeleport.java
├── listeners/
│   ├── PlayerJoinListener.java
│   ├── PlayerQuitListener.java
│   └── BlockBreakListener.java
├── managers/
│   ├── PlayerDataManager.java
│   ├── ConfigManager.java
│   └── DatabaseManager.java
├── models/
│   ├── PlayerData.java
│   ├── Home.java
│   └── Warp.java
├── utils/
│   ├── ChatUtils.java
│   └── LocationUtils.java
└── api/
    └── MyPluginAPI.java
```

---

## 2. Code Organization & Readability

### 2.1 The 50-Line Method Rule

**RULE:** Methods should not exceed **50 lines** including braces and whitespace. Ideal: **20-30 lines**.

#### 2.1.1 Why 50 Lines?

- **Cognitive load:** Human working memory holds ~7 items. Long methods exceed mental capacity
- **Single Responsibility:** 50+ lines usually indicates multiple responsibilities
- **Testability:** Shorter methods are easier to unit test
- **Debugging:** Stack traces more meaningful with granular methods
- **Code review:** Reviewers can understand method in single screen

#### 2.1.2 Event Handler Length Target: 15-20 Lines

```java
// ✅ CORRECT - Concise event handler (18 lines)
public class PlayerJoinListener implements Listener {
    private final MyPlugin plugin;
    private final PlayerDataManager playerDataManager;
    private final ConfigManager configManager;
    
    public PlayerJoinListener(MyPlugin plugin) {
        this.plugin = plugin;
        this.playerDataManager = plugin.getPlayerDataManager();
        this.configManager = plugin.getConfigManager();
    }
    
    @EventHandler(priority = EventPriority.NORMAL)
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        
        playerDataManager.loadPlayerData(player.getUniqueId())
            .thenAccept(data -> sendWelcomeMessage(player, data));
        
        event.setJoinMessage(configManager.getJoinMessage(player.getName()));
    }
    
    private void sendWelcomeMessage(Player player, PlayerData data) {
        String message = configManager.getWelcomeMessage()
            .replace("{player}", player.getName())
            .replace("{balance}", String.valueOf(data.getBalance()));
        player.sendMessage(ChatUtils.colorize(message));
    }
}
```

```java
// ❌ INCORRECT - Bloated event handler (45+ lines)
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    // Load data
    PlayerData data;
    try {
        Connection conn = DriverManager.getConnection(DB_URL);
        PreparedStatement stmt = conn.prepareStatement("SELECT * FROM players WHERE uuid = ?");
        stmt.setString(1, uuid.toString());
        ResultSet rs = stmt.executeQuery();
        
        if (rs.next()) {
            data = new PlayerData(
                uuid,
                rs.getDouble("balance"),
                rs.getInt("level"),
                rs.getString("rank")
            );
        } else {
            data = new PlayerData(uuid, 1000.0, 1, "default");
            // Insert new player...
        }
        
        rs.close();
        stmt.close();
        conn.close();
    } catch (SQLException e) {
        e.printStackTrace();
        player.kickPlayer("Failed to load data");
        return;
    }
    
    // Send welcome message
    String message = getConfig().getString("messages.welcome", "Welcome!");
    message = ChatColor.translateAlternateColorCodes('&', message);
    message = message.replace("{player}", player.getName());
    message = message.replace("{balance}", String.valueOf(data.getBalance()));
    player.sendMessage(message);
    
    // Set join message
    String joinMsg = getConfig().getString("messages.join", "{player} joined");
    joinMsg = joinMsg.replace("{player}", player.getName());
    event.setJoinMessage(ChatColor.translateAlternateColorCodes('&', joinMsg));
    
    // More logic...
}
```

**PROBLEMS IDENTIFIED:**
1. Database logic embedded in event handler
2. No separation of concerns
3. Resource management scattered
4. Repeated code (color translation, placeholders)
5. Untestable without firing actual event

**REFACTORING PATTERN:**

1. **Extract data loading:** `playerDataManager.loadPlayerData(uuid)`
2. **Extract messaging:** `configManager.getWelcomeMessage()`, `ChatUtils.colorize()`
3. **Extract placeholder replacement:** `PlaceholderUtils.replace(message, player, data)`

---

#### 2.1.3 Command Executor Length Target: 10-15 Lines

**RULE:** `onCommand()` should be a **routing table**, not business logic.

```java
// ✅ CORRECT - Thin routing (12 lines)
@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (!(sender instanceof Player player)) {
        sender.sendMessage(ChatUtils.colorize("&cOnly players can use this command"));
        return true;
    }
    
    if (args.length == 0) {
        return handleDefaultAction(player);
    }
    
    return switch (args[0].toLowerCase()) {
        case "set" -> handleSet(player, args);
        case "delete" -> handleDelete(player, args);
        case "list" -> handleList(player);
        default -> false;
    };
}

private boolean handleDefaultAction(Player player) {
    // Implementation
    return true;
}

private boolean handleSet(Player player, String[] args) {
    // Implementation
    return true;
}

// ... other handlers
```

---

#### 2.1.4 Refactoring Techniques

**Extract Method:**

```java
// ❌ BEFORE - Long method (55 lines)
public void startGame() {
    // Validate players (10 lines)
    if (players.size() < minPlayers) {
        broadcast("Not enough players");
        return;
    }
    for (Player player : players) {
        if (!player.isOnline()) {
            broadcast("Player offline");
            return;
        }
    }
    
    // Teleport players (15 lines)
    Location spawn = arenaWorld.getSpawnLocation();
    for (Player player : players) {
        player.teleport(spawn);
        player.setGameMode(GameMode.SURVIVAL);
        player.setHealth(20);
        player.setFoodLevel(20);
        player.getInventory().clear();
    }
    
    // Give items (20 lines)
    ItemStack sword = new ItemStack(Material.IRON_SWORD);
    ItemStack bow = new ItemStack(Material.BOW);
    ItemStack arrows = new ItemStack(Material.ARROW, 64);
    for (Player player : players) {
        player.getInventory().addItem(sword, bow, arrows);
    }
    
    // Start countdown (10 lines)
    new BukkitRunnable() {
        int countdown = 10;
        @Override
        public void run() {
            if (countdown == 0) {
                cancel();
                state = GameState.IN_PROGRESS;
                return;
            }
            broadcast("Game starts in " + countdown);
            countdown--;
        }
    }.runTaskTimer(plugin, 0, 20);
}
```

```java
// ✅ AFTER - Refactored into smaller methods
public void startGame() {
    if (!validatePlayers()) {
        return;
    }
    
    teleportPlayers();
    giveStartingItems();
    startCountdown();
}

private boolean validatePlayers() {
    if (players.size() < minPlayers) {
        broadcast(configManager.getMessage("not-enough-players"));
        return false;
    }
    
    for (Player player : players) {
        if (!player.isOnline()) {
            broadcast(configManager.getMessage("player-offline"));
            return false;
        }
    }
    
    return true;
}

private void teleportPlayers() {
    Location spawn = arenaWorld.getSpawnLocation();
    
    for (Player player : players) {
        player.teleport(spawn);
        resetPlayerState(player);
    }
}

private void resetPlayerState(Player player) {
    player.setGameMode(GameMode.SURVIVAL);
    player.setHealth(20);
    player.setFoodLevel(20);
    player.getInventory().clear();
}

private void giveStartingItems() {
    List<ItemStack> startingItems = configManager.getStartingItems();
    
    for (Player player : players) {
        player.getInventory().addItem(startingItems.toArray(new ItemStack[0]));
    }
}

private void startCountdown() {
    new CountdownTask(this, 10).runTaskTimer(plugin, 0, 20);
}
```

**BENEFITS:**
- Main method now 9 lines (was 55)
- Each extracted method has single responsibility
- Methods testable in isolation
- Method names document intent

---

### 2.2 Import Organization & Wildcard Policy

#### 2.2.1 Import Grouping Order

**RULE:** Group imports in this order, separated by blank line:

1. `java.*` and `javax.*`
2. Third-party libraries (Bukkit, Paper, external libs)
3. Internal project packages

```java
// ✅ CORRECT
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

import com.dibliomorgans.myplugin.managers.PlayerDataManager;
import com.dibliomorgans.myplugin.models.PlayerData;
```

```java
// ❌ INCORRECT - Random order, no grouping
import org.bukkit.entity.Player;
import com.dibliomorgans.myplugin.managers.PlayerDataManager;
import java.util.UUID;
import org.bukkit.Bukkit;
import java.util.List;
import com.dibliomorgans.myplugin.models.PlayerData;
```

---

#### 2.2.2 Wildcard Import Policy

**RULE:** **NEVER** use wildcard imports (`import org.bukkit.*`) in production code.

```java
// ✅ CORRECT - Explicit imports
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
```

```java
// ❌ INCORRECT - Wildcard imports
import org.bukkit.*;
import org.bukkit.event.*;
import java.util.*;
```

**WHY WILDCARDS ARE HARMFUL:**

1. **Name collision:** `java.util.List` vs `org.bukkit.inventory.List` (hypothetical)
2. **Unclear dependencies:** Reader can't tell which classes are used
3. **Refactoring risk:** Removing unused class doesn't remove import
4. **Compilation fragility:** New classes in imported package can shadow local classes
5. **Code review:** Can't grep for `import ...Player` to find usages

**EXCEPTION:** Wildcard acceptable for static imports of constants.

```java
// ✅ ACCEPTABLE - Static import of constants
import static org.bukkit.ChatColor.*;

public class ChatUtils {
    public static String format(String message) {
        return GREEN + message + RESET;
    }
}
```

**CONFIGURATION:** Set IDE to expand wildcards automatically.

**IntelliJ IDEA:**
- Settings → Editor → Code Style → Java → Imports
- Set "Class count to use import with '*'" to 999
- Set "Names count to use static import with '*'" to 999

---

#### 2.2.3 Unused Import Detection

**RULE:** Remove all unused imports before commit. Enable IDE warnings.

**IntelliJ:** Code → Optimize Imports (Ctrl+Alt+O)  
**Eclipse:** Source → Organize Imports (Ctrl+Shift+O)  
**VSCode:** Java: Organize Imports

> **Warning:** Unused imports are often a sign of incomplete refactoring. Review recent changes when removing imports.

---

### 2.3 Annotation Discipline

#### 2.3.1 @Override Annotation

**RULE:** **ALWAYS** use `@Override` when implementing interface methods or overriding superclass methods.

```java
// ✅ CORRECT
public class MyPlugin extends JavaPlugin {
    
    @Override
    public void onEnable() {
        // Implementation
    }
    
    @Override
    public void onDisable() {
        // Implementation
    }
}

public class CommandHome implements CommandExecutor {
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, 
                           String label, String[] args) {
        // Implementation
        return true;
    }
}
```

```java
// ❌ INCORRECT - Missing @Override
public void onEnable() { // Compiler won't catch typos in method signature
    // Implementation
}

public boolean onCommand(CommandSender sender, Command command, 
                       String label, String[] args) {
    // Implementation
    return true;
}
```

**WHY:**
- **Compiler verification:** Ensures method actually overrides parent
- **Refactoring safety:** Compile error if parent method signature changes
- **Documentation:** Signals intent to readers
- **Typo prevention:** `onEneble()` without `@Override` compiles but never runs

---

#### 2.3.2 @EventHandler Annotation

**RULE:** Place `@EventHandler` on separate line above method. Specify priority when non-default.

```java
// ✅ CORRECT - Default priority
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    // Implementation
}

// ✅ CORRECT - Explicit priority
@EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
public void onPlayerDamage(EntityDamageEvent event) {
    // Implementation
}
```

```java
// ❌ INCORRECT - Same line
@EventHandler public void onPlayerJoin(PlayerJoinEvent event) { }

// ❌ INCORRECT - Unnecessary default priority
@EventHandler(priority = EventPriority.NORMAL) // NORMAL is default, omit it
public void onPlayerJoin(PlayerJoinEvent event) { }
```

**PRIORITY USAGE GUIDELINES:**

| **Priority** | **When to Use** | **Example** |
|-------------|----------------|-------------|
| `LOWEST` | Early processing, pre-validation | Anti-cheat checks |
| `LOW` | Before most plugins | Region protection |
| `NORMAL` | Default, most listeners | Standard game logic |
| `HIGH` | Override other plugins | Custom death messages |
| `HIGHEST` | Final processing | Logging, analytics |
| `MONITOR` | Read-only observation, never modify | Database logging |

> **Warning:** `MONITOR` priority handlers should NEVER modify event outcome or call `setCancelled()`. Use only for logging/metrics.

---

#### 2.3.3 @Nullable and @NotNull Annotations

**RULE:** Use on public API methods to document null contracts.

```java
// ✅ CORRECT - Clear null contract
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class PlayerDataManager {
    
    /**
     * Gets player data from cache.
     * 
     * @param uuid Player UUID, must not be null
     * @return Player data, or null if not loaded
     */
    @Nullable
    public PlayerData getPlayerData(@NotNull UUID uuid) {
        return playerDataCache.get(uuid);
    }
    
    /**
     * Gets player data, loading if necessary.
     * 
     * @param uuid Player UUID, must not be null
     * @return Player data, never null
     */
    @NotNull
    public CompletableFuture<PlayerData> loadPlayerData(@NotNull UUID uuid) {
        // Implementation always returns data
    }
}
```

**DEPENDENCY:** Add JetBrains annotations to Maven/Gradle.

**Maven:**
```xml
<dependency>
    <groupId>org.jetbrains</groupId>
    <artifactId>annotations</artifactId>
    <version>24.0.1</version>
    <scope>provided</scope>
</dependency>
```

**WHY:**
- IDE warnings when passing null to `@NotNull` parameter
- Self-documenting: caller knows whether null-check needed
- Static analysis tools detect potential NPEs

---

#### 2.3.4 @Deprecated Annotation

**RULE:** Always include `@Deprecated` with Javadoc explaining replacement.

```java
// ✅ CORRECT
/**
 * Gets player balance.
 * 
 * @param playerName Player name
 * @return Balance or 0 if player not found
 * @deprecated Use {@link #getBalance(UUID)} instead. Player names can change.
 *             Will be removed in version 3.0.
 */
@Deprecated(since = "2.0", forRemoval = true)
public double getBalance(String playerName) {
    Player player = Bukkit.getPlayerExact(playerName);
    if (player == null) {
        return 0;
    }
    return getBalance(player.getUniqueId());
}

public double getBalance(UUID uuid) {
    // Implementation
}
```

```java
// ❌ INCORRECT - No explanation
@Deprecated
public double getBalance(String playerName) {
    // What should caller use instead?
}
```

---

### 2.4 Brace Style & Indentation

#### 2.4.1 Brace Style

**RULE:** Use **K&R (Egyptian) style** — opening brace on same line, closing brace on new line.

```java
// ✅ CORRECT - K&R style
public class MyPlugin extends JavaPlugin {
    
    @Override
    public void onEnable() {
        if (loadConfiguration()) {
            getLogger().info("Plugin enabled");
        } else {
            getLogger().severe("Failed to load configuration");
            getServer().getPluginManager().disablePlugin(this);
        }
    }
    
    private boolean loadConfiguration() {
        try {
            saveDefaultConfig();
            return true;
        } catch (Exception e) {
            getLogger().log(Level.SEVERE, "Configuration error", e);
            return false;
        }
    }
}
```

```java
// ❌ INCORRECT - Allman style (brace on new line)
public class MyPlugin extends JavaPlugin
{
    @Override
    public void onEnable()
    {
        if (loadConfiguration())
        {
            getLogger().info("Plugin enabled");
        }
        else
        {
            getLogger().severe("Failed to load configuration");
        }
    }
}
```

**WHY K&R:**
- Industry standard in Java ecosystem
- Bukkit/Spigot/Paper codebase uses K&R
- Saves vertical space (more code visible per screen)

---

#### 2.4.2 Single-Statement Blocks

**RULE:** **ALWAYS** use braces, even for single-statement if/for/while blocks.

```java
// ✅ CORRECT - Braces even for single statement
if (player == null) {
    return;
}

for (Player p : players) {
    p.sendMessage("Hello");
}
```

```java
// ❌ INCORRECT - Missing braces
if (player == null)
    return;

for (Player p : players)
    p.sendMessage("Hello");
```

**WHY:**
- **Apple's "goto fail" bug:** Missing braces caused critical security vulnerability
- Prevents bugs when adding second statement
- Consistent visual structure

**EXCEPTION:** Ternary operator doesn't need braces.

```java
// ✅ ACCEPTABLE
String message = player.isOp() ? "Admin" : "Player";
```

---

#### 2.4.3 Indentation

**RULE:** Use **4 spaces** for indentation. Never tabs. Never 2 spaces.

```java
// ✅ CORRECT - 4 spaces
public class Example {
    private int value;
    
    public void doSomething() {
        if (value > 0) {
            for (int i = 0; i < value; i++) {
                System.out.println(i);
            }
        }
    }
}
```

**IDE CONFIGURATION:**
- IntelliJ: Settings → Editor → Code Style → Java → Tabs and Indents → Tab size: 4, Indent: 4, Use spaces
- Eclipse: Preferences → Java → Code Style → Formatter → Indentation → Spaces only
- VSCode: settings.json → `"editor.tabSize": 4`, `"editor.insertSpaces": true`

**WHY 4 SPACES:**
- Java convention (Google, Oracle, Spring style guides)
- 2 spaces insufficient for deeply nested code
- Tabs cause inconsistent rendering across editors

---

#### 2.4.4 Line Length

**RULE:** Maximum **120 characters** per line. Ideal: **80-100 characters**.

```java
// ✅ CORRECT - Under 120 characters
public void sendFormattedMessage(Player player, String message) {
    player.sendMessage(ChatUtils.colorize(message));
}

// ✅ CORRECT - Method chaining split across lines
playerDataManager.loadPlayerData(uuid)
    .thenAccept(data -> sendWelcomeMessage(player, data))
    .exceptionally(ex -> {
        getLogger().log(Level.SEVERE, "Failed to load player data", ex);
        return null;
    });
```

```java
// ❌ INCORRECT - 150+ characters
public void sendFormattedMessage(Player player, String message) { player.sendMessage(ChatColor.translateAlternateColorCodes('&', message.replace("{player}", player.getName()))); }
```

**LINE WRAPPING:**

```java
// ✅ CORRECT - Wrapped at logical boundaries
String message = configManager.getMessage("welcome")
    .replace("{player}", player.getName())
    .replace("{balance}", String.valueOf(balance))
    .replace("{world}", player.getWorld().getName());

// ✅ CORRECT - Wrapped method parameters (8+ spaces indent)
public PlayerData createPlayerData(
        UUID uuid,
        String name,
        double balance,
        int level,
        String rank) {
    // Implementation
}
```

---

### 2.5 Single Responsibility Principle for Classes

**RULE:** Each class should have **one reason to change**.

#### 2.5.1 Identifying SRP Violations

**RED FLAGS:**
- Class name contains "And" or "Manager" without specific domain
- Class has 10+ fields
- Class has 20+ methods
- Methods unrelated to each other
- Class imports from 5+ different packages

```java
// ❌ INCORRECT - Multiple responsibilities
public class PlayerManager {
    // Database operations
    private Connection connection;
    
    public void savePlayer(Player player) { }
    public PlayerData loadPlayer(UUID uuid) { }
    
    // Economy operations
    private double balance;
    
    public void addMoney(Player player, double amount) { }
    public double getMoney(Player player) { }
    
    // Permission operations
    public boolean hasPermission(Player player, String perm) { }
    public void setPermission(Player player, String perm, boolean value) { }
    
    // Teleportation
    public void teleport(Player player, Location location) { }
    
    // Messaging
    public void sendMessage(Player player, String message) { }
}
```

**REFACTORED:**

```java
// ✅ CORRECT - Single responsibilities
public class PlayerDataManager {
    private final DatabaseManager databaseManager;
    
    public CompletableFuture<PlayerData> loadPlayerData(UUID uuid) {
        // Implementation
    }
    
    public void savePlayerData(PlayerData data) {
        // Implementation
    }
}

public class EconomyManager {
    private final Map<UUID, Double> balances = new HashMap<>();
    
    public double getBalance(UUID uuid) {
        // Implementation
    }
    
    public void setBalance(UUID uuid, double balance) {
        // Implementation
    }
}

public class PermissionManager {
    public boolean hasPermission(Player player, String permission) {
        // Implementation
    }
}

public class TeleportManager {
    public void teleport(Player player, Location location) {
        // Implementation with safety checks
    }
}
```

---

## 3. Documentation Standards

### 3.1 Javadoc Requirements

#### 3.1.1 MUST Document

**RULE:** The following MUST have Javadoc:

1. **Public API classes and interfaces**
2. **Public API methods**
3. **Package-level documentation** (`package-info.java`)
4. **Main plugin class**
5. **Complex algorithms or non-obvious logic**

```java
// ✅ CORRECT - Full API documentation
/**
 * Manages player data persistence including loading, saving, and caching.
 * <p>
 * This manager uses async operations for database access to avoid blocking
 * the main server thread. All data is cached in memory after loading.
 * </p>
 * 
 * <p><b>Thread Safety:</b> This class is thread-safe. All public methods
 * can be called from any thread.</p>
 * 
 * @author dibliomorgans
 * @version 2.0
 * @since 1.0
 */
public class PlayerDataManager {
    
    /**
     * Loads player data from database asynchronously.
     * <p>
     * If data doesn't exist, creates new default data. Result is cached
     * after loading.
     * </p>
     * 
     * @param uuid Player UUID, must not be null
     * @return CompletableFuture containing player data, never null
     * @throws IllegalArgumentException if uuid is null
     */
    @NotNull
    public CompletableFuture<PlayerData> loadPlayerData(@NotNull UUID uuid) {
        // Implementation
    }
    
    /**
     * Saves player data to database asynchronously.
     * <p>
     * If save fails, logs error but doesn't throw exception. Consider using
     * {@link #savePlayerDataSync(UUID)} for critical saves during shutdown.
     * </p>
     * 
     * @param uuid Player UUID
     * @see #savePlayerDataSync(UUID)
     */
    public void savePlayerData(@NotNull UUID uuid) {
        // Implementation
    }
}
```

---

#### 3.1.2 SHOULD Document

**RULE:** The following SHOULD have Javadoc (recommended but not mandatory):

1. Package-private classes used in multiple places
2. Protected methods
3. Complex constructors
4. Enum constants with non-obvious meaning

```java
// ✅ GOOD - Enum with documented constants
public enum GameState {
    
    /** Players can join, countdown hasn't started */
    WAITING,
    
    /** Countdown active, no new players can join */
    STARTING,
    
    /** Game in progress */
    IN_PROGRESS,
    
    /** Game ended, calculating winners */
    ENDING,
    
    /** Resetting arena to initial state */
    RESTARTING;
}
```

---

#### 3.1.3 OPTIONAL Documentation

**RULE:** The following are OPTIONAL (use judgment):

1. Private methods (if name is self-explanatory)
2. Getters/setters for simple fields
3. Standard overrides (`toString()`, `equals()`, `hashCode()`)
4. Test methods (use descriptive names instead)

```java
// ✅ ACCEPTABLE - No Javadoc for obvious getter
public double getBalance() {
    return balance;
}

// ✅ ACCEPTABLE - No Javadoc for self-explanatory private method
private void resetPlayerInventory(Player player) {
    player.getInventory().clear();
    player.setHealth(20);
    player.setFoodLevel(20);
}
```

---

#### 3.1.4 Main Class Documentation

**RULE:** Main plugin class MUST have comprehensive class-level Javadoc.

```java
/**
 * MyPlugin - Advanced teleportation and home management system.
 * <p>
 * Provides players with the ability to set multiple homes, create warps,
 * and teleport to other players with configurable delays and cooldowns.
 * </p>
 * 
 * <p><b>Features:</b></p>
 * <ul>
 *   <li>Multiple homes per player (configurable limit)</li>
 *   <li>Server-wide warp points</li>
 *   <li>Teleport requests with accept/deny system</li>
 *   <li>Configurable cooldowns and warmups</li>
 *   <li>MySQL and SQLite support</li>
 * </ul>
 * 
 * <p><b>Commands:</b></p>
 * <ul>
 *   <li>/home [name] - Teleport to home</li>
 *   <li>/sethome [name] - Set home at current location</li>
 *   <li>/delhome [name] - Delete home</li>
 *   <li>/warp [name] - Teleport to warp</li>
 *   <li>/tpa [player] - Request teleport to player</li>
 * </ul>
 * 
 * <p><b>Permissions:</b></p>
 * <ul>
 *   <li>myplugin.home - Use home commands</li>
 *   <li>myplugin.warp - Use warp commands</li>
 *   <li>myplugin.tpa - Use teleport requests</li>
 *   <li>myplugin.admin - Administrative commands</li>
 * </ul>
 * 
 * <p><b>Dependencies:</b> Vault (optional, for economy integration)</p>
 * 
 * @author dibliomorgans
 * @version 2.0.0
 * @since 1.0.0
 * @see <a href="https://github.com/dibliomorgans/myplugin">GitHub Repository</a>
 */
public final class MyPlugin extends JavaPlugin {
    // Implementation
}
```

---

### 3.2 Self-Documenting Code vs Comments

#### 3.2.1 Self-Documenting Code Principles

**RULE:** Code should explain **what** it does through clear naming. Comments explain **why**.

```java
// ✅ CORRECT - Self-documenting
public void handleCombatLog(Player player) {
    if (isInCombat(player)) {
        killPlayer(player);
        broadcastCombatLogMessage(player);
    }
}

private boolean isInCombat(Player player) {
    Long lastCombatTime = combatTags.get(player.getUniqueId());
    if (lastCombatTime == null) {
        return false;
    }
    
    long elapsedMillis = System.currentTimeMillis() - lastCombatTime;
    return elapsedMillis < COMBAT_TAG_DURATION_MILLIS;
}
```

```java
// ❌ INCORRECT - Needs comments to understand
public void handle(Player p) {
    if (check(p)) { // Check if player is in combat
        kill(p); // Kill the player
        broadcast(p); // Tell everyone
    }
}

private boolean check(Player p) {
    Long t = tags.get(p.getUniqueId());
    if (t == null) return false;
    return System.currentTimeMillis() - t < 30000; // 30 seconds
}
```

---

#### 3.2.2 When Comments Add Value

**GOOD COMMENTS:**

```java
// ✅ EXPLAINS WHY - Technical constraint
// Paper's teleport API requires synchronous execution even when called
// from async context due to chunk loading mechanics
Bukkit.getScheduler().runTask(plugin, () -> {
    player.teleport(location);
});

// ✅ EXPLAINS WHY - Business rule
// Players must wait 10 seconds to prevent spawn camping.
// This duration is hardcoded per server rules, not configurable.
private static final int RESPAWN_INVULNERABILITY_SECONDS = 10;

// ✅ EXPLAINS WHY - Non-obvious algorithm
// Using ConcurrentHashMap.compute() ensures atomic read-modify-write
// even under high concurrency. Don't replace with get()+put().
balances.compute(uuid, (key, oldBalance) -> 
    (oldBalance == null ? 0 : oldBalance) + amount
);

// ✅ EXPLAINS WHY - Workaround
// BUKKIT-12345: PlayerQuitEvent fires before inventory is saved.
// Delay by 1 tick to ensure inventory changes persist.
Bukkit.getScheduler().runTaskLater(plugin, () -> {
    savePlayerData(uuid);
}, 1L);
```

**BAD COMMENTS:**

```java
// ❌ EXPLAINS WHAT - Code already says this
// Increment i by 1
i++;

// ❌ OBVIOUS - Redundant with method name
// Gets the player's balance
public double getBalance(UUID uuid) { }

// ❌ OUTDATED - Worse than no comment
// TODO: Add permission check (feature was added 6 months ago)
public void teleport(Player player) {
    if (!player.hasPermission("myplugin.teleport")) {
        return;
    }
    // ...
}

// ❌ COMMENTED-OUT CODE - Delete it, version control remembers
// public void oldMethod() {
//     // ...
// }
```

---

#### 3.2.3 TODO/FIXME/HACK Comments

**RULE:** Use TODO/FIXME sparingly. Include issue tracker reference.

```java
// ✅ ACCEPTABLE - Linked to issue tracker
// TODO(#42): Migrate to Adventure API for 1.19+ hover/click events
public void sendLegacyMessage(Player player, String message) {
    player.sendMessage(ChatColor.translateAlternateColorCodes('&', message));
}

// ❌ INCORRECT - Vague, no ownership, no timeline
// TODO: Fix this
public void brokenMethod() { }

// ❌ INCORRECT - FIXME in production code
// FIXME: This crashes sometimes
public void unreliableMethod() { }
```

**POLICY:** All TODO comments must be resolved or converted to issues before major releases.

---

### 3.3 plugin.yml Metadata Standards

#### 3.3.1 Required Fields

```yaml
# ✅ CORRECT - Complete plugin.yml
name: MyPlugin
version: '${project.version}'
main: com.dibliomorgans.myplugin.MyPlugin
api-version: '1.16'
description: 'Advanced teleportation and home management system with MySQL support'
author: dibliomorgans
website: 'https://github.com/dibliomorgans/myplugin'

commands:
  home:
    description: 'Teleport to your home'
    usage: '/<command> [name]'
    permission: myplugin.home
    aliases: [h]
  
  sethome:
    description: 'Set a home at your current location'
    usage: '/<command> <name>'
    permission: myplugin.home.set

permissions:
  myplugin.home:
    description: 'Allows using /home command'
    default: true
  
  myplugin.home.set:
    description: 'Allows setting homes'
    default: true
  
  myplugin.admin:
    description: 'Administrative commands'
    default: op
    children:
      myplugin.home: true
      myplugin.home.set: true
```

---

#### 3.3.2 Field Guidelines

**name:**
- No spaces, PascalCase preferred
- Match main class name

**version:**
- Use Maven/Gradle variable: `${project.version}`
- Semantic versioning: `MAJOR.MINOR.PATCH`

**main:**
- Fully qualified class name
- Double-check spelling (typo = plugin won't load)

**api-version:**
- `'1.16'` for backward compatibility with 1.16+
- `'1.19'` if using 1.19+ exclusive features
- **ALWAYS quote the version number**

**description:**
- One sentence summary
- No marketing fluff, just functionality

**author vs authors:**
- Single author: `author: dibliomorgans`
- Multiple authors: `authors: [dibliomorgans, contributor2]`

**website:**
- GitHub repository, documentation site, or SpigotMC page
- Must be full URL with protocol

**depend vs softdepend:**
- `depend`: Plugin won't load without dependency
- `softdepend`: Load after dependency if present

```yaml
# Plugin requires Vault
depend: [Vault]

# Plugin integrates with PlaceholderAPI if available
softdepend: [PlaceholderAPI]
```

---

### 3.4 README & Documentation Files

#### 3.4.1 README.md Structure

```markdown
# MyPlugin

Advanced teleportation and home management system for Minecraft Paper 1.21.4

## Features

- Multiple homes per player (configurable limit)
- Server-wide warp system
- Teleport requests with accept/deny
- MySQL and SQLite support
- Configurable cooldowns and warmups

## Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/home [name]` | Teleport to home | `myplugin.home` |
| `/sethome <name>` | Set home at current location | `myplugin.home.set` |
| `/delhome <name>` | Delete home | `myplugin.home.delete` |

## Permissions

- `myplugin.home` - Use home commands (default: true)
- `myplugin.admin` - Administrative commands (default: op)

## Configuration

```yaml
# Maximum homes per player
max-homes: 5

# Teleport warmup in seconds
teleport-warmup: 5

# Database settings
database:
  type: sqlite # or mysql
```

## Installation

1. Download latest release from [Releases](https://github.com/dibliomorgans/myplugin/releases)
2. Place `MyPlugin.jar` in `plugins/` folder
3. Restart server
4. Edit `plugins/MyPlugin/config.yml`
5. Run `/myplugin reload`

## Dependencies

- **Required:** Paper 1.21.4+
- **Optional:** Vault (for economy integration)

## Support

- [Discord](https://discord.gg/example)
- [Issues](https://github.com/dibliomorgans/myplugin/issues)

## License

MIT License - see [LICENSE](LICENSE) file
```

---

## 4. Error Handling Elegance

### 4.1 Exception Philosophy

#### 4.1.1 Checked vs Unchecked Exceptions

**RULE:** Use checked exceptions for **recoverable** conditions, unchecked for **programming errors**.

**CHECKED EXCEPTIONS (`Exception`):**
- File not found
- Network timeout
- Database connection failed
- Invalid user input

**UNCHECKED EXCEPTIONS (`RuntimeException`):**
- Null pointer (NullPointerException)
- Invalid argument (IllegalArgumentException)
- Invalid state (IllegalStateException)
- Array index out of bounds

```java
// ✅ CORRECT - Checked exception for recoverable I/O error
public PlayerData loadPlayerData(UUID uuid) throws IOException {
    File dataFile = new File(dataFolder, uuid.toString() + ".yml");
    
    if (!dataFile.exists()) {
        throw new FileNotFoundException("Player data not found: " + uuid);
    }
    
    YamlConfiguration config = YamlConfiguration.loadConfiguration(dataFile);
    return PlayerData.fromConfig(config);
}

// ✅ CORRECT - Unchecked exception for programming error
public void setHealth(double health) {
    if (health < 0 || health > 20) {
        throw new IllegalArgumentException(
            "Health must be between 0 and 20, got: " + health
        );
    }
    this.health = health;
}
```

---

#### 4.1.2 Custom Exception Hierarchy

```java
// ✅ CORRECT - Custom exception hierarchy
public class PluginException extends Exception {
    public PluginException(String message) {
        super(message);
    }
    
    public PluginException(String message, Throwable cause) {
        super(message, cause);
    }
}

public class DatabaseException extends PluginException {
    public DatabaseException(String message, Throwable cause) {
        super("Database error: " + message, cause);
    }
}

public class PlayerDataNotFoundException extends PluginException {
    public PlayerDataNotFoundException(UUID uuid) {
        super("Player data not found for UUID: " + uuid);
    }
}

// Usage
public PlayerData loadPlayerData(UUID uuid) throws PlayerDataNotFoundException {
    // ...
}
```

---

### 4.2 Try-Catch Placement & Scope

#### 4.2.1 Minimal Try Scope

**RULE:** Wrap only the code that can throw exceptions, not entire methods.

```java
// ✅ CORRECT - Minimal try scope
public void savePlayerData(UUID uuid) {
    PlayerData data = playerDataCache.get(uuid);
    if (data == null) {
        return;
    }
    
    File dataFile = new File(dataFolder, uuid.toString() + ".yml");
    YamlConfiguration config = new YamlConfiguration();
    data.saveToConfig(config);
    
    try {
        config.save(dataFile);
    } catch (IOException e) {
        getLogger().log(Level.SEVERE, "Failed to save player data: " + uuid, e);
    }
}
```

```java
// ❌ INCORRECT - Overly broad try scope
public void savePlayerData(UUID uuid) {
    try {
        PlayerData data = playerDataCache.get(uuid); // Can't throw exception
        if (data == null) {
            return;
        }
        
        File dataFile = new File(dataFolder, uuid.toString() + ".yml");
        YamlConfiguration config = new YamlConfiguration();
        data.saveToConfig(config);
        config.save(dataFile); // Only this line throws IOException
    } catch (IOException e) {
        getLogger().log(Level.SEVERE, "Failed to save player data: " + uuid, e);
    }
}
```

---

#### 4.2.2 Multiple Catch Blocks

**RULE:** Catch specific exceptions first, generic exceptions last.

```java
// ✅ CORRECT - Specific to general
public void connectToDatabase() {
    try {
        connection = DriverManager.getConnection(url, username, password);
    } catch (SQLTimeoutException e) {
        getLogger().severe("Database connection timeout. Check network connection.");
        scheduleReconnect();
    } catch (SQLException e) {
        getLogger().log(Level.SEVERE, "Database connection failed", e);
        disablePlugin();
    }
}
```

```java
// ❌ INCORRECT - Generic exception first (unreachable code)
try {
    connection = DriverManager.getConnection(url, username, password);
} catch (SQLException e) { // Catches SQLTimeoutException too
    getLogger().log(Level.SEVERE, "Database error", e);
} catch (SQLTimeoutException e) { // UNREACHABLE CODE - compiler error
    getLogger().severe("Timeout");
}
```

---

#### 4.2.3 Multi-Catch

**RULE:** Use multi-catch when handling exceptions identically.

```java
// ✅ CORRECT - Multi-catch for identical handling
public Location deserializeLocation(String serialized) {
    try {
        String[] parts = serialized.split(",");
        World world = Bukkit.getWorld(parts[0]);
        double x = Double.parseDouble(parts[1]);
        double y = Double.parseDouble(parts[2]);
        double z = Double.parseDouble(parts[3]);
        
        return new Location(world, x, y, z);
    } catch (NumberFormatException | ArrayIndexOutOfBoundsException e) {
        throw new IllegalArgumentException("Invalid location format: " + serialized, e);
    }
}
```

---

### 4.3 Empty Catch Blocks — The Ultimate Sin

**RULE:** **NEVER** use empty catch blocks. Log at minimum.

```java
// ❌ UNACCEPTABLE - Silent failure
try {
    savePlayerData(uuid);
} catch (IOException e) {
    // Empty - data loss!
}

// ❌ UNACCEPTABLE - Comment doesn't justify
try {
    savePlayerData(uuid);
} catch (IOException e) {
    // Ignore errors
}
```

```java
// ✅ CORRECT - Log the exception
try {
    savePlayerData(uuid);
} catch (IOException e) {
    getLogger().log(Level.WARNING, "Failed to save player data: " + uuid, e);
}

// ✅ ACCEPTABLE - Documented intentional suppression (rare)
try {
    Class.forName("com.mysql.cj.jdbc.Driver");
} catch (ClassNotFoundException e) {
    // Driver already loaded by another plugin or classpath.
    // This is expected and safe to ignore.
}
```

---

### 4.4 Logging Standards

#### 4.4.1 Never printStackTrace()

**RULE:** **NEVER** use `e.printStackTrace()` in production code.

```java
// ❌ BANNED - Goes to stderr, not log file, no timestamp
try {
    // ...
} catch (Exception e) {
    e.printStackTrace();
}
```

```java
// ✅ CORRECT - Use plugin logger
try {
    // ...
} catch (Exception e) {
    getLogger().log(Level.SEVERE, "Failed to load configuration", e);
}
```

---

#### 4.4.2 Log Level Guidelines

| **Level** | **When to Use** | **Example** |
|-----------|----------------|-------------|
| `SEVERE` | Critical errors, plugin disabling | Database connection failed, corrupted config |
| `WARNING` | Recoverable errors, deprecated usage | Player data save failed (will retry), using old API |
| `INFO` | Important state changes | Plugin enabled, player joined, command executed |
| `CONFIG` | Configuration details | Loaded 45 warps, using MySQL database |
| `FINE` | Debug info (disabled by default) | Cache hit, query took 15ms |

```java
// ✅ CORRECT - Appropriate levels
getLogger().info("Plugin enabled successfully"); // INFO
getLogger().warning("Failed to load warp 'spawn', skipping"); // WARNING
getLogger().severe("Database connection failed. Disabling plugin."); // SEVERE
getLogger().config("Loaded " + homes.size() + " homes from database"); // CONFIG
```

---

#### 4.4.3 Structured Logging

**RULE:** Include context in log messages (player name, UUID, location, etc.).

```java
// ✅ CORRECT - Contextual logging
getLogger().log(Level.WARNING, 
    String.format("Player %s (%s) tried to teleport to invalid world: %s",
        player.getName(),
        player.getUniqueId(),
        worldName),
    exception
);

// ❌ INCORRECT - No context
getLogger().warning("Teleport failed");
```

---

#### 4.4.4 System.out.println Ban

**RULE:** **NEVER** use `System.out.println()` or `System.err.println()`.

```java
// ❌ BANNED
System.out.println("Player joined: " + player.getName());
System.err.println("Error: " + error);

// ✅ CORRECT
getLogger().info("Player joined: " + player.getName());
getLogger().severe("Error: " + error);
```

**WHY:**
- `System.out` doesn't go to log files
- No timestamps, log levels, or plugin name
- Spam console without server owner control

---

### 4.5 Null Safety Patterns

#### 4.5.1 Early Return Pattern

**RULE:** Use early returns instead of nested if-statements.

```java
// ✅ CORRECT - Early returns, shallow nesting
public void teleportToHome(Player player, String homeName) {
    if (player == null) {
        throw new IllegalArgumentException("Player cannot be null");
    }
    
    PlayerData data = getPlayerData(player.getUniqueId());
    if (data == null) {
        player.sendMessage("Your data is not loaded");
        return;
    }
    
    Location home = data.getHome(homeName);
    if (home == null) {
        player.sendMessage("Home not found: " + homeName);
        return;
    }
    
    player.teleport(home);
    player.sendMessage("Teleported to home: " + homeName);
}
```

```java
// ❌ INCORRECT - Deep nesting
public void teleportToHome(Player player, String homeName) {
    if (player != null) {
        PlayerData data = getPlayerData(player.getUniqueId());
        if (data != null) {
            Location home = data.getHome(homeName);
            if (home != null) {
                player.teleport(home);
                player.sendMessage("Teleported to home: " + homeName);
            } else {
                player.sendMessage("Home not found: " + homeName);
            }
        } else {
            player.sendMessage("Your data is not loaded");
        }
    }
}
```

---

#### 4.5.2 Objects.requireNonNull()

**RULE:** Use `Objects.requireNonNull()` at API boundaries.

```java
// ✅ CORRECT - Validate public API inputs
public class PlayerDataManager {
    
    public CompletableFuture<PlayerData> loadPlayerData(@NotNull UUID uuid) {
        Objects.requireNonNull(uuid, "UUID cannot be null");
        
        return CompletableFuture.supplyAsync(() -> {
            // Implementation
        });
    }
}
```

---

#### 4.5.3 Optional Usage

**RULE:** Use `Optional<T>` sparingly. Prefer `@Nullable` return + null checks.

```java
// ✅ ACCEPTABLE - Optional for truly optional values
public Optional<Location> getHome(String name) {
    return Optional.ofNullable(homes.get(name));
}

// Usage
playerData.getHome("home1").ifPresent(player::teleport);

// ✅ PREFERRED - Nullable annotation + explicit null check
@Nullable
public Location getHome(String name) {
    return homes.get(name);
}

// Usage
Location home = playerData.getHome("home1");
if (home != null) {
    player.teleport(home);
}
```

**WHY PREFER NULLABLE:**
- Less object allocation overhead
- More familiar pattern in Java ecosystem
- Optional doesn't prevent `Optional.get()` NPE

**WHEN TO USE OPTIONAL:**
- Method chaining (`.map()`, `.filter()`, `.orElse()`)
- Stream API integration

---

## 5. Resource Management

### 5.1 Try-With-Resources for AutoCloseables

**RULE:** Use try-with-resources for ALL `AutoCloseable` resources.

#### 5.1.1 Single Resource

```java
// ✅ CORRECT - Try-with-resources
public List<PlayerData> loadAllPlayers() {
    List<PlayerData> players = new ArrayList<>();
    
    try (Connection conn = getConnection();
         PreparedStatement stmt = conn.prepareStatement("SELECT * FROM players");
         ResultSet rs = stmt.executeQuery()) {
        
        while (rs.next()) {
            players.add(parsePlayerData(rs));
        }
    } catch (SQLException e) {
        getLogger().log(Level.SEVERE, "Failed to load players", e);
    }
    
    return players;
}
```

```java
// ❌ INCORRECT - Manual close (resource leak if exception occurs)
public List<PlayerData> loadAllPlayers() {
    Connection conn = null;
    PreparedStatement stmt = null;
    ResultSet rs = null;
    
    try {
        conn = getConnection();
        stmt = conn.prepareStatement("SELECT * FROM players");
        rs = stmt.executeQuery();
        
        List<PlayerData> players = new ArrayList<>();
        while (rs.next()) {
            players.add(parsePlayerData(rs));
        }
        return players;
    } catch (SQLException e) {
        getLogger().log(Level.SEVERE, "Failed to load players", e);
        return new ArrayList<>();
    } finally {
        // Verbose and error-prone
        if (rs != null) try { rs.close(); } catch (SQLException e) { }
        if (stmt != null) try { stmt.close(); } catch (SQLException e) { }
        if (conn != null) try { conn.close(); } catch (SQLException e) { }
    }
}
```

---

#### 5.1.2 Multiple Resources

```java
// ✅ CORRECT - Multiple resources in try-with-resources
public void savePlayerData(UUID uuid, PlayerData data) {
    String sql = "INSERT INTO players (uuid, balance, level) VALUES (?, ?, ?) " +
                 "ON DUPLICATE KEY UPDATE balance = ?, level = ?";
    
    try (Connection conn = getConnection();
         PreparedStatement stmt = conn.prepareStatement(sql)) {
        
        stmt.setString(1, uuid.toString());
        stmt.setDouble(2, data.getBalance());
        stmt.setInt(3, data.getLevel());
        stmt.setDouble(4, data.getBalance());
        stmt.setInt(5, data.getLevel());
        
        stmt.executeUpdate();
    } catch (SQLException e) {
        getLogger().log(Level.SEVERE, "Failed to save player: " + uuid, e);
    }
}
```

---

### 5.2 Listener Lifecycle

#### 5.2.1 Registration in onEnable()

**RULE:** Register ALL listeners in `onEnable()`. Store reference for unregistration.

```java
// ✅ CORRECT - Listeners registered in onEnable
public class MyPlugin extends JavaPlugin {
    private PlayerJoinListener playerJoinListener;
    private BlockBreakListener blockBreakListener;
    
    @Override
    public void onEnable() {
        // Initialize managers first
        ConfigManager configManager = new ConfigManager(this);
        PlayerDataManager playerDataManager = new PlayerDataManager(this);
        
        // Register listeners
        playerJoinListener = new PlayerJoinListener(this, playerDataManager);
        blockBreakListener = new BlockBreakListener(this, configManager);
        
        getServer().getPluginManager().registerEvents(playerJoinListener, this);
        getServer().getPluginManager().registerEvents(blockBreakListener, this);
        
        getLogger().info("Listeners registered successfully");
    }
    
    @Override
    public void onDisable() {
        // Unregister listeners
        HandlerList.unregisterAll(this);
        
        getLogger().info("Listeners unregistered");
    }
}
```

---

#### 5.2.2 What Happens Without Unregistration?

**MEMORY LEAK SCENARIO:**

1. Plugin loads → listeners registered
2. `/reload confirm` executed
3. Plugin `onDisable()` runs (but doesn't unregister listeners)
4. Plugin `onEnable()` runs → registers listeners AGAIN
5. **Result:** Two copies of every listener registered

**CONSEQUENCES:**
- Events processed twice
- Commands executed twice
- Memory usage grows with each reload
- Eventually causes server lag or crashes

```java
// ❌ INCORRECT - No unregistration
@Override
public void onDisable() {
    // Missing: HandlerList.unregisterAll(this);
    getLogger().info("Plugin disabled");
}

// After 5 reloads, PlayerJoinEvent fires 5 times per join!
```

---

#### 5.2.3 Dynamic Listener Registration

```java
// ✅ CORRECT - Dynamic listeners unregistered individually
public class ArenaManager {
    private final Map<Arena, ArenaListener> arenaListeners = new HashMap<>();
    
    public void startArena(Arena arena) {
        ArenaListener listener = new ArenaListener(arena);
        Bukkit.getPluginManager().registerEvents(listener, plugin);
        arenaListeners.put(arena, listener);
    }
    
    public void stopArena(Arena arena) {
        ArenaListener listener = arenaListeners.remove(arena);
        if (listener != null) {
            HandlerList.unregisterAll(listener);
        }
    }
    
    public void shutdown() {
        // Unregister all arena listeners
        arenaListeners.values().forEach(HandlerList::unregisterAll);
        arenaListeners.clear();
    }
}
```

---

### 5.3 Task Lifecycle

#### 5.3.1 Storing Task IDs

**RULE:** Store ALL task IDs for cancellation. Never schedule without storing reference.

```java
// ✅ CORRECT - Task ID stored for cancellation
public class CombatTagManager {
    private final Map<UUID, Integer> combatTagTasks = new HashMap<>();
    
    public void tagPlayer(UUID uuid) {
        // Cancel existing tag task if any
        cancelTagTask(uuid);
        
        // Schedule new tag task
        int taskId = Bukkit.getScheduler().runTaskLater(plugin, () -> {
            combatTagTasks.remove(uuid);
            notifyTagExpired(uuid);
        }, 20L * 30).getTaskId(); // 30 seconds
        
        combatTagTasks.put(uuid, taskId);
    }
    
    private void cancelTagTask(UUID uuid) {
        Integer taskId = combatTagTasks.remove(uuid);
        if (taskId != null) {
            Bukkit.getScheduler().cancelTask(taskId);
        }
    }
    
    public void shutdown() {
        // Cancel all tasks
        combatTagTasks.values().forEach(Bukkit.getScheduler()::cancelTask);
        combatTagTasks.clear();
    }
}
```

```java
// ❌ INCORRECT - Task scheduled without storing ID (memory leak)
public void tagPlayer(UUID uuid) {
    Bukkit.getScheduler().runTaskLater(plugin, () -> {
        notifyTagExpired(uuid);
    }, 20L * 30);
    // Lost reference! Can't cancel task if player quits.
}
```

---

#### 5.3.2 Repeating Task Management

```java
// ✅ CORRECT - Repeating task with cancellation
public class AutoSaveManager {
    private int autoSaveTaskId = -1;
    
    public void startAutoSave() {
        if (autoSaveTaskId != -1) {
            getLogger().warning("Auto-save already running");
            return;
        }
        
        long intervalTicks = 20L * 60 * 5; // 5 minutes
        
        autoSaveTaskId = Bukkit.getScheduler().runTaskTimerAsynchronously(
            plugin,
            this::saveAllData,
            intervalTicks,
            intervalTicks
        ).getTaskId();
        
        getLogger().info("Auto-save started (every 5 minutes)");
    }
    
    public void stopAutoSave() {
        if (autoSaveTaskId != -1) {
            Bukkit.getScheduler().cancelTask(autoSaveTaskId);
            autoSaveTaskId = -1;
            getLogger().info("Auto-save stopped");
        }
    }
    
    private void saveAllData() {
        // Save implementation
    }
}
```

---

#### 5.3.3 BukkitRunnable Pattern

```java
// ✅ CORRECT - BukkitRunnable with cancellation
public class CountdownTask extends BukkitRunnable {
    private final Arena arena;
    private int secondsRemaining;
    
    public CountdownTask(Arena arena, int seconds) {
        this.arena = arena;
        this.secondsRemaining = seconds;
    }
    
    @Override
    public void run() {
        if (secondsRemaining == 0) {
            arena.start();
            cancel(); // Important: cancel when done
            return;
        }
        
        arena.broadcast("Game starts in " + secondsRemaining + " seconds");
        secondsRemaining--;
    }
}

// Usage
CountdownTask countdownTask = new CountdownTask(arena, 10);
countdownTask.runTaskTimer(plugin, 0, 20); // Store reference in Arena for cancellation
```

---

### 5.4 Connection & Stream Cleanup

#### 5.4.1 Database Connection Pooling

**RULE:** Use connection pooling (HikariCP) instead of creating connections per query.

```java
// ✅ CORRECT - Connection pooling with HikariCP
public class DatabaseManager {
    private HikariDataSource dataSource;
    
    public void initialize() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:mysql://localhost:3306/minecraft");
        config.setUsername("username");
        config.setPassword("password");
        config.setMaximumPoolSize(10);
        config.setConnectionTimeout(5000);
        
        dataSource = new HikariDataSource(config);
        getLogger().info("Database connection pool initialized");
    }
    
    public Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }
    
    public void shutdown() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
            getLogger().info("Database connection pool closed");
        }
    }
}
```

**Maven Dependency:**
```xml
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.0.1</version>
</dependency>
```

---

## 6. Plugin Lifecycle Discipline

### 6.1 onEnable() — What Belongs, What Doesn't

#### 6.1.1 Correct Initialization Order

**RULE:** Initialize in this order:

1. Configuration loading
2. Database connection
3. Manager initialization
4. Command registration
5. Listener registration
6. API registration
7. Metrics initialization (optional)

```java
// ✅ CORRECT - Proper onEnable() structure
@Override
public void onEnable() {
    getLogger().info("Enabling MyPlugin v" + getDescription().getVersion());
    
    // 1. Load configuration
    saveDefaultConfig();
    ConfigManager configManager = new ConfigManager(this);
    if (!configManager.validate()) {
        getLogger().severe("Invalid configuration. Disabling plugin.");
        getServer().getPluginManager().disablePlugin(this);
        return;
    }
    
    // 2. Initialize database
    DatabaseManager databaseManager = new DatabaseManager(this, configManager);
    try {
        databaseManager.initialize();
    } catch (SQLException e) {
        getLogger().log(Level.SEVERE, "Database initialization failed", e);
        getServer().getPluginManager().disablePlugin(this);
        return;
    }
    
    // 3. Initialize managers
    PlayerDataManager playerDataManager = new PlayerDataManager(this, databaseManager);
    EconomyManager economyManager = new EconomyManager(this);
    
    // 4. Register commands
    registerCommands(playerDataManager, economyManager);
    
    // 5. Register listeners
    registerListeners(playerDataManager, economyManager);
    
    // 6. Initialize API
    MyPluginAPI.initialize(this);
    
    // 7. Metrics (optional)
    if (configManager.isMetricsEnabled()) {
        new Metrics(this, BSTATS_PLUGIN_ID);
    }
    
    getLogger().info("Plugin enabled successfully");
}

private void registerCommands(PlayerDataManager pdm, EconomyManager em) {
    getCommand("home").setExecutor(new CommandHome(this, pdm));
    getCommand("balance").setExecutor(new CommandBalance(this, em));
}

private void registerListeners(PlayerDataManager pdm, EconomyManager em) {
    PluginManager pm = getServer().getPluginManager();
    pm.registerEvents(new PlayerJoinListener(this, pdm), this);
    pm.registerEvents(new PlayerQuitListener(this, pdm), this);
}
```

---

#### 6.1.2 What DOESN'T Belong in onEnable()

```java
// ❌ INCORRECT - Heavy computation in onEnable
@Override
public void onEnable() {
    // Heavy computation blocks server startup
    for (int i = 0; i < 1000000; i++) {
        performExpensiveOperation();
    }
    
    // Network requests block server startup
    String response = makeHttpRequest("https://api.example.com/data");
    
    // Player iteration when worlds might not be loaded
    for (Player player : Bukkit.getOnlinePlayers()) {
        loadPlayerData(player.getUniqueId());
    }
    
    // World manipulation before worlds loaded
    World world = Bukkit.getWorld("world");
    world.setSpawnLocation(0, 64, 0); // May fail if world not loaded
}
```

**SOLUTION:** Defer heavy operations to async tasks or next tick.

```java
// ✅ CORRECT - Defer heavy operations
@Override
public void onEnable() {
    // Configuration, database, basic initialization...
    
    // Defer player data loading to next tick (after worlds loaded)
    Bukkit.getScheduler().runTask(this, () -> {
        for (Player player : Bukkit.getOnlinePlayers()) {
            loadPlayerDataAsync(player.getUniqueId());
        }
    });
    
    // Network requests in async task
    Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
        String response = makeHttpRequest("https://api.example.com/data");
        processResponse(response);
    });
}
```

---

### 6.2 onDisable() — Cleanup Checklist

**RULE:** `onDisable()` must clean up ALL resources in reverse order of initialization.

```java
// ✅ CORRECT - Complete cleanup
@Override
public void onDisable() {
    getLogger().info("Disabling MyPlugin");
    
    // 1. Save all data synchronously
    getLogger().info("Saving player data...");
    playerDataManager.saveAllPlayersSync();
    
    // 2. Cancel all tasks
    getLogger().info("Cancelling scheduled tasks...");
    Bukkit.getScheduler().cancelTasks(this);
    
    // 3. Unregister all listeners
    getLogger().info("Unregistering listeners...");
    HandlerList.unregisterAll(this);
    
    // 4. Close database connections
    getLogger().info("Closing database connections...");
    databaseManager.shutdown();
    
    // 5. Clear caches
    playerDataManager.clearCache();
    
    getLogger().info("Plugin disabled successfully");
}
```

---

#### 6.2.1 Async Save During Shutdown

**PROBLEM:** Async tasks may not complete before server shutdown.

```java
// ❌ INCORRECT - Async save in onDisable (data loss risk)
@Override
public void onDisable() {
    // Server may shut down before this completes!
    Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
        saveAllPlayerData();
    });
}
```

**SOLUTION:** Use synchronous save in `onDisable()`.

```java
// ✅ CORRECT - Synchronous save (blocks until complete)
@Override
public void onDisable() {
    getLogger().info("Saving all player data...");
    
    // Synchronous save - blocks until complete
    for (UUID uuid : playerDataCache.keySet()) {
        try {
            savePlayerDataSync(uuid);
        } catch (Exception e) {
            getLogger().log(Level.SEVERE, "Failed to save player: " + uuid, e);
        }
    }
    
    getLogger().info("All data saved");
}
```

---

### 6.3 onLoad() — When to Use (Rarely)

**RULE:** Use `onLoad()` only for:
- Registering custom world generators
- Registering custom enchantments/potion effects (pre-1.16)
- Early initialization before other plugins load

```java
// ✅ CORRECT - WorldGenerator registration
@Override
public void onLoad() {
    getServer().getWorlds().forEach(world -> {
        world.getPopulators().add(new CustomPopulator());
    });
}
```

**MOST PLUGINS DON'T NEED `onLoad()`** — Use `onEnable()` for 99% of initialization.

---

### 6.4 Reload-Safe Architecture

**RULE:** Assume `/reload` is dangerous. Design to minimize reload impact.

#### 6.4.1 Preventing Listener Duplication

```java
// ✅ CORRECT - Prevent duplicate listener registration
private PlayerJoinListener joinListener;

@Override
public void onEnable() {
    if (joinListener == null) {
        joinListener = new PlayerJoinListener(this);
    }
    getServer().getPluginManager().registerEvents(joinListener, this);
}

@Override
public void onDisable() {
    HandlerList.unregisterAll(this);
}
```

---

#### 6.4.2 Task Cancellation Before Re-scheduling

```java
// ✅ CORRECT - Cancel old task before scheduling new one
private int autoSaveTaskId = -1;

public void reloadConfig() {
    // Cancel existing task
    if (autoSaveTaskId != -1) {
        Bukkit.getScheduler().cancelTask(autoSaveTaskId);
    }
    
    // Reload configuration
    super.reloadConfig();
    
    // Schedule new task with updated interval
    long interval = getConfig().getLong("auto-save-interval", 300) * 20L;
    autoSaveTaskId = Bukkit.getScheduler().runTaskTimerAsynchronously(
        this,
        this::saveAllData,
        interval,
        interval
    ).getTaskId();
}
```

---

## 7. Configuration & Messaging Standards

### 7.1 Type-Safe Config Wrappers

**RULE:** Never access `getConfig()` directly in business logic. Use typed wrapper.

```java
// ✅ CORRECT - Type-safe config wrapper
public class ConfigManager {
    private final MyPlugin plugin;
    private final FileConfiguration config;
    
    // Cached values
    private int maxHomes;
    private long teleportDelay;
    private String welcomeMessage;
    
    public ConfigManager(MyPlugin plugin) {
        this.plugin = plugin;
        this.config = plugin.getConfig();
        loadConfig();
    }
    
    public void loadConfig() {
        maxHomes = config.getInt("max-homes", 5);
        teleportDelay = config.getLong("teleport-delay", 5);
        welcomeMessage = config.getString("messages.welcome", "&aWelcome, {player}!");
        
        validateConfig();
    }
    
    private void validateConfig() {
        if (maxHomes < 1) {
            plugin.getLogger().warning("max-homes must be at least 1, using default: 5");
            maxHomes = 5;
        }
        
        if (teleportDelay < 0) {
            plugin.getLogger().warning("teleport-delay cannot be negative, using 0");
            teleportDelay = 0;
        }
    }
    
    public int getMaxHomes() {
        return maxHomes;
    }
    
    public long getTeleportDelayTicks() {
        return teleportDelay * 20L;
    }
    
    public String getWelcomeMessage(String playerName) {
        return ChatUtils.colorize(welcomeMessage.replace("{player}", playerName));
    }
}
```

**BENEFITS:**
- Type safety at compile time
- Validation at load time
- Default values in one place
- Easy to refactor (change config path, update wrapper only)

---

### 7.2 Message Externalization

**RULE:** Zero hardcoded messages in source code. All messages in config.

#### 7.2.1 Message Configuration Structure

```yaml
# config.yml
messages:
  prefix: '&8[&bMyPlugin&8]&r '
  
  errors:
    no-permission: '{prefix}&cYou do not have permission to use this command.'
    player-not-found: '{prefix}&cPlayer not found: &e{player}'
    insufficient-funds: '{prefix}&cYou need &e${amount}&c to do this.'
    
  success:
    home-set: '{prefix}&aHome &e{name}&a set at your current location.'
    teleported: '{prefix}&aTeleported to &e{location}&a.'
    
  info:
    balance: '{prefix}&7Your balance: &a${balance}'
    homes-list: '{prefix}&7Your homes: &e{homes}'
```

---

#### 7.2.2 Message Manager Implementation

```java
// ✅ CORRECT - Message manager with placeholder support
public class MessageManager {
    private final FileConfiguration config;
    private final String prefix;
    
    public MessageManager(FileConfiguration config) {
        this.config = config;
        this.prefix = getMessage("prefix", "&8[&bPlugin&8]&r ");
    }
    
    private String getMessage(String path, String defaultValue) {
        return config.getString("messages." + path, defaultValue);
    }
    
    public String getErrorMessage(String key) {
        return getMessage("errors." + key, "&cError: " + key);
    }
    
    public String getSuccessMessage(String key) {
        return getMessage("success." + key, "&aSuccess: " + key);
    }
    
    public String format(String message, Map<String, String> placeholders) {
        String formatted = message.replace("{prefix}", prefix);
        
        for (Map.Entry<String, String> entry : placeholders.entrySet()) {
            formatted = formatted.replace("{" + entry.getKey() + "}", entry.getValue());
        }
        
        return ChatUtils.colorize(formatted);
    }
    
    public void sendError(CommandSender sender, String key, Map<String, String> placeholders) {
        sender.sendMessage(format(getErrorMessage(key), placeholders));
    }
    
    public void sendSuccess(CommandSender sender, String key, Map<String, String> placeholders) {
        sender.sendMessage(format(getSuccessMessage(key), placeholders));
    }
}

// Usage
messageManager.sendError(player, "insufficient-funds", 
    Map.of("amount", "1000.00")
);

messageManager.sendSuccess(player, "home-set", 
    Map.of("name", "home1")
);
```

---

### 7.3 Color Code & Component Standards

#### 7.3.1 Legacy Color Codes (ChatColor)

```java
// ✅ CORRECT - Centralized color translation
public final class ChatUtils {
    
    private ChatUtils() { }
    
    public static String colorize(String message) {
        return ChatColor.translateAlternateColorCodes('&', message);
    }
    
    public static void send(CommandSender sender, String message) {
        sender.sendMessage(colorize(message));
    }
    
    public static void broadcast(String message) {
        Bukkit.broadcastMessage(colorize(message));
    }
}
```

---

#### 7.3.2 Modern Adventure Components (Paper 1.16.5+)

```java
// ✅ CORRECT - Adventure Components with MiniMessage
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;

public final class ComponentUtils {
    private static final MiniMessage MINI_MESSAGE = MiniMessage.miniMessage();
    
    private ComponentUtils() { }
    
    public static Component parse(String message) {
        return MINI_MESSAGE.deserialize(message);
    }
    
    public static void send(Audience audience, String message) {
        audience.sendMessage(parse(message));
    }
}

// Usage
ComponentUtils.send(player, "<green>Welcome, <bold>{player}</bold>!");
ComponentUtils.send(player, "<hover:show_text:'<red>Click to teleport'><click:run_command:/home>Go Home</click></hover>");
```

---

### 7.4 Config Validation at Load Time

```java
// ✅ CORRECT - Comprehensive config validation
public class ConfigManager {
    
    public boolean validate() {
        List<String> errors = new ArrayList<>();
        
        // Validate integer ranges
        int maxHomes = config.getInt("max-homes", 5);
        if (maxHomes < 1 || maxHomes > 100) {
            errors.add("max-homes must be between 1 and 100, got: " + maxHomes);
        }
        
        // Validate required strings
        String databaseType = config.getString("database.type");
        if (databaseType == null || (!databaseType.equals("mysql") && !databaseType.equals("sqlite"))) {
            errors.add("database.type must be 'mysql' or 'sqlite', got: " + databaseType);
        }
        
        // Validate MySQL credentials if needed
        if ("mysql".equals(databaseType)) {
            if (config.getString("database.host") == null) {
                errors.add("database.host is required when using MySQL");
            }
            if (config.getString("database.username") == null) {
                errors.add("database.username is required when using MySQL");
            }
        }
        
        // Validate message keys exist
        for (String key : REQUIRED_MESSAGE_KEYS) {
            if (config.getString("messages." + key) == null) {
                errors.add("Missing message key: messages." + key);
            }
        }
        
        // Log errors
        if (!errors.isEmpty()) {
            plugin.getLogger().severe("Configuration validation failed:");
            errors.forEach(error -> plugin.getLogger().severe("  - " + error));
            return false;
        }
        
        plugin.getLogger().info("Configuration validated successfully");
        return true;
    }
    
    private static final List<String> REQUIRED_MESSAGE_KEYS = List.of(
        "prefix",
        "errors.no-permission",
        "errors.player-not-found",
        "success.home-set"
    );
}
```

---

## 8. Common AI Polish Failures

This section catalogs actual AI-generated code deficiencies with corrections.

### 8.1 Formatting Issues

#### 8.1.1 Mixed Indentation

```java
// ❌ AI OUTPUT - Mixes 2-space and 4-space indentation
public class Example {
  private int value; // 2 spaces
    private String name; // 4 spaces
  
  public void method() {
      if (value > 0) { // 4 spaces
        System.out.println(name); // 2 spaces
      }
  }
}
```

```java
// ✅ CORRECTED - Consistent 4-space indentation
public class Example {
    private int value;
    private String name;
    
    public void method() {
        if (value > 0) {
            System.out.println(name);
        }
    }
}
```

> **AI Prevention:** "Use exactly 4 spaces for indentation. Never use tabs. Never use 2 spaces. Ensure consistent indentation throughout the entire file."

---

#### 8.1.2 Extremely Long Lines (200+ characters)

```java
// ❌ AI OUTPUT
player.sendMessage(ChatColor.translateAlternateColorCodes('&', getConfig().getString("messages.welcome").replace("{player}", player.getName()).replace("{balance}", String.valueOf(economy.getBalance(player)))));
```

```java
// ✅ CORRECTED
String welcomeTemplate = getConfig().getString("messages.welcome");
String welcomeMessage = welcomeTemplate
    .replace("{player}", player.getName())
    .replace("{balance}", String.valueOf(economy.getBalance(player)));

player.sendMessage(ChatUtils.colorize(welcomeMessage));
```

> **AI Prevention:** "Keep lines under 120 characters. Break long lines at logical boundaries (method calls, operators). Use intermediate variables for complex expressions."

---

#### 8.1.3 Missing Braces on Single-Line If

```java
// ❌ AI OUTPUT
if (player == null)
    return;

if (balance < cost)
    player.sendMessage("Insufficient funds");
```

```java
// ✅ CORRECTED
if (player == null) {
    return;
}

if (balance < cost) {
    player.sendMessage("Insufficient funds");
}
```

> **AI Prevention:** "Always use braces {} for if-statements, for-loops, and while-loops, even if the body is a single line. Never omit braces."

---

#### 8.1.4 Inconsistent Brace Style

```java
// ❌ AI OUTPUT - Mixes K&R and Allman
public class Example {
    public void method1() {
        // K&R style
    }
    
    public void method2()
    {
        // Allman style
    }
}
```

```java
// ✅ CORRECTED - Consistent K&R style
public class Example {
    public void method1() {
        // Implementation
    }
    
    public void method2() {
        // Implementation
    }
}
```

> **AI Prevention:** "Use K&R brace style: opening brace on same line, closing brace on new line. Never use Allman style (brace on new line)."

---

#### 8.1.5 Missing Spaces Around Operators

```java
// ❌ AI OUTPUT
int result=a+b*c;
if(player!=null&&player.isOnline()){
    balance+=amount;
}
```

```java
// ✅ CORRECTED
int result = a + b * c;
if (player != null && player.isOnline()) {
    balance += amount;
}
```

---

#### 8.1.6 No Blank Lines Between Logical Sections

```java
// ❌ AI OUTPUT
public void method() {
    int a = 1;
    int b = 2;
    int c = a + b;
    player.sendMessage("Result: " + c);
    saveToDatabase(c);
    logAction(player, c);
}
```

```java
// ✅ CORRECTED
public void method() {
    // Calculate result
    int a = 1;
    int b = 2;
    int c = a + b;
    
    // Notify player
    player.sendMessage("Result: " + c);
    
    // Persist data
    saveToDatabase(c);
    logAction(player, c);
}
```

---

#### 8.1.7 Random Import Order

```java
// ❌ AI OUTPUT
import org.bukkit.entity.Player;
import com.example.MyClass;
import java.util.UUID;
import org.bukkit.Bukkit;
import java.util.List;
```

```java
// ✅ CORRECTED
import java.util.List;
import java.util.UUID;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import com.example.MyClass;
```

---

#### 8.1.8 Wildcard Imports in Production

```java
// ❌ AI OUTPUT
import org.bukkit.*;
import org.bukkit.event.*;
import java.util.*;
```

```java
// ✅ CORRECTED
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
```

---

#### 8.1.9 Trailing Whitespace

```java
// ❌ AI OUTPUT (spaces at end of lines, invisible here)
public class Example {   
    private int value;    
}  
```

```java
// ✅ CORRECTED (no trailing whitespace)
public class Example {
    private int value;
}
```

**IDE SETTING:** Enable "Remove trailing whitespace on save"

---

#### 8.1.10 Inconsistent Final Newline

**RULE:** Always end files with single newline character.

**IDE SETTING:** Enable "Ensure newline at end of file"

---

### 8.2 Naming Inconsistencies

#### 8.2.1 Mixed Manager Naming

```java
// ❌ AI OUTPUT
public class PlayerManager { } // manages data
public class EconomyService { } // also manages data
public class ConfigHandler { } // also manages config
```

```java
// ✅ CORRECTED
public class PlayerDataManager { }
public class EconomyManager { }
public class ConfigManager { }
```

---

#### 8.2.2 Inconsistent Variable Names

```java
// ❌ AI OUTPUT
public class Example {
    private FileConfiguration config;
    private FileConfiguration cfg; // Different name, same type
    private FileConfiguration configuration; // Yet another name
}
```

```java
// ✅ CORRECTED
public class Example {
    private FileConfiguration config; // Consistent naming
}
```

---

#### 8.2.3 Hungarian Notation Mixed with Modern Naming

```java
// ❌ AI OUTPUT
private String strPlayerName;
private int playerLevel; // No prefix on this one
private double dblBalance;
```

```java
// ✅ CORRECTED
private String playerName;
private int playerLevel;
private double balance;
```

---

#### 8.2.4 Inconsistent Collection Return Types

```java
// ❌ AI OUTPUT
public List<String> getPlayerNames() { }
public Collection<Player> getOnlinePlayers() { }
public ArrayList<Arena> getArenas() { } // Exposes implementation
```

```java
// ✅ CORRECTED
public List<String> getPlayerNames() { }
public List<Player> getOnlinePlayers() { }
public List<Arena> getArenas() { }
```

---

#### 8.2.5 Constants Not in UPPER_SNAKE_CASE

```java
// ❌ AI OUTPUT
private static final int maxPlayers = 16;
private static final String permissionAdmin = "plugin.admin";
```

```java
// ✅ CORRECTED
private static final int MAX_PLAYERS = 16;
private static final String PERMISSION_ADMIN = "plugin.admin";
```

---

### 8.3 Logic Red Flags

#### 8.3.1 Deep Nesting (6+ Levels)

```java
// ❌ AI OUTPUT
public void processPlayer(Player player) {
    if (player != null) {
        if (player.isOnline()) {
            if (hasPermission(player)) {
                if (hasMoney(player, 100)) {
                    if (isInArena(player)) {
                        if (arenaActive()) {
                            // Finally do something
                        }
                    }
                }
            }
        }
    }
}
```

```java
// ✅ CORRECTED - Early returns
public void processPlayer(Player player) {
    if (player == null || !player.isOnline()) {
        return;
    }
    
    if (!hasPermission(player)) {
        return;
    }
    
    if (!hasMoney(player, 100)) {
        player.sendMessage("Insufficient funds");
        return;
    }
    
    if (!isInArena(player)) {
        return;
    }
    
    if (!arenaActive()) {
        return;
    }
    
    // Do something
}
```

---

#### 8.3.2 Permanent TODO Comments

```java
// ❌ AI OUTPUT
// TODO: Implement this
public void importantFeature() {
    // Empty method shipped to production
}
```

```java
// ✅ CORRECTED
// Either implement it or remove it. Never ship TODOs.
public void importantFeature() {
    // Full implementation
}
```

---

#### 8.3.3 Commented-Out Code

```java
// ❌ AI OUTPUT
public void method() {
    doSomething();
    // doOldThing(); // Old implementation
    // anotherOldThing();
    doNewThing();
}
```

```java
// ✅ CORRECTED
public void method() {
    doSomething();
    doNewThing();
}
// Version control remembers the old code. Delete commented code.
```

---

#### 8.3.4 Magic Numbers

```java
// ❌ AI OUTPUT
@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (args.length < 3) { // What does 3 mean?
        return false;
    }
    
    scheduleTeleport(5); // What does 5 mean?
    return true;
}
```

```java
// ✅ CORRECTED
private static final int REQUIRED_ARGS = 3;
private static final int TELEPORT_DELAY_SECONDS = 5;

@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (args.length < REQUIRED_ARGS) {
        return false;
    }
    
    scheduleTeleport(TELEPORT_DELAY_SECONDS);
    return true;
}
```

---

#### 8.3.5 Unused Variables and Methods

```java
// ❌ AI OUTPUT
public class Example {
    private int unusedField; // Never used
    
    public void activeMethod() {
        int result = calculate();
        // result never used
    }
    
    private void unusedMethod() {
        // Never called
    }
}
```

**SOLUTION:** Enable IDE warnings for unused code. Delete before commit.

---

#### 8.3.6 Catching Generic Exception

```java
// ❌ AI OUTPUT
try {
    database.connect();
} catch (Exception e) { // Too broad
    e.printStackTrace();
}
```

```java
// ✅ CORRECTED
try {
    database.connect();
} catch (SQLException e) {
    getLogger().log(Level.SEVERE, "Database connection failed", e);
}
```

---

#### 8.3.7 Empty Catch Blocks

```java
// ❌ AI OUTPUT
try {
    saveData();
} catch (IOException e) {
    // Silent data loss!
}
```

```java
// ✅ CORRECTED
try {
    saveData();
} catch (IOException e) {
    getLogger().log(Level.SEVERE, "Failed to save data", e);
}
```

---

#### 8.3.8 String Comparison with ==

```java
// ❌ AI OUTPUT
if (args[0] == "home") { // WRONG
    // ...
}
```

```java
// ✅ CORRECTED
if ("home".equals(args[0])) {
    // ...
}
```

---

#### 8.3.9 Public Fields Instead of Getters

```java
// ❌ AI OUTPUT
public class PlayerData {
    public double balance; // Public mutable field
    public int level;
}
```

```java
// ✅ CORRECTED
public class PlayerData {
    private double balance;
    private int level;
    
    public double getBalance() {
        return balance;
    }
    
    public void setBalance(double balance) {
        this.balance = balance;
    }
    
    public int getLevel() {
        return level;
    }
    
    public void setLevel(int level) {
        this.level = level;
    }
}
```

---

#### 8.3.10 Raw Types

```java
// ❌ AI OUTPUT
List players = new ArrayList(); // Raw type
Map data = new HashMap();
```

```java
// ✅ CORRECTED
List<Player> players = new ArrayList<>();
Map<UUID, PlayerData> data = new HashMap<>();
```

---

### 8.4 Performance Style Issues

#### 8.4.1 String Concatenation in Loops

```java
// ❌ AI OUTPUT
String result = "";
for (String name : playerNames) {
    result += name + ", "; // Creates new String each iteration
}
```

```java
// ✅ CORRECTED
StringBuilder result = new StringBuilder();
for (String name : playerNames) {
    result.append(name).append(", ");
}
String finalResult = result.toString();
```

---

#### 8.4.2 Object Creation in Hot Paths

```java
// ❌ AI OUTPUT
@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    // Creates new Location object every move event (very frequent)
    Location spawn = new Location(world, 0, 64, 0);
    if (event.getTo().distance(spawn) < 10) {
        // ...
    }
}
```

```java
// ✅ CORRECTED
private final Location cachedSpawn = new Location(world, 0, 64, 0);

@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    if (event.getTo().distance(cachedSpawn) < 10) {
        // ...
    }
}
```

---

#### 8.4.3 Unnecessary getOnlinePlayers() Array Creation

```java
// ❌ AI OUTPUT
new BukkitRunnable() {
    @Override
    public void run() {
        // Creates new array every tick!
        for (Player player : Bukkit.getOnlinePlayers()) {
            updatePlayerScoreboard(player);
        }
    }
}.runTaskTimer(plugin, 0, 1); // Every tick
```

```java
// ✅ CORRECTED - Cache if update rate is high
private Collection<? extends Player> cachedPlayers = Collections.emptyList();

new BukkitRunnable() {
    @Override
    public void run() {
        cachedPlayers = Bukkit.getOnlinePlayers();
        for (Player player : cachedPlayers) {
            updatePlayerScoreboard(player);
        }
    }
}.runTaskTimer(plugin, 0, 20); // Once per second instead of 20x/sec
```

---

### 8.5 Security Style Issues

#### 8.5.1 SQL Injection via String Concatenation

```java
// ❌ CRITICAL SECURITY FLAW
public PlayerData getPlayerData(String playerName) {
    String sql = "SELECT * FROM players WHERE name = '" + playerName + "'";
    // SQL injection: playerName could be "'; DROP TABLE players; --"
    try (Statement stmt = conn.createStatement();
         ResultSet rs = stmt.executeQuery(sql)) {
        // ...
    }
}
```

```java
// ✅ CORRECTED - Prepared statement
public PlayerData getPlayerData(String playerName) {
    String sql = "SELECT * FROM players WHERE name = ?";
    
    try (PreparedStatement stmt = conn.prepareStatement(sql)) {
        stmt.setString(1, playerName);
        try (ResultSet rs = stmt.executeQuery()) {
            // ...
        }
    }
}
```

---

#### 8.5.2 No Input Validation on Commands

```java
// ❌ AI OUTPUT
@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    int amount = Integer.parseInt(args[0]); // Can throw NumberFormatException
    Player target = Bukkit.getPlayer(args[1]); // Can be null
    
    economy.addMoney(target, amount);
    return true;
}
```

```java
// ✅ CORRECTED
@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (args.length < 2) {
        sender.sendMessage("Usage: /givemoney <amount> <player>");
        return true;
    }
    
    int amount;
    try {
        amount = Integer.parseInt(args[0]);
    } catch (NumberFormatException e) {
        sender.sendMessage("Invalid amount: " + args[0]);
        return true;
    }
    
    if (amount <= 0) {
        sender.sendMessage("Amount must be positive");
        return true;
    }
    
    Player target = Bukkit.getPlayer(args[1]);
    if (target == null) {
        sender.sendMessage("Player not found: " + args[1]);
        return true;
    }
    
    economy.addMoney(target, amount);
    sender.sendMessage("Gave " + amount + " to " + target.getName());
    return true;
}
```

---

## Appendix A: 30-Point Pre-Commit Checklist

Use this checklist before every commit. Print and keep at desk.

### Code Quality
- [ ] All methods under 50 lines (ideally 20-30)
- [ ] No nesting deeper than 3 levels (use early returns)
- [ ] All magic numbers extracted to named constants
- [ ] No commented-out code
- [ ] No TODO/FIXME comments without issue tracker reference

### Naming
- [ ] Class names follow conventions (Manager/Listener/Command/Utils)
- [ ] Method names are verb-first imperative
- [ ] Boolean getters use is/has/can/should prefix
- [ ] Variables use full words (no abbreviations except loops)
- [ ] Constants in UPPER_SNAKE_CASE

### Documentation
- [ ] All public API methods have Javadoc
- [ ] Main class has comprehensive Javadoc
- [ ] Complex algorithms have explanatory comments
- [ ] Comments explain "why", not "what"

### Error Handling
- [ ] No empty catch blocks
- [ ] No generic `catch (Exception e)`
- [ ] No `e.printStackTrace()` calls
- [ ] All exceptions logged with context
- [ ] Checked exceptions for recoverable errors only

### Resources
- [ ] All database connections use try-with-resources
- [ ] All listeners registered in onEnable, unregistered in onDisable
- [ ] All scheduled tasks stored and cancelled in onDisable
- [ ] No resource leaks (streams, connections, files)

### Configuration
- [ ] No hardcoded strings in source code
- [ ] All config access through typed wrapper
- [ ] Config validation at load time
- [ ] All messages externalized to config

### Formatting
- [ ] Consistent 4-space indentation (no tabs)
- [ ] K&R brace style throughout
- [ ] Braces on all if/for/while statements
- [ ] Lines under 120 characters
- [ ] Imports organized and grouped
- [ ] No wildcard imports (except static constants)
- [ ] No trailing whitespace
- [ ] File ends with single newline

### Performance
- [ ] No string concatenation in loops
- [ ] No unnecessary object creation in hot paths
- [ ] Heavy operations async, not in onEnable
- [ ] Database queries use connection pooling

---

## Appendix B: Code Review Red Flags

**Visual scanning guide for quick code review.**

### Instant Rejection (Must Fix)
- Empty catch blocks
- `e.printStackTrace()`
- SQL string concatenation
- Public mutable fields
- Missing `@Override` on overridden methods
- Wildcard imports in production code

### High Priority (Fix Before Merge)
- Methods over 50 lines
- Nesting over 4 levels
- Magic numbers without named constants
- Missing Javadoc on public API
- Inconsistent naming within same file
- No input validation on commands

### Medium Priority (Fix Soon)
- TODO comments without issue reference
- Commented-out code
- Inconsistent indentation
- Lines over 120 characters
- Generic exception catching
- Missing null checks

### Low Priority (Nice to Have)
- Method could be split for clarity
- Variable name could be more descriptive
- Comment could be removed (self-documenting code)
- Config value could be cached

---

## Appendix C: AI Prompt Engineering for Better Output

**Add these phrases to your AI prompts to avoid common issues.**

### Formatting
```
"Use exactly 4 spaces for indentation. Never use tabs. 
Use K&R brace style. Always use braces even for single-line if statements.
Keep lines under 120 characters. Organize imports: java.* first, then external libs, then project packages.
Never use wildcard imports."
```

### Naming
```
"Name the main class exactly as the plugin name without suffix.
Use Manager suffix for stateful coordinators, Service for stateless utilities.
One event per listener class named <Subject><Action>Listener.
Prefix command classes with 'Command'.
Use verb-first imperative method names.
Boolean getters must start with is/has/can/should.
Constants in UPPER_SNAKE_CASE."
```

### Error Handling
```
"Never use empty catch blocks. Always log exceptions with context.
Never use e.printStackTrace() - use getLogger().log() instead.
Never use System.out.println().
Catch specific exceptions, not generic Exception.
Use try-with-resources for all AutoCloseable resources."
```

### Resource Management
```
"Register all listeners in onEnable and unregister in onDisable using HandlerList.unregisterAll().
Store all task IDs and cancel in onDisable using Bukkit.getScheduler().cancelTasks(this).
Use try-with-resources for database connections, statements, and result sets."
```

### Documentation
```
"Add comprehensive Javadoc to all public API methods including @param, @return, @throws.
Document the main class with features, commands, permissions, and dependencies.
Only add comments when explaining 'why', never 'what'."
```

### Configuration
```
"Never hardcode strings or messages in source code. All messages must be in config.yml.
Create a typed ConfigManager wrapper instead of calling getConfig() directly.
Validate all config values at load time with descriptive error messages.
Use default values for all config.getString/getInt/etc calls."
```

### Architecture
```
"Create separate classes for each responsibility (Single Responsibility Principle).
Keep methods under 30 lines. Use early returns instead of deep nesting.
Extract magic numbers to named constants.
Use managers for stateful coordination, utils for stateless functions."
```

---

## Appendix D: Auto-Format Configuration

### IntelliJ IDEA

**Settings → Editor → Code Style → Java:**

**Tabs and Indents:**
- Tab size: 4
- Indent: 4
- Continuation indent: 8
- Use tab character: ❌ UNCHECKED

**Spaces:**
- Before parentheses → Method call parentheses: ❌
- Before parentheses → Method declaration parentheses: ❌
- Around operators → All: ✅

**Wrapping and Braces:**
- Keep when reformatting → Line breaks: ✅
- Braces placement → All: End of line (K&R style)
- Force braces → All: Always

**Imports:**
- Class count to use import with '*': 999
- Names count to use static import with '*': 999
- Import layout:
  1. java.*
  2. javax.*
  3. <blank line>
  4. org.*
  5. <blank line>
  6. com.*
  7. <blank line>
  8. All other imports

**Javadoc:**
- Generate `<p>` on empty lines: ✅
- Keep empty `@param` tags: ❌

**Code Generation:**
- Add `@Override` annotation: ✅

---

### Eclipse

**Window → Preferences → Java → Code Style → Formatter:**

Create new profile "Minecraft Plugin Standard" based on Eclipse built-in.

**Indentation:**
- Tab policy: Spaces only
- Indentation size: 4
- Tab size: 4

**Braces:**
- All: End of line (K&R)

**White Space:**
- Before opening parenthesis → Method invocation: ❌
- Around operators → All: ✅

**Line Wrapping:**
- Maximum line width: 120

**Imports:**
- Number of imports before .*: 999
- Number of static imports before .*: 999

---

### VSCode

**settings.json:**

```json
{
  "editor.tabSize": 4,
  "editor.insertSpaces": true,
  "editor.detectIndentation": false,
  "editor.rulers": [120],
  "editor.formatOnSave": true,
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  
  "java.format.settings.url": "https://raw.githubusercontent.com/google/styleguide/gh-pages/eclipse-java-google-style.xml",
  
  "java.imports.gradle.wrapper.checksums": [{
    "sha256": "...",
    "allowed": true
  }]
}
```

---

## Conclusion

This guide represents production-ready standards for Minecraft plugin development. Adherence to these standards ensures:

- **Consistency** across development team
- **Maintainability** for long-term projects
- **Performance** through best practices
- **Security** via input validation and proper resource management
- **Professionalism** in code delivered to clients

**Remember:** These standards are not suggestions—they are requirements for production code. Code reviews should reject PRs that violate these standards.

**When in doubt:** Refer to this guide. If a situation isn't covered, follow the principle: "Code should be self-documenting, readable by humans, and maintainable for years."

---

**Document Version:** 2.0  
**Last Updated:** 2024  
**Maintained By:** dibliomorgans  
**License:** CC BY-SA 4.0

---

## Quick Reference Card

**Print this page and keep it visible while coding.**

### The Big 5 Rules
1. **No empty catch blocks** — Always log exceptions
2. **No magic numbers** — Extract to named constants
3. **No deep nesting** — Use early returns
4. **No hardcoded strings** — Externalize to config
5. **Always unregister resources** — Listeners, tasks, connections

### Naming Quick Guide
- Main class: `MyPlugin` (no suffix)
- Managers: `PlayerDataManager`, `ConfigManager`
- Listeners: `PlayerJoinListener` (one event per class)
- Commands: `CommandHome`, `CommandWarp`
- Utils: `ChatUtils`, `LocationUtils` (final, private constructor)

### Method Length Targets
- Event handlers: 15-20 lines
- Command executors: 10-15 lines (routing only)
- Business logic: 20-30 lines
- Maximum: 50 lines (hard limit)

### Indentation
- 4 spaces (never tabs)
- K&R braces (opening on same line)
- Always use braces (even single-line if)
- Max line length: 120 characters

### Error Handling
- ❌ `e.printStackTrace()`
- ✅ `getLogger().log(Level.SEVERE, "message", e)`
- ❌ `catch (Exception e)`
- ✅ `catch (SQLException e)`
- ❌ Empty catch
- ✅ At minimum: log the exception

### Resource Management
```java
// ✅ ALWAYS
try (Connection conn = getConnection()) {
    // Use connection
}

// ✅ ALWAYS
@Override
public void onDisable() {
    HandlerList.unregisterAll(this);
    Bukkit.getScheduler().cancelTasks(this);
}
```

---

**END OF DOCUMENT**
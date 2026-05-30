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
8. [Common AI Polish Failures](#8-common-ai-polish-failures-30-examples)
9. [Appendix A: 30-Point Pre-Commit Checklist](#appendix-a-30-point-pre-commit-checklist)
10. [Appendix B: Code Review Red Flags](#appendix-b-code-review-red-flags-visual-scanning-guide)
11. [Appendix C: AI Prompt Engineering Phrases](#appendix-c-ai-prompt-engineering-phrases-for-better-output)
12. [Appendix D: Auto-Format Configuration](#appendix-d-auto-format-configuration)

---

## 1. Naming Conventions

Naming is the single highest-leverage quality investment in any codebase. A well-named class or method communicates intent without requiring the reader to open the implementation. Poor naming forces every reviewer, every future maintainer, and every AI tool to guess — and guessing introduces bugs.

---

### 1.1 Class Naming Strategy

#### Main Plugin Class

**Rule:** The main class should be named exactly after the plugin, in PascalCase, with no suffix.

| Pattern | Verdict | Reason |
|---|---|---|
| `MyPlugin` | ✅ Correct | Clean, unambiguous, matches plugin name |
| `MyPluginPlugin` | ❌ Wrong | Redundant suffix, reads awkwardly |
| `MyPluginMain` | ❌ Wrong | "Main" is an implementation detail, not a concept |
| `Main` | ❌ Wrong | Completely non-descriptive, conflicts with Java convention |
| `PluginCore` | ❌ Wrong | Vague, doesn't identify the plugin |

**Why it matters:** The main class is the entry point that other plugins reference via `JavaPlugin.getPlugin(MyPlugin.class)`. If it's named `MyPluginMain`, every external reference looks like `JavaPlugin.getPlugin(MyPluginMain.class)` — which is confusing and inconsistent with the plugin's identity.

**Common AI mistake:**
```java
// AI often generates this
public class MyPluginMain extends JavaPlugin {
    private static MyPluginMain instance;
```

**Corrected version:**
```java
// Correct
public class MyPlugin extends JavaPlugin {
    private static MyPlugin instance;
```

**Edge case:** If your plugin name is a reserved Java keyword or conflicts with a Bukkit class (unlikely but possible), append `Plugin` as a last resort. Document why.

---

#### Manager Classes

**Rule:** Use the `Manager` suffix for classes that own and coordinate a domain's lifecycle. Use `Service` for stateless operation classes. Use `Repository` for data access classes.

| Suffix | When to Use | Example |
|---|---|---|
| `Manager` | Owns lifecycle, holds state, coordinates subsystems | `PlayerDataManager`, `ArenaManager` |
| `Service` | Stateless operations, business logic, no lifecycle | `EconomyService`, `PermissionService` |
| `Repository` | Data access only — reads/writes to storage | `PlayerRepository`, `ShopRepository` |
| `Handler` | Processes a single type of event or request | `ChatHandler`, `PaymentHandler` |
| `Factory` | Creates instances of complex objects | `ItemFactory`, `ArenaFactory` |

**Why it matters:** When a class is named `PlayerManager`, a reviewer immediately knows it holds a `Map<UUID, PlayerData>` and has `load()`, `save()`, `get()`, and `remove()` methods. When it's named `PlayerUtils`, the reviewer has no idea what to expect.

**Common AI mistake:**
```java
// AI conflates all three concepts into one class
public class PlayerUtils {
    private Map<UUID, PlayerData> players = new HashMap<>();
    
    public void saveToDatabase(PlayerData data) { ... }
    public PlayerData loadFromDatabase(UUID uuid) { ... }
    public void giveReward(Player player) { ... }
    public String formatName(Player player) { ... }
}
```

**Corrected version:**
```java
// Split by responsibility
public class PlayerDataManager {          // owns lifecycle
    private final Map<UUID, PlayerData> cache = new HashMap<>();
}

public class PlayerRepository {           // data access only
    public void save(PlayerData data) { ... }
    public PlayerData load(UUID uuid) { ... }
}

public class PlayerService {              // business logic
    public void giveReward(Player player) { ... }
}

public class PlayerFormatter {            // pure utility
    public static String formatName(Player player) { ... }
}
```

---

#### Listener Classes

**Rule:** Name listeners after the domain they cover, not the specific event. Group related events into one listener class.

| Pattern | Verdict | Reason |
|---|---|---|
| `PlayerJoinListener` | ⚠️ Acceptable for small plugins | Fine if only one join-related event |
| `PlayerListener` | ✅ Preferred | Groups all player-related events |
| `CombatListener` | ✅ Preferred | Groups all combat events |
| `EventListener` | ❌ Wrong | Completely non-descriptive |
| `Listeners` | ❌ Wrong | Plural class names are a code smell |

**Why it matters:** If you have `PlayerJoinListener`, `PlayerQuitListener`, `PlayerMoveListener`, and `PlayerChatListener` as four separate classes, you have four files to open to understand player behavior. Group them into `PlayerListener` and the domain is self-contained.

**Exception:** If a listener class exceeds ~150 lines, split it. A `CombatListener` handling 15 different combat events is too large — split into `MeleeCombatListener` and `ProjectileCombatListener`.

**Common AI mistake:**
```java
// AI creates one listener per event
public class OnPlayerJoinListener implements Listener { ... }
public class OnPlayerQuitListener implements Listener { ... }
public class OnPlayerDeathListener implements Listener { ... }
```

**Corrected version:**
```java
// Group by domain
public class PlayerLifecycleListener implements Listener {
    @EventHandler public void onJoin(PlayerJoinEvent event) { ... }
    @EventHandler public void onQuit(PlayerQuitEvent event) { ... }
    @EventHandler public void onDeath(PlayerDeathEvent event) { ... }
}
```

---

#### Command Classes

**Rule:** Use the `Command` suffix, not prefix. Name after the command's action.

| Pattern | Verdict | Reason |
|---|---|---|
| `ReloadCommand` | ✅ Correct | Noun-first, action-second, sorts alphabetically by domain |
| `HomeCommand` | ✅ Correct | Clear, concise |
| `CommandReload` | ❌ Wrong | Prefix convention makes alphabetical sorting useless |
| `ReloadCmd` | ❌ Wrong | Abbreviations reduce readability |
| `ReloadCommandExecutor` | ❌ Wrong | Redundant — it's obviously an executor |

**Why it matters:** In a plugin with 20 commands, `Command`-prefixed classes sort as `CommandBan`, `CommandHome`, `CommandKick` — all together, not grouped by domain. `BanCommand`, `HomeCommand`, `KickCommand` sort by domain, which is how developers think about them.

**Common AI mistake:**
```java
public class CommandHandler implements CommandExecutor {
    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (cmd.getName().equalsIgnoreCase("home")) { ... }
        if (cmd.getName().equalsIgnoreCase("sethome")) { ... }
        if (cmd.getName().equalsIgnoreCase("delhome")) { ... }
        // 300 more lines
    }
}
```

**Corrected version:**
```java
// One class per command
public class HomeCommand implements CommandExecutor {
    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) { ... }
}

public class SetHomeCommand implements CommandExecutor { ... }
public class DeleteHomeCommand implements CommandExecutor { ... }
```

---

#### Utility Classes

**Rule:** Static utility classes are acceptable only when the methods are truly stateless, domain-agnostic, and reusable across the entire plugin. Name them `[Domain]Utils` or `[Domain]Helper`.

| Pattern | Verdict | Reason |
|---|---|---|
| `StringUtils` | ✅ Correct | Domain-specific, clear scope |
| `ItemUtils` | ✅ Correct | Clear what it operates on |
| `Utils` | ❌ Wrong | Becomes a dumping ground for everything |
| `PluginUtils` | ❌ Wrong | "Plugin" is too broad — what kind of utility? |
| `Helper` | ❌ Wrong | Same problem as `Utils` |
| `Misc` | ❌ Wrong | Never acceptable |

**Why it matters:** A class named `Utils` in a mature plugin typically contains 50+ unrelated static methods. It's impossible to find anything, impossible to test, and impossible to refactor. Domain-specific utility classes stay small and focused.

**When a utility class is NOT acceptable:** If the utility method needs access to plugin state (config, managers, database), it's not a utility — it's a service. Inject it properly.

---

#### API Classes

**Rule:** Name API classes `[PluginName]API` and make them the single public surface for external plugin integration.

```java
// Correct — single entry point for external plugins
public class MyPluginAPI {
    private static MyPluginAPI instance;
    
    public static MyPluginAPI getInstance() { return instance; }
    
    public int getPlayerTokens(UUID playerId) { ... }
    public void addTokens(UUID playerId, int amount) { ... }
}
```

**Why it matters:** Without a dedicated API class, other plugins reach into your internals (`MyPlugin.getInstance().getPlayerManager().getCache().get(uuid)`). This creates tight coupling that breaks every time you refactor.

---

#### Exception Classes

**Rule:** Name exceptions `[Domain]Exception` and extend `RuntimeException` for plugin-internal errors.

```java
public class PluginException extends RuntimeException {
    public PluginException(String message) { super(message); }
    public PluginException(String message, Throwable cause) { super(message, cause); }
}

public class DatabaseException extends PluginException {
    public DatabaseException(String message, Throwable cause) { super(message, cause); }
}

public class ConfigurationException extends PluginException {
    public ConfigurationException(String key, String reason) {
        super("Invalid configuration at '" + key + "': " + reason);
    }
}
```

---

### 1.2 Method Naming Patterns

#### Event Handlers

**Rule:** Always use `on` + PascalCase event name. Never use `handle`, `process`, or the bare event name.

| Pattern | Verdict | Reason |
|---|---|---|
| `onPlayerJoin(PlayerJoinEvent event)` | ✅ Correct | Standard Bukkit convention, immediately recognizable |
| `handleJoin(PlayerJoinEvent event)` | ❌ Wrong | "handle" implies routing logic, not direct handling |
| `playerJoin(PlayerJoinEvent event)` | ❌ Wrong | Looks like a regular method, not an event handler |
| `onJoin(PlayerJoinEvent event)` | ⚠️ Acceptable | Shorter, but loses the "Player" context |

**Why it matters:** When scanning a class for event handlers, `on` prefix + `@EventHandler` annotation creates a consistent visual pattern. Mixing `handle`, `process`, and `on` forces the reader to check every method signature.

**Common AI mistake:**
```java
@EventHandler
public void handlePlayerJoinEvent(PlayerJoinEvent e) {
    // "Event" suffix is redundant — the parameter type already says it
    // "e" as parameter name loses context in longer methods
}
```

**Corrected version:**
```java
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    // Full parameter name, no redundant "Event" suffix
}
```

---

#### Boolean Getters

**Rule:** Use the correct prefix based on what the boolean represents.

| Prefix | When to Use | Example |
|---|---|---|
| `is` | State or condition | `isEnabled()`, `isOnline()`, `isVanished()` |
| `has` | Possession or existence | `hasPermission()`, `hasData()`, `hasHome()` |
| `can` | Capability or permission | `canBuild()`, `canTeleport()`, `canBypass()` |
| `should` | Decision/policy | `shouldNotify()`, `shouldSave()` |
| `was` | Past state | `wasKicked()`, `wasOnline()` |

**Common AI mistake:**
```java
public boolean getEnabled() { return enabled; }      // Wrong — not a getter for a boolean
public boolean checkPermission() { return ...; }     // Wrong — "check" implies side effects
public boolean playerOnline() { return ...; }        // Wrong — missing prefix entirely
```

**Corrected version:**
```java
public boolean isEnabled() { return enabled; }
public boolean hasPermission(String node) { return ...; }
public boolean isOnline() { return ...; }
```

---

#### Action Methods

**Rule:** Action methods use verb-first imperative naming. The verb describes what the method DOES, not what it IS.

| Pattern | Verdict | Reason |
|---|---|---|
| `loadConfig()` | ✅ Correct | Verb-first, imperative |
| `savePlayerData(PlayerData data)` | ✅ Correct | Clear action + subject |
| `configLoad()` | ❌ Wrong | Noun-first reads like a property, not an action |
| `initializeConfig()` | ⚠️ Acceptable | Longer but acceptable for setup methods |
| `doSave()` | ❌ Wrong | "do" prefix is meaningless |
| `performSave()` | ❌ Wrong | "perform" is redundant |

**Async method naming:**
```java
// Clearly signals async nature — callers know not to expect immediate results
public CompletableFuture<PlayerData> loadPlayerDataAsync(UUID playerId) { ... }
public void savePlayerDataAsync(PlayerData data, Runnable callback) { ... }
```

**Callback method naming:**
```java
// "on" prefix for callbacks signals "this is called when X happens"
private void onDataLoaded(PlayerData data) { ... }
private void onSaveFailed(Exception cause) { ... }
```

---

#### Command Executor Methods

**Rule:** Always override `onCommand()` — never rename it. For subcommand routing, delegate to private methods named after the subcommand.

```java
public class HomeCommand implements CommandExecutor {
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("This command is player-only.");
            return true;
        }
        if (args.length == 0) {
            return teleportHome(player);
        }
        return switch (args[0].toLowerCase()) {
            case "set"    -> setHome(player, args);
            case "delete" -> deleteHome(player, args);
            case "list"   -> listHomes(player);
            default       -> sendUsage(player);
        };
    }
    
    private boolean teleportHome(Player player) { ... }
    private boolean setHome(Player player, String[] args) { ... }
    private boolean deleteHome(Player player, String[] args) { ... }
    private boolean listHomes(Player player) { ... }
    private boolean sendUsage(Player player) { ... }
}
```

---

### 1.3 Variable & Field Naming

#### Plugin Instance Field

**Rule:** Name the static instance field `instance`. Never use `pl`, `plugin`, or abbreviations.

| Pattern | Verdict | Reason |
|---|---|---|
| `instance` | ✅ Correct | Standard singleton pattern naming |
| `plugin` | ⚠️ Acceptable | Common in tutorials, but ambiguous in multi-plugin contexts |
| `pl` | ❌ Wrong | Abbreviation with no meaning |
| `INSTANCE` | ❌ Wrong | UPPER_SNAKE_CASE is for constants, not mutable singletons |

```java
public class MyPlugin extends JavaPlugin {
    private static MyPlugin instance;
    
    public static MyPlugin getInstance() {
        return instance;
    }
    
    @Override
    public void onEnable() {
        instance = this;
    }
}
```

> **Warning:** Avoid the singleton pattern entirely when possible. Pass the plugin instance via constructor injection instead. Singletons make testing impossible and create hidden dependencies.

---

#### Logger Field

**Rule:** Use `getLogger()` from `JavaPlugin` directly. Do not create a separate logger field unless you need a named logger.

```java
// Correct — use inherited getLogger()
getLogger().info("Plugin enabled.");

// Acceptable — named logger for filtering
private static final Logger LOGGER = Logger.getLogger("MyPlugin");

// Wrong — redundant field
private Logger logger = getLogger();  // just call getLogger() directly
```

**Why `LOGGER` is UPPER_SNAKE_CASE:** It's a `static final` constant. All `static final` fields follow UPPER_SNAKE_CASE regardless of type.

---

#### Config Fields

**Rule:** Name config wrapper fields `config` if there's one, or `[domain]Config` if there are multiple.

```java
// Single config
private ConfigManager config;

// Multiple configs
private MainConfig mainConfig;
private MessagesConfig messagesConfig;
private DatabaseConfig databaseConfig;
```

**Never use:**
```java
private FileConfiguration cfg;           // abbreviation
private YamlConfiguration configuration; // implementation type as field name
private FileConfiguration pluginConfig;  // redundant "plugin" prefix
```

---

#### Player Cache Fields

**Rule:** Name caches after what they store, not how they store it.

```java
// Correct — describes the content
private final Map<UUID, PlayerData> playerDataCache = new HashMap<>();
private final Map<UUID, Long> lastLoginTimes = new HashMap<>();
private final Set<UUID> vanishedPlayers = new HashSet<>();

// Wrong — describes the structure, not the content
private final Map<UUID, PlayerData> dataMap = new HashMap<>();
private final HashMap<UUID, Long> hashMap = new HashMap<>();
private final Map<UUID, PlayerData> cache = new HashMap<>();  // too generic
```

---

#### Constants

**Rule:** All `static final` fields that represent fixed values use UPPER_SNAKE_CASE.

```java
// Correct
private static final int MAX_HOMES = 10;
private static final long TELEPORT_DELAY_TICKS = 60L;
private static final String PERMISSION_BYPASS = "myplugin.bypass";
private static final String CHAT_FORMAT = "&7[&b%player%&7] &f%message%";

// Wrong
private static final int maxHomes = 10;              // camelCase for constant
private static final int MAX_HOMES_ALLOWED = 10;     // redundant "ALLOWED"
private static int MAX_HOMES = 10;                   // not final — not a constant
```

**Exception:** `static final Logger` and `static final Plugin` fields are constants by convention but sometimes written in camelCase in older codebases. Prefer UPPER_SNAKE_CASE for all `static final` fields.

---

#### Private Fields

**Rule:** Use camelCase. No underscores, no Hungarian notation, no prefixes.

```java
// Correct
private int tokenBalance;
private boolean isEnabled;
private PlayerData playerData;

// Wrong — Hungarian notation (type prefix)
private int intTokenBalance;
private boolean bIsEnabled;
private String strPlayerName;

// Wrong — underscore prefix (C++ convention, not Java)
private int _tokenBalance;
private boolean _isEnabled;
```

**Why Hungarian notation is banned:** Modern IDEs show types on hover. Encoding the type in the name creates maintenance burden — when you change `int` to `long`, you must rename the field everywhere.

---

### 1.4 Constants & Enums

**Rule:** Enum values use UPPER_SNAKE_CASE. Enum class names use PascalCase.

```java
public enum ArenaState {
    WAITING,
    STARTING,
    IN_PROGRESS,
    ENDING,
    RESETTING;
    
    public boolean isActive() {
        return this == IN_PROGRESS || this == STARTING;
    }
}
```

**Rule:** Prefer enums over `static final String` or `static final int` constants when the values form a closed set.

```java
// Wrong — magic strings
private static final String STATE_WAITING = "waiting";
private static final String STATE_ACTIVE = "active";

// Correct — enum
public enum GameState { WAITING, ACTIVE, ENDED }
```

---

### 1.5 Package Naming Rules

**Rule:** All package names are lowercase, dot-separated, and follow the reverse-domain convention.

```
com.yourname.pluginname              ← root package
com.yourname.pluginname.command      ← command executors
com.yourname.pluginname.listener     ← event listeners
com.yourname.pluginname.manager      ← manager classes
com.yourname.pluginname.model        ← data model classes (PlayerData, etc.)
com.yourname.pluginname.repository   ← data access classes
com.yourname.pluginname.util         ← utility classes
com.yourname.pluginname.config       ← config wrappers
com.yourname.pluginname.gui          ← inventory GUIs
com.yourname.pluginname.api          ← public API surface
```

**Never:**
- `com.yourname.PluginName` — uppercase in package name
- `com.yourname.pluginname.Commands` — plural package names
- `com.yourname.pluginname.misc` — catch-all packages
- `com.yourname.pluginname.stuff` — non-descriptive packages

---

## 2. Code Organization & Readability

---

### 2.1 The 50-Line Method Rule

**Rule:** No method body should exceed 50 lines. If it does, extract sub-methods.

This is not an arbitrary limit. A method that fits on one screen can be understood without scrolling. A method that requires scrolling forces the reader to hold context in working memory — and working memory is finite.

**Thresholds by method type:**

| Method Type | Recommended Max | Hard Limit |
|---|---|---|
| Event handler | 20 lines | 30 lines |
| `onCommand()` router | 15 lines | 20 lines |
| Subcommand handler | 25 lines | 40 lines |
| `onEnable()` | 30 lines | 50 lines |
| Business logic method | 30 lines | 50 lines |
| Data transformation | 20 lines | 30 lines |

**Refactoring pattern — Extract Method:**

```java
// BAD — 80-line onCommand() doing everything
@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (!(sender instanceof Player)) {
        sender.sendMessage(ChatColor.RED + "Only players can use this command.");
        return true;
    }
    Player player = (Player) sender;
    if (!player.hasPermission("myplugin.home")) {
        player.sendMessage(ChatColor.RED + "You don't have permission.");
        return true;
    }
    if (args.length == 0) {
        // 40 lines of teleport logic inline
        String homeName = "default";
        PlayerData data = plugin.getPlayerDataManager().getData(player.getUniqueId());
        if (data == null) {
            player.sendMessage(ChatColor.RED + "No data found.");
            return true;
        }
        Location home = data.getHome(homeName);
        if (home == null) {
            player.sendMessage(ChatColor.RED + "You don't have a home set.");
            return true;
        }
        // teleport delay logic...
        // warmup logic...
        // combat check logic...
        // 30 more lines
    }
    return true;
}
```

```java
// GOOD — onCommand() is a router, each action is its own method
@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (!(sender instanceof Player player)) {
        sender.sendMessage(ChatColor.RED + "Only players can use this command.");
        return true;
    }
    if (!player.hasPermission("myplugin.home")) {
        player.sendMessage(ChatColor.RED + "You don't have permission.");
        return true;
    }
    String subcommand = args.length > 0 ? args[0].toLowerCase() : "go";
    return switch (subcommand) {
        case "go", "tp" -> teleportToHome(player, args);
        case "set"      -> setHome(player, args);
        case "delete"   -> deleteHome(player, args);
        case "list"     -> listHomes(player);
        default         -> sendUsage(player);
    };
}

private boolean teleportToHome(Player player, String[] args) {
    String homeName = args.length > 1 ? args[1] : "default";
    PlayerData data = playerDataManager.getData(player.getUniqueId());
    if (data == null) return sendError(player, "No data found.");
    Location home = data.getHome(homeName);
    if (home == null) return sendError(player, "Home '" + homeName + "' not found.");
    scheduleTeleport(player, home);
    return true;
}
```

**Refactoring pattern — Extract Class:**

When a method group within a class all operate on the same sub-domain, extract them into their own class.

```java
// BAD — ArenaManager has 400 lines because it handles scoring inline
public class ArenaManager {
    public void addKill(Player player) { ... }
    public void addDeath(Player player) { ... }
    public int getKills(Player player) { ... }
    public int getDeaths(Player player) { ... }
    public double getKDR(Player player) { ... }
    public void broadcastScoreboard() { ... }
    // ... 300 more lines of arena logic
}

// GOOD — scoring extracted to its own class
public class ArenaScoreTracker {
    private final Map<UUID, Integer> kills = new HashMap<>();
    private final Map<UUID, Integer> deaths = new HashMap<>();
    
    public void recordKill(UUID playerId) { kills.merge(playerId, 1, Integer::sum); }
    public void recordDeath(UUID playerId) { deaths.merge(playerId, 1, Integer::sum); }
    public int getKills(UUID playerId) { return kills.getOrDefault(playerId, 0); }
    public double getKDR(UUID playerId) {
        int d = deaths.getOrDefault(playerId, 0);
        return d == 0 ? kills.getOrDefault(playerId, 0) : (double) getKills(playerId) / d;
    }
}
```

---

### 2.2 Import Organization & Wildcard Policy

**Rule:** Organize imports in this order, with a blank line between groups:

```java
// Group 1: Java standard library
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// Group 2: Bukkit / Paper API
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

// Group 3: External libraries (XSeries, HikariCP, etc.)
import com.cryptomorin.xseries.XMaterial;
import com.zaxxer.hikari.HikariDataSource;

// Group 4: Internal project classes
import com.yourname.myplugin.manager.PlayerDataManager;
import com.yourname.myplugin.model.PlayerData;
```

**Wildcard imports — the verdict:**

> **Warning:** Wildcard imports (`import org.bukkit.*`) are **banned in production code**. They hide what you're actually using, cause ambiguity when two packages export the same class name, and make it impossible to grep for usages of a specific class.

```java
// BANNED
import org.bukkit.*;
import org.bukkit.event.*;
import java.util.*;

// CORRECT — explicit imports only
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
```

**Exception:** Static imports for `ChatColor` constants are acceptable in files that use many color codes, but only if the team agrees on this convention consistently.

```java
// Acceptable if used consistently
import static org.bukkit.ChatColor.*;
// Then: RED + "Error message" instead of ChatColor.RED + "Error message"
```

**Unused imports:** Zero tolerance. Configure your IDE to flag unused imports as errors, not warnings. Unused imports are noise that obscures real dependencies.

---

### 2.3 Annotation Discipline

#### `@Override`

**Rule:** Always use `@Override` when overriding a superclass method or implementing an interface method. No exceptions.

```java
// WRONG — missing @Override
public void onEnable() { ... }
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) { ... }
public void onClick(InventoryClickEvent event) { ... }

// CORRECT
@Override
public void onEnable() { ... }

@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) { ... }
```

**Why it matters:** `@Override` causes a compile error if the method signature doesn't match the parent. Without it, a typo in the method name silently creates a new method instead of overriding — and your code never runs.

#### `@EventHandler`

**Rule:** Place `@EventHandler` on its own line, directly above the method. Include `priority` only when you have a specific reason.

```java
// Correct — default priority, no annotation parameters needed
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) { ... }

// Correct — explicit priority with reason documented
@EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
public void onPlayerDamage(EntityDamageEvent event) { ... }

// Wrong — priority without reason
@EventHandler(priority = EventPriority.LOWEST)
public void onPlayerMove(PlayerMoveEvent event) { ... }
```

**`ignoreCancelled = true`:** Use this on any handler that should not process events already cancelled by another plugin. Forgetting this is a common source of double-processing bugs.

#### `@Nullable` / `@NotNull`

**Rule:** Use JetBrains annotations (`org.jetbrains.annotations`) for IDE support. Apply to all public API method parameters and return types.

```java
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class PlayerDataManager {
    
    @Nullable
    public PlayerData getData(@NotNull UUID playerId) {
        return playerDataCache.get(playerId);
    }
    
    public void saveData(@NotNull PlayerData data) {
        // @NotNull means callers know not to pass null
    }
}
```

#### `@Deprecated`

**Rule:** Always pair `@Deprecated` with a Javadoc `@deprecated` tag explaining the replacement.

```java
/**
 * @deprecated Use {@link #getPlayerData(UUID)} instead.
 *             This method will be removed in version 2.0.
 */
@Deprecated
public PlayerData getPlayer(UUID uuid) {
    return getPlayerData(uuid);
}
```

#### `@SuppressWarnings`

**Rule:** Only use `@SuppressWarnings` when you have verified the warning is a false positive and you can explain why in a comment.

```java
// Acceptable — unchecked cast is verified safe by the surrounding logic
@SuppressWarnings("unchecked")
private <T> T deserialize(Object raw) {
    // Safe: all values in this map are stored as T by the put() method above
    return (T) raw;
}

// NOT acceptable — suppressing to avoid fixing the real problem
@SuppressWarnings("all")  // BANNED
public void messyMethod() { ... }
```

---

### 2.4 Brace Style & Indentation

**Rule:** Use Egyptian braces (opening brace on same line) consistently throughout the entire project. 4-space indentation. No tabs.

```java
// CORRECT — Egyptian braces, 4-space indent
public class MyClass {
    
    public void myMethod() {
        if (condition) {
            doSomething();
        } else {
            doSomethingElse();
        }
    }
}

// WRONG — Allman style (braces on new line)
public class MyClass
{
    public void myMethod()
    {
        if (condition)
        {
            doSomething();
        }
    }
}
```

**Rule:** ALWAYS use braces, even for single-line if statements.

```java
// WRONG — brace-less single-line if
if (player == null) return;
if (args.length == 0)
    sendUsage(player);

// CORRECT — always braced
if (player == null) {
    return;
}
if (args.length == 0) {
    sendUsage(player);
}
```

**Why it matters:** The infamous Apple SSL bug (`goto fail;`) was caused by a brace-less if statement. One extra line of code added without braces silently changed control flow. Always use braces.

**Exception:** The single-line early return `if (x == null) return;` is widely accepted in the Bukkit community for guard clauses. If your team allows it, document the exception explicitly and apply it consistently.

---

### 2.5 Single Responsibility Principle for Classes

**Rule:** Every class has exactly one reason to change. If you can describe a class's purpose with "and", it violates SRP.

```
"PlayerDataManager manages player data AND sends messages AND handles database connections"
→ Three responsibilities → Three classes
```

**Practical plugin examples:**

| Violation | Fix |
|---|---|
| `PlayerManager` that loads data, saves data, AND sends welcome messages | Split: `PlayerRepository` (data), `PlayerWelcomeService` (messages) |
| `ArenaListener` that handles events AND manages arena state | Split: `ArenaListener` (events), `ArenaManager` (state) |
| `Config` class that reads config AND validates it AND provides defaults | Split: `ConfigLoader` (reads), `ConfigValidator` (validates), `ConfigDefaults` (defaults) |
| `DatabaseManager` that manages connections AND executes queries AND maps results | Split: `ConnectionPool` (connections), `QueryExecutor` (queries), `ResultMapper` (mapping) |

---

## 3. Documentation Standards

---

### 3.1 Javadoc Requirements (MUST vs SHOULD vs OPTIONAL)

#### MUST Document

These items require Javadoc. No exceptions. A pull request missing these will be rejected.

- **All public API methods** — anything callable by other plugins
- **All public constructors** with non-obvious parameters
- **All manager classes** — class-level Javadoc explaining what the manager owns
- **All command classes** — what command, what permissions, what arguments
- **All event handlers** with non-obvious side effects
- **All configuration keys** — what they control, valid values, defaults
- **All custom exceptions** — when they're thrown and why

```java
/**
 * Manages player home locations, including storage, retrieval, and teleportation.
 *
 * <p>Homes are loaded from the database on player join and saved on player quit.
 * The maximum number of homes per player is controlled by the
 * {@code homes.max-per-player} configuration key.</p>
 *
 * @see PlayerData
 * @see HomeRepository
 */
public class HomeManager {
    
    /**
     * Teleports the player to their named home after the configured warmup delay.
     *
     * <p>Teleportation is cancelled if the player moves or takes damage during warmup.
     * The player must not be in combat (see {@link CombatManager#isInCombat(UUID)}).</p>
     *
     * @param player   the player to teleport; must not be null
     * @param homeName the name of the home; case-insensitive
     * @return {@code true} if teleportation was initiated, {@code false} if the home
     *         does not exist or the player is in combat
     * @throws IllegalArgumentException if {@code homeName} is blank
     */
    public boolean teleportToHome(@NotNull Player player, @NotNull String homeName) { ... }
}
```

#### SHOULD Document

These benefit from Javadoc but are not strictly required:

- Complex algorithms (sorting, pathfinding, scoring)
- Database operations (what query runs, what it returns)
- Async boundaries (this method is async, callback runs on main thread)
- Non-obvious configuration interactions
- Methods with subtle preconditions

```java
/**
 * Calculates the player's score using the weighted formula:
 * {@code score = (kills * 10) + (assists * 3) - (deaths * 5) + (objectives * 25)}
 *
 * <p>Score is always non-negative; negative values are clamped to 0.</p>
 */
public int calculateScore(UUID playerId) { ... }
```

#### OPTIONAL

These are self-documenting and don't need Javadoc:

- Simple getters and setters (`getPlayerName()`, `setEnabled(boolean)`)
- Standard `@Override` methods where the parent is already documented
- Private helper methods with descriptive names
- Obvious event handlers (`onPlayerJoin` in a join-message plugin)

---

### 3.2 Self-Documenting Code vs Comments

**Rule:** Code should explain WHAT it does through naming. Comments explain WHY — the non-obvious reasoning, constraints, or workarounds.

**Bad comment (explains WHAT, which the code already shows):**
```java
// Increment the counter by 1
counter++;

// Check if the player is online
if (player.isOnline()) {

// Loop through all players
for (Player p : Bukkit.getOnlinePlayers()) {
```

**Good comment (explains WHY — non-obvious reasoning):**
```java
// Paper's async chunk loading requires the teleport to be scheduled one tick later,
// even though the chunk appears loaded. Without this delay, the player falls through.
Bukkit.getScheduler().runTaskLater(plugin, () -> player.teleport(location), 1L);

// We intentionally skip saving here — the player's data will be saved by the
// quit handler. Saving twice causes a race condition with async writes.
if (event.getType() == PlayerTeleportEvent.TeleportCause.PLUGIN) {
    return;
}

// HikariCP recommends a maximum pool size of (CPU cores * 2) + 1 for I/O-bound workloads.
int poolSize = Runtime.getRuntime().availableProcessors() * 2 + 1;
```

**Comment smell — the code needs refactoring, not a comment:**
```java
// This handles the case where the player is in an arena and the arena is in the
// STARTING state and the player has the bypass permission and the config allows it
if (arenaManager.getArena(player) != null 
    && arenaManager.getArena(player).getState() == ArenaState.STARTING
    && player.hasPermission("arena.bypass")
    && config.getBoolean("arena.allow-bypass")) {
```

The comment above signals that the condition should be extracted to a named method:
```java
if (canBypassArenaStarting(player)) {

private boolean canBypassArenaStarting(Player player) {
    Arena arena = arenaManager.getArena(player);
    return arena != null
        && arena.getState() == ArenaState.STARTING
        && player.hasPermission("arena.bypass")
        && config.isArenaBypassAllowed();
}
```

**Outdated comments are worse than no comments.** If you change code, update or delete the comment. An outdated comment actively misleads the reader.

---

### 3.3 plugin.yml Metadata Standards

```yaml
name: MyPlugin
version: '${project.version}'          # Use Maven/Gradle variable injection
main: com.yourname.myplugin.MyPlugin
api-version: '1.21'                    # MUST match your target Paper version
description: >                         # Multi-line description using YAML block scalar
  A home management plugin with warmup delays, combat protection,
  and per-world home limits.
authors:
  - YourName                           # Use 'authors' (array), not 'author' (string)
website: https://github.com/yourname/myplugin

depend:
  - Vault                              # Hard dependencies — plugin won't load without these

softdepend:
  - PlaceholderAPI                     # Soft dependencies — plugin loads without these

commands:
  home:
    description: Teleport to your home
    usage: /home [name]
    permission: myplugin.home
    permission-message: You don't have permission to use this command.
  sethome:
    description: Set your home location
    usage: /sethome [name]
    permission: myplugin.sethome

permissions:
  myplugin.home:
    description: Allows teleporting to homes
    default: true
  myplugin.admin:
    description: Full admin access
    default: op
    children:
      myplugin.home: true
      myplugin.sethome: true
```

**`api-version` rules:**
- Always set it. Without it, Paper shows a deprecation warning and may disable legacy-compatibility features.
- Use `'1.21'` not `'1.21.4'` — minor versions are not valid values.
- Match your actual compile target. If you compile against Paper 1.21.4 API, use `'1.21'`.

**`authors` vs `author`:**
- Use `authors` (array) always, even for a single author. It's forward-compatible and the preferred modern form.

**`description`:** Write a technical summary, not a marketing pitch. Other developers read this in server logs and dependency declarations.

---

### 3.4 README & Documentation Files

A production plugin repository should contain:

```
README.md           — Installation, configuration, commands, permissions
CHANGELOG.md        — Version history with breaking changes highlighted
config.yml          — Heavily commented default config (the config IS documentation)
```

**config.yml documentation standard:**
```yaml
# ============================================================
# MyPlugin Configuration
# ============================================================
# Documentation: https://github.com/yourname/myplugin/wiki
# Support: https://discord.gg/yourserver
# ============================================================

homes:
  # Maximum number of homes a player can set.
  # Players with the 'myplugin.homes.vip' permission get max-homes-vip instead.
  # Default: 3
  max-per-player: 3
  
  # Maximum homes for VIP players (requires myplugin.homes.vip permission).
  # Default: 10
  max-per-player-vip: 10
  
  # Warmup delay in seconds before teleportation occurs.
  # Set to 0 to disable warmup. Minimum: 0, Maximum: 30.
  # Default: 3
  warmup-seconds: 3
```

---

## 4. Error Handling Elegance

---

### 4.1 Exception Philosophy (Checked vs Unchecked)

**Rule for plugin development:** Prefer unchecked (`RuntimeException`) exceptions for all plugin-internal errors. Use checked exceptions only at external boundaries (database, file I/O, network) and translate them immediately.

**Why:** Checked exceptions in Bukkit event handlers and command executors require either `throws` declarations on every method in the call chain (polluting every signature) or catch-and-ignore patterns (hiding errors). Neither is acceptable.

```java
// WRONG — checked exception propagates through the call chain
public void onPlayerJoin(PlayerJoinEvent event) throws SQLException {  // Can't do this
    PlayerData data = repository.load(event.getPlayer().getUniqueId());
}

// CORRECT — translate at the boundary, throw unchecked
public PlayerData load(UUID playerId) {
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(SELECT_QUERY)) {
        stmt.setString(1, playerId.toString());
        ResultSet rs = stmt.executeQuery();
        return mapResultSet(rs);
    } catch (SQLException e) {
        // Translate checked → unchecked at the repository boundary
        throw new DatabaseException("Failed to load player data for " + playerId, e);
    }
}
```

**Exception hierarchy for a plugin:**
```
RuntimeException
└── PluginException                    ← base for all plugin errors
    ├── DatabaseException              ← data access failures
    ├── ConfigurationException         ← invalid config values
    ├── ArenaException                 ← arena-specific errors
    └── EconomyException               ← economy operation failures
```

---

### 4.2 Try-Catch Placement & Scope

**Rule:** Catch exceptions at the level where you can meaningfully handle them. Don't catch an exception just to re-throw it unchanged.

```java
// WRONG — catching just to re-throw adds no value
public void saveData(PlayerData data) {
    try {
        repository.save(data);
    } catch (DatabaseException e) {
        throw e;  // pointless
    }
}

// WRONG — catching too broadly
public void onPlayerQuit(PlayerQuitEvent event) {
    try {
        playerDataManager.save(event.getPlayer().getUniqueId());
        homeManager.save(event.getPlayer().getUniqueId());
        statsManager.save(event.getPlayer().getUniqueId());
    } catch (Exception e) {
        // Which save failed? We don't know.
        getLogger().warning("Save failed: " + e.getMessage());
    }
}

// CORRECT — catch at the right level, with context
public void onPlayerQuit(PlayerQuitEvent event) {
    UUID playerId = event.getPlayer().getUniqueId();
    savePlayerData(playerId);
    savePlayerHomes(playerId);
    savePlayerStats(playerId);
}

private void savePlayerData(UUID playerId) {
    try {
        playerDataManager.save(playerId);
    } catch (DatabaseException e) {
        getLogger().log(Level.SEVERE, "Failed to save player data for " + playerId, e);
    }
}
```

**Multi-catch for unrelated exceptions:**
```java
// Acceptable — multi-catch when handling is identical
try {
    processInput(input);
} catch (IllegalArgumentException | IllegalStateException e) {
    player.sendMessage(ChatColor.RED + "Invalid input: " + e.getMessage());
}
```

---

### 4.3 Empty Catch Blocks — The Ultimate Sin

> **Warning:** An empty catch block is a lie. It tells the runtime "I handled this" when you actually buried it. Every empty catch block is a future bug that will take hours to diagnose.

```java
// THE ULTIMATE SIN — never do this
try {
    playerData = repository.load(uuid);
} catch (DatabaseException e) {
    // nothing
}

// ALSO WRONG — printing without context
} catch (DatabaseException e) {
    e.printStackTrace();  // Goes to console with no plugin context
}

// CORRECT — log with context and level
} catch (DatabaseException e) {
    getLogger().log(Level.SEVERE, "Failed to load data for player " + uuid + " on join", e);
    // Optionally: kick the player, use default data, or schedule a retry
}
```

**The only legitimate empty catch:** When you are intentionally ignoring an exception AND you document exactly why.

```java
try {
    Files.delete(tempFile);
} catch (IOException e) {
    // Intentionally ignored: temp file cleanup failure is non-critical.
    // The OS will clean it up on restart. Logging would spam the console.
}
```

---

### 4.4 Logging Standards (Never `e.printStackTrace()`)

**Rule:** All logging goes through `getLogger()`. `System.out.println` and `e.printStackTrace()` are banned.

| Level | When to Use |
|---|---|
| `INFO` | Normal operational events (plugin enabled, config loaded, player joined) |
| `WARNING` | Recoverable problems (config key missing, using default value) |
| `SEVERE` | Unrecoverable errors (database connection failed, critical data loss) |
| `FINE` / `FINER` | Debug information (disabled in production, enabled via config) |

```java
// BANNED
System.out.println("Plugin enabled!");
e.printStackTrace();
System.err.println("Error: " + e.getMessage());

// CORRECT
getLogger().info("Plugin enabled successfully. Loaded " + homeCount + " homes.");
getLogger().warning("Config key 'homes.max-per-player' not found. Using default: 3");
getLogger().log(Level.SEVERE, "Database connection failed. Plugin will disable.", e);

// Debug logging with guard (avoids string construction when debug is off)
if (debugMode) {
    getLogger().fine("Processing home teleport for " + player.getName() + " to " + homeName);
}
```

**Structured log messages — include context:**
```java
// BAD — no context
getLogger().warning("Failed to save data.");

// GOOD — who, what, why
getLogger().log(Level.WARNING, 
    "Failed to save player data for " + playerId + " (player: " + playerName + ")", 
    exception);
```

---

### 4.5 Null Safety Patterns

**Rule:** Use the right null-safety pattern for the right scenario.

| Scenario | Pattern |
|---|---|
| Public API method parameter | `Objects.requireNonNull(param, "param must not be null")` |
| Optional return value | `@Nullable` annotation + null check at call site |
| Chained optional operations | `Optional<T>` |
| Default value for nullable | `Objects.requireNonNullElse(value, defaultValue)` |
| Early return guard | `if (x == null) return;` |

```java
// API boundary — fail fast with clear message
public void addHome(@NotNull UUID playerId, @NotNull String name, @NotNull Location location) {
    Objects.requireNonNull(playerId, "playerId must not be null");
    Objects.requireNonNull(name, "name must not be null");
    Objects.requireNonNull(location, "location must not be null");
    // ...
}

// Optional for values that may legitimately not exist
public Optional<PlayerData> findData(UUID playerId) {
    return Optional.ofNullable(playerDataCache.get(playerId));
}

// Call site — explicit handling of both cases
findData(player.getUniqueId()).ifPresentOrElse(
    data -> processData(player, data),
    () -> player.sendMessage(ChatColor.RED + "No data found.")
);

// Guard clause — early return for null checks
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    PlayerData data = playerDataManager.getData(player.getUniqueId());
    if (data == null) {
        getLogger().warning("No data for joining player: " + player.getName());
        return;
    }
    applyPlayerData(player, data);
}
```

> **Warning:** `event.getPlayer()` in `PlayerJoinEvent`, `PlayerQuitEvent`, and most player-specific events is guaranteed non-null by the API contract. Do NOT add null checks for these — it's noise. DO add null checks for `event.getEntity()` in generic entity events, `Bukkit.getPlayer(name)` (returns null if offline), and any method documented as `@Nullable`.

---

## 5. Resource Management

---

### 5.1 Try-With-Resources for AutoCloseables

**Rule:** Every `AutoCloseable` resource MUST be opened in a try-with-resources block. No exceptions. No `finally { conn.close(); }` patterns.

```java
// WRONG — resource leak if exception occurs between open and close
public PlayerData loadPlayer(UUID playerId) throws DatabaseException {
    Connection conn = dataSource.getConnection();
    PreparedStatement stmt = conn.prepareStatement(SELECT_SQL);
    stmt.setString(1, playerId.toString());
    ResultSet rs = stmt.executeQuery();
    PlayerData data = mapRow(rs);
    rs.close();
    stmt.close();
    conn.close();  // Never reached if mapRow() throws
    return data;
}

// WRONG — finally block is better but still verbose and error-prone
public PlayerData loadPlayer(UUID playerId) throws DatabaseException {
    Connection conn = null;
    try {
        conn = dataSource.getConnection();
        // ...
    } finally {
        if (conn != null) conn.close();  // What if close() throws?
    }
}

// CORRECT — try-with-resources handles all cases
public PlayerData loadPlayer(UUID playerId) {
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(SELECT_SQL)) {
        stmt.setString(1, playerId.toString());
        try (ResultSet rs = stmt.executeQuery()) {
            return mapRow(rs);
        }
    } catch (SQLException e) {
        throw new DatabaseException("Failed to load player " + playerId, e);
    }
}
```

**Resources that require try-with-resources:**
- `java.sql.Connection`
- `java.sql.PreparedStatement`
- `java.sql.ResultSet`
- `java.io.InputStream` / `OutputStream`
- `java.io.Reader` / `Writer`
- `java.nio.file.Files.newBufferedReader()`
- `java.util.zip.ZipFile`
- Any custom class implementing `AutoCloseable`

---

### 5.2 Listener Lifecycle (Register → Unregister)

**Rule:** Every listener registered in `onEnable()` must be unregisterable. Store listener references if you need to unregister them mid-runtime.

```java
// CORRECT — register in onEnable
@Override
public void onEnable() {
    PlayerListener playerListener = new PlayerListener(this);
    getServer().getPluginManager().registerEvents(playerListener, this);
    // Bukkit automatically unregisters all listeners when the plugin disables
}
```

**Why unregistering matters:** When a plugin is reloaded (via `/reload` or a plugin manager), if listeners are not unregistered, the old listener instances remain active alongside the new ones. Every event fires twice. Player join messages appear twice. Economy transactions process twice. Data saves twice — causing race conditions.

```java
// For dynamic listeners (registered mid-runtime), store and unregister manually
public class ArenaManager {
    private final List<Listener> activeListeners = new ArrayList<>();
    
    public void startArena(Arena arena) {
        ArenaGameListener listener = new ArenaGameListener(arena);
        Bukkit.getPluginManager().registerEvents(listener, plugin);
        activeListeners.add(listener);
    }
    
    public void stopArena(Arena arena) {
        activeListeners.removeIf(listener -> {
            if (listener instanceof ArenaGameListener agl && agl.getArena().equals(arena)) {
                HandlerList.unregisterAll(listener);
                return true;
            }
            return false;
        });
    }
}
```

**Listener state:** Listeners should be stateless or hold only immutable references. Mutable state in a listener creates threading issues and makes reload behavior unpredictable.

```java
// WRONG — listener holds mutable state
public class CombatListener implements Listener {
    private final Map<UUID, Long> lastHitTime = new HashMap<>();  // Mutable state in listener
    
    @EventHandler
    public void onDamage(EntityDamageByEntityEvent event) {
        lastHitTime.put(uuid, System.currentTimeMillis());  // State mutation
    }
}

// CORRECT — delegate state to a manager
public class CombatListener implements Listener {
    private final CombatManager combatManager;  // Manager owns the state
    
    public CombatListener(CombatManager combatManager) {
        this.combatManager = combatManager;
    }
    
    @EventHandler
    public void onDamage(EntityDamageByEntityEvent event) {
        combatManager.recordHit(uuid);  // Delegate to manager
    }
}
```

---

### 5.3 Task Lifecycle (Schedule → Cancel)

**Rule:** Every scheduled task must be stored and cancelled in `onDisable()`. A task that outlives the plugin will crash the server on the next tick.

```java
// WRONG — task ID not stored, cannot be cancelled
public void startHeartbeat() {
    Bukkit.getScheduler().runTaskTimer(plugin, () -> {
        updateScoreboards();
    }, 0L, 20L);
}

// CORRECT — store and cancel
public class MyPlugin extends JavaPlugin {
    private final List<BukkitTask> activeTasks = new ArrayList<>();
    
    public void startHeartbeat() {
        BukkitTask task = Bukkit.getScheduler().runTaskTimer(this, () -> {
            updateScoreboards();
        }, 0L, 20L);
        activeTasks.add(task);
    }
    
    @Override
    public void onDisable() {
        activeTasks.forEach(BukkitTask::cancel);
        activeTasks.clear();
    }
}
```

**Per-player repeating tasks:**
```java
// Track per-player tasks to cancel when they quit
private final Map<UUID, BukkitTask> playerTasks = new HashMap<>();

public void startPlayerTask(Player player) {
    cancelPlayerTask(player.getUniqueId());  // Cancel existing before starting new
    BukkitTask task = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
        if (!player.isOnline()) {
            cancelPlayerTask(player.getUniqueId());
            return;
        }
        tickPlayer(player);
    }, 0L, 10L);
    playerTasks.put(player.getUniqueId(), task);
}

public void cancelPlayerTask(UUID playerId) {
    BukkitTask existing = playerTasks.remove(playerId);
    if (existing != null) {
        existing.cancel();
    }
}

@EventHandler
public void onPlayerQuit(PlayerQuitEvent event) {
    cancelPlayerTask(event.getPlayer().getUniqueId());
}
```

**Named runnables for debugging:**
```java
// Extend BukkitRunnable for named tasks (visible in /timings and profilers)
public class ScoreboardUpdateTask extends BukkitRunnable {
    
    @Override
    public void run() {
        Bukkit.getOnlinePlayers().forEach(ScoreboardManager::update);
    }
}

// Usage
new ScoreboardUpdateTask().runTaskTimer(plugin, 0L, 20L);
```

---

### 5.4 Connection & Stream Cleanup

**Rule:** Database connections from a pool must be returned (closed) within the same method that acquired them. Never store a `Connection` as a field.

```java
// WRONG — connection stored as field, never properly returned to pool
public class PlayerRepository {
    private Connection connection;  // NEVER do this
    
    public void init() {
        connection = dataSource.getConnection();
    }
    
    public PlayerData load(UUID id) throws SQLException {
        // Uses this.connection — what if it times out? What if two threads call this?
    }
}

// CORRECT — connection acquired and released per operation
public class PlayerRepository {
    private final HikariDataSource dataSource;
    
    public PlayerData load(UUID id) {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(SELECT_SQL)) {
            stmt.setString(1, id.toString());
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next() ? mapRow(rs) : null;
            }
        } catch (SQLException e) {
            throw new DatabaseException("Failed to load player " + id, e);
        }
    }
}
```

---

## 6. Plugin Lifecycle Discipline

---

### 6.1 onEnable() — What Belongs, What Doesn't

**Rule:** `onEnable()` is an initialization sequence, not a runtime method. It should complete in under 100ms. Anything slower belongs in an async task.

**Correct initialization order:**
```java
@Override
public void onEnable() {
    // 1. Configuration (fail fast if invalid)
    this.configManager = new ConfigManager(this);
    if (!configManager.load()) {
        getLogger().severe("Failed to load configuration. Disabling plugin.");
        getServer().getPluginManager().disablePlugin(this);
        return;
    }
    
    // 2. Database connection (synchronous init, async population)
    this.database = new DatabaseManager(this, configManager.getDatabaseConfig());
    if (!database.connect()) {
        getLogger().severe("Failed to connect to database. Disabling plugin.");
        getServer().getPluginManager().disablePlugin(this);
        return;
    }
    
    // 3. Managers (in dependency order)
    this.playerDataManager = new PlayerDataManager(this, database);
    this.homeManager = new HomeManager(this, playerDataManager);
    this.arenaManager = new ArenaManager(this, playerDataManager);
    
    // 4. Commands
    getCommand("home").setExecutor(new HomeCommand(this, homeManager));
    getCommand("sethome").setExecutor(new SetHomeCommand(this, homeManager));
    
    // 5. Listeners
    getServer().getPluginManager().registerEvents(new PlayerListener(this, playerDataManager), this);
    getServer().getPluginManager().registerEvents(new HomeListener(this, homeManager), this);
    
    // 6. API registration (for other plugins)
    MyPluginAPI.initialize(this);
    
    // 7. Metrics (optional, non-critical)
    new Metrics(this, BSTATS_PLUGIN_ID);
    
    getLogger().info("MyPlugin v" + getDescription().getVersion() + " enabled.");
}
```

**What does NOT belong in `onEnable()`:**

```java
// WRONG — heavy computation in onEnable
@Override
public void onEnable() {
    // Scanning all worlds for custom structures — this can take seconds
    for (World world : Bukkit.getWorlds()) {
        for (Chunk chunk : world.getLoadedChunks()) {
            scanChunkForStructures(chunk);  // NEVER in onEnable
        }
    }
}

// WRONG — network request in onEnable (blocks server startup)
@Override
public void onEnable() {
    String latestVersion = fetchLatestVersionFromGitHub();  // Blocks for 2-5 seconds
}

// WRONG — world manipulation in onEnable (world may not be fully loaded)
@Override
public void onEnable() {
    spawnArenaEntities();  // Entities may not load correctly at this point
}

// CORRECT — defer to async or next tick
@Override
public void onEnable() {
    // Version check — async, non-blocking
    Bukkit.getScheduler().runTaskAsynchronously(this, this::checkForUpdates);
    
    // World setup — next tick, after world is fully loaded
    Bukkit.getScheduler().runTask(this, this::initializeArenas);
}
```

---

### 6.2 onDisable() — Cleanup Checklist

**Rule:** `onDisable()` must be idempotent (safe to call multiple times) and must complete synchronously. Async tasks in `onDisable()` may not finish before the server shuts down.

```java
@Override
public void onDisable() {
    // 1. Cancel all scheduled tasks FIRST (prevent new operations starting)
    Bukkit.getScheduler().cancelTasks(this);
    
    // 2. Save all online player data (synchronous — server is shutting down)
    for (Player player : Bukkit.getOnlinePlayers()) {
        playerDataManager.saveSync(player.getUniqueId());
    }
    
    // 3. Flush any pending async saves
    playerDataManager.flushPendingSaves();
    
    // 4. Close database connections
    if (database != null) {
        database.close();
    }
    
    // 5. Unregister API (notify dependent plugins)
    MyPluginAPI.shutdown();
    
    // 6. Clear caches (help GC)
    if (playerDataManager != null) {
        playerDataManager.clearCache();
    }
    
    getLogger().info("MyPlugin disabled. All data saved.");
}
```

**Null checks in `onDisable()`:** If `onEnable()` can fail partway through (and disable the plugin), `onDisable()` will be called with partially-initialized state. Always null-check managers before using them.

```java
// Safe onDisable pattern
if (playerDataManager != null) {
    playerDataManager.saveAll();
}
if (database != null) {
    database.close();
}
```

---

### 6.3 onLoad() — When to Use (Rarely)

`onLoad()` runs before `onEnable()` and before any other plugins are enabled. Use it only for:

1. Registering custom world generators (`ChunkGenerator`)
2. Setting up static state that other plugins' `onLoad()` methods depend on
3. Registering with APIs that require pre-enable registration

```java
@Override
public void onLoad() {
    // Correct use: register world generator before worlds load
    // (Most plugins never need onLoad at all)
}
```

**Never use `onLoad()` for:** Configuration loading, database connections, listener registration, or anything that depends on other plugins being enabled.

---

### 6.4 Reload-Safe Architecture

> **Warning:** `/reload` is dangerous and unsupported by most plugin developers. However, your plugin should be designed to survive it gracefully.

**The reload problem:**
1. `/reload` calls `onDisable()` on all plugins
2. Then calls `onEnable()` on all plugins
3. Listeners registered in `onEnable()` are now registered TWICE (old + new instance)
4. Tasks scheduled in `onEnable()` run TWICE per tick
5. Static singleton instances point to the OLD plugin instance

**Reload-safe patterns:**

```java
// Pattern 1: Clear static state in onDisable
@Override
public void onDisable() {
    instance = null;  // Clear singleton so onEnable() sets a fresh one
    HandlerList.unregisterAll(this);  // Unregister all listeners for this plugin
    Bukkit.getScheduler().cancelTasks(this);
}

// Pattern 2: Proper reload command (don't use /reload)
public class ReloadCommand implements CommandExecutor {
    
    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        // Atomic reload: save state → reload config → re-apply
        plugin.getConfigManager().reload();
        plugin.getMessageManager().reload();
        sender.sendMessage(ChatColor.GREEN + "Configuration reloaded.");
        return true;
    }
}
```

**What to preserve across reloads:** Online player data (don't evict from cache on reload). Active arena states. Economy balances.

**What to reset across reloads:** Configuration values. Message strings. Permission nodes. Task schedules.

---

## 7. Configuration & Messaging Standards

---

### 7.1 Type-Safe Config Wrappers

**Rule:** Never call `getConfig().getString("path")` directly in business logic. All config access goes through a typed wrapper class.

**Why scattered config access is bad:**
```java
// WRONG — config path strings scattered across 20 files
// If you rename "homes.max-per-player" to "homes.limit", you must find and update 20 places
public boolean canSetHome(Player player) {
    int max = plugin.getConfig().getInt("homes.max-per-player", 3);  // Scattered
    return getHomeCount(player) < max;
}

public void sendLimitMessage(Player player) {
    int max = plugin.getConfig().getInt("homes.max-per-player", 3);  // Duplicated
    player.sendMessage("You can only have " + max + " homes.");
}
```

**Correct — typed config wrapper:**
```java
public class HomeConfig {
    private final FileConfiguration config;
    
    public HomeConfig(FileConfiguration config) {
        this.config = config;
    }
    
    public int getMaxHomesPerPlayer() {
        return config.getInt("homes.max-per-player", 3);
    }
    
    public int getMaxHomesVip() {
        return config.getInt("homes.max-per-player-vip", 10);
    }
    
    public int getWarmupSeconds() {
        return config.getInt("homes.warmup-seconds", 3);
    }
    
    public boolean isCombatCheckEnabled() {
        return config.getBoolean("homes.combat-check", true);
    }
}

// Usage — single source of truth
public boolean canSetHome(Player player) {
    int max = homeConfig.getMaxHomesPerPlayer();
    return getHomeCount(player) < max;
}
```

**Config validation at load time:**
```java
public class ConfigManager {
    
    public boolean load() {
        plugin.saveDefaultConfig();
        plugin.reloadConfig();
        return validate(plugin.getConfig());
    }
    
    private boolean validate(FileConfiguration config) {
        boolean valid = true;
        
        int maxHomes = config.getInt("homes.max-per-player", -1);
        if (maxHomes < 0) {
            plugin.getLogger().severe("Config error: 'homes.max-per-player' must be >= 0");
            valid = false;
        }
        
        int warmup = config.getInt("homes.warmup-seconds", -1);
        if (warmup < 0 || warmup > 30) {
            plugin.getLogger().severe("Config error: 'homes.warmup-seconds' must be 0-30");
            valid = false;
        }
        
        String dbHost = config.getString("database.host");
        if (dbHost == null || dbHost.isBlank()) {
            plugin.getLogger().severe("Config error: 'database.host' must not be empty");
            valid = false;
        }
        
        return valid;
    }
}
```

---

### 7.2 Message Externalization (No Hardcoded Strings)

**Rule:** Zero hardcoded player-facing strings in Java source code. Every message lives in `messages.yml` (or `config.yml` under a `messages:` section).

```java
// WRONG — hardcoded strings
player.sendMessage(ChatColor.RED + "You don't have permission to use this command.");
player.sendMessage(ChatColor.GREEN + "Home '" + homeName + "' set successfully!");
player.sendMessage(ChatColor.YELLOW + "Teleporting in " + warmup + " seconds...");

// CORRECT — externalized messages
player.sendMessage(messages.get("commands.home.no-permission"));
player.sendMessage(messages.format("commands.sethome.success", "home", homeName));
player.sendMessage(messages.format("commands.home.warmup", "seconds", warmup));
```

**Message manager implementation:**
```java
public class MessageManager {
    private FileConfiguration messages;
    private final Plugin plugin;
    
    public MessageManager(Plugin plugin) {
        this.plugin = plugin;
        reload();
    }
    
    public void reload() {
        plugin.saveResource("messages.yml", false);
        messages = YamlConfiguration.loadConfiguration(
            new File(plugin.getDataFolder(), "messages.yml")
        );
    }
    
    public String get(String key) {
        String raw = messages.getString(key, "&cMissing message: " + key);
        return ChatColor.translateAlternateColorCodes('&', raw);
    }
    
    public String format(String key, Object... placeholders) {
        String message = get(key);
        for (int i = 0; i < placeholders.length - 1; i += 2) {
            message = message.replace("{" + placeholders[i] + "}", String.valueOf(placeholders[i + 1]));
        }
        return message;
    }
}
```

**messages.yml structure:**
```yaml
prefix: "&8[&bMyPlugin&8] "

commands:
  home:
    no-permission: "{prefix}&cYou don't have permission to teleport home."
    not-found: "{prefix}&cHome '&e{home}&c' not found."
    warmup: "{prefix}&eТeleporting in &b{seconds} &eseconds..."
    success: "{prefix}&aТeleported to home '&e{home}&a'."
    combat: "{prefix}&cYou cannot teleport while in combat."
  sethome:
    success: "{prefix}&aHome '&e{home}&a' set successfully."
    limit-reached: "{prefix}&cYou have reached your home limit (&e{max}&c)."
```

---

### 7.3 Color Code & Component Standards

**Rule:** Use legacy `&` color codes unless the project explicitly targets Paper 1.16+ and the team has agreed to use Adventure/MiniMessage.

**Legacy color codes (default for most plugins):**
```java
// Correct — legacy codes via ChatColor.translateAlternateColorCodes
String message = ChatColor.translateAlternateColorCodes('&', "&c&lError: &r&cInvalid input.");
player.sendMessage(message);
```

**Adventure Components (Paper 1.16+, when explicitly chosen):**
```java
// Adventure API — use when targeting modern Paper and team agrees
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.minimessage.MiniMessage;

// Simple component
player.sendMessage(Component.text("Hello, " + player.getName() + "!", NamedTextColor.GREEN));

// MiniMessage for rich formatting
MiniMessage mm = MiniMessage.miniMessage();
player.sendMessage(mm.deserialize("<red><bold>Error:</bold></red> <white>Invalid input.</white>"));

// Hover and click events
Component message = Component.text("Click here to teleport home")
    .color(NamedTextColor.AQUA)
    .clickEvent(ClickEvent.runCommand("/home"))
    .hoverEvent(HoverEvent.showText(Component.text("Teleport to your home")));
player.sendMessage(message);
```

**Migration path from legacy to Adventure:**
```java
// Compatibility bridge — convert legacy string to Component
Component component = LegacyComponentSerializer.legacyAmpersand()
    .deserialize("&aHello &b" + player.getName());
player.sendMessage(component);
```

> **Warning:** Do NOT mix legacy `player.sendMessage(String)` and Adventure `player.sendMessage(Component)` in the same plugin. Pick one and use it consistently everywhere.

---

### 7.4 Config Validation at Load Time

**Rule:** Fail fast. If the config is invalid, disable the plugin with a clear error message rather than running with broken state.

```java
@Override
public void onEnable() {
    if (!loadAndValidateConfig()) {
        getLogger().severe("=================================================");
        getLogger().severe("  MyPlugin failed to load due to config errors.");
        getLogger().severe("  Fix the errors above and restart the server.");
        getLogger().severe("=================================================");
        getServer().getPluginManager().disablePlugin(this);
        return;
    }
    // Continue with initialization...
}

private boolean loadAndValidateConfig() {
    saveDefaultConfig();
    reloadConfig();
    
    List<String> errors = new ArrayList<>();
    FileConfiguration config = getConfig();
    
    // Validate required string values
    String dbHost = config.getString("database.host");
    if (dbHost == null || dbHost.isBlank()) {
        errors.add("'database.host' is required and must not be empty");
    }
    
    // Validate numeric ranges
    int port = config.getInt("database.port", 0);
    if (port < 1 || port > 65535) {
        errors.add("'database.port' must be between 1 and 65535 (got: " + port + ")");
    }
    
    // Validate enum values
    String mode = config.getString("arena.mode", "");
    try {
        ArenaMode.valueOf(mode.toUpperCase());
    } catch (IllegalArgumentException e) {
        errors.add("'arena.mode' must be one of: " + Arrays.toString(ArenaMode.values()) + " (got: " + mode + ")");
    }
    
    errors.forEach(error -> getLogger().severe("Config error: " + error));
    return errors.isEmpty();
}
```

---

## 8. Common AI Polish Failures (30+ Examples)

This section documents the most frequent quality failures in AI-generated Minecraft plugin code. For each failure: the bad output, why it's wrong, the corrected version, and the prompt phrase to prevent it.

---

### 8.1 Formatting Issues

#### Failure 1: Mixed Indentation (Tabs + Spaces)

**BAD (AI output):**
```java
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
	String message = "Welcome!";  // ← tab character here
    player.sendMessage(message);
}
```

**Why it's wrong:** Mixed indentation causes inconsistent display across editors and breaks diff tools. Most Java style guides mandate spaces only.

**GOOD:**
```java
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    String message = "Welcome!";
    player.sendMessage(message);
}
```

> **AI Prevention:** "Use 4-space indentation throughout. No tabs. No mixed indentation."

---

#### Failure 2: Lines Exceeding 120 Characters

**BAD (AI output):**
```java
player.sendMessage(ChatColor.RED + "You cannot teleport to your home because you are currently in combat with another player.");
```

**Why it's wrong:** Lines over 120 characters require horizontal scrolling and are harder to read in side-by-side diffs.

**GOOD:**
```java
player.sendMessage(ChatColor.RED
    + "You cannot teleport to your home"
    + " because you are currently in combat.");
```

> **AI Prevention:** "Keep all lines under 120 characters. Break long strings and method chains across multiple lines."

---

#### Failure 3: Missing Braces on Single-Line If Statements

**BAD (AI output):**
```java
if (player == null) return;
if (!player.hasPermission("myplugin.use")) player.sendMessage("No permission.");
for (Player p : players) p.sendMessage("Hello");
```

**Why it's wrong:** Brace-less statements are a maintenance hazard. Adding a second line to the body silently breaks the logic.

**GOOD:**
```java
if (player == null) {
    return;
}
if (!player.hasPermission("myplugin.use")) {
    player.sendMessage("No permission.");
}
for (Player p : players) {
    p.sendMessage("Hello");
}
```

> **AI Prevention:** "Always use curly braces for if, else, for, while, and do-while blocks, even for single-line bodies."

---

#### Failure 4: Inconsistent Brace Style in the Same File

**BAD (AI output):**
```java
public class MyListener implements Listener
{                                           // Allman style
    @EventHandler
    public void onJoin(PlayerJoinEvent event) {  // Egyptian style
        if (event.getPlayer() != null)
        {                                   // Allman again
            // ...
        }
    }
}
```

**Why it's wrong:** Inconsistent brace style signals the code was assembled from multiple sources without review.

**GOOD:** Pick one style (Egyptian is standard for Java) and use it everywhere.

> **AI Prevention:** "Use Egyptian brace style (opening brace on the same line) consistently throughout the entire file."

---

#### Failure 5: Missing Spaces Around Operators

**BAD (AI output):**
```java
int total=kills*10+deaths*5;
if(player!=null&&player.isOnline()){
boolean valid=args.length>0&&!args[0].isEmpty();
```

**Why it's wrong:** Operator spacing is a fundamental readability requirement. Dense expressions are harder to parse.

**GOOD:**
```java
int total = kills * 10 + deaths * 5;
if (player != null && player.isOnline()) {
boolean valid = args.length > 0 && !args[0].isEmpty();
```

> **AI Prevention:** "Add spaces around all binary operators (=, +, -, *, /, ==, !=, &&, ||, <, >) and after keywords (if, for, while)."

---

#### Failure 6: No Blank Lines Between Logical Sections

**BAD (AI output):**
```java
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    PlayerData data = playerDataManager.getData(uuid);
    if (data == null) {
        data = new PlayerData(uuid);
        playerDataManager.register(uuid, data);
    }
    player.sendMessage(ChatColor.GREEN + "Welcome back, " + player.getName() + "!");
    applyPlayerEffects(player, data);
    updateScoreboard(player);
    logJoin(player);
}
```

**Why it's wrong:** Without blank lines between logical phases, the method reads as one undifferentiated block.

**GOOD:**
```java
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    PlayerData data = playerDataManager.getData(uuid);
    if (data == null) {
        data = new PlayerData(uuid);
        playerDataManager.register(uuid, data);
    }
    
    player.sendMessage(ChatColor.GREEN + "Welcome back, " + player.getName() + "!");
    applyPlayerEffects(player, data);
    updateScoreboard(player);
    logJoin(player);
}
```

> **AI Prevention:** "Add blank lines between logical sections within methods. Group related statements together."

---

#### Failure 7: Randomly Ordered Imports

**BAD (AI output):**
```java
import com.yourname.myplugin.manager.PlayerDataManager;
import org.bukkit.entity.Player;
import java.util.UUID;
import org.bukkit.event.EventHandler;
import com.yourname.myplugin.model.PlayerData;
import java.util.HashMap;
import org.bukkit.event.Listener;
```

**GOOD:**
```java
import java.util.HashMap;
import java.util.UUID;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

import com.yourname.myplugin.manager.PlayerDataManager;
import com.yourname.myplugin.model.PlayerData;
```

> **AI Prevention:** "Organize imports in groups: java.* first, then org.bukkit.*, then external libraries, then internal project classes. Alphabetical within each group. Blank line between groups."

---

#### Failure 8: Wildcard Imports in Production Code

**BAD (AI output):**
```java
import org.bukkit.*;
import org.bukkit.event.*;
import org.bukkit.event.player.*;
import java.util.*;
```

**GOOD:** Explicit imports only. See Section 2.2.

> **AI Prevention:** "Never use wildcard imports (import x.y.*). Use explicit imports for every class."

---

#### Failure 9: Trailing Whitespace

**BAD (AI output):** Lines ending with invisible spaces after the last character.

**Why it's wrong:** Trailing whitespace creates noisy diffs and fails many CI linting checks.

> **AI Prevention:** "Remove all trailing whitespace from every line."

---

#### Failure 10: Inconsistent Indentation in Multi-Line Method Calls

**BAD (AI output):**
```java
player.sendMessage(ChatColor.GREEN + "Welcome to the server, " + player.getName() + "! " +
"You have " + data.getTokens() + " tokens.");
```

**GOOD:**
```java
player.sendMessage(ChatColor.GREEN + "Welcome to the server, " + player.getName() + "! "
    + "You have " + data.getTokens() + " tokens.");
```

> **AI Prevention:** "When breaking a method call or string concatenation across lines, indent continuation lines by 8 spaces (2 levels) from the statement start."

---

### 8.2 Naming Inconsistencies

#### Failure 11: Verb/Noun Mismatch Between Class and Methods

**BAD (AI output):**
```java
public class PlayerManager {
    public void handlePlayerData(UUID uuid) { ... }   // "handle" is a verb — this is a manager
    public void processJoin(Player player) { ... }    // "process" is a verb — this is a manager
    public void doSave(PlayerData data) { ... }       // "do" prefix is meaningless
}
```

**GOOD:**
```java
public class PlayerManager {
    public void loadData(UUID uuid) { ... }
    public void onPlayerJoin(Player player) { ... }   // "on" signals event response
    public void saveData(PlayerData data) { ... }
}
```

> **AI Prevention:** "Manager classes use verb-first imperative method names: loadData(), saveData(), registerPlayer(). Not handleData(), processData(), doSave()."

---

#### Failure 12: Inconsistent Field Names Across Classes

**BAD (AI output):**
```java
public class HomeManager {
    private final MyPlugin config;  // "config" refers to the plugin, not config
}

public class ArenaManager {
    private final MyPlugin cfg;     // "cfg" for the same thing
}

public class ShopManager {
    private final MyPlugin plugin;  // "plugin" — three different names for the same thing
}
```

**GOOD:** Establish a project-wide convention and enforce it.
```java
// Convention: plugin instance is always "plugin"
public class HomeManager {
    private final MyPlugin plugin;
}
public class ArenaManager {
    private final MyPlugin plugin;
}
```

> **AI Prevention:** "Use consistent field names across all classes. The plugin instance is always named 'plugin'. The config wrapper is always named 'config'. The logger is always accessed via getLogger()."

---

#### Failure 13: Hungarian Notation Mixed with Modern Naming

**BAD (AI output):**
```java
private String strPlayerName;
private int intTokenBalance;
private boolean bIsEnabled;
private List<Player> lstOnlinePlayers;
```

**GOOD:**
```java
private String playerName;
private int tokenBalance;
private boolean enabled;
private List<Player> onlinePlayers;
```

> **AI Prevention:** "Do not use Hungarian notation (type prefixes like str, int, b, lst). Use descriptive camelCase names without type prefixes."

---

#### Failure 14: Inconsistent Return Types for Similar Methods

**BAD (AI output):**
```java
public List<String> getHomeNames(UUID playerId) { ... }      // Returns List<String>
public Collection<Home> getHomes(UUID playerId) { ... }      // Returns Collection<Home>
public ArrayList<Location> getHomeLocations(UUID playerId) { ... }  // Returns ArrayList
```

**GOOD:**
```java
public List<String> getHomeNames(UUID playerId) { ... }
public List<Home> getHomes(UUID playerId) { ... }
public List<Location> getHomeLocations(UUID playerId) { ... }
```

> **AI Prevention:** "Use consistent return types for similar methods. Prefer List<T> over Collection<T> or ArrayList<T> for collections returned from public methods."

---

#### Failure 15: Constants Not in UPPER_SNAKE_CASE

**BAD (AI output):**
```java
private static final int maxHomes = 10;
private static final String defaultHomeName = "home";
private static final long teleportDelay = 60L;
```

**GOOD:**
```java
private static final int MAX_HOMES = 10;
private static final String DEFAULT_HOME_NAME = "home";
private static final long TELEPORT_DELAY_TICKS = 60L;
```

> **AI Prevention:** "All static final fields (constants) must use UPPER_SNAKE_CASE naming."

---

### 8.3 Logic Red Flags

#### Failure 16: Deep Nesting Instead of Early Returns

**BAD (AI output):**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (sender instanceof Player) {
        Player player = (Player) sender;
        if (player.hasPermission("myplugin.home")) {
            if (args.length > 0) {
                PlayerData data = playerDataManager.getData(player.getUniqueId());
                if (data != null) {
                    Location home = data.getHome(args[0]);
                    if (home != null) {
                        player.teleport(home);
                        player.sendMessage("Teleported!");
                    } else {
                        player.sendMessage("Home not found.");
                    }
                } else {
                    player.sendMessage("No data found.");
                }
            } else {
                player.sendMessage("Usage: /home <name>");
            }
        } else {
            player.sendMessage("No permission.");
        }
    } else {
        sender.sendMessage("Players only.");
    }
    return true;
}
```

**GOOD — early returns flatten the nesting:**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (!(sender instanceof Player player)) {
        sender.sendMessage("Players only.");
        return true;
    }
    if (!player.hasPermission("myplugin.home")) {
        player.sendMessage("No permission.");
        return true;
    }
    if (args.length == 0) {
        player.sendMessage("Usage: /home <name>");
        return true;
    }
    PlayerData data = playerDataManager.getData(player.getUniqueId());
    if (data == null) {
        player.sendMessage("No data found.");
        return true;
    }
    Location home = data.getHome(args[0]);
    if (home == null) {
        player.sendMessage("Home '" + args[0] + "' not found.");
        return true;
    }
    player.teleport(home);
    player.sendMessage("Teleported!");
    return true;
}
```

> **AI Prevention:** "Use early return guard clauses to avoid deep nesting. Maximum nesting depth is 3 levels."

---

#### Failure 17: TODO/FIXME as Permanent Solutions

**BAD (AI output):**
```java
public void saveData(PlayerData data) {
    // TODO: implement database saving
    // FIXME: this crashes if data is null
}
```

**Why it's wrong:** TODOs in committed code are promises that are never kept. They accumulate into technical debt.

**GOOD:** Either implement it or don't commit the method. If it's a known limitation, document it in the issue tracker, not the code.

> **AI Prevention:** "Do not include TODO or FIXME comments. Implement the feature completely or omit it entirely."

---

#### Failure 18: Commented-Out Code Blocks

**BAD (AI output):**
```java
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    // Old implementation — kept for reference
    // player.sendMessage("Welcome!");
    // plugin.getEconomy().depositPlayer(player, 100);
    // player.setGameMode(GameMode.SURVIVAL);
    
    applyJoinEffects(player);
}
```

**Why it's wrong:** Commented-out code is noise. It confuses readers ("Is this intentionally disabled? Should I re-enable it?"). Version control exists for history.

**GOOD:** Delete it. Git has the history.

> **AI Prevention:** "Never include commented-out code. Delete unused code entirely."

---

#### Failure 19: Magic Numbers Without Named Constants

**BAD (AI output):**
```java
if (args.length < 3) {
    player.sendMessage("Usage: /arena create <name> <type>");
    return true;
}
if (player.getHealth() < 4.0) {
    player.sendMessage("You are too low on health!");
}
Bukkit.getScheduler().runTaskLater(plugin, () -> teleport(player), 60L);
```

**GOOD:**
```java
private static final int CREATE_ARGS_REQUIRED = 3;
private static final double MIN_HEALTH_TO_TELEPORT = 4.0;
private static final long TELEPORT_DELAY_TICKS = 60L;

if (args.length < CREATE_ARGS_REQUIRED) {
    player.sendMessage("Usage: /arena create <name> <type>");
    return true;
}
if (player.getHealth() < MIN_HEALTH_TO_TELEPORT) {
    player.sendMessage("You are too low on health!");
}
Bukkit.getScheduler().runTaskLater(plugin, () -> teleport(player), TELEPORT_DELAY_TICKS);
```

> **AI Prevention:** "Replace all magic numbers with named constants. Every numeric literal in business logic must have a descriptive name."

---

#### Failure 20: Dead Code (Unused Variables and Methods)

**BAD (AI output):**
```java
public void processCommand(Player player, String[] args) {
    String unused = "this is never used";
    int count = 0;  // count is set but never read
    
    for (String arg : args) {
        count++;  // incremented but never used
        processArg(player, arg);
    }
}

private void oldImplementation(Player player) {
    // This method is never called anywhere
    player.sendMessage("Old message");
}
```

**GOOD:** Remove all unused variables and methods. Configure your IDE to flag them as errors.

> **AI Prevention:** "Remove all unused variables, parameters, and methods. Every declared symbol must be used."

---

#### Failure 21: Catching Generic Exception

**BAD (AI output):**
```java
try {
    playerData = repository.load(uuid);
    homeData = homeRepository.load(uuid);
} catch (Exception e) {
    getLogger().warning("Something went wrong: " + e.getMessage());
}
```

**Why it's wrong:** `catch (Exception e)` catches `NullPointerException`, `ClassCastException`, `OutOfMemoryError` (via `Error` superclass in some patterns) — errors that indicate programmer mistakes, not recoverable conditions.

**GOOD:**
```java
try {
    playerData = repository.load(uuid);
} catch (DatabaseException e) {
    getLogger().log(Level.SEVERE, "Failed to load player data for " + uuid, e);
}
try {
    homeData = homeRepository.load(uuid);
} catch (DatabaseException e) {
    getLogger().log(Level.SEVERE, "Failed to load home data for " + uuid, e);
}
```

> **AI Prevention:** "Catch specific exception types only. Never catch Exception, Throwable, or RuntimeException unless you have a documented reason."

---

#### Failure 22: Empty Catch Blocks

**BAD (AI output):**
```java
try {
    config.load(configFile);
} catch (IOException e) {
    // ignore
}
```

**GOOD:** See Section 4.3 for the complete treatment.

> **AI Prevention:** "Never write empty catch blocks. Every catch block must either log the exception, rethrow it, or contain a comment explaining why it's intentionally swallowed."

---

#### Failure 23: String Comparison with `==`

**BAD (AI output):**
```java
if (args[0] == "home") {  // WRONG — compares references, not values
    teleportHome(player);
}

if (event.getPlayer().getName() == "Notch") {  // WRONG
    giveReward(player);
}
```

**Why it's wrong:** `==` on Strings compares object identity (memory address), not string content. Two `String` objects with the same characters are not `==` unless they're the same interned instance.

**GOOD:**
```java
if ("home".equalsIgnoreCase(args[0])) {
    teleportHome(player);
}

if ("Notch".equals(event.getPlayer().getName())) {
    giveReward(player);
}
```

> **AI Prevention:** "Always use .equals() or .equalsIgnoreCase() for String comparison. Never use == for String values."

---

#### Failure 24: Public Fields Instead of Encapsulated Fields

**BAD (AI output):**
```java
public class PlayerData {
    public UUID uuid;
    public int tokens;
    public int kills;
    public Location home;
    public boolean isVanished;
}
```

**Why it's wrong:** Public fields allow any code anywhere to modify state without validation, notification, or control. This makes debugging impossible — you can't set a breakpoint on "when tokens changes."

**GOOD:**
```java
@Getter @Setter  // Lombok
public class PlayerData {
    private final UUID uuid;
    private int tokens;
    private int kills;
    private Location home;
    private boolean vanished;
    
    public PlayerData(UUID uuid) {
        this.uuid = uuid;
    }
}
```

> **AI Prevention:** "All fields must be private. Use Lombok @Getter and @Setter annotations to generate accessors."

---

#### Failure 25: Raw Types

**BAD (AI output):**
```java
List players = new ArrayList();
Map data = new HashMap();
players.add(player);
PlayerData pd = (PlayerData) data.get(uuid);  // Unchecked cast
```

**Why it's wrong:** Raw types bypass generics type checking. The cast on the last line can throw `ClassCastException` at runtime with no compile-time warning.

**GOOD:**
```java
List<Player> players = new ArrayList<>();
Map<UUID, PlayerData> data = new HashMap<>();
players.add(player);
PlayerData pd = data.get(uuid);  // No cast needed
```

> **AI Prevention:** "Always use generic type parameters. Never use raw types (List, Map, Set without type parameters)."

---

### 8.4 Performance Anti-Patterns in Style

#### Failure 26: String Concatenation in Loops

**BAD (AI output):**
```java
public String buildPlayerList() {
    String result = "";
    for (Player player : Bukkit.getOnlinePlayers()) {
        result += player.getName() + ", ";  // Creates new String object every iteration
    }
    return result;
}
```

**Why it's wrong:** Each `+=` on a String creates a new `String` object. With 100 players, this creates 100 intermediate String objects.

**GOOD:**
```java
public String buildPlayerList() {
    StringBuilder sb = new StringBuilder();
    for (Player player : Bukkit.getOnlinePlayers()) {
        if (sb.length() > 0) sb.append(", ");
        sb.append(player.getName());
    }
    return sb.toString();
}

// Or with streams
public String buildPlayerList() {
    return Bukkit.getOnlinePlayers().stream()
        .map(Player::getName)
        .collect(Collectors.joining(", "));
}
```

> **AI Prevention:** "Use StringBuilder for string construction in loops. Never use += for String concatenation inside a loop."

---

#### Failure 27: Creating Objects in Hot Event Handlers

**BAD (AI output):**
```java
@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    // PlayerMoveEvent fires hundreds of times per second per player
    Location arenaCenter = new Location(event.getPlayer().getWorld(), 0, 64, 0);  // New object every call
    if (event.getTo().distance(arenaCenter) > 50) {
        event.setCancelled(true);
    }
}
```

**GOOD:**
```java
// Cache the location — it doesn't change
private static final Location ARENA_CENTER = new Location(Bukkit.getWorld("world"), 0, 64, 0);
private static final double ARENA_RADIUS_SQUARED = 50 * 50;  // Use distanceSquared — no sqrt

@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    if (event.getTo().distanceSquared(ARENA_CENTER) > ARENA_RADIUS_SQUARED) {
        event.setCancelled(true);
    }
}
```

> **AI Prevention:** "Cache objects that are created repeatedly in event handlers. Use distanceSquared() instead of distance() for comparisons."

---

#### Failure 28: Calling `getOnlinePlayers()` Every Tick

**BAD (AI output):**
```java
// Runs every tick (20 times/second)
new BukkitRunnable() {
    @Override
    public void run() {
        for (Player player : Bukkit.getOnlinePlayers()) {  // Creates new array every tick
            updateScoreboard(player);
        }
    }
}.runTaskTimer(plugin, 0L, 1L);
```

**GOOD:**
```java
// Run less frequently, or cache the player collection
new BukkitRunnable() {
    @Override
    public void run() {
        // Run every 20 ticks (1 second) instead of every tick
        Bukkit.getOnlinePlayers().forEach(MyPlugin.this::updateScoreboard);
    }
}.runTaskTimer(plugin, 0L, 20L);
```

> **AI Prevention:** "Avoid calling Bukkit.getOnlinePlayers() more than necessary. Cache results when iterating in tight loops."

---

### 8.5 Security Style Issues

#### Failure 29: String Concatenation for SQL Queries

**BAD (AI output):**
```java
public PlayerData loadPlayer(String playerName) throws SQLException {
    String query = "SELECT * FROM players WHERE name = '" + playerName + "'";
    Statement stmt = connection.createStatement();
    ResultSet rs = stmt.executeQuery(query);  // SQL INJECTION VULNERABILITY
    // ...
}
```

**Why it's wrong:** If `playerName` is `' OR '1'='1`, the query becomes `SELECT * FROM players WHERE name = '' OR '1'='1'` — returning all rows. Worse, a name like `'; DROP TABLE players; --` destroys the database.

**GOOD:**
```java
public PlayerData loadPlayer(String playerName) {
    String query = "SELECT * FROM players WHERE name = ?";
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(query)) {
        stmt.setString(1, playerName);  // Parameterized — injection-safe
        try (ResultSet rs = stmt.executeQuery()) {
            return rs.next() ? mapRow(rs) : null;
        }
    } catch (SQLException e) {
        throw new DatabaseException("Failed to load player: " + playerName, e);
    }
}
```

> **AI Prevention:** "Always use PreparedStatement with parameterized queries. Never concatenate user input into SQL strings."

---

#### Failure 30: No Input Validation on Command Arguments

**BAD (AI output):**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    int amount = Integer.parseInt(args[0]);  // Throws NumberFormatException if not a number
    String targetName = args[1];             // ArrayIndexOutOfBoundsException if args.length < 2
    Player target = Bukkit.getPlayer(targetName);  // Null if player is offline
    target.getInventory().addItem(new ItemStack(Material.DIAMOND, amount));  // NPE if target is null
}
```

**GOOD:**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (args.length < 2) {
        sender.sendMessage(ChatColor.RED + "Usage: /give <player> <amount>");
        return true;
    }
    
    Player target = Bukkit.getPlayer(args[0]);
    if (target == null) {
        sender.sendMessage(ChatColor.RED + "Player '" + args[0] + "' is not online.");
        return true;
    }
    
    int amount;
    try {
        amount = Integer.parseInt(args[1]);
    } catch (NumberFormatException e) {
        sender.sendMessage(ChatColor.RED + "'" + args[1] + "' is not a valid number.");
        return true;
    }
    
    if (amount < 1 || amount > 64) {
        sender.sendMessage(ChatColor.RED + "Amount must be between 1 and 64.");
        return true;
    }
    
    target.getInventory().addItem(new ItemStack(Material.DIAMOND, amount));
    sender.sendMessage(ChatColor.GREEN + "Gave " + amount + " diamonds to " + target.getName() + ".");
    return true;
}
```

> **AI Prevention:** "Validate all command arguments before use: check array length, parse numbers in try-catch, null-check Bukkit.getPlayer() results, and validate numeric ranges."

---

## Appendix A: 30-Point Pre-Commit Checklist

Use this checklist before every commit. A pull request that fails any item should be rejected.

### Naming
- [ ] Main class is named after the plugin with no suffix (`MyPlugin`, not `MyPluginMain`)
- [ ] All `static final` fields use UPPER_SNAKE_CASE
- [ ] All private fields use camelCase with no prefixes or Hungarian notation
- [ ] All boolean getters use `is`, `has`, `can`, or `should` prefix
- [ ] All action methods use verb-first imperative naming (`loadData`, not `dataLoad`)
- [ ] No class is named `Utils`, `Helper`, `Misc`, or `Stuff`

### Code Organization
- [ ] No method exceeds 50 lines
- [ ] `onCommand()` is a router under 20 lines — all logic is in private methods
- [ ] No class exceeds 300 lines (if it does, document why)
- [ ] No nesting deeper than 3 levels (use early returns)
- [ ] All imports are explicit (no wildcards)
- [ ] Imports are grouped and ordered (java → bukkit → external → internal)
- [ ] No unused imports, variables, or methods

### Documentation
- [ ] All public API methods have Javadoc
- [ ] All manager classes have class-level Javadoc
- [ ] `plugin.yml` has `api-version` set correctly
- [ ] No TODO or FIXME comments in committed code
- [ ] No commented-out code blocks

### Error Handling
- [ ] No empty catch blocks
- [ ] No `e.printStackTrace()` calls
- [ ] No `System.out.println()` calls
- [ ] All catch blocks use `getLogger().log(Level, message, exception)`
- [ ] No `catch (Exception e)` without documented justification

### Resource Management
- [ ] All `AutoCloseable` resources use try-with-resources
- [ ] All scheduled tasks are stored and cancelled in `onDisable()`
- [ ] `onDisable()` null-checks all managers before using them

### Configuration & Messaging
- [ ] Zero hardcoded player-facing strings in Java source
- [ ] All config access goes through a typed wrapper class
- [ ] Config is validated at load time with descriptive error messages

### Security
- [ ] All SQL queries use `PreparedStatement` with parameters
- [ ] All command arguments are validated before use
- [ ] No user input is concatenated into queries, file paths, or log messages without sanitization

---

## Appendix B: Code Review Red Flags (Visual Scanning Guide)

When scanning a file for the first time, these visual patterns signal problems before reading a single line of logic:

### Instant Rejections (Fix Before Review Continues)
- `catch (Exception e) { }` — empty catch block
- `catch (Exception e) { e.printStackTrace(); }` — unlogged exception
- `System.out.println(` — banned logging
- `import org.bukkit.*;` — wildcard import
- `== "` — String comparison with `==`
- `public int tokens;` — public field on a data class
- `// TODO` or `// FIXME` — incomplete implementation

### Requires Explanation
- Method body over 50 lines
- Nesting depth over 3 levels
- `@SuppressWarnings` annotation
- `catch (Exception e)` with non-empty body
- `static` mutable field (not a constant)
- `Bukkit.getScheduler().runTaskTimer(` without storing the return value

### Style Warnings (Fix Before Merge)
- Mixed indentation
- Lines over 120 characters
- Missing `@Override` on overridden methods
- Missing braces on if/for/while
- Constants in camelCase
- Unused imports

### Architecture Smells
- Class over 300 lines
- Manager class with no `Map` or `Set` field (what is it managing?)
- Listener class with mutable state fields
- `onEnable()` over 50 lines
- `onDisable()` with no null checks
- Command class with no subcommand routing

---

## Appendix C: AI Prompt Engineering Phrases for Better Output

These phrases, added to your AI prompt, consistently improve output quality. Use them as a template block prepended to every plugin generation request.

### Master Quality Block (copy-paste this)

```
Code quality requirements:
- 4-space indentation, Egyptian braces, no tabs
- All lines under 120 characters
- Always use curly braces for if/for/while, even single-line bodies
- Explicit imports only — no wildcards
- All static final fields in UPPER_SNAKE_CASE
- All private fields in camelCase, no Hungarian notation, no underscore prefix
- Boolean getters use is/has/can prefix
- Action methods use verb-first imperative naming
- @Override on every overriding method
- No empty catch blocks — every catch must log with getLogger().log(Level, message, exception)
- No System.out.println or e.printStackTrace
- No TODO or FIXME comments
- No commented-out code
- No magic numbers — use named constants
- No raw types — always use generic type parameters
- String comparison with .equals() or .equalsIgnoreCase(), never ==
- All fields private — use Lombok @Getter @Setter
- All SQL queries use PreparedStatement with parameters
- Validate all command arguments before use
- Store all BukkitTask references and cancel in onDisable()
- All AutoCloseable resources in try-with-resources
```

### Targeted Phrases by Problem

**For naming issues:**
> "Use consistent naming: plugin instance field is 'plugin', config wrapper is 'config', all constants are UPPER_SNAKE_CASE, no Hungarian notation."

**For structure issues:**
> "Keep onCommand() under 20 lines by routing to private methods. No method over 50 lines. No nesting deeper than 3 levels — use early returns."

**For error handling:**
> "Every catch block must call getLogger().log(Level.SEVERE, 'context message', exception). No empty catches. No e.printStackTrace()."

**For resource management:**
> "Store every BukkitTask in a List<BukkitTask> field and cancel all in onDisable(). Use try-with-resources for all database connections."

**For configuration:**
> "No hardcoded player-facing strings. Create a MessageManager class that reads from messages.yml. Create a typed ConfigManager class — no direct getConfig().getString() calls in business logic."

**For SQL security:**
> "All database queries must use PreparedStatement with ? parameters. Never concatenate variables into SQL strings."

**For completeness:**
> "Implement every method completely. No placeholder comments, no TODO, no empty method bodies. Every class must compile and run correctly."

---

## Appendix D: Auto-Format Configuration

### IntelliJ IDEA

**Code Style (Java):**
- `File → Settings → Editor → Code Style → Java`
- Indentation: 4 spaces, no tabs
- Continuation indent: 8 spaces
- Right margin: 120 characters
- Braces: End of line (Egyptian)
- `if ()` statement: Force braces

**Import Organization:**
- `File → Settings → Editor → Code Style → Java → Imports`
- Class count to use import with '*': 999 (effectively disables wildcards)
- Names count to use static import with '*': 999
- Import layout:
  ```
  import java.*
  <blank line>
  import org.bukkit.*
  import org.bukkit.event.*
  <blank line>
  import com.cryptomorin.*
  import com.zaxxer.*
  <blank line>
  import com.yourname.*
  ```

**Inspections to enable as Errors:**
- `Java → Declaration redundancy → Unused declaration`
- `Java → Probable bugs → String equality`
- `Java → Code style issues → Wildcard import`
- `Java → Probable bugs → Empty catch block`

**Save Actions (install `Save Actions` plugin):**
- Optimize imports on save
- Reformat file on save
- Add missing `@Override` annotations

### EditorConfig (`.editorconfig` in project root)

```ini
root = true

[*.java]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
max_line_length = 120

[*.yml]
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
insert_final_newline = true

[*.xml]
indent_style = space
indent_size = 4
```

### Checkstyle Configuration

Add to your Maven `pom.xml` for automated enforcement:

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-checkstyle-plugin</artifactId>
    <version>3.3.1</version>
    <configuration>
        <configLocation>checkstyle.xml</configLocation>
        <failsOnError>true</failsOnError>
        <consoleOutput>true</consoleOutput>
    </configuration>
    <executions>
        <execution>
            <id>validate</id>
            <phase>validate</phase>
            <goals>
                <goal>check</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

**`checkstyle.xml` (project root):**
```xml
<?xml version="1.0"?>
<!DOCTYPE module PUBLIC
    "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
    "https://checkstyle.org/dtds/configuration_1_3.dtd">
<module name="Checker">
    <property name="severity" value="error"/>
    
    <module name="TreeWalker">
        <!-- Naming -->
        <module name="ConstantName"/>
        <module name="LocalVariableName"/>
        <module name="MemberName"/>
        <module name="MethodName"/>
        <module name="PackageName"/>
        <module name="TypeName"/>
        
        <!-- Imports -->
        <module name="AvoidStarImport"/>
        <module name="UnusedImports"/>
        
        <!-- Blocks -->
        <module name="NeedBraces"/>
        <module name="LeftCurly"/>
        <module name="RightCurly"/>
        <module name="EmptyCatchBlock"/>
        
        <!-- Coding -->
        <module name="EqualsAvoidNull"/>
        <module name="MissingSwitchDefault"/>
        <module name="SimplifyBooleanExpression"/>
        <module name="StringLiteralEquality"/>
        
        <!-- Misc -->
        <module name="UpperEll"/>
        <module name="ArrayTypeStyle"/>
        <module name="TodoComment">
            <property name="format" value="(TODO|FIXME)"/>
            <property name="severity" value="warning"/>
        </module>
    </module>
    
    <!-- Line length -->
    <module name="LineLength">
        <property name="max" value="120"/>
    </module>
    
    <!-- Whitespace -->
    <module name="FileTabCharacter"/>
</module>
```

### VSCode (with Extension Pack for Java)

**`.vscode/settings.json`:**
```json
{
    "java.format.settings.url": "https://raw.githubusercontent.com/google/styleguide/gh-pages/eclipse-java-google-style.xml",
    "editor.tabSize": 4,
    "editor.insertSpaces": true,
    "editor.rulers": [120],
    "editor.trimAutoWhitespace": true,
    "files.trimTrailingWhitespace": true,
    "files.insertFinalNewline": true,
    "java.saveActions.organizeImports": true,
    "editor.formatOnSave": true
}
```

---

*End of Minecraft Plugin Code Quality & Polish Standards Guide*
*Paper 1.21.4 — Revision 1.0*
*Keep this document updated as Paper API evolves and new patterns emerge.*
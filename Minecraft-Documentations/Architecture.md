# Minecraft Plugin Architecture Reference Guide
## Paper 1.21.4 / Java 21 — For Internal Development Teams

> **How to use this document:** Read sections 1–3 before starting any new plugin. Consult sections 4–8 when implementing specific systems. Pin Appendix A next to your monitor. Share Appendix B with anyone using AI coding assistants.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Project Structure & Package Organization](#2-project-structure--package-organization)
3. [The Manager Pattern](#3-the-manager-pattern)
4. [Command Architecture](#4-command-architecture)
5. [Event Listener Architecture](#5-event-listener-architecture)
6. [Configuration Architecture](#6-configuration-architecture)
7. [Data Persistence Layer](#7-data-persistence-layer)
8. [API Design (For External Plugins)](#8-api-design-for-external-plugins)
9. [Common Anti-Patterns & Fixes](#9-common-anti-patterns--fixes)
10. [Thread Safety & Async Patterns](#10-thread-safety--async-patterns)
11. [Session & State Management](#11-session--state-management)
12. [Security Best Practices](#12-security-best-practices)
13. [Appendix A: Quick Reference Card](#appendix-a-quick-reference-card)
14. [Appendix B: Common AI-Generated Mistakes](#appendix-b-common-ai-generated-mistakes)

---

## 1. System Architecture Overview

### 1.1 Why Architecture Matters in Plugins

Minecraft plugins run inside a single JVM process shared with the server itself. There is no process isolation. A plugin that leaks memory, blocks the main thread, or corrupts shared state can crash the entire server for every player. This is fundamentally different from building a standalone application.

The architectural constraints you must internalize:

- **Single main thread for world state.** All Bukkit API calls that touch the world, players, or inventories must happen on the server's main thread. Violating this causes data corruption and crashes.
- **Shared classloader environment.** Your static fields are visible to other plugins. Your uncaught exceptions propagate upward. Your memory leaks affect everyone.
- **Hot-swap lifecycle.** Plugins are loaded, enabled, disabled, and reloaded without restarting the JVM. Your code must handle this cleanly.
- **Event-driven execution.** You do not control when your code runs. The server calls you via events, commands, and scheduled tasks.

### 1.2 The Three-Layer Model

Every well-structured plugin follows three logical layers:

```
┌─────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                  │
│         Commands, GUIs, Event Listeners              │
│   (Receives input, formats output, calls services)   │
├─────────────────────────────────────────────────────┤
│                   SERVICE LAYER                      │
│              Managers, Business Logic                │
│  (Enforces rules, coordinates data, pure Java logic) │
├─────────────────────────────────────────────────────┤
│                    DATA LAYER                        │
│         Database, Config, File I/O, Cache            │
│      (Reads/writes persistent state, no logic)       │
└─────────────────────────────────────────────────────┘
```

**Presentation Layer** — knows about Bukkit (Players, Events, Commands). Knows nothing about databases or file formats.

**Service Layer** — knows about your domain (PlayerData, Shop, Auction). Knows nothing about how data is stored or how it was requested.

**Data Layer** — knows about storage (SQL, YAML, Redis). Knows nothing about game logic or who asked.

Violations of this separation are the root cause of ~80% of plugin maintenance problems. A command handler that directly executes SQL is untestable, unrefactorable, and a security risk.

### 1.3 Plugin Lifecycle

```
Server Start
    │
    ▼
onLoad()          ← Runs before worlds load. Use for: registering custom
    │               entities, setting up static resources. Rarely needed.
    ▼
onEnable()        ← Your main entry point. Initialize everything here.
    │               Order matters — see Section 3.2.
    ▼
[Server Running]
    │   ▲
    │   │  Commands, Events, Scheduled Tasks fire here
    ▼   │
onDisable()       ← Save all data. Cancel tasks. Close connections.
    │               The server WILL NOT wait for async tasks.
    ▼
[Plugin Unloaded]
```

**Critical rule:** If you open it in `onEnable()`, you must close it in `onDisable()`. Database connections, file handles, scheduled tasks, registered services — all of it. Never assume `onDisable()` will run — server crashes won't call it.

### 1.4 Dependency Graph

Before writing a single line of code, draw your dependency graph. Managers depend on other managers. Commands depend on managers. Listeners depend on managers. The graph must be a DAG (directed acyclic graph) — no cycles.

```
                    MyPlugin (main class)
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ConfigManager   DatabaseManager  CacheManager
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  PlayerDataManager
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       ShopManager           AuctionManager
              │                     │
              └──────────┬──────────┘
                         ▼
              Commands & Listeners
```

If you find yourself with a cycle (A needs B, B needs A), you have a design problem. The fix is almost always to extract a third component that both A and B depend on.

---

## 2. Project Structure & Package Organization

### 2.1 The Canonical Structure

```
MyPlugin/
├── pom.xml
└── src/
    └── main/
        ├── java/
        │   └── com/
        │       └── yourteam/
        │           └── myplugin/
        │               ├── MyPlugin.java
        │               ├── commands/
        │               │   ├── CommandRegistry.java
        │               │   ├── ReloadCommand.java
        │               │   ├── ShopCommand.java
        │               │   └── admin/
        │               │       └── AdminCommand.java
        │               ├── listeners/
        │               │   ├── PlayerConnectionListener.java
        │               │   ├── PlayerInteractListener.java
        │               │   └── InventoryListener.java
        │               ├── managers/
        │               │   ├── ConfigManager.java
        │               │   ├── DatabaseManager.java
        │               │   ├── PlayerDataManager.java
        │               │   ├── EconomyManager.java
        │               │   ├── CooldownManager.java
        │               │   └── ShopManager.java
        │               ├── models/
        │               │   ├── PlayerData.java
        │               │   ├── Shop.java
        │               │   └── ShopItem.java
        │               ├── inventory/
        │               │   ├── InventoryHandler.java
        │               │   ├── InventoryButton.java
        │               │   ├── InventoryGUI.java
        │               │   ├── gui/
        │               │   │   ├── GUIManager.java
        │               │   │   └── GUIListener.java
        │               │   └── impl/
        │               │       ├── ShopGUI.java
        │               │       └── ConfirmGUI.java
        │               ├── storage/
        │               │   ├── DataStorage.java
        │               │   ├── MySQLStorage.java
        │               │   └── SQLiteStorage.java
        │               ├── hooks/
        │               │   ├── VaultHook.java
        │               │   ├── PlaceholderAPIHook.java
        │               │   └── LuckPermsHook.java
        │               ├── tasks/
        │               │   ├── AutoSaveTask.java
        │               │   └── LeaderboardUpdateTask.java
        │               ├── utils/
        │               │   ├── MessageUtils.java
        │               │   ├── ItemUtils.java
        │               │   └── TimeUtils.java
        │               └── api/
        │                   ├── MyPluginAPI.java
        │                   └── events/
        │                       ├── BalanceChangeEvent.java
        │                       └── PlayerDataLoadEvent.java
        └── resources/
            ├── plugin.yml
            └── config.yml
```

### 2.2 Package Responsibilities

#### `MyPlugin.java` — The Main Class (Wiring Harness)

**What belongs here:**
- Manager field declarations
- Manager instantiation and initialization in `onEnable()`
- Manager shutdown in `onDisable()`
- Command and listener registration
- Static `getInstance()` accessor (only the main class gets one)

**What does NOT belong here:**
- Business logic of any kind
- Direct database calls
- Event handling
- Utility methods
- Configuration parsing beyond "load the file"

```java
public class MyPlugin extends JavaPlugin {

    @Getter private static MyPlugin instance;
    @Getter private ConfigManager configManager;
    @Getter private DatabaseManager databaseManager;
    @Getter private PlayerDataManager playerDataManager;
    @Getter private ShopManager shopManager;
    @Getter private GUIManager guiManager;

    @Override
    public void onEnable() {
        instance = this;

        // Data layer first
        this.configManager = new ConfigManager(this);
        this.databaseManager = new DatabaseManager(this);

        // Service layer second
        this.playerDataManager = new PlayerDataManager(this);
        this.shopManager = new ShopManager(this);

        // Presentation layer last
        this.guiManager = new GUIManager();
        registerListeners();
        registerCommands();

        getLogger().info("MyPlugin enabled successfully.");
    }

    @Override
    public void onDisable() {
        if (playerDataManager != null) playerDataManager.saveAll();
        if (databaseManager != null) databaseManager.shutdown();
        instance = null;
        getLogger().info("MyPlugin disabled.");
    }

    private void registerListeners() {
        PluginManager pm = getServer().getPluginManager();
        pm.registerEvents(new GUIListener(guiManager), this);
        pm.registerEvents(new PlayerConnectionListener(this), this);
        pm.registerEvents(new PlayerInteractListener(this), this);
    }

    private void registerCommands() {
        CommandRegistry registry = new CommandRegistry(this);
        registry.register();
    }
}
```

#### `commands/` — Command Handlers

One class per top-level command. Sub-commands live in the same class or in `commands/admin/` for admin-only command trees. No business logic — only input parsing, permission checks, and delegation to managers. Group by category as your plugin grows: `admin/`, `player/`, `economy/`.

#### `listeners/` — Event Listeners

Group by domain, not by event type. `PlayerConnectionListener` handles join/quit/kick. `PlayerInteractListener` handles clicks, interactions, item use. Do not create one mega-listener with 40 `@EventHandler` methods. For small plugins, a `ConnectionListener` grouping join+quit is acceptable.

#### `managers/` — Business Logic

The heart of your plugin. Each manager owns one domain. `PlayerDataManager` owns player data — loading, saving, caching, querying. Nothing else touches the database for player data except through this manager.

#### `models/` — Data Classes

Plain Java objects. No Bukkit imports if avoidable. No business logic. Just fields, getters, setters, and constructors. Use Lombok `@Data` or `@Getter @Setter` to eliminate boilerplate.

```java
@Data
@AllArgsConstructor
@NoArgsConstructor
public class PlayerData {
    private UUID uuid;
    private String name;
    private int tokens;
    private int kills;
    private long lastSeen;
    private boolean vanished;
}
```

#### `storage/` — Data Access Layer

Abstract data persistence behind an interface to allow swapping implementations (MySQL, SQLite, YAML) without changing business logic.

```java
public interface DataStorage {
    void save(PlayerData data);
    PlayerData load(UUID uuid);
    void delete(UUID uuid);
}

public class MySQLStorage implements DataStorage { /* ... */ }
public class SQLiteStorage implements DataStorage { /* ... */ }
```

#### `inventory/` — GUI Framework

The reusable GUI system (see Section 2.3). Never put game-specific logic in the base classes. Game-specific GUIs go in `inventory/impl/`.

#### `hooks/` — Third-Party Integration

Wrapper classes for external plugin APIs (Vault, PlaceholderAPI, LuckPerms). Keep the coupling to external plugins localized here. The rest of your plugin should never import from another plugin's API directly.

#### `tasks/` — Scheduled/Repeating Tasks

Encapsulate scheduled work (`AutoSaveTask`, `LeaderboardUpdateTask`) in dedicated classes. Store `BukkitTask` references for cancellation in `onDisable()`.

#### `utils/` — Stateless Helpers

Pure static utility methods. No state, no constructor, no plugin reference. If a utility method needs a plugin reference, it belongs in a manager, not utils.

```java
public final class MessageUtils {
    private MessageUtils() {}

    public static String colorize(String message) {
        return ChatColor.translateAlternateColorCodes('&', message);
    }

    public static void send(Player player, String message) {
        player.sendMessage(colorize(message));
    }
}
```

#### `api/` — Public API

A single facade class exposing safe, versioned access to your plugin's functionality for other plugins. See Section 8.

### 2.3 Decision Tree: Where Does This Class Go?

```
Does it handle user input (commands/GUI)?
    └─ YES → commands/ package
    └─ NO ↓

Does it react to Bukkit/Paper events?
    └─ YES → listeners/ package
    └─ NO ↓

Does it contain business logic or manage state?
    └─ YES → managers/ package
    └─ NO ↓

Is it a data container (no behavior)?
    └─ YES → models/ package
    └─ NO ↓

Does it interact with database/files?
    └─ YES → storage/ package
    └─ NO ↓

Is it a helper method (stateless)?
    └─ YES → utils/ package
    └─ NO ↓

Does it expose functionality to other plugins?
    └─ YES → api/ package
    └─ NO ↓

Does it integrate with third-party plugins?
    └─ YES → hooks/ package
    └─ NO ↓

Is it a scheduled/repeating task?
    └─ YES → tasks/ package
    └─ NO → Reconsider design (might not be needed)
```

### 2.4 The GUI Framework

For any plugin with interactive inventory menus, use this framework. It provides automatic event routing, memory-safe cleanup, and a clean button abstraction.

**InventoryHandler** — the interface all GUIs implement:

```java
public interface InventoryHandler {
    void onClick(InventoryClickEvent event);
    void onOpen(InventoryOpenEvent event);
    void onClose(InventoryCloseEvent event);
}
```

**InventoryButton** — a slot with an icon and a click handler:

```java
public class InventoryButton {
    private Function<Player, ItemStack> iconCreator;
    private Consumer<InventoryClickEvent> eventConsumer;

    public InventoryButton creator(Function<Player, ItemStack> iconCreator) {
        this.iconCreator = iconCreator;
        return this;
    }

    public InventoryButton consumer(Consumer<InventoryClickEvent> eventConsumer) {
        this.eventConsumer = eventConsumer;
        return this;
    }

    public Consumer<InventoryClickEvent> getEventConsumer() { return eventConsumer; }
    public Function<Player, ItemStack> getIconCreator() { return iconCreator; }
}
```

**InventoryGUI** — abstract base with lazy initialization:

```java
public abstract class InventoryGUI implements InventoryHandler {
    private Inventory inventory;
    private final Map<Integer, InventoryButton> buttonMap = new HashMap<>();

    public Inventory getInventory() {
        if (this.inventory == null) {
            this.inventory = this.createInventory();
        }
        return this.inventory;
    }

    public void addButton(int slot, InventoryButton button) {
        this.buttonMap.put(slot, button);
    }

    public void decorate(Player player) {
        this.buttonMap.forEach((slot, button) -> {
            ItemStack icon = button.getIconCreator().apply(player);
            this.getInventory().setItem(slot, icon);
        });
    }

    @Override
    public void onClick(InventoryClickEvent event) {
        event.setCancelled(true);
        InventoryButton button = this.buttonMap.get(event.getSlot());
        if (button != null && button.getEventConsumer() != null) {
            button.getEventConsumer().accept(event);
        }
    }

    @Override
    public void onOpen(InventoryOpenEvent event) {
        this.decorate((Player) event.getPlayer());
    }

    @Override
    public void onClose(InventoryCloseEvent event) {}

    protected abstract Inventory createInventory();
}
```

**GUIManager** — routes events to the correct GUI instance, auto-unregisters on close:

```java
public class GUIManager {
    private final Map<Inventory, InventoryHandler> activeInventories = new HashMap<>();

    public void openGUI(InventoryGUI gui, Player player) {
        this.activeInventories.put(gui.getInventory(), gui);
        player.openInventory(gui.getInventory());
    }

    public void handleClick(InventoryClickEvent event) {
        InventoryHandler handler = this.activeInventories.get(event.getInventory());
        if (handler != null) handler.onClick(event);
    }

    public void handleClose(InventoryCloseEvent event) {
        Inventory inventory = event.getInventory();
        InventoryHandler handler = this.activeInventories.remove(inventory);
        if (handler != null) handler.onClose(event);
    }
}
```

**GUIListener** — bridges Bukkit events to GUIManager:

```java
public class GUIListener implements Listener {
    private final GUIManager guiManager;

    public GUIListener(GUIManager guiManager) {
        this.guiManager = guiManager;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        this.guiManager.handleClick(event);
    }

    @EventHandler
    public void onClose(InventoryCloseEvent event) {
        this.guiManager.handleClose(event);
    }
}
```

---

## 3. The Manager Pattern

### 3.1 What Is a Manager?

A manager is a stateful service object that owns a specific domain of your plugin's functionality. It is instantiated once, held by the main plugin class, and passed by reference to anything that needs it.

Managers are **not** singletons in the traditional sense. They do not have a static `getInstance()`. They are created by the main class and injected into dependents via constructor parameters. This makes them testable, replaceable, and lifecycle-safe.

### 3.2 Initialization Order

**This order is non-negotiable.** Violating it causes `NullPointerException` at startup.

```
1. ConfigManager          ← Everything else reads config. Must be first.
2. DatabaseManager        ← Opens connections. Must be before any data access.
3. CacheManager           ← If you have one. Depends on database.
4. PlayerDataManager      ← Depends on database and config.
5. Domain Managers        ← ShopManager, AuctionManager, etc. Depend on data managers.
6. GUIManager             ← Depends on nothing, but GUIs reference domain managers.
7. CommandRegistry        ← Registers commands. Depends on all managers it delegates to.
8. Listeners              ← Register last. They may fire immediately on registration.
```

### 3.3 The Constructor Pattern

Every manager receives the main plugin instance. This gives it access to all other managers (which are already initialized by the time this manager's constructor runs, per the order above), the logger, the data folder, and the scheduler.

```java
public class PlayerDataManager {

    private final MyPlugin plugin;
    private final DatabaseManager databaseManager;
    private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();

    public PlayerDataManager(MyPlugin plugin) {
        this.plugin = plugin;
        this.databaseManager = plugin.getDatabaseManager();
        initializeSchema();
        loadOnlinePlayers(); // For reloads — players are already online
    }

    private void initializeSchema() {
        databaseManager.execute("""
            CREATE TABLE IF NOT EXISTS player_data (
                uuid VARCHAR(36) PRIMARY KEY,
                name VARCHAR(16) NOT NULL,
                tokens INT DEFAULT 0,
                kills INT DEFAULT 0,
                last_seen BIGINT NOT NULL
            )
        """);
    }

    private void loadOnlinePlayers() {
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            loadPlayer(player.getUniqueId());
        }
    }

    public void saveAll() {
        cache.values().forEach(this::savePlayer);
        cache.clear();
    }
}
```

### 3.4 Dependency Injection vs. Singleton vs. Service Locator

| Pattern | Description | Use in Plugins? |
|---|---|---|
| **Constructor Injection** | Pass dependencies via constructor | ✅ **Preferred** |
| **Setter Injection** | Set dependencies after construction | ⚠️ Only when circular deps force it |
| **Singleton** | Static `getInstance()` on each manager | ❌ Avoid — breaks on reload |
| **Service Locator** | Central registry, look up by type | ⚠️ Only for public API (Section 8) |
| **Plugin as Locator** | `MyPlugin.getInstance().getXManager()` | ✅ Acceptable for plugin-internal use |

**Why not singletons?** When a plugin is reloaded (`/reload` or plugin manager reload), the JVM does not unload the class. Static fields from the old instance persist. The new `onEnable()` creates a new plugin instance but the old static `INSTANCE` may still be referenced by other code. This causes subtle bugs where old data bleeds into the new session.

**The acceptable compromise:** One static `getInstance()` on the main plugin class only. All managers are accessed through it.

```java
// Acceptable
MyPlugin.getInstance().getPlayerDataManager().getPlayerData(uuid);

// Also acceptable — pass manager reference in constructor
public class ShopCommand implements CommandExecutor {
    private final ShopManager shopManager;

    public ShopCommand(ShopManager shopManager) {
        this.shopManager = shopManager;
    }
}
```

### 3.5 Manager Lifecycle Methods

Every manager should implement these three logical phases, even if some are no-ops:

```java
public class ShopManager {

    // Called by constructor — set up schema, load config, warm cache
    private void initialize() { ... }

    // Called periodically or on demand — refresh data, sync state
    public void reload() { ... }

    // Called by onDisable() — flush cache, close resources
    public void shutdown() { ... }
}
```

In `onDisable()`, call shutdown in reverse initialization order:

```java
@Override
public void onDisable() {
    // Reverse of onEnable initialization order
    if (shopManager != null) shopManager.shutdown();
    if (playerDataManager != null) playerDataManager.shutdown();
    if (databaseManager != null) databaseManager.shutdown();
    // ConfigManager has nothing to close
}
```

### 3.6 Common Manager Types

**ConfigManager** — Typed accessors, validation, reload support. Never expose raw `FileConfiguration` to other classes.

**DatabaseManager** — HikariCP connection pool, schema initialization, connection lifecycle.

**CooldownManager** — Track command/action cooldowns with millisecond precision.

**EconomyManager** — Balance operations with atomic updates and event firing.

### 3.7 Manager Anti-Patterns

❌ **God Manager**: One manager doing everything (economy, player data, world management). Split into focused domain managers.

❌ **Stateless Manager**: If a manager has no state, it should be a utility class.

❌ **Circular Dependencies**: `EconomyManager` depends on `PlayerDataManager`, and `PlayerDataManager` depends on `EconomyManager`. Extract a third component both depend on.

---

## 4. Command Architecture

### 4.1 CommandExecutor vs. Extending JavaPlugin

**Never put command logic in the main class.** The main class is a wiring harness. Command logic belongs in dedicated command classes.

### 4.2 The Command Registry

Centralize all command registration in one class. This makes it trivial to see every command your plugin registers.

```java
public class CommandRegistry {

    private final MyPlugin plugin;

    public CommandRegistry(MyPlugin plugin) {
        this.plugin = plugin;
    }

    public void register() {
        bind("shop", new ShopCommand(plugin.getShopManager(), plugin.getGuiManager()));
        bind("tokens", new TokensCommand(plugin.getPlayerDataManager()));
        bind("myplugin", new MainCommand(plugin));
    }

    private void bind(String name, CommandExecutor executor) {
        PluginCommand command = plugin.getCommand(name);
        if (command == null) {
            plugin.getLogger().severe("Command '" + name + "' not found in plugin.yml!");
            return;
        }
        command.setExecutor(executor);
        if (executor instanceof TabCompleter tabCompleter) {
            command.setTabCompleter(tabCompleter);
        }
    }
}
```

### 4.3 Sub-Command Routing

For commands with sub-commands, use a sub-command map pattern. Avoid deeply nested if-else chains.

```java
public class MainCommand implements CommandExecutor, TabCompleter {

    private final Map<String, SubCommand> subCommands = new HashMap<>();

    public MainCommand(MyPlugin plugin) {
        subCommands.put("reload", new ReloadSubCommand(plugin));
        subCommands.put("give", new GiveSubCommand(plugin.getPlayerDataManager()));
        subCommands.put("info", new InfoSubCommand(plugin));
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            sendHelp(sender);
            return true;
        }

        SubCommand sub = subCommands.get(args[0].toLowerCase());
        if (sub == null) {
            sender.sendMessage(ChatColor.RED + "Unknown sub-command. Use /" + label + " help.");
            return true;
        }

        if (!sender.hasPermission(sub.getPermission())) {
            sender.sendMessage(ChatColor.RED + "You don't have permission to do that.");
            return true;
        }

        sub.execute(sender, Arrays.copyOfRange(args, 1, args.length));
        return true;
    }
}
```

**SubCommand interface:**

```java
public interface SubCommand {
    void execute(CommandSender sender, String[] args);
    List<String> tabComplete(CommandSender sender, String[] args);
    String getPermission();
    String getUsage();
    String getDescription();
}
```

### 4.4 Base Command Pattern

Reduce boilerplate with an abstract base command:

```java
public abstract class BaseCommand implements CommandExecutor, TabCompleter {
    protected final MyPlugin plugin;

    public BaseCommand(MyPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public final boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!hasPermission(sender)) {
            sender.sendMessage("§cYou don't have permission to use this command!");
            return true;
        }

        if (requiresPlayer() && !(sender instanceof Player)) {
            sender.sendMessage("§cThis command can only be used by players!");
            return true;
        }

        execute(sender, args);
        return true;
    }

    protected abstract void execute(CommandSender sender, String[] args);
    protected abstract String getPermission();
    protected boolean requiresPlayer() { return false; }

    protected boolean hasPermission(CommandSender sender) {
        String perm = getPermission();
        return perm == null || sender.hasPermission(perm);
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command cmd, String label, String[] args) {
        return Collections.emptyList();
    }
}
```

### 4.5 Permission Strategy

Define all permissions in `plugin.yml`. Never hardcode permission strings in Java — use constants.

```java
public final class Permissions {
    private Permissions() {}

    public static final String SHOP_USE = "myplugin.shop.use";
    public static final String SHOP_ADMIN = "myplugin.shop.admin";
    public static final String TOKENS_GIVE = "myplugin.tokens.give";
    public static final String RELOAD = "myplugin.reload";
}
```

```yaml
# plugin.yml
permissions:
  myplugin.shop.use:
    description: Allows using the shop
    default: true
  myplugin.shop.admin:
    description: Allows admin shop management
    default: op
  myplugin.tokens.give:
    description: Allows giving tokens to players
    default: op
  myplugin.reload:
    description: Allows reloading the plugin
    default: op
```

### 4.6 Input Validation Pattern

Always validate before acting. Return early on invalid input. Never let invalid input reach the service layer.

```java
@Override
public void execute(CommandSender sender, String[] args) {
    // 1. Validate argument count
    if (args.length < 2) {
        sender.sendMessage(ChatColor.RED + "Usage: /tokens give <player> <amount>");
        return;
    }

    // 2. Validate player target
    Player target = Bukkit.getPlayer(args[0]);
    if (target == null) {
        sender.sendMessage(ChatColor.RED + "Player '" + args[0] + "' is not online.");
        return;
    }

    // 3. Validate numeric input
    int amount;
    try {
        amount = Integer.parseInt(args[1]);
    } catch (NumberFormatException e) {
        sender.sendMessage(ChatColor.RED + "'" + args[1] + "' is not a valid number.");
        return;
    }

    if (amount <= 0) {
        sender.sendMessage(ChatColor.RED + "Amount must be positive.");
        return;
    }

    // 4. All valid — delegate to service
    playerDataManager.addTokens(target.getUniqueId(), amount);
    sender.sendMessage(ChatColor.GREEN + "Gave " + amount + " tokens to " + target.getName() + ".");
}
```

---

## 5. Event Listener Architecture

### 5.1 One Listener Per Domain

Do not create a single `EventListener.java` with everything. Group by domain:

| Listener Class | Events It Handles |
|---|---|
| `PlayerConnectionListener` | `PlayerJoinEvent`, `PlayerQuitEvent`, `PlayerKickEvent` |
| `PlayerCombatListener` | `EntityDamageByEntityEvent`, `PlayerDeathEvent` |
| `PlayerInteractListener` | `PlayerInteractEvent`, `PlayerInteractAtEntityEvent` |
| `InventoryListener` | `InventoryClickEvent`, `InventoryCloseEvent` |
| `WorldListener` | `BlockBreakEvent`, `BlockPlaceEvent`, `ChunkLoadEvent` |

For small plugins, grouping related events in one listener (e.g., `ConnectionListener` for join+quit) is acceptable.

### 5.2 Event Priority Reference

```
LOWEST   → First to run. Use for: cancelling events before others see them.
           Example: Anti-cheat cancelling invalid movements.

LOW      → Early processing. Use for: protection plugins checking permissions.
           Example: WorldGuard blocking builds in protected regions.

NORMAL   → Default priority. Use for: most game logic.
           Example: Your shop preventing item pickup in shop areas.

HIGH     → Late processing. Use for: logic that depends on earlier handlers.
           Example: Logging systems that need to know if event was cancelled.

HIGHEST  → Very late. Use for: final overrides.
           Example: Admin bypass that uncancels events for admins.

MONITOR  → Last to run. READ-ONLY. Use for: logging, statistics, auditing.
           NEVER cancel or modify events at MONITOR priority.
```

**Decision rule:** Use `NORMAL` unless you have a specific reason not to. If you're cancelling events, use `LOW` or `LOWEST`. If you're reading final state, use `MONITOR`.

### 5.3 `ignoreCancelled` — Always Set It

```java
// BAD — processes events even when another plugin cancelled them
@EventHandler
public void onBlockBreak(BlockBreakEvent event) { ... }

// GOOD — skips already-cancelled events
@EventHandler(ignoreCancelled = true)
public void onBlockBreak(BlockBreakEvent event) { ... }
```

Always set `ignoreCancelled = true` unless you specifically need to process cancelled events (e.g., an anti-cheat tracking what was attempted).

### 5.4 PlayerMoveEvent — The Performance Killer

`PlayerMoveEvent` fires dozens of times per second per player — including on head rotation. On a 100-player server, that is thousands of calls per second. Naive handling will lag the server.

```java
// BAD — full processing on every tiny movement (including head rotation)
@EventHandler
public void onMove(PlayerMoveEvent event) {
    checkAllRegions(event.getPlayer()); // Expensive! Runs thousands of times/sec
}

// GOOD — only process when the player actually moves to a new block
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Location from = event.getFrom();
    Location to = event.getTo();

    // Head rotation only — from and to have same block coordinates
    if (from.getBlockX() == to.getBlockX()
        && from.getBlockY() == to.getBlockY()
        && from.getBlockZ() == to.getBlockZ()) {
        return;
    }

    // Player moved to a new block — now do your logic
    checkRegionEntry(event.getPlayer(), from, to);
}
```

**Better Alternative:** Use Paper's `PlayerMoveBlockEvent` (Paper 1.21+), which only fires on actual block transitions.

### 5.5 AsyncPlayerChatEvent — Async Pitfall

```java
// BAD: Modifying Bukkit API from async thread
@EventHandler
public void onChat(AsyncPlayerChatEvent event) {
    event.getPlayer().teleport(someLocation); // WILL cause crashes!
}

// GOOD: Schedule sync task for Bukkit API calls
@EventHandler
public void onChat(AsyncPlayerChatEvent event) {
    if (event.getMessage().contains("badword")) {
        event.setCancelled(true); // Safe in async
        Bukkit.getScheduler().runTask(plugin, () -> {
            event.getPlayer().sendMessage("§cWatch your language!"); // Main thread
        });
    }
}
```

### 5.6 Listener Constructor Pattern

Listeners need manager references. Pass them via constructor, not via static access.

```java
public class PlayerConnectionListener implements Listener {

    private final PlayerDataManager playerDataManager;
    private final MyPlugin plugin;

    public PlayerConnectionListener(MyPlugin plugin) {
        this.plugin = plugin;
        this.playerDataManager = plugin.getPlayerDataManager();
    }

    @EventHandler(priority = EventPriority.NORMAL)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        playerDataManager.loadPlayerAsync(player.getUniqueId())
            .thenAccept(data -> {
                Bukkit.getScheduler().runTask(plugin, () -> {
                    applyJoinEffects(player, data);
                });
            });
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        playerDataManager.saveAndUnloadAsync(event.getPlayer().getUniqueId());
    }
}
```

### 5.7 Dynamic Listener Registration

For temporary listeners that should auto-unregister:

```java
public class DynamicListener implements Listener {
    private final MyPlugin plugin;

    public DynamicListener(MyPlugin plugin) {
        this.plugin = plugin;
    }

    public void register() {
        plugin.getServer().getPluginManager().registerEvents(this, plugin);
    }

    public void unregister() {
        HandlerList.unregisterAll(this);
    }
}
```

### 5.8 Keep Listeners Thin

Listeners should be thin coordinators — they detect what happened, then delegate to managers. Never put database queries or business logic directly in event handlers.

---

## 6. Configuration Architecture

### 6.1 Storage Technology Decision Matrix

| Need | Technology | Reason |
|---|---|---|
| Plugin settings, messages | YAML (`config.yml`) | Human-readable, easy to edit |
| Per-player persistent data | SQLite or MySQL | Queryable, scalable |
| Per-player session data | In-memory `ConcurrentHashMap` | Fast, no I/O |
| Cross-server shared data | MySQL or Redis | Network-accessible |
| Large structured datasets | MySQL | Indexing, joins, transactions |
| Simple key-value cache | Redis | Sub-millisecond reads |
| Offline-first small plugin | SQLite | No server setup required |

### 6.2 ConfigManager Pattern

Never call `plugin.getConfig().getString(...)` directly in managers or commands. All config access goes through `ConfigManager`. This gives you one place to add validation, defaults, and type safety.

```java
public class ConfigManager {

    private final MyPlugin plugin;
    private FileConfiguration config;

    public ConfigManager(MyPlugin plugin) {
        this.plugin = plugin;
        plugin.saveDefaultConfig();
        this.config = plugin.getConfig();
        validate();
    }

    public void reload() {
        plugin.reloadConfig();
        this.config = plugin.getConfig();
        validate();
    }

    // Typed accessors — never return raw Object
    public String getPrefix() {
        return colorize(config.getString("prefix", "&8[&bMyPlugin&8]&r"));
    }

    public int getStartingTokens() {
        return config.getInt("economy.starting-tokens", 100);
    }

    public boolean isDebugMode() {
        return config.getBoolean("debug", false);
    }

    public String getDatabaseHost() {
        return config.getString("database.host", "localhost");
    }

    private void validate() {
        int tokens = config.getInt("economy.starting-tokens", -1);
        if (tokens < 0) {
            plugin.getLogger().warning("economy.starting-tokens must be >= 0. Defaulting to 100.");
        }
    }

    private String colorize(String s) {
        return ChatColor.translateAlternateColorCodes('&', s);
    }
}
```

### 6.3 Messages File

Separate messages from config. This allows translation and customization without touching game settings.

```yaml
# resources/messages.yml
prefix: "&8[&bMyPlugin&8]&r "
join: "&aWelcome back, {player}!"
quit: "&7Goodbye, {player}."
no-permission: "&cYou don't have permission to do that."
tokens:
  give-success: "&aGave &e{amount} &atokens to &e{player}&a."
  balance: "&aYour token balance: &e{amount}"
```

```java
public class MessageManager {

    private final MyPlugin plugin;
    private FileConfiguration messages;

    public MessageManager(MyPlugin plugin) {
        this.plugin = plugin;
        File messagesFile = new File(plugin.getDataFolder(), "messages.yml");
        if (!messagesFile.exists()) {
            plugin.saveResource("messages.yml", false);
        }
        this.messages = YamlConfiguration.loadConfiguration(messagesFile);
    }

    public String get(String key) {
        return ChatColor.translateAlternateColorCodes('&',
            messages.getString(key, "&cMissing message: " + key));
    }

    public String get(String key, Map<String, String> placeholders) {
        String message = get(key);
        for (Map.Entry<String, String> entry : placeholders.entrySet()) {
            message = message.replace("{" + entry.getKey() + "}", entry.getValue());
        }
        return message;
    }
}
```

### 6.4 Hot Reload Without Data Loss

A `/reload` command must not lose in-memory data:

```java
public class ReloadSubCommand implements SubCommand {

    private final MyPlugin plugin;

    @Override
    public void execute(CommandSender sender, String[] args) {
        // 1. Reload config files (no data loss — config is read-only at runtime)
        plugin.getConfigManager().reload();
        plugin.getMessageManager().reload();

        // 2. Reload manager settings (re-read config, don't clear caches)
        plugin.getShopManager().reloadConfig();

        sender.sendMessage(ChatColor.GREEN + "Configuration reloaded.");
    }
}
```

**What reload should NOT do:**
- Clear player data caches (players are online, data is live)
- Close and reopen database connections
- Re-register commands or listeners (causes duplicates)
- Call `Bukkit.reload()` or `plugin.reloadPlugin()`
- Disable/enable the plugin (causes memory leaks, duplicate tasks, data corruption)

### 6.5 Configuration Migration (Versioning)

```java
public class ConfigManager {
    private static final int CURRENT_CONFIG_VERSION = 3;

    public void loadConfig() {
        plugin.saveDefaultConfig();
        this.config = plugin.getConfig();

        int version = config.getInt("config-version", 1);
        if (version < CURRENT_CONFIG_VERSION) {
            migrateConfig(version);
        }
    }

    private void migrateConfig(int fromVersion) {
        plugin.getLogger().info("Migrating config from v" + fromVersion + " to v" + CURRENT_CONFIG_VERSION);

        if (fromVersion < 2) {
            // Migration v1 → v2: Rename "money" to "economy"
            if (config.contains("money")) {
                config.set("economy", config.get("money"));
                config.set("money", null);
            }
        }

        if (fromVersion < 3) {
            config.addDefault("features.daily-rewards", true);
        }

        config.set("config-version", CURRENT_CONFIG_VERSION);
        plugin.saveConfig();
    }
}
```

---

## 7. Data Persistence Layer

### 7.1 Storage Interface Pattern

Abstract data persistence behind an interface to decouple business logic from storage:

```java
public interface DataStorage {
    void connect();
    void disconnect();

    void savePlayerData(PlayerData data);
    PlayerData loadPlayerData(UUID uuid);
    void deletePlayerData(UUID uuid);

    void saveAllPlayerData(Collection<PlayerData> data);
    List<PlayerData> loadAllPlayerData();

    List<PlayerData> getTopBalances(int limit);
}

// Implementations
public class MySQLStorage implements DataStorage { /* ... */ }
public class SQLiteStorage implements DataStorage { /* ... */ }
```

### 7.2 DatabaseManager with HikariCP

HikariCP is the industry-standard JDBC connection pool. It manages reusable connections, handles reconnection, and provides health monitoring.

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
            + "?useSSL=false&characterEncoding=utf8");
        config.setUsername(cfg.getDatabaseUser());
        config.setPassword(cfg.getDatabasePassword());

        // Pool sizing — for most plugins, 2-5 connections is sufficient
        config.setMaximumPoolSize(5);
        config.setMinimumIdle(2);
        config.setConnectionTimeout(30_000);
        config.setIdleTimeout(600_000);
        config.setMaxLifetime(1_800_000);

        // Performance settings
        config.addDataSourceProperty("cachePrepStmts", "true");
        config.addDataSourceProperty("prepStmtCacheSize", "250");
        config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
        config.addDataSourceProperty("useServerPrepStmts", "true");

        config.setPoolName("MyPlugin-Pool");

        try {
            this.dataSource = new HikariDataSource(config);
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

### 7.3 SQLite for Single-Server Plugins

If your plugin doesn't need cross-server data, SQLite is simpler — no server setup, no credentials, file-based.

```java
private void connectSQLite() {
    File dbFile = new File(plugin.getDataFolder(), "data.db");

    HikariConfig config = new HikariConfig();
    config.setJdbcUrl("jdbc:sqlite:" + dbFile.getAbsolutePath());
    config.setMaximumPoolSize(1); // SQLite only supports one writer at a time
    config.setConnectionTestQuery("SELECT 1");

    this.dataSource = new HikariDataSource(config);
}
```

### 7.4 Async Query Pattern

**The golden rule:** Never execute database queries on the main thread. Use async for I/O, sync for Bukkit API.

```java
public class PlayerDataManager {

    private final MyPlugin plugin;
    private final DatabaseManager db;
    private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();

    // Load player data asynchronously, cache result
    public CompletableFuture<PlayerData> loadPlayerAsync(UUID uuid) {
        if (cache.containsKey(uuid)) {
            return CompletableFuture.completedFuture(cache.get(uuid));
        }

        return CompletableFuture.supplyAsync(() -> {
            try (Connection conn = db.getConnection();
                 PreparedStatement stmt = conn.prepareStatement(
                     "SELECT * FROM player_data WHERE uuid = ?")) {

                stmt.setString(1, uuid.toString());
                ResultSet rs = stmt.executeQuery();

                if (rs.next()) {
                    PlayerData data = new PlayerData(
                        UUID.fromString(rs.getString("uuid")),
                        rs.getString("name"),
                        rs.getInt("tokens"),
                        rs.getInt("kills"),
                        rs.getLong("last_seen"),
                        false
                    );
                    cache.put(uuid, data);
                    return data;
                } else {
                    PlayerData data = createDefaultData(uuid);
                    insertPlayer(data);
                    cache.put(uuid, data);
                    return data;
                }
            } catch (SQLException e) {
                plugin.getLogger().severe("Failed to load player " + uuid + ": " + e.getMessage());
                return createDefaultData(uuid);
            }
        });
    }

    // Save asynchronously — fire and forget
    public void saveAndUnloadAsync(UUID uuid) {
        PlayerData data = cache.remove(uuid);
        if (data == null) return;

        CompletableFuture.runAsync(() -> {
            try (Connection conn = db.getConnection();
                 PreparedStatement stmt = conn.prepareStatement(
                     "INSERT INTO player_data (uuid, name, tokens, kills, last_seen) " +
                     "VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE " +
                     "name=VALUES(name), tokens=VALUES(tokens), kills=VALUES(kills), last_seen=VALUES(last_seen)")) {

                stmt.setString(1, data.getUuid().toString());
                stmt.setString(2, data.getName());
                stmt.setInt(3, data.getTokens());
                stmt.setInt(4, data.getKills());
                stmt.setLong(5, data.getLastSeen());
                stmt.executeUpdate();

            } catch (SQLException e) {
                plugin.getLogger().severe("Failed to save player " + uuid + ": " + e.getMessage());
            }
        });
    }

    // Synchronous save for onDisable() — server is shutting down, can't use async
    public void saveAll() {
        cache.forEach((uuid, data) -> saveSync(data));
        cache.clear();
    }
}
```

### 7.5 Transaction Management

For operations that modify multiple rows atomically:

```java
public void transferBalance(UUID from, UUID to, double amount) {
    Connection conn = null;
    try {
        conn = databaseManager.getConnection();
        conn.setAutoCommit(false);

        // Deduct from sender
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE player_data SET balance = balance - ? WHERE uuid = ?")) {
            ps.setDouble(1, amount);
            ps.setString(2, from.toString());
            ps.executeUpdate();
        }

        // Add to receiver
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE player_data SET balance = balance + ? WHERE uuid = ?")) {
            ps.setDouble(1, amount);
            ps.setString(2, to.toString());
            ps.executeUpdate();
        }

        conn.commit();
    } catch (SQLException e) {
        if (conn != null) {
            try { conn.rollback(); } catch (SQLException ex) { ex.printStackTrace(); }
        }
        plugin.getLogger().severe("Transaction failed!");
    } finally {
        if (conn != null) {
            try { conn.setAutoCommit(true); conn.close(); } catch (SQLException e) { e.printStackTrace(); }
        }
    }
}
```

### 7.6 Schema Versioning

As your plugin evolves, your database schema changes. Track schema version in the database itself.

```java
private void initializeSchema() {
    db.execute("CREATE TABLE IF NOT EXISTS schema_version (version INT NOT NULL)");

    int currentVersion = getSchemaVersion();
    applyMigrations(currentVersion);
}

private void applyMigrations(int fromVersion) {
    if (fromVersion < 1) {
        db.execute("""
            CREATE TABLE IF NOT EXISTS player_data (
                uuid VARCHAR(36) PRIMARY KEY,
                name VARCHAR(16) NOT NULL,
                tokens INT DEFAULT 0,
                kills INT DEFAULT 0,
                last_seen BIGINT NOT NULL
            )
        """);
        setSchemaVersion(1);
        plugin.getLogger().info("Applied database migration v1.");
    }

    if (fromVersion < 2) {
        db.execute("ALTER TABLE player_data ADD COLUMN playtime BIGINT DEFAULT 0");
        setSchemaVersion(2);
        plugin.getLogger().info("Applied database migration v2.");
    }

    // Add future migrations here — never modify existing migrations
}
```

---

## 8. API Design (For External Plugins)

### 8.1 Why Expose an API?

If other plugins on your server need to interact with your plugin (check a player's tokens, trigger a shop event, query data), they need a stable interface. Without a formal API, they'll call your internal methods directly — and break every time you refactor.

**Design Principles:**
1. **Never expose internal implementation** — only interfaces and events
2. **Version your API** — use deprecation for breaking changes
3. **Document everything** — Javadocs are mandatory
4. **Maintain backward compatibility** — deprecate, don't remove
5. **Provide events** — allow other plugins to react to changes

### 8.2 The API Facade Pattern

```java
// api/MyPluginAPI.java
public class MyPluginAPI {

    private static MyPluginAPI instance;
    private final PlayerDataManager playerDataManager;
    private final ShopManager shopManager;

    // Package-private — only MyPlugin creates this
    MyPluginAPI(MyPlugin plugin) {
        this.playerDataManager = plugin.getPlayerDataManager();
        this.shopManager = plugin.getShopManager();
    }

    static void initialize(MyPlugin plugin) {
        instance = new MyPluginAPI(plugin);
    }

    static void shutdown() {
        instance = null;
    }

    public static MyPluginAPI get() {
        if (instance == null) {
            throw new IllegalStateException("MyPlugin is not enabled.");
        }
        return instance;
    }

    // --- Player Data ---

    /** Returns the token balance for a player, or 0 if no data loaded. */
    public int getTokens(UUID uuid) {
        PlayerData data = playerDataManager.getPlayerData(uuid);
        return data != null ? data.getTokens() : 0;
    }

    /** Adds tokens to a player's balance. @throws IllegalArgumentException if amount is negative */
    public void addTokens(UUID uuid, int amount) {
        if (amount < 0) throw new IllegalArgumentException("Amount cannot be negative.");
        playerDataManager.addTokens(uuid, amount);
    }

    /** Returns true if the player's data is currently loaded in memory. */
    public boolean isDataLoaded(UUID uuid) {
        return playerDataManager.isLoaded(uuid);
    }
}
```

### 8.3 Custom API Events

Expose events so other plugins can react to your plugin's actions:

```java
public class TokensChangeEvent extends Event implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();
    private boolean cancelled = false;
    private final UUID playerUuid;
    private final int previousAmount;
    private int newAmount;
    private final ChangeReason reason;

    public enum ChangeReason { COMMAND, PURCHASE, REWARD, API, ADMIN }

    public TokensChangeEvent(UUID playerUuid, int previousAmount, int newAmount, ChangeReason reason) {
        this.playerUuid = playerUuid;
        this.previousAmount = previousAmount;
        this.newAmount = newAmount;
        this.reason = reason;
    }

    public UUID getPlayerUuid() { return playerUuid; }
    public int getPreviousAmount() { return previousAmount; }
    public int getNewAmount() { return newAmount; }
    public void setNewAmount(int newAmount) { this.newAmount = newAmount; }
    public ChangeReason getReason() { return reason; }

    @Override public boolean isCancelled() { return cancelled; }
    @Override public void setCancelled(boolean cancel) { this.cancelled = cancel; }
    @Override public HandlerList getHandlers() { return HANDLERS; }
    public static HandlerList getHandlerList() { return HANDLERS; }
}
```

**Fire the event before applying the change:**

```java
public boolean addTokens(UUID uuid, int amount) {
    PlayerData data = cache.get(uuid);
    if (data == null) return false;

    TokensChangeEvent event = new TokensChangeEvent(
        uuid, data.getTokens(), data.getTokens() + amount, TokensChangeEvent.ChangeReason.API
    );
    Bukkit.getPluginManager().callEvent(event);

    if (event.isCancelled()) return false;

    data.setTokens(event.getNewAmount());
    return true;
}
```

### 8.4 Services Manager Registration

Register your API as a Bukkit service so external plugins can discover it:

```java
@Override
public void onEnable() {
    // ... other init ...
    MyPluginAPI.initialize(this);

    getServer().getServicesManager().register(
        MyPluginAPI.class,
        MyPluginAPI.get(),
        this,
        ServicePriority.Normal
    );
}

// External plugins access via:
RegisteredServiceProvider<MyPluginAPI> provider =
    Bukkit.getServicesManager().getRegistration(MyPluginAPI.class);
if (provider != null) {
    MyPluginAPI api = provider.getProvider();
    double balance = api.getTokens(playerUUID);
}
```

### 8.5 Soft Dependencies

External plugins that use your API should declare a soft dependency:

```yaml
# Other plugin's plugin.yml
softdepend: [MyPlugin]
```

And check for your plugin before using the API:

```java
if (Bukkit.getPluginManager().getPlugin("MyPlugin") != null) {
    int tokens = MyPluginAPI.get().getTokens(player.getUniqueId());
}
```

---

## 9. Common Anti-Patterns & Fixes

### 9.1 The God Class (MainPlugin Does Everything)

❌ 500+ line main class with all logic mixed in.
✅ Main class is a wiring harness. Each domain has its own manager.

### 9.2 Blocking the Main Thread

❌ Database query directly in `@EventHandler`.
✅ Async load, sync apply via `CompletableFuture` + `Bukkit.getScheduler().runTask()`.

### 9.3 Memory Leaks from Unregistered Listeners

❌ Registering a new listener per player without cleanup.
✅ Use the GUIManager pattern which auto-unregisters on close.

### 9.4 Catching and Swallowing Exceptions

❌ Empty catch blocks or just `e.printStackTrace()`.
✅ Log with context: `plugin.getLogger().severe("Context: " + e.getMessage())`.

### 9.5 Hardcoded Strings Everywhere

❌ Magic strings scattered across 30 files with slight inconsistencies.
✅ All messages in `MessageManager`, all permissions in `Permissions` class.

### 9.6 Not Checking `isOnline()` After Async Operations

❌ NPE when player logged off during the async gap.
✅ Always null-check `Bukkit.getPlayer(uuid)` after async and verify `isOnline()`.

### 9.7 Registering Commands Not in plugin.yml

❌ `getCommand()` returns null → NPE.
✅ Every command registered in code must have a matching entry in `plugin.yml`.

### 9.8 Singleton Anti-Pattern on Managers

❌ Static `getInstance()` on every manager — breaks on reload.
✅ Constructor injection through the main plugin class.

### 9.9 Using HashMap for Concurrent Access

❌ `HashMap` accessed from async and main threads → `ConcurrentModificationException`.
✅ `ConcurrentHashMap` for all caches accessed from multiple threads.

### 9.10 Using `getOfflinePlayer(String)` Carelessly

❌ Blocking web request to Mojang API on main thread.
✅ Use UUID if available, or check online players first.

---

## 10. Thread Safety & Async Patterns

### 10.1 The Main Thread Rule

```
MUST be on main thread:
  ✅ All Bukkit API calls (player.sendMessage, world.getBlockAt, etc.)
  ✅ Inventory manipulation
  ✅ Entity spawning and modification
  ✅ Teleportation
  ✅ Event firing (callEvent)

CAN be on async thread:
  ✅ Database queries (JDBC)
  ✅ HTTP requests
  ✅ File I/O
  ✅ Heavy computation (pathfinding, generation)
  ✅ Reading from thread-safe caches

NEVER on async thread:
  ❌ Bukkit.getPlayer() (use UUID lookup in your cache)
  ❌ player.getInventory().addItem()
  ❌ world.setBlock()
  ❌ entity.teleport()
```

### 10.2 CompletableFuture Pattern (Preferred for Complex Async)

```java
public CompletableFuture<Integer> getTokensAsync(UUID uuid) {
    PlayerData cached = cache.get(uuid);
    if (cached != null) {
        return CompletableFuture.completedFuture(cached.getTokens());
    }

    return CompletableFuture.supplyAsync(() -> {
        try (Connection conn = db.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT tokens FROM player_data WHERE uuid = ?")) {
            stmt.setString(1, uuid.toString());
            ResultSet rs = stmt.executeQuery();
            return rs.next() ? rs.getInt("tokens") : 0;
        } catch (SQLException e) {
            throw new RuntimeException("Database error", e);
        }
    }).exceptionally(e -> {
        plugin.getLogger().severe("Failed to fetch tokens: " + e.getMessage());
        return 0;
    });
}

// Chain operations cleanly
getTokensAsync(player.getUniqueId())
    .thenAccept(tokens -> {
        Bukkit.getScheduler().runTask(plugin, () -> {
            player.sendMessage("You have " + tokens + " tokens.");
        });
    });
```

### 10.3 Thread-Safe Collections

```java
// ❌ BAD: Not thread-safe
private Map<UUID, PlayerData> cache = new HashMap<>();
private List<Player> queue = new ArrayList<>();
private Set<UUID> banned = new HashSet<>();

// ✅ GOOD: Thread-safe
private Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();
private List<Player> queue = new CopyOnWriteArrayList<>();
private Set<UUID> banned = ConcurrentHashMap.newKeySet();
```

**Important:** `ConcurrentHashMap` prevents corruption but does not make compound operations atomic. Use `computeIfAbsent`, `compute`, or `merge`:

```java
// BAD — not atomic, race condition
if (!cache.containsKey(uuid)) {
    cache.put(uuid, createDefault(uuid));
}

// GOOD — atomic
cache.computeIfAbsent(uuid, k -> createDefault(k));
```

### 10.4 Race Conditions in Economy Plugins

Economy operations must be atomic:

```java
// BAD — race condition: two threads both read 100, add 50, write 150
public void addTokens(UUID uuid, int amount) {
    PlayerData data = cache.get(uuid);
    data.setTokens(data.getTokens() + amount);
}

// GOOD — atomic update via compute
public void addTokens(UUID uuid, int amount) {
    cache.compute(uuid, (k, data) -> {
        if (data == null) return null;
        data.setTokens(data.getTokens() + amount);
        return data;
    });
}
```

### 10.5 Paper's Async Scheduler (Paper 1.20.4+)

```java
// Old Bukkit way
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> { /* async */ });

// Paper way — cleaner API
plugin.getServer().getAsyncScheduler().runNow(plugin, task -> { /* async */ });

// With delay
plugin.getServer().getAsyncScheduler().runDelayed(plugin, task -> {
    // Async work after delay
}, 20L, TimeUnit.MILLISECONDS);
```

---

## 11. Session & State Management

### 11.1 Player Session Lifecycle

```
PlayerJoinEvent fires
    │
    ▼
Load player data from DB (async)
    │
    ▼
Cache data in memory (main thread callback)
    │
    ▼
[Player is online — all reads/writes go to cache]
    │
    ▼
PlayerQuitEvent fires
    │
    ▼
Save cache to DB (async)
    │
    ▼
Remove from cache
```

**Never read from the database during active gameplay.** The cache is the source of truth while the player is online.

### 11.2 Confirmation Manager (Pending State)

For operations requiring confirmation (delete, purchase, etc.):

```java
public class ConfirmationManager {

    private final Map<UUID, PendingAction> pendingActions = new HashMap<>();
    private final Map<UUID, BukkitTask> expiryTasks = new HashMap<>();

    public void setPending(Player player, PendingAction action, int timeoutSeconds) {
        UUID uuid = player.getUniqueId();
        cancelPending(uuid);

        pendingActions.put(uuid, action);

        BukkitTask task = Bukkit.getScheduler().runTaskLater(plugin, () -> {
            pendingActions.remove(uuid);
            expiryTasks.remove(uuid);
            player.sendMessage(ChatColor.YELLOW + "Confirmation expired.");
        }, timeoutSeconds * 20L);

        expiryTasks.put(uuid, task);
    }

    public boolean confirm(Player player) {
        UUID uuid = player.getUniqueId();
        PendingAction action = pendingActions.remove(uuid);
        BukkitTask task = expiryTasks.remove(uuid);

        if (action == null) return false;
        if (task != null) task.cancel();

        action.execute(player);
        return true;
    }

    public void cancelPending(UUID uuid) {
        pendingActions.remove(uuid);
        BukkitTask task = expiryTasks.remove(uuid);
        if (task != null) task.cancel();
    }
}
```

### 11.3 Cooldown Management

```java
public class CooldownManager {

    private final Map<UUID, Map<String, Long>> cooldowns = new ConcurrentHashMap<>();

    public boolean isOnCooldown(UUID uuid, String action) {
        Map<String, Long> playerCooldowns = cooldowns.get(uuid);
        if (playerCooldowns == null) return false;

        Long expiry = playerCooldowns.get(action);
        if (expiry == null) return false;

        if (System.currentTimeMillis() >= expiry) {
            playerCooldowns.remove(action);
            return false;
        }
        return true;
    }

    public long getRemainingMillis(UUID uuid, String action) {
        Map<String, Long> playerCooldowns = cooldowns.get(uuid);
        if (playerCooldowns == null) return 0;
        Long expiry = playerCooldowns.get(action);
        if (expiry == null) return 0;
        return Math.max(0, expiry - System.currentTimeMillis());
    }

    public void setCooldown(UUID uuid, String action, long durationMillis) {
        cooldowns.computeIfAbsent(uuid, k -> new ConcurrentHashMap<>())
            .put(action, System.currentTimeMillis() + durationMillis);
    }

    public void clearPlayer(UUID uuid) {
        cooldowns.remove(uuid);
    }
}
```

### 11.4 State Machine Pattern

For systems with defined state transitions (minigames, arenas):

```java
public enum GameState {
    WAITING, STARTING, ACTIVE, ENDING, RESETTING
}

public class GameManager {
    private GameState currentState = GameState.WAITING;

    public void setState(GameState newState) {
        if (!canTransition(currentState, newState)) {
            throw new IllegalStateException("Cannot transition from " + currentState + " to " + newState);
        }

        GameState oldState = currentState;
        currentState = newState;
        onStateChange(oldState, newState);
    }

    private boolean canTransition(GameState from, GameState to) {
        return switch (from) {
            case WAITING -> to == GameState.STARTING;
            case STARTING -> to == GameState.ACTIVE || to == GameState.WAITING;
            case ACTIVE -> to == GameState.ENDING;
            case ENDING -> to == GameState.RESETTING;
            case RESETTING -> to == GameState.WAITING;
        };
    }
}
```

### 11.5 Cache with TTL (Time-To-Live)

```java
public class CachedValue<T> {
    private final T value;
    private final long expiryTime;

    public CachedValue(T value, long ttlMillis) {
        this.value = value;
        this.expiryTime = System.currentTimeMillis() + ttlMillis;
    }

    public T getValue() { return value; }
    public boolean isExpired() { return System.currentTimeMillis() > expiryTime; }
}

public class CacheManager<K, V> {
    private final Map<K, CachedValue<V>> cache = new ConcurrentHashMap<>();
    private final long ttlMillis;

    public CacheManager(long ttlMillis) {
        this.ttlMillis = ttlMillis;
    }

    public void put(K key, V value) {
        cache.put(key, new CachedValue<>(value, ttlMillis));
    }

    public V get(K key) {
        CachedValue<V> cached = cache.get(key);
        if (cached == null) return null;
        if (cached.isExpired()) {
            cache.remove(key);
            return null;
        }
        return cached.getValue();
    }

    public void cleanupExpired() {
        cache.entrySet().removeIf(entry -> entry.getValue().isExpired());
    }
}
```

---

## 12. Plugin Communication Patterns

When your plugin ecosystem spans multiple servers (BungeeCord/Velocity network) or multiple plugins on the same server need to coordinate, you need reliable communication channels. The wrong choice creates tight coupling, race conditions, or data loss.

### 12.1 Communication Pattern Decision Matrix

| Pattern | Latency | Reliability | Complexity | Best For |
|---------|---------|-------------|------------|----------|
| **Bukkit Services Manager** | Instant | Perfect (same JVM) | Low | Same-server plugin-to-plugin API |
| **Custom Events** | Instant | Perfect (same JVM) | Low | Same-server loose coupling |
| **Redis Pub/Sub** | <1ms (local), 1–5ms (LAN) | At-most-once (fire & forget) | Medium | Cross-server real-time notifications |
| **Redis Streams** | <1ms (local), 1–5ms (LAN) | At-least-once (persistent) | Medium | Cross-server event sourcing, replay |
| **Plugin Messaging Channels** | 0ms local, 50ms remote | Delivery via proxy | Medium | BungeeCord/Velocity communication |
| **Database Polling** | 1–60s (poll interval) | At-least-once | Low | Simple cross-server state sync |
| **gRPC / HTTP API** | 1–50ms | At-least-once | High | External service integration |
| **RabbitMQ / NATS** | <1ms (local) | Exactly-once (with acks) | High | Enterprise message queuing |

### 12.2 Bukkit Services Manager (Same-Server)

Register your API as a service so other plugins can discover and use it without hard dependencies:

```java
// Provider plugin — register in onEnable()
getServer().getServicesManager().register(
    MyPluginAPI.class,
    myPluginAPI,
    this,
    ServicePriority.Normal
);

// Consumer plugin — discover in onEnable()
RegisteredServiceProvider<MyPluginAPI> provider =
    getServer().getServicesManager().getRegistration(MyPluginAPI.class);
if (provider != null) {
    MyPluginAPI api = provider.getProvider();
    int tokens = api.getTokens(player.getUniqueId());
}

// Critical: unregister in onDisable()
getServer().getServicesManager().unregister(MyPluginAPI.class, myPluginAPI);
```

**Why ServicesManager over direct getPlugin()?**
- No compile-time dependency — the consumer plugin doesn't need the provider's JAR
- The provider can be absent — consumer degrades gracefully
- Priority system resolves conflicts when multiple providers register the same service
- Cleaner than checking `Bukkit.getPluginManager().getPlugin("PluginName") != null`

### 12.3 Custom Events for Loose Coupling

Events let plugins communicate without knowing about each other. Plugin A fires an event; Plugin B listens. Neither imports the other's classes:

```java
// Plugin A: Fire an event when balance changes
public class BalanceChangeEvent extends Event {
    private static final HandlerList HANDLERS = new HandlerList();
    private final UUID playerUuid;
    private final double oldBalance;
    private double newBalance;
    private boolean cancelled;

    // Constructor, getters, setters...

    @Override public HandlerList getHandlers() { return HANDLERS; }
    public static HandlerList getHandlerList() { return HANDLERS; }
}

// Fire it:
BalanceChangeEvent event = new BalanceChangeEvent(uuid, oldBal, newBal);
Bukkit.getPluginManager().callEvent(event);
if (!event.isCancelled()) {
    // Plugin B (economy logger) might have set newBalance differently
    applyBalance(event.getNewBalance());
}

// Plugin B: Listen without any dependency on Plugin A
@EventHandler
public void onBalanceChange(BalanceChangeEvent event) {
    if (event.getNewBalance() < 0) {
        event.setCancelled(true); // Block negative balances
        getLogger().warning("Blocked negative balance for " + event.getPlayerUuid());
    }
}
```

**The key insight:** Custom events are the most underrated decoupling mechanism in the Bukkit ecosystem. They cost nothing at runtime (a single `HashMap` lookup), they work across plugins without compile-time dependencies, and they're the only way to let third-party plugins modify your plugin's behavior without touching your code.

### 12.4 Redis Pub/Sub for Cross-Server State

When Player A is on Survival and Player B is on Skyblock, and Player A sends a message to Player B, you need cross-server communication:

```java
// Server 1 (Survival) — Player A sends a message
public class RedisMessageBridge {
    private final JedisPool jedisPool;

    public void sendCrossServerMessage(UUID from, UUID to, String message) {
        // 1. Check if recipient is on this server (cache hit -> deliver locally)
        if (localCache.containsKey(to)) {
            Player target = Bukkit.getPlayer(to);
            if (target != null) target.sendMessage(Component.text(message));
            return;
        }

        // 2. Recipient not local — publish to Redis for other servers
        String payload = String.format("%s|%s|%s|%d", from, to, message, System.currentTimeMillis());
        try (Jedis jedis = jedisPool.getResource()) {
            jedis.publish("plugin:cross-server-message", payload);
        }
    }

    // Subscribe on all servers
    public void subscribe() {
        new Thread(() -> {
            try (Jedis jedis = jedisPool.getResource()) {
                jedis.subscribe(new JedisPubSub() {
                    @Override
                    public void onMessage(String channel, String payload) {
                        String[] parts = payload.split("\\|", 4);
                        UUID to = UUID.fromString(parts[1]);

                        // Only deliver if recipient is on THIS server
                        Player target = Bukkit.getPlayer(to);
                        if (target != null) {
                            Bukkit.getScheduler().runTask(plugin, () ->
                                target.sendMessage(Component.text(parts[2]))
                            );
                        }
                    }
                }, "plugin:cross-server-message");
            }
        }, "redis-subscriber-thread").start();
    }
}
```

**Why Redis over MySQL polling?** Polling a database table every second creates 86,400 queries/day per server — even when nothing changes. Redis Pub/Sub is push-based: zero overhead when idle, sub-millisecond delivery when active. The trade-off: Pub/Sub is fire-and-forget (messages are lost if no subscriber is listening). For messages that MUST be delivered, use Redis Streams instead.

### 12.5 Plugin Messaging Channels (BungeeCord/Velocity)

For communication between backend servers through the proxy:

```java
// Register a channel (do once in onEnable())
getServer().getMessenger().registerOutgoingPluginChannel(this, "myplugin:main");
getServer().getMessenger().registerIncomingPluginChannel(this, "myplugin:main",
    (channel, player, message) -> {
        // Called on main thread — safe to use Bukkit API
        ByteArrayDataInput in = ByteStreams.newDataInput(message);
        String subChannel = in.readUTF();
        // Handle the message based on subChannel
    });

// Send a message to another server via the proxy
Player player = /* any online player */;
ByteArrayDataOutput out = ByteStreams.newDataOutput();
out.writeUTF("teleport-request");
out.writeUTF(senderUuid.toString());
out.writeUTF(targetUuid.toString());
player.sendPluginMessage(this, "myplugin:main", out.toByteArray());
```

**Limitations:** Plugin messages are relayed through the proxy and tied to a player connection. They're fine for small control messages (<32KB) but not for bulk data. For large payloads, use Redis or MySQL.

### 12.6 Event Sourcing for Audit Trails

For plugins that need a complete, append-only history of every state change (economy transactions, moderation actions, inventory changes):

```java
// Immutable event record — never modified after creation
public record EconomyEvent(
    UUID eventId,        // UUIDv7 for time-sortable IDs
    UUID playerUuid,
    long timestamp,      // Unix epoch millis
    EventType type,      // DEPOSIT, WITHDRAWAL, TRANSFER_SENT, TRANSFER_RECEIVED
    double amount,
    double balanceAfter, // Snapshot of balance AFTER this event
    UUID relatedPlayer,  // For transfers — the other party
    String source        // COMMAND, SHOP_PURCHASE, DAILY_REWARD, ADMIN_ADJUSTMENT
) {}

// Append-only storage
public void recordEvent(EconomyEvent event) {
    try (Connection conn = ds.getConnection();
         PreparedStatement stmt = conn.prepareStatement(
             "INSERT INTO economy_events (event_id, player_uuid, timestamp, type, "
             + "amount, balance_after, related_player, source) "
             + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)")) {

        stmt.setString(1, event.eventId().toString());
        stmt.setString(2, event.playerUuid().toString());
        stmt.setLong(3, event.timestamp());
        stmt.setString(4, event.type().name());
        stmt.setDouble(5, event.amount());
        stmt.setDouble(6, event.balanceAfter());
        stmt.setString(7, event.relatedPlayer() != null ? event.relatedPlayer().toString() : null);
        stmt.setString(8, event.source());
        stmt.executeUpdate();
    }
}
```

**Why event sourcing?** With a traditional mutable `players` table, a bug that subtracts too much money is unfixable — the original balance is gone. With event sourcing, the current balance is a SUM over all events. Any event can be corrected by appending a compensating event. The event log IS the audit trail — no separate logging system needed.

### 12.7 Circuit Breaker for External Services

When your plugin calls external services (HTTP APIs, remote databases, webhooks), a single slow or failing service can exhaust your connection pool and cascade into a full plugin outage:

```java
public class CircuitBreaker {
    private enum State { CLOSED, OPEN, HALF_OPEN }

    private State state = State.CLOSED;
    private int failureCount = 0;
    private long lastFailureTime = 0;

    private final int failureThreshold;    // e.g., 5 failures
    private final long resetTimeoutMs;     // e.g., 30_000 (30 seconds)
    private final long halfOpenMaxCalls;   // e.g., 3 test calls

    public CircuitBreaker(int failureThreshold, long resetTimeoutMs) {
        this.failureThreshold = failureThreshold;
        this.resetTimeoutMs = resetTimeoutMs;
    }

    public synchronized boolean allowRequest() {
        long now = System.currentTimeMillis();

        switch (state) {
            case CLOSED -> { return true; }

            case OPEN -> {
                if (now - lastFailureTime > resetTimeoutMs) {
                    state = State.HALF_OPEN;
                    failureCount = 0;
                    return true;
                }
                return false; // Circuit is open — fast-fail
            }

            case HALF_OPEN -> {
                return failureCount < halfOpenMaxCalls;
            }
        }
        return false;
    }

    public synchronized void recordSuccess() {
        if (state == State.HALF_OPEN) {
            state = State.CLOSED;
            failureCount = 0;
        }
    }

    public synchronized void recordFailure() {
        failureCount++;
        lastFailureTime = System.currentTimeMillis();

        if (state == State.CLOSED && failureCount >= failureThreshold) {
            state = State.OPEN;
            plugin.getLogger().warning("Circuit breaker OPEN — external service appears down. "
                + "All calls will fast-fail for " + resetTimeoutMs + "ms.");
        } else if (state == State.HALF_OPEN) {
            state = State.OPEN;
        }
    }
}
```

**Usage:**
```java
public void fetchRemoteData() {
    if (!circuitBreaker.allowRequest()) {
        // Fast-fail — use cached/fallback data instead
        return;
    }

    try {
        String result = httpClient.get("https://api.example.com/data");
        circuitBreaker.recordSuccess();
        processResult(result);
    } catch (IOException e) {
        circuitBreaker.recordFailure();
        // Use stale cache, fallback, or queue for retry
    }
}
```

**The critical insight most developers miss:** A circuit breaker isn't about improving performance — it's about preventing cascading failure. Without one, 100 players clicking a button each trigger an HTTP call. If the external API is slow (5s timeout), those 100 calls saturate your connection pool or thread pool. Your plugin's database queries, command handlers, and event listeners — all of which share those pools — start failing. A circuit breaker stops the bleeding within `failureThreshold` attempts, giving the external service time to recover while your plugin continues to function (with degraded features).

---

## 13. Reload Safety: Why /reload Is Dangerous (And What to Do Instead)

### 13.1 What Actually Happens During /reload

`/reload` does NOT restart the JVM. It calls `onDisable()` on every plugin, unloads them, then calls `onEnable()` to reload them. But:

1. **Static fields survive.** The JVM doesn't unload classes. Static `instance` fields from the old plugin instance persist. New `onEnable()` creates a new `MyPlugin` instance, but code holding a reference to the old static field keeps using the old (dead) instance.

2. **Thread pools survive.** `CompletableFuture`'s common ForkJoinPool is never shut down. Your old plugin's async callbacks continue running and try to access managers that have been garbage collected → intermittent, unreproducible NPEs.

3. **Registered listeners may duplicate.** If your `onEnable()` registers listeners and `onDisable()` doesn't unregister them (or `onDisable()` is never called because of a crash), the new `onEnable()` registers a second copy. Each event fires twice.

4. **Scheduled tasks may duplicate.** Same as listeners — if `onDisable()` didn't cancel them, the old tasks keep running alongside the new ones.

5. **Bukkit Services Manager registrations may leak.** If `onDisable()` doesn't call `unregister()`, your service stays registered under the old (dead) instance.

### 13.2 The Only Safe Reload Strategy

**Don't use `/reload`.** It's a blunt instrument that creates more problems than it solves. Instead, implement a **soft reload** command that only reloads what needs reloading:

```java
public class ReloadSubCommand implements SubCommand {
    @Override
    public void execute(CommandSender sender, String[] args) {
        // 1. Reload configuration files (safe — they're read-only at runtime)
        plugin.getConfigManager().reload();
        plugin.getMessageManager().reload();

        // 2. Re-read config-dependent state WITHOUT clearing caches
        plugin.getShopManager().reloadConfig();
        plugin.getDatabaseManager().reconnectIfNeeded(); // Only if config changed

        // 3. NEVER: plugin.reloadConfig() from Bukkit — it opens/closes config
        // 4. NEVER: getServer().reload() — it re-enables ALL plugins
        // 5. NEVER: clear player caches — players are online right now

        sender.sendMessage(Component.text("Configuration reloaded.", NamedTextColor.GREEN));
    }
}
```

**What if you must do a full reload?** Restart the server. A JVM restart is the only truly safe way to unload and reload all plugins. It's faster than `/reload` (clean JVM state) and eliminates all the zombie state problems listed above.

---

## 14. Horizontal Scaling Considerations

When your player base grows beyond what a single server can handle:

### 14.1 Data That Can Be Per-Server vs Must Be Shared

| Data Type | Can Be Per-Server | Must Be Shared | Storage |
|-----------|------------------|----------------|---------|
| Player economy balance | ❌ | ✅ | MySQL/MariaDB |
| Player inventory | ❌ | ✅ | MySQL (serialized) |
| Player session (temporary) | ✅ | ❌ | In-memory / Redis |
| Game world state | ✅ | ❌ | World files (per-server) |
| Kit cooldowns | ❌ | ✅ | Redis (TTL) or MySQL |
| Chat messages | ❌ | ✅ | Redis Pub/Sub for real-time |
| Punishments (bans/mutes) | ❌ | ✅ | MySQL (shared) |
| Leaderboards | ❌ | ✅ | MySQL (materialized or live) |
| Minigame arena state | ✅ | ❌ | In-memory (per-server) |
| Player homes/warps | ❌ | ✅ | MySQL |

### 14.2 The Shared Database Anti-Pattern (And the Fix)

The naive approach — every server reads/writes to the same MySQL instance — works for small networks (2–3 servers, <200 players). At scale, it breaks:

**Problem:** Player A joins Server 1. Server 1 loads their data into its local cache. Player A then switches to Server 2. Server 2 loads the same data — but Server 1 still has a stale copy in its cache. If Server 1 auto-saves, it overwrites Server 2's changes.

**Fix — Optimistic Locking with version column:**
```sql
ALTER TABLE players ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
```

```java
public boolean savePlayerIfUnchanged(PlayerData data) {
    try (Connection conn = ds.getConnection();
         PreparedStatement stmt = conn.prepareStatement(
             "UPDATE players SET balance = ?, last_seen = ?, version = version + 1 "
             + "WHERE uuid = ? AND version = ?")) {

        stmt.setDouble(1, data.getBalance());
        stmt.setLong(2, data.getLastSeen());
        stmt.setString(3, data.getUuid().toString());
        stmt.setLong(4, data.getVersion()); // Only update if version matches

        int updated = stmt.executeUpdate();
        if (updated == 0) {
            // Another server modified this row — our data is stale
            // Reload and reapply changes, or notify the user
            plugin.getLogger().warning("Version conflict for " + data.getUuid()
                + " — data was modified on another server.");
            return false;
        }
        data.setVersion(data.getVersion() + 1);
        return true;
    } catch (SQLException e) {
        return false;
    }
}
```

### 14.3 Feature Flags for Gradual Rollout

When deploying across multiple servers, use feature flags to enable features incrementally:

```java
public class FeatureFlagManager {
    private final Map<String, Boolean> flags = new ConcurrentHashMap<>();

    public void loadFlags() {
        // Load from database or config — shared across all servers
        try (Connection conn = ds.getConnection();
             ResultSet rs = conn.createStatement().executeQuery(
                 "SELECT flag_name, enabled FROM feature_flags")) {
            while (rs.next()) {
                flags.put(rs.getString("flag_name"), rs.getBoolean("enabled"));
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Failed to load feature flags: " + e.getMessage());
        }
    }

    public boolean isEnabled(String flag) {
        return flags.getOrDefault(flag, false);
    }
}

// Usage — gate new features behind flags
if (plugin.getFeatureFlagManager().isEnabled("new-shop-ui")) {
    guiManager.openGUI(new NewShopGUI(shopManager), player);
} else {
    guiManager.openGUI(new LegacyShopGUI(shopManager), player);
}
```

---

## 12. Security Best Practices

### 12.1 Permission Checks

Always check permissions before executing privileged operations. Check in the command handler, not deep in the service layer.

### 12.2 Input Sanitization

Never trust player input. Validate types, ranges, and formats before use.

```java
// Validate string length (prevent database overflow)
if (args[0].length() > 16) {
    sender.sendMessage(ChatColor.RED + "Player name too long.");
    return;
}

// Validate numeric ranges
if (amount > 1_000_000) {
    sender.sendMessage(ChatColor.RED + "Amount cannot exceed 1,000,000.");
    return;
}

// Never use string concatenation in SQL — always use PreparedStatement
// BAD: "SELECT * FROM players WHERE name = '" + playerName + "'" // SQL injection!
// GOOD: PreparedStatement with parameterized queries
```

### 12.3 Economy Integrity

```java
public boolean purchase(UUID uuid, int cost) {
    PlayerData data = cache.get(uuid);
    if (data == null) return false;

    // Check balance before deducting
    if (data.getTokens() < cost) return false;

    // Fire cancellable event — other plugins may block the transaction
    TokensChangeEvent event = new TokensChangeEvent(
        uuid, data.getTokens(), data.getTokens() - cost, TokensChangeEvent.ChangeReason.PURCHASE
    );
    Bukkit.getPluginManager().callEvent(event);
    if (event.isCancelled()) return false;

    data.setTokens(event.getNewAmount());
    return true;
}
```

### 12.4 Rate Limiting

```java
public class RateLimiter {
    private final Map<UUID, Queue<Long>> requestTimes = new ConcurrentHashMap<>();
    private final int maxRequests;
    private final long windowMillis;

    public RateLimiter(int maxRequests, long windowMillis) {
        this.maxRequests = maxRequests;
        this.windowMillis = windowMillis;
    }

    public boolean isAllowed(UUID uuid) {
        long now = System.currentTimeMillis();
        Queue<Long> times = requestTimes.computeIfAbsent(uuid, k -> new ConcurrentLinkedQueue<>());

        times.removeIf(time -> now - time > windowMillis);

        if (times.size() >= maxRequests) {
            return false;
        }

        times.offer(now);
        return true;
    }
}
```

### 12.5 File Path Traversal Prevention

```java
public void loadPlayerFile(String fileName) {
    fileName = fileName.replace("/", "").replace("\\", "");

    if (!fileName.matches("[a-zA-Z0-9_-]+\\.yml")) {
        plugin.getLogger().warning("Invalid file name: " + fileName);
        return;
    }

    File file = new File(plugin.getDataFolder(), fileName);

    try {
        String canonical = file.getCanonicalPath();
        String expected = plugin.getDataFolder().getCanonicalPath();

        if (!canonical.startsWith(expected)) {
            plugin.getLogger().warning("Path traversal attempt: " + fileName);
            return;
        }
    } catch (IOException e) {
        return;
    }
}
```

### 12.6 Logging Security-Relevant Actions

```java
public void giveTokens(CommandSender admin, Player target, int amount) {
    playerDataManager.addTokens(target.getUniqueId(), amount);

    plugin.getLogger().info("[AUDIT] " + admin.getName()
        + " gave " + amount + " tokens to " + target.getName());
}
```

---

## Appendix A: Quick Reference Card

### Startup Checklist

- [ ] Main class only wires dependencies — no logic
- [ ] Managers initialized in dependency order (config → db → data → domain → GUI → commands → listeners)
- [ ] Every manager has a `shutdown()` called in `onDisable()`
- [ ] All commands declared in `plugin.yml`
- [ ] All permissions declared in `plugin.yml`
- [ ] Default config saved with `saveDefaultConfig()`

### Per-Feature Checklist

- [ ] Command: permission check before logic
- [ ] Command: input validated before service call
- [ ] Event handler: `ignoreCancelled = true` set
- [ ] Event handler: correct priority for use case
- [ ] Database query: runs on async thread
- [ ] Bukkit API call after async: scheduled back to main thread
- [ ] Player reference after async: null-checked with `isOnline()`
- [ ] GUI: all clicks cancelled in `onClick()`
- [ ] Economy operation: balance checked before deduction
- [ ] Economy operation: cancellable event fired

### Thread Safety Quick Rules

| Operation | Thread |
|---|---|
| `player.sendMessage()` | Main |
| `player.teleport()` | Main |
| `world.setBlock()` | Main |
| `inventory.addItem()` | Main |
| `Bukkit.callEvent()` | Main |
| JDBC query | Async |
| HTTP request | Async |
| File read/write | Async |
| `cache.get()` (ConcurrentHashMap) | Either |

### Common Mistakes — One Line Each

- **NPE on command:** `getCommand()` returns null → command not in `plugin.yml`
- **Lag on join:** database query on main thread → use async load
- **Dupe exploit:** inventory click not cancelled → `event.setCancelled(true)` first
- **Stale data on reload:** static manager reference → use `getInstance()` pattern
- **Memory leak:** listener registered per-player → use GUIManager pattern
- **Race condition:** `HashMap` with async access → use `ConcurrentHashMap`
- **SQL injection:** string concat in query → use `PreparedStatement`
- **Server freeze:** `getOfflinePlayer(name)` on main thread → use UUID or async

---

## Appendix B: Common AI-Generated Mistakes

AI coding assistants are useful but produce predictable categories of mistakes in Minecraft plugin code. This appendix catalogs them so your team can catch them in code review.

---

### B.1 Main Thread Violations

**What AI generates:** Database queries directly inside `@EventHandler` or command handlers without async wrapping.

**Fix:** `CompletableFuture.supplyAsync(() -> loadFromDb()).thenAccept(data -> runTask(plugin, () -> apply(data)))`

**How to spot:** Any database call, HTTP call, or file I/O inside an `@EventHandler` without a `runTaskAsynchronously` wrapper.

---

### B.2 Missing `plugin.yml` Declarations

**What AI generates:** `plugin.getCommand("x").setExecutor(...)` without declaring `x` in `plugin.yml`. Returns null → NPE.

**Fix:** Every `getCommand("x")` call requires a matching entry in `plugin.yml` under `commands:`.

---

### B.3 Singleton Anti-Pattern on Managers

**What AI generates:** `private static PlayerDataManager instance;` on every manager class.

**Why wrong:** Static instance survives plugin reload. New plugin instance, old manager. Data corruption, memory leaks, NPEs.

**Fix:** Constructor injection. Pass `MyPlugin plugin` to every manager. Access via `MyPlugin.getInstance().getPlayerDataManager()`.

---

### B.4 Swallowed Exceptions

**What AI generates:** `try { riskyOperation(); } catch (Exception e) { e.printStackTrace(); }` or empty catch blocks.

**Fix:** Log with context: `plugin.getLogger().severe("Context about what failed: " + e.getMessage())`. Handle or rethrow appropriately.

---

### B.5 `ChatColor` Deprecation Confusion

**What AI generates:** Mixing `ChatColor.RED` (legacy), `Component.text("Error")` (Adventure), and raw `&c` strings (not colorized) in the same codebase.

**Rule:** Pick one system and be consistent. For legacy `&` codes, use `ChatColor.translateAlternateColorCodes('&', message)`. For Paper Adventure API, use `Component` throughout. Never mix.

---

### B.6 Not Checking `isOnline()` After Async

**What AI generates:**
```java
CompletableFuture.runAsync(() -> loadData(uuid))
    .thenAccept(data -> Bukkit.getScheduler().runTask(plugin, () -> {
        Bukkit.getPlayer(uuid).sendMessage("Done!"); // NPE if player left
    }));
```

**Fix:** Always null-check after async gap: `Player p = Bukkit.getPlayer(uuid); if (p != null && p.isOnline()) p.sendMessage("Done!");`

---

### B.7 Registering Listeners Multiple Times

**What AI generates:** Creating and registering new listener instances in command handlers or per-player interactions.

**Fix:** Register listeners once in `onEnable()`. Use the GUIManager pattern for per-inventory event routing.

---

### B.8 Incorrect `onTabComplete` Return Values

**What AI generates:** `return null;` — causes server to show all online players.

**Fix:** Return `Collections.emptyList()` when there are no completions. Return `null` only if you want default behavior (online player names).

---

### B.9 Using `getConfig()` Directly in Non-Main Classes

**What AI generates:** `MyPlugin.getInstance().getConfig().getInt("max-shops")` in managers.

**Fix:** All config access goes through `ConfigManager`. `ShopManager` calls `plugin.getConfigManager().getMaxShops()`.

---

### B.10 Forgetting to Cancel Scheduled Tasks on Disable

**What AI generates:** `Bukkit.getScheduler().runTaskTimer(this, () -> doWork(), 0L, 200L);` without storing the `BukkitTask` reference.

**Fix:**
```java
private BukkitTask periodicTask;

@Override
public void onEnable() {
    periodicTask = Bukkit.getScheduler().runTaskTimer(this, this::doPeriodicWork, 0L, 200L);
}

@Override
public void onDisable() {
    if (periodicTask != null) periodicTask.cancel();
}
```

---

*End of Minecraft Plugin Architecture Reference Guide*

*Keep this document updated as your team's standards evolve. The best architecture document is one that reflects how your team actually works, not an idealized standard nobody follows.*

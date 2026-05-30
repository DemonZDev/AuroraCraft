# Minecraft Plugin Architecture Reference Guide
## For Internal Development Teams — Paper 1.21.4 / Java 21

---

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

---

[Appendix A: Quick Reference Card](#appendix-a-quick-reference-card)
[Appendix B: Common AI-Generated Mistakes](#appendix-b-common-ai-generated-mistakes)

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

Violations of this separation are the root cause of 80% of plugin maintenance problems. A command handler that directly executes SQL is untestable, unrefactorable, and a security risk.

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

**Critical rule:** If you open it in `onEnable()`, you must close it in `onDisable()`. Database connections, file handles, scheduled tasks, registered services — all of it.

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
        │               ├── utils/
        │               │   ├── MessageUtils.java
        │               │   ├── ItemUtils.java
        │               │   └── TimeUtils.java
        │               └── api/
        │                   └── MyPluginAPI.java
        └── resources/
            ├── plugin.yml
            └── config.yml
```

### 2.2 Package Responsibilities

#### `MyPlugin.java` — The Main Class

**What belongs here:**
- Manager field declarations (with `@Getter` if using Lombok)
- Manager instantiation and initialization in `onEnable()`
- Manager shutdown in `onDisable()`
- Command and listener registration
- Static `getInstance()` accessor (one is acceptable)

**What does NOT belong here:**
- Business logic of any kind
- Direct database calls
- Event handling
- Utility methods
- Configuration parsing beyond "load the file"

```java
// CORRECT — main class is a wiring harness, nothing more
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
        if (databaseManager != null) databaseManager.close();
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

One class per top-level command. Sub-commands live in the same class or in `commands/admin/` for admin-only command trees. No business logic — only input parsing, permission checks, and delegation to managers.

#### `listeners/` — Event Listeners

Group by domain, not by event type. `PlayerConnectionListener` handles join/quit/kick. `PlayerInteractListener` handles clicks, interactions, item use. Do not create one mega-listener with 40 `@EventHandler` methods.

#### `managers/` — Business Logic

The heart of your plugin. Each manager owns one domain. `PlayerDataManager` owns player data — loading, saving, caching, querying. Nothing else touches the database for player data except through this manager.

#### `models/` — Data Classes

Plain Java objects. No Bukkit imports if avoidable. No business logic. Just fields, getters, setters, and constructors. Use Lombok `@Data` or `@Getter @Setter` to eliminate boilerplate.

```java
// models/PlayerData.java
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

#### `inventory/` — GUI Framework

The reusable GUI system (see Section 2.3). Never put game-specific logic in the base classes. Game-specific GUIs go in `inventory/impl/`.

#### `utils/` — Stateless Helpers

Pure static utility methods. No state, no constructor, no plugin reference. If a utility method needs a plugin reference, it belongs in a manager, not utils.

```java
// CORRECT — pure utility
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

### 2.3 The GUI Framework

For any plugin with interactive inventory menus, use this framework. It provides automatic event routing, memory-safe cleanup, and a clean button abstraction.

**InventoryHandler** — the interface all GUIs implement:

```java
// inventory/InventoryHandler.java
package com.yourteam.myplugin.inventory;

import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;

public interface InventoryHandler {
    void onClick(InventoryClickEvent event);
    void onOpen(InventoryOpenEvent event);
    void onClose(InventoryCloseEvent event);
}
```

**InventoryButton** — a slot with an icon and a click handler:

```java
// inventory/InventoryButton.java
package com.yourteam.myplugin.inventory;

import org.bukkit.entity.Player;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.ItemStack;
import java.util.function.Consumer;
import java.util.function.Function;

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

    public Consumer<InventoryClickEvent> getEventConsumer() {
        return this.eventConsumer;
    }

    public Function<Player, ItemStack> getIconCreator() {
        return this.iconCreator;
    }
}
```

**InventoryGUI** — abstract base with lazy initialization:

```java
// inventory/InventoryGUI.java
package com.yourteam.myplugin.inventory;

import org.bukkit.entity.Player;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import java.util.HashMap;
import java.util.Map;

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

**GUIManager** — routes events to the correct GUI instance:

```java
// inventory/gui/GUIManager.java
package com.yourteam.myplugin.inventory.gui;

import com.yourteam.myplugin.inventory.InventoryGUI;
import com.yourteam.myplugin.inventory.InventoryHandler;
import org.bukkit.entity.Player;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.inventory.Inventory;
import java.util.HashMap;
import java.util.Map;

public class GUIManager {
    private final Map<Inventory, InventoryHandler> activeInventories = new HashMap<>();

    public void openGUI(InventoryGUI gui, Player player) {
        this.activeInventories.put(gui.getInventory(), gui);
        player.openInventory(gui.getInventory());
    }

    public void registerHandledInventory(Inventory inventory, InventoryHandler handler) {
        this.activeInventories.put(inventory, handler);
    }

    public void unregisterInventory(Inventory inventory) {
        this.activeInventories.remove(inventory);
    }

    public void handleClick(InventoryClickEvent event) {
        InventoryHandler handler = this.activeInventories.get(event.getInventory());
        if (handler != null) handler.onClick(event);
    }

    public void handleOpen(InventoryOpenEvent event) {
        InventoryHandler handler = this.activeInventories.get(event.getInventory());
        if (handler != null) handler.onOpen(event);
    }

    public void handleClose(InventoryCloseEvent event) {
        Inventory inventory = event.getInventory();
        InventoryHandler handler = this.activeInventories.get(inventory);
        if (handler != null) {
            handler.onClose(event);
            this.unregisterInventory(inventory);
        }
    }
}
```

**GUIListener** — bridges Bukkit events to GUIManager:

```java
// inventory/gui/GUIListener.java
package com.yourteam.myplugin.inventory.gui;

import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;

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
    public void onOpen(InventoryOpenEvent event) {
        this.guiManager.handleOpen(event);
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

Why does this matter? If `PlayerDataManager` is constructed before `DatabaseManager`, its constructor will try to prepare SQL statements against a null connection. The server will log a cryptic NPE and your plugin will be in a broken half-enabled state.

### 3.3 The Constructor Pattern

Every manager receives the main plugin instance. This gives it access to all other managers (which are already initialized by the time this manager's constructor runs, per the order above), the logger, the data folder, and the scheduler.

```java
public class PlayerDataManager {

    private final MyPlugin plugin;
    private final DatabaseManager databaseManager;
    private final Map<UUID, PlayerData> cache = new HashMap<>();

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

**The acceptable compromise:** One static `getInstance()` on the main plugin class only. All managers are accessed through it. This is the "plugin as service locator" pattern and is standard in the Bukkit ecosystem.

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

---

## 4. Command Architecture

### 4.1 CommandExecutor vs. Extending JavaPlugin

**Never put command logic in the main class.** The main class is a wiring harness. Command logic belongs in dedicated command classes.

```java
// BAD — main class handling commands
public class MyPlugin extends JavaPlugin {
    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (cmd.getName().equals("shop")) {
            // 200 lines of shop logic here
        }
        return true;
    }
}

// GOOD — dedicated command class
public class ShopCommand implements CommandExecutor {
    private final ShopManager shopManager;
    private final GUIManager guiManager;

    public ShopCommand(ShopManager shopManager, GUIManager guiManager) {
        this.shopManager = shopManager;
        this.guiManager = guiManager;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("This command requires a player.");
            return true;
        }
        // Delegate to manager, open GUI
        guiManager.openGUI(new ShopGUI(shopManager), player);
        return true;
    }
}
```

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

For commands with sub-commands (`/myplugin reload`, `/myplugin give <player> <amount>`), use a sub-command map pattern. Avoid deeply nested if-else chains.

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

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return subCommands.keySet().stream()
                .filter(name -> sender.hasPermission(subCommands.get(name).getPermission()))
                .filter(name -> name.startsWith(args[0].toLowerCase()))
                .sorted()
                .collect(Collectors.toList());
        }

        SubCommand sub = subCommands.get(args[0].toLowerCase());
        if (sub != null) {
            return sub.tabComplete(sender, Arrays.copyOfRange(args, 1, args.length));
        }

        return Collections.emptyList();
    }

    private void sendHelp(CommandSender sender) {
        sender.sendMessage(ChatColor.GOLD + "=== MyPlugin Commands ===");
        subCommands.forEach((name, sub) -> {
            if (sender.hasPermission(sub.getPermission())) {
                sender.sendMessage(ChatColor.YELLOW + "/" + name + " " + sub.getUsage()
                    + ChatColor.GRAY + " - " + sub.getDescription());
            }
        });
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

### 4.4 Permission Strategy

Define all permissions in `plugin.yml`. Never hardcode permission strings in Java — use constants.

```java
// utils/Permissions.java
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

### 4.5 Input Validation Pattern

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

Do not create a single `EventListener.java` with every event handler in the plugin. Group by domain:

| Listener Class | Events It Handles |
|---|---|
| `PlayerConnectionListener` | `PlayerJoinEvent`, `PlayerQuitEvent`, `PlayerKickEvent` |
| `PlayerCombatListener` | `EntityDamageByEntityEvent`, `PlayerDeathEvent` |
| `PlayerInteractListener` | `PlayerInteractEvent`, `PlayerInteractAtEntityEvent` |
| `InventoryListener` | `InventoryClickEvent`, `InventoryCloseEvent` |
| `WorldListener` | `BlockBreakEvent`, `BlockPlaceEvent`, `ChunkLoadEvent` |

This keeps files small, makes it easy to find handlers, and allows you to enable/disable domains independently.

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
           Example: Recording that a player broke a block for analytics.
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

**Performance impact:** `ignoreCancelled = true` is a free early-exit. If WorldGuard cancels a block break, your handler never runs. Always set it unless you specifically need to process cancelled events (e.g., an anti-cheat that needs to know what was attempted).

### 5.4 PlayerMoveEvent — The Performance Killer

`PlayerMoveEvent` fires dozens of times per second per player. On a 100-player server, that is thousands of calls per second. Naive handling will lag the server.

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

**Further optimization for expensive checks:**

```java
// Throttle expensive checks to once per second per player
private final Map<UUID, Long> lastCheck = new HashMap<>();

@EventHandler
public void onMove(PlayerMoveEvent event) {
    if (sameBlock(event.getFrom(), event.getTo())) return;

    UUID uuid = event.getPlayer().getUniqueId();
    long now = System.currentTimeMillis();

    if (now - lastCheck.getOrDefault(uuid, 0L) < 1000L) return;
    lastCheck.put(uuid, now);

    performExpensiveCheck(event.getPlayer());
}
```

### 5.5 Listener Constructor Pattern

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
        // Load async, apply sync
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

    private void applyJoinEffects(Player player, PlayerData data) {
        // Main thread — safe to use Bukkit API
        player.sendMessage(ChatColor.GREEN + "Welcome back, " + data.getName() + "!");
    }
}
```

---

## 6. Configuration Architecture

### 6.1 Storage Technology Decision Matrix

| Need | Technology | Reason |
|---|---|---|
| Plugin settings, messages | YAML (`config.yml`) | Human-readable, easy to edit |
| Per-player persistent data | SQLite or MySQL | Queryable, scalable |
| Per-player session data | In-memory `HashMap` | Fast, no I/O |
| Cross-server shared data | MySQL or Redis | Network-accessible |
| Large structured datasets | MySQL | Indexing, joins, transactions |
| Simple key-value cache | Redis | Sub-millisecond reads |
| Offline-first small plugin | SQLite | No server setup required |

**Rule of thumb:** If it needs to survive a server restart, use a database. If it needs to be human-editable, use YAML. If it needs to be shared across servers, use MySQL or Redis.

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

    public int getDatabasePort() {
        return config.getInt("database.port", 3306);
    }

    public String getDatabaseName() {
        return config.getString("database.name", "myplugin");
    }

    public String getDatabaseUser() {
        return config.getString("database.user", "root");
    }

    public String getDatabasePassword() {
        return config.getString("database.password", "");
    }

    private void validate() {
        int tokens = config.getInt("economy.starting-tokens", -1);
        if (tokens < 0) {
            plugin.getLogger().warning("economy.starting-tokens must be >= 0. Defaulting to 100.");
        }
        // Add more validation as needed
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
  give-received: "&aYou received &e{amount} &atokens."
  balance: "&aYour token balance: &e{amount}"
```

```java
public class MessageManager {

    private final MyPlugin plugin;
    private FileConfiguration messages;
    private File messagesFile;

    public MessageManager(MyPlugin plugin) {
        this.plugin = plugin;
        this.messagesFile = new File(plugin.getDataFolder(), "messages.yml");
        if (!messagesFile.exists()) {
            plugin.saveResource("messages.yml", false);
        }
        this.messages = YamlConfiguration.loadConfiguration(messagesFile);
    }

    public String get(String key) {
        String raw = messages.getString(key, "&cMissing message: " + key);
        return ChatColor.translateAlternateColorCodes('&', raw);
    }

    public String get(String key, Map<String, String> placeholders) {
        String message = get(key);
        for (Map.Entry<String, String> entry : placeholders.entrySet()) {
            message = message.replace("{" + entry.getKey() + "}", entry.getValue());
        }
        return message;
    }

    public void send(Player player, String key) {
        player.sendMessage(get(key));
    }

    public void send(Player player, String key, Map<String, String> placeholders) {
        player.sendMessage(get(key, placeholders));
    }
}
```

### 6.4 Hot Reload Without Data Loss

A `/reload` command must not lose in-memory data. The correct pattern:

```java
public class ReloadSubCommand implements SubCommand {

    private final MyPlugin plugin;

    @Override
    public void execute(CommandSender sender, String[] args) {
        // 1. Reload config files (no data loss — config is read-only at runtime)
        plugin.getConfigManager().reload();
        plugin.getMessageManager().reload();

        // 2. Reload manager settings (re-read config values, don't clear caches)
        plugin.getShopManager().reloadConfig();

        // 3. Do NOT call plugin.reloadPlugin() — that triggers onDisable/onEnable
        //    which WILL lose in-memory data and close/reopen database connections

        sender.sendMessage(ChatColor.GREEN + "Configuration reloaded.");
    }
}
```

**What reload should NOT do:**
- Clear player data caches (players are online, their data is live)
- Close and reopen database connections
- Re-register commands or listeners (causes duplicates)
- Call `Bukkit.reload()` or `plugin.reloadPlugin()`

---

## 7. Data Persistence Layer

### 7.1 DatabaseManager with HikariCP

HikariCP is the industry-standard JDBC connection pool. It manages a pool of reusable connections, handles reconnection, and provides health monitoring.

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
            + "?useSSL=false&autoReconnect=true&characterEncoding=utf8");
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

    public void execute(String sql) {
        try (Connection conn = getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.execute();
        } catch (SQLException e) {
            plugin.getLogger().severe("SQL error: " + e.getMessage());
        }
    }

    public void shutdown() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
            plugin.getLogger().info("Database connection pool closed.");
        }
    }
}
```

### 7.2 SQLite for Single-Server Plugins

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

### 7.3 Async Query Pattern

**The golden rule:** Never execute database queries on the main thread. Use async for I/O, sync for Bukkit API.

```java
public class PlayerDataManager {

    private final MyPlugin plugin;
    private final DatabaseManager db;
    private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();

    // Load player data asynchronously, cache result
    public CompletableFuture<PlayerData> loadPlayerAsync(UUID uuid) {
        // Return cached data immediately if available
        if (cache.containsKey(uuid)) {
            return CompletableFuture.completedFuture(cache.get(uuid));
        }

        return CompletableFuture.supplyAsync(() -> {
            // This runs on a worker thread — database I/O is fine here
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
                    // New player — create default data
                    PlayerData data = createDefaultData(uuid);
                    insertPlayer(data);
                    cache.put(uuid, data);
                    return data;
                }
            } catch (SQLException e) {
                plugin.getLogger().severe("Failed to load player " + uuid + ": " + e.getMessage());
                return createDefaultData(uuid); // Fallback — don't leave player without data
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

    private void saveSync(PlayerData data) {
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
            plugin.getLogger().severe("Failed to save player data: " + e.getMessage());
        }
    }

    // Cache access — always use cache for reads during gameplay
    public PlayerData getPlayerData(UUID uuid) {
        return cache.get(uuid);
    }

    public boolean isLoaded(UUID uuid) {
        return cache.containsKey(uuid);
    }

    private PlayerData createDefaultData(UUID uuid) {
        return new PlayerData(uuid, Bukkit.getOfflinePlayer(uuid).getName(),
            plugin.getConfigManager().getStartingTokens(), 0, System.currentTimeMillis(), false);
    }
}
```

### 7.4 Schema Versioning

As your plugin evolves, your database schema changes. Track schema version in the database itself.

```java
private void initializeSchema() {
    // Create version tracking table
    db.execute("""
        CREATE TABLE IF NOT EXISTS schema_version (
            version INT NOT NULL
        )
    """);

    int currentVersion = getSchemaVersion();
    applyMigrations(currentVersion);
}

private int getSchemaVersion() {
    try (Connection conn = db.getConnection();
         PreparedStatement stmt = conn.prepareStatement("SELECT version FROM schema_version LIMIT 1");
         ResultSet rs = stmt.executeQuery()) {

        if (rs.next()) return rs.getInt("version");
        return 0; // Fresh install

    } catch (SQLException e) {
        return 0;
    }
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

private void setSchemaVersion(int version) {
    db.execute("DELETE FROM schema_version");
    try (Connection conn = db.getConnection();
         PreparedStatement stmt = conn.prepareStatement("INSERT INTO schema_version VALUES (?)")) {
        stmt.setInt(1, version);
        stmt.execute();
    } catch (SQLException e) {
        plugin.getLogger().severe("Failed to set schema version: " + e.getMessage());
    }
}
```

---

## 8. API Design (For External Plugins)

### 8.1 Why Expose an API?

If other plugins on your server need to interact with your plugin (check a player's tokens, trigger a shop event, query data), they need a stable interface. Without a formal API, they'll call your internal methods directly — and break every time you refactor.

### 8.2 The API Facade Pattern

Create a single class in the `api/` package that exposes only what external plugins should use. Internal implementation can change freely as long as the API contract holds.

```java
// api/MyPluginAPI.java
public class MyPluginAPI {

    private static MyPluginAPI instance;
    private final PlayerDataManager playerDataManager;
    private final ShopManager shopManager;

    // Package-private constructor — only MyPlugin creates this
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

    /**
     * Returns the API instance.
     * @throws IllegalStateException if MyPlugin is not enabled
     */
    public static MyPluginAPI get() {
        if (instance == null) {
            throw new IllegalStateException("MyPlugin is not enabled.");
        }
        return instance;
    }

    // --- Player Data ---

    /**
     * Returns the token balance for a player.
     * Returns 0 if the player has no data loaded.
     */
    public int getTokens(UUID uuid) {
        PlayerData data = playerDataManager.getPlayerData(uuid);
        return data != null ? data.getTokens() : 0;
    }

    /**
     * Adds tokens to a player's balance.
     * @throws IllegalArgumentException if amount is negative
     */
    public void addTokens(UUID uuid, int amount) {
        if (amount < 0) throw new IllegalArgumentException("Amount cannot be negative.");
        playerDataManager.addTokens(uuid, amount);
    }

    /**
     * Returns true if the player's data is currently loaded in memory.
     */
    public boolean isDataLoaded(UUID uuid) {
        return playerDataManager.isLoaded(uuid);
    }
}
```

**Initialize in `onEnable()`, shut down in `onDisable()`:**

```java
@Override
public void onEnable() {
    // ... other init ...
    MyPluginAPI.initialize(this);
}

@Override
public void onDisable() {
    MyPluginAPI.shutdown();
    // ... other shutdown ...
}
```

### 8.3 Custom API Events

Expose events so other plugins can react to your plugin's actions without coupling to your internals.

```java
// api/events/TokensChangeEvent.java
public class TokensChangeEvent extends Event implements Cancellable {

    private static final HandlerList HANDLERS = new HandlerList();
    private boolean cancelled = false;

    private final UUID playerUuid;
    private final int previousAmount;
    private int newAmount;
    private final ChangeReason reason;

    public enum ChangeReason { COMMAND, PURCHASE, REWARD, API }

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
        uuid, data.getTokens(), data.getTokens() + amount,
        TokensChangeEvent.ChangeReason.API
    );
    Bukkit.getPluginManager().callEvent(event);

    if (event.isCancelled()) return false;

    data.setTokens(event.getNewAmount()); // Use event's value — another plugin may have modified it
    return true;
}
```

### 8.4 Soft Dependencies

External plugins that use your API should declare a soft dependency in their `plugin.yml`:

```yaml
# Other plugin's plugin.yml
softdepend: [MyPlugin]
```

And check for your plugin before using the API:

```java
// In the other plugin's onEnable()
if (Bukkit.getPluginManager().getPlugin("MyPlugin") != null) {
    int tokens = MyPluginAPI.get().getTokens(player.getUniqueId());
}
```

---

## 9. Common Anti-Patterns & Fixes

### 9.1 Static Plugin Reference Abuse

```java
// BAD — static fields break on reload, cause memory leaks
public class MyPlugin extends JavaPlugin {
    public static MyPlugin INSTANCE;
    public static PlayerDataManager PLAYER_DATA;

    @Override
    public void onEnable() {
        INSTANCE = this;
        PLAYER_DATA = new PlayerDataManager(this);
    }
}

// Usage in other classes:
MyPlugin.PLAYER_DATA.getTokens(uuid); // Breaks if plugin reloads
```

```java
// GOOD — single static getter, all managers accessed through it
public class MyPlugin extends JavaPlugin {
    @Getter private static MyPlugin instance;
    @Getter private PlayerDataManager playerDataManager;

    @Override
    public void onEnable() {
        instance = this;
        playerDataManager = new PlayerDataManager(this);
    }

    @Override
    public void onDisable() {
        instance = null; // Prevent stale reference
    }
}

// Usage:
MyPlugin.getInstance().getPlayerDataManager().getTokens(uuid);
```

### 9.2 Blocking the Main Thread

```java
// BAD — database query on main thread causes server lag
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    // This blocks the main thread for the duration of the query
    PlayerData data = database.loadPlayerSync(event.getPlayer().getUniqueId());
    event.getPlayer().sendMessage("Welcome back! Tokens: " + data.getTokens());
}
```

```java
// GOOD — async load, sync apply
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    playerDataManager.loadPlayerAsync(player.getUniqueId())
        .thenAccept(data -> {
            // Back on main thread for Bukkit API
            Bukkit.getScheduler().runTask(plugin, () -> {
                if (player.isOnline()) {
                    player.sendMessage("Welcome back! Tokens: " + data.getTokens());
                }
            });
        });
}
```

### 9.3 Memory Leaks from Unregistered Listeners

```java
// BAD — creating new listener instances without registering them properly
// or registering listeners that are never cleaned up
public void openShop(Player player) {
    // This registers a new listener every time a shop is opened!
    Bukkit.getPluginManager().registerEvents(new ShopListener(player), plugin);
}
```

```java
// GOOD — use the GUI framework which auto-unregisters on close
public void openShop(Player player) {
    guiManager.openGUI(new ShopGUI(shopManager), player);
    // GUIManager automatically removes the inventory mapping when closed
}
```

### 9.4 Catching and Swallowing Exceptions

```java
// BAD — silent failure, impossible to debug
try {
    playerDataManager.savePlayer(data);
} catch (Exception e) {
    // nothing
}
```

```java
// GOOD — log with context
try {
    playerDataManager.savePlayer(data);
} catch (SQLException e) {
    plugin.getLogger().severe("Failed to save player data for " + data.getUuid()
        + ": " + e.getMessage());
    // Decide: rethrow? notify admin? fallback?
}
```

### 9.5 Hardcoded Strings Everywhere

```java
// BAD — magic strings scattered across 30 files
player.sendMessage("§cYou don't have permission.");
player.sendMessage("§cYou don't have permission!"); // Slightly different in another file
player.sendMessage("&cNo permission."); // Not even colorized
```

```java
// GOOD — all messages in MessageManager, all permissions in Permissions class
messageManager.send(player, "no-permission");
```

### 9.6 Not Checking `isOnline()` After Async Operations

```java
// BAD — player may have logged off during the async operation
CompletableFuture.runAsync(() -> {
    PlayerData data = loadFromDatabase(uuid);
}).thenAccept(data -> {
    Bukkit.getScheduler().runTask(plugin, () -> {
        Player player = Bukkit.getPlayer(uuid); // Could be null!
        player.sendMessage("Loaded!"); // NullPointerException
    });
});
```

```java
// GOOD — always null-check after async gap
.thenAccept(data -> {
    Bukkit.getScheduler().runTask(plugin, () -> {
        Player player = Bukkit.getPlayer(uuid);
        if (player != null && player.isOnline()) {
            player.sendMessage("Loaded!");
        }
    });
});
```

### 9.7 Registering Commands Not in plugin.yml

```java
// BAD — command registered in code but not declared in plugin.yml
// getCommand() returns null, causes NullPointerException
plugin.getCommand("mycommand").setExecutor(new MyCommand());
```

```yaml
# GOOD — every command registered in code must be in plugin.yml
commands:
  mycommand:
    description: Does something
    usage: /mycommand
    permission: myplugin.mycommand
```

### 9.8 Using `Bukkit.getOfflinePlayer()` Carelessly

```java
// BAD — this makes a blocking web request to Mojang's API if the player
// has never joined the server. Can freeze the main thread for seconds.
OfflinePlayer op = Bukkit.getOfflinePlayer("SomePlayerName");
```

```java
// GOOD — use UUID if you have it (from your database)
OfflinePlayer op = Bukkit.getOfflinePlayer(uuid);

// Or check online players first
Player online = Bukkit.getPlayer("SomePlayerName");
if (online != null) {
    // Use online player
} else {
    // Handle offline case — consider if you really need this
}
```

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
  ✅ Scheduler task registration

CAN be on async thread:
  ✅ Database queries (JDBC)
  ✅ HTTP requests
  ✅ File I/O
  ✅ Heavy computation (pathfinding, generation)
  ✅ Reading from your own thread-safe caches
  ✅ Logging

NEVER on async thread:
  ❌ Bukkit.getPlayer() (use UUID lookup in your cache instead)
  ❌ player.getInventory().addItem()
  ❌ world.setBlock()
  ❌ entity.teleport()
  ❌ Bukkit.getOnlinePlayers() (use your own snapshot)
```

### 10.2 Scheduler Patterns

```java
// Run once on main thread after 1 tick delay
Bukkit.getScheduler().runTaskLater(plugin, () -> {
    // Main thread code
}, 1L);

// Run repeatedly on main thread every 20 ticks (1 second)
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    // Main thread code
}, 0L, 20L);

// Run once on async thread
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    // Async code — no Bukkit API
});

// Run async, then sync callback
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    String result = fetchFromDatabase(); // Async
    Bukkit.getScheduler().runTask(plugin, () -> {
        applyResult(result); // Back on main thread
    });
});
```

### 10.3 CompletableFuture Pattern (Preferred for Complex Async)

```java
public CompletableFuture<Integer> getTokensAsync(UUID uuid) {
    // Check cache first — no I/O needed
    PlayerData cached = cache.get(uuid);
    if (cached != null) {
        return CompletableFuture.completedFuture(cached.getTokens());
    }

    // Cache miss — go to database
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
        return 0; // Safe fallback
    });
}

// Usage — chain operations cleanly
getTokensAsync(player.getUniqueId())
    .thenAccept(tokens -> {
        // This callback runs on the ForkJoinPool thread — schedule back to main
        Bukkit.getScheduler().runTask(plugin, () -> {
            player.sendMessage("You have " + tokens + " tokens.");
        });
    });
```

### 10.4 Thread-Safe Cache

When async threads read from your cache and the main thread writes to it, use `ConcurrentHashMap`:

```java
// BAD — HashMap is not thread-safe
private final Map<UUID, PlayerData> cache = new HashMap<>();

// GOOD — ConcurrentHashMap handles concurrent reads/writes safely
private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();
```

**Important:** `ConcurrentHashMap` prevents corruption but does not make compound operations atomic. If you need to check-then-act atomically, use `computeIfAbsent`, `compute`, or `merge`:

```java
// BAD — not atomic, race condition between get and put
if (!cache.containsKey(uuid)) {
    cache.put(uuid, createDefault(uuid));
}

// GOOD — atomic
cache.computeIfAbsent(uuid, k -> createDefault(k));
```

### 10.5 Race Conditions in Economy Plugins

Economy operations (deduct tokens, add tokens) must be atomic. Two async operations modifying the same player's balance can cause duplication or negative balances.

```java
// BAD — race condition: two threads read 100, both add 50, both write 150
// Result: player gets 50 tokens instead of 100
public void addTokens(UUID uuid, int amount) {
    PlayerData data = cache.get(uuid);
    data.setTokens(data.getTokens() + amount); // Read-modify-write is not atomic
}

// GOOD — use atomic update via compute
public void addTokens(UUID uuid, int amount) {
    cache.compute(uuid, (k, data) -> {
        if (data == null) return null;
        data.setTokens(data.getTokens() + amount);
        return data;
    });
}

// ALSO GOOD — keep economy operations on main thread only
// Since Bukkit events fire on main thread, most economy calls are already safe
// Only async paths need the atomic pattern above
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

**Never read from the database during active gameplay.** The cache is the source of truth while the player is online. The database is the source of truth when the player is offline.

### 11.2 Pending State (Confirmation Dialogs)

For operations requiring confirmation (delete, purchase, etc.), use a pending state map:

```java
public class ConfirmationManager {

    // UUID → pending action
    private final Map<UUID, PendingAction> pendingActions = new HashMap<>();
    private final Map<UUID, BukkitTask> expiryTasks = new HashMap<>();

    public void setPending(Player player, PendingAction action, int timeoutSeconds) {
        UUID uuid = player.getUniqueId();

        // Cancel existing pending action
        cancelPending(uuid);

        pendingActions.put(uuid, action);

        // Auto-expire
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

    private final Map<UUID, Map<String, Long>> cooldowns = new HashMap<>();

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
        cooldowns.computeIfAbsent(uuid, k -> new HashMap<>())
            .put(action, System.currentTimeMillis() + durationMillis);
    }

    public void clearCooldown(UUID uuid, String action) {
        Map<String, Long> playerCooldowns = cooldowns.get(uuid);
        if (playerCooldowns != null) playerCooldowns.remove(action);
    }

    public void clearPlayer(UUID uuid) {
        cooldowns.remove(uuid);
    }
}
```

---

## 12. Security Best Practices

### 12.1 Permission Checks

Always check permissions before executing privileged operations. Check in the command handler, not deep in the service layer.

```java
@Override
public void execute(CommandSender sender, String[] args) {
    // Check permission first, before any processing
    if (!sender.hasPermission(Permissions.TOKENS_GIVE)) {
        messageManager.send((Player) sender, "no-permission");
        return;
    }
    // ... rest of command
}
```

### 12.2 Input Sanitization

Never trust player input. Validate all types, ranges, and formats before use.

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
// BAD:
String sql = "SELECT * FROM players WHERE name = '" + playerName + "'"; // SQL injection!

// GOOD:
PreparedStatement stmt = conn.prepareStatement("SELECT * FROM players WHERE name = ?");
stmt.setString(1, playerName);
```

### 12.3 Economy Integrity

```java
// Always validate before deducting
public boolean purchase(UUID uuid, int cost) {
    PlayerData data = cache.get(uuid);
    if (data == null) return false;

    // Check balance before deducting
    if (data.getTokens() < cost) return false;

    // Fire cancellable event — other plugins may block the transaction
    TokensChangeEvent event = new TokensChangeEvent(
        uuid, data.getTokens(), data.getTokens() - cost,
        TokensChangeEvent.ChangeReason.PURCHASE
    );
    Bukkit.getPluginManager().callEvent(event);
    if (event.isCancelled()) return false;

    // Apply the change
    data.setTokens(event.getNewAmount());
    return true;
}
```

### 12.4 Preventing Inventory Duplication

```java
// In your GUI click handler — always cancel the event first
@Override
public void onClick(InventoryClickEvent event) {
    event.setCancelled(true); // Cancel BEFORE any logic

    // Now handle the click safely
    // Items cannot be moved/stolen because the event is cancelled
}
```

### 12.5 Logging Security-Relevant Actions

```java
// Log admin actions for audit trail
public void giveTokens(CommandSender admin, Player target, int amount) {
    playerDataManager.addTokens(target.getUniqueId(), amount);

    plugin.getLogger().info("[AUDIT] " + admin.getName()
        + " gave " + amount + " tokens to " + target.getName()
        + " (new balance: " + playerDataManager.getPlayerData(target.getUniqueId()).getTokens() + ")");
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

**What AI generates:**
```java
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Connection conn = dataSource.getConnection();
    PreparedStatement stmt = conn.prepareStatement("SELECT * FROM players WHERE uuid = ?");
    stmt.setString(1, event.getPlayer().getUniqueId().toString());
    ResultSet rs = stmt.executeQuery(); // Blocking I/O on main thread
    // ...
}
```

**What it should be:**
```java
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    CompletableFuture.supplyAsync(() -> loadFromDatabase(player.getUniqueId()))
        .thenAccept(data -> Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) applyData(player, data);
        }));
}
```

**How to spot it:** Any database call, HTTP call, or file I/O inside an `@EventHandler` or command handler without a `runTaskAsynchronously` wrapper.

---

### B.2 Missing `plugin.yml` Declarations

**What AI generates:**
```java
// Registers command in code
plugin.getCommand("mycommand").setExecutor(new MyCommand()); // NPE — not in plugin.yml
```

**Fix:** Every `getCommand("x")` call requires a matching entry in `plugin.yml` under `commands:`.

---

### B.3 Singleton Anti-Pattern on Managers

**What AI generates:**
```java
public class PlayerDataManager {
    private static PlayerDataManager instance;

    public static PlayerDataManager getInstance() {
        if (instance == null) instance = new PlayerDataManager();
        return instance;
    }
}
```

**Why it's wrong:** Static instance survives plugin reload. New plugin instance, old manager. Data corruption, memory leaks, NPEs.

**Fix:** Constructor injection. Pass `MyPlugin plugin` to every manager. Access via `MyPlugin.getInstance().getPlayerDataManager()`.

---

### B.4 Swallowed Exceptions

**What AI generates:**
```java
try {
    riskyOperation();
} catch (Exception e) {
    e.printStackTrace(); // Or worse: nothing
}
```

**Fix:**
```java
try {
    riskyOperation();
} catch (SpecificException e) {
    plugin.getLogger().severe("Context about what failed: " + e.getMessage());
    // Handle or rethrow appropriately
}
```

---

### B.5 `ChatColor` Deprecation Confusion

**What AI generates (wrong for Paper 1.21):**
```java
player.sendMessage(ChatColor.RED + "Error message"); // Works but legacy
```

**What AI sometimes generates (wrong syntax):**
```java
player.sendMessage(Component.text("Error message").color(NamedTextColor.RED)); // Correct Adventure API
// But then mixes with:
player.sendMessage("&cError message"); // Legacy — won't render colors
```

**Rule:** Pick one system and be consistent. For teams using legacy `&` codes, use `ChatColor.translateAlternateColorCodes('&', message)`. For Paper Adventure API, use `Component` throughout. Never mix.

---

### B.6 Not Checking `isOnline()` After Async

**What AI generates:**
```java
CompletableFuture.runAsync(() -> {
    PlayerData data = loadData(uuid);
    Bukkit.getScheduler().runTask(plugin, () -> {
        Bukkit.getPlayer(uuid).sendMessage("Done!"); // NPE if player left
    });
});
```

**Fix:** Always null-check:
```java
Bukkit.getScheduler().runTask(plugin, () -> {
    Player p = Bukkit.getPlayer(uuid);
    if (p != null && p.isOnline()) p.sendMessage("Done!");
});
```

---

### B.7 Registering Listeners Multiple Times

**What AI generates:**
```java
// Called on every command execution
public void openShop(Player player) {
    Bukkit.getPluginManager().registerEvents(new ShopListener(player), plugin);
    // New listener registered every time — old ones never unregistered
}
```

**Fix:** Register listeners once in `onEnable()`. Use the GUIManager pattern for per-inventory event routing.

---

### B.8 Incorrect `onTabComplete` Return Values

**What AI generates:**
```java
@Override
public List<String> onTabComplete(...) {
    return null; // Causes server to show all online players
}
```

**Fix:** Return `Collections.emptyList()` when there are no completions. Return `null` only if you want the default behavior (online player names).

---

### B.9 Using `getConfig()` Directly in Non-Main Classes

**What AI generates:**
```java
public class ShopManager {
    public void loadShops() {
        // Reaches into plugin internals from a manager
        int maxShops = MyPlugin.getInstance().getConfig().getInt("max-shops");
    }
}
```

**Fix:** All config access goes through `ConfigManager`. `ShopManager` calls `plugin.getConfigManager().getMaxShops()`.

---

### B.10 Forgetting to Cancel Scheduled Tasks on Disable

**What AI generates:**
```java
@Override
public void onEnable() {
    Bukkit.getScheduler().runTaskTimer(this, () -> {
        doPeriodicWork();
    }, 0L, 200L);
    // Task ID never stored — can't cancel on disable
}
```

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
# Minecraft Plugin API Correctness Guide
## Paper 1.21.4 — Bukkit / Spigot / Paper API Reference

> **Purpose:** Authoritative offline reference for Java developers using AI coding assistants.
> Covers every common API scenario, anti-pattern, and version-specific behavior in Paper 1.21.4 plugin development.
> **Last Updated:** Paper 1.21.4 | Java 21

---

## Table of Contents

1. [API Hierarchy & Compatibility](#1-api-hierarchy--compatibility)
2. [Event API](#2-event-api)
3. [Player API](#3-player-api)
4. [Command API](#4-command-api)
5. [Inventory & GUI API](#5-inventory--gui-api)
6. [Scheduler & Async API](#6-scheduler--async-api)
7. [Configuration API](#7-configuration-api)
8. [Adventure API (Modern Components)](#8-adventure-api-modern-components)
9. [PersistentDataContainer](#9-persistentdatacontainer)
10. [API Confusion Matrix](#10-api-confusion-matrix)
11. [Appendix A: Quick API Reference Card](#appendix-a-quick-api-reference-card)
12. [Appendix B: Version Compatibility Table](#appendix-b-version-compatibility-table)
13. [Appendix C: AI API Mistake Catalog](#appendix-c-ai-api-mistake-catalog)

---

## 1. API Hierarchy & Compatibility

### 1.1 Bukkit → Spigot → Paper → Forks

The Minecraft server plugin ecosystem is layered. Each layer **extends** the one below it — you always have access to lower-layer APIs when running on a higher-layer server.

```
org.bukkit.*                          ← Bukkit (base API, CraftBukkit implements it)
├── org.spigotmc.*                    ← Spigot (adds Spigot-specific features)
│   └── com.destroystokyo.paper.*    ← Paper legacy namespace (pre-1.17 additions)
│       io.papermc.paper.*           ← Paper modern namespace (1.17+ additions)
│       └── org.purpurmc.purpur.*    ← Purpur fork
│           org.folia.*              ← Folia (regionized threading, incompatible scheduler)
│           gg.pufferfish.*          ← Pufferfish fork
```

**Key rule:** Code written against `org.bukkit` runs on Bukkit, Spigot, Paper, and all forks.
Code written against `io.papermc.paper` **only** runs on Paper and Paper-based forks.

### 1.2 Runtime API Detection

Detect the server implementation at runtime before calling platform-specific APIs:

```java
public enum ServerPlatform {
    PAPER, SPIGOT, BUKKIT, FOLIA, UNKNOWN;

    private static ServerPlatform detected = null;

    public static ServerPlatform detect() {
        if (detected != null) return detected;

        try {
            Class.forName("io.papermc.paper.threadedregions.RegionizedServer");
            return detected = FOLIA;
        } catch (ClassNotFoundException ignored) {}

        try {
            // Modern namespace (Paper 1.17+)
            Class.forName("io.papermc.paper.PaperConfig");
            return detected = PAPER;
        } catch (ClassNotFoundException ignored) {}

        try {
            // Legacy namespace (Paper pre-1.17 — kept for backward compat)
            Class.forName("com.destroystokyo.paper.PaperConfig");
            return detected = PAPER;
        } catch (ClassNotFoundException ignored) {}

        try {
            Class.forName("org.spigotmc.SpigotConfig");
            return detected = SPIGOT;
        } catch (ClassNotFoundException ignored) {}

        return detected = BUKKIT;
    }

    public static boolean isPaper() {
        return detect() == PAPER || detect() == FOLIA;
    }

    public static boolean isFolia() {
        return detect() == FOLIA;
    }
}
```

**Graceful degradation pattern:**

```java
public void sendComponentMessage(Player player, String miniMessageText) {
    if (ServerPlatform.isPaper()) {
        MiniMessage mm = MiniMessage.miniMessage();
        player.sendMessage(mm.deserialize(miniMessageText));
    } else {
        String stripped = miniMessageText.replaceAll("<[^>]+>", "");
        player.sendMessage(ChatColor.translateAlternateColorCodes('&', stripped));
    }
}
```

### 1.3 api-version in plugin.yml

The `api-version` field is a **declaration of compatibility** that affects how the server loads your plugin.

```yaml
api-version: "1.21"
```

| Scenario | Result |
|---|---|
| `api-version` omitted | Server loads plugin with **legacy warning**. Compatibility mode. |
| `api-version: "1.13"` | Accepted on 1.13+. Enables modern Material enum (no `LEGACY_*` prefixes). |
| `api-version: "1.21"` | Rejected on servers older than 1.21. Accepted on 1.21.x (minor versions not checked). |
| `api-version: "1.22"` on 1.21.4 | **Rejected** — server version is lower than declared. |

**Trade-off:**
- Lower `api-version` (e.g., `"1.16"`) → Maximum compatibility, legacy mappings for some materials
- Higher `api-version` (e.g., `"1.21"`) → Modern mappings, full feature access, narrower server compatibility

**Recommendation:** Set to the OLDEST Minecraft version you support. If you only support 1.21+, use `"1.21"`.

---

## 2. Event API

### 2.1 Event Priority Selection

```
LOWEST   → First to run. Cancel events here if you need absolute priority.
LOW      → Early processing. Protection plugins, region checks.
NORMAL   → Default. Most game logic goes here.
HIGH     → Late processing. React to changes from earlier handlers.
HIGHEST  → Very late. Final overrides, admin bypass logic.
MONITOR  → READ-ONLY. Last to run. Use ONLY for logging/statistics/auditing.
           NEVER cancel or modify events at MONITOR.
```

**Priority selection decision tree:**

```
Are you cancelling the event?
├── YES → LOW or LOWEST (cancel before other plugins process it)
│
└── NO → Are you modifying the event?
    ├── YES → NORMAL (default, works in most cases)
    │
    └── NO → Are you only observing/logging?
        └── YES → MONITOR (after all modifications complete)
```

### 2.2 ignoreCancelled Parameter

```java
// Skips already-cancelled events (free performance win)
@EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
public void onBlockBreak(BlockBreakEvent event) {
    statisticsManager.recordBlockBreak(event.getPlayer(), event.getBlock().getType());
}

// Processes even cancelled events (anti-cheat tracking)
@EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = false)
public void onBlockBreak(BlockBreakEvent event) {
    // Track what was attempted, even if blocked
}
```

**Behavior matrix:**

| ignoreCancelled | Event Cancelled | Handler Runs? | Use Case |
|----------------|----------------|---------------|----------|
| `true` | Yes | ❌ Skipped | Logging, statistics |
| `true` | No | ✅ Runs | Normal operation |
| `false` | Yes | ✅ Runs | Anti-cheat, un-cancel logic |
| `false` | No | ✅ Runs | Normal operation |

### 2.3 EventHandler Best Practices

```java
// BAD: Heavy processing on every tiny movement (including head rotation)
@EventHandler
public void onMove(PlayerMoveEvent event) {
    checkAllRegions(event.getPlayer()); // Runs thousands of times/sec
}

// GOOD: Only process on actual block transitions
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Location from = event.getFrom();
    Location to = event.getTo();
    if (from.getBlockX() == to.getBlockX()
        && from.getBlockY() == to.getBlockY()
        && from.getBlockZ() == to.getBlockZ()) {
        return; // Head rotation only — skip
    }
    checkRegionEntry(event.getPlayer(), from, to);
}

// BETTER: Use Paper's PlayerMoveBlockEvent (Paper 1.21+)
@EventHandler
public void onMoveBlock(PlayerMoveBlockEvent event) {
    checkRegionEntry(event.getPlayer(), event.getFrom(), event.getTo());
}
```

### 2.4 Custom Events

```java
public class TokensChangeEvent extends Event implements Cancellable {
    private static final HandlerList HANDLERS = new HandlerList();
    private boolean cancelled = false;
    private final UUID playerUuid;
    private final int previousAmount;
    private int newAmount;
    private final ChangeReason reason;

    public enum ChangeReason { COMMAND, PURCHASE, REWARD, API, ADMIN }

    // Constructor, getters, setters...

    // CRITICAL: Both of these are required for every custom event
    @Override public HandlerList getHandlers() { return HANDLERS; }
    public static HandlerList getHandlerList() { return HANDLERS; }
}

// Fire the event
TokensChangeEvent event = new TokensChangeEvent(uuid, oldAmount, newAmount, reason);
Bukkit.getPluginManager().callEvent(event);
if (!event.isCancelled()) {
    applyChange(event.getNewAmount()); // Use potentially-modified value
}
```

### 2.5 AsyncPlayerChatEvent — Async Pitfall

```java
@EventHandler
public void onChat(AsyncPlayerChatEvent event) {
    // This event fires ASYNC — most Bukkit API calls are unsafe here
    if (event.getMessage().contains("badword")) {
        event.setCancelled(true); // Safe: modifying the event object itself

        // Schedule sync for Bukkit API
        Bukkit.getScheduler().runTask(plugin, () -> {
            event.getPlayer().sendMessage("§cWatch your language!");
        });
    }
}
```

---

## 3. Player API

### 3.1 getPlayer() vs getOfflinePlayer()

```java
// Online only — returns null if player is offline (safe, fast)
Player player = Bukkit.getPlayer(uuid);
Player playerByName = Bukkit.getPlayer("PlayerName");

// Offline access — works for any player who has ever joined
// WARNING: Bukkit.getOfflinePlayer(String) makes a BLOCKING web request
// to Mojang API if the player has never joined. Use UUID variant.
OfflinePlayer offlineByUuid = Bukkit.getOfflinePlayer(uuid);    // Safe
OfflinePlayer offlineByName = Bukkit.getOfflinePlayer("Name");   // BLOCKING if never joined!
```

### 3.2 Async Player Validation

Always check `isOnline()` after an async gap:

```java
CompletableFuture.supplyAsync(() -> loadFromDatabase(uuid))
    .thenAcceptAsync(data -> {
        Player player = Bukkit.getPlayer(uuid);
        if (player != null && player.isOnline()) {
            player.sendMessage("Data loaded!");
        }
    }, runnable -> Bukkit.getScheduler().runTask(plugin, runnable));
```

### 3.3 EntityDamageEvent: getDamage() vs getFinalDamage()

```java
@EventHandler
public void onDamage(EntityDamageEvent event) {
    // getDamage() — the raw damage amount BEFORE armor/enchantment reduction
    double rawDamage = event.getDamage();

    // getFinalDamage() — the ACTUAL damage AFTER armor, enchantments, effects
    double finalDamage = event.getFinalDamage();

    // Use getFinalDamage() for accurate tracking of damage dealt
}
```

### 3.4 Time Conversion Helpers

```java
public final class TimeUtils {
    private TimeUtils() {}

    // Ticks ↔ seconds (20 ticks = 1 second)
    public static long secondsToTicks(long seconds) { return seconds * 20L; }
    public static long ticksToSeconds(long ticks) { return ticks / 20L; }

    // Ticks ↔ minutes
    public static long minutesToTicks(long minutes) { return minutes * 20L * 60L; }

    // Format ticks as human-readable
    public static String formatTicks(long ticks) {
        long seconds = ticks / 20;
        long minutes = seconds / 60;
        long hours = minutes / 60;
        return String.format("%02d:%02d:%02d", hours, minutes % 60, seconds % 60);
    }
}
```

---

## 4. Command API

### 4.1 Command Registration Requirements

Every command registered in code must be declared in `plugin.yml`:

```yaml
commands:
  mycommand:
    description: Does something
    usage: /mycommand [args]
    permission: myplugin.mycommand
    aliases: [mc, mycmd]
```

```java
// In code — getCommand() returns null if not in plugin.yml!
PluginCommand cmd = plugin.getCommand("mycommand");
if (cmd != null) {
    cmd.setExecutor(new MyCommand());
}
```

### 4.2 Command Registration Methods

**Method 1: plugin.yml + getCommand()** — Standard, recommended for all projects.

**Method 2: Brigadier (Paper 1.20.6+)** — Modern command framework with rich suggestions:

```java
@Override
public void onEnable() {
    BrigadierCommand brigadier = getServer().getBrigadierCommand();
    brigadier.getDispatcher().register(
        literal("mycommand")
            .then(argument("target", StringArgumentType.word())
                .suggests((ctx, builder) -> {
                    for (Player p : getServer().getOnlinePlayers()) {
                        builder.suggest(p.getName());
                    }
                    return builder.buildFuture();
                })
                .executes(ctx -> {
                    String target = StringArgumentType.getString(ctx, "target");
                    ctx.getSource().getSender().sendMessage("Target: " + target);
                    return 1;
                })
            )
    );
}
```

### 4.3 Input Validation Pattern

```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    // 1. Player-only check
    if (!(sender instanceof Player player)) {
        sender.sendMessage("§cThis command is for players only!");
        return true;
    }

    // 2. Permission check
    if (!sender.hasPermission("myplugin.command")) {
        sender.sendMessage("§cYou don't have permission!");
        return true;
    }

    // 3. Argument count
    if (args.length < 2) {
        sender.sendMessage("§cUsage: /command <player> <amount>");
        return true;
    }

    // 4. Target validation
    Player target = Bukkit.getPlayer(args[0]);
    if (target == null) {
        sender.sendMessage("§cPlayer '" + args[0] + "' is not online.");
        return true;
    }

    // 5. Numeric validation
    int amount;
    try {
        amount = Integer.parseInt(args[1]);
    } catch (NumberFormatException e) {
        sender.sendMessage("§c'" + args[1] + "' is not a valid number.");
        return true;
    }

    if (amount <= 0) {
        sender.sendMessage("§cAmount must be positive.");
        return true;
    }

    // 6. Execute
    performAction(player, target, amount);
    return true;
}
```

### 4.4 Tab Completion

```java
@Override
public List<String> onTabComplete(CommandSender sender, Command cmd, String label, String[] args) {
    if (args.length == 1) {
        // Return online player names matching input
        return Bukkit.getOnlinePlayers().stream()
            .map(Player::getName)
            .filter(name -> name.toLowerCase().startsWith(args[0].toLowerCase()))
            .sorted()
            .collect(Collectors.toList());
    }

    // Return empty list (not null!) for no completions
    return Collections.emptyList();
}
```

**Critical:** Return `Collections.emptyList()` for no completions, not `null`. Returning `null` shows all online player names as the default behavior.

---

## 5. Inventory & GUI API

### 5.1 Creating an Inventory

```java
// Basic inventory
Inventory inv = Bukkit.createInventory(null, 27, "§lMy Title");

// Player-specific inventory
Inventory inv = Bukkit.createInventory(player, 54, "Player's Inventory");

// Inventory type
Inventory inv = Bukkit.createInventory(null, InventoryType.HOPPER, "Filter");
```

### 5.2 GUI Click Handling

```java
@EventHandler
public void onInventoryClick(InventoryClickEvent event) {
    // Always cancel first to prevent item movement/duplication
    event.setCancelled(true);

    // Check if this is our GUI
    if (!(event.getInventory().getHolder() instanceof MyGUI)) return;

    // Handle the click
    int slot = event.getSlot();
    ItemStack clicked = event.getCurrentItem();
    if (clicked == null || clicked.getType() == Material.AIR) return;

    handleButtonClick(slot, (Player) event.getWhoClicked());
}
```

### 5.3 Inventory Full Handling

```java
public void giveItemOrDrop(Player player, ItemStack item) {
    HashMap<Integer, ItemStack> overflow = player.getInventory().addItem(item);
    if (!overflow.isEmpty()) {
        // Inventory full — drop overflow items at player's feet
        for (ItemStack overflowItem : overflow.values()) {
            player.getWorld().dropItemNaturally(player.getLocation(), overflowItem);
        }
        player.sendMessage("§eYour inventory was full — items dropped at your feet.");
    }
}
```

---

## 6. Scheduler & Async API

### 6.1 Bukkit Scheduler

```java
// Run once on main thread (next tick)
Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage("Hello!"));

// Run once after delay (20 ticks = 1 second)
Bukkit.getScheduler().runTaskLater(plugin, () -> doWork(), 20L);

// Run repeatedly (every 1 second, starting now)
BukkitTask task = Bukkit.getScheduler().runTaskTimer(plugin, () -> tick(), 0L, 20L);

// Run async (NO Bukkit API calls inside!)
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    String result = fetchFromDatabase(); // OK — I/O on async thread
    Bukkit.getScheduler().runTask(plugin, () -> {
        player.sendMessage(result); // Main thread
    });
});

// Cancel when done
task.cancel();
```

### 6.2 Paper Async Scheduler (Paper 1.20.4+)

```java
// Modern async API
plugin.getServer().getAsyncScheduler().runNow(plugin, task -> {
    // Async work
});

// With delay
plugin.getServer().getAsyncScheduler().runDelayed(plugin, task -> {
    // Async work after delay
}, 1L, TimeUnit.SECONDS);
```

### 6.3 Paper Region/Entity Schedulers

```java
// Region scheduler — runs on the region's thread (required for Folia)
player.getScheduler().run(plugin, task -> {
    player.sendMessage("Running on " + player.getName() + "'s region thread");
}, null);

// Entity scheduler
entity.getScheduler().run(plugin, task -> {
    entity.setGlowing(true);
}, null);
```

### 6.4 Thread Safety Rule

```
MUST be on main thread:
  ✅ Bukkit API calls (sendMessage, teleport, setBlock, etc.)
  ✅ Inventory manipulation
  ✅ Entity spawning/modification
  ✅ Event firing

CAN be on async thread:
  ✅ Database queries (JDBC)
  ✅ HTTP requests
  ✅ File I/O
  ✅ Heavy computation
  ✅ Reading from ConcurrentHashMap caches
```

---

## 7. Configuration API

### 7.1 Loading Configuration

```java
@Override
public void onEnable() {
    // Creates config.yml from resources if it doesn't exist
    saveDefaultConfig();

    // Access config values
    String host = getConfig().getString("database.host", "localhost");
    int port = getConfig().getInt("database.port", 3306);

    // Custom config files
    File messagesFile = new File(getDataFolder(), "messages.yml");
    if (!messagesFile.exists()) {
        saveResource("messages.yml", false);
    }
    FileConfiguration messages = YamlConfiguration.loadConfiguration(messagesFile);
}
```

### 7.2 Item Serialization in Config

```java
// Serialize item to YAML
ItemStack item = new ItemStack(Material.DIAMOND_SWORD);
Map<String, Object> serialized = item.serialize();

// Save to config
config.set("reward-item", serialized);
saveConfig();

// Deserialize from config
Map<String, Object> map = config.getConfigurationSection("reward-item").getValues(false);
ItemStack restored = ItemStack.deserialize(map);
```

### 7.3 PersistentDataContainer (PDC)

PDC stores custom data directly on entities, items, and blocks without needing a database:

```java
// Create a custom key
NamespacedKey key = new NamespacedKey(plugin, "custom_id");

// Store data on an item
ItemStack item = new ItemStack(Material.DIAMOND);
ItemMeta meta = item.getItemMeta();
meta.getPersistentDataContainer().set(key, PersistentDataType.STRING, "unique-item-id");
item.setItemMeta(meta);

// Read data back
String id = item.getItemMeta().getPersistentDataContainer()
    .get(key, PersistentDataType.STRING);

// Custom compact UUID type (16 bytes vs 36 bytes as string)
PersistentDataType<byte[], UUID> UUID_TYPE = new PersistentDataType<>() {
    @Override
    public Class<byte[]> getPrimitiveType() { return byte[].class; }
    @Override
    public Class<UUID> getComplexType() { return UUID.class; }
    @Override
    public byte[] toPrimitive(UUID complex, PersistentDataAdapterContext ctx) {
        ByteBuffer bb = ByteBuffer.wrap(new byte[16]);
        bb.putLong(complex.getMostSignificantBits());
        bb.putLong(complex.getLeastSignificantBits());
        return bb.array();
    }
    @Override
    public UUID fromPrimitive(byte[] primitive, PersistentDataAdapterContext ctx) {
        ByteBuffer bb = ByteBuffer.wrap(primitive);
        return new UUID(bb.getLong(), bb.getLong());
    }
};

// Use it
meta.getPersistentDataContainer().set(key, UUID_TYPE, player.getUniqueId());
```

---

## 8. Adventure API (Modern Components)

Paper bundles the Adventure component library since 1.16.5. Use it instead of legacy `ChatColor`.

### 8.1 Basic Usage

```java
// Simple colored message
player.sendMessage(Component.text("Hello World!", NamedTextColor.GREEN));

// Rich text with decorations
player.sendMessage(Component.text("Important!", NamedTextColor.RED, TextDecoration.BOLD));

// Multiple components
player.sendMessage(Component.text()
    .append(Component.text("[!] ", NamedTextColor.GOLD))
    .append(Component.text("You have new mail!", NamedTextColor.YELLOW))
    .build());
```

### 8.2 MiniMessage (Human-Readable Markup)

```java
MiniMessage mm = MiniMessage.miniMessage();

// Deserialize markup to Component
Component parsed = mm.deserialize("<red>Error: <yellow>Invalid input</yellow></red>");
player.sendMessage(parsed);

// Common tags:
// <color> — <red>, <green>, <blue>, <gold>, <aqua>, etc.
// <gradient> — <gradient:red:blue>text</gradient>
// <bold>, <italic>, <underlined>, <strikethrough>, <obfuscated>
// <hover:show_text:'tooltip'> — hover text
// <click:run_command:'/command'> — clickable text
```

### 8.3 NamedTextColor Reference

| Color | Code | Hex |
|-------|------|-----|
| Black | `NamedTextColor.BLACK` | `#000000` |
| Dark Blue | `NamedTextColor.DARK_BLUE` | `#0000AA` |
| Dark Green | `NamedTextColor.DARK_GREEN` | `#00AA00` |
| Dark Aqua | `NamedTextColor.DARK_AQUA` | `#00AAAA` |
| Dark Red | `NamedTextColor.DARK_RED` | `#AA0000` |
| Dark Purple | `NamedTextColor.DARK_PURPLE` | `#AA00AA` |
| Gold | `NamedTextColor.GOLD` | `#FFAA00` |
| Gray | `NamedTextColor.GRAY` | `#AAAAAA` |
| Dark Gray | `NamedTextColor.DARK_GRAY` | `#555555` |
| Blue | `NamedTextColor.BLUE` | `#5555FF` |
| Green | `NamedTextColor.GREEN` | `#55FF55` |
| Aqua | `NamedTextColor.AQUA` | `#55FFFF` |
| Red | `NamedTextColor.RED` | `#FF5555` |
| Light Purple | `NamedTextColor.LIGHT_PURPLE` | `#FF55FF` |
| Yellow | `NamedTextColor.YELLOW` | `#FFFF55` |
| White | `NamedTextColor.WHITE` | `#FFFFFF` |

### 8.4 Mixing Legacy and Modern Code

If you have legacy `ChatColor` code and want to migrate gradually:

```java
// Legacy to Component converter
public class LegacyConverter {
    public static Component fromLegacy(String legacyText) {
        return LegacyComponentSerializer.legacySection()
            .deserialize(ChatColor.translateAlternateColorCodes('&', legacyText));
    }
}
```

**Rule:** Pick one system and be consistent. Never mix `ChatColor.RED + "text"` with `Component.text("text", NamedTextColor.RED)` in the same codebase.

---

## 9. PersistentDataContainer

PDC is the modern replacement for NBT tags on Bukkit objects. It works on Items, Entities, BlockStates, and TileStates.

### 9.1 Supported Types

```java
// Built-in types
PersistentDataType.BYTE       // byte
PersistentDataType.SHORT      // short
PersistentDataType.INTEGER    // int
PersistentDataType.LONG       // long
PersistentDataType.FLOAT      // float
PersistentDataType.DOUBLE     // double
PersistentDataType.STRING     // String
PersistentDataType.BYTE_ARRAY // byte[]
PersistentDataType.INTEGER_ARRAY // int[]
PersistentDataType.LONG_ARRAY // long[]
PersistentDataType.TAG_CONTAINER_ARRAY // nested containers
PersistentDataType.BOOLEAN    // boolean (as byte)
```

### 9.2 Common Use Cases

```java
// Tracking item origin
NamespacedKey originKey = new NamespacedKey(plugin, "origin");
meta.getPersistentDataContainer().set(originKey, PersistentDataType.STRING, "daily_reward");

// Anti-dupe: unique item ID
NamespacedKey uidKey = new NamespacedKey(plugin, "item_uid");
meta.getPersistentDataContainer().set(uidKey, PersistentDataType.LONG, nextId++);

// Cooldown timestamp on entity
NamespacedKey cooldownKey = new NamespacedKey(plugin, "last_used");
entity.getPersistentDataContainer().set(cooldownKey, PersistentDataType.LONG, System.currentTimeMillis());
```

---

## 10. API Confusion Matrix

Common API methods that are frequently confused:

| ❌ Wrong | ✅ Correct | Why |
|---------|-----------|-----|
| `Bukkit.getPlayer("name")` for offline lookups | `Bukkit.getOfflinePlayer(uuid)` | `getPlayer()` returns null for offline players |
| `getDamage()` for final damage tracking | `getFinalDamage()` | `getDamage()` is pre-armor, `getFinalDamage()` is post-armor |
| Returning `null` from `onTabComplete` | Return `Collections.emptyList()` | `null` triggers default behavior (all player names) |
| `Bukkit.getOfflinePlayer("name")` on main thread | Use UUID variant | String lookup may make blocking Mojang API call |
| `HashMap` for multi-threaded caches | `ConcurrentHashMap` | `ConcurrentModificationException` risk |
| Database query in `@EventHandler` | `CompletableFuture.supplyAsync()` | Blocks main thread |

---

## Appendix A: Quick API Reference Card

### Most-Used Methods

| Method | Returns | Thread-Safe? |
|--------|---------|-------------|
| `Bukkit.getPlayer(uuid)` | `Player` or `null` | Main thread only |
| `Bukkit.getOnlinePlayers()` | `Collection<Player>` | Snapshot — iterate quickly |
| `player.sendMessage(String)` | void | Yes (thread-safe) |
| `player.teleport(Location)` | void | Main thread only |
| `player.getInventory().addItem(ItemStack)` | `HashMap<Integer, ItemStack>` | Main thread only |
| `Bukkit.getScheduler().runTask(plugin, Runnable)` | `BukkitTask` | Main thread registration |
| `Bukkit.callEvent(Event)` | void | Main thread only |

### Event Priority Quick Guide

| What You're Doing | Priority |
|------------------|----------|
| Cancelling (anti-cheat) | `LOWEST` |
| Cancelling (protection) | `LOW` |
| Normal game logic | `NORMAL` |
| Reacting to changes | `HIGH` |
| Logging/statistics | `MONITOR` + `ignoreCancelled = true` |

---

## Appendix B: Version Compatibility Table

| Minecraft | Paper API | Java | Key API Changes |
|-----------|-----------|------|-----------------|
| 1.8 | Legacy | Java 8 | Original Bukkit API |
| 1.12.2 | Legacy | Java 8 | Last Java 8 version |
| 1.13 | 1.13-R0.1 | Java 8+ | Material enum flattened, no more `LEGACY_` |
| 1.16.5 | 1.16.5-R0.1 | Java 11+ | Adventure API bundled |
| 1.17.1 | 1.17.1-R0.1 | Java 16+ | Paper modern namespace (`io.papermc.paper`) |
| 1.18.2 | 1.18.2-R0.1 | Java 17+ | LTS baseline |
| 1.20.4 | 1.20.4-R0.1 | Java 17+ | Paper AsyncScheduler, Brigadier |
| 1.20.6 | 1.20.6-R0.1 | Java 21+ | Java 21 requirement |
| 1.21.4 | 1.21.4-R0.1 | Java 21 | PlayerMoveBlockEvent, RegionScheduler |

---

## Appendix C: AI API Mistake Catalog

| # | Mistake | Detection | Fix |
|---|---------|-----------|-----|
| 1 | Database query in `@EventHandler` | `@EventHandler` + JDBC/HTTP/File I/O without async wrapper | `CompletableFuture.supplyAsync()` + `runTask()` callback |
| 2 | `getCommand("x")` returns null | NPE on startup | Add `x` to `plugin.yml` `commands:` section |
| 3 | `getOfflinePlayer(String)` on main thread | Lag spikes on join | Use UUID variant or `Bukkit.getPlayer()` first |
| 4 | `HashMap` for concurrent access | `ConcurrentModificationException` | Use `ConcurrentHashMap` |
| 5 | `return null` from `onTabComplete` | Shows all player names | Return `Collections.emptyList()` |
| 6 | Mixed Adventure + ChatColor | Inconsistent color rendering | Pick one system, use `LegacyComponentSerializer` for migration |
| 7 | No `isOnline()` check after async | NPE after player logs off | `if (Bukkit.getPlayer(uuid) != null)` after async gap |
| 8 | Modifying events at `MONITOR` | Changes ignored by later handlers | Use `NORMAL` or lower for modifications |
| 9 | `BukkitRunnable` without cancellation | Task runs forever after disable | Store `BukkitTask`, cancel in `onDisable()` |
| 10 | `saveConfig()` without `saveDefaultConfig()` | Config not created | Call `saveDefaultConfig()` in `onEnable()` |
| 11 | Hardcoded permission strings | Inconsistent across codebase | Use `Permissions` constants class |
| 12 | `getDamage()` for final damage | Wrong damage value logged | Use `getFinalDamage()` for actual damage dealt |
| 13 | Missing static `getHandlerList()` in custom events | Event system breaks | Always include: `public static HandlerList getHandlerList()` |
| 14 | `Bukkit.getOnlinePlayers()` in repeating task | Inefficient allocation | Cache player list or use event-driven approach |
| 15 | Plugin API accessed in `onEnable()` of dependent plugin | Plugin may not be loaded yet | Check `Bukkit.getPluginManager().getPlugin("Name") != null` first |

---

---

## 11. Folia Compatibility Guide

Folia is Paper's regionized-threading fork — each world region runs on its own thread. The traditional assumption "everything runs on one main thread" is false on Folia.

### 11.1 What Changes with Folia

| Concept | Bukkit/Paper | Folia |
|---------|-------------|-------|
| Main thread | One global main thread | Per-region threads |
| `Bukkit.getScheduler().runTask()` | Runs on global main thread | Throws `UnsupportedOperationException` |
| `Bukkit.getOnlinePlayers()` | Safe (single thread) | Safe (returns snapshot) |
| Entity/Block modification | Safe from anywhere on main thread | Must be on the entity/block's region thread |
| Global state (static maps) | Thread-safe with `ConcurrentHashMap` | Same — but more contention due to multiple regions |

### 11.2 Writing Scheduler Code That Works on Both

```java
// ❌ BREAKS ON FOLIA — Bukkit global scheduler not available
Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage("Hi"));

// ✅ WORKS ON BOTH — uses the entity/location's own scheduler
player.getScheduler().run(plugin, task -> {
    player.sendMessage(Component.text("Hi!", NamedTextColor.GREEN));
}, null); // null callback = fire-and-forget

// ✅ ALSO WORKS — global scheduler with Folia check
if (ServerPlatform.isFolia()) {
    // Use region scheduler
    player.getScheduler().run(plugin, task -> doWork(player), null);
} else {
    // Use traditional scheduler
    Bukkit.getScheduler().runTask(plugin, () -> doWork(player));
}

// ✅ BEST — abstract the difference
public static void runOnEntityThread(Plugin plugin, Entity entity, Runnable task) {
    entity.getScheduler().run(plugin, scheduledTask -> task.run(), null);
}
```

### 11.3 The Entity Scheduler API (Paper 1.21+, Folia)

```java
// Run on the entity's region thread
entity.getScheduler().run(plugin, task -> {
    entity.setGlowing(true);
}, () -> {
    // Optional: callback after task completes
    plugin.getLogger().info("Glow applied to " + entity.getName());
});

// Run delayed (in ticks)
entity.getScheduler().runDelayed(plugin, task -> {
    entity.setGlowing(false);
}, () -> {}, 20L); // After 1 second

// Run repeating
entity.getScheduler().runAtFixedRate(plugin, task -> {
    // Periodic work on this entity's region
}, 0L, 20L); // Every second
```

### 11.4 Folia Migration Checklist

- [ ] Replace all `Bukkit.getScheduler().runTask()` with entity/location-based schedulers
- [ ] Replace all `Bukkit.getScheduler().runTaskTimer()` with entity-based repeating schedulers
- [ ] Verify all global state uses `ConcurrentHashMap` (already needed for Paper)
- [ ] Remove any `Bukkit.getScheduler().runTaskAsynchronously()` — use `CompletableFuture` instead
- [ ] Test on a Folia test server before deploying to production
- [ ] Verify that your plugin doesn't assume all players are on the same thread

---

## 12. Adventure API Migration: From ChatColor to Components

### 12.1 Migration Strategy

**Phase 1: Wrap legacy code.** Don't rewrite everything at once. Create a compatibility layer:

```java
public class ComponentUtils {
    private static final LegacyComponentSerializer LEGACY =
        LegacyComponentSerializer.legacySection();

    /** Convert legacy color-coded strings to Adventure Components */
    public static Component fromLegacy(String legacyText) {
        return LEGACY.deserialize(ChatColor.translateAlternateColorCodes('&', legacyText));
    }

    /** Convert Adventure Components to legacy strings (for plugins that still need them) */
    public static String toLegacy(Component component) {
        return LEGACY.serialize(component);
    }
}

// Usage — gradual migration:
// Old code still works:
player.sendMessage(ComponentUtils.fromLegacy("&cError message"));

// New code uses Adventure directly:
player.sendMessage(Component.text("Error message", NamedTextColor.RED));
```

**Phase 2: Move user-facing messages to MiniMessage.** MiniMessage is more readable and easier for non-developers to edit:

```yaml
# messages.yml — authors can edit these without knowing Java
shop-title: "<gradient:gold:yellow><bold>Shop</bold></gradient>"
error-no-permission: "<red>✗</red> <gray>You don't have permission.</gray>"
success-purchase: "<green>✓</green> <gray>Purchased <white>{item}</white> for <gold>${price}</gold></gray>"
clickable-teleport: "<click:run_command:'/warp {warp}'><aqua>[Warp: {warp}]</aqua></click>"
```

```java
// Parse once at startup, reuse at runtime
private final Map<String, Component> messageComponents = new HashMap<>();

void loadMessages() {
    MiniMessage mm = MiniMessage.miniMessage();
    FileConfiguration config = plugin.getMessageConfig();
    for (String key : config.getKeys(true)) {
        String template = config.getString(key);
        if (template != null && template.contains("<")) {
            messageComponents.put(key, mm.deserialize(template));
        }
    }
}

// At runtime — zero parsing overhead
public void sendMessage(Player player, String configKey, Map<String, String> placeholders) {
    Component template = messageComponents.get(configKey);
    if (template == null) {
        template = MiniMessage.miniMessage().deserialize(
            plugin.getMessageConfig().getString(configKey, configKey));
        messageComponents.put(configKey, template);
    }
    // Apply placeholders by replacing text nodes
    player.sendMessage(applyPlaceholders(template, placeholders));
}
```

**Phase 3: Remove legacy code.** Once all user-facing code uses Components, delete the `ChatColor` imports and `ComponentUtils.fromLegacy()` calls.

### 12.2 Common Adventure Pitfalls

1. **`player.sendMessage(String)` still exists but uses legacy rendering.** If you send a string containing MiniMessage markup, it will be displayed literally. Always use `player.sendMessage(Component)` for formatted text.

2. **Component is immutable.** `Component.text("Hello").color(NamedTextColor.RED)` returns a new Component — it doesn't modify the original. If you're building complex components, chain the calls or use `Component.text()` with builder pattern.

3. **`Component.text(null)` throws IllegalArgumentException.** Always null-check user input before wrapping in Component.text().

4. **Hover and click events are stripped by some clients.** Don't rely on clickable text for critical functionality — always have a fallback (`/command` in chat).

---

## 13. API Deprecation Lifecycle

When you maintain a plugin API that other plugins depend on, removing a method breaks them. Follow this lifecycle:

```java
public interface MyPluginAPI {

    // v1.0 — Original method
    /**
     * @deprecated Since v1.2. Use {@link #getTokens(UUID)} instead.
     * This method will be removed in v2.0.
     */
    @Deprecated
    default int getBalance(UUID uuid) {
        return getTokens(uuid); // Delegate to new method
    }

    // v1.2 — Replacement method
    /**
     * Returns the token balance for a player.
     * @since 1.2
     */
    int getTokens(UUID uuid);
}
```

**Deprecation timeline:**
1. **Announce** (v1.2): Add `@Deprecated` annotation + Javadoc pointing to replacement + log a warning on first use
2. **Warn** (v1.5): Log a warning EVERY time the deprecated method is called
3. **Remove** (v2.0): Delete the method — SemVer major bump

**How to track deprecated API usage:**
```java
@Deprecated
default int getBalance(UUID uuid) {
    // Log once per plugin that calls this
    String caller = StackWalker.getInstance()
        .walk(frames -> frames.skip(1).findFirst()
            .map(StackWalker.StackFrame::getClassName)
            .orElse("unknown"));
    if (!warnedCallers.contains(caller)) {
        warnedCallers.add(caller);
        plugin.getLogger().warning("Plugin '" + caller + "' is using deprecated getBalance(). "
            + "It should migrate to getTokens() before v2.0.");
    }
    return getTokens(uuid);
}
```

---

*End of Minecraft Plugin API Correctness Guide*
*Paper 1.21.4 · Java 21*

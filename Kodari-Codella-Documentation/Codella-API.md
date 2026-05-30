# Minecraft Plugin API Correctness Guide
## Paper 1.21.4 — Bukkit / Spigot / Paper API Reference

**Version:** 1.0.0  
**Last Updated:** December 2024  
**Target:** Paper 1.21.4, Java 21  
**Purpose:** Authoritative API reference for AI-assisted development

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

The Minecraft server API ecosystem follows a strict inheritance hierarchy:

```
Bukkit (org.bukkit.*)
├── Base API specification
├── Cross-platform compatibility
└── Minimal features

    ↓ extends

Spigot (org.bukkit.* + org.spigotmc.*)
├── All Bukkit APIs
├── Spigot-specific enhancements
├── Performance improvements
└── Additional events

    ↓ extends

Paper (org.bukkit.* + org.spigotmc.* + com.destroystokyo.paper.* + io.papermc.paper.*)
├── All Bukkit + Spigot APIs
├── Adventure API integration
├── Modern async schedulers
├── Enhanced event system
└── Performance patches

    ↓ extends

Forks (Purpur, Pufferfish, Folia)
├── All Paper APIs
├── Fork-specific features
└── Experimental APIs
```

**Critical Understanding:**
- **Bukkit** = The specification. All servers implement this.
- **Spigot** = Bukkit + performance + extras. Most servers run this or higher.
- **Paper** = Spigot + modernization + Adventure. The current standard.
- **Forks** = Paper + experimental features. Use with caution.

### 1.2 Runtime API Detection

**Detecting what server your plugin is running on:**

```java
public class ServerDetector {
    
    private static ServerType serverType = null;
    
    public enum ServerType {
        BUKKIT,
        SPIGOT,
        PAPER,
        FOLIA,
        UNKNOWN
    }
    
    /**
     * Detects the server type at runtime.
     * Call once during plugin initialization and cache the result.
     */
    public static ServerType detectServerType() {
        if (serverType != null) {
            return serverType;
        }
        
        String serverVersion = Bukkit.getVersion();
        String serverName = Bukkit.getName();
        
        // Check for Folia (Paper's multi-threaded fork)
        try {
            Class.forName("io.papermc.paper.threadedregions.RegionizedServer");
            serverType = ServerType.FOLIA;
            return serverType;
        } catch (ClassNotFoundException ignored) {}
        
        // Check for Paper
        try {
            Class.forName("com.destroystokyo.paper.PaperConfig");
            serverType = ServerType.PAPER;
            return serverType;
        } catch (ClassNotFoundException ignored) {}
        
        // Check for Spigot
        try {
            Class.forName("org.spigotmc.SpigotConfig");
            serverType = ServerType.SPIGOT;
            return serverType;
        } catch (ClassNotFoundException ignored) {}
        
        // Fallback to Bukkit
        serverType = ServerType.BUKKIT;
        return serverType;
    }
    
    /**
     * Check if running on Paper or higher.
     */
    public static boolean isPaper() {
        ServerType type = detectServerType();
        return type == ServerType.PAPER || type == ServerType.FOLIA;
    }
    
    /**
     * Check if running on Spigot or higher.
     */
    public static boolean isSpigot() {
        ServerType type = detectServerType();
        return type == ServerType.SPIGOT || type == ServerType.PAPER || type == ServerType.FOLIA;
    }
}
```

**Graceful Degradation Pattern:**

```java
public class MessageSender {
    
    private static final boolean HAS_ADVENTURE;
    
    static {
        boolean hasAdventure;
        try {
            Class.forName("net.kyori.adventure.text.Component");
            hasAdventure = true;
        } catch (ClassNotFoundException e) {
            hasAdventure = false;
        }
        HAS_ADVENTURE = hasAdventure;
    }
    
    /**
     * Send message with automatic fallback to legacy API.
     */
    public static void sendMessage(Player player, String message) {
        if (HAS_ADVENTURE) {
            // Use modern Adventure API
            player.sendMessage(Component.text(message));
        } else {
            // Fallback to legacy API
            player.sendMessage(ChatColor.translateAlternateColorCodes('&', message));
        }
    }
}
```

### 1.3 api-version in plugin.yml

**What is `api-version`?**

The `api-version` key in `plugin.yml` tells the server which API version your plugin was designed for. This affects behavior compatibility.

```yaml
name: MyPlugin
version: 1.0.0
main: com.example.myplugin.MyPlugin
api-version: "1.21"  # CRITICAL: Must be string, not number
```

**Behavior Matrix:**

| api-version | Target Minecraft | Server Behavior | Material Names | Event Behavior |
|-------------|------------------|-----------------|----------------|----------------|
| Not set | 1.12 and earlier | Legacy mode | Pre-1.13 names | Pre-1.13 events |
| "1.13" | 1.13+ | Modern mode | Flattened IDs | Modern events |
| "1.14" | 1.14+ | 1.14+ mode | Flattened IDs | Modern events |
| "1.16" | 1.16+ | 1.16+ mode | Flattened IDs | Modern events |
| "1.17" | 1.17+ | 1.17+ mode | Flattened IDs | Modern events |
| "1.18" | 1.18+ | 1.18+ mode | Flattened IDs | Modern events |
| "1.19" | 1.19+ | 1.19+ mode | Flattened IDs | Modern events |
| "1.20" | 1.20+ | 1.20+ mode | Flattened IDs | Modern events |
| "1.21" | 1.21+ | 1.21+ mode | Flattened IDs | Modern events |

**Critical Effects:**

1. **Material Names:** Without `api-version: "1.13"` or higher, you get legacy material names (e.g., `WOOL:14` instead of `RED_WOOL`)
2. **Event Behavior:** Some events behave differently in legacy mode
3. **Server Rejection:** Some servers reject plugins with `api-version` too old or too new
4. **Default Values:** Missing `api-version` = legacy mode, even on modern servers

**Common Questions:**

**Q: Can a plugin with `api-version: "1.21"` run on 1.20.4?**  
A: **NO.** The server will reject the plugin during load with an incompatibility error.

**Q: Can a plugin with `api-version: "1.16"` run on 1.21.4?**  
A: **YES.** Higher server versions support older API versions for backward compatibility.

**Q: Should I set `api-version` to the lowest version I support?**  
A: **YES.** Set it to the minimum version you support (e.g., `"1.16"` if you support 1.16+). This maximizes compatibility.

**Q: What happens if I use 1.21 features with `api-version: "1.16"`?**  
A: **Runtime crash.** The API version doesn't prevent you from using newer APIs—it only sets compatibility mode.

**Best Practice:**

```yaml
# For maximum compatibility (1.16 through 1.21.4):
api-version: "1.16"

# For modern-only plugins (1.21+):
api-version: "1.21"

# For Paper-specific features, still use Minecraft version:
api-version: "1.21"  # Not "paper-1.21"
```

### 1.4 Version Compatibility Matrix

**Complete compatibility table for common APIs:**

| API/Feature | Bukkit | Spigot | Paper 1.16 | Paper 1.20 | Paper 1.21.4 | Notes |
|-------------|--------|--------|------------|------------|--------------|-------|
| `Player.sendMessage(String)` | ✅ | ✅ | ✅ | ✅ | ✅ | Legacy API |
| `Player.sendMessage(Component)` | ❌ | ❌ | ✅ | ✅ | ✅ | Adventure API |
| `ChatColor` | ✅ | ✅ | ✅ | ✅ | ⚠️ | Deprecated on Paper |
| `Component.text()` | ❌ | ❌ | ✅ | ✅ | ✅ | Adventure API |
| `MiniMessage` | ❌ | ❌ | ⚠️ | ✅ | ✅ | Standalone lib before 1.19 |
| `PersistentDataContainer` | ❌ | ✅ | ✅ | ✅ | ✅ | Added in 1.14 |
| `BukkitScheduler.runTask()` | ✅ | ✅ | ✅ | ✅ | ✅ | Standard sync |
| `AsyncScheduler` | ❌ | ❌ | ❌ | ✅ | ✅ | Paper 1.20+ |
| `PlayerChatEvent` | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | Deprecated 1.12 |
| `AsyncPlayerChatEvent` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | Being replaced |
| `AsyncChatEvent` | ❌ | ❌ | ⚠️ | ✅ | ✅ | Paper modern chat |
| `BlockData` | ❌ | ✅ | ✅ | ✅ | ✅ | Added in 1.13 |
| `MaterialData` | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | Deprecated 1.13 |
| `Namespaced` resources | ❌ | ✅ | ✅ | ✅ | ✅ | Added in 1.13 |

**Legend:**
- ✅ Fully supported and recommended
- ⚠️ Supported but deprecated or transitioning
- ❌ Not available or removed

---

## 2. Event API

### 2.1 Event Priority System

**The event priority system determines handler execution order:**

```java
public enum EventPriority {
    LOWEST,   // Execute first
    LOW,
    NORMAL,   // Default
    HIGH,
    HIGHEST,
    MONITOR   // Execute last, READ-ONLY
}
```

**Complete Priority Reference:**

| Priority | Execution Order | Typical Use Case | Can Modify? | Can Cancel? | Example |
|----------|----------------|------------------|-------------|-------------|---------|
| **LOWEST** | 1st | Read original state before modifications | ✅ Yes | ✅ Yes | Anti-cheat pre-check |
| **LOW** | 2nd | Early validation and blocking | ✅ Yes | ✅ Yes | Permission pre-checks |
| **NORMAL** | 3rd (default) | Standard game logic | ✅ Yes | ✅ Yes | Most plugin features |
| **HIGH** | 4th | Late modifications | ✅ Yes | ✅ Yes | Override other plugins |
| **HIGHEST** | 5th | Final decision making | ✅ Yes | ✅ Yes | Admin override systems |
| **MONITOR** | 6th (last) | **READ-ONLY observation** | ❌ **NO** | ❌ **NO** | Logging, statistics |

**CRITICAL MONITOR RULES:**

```java
// ❌ WRONG: Modifying event in MONITOR
@EventHandler(priority = EventPriority.MONITOR)
public void onBlockBreak(BlockBreakEvent event) {
    event.setCancelled(true);  // ❌ NEVER DO THIS
    event.setDropItems(false); // ❌ NEVER DO THIS
}

// ✅ CORRECT: Only reading in MONITOR
@EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
public void onBlockBreak(BlockBreakEvent event) {
    // Only log or record statistics
    statisticsManager.incrementBlocksBroken(event.getPlayer().getUniqueId());
}
```

**Priority Selection Decision Tree:**

```
Do you need to see the ORIGINAL state before any plugin modifies it?
├─ YES → LOWEST
└─ NO ↓

Do you need to PREVENT other plugins from running?
├─ YES → LOW
└─ NO ↓

Is this standard plugin functionality?
├─ YES → NORMAL (default)
└─ NO ↓

Do you need to OVERRIDE other plugins' decisions?
├─ YES → HIGH or HIGHEST
└─ NO ↓

Are you ONLY reading/logging without any modifications?
└─ YES → MONITOR
```

### 2.2 ignoreCancelled Parameter

**The `ignoreCancelled` parameter controls whether your handler runs when an event is already cancelled:**

```java
@EventHandler(ignoreCancelled = true)  // Skip if event is already cancelled
@EventHandler(ignoreCancelled = false) // Run even if cancelled (default)
```

**Behavior Matrix:**

| ignoreCancelled | Event Cancelled? | Handler Executes? | Common Use |
|-----------------|------------------|-------------------|------------|
| `true` | No | ✅ Yes | Standard handlers |
| `true` | Yes | ❌ **No** | Most common pattern |
| `false` | No | ✅ Yes | Universal handlers |
| `false` | Yes | ✅ Yes | Logging, anti-cheat |

**Best Practices:**

```java
// ✅ CORRECT: Standard event handler
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onPlayerInteract(PlayerInteractEvent event) {
    // Only runs if event is not cancelled
    // This is what you want 95% of the time
}

// ✅ CORRECT: Monitor all events including cancelled
@EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = false)
public void logAllInteractions(PlayerInteractEvent event) {
    // Runs even if another plugin cancelled the event
    // Useful for comprehensive logging
    if (event.isCancelled()) {
        logger.info("Interaction was cancelled by another plugin");
    }
}

// ❌ WRONG: Using ignoreCancelled with MONITOR
@EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
public void onEvent(Event event) {
    // MONITOR should see ALL events, including cancelled ones
    // This defeats the purpose of MONITOR
}
```

### 2.3 Event Handler Patterns (12 Common Events)

#### 2.3.1 PlayerJoinEvent

**When:** Player has joined the server and is fully loaded.  
**Thread:** Main thread (synchronous).  
**Cancellable:** No.

```java
@EventHandler(priority = EventPriority.NORMAL)
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    
    // ✅ SAFE: Synchronous operations
    player.sendMessage(Component.text("Welcome!"));
    player.setGameMode(GameMode.SURVIVAL);
    
    // ✅ SAFE: Load data asynchronously
    CompletableFuture.runAsync(() -> {
        PlayerData data = database.loadPlayerData(player.getUniqueId());
        // ❌ UNSAFE: Can't modify player from async thread
        // player.setHealth(data.getHealth()); // CRASH!
        
        // ✅ CORRECT: Schedule sync task to apply
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) { // Check still online!
                player.setHealth(data.getHealth());
            }
        });
    });
    
    // ⚠️ CAUTION: Teleporting immediately after join
    // Some plugins may interfere. Delay by 1 tick if issues occur.
    Bukkit.getScheduler().runTask(plugin, () -> {
        if (player.isOnline()) {
            player.teleport(spawnLocation);
        }
    });
    
    // ✅ SAFE: Modify join message
    event.joinMessage(Component.text(">>> " + player.getName() + " joined"));
}
```

**Common Mistakes:**

```java
// ❌ WRONG: Loading data synchronously (blocks server)
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    PlayerData data = database.loadPlayerData(player.getUniqueId()); // BLOCKS SERVER!
}

// ❌ WRONG: Not checking if player is still online after async
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    CompletableFuture.runAsync(() -> {
        Thread.sleep(5000); // Simulating slow operation
        Bukkit.getScheduler().runTask(plugin, () -> {
            // Player might have logged out!
            player.teleport(location); // CRASH if player offline
        });
    });
}
```

#### 2.3.2 PlayerQuitEvent

**When:** Player is disconnecting.  
**Thread:** Main thread (synchronous).  
**Cancellable:** No.

```java
@EventHandler(priority = EventPriority.NORMAL)
public void onPlayerQuit(PlayerQuitEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    // ✅ SAFE: Save data asynchronously
    PlayerData data = new PlayerData(player);
    CompletableFuture.runAsync(() -> {
        database.savePlayerData(uuid, data);
    });
    
    // ✅ SAFE: Cancel active tasks
    BukkitTask task = activeTasks.remove(uuid);
    if (task != null) {
        task.cancel();
    }
    
    // ✅ SAFE: Clean up references
    cachedData.remove(uuid);
    
    // ✅ SAFE: Modify quit message
    event.quitMessage(Component.text("<<< " + player.getName() + " left"));
    
    // ❌ UNSAFE: Cannot teleport or modify player heavily
    // player.teleport(location); // May not work, player is disconnecting
    
    // ❌ UNSAFE: Cannot open inventories
    // player.openInventory(inventory); // Player is leaving!
}
```

**Critical Rules:**
1. **Save data asynchronously** to avoid blocking the server.
2. **Cancel all tasks** associated with the player.
3. **Clean up caches** to prevent memory leaks.
4. **Cannot interact** with player heavily (teleport, inventories, etc.).

#### 2.3.3 AsyncPlayerPreLoginEvent

**When:** Player is attempting to connect, BEFORE they join.  
**Thread:** **ASYNC (NOT main thread)**.  
**Cancellable:** Yes (kicks player).

```java
@EventHandler(priority = EventPriority.NORMAL)
public void onPreLogin(AsyncPlayerPreLoginEvent event) {
    UUID uuid = event.getUniqueId();
    String name = event.getName();
    InetAddress address = event.getAddress();
    
    // ✅ SAFE: Database queries (this is async!)
    boolean isBanned = database.isPlayerBanned(uuid);
    if (isBanned) {
        event.disallow(
            AsyncPlayerPreLoginEvent.Result.KICK_BANNED,
            Component.text("You are banned from this server!")
        );
        return;
    }
    
    // ✅ SAFE: IP checks
    if (ipBanList.contains(address.getHostAddress())) {
        event.disallow(
            AsyncPlayerPreLoginEvent.Result.KICK_BANNED,
            Component.text("Your IP is banned!")
        );
        return;
    }
    
    // ✅ SAFE: Pre-load data for faster join
    PlayerData data = database.loadPlayerData(uuid);
    preloadedData.put(uuid, data);
    
    // ❌ UNSAFE: Cannot access Bukkit API from async thread
    // Player player = Bukkit.getPlayer(uuid); // CRASH! Async thread!
    // World world = Bukkit.getWorld("world"); // CRASH! Async thread!
    
    // ❌ UNSAFE: Cannot schedule sync tasks from async event
    // Use PlayerJoinEvent instead for Bukkit API access
}
```

**AsyncPlayerPreLoginEvent.Result Values:**

| Result | Meaning | Usage |
|--------|---------|-------|
| `ALLOWED` | Allow connection | Default, player joins |
| `KICK_FULL` | Server full | Custom full-server logic |
| `KICK_BANNED` | Player banned | Ban system |
| `KICK_WHITELIST` | Not whitelisted | Whitelist system |
| `KICK_OTHER` | Other reason | Generic rejection |

**Use Cases:**
- **Ban checking** (database queries are async-safe here)
- **IP bans**
- **Whitelist verification**
- **Pre-loading player data** to reduce join lag

#### 2.3.4 PlayerMoveEvent

**When:** Player moves (even head rotation).  
**Thread:** Main thread (synchronous).  
**Cancellable:** Yes (teleports player back).  
**Frequency:** **EXTREMELY HIGH** (can fire 20+ times per second).

```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onPlayerMove(PlayerMoveEvent event) {
    Location from = event.getFrom();
    Location to = event.getTo();
    
    // ✅ CRITICAL: Check if player actually moved blocks
    // Event fires for head rotation too!
    if (from.getBlockX() == to.getBlockX() 
        && from.getBlockY() == to.getBlockY() 
        && from.getBlockZ() == to.getBlockZ()) {
        return; // Just head rotation, ignore
    }
    
    Player player = event.getPlayer();
    
    // ✅ SAFE: Cancel movement by setting to location
    if (frozenPlayers.contains(player.getUniqueId())) {
        event.setTo(from); // Teleport back to original location
        return;
    }
    
    // ✅ SAFE: Modify destination
    if (to.getBlock().getType() == Material.LAVA) {
        Location safe = from.clone();
        safe.setY(safe.getY() + 1);
        event.setTo(safe); // Move player up instead
    }
    
    // ⚠️ PERFORMANCE: Avoid heavy operations
    // This event fires VERY frequently
    
    // ❌ WRONG: Database query on every move
    if (database.isInRegion(to)) { // TOO SLOW!
        event.setCancelled(true);
    }
    
    // ✅ CORRECT: Cache regions, check cache
    if (regionCache.isInRestrictedRegion(to)) {
        event.setCancelled(true);
    }
}
```

**Performance Best Practices:**

```java
// ✅ THROTTLE: Only check every N ticks
private final Map<UUID, Long> lastMoveCheck = new HashMap<>();

@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    // Ignore head rotation
    if (!hasMoved(event.getFrom(), event.getTo())) return;
    
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    // Only check once per second (20 ticks)
    long now = System.currentTimeMillis();
    Long lastCheck = lastMoveCheck.get(uuid);
    if (lastCheck != null && now - lastCheck < 1000) {
        return; // Skip this check
    }
    lastMoveCheck.put(uuid, now);
    
    // Now do expensive operation
    checkPlayerRegion(player, event.getTo());
}

private boolean hasMoved(Location from, Location to) {
    return from.getBlockX() != to.getBlockX()
        || from.getBlockY() != to.getBlockY()
        || from.getBlockZ() != to.getBlockZ();
}
```

**Common Mistakes:**

```java
// ❌ WRONG: Not checking for block movement
@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    // This runs even when player just looks around!
    expensiveOperation(); // Called 20+ times per second!
}

// ❌ WRONG: Cancelling instead of setTo
@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    if (condition) {
        event.setCancelled(true); // Glitchy, player rubber-bands
    }
}

// ✅ CORRECT: Use setTo for smooth result
@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    if (condition) {
        event.setTo(event.getFrom()); // Smooth freeze
    }
}
```

#### 2.3.5 AsyncPlayerChatEvent

**When:** Player sends a chat message.  
**Thread:** **ASYNC (NOT main thread)**.  
**Cancellable:** Yes (blocks message).  
**Status:** ⚠️ Being replaced by `AsyncChatEvent` on Paper.

```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onChat(AsyncPlayerChatEvent event) {
    Player player = event.getPlayer();
    String message = event.getMessage();
    
    // ✅ SAFE: Modify message
    event.setMessage(message.replace("badword", "****"));
    
    // ✅ SAFE: Modify format
    String format = event.getFormat();
    event.setFormat(ChatColor.GOLD + "[VIP] " + format);
    
    // ✅ SAFE: Cancel message
    if (mutedPlayers.contains(player.getUniqueId())) {
        event.setCancelled(true);
        // ❌ UNSAFE: Cannot use Bukkit API from async!
        // player.sendMessage("You are muted!"); // May work but not guaranteed
        
        // ✅ CORRECT: Schedule sync message
        Bukkit.getScheduler().runTask(plugin, () -> {
            player.sendMessage(Component.text("You are muted!", NamedTextColor.RED));
        });
        return;
    }
    
    // ✅ SAFE: Modify recipients
    Set<Player> recipients = event.getRecipients();
    recipients.removeIf(p -> ignoringPlayers.contains(p.getUniqueId()));
    
    // ❌ UNSAFE: Heavy Bukkit API usage
    // Location loc = player.getLocation(); // May cause threading issues
    // World world = loc.getWorld(); // Async access to world!
}
```

**Paper Modern Alternative (AsyncChatEvent):**

```java
// Paper 1.19+ recommended event
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onAsyncChat(AsyncChatEvent event) {
    Player player = event.getPlayer();
    
    // ✅ Modern: Component-based message
    Component message = event.message();
    
    // ✅ SAFE: Modify message with Adventure API
    Component modified = message.color(NamedTextColor.GOLD);
    event.message(modified);
    
    // ✅ SAFE: Audience-based recipients
    Set<Audience> viewers = event.viewers();
    viewers.removeIf(audience -> {
        if (audience instanceof Player p) {
            return ignoringPlayers.contains(p.getUniqueId());
        }
        return false;
    });
}
```

#### 2.3.6 PlayerInteractEvent

**When:** Player right-clicks or left-clicks.  
**Thread:** Main thread (synchronous).  
**Cancellable:** Yes.  
**Complexity:** ⚠️ **HIGH** - Multiple action types.

```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onPlayerInteract(PlayerInteractEvent event) {
    Player player = event.getPlayer();
    Action action = event.getAction();
    ItemStack item = event.getItem();
    Block block = event.getClickedBlock();
    
    // ✅ Action type checking
    switch (action) {
        case LEFT_CLICK_AIR:
            // Player left-clicked while not looking at a block
            break;
            
        case LEFT_CLICK_BLOCK:
            // Player left-clicked a block
            // Block is guaranteed non-null
            handleBlockLeftClick(player, block);
            break;
            
        case RIGHT_CLICK_AIR:
            // Player right-clicked while not looking at a block
            break;
            
        case RIGHT_CLICK_BLOCK:
            // Player right-clicked a block
            // Block is guaranteed non-null
            handleBlockRightClick(player, block);
            break;
            
        case PHYSICAL:
            // Player triggered a pressure plate or tripwire
            // Block is the pressure plate/tripwire
            break;
    }
    
    // ✅ Item checking (can be null!)
    if (item != null && item.getType() == Material.DIAMOND_SWORD) {
        handleDiamondSwordClick(player, action);
    }
    
    // ✅ Block checking (can be null!)
    if (block != null && block.getType() == Material.CHEST) {
        // Prevent opening chest
        event.setCancelled(true);
        player.sendMessage(Component.text("This chest is locked!"));
    }
    
    // ✅ Block face checking
    BlockFace face = event.getBlockFace();
    if (face == BlockFace.UP) {
        // Player clicked top of block
    }
    
    // ⚠️ Special cases
    
    // Hand checking (MAIN_HAND or OFF_HAND)
    EquipmentSlot hand = event.getHand();
    if (hand == EquipmentSlot.OFF_HAND) {
        return; // Ignore off-hand to prevent double-triggering
    }
    
    // Preventing default block interaction
    event.setUseInteractedBlock(Event.Result.DENY);
    
    // Preventing item use
    event.setUseItemInHand(Event.Result.DENY);
}
```

**Critical Action Combinations:**

| Action | Block? | Item? | Common Use |
|--------|--------|-------|------------|
| `RIGHT_CLICK_AIR` | null | Maybe | Custom items (no block targeted) |
| `RIGHT_CLICK_BLOCK` | ✅ Yes | Maybe | Block interaction, custom items |
| `LEFT_CLICK_AIR` | null | Maybe | Rarely used (eating, shooting) |
| `LEFT_CLICK_BLOCK` | ✅ Yes | Maybe | Block breaking start |
| `PHYSICAL` | ✅ Yes | null | Pressure plates, tripwires |

**Common Mistakes:**

```java
// ❌ WRONG: Not checking for null
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    Block block = event.getClickedBlock();
    if (block.getType() == Material.CHEST) { // NPE if clicking air!
        // ...
    }
}

// ✅ CORRECT: Always null-check
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    Block block = event.getClickedBlock();
    if (block != null && block.getType() == Material.CHEST) {
        // Safe
    }
}

// ❌ WRONG: Not handling both hands (fires twice!)
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    // This fires for BOTH main hand AND off-hand!
    givePlayerReward(event.getPlayer()); // Double reward!
}

// ✅ CORRECT: Check hand
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    if (event.getHand() != EquipmentSlot.HAND) {
        return; // Ignore off-hand
    }
    givePlayerReward(event.getPlayer());
}
```

#### 2.3.7 BlockBreakEvent

**When:** Player breaks a block.  
**Thread:** Main thread (synchronous).  
**Cancellable:** Yes (block not broken).

```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onBlockBreak(BlockBreakEvent event) {
    Player player = event.getPlayer();
    Block block = event.getBlock();
    Material type = block.getType();
    
    // ✅ Basic cancellation
    if (protectedBlocks.contains(block.getLocation())) {
        event.setCancelled(true);
        player.sendMessage(Component.text("This block is protected!"));
        return;
    }
    
    // ✅ Drop control
    event.setDropItems(false); // Prevent normal drops
    
    // Give custom drops
    ItemStack customDrop = new ItemStack(Material.DIAMOND, 5);
    block.getWorld().dropItemNaturally(block.getLocation(), customDrop);
    
    // ✅ Experience control
    event.setExpToDrop(100); // Set custom XP
    
    // ⚠️ Creative mode bypass
    if (player.getGameMode() == GameMode.CREATIVE) {
        // Creative players don't normally drop items
        // event.isDropItems() returns false automatically
    }
    
    // ✅ Check if player is using correct tool
    ItemStack tool = player.getInventory().getItemInMainHand();
    if (type == Material.DIAMOND_ORE && tool.getType() != Material.DIAMOND_PICKAXE) {
        event.setCancelled(true);
        player.sendMessage(Component.text("You need a diamond pickaxe!"));
    }
    
    // ✅ Block state before break
    BlockState state = block.getState();
    if (state instanceof Container container) {
        // Container was broken, access inventory
        Inventory inv = container.getInventory();
        // Save contents if needed
    }
}
```

**Drop and Experience Matrix:**

| Method | Default | Effect |
|--------|---------|--------|
| `setDropItems(true)` | Yes (survival) | Normal drops |
| `setDropItems(false)` | No | No drops |
| `setExpToDrop(0)` | Varies | No XP |
| `setExpToDrop(100)` | Varies | Custom XP amount |

**Common Patterns:**

```java
// ✅ CORRECT: Custom drops with normal block removal
@EventHandler
public void onBlockBreak(BlockBreakEvent event) {
    Block block = event.getBlock();
    
    event.setDropItems(false); // Cancel normal drops
    
    // Give custom drops
    ItemStack custom = new ItemStack(Material.DIAMOND, 3);
    block.getWorld().dropItemNaturally(block.getLocation(), custom);
    
    // Block is still removed automatically
}

// ❌ WRONG: Manual block removal
@EventHandler
public void onBlockBreak(BlockBreakEvent event) {
    Block block = event.getBlock();
    event.setCancelled(true); // Cancel break
    block.setType(Material.AIR); // Manually remove - NO!
    // This bypasses tool damage, statistics, other plugins!
}

// ✅ CORRECT: If you must manually break
@EventHandler
public void onBlockBreak(BlockBreakEvent event) {
    // Don't cancel, let it process normally
    // Modify drops/XP instead
    event.setDropItems(false);
    event.setExpToDrop(0);
}
```

#### 2.3.8 BlockPlaceEvent

**When:** Player places a block.  
**Thread:** Main thread (synchronous).  
**Cancellable:** Yes (block not placed).

```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onBlockPlace(BlockPlaceEvent event) {
    Player player = event.getPlayer();
    Block block = event.getBlock(); // The placed block
    Block blockAgainst = event.getBlockAgainst(); // The block placed against
    BlockState blockReplacedState = event.getBlockReplacedState(); // What was replaced
    ItemStack itemInHand = event.getItemInHand(); // Item used to place
    
    // ✅ Basic protection
    if (protectedRegion.contains(block.getLocation())) {
        event.setCancelled(true);
        player.sendMessage(Component.text("Cannot build here!"));
        return;
    }
    
    // ✅ Block type restriction
    if (block.getType() == Material.TNT) {
        event.setCancelled(true);
        player.sendMessage(Component.text("TNT is disabled!"));
        return;
    }
    
    // ✅ Multi-block placement checking
    // Some blocks place multiple blocks (beds, doors)
    if (event.getBlock().getType() == Material.OAK_DOOR) {
        // This event fires for the bottom block
        // Top block is placed automatically
    }
    
    // ✅ Item consumption control
    event.setBuild(true); // Allow placement (default)
    event.setBuild(false); // Cancel placement
    
    // If cancelled, item is not consumed
    
    // ⚠️ Player hand checking
    EquipmentSlot hand = event.getHand();
    if (hand == EquipmentSlot.OFF_HAND) {
        // Player used off-hand
    }
    
    // ✅ Block state modification
    BlockState state = block.getState();
    if (state instanceof Sign sign) {
        // Modify sign data if needed
        sign.line(0, Component.text("Auto Line 1"));
        sign.update(true);
    }
}
```

**Common Scenarios:**

```java
// ✅ Limit block placement count
private final Map<UUID, Integer> blockCounts = new HashMap<>();

@EventHandler
public void onBlockPlace(BlockPlaceEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    int count = blockCounts.getOrDefault(uuid, 0);
    if (count >= 100) {
        event.setCancelled(true);
        player.sendMessage(Component.text("Block limit reached!"));
        return;
    }
    
    blockCounts.put(uuid, count + 1);
}

// ✅ Custom block data on place
@EventHandler
public void onBlockPlace(BlockPlaceEvent event) {
    Block block = event.getBlock();
    
    // Add custom PDC data to block
    if (block.getState() instanceof TileState tileState) {
        PersistentDataContainer pdc = tileState.getPersistentDataContainer();
        pdc.set(
            new NamespacedKey(plugin, "placer"),
            PersistentDataType.STRING,
            event.getPlayer().getUniqueId().toString()
        );
        tileState.update();
    }
}
```

#### 2.3.9 EntityDamageEvent

**When:** Entity takes damage.  
**Thread:** Main thread (synchronous).  
**Cancellable:** Yes (damage not applied).

```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onEntityDamage(EntityDamageEvent event) {
    Entity entity = event.getEntity();
    EntityDamageEvent.DamageCause cause = event.getCause();
    double damage = event.getDamage();
    
    // ✅ Player-specific handling
    if (entity instanceof Player player) {
        
        // Damage cause checking
        switch (cause) {
            case FALL:
                event.setCancelled(true); // No fall damage
                break;
                
            case FIRE:
            case FIRE_TICK:
            case LAVA:
                event.setDamage(damage * 0.5); // Half fire damage
                break;
                
            case DROWNING:
                if (player.hasPermission("plugin.nodrown")) {
                    event.setCancelled(true);
                }
                break;
                
            case ENTITY_ATTACK:
                // This is actually EntityDamageByEntityEvent!
                // Will not reach here normally
                break;
        }
        
        // ✅ Damage modification
        event.setDamage(damage * 2); // Double damage
        
        // ✅ Final damage calculation
        double finalDamage = event.getFinalDamage();
        // This is damage after armor/effects
        
        if (finalDamage > player.getHealth()) {
            // Player will die
            event.setCancelled(true); // Prevent death
            player.setHealth(1.0);
        }
    }
}

// ✅ Entity vs Entity damage (subclass of EntityDamageEvent)
@EventHandler
public void onEntityDamageByEntity(EntityDamageByEntityEvent event) {
    Entity damager = event.getDamager();
    Entity victim = event.getEntity();
    
    // Player damaging another player
    if (damager instanceof Player attacker && victim instanceof Player defender) {
        
        // Check PvP protection
        if (pvpProtection.contains(defender.getUniqueId())) {
            event.setCancelled(true);
            attacker.sendMessage(Component.text("This player has PvP protection!"));
            return;
        }
    }
    
    // Projectile damage
    if (damager instanceof Projectile projectile) {
        ProjectileSource shooter = projectile.getShooter();
        if (shooter instanceof Player shooterPlayer) {
            // Player shot the victim
            handlePlayerProjectileDamage(shooterPlayer, victim, event);
        }
    }
}
```

**Damage Cause Complete Reference:**

| DamageCause | Description | Can Modify? | Common Use |
|-------------|-------------|-------------|------------|
| `CONTACT` | Cactus, berry bush | ✅ Yes | Disable cactus damage |
| `ENTITY_ATTACK` | Melee attack | ✅ Yes | Custom melee damage |
| `ENTITY_SWEEP_ATTACK` | Sweep attack | ✅ Yes | Modify sweep |
| `PROJECTILE` | Arrow, snowball | ✅ Yes | Custom projectile damage |
| `SUFFOCATION` | Wall suffocation | ✅ Yes | No-clip protection |
| `FALL` | Fall damage | ✅ Yes | Disable fall damage |
| `FIRE` | Standing in fire | ✅ Yes | Fire resistance |
| `FIRE_TICK` | Burning | ✅ Yes | Fire resistance |
| `LAVA` | Lava damage | ✅ Yes | Lava immunity |
| `DROWNING` | Underwater | ✅ Yes | Water breathing |
| `BLOCK_EXPLOSION` | TNT, beds | ✅ Yes | Explosion protection |
| `ENTITY_EXPLOSION` | Creeper | ✅ Yes | Explosion protection |
| `VOID` | Void damage | ✅ Yes | Void protection |
| `LIGHTNING` | Lightning | ✅ Yes | Lightning immunity |
| `STARVATION` | Hunger | ✅ Yes | No hunger damage |
| `POISON` | Poison effect | ✅ Yes | Poison immunity |
| `WITHER` | Wither effect | ✅ Yes | Wither immunity |
| `FALLING_BLOCK` | Anvil, sand | ✅ Yes | Falling block immunity |
| `THORNS` | Thorns enchant | ✅ Yes | Thorns modification |
| `MAGIC` | Potions, instant damage | ✅ Yes | Magic resistance |

#### 2.3.10 InventoryClickEvent

**When:** Player clicks in an inventory.  
**Thread:** Main thread (synchronous).  
**Cancellable:** Yes (click not processed).  
**Complexity:** ⚠️ **VERY HIGH** - Most complex event.

```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onInventoryClick(InventoryClickEvent event) {
    // ✅ Basic checks
    if (!(event.getWhoClicked() instanceof Player player)) {
        return; // Only handle players
    }
    
    Inventory clickedInventory = event.getClickedInventory();
    Inventory topInventory = event.getView().getTopInventory();
    ClickType clickType = event.getClick();
    int slot = event.getSlot();
    int rawSlot = event.getRawSlot();
    ItemStack currentItem = event.getCurrentItem();
    ItemStack cursor = event.getCursor();
    
    // ✅ CRITICAL: Check which inventory was clicked
    if (clickedInventory == null) {
        return; // Clicked outside inventory
    }
    
    // Check if clicked in custom GUI vs player inventory
    if (clickedInventory.equals(topInventory)) {
        // Clicked in the custom GUI (top inventory)
        handleGUIClick(player, slot, currentItem, clickType, event);
    } else {
        // Clicked in player's own inventory (bottom)
        handlePlayerInventoryClick(player, event);
    }
}

private void handleGUIClick(Player player, int slot, ItemStack item, ClickType click, InventoryClickEvent event) {
    // ✅ Always cancel in custom GUIs to prevent item theft
    event.setCancelled(true);
    
    // ✅ Handle different click types
    switch (click) {
        case LEFT:
            // Normal left click
            handleLeftClick(player, slot);
            break;
            
        case RIGHT:
            // Normal right click
            handleRightClick(player, slot);
            break;
            
        case SHIFT_LEFT:
        case SHIFT_RIGHT:
            // Shift-click - moves items!
            // CRITICAL: Must cancel or items will move to player inventory
            break;
            
        case NUMBER_KEY:
            // Player pressed hotbar number (1-9)
            int hotbarButton = event.getHotbarButton();
            // Item in that hotbar slot will swap with clicked item
            break;
            
        case DROP:
        case CONTROL_DROP:
            // Player pressed Q (drop)
            // Cancel to prevent dropping
            break;
            
        case DOUBLE_CLICK:
            // Collecting items
            // Cancel to prevent collection
            break;
    }
}
```

**Slot vs RawSlot:**

| Method | Top Inv (0-53) | Bottom Inv (Player) | Use Case |
|--------|----------------|---------------------|----------|
| `getRawSlot()` | 0-53 | 54-89 | Absolute position |
| `getSlot()` | 0-53 | 0-35 | Relative to inventory |
| `getClickedInventory()` | Top Inventory | Player Inventory | Which was clicked |

```java
// ✅ CORRECT: Use clickedInventory, not rawSlot
@EventHandler
public void onClick(InventoryClickEvent event) {
    Inventory clicked = event.getClickedInventory();
    Inventory top = event.getView().getTopInventory();
    
    if (clicked != null && clicked.equals(top)) {
        // Clicked in top (custom) inventory
        event.setCancelled(true);
    }
    // Don't cancel clicks in player's own inventory
}

// ❌ WRONG: Using raw slot comparison
@EventHandler
public void onClick(InventoryClickEvent event) {
    int rawSlot = event.getRawSlot();
    if (rawSlot < 54) {
        // This fails with different inventory sizes!
        event.setCancelled(true);
    }
}
```

**Shift-Click Protection:**

```java
// ❌ WRONG: Only cancelling top inventory
@EventHandler
public void onClick(InventoryClickEvent event) {
    if (event.getClickedInventory().equals(event.getView().getTopInventory())) {
        event.setCancelled(true);
    }
    // BUG: Shift-clicking from bottom moves items to top!
}

// ✅ CORRECT: Cancel shift-click from both inventories
@EventHandler
public void onClick(InventoryClickEvent event) {
    Inventory top = event.getView().getTopInventory();
    
    if (isCustomGUI(top)) {
        // Cancel all shift-clicks
        if (event.getClick().isShiftClick()) {
            event.setCancelled(true);
            return;
        }
        
        // Cancel clicks in top inventory
        if (event.getClickedInventory() != null 
            && event.getClickedInventory().equals(top)) {
            event.setCancelled(true);
        }
    }
}
```

#### 2.3.11 PlayerTeleportEvent

**When:** Player is teleported.  
**Thread:** Main thread (synchronous).  
**Cancellable:** Yes (teleport not executed).

```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onPlayerTeleport(PlayerTeleportEvent event) {
    Player player = event.getPlayer();
    Location from = event.getFrom();
    Location to = event.getTo();
    PlayerTeleportEvent.TeleportCause cause = event.getCause();
    
    // ✅ Teleport cause checking
    switch (cause) {
        case COMMAND:
            // /tp command
            break;
            
        case PLUGIN:
            // Plugin-triggered teleport
            break;
            
        case ENDER_PEARL:
            // Ender pearl throw
            if (noPearlZone.contains(to)) {
                event.setCancelled(true);
                player.sendMessage(Component.text("Cannot use ender pearls here!"));
            }
            break;
            
        case NETHER_PORTAL:
        case END_PORTAL:
            // Portal usage
            handlePortalTeleport(player, from, to, event);
            break;
            
        case CHORUS_FRUIT:
            // Chorus fruit teleport
            break;
            
        case END_GATEWAY:
            // End gateway
            break;
    }
    
    // ✅ Modify destination
    if (to != null) {
        Location modified = to.clone();
        modified.setY(modified.getY() + 10);
        event.setTo(modified);
    }
    
    // ⚠️ Recursive teleport prevention
    // Teleporting in a teleport event can cause infinite loops!
}
```

**TeleportCause Complete Reference:**

| Cause | Description | Can Cancel? | Common Use |
|-------|-------------|-------------|------------|
| `COMMAND` | /tp, /teleport | ✅ Yes | Command restriction |
| `PLUGIN` | Plugin teleport | ✅ Yes | Plugin coordination |
| `NETHER_PORTAL` | Nether portal | ✅ Yes | Custom portal destinations |
| `END_PORTAL` | End portal | ✅ Yes | Custom end portal |
| `ENDER_PEARL` | Ender pearl | ✅ Yes | Pearl restrictions |
| `CHORUS_FRUIT` | Chorus fruit | ✅ Yes | Chorus restrictions |
| `END_GATEWAY` | End gateway | ✅ Yes | Gateway modification |
| `SPECTATE` | Spectator teleport | ✅ Yes | Spectator restrictions |
| `UNKNOWN` | Unknown cause | ✅ Yes | Catch-all |

**Recursive Teleport Prevention:**

```java
// ❌ WRONG: Infinite loop!
@EventHandler
public void onTeleport(PlayerTeleportEvent event) {
    Player player = event.getPlayer();
    Location to = event.getTo();
    
    if (bannedZone.contains(to)) {
        player.teleport(spawnLocation); // Triggers ANOTHER teleport event!
        // If spawn is also in banned zone, infinite loop!
    }
}

// ✅ CORRECT: Modify event, don't trigger new teleport
@EventHandler
public void onTeleport(PlayerTeleportEvent event) {
    Location to = event.getTo();
    
    if (bannedZone.contains(to)) {
        event.setTo(spawnLocation); // Modifies THIS teleport
    }
}

// ✅ ALTERNATIVE: Check cause to prevent recursion
private boolean isInternalTeleport = false;

@EventHandler
public void onTeleport(PlayerTeleportEvent event) {
    if (isInternalTeleport) return; // Ignore our own teleports
    
    Player player = event.getPlayer();
    Location to = event.getTo();
    
    if (bannedZone.contains(to)) {
        event.setCancelled(true);
        
        isInternalTeleport = true;
        player.teleport(spawnLocation);
        isInternalTeleport = false;
    }
}
```

#### 2.3.12 ServerLoadEvent / PluginEnableEvent

**When:** Server finishes loading or plugin is enabled.  
**Thread:** Main thread (synchronous).  
**Cancellable:** No.

```java
// ✅ ServerLoadEvent (Paper 1.19+)
@EventHandler
public void onServerLoad(ServerLoadEvent event) {
    ServerLoadEvent.LoadType loadType = event.getLoadType();
    
    switch (loadType) {
        case STARTUP:
            // Server just started
            initializePlugin();
            break;
            
        case RELOAD:
            // Server was reloaded (/reload)
            reloadConfiguration();
            break;
    }
}

// ✅ PluginEnableEvent (all versions)
@EventHandler
public void onPluginEnable(PluginEnableEvent event) {
    Plugin plugin = event.getPlugin();
    
    // Check for soft dependencies
    if (plugin.getName().equals("Vault")) {
        setupEconomy(); // Vault is now available
    }
}

// ✅ PluginDisableEvent
@EventHandler
public void onPluginDisable(PluginDisableEvent event) {
    Plugin plugin = event.getPlugin();
    
    if (plugin.getName().equals("Vault")) {
        // Vault is shutting down
        economy = null; // Clear reference
    }
}
```

**Plugin Dependency Loading Order:**

```
1. Plugins load (onLoad)
2. Plugins enable (onEnable) - in dependency order
   ├─ Hard dependencies (depend) must be loaded first
   ├─ Soft dependencies (softdepend) loaded before if available
   └─ Load-before (loadbefore) loads this plugin first
3. PluginEnableEvent fires for each plugin
4. Server finishes loading
5. ServerLoadEvent fires (STARTUP)
```

**Soft Dependency Pattern:**

```java
public class MyPlugin extends JavaPlugin {
    
    private Economy economy = null;
    
    @Override
    public void onEnable() {
        // Attempt to hook Vault
        if (getServer().getPluginManager().getPlugin("Vault") != null) {
            setupEconomy();
        } else {
            getLogger().warning("Vault not found, economy features disabled");
        }
        
        // Register listener for late-loading plugins
        getServer().getPluginManager().registerEvents(new PluginListener(), this);
    }
    
    private boolean setupEconomy() {
        if (getServer().getPluginManager().getPlugin("Vault") == null) {
            return false;
        }
        
        RegisteredServiceProvider<Economy> rsp = 
            getServer().getServicesManager().getRegistration(Economy.class);
        if (rsp == null) {
            return false;
        }
        
        economy = rsp.getProvider();
        return economy != null;
    }
    
    private class PluginListener implements Listener {
        @EventHandler
        public void onPluginEnable(PluginEnableEvent event) {
            if (event.getPlugin().getName().equals("Vault")) {
                setupEconomy();
                getLogger().info("Hooked into Vault!");
            }
        }
    }
}
```

### 2.4 Event Anti-Patterns

**Common mistakes that cause bugs, performance issues, or crashes:**

#### Anti-Pattern 1: Not Checking Event Validity

```java
// ❌ WRONG: Assuming event data is never null
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    Block block = event.getClickedBlock();
    Material type = block.getType(); // NPE when clicking air!
}

// ✅ CORRECT: Always null-check
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    Block block = event.getClickedBlock();
    if (block == null) return;
    
    Material type = block.getType(); // Safe
}
```

#### Anti-Pattern 2: Heavy Synchronous Operations

```java
// ❌ WRONG: Database query in event (blocks server!)
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    PlayerData data = database.loadPlayerData(player.getUniqueId()); // BLOCKS!
    applyData(player, data);
}

// ✅ CORRECT: Async database access
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    
    CompletableFuture.runAsync(() -> {
        PlayerData data = database.loadPlayerData(player.getUniqueId());
        
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) {
                applyData(player, data);
            }
        });
    });
}
```

#### Anti-Pattern 3: Not Cancelling Monitor-Priority Events

```java
// ❌ WRONG: Modifying event in MONITOR
@EventHandler(priority = EventPriority.MONITOR)
public void onBlockBreak(BlockBreakEvent event) {
    event.setExpToDrop(100); // Other plugins already processed!
    event.setCancelled(true); // TOO LATE!
}

// ✅ CORRECT: Use appropriate priority
@EventHandler(priority = EventPriority.HIGH)
public void onBlockBreak(BlockBreakEvent event) {
    event.setExpToDrop(100); // Other plugins can still see this
}

// ✅ CORRECT: Only read in MONITOR
@EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
public void logBlockBreak(BlockBreakEvent event) {
    // Only log, never modify
    statistics.recordBlockBreak(event.getPlayer(), event.getBlock().getType());
}
```

#### Anti-Pattern 4: Not Handling Offline Players After Async

```java
// ❌ WRONG: Player might be offline
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    
    CompletableFuture.runAsync(() -> {
        Thread.sleep(5000); // Simulate slow operation
        
        Bukkit.getScheduler().runTask(plugin, () -> {
            player.teleport(location); // CRASH if player logged out!
        });
    });
}

// ✅ CORRECT: Check if player is still online
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    CompletableFuture.runAsync(() -> {
        Thread.sleep(5000);
        
        Bukkit.getScheduler().runTask(plugin, () -> {
            Player onlinePlayer = Bukkit.getPlayer(uuid);
            if (onlinePlayer != null && onlinePlayer.isOnline()) {
                onlinePlayer.teleport(location); // Safe
            }
        });
    });
}
```

#### Anti-Pattern 5: Registering Events Multiple Times

```java
// ❌ WRONG: Re-registering listener
public class MyPlugin extends JavaPlugin {
    
    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(new MyListener(), this);
    }
    
    public void reloadConfig() {
        super.reloadConfig();
        // Re-registering listener!
        getServer().getPluginManager().registerEvents(new MyListener(), this);
        // Now every event fires TWICE!
    }
}

// ✅ CORRECT: Register once, reload data only
public class MyPlugin extends JavaPlugin {
    
    private MyListener listener;
    
    @Override
    public void onEnable() {
        listener = new MyListener(this);
        getServer().getPluginManager().registerEvents(listener, this);
    }
    
    public void reloadConfig() {
        super.reloadConfig();
        listener.reload(); // Reload data, don't re-register
    }
}
```

---

## 3. Player API

### 3.1 Player Lifecycle & Validity

**Player object lifecycle states:**

```
[CONNECTING] 
    ↓
AsyncPlayerPreLoginEvent (no Player object yet)
    ↓
[JOINING]
    ↓
PlayerJoinEvent (Player object valid)
    ↓
[ONLINE] ← Player is fully valid
    ↓
PlayerQuitEvent (Player object still valid, but disconnecting)
    ↓
[OFFLINE] ← Player object INVALID
```

**Player Validity Rules:**

| State | Player Object | Can Modify? | Can Get Data? | Example |
|-------|---------------|-------------|---------------|---------|
| AsyncPreLogin | ❌ No | ❌ No | ❌ No | Only UUID, name, IP |
| PlayerJoin | ✅ Yes | ✅ Yes | ✅ Yes | Full access |
| Online | ✅ Yes | ✅ Yes | ✅ Yes | Full access |
| PlayerQuit | ✅ Yes | ⚠️ Limited | ✅ Yes | Cannot teleport, open GUIs |
| Offline | ❌ Invalid | ❌ No | ⚠️ Limited | Only OfflinePlayer |

**Testing Player Validity:**

```java
public boolean isPlayerValid(Player player) {
    return player != null 
        && player.isOnline() 
        && !player.isDead();
}

// ✅ Always check before async callback
CompletableFuture.runAsync(() -> {
    // Long operation
    PlayerData data = loadData();
    
    Bukkit.getScheduler().runTask(plugin, () -> {
        if (isPlayerValid(player)) { // CRITICAL CHECK
            applyData(player, data);
        }
    });
});
```

### 3.2 Player Data Access Patterns

#### UUID vs Name (CRITICAL)

**The #1 Rule: ALWAYS use UUID for storage, NEVER use name.**

| Method | Immutable? | Offline Access? | Use For |
|--------|------------|-----------------|---------|
| `player.getUniqueId()` | ✅ **YES** | ✅ Yes | **Database keys**, storage |
| `player.getName()` | ❌ **NO** | ✅ Yes | Display only |
| `OfflinePlayer.getUniqueId()` | ✅ **YES** | ✅ Yes | Offline data |
| `OfflinePlayer.getName()` | ⚠️ Maybe | ✅ Yes | Display only |

**Why UUID, not name:**

```java
// ❌ WRONG: Using name as database key
public void savePlayer(Player player) {
    String name = player.getName();
    database.save(name, playerData); // WRONG!
    // If player changes name, data is lost!
}

// ✅ CORRECT: Using UUID as database key
public void savePlayer(Player player) {
    UUID uuid = player.getUniqueId();
    database.save(uuid.toString(), playerData); // CORRECT!
    // UUID never changes, data always accessible
}
```

**Name changes are real:**

```java
// Player "Steve" plays on your server
UUID uuid = UUID.fromString("069a79f4-44e9-4726-a5be-fca90e38aaf5");
String name = "Steve";

// Later, Steve changes name to "Alex"
// UUID stays: 069a79f4-44e9-4726-a5be-fca90e38aaf5
// Name becomes: "Alex"

// If you stored by name "Steve", you lose the data!
// If you stored by UUID, you still have it!
```

#### Getting Players

```java
// ✅ Get online player by UUID (fast, recommended)
UUID uuid = ...; // From database, PDC, etc.
Player player = Bukkit.getPlayer(uuid);
if (player != null && player.isOnline()) {
    // Player is online
}

// ⚠️ Get player by name (exact match, case-sensitive)
Player player = Bukkit.getPlayer("Notch");
// Returns null if no exact match

// ⚠️ Get player by partial name (dangerous!)
Player player = Bukkit.getPlayerExact("Not"); // null - not exact
List<Player> matches = Bukkit.matchPlayer("Not"); // ["Notch"]

// ✅ Get offline player by UUID
UUID uuid = ...;
OfflinePlayer offline = Bukkit.getOfflinePlayer(uuid);
// Always returns an object, even if never played!

// ❌ Get offline player by name (VERY SLOW, blocks thread!)
OfflinePlayer offline = Bukkit.getOfflinePlayer("Notch");
// Makes network request to Mojang API!
// NEVER use this in events or main thread!
```

**OfflinePlayer Critical Warning:**

```java
// ❌ EXTREMELY DANGEROUS: Blocks main thread!
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    String targetName = config.getString("owner");
    OfflinePlayer owner = Bukkit.getOfflinePlayer(targetName); 
    // SERVER FREEZES while querying Mojang API!
}

// ✅ CORRECT: Use UUID, or async lookup
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    UUID ownerUUID = UUID.fromString(config.getString("owner-uuid"));
    OfflinePlayer owner = Bukkit.getOfflinePlayer(ownerUUID);
    // Instant, no network request
}
```

#### Player Data Storage Pattern

```java
public class PlayerDataManager {
    
    private final Map<UUID, PlayerData> cache = new HashMap<>();
    
    // ✅ Load on join (async)
    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        
        CompletableFuture.runAsync(() -> {
            PlayerData data = database.load(uuid);
            
            Bukkit.getScheduler().runTask(plugin, () -> {
                if (player.isOnline()) {
                    cache.put(uuid, data);
                    applyData(player, data);
                }
            });
        });
    }
    
    // ✅ Save on quit (async)
    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        
        PlayerData data = cache.remove(uuid); // Remove from cache
        
        if (data != null) {
            CompletableFuture.runAsync(() -> {
                database.save(uuid, data);
            });
        }
    }
    
    // ✅ Get cached data (sync, fast)
    public PlayerData getData(Player player) {
        return cache.get(player.getUniqueId());
    }
}
```

### 3.3 Location & World API

#### Location Object

```java
// ✅ Creating locations
Location loc = new Location(world, x, y, z);
Location loc = new Location(world, x, y, z, yaw, pitch);

// ✅ Getting location components
World world = loc.getWorld();
double x = loc.getX();
double y = loc.getY();
double z = loc.getZ();
float yaw = loc.getYaw(); // -180 to 180
float pitch = loc.getPitch(); // -90 to 90

// ✅ Block coordinates (integer)
int blockX = loc.getBlockX();
int blockY = loc.getBlockY();
int blockZ = loc.getBlockZ();

// ✅ Getting block at location
Block block = loc.getBlock();
```

#### Location Cloning (CRITICAL)

```java
// ❌ WRONG: Modifying location directly
Location playerLoc = player.getLocation();
playerLoc.setY(playerLoc.getY() + 10); // MODIFIES PLAYER'S LOCATION!
player.teleport(playerLoc); // Player glitches!

// ✅ CORRECT: Clone before modifying
Location playerLoc = player.getLocation();
Location modified = playerLoc.clone();
modified.setY(modified.getY() + 10);
player.teleport(modified); // Safe

// ✅ ALTERNATIVE: Create new Location
Location playerLoc = player.getLocation();
Location modified = new Location(
    playerLoc.getWorld(),
    playerLoc.getX(),
    playerLoc.getY() + 10,
    playerLoc.getZ(),
    playerLoc.getYaw(),
    playerLoc.getPitch()
);
```

**Why clone?** 

`player.getLocation()` returns a **reference** to a location object. Modifying it directly can cause unexpected behavior. Always clone before modifying.

#### World API

```java
// ✅ Get world by name
World world = Bukkit.getWorld("world");
if (world == null) {
    // World doesn't exist or isn't loaded!
}

// ✅ Get default worlds
World overworld = Bukkit.getWorlds().get(0); // Usually "world"
World nether = Bukkit.getWorld("world_nether");
World end = Bukkit.getWorld("world_the_end");

// ✅ World properties
String name = world.getName();
World.Environment environment = world.getEnvironment();
// Environment: NORMAL, NETHER, THE_END

long time = world.getTime(); // 0-24000 (ticks)
world.setTime(0); // Set to day

boolean pvp = world.getPVP();
world.setPVP(false); // Disable PvP

// ✅ Spawn location
Location spawn = world.getSpawnLocation();
world.setSpawnLocation(x, y, z);
```

#### Chunk API (Performance Critical)

```java
// ❌ WRONG: Synchronous chunk loading (BLOCKS SERVER!)
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    Location loc = new Location(world, 1000, 64, 1000);
    Chunk chunk = loc.getChunk(); // BLOCKS if chunk not loaded!
    // Server freezes!
}

// ✅ CORRECT: Check if chunk is loaded
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    Location loc = new Location(world, 1000, 64, 1000);
    
    if (!loc.isChunkLoaded()) {
        // Chunk not loaded, load it asynchronously
        world.getChunkAtAsync(loc).thenAccept(chunk -> {
            // Chunk is now loaded, access it
            Bukkit.getScheduler().runTask(plugin, () -> {
                processChunk(chunk);
            });
        });
    } else {
        // Chunk already loaded, safe to access
        Chunk chunk = loc.getChunk();
        processChunk(chunk);
    }
}

// ✅ BEST: Async chunk loading (Paper)
world.getChunkAtAsync(x, z).thenAccept(chunk -> {
    // Chunk loaded without blocking server
    Bukkit.getScheduler().runTask(plugin, () -> {
        // Now on main thread, safe to modify world
        chunk.getBlock(0, 64, 0).setType(Material.DIAMOND_BLOCK);
    });
});
```

### 3.4 Common Player API Mistakes

#### Mistake 1: Not Checking Player Online Status

```java
// ❌ WRONG
UUID uuid = ...;
Player player = Bukkit.getPlayer(uuid);
player.sendMessage("Hello!"); // NPE if player is offline!

// ✅ CORRECT
UUID uuid = ...;
Player player = Bukkit.getPlayer(uuid);
if (player != null && player.isOnline()) {
    player.sendMessage(Component.text("Hello!"));
}
```

#### Mistake 2: Using getName() for Data Storage

```java
// ❌ WRONG
public void savePlayer(Player player) {
    config.set("players." + player.getName() + ".coins", 100);
    // Player changes name → data lost!
}

// ✅ CORRECT
public void savePlayer(Player player) {
    config.set("players." + player.getUniqueId() + ".coins", 100);
    // UUID never changes
}
```

#### Mistake 3: Teleporting Without Checking World

```java
// ❌ WRONG
Location loc = new Location(Bukkit.getWorld("spawn"), 0, 64, 0);
player.teleport(loc); // NPE if world "spawn" doesn't exist!

// ✅ CORRECT
World world = Bukkit.getWorld("spawn");
if (world != null) {
    Location loc = new Location(world, 0, 64, 0);
    player.teleport(loc);
} else {
    player.sendMessage(Component.text("Spawn world not found!"));
}
```

#### Mistake 4: Accessing Player from Async Thread

```java
// ❌ WRONG
CompletableFuture.runAsync(() -> {
    player.teleport(location); // CRASH! Bukkit API from async thread!
    player.getInventory().addItem(new ItemStack(Material.DIAMOND));
});

// ✅ CORRECT
CompletableFuture.runAsync(() -> {
    // Do async work here
    ItemStack reward = createReward();
    
    // Switch back to main thread for Bukkit API
    Bukkit.getScheduler().runTask(plugin, () -> {
        if (player.isOnline()) {
            player.getInventory().addItem(reward);
        }
    });
});
```

#### Mistake 5: Not Handling Inventory Full

```java
// ❌ WRONG
ItemStack item = new ItemStack(Material.DIAMOND, 64);
player.getInventory().addItem(item);
// If inventory full, item is lost!

// ✅ CORRECT
ItemStack item = new ItemStack(Material.DIAMOND, 64);
HashMap<Integer, ItemStack> leftover = player.getInventory().addItem(item);

if (!leftover.isEmpty()) {
    // Inventory was full, drop items
    for (ItemStack drop : leftover.values()) {
        player.getWorld().dropItemNaturally(player.getLocation(), drop);
    }
    player.sendMessage(Component.text("Inventory full! Items dropped."));
}
```

---

## 4. Command API

### 4.1 Command Registration

**Classic Bukkit CommandExecutor pattern:**

```java
// plugin.yml
/*
commands:
  example:
    description: Example command
    usage: /<command> [args]
    permission: myplugin.example
    permission-message: You don't have permission!
*/

// Java class
public class ExampleCommand implements CommandExecutor {
    
    private final MyPlugin plugin;
    
    public ExampleCommand(MyPlugin plugin) {
        this.plugin = plugin;
    }
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, 
                            String label, String[] args) {
        
        // ✅ Sender type checking
        if (!(sender instanceof Player)) {
            sender.sendMessage(Component.text("Only players can use this command!"));
            return true;
        }
        
        Player player = (Player) sender;
        
        // ✅ Permission checking
        if (!player.hasPermission("myplugin.example")) {
            player.sendMessage(Component.text("No permission!"));
            return true; // true = don't show usage
        }
        
        // ✅ Argument length checking
        if (args.length < 1) {
            player.sendMessage(Component.text("Usage: /example <arg>"));
            return false; // false = show usage from plugin.yml
        }
        
        // Execute command logic
        handleCommand(player, args);
        
        return true;
    }
}

// Register in onEnable()
@Override
public void onEnable() {
    getCommand("example").setExecutor(new ExampleCommand(this));
}
```

**Command Registration Checklist:**

- ✅ Define command in `plugin.yml`
- ✅ Create CommandExecutor class
- ✅ Register in `onEnable()`
- ✅ Check sender type (Player vs Console)
- ✅ Check permissions
- ✅ Validate argument count
- ✅ Return `true` (hide usage) or `false` (show usage)

### 4.2 Argument Parsing

**Safe argument parsing patterns:**

```java
@Override
public boolean onCommand(CommandSender sender, Command command, 
                        String label, String[] args) {
    
    // ✅ Check argument count first
    if (args.length < 1) {
        sender.sendMessage(Component.text("Usage: /example <number>"));
        return false;
    }
    
    // ✅ Parse integer safely
    int number;
    try {
        number = Integer.parseInt(args[0]);
    } catch (NumberFormatException e) {
        sender.sendMessage(Component.text("'" + args[0] + "' is not a valid number!"));
        return true;
    }
    
    // ✅ Validate range
    if (number < 1 || number > 100) {
        sender.sendMessage(Component.text("Number must be between 1 and 100!"));
        return true;
    }
    
    // ✅ Parse player name
    if (args.length < 2) {
        sender.sendMessage(Component.text("Usage: /example <number> <player>"));
        return false;
    }
    
    Player target = Bukkit.getPlayer(args[1]);
    if (target == null) {
        sender.sendMessage(Component.text("Player '" + args[1] + "' not found!"));
        return true;
    }
    
    // Execute with validated arguments
    giveItems(target, number);
    return true;
}
```

**Argument Parsing Helper Methods:**

```java
public class CommandUtils {
    
    /**
     * Parse integer with range validation.
     */
    public static Integer parseInt(String arg, int min, int max, 
                                   Consumer<String> errorHandler) {
        try {
            int value = Integer.parseInt(arg);
            if (value < min || value > max) {
                errorHandler.accept("Number must be between " + min + " and " + max);
                return null;
            }
            return value;
        } catch (NumberFormatException e) {
            errorHandler.accept("'" + arg + "' is not a valid number");
            return null;
        }
    }
    
    /**
     * Get online player with error message.
     */
    public static Player getPlayer(String name, Consumer<String> errorHandler) {
        Player player = Bukkit.getPlayer(name);
        if (player == null) {
            errorHandler.accept("Player '" + name + "' not found");
        }
        return player;
    }
    
    /**
     * Parse Material with validation.
     */
    public static Material parseMaterial(String arg, Consumer<String> errorHandler) {
        try {
            Material material = Material.valueOf(arg.toUpperCase());
            if (!material.isItem()) {
                errorHandler.accept("'" + arg + "' is not a valid item");
                return null;
            }
            return material;
        } catch (IllegalArgumentException e) {
            errorHandler.accept("'" + arg + "' is not a valid material");
            return null;
        }
    }
}

// Usage
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (args.length < 2) return false;
    
    Integer amount = CommandUtils.parseInt(args[0], 1, 64, 
        error -> sender.sendMessage(Component.text(error, NamedTextColor.RED)));
    if (amount == null) return true;
    
    Player target = CommandUtils.getPlayer(args[1],
        error -> sender.sendMessage(Component.text(error, NamedTextColor.RED)));
    if (target == null) return true;
    
    // Both validated, execute
    giveItems(target, amount);
    return true;
}
```

### 4.3 Tab Completion

**TabCompleter interface:**

```java
public class ExampleCommand implements CommandExecutor, TabCompleter {
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, 
                            String label, String[] args) {
        // Command logic
        return true;
    }
    
    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, 
                                     String alias, String[] args) {
        
        // ✅ MUST return List<String>, never null!
        List<String> completions = new ArrayList<>();
        
        // First argument: player names
        if (args.length == 1) {
            String partial = args[0].toLowerCase();
            for (Player player : Bukkit.getOnlinePlayers()) {
                String name = player.getName();
                if (name.toLowerCase().startsWith(partial)) {
                    completions.add(name);
                }
            }
            return completions;
        }
        
        // Second argument: numbers
        if (args.length == 2) {
            return Arrays.asList("1", "10", "64");
        }
        
        // No completions for other arguments
        return completions; // Empty list
    }
}

// Register both executor and tab completer
@Override
public void onEnable() {
    PluginCommand command = getCommand("example");
    ExampleCommand executor = new ExampleCommand(this);
    command.setExecutor(executor);
    command.setTabCompleter(executor);
}
```

**Advanced Tab Completion Patterns:**

```java
@Override
public List<String> onTabComplete(CommandSender sender, Command command, 
                                 String alias, String[] args) {
    
    // ✅ Subcommand completion
    if (args.length == 1) {
        return filterStartingWith(args[0], Arrays.asList(
            "give", "take", "set", "reset"
        ));
    }
    
    // ✅ Dynamic completion based on subcommand
    if (args.length == 2) {
        switch (args[0].toLowerCase()) {
            case "give":
            case "take":
                // Complete with online player names
                return filterStartingWith(args[1], 
                    Bukkit.getOnlinePlayers().stream()
                        .map(Player::getName)
                        .collect(Collectors.toList())
                );
                
            case "set":
                // Complete with numbers
                return filterStartingWith(args[1], 
                    Arrays.asList("10", "50", "100", "1000")
                );
        }
    }
    
    return Collections.emptyList();
}

/**
 * Filter list to entries starting with prefix (case-insensitive).
 */
private List<String> filterStartingWith(String prefix, List<String> options) {
    String lowerPrefix = prefix.toLowerCase();
    return options.stream()
        .filter(option -> option.toLowerCase().startsWith(lowerPrefix))
        .collect(Collectors.toList());
}
```

**Tab Completion Best Practices:**

```java
// ✅ CORRECT: Return empty list, not null
@Override
public List<String> onTabComplete(...) {
    return Collections.emptyList(); // NOT null!
}

// ✅ CORRECT: Case-insensitive filtering
private List<String> filterStartingWith(String prefix, List<String> options) {
    String lower = prefix.toLowerCase();
    return options.stream()
        .filter(opt -> opt.toLowerCase().startsWith(lower))
        .collect(Collectors.toList());
}

// ✅ CORRECT: Permission-aware completions
@Override
public List<String> onTabComplete(CommandSender sender, ...) {
    if (!sender.hasPermission("myplugin.admin")) {
        return Collections.emptyList(); // No completions for non-admins
    }
    // ...
}

// ❌ WRONG: Returning null
@Override
public List<String> onTabComplete(...) {
    return null; // Server shows all player names by default
}
```

### 4.4 Subcommand Patterns

**Method 1: Switch Statement**

```java
@Override
public boolean onCommand(CommandSender sender, Command command, 
                        String label, String[] args) {
    
    if (args.length < 1) {
        sendHelp(sender);
        return true;
    }
    
    switch (args[0].toLowerCase()) {
        case "give":
            return handleGive(sender, Arrays.copyOfRange(args, 1, args.length));
            
        case "take":
            return handleTake(sender, Arrays.copyOfRange(args, 1, args.length));
            
        case "set":
            return handleSet(sender, Arrays.copyOfRange(args, 1, args.length));
            
        case "help":
            sendHelp(sender);
            return true;
            
        default:
            sender.sendMessage(Component.text("Unknown subcommand: " + args[0]));
            sendHelp(sender);
            return true;
    }
}

private boolean handleGive(CommandSender sender, String[] args) {
    // Subcommand logic
    return true;
}
```

**Method 2: Command Map (Scalable)**

```java
public class MainCommand implements CommandExecutor, TabCompleter {
    
    private final Map<String, SubCommand> subcommands = new HashMap<>();
    
    public MainCommand(MyPlugin plugin) {
        // Register subcommands
        subcommands.put("give", new GiveSubCommand(plugin));
        subcommands.put("take", new TakeSubCommand(plugin));
        subcommands.put("set", new SetSubCommand(plugin));
        subcommands.put("help", new HelpSubCommand(plugin));
    }
    
    @Override
    public boolean onCommand(CommandSender sender, Command command, 
                            String label, String[] args) {
        
        if (args.length < 1) {
            subcommands.get("help").execute(sender, new String[0]);
            return true;
        }
        
        SubCommand subcommand = subcommands.get(args[0].toLowerCase());
        if (subcommand == null) {
            sender.sendMessage(Component.text("Unknown subcommand: " + args[0]));
            return true;
        }
        
        // Check permission
        if (!subcommand.hasPermission(sender)) {
            sender.sendMessage(Component.text("No permission!"));
            return true;
        }
        
        // Execute subcommand
        String[] subArgs = Arrays.copyOfRange(args, 1, args.length);
        return subcommand.execute(sender, subArgs);
    }
    
    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, 
                                     String alias, String[] args) {
        
        // Complete subcommand name
        if (args.length == 1) {
            return subcommands.keySet().stream()
                .filter(name -> {
                    SubCommand sub = subcommands.get(name);
                    return sub.hasPermission(sender) 
                        && name.startsWith(args[0].toLowerCase());
                })
                .collect(Collectors.toList());
        }
        
        // Complete subcommand arguments
        if (args.length > 1) {
            SubCommand subcommand = subcommands.get(args[0].toLowerCase());
            if (subcommand != null && subcommand.hasPermission(sender)) {
                String[] subArgs = Arrays.copyOfRange(args, 1, args.length);
                return subcommand.tabComplete(sender, subArgs);
            }
        }
        
        return Collections.emptyList();
    }
}

// Subcommand interface
public interface SubCommand {
    boolean execute(CommandSender sender, String[] args);
    List<String> tabComplete(CommandSender sender, String[] args);
    boolean hasPermission(CommandSender sender);
}

// Example subcommand
public class GiveSubCommand implements SubCommand {
    
    private final MyPlugin plugin;
    
    public GiveSubCommand(MyPlugin plugin) {
        this.plugin = plugin;
    }
    
    @Override
    public boolean execute(CommandSender sender, String[] args) {
        if (args.length < 2) {
            sender.sendMessage(Component.text("Usage: /main give <player> <amount>"));
            return false;
        }
        
        Player target = Bukkit.getPlayer(args[0]);
        if (target == null) {
            sender.sendMessage(Component.text("Player not found!"));
            return true;
        }
        
        // Parse amount and give items
        // ...
        
        return true;
    }
    
    @Override
    public List<String> tabComplete(CommandSender sender, String[] args) {
        if (args.length == 1) {
            return Bukkit.getOnlinePlayers().stream()
                .map(Player::getName)
                .filter(name -> name.toLowerCase().startsWith(args[0].toLowerCase()))
                .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }
    
    @Override
    public boolean hasPermission(CommandSender sender) {
        return sender.hasPermission("myplugin.give");
    }
}
```

### 4.5 Command Anti-Patterns

#### Anti-Pattern 1: Not Validating Arguments

```java
// ❌ WRONG: ArrayIndexOutOfBoundsException
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    String playerName = args[0]; // CRASH if no arguments!
    int amount = Integer.parseInt(args[1]); // CRASH!
    return true;
}

// ✅ CORRECT: Always validate first
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (args.length < 2) {
        sender.sendMessage(Component.text("Usage: /cmd <player> <amount>"));
        return false;
    }
    
    String playerName = args[0];
    
    int amount;
    try {
        amount = Integer.parseInt(args[1]);
    } catch (NumberFormatException e) {
        sender.sendMessage(Component.text("Invalid number: " + args[1]));
        return true;
    }
    
    // Safe to proceed
    return true;
}
```

#### Anti-Pattern 2: Returning Null from Tab Complete

```java
// ❌ WRONG: Returning null
@Override
public List<String> onTabComplete(...) {
    return null; // Server shows default completions
}

// ✅ CORRECT: Return empty list
@Override
public List<String> onTabComplete(...) {
    return Collections.emptyList(); // No completions
}
```

#### Anti-Pattern 3: Giant onCommand Method

```java
// ❌ WRONG: 500-line onCommand method
@Override
public boolean onCommand(CommandSender sender, Command command, 
                        String label, String[] args) {
    if (args.length > 0) {
        if (args[0].equals("give")) {
            if (args.length > 1) {
                Player target = Bukkit.getPlayer(args[1]);
                if (target != null) {
                    if (args.length > 2) {
                        try {
                            int amount = Integer.parseInt(args[2]);
                            // 400 more lines...
                        } catch (NumberFormatException e) {
                            // ...
                        }
                    }
                }
            }
        } else if (args[0].equals("take")) {
            // Another 200 lines...
        }
        // ... 20 more subcommands
    }
    return true;
}

// ✅ CORRECT: Extract subcommands
@Override
public boolean onCommand(CommandSender sender, Command command, 
                        String label, String[] args) {
    if (args.length < 1) {
        return sendHelp(sender);
    }
    
    switch (args[0].toLowerCase()) {
        case "give": return handleGive(sender, args);
        case "take": return handleTake(sender, args);
        default: return sendHelp(sender);
    }
}
```

---

## 5. Inventory & GUI API

### 5.1 Custom Inventory Creation

**Creating custom GUIs:**

```java
public class CustomGUI {
    
    private final Inventory inventory;
    
    public CustomGUI() {
        // ✅ Create inventory (size must be multiple of 9, max 54)
        inventory = Bukkit.createInventory(null, 27, 
            Component.text("Custom GUI")); // Modern Paper
        
        // Alternative (legacy):
        // inventory = Bukkit.createInventory(null, 27, "Custom GUI");
        
        // ✅ Fill inventory with items
        setupItems();
    }
    
    private void setupItems() {
        // Create items
        ItemStack info = new ItemStack(Material.BOOK);
        ItemMeta meta = info.getItemMeta();
        meta.displayName(Component.text("Information", NamedTextColor.GOLD));
        meta.lore(Arrays.asList(
            Component.text("Click for info"),
            Component.text("Line 2")
        ));
        info.setItemMeta(meta);
        
        // Set items in inventory
        inventory.setItem(13, info); // Center slot
        
        // Fill border with glass panes
        ItemStack glass = new ItemStack(Material.GRAY_STAINED_GLASS_PANE);
        ItemMeta glassMeta = glass.getItemMeta();
        glassMeta.displayName(Component.empty()); // Hide name
        glass.setItemMeta(glassMeta);
        
        for (int i = 0; i < 27; i++) {
            if (i < 9 || i >= 18 || i % 9 == 0 || i % 9 == 8) {
                inventory.setItem(i, glass); // Border
            }
        }
    }
    
    public void open(Player player) {
        player.openInventory(inventory);
    }
}
```

**Inventory Size Reference:**

| Size | Rows | Type |
|------|------|------|
| 9 | 1 | Hopper-style |
| 18 | 2 | Small chest |
| 27 | 3 | **Standard chest** (most common) |
| 36 | 4 | Large |
| 45 | 5 | Very large |
| 54 | 6 | **Double chest** (maximum) |

**Title Length:**
- **Paper 1.16+:** Unlimited (Component-based)
- **Bukkit/Spigot:** 32 characters (String-based)
- **Older versions:** 16 characters

### 5.2 Click Event Handling

**Complete click handling pattern:**

```java
public class GUIListener implements Listener {
    
    private final MyPlugin plugin;
    private final Map<UUID, CustomGUI> openGUIs = new HashMap<>();
    
    public GUIListener(MyPlugin plugin) {
        this.plugin = plugin;
    }
    
    @EventHandler
    public void onClick(InventoryClickEvent event) {
        // ✅ Only handle players
        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }
        
        UUID uuid = player.getUniqueId();
        
        // ✅ Check if player has custom GUI open
        if (!openGUIs.containsKey(uuid)) {
            return; // Not our GUI
        }
        
        // ✅ CRITICAL: Check which inventory was clicked
        Inventory clickedInventory = event.getClickedInventory();
        Inventory topInventory = event.getView().getTopInventory();
        
        if (clickedInventory == null) {
            return; // Clicked outside inventory
        }
        
        // ✅ Cancel all clicks in GUI (prevent item theft)
        event.setCancelled(true);
        
        ClickType clickType = event.getClick();
        int slot = event.getSlot();
        ItemStack item = event.getCurrentItem();
        
        // ✅ Handle top inventory clicks (the GUI)
        if (clickedInventory.equals(topInventory)) {
            handleGUIClick(player, slot, item, clickType);
        }
        
        // ✅ CRITICAL: Cancel shift-clicks from player inventory
        if (clickType.isShiftClick()) {
            event.setCancelled(true);
        }
    }
    
    private void handleGUIClick(Player player, int slot, ItemStack item, ClickType click) {
        if (item == null || item.getType() == Material.AIR) {
            return; // Empty slot
        }
        
        // Handle specific slots
        switch (slot) {
            case 13: // Center slot
                player.sendMessage(Component.text("You clicked the center!"));
                player.closeInventory();
                break;
                
            case 26: // Bottom-right
                player.playSound(player.getLocation(), Sound.UI_BUTTON_CLICK, 1f, 1f);
                break;
        }
    }
    
    @EventHandler
    public void onClose(InventoryCloseEvent event) {
        if (event.getPlayer() instanceof Player player) {
            UUID uuid = player.getUniqueId();
            openGUIs.remove(uuid); // Clean up
        }
    }
    
    public void openGUI(Player player, CustomGUI gui) {
        openGUIs.put(player.getUniqueId(), gui);
        gui.open(player);
    }
}
```

**Click Type Complete Reference:**

| ClickType | Mouse Action | Keyboard | Result |
|-----------|-------------|----------|--------|
| `LEFT` | Left click | - | Pick up/place |
| `RIGHT` | Right click | - | Pick up half/place one |
| `SHIFT_LEFT` | Shift + left | - | Move stack to other inventory |
| `SHIFT_RIGHT` | Shift + right | - | Move stack to other inventory |
| `NUMBER_KEY` | - | 1-9 | Swap with hotbar |
| `MIDDLE` | Middle click | - | Creative: clone item |
| `DROP` | - | Q | Drop one |
| `CONTROL_DROP` | - | Ctrl+Q | Drop stack |
| `CREATIVE` | Middle click | - | Creative pick block |
| `DOUBLE_CLICK` | Double left | - | Collect similar items |
| `WINDOW_BORDER_LEFT` | Left at edge | - | (Rare) |
| `WINDOW_BORDER_RIGHT` | Right at edge | - | (Rare) |
| `UNKNOWN` | Unknown | - | Fallback |

### 5.3 Persistent GUI State

**Paginated GUI pattern:**

```java
public class PaginatedGUI {
    
    private final List<ItemStack> items;
    private int page = 0;
    private final int itemsPerPage = 21; // 3x7 grid
    
    private Inventory inventory;
    
    public PaginatedGUI(List<ItemStack> items) {
        this.items = items;
        createInventory();
    }
    
    private void createInventory() {
        inventory = Bukkit.createInventory(null, 54, 
            Component.text("Page " + (page + 1)));
        
        // Calculate page bounds
        int startIndex = page * itemsPerPage;
        int endIndex = Math.min(startIndex + itemsPerPage, items.size());
        
        // Fill with items (slots 10-16, 19-25, 28-34)
        int slot = 10;
        for (int i = startIndex; i < endIndex; i++) {
            inventory.setItem(slot, items.get(i));
            
            slot++;
            if (slot == 17) slot = 19; // Next row
            if (slot == 26) slot = 28; // Next row
        }
        
        // Navigation buttons
        if (page > 0) {
            // Previous page button
            ItemStack prev = new ItemStack(Material.ARROW);
            ItemMeta prevMeta = prev.getItemMeta();
            prevMeta.displayName(Component.text("Previous Page"));
            prev.setItemMeta(prevMeta);
            inventory.setItem(48, prev);
        }
        
        if (endIndex < items.size()) {
            // Next page button
            ItemStack next = new ItemStack(Material.ARROW);
            ItemMeta nextMeta = next.getItemMeta();
            nextMeta.displayName(Component.text("Next Page"));
            next.setItemMeta(nextMeta);
            inventory.setItem(50, next);
        }
    }
    
    public void nextPage(Player player) {
        if ((page + 1) * itemsPerPage < items.size()) {
            page++;
            createInventory();
            player.openInventory(inventory);
        }
    }
    
    public void previousPage(Player player) {
        if (page > 0) {
            page--;
            createInventory();
            player.openInventory(inventory);
        }
    }
    
    public void open(Player player) {
        player.openInventory(inventory);
    }
    
    public Inventory getInventory() {
        return inventory;
    }
}

// Click handler
@EventHandler
public void onClick(InventoryClickEvent event) {
    if (!(event.getWhoClicked() instanceof Player player)) return;
    
    PaginatedGUI gui = openGUIs.get(player.getUniqueId());
    if (gui == null) return;
    
    event.setCancelled(true);
    
    int slot = event.getSlot();
    
    if (slot == 48) {
        gui.previousPage(player);
    } else if (slot == 50) {
        gui.nextPage(player);
    }
}
```

### 5.4 Common GUI Mistakes

#### Mistake 1: Not Cancelling Shift-Click

```java
// ❌ WRONG: Only cancelling top inventory clicks
@EventHandler
public void onClick(InventoryClickEvent event) {
    if (event.getClickedInventory().equals(event.getView().getTopInventory())) {
        event.setCancelled(true);
    }
    // BUG: Shift-click from player inventory moves items to top!
}

// ✅ CORRECT: Cancel ALL shift-clicks
@EventHandler
public void onClick(InventoryClickEvent event) {
    Inventory top = event.getView().getTopInventory();
    
    if (isCustomGUI(top)) {
        // Cancel all shift-clicks
        if (event.getClick().isShiftClick()) {
            event.setCancelled(true);
            return;
        }
        
        // Cancel clicks in top inventory
        if (event.getClickedInventory() != null 
            && event.getClickedInventory().equals(top)) {
            event.setCancelled(true);
        }
    }
}
```

#### Mistake 2: Using Raw Slot Instead of Clicked Inventory

```java
// ❌ WRONG: Raw slot comparison
@EventHandler
public void onClick(InventoryClickEvent event) {
    int rawSlot = event.getRawSlot();
    if (rawSlot < 27) { // Assumes 27-slot inventory
        event.setCancelled(true);
        // Breaks with different inventory sizes!
    }
}

// ✅ CORRECT: Use clickedInventory
@EventHandler
public void onClick(InventoryClickEvent event) {
    Inventory clicked = event.getClickedInventory();
    Inventory top = event.getView().getTopInventory();
    
    if (clicked != null && clicked.equals(top)) {
        event.setCancelled(true);
        // Works with any inventory size
    }
}
```

#### Mistake 3: Not Cleaning Up on Close

```java
// ❌ WRONG: Memory leak
private final Map<UUID, CustomGUI> openGUIs = new HashMap<>();

public void openGUI(Player player, CustomGUI gui) {
    openGUIs.put(player.getUniqueId(), gui);
    gui.open(player);
    // Never removed! Stays in memory forever!
}

// ✅ CORRECT: Clean up on close
@EventHandler
public void onClose(InventoryCloseEvent event) {
    if (event.getPlayer() instanceof Player player) {
        openGUIs.remove(player.getUniqueId());
    }
}
```

#### Mistake 4: Not Checking Item Null

```java
// ❌ WRONG: NPE when clicking empty slot
@EventHandler
public void onClick(InventoryClickEvent event) {
    ItemStack item = event.getCurrentItem();
    if (item.getType() == Material.DIAMOND) { // NPE if item is null!
        // ...
    }
}

// ✅ CORRECT: Null check
@EventHandler
public void onClick(InventoryClickEvent event) {
    ItemStack item = event.getCurrentItem();
    if (item == null || item.getType() == Material.AIR) {
        return; // Empty slot
    }
    
    if (item.getType() == Material.DIAMOND) {
        // Safe
    }
}
```

---

## 6. Scheduler & Async API

### 6.1 BukkitScheduler Patterns

**Complete scheduler method reference:**

```java
BukkitScheduler scheduler = Bukkit.getScheduler();

// ✅ Run immediately on main thread (next tick)
scheduler.runTask(plugin, () -> {
    // Sync task - safe to use Bukkit API
    player.teleport(location);
});

// ✅ Run after delay (in ticks, 20 ticks = 1 second)
scheduler.runTaskLater(plugin, () -> {
    player.sendMessage(Component.text("5 seconds have passed!"));
}, 100L); // 100 ticks = 5 seconds

// ✅ Run repeatedly (delay, then period)
BukkitTask task = scheduler.runTaskTimer(plugin, () -> {
    player.sendActionBar(Component.text("Repeating message"));
}, 0L, 20L); // Start immediately, repeat every second

// ✅ Run async (separate thread - CANNOT use most Bukkit API!)
scheduler.runTaskAsynchronously(plugin, () -> {
    // Async task - database queries, file I/O, etc.
    PlayerData data = database.load(uuid);
    
    // ❌ CANNOT: player.teleport(), player.getInventory(), etc.
    // ✅ CAN: database operations, calculations, file operations
    
    // Switch back to main thread to apply changes
    scheduler.runTask(plugin, () -> {
        applyPlayerData(player, data);
    });
});

// ✅ Run async after delay
scheduler.runTaskLaterAsynchronously(plugin, () -> {
    // Async delayed task
}, 100L);

// ✅ Run async repeatedly
BukkitTask asyncTask = scheduler.runTaskTimerAsynchronously(plugin, () -> {
    // Async repeating task
    checkDatabaseForUpdates();
}, 0L, 600L); // Every 30 seconds
```

**Scheduler Method Complete Reference:**

| Method | Thread | Delay? | Repeat? | Returns | Use Case |
|--------|--------|--------|---------|---------|----------|
| `runTask` | Main | No | No | BukkitTask | Immediate Bukkit API access |
| `runTaskLater` | Main | Yes | No | BukkitTask | Delayed Bukkit API access |
| `runTaskTimer` | Main | Yes | Yes | BukkitTask | Repeating Bukkit API access |
| `runTaskAsynchronously` | Async | No | No | BukkitTask | Immediate async work |
| `runTaskLaterAsynchronously` | Async | Yes | No | BukkitTask | Delayed async work |
| `runTaskTimerAsynchronously` | Async | Yes | Yes | BukkitTask | Repeating async work |

**Time Conversion:**

```java
// Ticks to seconds: divide by 20
// Seconds to ticks: multiply by 20

long oneSecond = 20L;      // 20 ticks
long fiveSeconds = 100L;   // 100 ticks
long oneMinute = 1200L;    // 1200 ticks
long oneHour = 72000L;     // 72000 ticks

// Helper method
public long secondsToTicks(int seconds) {
    return seconds * 20L;
}

public long minutesToTicks(int minutes) {
    return minutes * 1200L;
}
```

### 6.2 Paper AsyncScheduler

**Paper's modern async scheduler (1.20+):**

```java
// ✅ Global region scheduler (main thread tasks)
Bukkit.getGlobalRegionScheduler().run(plugin, task -> {
    // Runs on main thread, safe for Bukkit API
    player.sendMessage(Component.text("Hello!"));
});

// ✅ Entity scheduler (tasks bound to an entity)
player.getScheduler().run(plugin, task -> {
    // Runs on the thread owning this entity
    // Safe to access player's data
}, () -> {
    // Retired callback (entity no longer valid)
});

// ✅ Async scheduler (dedicated async thread pool)
Bukkit.getAsyncScheduler().runNow(plugin, task -> {
    // Async task - database, calculations, etc.
    PlayerData data = database.load(uuid);
});

// ✅ Async delayed task
Bukkit.getAsyncScheduler().runDelayed(plugin, task -> {
    // Async after 5 seconds
}, 5, TimeUnit.SECONDS);

// ✅ Async repeating task
Bukkit.getAsyncScheduler().runAtFixedRate(plugin, task -> {
    // Repeats every 30 seconds
    checkForUpdates();
}, 0, 30, TimeUnit.SECONDS);
```

**Paper vs Classic Scheduler:**

| Classic BukkitScheduler | Paper AsyncScheduler | Notes |
|------------------------|---------------------|-------|
| `runTask` | `GlobalRegionScheduler.run` | Main thread |
| `runTaskLater` | `GlobalRegionScheduler.runDelayed` | Delayed main thread |
| `runTaskTimer` | `GlobalRegionScheduler.runAtFixedRate` | Repeating main thread |
| `runTaskAsynchronously` | `AsyncScheduler.runNow` | Immediate async |
| `runTaskLaterAsynchronously` | `AsyncScheduler.runDelayed` | Delayed async |
| `runTaskTimerAsynchronously` | `AsyncScheduler.runAtFixedRate` | Repeating async |

### 6.3 Task Lifecycle Management

**Storing and cancelling tasks:**

```java
public class CooldownManager {
    
    private final Map<UUID, BukkitTask> activeTasks = new HashMap<>();
    
    /**
     * Start cooldown for player.
     */
    public void startCooldown(Player player, int seconds, Runnable onComplete) {
        UUID uuid = player.getUniqueId();
        
        // Cancel existing cooldown if any
        cancelCooldown(uuid);
        
        // Create new cooldown task
        BukkitTask task = Bukkit.getScheduler().runTaskLater(plugin, () -> {
            activeTasks.remove(uuid); // Remove from map
            onComplete.run(); // Execute callback
        }, seconds * 20L);
        
        // Store task
        activeTasks.put(uuid, task);
    }
    
    /**
     * Cancel cooldown for player.
     */
    public void cancelCooldown(UUID uuid) {
        BukkitTask task = activeTasks.remove(uuid);
        if (task != null) {
            task.cancel();
        }
    }
    
    /**
     * Check if player has active cooldown.
     */
    public boolean hasCooldown(UUID uuid) {
        return activeTasks.containsKey(uuid);
    }
    
    /**
     * Cancel all cooldowns (on plugin disable).
     */
    public void cancelAll() {
        for (BukkitTask task : activeTasks.values()) {
            task.cancel();
        }
        activeTasks.clear();
    }
}

// In plugin onDisable()
@Override
public void onDisable() {
    cooldownManager.cancelAll(); // CRITICAL: Cancel all tasks!
}
```

**Global task tracking:**

```java
public class MyPlugin extends JavaPlugin {
    
    private final Set<BukkitTask> activeTasks = new HashSet<>();
    
    /**
     * Run task and track it.
     */
    public BukkitTask runTrackedTask(Runnable runnable) {
        BukkitTask task = Bukkit.getScheduler().runTask(this, () -> {
            try {
                runnable.run();
            } finally {
                activeTasks.remove(task);
            }
        });
        activeTasks.add(task);
        return task;
    }
    
    /**
     * Run delayed task and track it.
     */
    public BukkitTask runTrackedTaskLater(Runnable runnable, long delay) {
        BukkitTask task = Bukkit.getScheduler().runTaskLater(this, () -> {
            try {
                runnable.run();
            } finally {
                activeTasks.remove(task);
            }
        }, delay);
        activeTasks.add(task);
        return task;
    }
    
    @Override
    public void onDisable() {
        // Cancel all tracked tasks
        for (BukkitTask task : activeTasks) {
            task.cancel();
        }
        activeTasks.clear();
    }
}
```

### 6.4 Thread Safety Rules

**CRITICAL: What you CAN and CANNOT do in async tasks:**

| Operation | Sync (Main Thread) | Async Thread |
|-----------|-------------------|--------------|
| `player.teleport()` | ✅ Yes | ❌ **NO** - Crash! |
| `player.getInventory().addItem()` | ✅ Yes | ❌ **NO** - Crash! |
| `block.setType()` | ✅ Yes | ❌ **NO** - Crash! |
| `world.spawnEntity()` | ✅ Yes | ❌ **NO** - Crash! |
| Database queries | ⚠️ Blocks server | ✅ **YES** - Recommended |
| File I/O | ⚠️ Blocks server | ✅ **YES** - Recommended |
| Calculations | ✅ Yes | ✅ Yes |
| `player.getUniqueId()` | ✅ Yes | ✅ Yes - Safe |
| `player.getName()` | ✅ Yes | ⚠️ Maybe - Not guaranteed |
| Collection manipulation | ✅ Yes | ⚠️ Needs sync |

**Thread-Safe Pattern:**

```java
// ✅ CORRECT: Async → Sync pattern
CompletableFuture.runAsync(() -> {
    // ASYNC THREAD: Database work
    PlayerData data = database.loadPlayerData(uuid);
    ItemStack reward = createReward(data);
    
    // Switch to MAIN THREAD for Bukkit API
    Bukkit.getScheduler().runTask(plugin, () -> {
        // MAIN THREAD: Bukkit API safe
        Player player = Bukkit.getPlayer(uuid);
        if (player != null && player.isOnline()) {
            player.getInventory().addItem(reward);
            player.sendMessage(Component.text("Reward given!"));
        }
    });
});

// ❌ WRONG: Bukkit API from async thread
CompletableFuture.runAsync(() -> {
    PlayerData data = database.loadPlayerData(uuid);
    
    Player player = Bukkit.getPlayer(uuid);
    player.getInventory().addItem(reward); // CRASH!
});
```

**Thread-Safe Collections:**

```java
// ❌ WRONG: Regular HashMap from multiple threads
private final Map<UUID, PlayerData> cache = new HashMap<>();

public void saveAsync(UUID uuid, PlayerData data) {
    CompletableFuture.runAsync(() -> {
        cache.put(uuid, data); // CONCURRENT MODIFICATION!
        database.save(uuid, data);
    });
}

// ✅ CORRECT: ConcurrentHashMap
private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();

public void saveAsync(UUID uuid, PlayerData data) {
    CompletableFuture.runAsync(() -> {
        cache.put(uuid, data); // Thread-safe
        database.save(uuid, data);
    });
}

// ✅ ALTERNATIVE: Synchronized access
private final Map<UUID, PlayerData> cache = new HashMap<>();

public synchronized void saveAsync(UUID uuid, PlayerData data) {
    cache.put(uuid, data);
    CompletableFuture.runAsync(() -> {
        database.save(uuid, data);
    });
}
```

---

## 7. Configuration API

### 7.1 FileConfiguration Patterns

**Basic config.yml usage:**

```java
public class MyPlugin extends JavaPlugin {
    
    @Override
    public void onEnable() {
        // ✅ Save default config if doesn't exist
        saveDefaultConfig();
        
        // ✅ Access config
        FileConfiguration config = getConfig();
        
        // Read values
        String message = config.getString("messages.welcome");
        int cooldown = config.getInt("cooldown");
        boolean enabled = config.getBoolean("features.teleport");
        List<String> commands = config.getStringList("blocked-commands");
    }
    
    public void reloadConfiguration() {
        // ✅ Reload config from disk
        reloadConfig();
        
        // Re-read values
        loadConfigurationValues();
    }
}
```

**config.yml structure:**

```yaml
# Configuration for MyPlugin

messages:
  welcome: "Welcome to the server!"
  goodbye: "See you later!"
  
cooldown: 30

features:
  teleport: true
  combat-log: false
  
blocked-commands:
  - "op"
  - "deop"
  - "stop"
  
rewards:
  daily:
    enabled: true
    items:
      - type: DIAMOND
        amount: 5
      - type: GOLD_INGOT
        amount: 10
```

### 7.2 Type-Safe Access

**Safe configuration reading with defaults:**

```java
public class ConfigManager {
    
    private final FileConfiguration config;
    
    // Cache configuration values
    private String welcomeMessage;
    private int cooldownSeconds;
    private boolean teleportEnabled;
    
    public ConfigManager(JavaPlugin plugin) {
        this.config = plugin.getConfig();
        load();
    }
    
    /**
     * Load all configuration values with validation.
     */
    public void load() {
        // ✅ String with default
        welcomeMessage = config.getString("messages.welcome", "Welcome!");
        
        // ✅ Integer with validation
        cooldownSeconds = config.getInt("cooldown", 30);
        if (cooldownSeconds < 0) {
            plugin.getLogger().warning("Invalid cooldown, using default");
            cooldownSeconds = 30;
        }
        
        // ✅ Boolean with default
        teleportEnabled = config.getBoolean("features.teleport", true);
        
        // ✅ Enum with fallback
        String modeString = config.getString("game-mode", "SURVIVAL");
        GameMode gameMode;
        try {
            gameMode = GameMode.valueOf(modeString.toUpperCase());
        } catch (IllegalArgumentException e) {
            plugin.getLogger().warning("Invalid game mode: " + modeString);
            gameMode = GameMode.SURVIVAL;
        }
        
        // ✅ List with default
        List<String> blockedCommands = config.getStringList("blocked-commands");
        if (blockedCommands.isEmpty()) {
            blockedCommands = Arrays.asList("op", "deop");
        }
    }
    
    /**
     * Get value with runtime validation.
     */
    public int getIntSafe(String path, int defaultValue, int min, int max) {
        int value = config.getInt(path, defaultValue);
        
        if (value < min || value > max) {
            plugin.getLogger().warning(String.format(
                "Invalid value for %s: %d (must be %d-%d)",
                path, value, min, max
            ));
            return defaultValue;
        }
        
        return value;
    }
    
    // Getters for cached values
    public String getWelcomeMessage() {
        return welcomeMessage;
    }
    
    public int getCooldownSeconds() {
        return cooldownSeconds;
    }
    
    public boolean isTeleportEnabled() {
        return teleportEnabled;
    }
}
```

**Material/Item configuration:**

```java
public ItemStack getConfiguredItem(String path) {
    ConfigurationSection section = config.getConfigurationSection(path);
    if (section == null) {
        return new ItemStack(Material.STONE);
    }
    
    // ✅ Parse material safely
    String materialName = section.getString("type", "STONE");
    Material material;
    try {
        material = Material.valueOf(materialName.toUpperCase());
    } catch (IllegalArgumentException e) {
        plugin.getLogger().warning("Invalid material: " + materialName);
        material = Material.STONE;
    }
    
    // ✅ Get amount with validation
    int amount = section.getInt("amount", 1);
    if (amount < 1 || amount > 64) {
        amount = 1;
    }
    
    // ✅ Create item
    ItemStack item = new ItemStack(material, amount);
    
    // ✅ Add display name if present
    if (section.contains("name")) {
        ItemMeta meta = item.getItemMeta();
        meta.displayName(Component.text(section.getString("name")));
        item.setItemMeta(meta);
    }
    
    return item;
}
```

### 7.3 Custom Config Files

**Creating additional configuration files:**

```java
public class CustomConfigManager {
    
    private final JavaPlugin plugin;
    private File configFile;
    private FileConfiguration config;
    
    public CustomConfigManager(JavaPlugin plugin, String fileName) {
        this.plugin = plugin;
        this.configFile = new File(plugin.getDataFolder(), fileName);
        
        // Create config file if doesn't exist
        if (!configFile.exists()) {
            plugin.saveResource(fileName, false);
        }
        
        // Load configuration
        this.config = YamlConfiguration.loadConfiguration(configFile);
    }
    
    /**
     * Get the configuration.
     */
    public FileConfiguration getConfig() {
        return config;
    }
    
    /**
     * Save configuration to disk.
     */
    public void save() {
        try {
            config.save(configFile);
        } catch (IOException e) {
            plugin.getLogger().severe("Could not save " + configFile.getName());
            e.printStackTrace();
        }
    }
    
    /**
     * Reload configuration from disk.
     */
    public void reload() {
        config = YamlConfiguration.loadConfiguration(configFile);
        
        // ✅ Also load defaults from jar
        InputStream defaultStream = plugin.getResource(configFile.getName());
        if (defaultStream != null) {
            YamlConfiguration defaultConfig = 
                YamlConfiguration.loadConfiguration(
                    new InputStreamReader(defaultStream, StandardCharsets.UTF_8)
                );
            config.setDefaults(defaultConfig);
        }
    }
    
    /**
     * Set value and save.
     */
    public void set(String path, Object value) {
        config.set(path, value);
        save();
    }
}

// Usage in plugin
public class MyPlugin extends JavaPlugin {
    
    private CustomConfigManager dataConfig;
    private CustomConfigManager messagesConfig;
    
    @Override
    public void onEnable() {
        // Main config
        saveDefaultConfig();
        
        // Additional configs
        dataConfig = new CustomConfigManager(this, "data.yml");
        messagesConfig = new CustomConfigManager(this, "messages.yml");
    }
    
    public void savePlayerData(UUID uuid, PlayerData data) {
        String path = "players." + uuid;
        dataConfig.set(path + ".coins", data.getCoins());
        dataConfig.set(path + ".level", data.getLevel());
    }
}
```

### 7.4 Config Anti-Patterns

#### Anti-Pattern 1: Not Providing Defaults

```java
// ❌ WRONG: Returns null if key missing
String message = config.getString("messages.welcome");
player.sendMessage(message); // NPE if key missing!

// ✅ CORRECT: Always provide default
String message = config.getString("messages.welcome", "Welcome!");
player.sendMessage(Component.text(message)); // Safe
```

#### Anti-Pattern 2: Not Validating Values

```java
// ❌ WRONG: No validation
int cooldown = config.getInt("cooldown");
// If admin sets cooldown: -999, plugin breaks!

// ✅ CORRECT: Validate ranges
int cooldown = config.getInt("cooldown", 30);
if (cooldown < 0 || cooldown > 3600) {
    getLogger().warning("Invalid cooldown value, using default");
    cooldown = 30;
}
```

#### Anti-Pattern 3: Not Saving Custom Configs

```java
// ❌ WRONG: Modifying without saving
dataConfig.getConfig().set("player.coins", 100);
// Lost on server restart!

// ✅ CORRECT: Save after modification
dataConfig.set("player.coins", 100); // Calls save() internally

// Or:
dataConfig.getConfig().set("player.coins", 100);
dataConfig.save(); // Explicit save
```

#### Anti-Pattern 4: Storing UUIDs as Strings Manually

```java
// ❌ WRONG: Manual UUID conversion
UUID uuid = player.getUniqueId();
config.set("owner", uuid.toString());
UUID loaded = UUID.fromString(config.getString("owner"));

// ✅ CORRECT: FileConfiguration handles it
UUID uuid = player.getUniqueId();
config.set("owner", uuid); // Automatic serialization
UUID loaded = (UUID) config.get("owner"); // Automatic deserialization

// Or explicitly:
config.set("owner", uuid.toString());
UUID loaded = UUID.fromString(config.getString("owner"));
```

---

## 8. Adventure API (Modern Components)

### 8.1 Component-Based Messaging

**Modern Adventure Component API (Paper 1.16+):**

```java
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.format.TextDecoration;

// ✅ Basic colored text
Component message = Component.text("Hello, World!", NamedTextColor.GOLD);
player.sendMessage(message);

// ✅ Multiple colors
Component multi = Component.text("Welcome ")
    .color(NamedTextColor.YELLOW)
    .append(Component.text(player.getName(), NamedTextColor.AQUA))
    .append(Component.text("!", NamedTextColor.YELLOW));
player.sendMessage(multi);

// ✅ Hex colors (RGB)
Component hex = Component.text("Custom Color!", TextColor.fromHexString("#FF5733"));

// ✅ Text decorations
Component bold = Component.text("Bold Text", NamedTextColor.RED)
    .decorate(TextDecoration.BOLD);

Component italic = Component.text("Italic Text")
    .decorate(TextDecoration.ITALIC);

Component underline = Component.text("Underlined")
    .decorate(TextDecoration.UNDERLINED);

// ✅ Multiple decorations
Component fancy = Component.text("Fancy Text", NamedTextColor.GOLD)
    .decorate(TextDecoration.BOLD)
    .decorate(TextDecoration.ITALIC);

// ✅ Click events
Component clickable = Component.text("[Click Me]", NamedTextColor.GREEN)
    .clickEvent(ClickEvent.runCommand("/spawn"));

Component url = Component.text("[Visit Website]", NamedTextColor.BLUE)
    .clickEvent(ClickEvent.openUrl("https://example.com"));

// ✅ Hover events
Component hover = Component.text("Hover Me", NamedTextColor.YELLOW)
    .hoverEvent(HoverEvent.showText(
        Component.text("This is a tooltip!", NamedTextColor.GRAY)
    ));

// ✅ Combined click and hover
Component combined = Component.text("[Teleport]", NamedTextColor.AQUA)
    .clickEvent(ClickEvent.runCommand("/spawn"))
    .hoverEvent(HoverEvent.showText(
        Component.text("Click to teleport to spawn", NamedTextColor.GRAY)
    ));

player.sendMessage(combined);
```

**NamedTextColor Complete Reference:**

| Color | Hex | Legacy Code |
|-------|-----|-------------|
| `BLACK` | #000000 | §0 |
| `DARK_BLUE` | #0000AA | §1 |
| `DARK_GREEN` | #00AA00 | §2 |
| `DARK_AQUA` | #00AAAA | §3 |
| `DARK_RED` | #AA0000 | §4 |
| `DARK_PURPLE` | #AA00AA | §5 |
| `GOLD` | #FFAA00 | §6 |
| `GRAY` | #AAAAAA | §7 |
| `DARK_GRAY` | #555555 | §8 |
| `BLUE` | #5555FF | §9 |
| `GREEN` | #55FF55 | §a |
| `AQUA` | #55FFFF | §b |
| `RED` | #FF5555 | §c |
| `LIGHT_PURPLE` | #FF55FF | §d |
| `YELLOW` | #FFFF55 | §e |
| `WHITE` | #FFFFFF | §f |

### 8.2 Audience API

**Audience-based messaging (Paper):**

```java
import net.kyori.adventure.audience.Audience;

// ✅ Send to single player
Audience player = (Audience) player;
player.sendMessage(Component.text("Hello!"));

// ✅ Send to multiple audiences
Audience multi = Audience.audience(player1, player2, player3);
multi.sendMessage(Component.text("Announcement!"));

// ✅ Send to all online players
Audience all = Bukkit.getServer();
all.sendMessage(Component.text("Server message"));

// ✅ Send action bar
player.sendActionBar(Component.text("Action Bar!", NamedTextColor.GOLD));

// ✅ Send title
player.showTitle(Title.title(
    Component.text("Main Title", NamedTextColor.GOLD),
    Component.text("Subtitle", NamedTextColor.YELLOW)
));

// ✅ Title with timing
import net.kyori.adventure.title.Title;
import java.time.Duration;

player.showTitle(Title.title(
    Component.text("Welcome!"),
    Component.text(player.getName()),
    Title.Times.times(
        Duration.ofMillis(500),  // Fade in
        Duration.ofSeconds(3),   // Stay
        Duration.ofMillis(1000)  // Fade out
    )
));

// ✅ Clear title
player.clearTitle();

// ✅ Play sound
import net.kyori.adventure.sound.Sound;

player.playSound(Sound.sound(
    org.bukkit.Sound.ENTITY_PLAYER_LEVELUP,
    Sound.Source.PLAYER,
    1.0f, // Volume
    1.0f  // Pitch
));
```

### 8.3 MiniMessage Format

**MiniMessage: Modern text formatting (Paper 1.19+):**

```java
import net.kyori.adventure.text.minimessage.MiniMessage;

MiniMessage mm = MiniMessage.miniMessage();

// ✅ Basic colors
Component msg = mm.deserialize("<red>This is red!</red>");
Component msg = mm.deserialize("<#FF5733>Custom hex color!</#FF5733>");

// ✅ Decorations
Component bold = mm.deserialize("<bold>Bold text</bold>");
Component italic = mm.deserialize("<italic>Italic text</italic>");
Component underline = mm.deserialize("<underline>Underlined</underline>");

// ✅ Combined formatting
Component fancy = mm.deserialize("<bold><red>Bold and Red</red></bold>");

// ✅ Gradients
Component gradient = mm.deserialize(
    "<gradient:red:blue>This text fades from red to blue!</gradient>"
);

Component rainbow = mm.deserialize(
    "<rainbow>Rainbow text!</rainbow>"
);

// ✅ Click events
Component click = mm.deserialize(
    "<click:run_command:'/spawn'>[Click to teleport]</click>"
);

Component url = mm.deserialize(
    "<click:open_url:'https://example.com'>[Visit Website]</click>"
);

// ✅ Hover events
Component hover = mm.deserialize(
    "<hover:show_text:'<green>Tooltip text'>Hover over me</hover>"
);

// ✅ Placeholders
String playerName = player.getName();
Component welcome = mm.deserialize(
    "<gold>Welcome, <aqua><player></aqua>!</gold>",
    Placeholder.unparsed("player", playerName)
);

// ✅ Multiple placeholders
Component stats = mm.deserialize(
    "<yellow>Level: <level> | Coins: <coins></yellow>",
    Placeholder.unparsed("level", String.valueOf(playerLevel)),
    Placeholder.unparsed("coins", String.valueOf(playerCoins))
);

player.sendMessage(stats);
```

**MiniMessage Tag Reference:**

| Tag | Example | Result |
|-----|---------|--------|
| `<red>` | `<red>Text</red>` | Red text |
| `<#RRGGBB>` | `<#FF5733>Text</#FF5733>` | Hex color |
| `<bold>` | `<bold>Text</bold>` | **Bold** |
| `<italic>` | `<italic>Text</italic>` | *Italic* |
| `<underline>` | `<underline>Text</underline>` | Underlined |
| `<strikethrough>` | `<strikethrough>Text</strikethrough>` | ~~Strikethrough~~ |
| `<obfuscated>` | `<obfuscated>Text</obfuscated>` | Random chars |
| `<gradient>` | `<gradient:red:blue>Text</gradient>` | Color gradient |
| `<rainbow>` | `<rainbow>Text</rainbow>` | Rainbow effect |
| `<click>` | `<click:run_command:'/cmd'>Text</click>` | Clickable |
| `<hover>` | `<hover:show_text:'Tip'>Text</hover>` | Hover tooltip |

### 8.4 Legacy Migration

**Converting from legacy ChatColor to Adventure:**

```java
// ❌ OLD: Legacy ChatColor
import org.bukkit.ChatColor;

String legacy = ChatColor.GOLD + "Welcome " + ChatColor.AQUA + player.getName();
player.sendMessage(legacy);

// ✅ NEW: Adventure Component
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;

Component modern = Component.text("Welcome ", NamedTextColor.GOLD)
    .append(Component.text(player.getName(), NamedTextColor.AQUA));
player.sendMessage(modern);

// ✅ NEW: MiniMessage (even cleaner)
import net.kyori.adventure.text.minimessage.MiniMessage;

MiniMessage mm = MiniMessage.miniMessage();
Component msg = mm.deserialize(
    "<gold>Welcome <aqua><player></aqua></gold>",
    Placeholder.unparsed("player", player.getName())
);
player.sendMessage(msg);
```

**Legacy to Component Converter:**

```java
public class LegacyConverter {
    
    /**
     * Convert legacy '&' color codes to Component.
     */
    public static Component fromLegacy(String legacy) {
        // Replace & with § for Bukkit's translator
        String translated = ChatColor.translateAlternateColorCodes('&', legacy);
        
        // Convert to Component using legacy serializer
        return LegacyComponentSerializer.legacySection().deserialize(translated);
    }
    
    /**
     * Convert Component to legacy string (for backwards compatibility).
     */
    public static String toLegacy(Component component) {
        return LegacyComponentSerializer.legacySection().serialize(component);
    }
}

// Usage
Component component = LegacyConverter.fromLegacy("&6Welcome &b" + playerName);
player.sendMessage(component);

// For config files that still use & codes
String configMessage = config.getString("messages.welcome");
Component message = LegacyConverter.fromLegacy(configMessage);
player.sendMessage(message);
```

**Mixed Legacy and Modern:**

```java
// If you need to support both old and new systems
public class MessageSender {
    
    private static final boolean HAS_ADVENTURE;
    
    static {
        boolean hasAdventure;
        try {
            Class.forName("net.kyori.adventure.text.Component");
            hasAdventure = true;
        } catch (ClassNotFoundException e) {
            hasAdventure = false;
        }
        HAS_ADVENTURE = hasAdventure;
    }
    
    public static void send(Player player, String message) {
        if (HAS_ADVENTURE) {
            // Modern Paper
            Component component = LegacyConverter.fromLegacy(message);
            player.sendMessage(component);
        } else {
            // Old Bukkit/Spigot
            String legacy = ChatColor.translateAlternateColorCodes('&', message);
            player.sendMessage(legacy);
        }
    }
}
```

---

## 9. PersistentDataContainer

### 9.1 PDC Basics

**PersistentDataContainer (PDC) stores custom data on entities, items, blocks, and chunks:**

```java
import org.bukkit.NamespacedKey;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

// ✅ Create NamespacedKey (identifies your plugin's data)
NamespacedKey key = new NamespacedKey(plugin, "custom_data");

// ✅ Store data on player
Player player = ...;
PersistentDataContainer pdc = player.getPersistentDataContainer();

pdc.set(key, PersistentDataType.INTEGER, 100);

// ✅ Retrieve data
if (pdc.has(key, PersistentDataType.INTEGER)) {
    int value = pdc.get(key, PersistentDataType.INTEGER);
    player.sendMessage(Component.text("Value: " + value));
}

// ✅ Remove data
pdc.remove(key);

// ✅ Store data on item
ItemStack item = new ItemStack(Material.DIAMOND_SWORD);
ItemMeta meta = item.getItemMeta();
PersistentDataContainer itemPdc = meta.getPersistentDataContainer();

itemPdc.set(key, PersistentDataType.STRING, "legendary");
item.setItemMeta(meta);

// ✅ Check item data
ItemMeta meta2 = item.getItemMeta();
if (meta2.getPersistentDataContainer().has(key, PersistentDataType.STRING)) {
    String rarity = meta2.getPersistentDataContainer()
        .get(key, PersistentDataType.STRING);
    // rarity = "legendary"
}
```

### 9.2 Data Types & Custom Types

**PersistentDataType Complete Reference:**

| Type | Java Type | Storage Size | Use Case |
|------|-----------|--------------|----------|
| `BYTE` | byte | 1 byte | Boolean flags, tiny numbers |
| `SHORT` | short | 2 bytes | Small numbers (-32k to 32k) |
| `INTEGER` | int | 4 bytes | **Most common** (counts, IDs) |
| `LONG` | long | 8 bytes | Timestamps, large numbers |
| `FLOAT` | float | 4 bytes | Decimal numbers |
| `DOUBLE` | double | 8 bytes | Precise decimals |
| `STRING` | String | Variable | Text, UUIDs, names |
| `BYTE_ARRAY` | byte[] | Variable | Small binary data |
| `INTEGER_ARRAY` | int[] | Variable | Multiple numbers |
| `LONG_ARRAY` | long[] | Variable | Multiple timestamps |
| `TAG_CONTAINER` | PersistentDataContainer | Variable | **Nested data** |
| `TAG_CONTAINER_ARRAY` | PersistentDataContainer[] | Variable | Multiple nested objects |

**Usage examples:**

```java
NamespacedKey key = new NamespacedKey(plugin, "data");
PersistentDataContainer pdc = player.getPersistentDataContainer();

// ✅ BYTE: Boolean flags
pdc.set(key, PersistentDataType.BYTE, (byte) 1); // true
pdc.set(key, PersistentDataType.BYTE, (byte) 0); // false

// ✅ INTEGER: Counts, levels, coins
pdc.set(new NamespacedKey(plugin, "level"), PersistentDataType.INTEGER, 50);
pdc.set(new NamespacedKey(plugin, "coins"), PersistentDataType.INTEGER, 1000);

// ✅ LONG: Timestamps
long timestamp = System.currentTimeMillis();
pdc.set(new NamespacedKey(plugin, "last_seen"), PersistentDataType.LONG, timestamp);

// ✅ STRING: UUIDs, names, IDs
pdc.set(new NamespacedKey(plugin, "owner"), 
    PersistentDataType.STRING, 
    player.getUniqueId().toString());

// ✅ INTEGER_ARRAY: Multiple values
int[] coords = {100, 64, 200};
pdc.set(new NamespacedKey(plugin, "home"), PersistentDataType.INTEGER_ARRAY, coords);

// ✅ TAG_CONTAINER: Nested data
PersistentDataContainer nested = pdc.getAdapterContext()
    .newPersistentDataContainer();
nested.set(new NamespacedKey(plugin, "x"), PersistentDataType.INTEGER, 100);
nested.set(new NamespacedKey(plugin, "y"), PersistentDataType.INTEGER, 64);
nested.set(new NamespacedKey(plugin, "z"), PersistentDataType.INTEGER, 200);

pdc.set(new NamespacedKey(plugin, "location"), 
    PersistentDataType.TAG_CONTAINER, nested);
```

**Custom Data Types:**

```java
// ✅ UUID storage
public class UUIDDataType implements PersistentDataType<byte[], UUID> {
    
    @Override
    public Class<byte[]> getPrimitiveType() {
        return byte[].class;
    }
    
    @Override
    public Class<UUID> getComplexType() {
        return UUID.class;
    }
    
    @Override
    public byte[] toPrimitive(UUID complex, PersistentDataAdapterContext context) {
        ByteBuffer bb = ByteBuffer.wrap(new byte[16]);
        bb.putLong(complex.getMostSignificantBits());
        bb.putLong(complex.getLeastSignificantBits());
        return bb.array();
    }
    
    @Override
    public UUID fromPrimitive(byte[] primitive, PersistentDataAdapterContext context) {
        ByteBuffer bb = ByteBuffer.wrap(primitive);
        long firstLong = bb.getLong();
        long secondLong = bb.getLong();
        return new UUID(firstLong, secondLong);
    }
}

// Usage
public static final UUIDDataType UUID_TYPE = new UUIDDataType();

pdc.set(key, UUID_TYPE, player.getUniqueId());
UUID stored = pdc.get(key, UUID_TYPE);

// ✅ Location storage
public class LocationDataType implements PersistentDataType<PersistentDataContainer, Location> {
    
    @Override
    public Class<PersistentDataContainer> getPrimitiveType() {
        return PersistentDataContainer.class;
    }
    
    @Override
    public Class<Location> getComplexType() {
        return Location.class;
    }
    
    @Override
    public PersistentDataContainer toPrimitive(Location location, 
                                              PersistentDataAdapterContext context) {
        PersistentDataContainer container = context.newPersistentDataContainer();
        
        container.set(new NamespacedKey(plugin, "world"), 
            PersistentDataType.STRING, location.getWorld().getName());
        container.set(new NamespacedKey(plugin, "x"), 
            PersistentDataType.DOUBLE, location.getX());
        container.set(new NamespacedKey(plugin, "y"), 
            PersistentDataType.DOUBLE, location.getY());
        container.set(new NamespacedKey(plugin, "z"), 
            PersistentDataType.DOUBLE, location.getZ());
        container.set(new NamespacedKey(plugin, "yaw"), 
            PersistentDataType.FLOAT, location.getYaw());
        container.set(new NamespacedKey(plugin, "pitch"), 
            PersistentDataType.FLOAT, location.getPitch());
        
        return container;
    }
    
    @Override
    public Location fromPrimitive(PersistentDataContainer container, 
                                 PersistentDataAdapterContext context) {
        String worldName = container.get(new NamespacedKey(plugin, "world"), 
            PersistentDataType.STRING);
        World world = Bukkit.getWorld(worldName);
        
        if (world == null) {
            return null;
        }
        
        double x = container.get(new NamespacedKey(plugin, "x"), 
            PersistentDataType.DOUBLE);
        double y = container.get(new NamespacedKey(plugin, "y"), 
            PersistentDataType.DOUBLE);
        double z = container.get(new NamespacedKey(plugin, "z"), 
            PersistentDataType.DOUBLE);
        float yaw = container.get(new NamespacedKey(plugin, "yaw"), 
            PersistentDataType.FLOAT);
        float pitch = container.get(new NamespacedKey(plugin, "pitch"), 
            PersistentDataType.FLOAT);
        
        return new Location(world, x, y, z, yaw, pitch);
    }
}
```

### 9.3 Common PDC Mistakes

#### Mistake 1: Not Checking if Key Exists

```java
// ❌ WRONG: NPE if key doesn't exist
int value = pdc.get(key, PersistentDataType.INTEGER); // NPE!

// ✅ CORRECT: Check first
if (pdc.has(key, PersistentDataType.INTEGER)) {
    int value = pdc.get(key, PersistentDataType.INTEGER);
}

// ✅ ALTERNATIVE: Use getOrDefault
int value = pdc.getOrDefault(key, PersistentDataType.INTEGER, 0);
```

#### Mistake 2: Storing UUID as String (Inefficient)

```java
// ❌ WRONG: String storage (36 bytes)
pdc.set(key, PersistentDataType.STRING, uuid.toString());

// ✅ BETTER: Custom UUID type (16 bytes)
pdc.set(key, UUID_TYPE, uuid);

// ✅ ALTERNATIVE: LONG_ARRAY (16 bytes)
long[] uuidArray = {uuid.getMostSignificantBits(), uuid.getLeastSignificantBits()};
pdc.set(key, PersistentDataType.LONG_ARRAY, uuidArray);
```

#### Mistake 3: Forgetting to Update ItemMeta

```java
// ❌ WRONG: Item meta not applied
ItemStack item = new ItemStack(Material.DIAMOND);
ItemMeta meta = item.getItemMeta();
meta.getPersistentDataContainer().set(key, PersistentDataType.INTEGER, 100);
// Forgot to set meta back!

// ✅ CORRECT: Always set meta back
ItemStack item = new ItemStack(Material.DIAMOND);
ItemMeta meta = item.getItemMeta();
meta.getPersistentDataContainer().set(key, PersistentDataType.INTEGER, 100);
item.setItemMeta(meta); // CRITICAL!
```

#### Mistake 4: Name Collision with Other Plugins

```java
// ❌ WRONG: Generic key name
NamespacedKey key = new NamespacedKey(plugin, "level");
// Another plugin might use "level" too!

// ✅ CORRECT: Specific, unique key names
NamespacedKey key = new NamespacedKey(plugin, "myplugin_player_level");
// Or use plugin name in namespace:
NamespacedKey key = new NamespacedKey(plugin, "player_level");
// Namespace is automatically "myplugin:player_level"
```

---

## 10. API Confusion Matrix

### 10.1 Bukkit vs Spigot vs Paper

**What belongs where:**

| Feature | Package | Availability |
|---------|---------|--------------|
| `Player.sendMessage(String)` | `org.bukkit` | Bukkit, Spigot, Paper |
| `Player.sendMessage(Component)` | `org.bukkit` (Adventure) | **Paper only** |
| `ChatColor` | `org.bukkit` | Bukkit, Spigot, Paper |
| `Component` | `net.kyori.adventure` | **Paper 1.16+** |
| `PersistentDataContainer` | `org.bukkit.persistence` | **1.14+** (all servers) |
| `PlayerChatEvent` | `org.bukkit.event.player` | Deprecated everywhere |
| `AsyncPlayerChatEvent` | `org.bukkit.event.player` | Bukkit, Spigot, Paper |
| `AsyncChatEvent` | `io.papermc.paper.event` | **Paper 1.19+** |
| `BukkitScheduler` | `org.bukkit.scheduler` | Bukkit, Spigot, Paper |
| `AsyncScheduler` | `io.papermc.paper` | **Paper 1.20+** |
| `Spigot.sendMessage()` | `org.bukkit.entity.Player.spigot()` | **Spigot, Paper** |

### 10.2 Deprecated vs Modern APIs

**Complete API migration guide:**

| ❌ Deprecated/Legacy | ✅ Modern Alternative | Since When |
|---------------------|----------------------|------------|
| `PlayerChatEvent` | `AsyncPlayerChatEvent` | Bukkit 1.3 |
| `AsyncPlayerChatEvent` | `AsyncChatEvent` (Paper) | Paper 1.19 |
| `player.sendMessage(String)` | `player.sendMessage(Component)` | Paper 1.16 |
| `ChatColor.RED + text` | `Component.text(text, NamedTextColor.RED)` | Paper 1.16 |
| `player.setDisplayName(String)` | `player.displayName(Component)` | Paper 1.16 |
| `player.setPlayerListName(String)` | `player.playerListName(Component)` | Paper 1.16 |
| `Bukkit.getPlayer(name)` | `Bukkit.getPlayer(UUID)` | Always use UUID |
| `MaterialData` | `BlockData` | 1.13 (flattening) |
| `Material.WOOL` | `Material.WHITE_WOOL` | 1.13 (flattening) |
| `Material.LOG` | `Material.OAK_LOG` | 1.13 (flattening) |
| `DyeColor` on items | Direct material types | 1.13 (flattening) |
| `player.getHealth()` (int) | `player.getHealth()` (double) | 1.6 |
| `Bukkit.getOfflinePlayer(name)` | `Bukkit.getOfflinePlayer(UUID)` | Always use UUID |

### 10.3 Sync vs Async APIs

**Thread safety complete reference:**

| Operation | Main Thread (Sync) | Async Thread |
|-----------|-------------------|--------------|
| **Player Operations** | | |
| `player.teleport()` | ✅ Safe | ❌ **Crash** |
| `player.getInventory()` | ✅ Safe | ❌ **Crash** |
| `player.damage()` | ✅ Safe | ❌ **Crash** |
| `player.getUniqueId()` | ✅ Safe | ✅ Safe |
| `player.getName()` | ✅ Safe | ⚠️ Usually safe |
| **World Operations** | | |
| `block.setType()` | ✅ Safe | ❌ **Crash** |
| `world.spawnEntity()` | ✅ Safe | ❌ **Crash** |
| `world.getBlockAt()` | ✅ Safe | ❌ **Crash** |
| `chunk.load()` | ✅ Safe | ❌ **Crash** |
| `world.getChunkAtAsync()` | ✅ Safe | ✅ Safe (Paper) |
| **Inventory Operations** | | |
| `inventory.addItem()` | ✅ Safe | ❌ **Crash** |
| `inventory.setItem()` | ✅ Safe | ❌ **Crash** |
| `player.openInventory()` | ✅ Safe | ❌ **Crash** |
| **Data Operations** | | |
| Database query | ⚠️ Blocks server | ✅ **Recommended** |
| File I/O | ⚠️ Blocks server | ✅ **Recommended** |
| HTTP request | ⚠️ Blocks server | ✅ **Recommended** |
| **Collections** | | |
| `HashMap.put()` | ✅ Safe | ❌ Race condition |
| `ConcurrentHashMap.put()` | ✅ Safe | ✅ Safe |
| `ArrayList.add()` | ✅ Safe | ❌ Race condition |
| `Collections.synchronizedList()` | ✅ Safe | ✅ Safe |

### 10.4 Common Misconceptions

#### Misconception 1: "Paper API works on Spigot"

```java
// ❌ WRONG: Assuming Paper API on Spigot
import net.kyori.adventure.text.Component;

player.sendMessage(Component.text("Hello")); // CRASH on Spigot!

// ✅ CORRECT: Check runtime or use Bukkit API
if (ServerDetector.isPaper()) {
    player.sendMessage(Component.text("Hello"));
} else {
    player.sendMessage(ChatColor.GREEN + "Hello");
}
```

#### Misconception 2: "Async events run on async thread"

```java
// ⚠️ MISCONCEPTION: AsyncPlayerChatEvent is async
@EventHandler
public void onChat(AsyncPlayerChatEvent event) {
    // This IS async, cannot use Bukkit API!
    player.teleport(location); // CRASH!
}

// ⚠️ MISCONCEPTION: PlayerJoinEvent is sync
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    // This IS sync, can use Bukkit API
    player.teleport(location); // Safe
}

// ✅ RULE: Event name indicates thread
// - "Async" prefix = async thread
// - No "Async" = main thread
```

#### Misconception 3: "onDisable() can save data synchronously"

```java
// ❌ WRONG: Blocking in onDisable()
@Override
public void onDisable() {
    for (UUID uuid : playerData.keySet()) {
        database.savePlayerData(uuid); // BLOCKS shutdown!
    }
    // Server hangs for minutes during shutdown!
}

// ✅ CORRECT: Save synchronously (no async in onDisable)
@Override
public void onDisable() {
    // Shutdown is already async-safe, must complete quickly
    for (UUID uuid : playerData.keySet()) {
        database.savePlayerDataSync(uuid); // Optimized sync save
    }
}

// ✅ BETTER: Save incrementally during runtime
@EventHandler
public void onQuit(PlayerQuitEvent event) {
    UUID uuid = event.getPlayer().getUniqueId();
    CompletableFuture.runAsync(() -> {
        database.savePlayerData(uuid); // Save async on quit
    });
}
```

#### Misconception 4: "PersistentDataContainer persists everywhere"

```java
// ⚠️ MISCONCEPTION: PDC on all entities persists
Entity zombie = world.spawnEntity(location, EntityType.ZOMBIE);
PersistentDataContainer pdc = zombie.getPersistentDataContainer();
pdc.set(key, PersistentDataType.INTEGER, 100);
// Data is lost when entity despawns naturally!

// ✅ CORRECT: PDC persists only for:
// - Players (across sessions)
// - Items (in inventories, as drops)
// - Tile entities/blocks (in chunks)
// - Chunks (chunk data)

// Regular mobs: Data lost on despawn/unload unless persistent
zombie.setPersistent(true); // Now PDC persists
```

---

## Appendix A: Quick API Reference Card

**One-page cheat sheet for common operations:**

### Player Operations
```java
// Get player
Player player = Bukkit.getPlayer(uuid);
UUID uuid = player.getUniqueId();
String name = player.getName();

// Teleport
player.teleport(location);

// Health & food
player.setHealth(20.0);
player.setFoodLevel(20);

// Game mode
player.setGameMode(GameMode.SURVIVAL);

// Permissions
boolean hasPerm = player.hasPermission("plugin.command");

// Inventory
player.getInventory().addItem(item);
player.openInventory(inventory);

// Messages (Modern Paper)
player.sendMessage(Component.text("Hello", NamedTextColor.GOLD));
player.sendActionBar(Component.text("Action"));
player.showTitle(Title.title(main, sub));
```

### Event Handling
```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onEvent(Event event) {
    // Handle event
    event.setCancelled(true);
}
```

### Scheduler
```java
// Sync
Bukkit.getScheduler().runTask(plugin, () -> { });
Bukkit.getScheduler().runTaskLater(plugin, () -> { }, 20L);
BukkitTask task = Bukkit.getScheduler().runTaskTimer(plugin, () -> { }, 0L, 20L);

// Async
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> { });

// Cancel
task.cancel();
```

### Configuration
```java
// Main config
saveDefaultConfig();
FileConfiguration config = getConfig();
String value = config.getString("key", "default");
config.set("key", "value");
saveConfig();
```

### Items
```java
// Create item
ItemStack item = new ItemStack(Material.DIAMOND_SWORD);
ItemMeta meta = item.getItemMeta();
meta.displayName(Component.text("Legendary Sword"));
meta.lore(Arrays.asList(Component.text("Line 1")));
item.setItemMeta(meta);
```

### PDC
```java
// Store data
NamespacedKey key = new NamespacedKey(plugin, "data");
PersistentDataContainer pdc = player.getPersistentDataContainer();
pdc.set(key, PersistentDataType.INTEGER, 100);

// Retrieve data
if (pdc.has(key, PersistentDataType.INTEGER)) {
    int value = pdc.get(key, PersistentDataType.INTEGER);
}
```

---

## Appendix B: Version Compatibility Table

**Detailed version compatibility for planning:**

| Feature | 1.16.5 | 1.17.1 | 1.18.2 | 1.19.4 | 1.20.4 | 1.21.4 |
|---------|--------|--------|--------|--------|--------|--------|
| **Java Version** | 16+ | 16+ | 17+ | 17+ | 17+ | 21+ |
| Adventure API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MiniMessage (native) | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ |
| AsyncChatEvent | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| AsyncScheduler | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| PDC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| BlockData | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Flattened Materials | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Appendix C: AI API Mistake Catalog

**50 common AI-generated mistakes with fixes:**

### Category 1: Events (10 mistakes)

**1. Using deprecated PlayerChatEvent**
```java
// ❌ AI GENERATES:
@EventHandler
public void onChat(PlayerChatEvent event) { }

// ✅ FIX:
@EventHandler
public void onChat(AsyncPlayerChatEvent event) { }

// Prevention: Tell AI "Use AsyncPlayerChatEvent, not PlayerChatEvent"
```

**2. Not checking null in PlayerInteractEvent**
```java
// ❌ AI GENERATES:
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    Block block = event.getClickedBlock();
    if (block.getType() == Material.CHEST) { } // NPE!
}

// ✅ FIX:
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    Block block = event.getClickedBlock();
    if (block != null && block.getType() == Material.CHEST) { }
}
```

**3. Modifying events in MONITOR priority**
```java
// ❌ AI GENERATES:
@EventHandler(priority = EventPriority.MONITOR)
public void onBreak(BlockBreakEvent event) {
    event.setCancelled(true); // Too late!
}

// ✅ FIX:
@EventHandler(priority = EventPriority.HIGH)
public void onBreak(BlockBreakEvent event) {
    event.setCancelled(true);
}
```

**4. Not handling both hands in PlayerInteractEvent**
```java
// ❌ AI GENERATES:
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    giveReward(event.getPlayer()); // Fires twice!
}

// ✅ FIX:
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    if (event.getHand() != EquipmentSlot.HAND) return;
    giveReward(event.getPlayer());
}
```

**5. Synchronous database in PlayerJoinEvent**
```java
// ❌ AI GENERATES:
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    PlayerData data = database.load(uuid); // BLOCKS!
}

// ✅ FIX:
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    CompletableFuture.runAsync(() -> {
        PlayerData data = database.load(uuid);
        Bukkit.getScheduler().runTask(plugin, () -> apply(data));
    });
}
```

**6. Not ignoring cancelled events**
```java
// ❌ AI GENERATES:
@EventHandler
public void onBreak(BlockBreakEvent event) {
    // Runs even if another plugin cancelled!
}

// ✅ FIX:
@EventHandler(ignoreCancelled = true)
public void onBreak(BlockBreakEvent event) { }
```

**7. Checking block movement in PlayerMoveEvent**
```java
// ❌ AI GENERATES:
@EventHandler
public void onMove(PlayerMoveEvent event) {
    expensiveCheck(); // Runs for head rotation too!
}

// ✅ FIX:
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Location from = event.getFrom();
    Location to = event.getTo();
    if (from.getBlockX() == to.getBlockX() &&
        from.getBlockY() == to.getBlockY() &&
        from.getBlockZ() == to.getBlockZ()) return;
    
    expensiveCheck();
}
```

**8. Bukkit API in AsyncPlayerChatEvent**
```java
// ❌ AI GENERATES:
@EventHandler
public void onChat(AsyncPlayerChatEvent event) {
    event.getPlayer().teleport(spawn); // CRASH!
}

// ✅ FIX:
@EventHandler
public void onChat(AsyncPlayerChatEvent event) {
    Bukkit.getScheduler().runTask(plugin, () -> {
        event.getPlayer().teleport(spawn);
    });
}
```

**9. Not checking player validity after async**
```java
// ❌ AI GENERATES:
CompletableFuture.runAsync(() -> {
    Thread.sleep(5000);
    Bukkit.getScheduler().runTask(plugin, () -> {
        player.sendMessage("Hi"); // Player might be offline!
    });
});

// ✅ FIX:
CompletableFuture.runAsync(() -> {
    Thread.sleep(5000);
    Bukkit.getScheduler().runTask(plugin, () -> {
        if (player.isOnline()) {
            player.sendMessage(Component.text("Hi"));
        }
    });
});
```

**10. Recursive teleport in PlayerTeleportEvent**
```java
// ❌ AI GENERATES:
@EventHandler
public void onTeleport(PlayerTeleportEvent event) {
    if (bannedZone.contains(event.getTo())) {
        event.getPlayer().teleport(spawn); // Infinite loop!
    }
}

// ✅ FIX:
@EventHandler
public void onTeleport(PlayerTeleportEvent event) {
    if (bannedZone.contains(event.getTo())) {
        event.setTo(spawn); // Modify event, don't trigger new
    }
}
```

### Category 2: Player API (10 mistakes)

**11. Using name as database key**
```java
// ❌ AI GENERATES:
database.save(player.getName(), data);

// ✅ FIX:
database.save(player.getUniqueId(), data);
```

**12. Not checking player online**
```java
// ❌ AI GENERATES:
Player player = Bukkit.getPlayer(uuid);
player.sendMessage("Hi"); // NPE if offline!

// ✅ FIX:
Player player = Bukkit.getPlayer(uuid);
if (player != null && player.isOnline()) {
    player.sendMessage(Component.text("Hi"));
}
```

**13. Bukkit.getOfflinePlayer(name) - blocking**
```java
// ❌ AI GENERATES:
OfflinePlayer op = Bukkit.getOfflinePlayer("Notch"); // BLOCKS!

// ✅ FIX:
UUID uuid = // from database
OfflinePlayer op = Bukkit.getOfflinePlayer(uuid);
```

**14. Modifying location without cloning**
```java
// ❌ AI GENERATES:
Location loc = player.getLocation();
loc.setY(loc.getY() + 10);
player.teleport(loc); // Glitchy!

// ✅ FIX:
Location loc = player.getLocation().clone();
loc.setY(loc.getY() + 10);
player.teleport(loc);
```

**15. Not checking world exists**
```java
// ❌ AI GENERATES:
World world = Bukkit.getWorld("spawn");
player.teleport(new Location(world, 0, 64, 0)); // NPE!

// ✅ FIX:
World world = Bukkit.getWorld("spawn");
if (world != null) {
    player.teleport(new Location(world, 0, 64, 0));
}
```

**16. Synchronous chunk loading**
```java
// ❌ AI GENERATES:
Chunk chunk = loc.getChunk(); // BLOCKS if not loaded!

// ✅ FIX:
if (loc.isChunkLoaded()) {
    Chunk chunk = loc.getChunk();
} else {
    world.getChunkAtAsync(loc).thenAccept(chunk -> {
        // Process chunk
    });
}
```

**17. Not handling inventory full**
```java
// ❌ AI GENERATES:
player.getInventory().addItem(item); // Items lost if full!

// ✅ FIX:
HashMap<Integer, ItemStack> leftover = player.getInventory().addItem(item);
if (!leftover.isEmpty()) {
    for (ItemStack drop : leftover.values()) {
        player.getWorld().dropItemNaturally(player.getLocation(), drop);
    }
}
```

**18. Legacy ChatColor concatenation**
```java
// ❌ AI GENERATES:
player.sendMessage(ChatColor.GOLD + "Hello");

// ✅ FIX (Paper):
player.sendMessage(Component.text("Hello", NamedTextColor.GOLD));
```

**19. Accessing player from async**
```java
// ❌ AI GENERATES:
CompletableFuture.runAsync(() -> {
    player.getInventory().addItem(item); // CRASH!
});

// ✅ FIX:
CompletableFuture.runAsync(() -> {
    // Async work
    Bukkit.getScheduler().runTask(plugin, () -> {
        player.getInventory().addItem(item);
    });
});
```

**20. Not checking player permissions**
```java
// ❌ AI GENERATES:
player.teleport(adminLocation); // Anyone can!

// ✅ FIX:
if (player.hasPermission("plugin.admin")) {
    player.teleport(adminLocation);
} else {
    player.sendMessage(Component.text("No permission!"));
}
```

### Category 3: Commands (5 mistakes)

**21. Not validating argument count**
```java
// ❌ AI GENERATES:
String name = args[0]; // CRASH if no args!

// ✅ FIX:
if (args.length < 1) {
    return false;
}
String name = args[0];
```

**22. Not parsing integers safely**
```java
// ❌ AI GENERATES:
int amount = Integer.parseInt(args[0]); // CRASH!

// ✅ FIX:
try {
    int amount = Integer.parseInt(args[0]);
} catch (NumberFormatException e) {
    sender.sendMessage(Component.text("Invalid number!"));
    return true;
}
```

**23. Returning null from tab complete**
```java
// ❌ AI GENERATES:
return null; // Shows all player names

// ✅ FIX:
return Collections.emptyList();
```

**24. Giant onCommand method**
```java
// ❌ AI GENERATES:
public boolean onCommand(...) {
    // 500 lines of if-else
}

// ✅ FIX:
public boolean onCommand(...) {
    switch (args[0].toLowerCase()) {
        case "give": return handleGive(sender, args);
        case "take": return handleTake(sender, args);
    }
}
```

**25. Not checking sender type**
```java
// ❌ AI GENERATES:
Player player = (Player) sender; // CRASH if console!

// ✅ FIX:
if (!(sender instanceof Player)) {
    sender.sendMessage(Component.text("Only players!"));
    return true;
}
Player player = (Player) sender;
```

### Category 4: Inventory/GUI (5 mistakes)

**26. Not cancelling shift-click in GUIs**
```java
// ❌ AI GENERATES:
if (event.getClickedInventory().equals(topInv)) {
    event.setCancelled(true);
}
// Shift-click from bottom bypasses!

// ✅ FIX:
if (event.getClick().isShiftClick()) {
    event.setCancelled(true);
}
if (event.getClickedInventory() != null && 
    event.getClickedInventory().equals(topInv)) {
    event.setCancelled(true);
}
```

**27. Using rawSlot instead of clickedInventory**
```java
// ❌ AI GENERATES:
if (event.getRawSlot() < 27) { } // Breaks with different sizes!

// ✅ FIX:
if (event.getClickedInventory() != null &&
    event.getClickedInventory().equals(event.getView().getTopInventory())) {
}
```

**28. Not checking item null in click**
```java
// ❌ AI GENERATES:
if (event.getCurrentItem().getType() == Material.DIAMOND) { }
// NPE if empty slot!

// ✅ FIX:
ItemStack item = event.getCurrentItem();
if (item != null && item.getType() == Material.DIAMOND) { }
```

**29. Not cleaning up GUI on close**
```java
// ❌ AI GENERATES:
openGUIs.put(uuid, gui); // Never removed, memory leak!

// ✅ FIX:
@EventHandler
public void onClose(InventoryCloseEvent event) {
    if (event.getPlayer() instanceof Player player) {
        openGUIs.remove(player.getUniqueId());
    }
}
```

**30. Forgetting to set ItemMeta**
```java
// ❌ AI GENERATES:
ItemStack item = new ItemStack(Material.DIAMOND);
ItemMeta meta = item.getItemMeta();
meta.displayName(Component.text("Custom"));
// Forgot item.setItemMeta(meta)!

// ✅ FIX:
item.setItemMeta(meta);
```

### Category 5: Scheduler (5 mistakes)

**31. Not cancelling tasks in onDisable**
```java
// ❌ AI GENERATES:
BukkitTask task = Bukkit.getScheduler().runTaskTimer(...);
// Never cancelled, runs after disable!

// ✅ FIX:
private final Set<BukkitTask> tasks = new HashSet<>();

@Override
public void onDisable() {
    tasks.forEach(BukkitTask::cancel);
}
```

**32. Blocking operations in sync task**
```java
// ❌ AI GENERATES:
Bukkit.getScheduler().runTask(plugin, () -> {
    database.save(data); // BLOCKS server!
});

// ✅ FIX:
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    database.save(data);
});
```

**33. Bukkit API in async task**
```java
// ❌ AI GENERATES:
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    player.teleport(loc); // CRASH!
});

// ✅ FIX:
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    // Async work
    Bukkit.getScheduler().runTask(plugin, () -> {
        player.teleport(loc);
    });
});
```

**34. Incorrect time units (seconds vs ticks)**
```java
// ❌ AI GENERATES:
Bukkit.getScheduler().runTaskLater(plugin, task, 5); // 0.25 seconds!

// ✅ FIX:
Bukkit.getScheduler().runTaskLater(plugin, task, 100L); // 5 seconds = 100 ticks
```

**35. Not storing task for cancellation**
```java
// ❌ AI GENERATES:
Bukkit.getScheduler().runTaskTimer(plugin, task, 0, 20);
// Can't cancel later!

// ✅ FIX:
BukkitTask task = Bukkit.getScheduler().runTaskTimer(plugin, runnable, 0, 20);
activeTasks.put(uuid, task);
```

### Category 6: Configuration (5 mistakes)

**36. Not providing defaults**
```java
// ❌ AI GENERATES:
String msg = config.getString("message"); // null!

// ✅ FIX:
String msg = config.getString("message", "Default");
```

**37. Not validating config values**
```java
// ❌ AI GENERATES:
int cooldown = config.getInt("cooldown"); // Could be -999!

// ✅ FIX:
int cooldown = config.getInt("cooldown", 30);
if (cooldown < 0) cooldown = 30;
```

**38. Not saving custom config**
```java
// ❌ AI GENERATES:
customConfig.set("key", "value"); // Lost on restart!

// ✅ FIX:
customConfig.set("key", "value");
customConfig.save();
```

**39. Hardcoded values in code instead of config**
```java
// ❌ AI GENERATES:
int cooldown = 30; // Hardcoded!

// ✅ FIX:
int cooldown = config.getInt("cooldown", 30);
```

**40. Not reloading after config changes**
```java
// ❌ AI GENERATES:
// Config changed but values cached

// ✅ FIX:
public void reloadConfiguration() {
    reloadConfig();
    loadConfigValues(); // Re-read all values
}
```

### Category 7: PDC (5 mistakes)

**41. Not checking if key exists**
```java
// ❌ AI GENERATES:
int value = pdc.get(key, PersistentDataType.INTEGER); // NPE!

// ✅ FIX:
if (pdc.has(key, PersistentDataType.INTEGER)) {
    int value = pdc.get(key, PersistentDataType.INTEGER);
}
```

**42. Storing UUID as string**
```java
// ❌ AI GENERATES:
pdc.set(key, PersistentDataType.STRING, uuid.toString());
// 36 bytes!

// ✅ FIX:
pdc.set(key, UUID_DATA_TYPE, uuid); // 16 bytes
```

**43. Forgetting to update ItemMeta**
```java
// ❌ AI GENERATES:
meta.getPersistentDataContainer().set(key, type, value);
// Forgot item.setItemMeta(meta)!

// ✅ FIX:
item.setItemMeta(meta);
```

**44. Generic key names (collisions)**
```java
// ❌ AI GENERATES:
new NamespacedKey(plugin, "level"); // Collision!

// ✅ FIX:
new NamespacedKey(plugin, "myplugin_player_level");
```

**45. Wrong data type**
```java
// ❌ AI GENERATES:
pdc.set(key, PersistentDataType.STRING, 123); // Type mismatch!

// ✅ FIX:
pdc.set(key, PersistentDataType.INTEGER, 123);
```

### Category 8: General (5 mistakes)

**46. Not handling exceptions**
```java
// ❌ AI GENERATES:
File file = new File("data.yml");
// Throws IOException!

// ✅ FIX:
try {
    // File operations
} catch (IOException e) {
    getLogger().severe("Could not load file");
    e.printStackTrace();
}
```

**47. Memory leaks (not cleaning up)**
```java
// ❌ AI GENERATES:
cache.put(uuid, data);
// Never removed!

// ✅ FIX:
@EventHandler
public void onQuit(PlayerQuitEvent event) {
    cache.remove(event.getPlayer().getUniqueId());
}
```

**48. Using == for string comparison**
```java
// ❌ AI GENERATES:
if (args[0] == "help") { } // Won't work!

// ✅ FIX:
if (args[0].equalsIgnoreCase("help")) { }
```

**49. Not using UUID.toString() for database**
```java
// ❌ AI GENERATES:
database.save(uuid, data); // UUID object!

// ✅ FIX:
database.save(uuid.toString(), data);
```

**50. printStackTrace() instead of logger**
```java
// ❌ AI GENERATES:
} catch (Exception e) {
    e.printStackTrace();
}

// ✅ FIX:
} catch (Exception e) {
    getLogger().log(Level.SEVERE, "Error message", e);
}
```

---

**END OF GUIDE**

This guide covers the most critical API patterns, common mistakes, and best practices for Minecraft plugin development on Paper 1.21.4. Bookmark this document and use Ctrl+F to quickly find solutions to API questions.

**For AI assistants:** Always reference this guide when generating Minecraft plugin code to avoid the 50+ documented mistakes.
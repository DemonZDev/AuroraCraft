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
- [Appendix A: Quick API Reference Card](#appendix-a-quick-api-reference-card)
- [Appendix B: Version Compatibility Table](#appendix-b-version-compatibility-table)
- [Appendix C: AI API Mistake Catalog](#appendix-c-ai-api-mistake-catalog)

---

---

# 1. API Hierarchy & Compatibility

## 1.1 Bukkit → Spigot → Paper → Forks

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
Code written against `org.spigotmc` runs on Spigot, Paper, and Paper-based forks.

### Package Ownership by Layer

| Package | Layer | Notes |
|---|---|---|
| `org.bukkit` | Bukkit | Core API — always available |
| `org.bukkit.craftbukkit` | CraftBukkit | **NMS internals — never use directly** |
| `org.spigotmc` | Spigot | SpigotConfig, Spigot-specific entity methods |
| `com.destroystokyo.paper` | Paper (legacy) | Pre-1.17 Paper additions, some deprecated |
| `io.papermc.paper` | Paper (modern) | 1.17+ Paper additions, preferred namespace |
| `net.kyori.adventure` | Paper (bundled) | Adventure API — bundled since Paper 1.16.5 |

---

## 1.2 Runtime API Detection

When writing cross-platform plugins, detect the server implementation at runtime before calling platform-specific APIs.

```java
/**
 * Detects the current server implementation at runtime.
 * Call once in onEnable() and cache the result.
 */
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
            Class.forName("io.papermc.paper.PaperConfig");
            return detected = PAPER;
        } catch (ClassNotFoundException ignored) {}

        try {
            // Also catches Paper since Paper extends Spigot
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
        // Paper: use Adventure Component (modern, no legacy codes)
        MiniMessage mm = MiniMessage.miniMessage();
        player.sendMessage(mm.deserialize(miniMessageText));
    } else {
        // Spigot/Bukkit fallback: strip tags, use legacy codes
        String stripped = miniMessageText.replaceAll("<[^>]+>", "");
        player.sendMessage(ChatColor.translateAlternateColorCodes('&', stripped));
    }
}
```

---

## 1.3 api-version in plugin.yml

The `api-version` field in `plugin.yml` is **not** a minimum version requirement — it is a **declaration of compatibility** that affects how the server loads your plugin.

```yaml
name: MyPlugin
main: com.example.MyPlugin
version: 1.0.0
api-version: "1.21"   # <-- This field
```

### What api-version Actually Does

| Scenario | Result |
|---|---|
| `api-version` omitted | Server loads plugin but logs a **legacy warning**. Plugin runs in compatibility mode. |
| `api-version: "1.13"` | Server accepts plugin on 1.13+. Enables modern Material enum. |
| `api-version: "1.21"` | Server rejects plugin on servers older than 1.21 with `"Unsupported api-version"` error. |
| `api-version: "1.21"` on 1.21.4 server | Accepted — minor versions are not checked. |
| `api-version: "1.22"` on 1.21.4 server | **Rejected** — server version is lower than declared api-version. |

### Critical Behaviors Controlled by api-version

- **`api-version: "1.13"` or higher:** Enables the flattened Material enum (no more `LEGACY_*` prefixes for most materials). Without this, the server wraps your Material lookups in legacy compatibility code.
- **`api-version: "1.20.5"` or higher:** Enables the new component-based item display name API on Paper.
- **Omitting api-version entirely:** The server logs `"Loaded class X from Y which is not a depend, softdepend or loadbefore of this plugin"` style warnings and may apply legacy shims.

### Recommendation

Always set `api-version` to the **minimum server version you actually test against**. For new plugins targeting Paper 1.21.4:

```yaml
api-version: "1.21"
```

This accepts 1.21, 1.21.1, 1.21.2, 1.21.3, and 1.21.4 without modification.

---

## 1.4 Version Compatibility Matrix

| Feature | Bukkit 1.8 | Spigot 1.12 | Paper 1.16 | Paper 1.17 | Paper 1.20 | Paper 1.21.4 |
|---|---|---|---|---|---|---|
| Adventure API (bundled) | ❌ | ❌ | ✅ (Paper only) | ✅ | ✅ | ✅ |
| MiniMessage (bundled) | ❌ | ❌ | ✅ (Paper only) | ✅ | ✅ | ✅ |
| PersistentDataContainer | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Flattened Material enum | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `player.sendMessage(Component)` | ❌ | ❌ | ✅ (Paper) | ✅ | ✅ | ✅ |
| Paper AsyncScheduler | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Paper Brigadier commands | ❌ | ❌ | ❌ | ✅ (partial) | ✅ | ✅ |
| `ItemMeta#displayName(Component)` | ❌ | ❌ | ✅ (Paper) | ✅ | ✅ | ✅ |
| `Registry` API | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Folia regionized scheduler | ❌ | ❌ | ❌ | ❌ | ❌ | Fork only |

---

---

# 2. Event API

## 2.1 Event Priority System

Every `@EventHandler` annotation accepts a `priority` parameter. Handlers at the same priority run in plugin registration order (non-deterministic between plugins).

| Priority | Constant | Execution Order | Intended Use |
|---|---|---|---|
| `LOWEST` | `EventPriority.LOWEST` | 1st | Read original, unmodified event state |
| `LOW` | `EventPriority.LOW` | 2nd | Early pre-validation, soft modifications |
| `NORMAL` | `EventPriority.NORMAL` | 3rd | **Default.** General event handling |
| `HIGH` | `EventPriority.HIGH` | 4th | Late modifications, overriding others |
| `HIGHEST` | `EventPriority.HIGHEST` | 5th | Final decisions, last-chance modifications |
| `MONITOR` | `EventPriority.MONITOR` | 6th (last) | **READ-ONLY.** Logging, statistics, auditing |

**Critical rule for MONITOR:** Never modify event state or cancel events at `MONITOR` priority. Its sole purpose is to observe the final outcome after all other plugins have processed the event.

```java
// CORRECT: MONITOR for logging only
@EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
public void onBlockBreakLog(BlockBreakEvent event) {
    // Only reading — never cancelling or modifying
    logger.info(event.getPlayer().getName() + " broke " + event.getBlock().getType());
}

// WRONG: Modifying at MONITOR
@EventHandler(priority = EventPriority.MONITOR)
public void onBlockBreakWrong(BlockBreakEvent event) {
    event.setCancelled(true); // NEVER do this at MONITOR
}
```

---

## 2.2 ignoreCancelled Parameter

The `ignoreCancelled` parameter on `@EventHandler` controls whether your handler is called when the event has already been cancelled by a lower-priority handler.

```java
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onBlockBreak(BlockBreakEvent event) {
    // This handler is SKIPPED if another plugin already cancelled the event
}

@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = false) // default
public void onBlockBreakAlways(BlockBreakEvent event) {
    // This handler is called EVEN IF the event was already cancelled
    // You must manually check event.isCancelled() if you care
}
```

**When to use `ignoreCancelled = true`:**
- Your handler should respect other plugins' cancellations (most cases)
- You're adding effects/rewards that shouldn't trigger on blocked actions
- Performance-sensitive handlers that should skip unnecessary work

**When to use `ignoreCancelled = false` (default):**
- You're implementing an anti-cheat that needs to see ALL attempts
- You're logging every attempt regardless of outcome
- You need to un-cancel an event that was incorrectly cancelled

---

## 2.3 Event Handler Patterns

### PlayerJoinEvent

```java
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();

    // SAFE: Player object is fully valid here
    // SAFE: Inventory access, teleportation, sending messages

    // Set join message (Adventure Component)
    event.joinMessage(Component.text(player.getName() + " joined!", NamedTextColor.GREEN));

    // Set join message to null to suppress it
    // event.joinMessage(null);

    // IMPORTANT: Player data loading should happen in AsyncPlayerPreLoginEvent
    // or via async task — do NOT do heavy I/O here (this is the main thread)

    // WRONG: Blocking database call on join
    // PlayerData data = database.loadSync(player.getUniqueId()); // BLOCKS MAIN THREAD

    // CORRECT: Data should already be loaded by the time this fires
    PlayerData data = dataCache.get(player.getUniqueId());
    if (data == null) {
        // Fallback: schedule async load (player may not have data yet)
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            PlayerData loaded = database.load(player.getUniqueId());
            Bukkit.getScheduler().runTask(plugin, () -> {
                if (player.isOnline()) {
                    dataCache.put(player.getUniqueId(), loaded);
                }
            });
        });
    }

    // Teleportation IS safe here (player is fully spawned)
    // player.teleport(spawnLocation); // Fine
}
```

**Key facts:**
- Fires on the **main thread**
- Player is **fully spawned** and their inventory is accessible
- `event.joinMessage()` accepts `Component` on Paper (returns `Component`, not `String`)
- On Bukkit/Spigot: `event.setJoinMessage(String)` — legacy API

---

### PlayerQuitEvent

```java
@EventHandler
public void onPlayerQuit(PlayerQuitEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId(); // Capture UUID BEFORE async work

    // Set quit message
    event.quitMessage(Component.text(player.getName() + " left.", NamedTextColor.GRAY));

    // SAFE: Save data asynchronously
    PlayerData data = dataCache.remove(uuid);
    if (data != null) {
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            database.save(uuid, data);
        });
    }

    // UNSAFE after this event: player.getInventory(), player.getLocation()
    // The player object becomes invalid shortly after quit processing
    // Always capture what you need BEFORE scheduling async work

    // WRONG: Using player reference inside async callback
    // Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    //     player.getInventory(); // Player may be gone — NPE or stale state
    // });

    // CORRECT: Capture data synchronously, use it asynchronously
    Location lastLocation = player.getLocation().clone(); // Clone before async!
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        database.saveLocation(uuid, lastLocation); // Use captured data
    });
}
```

**Key facts:**
- Fires on the **main thread**
- Player object is still **technically valid** during this event
- After this event returns, the player object should be considered **invalid**
- Always capture UUID, Location (cloned), and any needed data **synchronously** before scheduling async work

---

### AsyncPlayerPreLoginEvent

```java
@EventHandler
public void onPreLogin(AsyncPlayerPreLoginEvent event) {
    UUID uuid = event.getUniqueId();
    String name = event.getName();

    // This fires on an ASYNC thread — perfect for database I/O
    // The player has NOT joined yet — no Player object exists

    try {
        PlayerData data = database.loadBlocking(uuid); // Blocking I/O is fine here
        dataCache.put(uuid, data);
    } catch (Exception e) {
        // Deny login if data load fails
        event.disallow(
            AsyncPlayerPreLoginEvent.Result.KICK_OTHER,
            Component.text("Failed to load your data. Please reconnect.", NamedTextColor.RED)
        );
        return;
    }

    // Allow login (default state — only needed if you previously denied)
    // event.allow();
}
```

**Key facts:**
- Fires on an **async thread** — blocking I/O is acceptable and intended
- No `Player` object exists yet — use `event.getUniqueId()` and `event.getName()`
- Use `event.disallow(Result, Component)` to kick before the player fully joins
- **Do NOT** call any Bukkit API that requires the main thread here
- Fires **before** `PlayerJoinEvent` — ideal for pre-loading player data

**AsyncPlayerPreLoginEvent vs PlayerLoginEvent vs PlayerJoinEvent:**

| Event | Thread | Player Object | Use For |
|---|---|---|---|
| `AsyncPlayerPreLoginEvent` | Async | ❌ None | Pre-load data, IP bans, whitelist checks |
| `PlayerLoginEvent` | Main | ❌ None (use `event.getPlayer()` carefully) | Final login allow/deny |
| `PlayerJoinEvent` | Main | ✅ Full | Welcome messages, spawn teleport, UI setup |

---

### PlayerMoveEvent

```java
@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    // PERFORMANCE WARNING: This fires for EVERY movement including head rotation
    // On a 100-player server this can be 2000+ calls/second

    // OPTIMIZATION 1: Check if block position actually changed
    // Avoids processing head rotation (most common movement)
    Location from = event.getFrom();
    Location to = event.getTo();

    if (from.getBlockX() == to.getBlockX()
            && from.getBlockY() == to.getBlockY()
            && from.getBlockZ() == to.getBlockZ()) {
        return; // Only head rotation — skip expensive logic
    }

    // OPTIMIZATION 2: Use hasChangedBlock() on Paper
    // if (!event.hasChangedBlock()) return; // Paper-only, cleaner

    Player player = event.getPlayer();

    // Check region entry/exit
    if (isInDangerZone(to) && !isInDangerZone(from)) {
        player.sendMessage(Component.text("Warning: Entering danger zone!", NamedTextColor.RED));
    }

    // Cancelling movement: set the TO location to FROM
    if (isInForbiddenZone(to)) {
        event.setTo(from); // Teleport back — use setTo(), not teleport()
        // event.setCancelled(true) also works but setTo() is smoother
    }
}

// ANTI-PATTERN: Heavy logic in PlayerMoveEvent
@EventHandler
public void onPlayerMoveWrong(PlayerMoveEvent event) {
    // WRONG: Database call on every movement tick
    // database.updateLocation(event.getPlayer().getUniqueId(), event.getTo());

    // WRONG: Complex region lookup without block-change check
    // regionManager.getRegionAt(event.getTo()); // Called 20x/second per player
}
```

**Key facts:**
- Fires on the **main thread**
- Fires for **every movement packet** including head rotation — always check block position change first
- `event.setTo(location)` smoothly redirects movement; `event.setCancelled(true)` also works
- Paper adds `event.hasChangedBlock()` and `event.hasChangedPosition()` helpers

---

### AsyncPlayerChatEvent

```java
// [DEPRECATED in Paper 1.19+] — Use AsyncChatEvent instead
// Shown here because AI assistants frequently generate this pattern

// LEGACY (Bukkit/Spigot/old Paper):
@EventHandler
public void onChatLegacy(AsyncPlayerChatEvent event) {
    // Fires on ASYNC thread
    // event.setFormat() — legacy string format
    // event.setMessage() — modify message content
    // event.setCancelled(true) — block message

    String message = event.getMessage();
    if (message.contains("badword")) {
        event.setCancelled(true);
        // WRONG: Calling Bukkit API from async thread
        // event.getPlayer().sendMessage("Blocked!"); // Unsafe on async thread
        // CORRECT: Schedule sync task for Bukkit API calls
        Player player = event.getPlayer();
        Bukkit.getScheduler().runTask(plugin, () ->
            player.sendMessage(Component.text("Message blocked.", NamedTextColor.RED))
        );
    }
}

// MODERN (Paper 1.19+): Use io.papermc.paper.event.player.AsyncChatEvent
@EventHandler
public void onChat(io.papermc.paper.event.player.AsyncChatEvent event) {
    // Fires on ASYNC thread
    // event.message() returns Component (Adventure)
    // event.message(Component) sets the message
    // event.renderer() controls full message rendering

    Component original = event.message();

    // Modify message using Adventure API
    event.message(Component.text("[VIP] ").color(NamedTextColor.GOLD).append(original));

    // Cancel the event
    // event.setCancelled(true);

    // Custom renderer (controls the full chat line format)
    event.renderer((source, sourceDisplayName, message, viewer) ->
        Component.empty()
            .append(sourceDisplayName)
            .append(Component.text(": "))
            .append(message)
    );
}
```

**Key facts:**
- Both events fire on an **async thread**
- `AsyncPlayerChatEvent` is deprecated on Paper 1.19+ — use `AsyncChatEvent`
- Never call synchronous Bukkit API (teleport, inventory, etc.) from async chat events
- `AsyncChatEvent` uses Adventure `Component` for the message — not `String`

---

### PlayerInteractEvent

```java
@EventHandler
public void onPlayerInteract(PlayerInteractEvent event) {
    Action action = event.getAction();
    Player player = event.getPlayer();

    // Action types:
    // Action.LEFT_CLICK_BLOCK  — left click on a block
    // Action.RIGHT_CLICK_BLOCK — right click on a block
    // Action.LEFT_CLICK_AIR   — left click in air
    // Action.RIGHT_CLICK_AIR  — right click in air
    // Action.PHYSICAL         — stepping on pressure plate, tripwire

    // IMPORTANT: This event fires TWICE for right-click with an item
    // Once for the main hand, once for the off hand
    // Always check which hand triggered the event

    if (event.getHand() != EquipmentSlot.HAND) {
        return; // Ignore off-hand triggers to prevent double-firing
    }

    // Check for right-click on a block
    if (action == Action.RIGHT_CLICK_BLOCK) {
        Block block = event.getClickedBlock(); // Non-null for BLOCK actions
        if (block != null && block.getType() == Material.CHEST) {
            // Handle chest right-click
        }
    }

    // Check for right-click with a specific item (air or block)
    if (action == Action.RIGHT_CLICK_AIR || action == Action.RIGHT_CLICK_BLOCK) {
        ItemStack item = event.getItem(); // May be null if empty hand
        if (item != null && item.getType() == Material.STICK) {
            event.setCancelled(true); // Prevent default interaction
            player.sendMessage(Component.text("Magic stick activated!", NamedTextColor.AQUA));
        }
    }

    // WRONG: Not checking for null block on BLOCK actions
    // Block block = event.getClickedBlock();
    // block.getType(); // NPE if action is LEFT_CLICK_AIR
}
```

**Key facts:**
- Fires on the **main thread**
- Fires **twice** for right-click with an item (main hand + off hand) — always filter by `event.getHand()`
- `event.getClickedBlock()` returns `null` for AIR actions — always null-check
- `event.getItem()` returns `null` for empty hand — always null-check
- `event.setCancelled(true)` prevents block interaction but NOT item use in some cases — use `event.setUseItemInHand(Event.Result.DENY)` for full item suppression

---

### BlockBreakEvent

```java
@EventHandler
public void onBlockBreak(BlockBreakEvent event) {
    Player player = event.getPlayer();
    Block block = event.getBlock();

    // Check game mode — creative players bypass some checks
    if (player.getGameMode() == GameMode.CREATIVE) {
        // Creative mode: no drops, no XP, but event still fires
        // event.setDropItems(false) is redundant in creative but harmless
    }

    // Control drops
    event.setDropItems(false); // Suppress default drops
    block.getWorld().dropItemNaturally(block.getLocation(), new ItemStack(Material.DIAMOND));

    // Control experience drop
    event.setExpToDrop(0); // Suppress XP
    // event.setExpToDrop(100); // Custom XP amount

    // Cancel the break entirely
    // event.setCancelled(true);

    // IMPORTANT: block.getType() is still the ORIGINAL type during this event
    // The block has NOT been broken yet when this fires
    Material brokenType = block.getType(); // Original material — safe

    // After event processing, the block will be set to AIR
    // Do NOT schedule a task expecting the block to still be there
}
```

**Key facts:**
- Fires on the **main thread**
- Block has **not been broken yet** when the event fires — `block.getType()` returns the original material
- `event.setDropItems(false)` suppresses vanilla drops
- `event.setExpToDrop(int)` controls XP orb spawn
- Creative mode players still trigger this event — check `GameMode` if needed

---

### BlockPlaceEvent

```java
@EventHandler
public void onBlockPlace(BlockPlaceEvent event) {
    Player player = event.getPlayer();
    Block placedBlock = event.getBlockPlaced();
    Block blockAgainst = event.getBlockAgainst(); // Block clicked to place against
    ItemStack itemInHand = event.getItemInHand(); // Item used to place

    // IMPORTANT: Multi-block placements (beds, doors, tall grass)
    // fire BlockMultiPlaceEvent, which extends BlockPlaceEvent
    // If you cancel BlockPlaceEvent, BlockMultiPlaceEvent is also cancelled
    // But if you only listen to BlockMultiPlaceEvent, single-block placements are missed

    // Check if it's a multi-block placement
    if (event instanceof BlockMultiPlaceEvent multiEvent) {
        List<BlockState> replacedStates = multiEvent.getReplacedBlockStates();
        // replacedStates contains all blocks that were replaced (e.g., both halves of a door)
    }

    // The placed block's type is already set when this event fires
    Material placedType = placedBlock.getType(); // Returns the NEW block type

    // Cancel placement
    // event.setCancelled(true);

    // WRONG: Assuming item consumption matches placement
    // Some blocks place multiple blocks from one item (beds, doors)
    // event.getItemInHand().getAmount() does NOT tell you how many blocks were placed
}
```

**Key facts:**
- Fires on the **main thread**
- `event.getBlockPlaced().getType()` returns the **new** block type (already set)
- Multi-block placements (beds, doors) fire `BlockMultiPlaceEvent` (extends `BlockPlaceEvent`)
- `event.getItemInHand()` is a copy — modifying it does not affect the player's inventory

---

### EntityDamageEvent

```java
@EventHandler
public void onEntityDamage(EntityDamageEvent event) {
    // EntityDamageEvent covers ALL damage to ALL entities
    // For player-vs-entity, use EntityDamageByEntityEvent (extends this)

    Entity entity = event.getEntity();
    EntityDamageEvent.DamageCause cause = event.getCause();
    double damage = event.getDamage(); // Final damage after armor/enchants

    // Damage cause hierarchy:
    // ENTITY_ATTACK — melee attack
    // ENTITY_SWEEP_ATTACK — sword sweep
    // PROJECTILE — arrow, trident, etc.
    // MAGIC — potions, guardian beam
    // FALL — fall damage
    // FIRE, FIRE_TICK — fire damage
    // LAVA — lava damage
    // DROWNING — drowning
    // SUFFOCATION — inside blocks
    // VOID — falling into void
    // POISON, WITHER — status effects
    // LIGHTNING — lightning strike
    // BLOCK_EXPLOSION, ENTITY_EXPLOSION — explosions

    // Modify damage
    event.setDamage(damage * 0.5); // Halve all damage

    // Cancel damage entirely
    // event.setCancelled(true);

    // For player-vs-entity damage:
    if (event instanceof EntityDamageByEntityEvent byEntityEvent) {
        Entity damager = byEntityEvent.getDamager();

        // Damager may be a Projectile (arrow) — check type
        if (damager instanceof Projectile projectile) {
            ProjectileSource shooter = projectile.getShooter();
            if (shooter instanceof Player attackingPlayer) {
                // Handle player arrow hit
            }
        } else if (damager instanceof Player attackingPlayer) {
            // Handle melee attack
        }
    }
}

// WRONG: Casting directly without instanceof check
@EventHandler
public void onDamageWrong(EntityDamageByEntityEvent event) {
    Player attacker = (Player) event.getDamager(); // ClassCastException if damager is a mob
}

// CORRECT:
@EventHandler
public void onDamageCorrect(EntityDamageByEntityEvent event) {
    if (!(event.getDamager() instanceof Player attacker)) return;
    if (!(event.getEntity() instanceof Player victim)) return;
    // Now safely handle PvP
}
```

**Key facts:**
- `EntityDamageEvent` fires for ALL entities, ALL damage types
- `EntityDamageByEntityEvent` extends it — use `instanceof` check, not a separate listener
- `event.getDamage()` returns **final** damage (post-armor); use `event.getDamage(DamageModifier.BASE)` for raw damage
- Cancelling `EntityDamageEvent` sets the entity's `lastDamageCause` to null

---

### InventoryClickEvent

```java
@EventHandler
public void onInventoryClick(InventoryClickEvent event) {
    // CRITICAL: Always check which inventory was clicked
    // getInventory() returns the TOP inventory (the custom GUI)
    // getClickedInventory() returns the ACTUAL inventory that was clicked
    // These are DIFFERENT when the player shift-clicks from their own inventory

    if (!(event.getWhoClicked() instanceof Player player)) return;

    Inventory clickedInventory = event.getClickedInventory();

    // Null check — can be null if clicking outside the window
    if (clickedInventory == null) return;

    // Check if the click was in YOUR custom inventory (top inventory)
    if (clickedInventory.equals(event.getView().getTopInventory())) {
        event.setCancelled(true); // Prevent item movement in your GUI

        int slot = event.getSlot(); // Slot within the clicked inventory
        int rawSlot = event.getRawSlot(); // Slot in the entire view (top + bottom combined)

        // Handle button click at slot
        handleGuiClick(player, slot, event.getClick());
    }

    // WRONG: Only checking getInventory() — misses shift-click from player inventory
    // if (event.getInventory().getHolder() instanceof MyGUI) {
    //     event.setCancelled(true); // Doesn't cancel shift-click from bottom inventory!
    // }

    // CORRECT shift-click protection:
    if (event.getView().getTopInventory().getHolder() instanceof MyGUIHolder) {
        event.setCancelled(true); // Cancels ALL clicks including shift-click from bottom
    }
}
```

**Key facts:**
- `event.getInventory()` — the **top** inventory (your GUI)
- `event.getClickedInventory()` — the inventory **actually clicked** (may be player's inventory)
- `event.getSlot()` — slot within the clicked inventory
- `event.getRawSlot()` — slot in the combined view (top inventory slots first, then player inventory)
- Always cancel the event in custom GUIs to prevent item theft
- Shift-click from the **bottom** inventory still moves items into the top — cancel at the view level

---

### PlayerTeleportEvent

```java
@EventHandler
public void onPlayerTeleport(PlayerTeleportEvent event) {
    Player player = event.getPlayer();
    Location from = event.getFrom();
    Location to = event.getTo();
    PlayerTeleportEvent.TeleportCause cause = event.getCause();

    // Teleport causes:
    // COMMAND — /tp command
    // PLUGIN — plugin-initiated teleport
    // NETHER_PORTAL — portal teleport
    // END_PORTAL — end portal
    // ENDER_PEARL — ender pearl throw
    // CHORUS_FRUIT — chorus fruit consumption
    // SPECTATE — spectator teleport
    // UNKNOWN — unspecified

    // Prevent ender pearl teleportation
    if (cause == PlayerTeleportEvent.TeleportCause.ENDER_PEARL) {
        event.setCancelled(true);
        player.sendMessage(Component.text("Ender pearls are disabled!", NamedTextColor.RED));
        return;
    }

    // RECURSIVE PREVENTION: If your plugin calls player.teleport() inside this handler,
    // it will fire ANOTHER PlayerTeleportEvent with cause PLUGIN
    // Use a flag to prevent infinite recursion

    if (cause == PlayerTeleportEvent.TeleportCause.PLUGIN && handlingTeleport.contains(player.getUniqueId())) {
        return; // This is our own teleport — skip
    }

    // Redirect teleport to a safe location
    if (!isSafeLocation(to)) {
        handlingTeleport.add(player.getUniqueId());
        event.setTo(findSafeLocation(to)); // Modify destination
        handlingTeleport.remove(player.getUniqueId());
    }
}

private final Set<UUID> handlingTeleport = new HashSet<>();
```

**Key facts:**
- Fires on the **main thread**
- `event.setTo(location)` redirects the teleport destination
- Calling `player.teleport()` inside this handler causes **recursive event firing** — use a flag
- `event.getTo()` may return `null` in edge cases — null-check before use

---

### ServerLoadEvent / PluginEnableEvent

```java
// ServerLoadEvent — fires when the server finishes loading (after all plugins enabled)
@EventHandler
public void onServerLoad(ServerLoadEvent event) {
    // Safe to access other plugins here — all plugins are enabled
    // Use for: cross-plugin integration, hooking into other plugin APIs

    if (Bukkit.getPluginManager().isPluginEnabled("Vault")) {
        setupVaultEconomy();
    }

    // ServerLoadEvent.LoadType:
    // STARTUP — normal server start
    // RELOAD — /reload command (avoid relying on this)
}

// In your main plugin class:
@Override
public void onEnable() {
    // onEnable() fires when YOUR plugin is enabled
    // Other plugins may NOT be enabled yet at this point
    // Do NOT access other plugin APIs here without null-checking

    // WRONG: Assuming Vault is available in onEnable()
    // RegisteredServiceProvider<Economy> rsp = getServer().getServicesManager()
    //     .getRegistration(Economy.class); // May return null if Vault loads after you

    // CORRECT: Use depend/softdepend in plugin.yml to control load order
    // OR use ServerLoadEvent for cross-plugin hooks
    // OR check for null and retry
}
```

**plugin.yml load ordering:**

```yaml
# Hard dependency — your plugin won't load if Vault is missing
depend:
  - Vault

# Soft dependency — your plugin loads after Vault IF Vault is present
softdepend:
  - Vault

# Load before these plugins (you load first)
loadbefore:
  - SomeOtherPlugin
```

---

## 2.4 Event Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Calling `Bukkit.broadcastMessage()` in async event | Thread-unsafe | Schedule sync task |
| `player.teleport()` in `AsyncPlayerPreLoginEvent` | No Player object exists | Use `PlayerJoinEvent` |
| Heavy logic in `PlayerMoveEvent` without block-change check | 2000+ calls/sec on busy server | Check `hasChangedBlock()` first |
| Modifying event state at `MONITOR` priority | Breaks other plugins' logging | Use `HIGHEST` for modifications |
| Not checking `event.getClickedInventory()` in GUI | Shift-click bypasses GUI protection | Check view's top inventory |
| Casting `event.getDamager()` to `Player` directly | `ClassCastException` for non-player damagers | Use `instanceof` pattern matching |
| Using `PlayerChatEvent` (sync) | Deprecated, blocks main thread | Use `AsyncChatEvent` (Paper) |
| Registering events in a constructor | Plugin not fully initialized | Register in `onEnable()` |
| Not unregistering listeners on `onDisable()` | Memory leak (minor, but bad practice) | `HandlerList.unregisterAll(plugin)` |
| Calling `event.getPlayer().getInventory()` in `AsyncPlayerPreLoginEvent` | No Player object | Use `event.getUniqueId()` only |

---

---

# 3. Player API

## 3.1 Player Lifecycle & Validity

```
AsyncPlayerPreLoginEvent  ← IP/UUID check, data pre-load (ASYNC thread)
         ↓
PlayerLoginEvent          ← Final allow/deny (main thread, no Player object yet)
         ↓
PlayerJoinEvent           ← Player fully spawned (main thread, Player object valid)
         ↓
    [Player is online — Player object is valid]
    player.isOnline() == true
    Bukkit.getPlayer(uuid) != null
         ↓
PlayerQuitEvent           ← Player disconnecting (main thread, Player object still valid)
         ↓
    [Player is offline]
    player.isOnline() == false
    Bukkit.getPlayer(uuid) == null
    Bukkit.getOfflinePlayer(uuid) != null (but limited API)
```

**Checking player validity:**

```java
// Check if a Player reference is still valid
public boolean isPlayerValid(Player player) {
    return player != null && player.isOnline() && !player.isDead();
}

// Safe player lookup by UUID
public Optional<Player> getOnlinePlayer(UUID uuid) {
    return Optional.ofNullable(Bukkit.getPlayer(uuid));
}

// WRONG: Storing Player objects long-term
private Player storedPlayer; // BAD — becomes stale after logout

// CORRECT: Store UUID, look up Player when needed
private UUID storedPlayerUUID;
public Player getStoredPlayer() {
    return Bukkit.getPlayer(storedPlayerUUID); // Returns null if offline
}
```

---

## 3.2 Player Data Access Patterns

### UUID vs Name

```java
// UUID — immutable, use for ALL persistent storage
UUID uuid = player.getUniqueId(); // Never changes for a given account

// Name — display only, CAN change (Minecraft allows name changes)
String name = player.getName(); // Current name — do NOT use as database key

// Looking up players
Player byUUID = Bukkit.getPlayer(uuid);         // Online only, returns null if offline
Player byName = Bukkit.getPlayer("Notch");      // Online only, case-insensitive
OfflinePlayer offline = Bukkit.getOfflinePlayer(uuid); // Works offline, limited API

// SLOW: Name-based offline lookup — triggers disk/network I/O
// OfflinePlayer slow = Bukkit.getOfflinePlayer("Notch"); // Avoid — may block
// CORRECT: Cache UUID → name mapping yourself
```

**Storage key rules:**

```java
// WRONG: Name as database key
database.save(player.getName(), data); // Breaks if player renames

// CORRECT: UUID as database key
database.save(player.getUniqueId().toString(), data);

// CORRECT: UUID as map key
Map<UUID, PlayerData> playerDataMap = new HashMap<>();
playerDataMap.put(player.getUniqueId(), data);
```

### Health, Food, and Experience

```java
// Health (0.0 to getMaxHealth())
double health = player.getHealth();
double maxHealth = player.getAttribute(Attribute.MAX_HEALTH).getValue();
player.setHealth(Math.min(health + 4.0, maxHealth)); // Heal 2 hearts, cap at max

// Food level (0 to 20)
int food = player.getFoodLevel();
player.setFoodLevel(Math.min(food + 4, 20));

// Saturation (0.0 to foodLevel)
float saturation = player.getSaturation();
player.setSaturation(Math.min(saturation + 2.0f, 20.0f));

// Experience
int level = player.getLevel();
float expProgress = player.getExp(); // 0.0 to 1.0 within current level
int totalExp = player.getTotalExperience();

player.setLevel(level + 1);
player.setExp(0.0f); // Reset progress within level
player.giveExp(100); // Add raw XP (handles level-ups automatically)
player.giveExpLevels(5); // Add 5 levels directly
```

---

## 3.3 Location & World API

```java
// Location components
Location loc = player.getLocation();
double x = loc.getX();
double y = loc.getY();
double z = loc.getZ();
float yaw = loc.getYaw();     // Horizontal rotation (-180 to 180)
float pitch = loc.getPitch(); // Vertical rotation (-90 to 90)
World world = loc.getWorld(); // May be null if world was unloaded — always null-check

// CRITICAL: Clone before modifying
Location original = player.getLocation();
Location modified = original.clone().add(0, 1, 0); // Safe — doesn't modify original
// original.add(0, 1, 0); // WRONG — modifies the original location object

// Block location (rounds down to block coordinates)
Location blockLoc = loc.toBlockLocation(); // Paper API
int blockX = loc.getBlockX();
int blockY = loc.getBlockY();
int blockZ = loc.getBlockZ();

// World null check
World world2 = loc.getWorld();
if (world2 == null) {
    // World was unloaded — handle gracefully
    return;
}

// World lookup
World overworld = Bukkit.getWorld("world");         // Returns null if not found
World nether = Bukkit.getWorld("world_nether");
World end = Bukkit.getWorld("world_the_end");

// ALWAYS null-check world lookups
if (overworld == null) {
    getLogger().warning("World 'world' not found!");
    return;
}

// Vector vs Location
Vector direction = player.getLocation().getDirection(); // Unit vector player is facing
Vector velocity = player.getVelocity(); // Current movement vector
player.setVelocity(new Vector(0, 1.5, 0)); // Launch player upward

// Chunk loading — SLOW and SYNC
// Avoid loading chunks on the main thread
Chunk chunk = loc.getChunk(); // Loads chunk synchronously if not loaded — SLOW
boolean isLoaded = loc.getWorld().isChunkLoaded(loc.getBlockX() >> 4, loc.getBlockZ() >> 4);

// Paper async chunk loading
loc.getWorld().getChunkAtAsync(loc).thenAccept(loadedChunk -> {
    // Chunk is now loaded — but this callback is on an async thread
    // Schedule sync task if you need to modify blocks
    Bukkit.getScheduler().runTask(plugin, () -> {
        loadedChunk.getBlock(0, 64, 0).setType(Material.DIAMOND_BLOCK);
    });
});
```

---

## 3.4 Common Player API Mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `Bukkit.getOfflinePlayer(name)` | Slow — may do network lookup | Cache UUID→name, use `getOfflinePlayer(UUID)` |
| `player.getName()` as DB key | Name can change | `player.getUniqueId().toString()` |
| `player.getLocation()` without clone | Modifying returned location modifies player's location reference | `player.getLocation().clone()` |
| `loc.getWorld()` without null check | World may be unloaded | Always null-check world |
| `player.getHealth() == player.getMaxHealth()` | `getMaxHealth()` deprecated | `player.getAttribute(Attribute.MAX_HEALTH).getValue()` |
| Storing `Player` object long-term | Becomes stale after logout | Store `UUID`, look up with `Bukkit.getPlayer(uuid)` |
| `player.teleport()` from async thread | Thread-unsafe | Schedule sync task |
| `player.getInventory().setItem()` from async thread | Thread-unsafe | Schedule sync task |
| `player.kickPlayer(String)` | Legacy string API | `player.kick(Component)` on Paper |
| `player.sendTitle(String, String, ...)` | Legacy API | `player.showTitle(Title.title(...))` on Paper |

---

---

# 4. Command API

## 4.1 Command Registration

### Method 1: plugin.yml + CommandExecutor (Classic)

```yaml
# plugin.yml
commands:
  mycommand:
    description: My command description
    usage: /<command> [args]
    aliases: [mc, mycmd]
    permission: myplugin.mycommand
    permission-message: "&cYou don't have permission."
```

```java
// In onEnable():
PluginCommand cmd = getCommand("mycommand");
if (cmd != null) {
    cmd.setExecutor(new MyCommandExecutor(this));
    cmd.setTabCompleter(new MyTabCompleter(this));
    // Or combine both in one class:
    // MyCommandHandler handler = new MyCommandHandler(this);
    // cmd.setExecutor(handler);
    // cmd.setTabCompleter(handler);
}
```

```java
public class MyCommandExecutor implements CommandExecutor {
    private final MyPlugin plugin;

    public MyCommandExecutor(MyPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        // Return true = command handled (no usage message shown)
        // Return false = show usage message from plugin.yml

        if (!(sender instanceof Player player)) {
            sender.sendMessage("This command requires a player.");
            return true;
        }

        if (!sender.hasPermission("myplugin.mycommand")) {
            sender.sendMessage(Component.text("No permission.", NamedTextColor.RED));
            return true;
        }

        if (args.length == 0) {
            sender.sendMessage(Component.text("Usage: /mycommand <subcommand>", NamedTextColor.YELLOW));
            return true;
        }

        return true;
    }
}
```

### Method 2: CommandMap Registration (Runtime, No plugin.yml Entry)

```java
// Register commands dynamically without plugin.yml entries
// Useful for plugin-generated commands or large command sets

import org.bukkit.command.CommandMap;
import java.lang.reflect.Field;

public void registerDynamicCommand(String name, CommandExecutor executor) {
    try {
        Field commandMapField = Bukkit.getServer().getClass().getDeclaredField("commandMap");
        commandMapField.setAccessible(true);
        CommandMap commandMap = (CommandMap) commandMapField.get(Bukkit.getServer());

        PluginCommand command = createPluginCommand(name);
        command.setExecutor(executor);
        commandMap.register(plugin.getName().toLowerCase(), command);
    } catch (Exception e) {
        plugin.getLogger().severe("Failed to register command: " + name);
    }
}
```

### Method 3: Paper Brigadier Commands (Modern, Paper 1.20+)

```java
// Paper's modern command API using Brigadier
// Provides argument type validation, client-side tab completion, and better UX

import io.papermc.paper.command.brigadier.Commands;
import io.papermc.paper.command.brigadier.CommandSourceStack;
import io.papermc.paper.plugin.lifecycle.event.LifecycleEventManager;
import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;

@Override
public void onEnable() {
    LifecycleEventManager<Plugin> manager = this.getLifecycleManager();
    manager.registerEventHandler(LifecycleEvents.COMMANDS, event -> {
        Commands commands = event.registrar();

        commands.register(
            Commands.literal("heal")
                .requires(source -> source.getSender().hasPermission("myplugin.heal"))
                .then(Commands.argument("amount", IntegerArgumentType.integer(1, 20))
                    .executes(ctx -> {
                        CommandSourceStack source = ctx.getSource();
                        if (!(source.getSender() instanceof Player player)) {
                            source.getSender().sendMessage("Players only.");
                            return 0;
                        }
                        int amount = IntegerArgumentType.getInteger(ctx, "amount");
                        double maxHealth = player.getAttribute(Attribute.MAX_HEALTH).getValue();
                        player.setHealth(Math.min(player.getHealth() + amount, maxHealth));
                        player.sendMessage(Component.text("Healed " + amount + " HP!", NamedTextColor.GREEN));
                        return 1;
                    })
                )
                .executes(ctx -> {
                    // No amount argument — heal fully
                    if (!(ctx.getSource().getSender() instanceof Player player)) return 0;
                    double maxHealth = player.getAttribute(Attribute.MAX_HEALTH).getValue();
                    player.setHealth(maxHealth);
                    return 1;
                })
                .build(),
            "Heal yourself or others",
            List.of("h")
        );
    });
}
```

---

## 4.2 Argument Parsing

```java
@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {

    // ALWAYS check args.length before accessing args[n]
    if (args.length < 2) {
        sender.sendMessage("Usage: /cmd <player> <amount>");
        return true;
    }

    // Integer parsing with validation
    int amount;
    try {
        amount = Integer.parseInt(args[1]);
    } catch (NumberFormatException e) {
        sender.sendMessage(Component.text("'" + args[1] + "' is not a valid number.", NamedTextColor.RED));
        return true;
    }

    if (amount < 1 || amount > 1000) {
        sender.sendMessage(Component.text("Amount must be between 1 and 1000.", NamedTextColor.RED));
        return true;
    }

    // Player name resolution with null check
    Player target = Bukkit.getPlayer(args[0]); // Case-insensitive online player lookup
    if (target == null) {
        sender.sendMessage(Component.text("Player '" + args[0] + "' is not online.", NamedTextColor.RED));
        return true;
    }

    // Multi-word argument (join remaining args)
    if (args.length < 1) {
        sender.sendMessage("Usage: /announce <message>");
        return true;
    }
    String message = String.join(" ", args); // All args as one string
    // Or from index 1 onward:
    String messageFrom1 = String.join(" ", Arrays.copyOfRange(args, 1, args.length));

    return true;
}
```

---

## 4.3 Tab Completion

```java
public class MyTabCompleter implements TabCompleter {

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        // NEVER return null — return empty list instead
        // Returning null causes the server to fall back to online player names

        if (args.length == 1) {
            // First argument: subcommand names
            List<String> subcommands = Arrays.asList("give", "take", "set", "check");
            return filterByPrefix(subcommands, args[0]);
        }

        if (args.length == 2) {
            switch (args[0].toLowerCase()) {
                case "give":
                case "take":
                case "set":
                    // Second argument: online player names
                    return Bukkit.getOnlinePlayers().stream()
                        .map(Player::getName)
                        .filter(name -> name.toLowerCase().startsWith(args[1].toLowerCase()))
                        .collect(Collectors.toList());
                case "check":
                    return Collections.emptyList(); // No completion for this subcommand
            }
        }

        if (args.length == 3 && (args[0].equalsIgnoreCase("give") || args[0].equalsIgnoreCase("set"))) {
            // Third argument: amount suggestions
            return Arrays.asList("1", "10", "100", "1000");
        }

        return Collections.emptyList(); // Always return empty list, never null
    }

    private List<String> filterByPrefix(List<String> options, String prefix) {
        return options.stream()
            .filter(s -> s.toLowerCase().startsWith(prefix.toLowerCase()))
            .collect(Collectors.toList());
    }
}
```

---

## 4.4 Subcommand Patterns

### Map-Based Subcommand Router (Recommended for 5+ subcommands)

```java
public class MainCommand implements CommandExecutor, TabCompleter {
    private final Map<String, SubCommand> subCommands = new LinkedHashMap<>();

    public MainCommand(MyPlugin plugin) {
        subCommands.put("give", new GiveSubCommand(plugin));
        subCommands.put("take", new TakeSubCommand(plugin));
        subCommands.put("set", new SetSubCommand(plugin));
        subCommands.put("check", new CheckSubCommand(plugin));
        subCommands.put("help", new HelpSubCommand(subCommands));
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            sender.sendMessage(Component.text("Use /" + label + " help for commands.", NamedTextColor.YELLOW));
            return true;
        }

        SubCommand sub = subCommands.get(args[0].toLowerCase());
        if (sub == null) {
            sender.sendMessage(Component.text("Unknown subcommand. Use /" + label + " help.", NamedTextColor.RED));
            return true;
        }

        if (sub.getPermission() != null && !sender.hasPermission(sub.getPermission())) {
            sender.sendMessage(Component.text("No permission.", NamedTextColor.RED));
            return true;
        }

        // Pass args without the subcommand name
        String[] subArgs = Arrays.copyOfRange(args, 1, args.length);
        sub.execute(sender, subArgs);
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return subCommands.keySet().stream()
                .filter(s -> s.startsWith(args[0].toLowerCase()))
                .collect(Collectors.toList());
        }

        SubCommand sub = subCommands.get(args[0].toLowerCase());
        if (sub != null) {
            return sub.tabComplete(sender, Arrays.copyOfRange(args, 1, args.length));
        }

        return Collections.emptyList();
    }
}

// SubCommand interface
public interface SubCommand {
    void execute(CommandSender sender, String[] args);
    List<String> tabComplete(CommandSender sender, String[] args);
    String getPermission(); // null = no permission required
    String getUsage();
    String getDescription();
}
```

---

## 4.5 Command Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| `args[0]` without length check | `ArrayIndexOutOfBoundsException` | `if (args.length > 0)` first |
| `Integer.parseInt(args[0])` without try-catch | `NumberFormatException` on non-numeric input | Wrap in try-catch |
| `Bukkit.getPlayer(args[0])` without null check | `NullPointerException` if player offline | Null-check the result |
| Returning `null` from `onTabComplete` | Falls back to all online players | Return `Collections.emptyList()` |
| 200-line `switch` in `onCommand` | Unmaintainable | Map-based subcommand router |
| Casting `sender` to `Player` without check | `ClassCastException` from console | `instanceof` check first |
| Hardcoding permission strings | Typo-prone, hard to maintain | Constants class for permission strings |
| Not checking `command.getName()` in shared executor | Wrong command handled | Check `command.getName()` or use separate executors |
| `sender.sendMessage(ChatColor.RED + "msg")` | Legacy API | `sender.sendMessage(Component.text("msg", NamedTextColor.RED))` |

---

---

# 5. Inventory & GUI API

## 5.1 Custom Inventory Creation

```java
// Basic inventory creation
// Size MUST be a multiple of 9 (9, 18, 27, 36, 45, 54)
Inventory gui = Bukkit.createInventory(null, 27, "My GUI"); // Legacy string title

// Paper: Adventure Component title (recommended)
Component title = Component.text("My GUI", NamedTextColor.GOLD);
Inventory gui = Bukkit.createInventory(null, 27, title);

// With custom InventoryHolder (for type-safe identification)
public class MyGUIHolder implements InventoryHolder {
    private Inventory inventory;

    @Override
    public Inventory getInventory() {
        return inventory;
    }
}

MyGUIHolder holder = new MyGUIHolder();
Inventory gui = Bukkit.createInventory(holder, 27, title);
// Later: event.getInventory().getHolder() instanceof MyGUIHolder

// Size rules:
// 9  = 1 row
// 18 = 2 rows
// 27 = 3 rows
// 36 = 4 rows
// 45 = 5 rows
// 54 = 6 rows (maximum for chest-type)

// Special inventory types (non-chest)
Inventory anvil = Bukkit.createInventory(null, InventoryType.ANVIL, title);
Inventory hopper = Bukkit.createInventory(null, InventoryType.HOPPER, title);
// Note: InventoryType inventories have fixed sizes

// Title length: No hard limit in modern Paper, but keep under 32 chars for display
```

---

## 5.2 Click Event Handling

```java
@EventHandler
public void onInventoryClick(InventoryClickEvent event) {
    if (!(event.getWhoClicked() instanceof Player player)) return;

    // STEP 1: Identify if this is your GUI
    Inventory topInventory = event.getView().getTopInventory();
    if (!(topInventory.getHolder() instanceof MyGUIHolder)) return;

    // STEP 2: Cancel ALL clicks to prevent item movement
    // This must happen BEFORE checking which inventory was clicked
    // to prevent shift-click exploits from the bottom inventory
    event.setCancelled(true);

    // STEP 3: Only process clicks in the top inventory
    Inventory clickedInventory = event.getClickedInventory();
    if (clickedInventory == null || !clickedInventory.equals(topInventory)) return;

    // STEP 4: Handle the click
    int slot = event.getSlot();
    ClickType clickType = event.getClick();

    // ClickType values:
    // LEFT — left mouse button
    // RIGHT — right mouse button
    // MIDDLE — middle mouse button
    // SHIFT_LEFT — shift + left click
    // SHIFT_RIGHT — shift + right click
    // NUMBER_KEY — hotbar key (1-9)
    // DROP — Q key (drop item)
    // CONTROL_DROP — Ctrl+Q (drop stack)
    // DOUBLE_CLICK — double left click
    // CREATIVE — creative mode specific

    handleSlotClick(player, slot, clickType);
}

// Slot numbering for a 27-slot (3-row) inventory:
// Row 1: slots 0-8
// Row 2: slots 9-17
// Row 3: slots 18-26
// Player inventory (when open): slots 27-53 (raw slots)
// Player hotbar: slots 54-62 (raw slots)
```

---

## 5.3 Persistent GUI State

```java
// Pattern: Store GUI state per-player using a manager class
public class GUIManager {
    private final Map<UUID, MyGUIState> openGUIs = new HashMap<>();

    public void openGUI(Player player, MyGUIState state) {
        openGUIs.put(player.getUniqueId(), state);
        player.openInventory(state.buildInventory());
    }

    public MyGUIState getState(Player player) {
        return openGUIs.get(player.getUniqueId());
    }

    public void closeGUI(Player player) {
        openGUIs.remove(player.getUniqueId());
    }
}

// Clean up on inventory close
@EventHandler
public void onInventoryClose(InventoryCloseEvent event) {
    if (!(event.getPlayer() instanceof Player player)) return;
    if (!(event.getInventory().getHolder() instanceof MyGUIHolder)) return;

    guiManager.closeGUI(player);
}

// Clean up on player quit (prevent memory leak)
@EventHandler
public void onPlayerQuit(PlayerQuitEvent event) {
    guiManager.closeGUI(event.getPlayer());
}

// Pagination pattern
public class PaginatedGUI {
    private int currentPage = 0;
    private final List<ItemStack> items;
    private static final int ITEMS_PER_PAGE = 45; // 5 rows of items, 1 row for controls

    public Inventory buildPage(int page) {
        Inventory inv = Bukkit.createInventory(new MyGUIHolder(), 54,
            Component.text("Items — Page " + (page + 1)));

        int start = page * ITEMS_PER_PAGE;
        int end = Math.min(start + ITEMS_PER_PAGE, items.size());

        for (int i = start; i < end; i++) {
            inv.setItem(i - start, items.get(i));
        }

        // Navigation buttons in row 6 (slots 45-53)
        if (page > 0) {
            inv.setItem(45, createNavButton(Material.ARROW, "Previous Page"));
        }
        if (end < items.size()) {
            inv.setItem(53, createNavButton(Material.ARROW, "Next Page"));
        }

        return inv;
    }
}
```

---

## 5.4 Common GUI Mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Not cancelling event for bottom inventory clicks | Shift-click moves items into GUI | Cancel event when `topInventory.getHolder()` matches |
| Using `event.getInventory()` to identify GUI | Returns top inventory always — misses shift-clicks | Use `event.getView().getTopInventory()` |
| Not null-checking `event.getClickedInventory()` | NPE when clicking outside window | Null-check before use |
| Inventory size not multiple of 9 | `IllegalArgumentException` | Use 9, 18, 27, 36, 45, or 54 |
| Storing `Inventory` reference after close | Stale inventory object | Rebuild inventory on open |
| Not cleaning up on `PlayerQuitEvent` | Memory leak in GUI state map | Remove from map on quit |
| Opening inventory inside `InventoryCloseEvent` | Causes recursive close/open loop | Schedule 1-tick delay: `runTaskLater(..., 1L)` |
| `event.getSlot()` for raw slot math | `getSlot()` is relative to clicked inventory | Use `event.getRawSlot()` for absolute position |

---

---

# 6. Scheduler & Async API

## 6.1 BukkitScheduler Patterns

```java
BukkitScheduler scheduler = Bukkit.getScheduler();

// Run once on next tick (sync)
scheduler.runTask(plugin, () -> {
    // Runs on main thread, next server tick
});

// Run after delay (sync) — 20 ticks = 1 second
BukkitTask task = scheduler.runTaskLater(plugin, () -> {
    // Runs on main thread after 60 ticks (3 seconds)
}, 60L);

// Run repeatedly (sync) — initialDelay, period (both in ticks)
BukkitTask repeatingTask = scheduler.runTaskTimer(plugin, () -> {
    // Runs every 20 ticks (1 second) after initial 0-tick delay
}, 0L, 20L);

// Run once async (off main thread)
scheduler.runTaskAsynchronously(plugin, () -> {
    // Runs on async thread — safe for I/O, database calls
    // DO NOT call Bukkit API here (except thread-safe methods)
});

// Run after delay async
scheduler.runTaskLaterAsynchronously(plugin, () -> {
    // Async, after 100 ticks (5 seconds)
}, 100L);

// Run repeatedly async
BukkitTask asyncRepeating = scheduler.runTaskTimerAsynchronously(plugin, () -> {
    // Async, every 200 ticks (10 seconds)
}, 0L, 200L);

// Cancel a task
task.cancel();
repeatingTask.cancel();

// Cancel by task ID
int taskId = scheduler.runTaskLater(plugin, () -> {}, 20L).getTaskId();
scheduler.cancelTask(taskId);
```

**Complete scheduler comparison:**

| Method | Thread | Delay | Repeat | Returns | Notes |
|---|---|---|---|---|---|
| `runTask` | Main | No | No | `BukkitTask` | Next tick |
| `runTaskLater` | Main | Yes | No | `BukkitTask` | After N ticks |
| `runTaskTimer` | Main | Yes | Yes | `BukkitTask` | Every N ticks |
| `runTaskAsynchronously` | Async | No | No | `BukkitTask` | Immediate async |
| `runTaskLaterAsynchronously` | Async | Yes | No | `BukkitTask` | Async after delay |
| `runTaskTimerAsynchronously` | Async | Yes | Yes | `BukkitTask` | Async repeating |
| `callSyncMethod` | Main | No | No | `Future<T>` | Blocking sync call from async |

---

## 6.2 Paper AsyncScheduler

Paper 1.20+ provides a dedicated async scheduler with better lifecycle management:

```java
import io.papermc.paper.threadedregions.scheduler.AsyncScheduler;
import io.papermc.paper.threadedregions.scheduler.ScheduledTask;
import java.util.concurrent.TimeUnit;

AsyncScheduler asyncScheduler = Bukkit.getAsyncScheduler();

// Run once async
asyncScheduler.runNow(plugin, task -> {
    // Async execution
});

// Run after delay (uses TimeUnit, not ticks)
asyncScheduler.runDelayed(plugin, task -> {
    // After 5 seconds
}, 5L, TimeUnit.SECONDS);

// Run repeatedly
ScheduledTask repeating = asyncScheduler.runAtFixedRate(plugin, task -> {
    // Every 10 seconds, starting after 1 second
}, 1L, 10L, TimeUnit.SECONDS);

// Cancel
repeating.cancel();
```

**Paper Entity Scheduler (Folia-compatible):**

```java
// For entity-bound tasks — follows entity across regions in Folia
entity.getScheduler().run(plugin, task -> {
    // Runs on the thread owning this entity
    entity.teleport(someLocation);
}, null); // null = fallback if entity is removed

entity.getScheduler().runDelayed(plugin, task -> {
    // After 20 ticks
}, null, 20L);
```

---

## 6.3 Task Lifecycle Management

```java
public class MyPlugin extends JavaPlugin {
    // Store tasks for cleanup
    private final List<BukkitTask> activeTasks = new ArrayList<>();
    private final Map<UUID, BukkitTask> playerTasks = new HashMap<>();

    public void startGlobalTask() {
        BukkitTask task = Bukkit.getScheduler().runTaskTimer(this, () -> {
            // Global repeating logic
        }, 0L, 20L);
        activeTasks.add(task);
    }

    public void startPlayerTask(Player player) {
        // Cancel existing task for this player first
        stopPlayerTask(player.getUniqueId());

        BukkitTask task = Bukkit.getScheduler().runTaskTimer(this, () -> {
            if (!player.isOnline()) {
                stopPlayerTask(player.getUniqueId());
                return;
            }
            // Per-player logic
        }, 0L, 10L);

        playerTasks.put(player.getUniqueId(), task);
    }

    public void stopPlayerTask(UUID uuid) {
        BukkitTask task = playerTasks.remove(uuid);
        if (task != null) task.cancel();
    }

    @Override
    public void onDisable() {
        // Cancel ALL tasks on shutdown — prevents tasks running after plugin disabled
        activeTasks.forEach(BukkitTask::cancel);
        activeTasks.clear();

        playerTasks.values().forEach(BukkitTask::cancel);
        playerTasks.clear();

        // Or cancel all tasks registered to this plugin at once:
        Bukkit.getScheduler().cancelTasks(this);
    }
}
```

---

## 6.4 Thread Safety Rules

**What you CAN do on async threads:**
- File I/O (reading/writing files)
- Database queries (JDBC, MongoDB, Redis)
- HTTP requests
- Heavy computation (pathfinding, generation)
- Reading `plugin.getConfig()` values (read-only)
- Accessing `ConcurrentHashMap` and other thread-safe collections

**What you CANNOT do on async threads (must schedule sync):**
- `player.teleport()`
- `player.getInventory().setItem()`
- `player.sendMessage()` — **actually thread-safe on Paper**, but not guaranteed on Spigot
- `block.setType()`
- `world.spawnEntity()`
- `Bukkit.broadcastMessage()`
- Any world modification
- Opening inventories
- Spawning particles or sounds at locations

```java
// Pattern: async I/O → sync Bukkit API
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    // Heavy I/O on async thread
    PlayerData data = database.load(uuid);

    // Switch back to main thread for Bukkit API
    Bukkit.getScheduler().runTask(plugin, () -> {
        Player player = Bukkit.getPlayer(uuid);
        if (player != null && player.isOnline()) {
            applyPlayerData(player, data); // Bukkit API calls here
        }
    });
});
```

---

---

# 7. Configuration API

## 7.1 FileConfiguration Patterns

```java
// Access the default config.yml (auto-created from resources/config.yml)
FileConfiguration config = getConfig();

// Save default config if it doesn't exist
saveDefaultConfig();

// Reload config from disk
reloadConfig();

// Save config to disk (after modifications)
saveConfig();

// Reading values — ALWAYS use defaults
String name = config.getString("settings.name", "default");
int count = config.getInt("settings.count", 0);
double multiplier = config.getDouble("settings.multiplier", 1.0);
boolean enabled = config.getBoolean("settings.enabled", true);
long timestamp = config.getLong("settings.timestamp", 0L);
List<String> list = config.getStringList("settings.list"); // Returns empty list if missing, never null

// Writing values
config.set("settings.name", "newvalue");
config.set("settings.count", 42);
saveConfig();

// Checking existence
if (config.contains("settings.name")) { ... }
if (config.isSet("settings.name")) { ... } // Also checks if explicitly set to null

// Sections
ConfigurationSection section = config.getConfigurationSection("rewards");
if (section != null) {
    for (String key : section.getKeys(false)) {
        int value = section.getInt(key, 0);
    }
}
```

---

## 7.2 Type-Safe Access

```java
// WRONG: Manual type conversion — causes ClassCastException
// int weight = Integer.parseInt(String.valueOf(config.get("weight")));
// Map<String, Object> map = (Map<String, Object>) config.get("section"); // Unsafe cast

// CORRECT: Use typed getters
int weight = config.getInt("weight", 1);
String name = config.getString("name", "unknown");
List<String> items = config.getStringList("items"); // Never null

// CORRECT: Section iteration
ConfigurationSection section = config.getConfigurationSection("items");
if (section != null) {
    for (String key : section.getKeys(false)) {
        // Use section's typed getters, not map operations
        String displayName = section.getString(key + ".name", key);
        int price = section.getInt(key + ".price", 0);
        Material material = Material.matchMaterial(
            section.getString(key + ".material", "STONE")
        );
    }
}

// ItemStack serialization (built-in)
config.set("item", itemStack); // Serializes ItemStack to YAML
ItemStack loaded = config.getItemStack("item"); // Deserializes — may return null
if (loaded != null) { ... }

// Location serialization (built-in)
config.set("spawn", location); // Serializes Location
Location spawn = config.getSerializable("spawn", Location.class, null);
```

---

## 7.3 Custom Config Files

```java
public class CustomConfig {
    private final JavaPlugin plugin;
    private final String fileName;
    private File configFile;
    private FileConfiguration config;

    public CustomConfig(JavaPlugin plugin, String fileName) {
        this.plugin = plugin;
        this.fileName = fileName;
    }

    public void setup() {
        configFile = new File(plugin.getDataFolder(), fileName);

        if (!configFile.exists()) {
            plugin.getDataFolder().mkdirs();
            // Copy from resources if it exists there
            try (InputStream in = plugin.getResource(fileName)) {
                if (in != null) {
                    Files.copy(in, configFile.toPath());
                } else {
                    configFile.createNewFile();
                }
            } catch (IOException e) {
                plugin.getLogger().severe("Could not create " + fileName);
            }
        }

        config = YamlConfiguration.loadConfiguration(configFile);
    }

    public FileConfiguration get() {
        return config;
    }

    public void save() {
        try {
            config.save(configFile);
        } catch (IOException e) {
            plugin.getLogger().severe("Could not save " + fileName);
        }
    }

    public void reload() {
        config = YamlConfiguration.loadConfiguration(configFile);
    }
}
```

---

## 7.4 Config Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| `config.getString("key")` without default | Returns `null` — NPE risk | `config.getString("key", "default")` |
| `(Map<String, Object>) config.get("section")` | Unsafe cast, ClassCastException | `config.getConfigurationSection("section")` |
| `config.getStringList("key") == null` check | `getStringList` never returns null | Unnecessary check — always returns list |
| Calling `saveConfig()` on every write | Disk I/O on main thread repeatedly | Batch writes, save on `onDisable()` |
| Not calling `saveDefaultConfig()` | config.yml not created for new installs | Call in `onEnable()` |
| Hardcoding config paths as strings | Typo-prone | Constants class for config keys |
| `config.set("key", null)` to delete | Sets to null, key still exists | `config.set("key", null)` actually removes it — this is correct |
| Reading config in hot paths | Repeated YAML parsing overhead | Cache config values in fields on load |

---

---

# 8. Adventure API (Modern Components)

## 8.1 Component-Based Messaging

The Adventure API replaces legacy `ChatColor` string formatting. Available natively in Paper 1.16.5+.

```java
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.format.TextDecoration;

// Simple colored text
Component message = Component.text("Hello, World!", NamedTextColor.GREEN);

// Chained formatting
Component formatted = Component.text("Warning: ", NamedTextColor.RED, TextDecoration.BOLD)
    .append(Component.text("You are in danger!", NamedTextColor.YELLOW));

// Hex color
Component hexColored = Component.text("Custom color!", TextColor.fromHexString("#FF6B35"));

// Decorations
Component decorated = Component.text("Bold and italic")
    .decoration(TextDecoration.BOLD, true)
    .decoration(TextDecoration.ITALIC, false); // Explicitly disable italic (items default to italic)

// Sending to player
player.sendMessage(message);

// Item display name (Paper 1.20.5+)
ItemMeta meta = item.getItemMeta();
meta.displayName(Component.text("Epic Sword", NamedTextColor.GOLD)
    .decoration(TextDecoration.ITALIC, false)); // Disable default italic
item.setItemMeta(meta);

// Item lore (Paper)
List<Component> lore = new ArrayList<>();
lore.add(Component.text("Damage: ", NamedTextColor.GRAY)
    .append(Component.text("50", NamedTextColor.RED))
    .decoration(TextDecoration.ITALIC, false));
lore.add(Component.text("Rarity: ", NamedTextColor.GRAY)
    .append(Component.text("Legendary", NamedTextColor.GOLD))
    .decoration(TextDecoration.ITALIC, false));
meta.lore(lore);

// Inventory title (Paper)
Inventory inv = Bukkit.createInventory(null, 27,
    Component.text("My Shop", NamedTextColor.DARK_PURPLE));
```

---

## 8.2 Audience API

```java
import net.kyori.adventure.audience.Audience;
import net.kyori.adventure.title.Title;
import net.kyori.adventure.sound.Sound;
import net.kyori.adventure.text.Component;

// Player implements Audience — send directly
player.sendMessage(Component.text("Hello!"));
player.sendActionBar(Component.text("Action bar message", NamedTextColor.YELLOW));

// Title display
Title title = Title.title(
    Component.text("Round Start!", NamedTextColor.GREEN, TextDecoration.BOLD),
    Component.text("Good luck!", NamedTextColor.GRAY),
    Title.Times.times(
        Duration.ofMillis(500),  // Fade in
        Duration.ofSeconds(3),   // Stay
        Duration.ofMillis(500)   // Fade out
    )
);
player.showTitle(title);
player.clearTitle(); // Remove title immediately

// Sound
player.playSound(
    Sound.sound(Key.key("entity.player.levelup"), Sound.Source.PLAYER, 1.0f, 1.0f)
);

// Broadcast to all players
Bukkit.getServer().sendMessage(Component.text("Server announcement!"));

// Audience.audience() for multicasting
Audience audience = Audience.audience(player1, player2, player3);
audience.sendMessage(Component.text("Message to multiple players"));

// Console audience
ConsoleCommandSender console = Bukkit.getConsoleSender();
console.sendMessage(Component.text("Console message"));
```

---

## 8.3 MiniMessage Format

MiniMessage is a string-based format for Adventure Components. Bundled with Paper.

```java
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.minimessage.tag.resolver.Placeholder;
import net.kyori.adventure.text.minimessage.tag.resolver.TagResolver;

MiniMessage mm = MiniMessage.miniMessage();

// Basic parsing
Component component = mm.deserialize("<red>Hello <gold>World!</gold></red>");

// With placeholders
Component withPlaceholder = mm.deserialize(
    "<green>Welcome, <player>!</green>",
    Placeholder.unparsed("player", player.getName())
);

// Component placeholder (allows nested formatting)
Component withComponent = mm.deserialize(
    "Your rank: <rank>",
    Placeholder.component("rank", Component.text("[VIP]", NamedTextColor.GOLD))
);

// Serialize back to MiniMessage string
String serialized = mm.serialize(component);

// Common MiniMessage tags:
// <red>, <green>, <blue>, <gold>, <gray>, <white>, <black>
// <dark_red>, <dark_green>, <dark_blue>, <dark_aqua>, <dark_purple>, <dark_gray>
// <aqua>, <light_purple>, <yellow>
// <#FF5500> — hex color
// <bold>, <italic>, <underlined>, <strikethrough>, <obfuscated>
// <reset> — reset all formatting
// <gradient:red:blue>text</gradient>
// <rainbow>text</rainbow>
// <click:run_command:/spawn>Click to teleport</click>
// <hover:show_text:'<red>Tooltip'>Hover over me</hover>
// <newline> or \n

// WRONG color names (don't exist in MiniMessage):
// <purple>   → use <dark_purple> or <light_purple>
// <orange>   → use <gold> or <#FF8C00>
// <pink>     → use <light_purple>
```

---

## 8.4 Legacy Migration

```java
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;

// Convert legacy & codes to Component
LegacyComponentSerializer legacySerializer = LegacyComponentSerializer.legacyAmpersand();
Component fromLegacy = legacySerializer.deserialize("&cRed &aGreen &bAqua");

// Convert legacy § codes to Component
Component fromSection = LegacyComponentSerializer.legacySection()
    .deserialize("§cRed §aGreen");

// Convert Component back to legacy string (for compatibility)
String toLegacy = LegacyComponentSerializer.legacyAmpersand().serialize(component);

// Strip all formatting to plain text
String plain = PlainTextComponentSerializer.plainText().serialize(component);

// ChatColor.translateAlternateColorCodes equivalent (legacy → legacy)
// AVOID: String colored = ChatColor.translateAlternateColorCodes('&', "&cHello");
// PREFER: Component component = LegacyComponentSerializer.legacyAmpersand().deserialize("&cHello");

// Migration table:
// ChatColor.RED + "text"          → Component.text("text", NamedTextColor.RED)
// ChatColor.BOLD + "text"         → Component.text("text").decorate(TextDecoration.BOLD)
// ChatColor.translateAlt('&', s)  → LegacyComponentSerializer.legacyAmpersand().deserialize(s)
// player.sendMessage(String)      → player.sendMessage(Component)
// Bukkit.broadcastMessage(String) → Bukkit.getServer().sendMessage(Component)
```

---

---

# 9. PersistentDataContainer

## 9.1 PDC Basics

PersistentDataContainer (PDC) stores custom data on any `PersistentDataHolder` (entities, items, chunks, worlds, etc.) that persists across server restarts.

```java
import org.bukkit.NamespacedKey;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

// Create a NamespacedKey — format: "pluginname:keyname" (lowercase)
NamespacedKey key = new NamespacedKey(plugin, "player_kills");
// Or: NamespacedKey.minecraft("custom_model_data") for vanilla keys

// Writing data to a player
PersistentDataContainer pdc = player.getPersistentDataContainer();
pdc.set(key, PersistentDataType.INTEGER, 42);

// Reading data
Integer kills = pdc.get(key, PersistentDataType.INTEGER);
if (kills != null) {
    // Key exists and has correct type
}

// Reading with default (getOrDefault)
int killCount = pdc.getOrDefault(key, PersistentDataType.INTEGER, 0);

// Checking existence
boolean hasKey = pdc.has(key, PersistentDataType.INTEGER);
boolean hasKeyAnyType = pdc.has(key); // Paper 1.16+

// Removing data
pdc.remove(key);

// Listing all keys
Set<NamespacedKey> keys = pdc.getKeys();

// PDC on ItemStack (via ItemMeta)
ItemMeta meta = item.getItemMeta();
PersistentDataContainer itemPDC = meta.getPersistentDataContainer();
itemPDC.set(key, PersistentDataType.STRING, "custom_sword");
item.setItemMeta(meta); // MUST call setItemMeta to persist changes

// PDC on Entity
entity.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);

// PDC on Chunk
chunk.getPersistentDataContainer().set(key, PersistentDataType.LONG, System.currentTimeMillis());
```

---

## 9.2 Data Types & Custom Types

**Built-in PDC data types:**

| PersistentDataType | Java Type | Storage Size | Use Case |
|---|---|---|---|
| `BYTE` | `Byte` | 1 byte | Boolean flags (0/1), small enums |
| `SHORT` | `Short` | 2 bytes | Small integers |
| `INTEGER` | `Integer` | 4 bytes | Counts, IDs, levels |
| `LONG` | `Long` | 8 bytes | Timestamps, large IDs |
| `FLOAT` | `Float` | 4 bytes | Percentages, ratios |
| `DOUBLE` | `Double` | 8 bytes | Precise coordinates, values |
| `STRING` | `String` | Variable | Names, UUIDs as strings, JSON |
| `BYTE_ARRAY` | `byte[]` | Variable | Small binary data |
| `INTEGER_ARRAY` | `int[]` | Variable | Coordinate arrays |
| `LONG_ARRAY` | `long[]` | Variable | UUID storage (2 longs per UUID) |
| `TAG_CONTAINER` | `PersistentDataContainer` | Variable | Nested data structures |
| `TAG_CONTAINER_ARRAY` | `PersistentDataContainer[]` | Variable | Arrays of nested structures |

**Storing UUID (recommended pattern):**

```java
// Option 1: As String (simple, slightly larger)
NamespacedKey ownerKey = new NamespacedKey(plugin, "owner_uuid");
pdc.set(ownerKey, PersistentDataType.STRING, uuid.toString());
String uuidStr = pdc.get(ownerKey, PersistentDataType.STRING);
UUID owner = uuidStr != null ? UUID.fromString(uuidStr) : null;

// Option 2: As two longs (compact)
pdc.set(new NamespacedKey(plugin, "owner_most"), PersistentDataType.LONG, uuid.getMostSignificantBits());
pdc.set(new NamespacedKey(plugin, "owner_least"), PersistentDataType.LONG, uuid.getLeastSignificantBits());
```

**Custom PersistentDataType:**

```java
// Custom type for storing a simple record
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
    public PersistentDataContainer toPrimitive(Location location, PersistentDataAdapterContext context) {
        PersistentDataContainer container = context.newPersistentDataContainer();
        container.set(new NamespacedKey("loc", "world"), PersistentDataType.STRING,
            location.getWorld() != null ? location.getWorld().getName() : "world");
        container.set(new NamespacedKey("loc", "x"), PersistentDataType.DOUBLE, location.getX());
        container.set(new NamespacedKey("loc", "y"), PersistentDataType.DOUBLE, location.getY());
        container.set(new NamespacedKey("loc", "z"), PersistentDataType.DOUBLE, location.getZ());
        return container;
    }

    @Override
    public Location fromPrimitive(PersistentDataContainer container, PersistentDataAdapterContext context) {
        String worldName = container.getOrDefault(new NamespacedKey("loc", "world"),
            PersistentDataType.STRING, "world");
        double x = container.getOrDefault(new NamespacedKey("loc", "x"), PersistentDataType.DOUBLE, 0.0);
        double y = container.getOrDefault(new NamespacedKey("loc", "y"), PersistentDataType.DOUBLE, 64.0);
        double z = container.getOrDefault(new NamespacedKey("loc", "z"), PersistentDataType.DOUBLE, 0.0);
        return new Location(Bukkit.getWorld(worldName), x, y, z);
    }
}
```

---

## 9.3 Common PDC Mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `pdc.get(key, PersistentDataType.INTEGER)` without null check | Returns null if key missing | Use `getOrDefault()` or null-check |
| `new NamespacedKey(plugin, "My Key")` | Uppercase/spaces in key | Use lowercase, underscores: `"my_key"` |
| Modifying ItemMeta PDC without `setItemMeta()` | Changes not saved | Always call `item.setItemMeta(meta)` after PDC changes |
| Using same key name across plugins | Key collision | Key is namespaced — `"myplugin:key"` won't collide with `"otherplugin:key"` |
| `pdc.get(key, PersistentDataType.STRING)` when stored as INTEGER | Returns null — type mismatch | Use the same type for get and set |
| Storing complex objects as JSON strings | Fragile, no type safety | Use `TAG_CONTAINER` for nested data |
| Creating `NamespacedKey` in hot paths | Minor allocation overhead | Cache `NamespacedKey` as static final fields |
| `pdc.has(key)` without type check on older Paper | `has(key)` without type is Paper 1.16+ | Use `pdc.has(key, PersistentDataType.X)` for compatibility |

---

---

# 10. API Confusion Matrix

## 10.1 Bukkit vs Spigot vs Paper

| Feature | Bukkit | Spigot | Paper |
|---|---|---|---|
| `player.sendMessage(Component)` | ❌ | ❌ | ✅ |
| `AsyncChatEvent` | ❌ | ❌ | ✅ |
| `AsyncPlayerPreLoginEvent` | ✅ | ✅ | ✅ |
| `player.kick(Component)` | ❌ | ❌ | ✅ |
| `player.showTitle(Title)` | ❌ | ❌ | ✅ |
| `Bukkit.createInventory(null, size, Component)` | ❌ | ❌ | ✅ |
| `event.hasChangedBlock()` in MoveEvent | ❌ | ❌ | ✅ |
| `PersistentDataContainer` | ✅ (1.14+) | ✅ | ✅ |
| `world.getChunkAtAsync()` | ❌ | ❌ | ✅ |
| Paper AsyncScheduler | ❌ | ❌ | ✅ (1.20+) |
| Brigadier command API | ❌ | ❌ | ✅ (1.20+) |
| `SpigotConfig` access | ❌ | ✅ | ✅ |
| `TeleportFlag` in teleport | ❌ | ❌ | ✅ |

---

## 10.2 Deprecated vs Modern APIs

| Deprecated API | Modern Replacement | Since |
|---|---|---|
| `ChatColor.RED + "text"` | `Component.text("text", NamedTextColor.RED)` | Paper 1.16.5 |
| `player.sendMessage(String)` | `player.sendMessage(Component)` | Paper 1.16.5 |
| `player.sendTitle(String, String, int, int, int)` | `player.showTitle(Title.title(...))` | Paper 1.16.5 |
| `player.kickPlayer(String)` | `player.kick(Component)` | Paper 1.16.5 |
| `AsyncPlayerChatEvent` | `io.papermc.paper.event.player.AsyncChatEvent` | Paper 1.19 |
| `PlayerChatEvent` (sync) | `AsyncChatEvent` | Long deprecated |
| `ItemMeta.setDisplayName(String)` | `ItemMeta.displayName(Component)` | Paper 1.20.5 |
| `ItemMeta.setLore(List<String>)` | `ItemMeta.lore(List<Component>)` | Paper 1.20.5 |
| `Bukkit.broadcastMessage(String)` | `Bukkit.getServer().sendMessage(Component)` | Paper 1.16.5 |
| `player.getMaxHealth()` | `player.getAttribute(Attribute.MAX_HEALTH).getValue()` | 1.9 |
| `player.setMaxHealth(double)` | `player.getAttribute(Attribute.MAX_HEALTH).setBaseValue(double)` | 1.9 |
| `event.setJoinMessage(String)` | `event.joinMessage(Component)` | Paper 1.16.5 |
| `event.setQuitMessage(String)` | `event.quitMessage(Component)` | Paper 1.16.5 |
| `Bukkit.getOnlinePlayers()` returns `Collection<? extends Player>` | Cast or use `List<Player>` via stream | — |
| `Location(World, x, y, z)` with null world | Avoid null world locations | — |
| `new BukkitRunnable() { run() }` | Lambda with `Bukkit.getScheduler().runTask(...)` | Style preference |

---

## 10.3 Sync vs Async APIs

| API Call | Thread Requirement | Notes |
|---|---|---|
| `player.teleport()` | **Main thread only** | Schedule sync task from async |
| `player.sendMessage(Component)` | Main thread (safe on Paper async) | Paper makes this thread-safe |
| `player.getInventory()` | **Main thread only** | Inventory modification = main thread |
| `block.setType()` | **Main thread only** | World modification = main thread |
| `world.spawnEntity()` | **Main thread only** | Entity spawning = main thread |
| `Bukkit.getPlayer(UUID)` | Main thread (safe to read async) | Reads are generally safe |
| `config.getString()` | Thread-safe (read-only) | Safe from async |
| `config.set()` + `saveConfig()` | **Main thread recommended** | Avoid concurrent writes |
| `pdc.get()` / `pdc.set()` | **Main thread only** | PDC is not thread-safe |
| Database I/O (JDBC, etc.) | **Async thread** | Never block main thread |
| File I/O | **Async thread** | Never block main thread |
| HTTP requests | **Async thread** | Never block main thread |
| `Bukkit.getScheduler().runTask()` | Can be called from any thread | Schedules on main thread |

---

## 10.4 Common Misconceptions

**Misconception 1: "PlayerJoinEvent is the right place to load player data"**
- **Reality:** `PlayerJoinEvent` fires on the main thread. Loading data here blocks the server.
- **Fix:** Load data in `AsyncPlayerPreLoginEvent` (async thread, blocking I/O is fine).

**Misconception 2: "Cancelling an event prevents all its effects"**
- **Reality:** Cancellation is a convention — plugins at higher priorities can un-cancel events. Some events have effects that happen regardless of cancellation.
- **Fix:** Check `ignoreCancelled` behavior and test with other plugins.

**Misconception 3: "getPlayer(name) is reliable for player lookup"**
- **Reality:** Player names can change. Two players can have similar names (partial match behavior varies).
- **Fix:** Use `getPlayer(UUID)` for reliable lookup. Cache UUID→name mapping.

**Misconception 4: "BukkitRunnable tasks auto-cancel when the plugin disables"**
- **Reality:** Tasks registered with `Bukkit.getScheduler()` do auto-cancel on plugin disable. However, tasks that hold references to plugin objects can cause issues during reload.
- **Fix:** Always call `Bukkit.getScheduler().cancelTasks(plugin)` in `onDisable()` for safety.

**Misconception 5: "ItemMeta changes are reflected immediately"**
- **Reality:** `ItemMeta` is a copy. You must call `item.setItemMeta(meta)` after every modification.
- **Fix:** Always call `setItemMeta()` after modifying meta.

**Misconception 6: "Async tasks can safely read player inventory"**
- **Reality:** Inventory access from async threads can cause `ConcurrentModificationException` or return stale data.
- **Fix:** Read inventory on the main thread, pass data to async task.

**Misconception 7: "plugin.yml `depend` just controls load order"**
- **Reality:** `depend` also causes your plugin to **fail to load** if the dependency is missing. Use `softdepend` for optional dependencies.
- **Fix:** Use `depend` for required plugins, `softdepend` for optional integrations.

**Misconception 8: "ChatColor works fine in modern Paper"**
- **Reality:** `ChatColor` still works for legacy string messages, but `player.sendMessage(String)` on Paper 1.20.5+ may not render legacy codes in all contexts.
- **Fix:** Use Adventure `Component` API for all user-facing messages.

**Misconception 9: "event.getInventory() tells me which inventory was clicked"**
- **Reality:** `event.getInventory()` always returns the **top** inventory, even if the player clicked their own inventory.
- **Fix:** Use `event.getClickedInventory()` to determine which inventory was actually clicked.

**Misconception 10: "I can open an inventory inside InventoryCloseEvent"**
- **Reality:** Opening an inventory inside `InventoryCloseEvent` causes a recursive close/open loop and undefined behavior.
- **Fix:** Schedule a 1-tick delayed task: `Bukkit.getScheduler().runTaskLater(plugin, () -> player.openInventory(inv), 1L)`.

---

---

# Appendix A: Quick API Reference Card

## Player Actions (Main Thread Only)

```java
player.teleport(location)                          // Teleport
player.sendMessage(Component.text("msg"))          // Send message
player.sendActionBar(Component.text("msg"))        // Action bar
player.showTitle(Title.title(main, sub, times))    // Title
player.playSound(Sound.sound(...))                 // Sound
player.addPotionEffect(new PotionEffect(...))      // Potion
player.setHealth(value)                            // Set health
player.setFoodLevel(value)                         // Set hunger
player.giveExp(amount)                             // Give XP
player.giveExpLevels(levels)                       // Give levels
player.getInventory().addItem(itemStack)           // Add item
player.getInventory().setItem(slot, itemStack)     // Set slot
player.openInventory(inventory)                    // Open GUI
player.closeInventory()                            // Close GUI
player.kick(Component.text("reason"))              // Kick player
player.setBanned(true)                             // Ban player
player.setOp(true)                                 // Set operator
player.setGameMode(GameMode.SURVIVAL)              // Set gamemode
player.setFlying(true)                             // Set flying
player.setAllowFlight(true)                        // Allow flight
```

## Item Construction

```java
ItemStack item = new ItemStack(Material.DIAMOND_SWORD);
ItemMeta meta = item.getItemMeta();
meta.displayName(Component.text("Epic Sword", NamedTextColor.GOLD)
    .decoration(TextDecoration.ITALIC, false));
meta.lore(List.of(
    Component.text("Damage: 50", NamedTextColor.GRAY)
        .decoration(TextDecoration.ITALIC, false)
));
meta.addEnchant(Enchantment.SHARPNESS, 5, true);
meta.addItemFlags(ItemFlag.HIDE_ENCHANTS);
meta.setUnbreakable(true);
item.setItemMeta(meta);
```

## Scheduler Quick Reference

```java
// Sync, next tick
Bukkit.getScheduler().runTask(plugin, () -> { });

// Sync, after 20 ticks (1 second)
Bukkit.getScheduler().runTaskLater(plugin, () -> { }, 20L);

// Sync, every 20 ticks
BukkitTask t = Bukkit.getScheduler().runTaskTimer(plugin, () -> { }, 0L, 20L);
t.cancel(); // Cancel when done

// Async (for I/O)
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> { });

// Async → Sync pattern
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    Object result = doHeavyWork();
    Bukkit.getScheduler().runTask(plugin, () -> applyResult(result));
});
```

## Event Registration

```java
// In onEnable():
Bukkit.getPluginManager().registerEvents(new MyListener(this), this);

// Unregister all on disable:
HandlerList.unregisterAll(this);
```

## Config Quick Reference

```java
saveDefaultConfig();                                    // Create config.yml if missing
FileConfiguration cfg = getConfig();                    // Get config
cfg.getString("key", "default")                        // String with default
cfg.getInt("key", 0)                                   // Int with default
cfg.getBoolean("key", false)                           // Boolean with default
cfg.getStringList("key")                               // List<String>, never null
cfg.getConfigurationSection("section")                 // Section (null-check!)
cfg.set("key", value); saveConfig();                   // Write and save
reloadConfig();                                        // Reload from disk
```

## NamespacedKey & PDC

```java
NamespacedKey key = new NamespacedKey(plugin, "my_key"); // Cache as static final
PersistentDataContainer pdc = entity.getPersistentDataContainer();
pdc.set(key, PersistentDataType.INTEGER, 42);
int val = pdc.getOrDefault(key, PersistentDataType.INTEGER, 0);
pdc.remove(key);
```

---

---

# Appendix B: Version Compatibility Table

| API / Feature | 1.8 | 1.12 | 1.13 | 1.16 | 1.17 | 1.18 | 1.19 | 1.20 | 1.21 |
|---|---|---|---|---|---|---|---|---|---|
| Flattened Material enum | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| PersistentDataContainer | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Adventure API (Paper) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MiniMessage (Paper) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `AsyncChatEvent` (Paper) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Paper AsyncScheduler | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Paper Brigadier API | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ItemMeta.displayName(Component)` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Registry` API | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `world.getChunkAtAsync()` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Attribute.MAX_HEALTH` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `player.kick(Component)` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Title.title(...)` Adventure | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `BlockMultiPlaceEvent` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ServerLoadEvent` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Java version required | 7 | 8 | 8 | 11 | 16 | 17 | 17 | 17 | 21 |

---

---

# Appendix C: AI API Mistake Catalog

50 common mistakes AI coding assistants make when generating Minecraft plugin code, with exact fixes.

---

### Mistakes 1–10: Thread Safety

**1. Calling `player.teleport()` from an async event handler**
```java
// WRONG
@EventHandler
public void onPreLogin(AsyncPlayerPreLoginEvent event) {
    Player p = Bukkit.getPlayer(event.getUniqueId());
    if (p != null) p.teleport(spawn); // Async thread — crash
}
// CORRECT: Use PlayerJoinEvent (main thread) for teleportation
```

**2. Modifying inventory from async task**
```java
// WRONG
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    player.getInventory().addItem(reward); // Thread-unsafe
});
// CORRECT
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    ItemStack reward = buildReward(); // Compute async
    Bukkit.getScheduler().runTask(plugin, () ->
        player.getInventory().addItem(reward)); // Apply sync
});
```

**3. Calling `block.setType()` from async thread**
```java
// WRONG
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    block.setType(Material.AIR); // World modification — crash
});
// CORRECT: Schedule sync task for world modifications
```

**4. Using `Bukkit.broadcastMessage()` from async chat event**
```java
// WRONG
@EventHandler
public void onChat(AsyncPlayerChatEvent event) {
    Bukkit.broadcastMessage("Someone chatted!"); // Unsafe
}
// CORRECT: Schedule sync task, or use thread-safe Paper API
```

**5. Spawning entities from async thread**
```java
// WRONG
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    world.spawnEntity(location, EntityType.ZOMBIE); // Main thread only
});
// CORRECT: runTask() for entity spawning
```

**6. Reading PDC from async thread**
```java
// WRONG
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    int level = pdc.getOrDefault(key, PersistentDataType.INTEGER, 0); // Not thread-safe
});
// CORRECT: Read PDC on main thread, pass value to async
```

**7. Opening inventory from async thread**
```java
// WRONG
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    player.openInventory(gui); // Main thread only
});
// CORRECT: Schedule sync task
```

**8. Calling `world.getChunkAt()` (sync) from main thread in hot path**
```java
// WRONG (blocks main thread if chunk not loaded)
Chunk chunk = location.getChunk(); // Loads chunk synchronously
// CORRECT: Use async chunk loading
world.getChunkAtAsync(location).thenAccept(chunk -> { ... });
```

**9. Storing Player reference in async callback**
```java
// WRONG
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    database.save(player); // Player object may be stale
});
// CORRECT: Capture UUID and needed data before async
UUID uuid = player.getUniqueId();
PlayerData snapshot = captureData(player);
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    database.save(uuid, snapshot);
});
```

**10. Not scheduling sync task after async database load**
```java
// WRONG
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    PlayerData data = db.load(uuid);
    player.sendMessage("Loaded!"); // May be unsafe
    applyData(player, data); // Definitely unsafe
});
// CORRECT
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    PlayerData data = db.load(uuid);
    Bukkit.getScheduler().runTask(plugin, () -> {
        if (player.isOnline()) applyData(player, data);
    });
});
```

---

### Mistakes 11–20: Null Safety

**11. Not null-checking `Bukkit.getPlayer(name)`**
```java
// WRONG
Player target = Bukkit.getPlayer(args[0]);
target.sendMessage("Hello!"); // NPE if offline
// CORRECT
Player target = Bukkit.getPlayer(args[0]);
if (target == null) { sender.sendMessage("Player not found."); return true; }
```

**12. Not null-checking `loc.getWorld()`**
```java
// WRONG
String worldName = player.getLocation().getWorld().getName(); // NPE if world unloaded
// CORRECT
World world = player.getLocation().getWorld();
if (world == null) return;
String worldName = world.getName();
```

**13. Not null-checking `event.getClickedInventory()`**
```java
// WRONG
@EventHandler
public void onClick(InventoryClickEvent event) {
    int slot = event.getClickedInventory().getSize(); // NPE if clicked outside window
}
// CORRECT
Inventory clicked = event.getClickedInventory();
if (clicked == null) return;
```

**14. Not null-checking `config.getString()`**
```java
// WRONG
String value = config.getString("key");
value.toLowerCase(); // NPE if key missing
// CORRECT
String value = config.getString("key", "default");
// OR
String value = config.getString("key");
if (value == null) return;
```

**15. Not null-checking `Bukkit.getWorld(name)`**
```java
// WRONG
World world = Bukkit.getWorld("world");
world.spawnEntity(loc, EntityType.ZOMBIE); // NPE if world not loaded
// CORRECT
World world = Bukkit.getWorld("world");
if (world == null) { getLogger().warning("World not found!"); return; }
```

**16. Not null-checking `item.getItemMeta()`**
```java
// WRONG
ItemStack item = player.getInventory().getItemInMainHand();
String name = item.getItemMeta().getDisplayName(); // NPE if no meta or AIR
// CORRECT
ItemStack item = player.getInventory().getItemInMainHand();
if (item == null || item.getType() == Material.AIR) return;
ItemMeta meta = item.getItemMeta();
if (meta == null) return;
```

**17. Accessing `args[0]` without length check**
```java
// WRONG
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    String sub = args[0]; // ArrayIndexOutOfBoundsException if no args
}
// CORRECT
if (args.length == 0) { sender.sendMessage("Usage: /cmd <sub>"); return true; }
String sub = args[0];
```

**18. Not null-checking `event.getItem()` in PlayerInteractEvent**
```java
// WRONG
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    if (event.getItem().getType() == Material.STICK) { ... } // NPE if empty hand
}
// CORRECT
ItemStack item = event.getItem();
if (item == null || item.getType() != Material.STICK) return;
```

**19. Not null-checking `event.getClickedBlock()` in PlayerInteractEvent**
```java
// WRONG
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    if (event.getClickedBlock().getType() == Material.CHEST) { ... } // NPE for air clicks
}
// CORRECT
Block block = event.getClickedBlock();
if (block == null) return;
```

**20. Not null-checking `config.getConfigurationSection()`**
```java
// WRONG
for (String key : config.getConfigurationSection("rewards").getKeys(false)) { ... } // NPE
// CORRECT
ConfigurationSection section = config.getConfigurationSection("rewards");
if (section == null) return;
for (String key : section.getKeys(false)) { ... }
```

---

### Mistakes 21–30: Event API

**21. Using `PlayerChatEvent` (sync, deprecated)**
```java
// WRONG
@EventHandler
public void onChat(PlayerChatEvent event) { ... } // Deprecated, sync
// CORRECT (Paper 1.19+)
@EventHandler
public void onChat(io.papermc.paper.event.player.AsyncChatEvent event) { ... }
```

**22. Modifying event state at MONITOR priority**
```java
// WRONG
@EventHandler(priority = EventPriority.MONITOR)
public void onBreak(BlockBreakEvent event) {
    event.setCancelled(true); // Never modify at MONITOR
}
// CORRECT: Use HIGHEST for last-chance modifications
```

**23. Not using `ignoreCancelled = true` for reward handlers**
```java
// WRONG
@EventHandler
public void onKill(EntityDeathEvent event) {
    giveReward(event.getEntity().getKiller()); // Fires even if event was cancelled
}
// CORRECT
@EventHandler(ignoreCancelled = true)
public void onKill(EntityDeathEvent event) { ... }
```

**24. Double-firing from PlayerInteractEvent off-hand**
```java
// WRONG
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    giveItem(event.getPlayer()); // Called twice — main hand + off hand
}
// CORRECT
@EventHandler
public void onInteract(PlayerInteractEvent event) {
    if (event.getHand() != EquipmentSlot.HAND) return;
    giveItem(event.getPlayer());
}
```

**25. Casting damager directly to Player**
```java
// WRONG
@EventHandler
public void onDamage(EntityDamageByEntityEvent event) {
    Player attacker = (Player) event.getDamager(); // ClassCastException for mobs
}
// CORRECT
if (!(event.getDamager() instanceof Player attacker)) return;
```

**26. Not checking block position change in PlayerMoveEvent**
```java
// WRONG
@EventHandler
public void onMove(PlayerMoveEvent event) {
    checkRegion(event.getTo()); // Called 20x/second per player for head rotation
}
// CORRECT
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Location from = event.getFrom(), to = event.getTo();
    if (from.getBlockX() == to.getBlockX() && from.getBlockY() == to.getBlockY()
            && from.getBlockZ() == to.getBlockZ()) return;
    checkRegion(to);
}
```

**27. Using `event.setJoinMessage(String)` on Paper**
```java
// WRONG (legacy)
event.setJoinMessage(ChatColor.GREEN + player.getName() + " joined!");
// CORRECT (Paper)
event.joinMessage(Component.text(player.getName() + " joined!", NamedTextColor.GREEN));
```

**28. Registering events in constructor instead of onEnable**
```java
// WRONG
public class MyListener implements Listener {
    public MyListener(MyPlugin plugin) {
        Bukkit.getPluginManager().registerEvents(this, plugin); // Bad practice
    }
}
// CORRECT: Register in onEnable()
Bukkit.getPluginManager().registerEvents(new MyListener(this), this);
```

**29. Not cancelling InventoryClickEvent for custom GUI**
```java
// WRONG
@EventHandler
public void onClick(InventoryClickEvent event) {
    if (event.getInventory().getHolder() instanceof MyGUI) {
        handleClick(event.getSlot()); // Items can still be moved!
    }
}
// CORRECT: Cancel the event
event.setCancelled(true);
handleClick(event.getSlot());
```

**30. Opening inventory inside InventoryCloseEvent**
```java
// WRONG
@EventHandler
public void onClose(InventoryCloseEvent event) {
    player.openInventory(nextGui); // Recursive close/open loop
}
// CORRECT
@EventHandler
public void onClose(InventoryCloseEvent event) {
    Bukkit.getScheduler().runTaskLater(plugin, () ->
        player.openInventory(nextGui), 1L);
}
```

---

### Mistakes 31–40: Data & Storage

**31. Using player name as database key**
```java
// WRONG
database.save(player.getName(), data); // Breaks on name change
// CORRECT
database.save(player.getUniqueId().toString(), data);
```

**32. Not calling `setItemMeta()` after modifying meta**
```java
// WRONG
ItemMeta meta = item.getItemMeta();
meta.setDisplayName("New Name");
// Forgot: item.setItemMeta(meta); — change is lost
// CORRECT
item.setItemMeta(meta); // Always call this after modifying meta
```

**33. Not cloning Location before modifying**
```java
// WRONG
Location loc = player.getLocation();
loc.add(0, 1, 0); // Modifies the returned location object
// CORRECT
Location loc = player.getLocation().clone();
loc.add(0, 1, 0);
```

**34. Using `Bukkit.getOfflinePlayer(name)` (slow)**
```java
// WRONG
OfflinePlayer op = Bukkit.getOfflinePlayer("Notch"); // May do network lookup
// CORRECT: Cache UUID→name, use UUID-based lookup
OfflinePlayer op = Bukkit.getOfflinePlayer(cachedUUID);
```

**35. Not saving config after `config.set()`**
```java
// WRONG
config.set("key", value); // In-memory only — lost on restart
// CORRECT
config.set("key", value);
saveConfig();
```

**36. Storing Player object in long-lived collection**
```java
// WRONG
private final List<Player> vipPlayers = new ArrayList<>(); // Stale after logout
// CORRECT
private final Set<UUID> vipPlayers = new HashSet<>();
```

**37. Not removing player data on quit (memory leak)**
```java
// WRONG
private final Map<UUID, PlayerData> cache = new HashMap<>();
// Missing: @EventHandler onQuit → cache.remove(uuid)
// CORRECT: Always clean up on PlayerQuitEvent
@EventHandler
public void onQuit(PlayerQuitEvent event) {
    cache.remove(event.getPlayer().getUniqueId());
}
```

**38. Using `config.get("key")` instead of typed getter**
```java
// WRONG
int value = (int) config.get("count"); // ClassCastException risk
// CORRECT
int value = config.getInt("count", 0);
```

**39. Not null-checking PDC.get()**
```java
// WRONG
int level = pdc.get(key, PersistentDataType.INTEGER); // NPE if key missing
// CORRECT
int level = pdc.getOrDefault(key, PersistentDataType.INTEGER, 0);
```

**40. Creating NamespacedKey with uppercase or spaces**
```java
// WRONG
NamespacedKey key = new NamespacedKey(plugin, "Player Level"); // Invalid
// CORRECT
NamespacedKey key = new NamespacedKey(plugin, "player_level"); // Lowercase, underscores
```

---

### Mistakes 41–50: Scheduler & Lifecycle

**41. Not cancelling tasks in onDisable (memory/thread leak)**
```java
// WRONG
public void onEnable() {
    Bukkit.getScheduler().runTaskTimer(this, this::tick, 0L, 20L);
    // No cleanup in onDisable
}
// CORRECT
private BukkitTask tickTask;
public void onEnable() { tickTask = Bukkit.getScheduler().runTaskTimer(this, this::tick, 0L, 20L); }
public void onDisable() { if (tickTask != null) tickTask.cancel(); }
```

**42. Using `e.printStackTrace()` instead of plugin logger**
```java
// WRONG
} catch (Exception e) {
    e.printStackTrace(); // No context, bad practice
}
// CORRECT
} catch (Exception e) {
    getLogger().log(Level.SEVERE, "Failed to load player data for " + uuid, e);
}
```

**43. Blocking main thread with database I/O**
```java
// WRONG
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    PlayerData data = database.loadBlocking(event.getPlayer().getUniqueId()); // BLOCKS SERVER
}
// CORRECT: Pre-load in AsyncPlayerPreLoginEvent
```

**44. Not checking `player.isOnline()` after async task**
```java
// WRONG
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    PlayerData data = db.load(uuid);
    Bukkit.getScheduler().runTask(plugin, () -> {
        player.sendMessage("Loaded!"); // Player may have logged out
    });
});
// CORRECT
Bukkit.getScheduler().runTask(plugin, () -> {
    if (player.isOnline()) player.sendMessage("Loaded!");
});
```

**45. Using `new BukkitRunnable()` when a lambda suffices**
```java
// VERBOSE (not wrong, but unnecessary)
new BukkitRunnable() {
    @Override
    public void run() {
        doSomething();
    }
}.runTaskLater(plugin, 20L);
// CLEANER
Bukkit.getScheduler().runTaskLater(plugin, () -> doSomething(), 20L);
// Use BukkitRunnable only when you need this.cancel() inside the task
```

**46. Accessing other plugin APIs in onEnable() without load order**
```java
// WRONG
public void onEnable() {
    Economy eco = getServer().getServicesManager()
        .getRegistration(Economy.class).getProvider(); // Vault may not be loaded yet
}
// CORRECT: Add `depend: [Vault]` to plugin.yml, OR use ServerLoadEvent
```

**47. Not handling task cancellation inside repeating task**
```java
// WRONG
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    if (!player.isOnline()) return; // Task keeps running even when player offline
}, 0L, 20L);
// CORRECT
Bukkit.getScheduler().runTaskTimer(plugin, task -> {
    if (!player.isOnline()) { task.cancel(); return; }
    doPlayerTask(player);
}, 0L, 20L);
// Note: BukkitRunnable.runTaskTimer() provides this.cancel() inside run()
```

**48. Using `Bukkit.getScheduler().scheduleSyncDelayedTask()` (deprecated)**
```java
// WRONG (deprecated)
Bukkit.getScheduler().scheduleSyncDelayedTask(plugin, () -> { }, 20L);
// CORRECT
Bukkit.getScheduler().runTaskLater(plugin, () -> { }, 20L);
```

**49. Not using `softdepend` for optional plugin integrations**
```java
// WRONG plugin.yml — hard dependency on optional plugin
depend:
  - PlaceholderAPI  # Plugin fails to load if PAPI not installed

// CORRECT
softdepend:
  - PlaceholderAPI  # Plugin loads without PAPI, integrates if present
```

**50. Returning `null` from `onTabComplete`**
```java
// WRONG
@Override
public List<String> onTabComplete(CommandSender sender, Command cmd, String alias, String[] args) {
    if (args.length == 1) return Arrays.asList("give", "take");
    return null; // Falls back to all online player names — unexpected behavior
}
// CORRECT
return Collections.emptyList(); // Always return empty list, never null
```

---

*End of Minecraft Plugin API Correctness Guide*
*Paper 1.21.4 | Generated for Kodari API Reference*
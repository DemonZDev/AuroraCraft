---
name: event-handling
description: Register event listeners with correct priorities, ignoreCancelled, and domain grouping
license: MIT
compatibility: opencode
metadata:
  category: events
  difficulty: beginner
---

# Event Handling Skill

## What I Do

Set up domain-grouped event listeners with correct priorities, ignoreCancelled, and safe null-checking patterns.

## Implementation Pattern

### 1. Listener Structure (Domain-Grouped)

```java
package {package}.listeners;

import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

// Group by domain, not by event type
public class PlayerConnectionListener implements Listener {
    private final {MainClass} plugin;

    public PlayerConnectionListener({MainClass} plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.NORMAL)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        // Load data async, apply sync
        plugin.getPlayerDataManager().loadPlayerAsync(player.getUniqueId())
            .thenAccept(data -> Bukkit.getScheduler().runTask(plugin, () -> {
                if (!player.isOnline()) return;
                // apply data
            }));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        plugin.getPlayerDataManager().saveAndUnloadAsync(event.getPlayer().getUniqueId());
    }
}
```

### 2. ignoreCancelled — Always Set It

```java
// CORRECT: Skip handler if event already cancelled by another plugin
@EventHandler(ignoreCancelled = true)
public void onBlockBreak(BlockBreakEvent event) {
    // Only runs if no other plugin cancelled this event
    giveReward(event.getPlayer(), event.getBlock().getType());
}

// WRONG: Processes even cancelled events (wastes CPU, causes double-processing)
@EventHandler
public void onBlockBreak(BlockBreakEvent event) { ... }
```

### 3. Cancel + Return Pattern

```java
// CORRECT: Always return immediately after cancelling
@EventHandler(ignoreCancelled = true)
public void onBlockBreak(BlockBreakEvent event) {
    if (!event.getPlayer().hasPermission("myplugin.break")) {
        event.setCancelled(true);
        return; // CRITICAL: return after cancel
    }
    // Only reaches here if NOT cancelled
    giveReward(event.getPlayer(), event.getBlock().getType());
}
```

### 4. Entity Type Checking

```java
// CORRECT: Always check entity type before casting
@EventHandler(ignoreCancelled = true)
public void onEntityDamage(EntityDamageByEntityEvent event) {
    if (!(event.getEntity() instanceof Player victim)) return;

    Player attacker = null;
    if (event.getDamager() instanceof Player p) {
        attacker = p;
    } else if (event.getDamager() instanceof Projectile proj
               && proj.getShooter() instanceof Player p) {
        attacker = p;
    }
    if (attacker == null) return;

    // Both victim and attacker are confirmed Players
}
```

### 5. PlayerMoveEvent Optimization

```java
// CORRECT: Only process on block change (not head rotation)
@EventHandler(ignoreCancelled = true)
public void onMove(PlayerMoveEvent event) {
    Location from = event.getFrom();
    Location to = event.getTo();
    if (from.getBlockX() == to.getBlockX()
        && from.getBlockY() == to.getBlockY()
        && from.getBlockZ() == to.getBlockZ()) {
        return; // head rotation only — skip
    }
    checkRegion(event.getPlayer(), to);
}
```

### 6. Inventory Click Handler

```java
// CORRECT: Check which inventory was clicked
@EventHandler
public void onInventoryClick(InventoryClickEvent event) {
    if (!(event.getWhoClicked() instanceof Player player)) return;
    if (!isOurGUI(event.getView())) return;

    event.setCancelled(true); // cancel ALL clicks while GUI is open

    // Only process clicks in the TOP inventory (the GUI)
    if (event.getClickedInventory() == null) return;
    if (event.getClickedInventory().equals(player.getInventory())) return;
    if (event.getSlot() < 0) return;

    handleGUIClick(player, event.getSlot());
}
```

### 7. Register Listeners

```java
// In onEnable() — register once, never per-player
PluginManager pm = getServer().getPluginManager();
pm.registerEvents(new PlayerConnectionListener(this), this);
pm.registerEvents(new PlayerCombatListener(this), this);
pm.registerEvents(new InventoryListener(this), this);
```

## Event Priority Reference

| Priority | Use For |
|----------|---------|
| `LOWEST` | Cancelling events before others see them (anti-cheat) |
| `LOW` | Protection plugins checking permissions |
| `NORMAL` | Most game logic (default) |
| `HIGH` | Logic that depends on earlier handlers |
| `HIGHEST` | Final overrides |
| `MONITOR` | Logging/auditing only — **NEVER cancel at MONITOR** |

### 8. Custom Events (Plugin Communication)

Custom events allow other plugins to react to your plugin's actions without compile-time dependencies:

```java
public class TokensChangeEvent extends org.bukkit.event.Event implements org.bukkit.event.Cancellable {
    private static final org.bukkit.event.HandlerList HANDLERS = new org.bukkit.event.HandlerList();
    private final UUID playerUuid;
    private final int previousAmount;
    private int newAmount;
    private boolean cancelled;

    public TokensChangeEvent(UUID playerUuid, int previousAmount, int newAmount) {
        this.playerUuid = playerUuid;
        this.previousAmount = previousAmount;
        this.newAmount = newAmount;
    }

    // Getters and setters...

    // CRITICAL: Both getHandlers() AND getHandlerList() are REQUIRED
    @Override public org.bukkit.event.HandlerList getHandlers() { return HANDLERS; }
    public static org.bukkit.event.HandlerList getHandlerList() { return HANDLERS; }
}

// Fire the event — other plugins can cancel or modify newAmount
TokensChangeEvent event = new TokensChangeEvent(uuid, oldAmount, newAmount);
Bukkit.getPluginManager().callEvent(event);
if (!event.isCancelled()) {
    applyBalance(event.getNewAmount()); // Use potentially-modified value
}
```

### 9. Async Events (AsyncPlayerChatEvent, AsyncChatEvent)

```java
// Paper 1.19+ — AsyncChatEvent (preferred)
@EventHandler
public void onChat(AsyncChatEvent event) {
    // This fires ASYNC — most Bukkit API is UNSAFE here
    String content = PlainTextComponentSerializer.plainText().serialize(event.message());

    if (content.contains("badword")) {
        event.setCancelled(true); // Safe — modifying event object
        // Schedule sync for Bukkit API
        Bukkit.getScheduler().runTask(plugin, () -> {
            event.getPlayer().sendMessage(Component.text("Watch your language!", NamedTextColor.RED));
        });
    }
}

// Legacy — AsyncPlayerChatEvent (Paper < 1.19, Spigot)
@EventHandler
public void onChatLegacy(AsyncPlayerChatEvent event) {
    if (event.getMessage().contains("badword")) {
        event.setCancelled(true); // Safe in async
        Bukkit.getScheduler().runTask(plugin, () -> {
            event.getPlayer().sendMessage(Component.text("Watch your language!", NamedTextColor.RED));
        });
    }
}
```

### 10. Folia-Safe Event Handling

```java
// On Folia: never assume single-threaded execution
// Always use entity.getScheduler() or RegionScheduler for Bukkit API calls

@EventHandler
public void onDamage(EntityDamageByEntityEvent event) {
    if (!(event.getEntity() instanceof Player victim)) return;

    // ✅ Folia-safe — uses entity's own scheduler
    victim.getScheduler().run(plugin, task -> {
        victim.sendMessage(Component.text("You took damage!", NamedTextColor.RED));
    }, null);

    // ❌ Folia-unsafe — assumes global main thread
    // victim.sendMessage(Component.text("You took damage!"));
}
```

### 11. Event Listener Lifecycle (Dynamic Registration)

```java
public class TemporaryListener implements Listener {
    private final JavaPlugin plugin;
    private boolean registered = false;

    public TemporaryListener(JavaPlugin plugin) { this.plugin = plugin; }

    public void enable() {
        if (!registered) {
            plugin.getServer().getPluginManager().registerEvents(this, plugin);
            registered = true;
        }
    }

    public void disable() {
        if (registered) {
            org.bukkit.event.HandlerList.unregisterAll(this);
            registered = false;
        }
    }
}

// Use for: minigame phases, temporary restrictions, event-based features
// NEVER register without a corresponding unregister path
```

## Critical Rules

1. **ALWAYS** set `ignoreCancelled = true` unless you specifically need cancelled events
2. **ALWAYS** `return` immediately after `event.setCancelled(true)`
3. **ALWAYS** check entity type with `instanceof` before casting
4. **NEVER** register listeners per-player — register once in onEnable(), use GUIManager for per-player routing
5. **NEVER** cancel or modify events at `MONITOR` priority — MONITOR is READ-ONLY
6. **ALWAYS** throttle `PlayerMoveEvent` — check block change, not every head rotation
7. **ALWAYS** cancel inventory clicks before processing GUI logic — prevent item theft/duplication
8. **NEVER** call most Bukkit API from AsyncPlayerChatEvent — it's async. Use runTask callback.
9. **ALWAYS** include BOTH `getHandlers()` AND static `getHandlerList()` in custom events
10. **For Folia**: use entity.getScheduler().run() for Bukkit API in event handlers
11. **ALWAYS** provide an unregister path for any dynamically registered listener
12. **KEEP LISTENERS THIN** — they detect events and delegate to managers. No database queries, no business logic

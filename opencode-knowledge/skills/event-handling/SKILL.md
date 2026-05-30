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

## Critical Rules

1. **ALWAYS** set `ignoreCancelled = true` unless you specifically need cancelled events
2. **ALWAYS** `return` immediately after `event.setCancelled(true)`
3. **ALWAYS** check entity type with `instanceof` before casting
4. **NEVER** register listeners per-player — register once in `onEnable()`
5. **NEVER** cancel events at `MONITOR` priority
6. **ALWAYS** throttle `PlayerMoveEvent` — check block change, not every movement
7. **ALWAYS** cancel inventory clicks before processing GUI logic

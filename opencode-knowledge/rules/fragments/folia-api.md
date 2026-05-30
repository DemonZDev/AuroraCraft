# Folia API Rules

## CRITICAL: Folia is NOT Paper

Folia uses regionized multithreading. **There is NO main thread.** Every region has its own tick thread.

## Mandatory plugin.yml Declaration

```yaml
folia-supported: true
```

**Without this, your plugin WILL NOT LOAD on Folia.**

## Scheduler Rules

### BukkitScheduler is BROKEN
**NEVER use BukkitScheduler on Folia:**

```java
// WRONG: BukkitScheduler (broken on Folia)
Bukkit.getScheduler().runTask(plugin, () -> {
    // This will crash or behave unpredictably
});

// CORRECT: Use appropriate Folia scheduler
```

### Use the Correct Scheduler

#### RegionScheduler (Location-Based Tasks)
```java
RegionScheduler scheduler = Bukkit.getRegionScheduler();

// Execute on region owning this location
scheduler.execute(plugin, location, () -> {
    location.getBlock().setType(Material.STONE);
});

// Delayed task
scheduler.runDelayed(plugin, location, (task) -> {
    // Runs after 20 ticks on appropriate region
}, 20L);

// Repeating task
scheduler.runAtFixedRate(plugin, location, (task) -> {
    // Runs every 100 ticks
}, 1L, 100L);
```

#### EntityScheduler (Entity-Based Tasks)
```java
EntityScheduler scheduler = entity.getScheduler();

// Execute on entity's region
scheduler.execute(plugin, () -> {
    entity.setHealth(entity.getHealth() + 2.0);
}, () -> {
    // Retired callback - entity was removed
}, 0L);
```

#### GlobalRegionScheduler (Server-Wide Tasks)
```java
GlobalRegionScheduler scheduler = Bukkit.getGlobalRegionScheduler();

// Execute on global region
scheduler.execute(plugin, () -> {
    Bukkit.getWorlds().get(0).setTime(0L);
});
```

#### AsyncScheduler (True Async)
```java
AsyncScheduler scheduler = Bukkit.getAsyncScheduler();

// Run async task
scheduler.runNow(plugin, (task) -> {
    performDatabaseQuery();
});
```

## Thread Ownership Checks

**ALWAYS verify thread ownership before accessing world data:**

```java
if (Bukkit.isOwnedByCurrentRegion(location)) {
    // Safe to modify blocks at this location
    location.getBlock().breakNaturally();
}

if (Bukkit.isOwnedByCurrentRegion(entity)) {
    // Safe to modify this entity
    entity.setVelocity(entity.getVelocity().multiply(2));
}
```

## Teleportation

**Synchronous teleport is REMOVED:**

```java
// WRONG: Synchronous teleport (removed)
player.teleport(location);

// CORRECT: Async teleport
player.teleportAsync(location).thenAccept(success -> {
    if (success) {
        player.sendMessage("Teleported!");
    }
});
```

## Broken APIs on Folia

These APIs are fundamentally incompatible with Folia:
- **Scoreboard API** - All scoreboard operations are broken
- **Portal/respawning** - May not work correctly
- **World loading/unloading** - Not yet implemented

## Migration Checklist

- [ ] Add `folia-supported: true` to plugin.yml
- [ ] Replace ALL BukkitScheduler calls
- [ ] Use appropriate scheduler (Region/Entity/Global/Async)
- [ ] Add thread ownership checks
- [ ] Replace synchronous teleport with teleportAsync
- [ ] Remove scoreboard usage
- [ ] Test in multi-region scenarios

## When to Use Each Scheduler

| Task Type | Scheduler |
|-----------|-----------|
| Modify blocks at location | RegionScheduler |
| Modify entity | EntityScheduler |
| Server-wide operations | GlobalRegionScheduler |
| Database/HTTP/File I/O | AsyncScheduler |
| Console commands | GlobalRegionScheduler |

## Critical Rules

1. **NEVER** use BukkitScheduler
2. **ALWAYS** check thread ownership before world access
3. **NEVER** use synchronous teleport
4. **ALWAYS** use teleportAsync
5. **NEVER** assume single-threaded execution
6. **ALWAYS** make shared data thread-safe

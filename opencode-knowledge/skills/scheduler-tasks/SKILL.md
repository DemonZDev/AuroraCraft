---
name: scheduler-tasks
description: Schedule repeating and delayed tasks with proper cancellation and lifecycle management
license: MIT
compatibility: opencode
metadata:
  category: tasks
  difficulty: beginner
---

# Scheduler Tasks Skill

## What I Do

Implement safe task scheduling patterns — repeating tasks, delayed tasks, per-player tasks, and proper cleanup.

## Implementation Pattern

### 1. Task Types Reference

```java
// Run NOW on main thread
Bukkit.getScheduler().runTask(plugin, () -> {
    player.teleport(spawn);
});

// Run LATER on main thread (e.g., after 5 seconds = 100 ticks)
Bukkit.getScheduler().runTaskLater(plugin, () -> {
    player.sendMessage("Teleportation complete!");
}, 100L); // 20 ticks = 1 second

// Run REPEATING on main thread
BukkitTask timer = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    updateScoreboard();
}, 0L, 20L); // Start now, repeat every 1 second

// Run NOW async (off main thread)
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    database.save(data);
});

// Run LATER async
Bukkit.getScheduler().runTaskLaterAsynchronously(plugin, () -> {
    sendDiscordWebhook(message);
}, 100L);
```

### 2. Task Storage and Cleanup (CRITICAL)

```java
public class TaskManager {

    private final MyPlugin plugin;
    private final List<BukkitTask> globalTasks = new ArrayList<>();
    private final Map<UUID, List<BukkitTask>> playerTasks = new HashMap<>();

    // Schedule a global repeating task — STORE the returned task
    public void startGlobalTasks() {
        BukkitTask scoreboardTask = Bukkit.getScheduler().runTaskTimer(plugin,
            this::updateAllScoreboards, 0L, 20L);
        globalTasks.add(scoreboardTask);

        BukkitTask autosaveTask = Bukkit.getScheduler().runTaskTimer(plugin,
            this::autoSaveAll, 1200L, 6000L); // Every 5 minutes
        globalTasks.add(autosaveTask);
    }

    // Per-player tasks — track by UUID
    public void startPlayerTasks(Player player) {
        UUID uuid = player.getUniqueId();
        List<BukkitTask> tasks = new ArrayList<>();

        BukkitTask actionBar = Bukkit.getScheduler().runTaskTimer(plugin,
            () -> player.sendActionBar(Component.text("Mode: " + getMode(player))),
            0L, 20L);
        tasks.add(actionBar);

        BukkitTask cooldown = Bukkit.getScheduler().runTaskLater(plugin,
            () -> endCooldown(player), 100L);
        tasks.add(cooldown);

        playerTasks.put(uuid, tasks);
    }

    // Cancel per-player tasks when they disconnect
    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        List<BukkitTask> tasks = playerTasks.remove(uuid);
        if (tasks != null) {
            tasks.forEach(BukkitTask::cancel);
        }
    }

    // Cancel ALL tasks in onDisable()
    public void shutdown() {
        globalTasks.forEach(BukkitTask::cancel);
        globalTasks.clear();

        playerTasks.values().forEach(tasks -> tasks.forEach(BukkitTask::cancel));
        playerTasks.clear();
    }
}
```

### 3. Common Repeating Task Patterns

```java
// Scoreboard update — every 1 second (don't run every tick)
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        updatePlayerScoreboard(player);
    }
}, 0L, 20L);

// Auto-save — every 5 minutes
Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, () -> {
    // Async — database writes
    playerDataManager.saveAll();
}, 6000L, 6000L);

// Cleanup — every 30 seconds
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    cleanupExpiredEntities();
    cleanupStaleData();
}, 600L, 600L);
```

### 4. BukkitRunnable Pattern

```java
public class CountdownTask extends BukkitRunnable {

    private final Player player;
    private int seconds = 10;

    public CountdownTask(Player player) {
        this.player = player;
    }

    @Override
    public void run() {
        if (!player.isOnline()) {
            cancel();
            return;
        }
        if (seconds <= 0) {
            player.sendMessage(Component.text("Go!", NamedTextColor.GREEN));
            teleport(player);
            cancel();
            return;
        }
        player.sendActionBar(Component.text("Teleporting in " + seconds + "...",
            NamedTextColor.YELLOW));
        seconds--;
    }
}

// Usage — runs every second
CountdownTask task = new CountdownTask(player);
task.runTaskTimer(plugin, 0L, 20L);
```

### 5. Debounce Pattern (Cancel and Reschedule)

```java
public class DebouncedTask {

    private final Plugin plugin;
    private final Map<UUID, BukkitTask> pending = new HashMap<>();

    public void debounce(Player player, Runnable action, long delayTicks) {
        UUID uuid = player.getUniqueId();
        // Cancel previous pending task
        BukkitTask previous = pending.remove(uuid);
        if (previous != null) previous.cancel();

        // Schedule new task
        BukkitTask task = Bukkit.getScheduler().runTaskLater(plugin, () -> {
            pending.remove(uuid);
            action.run();
        }, delayTicks);

        pending.put(uuid, task);
    }
}

// Usage: Save player data 2 seconds after last change
debouncer.debounce(player, () -> savePlayer(player), 40L);
```

### 6. Performance Tips

```java
// CORRECT: Use async for I/O operations
Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, () -> {
    // Database/HTTP/file operations — off main thread
    database.purgeOldData();
}, 0L, 6000L);

// WRONG: Repeating task every tick — expensive
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player p : Bukkit.getOnlinePlayers()) { // New collection every tick
        updateScoreboard(p);
    }
}, 0L, 1L); // Every tick — 20 times per second!

// BETTER: Every second is usually enough
Bukkit.getScheduler().runTaskTimer(plugin, updateTask, 0L, 20L);
```

## Critical Rules

1. **ALWAYS store BukkitTask references** — needed for cancellation
2. **Cancel ALL tasks in `onDisable()`** — otherwise they run after plugin unloads (memory leak)
3. **Cancel per-player tasks on quit** — don't let them accumulate
4. **Check `player.isOnline()` in repeating player tasks** — player may disconnect
5. **20 ticks = 1 second** — don't run visual updates every tick
6. **Use async for I/O** — database, HTTP, file operations
7. **Never call Bukkit API from async task callbacks** — use runTask() to switch back

### 7. Paper AsyncScheduler (Paper 1.20.4+)

```java
// Modern async API — cleaner than BukkitScheduler for async work
AsyncScheduler async = plugin.getServer().getAsyncScheduler();

// Run now (async thread)
async.runNow(plugin, task -> {
    database.save(data); // Async — safe
});

// Run delayed
async.runDelayed(plugin, task -> {
    database.purgeOldData();
}, 1, TimeUnit.MINUTES);

// Run repeating
CancellableTask repeating = async.runAtFixedRate(plugin, task -> {
    database.saveAll();
}, 5, 5, TimeUnit.MINUTES);
repeating.cancel(); // When done
```

### 8. Folia Schedulers (Regionized Threading)

**Folia does NOT have a single main thread. Each world region runs on its own thread.**

```java
// ❌ BREAKS ON FOLIA — BukkitScheduler not available
// Bukkit.getScheduler().runTask(plugin, () -> { ... });

// ✅ RegionScheduler — executes on the region owning a location
RegionScheduler region = Bukkit.getRegionScheduler();
region.execute(plugin, location, () -> {
    location.getBlock().setType(Material.STONE); // Safe — on region thread
});

// ✅ EntityScheduler — executes on the entity's owning region
entity.getScheduler().run(plugin, task -> {
    entity.setHealth(entity.getHealth() + 2.0);
}, () -> {
    // Retired callback — entity was removed
});

// ✅ GlobalRegionScheduler — server-wide operations
GlobalRegionScheduler global = Bukkit.getGlobalRegionScheduler();
global.execute(plugin, () -> {
    Bukkit.getWorlds().get(0).setTime(0L);
});

// ✅ AsyncScheduler — true async (works on both Paper and Folia)
AsyncScheduler async = Bukkit.getAsyncScheduler();
async.runNow(plugin, task -> { database.query(); });
```

**Folia Scheduler Decision Matrix:**

| Operation | Paper Scheduler | Folia Scheduler |
|-----------|----------------|-----------------|
| Modify blocks at location | `Bukkit.getScheduler().runTask()` | `Bukkit.getRegionScheduler().execute()` |
| Modify entity | `Bukkit.getScheduler().runTask()` | `entity.getScheduler().run()` |
| Server-wide operation | `Bukkit.getScheduler().runTask()` | `Bukkit.getGlobalRegionScheduler().execute()` |
| Database / HTTP / File I/O | `runTaskAsynchronously()` | `Bukkit.getAsyncScheduler().runNow()` |

**Cross-platform safe pattern:**
```java
public static void runOnEntity(Plugin plugin, Entity entity, Runnable task) {
    entity.getScheduler().run(plugin, scheduledTask -> task.run(), null);
}
// This works on both Paper (1.21+) AND Folia
```

### 9. Task Cancellation Lifecycle (Complete Pattern)

```java
public class TaskLifecycleManager {
    private final JavaPlugin plugin;
    private final List<CancellableTask> asyncTasks = new ArrayList<>();
    private final List<BukkitTask> syncTasks = new ArrayList<>();
    private final Map<UUID, List<BukkitTask>> playerTasks = new ConcurrentHashMap<>();

    // --- Global Tasks ---
    public void startAll() {
        // Paper AsyncScheduler for I/O work
        AsyncScheduler async = plugin.getServer().getAsyncScheduler();
        asyncTasks.add(async.runAtFixedRate(plugin,
            t -> autoSave(), 1, 5, TimeUnit.MINUTES));

        // Traditional scheduler for sync work
        syncTasks.add(Bukkit.getScheduler().runTaskTimer(plugin,
            this::updateScoreboards, 0L, 20L));
    }

    // --- Per-Player Tasks ---
    public void startForPlayer(Player player) {
        UUID uuid = player.getUniqueId();
        List<BukkitTask> tasks = new ArrayList<>();
        tasks.add(Bukkit.getScheduler().runTaskTimer(plugin,
            () -> updateActionBar(player), 0L, 20L));
        playerTasks.put(uuid, tasks);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        List<BukkitTask> tasks = playerTasks.remove(uuid);
        if (tasks != null) tasks.forEach(BukkitTask::cancel);
    }

    // --- Shutdown (REVERSE ORDER) ---
    public void shutdown() {
        // 1. Cancel per-player tasks first
        playerTasks.values().forEach(tasks -> tasks.forEach(BukkitTask::cancel));
        playerTasks.clear();

        // 2. Cancel global tasks
        syncTasks.forEach(BukkitTask::cancel);
        syncTasks.clear();
        asyncTasks.forEach(CancellableTask::cancel);
        asyncTasks.clear();
    }
}
```

### 10. Tick Timing Reference

| Duration | Ticks | Human |
|----------|-------|-------|
| 1 tick | 1 | 50ms |
| 1 second | 20 | — |
| 5 seconds | 100 | — |
| 30 seconds | 600 | — |
| 1 minute | 1200 | — |
| 5 minutes | 6000 | — |
| 30 minutes | 36000 | — |

## Task Scheduling Decision Tree

```
START: Need to run code later/repeatedly?
├── One-time delay? → runTaskLater() / runTaskLaterAsynchronously()
├── Repeating? → runTaskTimer() / runTaskTimerAsynchronously()
├── Async I/O? → Paper AsyncScheduler or CompletableFuture.supplyAsync()
├── Folia-compatible? → entity.getScheduler().run() / RegionScheduler
├── Per-player? → Map<UUID, List<BukkitTask>> + clean on quit
├── Global? → List<BukkitTask/CancellableTask> + cancel in onDisable()
└── Debounced? → Cancel previous pending task, schedule new delayed task
```

## Critical Rules

1. **ALWAYS store BukkitTask/CancellableTask references** — needed for cancellation
2. **Cancel ALL tasks in `onDisable()`** — otherwise they run after plugin unloads (memory leak)
3. **Cancel per-player tasks on quit** — don't let them accumulate for disconnected players
4. **Check `player.isOnline()` in repeating player tasks** — player may disconnect between iterations
5. **20 ticks = 1 second** — don't run expensive operations every tick (1L interval)
6. **Use async for ALL I/O** — database, HTTP, file operations never belong in sync tasks
7. **Never call Bukkit API from async task callbacks** — use runTask() to switch back
8. **For Folia compatibility**: use entity/location schedulers, not BukkitScheduler
9. **Debounce rapid changes**: cancel previous task before scheduling a new one
10. **Use Paper AsyncScheduler** for cleaner async API on Paper 1.20.4+

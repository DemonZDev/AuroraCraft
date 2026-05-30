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

## Task Scheduling Decision Tree

```
START: Need to run code later/repeatedly?
├── One-time delay? → runTaskLater() / runTaskLaterAsynchronously()
├── Repeating? → runTaskTimer() / runTaskTimerAsynchronously()
├── Just offload from event? → runTaskAsynchronously()
├── Per-player? → Map<UUID, List<BukkitTask>> + clean on quit
└── Global? → List<BukkitTask> + cancel in onDisable()
```

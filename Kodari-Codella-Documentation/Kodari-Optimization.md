# Minecraft Plugin Performance Optimization Handbook
## For Server Networks & AI-Assisted Development

**Version:** 1.0  
**Audience:** Plugin developers, server administrators, performance engineers  
**Environment:** BungeeCord networks, 100–200 concurrent players per node  

---

## Executive Summary

Every Minecraft server runs on a single main thread that must complete one full game tick every 50 milliseconds to maintain 20 TPS (ticks per second). When plugins consume more than their share of that 50ms budget, TPS drops. At 18 TPS players notice rubber-banding. At 15 TPS combat becomes unreliable. Below 12 TPS players leave and do not return.

On a network with five servers each hosting 150 players, a single poorly written plugin can cascade: one server's TPS drop triggers BungeeCord reconnects, flooding a second server, which then also drops. The economic cost is real — industry data consistently shows that server performance is the top reason players cite when leaving a network permanently.

**The three root causes of plugin-induced TPS loss:**

1. **Main thread blocking** — database queries, HTTP calls, or file I/O executed synchronously
2. **Event handler abuse** — unthrottled handlers on high-frequency events like `PlayerMoveEvent`
3. **Memory pressure** — excessive object allocation forcing frequent garbage collection pauses

AI-assisted development has made all three problems worse. Language models generate syntactically correct code that compiles and runs — but they optimize for correctness, not for the 50ms tick budget. A model that has never felt a TPS drop has no intuition for why `getOnlinePlayers()` inside a repeating task is dangerous at 200 players.

This handbook is the reference your team reaches for before merging any plugin. Every section includes the bad pattern, the good pattern, and the numbers that explain why it matters.

**Key metrics to internalize:**

| Metric | Target | Danger Zone | Critical |
|--------|--------|-------------|----------|
| TPS | 20.0 | < 18.0 | < 15.0 |
| MSPT | < 25ms | 35–45ms | > 50ms |
| Memory usage | < 70% heap | 80–90% | > 90% |
| GC pause (G1GC) | < 50ms | 100–200ms | > 500ms |
| Async queue depth | < 100 tasks | 500–1000 | > 1000 |

---

## 1. The Main Thread: Sacred Ground

The Bukkit/Spigot/Paper main thread is the heartbeat of your server. It processes one tick every 50ms. Everything that touches the world state — blocks, entities, inventories, players — must happen on this thread because the underlying data structures are not thread-safe. Calling Bukkit API from an async thread does not throw a compile error; it causes silent data corruption, `ConcurrentModificationException` crashes, and duplication bugs that are nearly impossible to reproduce.

### 1.1 What MUST Be Sync

The following operations **must** execute on the main thread. Calling them from async context is undefined behavior — it may work 99% of the time and corrupt data on the 100th call.

**World Mutations**
- `block.setType(Material)` — modifies chunk data
- `block.breakNaturally()` — triggers drops, updates neighbors
- `world.setBlockData(location, data)` — chunk write
- `world.spawnEntity(location, type)` — entity registry write
- `entity.remove()` — entity registry write
- `world.loadChunk(x, z)` — chunk loading is synchronous and can take 50–200ms
- `world.generateTree(location, type)` — multi-block world mutation

**Player State**
- `player.teleport(location)` — position update (use `teleportAsync()` on Paper for cross-world)
- `player.openInventory(inventory)` — sends packets, modifies player state
- `player.getInventory().setItem(slot, item)` — inventory write
- `player.sendTitle(title, subtitle)` — packet send
- `player.sendActionBar(message)` — packet send
- `player.addPotionEffect(effect)` — entity attribute write
- `player.setGameMode(mode)` — player state write
- `player.kickPlayer(reason)` — connection teardown

**Scoreboards & Display**
- `Bukkit.getScoreboardManager().getMainScoreboard()` — not thread-safe
- `scoreboard.registerNewObjective(...)` — scoreboard write
- `team.addEntry(name)` — scoreboard write
- `bossBar.addPlayer(player)` — display state write
- `bossBar.setProgress(value)` — display state write

**Chunk & Region Operations**
- Any `ChunkSnapshot` creation from a live chunk
- `RegionAccessor` writes
- `PersistentDataContainer` writes on entities/blocks

> **Warning:** Paper's `teleportAsync()` returns a `CompletableFuture<Boolean>`. It handles the cross-world chunk loading asynchronously but still finalizes the teleport on the main thread. It is safe to call from async context — but the callback you attach to the future runs on the main thread, so do not block inside it.

### 1.2 What CAN Be Async

These operations have no Bukkit API involvement and are safe — even beneficial — to run off the main thread:

**Database & Storage**
- All JDBC queries (SELECT, INSERT, UPDATE, DELETE)
- HikariCP connection acquisition
- Redis GET/SET operations
- File reads and writes (configs, logs, exports)
- YAML serialization/deserialization (before applying to Bukkit objects)

**Network**
- HTTP requests (Discord webhooks, REST APIs, UUID lookups)
- WebSocket communication
- BungeeCord plugin messaging (sending, not receiving Bukkit-side effects)

**Computation**
- Pathfinding calculations (before applying movement sync)
- Statistical aggregation (leaderboard sorting, economy calculations)
- String processing, regex matching
- Cryptographic operations (hashing passwords, tokens)
- JSON/NBT serialization
- UUID ↔ name resolution via Mojang API

**Safe Read-Only Bukkit Calls (with caveats)**
- `player.getName()`, `player.getUniqueId()` — safe, immutable
- `player.getLocation().clone()` — safe if you clone first
- `Bukkit.getOfflinePlayer(uuid)` — safe (does not touch world)

> **Warning:** `Bukkit.getOfflinePlayer(String name)` performs a **blocking disk read** to resolve the name. Never call it on the main thread with an unknown name. Cache the UUID→name mapping yourself.

### 1.3 The Scheduler Decision Tree

Before writing any scheduled or event-driven code, run through this decision tree:

```
START: Does this code need to run?
│
├─ Does it modify world state (blocks, entities, chunks)?
│   └─ YES → Bukkit.getScheduler().runTask(plugin, runnable)  [SYNC]
│
├─ Does it touch player inventory or open a GUI?
│   └─ YES → runTask() [SYNC]
│
├─ Does it teleport a player?
│   └─ YES → runTask() [SYNC] or player.teleportAsync() [PAPER]
│
├─ Does it send packets (title, actionbar, scoreboard)?
│   └─ YES → runTask() [SYNC]
│
├─ Is it a database query?
│   └─ YES → runTaskAsynchronously() [ASYNC]
│              └─ Callback that touches Bukkit API?
│                  └─ YES → runTask() inside the async callback [SYNC]
│
├─ Is it an HTTP request?
│   └─ YES → runTaskAsynchronously() [ASYNC]
│
├─ Is it file I/O?
│   └─ YES → runTaskAsynchronously() [ASYNC]
│
└─ Is it pure computation (math, sorting, serialization)?
    └─ YES → runTaskAsynchronously() [ASYNC]
```

**Correct async-to-sync callback pattern:**

```java
// BAD: Sync DB query blocking the main thread
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    // This blocks the main thread for 5-50ms on every join
    PlayerData data = database.loadPlayer(player.getUniqueId()); // BLOCKS
    player.sendMessage("Welcome back, " + data.getDisplayName());
}

// GOOD: Async query with sync callback
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();

    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        // Runs off main thread — safe for DB
        PlayerData data = database.loadPlayer(uuid);

        // Switch back to main thread for Bukkit API
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) { // Player may have disconnected
                player.sendMessage("Welcome back, " + data.getDisplayName());
                applyPlayerData(player, data);
            }
        });
    });
}
```

**CompletableFuture pattern (cleaner for chained operations):**

```java
CompletableFuture
    .supplyAsync(() -> database.loadPlayer(uuid), asyncExecutor)
    .thenAcceptAsync(data -> {
        // Still async — safe for more computation
        data.computeRankings();
    }, asyncExecutor)
    .thenAccept(ignored -> {
        // thenAccept without executor runs on the completing thread
        // Use runTask to guarantee main thread
        Bukkit.getScheduler().runTask(plugin, () -> applyToPlayer(player, data));
    });
```

### 1.4 Detecting Main Thread Blockers

**Runtime detection (add to your plugin's debug mode):**

```java
public static void assertMainThread(String context) {
    if (!Bukkit.isPrimaryThread()) {
        throw new IllegalStateException(
            "Bukkit API called from async thread in: " + context
        );
    }
}

public static void assertAsyncThread(String context) {
    if (Bukkit.isPrimaryThread()) {
        plugin.getLogger().warning(
            "Blocking operation on main thread in: " + context +
            " — this will cause TPS loss!"
        );
        // Log stack trace for identification
        Thread.dumpStack();
    }
}
```

**Spark profiler detection:** Run `/spark profiler --timeout 60` during peak load. Any method appearing in the main thread flame graph that contains `jdbc`, `http`, `socket`, `FileInputStream`, or `sleep` is a blocker.

**Timings detection:** `/timings report` — look for event handlers with average times > 1ms. Any handler averaging > 5ms is a critical issue.

---

## 2. Event Handler Performance

Event handlers are the most common source of TPS loss in AI-generated plugins. The model writes a handler, it works in testing with 5 players, and nobody notices the O(n) complexity until 150 players are online.

### 2.1 Event Frequency Ranking

Understanding how often events fire is the foundation of handler optimization. These are measured at 20 TPS with a player actively moving and interacting:

| Event | Fires Per Second (Active Player) | Fires Per Tick | Notes |
|-------|----------------------------------|----------------|-------|
| `PlayerMoveEvent` | 20–40 | 1–2 | Every position/look change |
| `PlayerAnimationEvent` | 10–20 | 0.5–1 | Every arm swing |
| `EntityAIEvent` (Paper) | 20 | 1 | Per entity per tick |
| `BlockPhysicsEvent` | Variable | 0–50+ | Cascades on redstone |
| `ChunkLoadEvent` | Variable | 0–5 | Player movement |
| `InventoryClickEvent` | 1–5 | < 1 | Player interaction |
| `PlayerChatEvent` | < 1 | < 1 | Rare |
| `PlayerJoinEvent` | < 1 | < 1 | Rare |
| `PlayerDeathEvent` | < 1 | < 1 | Rare |
| `EntityDamageEvent` | 1–4 | < 1 | Combat |

**At 150 players, all moving:**
- `PlayerMoveEvent`: 150 × 30 = **4,500 events/second = 225 events/tick**
- If your handler takes 0.1ms each: 225 × 0.1ms = **22.5ms per tick consumed** (45% of your budget)
- If your handler takes 0.5ms each: 225 × 0.5ms = **112.5ms per tick** — server is at ~8 TPS

### 2.2 The PlayerMoveEvent Problem

`PlayerMoveEvent` is the single most abused event in Minecraft plugin development. AI models reach for it instinctively for any "detect player position" requirement, without understanding its cost.

**How often does it actually fire?**

| Player State | Events/Second | Events/Tick |
|--------------|---------------|-------------|
| Standing still (looking around) | 20 | 1 |
| Walking | 20–30 | 1–1.5 |
| Sprinting | 30–40 | 1.5–2 |
| Riding horse | 20–40 | 1–2 |
| Riding boat | 20–30 | 1–1.5 |
| Flying (creative) | 40–60 | 2–3 |
| Elytra gliding | 40–80 | 2–4 |

> **Warning:** `PlayerMoveEvent` fires even when the player only **rotates their head** without moving their feet. A player standing still and looking around generates 20 events/second. This is the most common source of "why is my region check so slow" bugs.

**The bad pattern (AI-generated):**

```java
// BAD: Full region check on every move event
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Player player = event.getPlayer();
    Location loc = player.getLocation();
    
    // Iterates ALL regions every single event fire
    for (Region region : regionManager.getAllRegions()) {
        if (region.contains(loc)) {
            region.applyEffects(player);
        }
    }
}
```

**Strategy 1: Head-movement filter (most impactful single change)**

```java
@EventHandler
public void onMove(PlayerMoveEvent event) {
    // If only head rotated (yaw/pitch changed, XYZ same), skip entirely
    if (event.getFrom().getBlockX() == event.getTo().getBlockX() &&
        event.getFrom().getBlockY() == event.getTo().getBlockY() &&
        event.getFrom().getBlockZ() == event.getTo().getBlockZ()) {
        return; // Head rotation only — no position change
    }
    
    // Now process actual movement
    processMovement(event.getPlayer(), event.getTo());
}
```

This single filter eliminates ~60–70% of `PlayerMoveEvent` calls for players who are standing still or only looking around.

**Strategy 2: Tick-based throttling**

```java
private final Map<UUID, Long> lastMoveTick = new HashMap<>();

@EventHandler
public void onMove(PlayerMoveEvent event) {
    // Block-level filter first (cheapest check)
    if (event.getFrom().getBlockX() == event.getTo().getBlockX() &&
        event.getFrom().getBlockY() == event.getTo().getBlockY() &&
        event.getFrom().getBlockZ() == event.getTo().getBlockZ()) {
        return;
    }
    
    UUID uuid = event.getPlayer().getUniqueId();
    long currentTick = Bukkit.getCurrentTick();
    
    // Only process every 10 ticks (0.5 seconds)
    if (currentTick - lastMoveTick.getOrDefault(uuid, 0L) < 10) {
        return;
    }
    lastMoveTick.put(uuid, currentTick);
    
    processMovement(event.getPlayer(), event.getTo());
}
```

**Strategy 3: Distance threshold**

```java
private final Map<UUID, Location> lastProcessedLocation = new HashMap<>();

@EventHandler
public void onMove(PlayerMoveEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    Location to = event.getTo();
    Location lastProcessed = lastProcessedLocation.get(uuid);
    
    // Only process if moved more than 2 blocks since last check
    if (lastProcessed != null && 
        lastProcessed.getWorld().equals(to.getWorld()) &&
        lastProcessed.distanceSquared(to) < 4.0) { // 4.0 = 2 blocks squared
        return;
    }
    
    lastProcessedLocation.put(uuid, to.clone());
    processMovement(player, to);
}
```

Note: `distanceSquared()` is used instead of `distance()` to avoid the expensive `Math.sqrt()` call.

**Strategy 4: Scheduled task replacement (best for region checks)**

For use cases that don't need immediate response (region entry effects, not region entry cancellation):

```java
// Replace PlayerMoveEvent entirely with a repeating task
// Runs every 10 ticks (0.5 seconds) for all online players
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        checkPlayerRegion(player);
    }
}, 0L, 10L);
```

This processes 150 players every 10 ticks instead of 4,500 events per second.

**Benchmark comparison (150 players, simple region check):**

| Strategy | Events Processed/Tick | Handler Time/Tick | TPS Impact |
|----------|----------------------|-------------------|------------|
| Unthrottled | 225 | ~22ms | -4 TPS |
| Head-filter only | ~70 | ~7ms | -1 TPS |
| Head-filter + 10-tick throttle | ~15 | ~1.5ms | Negligible |
| Scheduled task (10t) | 150 (once per 10t) | ~0.15ms/tick avg | None |

### 2.3 Event Priority Strategy

Event priorities are not just about ordering — they are a performance tool. Handlers that cancel events should run at `LOWEST` priority so that subsequent handlers (which may be expensive) are skipped entirely when the event is cancelled.

```java
// GOOD: Cancellation check at LOWEST priority
// If this cancels, NORMAL/HIGH/HIGHEST handlers never run
@EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = false)
public void onDamagePreCheck(EntityDamageEvent event) {
    if (shouldCancelDamage(event)) {
        event.setCancelled(true);
    }
}

// This expensive handler only runs if the event wasn't cancelled above
@EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
public void onDamageProcess(EntityDamageEvent event) {
    processComplexDamageLogic(event); // Expensive — only runs when needed
}
```

**Priority guidelines:**

| Priority | Use Case |
|----------|----------|
| `LOWEST` | Permission checks, cancellation guards |
| `LOW` | Pre-processing, data loading |
| `NORMAL` | Default — most plugin logic |
| `HIGH` | Logic that depends on other plugins' NORMAL handlers |
| `HIGHEST` | Final state modifications |
| `MONITOR` | Read-only logging — NEVER modify event state here |

### 2.4 ignoreCancelled Performance

`@EventHandler(ignoreCancelled = true)` is not just a convenience — it is a performance directive. When set to `true`, Bukkit skips calling your handler entirely if the event is already cancelled. This is a free optimization for any handler that doesn't need to process cancelled events.

```java
// BAD: Processes cancelled events unnecessarily
@EventHandler
public void onBlockBreak(BlockBreakEvent event) {
    if (event.isCancelled()) return; // Manual check — handler was still called
    processBreak(event);
}

// GOOD: Handler never called for cancelled events
@EventHandler(ignoreCancelled = true)
public void onBlockBreak(BlockBreakEvent event) {
    processBreak(event); // No null check needed — guaranteed not cancelled
}
```

Always use `ignoreCancelled = true` unless your plugin specifically needs to react to cancelled events (e.g., an anti-cheat that monitors what other plugins cancelled).

### 2.5 Event Throttling Patterns

**Per-player cooldown map (general purpose):**

```java
public class EventThrottle {
    private final Map<UUID, Long> cooldowns = new HashMap<>();
    private final long cooldownMs;
    
    public EventThrottle(long cooldownMs) {
        this.cooldownMs = cooldownMs;
    }
    
    public boolean shouldProcess(UUID uuid) {
        long now = System.currentTimeMillis();
        Long last = cooldowns.get(uuid);
        if (last != null && now - last < cooldownMs) {
            return false;
        }
        cooldowns.put(uuid, now);
        return true;
    }
    
    public void cleanup(UUID uuid) {
        cooldowns.remove(uuid);
    }
}

// Usage
private final EventThrottle moveThrottle = new EventThrottle(500); // 500ms

@EventHandler
public void onMove(PlayerMoveEvent event) {
    if (!moveThrottle.shouldProcess(event.getPlayer().getUniqueId())) return;
    processMovement(event.getPlayer());
}
```

**Global rate limiter for expensive operations:**

```java
private long lastExpensiveOperation = 0;
private static final long EXPENSIVE_COOLDOWN_MS = 1000;

@EventHandler
public void onSomeFrequentEvent(SomeEvent event) {
    long now = System.currentTimeMillis();
    if (now - lastExpensiveOperation < EXPENSIVE_COOLDOWN_MS) return;
    lastExpensiveOperation = now;
    
    performExpensiveOperation();
}
```

---

## 3. Memory Management

Garbage collection pauses are the invisible TPS killer. When the JVM's G1GC collector runs a major collection, it can pause all threads — including the main thread — for 100–500ms. At 500ms, your server drops from 20 TPS to effectively 2 TPS for that moment. Players see a freeze.

The root cause is almost always excessive object allocation in hot paths. The GC has to collect what you allocate.

### 3.1 Object Allocation Hotspots

**Hotspot 1: Location objects in event handlers**

```java
// BAD: Creates a new Location object on every move event
// At 150 players: 4,500 Location objects/second → GC pressure
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Location loc = new Location(
        event.getPlayer().getWorld(),
        event.getTo().getX(),
        event.getTo().getY(),
        event.getTo().getZ()
    );
    checkRegion(loc);
}

// GOOD: Use the existing Location from the event — don't copy it
@EventHandler
public void onMove(PlayerMoveEvent event) {
    checkRegion(event.getTo()); // event.getTo() returns existing object
}

// GOOD: If you must store it, clone once and reuse
// For region checks, use block coordinates (int) instead of Location
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Location to = event.getTo();
    int bx = to.getBlockX();
    int by = to.getBlockY();
    int bz = to.getBlockZ();
    checkRegion(bx, by, bz); // No object allocation
}
```

**Memory impact:** At 150 players with unthrottled move events, this creates ~4,500 `Location` objects/second. Each `Location` is ~64 bytes. That's ~288KB/second of garbage — triggering minor GC every few seconds.

**Hotspot 2: String concatenation in loops**

```java
// BAD: Creates a new String object on every iteration
// StringBuilder is created implicitly by the compiler but discarded each time
String result = "";
for (Player player : Bukkit.getOnlinePlayers()) {
    result += player.getName() + ", "; // O(n²) — each += copies the whole string
}

// GOOD: StringBuilder with pre-allocated capacity
StringBuilder sb = new StringBuilder(players.size() * 16); // Estimate avg name length
for (Player player : Bukkit.getOnlinePlayers()) {
    sb.append(player.getName()).append(", ");
}
String result = sb.toString();

// GOOD: String.join for simple cases
String result = String.join(", ", 
    Bukkit.getOnlinePlayers().stream()
        .map(Player::getName)
        .collect(Collectors.toList())
);
```

**Hotspot 3: getOnlinePlayers() in repeating tasks**

```java
// BAD: getOnlinePlayers() creates a new Collection every call
// In a task running every tick with 150 players: 20 collections/second
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) { // New collection each tick
        updatePlayerDisplay(player);
    }
}, 0L, 1L);

// GOOD: Cache the collection reference if iterating multiple times
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    Collection<? extends Player> players = Bukkit.getOnlinePlayers(); // One call
    for (Player player : players) {
        updatePlayerDisplay(player);
    }
    // Use same 'players' reference for any other iteration in this tick
}, 0L, 1L);

// BETTER: Don't run every tick if you don't need to
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        updatePlayerDisplay(player);
    }
}, 0L, 20L); // Every second is usually sufficient for display updates
```

**Hotspot 4: ItemStack templates without caching**

```java
// BAD: Creates and configures a new ItemStack on every GUI open
// If 50 players open the shop simultaneously: 50 × (number of items) allocations
public ItemStack createShopItem() {
    ItemStack item = new ItemStack(Material.DIAMOND);
    ItemMeta meta = item.getItemMeta();
    meta.setDisplayName("§bDiamond");
    meta.setLore(Arrays.asList("§7Price: $100", "§7Click to buy"));
    item.setItemMeta(meta);
    return item;
}

// GOOD: Cache the template, clone only when needed
private ItemStack diamondTemplate;

public void initTemplates() {
    ItemStack item = new ItemStack(Material.DIAMOND);
    ItemMeta meta = item.getItemMeta();
    meta.setDisplayName("§bDiamond");
    meta.setLore(Arrays.asList("§7Price: $100", "§7Click to buy"));
    item.setItemMeta(meta);
    this.diamondTemplate = item;
}

public ItemStack createShopItem() {
    return diamondTemplate.clone(); // Clone is much cheaper than full construction
}
```

**Hotspot 5: Color code translation on every message**

```java
// BAD: Translates color codes on every send — string allocation + regex
public void sendWelcome(Player player) {
    player.sendMessage(ChatColor.translateAlternateColorCodes('&', 
        "&aWelcome to &b" + serverName + "&a!")); // Allocation every call
}

// GOOD: Pre-translate static strings at startup
private String welcomePrefix;

public void onEnable() {
    welcomePrefix = ChatColor.translateAlternateColorCodes('&', "&aWelcome to &b");
    // serverName is dynamic, so only translate the static parts
}

public void sendWelcome(Player player) {
    player.sendMessage(welcomePrefix + serverName + ChatColor.GREEN + "!");
}

// BEST: For fully static messages, translate once and store
private static final String WELCOME_MSG = 
    ChatColor.translateAlternateColorCodes('&', "&aWelcome to the server!");
```

**Hotspot 6: Auto-boxing in collections**

```java
// BAD: Map<String, Integer> boxes every int into Integer object
// At 150 players with kill tracking: 150 Integer objects, GC'd on update
Map<String, Integer> killCounts = new HashMap<>();
killCounts.put(player.getName(), killCounts.getOrDefault(player.getName(), 0) + 1);

// GOOD: Use primitive collections from Eclipse Collections or FastUtils
// (add 'eclipse-collections' or 'fastutil' to your dependencies)
import it.unimi.dsi.fastutil.objects.Object2IntOpenHashMap;

Object2IntOpenHashMap<String> killCounts = new Object2IntOpenHashMap<>();
killCounts.addTo(player.getName(), 1); // No boxing — pure int arithmetic

// For UUID keys (very common in plugins):
import it.unimi.dsi.fastutil.objects.Object2LongOpenHashMap;
Object2LongOpenHashMap<UUID> lastSeenMap = new Object2LongOpenHashMap<>();
lastSeenMap.put(player.getUniqueId(), System.currentTimeMillis()); // No Long boxing
```

**Hotspot 7: ArrayList without initial capacity**

```java
// BAD: ArrayList starts at capacity 10, doubles on overflow
// For known-size collections, this causes unnecessary array copies
List<String> names = new ArrayList<>(); // Capacity: 10
for (Player player : Bukkit.getOnlinePlayers()) { // 150 players
    names.add(player.getName()); // Resizes at 10, 20, 40, 80, 160 — 5 copies
}

// GOOD: Pre-size when you know the approximate count
int playerCount = Bukkit.getOnlinePlayers().size();
List<String> names = new ArrayList<>(playerCount); // Exact capacity, zero resizes
for (Player player : Bukkit.getOnlinePlayers()) {
    names.add(player.getName());
}
```

### 3.2 Collection Optimization

**Collection selection guide:**

| Collection | Use Case | Memory | Lookup Speed | Thread-Safe |
|------------|----------|--------|--------------|-------------|
| `HashMap<K,V>` | General key-value | Medium | O(1) avg | No |
| `LinkedHashMap<K,V>` | Ordered iteration | Medium+ | O(1) avg | No |
| `TreeMap<K,V>` | Sorted keys | Medium | O(log n) | No |
| `ConcurrentHashMap<K,V>` | Multi-thread access | Higher | O(1) avg | Yes |
| `Object2IntOpenHashMap` | Int values, no boxing | Lower | O(1) avg | No |
| `Int2ObjectOpenHashMap` | Int keys, no boxing | Lower | O(1) avg | No |
| `Long2ObjectOpenHashMap` | Long keys (timestamps) | Lower | O(1) avg | No |
| `HashSet<E>` | Unique membership | Medium | O(1) avg | No |
| `EnumMap<K,V>` | Enum keys | Lowest | O(1) | No |
| `EnumSet<E>` | Enum flags | Lowest | O(1) | No |

**When to use `ConcurrentHashMap` vs `HashMap`:**

```java
// Use HashMap when: only accessed from main thread (most plugin data)
private final Map<UUID, PlayerData> playerData = new HashMap<>();

// Use ConcurrentHashMap when: accessed from both async tasks AND main thread
// Example: async DB loader writes, main thread reads
private final Map<UUID, PlayerData> playerCache = new ConcurrentHashMap<>();

// WRONG: Using ConcurrentHashMap everywhere "to be safe"
// ConcurrentHashMap has ~3x the memory overhead and slower iteration
// Only use it when you actually have concurrent access
```

**Avoid `Collections.synchronizedMap()` — it locks the entire map on every operation. `ConcurrentHashMap` is almost always better.**

### 3.3 Caching Strategy

**The cache decision matrix:**

| Data Type | Cache? | TTL | Invalidation |
|-----------|--------|-----|--------------|
| Player display name | Yes | Session | On name change |
| Player permissions | Yes | Session | On permission change |
| Economy balance | Yes | 30s | On transaction |
| Region membership | Yes | Until move | On move event |
| Config values | Yes | Until reload | On `/reload` |
| Database query results | Yes | 60s | On write |
| Chunk data | No | — | Too large |
| Online player list | No | — | Changes too fast |

**Simple TTL cache implementation:**

```java
public class TTLCache<K, V> {
    private final Map<K, CacheEntry<V>> cache = new HashMap<>();
    private final long ttlMs;
    
    public TTLCache(long ttlMs) {
        this.ttlMs = ttlMs;
    }
    
    public V get(K key) {
        CacheEntry<V> entry = cache.get(key);
        if (entry == null) return null;
        if (System.currentTimeMillis() - entry.timestamp > ttlMs) {
            cache.remove(key);
            return null;
        }
        return entry.value;
    }
    
    public void put(K key, V value) {
        cache.put(key, new CacheEntry<>(value, System.currentTimeMillis()));
    }
    
    public void invalidate(K key) {
        cache.remove(key);
    }
    
    private static class CacheEntry<V> {
        final V value;
        final long timestamp;
        CacheEntry(V value, long timestamp) {
            this.value = value;
            this.timestamp = timestamp;
        }
    }
}
```

### 3.4 WeakReference Patterns

Use `WeakReference` for caches that should not prevent garbage collection of their values. This is particularly useful for caching data associated with `Player` objects — when a player disconnects, you want their data to be GC-eligible even if your cache still holds a reference.

```java
// BAD: Strong reference prevents GC of disconnected player data
private final Map<Player, PlayerData> cache = new HashMap<>();
// If you forget to remove on quit, Player object stays in memory forever

// GOOD: WeakReference allows GC when player disconnects
private final Map<UUID, WeakReference<PlayerData>> cache = new WeakHashMap<>();

public PlayerData getOrLoad(Player player) {
    WeakReference<PlayerData> ref = cache.get(player.getUniqueId());
    if (ref != null) {
        PlayerData data = ref.get();
        if (data != null) return data; // Cache hit
    }
    // Cache miss or GC'd — reload
    PlayerData data = loadFromDatabase(player.getUniqueId());
    cache.put(player.getUniqueId(), new WeakReference<>(data));
    return data;
}
```

> **Warning:** `WeakHashMap` uses the key as the weak reference, not the value. For `Map<Player, Data>`, use `WeakHashMap<Player, Data>` — the entry is removed when the `Player` object is GC'd. For `Map<UUID, Data>`, UUIDs are value objects and won't be GC'd, so use explicit `WeakReference<Data>` values instead.

### 3.5 String & Component Optimization

**Pre-compile patterns:**

```java
// BAD: Compiles regex on every call
public boolean isValidName(String name) {
    return name.matches("[a-zA-Z0-9_]{3,16}"); // Compiles Pattern every call
}

// GOOD: Compile once, reuse
private static final Pattern NAME_PATTERN = Pattern.compile("[a-zA-Z0-9_]{3,16}");

public boolean isValidName(String name) {
    return NAME_PATTERN.matcher(name).matches(); // Reuses compiled pattern
}
```

**String interning for repeated values:**

```java
// For strings that repeat frequently (world names, permission nodes)
// intern() returns the canonical instance from the string pool
String worldName = location.getWorld().getName().intern();
// Now worldName == "world" is true instead of needing .equals()
// Reduces memory for repeated strings
```

---

## 4. Database & Storage Performance

Database operations are the most common source of main-thread blocking in AI-generated plugins. A model that has never seen a production database under load will write synchronous queries without hesitation.

### 4.1 Connection Pool Tuning

HikariCP is the standard connection pool for Minecraft plugins. The default configuration is not optimized for the Minecraft use case.

**Recommended HikariCP configuration with explanations:**

```java
HikariConfig config = new HikariConfig();

// Core connection settings
config.setJdbcUrl("jdbc:mysql://localhost:3306/mydb?useSSL=false&autoReconnect=true");
config.setUsername("user");
config.setPassword("password");

// Pool size: For a Minecraft plugin, 2-5 connections is usually sufficient.
// More connections = more memory + more DB server load.
// Formula: connections = (core_count * 2) + effective_spindle_count
// For a shared DB server, start with 3 and increase only if you see queue waits.
config.setMaximumPoolSize(5);
config.setMinimumIdle(2); // Keep 2 connections warm at all times

// Timeout settings
config.setConnectionTimeout(5000);   // 5s: fail fast if DB is down
config.setIdleTimeout(300000);       // 5min: close idle connections
config.setMaxLifetime(600000);       // 10min: recycle connections (prevents stale)
config.setKeepaliveTime(60000);      // 1min: ping to prevent firewall drops

// Leak detection: Set to 2x your longest expected query time
// If a connection is held longer than this, HikariCP logs a warning with stack trace
config.setLeakDetectionThreshold(10000); // 10s

// Performance settings
config.addDataSourceProperty("cachePrepStmts", "true");
config.addDataSourceProperty("prepStmtCacheSize", "250");
config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
config.addDataSourceProperty("useServerPrepStmts", "true");

HikariDataSource dataSource = new HikariDataSource(config);
```

**Why these numbers:**
- `maximumPoolSize(5)`: Each MySQL connection uses ~8MB on the server. 5 connections = 40MB. More than 10 connections for a single plugin is almost never justified.
- `connectionTimeout(5000)`: If your DB is unreachable, fail in 5 seconds rather than blocking the async thread indefinitely.
- `leakDetectionThreshold(10000)`: Catches connections that weren't closed (common in exception paths).

### 4.2 Query Optimization

**Index strategy:**

```sql
-- BAD: No index on frequently queried column
SELECT * FROM player_data WHERE uuid = ?;
-- Full table scan: O(n) where n = total players

-- GOOD: Index on uuid
CREATE INDEX idx_player_uuid ON player_data(uuid);
-- Index lookup: O(log n) — 1000x faster at scale

-- For leaderboards (ORDER BY + LIMIT):
CREATE INDEX idx_player_balance ON economy(balance DESC);
SELECT uuid, balance FROM economy ORDER BY balance DESC LIMIT 10;
-- Without index: sorts entire table. With index: reads first 10 entries.

-- Composite index for multi-column WHERE:
CREATE INDEX idx_player_server ON player_data(server_id, uuid);
SELECT * FROM player_data WHERE server_id = ? AND uuid = ?;
```

**Query patterns:**

```java
// BAD: N+1 query problem — one query per player
for (Player player : Bukkit.getOnlinePlayers()) {
    int balance = database.getBalance(player.getUniqueId()); // 150 queries!
    updateDisplay(player, balance);
}

// GOOD: Single query for all players
Set<UUID> onlineUUIDs = Bukkit.getOnlinePlayers().stream()
    .map(Player::getUniqueId)
    .collect(Collectors.toSet());
Map<UUID, Integer> balances = database.getBalances(onlineUUIDs); // 1 query

// SQL for batch fetch:
// SELECT uuid, balance FROM economy WHERE uuid IN (?, ?, ?, ...)
// Build the IN clause dynamically based on player count
```

### 4.3 Batch Operations

**Batch INSERT performance:**

```java
// BAD: 1000 individual inserts
for (LogEntry entry : entries) {
    try (PreparedStatement stmt = conn.prepareStatement(
            "INSERT INTO logs (uuid, action, timestamp) VALUES (?, ?, ?)")) {
        stmt.setString(1, entry.getUuid().toString());
        stmt.setString(2, entry.getAction());
        stmt.setLong(3, entry.getTimestamp());
        stmt.executeUpdate(); // 1000 round-trips to DB
    }
}
// Time: ~500ms for 1000 rows (network latency × 1000)

// GOOD: Batch insert
try (PreparedStatement stmt = conn.prepareStatement(
        "INSERT INTO logs (uuid, action, timestamp) VALUES (?, ?, ?)")) {
    for (LogEntry entry : entries) {
        stmt.setString(1, entry.getUuid().toString());
        stmt.setString(2, entry.getAction());
        stmt.setLong(3, entry.getTimestamp());
        stmt.addBatch(); // Queue the operation
    }
    stmt.executeBatch(); // 1 round-trip to DB
}
// Time: ~5ms for 1000 rows — 100x faster
```

**Queue-and-flush pattern for high-frequency writes:**

```java
public class AsyncWriteQueue {
    private final Queue<LogEntry> queue = new ConcurrentLinkedQueue<>();
    private final DataSource dataSource;
    
    public AsyncWriteQueue(Plugin plugin, DataSource dataSource) {
        this.dataSource = dataSource;
        // Flush every 5 seconds
        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::flush, 100L, 100L);
    }
    
    public void enqueue(LogEntry entry) {
        queue.offer(entry); // Thread-safe, non-blocking
    }
    
    private void flush() {
        if (queue.isEmpty()) return;
        
        List<LogEntry> batch = new ArrayList<>();
        LogEntry entry;
        while ((entry = queue.poll()) != null) {
            batch.add(entry);
        }
        
        // Batch insert all queued entries
        writeBatch(batch);
    }
    
    public void shutdown() {
        flush(); // Ensure all pending writes complete on shutdown
    }
}
```

### 4.4 Async Query Patterns

**The complete async pattern with error handling:**

```java
public void loadPlayerDataAsync(Player player, Consumer<PlayerData> callback) {
    UUID uuid = player.getUniqueId();
    
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        PlayerData data = null;
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT * FROM player_data WHERE uuid = ?")) {
            
            stmt.setString(1, uuid.toString());
            ResultSet rs = stmt.executeQuery();
            
            if (rs.next()) {
                data = PlayerData.fromResultSet(rs);
            } else {
                data = PlayerData.createDefault(uuid);
            }
            
        } catch (SQLException e) {
            plugin.getLogger().severe("Failed to load player data for " + uuid + ": " + e.getMessage());
            data = PlayerData.createDefault(uuid); // Fallback to prevent broken state
        }
        
        final PlayerData finalData = data;
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) { // Check — player may have disconnected during query
                callback.accept(finalData);
            }
        });
    });
}
```

### 4.5 Storage Backend Selection

**Decision matrix:**

| Data Type | Recommended Backend | Reason | Estimated Size |
|-----------|--------------------|---------|--------------  |
| Player settings/preferences | SQLite | Local, no server needed, fast for single-server | ~1KB/player |
| Economy balances | MySQL/MariaDB | Cross-server sync via BungeeCord | ~100B/record |
| Chat logs | Append-only flat file | No queries needed, sequential write | ~1MB/day/server |
| Player statistics | MySQL | Aggregate queries (SUM, AVG, ORDER BY) | ~10KB/player |
| Serialized inventories | Base64 in YAML or DB BLOB | Bukkit serialization format | ~5KB/snapshot |
| Session cache | In-memory HashMap | Sub-millisecond access, cleared on restart | ~100KB total |
| Cross-server cache | Redis | Shared memory, pub/sub, TTL support | Variable |
| Config data | YAML file | Human-readable, plugin standard | ~10KB |
| Leaderboards | MySQL + in-memory cache | DB for persistence, cache for display | ~1KB/entry |

**SQLite vs MySQL decision:**

```
Single server, < 10,000 players → SQLite
  - No server to manage
  - File-based, easy backup
  - Sufficient for most plugins

Multi-server network, shared data → MySQL/MariaDB
  - Cross-server consistency
  - Better concurrent write performance
  - Requires connection pool (HikariCP)

High-frequency reads, cross-server → Redis
  - Sub-millisecond reads
  - Built-in TTL/expiry
  - Pub/sub for real-time sync
  - Requires Redis server
```

---

## 5. World & Entity Management

World operations are among the most expensive operations in Minecraft. Chunk loading, entity spawning, and block manipulation all have costs that compound at scale.

### 5.1 Chunk Loading Strategy

**The chunk loading trap:**

```java
// BAD: loadChunk() is SYNCHRONOUS and can take 50-200ms
// Calling this on the main thread freezes the server
@EventHandler
public void onCommand(PlayerCommandPreprocessEvent event) {
    if (event.getMessage().startsWith("/goto")) {
        Location target = parseLocation(event.getMessage());
        target.getWorld().loadChunk(target.getChunk()); // BLOCKS for up to 200ms
        event.getPlayer().teleport(target);
    }
}

// GOOD: Use Paper's async chunk loading
@EventHandler
public void onCommand(PlayerCommandPreprocessEvent event) {
    if (event.getMessage().startsWith("/goto")) {
        Location target = parseLocation(event.getMessage());
        Player player = event.getPlayer();
        
        // Paper API: loads chunk async, teleports on main thread when ready
        player.teleportAsync(target).thenAccept(success -> {
            if (success) {
                player.sendMessage("Teleported!");
            }
        });
    }
}
```

**Chunk pre-loading for known destinations (spawn, warps):**

```java
// Pre-load spawn chunks on startup — not during player teleport
@Override
public void onEnable() {
    Location spawn = getServer().getWorlds().get(0).getSpawnLocation();
    int spawnChunkX = spawn.getBlockX() >> 4;
    int spawnChunkZ = spawn.getBlockZ() >> 4;
    
    // Load a 3x3 area around spawn asynchronously at startup
    for (int dx = -1; dx <= 1; dx++) {
        for (int dz = -1; dz <= 1; dz++) {
            final int cx = spawnChunkX + dx;
            final int cz = spawnChunkZ + dz;
            spawn.getWorld().getChunkAtAsync(cx, cz).thenAccept(chunk -> {
                // Chunk is now loaded and cached
            });
        }
    }
}
```

**Never use `isChunkLoaded()` as a guard for world operations:**

```java
// BAD: If chunk isn't loaded, you skip the operation silently
if (world.isChunkLoaded(x, z)) {
    world.getBlockAt(x * 16, y, z * 16).setType(Material.AIR);
}

// GOOD: Load the chunk if needed, or use async loading
world.getChunkAtAsync(x, z).thenAccept(chunk -> {
    Bukkit.getScheduler().runTask(plugin, () -> {
        world.getBlockAt(x * 16, y, z * 16).setType(Material.AIR);
    });
});
```

### 5.2 Entity Limits & Cleanup

**Entity count impact on TPS:**

Each entity in a loaded chunk costs CPU every tick for AI processing, collision detection, and network updates. The relationship is roughly linear: doubling entities roughly doubles entity-related tick time.

| Entity Count (per server) | Typical TPS Impact |
|--------------------------|-------------------|
| < 500 | Negligible |
| 500–1000 | -0.5 to -1 TPS |
| 1000–2000 | -1 to -3 TPS |
| 2000–5000 | -3 to -8 TPS |
| > 5000 | Server may not sustain 20 TPS |

**Entity cleanup pattern:**

```java
// Schedule periodic cleanup of stale entities
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (World world : Bukkit.getWorlds()) {
        for (Entity entity : world.getEntities()) {
            if (shouldRemove(entity)) {
                entity.remove();
            }
        }
    }
}, 0L, 20L * 60); // Every minute

private boolean shouldRemove(Entity entity) {
    // Remove dropped items older than 5 minutes
    if (entity instanceof Item item) {
        return item.getTicksLived() > 20 * 60 * 5;
    }
    // Remove ArmorStands with no metadata (orphaned from plugins)
    if (entity instanceof ArmorStand stand) {
        return !stand.getPersistentDataContainer().has(pluginKey, PersistentDataType.STRING);
    }
    return false;
}
```

**Track your own spawned entities:**

```java
// BAD: Spawn entities and forget — they accumulate forever
world.spawnEntity(location, EntityType.ARMOR_STAND);

// GOOD: Track and clean up
private final Set<UUID> managedEntities = new HashSet<>();

public ArmorStand spawnManagedStand(Location location) {
    ArmorStand stand = (ArmorStand) world.spawnEntity(location, EntityType.ARMOR_STAND);
    managedEntities.add(stand.getUniqueId());
    return stand;
}

@Override
public void onDisable() {
    // Clean up all managed entities on shutdown
    for (UUID uuid : managedEntities) {
        Entity entity = Bukkit.getEntity(uuid);
        if (entity != null) entity.remove();
    }
    managedEntities.clear();
}
```

### 5.3 Block Operation Batching

**Single block operations vs batch:**

```java
// BAD: Setting 1000 blocks one at a time
// Each setType() call triggers lighting updates, physics, neighbor notifications
for (int x = 0; x < 10; x++) {
    for (int y = 0; y < 10; y++) {
        for (int z = 0; z < 10; z++) {
            world.getBlockAt(originX + x, originY + y, originZ + z)
                 .setType(Material.STONE); // 1000 individual updates
        }
    }
}

// GOOD: Use BlockState batch with applyPhysics=false
List<BlockState> states = new ArrayList<>(1000);
for (int x = 0; x < 10; x++) {
    for (int y = 0; y < 10; y++) {
        for (int z = 0; z < 10; z++) {
            BlockState state = world.getBlockAt(originX + x, originY + y, originZ + z).getState();
            state.setType(Material.STONE);
            states.add(state);
        }
    }
}
// Apply all at once — suppresses intermediate physics
states.forEach(state -> state.update(true, false)); // force=true, applyPhysics=false

// BEST for large operations: Use Paper's async world editing or WorldEdit API
```

**The `applyPhysics` parameter:**

```java
block.setType(material);                    // Triggers physics (sand falls, water flows)
block.setType(material, false);             // No physics — faster, use for bulk ops
blockState.update(true, false);             // force=true, applyPhysics=false
```

### 5.4 Particle & Effect Limits

**Particle cost model:**

Particles are sent as packets to all players within range. The cost scales with:
- Number of particles spawned
- Number of players in range
- Particle type (some are heavier than others)

```java
// BAD: Spawning 100 particles every tick for all players
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        Location loc = player.getLocation();
        // 100 particles × 150 players = 15,000 particle packets/tick
        for (int i = 0; i < 100; i++) {
            loc.getWorld().spawnParticle(Particle.FLAME, loc, 1);
        }
    }
}, 0L, 1L);

// GOOD: Throttle and limit range
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        Location loc = player.getLocation();
        // 10 particles every 5 ticks, only sent to nearby players
        loc.getWorld().spawnParticle(
            Particle.FLAME, loc, 10,
            0.5, 0.5, 0.5, 0.01 // spread
        );
    }
}, 0L, 5L); // Every 5 ticks instead of every tick

// BEST: Send particles only to players who can see them
public void spawnParticlesForNearby(Location loc, Particle particle, int count) {
    for (Player player : loc.getWorld().getPlayers()) {
        if (player.getLocation().distanceSquared(loc) < 2500) { // 50 block radius
            player.spawnParticle(particle, loc, count);
        }
    }
}
```

**Sound effect limits:**

```java
// BAD: Playing sounds to all online players
Bukkit.getOnlinePlayers().forEach(p -> 
    p.playSound(p.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.0f));

// GOOD: Play at location (Minecraft handles range automatically)
world.playSound(location, Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.0f);
// Only players within 16 blocks hear it — no manual range check needed
```

---

## 6. Network & Packet Optimization

Every visual update you send to players — scoreboard lines, boss bars, titles, action bars — is a network packet. At 150 players, a scoreboard update every tick is 150 packets × 20 ticks = 3,000 packets/second just for that one feature.

### 6.1 Scoreboard Optimization

**The scoreboard update problem:**

```java
// BAD: Updating scoreboard every tick for all players
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        updateScoreboard(player); // Sends multiple packets per player per tick
    }
}, 0L, 1L);

// GOOD: Update only when data changes
public void onBalanceChange(Player player, double newBalance) {
    // Only update the scoreboard when the balance actually changes
    updateScoreboardBalance(player, newBalance);
}

// GOOD: Throttle to maximum update rate
private final Map<UUID, Long> lastScoreboardUpdate = new HashMap<>();

public void updateScoreboardIfNeeded(Player player) {
    long now = System.currentTimeMillis();
    UUID uuid = player.getUniqueId();
    if (now - lastScoreboardUpdate.getOrDefault(uuid, 0L) < 500) return; // Max 2/sec
    lastScoreboardUpdate.put(uuid, now);
    updateScoreboard(player);
}
```

**Scoreboard line update optimization:**

```java
// BAD: Recreating the entire scoreboard on every update
public void updateScoreboard(Player player) {
    Scoreboard board = Bukkit.getScoreboardManager().getNewScoreboard(); // New board!
    Objective obj = board.registerNewObjective("stats", "dummy", "§6Stats");
    // ... set all lines ...
    player.setScoreboard(board); // Sends full scoreboard packet
}

// GOOD: Update only changed lines using team name tricks
// Create the scoreboard once, update only the lines that changed
public void updateScoreboardLine(Player player, int line, String newValue) {
    Scoreboard board = player.getScoreboard();
    String teamName = "line_" + line;
    Team team = board.getTeam(teamName);
    if (team == null) return;
    
    String currentPrefix = team.getPrefix();
    if (currentPrefix.equals(newValue)) return; // No change — skip packet
    
    team.setPrefix(newValue); // Only sends update packet if value changed
}
```

### 6.2 Boss Bar Management

**Boss bar packet cost:**

Each boss bar update sends a packet to every player who has that bar. Creating/destroying boss bars also sends packets.

```java
// BAD: Creating a new boss bar for every player on every update
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        BossBar bar = Bukkit.createBossBar("Health: " + player.getHealth(), 
            BarColor.RED, BarStyle.SOLID);
        bar.addPlayer(player);
        // Old bar is never removed — memory leak!
    }
}, 0L, 20L);

// GOOD: Create once per player, update in place
private final Map<UUID, BossBar> playerBars = new HashMap<>();

public void createBossBar(Player player) {
    BossBar bar = Bukkit.createBossBar("", BarColor.RED, BarStyle.SOLID);
    bar.addPlayer(player);
    playerBars.put(player.getUniqueId(), bar);
}

public void updateBossBar(Player player) {
    BossBar bar = playerBars.get(player.getUniqueId());
    if (bar == null) return;
    
    double health = player.getHealth();
    double maxHealth = player.getAttribute(Attribute.GENERIC_MAX_HEALTH).getValue();
    String newTitle = "§c❤ " + String.format("%.1f", health) + " / " + (int)maxHealth;
    
    if (!bar.getTitle().equals(newTitle)) { // Only send packet if changed
        bar.setTitle(newTitle);
        bar.setProgress(health / maxHealth);
    }
}

@EventHandler
public void onQuit(PlayerQuitEvent event) {
    BossBar bar = playerBars.remove(event.getPlayer().getUniqueId());
    if (bar != null) bar.removeAll(); // Clean up
}
```

### 6.3 Title/ActionBar Throttling

**ActionBar spam:**

```java
// BAD: Sending action bar every tick
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        player.sendActionBar("§aCoins: " + getCoins(player)); // 20 packets/sec/player
    }
}, 0L, 1L);

// GOOD: Send every 2 seconds (action bar persists for ~3 seconds)
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        player.sendActionBar("§aCoins: " + getCoins(player));
    }
}, 0L, 40L); // Every 2 seconds — still appears persistent to players

// BEST: Only update when value changes
public void onCoinsChange(Player player, int newCoins) {
    player.sendActionBar("§aCoins: " + newCoins);
    // Schedule a refresh in 2.5 seconds to keep it visible
    Bukkit.getScheduler().runTaskLater(plugin, () -> {
        if (player.isOnline()) {
            player.sendActionBar("§aCoins: " + getCoins(player));
        }
    }, 50L);
}
```

### 6.4 ProtocolLib Usage

ProtocolLib allows intercepting and sending raw packets. Use it only when the Bukkit API is insufficient — it adds complexity and version-specific fragility.

**When ProtocolLib is justified:**
- Custom packet injection (fake entities, custom block states)
- Intercepting packets before they reach the client
- Features that require packet-level control (tab list manipulation, custom sounds)

**When ProtocolLib is NOT justified:**
- Sending titles, action bars, scoreboards (Bukkit API handles these)
- Teleporting players (use `teleportAsync()`)
- Any operation with a Bukkit API equivalent

**ProtocolLib performance considerations:**

```java
// BAD: Packet listener that processes every packet
protocolManager.addPacketListener(new PacketAdapter(plugin, 
        ListenerPriority.NORMAL, PacketType.Play.Server.CHAT) {
    @Override
    public void onPacketSending(PacketEvent event) {
        // This runs for EVERY chat packet to EVERY player
        processEveryPacket(event); // Expensive!
    }
});

// GOOD: Filter early, process minimally
protocolManager.addPacketListener(new PacketAdapter(plugin,
        ListenerPriority.NORMAL, PacketType.Play.Server.CHAT) {
    @Override
    public void onPacketSending(PacketEvent event) {
        // Check cheapest condition first
        if (!event.getPlayer().hasPermission("myplugin.filter")) return;
        
        // Only process if this is a relevant packet type
        String message = event.getPacket().getStrings().read(0);
        if (!message.contains(FILTER_KEYWORD)) return;
        
        processFilteredPacket(event, message);
    }
});
```

---

## 7. Profiling & Diagnostics

You cannot optimize what you cannot measure. These tools give you concrete data about where your server's tick time is going.

### 7.1 Built-in Tools (Timings, Spark)

**Spark (recommended — more detailed than Timings):**

```
# Install: drop spark.jar in plugins/
# Profile for 60 seconds during peak load:
/spark profiler --timeout 60

# View results: spark uploads to spark.lucko.me automatically
# Look for:
# - Main thread flame graph: any method > 5% of tick time is a target
# - "Minecraft" → "Tick" → your plugin name
# - Methods containing "jdbc", "http", "sleep" on main thread = critical bugs
```

**Timings (built into Paper):**

```
/timings reset          # Clear existing data
# Wait 5-10 minutes during peak load
/timings report         # Generates report URL

# Key metrics to check:
# - "Full Server Tick" average: should be < 50ms
# - Per-plugin breakdown: any plugin > 5ms average is suspicious
# - Event handler breakdown: any handler > 1ms average needs optimization
```

**Spark memory profiling:**

```
/spark heapsummary      # Quick heap overview
/spark heapdump         # Full heap dump (use with VisualVM/Eclipse MAT)

# Warning signs in heapsummary:
# - Large number of Location objects (unthrottled move events)
# - Large number of String objects (concatenation in loops)
# - Plugin-specific objects that should have been GC'd (memory leaks)
```

### 7.2 JVM Flags

**Recommended JVM flags for a Minecraft server (Java 17+):**

```bash
java \
  -Xms6G -Xmx6G \
  -XX:+UseG1GC \
  -XX:+ParallelRefProcEnabled \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UnlockExperimentalVMOptions \
  -XX:+DisableExplicitGC \
  -XX:+AlwaysPreTouch \
  -XX:G1NewSizePercent=30 \
  -XX:G1MaxNewSizePercent=40 \
  -XX:G1HeapRegionSize=8M \
  -XX:G1ReservePercent=20 \
  -XX:G1HeapWastePercent=5 \
  -XX:G1MixedGCCountTarget=4 \
  -XX:InitiatingHeapOccupancyPercent=15 \
  -XX:G1MixedGCLiveThresholdPercent=90 \
  -XX:G1RSetUpdatingPauseTimePercent=5 \
  -XX:SurvivorRatio=32 \
  -XX:+PerfDisableSharedMem \
  -XX:MaxTenuringThreshold=1 \
  -Dusing.aikars.flags=https://mcflags.emc.gs \
  -jar server.jar nogui
```

**Key flags explained:**

| Flag | Purpose |
|------|---------|
| `-Xms` = `-Xmx` | Pre-allocate all heap — prevents resize pauses |
| `-XX:+UseG1GC` | G1 collector — better pause control than default |
| `-XX:MaxGCPauseMillis=200` | Target max GC pause (G1 tries to stay under this) |
| `-XX:+DisableExplicitGC` | Prevents `System.gc()` calls from triggering full GC |
| `-XX:+AlwaysPreTouch` | Pre-fault all memory pages at startup — prevents runtime faults |
| `-XX:InitiatingHeapOccupancyPercent=15` | Start GC earlier — prevents large pauses at high occupancy |

**GC log analysis:**

```bash
# Add to JVM flags to enable GC logging:
-Xlog:gc*:file=gc.log:time,uptime:filecount=5,filesize=10m

# Analyze with GCEasy (https://gceasy.io) or:
grep "Pause" gc.log | awk '{print $NF}' | sort -n | tail -20
# Shows your 20 longest GC pauses
```

### 7.3 Plugin Self-Monitoring

**Built-in performance monitoring for your plugin:**

```java
public class PerformanceMonitor {
    private final Map<String, LongSummaryStatistics> stats = new ConcurrentHashMap<>();
    private final boolean enabled;
    
    public PerformanceMonitor(boolean enabled) {
        this.enabled = enabled;
    }
    
    public void record(String operation, long nanos) {
        if (!enabled) return;
        stats.computeIfAbsent(operation, k -> new LongSummaryStatistics())
             .accept(nanos);
    }
    
    public <T> T time(String operation, Supplier<T> supplier) {
        if (!enabled) return supplier.get();
        long start = System.nanoTime();
        T result = supplier.get();
        record(operation, System.nanoTime() - start);
        return result;
    }
    
    public void printReport(CommandSender sender) {
        stats.forEach((op, stat) -> {
            sender.sendMessage(String.format(
                "§e%s§7: avg=§a%.2fms§7, max=§c%.2fms§7, count=§b%d",
                op,
                stat.getAverage() / 1_000_000.0,
                (double) stat.getMax() / 1_000_000.0,
                stat.getCount()
            ));
        });
    }
}

// Usage in event handler:
@EventHandler
public void onMove(PlayerMoveEvent event) {
    monitor.time("PlayerMoveEvent", () -> {
        processMovement(event.getPlayer(), event.getTo());
        return null;
    });
}
```

### 7.4 Performance Budgets

**Per-operation time budgets:**

| Operation | Max Sync Time | Frequency | Total Tick Budget |
|-----------|--------------|-----------|-------------------|
| `PlayerJoinEvent` handler | < 5ms | Per join | 5ms |
| `PlayerQuitEvent` handler | < 2ms | Per quit | 2ms |
| `PlayerMoveEvent` handler | < 0.1ms | 225/tick (150 players) | 22.5ms |
| `PlayerChatEvent` handler | < 2ms | Rare | 2ms |
| `EntityDamageEvent` handler | < 1ms | Per hit | 1ms |
| `BlockBreakEvent` handler | < 2ms | Per break | 2ms |
| Command handler | < 10ms | Per command | 10ms |
| Repeating task (every tick) | < 1ms | 1/tick | 1ms |
| Repeating task (every 20t) | < 5ms | 1/20t | 0.25ms avg |
| Database query (async) | < 50ms | Per query | N/A (async) |
| Config save | Async only | Per change | 0ms sync |
| Chunk load | Async only | On demand | 0ms sync |
| Scoreboard update | < 0.5ms | Per update | Variable |

**MSPT budget allocation (50ms total per tick):**

```
Minecraft server core:     ~10ms  (20%)
World tick (entities, AI): ~15ms  (30%)
Plugin budget:             ~20ms  (40%)
Safety margin:              ~5ms  (10%)
                           ------
Total:                      50ms  (100%)

Plugin budget breakdown (20ms):
  - Event handlers:         ~10ms
  - Repeating tasks:         ~5ms
  - Scheduled callbacks:     ~3ms
  - Miscellaneous:           ~2ms
```

If your plugins collectively consume more than 20ms of the tick, TPS will drop below 20.

---

## 8. Common AI-Generated Performance Killers

This section documents the ten most common performance anti-patterns produced by AI code generation tools. For each pattern, we show the generated code, its measured impact, the fix, and the prompt addition that prevents it.

### 8.1 Sync Database Queries

**The AI-generated code:**

```java
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    // AI generates this without hesitation
    String rank = database.query("SELECT rank FROM players WHERE uuid=?", 
                                  player.getUniqueId().toString());
    player.sendMessage("Your rank: " + rank);
}
```

**Performance impact:**
- Each query takes 5–50ms on a local DB, 20–200ms on a remote DB
- With 10 players joining simultaneously: 10 × 50ms = 500ms of main thread blocking
- Server drops to ~2 TPS during join bursts
- All other players experience rubber-banding during the join wave

**The fix:**

```java
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        String rank = database.query("SELECT rank FROM players WHERE uuid=?", 
                                      uuid.toString());
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) {
                player.sendMessage("Your rank: " + rank);
            }
        });
    });
}
```

> **AI Prompt Tip:** Add to your prompt: *"All database queries must be executed asynchronously using Bukkit's async scheduler. Never call database methods on the main thread. Always switch back to the main thread before calling any Bukkit API after an async operation."*

### 8.2 Unthrottled Event Handlers

**The AI-generated code:**

```java
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Player player = event.getPlayer();
    // AI doesn't consider this fires 20-40 times per second per player
    for (Region region : plugin.getRegionManager().getRegions()) {
        if (region.contains(player.getLocation())) {
            region.applyEffects(player);
            break;
        }
    }
}
```

**Performance impact:**
- 150 players × 30 events/sec = 4,500 handler calls/second
- Each call iterates all regions (say 50): 225,000 region checks/second
- At 0.01ms per check: 2,250ms of processing per second — server is at 0.4 TPS

**The fix:**

```java
@EventHandler
public void onMove(PlayerMoveEvent event) {
    // Filter head-only rotation
    if (event.getFrom().getBlockX() == event.getTo().getBlockX() &&
        event.getFrom().getBlockY() == event.getTo().getBlockY() &&
        event.getFrom().getBlockZ() == event.getTo().getBlockZ()) return;
    
    UUID uuid = event.getPlayer().getUniqueId();
    long tick = Bukkit.getCurrentTick();
    if (tick - lastMoveTick.getOrDefault(uuid, 0L) < 10) return;
    lastMoveTick.put(uuid, tick);
    
    Player player = event.getPlayer();
    plugin.getRegionManager().getRegionAt(player.getLocation())
          .ifPresent(region -> region.applyEffects(player));
}
```

> **AI Prompt Tip:** Add: *"PlayerMoveEvent fires 20-40 times per second per player. Any handler for this event must: (1) filter head-only rotation by comparing block coordinates, (2) throttle to at most once per 10 ticks per player using a tick counter map."*

### 8.3 Memory Leaks from Unreleased References

**The AI-generated code:**

```java
// AI creates a listener but never removes entries on player quit
public class CooldownManager implements Listener {
    private final Map<UUID, Long> cooldowns = new HashMap<>();
    
    @EventHandler
    public void onPlayerUseAbility(PlayerInteractEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        cooldowns.put(uuid, System.currentTimeMillis());
        // No PlayerQuitEvent handler — map grows forever
    }
}
```

**Performance impact:**
- Map grows by 1 entry per unique player who ever joins
- After 10,000 unique players: ~10,000 entries × ~50 bytes = ~500KB
- More critically: `UUID` objects and `Long` objects are never GC'd
- On servers with high player turnover: map can reach millions of entries

**The fix:**

```java
public class CooldownManager implements Listener {
    private final Map<UUID, Long> cooldowns = new HashMap<>();
    
    @EventHandler
    public void onPlayerUseAbility(PlayerInteractEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        cooldowns.put(uuid, System.currentTimeMillis());
    }
    
    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        cooldowns.remove(event.getPlayer().getUniqueId()); // Always clean up
    }
    
    // Also clean up on plugin disable
    public void cleanup() {
        cooldowns.clear();
    }
}
```

> **AI Prompt Tip:** Add: *"Every Map or Set that stores player data (keyed by UUID or Player) MUST have a corresponding PlayerQuitEvent handler that removes the entry. Failure to do this causes a memory leak. Also add a cleanup() method called from onDisable()."*

### 8.4 Inefficient Collections

**The AI-generated code:**

```java
// AI uses List for membership checks — O(n) lookup
private final List<UUID> vanishedPlayers = new ArrayList<>();

public boolean isVanished(Player player) {
    return vanishedPlayers.contains(player.getUniqueId()); // O(n) scan!
}

// With 150 players, called every tick: 150 × O(n) = O(n²) per tick
```

**Performance impact:**
- `List.contains()` is O(n) — scans every element
- At 150 players with 20 vanished: 150 checks × 20 comparisons = 3,000 UUID comparisons/call
- Called every tick: 60,000 UUID comparisons/second for this one check

**The fix:**

```java
// HashSet for membership checks — O(1) lookup
private final Set<UUID> vanishedPlayers = new HashSet<>();

public boolean isVanished(Player player) {
    return vanishedPlayers.contains(player.getUniqueId()); // O(1) hash lookup
}
```

> **AI Prompt Tip:** Add: *"Use HashSet (not ArrayList or LinkedList) for any collection where you need to check membership with .contains(). Use HashMap (not List of pairs) for any key-value lookups. Never use List.contains() in a hot path."*

### 8.5 Missing Caches

**The AI-generated code:**

```java
// AI queries the database on every balance check
public double getBalance(Player player) {
    return database.query("SELECT balance FROM economy WHERE uuid=?",
                           player.getUniqueId().toString()); // DB hit every call!
}

// Called from scoreboard update every 2 seconds × 150 players = 75 DB queries/second
```

**Performance impact:**
- 75 DB queries/second saturates a typical MySQL server
- Each query takes 5–20ms async — but the queue backs up
- Async thread pool fills up, tasks start queuing
- Eventually, async tasks start running on the main thread as fallback

**The fix:**

```java
private final Map<UUID, Double> balanceCache = new ConcurrentHashMap<>();
private final Map<UUID, Long> cacheTimestamps = new ConcurrentHashMap<>();
private static final long CACHE_TTL_MS = 30_000; // 30 seconds

public double getBalance(Player player) {
    UUID uuid = player.getUniqueId();
    Long timestamp = cacheTimestamps.get(uuid);
    
    if (timestamp != null && System.currentTimeMillis() - timestamp < CACHE_TTL_MS) {
        return balanceCache.getOrDefault(uuid, 0.0); // Cache hit — no DB
    }
    
    // Cache miss — load async, return cached value for now
    refreshBalanceAsync(uuid);
    return balanceCache.getOrDefault(uuid, 0.0);
}

private void refreshBalanceAsync(UUID uuid) {
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        double balance = database.queryBalance(uuid);
        balanceCache.put(uuid, balance);
        cacheTimestamps.put(uuid, System.currentTimeMillis());
    });
}
```

> **AI Prompt Tip:** Add: *"Any data that is read more than once per second must be cached in memory with a TTL. Never query the database synchronously. For player data, load on join, cache in a HashMap, and invalidate on change."*

### 8.6 Repeating Tasks Without Cancel

**The AI-generated code:**

```java
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    // AI creates a task per player but never cancels it
    Bukkit.getScheduler().runTaskTimer(plugin, () -> {
        if (player.isOnline()) {
            updatePlayerHUD(player);
        }
        // Task runs forever even after player disconnects
    }, 0L, 20L);
}
```

**Performance impact:**
- Each join creates a new task that runs forever
- After 1000 player joins (normal for a busy server over a day): 1000 active tasks
- Each task checks `isOnline()` and does nothing — but the scheduler still calls it
- Scheduler overhead: ~0.01ms per task × 1000 tasks = 10ms/tick wasted

**The fix:**

```java
private final Map<UUID, BukkitTask> playerTasks = new HashMap<>();

@EventHandler
public void onJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    
    BukkitTask task = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
        updatePlayerHUD(player);
    }, 0L, 20L);
    
    playerTasks.put(uuid, task);
}

@EventHandler
public void onQuit(PlayerQuitEvent event) {
    BukkitTask task = playerTasks.remove(event.getPlayer().getUniqueId());
    if (task != null) task.cancel(); // Always cancel on quit
}
```

> **AI Prompt Tip:** Add: *"Any BukkitTask created per-player MUST be stored and cancelled in a PlayerQuitEvent handler. Store tasks in a Map<UUID, BukkitTask> and call task.cancel() on quit. Never create per-player tasks without a corresponding cleanup."*

### 8.7 saveConfig() on Every Command

**The AI-generated code:**

```java
@EventHandler
public void onCommand(PlayerCommandPreprocessEvent event) {
    if (event.getMessage().startsWith("/setspawn")) {
        config.set("spawn", event.getPlayer().getLocation());
        plugin.saveConfig(); // Synchronous disk write!
    }
}
```

**Performance impact:**
- `saveConfig()` writes the entire YAML file to disk synchronously
- On a server with a large config: 5–50ms of disk I/O on the main thread
- If players spam the command: repeated 50ms freezes

**The fix:**

```java
@EventHandler
public void onCommand(PlayerCommandPreprocessEvent event) {
    if (event.getMessage().startsWith("/setspawn")) {
        config.set("spawn", event.getPlayer().getLocation());
        // Save async — disk I/O off the main thread
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            plugin.saveConfig();
        });
    }
}
```

> **AI Prompt Tip:** Add: *"plugin.saveConfig() and plugin.reloadConfig() perform synchronous disk I/O. Always wrap saveConfig() in an async scheduler task. Never call it directly in an event handler or command handler."*

### 8.8 Scoreboard Update Every Tick

**The AI-generated code:**

```java
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        // Sends 3-10 packets per player per tick
        updateFullScoreboard(player);
    }
}, 0L, 1L); // Every tick!
```

**Performance impact:**
- 150 players × 5 packets × 20 ticks = 15,000 packets/second
- Network bandwidth: ~15,000 × 100 bytes = 1.5MB/second just for scoreboards
- Client-side: scoreboard flickers, causes visual artifacts
- Server-side: packet serialization takes ~0.1ms × 150 = 15ms/tick

**The fix:**

```java
// Update every 2 seconds — players don't notice the difference
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        updateScoreboardChangedLines(player); // Only send changed lines
    }
}, 0L, 40L); // Every 2 seconds

// For time-sensitive values (health, combat), update on change events
@EventHandler
public void onHealthChange(EntityRegainHealthEvent event) {
    if (event.getEntity() instanceof Player player) {
        updateScoreboardLine(player, HEALTH_LINE, formatHealth(player));
    }
}
```

> **AI Prompt Tip:** Add: *"Scoreboard updates send multiple network packets. Never update scoreboards every tick. Update at most every 2 seconds (40 ticks) for passive data. For dynamic data (health, combat), update only on the relevant event, not on a timer."*

### 8.9 Chunk Load on Command

**The AI-generated code:**

```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (cmd.getName().equals("goto")) {
        Location target = parseWarp(args[0]);
        // AI doesn't know loadChunk() can take 200ms
        target.getWorld().loadChunk(target.getChunk()); // BLOCKS for 200ms
        ((Player) sender).teleport(target);
        return true;
    }
    return false;
}
```

**Performance impact:**
- `loadChunk()` reads from disk: 50–200ms on an SSD, 200–500ms on HDD
- Blocks the main thread for the entire duration
- All 150 players experience a freeze when any player uses `/goto`
- If 5 players use it simultaneously: 5 × 200ms = 1 second of freezes

**The fix:**

```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (cmd.getName().equals("goto") && sender instanceof Player player) {
        Location target = parseWarp(args[0]);
        player.sendMessage("§aTeleporting...");
        
        // Paper's teleportAsync handles chunk loading asynchronously
        player.teleportAsync(target).thenAccept(success -> {
            if (success) {
                player.sendMessage("§aTeleported to " + args[0] + "!");
            } else {
                player.sendMessage("§cTeleport failed.");
            }
        });
        return true;
    }
    return false;
}
```

> **AI Prompt Tip:** Add: *"Never call world.loadChunk() synchronously. Use player.teleportAsync(location) (Paper API) which handles chunk loading asynchronously. If you must load a chunk without teleporting, use world.getChunkAtAsync(x, z) which returns a CompletableFuture."*

### 8.10 getOnlinePlayers() Every Tick

**The AI-generated code:**

```java
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    // Called 20 times per second
    int count = Bukkit.getOnlinePlayers().size(); // Creates new collection
    if (count > lastCount) {
        broadcastJoinMessage(count);
    }
    lastCount = count;
}, 0L, 1L);
```

**Performance impact:**
- `getOnlinePlayers()` creates a new `Collection` snapshot every call
- At 20 calls/second: 20 collection allocations/second → GC pressure
- The collection itself is O(n) to create — at 150 players, that's 150 object references copied

**The fix:**

```java
// Cache the count, update only when it changes
private int cachedPlayerCount = 0;

// Update count on join/quit events instead of polling
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    int newCount = Bukkit.getOnlinePlayers().size();
    if (newCount != cachedPlayerCount) {
        cachedPlayerCount = newCount;
        // React to count change here
    }
}

@EventHandler  
public void onQuit(PlayerQuitEvent event) {
    // Note: player is still online during PlayerQuitEvent
    // Use Bukkit.getOnlinePlayers().size() - 1 for the post-quit count
    cachedPlayerCount = Bukkit.getOnlinePlayers().size() - 1;
}
```

> **AI Prompt Tip:** Add: *"Bukkit.getOnlinePlayers() creates a new Collection on every call. Never call it inside a repeating task that runs every tick. Cache the player count and update it in PlayerJoinEvent and PlayerQuitEvent handlers instead."*

---

## Appendix A: Performance Budget Reference

**Maximum acceptable times for every common operation:**

| Operation | Max Sync Time | Notes |
|-----------|--------------|-------|
| `PlayerJoinEvent` total handler time | 5ms | Includes all plugins |
| `PlayerQuitEvent` total handler time | 2ms | Includes all plugins |
| `PlayerMoveEvent` single handler | 0.1ms | Must be throttled |
| `PlayerChatEvent` single handler | 2ms | Rare event |
| `EntityDamageEvent` single handler | 1ms | Can be frequent in combat |
| `BlockBreakEvent` single handler | 2ms | Per break |
| `InventoryClickEvent` single handler | 1ms | Per click |
| Command handler (any command) | 10ms | Includes response |
| Repeating task (every tick, 1t) | 1ms | Strict budget |
| Repeating task (every second, 20t) | 5ms | 0.25ms amortized |
| Repeating task (every minute, 1200t) | 50ms | 0.04ms amortized |
| Scoreboard update (per player) | 0.5ms | Max 2/second |
| Boss bar update (per player) | 0.2ms | On change only |
| Title send (per player) | 0.1ms | On demand |
| Action bar send (per player) | 0.1ms | Max 1/2 seconds |
| Config read (in-memory) | 0.01ms | Already loaded |
| Config save (async) | N/A | Must be async |
| Database query (async) | 50ms | Async — no sync budget |
| HTTP request (async) | 500ms | Async — no sync budget |
| File I/O (async) | 100ms | Async — no sync budget |
| Chunk load (async) | 200ms | Async — no sync budget |
| Entity spawn | 1ms | Includes packet send |
| Block setType (single) | 0.1ms | With physics |
| Block setType (single, no physics) | 0.02ms | Bulk operations |
| Particle spawn (per player) | 0.05ms | Limit range |
| Sound play (at location) | 0.02ms | Server handles range |

**Total plugin budget per tick: 20ms**

If your plugin's handlers + tasks exceed 20ms combined, TPS will drop. Profile with Spark to see your actual consumption.

---

## Appendix B: AI Prompt Performance Checklist

Copy and paste this block into any AI prompt when requesting Minecraft plugin code. These 30 points prevent the most common AI-generated performance issues.

```
PERFORMANCE REQUIREMENTS — apply to all generated code:

THREADING:
1. All database queries must use Bukkit's async scheduler (runTaskAsynchronously)
2. All HTTP requests must be async
3. All file I/O (including saveConfig()) must be async
4. After any async operation, switch back to main thread with runTask() before calling Bukkit API
5. Never call Bukkit API (player.teleport, inventory operations, world changes) from async context
6. Use player.teleportAsync() (Paper) instead of world.loadChunk() + player.teleport()

EVENT HANDLERS:
7. PlayerMoveEvent handlers must filter head-only rotation (compare block X/Y/Z)
8. PlayerMoveEvent handlers must throttle to at most once per 10 ticks per player
9. Use @EventHandler(ignoreCancelled = true) unless the handler specifically needs cancelled events
10. Cancellation checks should use EventPriority.LOWEST
11. Never perform database queries inside any event handler synchronously

MEMORY:
12. Every Map/Set storing player data must have a PlayerQuitEvent cleanup handler
13. Every per-player BukkitTask must be stored and cancelled in PlayerQuitEvent
14. Use HashSet for membership checks, not ArrayList
15. Use HashMap for key-value lookups, not List of pairs
16. Pre-size ArrayList when the approximate size is known
17. Cache static message strings after color translation — don't translate on every send
18. Use StringBuilder for string concatenation in loops

COLLECTIONS:
19. Use ConcurrentHashMap only when data is accessed from both async and sync contexts
20. Do not use Collections.synchronizedMap() — use ConcurrentHashMap instead
21. For int/long values in maps, note that Java boxes primitives (acceptable for most cases)

SCHEDULING:
22. Do not run repeating tasks every tick (1L) unless absolutely necessary
23. Scoreboard updates: maximum once every 40 ticks (2 seconds)
24. Action bar updates: maximum once every 40 ticks (2 seconds)
25. Particle effects: maximum once every 5 ticks, limit to nearby players only

DATABASE:
26. Use HikariCP connection pooling with maximumPoolSize of 3-5
27. Use PreparedStatements, never string-concatenated SQL
28. Batch multiple inserts using addBatch()/executeBatch()
29. Cache frequently-read data with a TTL (30-60 seconds for economy data)

GENERAL:
30. Never call Bukkit.getOnlinePlayers() inside a task that runs every tick — cache the count
```

---

## Appendix C: Quick Fixes Guide

**The most common issues and their one-line fixes:**

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| TPS drops on player join | Sync DB query in `PlayerJoinEvent` | Wrap DB call in `runTaskAsynchronously` |
| TPS drops when players move | Unthrottled `PlayerMoveEvent` | Add block-coordinate filter + 10-tick throttle |
| Memory grows over time | No `PlayerQuitEvent` cleanup | Add `map.remove(uuid)` in quit handler |
| Server freezes for 200ms randomly | `world.loadChunk()` on main thread | Replace with `player.teleportAsync()` |
| TPS drops during join bursts | Multiple sync DB queries per join | Pre-load data async, cache in memory |
| Scoreboard flickers | Scoreboard recreated every tick | Create once, update changed lines only |
| Memory leak from tasks | Per-player tasks never cancelled | Store in `Map<UUID, BukkitTask>`, cancel on quit |
| DB connection exhaustion | No connection pool | Add HikariCP with `maximumPoolSize(5)` |
| GC pauses every few seconds | Location objects in move handler | Use block coordinates (int) instead |
| TPS drops on command use | `saveConfig()` in command handler | Wrap in `runTaskAsynchronously` |
| Async crash / data corruption | Bukkit API called from async thread | Add `runTask()` callback before Bukkit calls |
| Leaderboard query every display | No cache for leaderboard data | Cache result, refresh every 60 seconds async |
| Entity count grows unbounded | Spawned entities never removed | Track in Set, remove in `onDisable()` |
| Particle effects lag nearby players | Particles sent to all players | Filter by `distanceSquared() < 2500` (50 blocks) |
| String GC pressure in hot path | `+` concatenation in loop | Replace with `StringBuilder` |
| `ConcurrentModificationException` | Modifying collection during iteration | Use `Iterator.remove()` or copy before iterating |
| `NullPointerException` on async callback | Player disconnected during async op | Check `player.isOnline()` before Bukkit API calls |
| High CPU from scheduler | Too many active tasks | Audit with `/spark profiler`, cancel unused tasks |
| Slow region checks | `List.contains()` for membership | Replace `List` with `HashSet` |
| Config not saving on crash | Async save never completes | Call `flush()` in `onDisable()` before returning |

---

*Handbook version 1.0 — Compiled for high-concurrency BungeeCord networks.*  
*Profile first. Optimize what the data shows. Measure again.*
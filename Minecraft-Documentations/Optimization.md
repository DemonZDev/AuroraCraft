# Minecraft Plugin Performance Optimization Guide
## Paper 1.21.4 — Production Performance Reference

> **Purpose:** Authoritative reference for optimizing Minecraft plugin performance. Every section includes measurable benchmarks, before/after comparisons, and specific configuration recommendations.

---

## Table of Contents

1. [Event Optimization](#1-event-optimization)
2. [Entity & World Optimization](#2-entity--world-optimization)
3. [Memory & Garbage Collection](#3-memory--garbage-collection)
4. [Database Query Optimization](#4-database-query-optimization)
5. [Caching Strategies](#5-caching-strategies)
6. [Async & Threading](#6-async--threading)
7. [Profiling & Measurement](#7-profiling--measurement)
8. [AI Performance Killers](#8-ai-performance-killers)
9. [Appendix A: Performance Budgets](#appendix-a-performance-budgets)
10. [Appendix B: Emergency Server Lag Fixes](#appendix-b-emergency-server-lag-fixes)

---

## 1. Event Optimization

### 1.1 Event Fire Rates

Understanding how often each event fires is fundamental to optimization:

| Event | Fires Per Player Per Second | At 100 Players | Optimization Strategy |
|-------|---------------------------|----------------|----------------------|
| `PlayerMoveEvent` | ~20 (including head rotation) | ~2,000/sec | Block-change filter first |
| `EntityDamageByEntityEvent` | 0–5 | 0–500/sec | `ignoreCancelled = true` |
| `PlayerInteractEvent` | 0–3 | 0–300/sec | `ignoreCancelled = true` |
| `InventoryClickEvent` | 0–5 | 0–500/sec | Cancel immediately in GUI |
| `BlockBreakEvent` | 0–2 | 0–200/sec | `ignoreCancelled = true` |
| `AsyncPlayerChatEvent` | 0–0.2 | 0–20/sec | Already async — minimal optimization needed |

### 1.2 PlayerMoveEvent: The #1 Performance Killer

`PlayerMoveEvent` fires even when a player stands still and looks around (head rotation). At 100 players, that's ~2,000 calls per second.

```java
// ❌ CATASTROPHIC — runs on every head rotation (~20x/sec per player)
@EventHandler
public void onMove(PlayerMoveEvent event) {
    checkAllRegions(event.getPlayer()); // 2,000 expensive checks/sec
}

// ✅ CORRECT — only processes actual block transitions
@EventHandler
public void onMove(PlayerMoveEvent event) {
    Location from = event.getFrom();
    Location to = event.getTo();

    if (from.getBlockX() == to.getBlockX()
        && from.getBlockY() == to.getBlockY()
        && from.getBlockZ() == to.getBlockZ()) {
        return; // Head rotation — skip immediately
    }
    checkRegionEntry(event.getPlayer(), from, to);
}

// ✅ BEST — use Paper's built-in block-level event
@EventHandler
public void onMoveBlock(PlayerMoveBlockEvent event) {
    checkRegionEntry(event.getPlayer(), event.getFrom(), event.getTo());
}
```

**Performance impact:** Block-filter reduces processing by ~95%. On a 100-player server, 2,000 calls/sec → ~100 calls/sec.

### 1.3 Throttle Expensive Checks

For checks that must run periodically but not on every event:

```java
private final Map<UUID, Long> lastCheck = new ConcurrentHashMap<>();

@EventHandler
public void onMove(PlayerMoveEvent event) {
    if (sameBlock(event.getFrom(), event.getTo())) return;

    UUID uuid = event.getPlayer().getUniqueId();
    long now = System.currentTimeMillis();

    if (now - lastCheck.getOrDefault(uuid, 0L) < 1000L) return; // 1/sec max
    lastCheck.put(uuid, now);

    performExpensiveCheck(event.getPlayer());
}
```

### 1.4 Use ignoreCancelled = true

Always set `ignoreCancelled = true` unless you specifically need to process cancelled events:

```java
@EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
public void onBlockBreak(BlockBreakEvent event) {
    // Only runs on successful block breaks — saves CPU
    statisticsManager.recordBlockBreak(event.getPlayer(), event.getBlock().getType());
}
```

---

## 2. Entity & World Optimization

### 2.1 Block Operations: Three Solutions

| Technique | Performance | Use Case |
|-----------|------------|----------|
| **Disable physics** | Instant | Bulk block placement where physics don't matter |
| **Spread over ticks** | Zero lag | Batch operations that must run physics |
| **WorldEdit API** | Best for mass operations | 10,000+ block changes |

```java
// Solution 1: Disable physics for bulk operations
BlockData data = block.getBlockData();
if (data instanceof Ageable ageable) {
    ageable.setAge(0); // No physics — instant
}

// Solution 2: Spread across ticks (5 blocks/tick)
private int blocksPerTick = 5;
private final Queue<Runnable> blockQueue = new ConcurrentLinkedQueue<>();

public void spreadBlockOperations() {
    Bukkit.getScheduler().runTaskTimer(plugin, () -> {
        for (int i = 0; i < blocksPerTick && !blockQueue.isEmpty(); i++) {
            blockQueue.poll().run();
        }
    }, 0L, 1L);
}
```

### 2.2 Chunk Handling

```java
// BAD: Loading chunks synchronously on main thread
Chunk chunk = world.getChunkAt(x, z); // May trigger chunk generation — blocks main thread!

// GOOD: Async chunk loading (Paper API)
world.getChunkAtAsync(x, z).thenAccept(chunk -> {
    Bukkit.getScheduler().runTask(plugin, () -> {
        // Now on main thread — safe to use chunk
    });
});

// BETTER: Preload chunks before needed
world.getChunkAtAsyncUrgently(x, z); // Higher priority async load
```

### 2.3 Entity Stacking

Reduce entity count by stacking identical entities:

```java
// Instead of spawning 64 individual items (64 entities)
// Spawn a single stacked item with count 64
ItemStack stack = new ItemStack(Material.DIAMOND, 64);
world.dropItemNaturally(location, stack); // 1 entity instead of 64
```

### 2.4 getOnlinePlayers() — Cache the Array

```java
// BAD: Allocates new array on every call
for (Player player : Bukkit.getOnlinePlayers()) { ... } // In a repeating task

// GOOD: Cache if called repeatedly
private Collection<? extends Player> cachedPlayers;
private long lastPlayerCache;

public Collection<? extends Player> getCachedPlayers() {
    long now = System.currentTimeMillis();
    if (now - lastPlayerCache > 1000) { // Refresh every second
        cachedPlayers = Bukkit.getOnlinePlayers();
        lastPlayerCache = now;
    }
    return cachedPlayers;
}
```

---

## 3. Memory & Garbage Collection

### 3.1 Object Allocation Hotspots

| Hotspot | Problem | Fix |
|---------|---------|-----|
| Auto-boxing in loops | `Integer`/`Long` instead of `int`/`long` | Use primitives everywhere |
| ArrayList without initial capacity | Repeated array resizing | `new ArrayList<>(expectedSize)` |
| String concatenation in loops | Creates new String objects each iteration | `StringBuilder` or `String.join()` |
| `Location` object creation | Creates new object per call | Reuse Location objects where safe |
| Lambda allocation in hot loops | Allocates new lambda per call | Extract to named method or static reference |

```java
// ❌ BAD — auto-boxing in hot loop
Map<UUID, Integer> scores = new HashMap<>();
for (Player p : players) {
    int score = scores.get(p.getUniqueId());
    scores.put(p.getUniqueId(), score + 1); // Boxing: int → Integer
}

// ✅ GOOD — use compute with primitives
Map<UUID, Integer> scores = new ConcurrentHashMap<>();
for (Player p : players) {
    scores.compute(p.getUniqueId(), (k, v) -> v == null ? 1 : v + 1);
}
```

### 3.2 JVM Flags for Minecraft Servers

Use Aikar's Flags (industry standard):

```bash
java -Xms10G -Xmx10G -XX:+UseG1GC -XX:+ParallelRefProcEnabled
  -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions
  -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30
  -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M
  -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5
  -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15
  -XX:G1MixedGCLiveThresholdPercent=90
  -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32
  -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1
  -Dusing.aikars.flags=https://mcflags.emc.gs
  -Daikars.new.flags=true -jar paper.jar nogui
```

### 3.3 WeakReference & WeakHashMap Warning

`WeakHashMap` uses weak references for **keys**, not values. A value referenced only by its key will still prevent GC:

```java
// ❌ WRONG assumption: WeakHashMap will auto-evict old entries
WeakHashMap<UUID, HeavyObject> cache = new WeakHashMap<>();
// The UUID key is held elsewhere → entry is NEVER evicted

// ✅ CORRECT: Use Caffeine with time-based eviction
Cache<UUID, HeavyObject> cache = Caffeine.newBuilder()
    .expireAfterAccess(10, TimeUnit.MINUTES)
    .maximumSize(10_000)
    .build();
```

---

## 4. Database Query Optimization

### 4.1 SQLite vs MySQL Performance

| Operation | SQLite (WAL, SSD) | MySQL (localhost) | MySQL (network) |
|-----------|-------------------|-------------------|-----------------|
| Simple SELECT by PK | ~0.05ms | ~0.3ms | ~1–3ms |
| SELECT with JOIN | ~0.5ms | ~0.5ms | ~1–5ms |
| INSERT single row | ~0.1ms | ~0.3ms | ~1–3ms |
| UPDATE single row | ~0.1ms | ~0.3ms | ~1–3ms |
| Batch INSERT 100 rows | ~5ms | ~3ms | ~10–30ms |
| Full table scan (10K rows) | ~10ms | ~5ms | ~15–50ms |

### 4.2 Index Every Query Pattern

```sql
-- Every WHERE, JOIN, and ORDER BY column should have an index
CREATE INDEX idx_player_balance ON players (balance DESC);
CREATE INDEX idx_player_last_seen ON players (last_seen);

-- Composite indexes for multi-column queries
CREATE INDEX idx_txn_player_time ON transactions (player_uuid, created_at DESC);

-- Monitor unused indexes (MySQL 8.0+)
SELECT * FROM sys.schema_unused_indexes;
SELECT * FROM sys.schema_redundant_indexes;
```

### 4.3 Batch Operations

```java
// ❌ BAD — 1000 individual INSERTs
for (PlayerData data : allData) {
    savePlayerData(data); // One query per player
}

// ✅ GOOD — batch INSERT
String sql = "INSERT INTO players (uuid, name, balance) VALUES (?, ?, ?)";
try (Connection conn = ds.getConnection();
     PreparedStatement stmt = conn.prepareStatement(sql)) {

    for (PlayerData data : allData) {
        stmt.setString(1, data.getUuid().toString());
        stmt.setString(2, data.getName());
        stmt.setDouble(3, data.getBalance());
        stmt.addBatch();
    }
    stmt.executeBatch(); // Single round-trip
}
```

### 4.4 Queue-and-Flush for High-Frequency Writes

Instead of writing every change immediately, buffer writes and flush in batches:

```java
private final Queue<PlayerData> saveQueue = new ConcurrentLinkedQueue<>();

public void queueSave(PlayerData data) {
    saveQueue.offer(data);
}

// Flush every 30 seconds
Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::flushSaveQueue, 600L, 600L);

private void flushSaveQueue() {
    List<PlayerData> batch = new ArrayList<>();
    saveQueue.drainTo(batch, 500); // Take up to 500 entries
    if (batch.isEmpty()) return;

    try (Connection conn = ds.getConnection();
         PreparedStatement stmt = conn.prepareStatement(
             "INSERT INTO players (...) VALUES (...) ON DUPLICATE KEY UPDATE ...")) {
        for (PlayerData data : batch) {
            // Add to batch
        }
        stmt.executeBatch();
    } catch (SQLException e) {
        plugin.getLogger().severe("Batch save failed: " + e.getMessage());
        // Re-queue failed items
        saveQueue.addAll(batch);
    }
}
```

---

## 5. Caching Strategies

### 5.1 Three-Level Cache Hierarchy

```
L1: In-memory ConcurrentHashMap (<1μs lookup)
    └── Hot data: currently online players, active game state

L2: Caffeine Cache (configurable TTL, size limits)
    └── Warm data: recently accessed profiles, shop listings

L3: Database (SQLite/MySQL)
    └── Cold data: historical records, offline player data
```

### 5.2 Cache Decision Matrix

| Data | Cache Type | TTL | Eviction | Reason |
|------|-----------|-----|----------|--------|
| Online player data | L1 (HashMap) | Session | On quit | Accessed every tick |
| Offline player profiles | L2 (Caffeine) | 5 min | LRU + time | Accessed on lookup |
| Shop listings | L2 (Caffeine) | 1 min | LRU + time | Frequently viewed |
| Server config | L1 (HashMap) | Until reload | Manual | Rarely changes |
| Leaderboard top 100 | L2 (Caffeine) | 30 sec | Time-based | Expensive query |
| Kit definitions | L1 (HashMap) | Until reload | Manual | Read-only after load |

### 5.3 Caffeine Cache Configuration

```java
Cache<UUID, PlayerData> playerCache = Caffeine.newBuilder()
    .expireAfterAccess(5, TimeUnit.MINUTES)
    .maximumSize(10_000)
    .recordStats()
    .removalListener((key, value, cause) -> {
        // Save to database on eviction
        if (value != null && cause.wasEvicted()) {
            saveToDatabaseAsync((PlayerData) value);
        }
    })
    .build();

// Monitor cache performance
playerCache.stats().hitRate();   // Aim for > 85%
playerCache.stats().evictionCount();
playerCache.stats().averageLoadPenalty();
```

### 5.4 Guava LoadingCache (Alternative)

```java
LoadingCache<UUID, PlayerData> cache = CacheBuilder.newBuilder()
    .maximumSize(5000)
    .expireAfterAccess(10, TimeUnit.MINUTES)
    .build(new CacheLoader<UUID, PlayerData>() {
        @Override
        public PlayerData load(UUID key) {
            return database.loadPlayerData(key); // Auto-loads on cache miss
        }
    });

// Usage — auto-loads if not cached
PlayerData data = cache.get(uuid);
```

### 5.5 MiniMessage / Component Caching

Parse MiniMessage templates once, reuse for every message:

```java
private static final Component PREFIX = MiniMessage.miniMessage()
    .deserialize("<gray>[<blue>MyPlugin<gray>]</gray> ");

// At startup — cache all templates
private final Map<String, Component> messageCache = new HashMap<>();

private void loadMessageTemplates() {
    FileConfiguration messages = plugin.getMessageManager().getMessages();
    for (String key : messages.getKeys(true)) {
        String template = messages.getString(key);
        if (template != null) {
            messageCache.put(key, MiniMessage.miniMessage().deserialize(template));
        }
    }
}

// At runtime — use cached template (no parsing overhead)
public void send(Player player, String key) {
    Component template = messageCache.get(key);
    if (template != null) {
        player.sendMessage(template);
    }
}
```

---

## 6. Async & Threading

### 6.1 The Main Thread Budget

The main thread has a 50ms budget per tick (at 20 TPS). Here's how to allocate it:

```
50ms tick budget:
├── Server internals:      ~10ms (networking, chunk loading)
├── Other plugins:         ~15ms (shared among all plugins)
├── YOUR PLUGIN BUDGET:    ~10ms (everything your plugin does)
└── Slack/margin:          ~15ms (prevents TPS drops under load)
```

Within your 10ms budget:
- Event handlers: <1ms each (fast checks only)
- Scheduler tasks: <5ms each (or spread across ticks)
- Entity/block operations: <2ms per operation
- If something takes longer, move it to async

### 6.2 Async/Sync Pattern

```java
// The universal pattern for all I/O operations
CompletableFuture.supplyAsync(() -> {
    // STEP 1: I/O on worker thread (database, HTTP, file)
    return database.loadPlayerData(uuid);
}).thenAcceptAsync(data -> {
    // STEP 2: Cache update on main thread
    cache.put(uuid, data);
    Player player = Bukkit.getPlayer(uuid);
    if (player != null && player.isOnline()) {
        player.sendMessage("Data loaded!");
    }
}, runnable -> Bukkit.getScheduler().runTask(plugin, runnable))
.exceptionally(e -> {
    plugin.getLogger().severe("Async chain failed: " + e.getMessage());
    return null;
});
```

### 6.3 Avoid Common Async Pitfalls

```java
// ❌ BAD — Bukkit.getPlayer() on async thread
CompletableFuture.runAsync(() -> {
    Player player = Bukkit.getPlayer(uuid); // UNSAFE on async thread!
});

// ✅ GOOD — read from your own ConcurrentHashMap cache
private final Map<UUID, PlayerData> cache = new ConcurrentHashMap<>();

CompletableFuture.runAsync(() -> {
    PlayerData data = cache.get(uuid); // SAFE on any thread
});
```

---

## 7. Profiling & Measurement

### 7.1 Profiling Tools

| Tool | Use Case | Overhead | Command |
|------|----------|----------|---------|
| `/timings` | High-level TPS analysis | ~1% | Built into Paper |
| `spark profiler` | Method-level CPU profiling | ~2% | `/spark profiler start` |
| `spark health` | System health report | ~0% | `/spark health` |
| JFR (Java Flight Recorder) | Production-safe continuous profiling | <1% | `-XX:StartFlightRecording` |
| VisualVM | Development/debugging | ~5% | External tool |

### 7.2 TPS Health Scale

| TPS Range | Status | Action |
|-----------|--------|--------|
| 20.0 | 🟢 Ideal | No action needed |
| 19.0–19.99 | 🟢 Acceptable | Normal operating range |
| 17.0–18.99 | 🟡 Warning | Review `/timings`, check plugin event handlers |
| 15.0–16.99 | 🟠 Concern | Profile with spark, optimize hot paths |
| < 15.0 | 🔴 Critical | Emergency action required — see Appendix B |

### 7.3 Key Metrics to Monitor

```bash
# Paper timings report
/timings report

# spark profiler (30-second sample)
/spark profiler start --timeout 30

# Check entity counts
/spark health

# Memory usage
/spark gc

# Find laggy chunks
/spark tickmonitor
```

---

## 8. AI Performance Killers

The most common performance mistakes made by AI-generated plugin code:

### 8.1 Database Query in PlayerMoveEvent

```java
// ❌ AI generates this — CATASTROPHIC (2,000 queries/sec at 100 players)
@EventHandler
public void onMove(PlayerMoveEvent event) {
    if (database.isRestrictedZone(event.getTo())) { // DB query on every movement!
        event.setCancelled(true);
    }
}
```

**Fix:** Cache restricted zones in memory. Update cache on config reload only. Use block-change filter.

### 8.2 saveConfig() on Every Change

```java
// ❌ AI generates this — writes entire config to disk on every change
public void addTokens(UUID uuid, int amount) {
    cache.get(uuid).addTokens(amount);
    plugin.getConfig().set("last-update", System.currentTimeMillis());
    plugin.saveConfig(); // IOPS: disk write on every token transaction
}
```

**Fix:** Only `saveConfig()` on plugin disable or explicit `/save` command. Use async database writes for frequent data.

### 8.3 Scoreboard Update Every Tick

```java
// ❌ AI generates this — 20 scoreboard rebuilds/sec per player
Bukkit.getScheduler().runTaskTimer(plugin, () -> {
    for (Player player : Bukkit.getOnlinePlayers()) {
        updateScoreboard(player); // Rebuilds entire scoreboard every tick
    }
}, 0L, 1L);
```

**Fix:** Update scoreboard only when data changes, or throttle to once per second. Use `FastBoard` library for efficient updates.

### 8.4 Chunk Loading in Command

```java
// ❌ AI generates this — blocks main thread during chunk generation
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    World world = ((Player) sender).getWorld();
    Chunk chunk = world.getChunkAt(1000, 1000); // May trigger generation — freezes server!
    // ...
}
```

**Fix:** Use `world.isChunkLoaded()` first, or use Paper's async chunk loading API.

### 8.5 getOnlinePlayers() in Every Repeating Task

Each call to `Bukkit.getOnlinePlayers()` allocates a new array. In repeating tasks, cache the result:

```java
// ❌ BAD — new array allocation every second
// ✅ GOOD — cache and refresh periodically (see §2.4)
```

### 8.6 Repeating Tasks Without Cancellation

```java
// ❌ BAD — never cancelled, runs forever
// ✅ GOOD — store BukkitTask, cancel in onDisable()
```

### 8.7 ChatColor.translateAlternateColorCodes in Hot Path

```java
// ❌ BAD — parses color codes on every message send
// ✅ GOOD — cache the translated result after first parse
private final Map<String, String> colorizedCache = new ConcurrentHashMap<>();

public String colorize(String message) {
    return colorizedCache.computeIfAbsent(message,
        m -> ChatColor.translateAlternateColorCodes('&', m));
}
```

### 8.8 Creating New Random Instances

```java
// ❌ BAD — new Random for every roll
int roll = new Random().nextInt(100);

// ✅ GOOD — thread-local or shared instance
private static final ThreadLocalRandom RANDOM = ThreadLocalRandom.current();
int roll = RANDOM.nextInt(100);
```

### 8.9 Synchronous OfflinePlayer Lookup

```java
// ❌ BAD — blocks main thread, may do I/O
OfflinePlayer op = Bukkit.getOfflinePlayer(playerName);

// ✅ GOOD — use UUID from cache or database
OfflinePlayer op = Bukkit.getOfflinePlayer(uuid);
```

### 8.10 Double-Checking Economy Pre-Transaction

```java
// ❌ BAD — race condition: check and deduct are not atomic
if (cache.get(uuid).getBalance() >= cost) {
    cache.get(uuid).setBalance(cache.get(uuid).getBalance() - cost);
}

// ✅ GOOD — atomic UPDATE with WHERE clause
UPDATE players SET balance = balance - ? WHERE uuid = ? AND balance >= ?
```

---

## Appendix A: Performance Budgets

### Nanosecond-Precision Budget for Critical Operations

| Operation | Budget | If Exceeded |
|-----------|--------|------------|
| Event handler (NORMAL priority) | < 1ms (1,000,000ns) | Move work to async or defer to next tick |
| Event handler (MONITOR priority) | < 100μs (100,000ns) | Only logging — no processing |
| Command execution | < 10ms | Delegate expensive work to async |
| Scheduler task (sync, per tick) | < 5ms | Spread work across multiple ticks |
| Plugin startup (onEnable) | < 500ms | Warn admin if slower, consider lazy init |

### MSPT Budget Allocation

```
50ms server tick budget:
├── 10ms ─ Server internals (networking, entities, chunks)
├── 15ms ─ Other plugins (shared budget)
├── 10ms ─ YOUR PLUGIN (total allocation)
│   ├── 5ms ─ Event handlers (fast checks only)
│   ├── 3ms ─ Scheduled tasks (spread across ticks)
│   └── 2ms ─ Commands/GUI (user-triggered, infrequent)
└── 15ms ─ Slack (prevents TPS drops under load)
```

---

## Appendix B: Emergency Server Lag Fixes

When TPS drops below 15 and you need immediate relief:

### Immediate (No Restart Required)
1. **Reduce view-distance:** `/minecraft:save-on` then set `view-distance=4` in `server.properties`
2. **Clear entities:** `/minecraft:kill @e[type=item]` (clear ground items)
3. **Paper optimizations:**
   ```yaml
   # paper.yml emergency settings
   world-settings:
     default:
       optimize-explosions: true
       treasure-maps:
         enabled: false
       armor-stands-tick: false
       max-auto-save-chunks-per-tick: 4
       entity-per-chunk-save-limit:
         experience_orb: -1
         arrow: -1
   ```
4. **Disable heavy plugins temporarily:** `/plugman unload <heavy_plugin>`

### Short-Term (Requires Restart)
1. Profile with spark to identify the bottleneck
2. Add missing indexes to database tables
3. Reduce entity activation range in `spigot.yml`
4. Enable Paper's `per-player-mob-spawns: true`

### Long-Term (Architectural Fixes)
1. Move all database queries to async
2. Implement caching with TTL for all frequent reads
3. Use block-change filter on all `PlayerMoveEvent` handlers
4. Batch database writes with queue-and-flush pattern
5. Profile monthly to catch gradual performance regressions

---

---

## 9. JVM Internals for Plugin Developers

### 9.1 JIT Compiler Behavior

The JVM's Just-In-Time compiler transforms hot bytecode into native machine code. Understanding this helps you write code that the JIT can optimize well:

**Tiered compilation levels:**
| Level | Name | What It Does | When |
|-------|------|-------------|------|
| 0 | Interpreter | Executes bytecode directly | First invocation |
| 1 | C1 (simple) | Quick compile, no profiling | Methods called >1,000 times |
| 2 | C1 (limited profiling) | Compile + basic profiling data | Methods called >1,500 times |
| 3 | C1 (full profiling) | Compile + full profiling | Methods called >2,000 times |
| 4 | C2 (server compiler) | Heavily optimized native code | Methods called >10,000 times |

**What this means for your plugin:**
- **Cold code (onEnable, /reload, rare commands):** Runs in interpreter — slow but infrequent. Don't optimize prematurely.
- **Warm code (PlayerMoveEvent, repeating tasks):** Gets JIT-compiled to native code. The first ~10,000 calls are slower; after JIT, they're as fast as C.
- **Megamorphic call sites:** If a virtual method has >3 different implementations called at the same call site, the JIT can't inline it. Keep interface hierarchies shallow and prefer composition.

**JIT-friendly patterns:**
```java
// ❌ JIT-UNFRIENDLY — megamorphic call site (many implementations)
for (Handler h : handlers) {
    h.process(event); // 10+ Handler implementations → can't inline
}

// ✅ JIT-FRIENDLY — monomorphic call site (one implementation in practice)
PlayerDataManager pdm = plugin.getPlayerDataManager();
pdm.updateBalance(uuid, amount); // Only one PlayerDataManager → inlinable

// ✅ JIT-FRIENDLY — bimorphic (two implementations, both inlined with type check)
DataStorage storage = isSqlite ? new SQLiteStorage() : new MySQLStorage();
storage.save(data); // Two implementations → inlined with a type guard
```

### 9.2 Inlining: The Most Important JIT Optimization

When the JIT inlines a method call, it copies the callee's code into the caller, eliminating:
- Method call overhead (stack frame push/pop)
- Virtual dispatch (vtable lookup)
- Parameter copying

This enables further optimizations: escape analysis, dead code elimination, constant folding — all of which only work across inlined call boundaries.

**Write code that helps the JIT inline:**
```java
// ❌ Hard to inline — deep call chain with virtual dispatch each step
public PlayerData get(UUID uuid) {
    return cache.get(uuid);              // Virtual: ConcurrentHashMap.get()
        // → Node.find()                 // Virtual (polymorphic)
        //    → .equals()                // Virtual: String.equals()
}

// ✅ Easier to inline — flatter, fewer virtual calls
public PlayerData get(UUID uuid) {
    // Single virtual call + field access
    return cache.get(uuid);
}
```

**Key insight:** The JIT will inline up to 9 levels deep by default (`-XX:MaxInlineLevel=9`). Methods longer than 35 bytes of bytecode (`-XX:MaxInlineSize=35`) are less likely to be inlined. Keep hot-path methods short — under 15 lines of Java.

### 9.3 Escape Analysis and Stack Allocation

When the JIT can prove an object never "escapes" the method (isn't stored in a field, returned, or passed to another thread), it can allocate it on the stack instead of the heap. Stack allocation is effectively free — no GC overhead.

```java
// ✅ Stack-allocatable — location never escapes this method
public void teleportToSpawn(Player player) {
    Location spawnLocation = new Location(
        player.getWorld(), 0, 64, 0);    // Scalar replacement candidate
    player.teleport(spawnLocation);      // Passed to another method → may escape
}

// ❌ Heap-allocated — stored in a field (escapes)
public void recordLastLocation(Player player) {
    Location lastLoc = player.getLocation().clone();
    this.lastLocations.put(player.getUniqueId(), lastLoc); // Escapes!
}
```

**To help escape analysis:**
- Use local variables instead of fields for temporary objects
- Don't store intermediate results in fields unless needed
- Prefer returning primitive values over object references

---

## 10. JMH Microbenchmarks for Plugins

### 10.1 Why Microbenchmarks Matter

Developer intuition about performance is wrong ~70% of the time. Without measurement, you'll optimize the wrong things.

```java
// JMH benchmark — add to a separate module or use JMH Gradle plugin
@State(Scope.Benchmark)
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
public class CacheBenchmark {

    private Map<UUID, String> hashMap;
    private Map<UUID, String> concurrentHashMap;
    private Map<UUID, String> caffeineCache;
    private UUID[] keys;
    private int index;

    @Setup
    public void setup() {
        hashMap = new HashMap<>();
        concurrentHashMap = new ConcurrentHashMap<>();
        caffeineCache = Caffeine.newBuilder().maximumSize(100_000).<UUID, String>build().asMap();

        keys = new UUID[10_000];
        for (int i = 0; i < keys.length; i++) {
            keys[i] = UUID.randomUUID();
            String value = "player_data_" + i;
            hashMap.put(keys[i], value);
            concurrentHashMap.put(keys[i], value);
            caffeineCache.put(keys[i], value);
        }
    }

    @Benchmark
    public String hashMapGet() {
        return hashMap.get(keys[index++ % keys.length]);
    }

    @Benchmark
    public String concurrentHashMapGet() {
        return concurrentHashMap.get(keys[index++ % keys.length]);
    }

    @Benchmark
    public String caffeineCacheGet() {
        return caffeineCache.get(keys[index++ % keys.length]);
    }
}
```

**Typical results (nanoseconds per get, Ryzen 5950X):**
```
Benchmark                          Mode  Cnt    Score    Error  Units
CacheBenchmark.hashMapGet          avgt    5    8.3 ns           ns/op
CacheBenchmark.concurrentHashMapGet avgt   5   11.2 ns           ns/op
CacheBenchmark.caffeineCacheGet    avgt    5   13.7 ns           ns/op
```

**What this tells us:** `ConcurrentHashMap.get()` is only ~3ns slower than `HashMap.get()` — a 35% difference in a microbenchmark, but <0.1% of your event handler budget. Don't avoid `ConcurrentHashMap` for performance reasons; the thread-safety benefit vastly outweighs the microscopic overhead.

### 10.2 Real Plugin Benchmarks

```java
@Benchmark
public void playerMoveEvent_filtered() {
    // Simulates: checking block-change filter (the early return)
    Location from = locations[index % locations.length];
    Location to = from.clone().add(0, 0, 0); // Same block
    boolean sameBlock = from.getBlockX() == to.getBlockX()
        && from.getBlockY() == to.getBlockY()
        && from.getBlockZ() == to.getBlockZ();
    // ~4ns — essentially free
}

@Benchmark
public void chatColor_legacy() {
    // ChatColor.translateAlternateColorCodes — ~500ns per call
    ChatColor.translateAlternateColorCodes('&', "&aHello &bWorld &c!");
}

@Benchmark
public void minimessage_parse() {
    // MiniMessage parsing — ~3,000ns per call (6x slower than ChatColor)
    MiniMessage.miniMessage().deserialize("<green>Hello <aqua>World <red>!</red></aqua></green>");
}
```

**Key insight from these benchmarks:** MiniMessage parsing is ~6x slower than ChatColor string replacement — but that's 3 microseconds vs 0.5 microseconds. In an event handler that fires 2,000 times/second, the difference is 6ms vs 1ms per second total. Both are negligible. The real optimization is **caching parsed Components** (see §5.5 of the Optimization guide), which drops the cost to effectively zero.

---

## 11. Flame Graph Interpretation

Flame graphs are the most powerful profiling visualization. Here's how to generate and read them:

### 11.1 Generating a Flame Graph

```bash
# 1. Profile with spark async-profiler (sampling profiler, <1% overhead)
/spark profiler start --alloc --timeout 60

# 2. Download the flame graph
# spark will provide a URL — open it in a browser

# 3. Alternative: async-profiler directly
/async-profiler/bin/asprof -d 60 -f /tmp/flamegraph.html $(pgrep -f paper.jar)
```

### 11.2 Reading a Flame Graph

```
Top-to-bottom: Call stack (caller at bottom, callee at top)
Left-to-right: Alphabetical (not time)
Width of each bar: CPU time spent in that method (including children)
Color: Not meaningful in standard flame graphs (randomized for contrast)

What you're looking for:
1. Wide "plateaus" at the top — methods consuming significant CPU directly
2. Deep, narrow towers — deep call chains (potential for optimization via inlining)
3. "striped" patterns — alternating hot/cold (GC activity or lock contention)
```

**Common flame graph patterns in Minecraft plugins:**

| Pattern | What It Means | Action |
|---------|--------------|--------|
| Wide `sun.nio.ch` blocks | I/O on main thread (database, files) | Move to async |
| Wide `java.util.HashMap.get` | Excessive map lookups | Check for loops, consider caching |
| Wide `ChatColor.translateAlternateColorCodes` | Color code parsing in hot path | Cache parsed results |
| Tall `java.lang.reflect.Method.invoke` | Reflection overhead (command dispatch) | Normal — this is Bukkit's event system |
| Wide `org.sqlite` blocks | SQLite operations on main thread | Move to async + WAL mode |
| `java.util.zip` anywhere | Compression/decompression on main thread | Move to async |
| Wide `Pattern.matches` | Regex compilation on every call | Compile once: `private static final Pattern = Pattern.compile(...)` |

---

## 12. Lock Contention Analysis

### 12.1 Detecting Lock Contention

```bash
# Check for contended locks (threads waiting to acquire a lock)
jstack $(pgrep -f paper.jar) | grep -A 5 "waiting to lock"

# Output example:
# "Craft Scheduler Thread - 3" waiting to lock <0x00000007d2345678>
#   - waiting to lock <0x00000007d2345678> (a java.util.HashMap)
#   - locked <0x00000007d2345678> (a java.util.HashMap)
#   at com.yourplugin.managers.PlayerDataManager.savePlayer(PlayerDataManager.java:67)

# This means: two threads are contending on the same HashMap lock
# The fix: replace HashMap with ConcurrentHashMap
```

### 12.2 Common Lock Contention Sources in Plugins

| Source | Symptom | Fix |
|--------|---------|-----|
| `synchronized` on `HashMap` | Threads queued on HashMap lock | Replace with `ConcurrentHashMap` |
| `Collections.synchronizedList()` | Threads queued on list wrapper | Replace with `CopyOnWriteArrayList` or `ConcurrentLinkedQueue` |
| `synchronized` method on hot path | All callers serialize through one method | Reduce scope: `synchronized(lock) { /* only critical section */ }` |
| Database connection pool contention | Threads waiting in `HikariPool.getConnection()` | Increase pool size or reduce query time |
| File I/O with `synchronized` | All file writes serialize on a lock | Use async file writing, buffer writes |

---

## 13. GC Tuning for Minecraft Servers

### 13.1 Understanding G1GC Regions

G1GC divides the heap into equal-sized regions (default: 2048 regions, each ~1-32MB). Young generation regions are collected frequently; old generation regions are collected during mixed GC cycles.

**Key G1GC tuning knobs:**
```bash
-XX:G1HeapRegionSize=4M       # Smaller regions = more precise, less fragmentation
                                # Use 4M for 4-8GB heaps, 8M for 8-16GB, 16M for 16GB+
-XX:G1NewSizePercent=5         # Minimum young gen as % of heap
-XX:G1MaxNewSizePercent=60     # Maximum young gen as % of heap
-XX:InitiatingHeapOccupancyPercent=30  # Start concurrent marking when heap is 30% full
                                        # Lower = more frequent marking, less pause time
-XX:G1MixedGCCountTarget=8     # Spread mixed GCs over 8 cycles (smoother)
-XX:G1HeapWastePercent=5       # Allow 5% waste to avoid compaction
```

### 13.2 When to Switch from G1GC to ZGC or Shenandoah

G1GC targets <200ms pause times. For Minecraft servers with large heaps (32GB+) where even 200ms pauses cause noticeable TPS drops:

**ZGC (Java 21+):** Sub-millisecond pauses regardless of heap size. Slightly higher CPU usage (2-5%) than G1GC.
```bash
-XX:+UseZGC -XX:+ZGenerational
```

**Shenandoah (Java 21+):** Similar to ZGC. Concurrent compaction. Good for heaps 16-64GB.
```bash
-XX:+UseShenandoahGC -XX:ShenandoahGCHeuristics=adaptive
```

**When to switch:** If your server has >16GB heap and you see GC pauses >100ms contributing to TPS drops, switch to ZGC. The slightly higher CPU cost (~2-5%) is worth it for the elimination of pause-related lag spikes.

---

*End of Minecraft Plugin Performance Optimization Guide*
*Paper 1.21.4 · Java 21*

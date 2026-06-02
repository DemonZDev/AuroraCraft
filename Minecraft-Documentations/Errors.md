# Minecraft Plugin Error Encyclopedia
## For AI-Assisted Plugin Development Teams — Paper 1.21.4 / Java 21

> **How to use this document:** Press `Ctrl+F` and paste your exact error message. Every entry includes the raw error text, root cause, bad code, fixed code, and prevention strategy.

---

## Table of Contents

1. [Compilation Errors](#1-compilation-errors)
2. [Runtime Crashes](#2-runtime-crashes)
3. [Logic Bugs](#3-logic-bugs)
4. [API Confusion Bugs](#4-api-confusion-bugs)
5. [plugin.yml Errors](#5-pluginyml-errors)
6. [Command Input Bugs](#6-command-input-bugs)
7. [Database & Storage Bugs](#7-database--storage-bugs)
8. [Security Vulnerabilities](#8-security-vulnerabilities)
9. [Build System Errors](#9-build-system-errors)
10. [Appendix A: Error Message Decoder](#appendix-a-error-message-decoder)
11. [Appendix B: Prevention Cheat Sheet](#appendix-b-prevention-cheat-sheet)
12. [Appendix C: Debug Flowchart](#appendix-c-debug-flowchart)

---

# 1. Compilation Errors

---

## 1.1 Cannot Find Symbol — Deprecated or Removed Method

**Severity:** 🔴 CRITICAL | **Frequency:** Very High (~40% of AI-generated plugins)

**Symptoms:**
```
error: cannot find symbol
    symbol:   method getPlayer(String)
    location: class Server
```

**Root Cause:** AI models are trained on code spanning Bukkit 1.8 through 1.21. They frequently emit method calls that existed in older versions but were removed or replaced in Paper 1.21.x. The AI does not track which version removed which method — it pattern-matches on frequency of appearance in training data.

**Common deprecated methods AI generates:**
- `player.getItemInHand()` → `player.getInventory().getItemInMainHand()`
- `setHealth(int)` → `setHealth(double)`
- `getOfflinePlayer(String)` → `getOfflinePlayer(UUID)` for reliability
- `ChatColor` → Adventure `Component` / `NamedTextColor`

**Bad Code:**
```java
ItemStack held = player.getItemInHand(); // Removed — no hand specified
player.sendMessage(ChatColor.RED + "Error"); // Legacy, deprecated
```

**Good Code:**
```java
ItemStack held = player.getInventory().getItemInMainHand();
player.sendMessage(Component.text("Error", NamedTextColor.RED));
```

**Prevention:** In your AI prompt: *"Target Paper 1.21.4 API only. Do not use any method deprecated before 1.16."*

---

## 1.2 Class Is Public, Should Be Declared in File Named X

**Severity:** 🔴 CRITICAL

**Symptoms:**
```
error: class PluginMain is public, should be declared in a file named PluginMain.java
```

**Root Cause:** AI generates a class name that does not match the filename. This happens when the AI decides mid-generation to rename the class but doesn't update the filename.

**Bad Code:**
```java
// File: MyPlugin.java
public class PluginMain extends JavaPlugin { ... } // Mismatch!
```

**Good Code:**
```java
// File: MyPlugin.java
public class MyPlugin extends JavaPlugin { ... }
```

**Prevention:** *"The main class must be named exactly like the file it lives in."*

---

## 1.3 Package Does Not Exist

**Severity:** 🔴 CRITICAL

**Symptoms:**
```
error: package org.bukkit does not exist
error: package com.destroystokyo.paper does not exist
```

**Root Cause:** Paper API not configured as a dependency in `pom.xml` or `build.gradle.kts`, or the Paper repository is not declared. Maven cannot resolve Bukkit/Paper classes.

**Fix:**
```xml
<repositories>
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>
</repositories>

<dependencies>
    <dependency>
        <groupId>io.papermc.paper</groupId>
        <artifactId>paper-api</artifactId>
        <version>1.21.4-R0.1-SNAPSHOT</version>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

---

## 1.4 Switch Expression Not Supported

**Severity:** 🟡 MEDIUM

**Symptoms:**
```
error: switch expressions are not supported in -source 11
```

**Root Cause:** AI generates Java 14+ switch expression syntax (`switch { case X -> ... }` or `yield`) but the compiler is targeting Java 11 or earlier.

**Fix:** Use `<release>21</release>` in your Maven compiler plugin or Java 21 toolchain in Gradle. Or rewrite as a traditional switch statement if you must target older Java.

---

# 2. Runtime Crashes

---

## 2.1 NullPointerException — Command Not in plugin.yml

**Severity:** 🔴 CRITICAL | **Frequency:** High (~35% of AI-generated plugins)

**Symptoms:**
```
java.lang.NullPointerException
    at com.example.MyPlugin.onEnable(MyPlugin.java:15)
```
Stack trace points to `plugin.getCommand("somecommand").setExecutor(...)`.

**Root Cause:** The command is registered in code via `getCommand()` but is not declared in `plugin.yml`. `getCommand()` returns `null`.

**Bad Code:**
```java
@Override
public void onEnable() {
    plugin.getCommand("mycommand").setExecutor(new MyCommand()); // NPE!
}
```

**Good Code:**
```java
@Override
public void onEnable() {
    PluginCommand cmd = plugin.getCommand("mycommand");
    if (cmd == null) {
        plugin.getLogger().severe("Command 'mycommand' not found in plugin.yml!");
        return;
    }
    cmd.setExecutor(new MyCommand());
}
```

And in `plugin.yml`:
```yaml
commands:
  mycommand:
    description: My command
    usage: /mycommand
```

---

## 2.2 NoClassDefFoundError — Missing Shaded Dependency

**Severity:** 🔴 CRITICAL | **Frequency:** Very High (~50% of AI-generated plugins with dependencies)

**Symptoms:**
```
java.lang.NoClassDefFoundError: com/zaxxer/hikari/HikariDataSource
    at com.example.MyPlugin.onEnable(MyPlugin.java:20)
```

**Root Cause:** A compile-scope dependency (HikariCP, SQLite JDBC, etc.) is not shaded into the JAR. The class exists at compile time but is absent at runtime because the dependency JAR is not inside the plugin JAR.

**Fix:** Configure the Maven Shade Plugin or Gradle Shadow Plugin to bundle the dependency into your JAR. See the Build guide for complete configuration.

---

## 2.3 ClassCastException — API Class Identity Conflict

**Severity:** 🔴 CRITICAL

**Symptoms:**
```
java.lang.ClassCastException: class org.bukkit.craftbukkit.v1_21_R1.entity.CraftPlayer
    cannot be cast to class org.bukkit.entity.Player
```

**Root Cause:** Paper API is shaded into the plugin JAR instead of being declared as `provided`. The JVM sees two copies of the same class — one from the server classpath, one from your JAR. Class identity conflicts cause `ClassCastException` on every API call.

**Fix:** Set Paper API scope to `provided` (Maven) or `compileOnly` (Gradle). Never shade server-provided APIs.

---

## 2.4 IllegalArgumentException — Invalid Material or Enchantment

**Severity:** 🟡 MEDIUM | **Frequency:** Medium (~20% of AI-generated plugins)

**Symptoms:**
```
java.lang.IllegalArgumentException: No enum constant org.bukkit.Material.GRASS
```

**Root Cause:** AI generates pre-1.13 material names (`GRASS`, `WOOL`, `STAINED_GLASS`). In 1.13+, the Material enum was flattened — `GRASS` became `SHORT_GRASS` (or `GRASS_BLOCK`), colored variants became distinct entries.

**Fix:** Always use the modern Material name. Check the [Paper API docs](https://jd.papermc.io/) or use IDE autocomplete.

---

## 2.5 ConcurrentModificationException

**Severity:** 🔴 CRITICAL | **Frequency:** Medium in async-heavy plugins

**Symptoms:**
```
java.util.ConcurrentModificationException
    at java.util.HashMap$HashIterator.nextNode(HashMap.java)
```

**Root Cause:** A `HashMap` or `ArrayList` is being modified by one thread while another thread iterates over it. Common when an async database callback writes to a cache while the main thread iterates it.

**Fix:** Use `ConcurrentHashMap` instead of `HashMap`. Use `CopyOnWriteArrayList` for lists accessed from multiple threads.

---

## 2.6 ArithmeticException — Division by Zero

**Severity:** 🟡 MEDIUM

**Symptoms:**
```
java.lang.ArithmeticException: / by zero
```

**Root Cause:** Division or modulus operation with a zero divisor, typically from user-configurable values that default to 0.

**Fix:**
```java
int divisor = config.getInt("divisor");
if (divisor == 0) {
    plugin.getLogger().warning("divisor is zero, using default 1");
    divisor = 1;
}
int result = value / divisor;
```

---

## 2.7 UnsupportedOperationException — Immutable Collection Modification

**Severity:** 🟡 MEDIUM

**Symptoms:**
```
java.lang.UnsupportedOperationException
    at java.util.ImmutableCollections.uoe(ImmutableCollections.java)
```

**Root Cause:** Attempting to modify an immutable collection returned by `List.of()`, `Set.of()`, or `Map.of()`.

**Fix:**
```java
// BAD
List<String> items = List.of("a", "b", "c");
items.add("d"); // UnsupportedOperationException!

// GOOD
List<String> items = new ArrayList<>(List.of("a", "b", "c"));
items.add("d"); // Works
```

---

## 2.8 StringIndexOutOfBoundsException

**Severity:** 🟡 MEDIUM

**Symptoms:**
```
java.lang.StringIndexOutOfBoundsException: begin 0, end 5, length 3
```

**Root Cause:** String operations (`substring`, `charAt`) on input that is shorter than expected. Common in command argument parsing.

**Fix:** Always validate string length before substring operations:
```java
if (args[0].length() < 3) {
    sender.sendMessage("§cInput too short.");
    return;
}
String prefix = args[0].substring(0, 3);
```

---

# 3. Logic Bugs

---

## 3.1 Inventory Click Not Cancelled → Item Duplication

**Severity:** 🔴 CRITICAL (exploit) | **Frequency:** Very High

**Symptoms:** Players can remove items from custom GUI inventories, shift-click items into restricted slots, or duplicate items.

**Root Cause:** The `InventoryClickEvent` handler does not call `event.setCancelled(true)` before processing the click. Players can move items freely in the GUI.

**Fix:**
```java
@EventHandler
public void onClick(InventoryClickEvent event) {
    event.setCancelled(true); // ALWAYS first
    // Now handle the click safely
    InventoryButton button = buttonMap.get(event.getSlot());
    if (button != null) button.getEventConsumer().accept(event);
}
```

---

## 3.2 Economy Race Condition — Double-Spend

**Severity:** 🔴 CRITICAL (exploit) | **Frequency:** Medium

**Symptoms:** Players can spend the same money twice by triggering two purchases simultaneously (rapid clicking, two servers).

**Root Cause:** Read-modify-write is not atomic. Two async operations both read `balance = 100`, both deduct 50, both write `balance = 50`. Player keeps 50 extra.

**Fix — Atomic check-and-deduct via database:**
```java
public boolean deductBalance(UUID uuid, double amount) {
    try (Connection conn = db.getConnection();
         PreparedStatement stmt = conn.prepareStatement(
             "UPDATE players SET balance = balance - ? WHERE uuid = ? AND balance >= ?")) {
        stmt.setDouble(1, amount);
        stmt.setString(2, uuid.toString());
        stmt.setDouble(3, amount);
        return stmt.executeUpdate() > 0; // False if insufficient
    } catch (SQLException e) {
        return false;
    }
}
```

---

## 3.3 Player Not Checked After Async → NPE

**Severity:** 🔴 CRITICAL | **Frequency:** High in async plugins

**Symptoms:** Intermittent `NullPointerException` in async callbacks. Hard to reproduce.

**Root Cause:** A player logs off while an async operation is in progress. The callback tries to use the player object but `Bukkit.getPlayer(uuid)` returns `null`.

**Fix:**
```java
CompletableFuture.supplyAsync(() -> loadFromDb(uuid))
    .thenAccept(data -> {
        Bukkit.getScheduler().runTask(plugin, () -> {
            Player player = Bukkit.getPlayer(uuid);
            if (player != null && player.isOnline()) {
                player.sendMessage("Data loaded!");
            }
        });
    });
```

---

## 3.4 Scheduled Task Never Cancelled → Memory Leak

**Severity:** 🟡 MEDIUM | **Frequency:** High in AI-generated code

**Symptoms:** Plugin uses increasing memory over time. Server restart fixes it temporarily. Ghost tasks continue running after `/reload`.

**Root Cause:** `Bukkit.getScheduler().runTaskTimer()` is called without storing the returned `BukkitTask` reference. The task can never be cancelled, and continues running forever.

**Fix:**
```java
private BukkitTask periodicTask;

@Override
public void onEnable() {
    periodicTask = Bukkit.getScheduler().runTaskTimer(this, this::doWork, 0L, 200L);
}

@Override
public void onDisable() {
    if (periodicTask != null) periodicTask.cancel();
}
```

---

# 4. API Confusion Bugs

---

## 4.1 getDamage() vs getFinalDamage()

AI frequently confuses these two `EntityDamageEvent` methods:

- `event.getDamage()` — Raw damage BEFORE armor, enchantments, effects
- `event.getFinalDamage()` — Actual damage AFTER all reductions

**For accurate damage tracking, always use `getFinalDamage()`.**

---

## 4.2 getPlayer() vs getPlayerExact()

- `Bukkit.getPlayer(String)` — Partial name match (legacy behavior)
- `Bukkit.getPlayerExact(String)` — Exact name match (Paper API)
- `Bukkit.getPlayer(UUID)` — UUID lookup (most reliable)

For Paper 1.21.4, prefer `getPlayer(UUID)` when possible, `getPlayerExact(String)` for exact name matching.

---

## 4.3 Adventure Component vs ChatColor

Paper bundles the Adventure component library. Never mix legacy `ChatColor` with Adventure `Component`:

```java
// BAD — mixed styles in the same codebase
player.sendMessage(ChatColor.RED + "Error");       // Legacy
player.sendMessage(Component.text("Success"));      // Adventure

// GOOD — pick one system
// Option A: All Adventure (recommended for new projects)
player.sendMessage(Component.text("Error", NamedTextColor.RED));

// Option B: All legacy (acceptable for migration)
player.sendMessage(ChatColor.translateAlternateColorCodes('&', "&cError"));
```

---

## 4.4 onTabComplete Return Values

- Return `Collections.emptyList()` when there are no completions
- Return `null` ONLY if you want default behavior (all online player names)
- Never return a list containing `null` elements

---

# 5. plugin.yml Errors

---

## 5.1 Invalid plugin.yml — Not Found

**Severity:** 🔴 CRITICAL

**Symptoms:**
```
[ERROR] Could not load 'plugins/MyPlugin.jar' in folder 'plugins'
org.bukkit.plugin.InvalidDescriptionException: Invalid plugin.yml
```

**Root Cause:** `plugin.yml` is not in the JAR root. Common causes: placed in `src/main/java/` instead of `src/main/resources/`, or placed in a subdirectory within resources.

**Fix:** Ensure `plugin.yml` is at `src/main/resources/plugin.yml`.

---

## 5.2 Wrong Main Class Path

**Severity:** 🔴 CRITICAL

**Symptoms:**
```
[ERROR] Could not load plugin 'MyPlugin.jar'
java.lang.ClassNotFoundException: com.example.WrongPath
```

**Root Cause:** The `main:` entry in `plugin.yml` does not match the actual fully-qualified class name of your main plugin class.

**Fix:** Verify the `main:` path exactly matches the package + class name, e.g.:
```yaml
main: com.yourteam.myplugin.MyPlugin
```

---

## 5.3 api-version Warning

**Severity:** 🟡 WARNING

**Symptoms:**
```
[WARN] Plugin MyPlugin does not specify an api-version. Legacy behavior will be used.
```

**Fix:** Add `api-version: "1.21"` to your `plugin.yml`.

---

# 6. Command Input Bugs

---

## 6.1 NumberFormatException — Unvalidated Numeric Input

**Severity:** 🟡 MEDIUM | **Frequency:** Very High

**Symptoms:**
```
java.lang.NumberFormatException: For input string: "abc"
```

**Fix:**
```java
int amount;
try {
    amount = Integer.parseInt(args[1]);
} catch (NumberFormatException e) {
    sender.sendMessage("§c'" + args[1] + "' is not a valid number.");
    return;
}
```

---

## 6.2 ArrayIndexOutOfBoundsException

**Severity:** 🟡 MEDIUM | **Frequency:** Very High

**Root Cause:** Accessing `args[N]` without checking `args.length > N` first.

**Fix:** Always check array length before indexed access:
```java
if (args.length < 2) {
    sender.sendMessage("§cUsage: /command <arg1> <arg2>");
    return;
}
String arg2 = args[1]; // Safe now
```

---

# 7. Database & Storage Bugs

---

## 7.1 SQL Injection

**Severity:** 🔴 CRITICAL (security) | **Frequency:** Very High in AI code

**Bad Code:**
```java
String sql = "SELECT * FROM players WHERE name = '" + playerName + "'";
```

**Good Code:**
```java
String sql = "SELECT * FROM players WHERE name = ?";
PreparedStatement stmt = conn.prepareStatement(sql);
stmt.setString(1, playerName);
```

---

## 7.2 SQLITE_BUSY — Write Contention

**Severity:** 🔴 CRITICAL

**Symptoms:**
```
[SQLITE_BUSY] The database file is locked (database is locked)
```

**Root Cause:** Multiple write operations attempted simultaneously on SQLite (which only supports 1 writer). Common when not using WAL mode.

**Fix:**
```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
```
And limit SQLite connection pool to 1 write connection.

---

## 7.3 Synchronous DB Query on Main Thread → Server Lag

**Severity:** 🔴 CRITICAL | **Frequency:** Very High in AI code

**Symptoms:** Server TPS drops when players join. `/timings` shows database calls on main thread.

**Fix:** Always use async for database operations:
```java
CompletableFuture.supplyAsync(() -> loadFromDb(uuid))
    .thenAccept(data -> {
        Bukkit.getScheduler().runTask(plugin, () -> applyData(data));
    });
```

---

## 7.4 Data Corruption on Crash

**Severity:** 🔴 CRITICAL

**Symptoms:** Player data reverted to an earlier state after server crash, or partially written data.

**Root Cause:** Plugin saves data periodically but not atomically. If the server crashes between writes, some data is lost.

**Fix:** Always save on `PlayerQuitEvent` at `MONITOR` priority. Batch save periodically. Use transactions for multi-table writes. Use WAL mode for SQLite (crash recovery).

---

# 8. Security Vulnerabilities

---

## 8.1 SQL Injection

Covered in §7.1. Always use `PreparedStatement`.

---

## 8.2 Path Traversal

**Severity:** 🔴 CRITICAL

**Bad Code:**
```java
File file = new File(plugin.getDataFolder(), fileName);
// fileName = "../../../server.properties" → reads sensitive files!
```

**Fix:**
```java
// Sanitize filename
fileName = fileName.replace("/", "").replace("\\", "");
if (!fileName.matches("[a-zA-Z0-9_-]+\\.yml")) {
    return; // Invalid filename
}
// Verify canonical path stays within plugin folder
File file = new File(plugin.getDataFolder(), fileName);
if (!file.getCanonicalPath().startsWith(plugin.getDataFolder().getCanonicalPath())) {
    return; // Path traversal attempt
}
```

---

## 8.3 Permission Bypass via Aliases

**Severity:** 🔴 CRITICAL

Ensure all command aliases have the same permission requirements as the main command. Check permissions at the start of every command handler before any logic.

---

## 8.4 Economy Exploit — Negative Amounts

**Severity:** 🔴 CRITICAL (exploit)

Always validate that economy amounts are positive before processing:

```java
if (amount <= 0) {
    sender.sendMessage("§cAmount must be positive.");
    return;
}
```

---

# 9. Build System Errors

---

## 9.1 Paper API Not Found

**Symptoms:**
```
[ERROR] Could not find artifact io.papermc.paper:paper-api:jar:1.21.4-R0.1-SNAPSHOT
```

**Fix:** Add the Paper repository to your `pom.xml` or `build.gradle.kts`. See §1.3.

---

## 9.2 JAR Too Large (>20MB) — Paper API Shaded

**Symptoms:** JAR is 40-60MB. Server shows `Duplicate class: org.bukkit.Bukkit`.

**Fix:** Set Paper API scope to `provided`/`compileOnly`.

---

## 9.3 NoClassDefFoundError at Runtime

**Symptoms:** Plugin compiles but crashes on startup with `NoClassDefFoundError`.

**Fix:** Ensure all compile-scope dependencies are shaded into the JAR. See Build guide.

---

# Appendix A: Error Message Decoder

Quick reference for common error patterns:

| Error Message Fragment | Likely Cause | See Section |
|------------------------|-------------|-------------|
| `cannot find symbol` | Deprecated/removed API | §1.1 |
| `does not exist (package)` | Missing dependency/repo | §1.3 |
| `NullPointerException` on `getCommand` | Missing in plugin.yml | §2.1 |
| `NoClassDefFoundError` | Dependency not shaded | §2.2 |
| `ClassCastException` with `org.bukkit` | Paper API shaded into JAR | §2.3 |
| `IllegalArgumentException: No enum constant` | Pre-1.13 material name | §2.4 |
| `ConcurrentModificationException` | HashMap with async access | §2.5 |
| `NumberFormatException` | Unvalidated numeric input | §6.1 |
| `ArrayIndexOutOfBoundsException` | Missing args length check | §6.2 |
| `SQLITE_BUSY` | SQLite write contention | §7.2 |
| `Invalid plugin.yml` | plugin.yml missing/wrong location | §5.1 |
| `ClassNotFoundException` for main class | Wrong main path in plugin.yml | §5.2 |
| `Duplicate class: org.bukkit` | Paper API leaked into JAR | §9.2 |

---

# Appendix B: Prevention Cheat Sheet

### Before Every AI Prompt, Include:
- *"Target Paper 1.21.4 API only"*
- *"Use Adventure Components, not ChatColor"*
- *"Use async for all database/file I/O"*
- *"Use PreparedStatement for all SQL"*
- *"Validate all user input before processing"*

### Code Review Checklist (Every PR):
- [ ] All commands declared in `plugin.yml`
- [ ] Paper API scope is `provided`/`compileOnly`
- [ ] No `getItemInHand()` — use `getItemInMainHand()`
- [ ] Database queries use async + `PreparedStatement`
- [ ] `Bukkit.getPlayer()` results null-checked
- [ ] Players checked with `isOnline()` after async ga
- [ ] All `BukkitTask` references stored for cancellation
- [ ] `event.setCancelled(true)` in all GUI click handlers
- [ ] No mixed `ChatColor` + `Component` — pick one

---

# Appendix C: Debug Flowchart

```
Plugin fails to load?
├── Check server console for stack trace
│   ├── NullPointerException → §2.1 (command not in plugin.yml)
│   ├── ClassNotFoundException → §5.2 (wrong main class path)
│   ├── NoClassDefFoundError → §2.2 (missing shaded dep) or §1.3 (missing repo)
│   └── InvalidDescriptionException → §5.1 (plugin.yml not at JAR root)
│
Plugin loads but crashes at runtime?
├── ConcurrentModificationException → §2.5 (use ConcurrentHashMap)
├── NumberFormatException → §6.1 (validate numeric input)
├── ClassCastException → §2.3 (Paper API shaded into JAR)
├── IllegalArgumentException (Material) → §2.4 (pre-1.13 material name)
└── SQLITE_BUSY → §7.2 (enable WAL mode, limit to 1 writer)
│
Plugin works but has bugs?
├── Items duplicating → §3.1 (cancel inventory clicks)
├── Economy double-spend → §3.2 (atomic check-and-deduct)
├── Memory increasing → §3.4 (cancel scheduled tasks)
├── Intermittent NPE → §3.3 (check isOnline() after async)
└── TPS drops on join → §7.3 (async database queries)
```

---

---

## 10. Systematic Debugging Methodology

### 10.1 Tick Freeze Diagnosis

When the server freezes (TPS drops to 0, players time out), you need to find the cause fast:

**Step 1: Check if it's a single plugin or the server itself:**
```bash
# If the server process exists but doesn't respond:
# 1. Take a thread dump (no restart needed)
jstack -l $(pgrep -f paper.jar) > threaddump_$(date +%s).txt

# 2. Look for threads in RUNNABLE state that aren't making progress
grep "RUNNABLE" threaddump_$(date +%s).txt | head -20

# 3. Look for deadlocks
grep -A 20 "deadlock" threaddump_$(date +%s).txt
```

**Step 2: Interpret the thread dump:**
```
"Server thread" #31 prio=5 RUNNABLE
    at com.yourplugin.managers.PlayerDataManager.loadPlayerSync(PlayerDataManager.java:45)
    at com.yourplugin.listeners.PlayerJoinListener.onJoin(PlayerJoinListener.java:23)
    at sun.reflect.GeneratedMethodAccessor53.invoke(Unknown Source)
    ...
    - locked <0x00000007c1234567> (a java.lang.Object)
```

The key line is the top of your plugin code's stack trace. If it's in a database call, the DB connection is hung or the query is slow. If it's in a `synchronized` block, there's lock contention. If it's in an infinite loop, that loop has no exit condition.

**Step 3: Use spark for live diagnosis (if the server is still partially responsive):**
```bash
/spark profiler start --thread * --timeout 30
# Look for methods consuming disproportionate CPU time
```

### 10.2 Memory Leak Detection

A plugin that slowly consumes more memory until the server OOMs:

**Symptom:** Server runs fine for hours/days, then memory climbs to Xmx and GC thrashing begins.

**Diagnosis:**
```bash
# 1. Take a heap dump BEFORE the OOM (eclipse MAT or jcmd)
jcmd $(pgrep -f paper.jar) GC.heap_dump /tmp/heap_before_oom.hprof

# 2. Analyze with Eclipse MAT:
#    - Open the heap dump
#    - Run "Leak Suspects Report"
#    - Look at "Dominator Tree" — what's holding the most retained memory?
```

**Common plugin memory leak patterns:**
1. **Listener registered per-player, never unregistered** → `HandlerList` holds references to every listener instance
2. **Static Map that only grows** → `static Map<UUID, PlayerData>` where entries are never removed when players quit
3. **BukkitTask never cancelled** → Each task holds a reference to its owning plugin and runnable
4. **ClassLoader leak from /reload** → Static fields from old plugin instances prevent GC of the old ClassLoader

**Prevention:**
```java
// Monitor your cache sizes — alert if they grow unboundedly
private void monitorCacheSize() {
    Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, () -> {
        int cacheSize = playerCache.size();
        int onlinePlayers = Bukkit.getOnlinePlayers().size();

        if (cacheSize > onlinePlayers * 3) {
            plugin.getLogger().warning("Cache size anomaly: " + cacheSize
                + " cached, " + onlinePlayers + " online. Possible memory leak.");
        }
    }, 1200L, 1200L); // Every minute
}
```

### 10.3 GC Pause Troubleshooting

When TPS drops coincide with GC pauses:

```bash
# Enable GC logging
-XX:+PrintGCDetails -XX:+PrintGCDateStamps -Xloggc:/var/log/minecraft/gc.log

# Analyze GC log
# Look for:
# - Full GC frequency: should be <1 per hour under normal load
# - GC pause duration: should be <100ms for G1 young collections
# - Heap occupancy after GC: should drop significantly; if it stays near 100%, you need more heap

# Quick GC stats:
jstat -gcutil $(pgrep -f paper.jar) 1000 10
# S0 S1 E O M CCS YGC YGCT FGC FGCT GCT
# 0.0 45.3 78.1 62.4 95.2 89.1 142 3.45 2 0.82 4.27
#                                      FGC=2 Full GCs in this interval — WARNING
```

### 10.4 Thread Dump Interpretation Quick Reference

| Thread Name Pattern | What It Means | Action |
|--------------------|---------------|--------|
| `Server thread` | Main game loop | If stuck, check stack trace for blocking operations |
| `Craft Scheduler Thread` | Bukkit async scheduler | If many stuck, you have too many sync tasks queued |
| `ForkJoinPool.commonPool` | CompletableFuture workers | If all threads are stuck, you're blocking the async pool |
| `HikariPool-*` | Database connection pool | If threads are waiting for connections, increase pool size or fix leaks |
| `Netty Epoll Server` | Network I/O | If stuck, check for network issues or packet handling bugs |
| `pool-*-thread-*` | Custom thread pools | Identify which plugin created them |
| `Finalizer` | JVM finalizer thread | If active, objects with `finalize()` methods are queued — avoid finalize() |
| `GC task thread` | Garbage collection | Normal — multiple threads means parallel GC is working |

---

## 11. Production Debugging Without Restarting

### 11.1 Hot Patching via Scripting

When you can't restart the server but need to fix a live issue:

```java
// Ship a DebugCommand that lets you inspect and modify state at runtime
public class DebugCommand implements CommandExecutor {
    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!sender.hasPermission("plugin.debug")) return true;

        switch (args[0]) {
            case "cache-size" -> sender.sendMessage("Cache size: " + plugin.getPlayerCache().size());
            case "pool-stats" -> plugin.getDatabaseManager().logPoolStats();
            case "clear-cache" -> {
                int removed = plugin.getPlayerCache().size();
                plugin.getPlayerCache().clear();
                sender.sendMessage("Cleared " + removed + " cached entries.");
            }
            case "dump-threads" -> {
                Thread.getAllStackTraces().forEach((thread, stack) -> {
                    sender.sendMessage(thread.getName() + " " + thread.getState());
                    for (StackTraceElement frame : stack) {
                        if (frame.getClassName().startsWith("com.yourplugin")) {
                            sender.sendMessage("  → " + frame);
                        }
                    }
                });
            }
        }
        return true;
    }
}
```

### 11.2 Always-On Diagnostic Logging

Instrument critical paths with low-overhead diagnostic logging that can be toggled at runtime:

```java
public class DiagnosticsManager {
    private volatile boolean diagnosticMode = false;
    private final ConcurrentHashMap<String, Long> operationTimings = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AtomicInteger> operationCounts = new ConcurrentHashMap<>();

    public void toggle() {
        diagnosticMode = !diagnosticMode;
        plugin.getLogger().info("Diagnostic mode: " + (diagnosticMode ? "ON" : "OFF"));
    }

    public void recordOperation(String name, long durationMs) {
        if (!diagnosticMode) return;
        operationTimings.merge(name, durationMs, Long::sum);
        operationCounts.computeIfAbsent(name, k -> new AtomicInteger()).incrementAndGet();
    }

    public void report() {
        operationTimings.forEach((name, totalTime) -> {
            int count = operationCounts.getOrDefault(name, new AtomicInteger(0)).get();
            double avg = count > 0 ? (double) totalTime / count : 0;
            plugin.getLogger().info(String.format("  %s: %d calls, %.2fms avg", name, count, avg));
        });
        operationTimings.clear();
        operationCounts.clear();
    }
}

// Usage:
long start = System.nanoTime();
try {
    performOperation();
} finally {
    long duration = (System.nanoTime() - start) / 1_000_000;
    diagnostics.recordOperation("performOperation", duration);
}
```

---

*End of Minecraft Plugin Error Encyclopedia*
*Paper 1.21.4 · Java 21*

# Minecraft Plugin Error Encyclopedia
## For AI-Assisted Plugin Development Teams

> **How to use this document:** Press `Ctrl+F` and paste your exact error message. Every entry includes the raw error text, root cause, bad code, fixed code, and prevention strategy. All code targets **Paper 1.21.4 / Java 21** with **Maven** as the build system.

---

## Table of Contents

1. [Compilation Errors](#1-compilation-errors)
2. [Runtime Crashes](#2-runtime-crashes)
3. [Logic Bugs](#3-logic-bugs-compile-but-break)
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

**Severity:** 🔴 CRITICAL  
**Category:** Compilation

**Symptoms:**
```
error: cannot find symbol
    symbol:   method getPlayer(String)
    location: class Server
```
Occurs at compile time when referencing a method that was removed or renamed between API versions.

**Root Cause:**  
AI models are trained on code spanning Bukkit 1.8 through 1.21. They frequently emit method calls that existed in older versions but were removed or replaced. `Bukkit.getServer().getPlayer(String)` still exists, but many surrounding utility methods (e.g., `Bukkit.getOfflinePlayers()` used as a lookup, `Player.getItemInHand()` without specifying hand) have been deprecated and removed in Paper 1.21.x. The AI does not track which version removed which method — it pattern-matches on frequency of appearance in training data.

**Bad Code (What AI Generates):**
```java
// 1.8-era method — removed in modern Paper
Player target = Bukkit.getPlayer(args[0]);
ItemStack held = player.getItemInHand(); // removed — no hand specified
player.sendMessage(ChatColor.RED + "You are holding: " + held.getType());
```

**Good Code (The Fix):**
```java
// Modern Paper 1.21.4
Player target = Bukkit.getPlayerExact(args[0]); // exact match, still present
ItemStack held = player.getInventory().getItemInMainHand(); // explicit hand
player.sendMessage(net.kyori.adventure.text.Component.text("You are holding: " + held.getType())
    .color(net.kyori.adventure.text.format.NamedTextColor.RED));
```

**Prevention Strategy:**
- In your prompt: *"Target Paper 1.21.4 API only. Do not use any method that was deprecated before 1.16."*
- Code review checklist: `[ ]` Grep for `getItemInHand()`, `getPlayer(String)` without null check, `ChatColor` (legacy).
- Architecture decision: Centralise all player lookups in a `PlayerUtils` class — one place to audit.

**Related Errors:** §1.10 (Deprecated API), §4.1 (Paper vs Spigot mixups), §4.3 (Adventure confusion)

---

## 1.2 Class Is Public, Should Be Declared in File Named X

**Severity:** 🔴 CRITICAL  
**Category:** Compilation

**Symptoms:**
```
error: class PluginMain is public, should be declared in a file named PluginMain.java
```
Occurs immediately on `mvn compile`. The entire file fails to compile.

**Root Cause:**  
AI assistants sometimes generate a class name that does not match the filename it writes the code into. This happens when the AI decides mid-generation to rename the class (e.g., from `MyPlugin` to `PluginMain`) but forgets to update the filename it declared at the top of its response. It also happens when the AI generates a second public class inside a file that already has a public class.

**Bad Code (What AI Generates):**
```java
// File: MyPlugin.java  ← filename
public class PluginMain extends JavaPlugin {  // ← class name mismatch
    @Override
    public void onEnable() { }
}
```

**Good Code (The Fix):**
```java
// File: MyPlugin.java
public class MyPlugin extends JavaPlugin {  // class name matches filename
    @Override
    public void onEnable() { }
}
```

**Prevention Strategy:**
- In your prompt: *"The main class must be named exactly `MyPlugin` and live in `MyPlugin.java`."*
- Code review checklist: `[ ]` Verify every public class name matches its filename before compiling.
- Architecture decision: Establish a naming convention document and include it in every AI prompt as a one-line rule.

**Related Errors:** §5.1 (Wrong main class path in plugin.yml)

---

## 1.3 Package Does Not Exist

**Severity:** 🔴 CRITICAL  
**Category:** Compilation

**Symptoms:**
```
error: package org.bukkit does not exist
error: package com.destroystokyo.paper does not exist
error: package io.papermc.paper does not exist
```
Occurs when the Paper API JAR is not on the compile classpath.

**Root Cause:**  
The AI generates correct import statements, but the `pom.xml` it produces either omits the Paper dependency entirely, uses the wrong `groupId`/`artifactId`, references a non-existent repository, or (critically) marks the dependency as `<scope>compile</scope>` instead of `<scope>provided</scope>`. When scope is wrong the build may succeed locally but the JAR balloons to 50 MB and still fails on servers with a different Paper version.

**Bad Code (What AI Generates):**
```xml
<!-- pom.xml — wrong: missing repository, wrong scope -->
<dependency>
    <groupId>org.bukkit</groupId>
    <artifactId>bukkit</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <scope>compile</scope>  <!-- WRONG: should be provided -->
</dependency>
```

**Good Code (The Fix):**
```xml
<!-- pom.xml — correct Paper dependency -->
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
        <scope>provided</scope>  <!-- CORRECT: server provides this at runtime -->
    </dependency>
</dependencies>
```

**Prevention Strategy:**
- In your prompt: *"Use Maven. Paper API must be `<scope>provided</scope>`. Include the PaperMC repository."*
- Code review checklist: `[ ]` Every server-side API (Paper, Vault, LuckPerms, PlaceholderAPI) must be `provided`, never `compile`.
- Architecture decision: Keep a canonical `pom.xml` template in your team's Git repo and tell the AI to use it as a base.

**Related Errors:** §9.1 (Missing provided scope), §9.2 (Unshaded dependencies), §9.3 (Wrong repository)

---

## 1.4 Malformed plugin.yml Causing Illegal Start of Expression

**Severity:** 🔴 CRITICAL  
**Category:** Compilation / Load

**Symptoms:**
```
error: illegal start of expression
```
Or at server startup:
```
[ERROR] Could not load 'plugins/MyPlugin.jar': Invalid plugin.yml
org.yaml.snakeyaml.scanner.ScannerException: mapping values are not allowed here
```

**Root Cause:**  
AI models frequently produce subtly malformed YAML. The most common mistakes are: using tabs instead of spaces for indentation (YAML forbids tabs), omitting the space after a colon (`key:value` instead of `key: value`), misaligning nested keys, and wrapping values in unnecessary quotes that then contain unescaped special characters. The Java compiler error `illegal start of expression` is a red herring — it comes from the Maven resource plugin trying to filter the YAML and choking on it, not from Java source.

**Bad Code (What AI Generates):**
```yaml
# plugin.yml — BROKEN (tab indentation, missing space after colon)
name:MyPlugin
version:1.0
main:com.example.MyPlugin
commands:
	reload:         # ← TAB character — YAML forbids this
    description:Reloads the plugin
```

**Good Code (The Fix):**
```yaml
# plugin.yml — CORRECT
name: MyPlugin
version: 1.0
main: com.example.myplugin.MyPlugin
api-version: '1.21'
description: A sample plugin
author: YourName

commands:
  reload:
    description: Reloads the plugin configuration
    usage: /<command>
    permission: myplugin.reload

permissions:
  myplugin.reload:
    description: Allows reloading the plugin
    default: op
```

**Prevention Strategy:**
- In your prompt: *"Use 2-space indentation in plugin.yml. Never use tabs. Always include `api-version: '1.21'`."*
- Code review checklist: `[ ]` Run `python3 -c "import yaml; yaml.safe_load(open('src/main/resources/plugin.yml'))"` before every build.
- Architecture decision: Add a YAML lint step to your CI pipeline.

**Related Errors:** §5.1–§5.5 (All plugin.yml errors)

---

## 1.5 Method Does Not Override or Implement a Method from a Supertype

**Severity:** 🔴 CRITICAL  
**Category:** Compilation

**Symptoms:**
```
error: method does not override or implement a method from a supertype
    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args)
```

**Root Cause:**  
The AI adds `@Override` to a method whose signature does not exactly match the parent class or interface. The most common cause is a wrong parameter type — for example, writing `Command cmd` when the interface expects `org.bukkit.command.Command`, or writing `String label` when the parameter was renamed in a newer API version. It also occurs when the AI implements an interface method that was removed in a newer Paper version (e.g., old `TabCompleter` signatures).

**Bad Code (What AI Generates):**
```java
public class MyCommand implements CommandExecutor {
    @Override
    public boolean onCommand(CommandSender sender, Command command, 
                             String label, String[] args, boolean async) { // ← extra param
        return true;
    }
}
```

**Good Code (The Fix):**
```java
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public class MyCommand implements CommandExecutor {
    @Override
    public boolean onCommand(CommandSender sender, Command command,
                             String label, String[] args) { // exact signature
        return true;
    }
}
```

**Prevention Strategy:**
- In your prompt: *"Always check the exact method signature from the Paper 1.21.4 Javadoc before adding `@Override`."*
- Code review checklist: `[ ]` Every `@Override` annotation must have a corresponding method in the parent with an identical signature.
- Architecture decision: Use an IDE (IntelliJ IDEA) with Paper API attached — it will flag wrong `@Override` instantly.

**Related Errors:** §1.1 (Cannot find symbol), §4.1 (API mixups)

---

## 1.6 Incompatible Types

**Severity:** 🟡 MAJOR  
**Category:** Compilation

**Symptoms:**
```
error: incompatible types: int cannot be converted to String
error: incompatible types: String cannot be converted to int
error: incompatible types: Object cannot be converted to Player
```

**Root Cause:**  
AI models frequently omit explicit type conversions, especially when mixing config values (which return `Object`), command arguments (which are `String[]`), and Bukkit API calls that return broad types like `Entity` or `Object`. The model "knows" the value is an int but forgets to call `Integer.parseInt()`, or it retrieves a config value as `Object` and tries to assign it directly to `int`.

**Bad Code (What AI Generates):**
```java
// Config returns Object, not int
int maxPlayers = plugin.getConfig().get("max-players"); // incompatible types

// args[] is String[], not int
int amount = args[1]; // incompatible types

// getEntity() returns Entity, not Player
Player player = event.getEntity(); // incompatible types
```

**Good Code (The Fix):**
```java
// Use typed config getter
int maxPlayers = plugin.getConfig().getInt("max-players", 20);

// Parse string argument
int amount;
try {
    amount = Integer.parseInt(args[1]);
} catch (NumberFormatException e) {
    sender.sendMessage("Amount must be a number.");
    return true;
}

// Check type before casting
if (event.getEntity() instanceof Player player) { // Java 16+ pattern matching
    player.sendMessage("You triggered the event.");
}
```

**Prevention Strategy:**
- In your prompt: *"Always use typed getters from ConfigurationSection (getInt, getString, getBoolean). Never cast config values manually."*
- Code review checklist: `[ ]` Every `(Player)` cast must be preceded by `instanceof`. `[ ]` Every `args[n]` used as a number must go through `Integer.parseInt` in a try-catch.
- Architecture decision: Create a `ConfigUtils` helper that wraps all config reads with defaults and type safety.

**Related Errors:** §2.3 (ClassCastException), §6.2 (Integer parsing), §3.4 (Config null bugs)

---

## 1.7 Non-Static Variable Cannot Be Referenced from a Static Context

**Severity:** 🔴 CRITICAL  
**Category:** Compilation

**Symptoms:**
```
error: non-static variable this cannot be referenced from a static context
error: non-static variable plugin cannot be referenced from a static context
```

**Root Cause:**  
AI models frequently generate a static `getInstance()` singleton pattern for the main plugin class, then reference instance fields from static methods. This is a fundamental Java mistake that the AI makes because it sees the singleton pattern used in many Bukkit tutorials, but those tutorials often have subtle bugs that the AI replicates. The deeper issue is that the AI conflates "globally accessible" with "static."

**Bad Code (What AI Generates):**
```java
public class MyPlugin extends JavaPlugin {
    private static MyPlugin instance;
    private ConfigManager configManager; // instance field

    public static void reload() {
        configManager.reload(); // ERROR: non-static field in static method
    }

    public static MyPlugin getInstance() {
        return instance;
    }
}
```

**Good Code (The Fix):**
```java
public class MyPlugin extends JavaPlugin {
    private static MyPlugin instance;
    private ConfigManager configManager;

    @Override
    public void onEnable() {
        instance = this;
        this.configManager = new ConfigManager(this);
    }

    // Instance method — not static
    public void reload() {
        this.configManager.reload();
    }

    // Only the accessor is static
    public static MyPlugin getInstance() {
        return instance;
    }

    public ConfigManager getConfigManager() {
        return configManager;
    }
}
```

**Prevention Strategy:**
- In your prompt: *"Do not make manager fields static. Only `getInstance()` should be static. All manager access should go through instance methods."*
- Code review checklist: `[ ]` No manager field should be `static`. `[ ]` No business logic should live in a `static` method.
- Architecture decision: Prefer constructor injection over the singleton pattern entirely — pass `plugin` to every manager constructor.

**Related Errors:** §2.1 (NullPointerException from uninitialized static instance), §3.5 (Task cancellation failures)

---

## 1.8 Generic Array Creation

**Severity:** 🟡 MAJOR  
**Category:** Compilation

**Symptoms:**
```
error: generic array creation
    new ArrayList<String>[10]
```

**Root Cause:**  
Java's type erasure means you cannot create arrays of generic types. AI models generate this when trying to create arrays of collections (e.g., `HashMap<UUID, Integer>[]`) for per-world or per-team storage. The AI knows arrays and generics individually but does not always apply the constraint that they cannot be combined.

**Bad Code (What AI Generates):**
```java
// Trying to create an array of generic maps
HashMap<UUID, Integer>[] playerScores = new HashMap<UUID, Integer>[10]; // ERROR
```

**Good Code (The Fix):**
```java
// Use a List of Maps, or a Map of Maps
Map<Integer, Map<UUID, Integer>> playerScores = new HashMap<>();

// Or if you truly need array-like indexed access:
@SuppressWarnings("unchecked")
Map<UUID, Integer>[] playerScores = new HashMap[10]; // raw type, suppress warning
for (int i = 0; i < 10; i++) {
    playerScores[i] = new HashMap<>();
}
```

**Prevention Strategy:**
- In your prompt: *"Never create arrays of generic types. Use `List<Map<...>>` or `Map<Integer, Map<...>>` instead."*
- Code review checklist: `[ ]` Search for `new.*\[` — any array creation with a generic type parameter is a bug.

**Related Errors:** §1.9 (Unchecked cast warnings)

---

## 1.9 Unchecked Cast Warnings That Should Be Fixed

**Severity:** 🟢 MINOR  
**Category:** Compilation

**Symptoms:**
```
warning: [unchecked] unchecked cast
    required: Map<String,Object>
    found:    Object
```
These are warnings, not errors, but they indicate real `ClassCastException` risks at runtime.

**Root Cause:**  
AI models frequently cast `Object` to a generic type without checking. This is common when reading from `ConfigurationSection.getValues()`, deserializing from YAML, or reading from `PersistentDataContainer`. The cast compiles because of type erasure but can throw `ClassCastException` at runtime if the actual type doesn't match.

**Bad Code (What AI Generates):**
```java
// Reading config section — unchecked cast
Map<String, Object> data = (Map<String, Object>) config.get("players"); // unchecked

// Reading PDC
List<String> tags = (List<String>) container.get(key, PersistentDataType.LIST.strings()); // wrong API
```

**Good Code (The Fix):**
```java
// Use the typed API — no cast needed
ConfigurationSection section = config.getConfigurationSection("players");
if (section != null) {
    for (String key : section.getKeys(false)) {
        String value = section.getString(key, "");
    }
}

// PDC with correct typed API (Paper 1.21.4)
PersistentDataContainer container = entity.getPersistentDataContainer();
NamespacedKey key = new NamespacedKey(plugin, "tags");
List<String> tags = container.getOrDefault(key, PersistentDataType.LIST.strings(), List.of());
```

**Prevention Strategy:**
- In your prompt: *"Never cast the result of `config.get()`. Always use `getInt()`, `getString()`, `getConfigurationSection()`, etc."*
- Code review checklist: `[ ]` Search for `(Map<` and `(List<` — every occurrence is a potential runtime crash.

**Related Errors:** §2.3 (ClassCastException), §4.4 (PDC misuse)

---

## 1.10 Deprecated API Usage

**Severity:** 🟡 MAJOR  
**Category:** Compilation

**Symptoms:**
```
warning: [deprecation] sendMessage(String) in Player has been deprecated
warning: [deprecation] ChatColor in org.bukkit has been deprecated
warning: [deprecation] getItemInHand() in HumanEntity has been deprecated
```

**Root Cause:**  
Paper has been migrating from the legacy Bukkit API (string-based messages, `ChatColor`, `getItemInHand()`) to the Adventure API (Components, `NamedTextColor`, `getInventory().getItemInMainHand()`). AI models trained on older code emit the deprecated forms because they appear far more frequently in training data. These compile and run on current Paper but will be removed in a future version and produce ugly output on modern clients.

**Bad Code (What AI Generates):**
```java
import org.bukkit.ChatColor;

player.sendMessage(ChatColor.RED + "You don't have permission!");
player.sendMessage("&cYou don't have permission!"); // raw color codes
Bukkit.broadcastMessage(ChatColor.GOLD + "[Server] Restarting in 30 seconds.");
```

**Good Code (The Fix):**
```java
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.minimessage.MiniMessage;

// Simple colored message
player.sendMessage(Component.text("You don't have permission!").color(NamedTextColor.RED));

// MiniMessage for complex formatting
player.sendMessage(MiniMessage.miniMessage().deserialize("<red>You don't have permission!"));

// Broadcast
Bukkit.broadcast(Component.text("[Server] Restarting in 30 seconds.").color(NamedTextColor.GOLD));
```

**Prevention Strategy:**
- In your prompt: *"Use the Adventure API (Component, MiniMessage) for all messages. Never use `ChatColor` or `sendMessage(String)`."*
- Code review checklist: `[ ]` Zero occurrences of `ChatColor` in source. `[ ]` Zero occurrences of `sendMessage(String)`.
- Architecture decision: Create a `MessageUtil` class that wraps MiniMessage deserialization — one place to update when the API changes.

**Related Errors:** §4.3 (Adventure Component confusion), §1.1 (Cannot find symbol)

---

## 1.11 Raw Type Usage (ArrayList Without Generics)

**Severity:** 🟡 MAJOR  
**Category:** Compilation

**Symptoms:**
```
warning: [rawtypes] found raw type: ArrayList
    ArrayList players = new ArrayList();
warning: [unchecked] unchecked call to add(E) as a member of the raw type ArrayList
```

**Root Cause:**  
AI models sometimes generate pre-generics Java code, especially when producing utility methods or when the generic type is complex. Raw types bypass compile-time type checking entirely, meaning type errors that should be caught at compile time become `ClassCastException` at runtime.

**Bad Code (What AI Generates):**
```java
ArrayList players = new ArrayList(); // raw type
players.add(player);
Player p = (Player) players.get(0); // unchecked cast — ClassCastException risk
```

**Good Code (The Fix):**
```java
List<Player> players = new ArrayList<>(); // typed, diamond operator
players.add(player);
Player p = players.get(0); // no cast needed — type-safe
```

**Prevention Strategy:**
- In your prompt: *"Always use generic types. Never use raw `ArrayList`, `HashMap`, `List`, etc."*
- Code review checklist: `[ ]` Zero raw type warnings in `mvn compile` output.

**Related Errors:** §1.9 (Unchecked cast), §2.3 (ClassCastException)

---

## 1.12 Diamond Operator Misuse

**Severity:** 🟢 MINOR  
**Category:** Compilation

**Symptoms:**
```
error: cannot infer type arguments for HashMap<>
    private Map<String, List<UUID>> data = new HashMap<>(); // fine
    // but:
    private static final Map<String, List<UUID>> DATA = new HashMap<String, List<UUID>>() {{ put(...); }};
```

**Root Cause:**  
AI models sometimes use the diamond operator `<>` in contexts where Java cannot infer the type — specifically with anonymous class instantiation (the double-brace initializer pattern). This is also a logic bug because double-brace initialization creates an anonymous subclass, which holds a reference to the enclosing instance and causes memory leaks.

**Bad Code (What AI Generates):**
```java
// Double-brace initializer — memory leak + diamond inference error
Map<String, Integer> defaults = new HashMap<>() {{
    put("max-players", 20);
    put("timeout", 30);
}};
```

**Good Code (The Fix):**
```java
// Explicit initialization — no anonymous class, no memory leak
Map<String, Integer> defaults = new HashMap<>();
defaults.put("max-players", 20);
defaults.put("timeout", 30);

// Or Java 9+ immutable map (if you don't need to modify it)
Map<String, Integer> defaults = Map.of(
    "max-players", 20,
    "timeout", 30
);
```

**Prevention Strategy:**
- In your prompt: *"Never use double-brace initializers `{{ }}`. Initialize collections explicitly."*
- Code review checklist: `[ ]` Search for `{{` — every occurrence is a potential memory leak.

**Related Errors:** §2.6 (OutOfMemoryError), §1.8 (Generic array creation)

---

## 1.13 Lambda Expression Type Inference Failures

**Severity:** 🟡 MAJOR  
**Category:** Compilation

**Symptoms:**
```
error: incompatible types: cannot infer type-variable(s) T
error: method reference is ambiguous
```

**Root Cause:**  
AI models generate lambda expressions where the target functional interface is ambiguous — most commonly when passing a lambda to an overloaded method where multiple overloads accept different functional interfaces. This is common with Bukkit's scheduler API and with streams.

**Bad Code (What AI Generates):**
```java
// Ambiguous — runTask has overloads accepting Runnable and BukkitRunnable
Bukkit.getScheduler().runTask(plugin, () -> {
    // compiler can't determine which overload
});

// Type inference failure in stream
players.stream()
    .map(p -> p.getName()) // fine
    .collect(Collectors.toList()); // fine, but:
var result = players.stream().map(p -> p.getName()); // var + stream = inference failure
```

**Good Code (The Fix):**
```java
// Explicit Runnable cast removes ambiguity
Bukkit.getScheduler().runTask(plugin, (Runnable) () -> {
    player.sendMessage("Running on main thread.");
});

// Or use a method reference where possible
Bukkit.getScheduler().runTask(plugin, this::doSomething);

// Explicit type for var + stream
Stream<String> names = players.stream().map(Player::getName);
```

**Prevention Strategy:**
- In your prompt: *"When passing lambdas to overloaded methods, cast to the explicit functional interface type."*
- Code review checklist: `[ ]` Every lambda passed to a scheduler method should have an explicit cast or use a named `Runnable` variable.

**Related Errors:** §4.5 (Wrong scheduler API), §2.4 (IllegalStateException async)

---

## 1.14 Try-With-Resources Syntax Errors

**Severity:** 🟡 MAJOR  
**Category:** Compilation

**Symptoms:**
```
error: try-with-resources is not supported in -source 7
error: variable used in try-with-resources must implement AutoCloseable
```

**Root Cause:**  
AI models sometimes generate try-with-resources for objects that don't implement `AutoCloseable`, or they generate the syntax incorrectly (e.g., putting the resource declaration outside the parentheses). This is common with database connections and file I/O.

**Bad Code (What AI Generates):**
```java
// Resource declared outside try — not auto-closed
Connection conn = dataSource.getConnection();
try (conn) { // ERROR in Java < 9: variable must be declared in try header
    // ...
}

// Non-AutoCloseable in try-with-resources
try (Player player = event.getPlayer()) { // Player doesn't implement AutoCloseable
    // ...
}
```

**Good Code (The Fix):**
```java
// Correct: declare AND assign inside the try header
try (Connection conn = dataSource.getConnection();
     PreparedStatement stmt = conn.prepareStatement("SELECT * FROM players WHERE uuid = ?")) {
    stmt.setString(1, uuid.toString());
    ResultSet rs = stmt.executeQuery();
    // process results
} catch (SQLException e) {
    plugin.getLogger().severe("Database error: " + e.getMessage());
}
// conn and stmt are automatically closed here
```

**Prevention Strategy:**
- In your prompt: *"Always declare database connections inside try-with-resources headers, never outside."*
- Code review checklist: `[ ]` Every `Connection`, `PreparedStatement`, and `ResultSet` must be inside a try-with-resources.

**Related Errors:** §7.4 (Resource leaks), §7.1 (SQL injection)

---

## 1.15 Resource Not Found (getResource() Returning Null)

**Severity:** 🟡 MAJOR  
**Category:** Compilation / Runtime

**Symptoms:**
```
NullPointerException: Cannot invoke "java.io.InputStream.read()" because the return value of 
"org.bukkit.plugin.Plugin.getResource(String)" is null
```
Or at build time, the resource simply isn't in the JAR.

**Root Cause:**  
AI models generate `getResource("config.yml")` or `saveDefaultConfig()` calls but place the resource file in the wrong directory in the Maven project structure. In Maven, resources must be in `src/main/resources/`. AI models sometimes put them in `src/resources/`, `resources/`, or the project root.

**Bad Code (What AI Generates):**
```
MyPlugin/
├── src/
│   └── main/
│       └── java/
│           └── com/example/MyPlugin.java
├── resources/          ← WRONG location
│   └── config.yml
└── pom.xml
```

**Good Code (The Fix):**
```
MyPlugin/
├── src/
│   └── main/
│       ├── java/
│       │   └── com/example/MyPlugin.java
│       └── resources/          ← CORRECT location
│           ├── plugin.yml
│           └── config.yml
└── pom.xml
```

```java
// In plugin code — always check for null
@Override
public void onEnable() {
    saveDefaultConfig(); // copies config.yml from JAR to plugins/MyPlugin/ if absent
    // getConfig() is now safe to call
}
```

**Prevention Strategy:**
- In your prompt: *"All resource files (plugin.yml, config.yml, messages.yml) must be in `src/main/resources/`."*
- Code review checklist: `[ ]` Verify `src/main/resources/plugin.yml` exists. `[ ]` Verify `src/main/resources/config.yml` exists if `saveDefaultConfig()` is called.

**Related Errors:** §5.1 (Wrong main class path), §3.4 (Config null bugs)

---

# 2. Runtime Crashes

---

## 2.1 NullPointerException in Event Handlers

**Severity:** 🔴 CRITICAL  
**Category:** Runtime

**Symptoms:**
```
[ERROR] Could not pass event PlayerMoveEvent to MyPlugin v1.0
java.lang.NullPointerException: Cannot invoke "org.bukkit.entity.Player.getName()" 
because "player" is null
    at com.example.listeners.PlayerMoveListener.onMove(PlayerMoveListener.java:34)
```

**Root Cause:**  
AI models assume event handler parameters are always non-null. In practice, `event.getPlayer()` can return null in edge cases (e.g., the player disconnected between the event being queued and the handler running). More commonly, the NPE comes from a manager or dependency that was not initialized before the listener was registered — the listener fires, calls `plugin.getPlayerDataManager().getData(player)`, and `getPlayerDataManager()` returns null because `onEnable()` hasn't finished initializing.

**Bad Code (What AI Generates):**
```java
@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    Player player = event.getPlayer();
    PlayerData data = plugin.getPlayerDataManager().getData(player); // NPE if manager null
    if (data.isAFK()) { // NPE if data null
        player.sendMessage("You are AFK.");
    }
}
```

**Good Code (The Fix):**
```java
@EventHandler
public void onPlayerMove(PlayerMoveEvent event) {
    Player player = event.getPlayer();
    // player is guaranteed non-null by the event contract, but managers may not be ready
    PlayerDataManager pdm = plugin.getPlayerDataManager();
    if (pdm == null) return; // plugin still loading or already disabled

    PlayerData data = pdm.getData(player);
    if (data == null) return; // player data not yet loaded (async load in progress)

    if (data.isAFK()) {
        player.sendMessage(Component.text("You are AFK.").color(NamedTextColor.GRAY));
    }
}
```

**Prevention Strategy:**
- In your prompt: *"Every event handler must null-check manager references before use. Every data lookup must null-check the result."*
- Code review checklist: `[ ]` Every `plugin.getXxxManager()` call in a listener must be null-checked. `[ ]` Every data lookup result must be null-checked.
- Architecture decision: Initialize all managers in `onEnable()` before registering any listeners. Use a startup guard: `if (!isEnabled()) return;` at the top of every handler.

**Related Errors:** §3.4 (Config null bugs), §3.7 (Offline player assumptions), §1.7 (Static context)

---

## 2.2 ConcurrentModificationException Iterating Online Players

**Severity:** 🔴 CRITICAL  
**Category:** Runtime

**Symptoms:**
```
java.util.ConcurrentModificationException
    at java.util.ArrayList$Itr.checkForComodification(ArrayList.java:911)
    at com.example.managers.BroadcastManager.broadcastToAll(BroadcastManager.java:45)
```

**Root Cause:**  
AI models generate code that iterates over `Bukkit.getOnlinePlayers()` while the collection can be modified by another thread (a player joining or leaving). `Bukkit.getOnlinePlayers()` returns a view of the internal player list, not a snapshot. Modifying the collection (even indirectly, by kicking a player inside the loop) while iterating it throws `ConcurrentModificationException`.

**Bad Code (What AI Generates):**
```java
// Iterating the live collection — dangerous
for (Player player : Bukkit.getOnlinePlayers()) {
    if (someCondition(player)) {
        player.kickPlayer("You have been removed."); // modifies the collection mid-iteration
    }
}
```

**Good Code (The Fix):**
```java
// Take a snapshot first — iterate the copy
List<Player> snapshot = new ArrayList<>(Bukkit.getOnlinePlayers());
for (Player player : snapshot) {
    if (someCondition(player)) {
        player.kickPlayer("You have been removed."); // safe — iterating the copy
    }
}

// Or with streams (also safe — stream is over the snapshot)
Bukkit.getOnlinePlayers().stream()
    .filter(this::someCondition)
    .collect(Collectors.toList()) // collect to list first
    .forEach(p -> p.kickPlayer("You have been removed."));
```

**Prevention Strategy:**
- In your prompt: *"Never iterate `Bukkit.getOnlinePlayers()` directly if the loop body can add or remove players. Always copy to `new ArrayList<>(Bukkit.getOnlinePlayers())` first."*
- Code review checklist: `[ ]` Every `for (Player p : Bukkit.getOnlinePlayers())` loop that calls `kick()`, `teleport()`, or any method that could trigger a quit event must use a snapshot.

**Related Errors:** §3.8 (Race conditions), §2.4 (IllegalStateException async)

---

## 2.3 ClassCastException — Entity to Player Without instanceof

**Severity:** 🔴 CRITICAL  
**Category:** Runtime

**Symptoms:**
```
java.lang.ClassCastException: class org.bukkit.craftbukkit.v1_21_R3.entity.CraftArrow 
cannot be cast to class org.bukkit.entity.Player
    at com.example.listeners.DamageListener.onDamage(DamageListener.java:28)
```

**Root Cause:**  
AI models cast event entities directly to `Player` without checking the entity type. Events like `EntityDamageEvent`, `EntityDeathEvent`, `ProjectileHitEvent`, and `EntityInteractEvent` fire for ALL entity types, not just players. The AI generates the cast because in the context of "player damage plugin" it assumes the entity is always a player.

**Bad Code (What AI Generates):**
```java
@EventHandler
public void onEntityDamage(EntityDamageByEntityEvent event) {
    Player victim = (Player) event.getEntity();     // ClassCastException if entity is a mob
    Player attacker = (Player) event.getDamager();  // ClassCastException if attacker is arrow
    attacker.sendMessage("You hit " + victim.getName());
}
```

**Good Code (The Fix):**
```java
@EventHandler
public void onEntityDamage(EntityDamageByEntityEvent event) {
    // Java 16+ pattern matching instanceof — clean and safe
    if (!(event.getEntity() instanceof Player victim)) return;

    Entity damagerEntity = event.getDamager();
    Player attacker = null;

    if (damagerEntity instanceof Player p) {
        attacker = p;
    } else if (damagerEntity instanceof Projectile projectile
               && projectile.getShooter() instanceof Player p) {
        attacker = p;
    }

    if (attacker == null) return;
    attacker.sendMessage(Component.text("You hit " + victim.getName()));
}
```

**Prevention Strategy:**
- In your prompt: *"Every entity cast must be preceded by `instanceof`. Use Java 16 pattern matching: `if (entity instanceof Player p)`."*
- Code review checklist: `[ ]` Zero direct casts `(Player)` without a preceding `instanceof` check.

**Related Errors:** §1.6 (Incompatible types), §1.9 (Unchecked cast)

---

## 2.4 IllegalStateException — Asynchronous Entity Add / Main Thread Violation

**Severity:** 🔴 CRITICAL  
**Category:** Runtime

**Symptoms:**
```
java.lang.IllegalStateException: Asynchronous entity add!
java.lang.IllegalStateException: Cannot get property of entity on async thread
java.lang.IllegalStateException: Asynchronous player teleportation!
```

**Root Cause:**  
Bukkit's world state (entities, blocks, inventories, player positions) is not thread-safe and must only be accessed from the main server thread. AI models generate async database callbacks that then directly call Bukkit API methods — the callback runs on a thread pool thread, not the main thread, causing this crash. This is one of the most common and most dangerous AI-generated bugs.

**Bad Code (What AI Generates):**
```java
// Async task that calls Bukkit API directly — CRASH
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    PlayerData data = database.loadPlayer(uuid); // async DB call — correct
    Player player = Bukkit.getPlayer(uuid);      // Bukkit API on async thread — CRASH
    player.teleport(data.getLastLocation());     // world modification on async thread — CRASH
    player.sendMessage("Data loaded!");          // also illegal on async thread
});
```

**Good Code (The Fix):**
```java
// Async for I/O, sync callback for Bukkit API
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    PlayerData data = database.loadPlayer(uuid); // async — correct

    // Switch back to main thread for all Bukkit API calls
    Bukkit.getScheduler().runTask(plugin, () -> {
        Player player = Bukkit.getPlayer(uuid);
        if (player == null || !player.isOnline()) return; // may have disconnected
        player.teleport(data.getLastLocation());
        player.sendMessage(Component.text("Data loaded!"));
    });
});

// Paper async scheduler (preferred for Paper 1.21.4)
plugin.getServer().getAsyncScheduler().runNow(plugin, task -> {
    PlayerData data = database.loadPlayer(uuid);
    plugin.getServer().getScheduler().runTask(plugin, () -> {
        Player player = Bukkit.getPlayer(uuid);
        if (player != null) player.teleport(data.getLastLocation());
    });
});
```

**Prevention Strategy:**
- In your prompt: *"All Bukkit API calls (player, world, entity, inventory) must be on the main thread. Async tasks may only do I/O (database, HTTP). Always use a sync callback to return to the main thread."*
- Code review checklist: `[ ]` Every `runTaskAsynchronously` body must contain zero Bukkit API calls except `runTask` to switch back.
- Architecture decision: Create an `AsyncUtil.runAsync(task, callback)` helper that enforces the async→sync pattern.

**Related Errors:** §3.8 (Race conditions), §7.3 (Synchronous DB in events), §4.5 (Wrong scheduler)

---

## 2.5 StackOverflowError — Recursive Event Triggering

**Severity:** 🔴 CRITICAL  
**Category:** Runtime

**Symptoms:**
```
java.lang.StackOverflowError
    at com.example.listeners.ChatListener.onChat(ChatListener.java:22)
    at com.example.listeners.ChatListener.onChat(ChatListener.java:22)
    at com.example.listeners.ChatListener.onChat(ChatListener.java:22)
    [... repeating 1000+ times ...]
```

**Root Cause:**  
An event handler fires an action that triggers the same event again, creating infinite recursion. Classic examples: a `PlayerChatEvent` handler that calls `player.chat(message)` to modify the message (which fires `PlayerChatEvent` again), a `BlockBreakEvent` handler that breaks another block (which fires `BlockBreakEvent` again), or a `PlayerMoveEvent` handler that teleports the player (which fires `PlayerMoveEvent` again).

**Bad Code (What AI Generates):**
```java
@EventHandler
public void onChat(AsyncPlayerChatEvent event) {
    String message = event.getMessage();
    if (message.startsWith("!")) {
        event.setCancelled(true);
        // This fires AsyncPlayerChatEvent again — infinite recursion!
        event.getPlayer().chat("[Command] " + message.substring(1));
    }
}
```

**Good Code (The Fix):**
```java
@EventHandler
public void onChat(AsyncPlayerChatEvent event) {
    String message = event.getMessage();
    if (message.startsWith("!")) {
        event.setCancelled(true);
        // Modify the event directly instead of re-firing it
        String command = message.substring(1);
        // Schedule command dispatch on main thread without re-triggering chat
        Bukkit.getScheduler().runTask(plugin, () ->
            Bukkit.dispatchCommand(event.getPlayer(), command)
        );
    }
}

// For move events — use a guard flag
private final Set<UUID> teleporting = new HashSet<>();

@EventHandler
public void onMove(PlayerMoveEvent event) {
    Player player = event.getPlayer();
    if (teleporting.contains(player.getUniqueId())) return; // guard

    if (shouldTeleport(player)) {
        teleporting.add(player.getUniqueId());
        player.teleport(destination);
        teleporting.remove(player.getUniqueId());
    }
}
```

**Prevention Strategy:**
- In your prompt: *"Never call `player.chat()` inside a chat event handler. Never teleport a player inside a move event handler without a recursion guard."*
- Code review checklist: `[ ]` Every event handler that fires a Bukkit action must be checked for recursive event triggering.

**Related Errors:** §3.2 (Event cancellation confusion), §3.6 (World/location assumptions)

---

## 2.6 OutOfMemoryError — Loading Full Database Into Memory

**Severity:** 🔴 CRITICAL  
**Category:** Runtime

**Symptoms:**
```
java.lang.OutOfMemoryError: Java heap space
    at com.example.managers.PlayerDataManager.loadAll(PlayerDataManager.java:67)
```
Server becomes unresponsive, eventually crashes.

**Root Cause:**  
AI models generate `loadAll()` methods that read every row from a database table into memory at startup. On a server with 10,000+ player records, this can exhaust the JVM heap. The AI does this because it's the simplest way to make data "available" — it doesn't reason about scale.

**Bad Code (What AI Generates):**
```java
public void loadAll() {
    try (Connection conn = dataSource.getConnection();
         Statement stmt = conn.createStatement();
         ResultSet rs = stmt.executeQuery("SELECT * FROM players")) { // loads ALL rows
        while (rs.next()) {
            UUID uuid = UUID.fromString(rs.getString("uuid"));
            PlayerData data = new PlayerData(uuid, rs.getInt("kills"), rs.getInt("deaths"));
            cache.put(uuid, data); // entire database in memory
        }
    } catch (SQLException e) {
        plugin.getLogger().severe("Failed to load players: " + e.getMessage());
    }
}
```

**Good Code (The Fix):**
```java
// Load on demand — only load data for online players
public CompletableFuture<PlayerData> loadPlayer(UUID uuid) {
    return CompletableFuture.supplyAsync(() -> {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT * FROM players WHERE uuid = ?")) {
            stmt.setString(1, uuid.toString());
            ResultSet rs = stmt.executeQuery();
            if (rs.next()) {
                return new PlayerData(uuid, rs.getInt("kills"), rs.getInt("deaths"));
            }
            return new PlayerData(uuid, 0, 0); // default for new player
        } catch (SQLException e) {
            plugin.getLogger().severe("Failed to load player " + uuid + ": " + e.getMessage());
            return new PlayerData(uuid, 0, 0);
        }
    });
}

// Load when player joins, unload when player leaves
@EventHandler
public void onJoin(PlayerJoinEvent event) {
    loadPlayer(event.getPlayer().getUniqueId()).thenAccept(data -> {
        Bukkit.getScheduler().runTask(plugin, () -> cache.put(data.getUuid(), data));
    });
}

@EventHandler
public void onQuit(PlayerQuitEvent event) {
    UUID uuid = event.getPlayer().getUniqueId();
    PlayerData data = cache.remove(uuid);
    if (data != null) savePlayer(data); // async save
}
```

**Prevention Strategy:**
- In your prompt: *"Never load all database rows at startup. Load player data on `PlayerJoinEvent` and unload on `PlayerQuitEvent`."*
- Code review checklist: `[ ]` No `SELECT *` without a `WHERE` clause in startup code. `[ ]` No unbounded cache growth.

**Related Errors:** §7.3 (Synchronous DB in events), §7.2 (Connection pool exhaustion)

---

## 2.7 NoClassDefFoundError — Missing Soft Dependency

**Severity:** 🔴 CRITICAL  
**Category:** Runtime

**Symptoms:**
```
java.lang.NoClassDefFoundError: net/milkbowl/vault/economy/Economy
    at com.example.managers.EconomyManager.<init>(EconomyManager.java:15)
```
Plugin loads but crashes the moment it tries to use the optional dependency.

**Root Cause:**  
AI models generate code that imports and uses optional plugin APIs (Vault, PlaceholderAPI, LuckPerms) without checking whether those plugins are actually loaded. The class is available at compile time (because it's in the Maven `provided` scope) but not at runtime if the optional plugin isn't installed. The AI also frequently forgets to add the `softdepend` entry in `plugin.yml`.

**Bad Code (What AI Generates):**
```java
// plugin.yml — missing softdepend
// name: MyPlugin
// main: com.example.MyPlugin
// (no softdepend: [Vault])

public class EconomyManager {
    private Economy economy; // Vault class — may not exist at runtime

    public EconomyManager(Plugin plugin) {
        RegisteredServiceProvider<Economy> rsp =
            plugin.getServer().getServicesManager().getRegistration(Economy.class); // CRASH
        this.economy = rsp.getProvider();
    }
}
```

**Good Code (The Fix):**
```yaml
# plugin.yml
softdepend: [Vault, PlaceholderAPI]
```

```java
public class EconomyManager {
    private Economy economy;
    private final boolean vaultEnabled;

    public EconomyManager(Plugin plugin) {
        this.vaultEnabled = setupEconomy(plugin);
        if (!vaultEnabled) {
            plugin.getLogger().warning("Vault not found — economy features disabled.");
        }
    }

    private boolean setupEconomy(Plugin plugin) {
        if (plugin.getServer().getPluginManager().getPlugin("Vault") == null) {
            return false; // Vault not installed
        }
        RegisteredServiceProvider<Economy> rsp =
            plugin.getServer().getServicesManager().getRegistration(Economy.class);
        if (rsp == null) return false;
        this.economy = rsp.getProvider();
        return this.economy != null;
    }

    public boolean isEnabled() {
        return vaultEnabled;
    }

    public boolean deposit(Player player, double amount) {
        if (!vaultEnabled) return false;
        return economy.depositPlayer(player, amount).transactionSuccess();
    }
}
```

**Prevention Strategy:**
- In your prompt: *"For every optional plugin integration, add it to `softdepend` in plugin.yml and guard every usage with a null check on `getPlugin('PluginName')`."*
- Code review checklist: `[ ]` Every optional API import has a corresponding `softdepend` entry. `[ ]` Every optional API usage is guarded by an `isEnabled()` check.

**Related Errors:** §5.3 (Softdepend vs depend), §9.2 (Unshaded dependencies)

---

## 2.8 ArrayIndexOutOfBoundsException — args[0] Without Length Check

**Severity:** 🔴 CRITICAL  
**Category:** Runtime

**Symptoms:**
```
java.lang.ArrayIndexOutOfBoundsException: Index 0 out of bounds for length 0
    at com.example.commands.GiveCommand.onCommand(GiveCommand.java:18)
```
Triggered by typing `/give` with no arguments.

**Root Cause:**  
AI models generate command handlers that access `args[0]`, `args[1]`, etc. without first checking `args.length`. This is the single most common command bug. The AI "knows" the command needs arguments but doesn't generate the defensive length check.

**Bad Code (What AI Generates):**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    String targetName = args[0]; // CRASH if no args provided
    int amount = Integer.parseInt(args[1]); // CRASH if only one arg
    // ...
    return true;
}
```

**Good Code (The Fix):**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (args.length < 2) {
        sender.sendMessage(Component.text("Usage: /give <player> <amount>")
            .color(NamedTextColor.RED));
        return true; // return true to suppress default usage message
    }

    String targetName = args[0];
    Player target = Bukkit.getPlayerExact(targetName);
    if (target == null) {
        sender.sendMessage(Component.text("Player not found: " + targetName)
            .color(NamedTextColor.RED));
        return true;
    }

    int amount;
    try {
        amount = Integer.parseInt(args[1]);
    } catch (NumberFormatException e) {
        sender.sendMessage(Component.text("Amount must be a number.")
            .color(NamedTextColor.RED));
        return true;
    }

    // proceed with valid inputs
    return true;
}
```

**Prevention Strategy:**
- In your prompt: *"Every command handler must check `args.length` before accessing any `args[n]`. Every `Integer.parseInt` must be in a try-catch."*
- Code review checklist: `[ ]` Every `args[n]` access is preceded by `args.length > n`. `[ ]` Every `parseInt`/`parseDouble` is in a try-catch.

**Related Errors:** §6.1 (Missing args length check), §6.2 (Integer parsing), §2.9 (NumberFormatException)

---

## 2.9 NumberFormatException — Integer.parseInt on Invalid Input

**Severity:** 🟡 MAJOR  
**Category:** Runtime

**Symptoms:**
```
java.lang.NumberFormatException: For input string: "abc"
    at java.lang.Integer.parseInt(Integer.java:652)
    at com.example.commands.SetLevelCommand.onCommand(SetLevelCommand.java:24)
```

**Root Cause:**  
AI models call `Integer.parseInt()` directly on user-provided strings without wrapping in try-catch. Players can type anything as a command argument — the AI assumes valid numeric input because that's what the command is designed for, but doesn't account for malicious or accidental non-numeric input.

**Bad Code (What AI Generates):**
```java
int level = Integer.parseInt(args[0]); // crashes on "abc", "1.5", "", "-"
```

**Good Code (The Fix):**
```java
private OptionalInt parseIntArg(String input) {
    try {
        return OptionalInt.of(Integer.parseInt(input));
    } catch (NumberFormatException e) {
        return OptionalInt.empty();
    }
}

// Usage
OptionalInt levelOpt = parseIntArg(args[0]);
if (levelOpt.isEmpty()) {
    sender.sendMessage(Component.text("'" + args[0] + "' is not a valid number.")
        .color(NamedTextColor.RED));
    return true;
}
int level = levelOpt.getAsInt();
if (level < 1 || level > 100) {
    sender.sendMessage(Component.text("Level must be between 1 and 100.")
        .color(NamedTextColor.RED));
    return true;
}
```

**Prevention Strategy:**
- In your prompt: *"Wrap every `Integer.parseInt`, `Double.parseDouble`, and `Long.parseLong` in a try-catch block. Validate ranges after parsing."*
- Code review checklist: `[ ]` Zero bare `parseInt` calls outside a try-catch.

**Related Errors:** §2.8 (ArrayIndexOutOfBounds), §6.2 (Integer parsing without try-catch)

---

## 2.10 SQLException — Connection Closed or Query Timeout

**Severity:** 🔴 CRITICAL  
**Category:** Runtime

**Symptoms:**
```
java.sql.SQLException: Connection is closed
java.sql.SQLException: The connection pool has been closed
com.mysql.jdbc.exceptions.jdbc4.CommunicationsException: Communications link failure
```

**Root Cause:**  
AI models generate database code that holds a single `Connection` object as a field and reuses it across all queries. Database connections time out (MySQL default: 8 hours of inactivity), and a closed connection throws `SQLException` on the next use. The fix is connection pooling (HikariCP), which manages a pool of connections and automatically replaces dead ones.

**Bad Code (What AI Generates):**
```java
public class DatabaseManager {
    private Connection connection; // single connection — will time out

    public void connect() throws SQLException {
        connection = DriverManager.getConnection(url, user, pass);
    }

    public void savePlayer(UUID uuid, int kills) throws SQLException {
        PreparedStatement stmt = connection.prepareStatement(
            "UPDATE players SET kills = ? WHERE uuid = ?"); // CRASH after timeout
        stmt.setInt(1, kills);
        stmt.setString(2, uuid.toString());
        stmt.executeUpdate();
    }
}
```

**Good Code (The Fix):**
```java
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

public class DatabaseManager {
    private HikariDataSource dataSource;

    public void connect(String host, int port, String database, String user, String pass) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:mysql://" + host + ":" + port + "/" + database
            + "?useSSL=false&autoReconnect=true&characterEncoding=utf8");
        config.setUsername(user);
        config.setPassword(pass);
        config.setMaximumPoolSize(10);
        config.setMinimumIdle(2);
        config.setConnectionTimeout(30_000);
        config.setIdleTimeout(600_000);
        config.setMaxLifetime(1_800_000); // 30 min — less than MySQL's wait_timeout
        config.setPoolName("MyPlugin-Pool");
        this.dataSource = new HikariDataSource(config);
    }

    public void savePlayer(UUID uuid, int kills) {
        try (Connection conn = dataSource.getConnection(); // fresh connection from pool
             PreparedStatement stmt = conn.prepareStatement(
                 "UPDATE players SET kills = ? WHERE uuid = ?")) {
            stmt.setInt(1, kills);
            stmt.setString(2, uuid.toString());
            stmt.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Failed to save player: " + e.getMessage());
        }
    }

    public void close() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
        }
    }
}
```

**Prevention Strategy:**
- In your prompt: *"Use HikariCP for all database connections. Never store a single `Connection` as a field. Always get a fresh connection from the pool inside a try-with-resources."*
- Code review checklist: `[ ]` No `Connection` field in any class. `[ ]` Every query uses try-with-resources.

**Related Errors:** §7.2 (Connection pool exhaustion), §7.4 (Resource leaks), §1.14 (Try-with-resources)

---

## 2.11 ArithmeticException — Divide by Zero in TPS Calculation

**Severity:** 🟡 MAJOR  
**Category:** Runtime

**Symptoms:**
```
java.lang.ArithmeticException: / by zero
    at com.example.utils.PerformanceUtils.getTPS(PerformanceUtils.java:34)
```

**Root Cause:**  
AI models generate TPS (ticks per second) or performance calculations that divide by a value that can be zero during server startup, shutdown, or when the measurement window hasn't elapsed yet.

**Bad Code (What AI Generates):**
```java
public double getTPS() {
    long elapsed = System.currentTimeMillis() - startTime;
    return (double) tickCount / (elapsed / 1000); // ArithmeticException if elapsed < 1000ms
}
```

**Good Code (The Fix):**
```java
public double getTPS() {
    long elapsed = System.currentTimeMillis() - startTime;
    if (elapsed <= 0) return 20.0; // server just started — assume full TPS
    double seconds = elapsed / 1000.0; // floating point division — no integer divide-by-zero
    return Math.min(20.0, tickCount / seconds); // cap at 20 TPS
}

// Better: use Paper's built-in TPS
double[] tps = Bukkit.getServer().getTPS();
double currentTPS = tps[0]; // 1-minute average
```

**Prevention Strategy:**
- In your prompt: *"Use `Bukkit.getServer().getTPS()` for TPS data. Never implement custom TPS measurement."*
- Code review checklist: `[ ]` Every division operation must check the divisor for zero.

**Related Errors:** §2.9 (NumberFormatException)

---

## 2.12 UnsupportedOperationException — Modifying Unmodifiable Collection

**Severity:** 🟡 MAJOR  
**Category:** Runtime

**Symptoms:**
```
java.lang.UnsupportedOperationException
    at java.util.AbstractList.add(AbstractList.java:153)
    at com.example.managers.TeamManager.addPlayer(TeamManager.java:45)
```

**Root Cause:**  
AI models return `List.of()`, `Collections.unmodifiableList()`, or `Arrays.asList()` (which is fixed-size) and then try to add or remove elements from the returned list. `Arrays.asList()` is particularly tricky — it supports `set()` but not `add()` or `remove()`.

**Bad Code (What AI Generates):**
```java
public List<String> getTeamNames() {
    return List.of("Red", "Blue", "Green"); // immutable!
}

// Elsewhere:
List<String> teams = manager.getTeamNames();
teams.add("Yellow"); // UnsupportedOperationException
```

**Good Code (The Fix):**
```java
// If the caller should not modify the list — return unmodifiable, document it
public List<String> getTeamNames() {
    return Collections.unmodifiableList(teamNames); // clear intent
}

// If the caller needs a mutable copy — return a copy
public List<String> getTeamNamesCopy() {
    return new ArrayList<>(teamNames);
}

// Internal mutable list
private final List<String> teamNames = new ArrayList<>();
```

**Prevention Strategy:**
- In your prompt: *"Never return `List.of()` or `Arrays.asList()` from a method if the caller might modify the list. Return `new ArrayList<>(...)` for mutable copies."*
- Code review checklist: `[ ]` Every `List.of()` return value is either documented as immutable or wrapped in `new ArrayList<>()` at the call site.

**Related Errors:** §2.2 (ConcurrentModificationException)

---

## 2.13 IllegalArgumentException — Invalid Enum Value

**Severity:** 🟡 MAJOR  
**Category:** Runtime

**Symptoms:**
```
java.lang.IllegalArgumentException: No enum constant org.bukkit.Material.DIRT_PATH
    at java.lang.Enum.valueOf(Enum.java:240)
```

**Root Cause:**  
AI models use `Material.valueOf(String)` or `Enum.valueOf()` with material names that changed between Minecraft versions. `GRASS_PATH` was renamed to `DIRT_PATH` in 1.17. `ROSE` became `RED_FLOWER` then `POPPY`. The AI uses the name from whichever version appeared most in training data.

**Bad Code (What AI Generates):**
```java
Material mat = Material.valueOf(config.getString("material")); // crashes on unknown name
Material grass = Material.valueOf("GRASS_PATH"); // renamed in 1.17
```

**Good Code (The Fix):**
```java
// Use XMaterial for cross-version compatibility
import com.cryptomorin.xseries.XMaterial;

String matName = config.getString("material", "STONE");
Material mat = XMaterial.matchXMaterial(matName)
    .map(XMaterial::parseMaterial)
    .orElse(Material.STONE); // safe fallback

// Or with explicit error handling
Optional<XMaterial> xMat = XMaterial.matchXMaterial(matName);
if (xMat.isEmpty()) {
    plugin.getLogger().warning("Unknown material '" + matName + "' in config — using STONE.");
    mat = Material.STONE;
} else {
    mat = xMat.get().parseMaterial();
    if (mat == null) {
        plugin.getLogger().warning("Material '" + matName + "' not available in this version.");
        mat = Material.STONE;
    }
}
```

**Prevention Strategy:**
- In your prompt: *"Never use `Material.valueOf()`. Always use `XMaterial.matchXMaterial()` which handles version differences and returns an Optional."*
- Code review checklist: `[ ]` Zero occurrences of `Material.valueOf()` or `Enum.valueOf()` with user-provided strings.

**Related Errors:** §1.1 (Cannot find symbol), §4.1 (API mixups)

---

## 2.14 StringIndexOutOfBoundsException — Substring Mistakes

**Severity:** 🟡 MAJOR  
**Category:** Runtime

**Symptoms:**
```
java.lang.StringIndexOutOfBoundsException: Range [5, 3) out of bounds for length 3
    at com.example.utils.StringUtils.truncate(StringUtils.java:22)
```

**Root Cause:**  
AI models generate `substring()` calls without validating that the string is long enough, or with incorrect index calculations (e.g., `substring(0, str.length() - 5)` on a string shorter than 5 characters).

**Bad Code (What AI Generates):**
```java
// Remove last 5 characters — crashes if string is shorter than 5
String truncated = str.substring(0, str.length() - 5);

// Get everything after the first word — crashes if no space
String rest = message.substring(message.indexOf(' ') + 1); // indexOf returns -1 if no space
```

**Good Code (The Fix):**
```java
// Safe truncation
String truncated = str.length() > 5 ? str.substring(0, str.length() - 5) : "";

// Safe "rest of string after first word"
int spaceIndex = message.indexOf(' ');
String rest = spaceIndex >= 0 ? message.substring(spaceIndex + 1) : "";

// Or use split for command argument parsing
String[] parts = message.split(" ", 2); // max 2 parts
String firstWord = parts[0];
String remainder = parts.length > 1 ? parts[1] : "";
```

**Prevention Strategy:**
- In your prompt: *"Always validate string length before calling `substring()`. Use `split()` for parsing command arguments."*
- Code review checklist: `[ ]` Every `substring()` call with a computed end index must check that the string is long enough.

**Related Errors:** §6.1 (Missing args length check), §2.8 (ArrayIndexOutOfBounds)

---

## 2.15 AssertionError — Debug Assertions Left in Production

**Severity:** 🟢 MINOR  
**Category:** Runtime

**Symptoms:**
```
java.lang.AssertionError: Player data should not be null here
    at com.example.managers.PlayerDataManager.getData(PlayerDataManager.java:55)
```
Only occurs when JVM is started with `-ea` (enable assertions) flag.

**Root Cause:**  
AI models sometimes generate `assert` statements for debugging. Java assertions are disabled by default in production JVMs but can be enabled with `-ea`. If a server admin adds `-ea` to their JVM flags (common for debugging), these assertions fire and crash the plugin.

**Bad Code (What AI Generates):**
```java
public PlayerData getData(UUID uuid) {
    PlayerData data = cache.get(uuid);
    assert data != null : "Player data should not be null here"; // dangerous
    return data;
}
```

**Good Code (The Fix):**
```java
public PlayerData getData(UUID uuid) {
    PlayerData data = cache.get(uuid);
    if (data == null) {
        // Log and return a safe default instead of crashing
        plugin.getLogger().warning("Player data not found for " + uuid + " — returning default.");
        return PlayerData.createDefault(uuid);
    }
    return data;
}
```

**Prevention Strategy:**
- In your prompt: *"Never use Java `assert` statements. Use explicit null checks with logging instead."*
- Code review checklist: `[ ]` Zero `assert` statements in production code.

**Related Errors:** §2.1 (NullPointerException)

---

# 3. Logic Bugs (Compile but Break)

---

## 3.1 Inverted Permission Check

**Severity:** 🔴 CRITICAL  
**Category:** Logic

**Symptoms:**
- Players with permission get "You don't have permission."
- Players without permission can execute the command.
- No error in console — the code runs perfectly, just backwards.

**Root Cause:**  
AI models invert the `!` operator on permission checks. `!player.hasPermission("myplugin.use")` means "if the player does NOT have permission" — which is the correct guard. But the AI sometimes writes `player.hasPermission("myplugin.use")` (without `!`) as the condition to deny access, meaning it denies players who DO have permission.

**Bad Code (What AI Generates):**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (sender instanceof Player player) {
        if (player.hasPermission("myplugin.admin")) { // WRONG: denies admins
            player.sendMessage("You don't have permission.");
            return true;
        }
    }
    // execute command
    return true;
}
```

**Good Code (The Fix):**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    if (!sender.hasPermission("myplugin.admin")) { // CORRECT: denies non-admins
        sender.sendMessage(Component.text("You don't have permission.")
            .color(NamedTextColor.RED));
        return true;
    }
    // execute command — only reaches here if sender HAS permission
    return true;
}
```

**Prevention Strategy:**
- In your prompt: *"Permission denial checks must use `!hasPermission(...)`. The pattern is: `if (!sender.hasPermission(...)) { deny; return; }` then proceed."*
- Code review checklist: `[ ]` Every permission check that leads to a denial message uses `!hasPermission`.
- Architecture decision: Create a `PermissionUtils.requirePermission(sender, node)` method that standardizes the check.

**Related Errors:** §8.4 (Permission bypass)

---

## 3.2 Event Cancellation Confusion — Side Effects Still Execute

**Severity:** 🔴 CRITICAL  
**Category:** Logic

**Symptoms:**
- Event is cancelled but the side effects of the handler still run.
- Example: block break is cancelled but the player still receives the item.
- Example: chat is cancelled but the message is still logged.

**Root Cause:**  
AI models call `event.setCancelled(true)` but then continue executing code that should only run if the event is not cancelled. `setCancelled(true)` prevents the default Bukkit behavior (e.g., the block actually breaking) but does NOT stop the rest of the event handler method from running.

**Bad Code (What AI Generates):**
```java
@EventHandler
public void onBlockBreak(BlockBreakEvent event) {
    if (!event.getPlayer().hasPermission("myplugin.break")) {
        event.setCancelled(true);
        // BUG: code below still runs even though event is cancelled
    }
    // This runs even for cancelled events!
    giveReward(event.getPlayer(), event.getBlock().getType());
    logBreak(event.getPlayer(), event.getBlock());
}
```

**Good Code (The Fix):**
```java
@EventHandler
public void onBlockBreak(BlockBreakEvent event) {
    if (!event.getPlayer().hasPermission("myplugin.break")) {
        event.setCancelled(true);
        return; // CRITICAL: return immediately after cancelling
    }
    // Only reaches here if event is NOT cancelled
    giveReward(event.getPlayer(), event.getBlock().getType());
    logBreak(event.getPlayer(), event.getBlock());
}

// Or check cancellation state before side effects
@EventHandler(ignoreCancelled = true) // skip handler entirely if already cancelled
public void onBlockBreak(BlockBreakEvent event) {
    giveReward(event.getPlayer(), event.getBlock().getType());
}
```

**Prevention Strategy:**
- In your prompt: *"After `event.setCancelled(true)`, always `return` immediately. Use `@EventHandler(ignoreCancelled = true)` on handlers that should not run for cancelled events."*
- Code review checklist: `[ ]` Every `setCancelled(true)` is immediately followed by `return;`.

**Related Errors:** §2.5 (StackOverflow from recursive events), §5.4 (Missing commands section)

---

## 3.3 Inventory Click Handler — Wrong Inventory Check

**Severity:** 🔴 CRITICAL  
**Category:** Logic

**Symptoms:**
- Clicking in the player's own inventory triggers the GUI handler.
- Items disappear from the player's inventory when clicking in a GUI.
- GUI buttons fire when the player clicks their hotbar.

**Root Cause:**  
`InventoryClickEvent` fires for ALL inventory clicks — including clicks in the player's own inventory when a GUI is open. AI models check `event.getInventory()` (the top inventory) but the player can also click the bottom inventory (their own). Without checking which inventory was clicked, the handler fires for both.

**Bad Code (What AI Generates):**
```java
@EventHandler
public void onInventoryClick(InventoryClickEvent event) {
    if (!(event.getWhoClicked() instanceof Player player)) return;
    if (!event.getView().getTitle().equals("My Shop")) return;
    
    event.setCancelled(true);
    // BUG: also fires when player clicks their own inventory while shop is open
    int slot = event.getSlot();
    handleShopClick(player, slot);
}
```

**Good Code (The Fix):**
```java
@EventHandler
public void onInventoryClick(InventoryClickEvent event) {
    if (!(event.getWhoClicked() instanceof Player player)) return;
    if (!event.getView().getTitle().equals("My Shop")) return;

    event.setCancelled(true); // cancel ALL clicks while shop is open (including player inv)

    // Only process clicks in the TOP inventory (the GUI), not the player's inventory
    if (event.getClickedInventory() == null) return;
    if (event.getClickedInventory().equals(player.getInventory())) return; // player's own inv

    int slot = event.getSlot();
    if (slot < 0) return; // outside inventory click
    handleShopClick(player, slot);
}
```

**Prevention Strategy:**
- In your prompt: *"In `InventoryClickEvent`, always check `event.getClickedInventory()` to determine which inventory was clicked. Cancel all clicks when a GUI is open, but only process clicks in the top inventory."*
- Code review checklist: `[ ]` Every GUI click handler checks `getClickedInventory()` before processing.

**Related Errors:** §4.4 (PDC misuse), §2.3 (ClassCastException)

---

## 3.4 Config Null Value Bugs

**Severity:** 🟡 MAJOR  
**Category:** Logic

**Symptoms:**
- `NullPointerException` when reading config values.
- Plugin uses wrong defaults silently.
- Config values work on first run but break after manual edits.

**Root Cause:**  
AI models call `config.getString("key")` without a default value. If the key is missing from the config (e.g., the user deleted it, or the config was generated by an older version), this returns `null`. The AI then calls `.toLowerCase()` or other methods on the null, causing NPE.

**Bad Code (What AI Generates):**
```java
String prefix = plugin.getConfig().getString("prefix"); // null if key missing
String formatted = prefix.toLowerCase(); // NPE if prefix is null

int maxPlayers = plugin.getConfig().getInt("max-players"); // returns 0 if missing — silent bug
boolean debug = plugin.getConfig().getBoolean("debug"); // returns false if missing — may be wrong
```

**Good Code (The Fix):**
```java
// Always provide defaults
String prefix = plugin.getConfig().getString("prefix", "&7[MyPlugin]&r ");
String formatted = prefix.toLowerCase(); // safe — never null

int maxPlayers = plugin.getConfig().getInt("max-players", 20); // explicit default
boolean debug = plugin.getConfig().getBoolean("debug", false); // explicit default

// For complex defaults, use saveDefaultConfig() + config.yml with all keys defined
@Override
public void onEnable() {
    saveDefaultConfig(); // copies config.yml from JAR if not present
    // Now all keys from the default config.yml are guaranteed to exist
}

// Validate critical config values at startup
private boolean validateConfig() {
    if (getConfig().getString("database.host", "").isEmpty()) {
        getLogger().severe("database.host is not set in config.yml — disabling plugin.");
        return false;
    }
    return true;
}
```

**Prevention Strategy:**
- In your prompt: *"Always provide default values in all `config.getString()`, `config.getInt()`, `config.getBoolean()` calls. Call `saveDefaultConfig()` in `onEnable()`."*
- Code review checklist: `[ ]` Zero `config.getString()` calls without a default parameter. `[ ]` `saveDefaultConfig()` is called in `onEnable()`.

**Related Errors:** §2.1 (NullPointerException), §1.15 (Resource not found)

---

## 3.5 Repeating Task Never Cancelled — Memory Leak

**Severity:** 🟡 MAJOR  
**Category:** Logic

**Symptoms:**
- Server performance degrades over time.
- Multiple instances of the same effect stack up.
- After `/reload`, effects run twice as fast.

**Root Cause:**  
AI models start `BukkitRunnable` or `BukkitTask` repeating tasks but never store the task reference, making it impossible to cancel. On plugin reload, a new task is started while the old one keeps running. Over time, dozens of orphaned tasks accumulate.

**Bad Code (What AI Generates):**
```java
// Task started but reference not stored — can never be cancelled
new BukkitRunnable() {
    @Override
    public void run() {
        updateScoreboard();
    }
}.runTaskTimer(plugin, 0L, 20L);

// On reload — another task starts, old one keeps running
```

**Good Code (The Fix):**
```java
public class ScoreboardManager {
    private BukkitTask updateTask;

    public void start() {
        if (updateTask != null && !updateTask.isCancelled()) {
            updateTask.cancel(); // cancel existing task before starting new one
        }
        updateTask = new BukkitRunnable() {
            @Override
            public void run() {
                updateScoreboard();
            }
        }.runTaskTimer(plugin, 0L, 20L);
    }

    public void stop() {
        if (updateTask != null && !updateTask.isCancelled()) {
            updateTask.cancel();
            updateTask = null;
        }
    }
}

// In main plugin class
@Override
public void onDisable() {
    scoreboardManager.stop(); // always cancel tasks on disable
}
```

**Prevention Strategy:**
- In your prompt: *"Always store `BukkitTask` references. Cancel tasks in `onDisable()` and before starting new ones on reload."*
- Code review checklist: `[ ]` Every `runTaskTimer` / `runTaskTimerAsynchronously` result is stored in a field. `[ ]` `onDisable()` cancels all stored tasks.

**Related Errors:** §2.6 (OutOfMemoryError), §1.7 (Static context)

---

## 3.6 World and Location Assumptions

**Severity:** 🟡 MAJOR  
**Category:** Logic

**Symptoms:**
- Teleportation sends players to wrong world.
- Coordinates work in one world but not another.
- Plugin crashes on multi-world servers.

**Root Cause:**  
AI models hardcode world names (`"world"`) or assume `Bukkit.getWorlds().get(0)` is always the main world. On multi-world servers, the world list order is not guaranteed, and the main world may not be named `"world"`.

**Bad Code (What AI Generates):**
```java
World world = Bukkit.getWorld("world"); // null if server uses different world name
Location spawn = new Location(world, 0, 64, 0); // NPE if world is null

World mainWorld = Bukkit.getWorlds().get(0); // not guaranteed to be the main world
```

**Good Code (The Fix):**
```java
// Read world name from config
String worldName = plugin.getConfig().getString("spawn.world", "world");
World world = Bukkit.getWorld(worldName);
if (world == null) {
    plugin.getLogger().severe("World '" + worldName + "' not found! Check config.yml.");
    return;
}

// Or use the player's current world
World playerWorld = player.getWorld(); // always valid for online players

// Store and restore locations properly
public Location getSpawn() {
    String worldName = config.getString("spawn.world");
    double x = config.getDouble("spawn.x");
    double y = config.getDouble("spawn.y");
    double z = config.getDouble("spawn.z");
    float yaw = (float) config.getDouble("spawn.yaw");
    float pitch = (float) config.getDouble("spawn.pitch");

    World world = Bukkit.getWorld(worldName);
    if (world == null) return null;
    return new Location(world, x, y, z, yaw, pitch);
}
```

**Prevention Strategy:**
- In your prompt: *"Never hardcode world names. Read world names from config.yml. Always null-check `Bukkit.getWorld()` results."*
- Code review checklist: `[ ]` Zero hardcoded `"world"` strings. `[ ]` Every `Bukkit.getWorld()` result is null-checked.

**Related Errors:** §3.7 (Offline player assumptions), §2.1 (NullPointerException)

---

## 3.7 Offline Player Assumptions

**Severity:** 🟡 MAJOR  
**Category:** Logic

**Symptoms:**
- `NullPointerException` when looking up a player by name.
- Commands that target offline players crash.
- Ban/mute systems fail for players who have never joined.

**Root Cause:**  
AI models use `Bukkit.getPlayer(name)` (which returns `null` for offline players) when the code needs to work for offline players too. They also use `Bukkit.getOfflinePlayer(name)` which creates a new `OfflinePlayer` object even if the player has never joined, leading to empty UUID objects.

**Bad Code (What AI Generates):**
```java
// getPlayer() returns null for offline players
Player target = Bukkit.getPlayer(args[0]);
target.kickPlayer("Banned."); // NPE if offline

// getOfflinePlayer(name) is unreliable — may return empty object
OfflinePlayer offline = Bukkit.getOfflinePlayer(args[0]);
UUID uuid = offline.getUniqueId(); // may be random UUID if player never joined
```

**Good Code (The Fix):**
```java
// For commands targeting online players only
Player target = Bukkit.getPlayerExact(args[0]);
if (target == null) {
    sender.sendMessage(Component.text(args[0] + " is not online.")
        .color(NamedTextColor.RED));
    return true;
}

// For commands targeting offline players (ban, history, etc.)
// Look up by UUID from your own database — don't rely on Bukkit's offline player cache
CompletableFuture<UUID> uuidFuture = database.getUUIDByName(args[0]);
uuidFuture.thenAccept(uuid -> {
    if (uuid == null) {
        sender.sendMessage(Component.text("Player '" + args[0] + "' has never joined.")
            .color(NamedTextColor.RED));
        return;
    }
    // proceed with uuid
});
```

**Prevention Strategy:**
- In your prompt: *"Use `Bukkit.getPlayerExact()` for online-only lookups. For offline player operations, store UUIDs in your database and look up by UUID, not by name."*
- Code review checklist: `[ ]` Every `Bukkit.getPlayer()` result is null-checked. `[ ]` No `getOfflinePlayer(name)` calls for UUID lookups.

**Related Errors:** §2.1 (NullPointerException), §6.3 (Player name lookup failures)

---

## 3.8 Race Conditions in Economy and Data Plugins

**Severity:** 🔴 CRITICAL  
**Category:** Logic

**Symptoms:**
- Players can duplicate items or currency by clicking rapidly.
- Balance goes negative despite checks.
- Two simultaneous purchases both succeed when only one should.

**Root Cause:**  
AI models generate async database operations without locking. Two simultaneous requests (e.g., two rapid clicks on a shop GUI) both read the same balance, both check `balance >= price`, both pass, and both deduct — resulting in a double purchase or negative balance. This is a classic TOCTOU (Time Of Check To Time Of Use) race condition.

**Bad Code (What AI Generates):**
```java
// Async — race condition between check and deduct
public void purchaseItem(Player player, int price) {
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        int balance = database.getBalance(player.getUniqueId()); // read
        if (balance >= price) { // check
            database.setBalance(player.getUniqueId(), balance - price); // deduct — race here!
            Bukkit.getScheduler().runTask(plugin, () -> giveItem(player));
        }
    });
}
```

**Good Code (The Fix):**
```java
// Option 1: Per-player lock to prevent concurrent purchases
private final Map<UUID, Object> playerLocks = new ConcurrentHashMap<>();

public void purchaseItem(Player player, int price) {
    Object lock = playerLocks.computeIfAbsent(player.getUniqueId(), k -> new Object());
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
        synchronized (lock) { // only one purchase at a time per player
            int balance = database.getBalance(player.getUniqueId());
            if (balance < price) {
                Bukkit.getScheduler().runTask(plugin, () ->
                    player.sendMessage(Component.text("Insufficient funds.")));
                return;
            }
            database.setBalance(player.getUniqueId(), balance - price);
            Bukkit.getScheduler().runTask(plugin, () -> giveItem(player));
        }
    });
}

// Option 2: Atomic SQL UPDATE with WHERE clause (preferred for DB-backed economy)
public boolean purchaseItem(UUID uuid, int price) {
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(
             "UPDATE players SET balance = balance - ? WHERE uuid = ? AND balance >= ?")) {
        stmt.setInt(1, price);
        stmt.setString(2, uuid.toString());
        stmt.setInt(3, price);
        int rowsAffected = stmt.executeUpdate();
        return rowsAffected > 0; // 0 means balance was insufficient — atomic check+deduct
    } catch (SQLException e) {
        plugin.getLogger().severe("Purchase failed: " + e.getMessage());
        return false;
    }
}
```

**Prevention Strategy:**
- In your prompt: *"Economy operations must be atomic. Use SQL `UPDATE ... WHERE balance >= price` to combine the check and deduct in one atomic operation. Never read-check-write in separate steps."*
- Code review checklist: `[ ]` Every economy transaction uses atomic SQL or a per-player lock. `[ ]` No separate read-then-write patterns for balance operations.

**Related Errors:** §2.4 (IllegalStateException async), §8.4 (Economy exploit)

---

# 4. API Confusion Bugs

---

## 4.1 Paper vs Spigot vs Bukkit API Mixups

**Severity:** 🟡 MAJOR  
**Category:** API

**Symptoms:**
- `NoSuchMethodError` at runtime on Paper servers.
- Code compiles against Paper but uses Spigot-only events.
- Paper-specific optimizations not used, causing performance issues.

**Root Cause:**  
AI models conflate the three API layers. Bukkit is the base interface. Spigot extends it with additional events and methods. Paper extends Spigot further with async events, component support, and performance APIs. The AI mixes methods from all three layers without checking which server software is required.

**Bad Code (What AI Generates):**
```java
// Using Spigot's AsyncPlayerChatEvent on a Paper server
// Paper deprecated this in favor of AsyncChatEvent
@EventHandler
public void onChat(AsyncPlayerChatEvent event) { // deprecated on Paper
    String message = event.getMessage();
}

// Using Bukkit's legacy sendMessage on Paper
player.sendMessage("§aHello!"); // works but deprecated on Paper
```

**Good Code (The Fix):**
```java
// Paper 1.21.4 — use Paper's AsyncChatEvent
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;

@EventHandler
public void onChat(AsyncChatEvent event) {
    String message = PlainTextComponentSerializer.plainText().serialize(event.message());
    // process message
}

// Paper's Adventure API for messages
player.sendMessage(Component.text("Hello!").color(NamedTextColor.GREEN));
```

**Decision Matrix:**

| Feature | Bukkit | Spigot | Paper |
|---|---|---|---|
| Basic events | ✅ | ✅ | ✅ |
| `AsyncPlayerChatEvent` | ❌ | ✅ | ⚠️ deprecated |
| `AsyncChatEvent` | ❌ | ❌ | ✅ |
| Adventure Components | ❌ | ❌ | ✅ native |
| `getChunkAsync()` | ❌ | ❌ | ✅ |
| `RegionScheduler` (Folia) | ❌ | ❌ | ✅ |

**Prevention Strategy:**
- In your prompt: *"Target Paper 1.21.4 API. Use `io.papermc.paper` and `net.kyori.adventure` packages. Do not use `AsyncPlayerChatEvent` — use `AsyncChatEvent`."*
- Code review checklist: `[ ]` No `AsyncPlayerChatEvent` imports. `[ ]` No `org.bukkit.ChatColor` imports.

**Related Errors:** §1.10 (Deprecated API), §4.3 (Adventure confusion)

---

## 4.2 Deprecated Event Usage

**Severity:** 🟡 MAJOR  
**Category:** API

**Symptoms:**
```
warning: [deprecation] AsyncPlayerChatEvent in org.bukkit.event.player has been deprecated
```
Plugin works but produces warnings and may break in future Paper versions.

**Root Cause:**  
Paper has deprecated several Bukkit/Spigot events in favor of Paper-native equivalents that use the Adventure API. AI models use the deprecated versions because they appear more frequently in training data.

| Deprecated | Replacement |
|---|---|
| `AsyncPlayerChatEvent` | `io.papermc.paper.event.player.AsyncChatEvent` |
| `PlayerChatEvent` | `AsyncChatEvent` (always async now) |
| `SignChangeEvent` (legacy text) | `SignChangeEvent` with Component API |
| `BlockPhysicsEvent` (overused) | Specific block events |

**Good Code (The Fix):**
```java
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;

@EventHandler
public void onChat(AsyncChatEvent event) {
    Component originalMessage = event.message();
    String plainText = PlainTextComponentSerializer.plainText().serialize(originalMessage);

    if (plainText.contains("badword")) {
        event.setCancelled(true);
        event.getPlayer().sendMessage(Component.text("Watch your language!")
            .color(NamedTextColor.RED));
    }
}
```

**Prevention Strategy:**
- In your prompt: *"Use `io.papermc.paper.event.player.AsyncChatEvent` for chat events, not `AsyncPlayerChatEvent`."*
- Code review checklist: `[ ]` Zero `AsyncPlayerChatEvent` usages.

**Related Errors:** §4.1 (API mixups), §4.3 (Adventure confusion)

---

## 4.3 Adventure Component Confusion

**Severity:** 🟡 MAJOR  
**Category:** API

**Symptoms:**
- Color codes (`§a`, `&a`) appear as literal text in chat.
- `sendMessage(Component)` and `sendMessage(String)` both exist — wrong one called.
- MiniMessage tags appear as literal text.

**Root Cause:**  
Paper uses the Adventure API for all text. There are three ways to create text (legacy codes, Component builder, MiniMessage) and they are not interchangeable. AI models mix them — e.g., passing a MiniMessage string to `Component.text()` which treats it as a literal string, not parsed markup.

**Bad Code (What AI Generates):**
```java
// MiniMessage string passed to Component.text() — tags appear literally
player.sendMessage(Component.text("<red>You don't have permission!</red>"));
// Output: "<red>You don't have permission!</red>"

// Legacy codes in Adventure context — codes appear literally
player.sendMessage(Component.text("&cYou don't have permission!"));
// Output: "&cYou don't have permission!"
```

**Good Code (The Fix):**
```java
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;

// Option 1: Component builder (best for simple messages)
player.sendMessage(Component.text("You don't have permission!")
    .color(NamedTextColor.RED));

// Option 2: MiniMessage (best for config-driven messages)
MiniMessage mm = MiniMessage.miniMessage();
player.sendMessage(mm.deserialize("<red>You don't have permission!"));

// Option 3: Legacy serializer (for reading legacy-format strings from config)
String configMessage = plugin.getConfig().getString("messages.no-permission", "&cNo permission.");
Component component = LegacyComponentSerializer.legacyAmpersand().deserialize(configMessage);
player.sendMessage(component);
```

**Prevention Strategy:**
- In your prompt: *"Use MiniMessage for all user-facing messages. Store messages in config as MiniMessage format (`<red>text</red>`). Never mix legacy codes with Adventure API."*
- Code review checklist: `[ ]` No `&` or `§` color codes in Java source strings. `[ ]` No `Component.text()` wrapping MiniMessage strings.

**Related Errors:** §1.10 (Deprecated API), §4.1 (API mixups)

---

## 4.4 PersistentDataContainer Misuse

**Severity:** 🟡 MAJOR  
**Category:** API

**Symptoms:**
- Data not persisting between server restarts.
- `ClassCastException` reading PDC values.
- `IllegalArgumentException: Namespace cannot be null`.

**Root Cause:**  
AI models misuse the PersistentDataContainer API in several ways: using the wrong `PersistentDataType`, creating `NamespacedKey` with null namespace, storing data on the wrong entity (e.g., storing on `ItemStack` instead of `ItemMeta`), or not understanding that PDC data on items must be set on the `ItemMeta`, not the `ItemStack`.

**Bad Code (What AI Generates):**
```java
// Storing on ItemStack directly — wrong, must use ItemMeta
ItemStack item = new ItemStack(Material.DIAMOND_SWORD);
item.getPersistentDataContainer(); // ItemStack doesn't have PDC — compile error

// Wrong PersistentDataType
NamespacedKey key = new NamespacedKey(plugin, "level");
entity.getPersistentDataContainer().set(key, PersistentDataType.STRING, 5); // type mismatch

// Null plugin reference
NamespacedKey key = new NamespacedKey(null, "level"); // IllegalArgumentException
```

**Good Code (The Fix):**
```java
import org.bukkit.NamespacedKey;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.inventory.meta.ItemMeta;

// Storing on ItemMeta (correct for items)
ItemStack item = new ItemStack(Material.DIAMOND_SWORD);
ItemMeta meta = item.getItemMeta();
NamespacedKey key = new NamespacedKey(plugin, "sword_level");
meta.getPersistentDataContainer().set(key, PersistentDataType.INTEGER, 5);
item.setItemMeta(meta);

// Reading from ItemMeta
ItemMeta readMeta = item.getItemMeta();
if (readMeta != null) {
    int level = readMeta.getPersistentDataContainer()
        .getOrDefault(key, PersistentDataType.INTEGER, 0);
}

// Storing on Entity (correct for entities)
entity.getPersistentDataContainer().set(key, PersistentDataType.INTEGER, 5);

// Storing complex data (Paper 1.21.4 — List support)
NamespacedKey tagsKey = new NamespacedKey(plugin, "tags");
entity.getPersistentDataContainer().set(tagsKey,
    PersistentDataType.LIST.strings(),
    List.of("tag1", "tag2"));
```

**Prevention Strategy:**
- In your prompt: *"PDC on items must use `item.getItemMeta().getPersistentDataContainer()`. Always call `item.setItemMeta(meta)` after modifying. Use `PersistentDataType.INTEGER` for ints, not `STRING`."*
- Code review checklist: `[ ]` No `item.getPersistentDataContainer()` — must be `item.getItemMeta().getPersistentDataContainer()`.

**Related Errors:** §1.9 (Unchecked cast), §2.3 (ClassCastException)

---

## 4.5 Wrong Scheduler API

**Severity:** 🟡 MAJOR  
**Category:** API

**Symptoms:**
- Tasks run on wrong thread.
- Deprecation warnings for `BukkitScheduler` on Paper.
- Tasks not running at expected intervals.

**Root Cause:**  
Paper 1.21.4 introduced a new async scheduler (`AsyncScheduler`) and region scheduler (for Folia compatibility). AI models use the old `BukkitScheduler` API which still works but is less precise and doesn't support Folia. The AI also confuses `runTaskLater` (delay in ticks) with `runTaskLaterAsynchronously` (same but async).

**Scheduler Decision Matrix:**

| Use Case | API |
|---|---|
| Run on main thread, next tick | `Bukkit.getScheduler().runTask(plugin, runnable)` |
| Run on main thread, delayed | `Bukkit.getScheduler().runTaskLater(plugin, runnable, ticks)` |
| Run on main thread, repeating | `Bukkit.getScheduler().runTaskTimer(plugin, runnable, delay, period)` |
| Run async (I/O, HTTP) | `Bukkit.getAsyncScheduler().runNow(plugin, task)` |
| Run async, delayed | `Bukkit.getAsyncScheduler().runDelayed(plugin, task, delay, unit)` |
| Run async, repeating | `Bukkit.getAsyncScheduler().runAtFixedRate(plugin, task, init, period, unit)` |
| Run on entity's region (Folia) | `entity.getScheduler().run(plugin, task, retired)` |

**Good Code (The Fix):**
```java
// Paper async scheduler (preferred over BukkitScheduler for async)
plugin.getServer().getAsyncScheduler().runNow(plugin, scheduledTask -> {
    PlayerData data = database.loadPlayer(uuid);
    // Switch to main thread for Bukkit API
    plugin.getServer().getScheduler().runTask(plugin, () -> {
        Player player = Bukkit.getPlayer(uuid);
        if (player != null) applyData(player, data);
    });
});

// Repeating async task with TimeUnit (cleaner than ticks for async)
plugin.getServer().getAsyncScheduler().runAtFixedRate(plugin, task -> {
    saveAllPlayerData();
}, 5, 5, TimeUnit.MINUTES); // every 5 minutes
```

**Prevention Strategy:**
- In your prompt: *"Use `plugin.getServer().getAsyncScheduler()` for async tasks on Paper 1.21.4. Use `Bukkit.getScheduler().runTask()` for main-thread callbacks."*
- Code review checklist: `[ ]` No async tasks calling Bukkit API directly. `[ ]` All I/O operations are in async tasks.

**Related Errors:** §2.4 (IllegalStateException async), §3.5 (Task never cancelled)

---

# 5. plugin.yml Errors

---

## 5.1 Wrong Main Class Path

**Severity:** 🔴 CRITICAL  
**Category:** plugin.yml

**Symptoms:**
```
[ERROR] Could not load 'plugins/MyPlugin.jar': Invalid plugin.yml
[ERROR] main class `com.example.MyPlugin` does not exist
```

**Root Cause:**  
The `main` field in `plugin.yml` must exactly match the fully qualified class name of the class that extends `JavaPlugin`. AI models frequently get the package wrong (using `com.example` when the actual package is `com.example.myplugin`), or they change the class name in the Java file without updating `plugin.yml`.

**Bad Code (What AI Generates):**
```yaml
# plugin.yml
main: com.example.MyPlugin  # WRONG if actual package is com.example.myplugin
```

```java
// Actual class
package com.example.myplugin; // package doesn't match plugin.yml
public class MyPlugin extends JavaPlugin { }
```

**Good Code (The Fix):**
```yaml
# plugin.yml — must match exactly
main: com.example.myplugin.MyPlugin
```

```java
package com.example.myplugin; // matches plugin.yml
public class MyPlugin extends JavaPlugin { }
```

**Prevention Strategy:**
- In your prompt: *"The `main` field in plugin.yml must be the exact fully qualified class name including all package segments."*
- Code review checklist: `[ ]` Copy the `package` declaration from the main class and append `.ClassName` — that's what `main` must be.

**Related Errors:** §1.2 (Class name mismatch), §1.15 (Resource not found)

---

## 5.2 Missing api-version

**Severity:** 🟡 MAJOR  
**Category:** plugin.yml

**Symptoms:**
```
[WARN] Plugin MyPlugin does not specify an api-version.
[WARN] Assuming legacy plugin. This may cause issues.
```
Plugin loads but may behave incorrectly with modern Paper features.

**Root Cause:**  
AI models omit the `api-version` field. Without it, Paper treats the plugin as a legacy plugin and applies compatibility shims that can interfere with modern API behavior, particularly around Adventure text components and event handling.

**Bad Code (What AI Generates):**
```yaml
name: MyPlugin
version: 1.0
main: com.example.myplugin.MyPlugin
# Missing api-version!
```

**Good Code (The Fix):**
```yaml
name: MyPlugin
version: '1.0'
main: com.example.myplugin.MyPlugin
api-version: '1.21'
description: My plugin description
author: YourName
website: https://example.com
```

**Prevention Strategy:**
- In your prompt: *"Always include `api-version: '1.21'` in plugin.yml."*
- Code review checklist: `[ ]` `api-version` is present in every plugin.yml.

---

## 5.3 Softdepend vs Depend Confusion

**Severity:** 🟡 MAJOR  
**Category:** plugin.yml

**Symptoms:**
- Plugin fails to load if optional dependency is not installed (when `depend` used instead of `softdepend`).
- Plugin loads before its required dependency (when `softdepend` used instead of `depend`).
- `NoClassDefFoundError` at runtime for optional integrations.

**Root Cause:**  
AI models confuse `depend` (hard dependency — plugin won't load without it) and `softdepend` (soft dependency — plugin loads after it if present, but loads without it if absent). Using `depend` for optional integrations (Vault, PlaceholderAPI) means the plugin won't load on servers without those plugins.

**Bad Code (What AI Generates):**
```yaml
depend: [Vault, PlaceholderAPI]  # WRONG: makes Vault and PAPI required
```

**Good Code (The Fix):**
```yaml
# Hard dependencies — plugin CANNOT function without these
depend: []  # usually empty for most plugins

# Soft dependencies — plugin loads after these IF present, works without them
softdepend: [Vault, PlaceholderAPI, LuckPerms]

# Load order only — load after these but don't need their API
loadbefore: [SomeOtherPlugin]
```

**Decision Matrix:**

| Scenario | Use |
|---|---|
| Plugin uses Vault API and crashes without it | `depend: [Vault]` |
| Plugin has optional Vault economy features | `softdepend: [Vault]` |
| Plugin must load before another plugin | `loadbefore: [OtherPlugin]` |
| Plugin needs another plugin's data at startup | `depend: [DataPlugin]` |

**Prevention Strategy:**
- In your prompt: *"Use `depend` only for plugins that are absolutely required. Use `softdepend` for optional integrations like Vault, PlaceholderAPI, LuckPerms."*
- Code review checklist: `[ ]` Every `depend` entry is truly required. `[ ]` Every optional integration is in `softdepend`.

**Related Errors:** §2.7 (NoClassDefFoundError)

---

## 5.4 Missing Commands Section

**Severity:** 🟡 MAJOR  
**Category:** plugin.yml

**Symptoms:**
- Command not recognized by server (`Unknown command`).
- Tab completion doesn't work.
- Command registered in code but not in plugin.yml.

**Root Cause:**  
AI models register commands in `onEnable()` via `getCommand("name").setExecutor(...)` but forget to declare the command in `plugin.yml`. The `getCommand()` call returns `null` if the command isn't declared in `plugin.yml`, causing NPE.

**Bad Code (What AI Generates):**
```yaml
# plugin.yml — missing commands section
name: MyPlugin
version: 1.0
main: com.example.myplugin.MyPlugin
```

```java
// onEnable() — NPE because command not in plugin.yml
getCommand("mycommand").setExecutor(new MyCommand()); // NPE!
```

**Good Code (The Fix):**
```yaml
name: MyPlugin
version: '1.0'
main: com.example.myplugin.MyPlugin
api-version: '1.21'

commands:
  mycommand:
    description: The main command for MyPlugin
    usage: /<command> [subcommand] [args]
    permission: myplugin.use
    aliases: [mc, myplugin]
  mycommand-admin:
    description: Admin command
    usage: /<command> <subcommand>
    permission: myplugin.admin
```

```java
// onEnable() — safe with null check
PluginCommand cmd = getCommand("mycommand");
if (cmd != null) {
    cmd.setExecutor(new MyCommand(this));
    cmd.setTabCompleter(new MyTabCompleter(this));
} else {
    getLogger().severe("Command 'mycommand' not found in plugin.yml!");
}
```

**Prevention Strategy:**
- In your prompt: *"Every command registered with `getCommand().setExecutor()` must have a corresponding entry in the `commands:` section of plugin.yml."*
- Code review checklist: `[ ]` Every `getCommand("x")` call has a matching `x:` entry in plugin.yml commands section.

**Related Errors:** §5.1 (Wrong main class), §6.1 (Missing args check)

---

## 5.5 Permission Node Mismatches

**Severity:** 🟡 MAJOR  
**Category:** plugin.yml

**Symptoms:**
- Permission checks always return false even for ops.
- LuckPerms shows different permission node than what the plugin checks.
- `default: op` not working.

**Root Cause:**  
AI models define permissions in `plugin.yml` with one name (e.g., `myplugin.admin`) but check a different name in code (e.g., `myplugin.administrator`). Case sensitivity is also a common issue — permission nodes are case-sensitive.

**Bad Code (What AI Generates):**
```yaml
# plugin.yml
permissions:
  myplugin.Admin:  # capital A
    default: op
```

```java
// Code checks lowercase
if (!player.hasPermission("myplugin.admin")) { // different case — never matches
```

**Good Code (The Fix):**
```yaml
# plugin.yml — all lowercase, consistent naming
permissions:
  myplugin.admin:
    description: Full admin access to MyPlugin
    default: op
  myplugin.use:
    description: Basic usage of MyPlugin
    default: true
  myplugin.reload:
    description: Reload MyPlugin configuration
    default: op
```

```java
// Code — exact same strings as plugin.yml
public static final String PERM_ADMIN = "myplugin.admin";
public static final String PERM_USE = "myplugin.use";
public static final String PERM_RELOAD = "myplugin.reload";

if (!player.hasPermission(PERM_ADMIN)) { // use constants — no typos
```

**Prevention Strategy:**
- In your prompt: *"Define all permission nodes as constants in a `Permissions` class. Use those constants in both plugin.yml and code checks. All permission nodes must be lowercase."*
- Code review checklist: `[ ]` Every `hasPermission("...")` string matches exactly a permission defined in plugin.yml. `[ ]` All permission nodes are lowercase.

**Related Errors:** §3.1 (Inverted permission check), §8.4 (Permission bypass)

---

# 6. Command Input Bugs

---

## 6.1 Missing Args Length Check

**Severity:** 🔴 CRITICAL  
**Category:** Command

**Symptoms:**
```
ArrayIndexOutOfBoundsException: Index 0 out of bounds for length 0
```
Triggered by running a command with no arguments.

*(See §2.8 for full entry — this is the most common command bug.)*

**Quick Fix:**
```java
if (args.length < REQUIRED_ARG_COUNT) {
    sender.sendMessage(Component.text("Usage: " + cmd.getUsage().replace("<command>", label))
        .color(NamedTextColor.RED));
    return true;
}
```

---

## 6.2 Integer Parsing Without Try-Catch

**Severity:** 🔴 CRITICAL  
**Category:** Command

*(See §2.9 for full entry.)*

**Quick Fix:**
```java
int value;
try {
    value = Integer.parseInt(args[0]);
    if (value < 1) throw new NumberFormatException("must be positive");
} catch (NumberFormatException e) {
    sender.sendMessage(Component.text("Invalid number: " + args[0]).color(NamedTextColor.RED));
    return true;
}
```

---

## 6.3 Player Name Lookup Failures

**Severity:** 🟡 MAJOR  
**Category:** Command

**Symptoms:**
- `/give PlayerName item` fails because player name has wrong case.
- Partial name matches return wrong player.
- Offline player lookup returns null.

**Root Cause:**  
AI models use `Bukkit.getPlayer(name)` which does a case-insensitive partial match (returns the first player whose name starts with the input). This is usually fine but can return the wrong player if multiple players have similar names. For exact matches, `getPlayerExact()` is safer.

**Bad Code (What AI Generates):**
```java
Player target = Bukkit.getPlayer(args[0]); // partial match — "not" matches "Notch"
if (target == null) {
    sender.sendMessage("Player not found.");
    return true;
}
```

**Good Code (The Fix):**
```java
// For online player lookup — exact match preferred
Player target = Bukkit.getPlayerExact(args[0]);
if (target == null) {
    // Try partial match as fallback
    target = Bukkit.getPlayer(args[0]);
}
if (target == null) {
    sender.sendMessage(Component.text("Player '" + args[0] + "' is not online.")
        .color(NamedTextColor.RED));
    return true;
}

// For tab completion — show online player names
@Override
public List<String> onTabComplete(CommandSender sender, Command cmd, String label, String[] args) {
    if (args.length == 1) {
        return Bukkit.getOnlinePlayers().stream()
            .map(Player::getName)
            .filter(name -> name.toLowerCase().startsWith(args[0].toLowerCase()))
            .collect(Collectors.toList());
    }
    return Collections.emptyList();
}
```

**Prevention Strategy:**
- In your prompt: *"Use `Bukkit.getPlayerExact()` for exact name lookups. Always null-check the result."*
- Code review checklist: `[ ]` Every player lookup is null-checked. `[ ]` Tab completion filters by prefix.

**Related Errors:** §3.7 (Offline player assumptions), §6.4 (Null tab completion)

---

## 6.4 Null Tab Completion

**Severity:** 🟡 MAJOR  
**Category:** Command

**Symptoms:**
```
[ERROR] Unhandled exception during tab completion for command '/mycommand'
java.lang.NullPointerException
```
Tab completion causes console errors and doesn't work.

**Root Cause:**  
AI models return `null` from `onTabComplete()` instead of an empty list. Returning `null` tells Bukkit to use the default completion (online player names), which is usually wrong. Returning an empty list suppresses all suggestions. The AI also forgets to handle the case where `args` is empty.

**Bad Code (What AI Generates):**
```java
@Override
public List<String> onTabComplete(CommandSender sender, Command cmd, String label, String[] args) {
    if (args.length == 1) {
        return Arrays.asList("subcommand1", "subcommand2");
    }
    return null; // WRONG: returns null, Bukkit falls back to player names
}
```

**Good Code (The Fix):**
```java
@Override
public List<String> onTabComplete(CommandSender sender, Command cmd, String label, String[] args) {
    if (args.length == 0) return Collections.emptyList();

    if (args.length == 1) {
        List<String> subcommands = Arrays.asList("help", "reload", "give", "take");
        return subcommands.stream()
            .filter(s -> s.startsWith(args[0].toLowerCase()))
            .collect(Collectors.toList());
    }

    if (args.length == 2 && args[0].equalsIgnoreCase("give")) {
        return Bukkit.getOnlinePlayers().stream()
            .map(Player::getName)
            .filter(name -> name.toLowerCase().startsWith(args[1].toLowerCase()))
            .collect(Collectors.toList());
    }

    return Collections.emptyList(); // CORRECT: empty list, not null
}
```

**Prevention Strategy:**
- In your prompt: *"Tab completion must never return `null`. Return `Collections.emptyList()` when there are no suggestions."*
- Code review checklist: `[ ]` Every `onTabComplete` return path returns a non-null List.

**Related Errors:** §6.3 (Player name lookup), §5.4 (Missing commands section)

---

## 6.5 Case Sensitivity Bugs

**Severity:** 🟡 MAJOR  
**Category:** Command

**Symptoms:**
- `/mycommand RELOAD` doesn't work but `/mycommand reload` does.
- Permission `MyPlugin.Admin` doesn't match `myplugin.admin`.
- Config key `MaxPlayers` not found when code looks for `maxplayers`.

**Root Cause:**  
AI models perform string comparisons without normalizing case. Command subcommands, config keys, and permission nodes should all be compared case-insensitively.

**Bad Code (What AI Generates):**
```java
if (args[0].equals("reload")) { // fails for "Reload", "RELOAD"
    doReload();
}
```

**Good Code (The Fix):**
```java
switch (args[0].toLowerCase(Locale.ROOT)) { // normalize to lowercase
    case "reload" -> doReload(sender);
    case "give" -> doGive(sender, args);
    case "take" -> doTake(sender, args);
    case "help" -> showHelp(sender);
    default -> sender.sendMessage(Component.text("Unknown subcommand: " + args[0])
        .color(NamedTextColor.RED));
}
```

**Prevention Strategy:**
- In your prompt: *"Always use `args[0].toLowerCase(Locale.ROOT)` before comparing subcommand strings. Use `equalsIgnoreCase()` for string comparisons."*
- Code review checklist: `[ ]` Every subcommand comparison uses `toLowerCase()` or `equalsIgnoreCase()`.

**Related Errors:** §5.5 (Permission node mismatches)

---

# 7. Database & Storage Bugs

---

## 7.1 SQL Injection Vulnerabilities

**Severity:** 🔴 CRITICAL  
**Category:** Security / Database

**Symptoms:**
- No runtime error — this is a silent security vulnerability.
- Malicious players can read, modify, or delete database contents.
- Server logs show unusual SQL patterns.

**Root Cause:**  
AI models concatenate user input directly into SQL strings. A player named `'; DROP TABLE players; --` would execute the DROP TABLE statement. This is the most dangerous bug in this encyclopedia.

*(See §8.1 for full security entry. Quick fix below.)*

**Bad Code (What AI Generates):**
```java
String query = "SELECT * FROM players WHERE name = '" + playerName + "'"; // INJECTION
stmt.executeQuery(query);
```

**Good Code (The Fix):**
```java
try (PreparedStatement stmt = conn.prepareStatement(
        "SELECT * FROM players WHERE name = ?")) {
    stmt.setString(1, playerName); // parameterized — injection impossible
    ResultSet rs = stmt.executeQuery();
}
```

---

## 7.2 Connection Pool Exhaustion

**Severity:** 🔴 CRITICAL  
**Category:** Database

**Symptoms:**
```
com.zaxxer.hikari.pool.HikariPool$PoolInitializationException: 
Failed to initialize pool: Unable to acquire initial connection
java.sql.SQLTimeoutException: Timeout waiting for connection from pool
```

**Root Cause:**  
AI models configure HikariCP with too few connections for the server's load, or they forget to close connections/statements (causing pool exhaustion over time). Each unclosed connection holds a pool slot permanently.

**Bad Code (What AI Generates):**
```java
// Connection obtained but never closed — pool exhaustion over time
public void savePlayer(UUID uuid) {
    Connection conn = dataSource.getConnection(); // obtained
    PreparedStatement stmt = conn.prepareStatement("UPDATE players SET ...");
    stmt.executeUpdate();
    // conn and stmt never closed — pool slot leaked!
}
```

**Good Code (The Fix):**
```java
// Always use try-with-resources
public void savePlayer(UUID uuid, PlayerData data) {
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(
             "UPDATE players SET kills = ?, deaths = ? WHERE uuid = ?")) {
        stmt.setInt(1, data.getKills());
        stmt.setInt(2, data.getDeaths());
        stmt.setString(3, uuid.toString());
        stmt.executeUpdate();
    } catch (SQLException e) {
        plugin.getLogger().severe("Failed to save player " + uuid + ": " + e.getMessage());
    }
    // conn and stmt automatically closed — pool slot returned
}

// HikariCP configuration for a typical plugin
HikariConfig config = new HikariConfig();
config.setMaximumPoolSize(10);      // max 10 concurrent connections
config.setMinimumIdle(2);           // keep 2 idle connections ready
config.setConnectionTimeout(30_000); // 30s to get a connection
config.setLeakDetectionThreshold(60_000); // warn if connection held > 60s
```

**Prevention Strategy:**
- In your prompt: *"Every database connection must be in a try-with-resources block. Set `leakDetectionThreshold` in HikariCP to catch connection leaks during development."*
- Code review checklist: `[ ]` Zero `Connection` variables outside try-with-resources. `[ ]` HikariCP `leakDetectionThreshold` set in development config.

**Related Errors:** §2.10 (SQLException), §7.4 (Resource leaks)

---

## 7.3 Synchronous Database Calls in Event Handlers

**Severity:** 🔴 CRITICAL  
**Category:** Database

**Symptoms:**
- Server freezes for 100-500ms on player join.
- TPS drops when many players join simultaneously.
- "Can't keep up!" warnings in console.

**Root Cause:**  
AI models call database methods directly inside event handlers (which run on the main thread). Database I/O can take 10-500ms. Blocking the main thread for this duration causes server lag. Every tick that the main thread is blocked is a tick where no entities move, no redstone fires, and no other events process.

**Bad Code (What AI Generates):**
```java
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    // BLOCKING: database call on main thread — server freezes
    PlayerData data = database.loadPlayer(player.getUniqueId());
    playerDataManager.cache(player.getUniqueId(), data);
    player.sendMessage("Welcome back! Kills: " + data.getKills());
}
```

**Good Code (The Fix):**
```java
@EventHandler
public void onPlayerJoin(PlayerJoinEvent event) {
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();

    // Async load — main thread not blocked
    CompletableFuture.supplyAsync(() -> database.loadPlayer(uuid))
        .thenAccept(data -> {
            // Back on main thread for Bukkit API
            Bukkit.getScheduler().runTask(plugin, () -> {
                if (!player.isOnline()) return; // player may have disconnected
                playerDataManager.cache(uuid, data);
                player.sendMessage(Component.text("Welcome back! Kills: " + data.getKills()));
            });
        })
        .exceptionally(ex -> {
            plugin.getLogger().severe("Failed to load data for " + uuid + ": " + ex.getMessage());
            return null;
        });
}
```

**Prevention Strategy:**
- In your prompt: *"Never call database methods inside event handlers. Use `CompletableFuture.supplyAsync()` for async loading, then `Bukkit.getScheduler().runTask()` to apply results on the main thread."*
- Code review checklist: `[ ]` Zero direct database calls in event handler methods.

**Related Errors:** §2.4 (IllegalStateException async), §4.5 (Wrong scheduler)

---

## 7.4 Resource Leaks — Unclosed Statements and ResultSets

**Severity:** 🟡 MAJOR  
**Category:** Database

**Symptoms:**
- Memory usage grows over time.
- Database server reports too many open cursors.
- `SQLException: Too many open statements`.

**Root Cause:**  
AI models create `PreparedStatement` and `ResultSet` objects but only close the `Connection`, not the statement and result set. In JDBC, each must be closed independently. With HikariCP, closing the connection returns it to the pool but does not close statements created from it.

**Bad Code (What AI Generates):**
```java
Connection conn = dataSource.getConnection();
try {
    PreparedStatement stmt = conn.prepareStatement("SELECT * FROM players WHERE uuid = ?");
    stmt.setString(1, uuid.toString());
    ResultSet rs = stmt.executeQuery();
    // process rs...
    // stmt and rs never closed!
} finally {
    conn.close(); // only connection closed — stmt and rs leaked
}
```

**Good Code (The Fix):**
```java
// try-with-resources closes all three in reverse order: rs, stmt, conn
try (Connection conn = dataSource.getConnection();
     PreparedStatement stmt = conn.prepareStatement("SELECT * FROM players WHERE uuid = ?")) {
    stmt.setString(1, uuid.toString());
    try (ResultSet rs = stmt.executeQuery()) { // ResultSet in its own try-with-resources
        while (rs.next()) {
            // process row
        }
    }
} catch (SQLException e) {
    plugin.getLogger().severe("Query failed: " + e.getMessage());
}
```

**Prevention Strategy:**
- In your prompt: *"Use nested try-with-resources: outer for Connection and PreparedStatement, inner for ResultSet."*
- Code review checklist: `[ ]` Every `ResultSet` is in a try-with-resources. `[ ]` Every `PreparedStatement` is in a try-with-resources.

**Related Errors:** §7.2 (Pool exhaustion), §1.14 (Try-with-resources syntax)

---

## 7.5 SQLite Lock Errors

**Severity:** 🟡 MAJOR  
**Category:** Database

**Symptoms:**
```
org.sqlite.SQLiteException: [SQLITE_BUSY] The database file is locked
org.sqlite.SQLiteException: [SQLITE_LOCKED] A table in the database is locked
```

**Root Cause:**  
SQLite only supports one writer at a time. AI models generate async code that tries to write to SQLite from multiple threads simultaneously. Unlike MySQL, SQLite's file-level locking means concurrent writes cause `SQLITE_BUSY` errors.

**Bad Code (What AI Generates):**
```java
// Multiple async tasks writing to SQLite simultaneously
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> database.savePlayer(player1));
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> database.savePlayer(player2));
// Both run concurrently — SQLite lock error!
```

**Good Code (The Fix):**
```java
// Option 1: Single-threaded executor for SQLite writes
private final ExecutorService sqliteExecutor = Executors.newSingleThreadExecutor();

public CompletableFuture<Void> savePlayer(PlayerData data) {
    return CompletableFuture.runAsync(() -> {
        // All writes go through single thread — no concurrent writes
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "INSERT OR REPLACE INTO players (uuid, kills, deaths) VALUES (?, ?, ?)")) {
            stmt.setString(1, data.getUuid().toString());
            stmt.setInt(2, data.getKills());
            stmt.setInt(3, data.getDeaths());
            stmt.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Save failed: " + e.getMessage());
        }
    }, sqliteExecutor); // use single-threaded executor
}

// Option 2: HikariCP with SQLite WAL mode (allows concurrent reads, serialized writes)
config.addDataSourceProperty("journal_mode", "WAL");
config.addDataSourceProperty("synchronous", "NORMAL");
config.setMaximumPoolSize(1); // SQLite: max 1 connection for writes
```

**Prevention Strategy:**
- In your prompt: *"For SQLite, use a single-threaded executor for all write operations, or set `maximumPoolSize=1` in HikariCP. Enable WAL mode for better read concurrency."*
- Code review checklist: `[ ]` SQLite HikariCP pool size is 1. `[ ]` All SQLite writes go through a single-threaded executor.

**Related Errors:** §7.2 (Pool exhaustion), §3.8 (Race conditions)

---

## 7.6 Data Corruption on Crash — Missing Shutdown Save

**Severity:** 🔴 CRITICAL  
**Category:** Database

**Symptoms:**
- Player data reverts to previous state after server crash.
- Last few minutes of progress lost after unexpected shutdown.
- Data inconsistency between players who were online during crash.

**Root Cause:**  
AI models save player data only on `PlayerQuitEvent`. If the server crashes or is force-killed, quit events don't fire and in-memory data is lost. The AI doesn't generate periodic saves or crash-safe shutdown hooks.

**Bad Code (What AI Generates):**
```java
// Only saves on quit — data lost on crash
@EventHandler
public void onQuit(PlayerQuitEvent event) {
    savePlayer(event.getPlayer()); // only save point
}
```

**Good Code (The Fix):**
```java
// 1. Save on quit (normal case)
@EventHandler
public void onQuit(PlayerQuitEvent event) {
    PlayerData data = cache.remove(event.getPlayer().getUniqueId());
    if (data != null) savePlayerAsync(data);
}

// 2. Periodic save (crash protection)
private BukkitTask autoSaveTask;

public void startAutoSave() {
    autoSaveTask = Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, () -> {
        List<PlayerData> snapshot = new ArrayList<>(cache.values());
        for (PlayerData data : snapshot) {
            savePlayerSync(data); // sync within async task — fine
        }
        plugin.getLogger().info("Auto-saved " + snapshot.size() + " player records.");
    }, 6000L, 6000L); // every 5 minutes (6000 ticks)
}

// 3. Save all on disable (graceful shutdown)
@Override
public void onDisable() {
    if (autoSaveTask != null) autoSaveTask.cancel();
    // Synchronous save on disable — server is shutting down, async won't complete
    for (PlayerData data : cache.values()) {
        savePlayerSync(data);
    }
    plugin.getLogger().info("Saved all player data on shutdown.");
    if (dataSource != null) dataSource.close();
}
```

**Prevention Strategy:**
- In your prompt: *"Implement three save points: `PlayerQuitEvent`, periodic auto-save every 5 minutes, and synchronous save-all in `onDisable()`."*
- Code review checklist: `[ ]` `onDisable()` saves all cached data synchronously. `[ ]` Auto-save task is running. `[ ]` `onQuit` removes from cache and saves.

**Related Errors:** §3.5 (Task never cancelled), §2.10 (SQLException)

---

# 8. Security Vulnerabilities

---

## 8.1 SQL Injection via String Concatenation

**Severity:** 🔴 CRITICAL  
**Category:** Security

**Symptoms:**
- No runtime error — silent data breach.
- Database contents readable/modifiable by players.
- Entire database can be deleted by a malicious player.

**Root Cause:**  
String concatenation in SQL queries allows user input to be interpreted as SQL code. A player named `' OR '1'='1` can bypass WHERE clauses. A player named `'; DROP TABLE players; --` can delete tables.

**Bad Code (What AI Generates):**
```java
// CRITICAL VULNERABILITY — never do this
String sql = "SELECT * FROM bans WHERE player_name = '" + playerName + "'";
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery(sql);

// Input: ' OR '1'='1
// Resulting SQL: SELECT * FROM bans WHERE player_name = '' OR '1'='1'
// Returns ALL rows — ban check bypassed
```

**Good Code (The Fix):**
```java
// Parameterized queries — user input is NEVER interpreted as SQL
try (PreparedStatement stmt = conn.prepareStatement(
        "SELECT * FROM bans WHERE player_name = ?")) {
    stmt.setString(1, playerName); // treated as data, not SQL
    ResultSet rs = stmt.executeQuery();
    // Input: ' OR '1'='1
    // Executes: SELECT * FROM bans WHERE player_name = ''' OR ''1''=''1'
    // Returns zero rows — correct behavior
}
```

**Prevention Strategy:**
- In your prompt: *"NEVER concatenate user input into SQL strings. ALWAYS use PreparedStatement with `?` parameters."*
- Code review checklist: `[ ]` Zero SQL strings containing `+` with a variable. `[ ]` Every SQL query uses PreparedStatement.
- **This is non-negotiable. There are no exceptions.**

**Related Errors:** §7.1 (SQL injection in database section), §8.3 (Advanced SQL injection)

---

## 8.2 Path Traversal in File Commands

**Severity:** 🔴 CRITICAL  
**Category:** Security

**Symptoms:**
- Players can read `server.properties`, `ops.json`, plugin configs.
- Players can overwrite server files.
- No runtime error — silent data exfiltration.

**Root Cause:**  
AI models generate file-reading commands (e.g., `/log read <filename>`) that use the filename directly without validating it's within the expected directory. A player can pass `../../server.properties` to read the server configuration.

**Bad Code (What AI Generates):**
```java
// /readlog <filename> command
String filename = args[0]; // user-controlled
File logFile = new File(plugin.getDataFolder(), filename);
// Input: ../../server.properties
// Resolves to: plugins/MyPlugin/../../server.properties = server.properties
String content = Files.readString(logFile.toPath()); // reads server.properties!
```

**Good Code (The Fix):**
```java
String filename = args[0];
File dataFolder = plugin.getDataFolder();
File requestedFile = new File(dataFolder, filename);

// Canonicalize both paths and verify the requested file is inside the data folder
try {
    String canonicalDataFolder = dataFolder.getCanonicalPath();
    String canonicalRequestedFile = requestedFile.getCanonicalPath();

    if (!canonicalRequestedFile.startsWith(canonicalDataFolder + File.separator)) {
        sender.sendMessage(Component.text("Invalid file path.").color(NamedTextColor.RED));
        plugin.getLogger().warning(sender.getName() + " attempted path traversal: " + filename);
        return true;
    }

    // Safe to read
    String content = Files.readString(requestedFile.toPath());
    sender.sendMessage(Component.text(content));
} catch (IOException e) {
    sender.sendMessage(Component.text("Could not read file.").color(NamedTextColor.RED));
}
```

**Prevention Strategy:**
- In your prompt: *"Any command that reads or writes files based on user input must validate the canonical path is within the plugin's data folder."*
- Code review checklist: `[ ]` Every file operation with user-provided paths uses canonical path validation.

**Related Errors:** §8.1 (SQL injection), §8.4 (Permission bypass)

---

## 8.3 SQL Injection — Advanced (LIKE Clause and ORDER BY)

**Severity:** 🔴 CRITICAL  
**Category:** Security

**Symptoms:**
- Parameterized queries used but LIKE wildcards still exploitable.
- ORDER BY clause injected to extract data via timing attacks.

**Root Cause:**  
Even with PreparedStatement, two SQL constructs cannot be parameterized: `LIKE` wildcard characters (`%`, `_`) within the parameter value, and `ORDER BY` column names (which must be SQL identifiers, not string literals). AI models don't escape LIKE wildcards and sometimes build ORDER BY clauses from user input.

**Bad Code (What AI Generates):**
```java
// LIKE without escaping wildcards — user can search with % to get all records
PreparedStatement stmt = conn.prepareStatement(
    "SELECT * FROM players WHERE name LIKE ?");
stmt.setString(1, args[0]); // Input: "%" returns ALL players

// ORDER BY from user input — injection possible
String orderBy = args[0]; // user-controlled
String sql = "SELECT * FROM players ORDER BY " + orderBy; // INJECTION
```

**Good Code (The Fix):**
```java
// Escape LIKE wildcards
String searchTerm = args[0]
    .replace("\\", "\\\\")
    .replace("%", "\\%")
    .replace("_", "\\_");
PreparedStatement stmt = conn.prepareStatement(
    "SELECT * FROM players WHERE name LIKE ? ESCAPE '\\'");
stmt.setString(1, "%" + searchTerm + "%");

// ORDER BY — whitelist allowed column names
Set<String> allowedColumns = Set.of("name", "kills", "deaths", "joined");
String orderBy = args[0].toLowerCase();
if (!allowedColumns.contains(orderBy)) {
    sender.sendMessage(Component.text("Invalid sort column.").color(NamedTextColor.RED));
    return true;
}
String sql = "SELECT * FROM players ORDER BY " + orderBy; // safe — whitelisted
```

**Prevention Strategy:**
- In your prompt: *"Escape LIKE wildcards before using in PreparedStatement. Whitelist ORDER BY column names — never use user input directly in ORDER BY."*
- Code review checklist: `[ ]` Every LIKE query escapes `%` and `_` in the parameter. `[ ]` No user input in ORDER BY without whitelist validation.

**Related Errors:** §8.1 (SQL injection basic)

---

## 8.4 Permission Bypass Through Alias Variations

**Severity:** 🔴 CRITICAL  
**Category:** Security

**Symptoms:**
- Players bypass permission checks using command aliases.
- `/myplugin:admin` bypasses checks that only guard `/admin`.
- OP players can execute commands that should be restricted.

**Root Cause:**  
AI models check permissions only on the primary command label, not on aliases. Bukkit routes all aliases to the same executor, but the `label` parameter reflects which alias was used. If permission checks use the label string instead of `sender.hasPermission()`, aliases bypass them.

**Bad Code (What AI Generates):**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    // WRONG: checking label string instead of permission node
    if (label.equals("admin") && !sender.isOp()) {
        sender.sendMessage("No permission.");
        return true;
    }
    // /myplugin:admin bypasses this check because label != "admin"
}
```

**Good Code (The Fix):**
```java
@Override
public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
    // CORRECT: always check permission nodes, never check label strings for security
    if (!sender.hasPermission("myplugin.admin")) {
        sender.sendMessage(Component.text("You don't have permission.")
            .color(NamedTextColor.RED));
        return true;
    }
    // Works regardless of which alias was used
}
```

**Prevention Strategy:**
- In your prompt: *"Never use the `label` parameter for permission checks. Always use `sender.hasPermission('permission.node')`."*
- Code review checklist: `[ ]` Zero security checks based on `label` string comparison.

**Related Errors:** §3.1 (Inverted permission check), §5.5 (Permission node mismatches)

---

## 8.5 Economy Exploit — Negative Amount Transfers

**Severity:** 🔴 CRITICAL  
**Category:** Security

**Symptoms:**
- Players can give themselves money by "paying" negative amounts.
- `/pay PlayerName -1000` transfers 1000 from target to sender.
- Balance can go negative, breaking economy.

**Root Cause:**  
AI models implement economy commands without validating that amounts are positive. A negative payment reverses the direction of the transfer. A zero payment may cause division-by-zero in tax calculations.

**Bad Code (What AI Generates):**
```java
double amount = Double.parseDouble(args[1]); // no validation
economy.withdrawPlayer(sender, amount);  // negative amount = deposit!
economy.depositPlayer(target, amount);   // negative amount = withdraw!
```

**Good Code (The Fix):**
```java
double amount;
try {
    amount = Double.parseDouble(args[1]);
} catch (NumberFormatException e) {
    sender.sendMessage(Component.text("Invalid amount.").color(NamedTextColor.RED));
    return true;
}

// Validate amount
if (amount <= 0) {
    sender.sendMessage(Component.text("Amount must be greater than zero.")
        .color(NamedTextColor.RED));
    return true;
}

if (amount > MAX_TRANSFER) { // configurable maximum
    sender.sendMessage(Component.text("Amount exceeds maximum transfer limit.")
        .color(NamedTextColor.RED));
    return true;
}

// Check sender has sufficient funds
if (!economy.has(senderPlayer, amount)) {
    sender.sendMessage(Component.text("Insufficient funds.").color(NamedTextColor.RED));
    return true;
}

// Execute transfer
EconomyResponse withdrawResult = economy.withdrawPlayer(senderPlayer, amount);
if (!withdrawResult.transactionSuccess()) {
    sender.sendMessage(Component.text("Transfer failed: " + withdrawResult.errorMessage)
        .color(NamedTextColor.RED));
    return true;
}
economy.depositPlayer(targetPlayer, amount);
```

**Prevention Strategy:**
- In your prompt: *"Validate all economy amounts: must be > 0, must be <= configurable maximum, sender must have sufficient balance. Check `transactionSuccess()` on every Vault economy call."*
- Code review checklist: `[ ]` Every economy command validates `amount > 0`. `[ ]` Every `withdrawPlayer` result is checked for success.

**Related Errors:** §3.8 (Race conditions), §8.1 (SQL injection)

---

# 9. Build System Errors

---

## 9.1 Missing Provided Scope — 50MB JAR

**Severity:** 🔴 CRITICAL  
**Category:** Build

**Symptoms:**
- JAR file is 40-80MB instead of expected 50-500KB.
- Server startup warning: `Loaded class org.bukkit.Bukkit from MyPlugin.jar`.
- Conflicts with other plugins using the same library.

**Root Cause:**  
AI models mark Paper API as `<scope>compile</scope>` (the default) instead of `<scope>provided</scope>`. This bundles the entire Paper API (and all its dependencies) into the plugin JAR. The server already provides Paper at runtime — bundling it causes class conflicts and bloats the JAR.

**Bad Code (What AI Generates):**
```xml
<dependency>
    <groupId>io.papermc.paper</groupId>
    <artifactId>paper-api</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <!-- Missing scope — defaults to compile — WRONG -->
</dependency>
```

**Good Code (The Fix):**
```xml
<!-- pom.xml — complete correct configuration -->
<repositories>
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>
    <repository>
        <id>spigot-repo</id>
        <url>https://hub.spigotmc.org/nexus/content/repositories/snapshots/</url>
    </repository>
</repositories>

<dependencies>
    <!-- Server API — provided by server at runtime -->
    <dependency>
        <groupId>io.papermc.paper</groupId>
        <artifactId>paper-api</artifactId>
        <version>1.21.4-R0.1-SNAPSHOT</version>
        <scope>provided</scope>
    </dependency>

    <!-- Other plugin APIs — provided by those plugins at runtime -->
    <dependency>
        <groupId>net.milkbowl.vault</groupId>
        <artifactId>VaultAPI</artifactId>
        <version>1.7</version>
        <scope>provided</scope>
    </dependency>

    <!-- Libraries your plugin actually needs — must be in JAR -->
    <dependency>
        <groupId>com.zaxxer</groupId>
        <artifactId>HikariCP</artifactId>
        <version>5.1.0</version>
        <scope>compile</scope>  <!-- included in JAR via maven-shade-plugin -->
    </dependency>
</dependencies>
```

**Scope Decision Matrix:**

| Dependency Type | Scope |
|---|---|
| Paper / Spigot / Bukkit API | `provided` |
| Vault, LuckPerms, PAPI, other plugins | `provided` |
| HikariCP, Jedis, other libraries | `compile` (shade into JAR) |
| JUnit, Mockito (tests only) | `test` |

**Prevention Strategy:**
- In your prompt: *"Paper API, Vault, LuckPerms, and PlaceholderAPI must all be `<scope>provided</scope>`. Only libraries not provided by the server should be `<scope>compile</scope>`."*
- Code review checklist: `[ ]` JAR file size is under 5MB (unless intentionally bundling large libraries). `[ ]` Paper API is `provided`.

**Related Errors:** §1.3 (Package does not exist), §9.2 (Unshaded dependencies)

---

## 9.2 Unshaded Dependencies — NoClassDefFoundError at Runtime

**Severity:** 🔴 CRITICAL  
**Category:** Build

**Symptoms:**
```
java.lang.NoClassDefFoundError: com/zaxxer/hikari/HikariDataSource
java.lang.NoClassDefFoundError: redis/clients/jedis/Jedis
```
Plugin loads but crashes when it tries to use a library.

**Root Cause:**  
AI models add library dependencies to `pom.xml` but don't configure the `maven-shade-plugin` to bundle them into the JAR. Libraries like HikariCP, Jedis, and Apache Commons are not provided by the server — they must be included in the plugin JAR.

**Bad Code (What AI Generates):**
```xml
<!-- pom.xml — HikariCP added but not shaded -->
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.1.0</version>
    <!-- No shade plugin configured — HikariCP not in JAR -->
</dependency>
```

**Good Code (The Fix):**
```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-shade-plugin</artifactId>
            <version>3.5.1</version>
            <executions>
                <execution>
                    <phase>package</phase>
                    <goals>
                        <goal>shade</goal>
                    </goals>
                    <configuration>
                        <createDependencyReducedPom>false</createDependencyReducedPom>
                        <relocations>
                            <!-- Relocate to avoid conflicts with other plugins using same library -->
                            <relocation>
                                <pattern>com.zaxxer.hikari</pattern>
                                <shadedPattern>com.example.myplugin.libs.hikari</shadedPattern>
                            </relocation>
                        </relocations>
                        <filters>
                            <filter>
                                <artifact>*:*</artifact>
                                <excludes>
                                    <exclude>META-INF/*.SF</exclude>
                                    <exclude>META-INF/*.DSA</exclude>
                                    <exclude>META-INF/*.RSA</exclude>
                                </excludes>
                            </filter>
                        </filters>
                    </configuration>
                </execution>
            </executions>
        </plugin>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <version>3.12.1</version>
            <configuration>
                <source>21</source>
                <target>21</target>
            </configuration>
        </plugin>
    </plugins>
</build>
```

**Prevention Strategy:**
- In your prompt: *"Configure `maven-shade-plugin` to shade all `compile`-scope dependencies. Relocate shaded libraries to `com.yourplugin.libs.*` to avoid conflicts."*
- Code review checklist: `[ ]` `maven-shade-plugin` is configured. `[ ]` Every `compile`-scope library is relocated.

**Related Errors:** §2.7 (NoClassDefFoundError), §9.1 (Missing provided scope)

---

## 9.3 Wrong Repository Configuration

**Severity:** 🔴 CRITICAL  
**Category:** Build

**Symptoms:**
```
[ERROR] Failed to execute goal on project myplugin: 
Could not resolve dependencies for project com.example:myplugin:jar:1.0-SNAPSHOT: 
Could not find artifact io.papermc.paper:paper-api:jar:1.21.4-R0.1-SNAPSHOT
```

**Root Cause:**  
Paper API snapshots are not in Maven Central — they're in PaperMC's own repository. AI models sometimes omit the repository declaration or use the wrong URL. Similarly, Vault is in the SpigotMC Nexus, and LuckPerms is in the LuckPerms repository.

**Good Code (The Fix):**
```xml
<repositories>
    <!-- Paper API -->
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>

    <!-- Spigot API (if needed) -->
    <repository>
        <id>spigot-repo</id>
        <url>https://hub.spigotmc.org/nexus/content/repositories/snapshots/</url>
    </repository>

    <!-- Vault -->
    <repository>
        <id>jitpack.io</id>
        <url>https://jitpack.io</url>
    </repository>

    <!-- LuckPerms -->
    <repository>
        <id>luckperms-repo</id>
        <url>https://oss.sonatype.org/content/repositories/snapshots/</url>
    </repository>

    <!-- PlaceholderAPI -->
    <repository>
        <id>placeholderapi</id>
        <url>https://repo.extendedclip.com/content/repositories/placeholderapi/</url>
    </repository>
</repositories>
```

**Repository Quick Reference:**

| Artifact | Repository URL |
|---|---|
| Paper API | `https://repo.papermc.io/repository/maven-public/` |
| Spigot API | `https://hub.spigotmc.org/nexus/content/repositories/snapshots/` |
| Vault | `https://jitpack.io` |
| LuckPerms | `https://oss.sonatype.org/content/repositories/snapshots/` |
| PlaceholderAPI | `https://repo.extendedclip.com/content/repositories/placeholderapi/` |
| Citizens | `https://repo.citizensnpcs.co/` |
| HikariCP | Maven Central (no extra repo needed) |

**Prevention Strategy:**
- In your prompt: *"Include the PaperMC repository for Paper API. Include JitPack for Vault. Include the PlaceholderAPI repo for PAPI."*
- Code review checklist: `[ ]` Every non-Central dependency has its repository declared.

**Related Errors:** §1.3 (Package does not exist), §9.1 (Missing provided scope)

---

## 9.4 Dependency Version Conflicts

**Severity:** 🟡 MAJOR  
**Category:** Build

**Symptoms:**
```
java.lang.NoSuchMethodError: com.google.gson.JsonParser.parseString(Ljava/lang/String;)
java.lang.ClassNotFoundException: com.google.gson.JsonParser
```
Plugin works alone but breaks when loaded with other plugins.

**Root Cause:**  
Multiple plugins bundle different versions of the same library (most commonly Gson, Guava, or Apache Commons). The JVM loads the first version it finds and ignores subsequent ones. If your plugin was compiled against Gson 2.10 but another plugin loaded Gson 2.8 first, your code fails with `NoSuchMethodError` for methods added in 2.9+.

**Good Code (The Fix):**
```xml
<!-- Relocate ALL shaded libraries to your plugin's package -->
<relocations>
    <relocation>
        <pattern>com.google.gson</pattern>
        <shadedPattern>com.example.myplugin.libs.gson</shadedPattern>
    </relocation>
    <relocation>
        <pattern>com.google.common</pattern>
        <shadedPattern>com.example.myplugin.libs.guava</shadedPattern>
    </relocation>
    <relocation>
        <pattern>com.zaxxer.hikari</pattern>
        <shadedPattern>com.example.myplugin.libs.hikari</shadedPattern>
    </relocation>
    <relocation>
        <pattern>org.apache.commons</pattern>
        <shadedPattern>com.example.myplugin.libs.commons</shadedPattern>
    </relocation>
</relocations>
```

**Prevention Strategy:**
- In your prompt: *"Relocate every shaded library to `com.yourplugin.libs.*`. This prevents version conflicts with other plugins."*
- Code review checklist: `[ ]` Every shaded library has a relocation entry. `[ ]` Relocation target starts with your plugin's package.

**Related Errors:** §9.2 (Unshaded dependencies), §2.7 (NoClassDefFoundError)

---

## 9.5 Resource Filtering Failures — plugin.yml Not in JAR Root

**Severity:** 🔴 CRITICAL  
**Category:** Build

**Symptoms:**
```
[ERROR] Could not load 'plugins/MyPlugin.jar': Invalid plugin.yml
```
Or plugin.yml is present but contains literal `${project.version}` instead of the actual version.

**Root Cause:**  
Two separate issues: (1) `plugin.yml` is not in `src/main/resources/` so Maven doesn't include it in the JAR. (2) Maven resource filtering is not configured, so `${project.version}` placeholders in `plugin.yml` are not replaced with actual values.

**Bad Code (What AI Generates):**
```xml
<!-- pom.xml — no resource filtering configured -->
<build>
    <plugins>
        <!-- only compiler plugin, no resource filtering -->
    </plugins>
</build>
```

```yaml
# plugin.yml
version: ${project.version}  # not replaced — appears literally in JAR
```

**Good Code (The Fix):**
```xml
<build>
    <resources>
        <resource>
            <directory>src/main/resources</directory>
            <filtering>true</filtering>  <!-- enables ${...} replacement -->
        </resource>
    </resources>
    <plugins>
        <!-- ... -->
    </plugins>
</build>
```

```yaml
# plugin.yml — ${project.version} will be replaced by Maven
name: MyPlugin
version: '${project.version}'
main: com.example.myplugin.MyPlugin
api-version: '1.21'
```

**Prevention Strategy:**
- In your prompt: *"Configure `<filtering>true</filtering>` in the Maven resources section to enable `${project.version}` substitution in plugin.yml."*
- Code review checklist: `[ ]` `src/main/resources/plugin.yml` exists. `[ ]` Resource filtering is enabled in pom.xml.

**Related Errors:** §1.15 (Resource not found), §5.1 (Wrong main class path)

---

# Appendix A: Error Message Decoder

Quick reference: paste your error message, find the section.

| Error Message (partial) | Section | Severity |
|---|---|---|
| `cannot find symbol: method getPlayer` | §1.1 | 🔴 |
| `should be declared in a file named` | §1.2 | 🔴 |
| `package org.bukkit does not exist` | §1.3 | 🔴 |
| `Invalid plugin.yml` | §1.4, §5.1 | 🔴 |
| `does not override or implement` | §1.5 | 🔴 |
| `incompatible types` | §1.6 | 🟡 |
| `non-static variable...static context` | §1.7 | 🔴 |
| `generic array creation` | §1.8 | 🟡 |
| `unchecked cast` | §1.9 | 🟡 |
| `has been deprecated` | §1.10 | 🟡 |
| `found raw type` | §1.11 | 🟡 |
| `NullPointerException` in event handler | §2.1 | 🔴 |
| `ConcurrentModificationException` | §2.2 | 🔴 |
| `ClassCastException` entity/player | §2.3 | 🔴 |
| `Asynchronous entity add` | §2.4 | 🔴 |
| `StackOverflowError` in listener | §2.5 | 🔴 |
| `OutOfMemoryError: Java heap space` | §2.6 | 🔴 |
| `NoClassDefFoundError` | §2.7, §9.2 | 🔴 |
| `ArrayIndexOutOfBoundsException: Index 0` | §2.8 | 🔴 |
| `NumberFormatException: For input string` | §2.9 | 🟡 |
| `Connection is closed` / `Communications link failure` | §2.10 | 🔴 |
| `ArithmeticException: / by zero` | §2.11 | 🟡 |
| `UnsupportedOperationException` on list | §2.12 | 🟡 |
| `No enum constant org.bukkit.Material` | §2.13 | 🟡 |
| `StringIndexOutOfBoundsException` | §2.14 | 🟡 |
| Permission check always false | §3.1, §5.5 | 🔴 |
| Event cancelled but side effects run | §3.2 | 🔴 |
| GUI fires when clicking player inventory | §3.3 | 🔴 |
| Config value null / NPE on config read | §3.4 | 🟡 |
| Task running multiple times after reload | §3.5 | 🟡 |
| `AsyncPlayerChatEvent` deprecated warning | §4.1, §4.2 | 🟡 |
| MiniMessage tags appear as literal text | §4.3 | 🟡 |
| PDC data not persisting | §4.4 | 🟡 |
| `IllegalStateException: Asynchronous` | §2.4, §4.5 | 🔴 |
| `main class does not exist` | §5.1 | 🔴 |
| Plugin loads before dependency | §5.3 | 🟡 |
| `Unknown command` for registered command | §5.4 | 🟡 |
| `Timeout waiting for connection from pool` | §7.2 | 🔴 |
| Server freezes on player join | §7.3 | 🔴 |
| `SQLITE_BUSY` / `SQLITE_LOCKED` | §7.5 | 🟡 |
| Data lost after server crash | §7.6 | 🔴 |
| Economy exploit / negative balance | §8.5 | 🔴 |
| JAR file is 40-80MB | §9.1 | 🔴 |
| `Could not resolve dependencies` | §9.3 | 🔴 |
| `NoSuchMethodError` with other plugins loaded | §9.4 | 🟡 |
| `${project.version}` in plugin.yml | §9.5 | 🔴 |

---

# Appendix B: Prevention Cheat Sheet

## The 10 Most Effective Prompt Engineering Phrases

Include these phrases in your AI prompts to prevent the most common errors:

---

**1. Build System**
> *"Use Maven. Paper API must be `<scope>provided</scope>`. Configure `maven-shade-plugin` to shade and relocate all `compile`-scope dependencies to `com.myplugin.libs.*`."*

Prevents: §9.1, §9.2, §9.4

---

**2. Thread Safety**
> *"All Bukkit API calls must be on the main thread. Async tasks may only perform I/O. Always use `Bukkit.getScheduler().runTask(plugin, ...)` to return to the main thread after async work."*

Prevents: §2.4, §7.3, §4.5

---

**3. Database**
> *"Use HikariCP for database connections. Every connection must be in a try-with-resources block. Use PreparedStatement with `?` parameters — never concatenate user input into SQL strings."*

Prevents: §2.10, §7.1, §7.2, §7.4, §8.1

---

**4. Null Safety**
> *"Every `Bukkit.getPlayer()`, `Bukkit.getWorld()`, and config value read must be null-checked. Every `args[n]` access must check `args.length > n` first."*

Prevents: §2.1, §2.8, §3.4, §3.6

---

**5. Type Safety**
> *"Every entity cast must use `instanceof` with Java 16 pattern matching: `if (entity instanceof Player p)`. Never use `Material.valueOf()` — use `XMaterial.matchXMaterial()` instead."*

Prevents: §2.3, §2.13, §1.6

---

**6. Event Handling**
> *"After `event.setCancelled(true)`, always `return` immediately. Use `@EventHandler(ignoreCancelled = true)` on handlers that should skip cancelled events."*

Prevents: §3.2, §2.5

---

**7. Commands**
> *"Every command handler must check `args.length` before accessing any `args[n]`. Every `Integer.parseInt` must be in a try-catch. Every `getCommand()` result must be null-checked."*

Prevents: §2.8, §2.9, §5.4, §6.1, §6.2

---

**8. Permissions**
> *"Permission denial checks must use `!sender.hasPermission('node')`. Never check the `label` parameter for security. All permission nodes must be lowercase and match exactly between plugin.yml and code."*

Prevents: §3.1, §5.5, §8.4

---

**9. Text and Messages**
> *"Use the Adventure API (Component, MiniMessage) for all messages. Never use `ChatColor` or `sendMessage(String)`. Use `io.papermc.paper.event.player.AsyncChatEvent` for chat events."*

Prevents: §1.10, §4.1, §4.2, §4.3

---

**10. Data Persistence**
> *"Load player data on `PlayerJoinEvent` (async), save on `PlayerQuitEvent` (async), auto-save every 5 minutes (async), and save all synchronously in `onDisable()`."*

Prevents: §7.6, §2.6, §3.5

---

## Pre-Commit Checklist

Before every commit, verify:

- [ ] `mvn compile` produces zero errors
- [ ] `mvn compile` produces zero `[deprecation]` warnings
- [ ] JAR file size is under 5MB (or justified if bundling large libraries)
- [ ] `plugin.yml` has `api-version: '1.21'`
- [ ] Every `getCommand("x")` has a matching `x:` in plugin.yml
- [ ] Zero `ChatColor` imports in source
- [ ] Zero `AsyncPlayerChatEvent` imports in source
- [ ] Zero SQL strings containing `+` with a variable
- [ ] Every `args[n]` access has a preceding `args.length` check
- [ ] Every `Integer.parseInt` is in a try-catch
- [ ] Every `(Player)` cast has a preceding `instanceof`
- [ ] Every `Bukkit.getPlayer()` result is null-checked
- [ ] Every `BukkitTask` from `runTaskTimer` is stored in a field
- [ ] `onDisable()` cancels all tasks and saves all data
- [ ] Every database connection is in a try-with-resources
- [ ] No Bukkit API calls inside `runTaskAsynchronously` bodies (except `runTask` callback)

---

# Appendix C: Debug Flowchart

## Step-by-Step Debugging Decision Tree

```
PROBLEM OCCURS
│
├─► COMPILE ERROR?
│   │
│   ├─► "cannot find symbol" ──────────────────► Check API version (§1.1)
│   │                                             Check import statements
│   │                                             Check method signature (§1.5)
│   │
│   ├─► "package does not exist" ──────────────► Check pom.xml repositories (§9.3)
│   │                                             Check scope is 'provided' (§9.1)
│   │
│   ├─► "incompatible types" ──────────────────► Add explicit cast with instanceof (§2.3)
│   │                                             Use typed config getters (§1.6)
│   │
│   ├─► "non-static variable" ─────────────────► Remove static from field (§1.7)
│   │                                             Pass plugin instance via constructor
│   │
│   └─► "does not override" ───────────────────► Check exact method signature (§1.5)
│                                                 Check import for correct interface
│
├─► PLUGIN FAILS TO LOAD?
│   │
│   ├─► "Invalid plugin.yml" ──────────────────► Check YAML indentation (§1.4)
│   │                                             Validate with online YAML linter
│   │
│   ├─► "main class does not exist" ───────────► Check package + class name (§5.1)
│   │                                             Verify file is in src/main/java/
│   │
│   └─► "NoClassDefFoundError" ────────────────► Check softdepend in plugin.yml (§2.7)
│                                                 Check shade plugin config (§9.2)
│
├─► RUNTIME CRASH (check stack trace)?
│   │
│   ├─► NullPointerException
│   │   ├─► In event handler ─────────────────► Null-check manager references (§2.1)
│   │   ├─► On config read ───────────────────► Add default values (§3.4)
│   │   └─► On getCommand() ──────────────────► Add command to plugin.yml (§5.4)
│   │
│   ├─► ClassCastException ────────────────────► Add instanceof check (§2.3)
│   │
│   ├─► IllegalStateException (Async) ─────────► Move Bukkit calls to main thread (§2.4)
│   │
│   ├─► ArrayIndexOutOfBoundsException ────────► Add args.length check (§2.8)
│   │
│   ├─► NumberFormatException ─────────────────► Wrap parseInt in try-catch (§2.9)
│   │
│   ├─► StackOverflowError ────────────────────► Check for recursive event firing (§2.5)
│   │
│   ├─► ConcurrentModificationException ───────► Copy collection before iterating (§2.2)
│   │
│   └─► SQLException ──────────────────────────► Use try-with-resources (§7.4)
│                                                 Check HikariCP config (§2.10)
│
└─► LOGIC BUG (no error, wrong behavior)?
    │
    ├─► Permission check wrong way ────────────► Check for missing ! (§3.1)
    │
    ├─► Event fires but shouldn't ─────────────► Add return after setCancelled (§3.2)
    │
    ├─► GUI fires on player inventory click ───► Check getClickedInventory() (§3.3)
    │
    ├─► Config value wrong/missing ────────────► Add default to getter (§3.4)
    │
    ├─► Task running multiple times ───────────► Store and cancel task reference (§3.5)
    │
    ├─► Economy exploit / negative balance ────► Validate amount > 0 (§8.5)
    │
    └─► Data lost after crash ─────────────────► Add auto-save + onDisable save (§7.6)
```

---

## Complete pom.xml Template

A production-ready `pom.xml` for Paper 1.21.4 plugins:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>myplugin</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <name>MyPlugin</name>
    <description>A Paper 1.21.4 plugin</description>

    <properties>
        <java.version>21</java.version>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <repositories>
        <repository>
            <id>papermc</id>
            <url>https://repo.papermc.io/repository/maven-public/</url>
        </repository>
        <repository>
            <id>jitpack.io</id>
            <url>https://jitpack.io</url>
        </repository>
        <repository>
            <id>placeholderapi</id>
            <url>https://repo.extendedclip.com/content/repositories/placeholderapi/</url>
        </repository>
    </repositories>

    <dependencies>
        <!-- Paper API — provided by server -->
        <dependency>
            <groupId>io.papermc.paper</groupId>
            <artifactId>paper-api</artifactId>
            <version>1.21.4-R0.1-SNAPSHOT</version>
            <scope>provided</scope>
        </dependency>

        <!-- Vault — provided by Vault plugin -->
        <dependency>
            <groupId>com.github.MilkBowl</groupId>
            <artifactId>VaultAPI</artifactId>
            <version>1.7</version>
            <scope>provided</scope>
        </dependency>

        <!-- PlaceholderAPI — provided by PAPI plugin -->
        <dependency>
            <groupId>me.clip</groupId>
            <artifactId>placeholderapi</artifactId>
            <version>2.11.6</version>
            <scope>provided</scope>
        </dependency>

        <!-- HikariCP — must be shaded into JAR -->
        <dependency>
            <groupId>com.zaxxer</groupId>
            <artifactId>HikariCP</artifactId>
            <version>5.1.0</version>
            <scope>compile</scope>
        </dependency>
    </dependencies>

    <build>
        <resources>
            <resource>
                <directory>src/main/resources</directory>
                <filtering>true</filtering>
            </resource>
        </resources>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.12.1</version>
                <configuration>
                    <source>${java.version}</source>
                    <target>${java.version}</target>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.5.1</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals>
                            <goal>shade</goal>
                        </goals>
                        <configuration>
                            <createDependencyReducedPom>false</createDependencyReducedPom>
                            <relocations>
                                <relocation>
                                    <pattern>com.zaxxer.hikari</pattern>
                                    <shadedPattern>com.example.myplugin.libs.hikari</shadedPattern>
                                </relocation>
                            </relocations>
                            <filters>
                                <filter>
                                    <artifact>*:*</artifact>
                                    <excludes>
                                        <exclude>META-INF/*.SF</exclude>
                                        <exclude>META-INF/*.DSA</exclude>
                                        <exclude>META-INF/*.RSA</exclude>
                                    </excludes>
                                </filter>
                            </filters>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

---

*Minecraft Plugin Error Encyclopedia — Paper 1.21.4 / Java 21 / Maven*  
*50+ errors catalogued across 9 categories*  
*For internal team use — update as new errors are discovered*
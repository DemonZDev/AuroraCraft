# Spigot API Rules
## Plugin Target: Spigot 1.21.x (Legacy Bukkit API)

> **CRITICAL**: Spigot does NOT bundle Adventure API (Components, MiniMessage). You MUST use legacy ChatColor + String messages. Do NOT import `net.kyori.adventure` or `io.papermc.paper`.

## Dependency Configuration

### Maven
```xml
<repositories>
    <repository>
        <id>spigotmc-repo</id>
        <url>https://hub.spigotmc.org/nexus/content/groups/public/</url>
    </repository>
</repositories>

<dependencies>
    <dependency>
        <groupId>org.spigotmc</groupId>
        <artifactId>spigot-api</artifactId>
        <version>1.21.4-R0.1-SNAPSHOT</version>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

### Gradle
```kotlin
repositories {
    maven("https://hub.spigotmc.org/nexus/content/groups/public/")
}

dependencies {
    compileOnly("org.spigotmc:spigot-api:1.21.4-R0.1-SNAPSHOT")
}
```

## Critical API Differences from Paper

### 1. Messaging: Legacy ChatColor ONLY
```java
// CORRECT on Spigot — legacy ChatColor + String
import org.bukkit.ChatColor;
player.sendMessage(ChatColor.RED + "Error: " + ChatColor.WHITE + "No permission.");

// WRONG on Spigot — Adventure Components NOT available
// import net.kyori.adventure.text.Component;  // NoClassDefFoundError
// player.sendMessage(Component.text("Hello"));  // Crash
```

### 2. No Paper-Specific Classes
Do NOT import or reference ANY of these on Spigot:
- `io.papermc.paper.*` (all Paper API)
- `com.destroystokyo.paper.*` (legacy Paper)
- `net.kyori.adventure.*` (Adventure, bundled by Paper only)
- `org.bukkit.craftbukkit.*` (NMS — only available via BuildTools)

```java
// OK on Spigot — Bukkit API only
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.player.PlayerJoinEvent;
```

### 3. Scheduler: BukkitScheduler Only
```java
// Spigot scheduler — main thread sync tasks
Bukkit.getScheduler().runTask(plugin, () -> {
    player.teleport(location); // Safe on main thread
});

// Async tasks still work
Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
    PlayerData data = database.load(uuid); // Safe — no Bukkit API
    // Switch back for Bukkit API
    Bukkit.getScheduler().runTask(plugin, () -> {
        if (player.isOnline()) player.sendMessage("Data loaded!");
    });
});
```
No `AsyncScheduler` (Paper-only), no `RegionScheduler` (Folia-only), no `EntityScheduler`.

### 4. getOnlinePlayers() Returns Collection
```java
// On Spigot: Collection<? extends Player> — NOT List<Player>
Collection<? extends Player> onlinePlayers = Bukkit.getOnlinePlayers();

// Safe iteration (always make a copy if modifying)
List<Player> snapshot = new ArrayList<>(Bukkit.getOnlinePlayers());
for (Player player : snapshot) {
    // Safe to modify
}
```

### 5. No hasChangedBlock(), No hasChangedPosition()
```java
// Spigot — manual block change check
@EventHandler
public void onMove(PlayerMoveEvent event) {
    // Manual check — Paper's hasChangedBlock() not available
    Location from = event.getFrom();
    Location to = event.getTo();
    if (from.getBlockX() == to.getBlockX()
        && from.getBlockY() == to.getBlockY()
        && from.getBlockZ() == to.getBlockZ()) {
        return; // Only rotation
    }
    processMovement(event.getPlayer(), to);
}
```

### 6. No teleportAsync()
```java
// Spigot — sync teleport only
player.teleport(location); // Blocks if chunk not loaded
// No player.teleportAsync(location) — Paper only

// Workaround: manual chunk loading
if (!location.getWorld().isChunkLoaded(location.getBlockX() >> 4, location.getBlockZ() >> 4)) {
    location.getWorld().loadChunk(location.getBlockX() >> 4, location.getBlockZ() >> 4);
}
player.teleport(location);
```

### 7. No Registry API
```java
// Spigot — no Registry API (Paper 1.20+)
// Use Material enum directly
Material blockType = Material.STONE; // Fine on all versions

// WRONG on Spigot — Registry API is Paper-only
// Registry.MATERIAL.get(NamespacedKey.minecraft("stone"));
```

### 8. Plugin Messaging
```java
// Spigot plugin messages — legacy byte array format
player.sendPluginMessage(plugin, channel, data); // byte[]

// Register channels in onEnable()
getServer().getMessenger().registerOutgoingPluginChannel(plugin, "BungeeCord");
getServer().getMessenger().registerIncomingPluginChannel(plugin, "BungeeCord", this);
```

### 9. Event Differences
- `PlayerJoinEvent` — setJoinMessage(String) NOT joinMessage(Component)
- `PlayerQuitEvent` — setQuitMessage(String) NOT quitMessage(Component)
- `AsyncPlayerChatEvent` — getMessage() returns String, NOT Component
- No `AsyncChatEvent` — that's Paper 1.19+ only
- No `ServerLoadEvent` — use `onEnable()` for startup logic

### 10. No Plugin Lifecycle Events
```java
// Paper's LifecycleEventManager is NOT available on Spigot
// Do NOT import io.papermc.paper.plugin.lifecycle.event.*

// Instead, use standard Bukkit plugin lifecycle:
@Override
public void onEnable() {
    registerCommands(); // Direct registration
    registerListeners();
}
```

## Plugin Compatibility
- Spigot plugins run on: Spigot, Paper, Purpur, Pufferfish, all Paper forks
- Spigot plugins do NOT have access to: Paper API, Adventure Components, Folia schedulers
- Target Spigot if you need maximum compatibility across all server types
- Target Paper if you can require Paper features (smaller JAR, modern API)

## Build Verification
```bash
# After building, verify Paper API is NOT in JAR
jar tf MyPlugin.jar | grep -i "io/papermc\|net/kyori/adventure"

# Should return NOTHING — these are only on Paper-capable servers
# If they appear, you have a Paper dependency that should be removed
```

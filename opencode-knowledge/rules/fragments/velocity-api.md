# Velocity Proxy API Rules
## Plugin Target: Velocity 3.x (Modern Minecraft Proxy)

> **CRITICAL**: Velocity is a PROXY, not a game server. There is NO world, NO blocks, NO entities, NO inventories, NO Bukkit API. Plugins handle network-level operations only.

## Dependency Configuration

### Maven
```xml
<repositories>
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>
</repositories>

<dependencies>
    <dependency>
        <groupId>com.velocitypowered</groupId>
        <artifactId>velocity-api</artifactId>
        <version>3.5.0-SNAPSHOT</version>
        <scope>provided</scope>
    </dependency>

    <!-- Annotation processor REQUIRED for @Plugin metadata generation -->
    <dependency>
        <groupId>com.velocitypowered</groupId>
        <artifactId>velocity-api</artifactId>
        <version>3.5.0-SNAPSHOT</version>
        <scope>provided</scope>
        <classifier>annotations</classifier>
    </dependency>
</dependencies>
```

### Gradle
```kotlin
repositories {
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("com.velocitypowered:velocity-api:3.5.0-SNAPSHOT")
    annotationProcessor("com.velocitypowered:velocity-api:3.5.0-SNAPSHOT")
}
```

## Plugin Structure — NO plugin.yml

```java
import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.proxy.ProxyServer;
import java.util.logging.Logger;

@Plugin(
    id = "myplugin",
    name = "MyPlugin",
    version = "1.0.0",
    description = "A Velocity proxy plugin",
    authors = {"YourName"},
    dependencies = {
        @Dependency(id = "luckperms")
    }
)
public class MyPlugin {

    private final ProxyServer server;
    private final Logger logger;

    @Inject
    public MyPlugin(ProxyServer server, Logger logger) {
        this.server = server;
        this.logger = logger;
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
        logger.info("Plugin enabled on Velocity proxy!");
    }
}
```

## Critical Differences from Bukkit/Paper

### 1. NO plugin.yml — Use @Plugin Annotation
Velocity uses annotation processing to generate `velocity-plugin.json`. The `@Plugin` annotation MUST include:
- `id` — unique plugin identifier (lowercase, hyphens)
- `name` — display name
- `version` — semantic version
- `authors` — array of author names

### 2. Dependency Injection via @Inject
```java
import com.google.inject.Inject;
import com.velocitypowered.api.proxy.ProxyServer;

// Constructor injection — no static getInstance()
@Inject
public MyPlugin(ProxyServer server, Logger logger) {
    this.server = server;
}
// Injectables: ProxyServer, Logger, @DataDirectory Path, PluginManager
```

### 3. Event System: @Subscribe NOT @EventHandler
```java
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.LoginEvent;
import com.velocitypowered.api.event.player.ServerConnectedEvent;

// CORRECT — @Subscribe
@Subscribe
public void onPlayerLogin(LoginEvent event) {
    // event.getPlayer() returns Player (proxy-level, NOT Bukkit Player)
}

// WRONG — @EventHandler is Bukkit API, does not exist on Velocity
// @EventHandler
// public void onJoin(PlayerJoinEvent event) { ... }
```

### 4. No World/Block/Entity/Inventory API
```java
// AVAILABLE on Velocity:
ProxyServer server;           // Core proxy operations
Player player;                // Network player (NOT Bukkit Player)
RegisteredServer server;      // Backend server reference
Component message;            // Adventure message

// NOT AVAILABLE:
// player.getLocation()       // No world coordinates
// player.getInventory()      // No inventory
// player.teleport(location)  // No teleport
// player.sendTitle(...)      // No titles
// world.spawnEntity(...)     // No entities
```

### 5. Server Switching
```java
import com.velocitypowered.api.proxy.server.RegisteredServer;

// Switch player to a different backend server
@Subscribe
public void onLogin(LoginEvent event) {
    Player player = event.getPlayer();
    Optional<RegisteredServer> lobby = server.getServer("lobby");
    
    if (lobby.isPresent()) {
        player.createConnectionRequest(lobby.get())
            .connect()
            .thenAccept(result -> {
                if (result.isSuccessful()) {
                    logger.info(player.getUsername() + " connected to lobby");
                }
            });
    }
}
```

### 6. Messaging: Adventure Components NATIVE
```java
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;

// Velocity uses Adventure natively — no ChatColor
player.sendMessage(Component.text("Welcome!", NamedTextColor.GREEN));

// Player disconnected message (sent to all players on that backend server)
Component disconnectMsg = Component.text("Player left", NamedTextColor.GRAY);
player.disconnect(disconnectMsg);
```

### 7. Plugin Messaging Channels
```java
import com.velocitypowered.api.proxy.messages.ChannelIdentifier;
import com.velocitypowered.api.proxy.messages.MinecraftChannelIdentifier;

// Create channel
MinecraftChannelIdentifier channel = MinecraftChannelIdentifier.create("myplugin", "main");

// Register incoming channel
server.getChannelRegistrar().register(channel);

// Send plugin message to a player's connected server
byte[] data = "Hello".getBytes(StandardCharsets.UTF_8);
player.getCurrentServer().ifPresent(s -> s.sendPluginMessage(channel, data));
```

### 8. Scheduler
```java
import com.velocitypowered.api.scheduler.ScheduledTask;

// Schedule a task (async — there is no "sync" concept on proxy)
ScheduledTask task = server.getScheduler()
    .buildTask(this, () -> {
        // Runs on Velocity's thread pool
        logger.info("Scheduled task ran!");
    })
    .delay(5, TimeUnit.SECONDS)    // Wait 5 seconds
    .repeat(30, TimeUnit.SECONDS)  // Repeat every 30 seconds
    .schedule();

// Cancel task
task.cancel();
```

### 9. Tab List API
```java
import com.velocitypowered.api.proxy.player.TabList;
import com.velocitypowered.api.proxy.player.TabListEntry;

TabList tabList = player.getTabList();

// Add player to tab list
TabListEntry entry = TabListEntry.builder()
    .profile(player.getGameProfile())
    .displayName(Component.text("VIP " + player.getUsername(), NamedTextColor.GOLD))
    .latency(50)
    .gameMode(1) // 1 = Creative
    .tabList(tabList)
    .build();

tabList.addEntry(entry);
```

### 10. Player Information
```java
// Connection info
player.getRemoteAddress();     // SocketAddress
player.getProtocolVersion();   // ProtocolVersion
player.getClientBrand();       // Optional<String> — e.g. "vanilla", "fml", "lunarclient"
player.getPing();              // long — latency in ms
player.getUniqueId();          // UUID
player.getUsername();          // String

// Current server
player.getCurrentServer();     // Optional<ServerConnection>

// Game profile
player.getGameProfile();       // GameProfile (UUID + name + properties)
player.getGameProfileProperties(); // List<Property> (textures, cape, etc.)
```

## Common AI Mistakes on Velocity

1. **Using `plugin.yml` instead of `@Plugin` annotation** — Velocity generates metadata from annotations
2. **Importing `org.bukkit.*` or `org.spigotmc.*`** — None of this exists on Velocity
3. **Using `Bukkit.getScheduler()`** — Use `server.getScheduler()` instead
4. **Calling world/block/entity methods** — Proxy doesn't have these
5. **Using `@EventHandler` instead of `@Subscribe`** — Different event systems
6. **Using `ChatColor`** — Use Adventure Components only
7. **Forgetting annotation processor** — Without it, no `velocity-plugin.json` is generated

## File Structure
```
src/main/java/com/example/myplugin/
└── MyPlugin.java              ← Main class with @Plugin annotation

src/main/resources/
└── (No plugin.yml needed)     ← Velocity generates velocity-plugin.json
```

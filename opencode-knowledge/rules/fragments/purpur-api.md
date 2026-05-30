# Purpur API Rules
## Plugin Target: Purpur (Paper Fork with Extra Features)

> Purpur is a drop-in replacement for Paper. All Paper API is available plus Purpur-specific configuration and API additions.

## Dependency Configuration

### Maven
```xml
<repositories>
    <repository>
        <id>purpurmc</id>
        <url>https://repo.purpurmc.org/snapshots</url>
    </repository>
</repositories>

<dependencies>
    <dependency>
        <groupId>org.purpurmc.purpur</groupId>
        <artifactId>purpur-api</artifactId>
        <version>1.21.4-R0.1-SNAPSHOT</version>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

### Gradle
```kotlin
repositories {
    maven("https://repo.purpurmc.org/snapshots")
}

dependencies {
    compileOnly("org.purpurmc.purpur:purpur-api:1.21.4-R0.1-SNAPSHOT")
}
```

## What's Included
Purpur API includes ALL of:
- Bukkit API (`org.bukkit`)
- Spigot API (`org.spigotmc`)
- Paper API (`io.papermc.paper`, `com.destroystokyo.paper`)
- Adventure API (`net.kyori.adventure`)
- Plus Purpur-specific API (`org.purpurmc.purpur`)

You only need ONE dependency: `org.purpurmc.purpur:purpur-api`.

## Purpur-Specific Features

### 1. PurpurConfig — Server-Wide Settings
```java
import org.purpurmc.purpur.PurpurConfig;

// Access Purpur server configuration values
boolean demoMode = PurpurConfig.demoCommand; // /demo command enabled?
double tpsCatchup = PurpurConfig.tpsCatchup; // TPS catchup rate
String serverModName = PurpurConfig.serverModName; // Custom server name in F3
```

### 2. Entity Configuration
Purpur exposes extensive per-entity configurability. Plugins can read these server-configured values:
```java
import org.purpurmc.purpur.entity.PurpurEntityConfig;

// Check entity behavior from purpur.yml config
PurpurEntityConfig config = PurpurEntityConfig.get(Material.SHEEP_SPAWN_EGG);
if (config != null) {
    double health = config.health; // Custom max health from config
    boolean ridable = config.ridable; // Is entity ridable?
    float speed = config.movementSpeed; // Custom speed multiplier
}
```

### 3. AFK System
```java
// Purpur has a built-in AFK detection system
// Plugins can check AFK status
import org.purpurmc.purpur.event.PlayerAFKEvent;

@EventHandler
public void onPlayerAFK(PlayerAFKEvent event) {
    Player player = event.getPlayer();
    // Player is being marked as AFK
    // Use this event for cleanup, display changes, etc.
}
```

### 4. MiniMessage Integration
Purpur has built-in MiniMessage support in purpur.yml. Plugins can use this for consistent formatting:
```java
import net.kyori.adventure.text.minimessage.MiniMessage;

MiniMessage mm = MiniMessage.miniMessage();
Component msg = mm.deserialize("<red>Error: <white>No permission!");
player.sendMessage(msg);
```

### 5. Rideable Mobs
Purpur allows making any mob ridable via config. Plugins can interact:
```java
// Check if a mob is configured as ridable
if (entity.isInsideVehicle()) {
    Entity vehicle = entity.getVehicle();
    // Handle custom ride logic
}
```

### 6. Purpur Events
```java
import org.purpurmc.purpur.event.PlayerAFKEvent;
import org.purpurmc.purpur.event.PlayerBookTooLargeEvent;

@EventHandler
public void onBookTooLarge(PlayerBookTooLargeEvent event) {
    Player player = event.getPlayer();
    int pages = event.getPageCount();
    // Page limit exceeded — handle gracefully
    player.sendMessage(Component.text("Book has " + pages + " pages. Limit: " + event.getMaxPages()));
}
```

## Threading Model
Purpur uses the same single-threaded main thread as Paper (NO Folia-style regionized threading). All standard Paper threading rules apply:
- Bukkit API calls → main thread only
- Database I/O → async thread with sync callback
- Use `BukkitScheduler`, NOT Folia schedulers

## When to Target Purpur
- You need Paper API features (Adventure Components, modern events)
- You want to support Purpur's unique configuration and entity system
- Your plugin benefits from AFK detection, book limits, or other Purpur features
- Server owners running Purpur expect plugins that leverage its features

## Plugin Compatibility
- Purpur plugins run on: Purpur only (for Purpur-specific API)
- Paper API portions run on: Paper, Purpur, Pufferfish, Folia
- For cross-platform plugins: target Paper API, check `Class.forName("org.purpurmc.purpur.PurpurConfig")` before using Purpur features

## Graceful Degradation
```java
private boolean purpurAvailable;

@Override
public void onEnable() {
    try {
        Class.forName("org.purpurmc.purpur.PurpurConfig");
        purpurAvailable = true;
        getLogger().info("Purpur features enabled.");
    } catch (ClassNotFoundException e) {
        purpurAvailable = false;
        getLogger().info("Running on non-Purpur server — Purpur features disabled.");
    }
}

public void processPlayer(Player player) {
    if (purpurAvailable) {
        // Use Purpur-specific features
    } else {
        // Fallback to Paper/Bukkit API
    }
}
```

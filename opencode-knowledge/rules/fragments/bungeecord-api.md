# BungeeCord / Waterfall Proxy API Rules
## Plugin Target: BungeeCord (Legacy Minecraft Proxy)

> **CRITICAL**: BungeeCord is a PROXY. No worlds, blocks, entities, or Bukkit API. Uses `bungee.yml` descriptor (NOT `plugin.yml`). Waterfall is EOL — prefer Velocity for new projects.

## Dependency Configuration

### Maven
```xml
<repositories>
    <repository>
        <id>bungeecord-repo</id>
        <url>https://oss.sonatype.org/content/repositories/snapshots</url>
    </repository>
</repositories>

<dependencies>
    <dependency>
        <groupId>net.md-5</groupId>
        <artifactId>bungeecord-api</artifactId>
        <version>1.21-R0.4-SNAPSHOT</version>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

### Gradle
```kotlin
repositories {
    maven("https://oss.sonatype.org/content/repositories/snapshots")
}

dependencies {
    compileOnly("net.md-5:bungeecord-api:1.21-R0.4-SNAPSHOT")
}
```

## Plugin Structure — Uses bungee.yml

```java
import net.md_5.bungee.api.plugin.Plugin;
import net.md_5.bungee.api.ProxyServer;

public class MyPlugin extends Plugin {

    @Override
    public void onEnable() {
        getLogger().info("Plugin enabled on BungeeCord proxy!");
        getProxy().getPluginManager().registerCommand(this, new MyCommand());
        getProxy().getPluginManager().registerListener(this, new MyListener());
    }

    @Override
    public void onDisable() {
        getLogger().info("Plugin disabled.");
    }
}
```

### bungee.yml (NOT plugin.yml)
```yaml
name: MyPlugin
version: 1.0.0
main: com.example.myplugin.MyPlugin
author: YourName
description: A BungeeCord proxy plugin
```

## Critical Differences from Bukkit/Paper

### 1. Plugin Base Class: `extends Plugin`
```java
// BungeeCord — extends net.md_5.bungee.api.plugin.Plugin
public class MyPlugin extends Plugin { ... }

// NOT: extends JavaPlugin (that's Bukkit only)
```

### 2. Messaging: BaseComponent[] / TextComponent
```java
import net.md_5.bungee.api.ChatColor;
import net.md_5.bungee.api.chat.TextComponent;
import net.md_5.bungee.api.chat.ComponentBuilder;

// BungeeCord ChatColor — DIFFERENT from Bukkit ChatColor
player.sendMessage(new TextComponent(ChatColor.RED + "Error message"));

// Component builder for rich messages
player.sendMessage(
    new ComponentBuilder("Welcome ")
        .color(ChatColor.GREEN)
        .append("Player!")
        .color(ChatColor.GOLD)
        .create()
);

// WRONG — Adventure Components not built-in
// player.sendMessage(net.kyori.adventure.text.Component.text("Hi")); // NoClassDefFoundError
```

If you need Adventure, shade it manually:
```xml
<dependency>
    <groupId>net.kyori</groupId>
    <artifactId>adventure-platform-bungeecord</artifactId>
    <version>4.3.4</version>
    <scope>compile</scope>
</dependency>
```

### 3. Event System: @EventHandler on Listener
```java
import net.md_5.bungee.api.event.PostLoginEvent;
import net.md_5.bungee.api.event.PlayerDisconnectEvent;
import net.md_5.bungee.api.plugin.Listener;
import net.md_5.bungee.event.EventHandler;

public class ConnectionListener implements Listener {

    @EventHandler
    public void onPostLogin(PostLoginEvent event) {
        ProxiedPlayer player = event.getPlayer();
        player.sendMessage(new TextComponent("Welcome to the network!"));
    }

    @EventHandler
    public void onDisconnect(PlayerDisconnectEvent event) {
        getProxy().getLogger().info(event.getPlayer().getName() + " disconnected");
    }
}
```

### 4. ProxyPlayer ≠ Bukkit Player
```java
import net.md_5.bungee.api.connection.ProxiedPlayer;

ProxiedPlayer player = event.getPlayer();

// AVAILABLE:
player.getName();           // String — player name
player.getUniqueId();       // UUID
player.getAddress();        // SocketAddress
player.getPing();           // int — latency
player.getServer();         // ServerInfo — current backend server
player.sendMessage(TextComponent);  // Send message
player.disconnect(TextComponent);   // Disconnect with reason

// NOT AVAILABLE (no world on proxy):
// player.getLocation(), player.getInventory(), player.teleport()
// player.getHealth(), player.getGameMode(), player.sendTitle()
```

### 5. Server Connection
```java
import net.md_5.bungee.api.config.ServerInfo;

// Switch player to a different backend server
ServerInfo target = getProxy().getServerInfo("lobby");
if (target != null) {
    player.connect(target);
}

// All registered servers
Map<String, ServerInfo> servers = getProxy().getServers();

// Get all players
Collection<ProxiedPlayer> players = getProxy().getPlayers();
```

### 6. Scheduler
```java
// Schedule async task
getProxy().getScheduler().runAsync(this, () -> {
    // Network operation
    String response = fetchFromAPI();
    getProxy().getLogger().info("API response: " + response);
});

// Schedule delayed task
getProxy().getScheduler().schedule(this, () -> {
    // Runs after delay
}, 5, TimeUnit.SECONDS);

// Schedule repeating task
getProxy().getScheduler().schedule(this, () -> {
    // Runs every 30 seconds
}, 0, 30, TimeUnit.SECONDS);
```

### 7. Commands
```java
import net.md_5.bungee.api.CommandSender;
import net.md_5.bungee.api.plugin.Command;

public class MyCommand extends Command {

    public MyCommand() {
        super("mycommand", "myplugin.command", "mycmd");
    }

    @Override
    public void execute(CommandSender sender, String[] args) {
        if (!(sender instanceof ProxiedPlayer)) {
            sender.sendMessage(new TextComponent("Only players can use this!"));
            return;
        }
        ProxiedPlayer player = (ProxiedPlayer) sender;
        player.sendMessage(new TextComponent("Command executed!"));
    }
}

// Register in onEnable()
getProxy().getPluginManager().registerCommand(this, new MyCommand());
```

### 8. Plugin Messaging
```java
// Register channel
getProxy().registerChannel("myplugin:channel");

// Send message
ByteArrayOutputStream stream = new ByteArrayOutputStream();
DataOutputStream out = new DataOutputStream(stream);
out.writeUTF("Forward");
out.writeUTF("ALL");
out.writeUTF("MyChannel");

player.getServer().sendData("myplugin:channel", stream.toByteArray());

// Receive messages — implement plugin message listener
// No standard Listener for plugin messages in BungeeCord API
```

### 9. Tab List
```java
// BungeeCord tab list is limited compared to Velocity
// Basic operations only
player.setTabHeader(
    new TextComponent("Welcome to MyNetwork"),
    new TextComponent("Visit our website!")
);
```

### 10. Server Ping Customization
```java
import net.md_5.bungee.api.event.ProxyPingEvent;

public class PingListener implements Listener {
    @EventHandler
    public void onPing(ProxyPingEvent event) {
        ServerPing ping = event.getResponse();
        ping.setDescription("My Cool Server\nSecond Line");
        ping.getPlayers().setMax(100);
        // Customize MOTD, player count, favicon
    }
}
```

## Common AI Mistakes on BungeeCord

1. **Extending JavaPlugin instead of net.md_5.bungee.api.plugin.Plugin** — Different base class
2. **Using plugin.yml instead of bungee.yml** — BungeeCord looks for `bungee.yml`
3. **Importing org.bukkit.* classes** — None of these exist on BungeeCord proxy
4. **Using Adventure Components without shading** — Not bundled with BungeeCord
5. **Trying to teleport or spawn entities on a proxy** — No world access
6. **Using Bukkit.getScheduler()** — Use getProxy().getScheduler()
7. **Using Bukkit ChatColor** — Use net.md_5.bungee.api.ChatColor (different package)
8. **Waterfall is EOL** — PaperMC recommends Velocity, but BungeeCord plugins still work on Waterfall

## bungee.yml Example
```yaml
name: MyPlugin
main: com.example.myplugin.MyPlugin
version: ${project.version}
author: YourName
description: A sample BungeeCord plugin
depends:
  - LuckPerms
softDepends:
  - RedisBungee
```

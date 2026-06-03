---
name: paper-components
description: Use Adventure Components, MiniMessage, and modern messaging API on Paper 1.21.4
license: MIT
compatibility: opencode
metadata:
  category: messaging
  difficulty: beginner
---

# Paper Components (Adventure API) Skill

## What I Do

Set up modern message sending using Adventure Components, MiniMessage formatting, and Paper's Audience API. Replaces all legacy `ChatColor` + `String` usage.

## Why Adventure?
- **Bundled with Paper 1.16+** — no dependency to shade or download
- **Richer formatting** — gradients, hover events, click events, translations
- **No legacy color codes** — no `&c`, no `ChatColor.RED`
- **Thread-safe** — Components can be created anywhere (not just main thread)

## Implementation Pattern

### 1. Basic Messages

```java
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;

// Simple colored message
player.sendMessage(Component.text("Welcome!", NamedTextColor.GREEN));

// With multiple styles
player.sendMessage(Component.text("Error: ", NamedTextColor.RED, TextDecoration.BOLD)
    .append(Component.text("No permission.", NamedTextColor.GRAY)));

// With hover text and click action
player.sendMessage(Component.text("Click here to teleport", NamedTextColor.AQUA)
    .hoverEvent(HoverEvent.showText(Component.text("Click to teleport to spawn")))
    .clickEvent(ClickEvent.runCommand("/spawn")));
```

### 2. MiniMessage (Preferred for Complex Formatting)

```java
import net.kyori.adventure.text.minimessage.MiniMessage;

MiniMessage mm = MiniMessage.miniMessage();

// Simple colors and formatting
player.sendMessage(mm.deserialize("<red>Error: <white>No permission!"));

// Gradients
player.sendMessage(mm.deserialize("<gradient:red:blue>Rainbow text!</gradient>"));

// Hover and click
player.sendMessage(mm.deserialize(
    "<green>Click <hover:show_text:'Click to teleport'><click:run_command:'/spawn'>here</click></hover> to go to spawn!"
));

// Placeholders
String playerName = player.getName();
int tokens = 500;
player.sendMessage(mm.deserialize(
    "<gold>Balance for <green>" + playerName + "</green>: <yellow>" + tokens + " tokens</yellow></gold>"
));

// Complex template
Component message = mm.deserialize("""
    <dark_gray>=== <aqua>Server Info <dark_gray>===
    <gray>Players: <green>{online}/{max}</green>
    <gray>TPS: <green>{tps}</green>
    <gray>Uptime: <green>{uptime}</green>
    """.replace("{online}", String.valueOf(online))
      .replace("{max}", String.valueOf(max))
      .replace("{tps}", String.format("%.1f", tps))
      .replace("{uptime}", uptime));
player.sendMessage(message);
```

### 3. Titles and ActionBar

```java
import net.kyori.adventure.title.Title;
import java.time.Duration;

// Simple title
player.showTitle(Title.title(
    Component.text("Level Up!", NamedTextColor.GOLD),
    Component.text("You are now level 50", NamedTextColor.GREEN)
));

// Animated title with timing
Title title = Title.title(
    Component.text("Boss Battle!", NamedTextColor.RED, TextDecoration.BOLD),
    Component.text("The Dragon has awakened...", NamedTextColor.GRAY),
    Title.Times.times(
        Duration.ofMillis(500),   // Fade in: 500ms
        Duration.ofSeconds(3),    // Stay: 3 seconds
        Duration.ofMillis(1000)   // Fade out: 1 second
    )
);
player.showTitle(title);

// ActionBar
player.sendActionBar(Component.text("Mana: " + mana + "/" + maxMana, NamedTextColor.AQUA));
```

### 4. Broadcast Messages

```java
// Broadcast to all players
Component broadcast = Component.text("[Announcement] ", NamedTextColor.GOLD)
    .append(Component.text("Server restart in 30 seconds!", NamedTextColor.RED));

Bukkit.broadcast(broadcast);

// Broadcast with permission filter
Bukkit.broadcast(broadcast, "myplugin.seebroadcasts");

// Multi-audience send
Audience.audience(player1, player2, player3)
    .sendMessage(Component.text("Party invite sent!", NamedTextColor.GREEN));
```

### 5. BossBar

```java
import org.bukkit.boss.BossBar;
import org.bukkit.boss.BarColor;
import org.bukkit.boss.BarStyle;

// Create a boss bar with Component title
BossBar bar = Bukkit.createBossBar(
    Component.text("Boss Health: 100%", NamedTextColor.RED),
    BarColor.RED,
    BarStyle.SOLID
);
bar.addPlayer(player);

// Update the boss bar
bar.setTitle(Component.text("Boss Health: " + healthPercent + "%", NamedTextColor.RED));
bar.setProgress(healthPercent / 100.0);
bar.setColor(healthPercent < 25 ? BarColor.RED : BarColor.YELLOW);

// Remove when done
bar.removePlayer(player);
bar.setVisible(false);
```

### 6. Item Meta with Components

```java
import net.kyori.adventure.text.Component;

ItemStack item = new ItemStack(Material.DIAMOND);
ItemMeta meta = item.getItemMeta();

// Set display name using Component (Paper API)
meta.displayName(Component.text("Magic Diamond", NamedTextColor.AQUA, TextDecoration.BOLD));

// Set lore using Components
meta.lore(List.of(
    Component.text("Rarity: Legendary", NamedTextColor.GOLD),
    Component.text("Power: +50", NamedTextColor.RED),
    Component.empty(),
    Component.text("Click to activate", NamedTextColor.GRAY, TextDecoration.ITALIC)
));

item.setItemMeta(meta);
```

### 7. Component Serialization

```java
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import net.kyori.adventure.text.serializer.gson.GsonComponentSerializer;

// Legacy color codes → Component
LegacyComponentSerializer legacySerializer = LegacyComponentSerializer.legacyAmpersand();
Component component = legacySerializer.deserialize("&cError: &fSomething went wrong");

// Component → Plain text (for console/logs)
String plain = PlainTextComponentSerializer.plainText().serialize(component);

// Component → JSON (for storage)
String json = GsonComponentSerializer.gson().serialize(component);

// Component → Legacy string
String legacy = LegacyComponentSerializer.legacySection().serialize(component);
```

### 8. Player List Header/Footer

```java
player.sendPlayerListHeaderAndFooter(
    Component.text("Welcome to MyServer", NamedTextColor.GOLD),
    Component.text("discord.gg/myserver", NamedTextColor.GRAY)
);
```

### 9. Resource Pack Prompt

```java
player.sendResourcePacks(
    ResourcePackInfo.resourcePackInfo(
        UUID.randomUUID(),
        URI.create("https://myserver.com/pack.zip"),
        "sha1hashhere"
    ),
    Component.text("Accept the resource pack?", NamedTextColor.GOLD),
    true // Required
);
```

### 10. Message Utility Wrapper

```java
public final class Messages {

    private static final MiniMessage MM = MiniMessage.miniMessage();

    public static Component info(String text) {
        return MM.deserialize("<gray>" + text + "</gray>");
    }

    public static Component success(String text) {
        return MM.deserialize("<green>" + text + "</green>");
    }

    public static Component error(String text) {
        return MM.deserialize("<red>" + text + "</red>");
    }

    public static Component warning(String text) {
        return MM.deserialize("<gold>" + text + "</gold>");
    }

    public static Component highlight(String text) {
        return MM.deserialize("<yellow>" + text + "</yellow>");
    }

    // Usage
    public void sendBalance(Player player, int balance) {
        player.sendMessage(info("Your current balance: ")
            .append(highlight(String.valueOf(balance) + " tokens")));
    }
}
```

## MiniMessage Format Reference

| Tag | Example | Result |
|-----|---------|--------|
| `<color>` | `<red>text</red>` | Colored text |
| `<b>`, `<bold>` | `<b>bold</b>` | Bold text |
| `<i>`, `<italic>` | `<i>italic</i>` | Italic text |
| `<u>`, `<underlined>` | `<u>underlined</u>` | Underlined |
| `<st>` | `<st>strikethrough</st>` | Strikethrough |
| `<obf>` | `<obf>obfuscated</obf>` | Obfuscated |
| `<click:run_command:/spawn>` | Clicks run command | Click event |
| `<click:suggest_command:/msg >` | Suggests command | Click event |
| `<click:open_url:https://...>` | Opens URL | Click event |
| `<hover:show_text:'Tooltip'>` | Shows tooltip | Hover event |
| `<gradient:color1:color2>` | Gradient text | Gradient |
| `<rainbow>` | Rainbow text | Rainbow effect |
| `<newline>` | Line break | New line |

### 11. MiniMessage Template Caching (Critical Performance)

Parsing MiniMessage strings is ~3µs per call. In hot paths (scoreboards, action bars), cache the parsed Component:

```java
public class MessageCache {
    private static final MiniMessage MM = MiniMessage.miniMessage();
    private final Map<String, Component> cache = new ConcurrentHashMap<>();
    private final JavaPlugin plugin;

    public MessageCache(JavaPlugin plugin) { this.plugin = plugin; }

    /** Parse once, reuse forever. Thread-safe. */
    public Component get(String miniMessageTemplate) {
        return cache.computeIfAbsent(miniMessageTemplate, MM::deserialize);
    }

    /** Load all messages from messages.yml at startup */
    public void loadAll(FileConfiguration messagesConfig) {
        for (String key : messagesConfig.getKeys(true)) {
            String value = messagesConfig.getString(key);
            if (value != null && value.contains("<")) {
                cache.put(key, MM.deserialize(value));
            }
        }
        plugin.getLogger().info("Cached " + cache.size() + " message templates.");
    }
}

// Usage — zero parsing overhead at runtime:
private final MessageCache messages;

@Override
public void onEnable() {
    messages = new MessageCache(this);
    messages.loadAll(getConfig());
}
player.sendMessage(messages.get("errors.no-permission"));
```

### 12. Adventure Migration: ChatColor → Components

**Phase 1: Compatibility layer** (wrap legacy code, don't rewrite everything at once):
```java
public final class LegacyCompat {
    private static final LegacyComponentSerializer LEGACY = LegacyComponentSerializer.legacySection();

    public static Component fromLegacy(String legacyText) {
        return LEGACY.deserialize(ChatColor.translateAlternateColorCodes('&', legacyText));
    }
}
// Old code: player.sendMessage(LegacyCompat.fromLegacy("&cError"));

// New code: player.sendMessage(Component.text("Error", NamedTextColor.RED));
```

**Phase 2: Move to MiniMessage** (user-facing messages become readable markup):
```yaml
# messages.yml
errors:
  no-permission: "<red>✗</red> <gray>No permission.</gray>"
  player-not-found: "<red>Player not found: <white>{player}</white></red>"
```

**Phase 3: Remove legacy** — delete all ChatColor imports and LegacyCompat usage.

### 13. Audience API (Multi-Player Messaging)

```java
import net.kyori.adventure.audience.Audience;

// Send to specific players
Audience.audience(player1, player2, player3)
    .sendMessage(Component.text("Party invite!", NamedTextColor.GREEN));

// Send to all with permission
Audience audience = Audience.audience(
    Bukkit.getOnlinePlayers().stream()
        .filter(p -> p.hasPermission("myplugin.admin"))
        .collect(Collectors.toList())
);
audience.sendMessage(Component.text("[Admin Alert] Server restart in 30s!", NamedTextColor.RED));

// Console + all players
Audience.audience(Bukkit.getConsoleSender(), Audience.audience(Bukkit.getOnlinePlayers()))
    .sendMessage(Component.text("Broadcast!", NamedTextColor.GOLD));
```

## Critical Rules

1. **NEVER use `ChatColor` or `player.sendMessage(String)`** on Paper — deprecated
2. **Use MiniMessage for complex formatting** — cleaner than chained Component builders
3. **Components are thread-safe** — can be created on any thread
4. **`Bukkit.broadcast(Component)` replaces `Bukkit.broadcastMessage(String)`**
5. **Legacy `player.sendTitle()` is deprecated** — use `player.showTitle(Title.title(...))`
6. **Adventure is BUNDLED with Paper** — no dependency needed, `provided` scope
7. **CACHE parsed MiniMessage Components** — parsing is expensive, Components are immutable and reusable
8. **Use LegacyComponentSerializer for gradual migration** from ChatColor
9. **Never mix Adventure Components and ChatColor** in the same plugin — pick one
10. **Components can contain click/hover events** — but don't rely on them for critical functionality

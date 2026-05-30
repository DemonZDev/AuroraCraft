---
name: config-management
description: Load, validate, and hot-reload YAML configuration with type-safe wrappers
license: MIT
compatibility: opencode
metadata:
  category: configuration
  difficulty: beginner
---

# Configuration Management Skill

## What I Do

Set up type-safe config wrappers with validation, default values, and hot-reload support.

## Implementation Pattern

### 1. ConfigManager — Typed Configuration Wrapper

```java
public class ConfigManager {

    private final MyPlugin plugin;
    private FileConfiguration config;

    public ConfigManager(MyPlugin plugin) {
        this.plugin = plugin;
        plugin.saveDefaultConfig();
        this.config = plugin.getConfig();
        validate();
    }

    // Typed accessors — NEVER return raw Object
    public String getPrefix() {
        return ChatColor.translateAlternateColorCodes('&',
            config.getString("prefix", "&8[&bMyPlugin&8]&r "));
    }

    public int getMaxHomes() {
        int val = config.getInt("homes.max-per-player", 3);
        return Math.max(1, Math.min(val, 50)); // Clamp
    }

    public boolean isDebugMode() {
        return config.getBoolean("debug", false);
    }

    public int getStartingTokens() {
        return config.getInt("economy.starting-tokens", 100);
    }

    public String getDatabaseHost() {
        return config.getString("database.host", "localhost");
    }

    public int getDatabasePort() {
        int port = config.getInt("database.port", 3306);
        return port > 0 && port < 65536 ? port : 3306;
    }

    public String getDatabaseName() {
        return config.getString("database.name", "myplugin");
    }

    public String getDatabaseUser() {
        return config.getString("database.user", "root");
    }

    public String getDatabasePassword() {
        return config.getString("database.password", "");
    }

    // Hot reload — re-read file, don't lose in-memory data
    public void reload() {
        plugin.reloadConfig();
        this.config = plugin.getConfig();
        validate();
        plugin.getLogger().info("Configuration reloaded.");
    }

    // Validate critical values on load
    private void validate() {
        int maxHomes = config.getInt("homes.max-per-player", 3);
        if (maxHomes < 1) {
            plugin.getLogger().warning("homes.max-per-player must be >= 1. Using default: 3");
        }
        int tokens = config.getInt("economy.starting-tokens", 100);
        if (tokens < 0) {
            plugin.getLogger().warning("economy.starting-tokens cannot be negative. Using default: 100");
        }
    }

    // Prevent accidental mutations — never expose raw config
    // WRONG: getRawConfig() { return config; }
}
```

### 2. Separate Messages Config

```java
public class MessageManager {

    private final MyPlugin plugin;
    private FileConfiguration messages;
    private File messagesFile;

    public MessageManager(MyPlugin plugin) {
        this.plugin = plugin;
        this.messagesFile = new File(plugin.getDataFolder(), "messages.yml");
        if (!messagesFile.exists()) {
            plugin.saveResource("messages.yml", false);
        }
        this.messages = YamlConfiguration.loadConfiguration(messagesFile);
    }

    public String get(String key) {
        String raw = messages.getString(key, "&cMissing message: " + key);
        return ChatColor.translateAlternateColorCodes('&', raw);
    }

    public String get(String key, Map<String, String> placeholders) {
        String message = get(key);
        for (var entry : placeholders.entrySet()) {
            message = message.replace("{" + entry.getKey() + "}", entry.getValue());
        }
        return message;
    }

    public void send(CommandSender target, String key) {
        if (target instanceof Player player) {
            player.sendMessage(Component.text(
                ChatColor.stripColor(get(key)) // Strip for Component if needed
            ));
        } else {
            target.sendMessage(ChatColor.stripColor(get(key)));
        }
    }

    public void send(CommandSender target, String key, Map<String, String> placeholders) {
        send(target, key); // TODO: integrate placeholders with Component
    }

    public void reload() {
        this.messages = YamlConfiguration.loadConfiguration(messagesFile);
        plugin.getLogger().info("Messages reloaded.");
    }
}
```

### 3. Default config.yml (Heavily Commented)

```yaml
# ============================================================
# MyPlugin Configuration
# Documentation: https://github.com/yourname/myplugin
# ============================================================

# Debug mode — enables verbose logging
# Set to false in production
debug: false

# Global message prefix (supports & color codes)
prefix: "&8[&bMyPlugin&8] "

# Home settings
homes:
  # Maximum homes per player (1-50)
  max-per-player: 3

# Economy settings
economy:
  # Starting tokens for new players
  starting-tokens: 100

# Database settings
database:
  host: localhost
  port: 3306
  name: myplugin
  user: root
  password: ""
```

### 4. YAML Syntax Rules for plugin.yml and config.yml

```yaml
# CORRECT:
name: MyPlugin          # Space after colon
version: "1.0"           # String for version
api-version: "1.21"      # Quoted to preserve format
main: com.example.myplugin.MyPlugin

commands:
  home:                  # 2-space indentation (NEVER tabs)
    description: Teleport to your home
    usage: /home [name]
    permission: myplugin.home

# WRONG:
# name:MyPlugin          ← Missing space after colon
# version: 1.0           ← Unquoted number (may be parsed as float)
# api-version: 1.21      ← Unquoted version
# commands:
# 	home:                ← TAB character — YAML forbids tabs
```

## Critical Rules

1. **NEVER call `config.get()` directly in commands/managers** — use ConfigManager wrapper
2. **ALWAYS provide default values** — `config.getString("key", "default")`
3. **Validate on load** — warn about invalid values, use defaults
4. **NEVER mutate config at runtime** — reload reads from file, doesn't preserve changes
5. **Use YAML 1.1 syntax** — spaces for indentation, never tabs
6. **Comment heavily** — the config IS documentation for server admins
7. **Separate messages from settings** — messages.yml for user-facing text

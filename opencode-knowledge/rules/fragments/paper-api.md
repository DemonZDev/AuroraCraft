# Paper API Rules

## API Packages
- Primary: `io.papermc.paper.*`
- Legacy: `com.destroystokyo.paper.*` (pre-1.17, avoid in new code)
- Bukkit: `org.bukkit.*` (always available)
- Spigot: `org.spigotmc.*` (always available)

## Modern Features (Paper 1.21.4)

### Adventure API (Text Components)
**ALWAYS use Adventure Components, NEVER use legacy ChatColor:**

```java
// WRONG: Legacy ChatColor
player.sendMessage(ChatColor.RED + "Error!");

// CORRECT: Adventure Component
player.sendMessage(Component.text("Error!", NamedTextColor.RED));

// CORRECT: MiniMessage (recommended)
MiniMessage mm = MiniMessage.miniMessage();
player.sendMessage(mm.deserialize("<red>Error!</red>"));
```

### Data Components (Item API)
**Use Data Components, NOT NBT:**

```java
// WRONG: NBT (deprecated)
ItemMeta meta = item.getItemMeta();
meta.getPersistentDataContainer().set(key, PersistentDataType.STRING, value);

// CORRECT: Data Components
ItemStack item = ItemStack.of(Material.DIAMOND_SWORD);
item.setData(DataComponentTypes.CUSTOM_NAME, Component.text("Legendary Sword"));
```

### Async Chunk Loading
**Use Paper's async chunk API:**

```java
// CORRECT: Async chunk loading
world.getChunkAtAsync(location).thenAccept(chunk -> {
    // Process chunk on main thread
    Bukkit.getScheduler().runTask(plugin, () -> {
        // Use chunk
    });
});
```

## Critical Rules

1. **Repository:** `https://repo.papermc.io/repository/maven-public/`
2. **GroupId:** `io.papermc.paper`
3. **ArtifactId:** `paper-api`
4. **Scope:** `provided` (Maven) or `compileOnly` (Gradle)
5. **API Version in plugin.yml:** `api-version: "1.21"`

## Deprecated APIs to Avoid

- `ChatColor` → Use `NamedTextColor` or MiniMessage
- `player.sendMessage(String)` → Use `player.sendMessage(Component)`
- `ItemMeta.setDisplayName(String)` → Use `ItemMeta.displayName(Component)`
- `player.getItemInHand()` → Use `player.getInventory().getItemInMainHand()`
- `Bukkit.getPlayer(String)` → Use `Bukkit.getPlayerExact(String)` or `Bukkit.getPlayer(UUID)`

## Paper-Specific Events

Paper adds 100+ events not in Bukkit/Spigot:
- `AsyncChatEvent` (replaces `AsyncPlayerChatEvent`)
- `PlayerConnectionCloseEvent`
- `EntityMoveEvent`
- `PrePlayerAttackEntityEvent`
- Many more in `io.papermc.paper.event.*`

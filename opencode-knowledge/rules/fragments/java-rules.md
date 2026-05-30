# Java Plugin Development Rules
## Language: Java 21 | Paper 1.21.4

> These rules apply to ALL Java plugin code regardless of server software type.

## Java Version Compatibility

| Feature | Since | Use on Paper 1.21.4? |
|---------|-------|----------------------|
| **Records** | Java 16 | ✅ Use for data models (PlayerData, Warp, etc.) |
| **Pattern Matching instanceof** | Java 16 | ✅ Use for safe type casting |
| **Sealed Classes** | Java 17 | ✅ Use for closed class hierarchies |
| **Text Blocks (`""" `)** | Java 15 | ✅ Use for SQL strings, multi-line messages |
| **Switch Expressions** | Java 14 | ✅ Use for cleaner command routing |
| **Var (local type inference)** | Java 10 | ⚠️ Use sparingly — explicit types preferred for readability |
| **Stream API** | Java 8 | ✅ Use for collection processing |
| **Optional** | Java 8 | ✅ Use for nullable return values |
| **Try-with-resources** | Java 7 | ✅ MANDATORY for all AutoCloseable |
| **Diamond operator `<>`** | Java 7 | ✅ Always use |
| **Generics** | Java 5 | ✅ Always use — never use raw types |

## Best Practices for Plugin Development

### 1. Use Records for Data Models
```java
// PREFERRED — record is immutable, has equals/hashCode/toString generated
public record PlayerData(
    UUID uuid,
    String name,
    int tokens,
    long lastSeen
) {
    // Compact constructor for validation
    public PlayerData {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("name required");
        if (tokens < 0) tokens = 0;
    }
}

// TRADITIONAL — more boilerplate, use only if mutable is needed
@Getter @Setter
public class PlayerData {
    private final UUID uuid;
    private String name;
    private int tokens;
}
```

### 2. Pattern Matching instanceof (Java 16+)
```java
// BEFORE Java 16 — verbose, error-prone
if (event.getEntity() instanceof Player) {
    Player player = (Player) event.getEntity();
    player.sendMessage("Hello!");
}

// AFTER Java 16+ — clean, safe
if (event.getEntity() instanceof Player player) {
    player.sendMessage("Hello!");
}

// Multiple conditions
if (event.getDamager() instanceof Player player) {
    handlePvP(player, victim);
} else if (event.getDamager() instanceof Projectile proj 
           && proj.getShooter() instanceof Player shooter) {
    handlePvP(shooter, victim);
}
```

### 3. Text Blocks for SQL and Multi-Line Strings
```java
// PREFERRED — readable SQL
private static final String CREATE_TABLE = """
    CREATE TABLE IF NOT EXISTS player_data (
        uuid        CHAR(36)    PRIMARY KEY,
        username    VARCHAR(16) NOT NULL,
        tokens      INT         DEFAULT 0,
        last_seen   BIGINT      NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """;

// Multi-line messages
private static final String HELP_MESSAGE = """
    &b=== &fMyPlugin Commands &b===
    &e/home &7- Teleport to your home
    &e/home set &7- Set your home location
    &e/home delete &7- Delete a home
    """;
```

### 4. Switch Expressions for Command Routing
```java
@Override
public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (args.length == 0) {
        sendHelp(sender);
        return true;
    }
    
    return switch (args[0].toLowerCase()) {
        case "reload" -> handleReload(sender);
        case "info", "status" -> handleInfo(sender);
        case "help", "?" -> handleHelp(sender);
        default -> {
            sender.sendMessage(Component.text("Unknown subcommand. Use /help"));
            yield true;
        }
    };
}
```

### 5. Stream API for Collections
```java
// Filter, map, collect
List<String> onlineNames = Bukkit.getOnlinePlayers().stream()
    .filter(p -> p.hasPermission("myplugin.vip"))
    .map(Player::getName)
    .sorted()
    .collect(Collectors.toList());

// Find first match
Optional<Player> admin = Bukkit.getOnlinePlayers().stream()
    .filter(p -> p.hasPermission("myplugin.admin"))
    .findFirst();

// Group by
Map<String, List<Player>> byWorld = Bukkit.getOnlinePlayers().stream()
    .collect(Collectors.groupingBy(p -> p.getWorld().getName()));
```

### 6. Optional for Nullable Returns
```java
// Public API methods should use Optional
public Optional<PlayerData> getData(UUID playerId) {
    return Optional.ofNullable(cache.get(playerId));
}

// Internal methods can use @Nullable with null check
@Nullable
public PlayerData findData(UUID playerId) {
    return cache.get(playerId);
}

// NEVER return null from Optional-returning methods
// public Optional<PlayerData> getData(UUID id) {
//     return null; // WRONG — defeats the purpose
// }
```

### 7. Collections Best Practices
```java
// Always use interface types, not implementation types
private final Map<UUID, PlayerData> cache = new HashMap<>();   // ✅
// private final HashMap<UUID, PlayerData> cache = new HashMap<>(); // ❌

// Pre-size when known
List<String> names = new ArrayList<>(Bukkit.getOnlinePlayers().size());

// Use Collections utility methods
List<String> immutable = List.of("a", "b", "c");  // Java 9+
Set<UUID> empty = Set.of();
Map<String, Integer> defaults = Map.of("max", 10, "min", 1);

// Avoid mutable static collections
// private static final List<Player> connected = new ArrayList<>(); // Memory leak risk
```

### 8. Date/Time (Use java.time, NOT java.util.Date)
```java
import java.time.Instant;
import java.time.Duration;
import java.time.ZonedDateTime;

long epochMillis = System.currentTimeMillis(); // Still useful for DB storage
Instant now = Instant.now();                   // Modern API
Duration elapsed = Duration.between(start, now);

// Formatting for display
ZonedDateTime zdt = ZonedDateTime.now();
DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
String formatted = zdt.format(fmt);
```

### 9. Thread Safety with CompletableFuture
```java
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Dedicated thread pool for DB operations
private final ExecutorService dbExecutor = Executors.newFixedThreadPool(4);

public CompletableFuture<PlayerData> loadData(UUID playerId) {
    return CompletableFuture
        .supplyAsync(() -> {
            // This runs on dbExecutor, not main thread
            try (Connection conn = dataSource.getConnection()) {
                // Database operations
                return queryPlayer(conn, playerId);
            }
        }, dbExecutor)
        .exceptionally(throwable -> {
            getLogger().log(Level.SEVERE, "Failed to load data for " + playerId, throwable);
            return PlayerData.defaultData(playerId);
        });
}
```

### 10. Enums Instead of Magic Constants
```java
// CORRECT — type-safe enum
public enum ArenaState {
    WAITING, STARTING, IN_PROGRESS, ENDING, RESETTING
}

// WRONG — magic strings/ints
// private static final int STATE_WAITING = 0;
// private static final int STATE_IN_PROGRESS = 1;
```

## File Encoding
Always use UTF-8 for all source files and resource files:
```xml
<!-- pom.xml -->
<properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
</properties>
```

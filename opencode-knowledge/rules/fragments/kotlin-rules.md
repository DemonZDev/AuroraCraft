# Kotlin Plugin Development Rules
## Language: Kotlin | Paper 1.21.4

> Kotlin is fully supported for Minecraft plugin development. Use Kotlin 2.0+ with Paper API.

## Dependency Configuration

### Maven with Kotlin
```xml
<properties>
    <kotlin.version>2.0.0</kotlin.version>
</properties>

<dependencies>
    <dependency>
        <groupId>io.papermc.paper</groupId>
        <artifactId>paper-api</artifactId>
        <version>1.21.4-R0.1-SNAPSHOT</version>
        <scope>provided</scope>
    </dependency>
    <dependency>
        <groupId>org.jetbrains.kotlin</groupId>
        <artifactId>kotlin-stdlib</artifactId>
        <version>${kotlin.version}</version>
        <scope>compile</scope> <!-- MUST shade -->
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.jetbrains.kotlin</groupId>
            <artifactId>kotlin-maven-plugin</artifactId>
            <version>${kotlin.version}</version>
            <executions>
                <execution>
                    <id>compile</id>
                    <goals><goal>compile</goal></goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

> **CRITICAL**: Kotlin stdlib MUST be shaded. The server does NOT provide kotlin-stdlib.

## Kotlin-Specific Patterns for Plugins

### 1. Plugin Main Class
```kotlin
package com.example.myplugin

import org.bukkit.plugin.java.JavaPlugin

class MyPlugin : JavaPlugin() {

    companion object {
        lateinit var instance: MyPlugin
            private set
    }

    lateinit var configManager: ConfigManager
    lateinit var databaseManager: DatabaseManager

    override fun onEnable() {
        instance = this
        configManager = ConfigManager(this)
        databaseManager = DatabaseManager(this)
        registerCommands()
        registerListeners()
        logger.info("Plugin enabled!")
    }

    override fun onDisable() {
        databaseManager.shutdown()
        logger.info("Plugin disabled.")
    }
}
```

### 2. Null Safety — Use Kotlin's Type System
```kotlin
// Kotlin's null safety replaces Java's @Nullable checking
fun getPlayerData(uuid: UUID): PlayerData? { // ? means nullable
    return cache[uuid]
}

// Safe calls with ?.
val data: PlayerData? = plugin.playerDataManager.getData(uuid)
data?.let {
    player.sendMessage(Component.text("Balance: ${it.tokens}"))
}

// Elvis operator for defaults
val name: String = playerData?.name ?: "Unknown"

// Force non-null when you're certain
val player: Player = event.player // Bukkit guarantees non-null in PlayerJoinEvent
```

### 3. Event Handlers
```kotlin
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.event.player.PlayerJoinEvent

class PlayerListener(private val plugin: MyPlugin) : Listener {

    @EventHandler
    fun onJoin(event: PlayerJoinEvent) {
        val player = event.player
        // Async load
        Bukkit.getScheduler().runTaskAsynchronously(plugin, Runnable {
            val data = plugin.playerDataManager.loadData(player.uniqueId)
            Bukkit.getScheduler().runTask(plugin, Runnable {
                if (player.isOnline) {
                    player.sendMessage(Component.text("Welcome back, ${data.name}!"))
                }
            })
        })
    }
}
```

### 4. Data Classes Instead of Records
```kotlin
// Kotlin data class — auto-generates equals/hashCode/toString/copy
data class PlayerData(
    val uuid: UUID,
    val name: String,
    val tokens: Int = 0,
    val kills: Int = 0,
    val lastSeen: Long = System.currentTimeMillis()
)

// Immutable update
val updated = data.copy(tokens = data.tokens + 100)
```

### 5. Extension Functions for Bukkit API
```kotlin
// Add convenience methods to Bukkit classes
fun Player.sendColoredMessage(message: String, color: NamedTextColor = NamedTextColor.WHITE) {
    sendMessage(Component.text(message, color))
}

fun Player.hasPermissionOrOp(permission: String): Boolean {
    return isOp || hasPermission(permission)
}

fun Location.toBlockCoordinates(): Triple<Int, Int, Int> {
    return Triple(blockX, blockY, blockZ)
}

// Usage
player.sendColoredMessage("Teleported!", NamedTextColor.GREEN)
if (player.hasPermissionOrOp("myplugin.admin")) { ... }
val (bx, by, bz) = location.toBlockCoordinates()
```

### 6. Object Declarations for Managers
```kotlin
// Kotlin object = Singleton — use for stateless services
object MessageFormatter {
    fun formatBalance(tokens: Int): String = "&e$tokens tokens"

    fun formatTime(millis: Long): String {
        val seconds = millis / 1000
        val minutes = seconds / 60
        val hours = minutes / 60
        return when {
            hours > 0 -> "${hours}h ${minutes % 60}m"
            minutes > 0 -> "${minutes}m ${seconds % 60}s"
            else -> "${seconds}s"
        }
    }
}

// For stateful managers, use regular class (NOT object)
class PlayerDataManager(private val plugin: MyPlugin) {
    // object would retain state across reloads — bad
    private val cache = HashMap<UUID, PlayerData>()
}
```

### 7. Lambda Syntax for Event Registration
```kotlin
// Kotlin lambda for simple event handlers
override fun onEnable() {
    server.pluginManager.registerEvents(object : Listener {
        @EventHandler
        fun onJoin(event: PlayerJoinEvent) {
            event.player.sendMessage(Component.text("Welcome!"))
        }
    }, this)
}
```

### 8. With/Apply/Also Scope Functions
```kotlin
// with — operate on a receiver, return result
val result = with(player.inventory) {
    clear()
    addItem(ItemStack(Material.DIAMOND))
    setItem(4, ItemStack(Material.STICK))
    isEmpty // return value
}

// apply — configure an object, return the object
val item = ItemStack(Material.DIAMOND).apply {
    itemMeta = itemMeta?.apply {
        setDisplayName("Magic Diamond")
        lore = listOf("A very shiny diamond")
    }
}

// run — execute block, return result
val message = run {
    val prefix = configManager.prefix
    val name = player.name
    "$prefix Welcome, $name!"
}
```

### 9. Sealed Classes for State Machines
```kotlin
sealed class ArenaState {
    object Waiting : ArenaState()
    object Starting : ArenaState()
    data class InProgress(val startTime: Long) : ArenaState()
    object Ending : ArenaState()

    val isActive: Boolean get() = this is InProgress || this is Starting
}

// Pattern matching in when expression
fun handleState(state: ArenaState) = when (state) {
    is ArenaState.Waiting -> "Waiting for players"
    is ArenaState.Starting -> "Starting in ${countdown}s"
    is ArenaState.InProgress -> "Game in progress"
    is ArenaState.Ending -> "Game ending"
}
```

### 10. Coroutines (Advanced — Kotlin 1.3+)
```kotlin
import kotlinx.coroutines.*

class AsyncDataManager(private val plugin: MyPlugin) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    suspend fun loadPlayerData(uuid: UUID): PlayerData = withContext(Dispatchers.IO) {
        // Database call on IO dispatcher
        database.load(uuid)
    }

    fun loadAndApply(player: Player) {
        scope.launch {
            val data = loadPlayerData(player.uniqueId)
            withContext(Dispatchers.Main) {
                if (player.isOnline) {
                    applyToPlayer(player, data)
                }
            }
        }
    }

    fun shutdown() {
        scope.cancel()
    }
}
```

### 11. plugin.yml for Kotlin Plugins
```yaml
name: MyPlugin
version: ${project.version}
main: com.example.myplugin.MyPlugin
api-version: '1.21'
```

## Common Kotlin Mistakes

1. **Not shading kotlin-stdlib** — Server doesn't have it, NoClassDefFoundError at runtime
2. **Using `object` for stateful managers** — Objects survive reloads, causing stale state
3. **Applying extension functions to nullable types incorrectly** — Use `?.` before extensions
4. **Assuming suspending functions work in Bukkit event handlers** — Coroutines need a scope
5. **`lateinit` field not initialized before use** — UninitializedPropertyAccessException
6. **Using `companion object` for plugin state** — Same as static in Java, survives reloads

## Java Interop

When using Java libraries from Kotlin:
```kotlin
// Java Optional → Kotlin nullable
val data: PlayerData? = javaOptional.orElse(null)

// Java Collection → Kotlin
val players: List<Player> = javaList.toList()

// Static methods
val player = Bukkit.getPlayer(uuid) // No .class needed

// SAM conversion
Runnable { doSomething() } // Auto-converts to Runnable
```

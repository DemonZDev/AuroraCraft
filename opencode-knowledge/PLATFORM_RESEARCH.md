# Minecraft Server Platform Research Summary
## For OpenCode Rules & Skills Generation

This document summarizes the key characteristics of all 18 supported Minecraft server platforms to inform dynamic Rules & Skills generation.

---

## Game Servers (Plugin-Compatible)

### Paper
- **Base:** Spigot fork
- **API:** `io.papermc.paper.*`, `com.destroystokyo.paper.*`, `org.bukkit.*`
- **Key Features:**
  - Adventure API (modern text components, MiniMessage)
  - Async chunk loading
  - Registry access API
  - Data components API (replaces NBT)
  - Extensive performance optimizations
  - Per-world configuration
  - Brigadier command system
- **API Version:** `api-version: "1.21"` in plugin.yml
- **Critical Rules:**
  - Use Adventure Components, not legacy ChatColor
  - All Paper dependencies must be `<scope>provided</scope>`
  - Repository: `https://repo.papermc.io/repository/maven-public/`
  - GroupId: `io.papermc.paper`, ArtifactId: `paper-api`

### Purpur
- **Base:** Paper fork
- **API:** Inherits all Paper APIs + `org.purpurmc.purpur.*`
- **Key Features:**
  - 400+ additional config options in `purpur.yml`
  - Rideable mobs, custom mob behaviors
  - Anvil enchantment level bypass
  - Gameplay tweaks (enderman block pickup, dolphin treasure searching)
  - All Paper features included
- **Critical Rules:**
  - Same API as Paper
  - Additional config file: `purpur.yml`
  - All Paper rules apply

### Pufferfish
- **Base:** Paper fork
- **API:** Inherits Paper API
- **Key Features:**
  - DAB (Dynamic Activation of Brain) - reduces entity AI tick frequency
  - SIMD-optimized map rendering (8x faster)
  - 30% faster hoppers
  - Async entity processing (partial)
  - Sentry.io integration
  - Built-in Flare profiler
  - Config: `pufferfish.yml`
- **Critical Rules:**
  - DAB affects: villagers, zombified piglins, axolotls, hoglins, goats
  - `dab.activation-dist-mod: 8` (default, tune for performance)
  - All Paper rules apply

### Folia
- **Base:** Paper fork with regionized multithreading
- **API:** Paper API + `io.papermc.paper.threadedregions.*`
- **Key Features:**
  - **NO MAIN THREAD** - regions tick in parallel
  - RegionScheduler, EntityScheduler, GlobalRegionScheduler, AsyncScheduler
  - BukkitScheduler is DEPRECATED and broken
  - Async-only teleportation (`Entity#teleportAsync`)
  - Thread ownership checks (`Bukkit.isOwnedByCurrentRegion`)
- **Critical Rules:**
  - **MUST** add `folia-supported: true` to plugin.yml
  - **NEVER** use BukkitScheduler
  - **ALWAYS** use appropriate scheduler:
    - Location-based tasks → RegionScheduler
    - Entity-based tasks → EntityScheduler
    - Server-wide tasks → GlobalRegionScheduler
    - Async I/O → AsyncScheduler
  - **NEVER** access entities/chunks from wrong region thread
  - Synchronous teleport is REMOVED - use `teleportAsync()`
  - Scoreboard API is BROKEN
  - Most plugins require significant rewrites

### Spigot
- **Base:** CraftBukkit fork
- **API:** `org.spigotmc.*`, `org.bukkit.*`
- **Key Features:**
  - Basic performance optimizations
  - Mature, stable API
  - Largest plugin ecosystem
- **Critical Rules:**
  - No Adventure API (use legacy ChatColor)
  - No async chunk loading
  - No modern Paper features
  - Repository: `https://hub.spigotmc.org/nexus/content/repositories/snapshots/`
  - GroupId: `org.spigotmc`, ArtifactId: `spigot-api`

### Leaf
- **Base:** Paper fork
- **Focus:** Balance between performance, vanilla behavior, stability
- **API:** Paper API
- **Key Features:**
  - Modern dependencies (kept up-to-date)
  - Customizable features
  - Stable for large player counts
- **Critical Rules:**
  - Same as Paper

### Leaves
- **Base:** Paper fork
- **Focus:** Repairing broken vanilla properties
- **API:** Paper API + `org.leavesmc.leaves.*`
- **Key Features:**
  - Fixes vanilla redstone mechanics
  - Fixes vanilla piston behavior
  - Fixes vanilla mob AI issues
  - Preserves vanilla gameplay
- **Critical Rules:**
  - Same as Paper
  - Emphasize vanilla-correct behavior

### DivineMC
- **Base:** Purpur fork
- **API:** Purpur API
- **Key Features:**
  - Regionized chunk ticking (Folia-like)
  - Parallel world ticking
  - Async pathfinding, entity tracker, mob spawning
  - 1024-bit secure seed (vs 64-bit vanilla)
  - Linear region file format
  - Mod protocol support (Syncmatica, Apple Skin, Jade, Xaero's Map)
  - Sentry integration
- **Critical Rules:**
  - Same as Purpur
  - Additional async operations available
  - Enhanced security features

### Pluto
- **Base:** Pufferfish fork
- **API:** Pufferfish API
- **Key Features:**
  - Memory optimizations
  - Hopper optimizations
  - Farm optimizations
  - All Pufferfish features
- **Critical Rules:**
  - Same as Pufferfish

### ASPaper
- **Base:** Paper fork
- **API:** Paper API
- **Key Features:**
  - Built-in Slime World Manager
  - World instancing support
- **Critical Rules:**
  - Same as Paper
  - Slime World Manager integration

---

## Hybrid Servers (Mods + Plugins)

### Mohist
- **Base:** Forge + Bukkit/Spigot/Paper
- **API:** Forge + Bukkit/Spigot/Paper APIs
- **Key Features:**
  - Run Forge mods + Bukkit plugins simultaneously
  - Formerly Thermos
  - Mixin-based remapping
- **Critical Rules:**
  - Dependency conflicts common (mods vs plugins)
  - Some plugins may not work due to Forge modifications
  - Some mods may not work due to Bukkit patches
  - Test thoroughly before production
  - Use Forge mod loader conventions

### Arclight
- **Base:** Bukkit on Forge/NeoForge/Fabric via Mixin
- **API:** Bukkit + Forge/NeoForge/Fabric
- **Key Features:**
  - Mixin-based remapping
  - Multi-loader support (Forge, NeoForge, Fabric)
  - Bukkit API implementation on modded servers
- **Critical Rules:**
  - Compatibility varies by mod/plugin combination
  - Mixin conflicts possible
  - Test extensively

### Magma
- **Base:** NeoForge + Spigot
- **API:** NeoForge + Spigot APIs
- **Key Features:**
  - Next-gen hybrid server
  - NeoForge mod support
  - Spigot plugin support
- **Critical Rules:**
  - Use NeoForge conventions for mods
  - Use Spigot conventions for plugins
  - Dependency management critical

### Youer
- **Base:** NeoForge + Paper/Purpur
- **API:** NeoForge + Paper/Purpur APIs
- **Key Features:**
  - NeoForge mod support
  - Paper/Purpur plugin support
  - Arclight-based remapping
  - Most modern hybrid option
- **Critical Rules:**
  - Use NeoForge conventions for mods
  - Use Paper conventions for plugins
  - Full Paper API available
  - Dependency conflicts possible

---

## Proxy Servers (Multi-Server Networks)

### Velocity
- **Base:** Modern proxy (PaperMC team)
- **API:** `com.velocitypowered.api.*`
- **Key Features:**
  - HMAC-signed player forwarding (secure)
  - libdeflate compression (2x faster than zlib on Linux)
  - Native Forge/Fabric support
  - Modern, actively developed
  - Better performance than BungeeCord
  - First-class Paper support
- **Critical Rules:**
  - Use modern forwarding (not IP-based)
  - Shared secret between proxy and backends
  - Backend must enable Velocity forwarding in `paper-global.yml`
  - Different API from BungeeCord (not compatible)
  - Plugin ecosystem smaller but growing (300+ plugins)

### BungeeCord
- **Base:** Original proxy (2012)
- **API:** `net.md_5.bungee.api.*`
- **Key Features:**
  - Mature, stable
  - Largest plugin ecosystem (thousands of plugins)
  - IP-based forwarding (less secure)
- **Critical Rules:**
  - Enable `bungeecord: true` in backend `spigot.yml`
  - IP-based forwarding requires firewall protection
  - Backend servers must be firewalled (only proxy can connect)
  - Slower protocol updates than Velocity

### Waterfall
- **Base:** BungeeCord fork (Paper team, discontinued)
- **API:** BungeeCord API
- **Key Features:**
  - BungeeCord with Paper-style improvements
  - No longer actively maintained
  - Use Velocity instead for new projects
- **Critical Rules:**
  - Same as BungeeCord
  - Migrate to Velocity recommended

### Velocity-CTD
- **Base:** Velocity fork
- **API:** Velocity API
- **Key Features:**
  - Queue system
  - Extra commands
  - Bug fixes
  - All Velocity features
- **Critical Rules:**
  - Same as Velocity

---

## API Hierarchy

```
org.bukkit.*                          ← Bukkit (base, all servers support)
├── org.spigotmc.*                    ← Spigot
│   └── com.destroystokyo.paper.*    ← Paper legacy (pre-1.17)
│       io.papermc.paper.*           ← Paper modern (1.17+)
│       └── org.purpurmc.purpur.*    ← Purpur
│           org.leavesmc.leaves.*    ← Leaves
│           io.papermc.paper.threadedregions.* ← Folia
```

**Key Rule:** Code written against `org.bukkit` runs on ALL servers. Code written against `io.papermc.paper` only runs on Paper and Paper forks.

---

## Build System Considerations

### Maven
- Paper repository: `https://repo.papermc.io/repository/maven-public/`
- Spigot repository: `https://hub.spigotmc.org/nexus/content/repositories/snapshots/`
- All server APIs: `<scope>provided</scope>`
- Shade plugin for dependencies: `maven-shade-plugin`

### Gradle
- Paper repository: `maven { url = "https://repo.papermc.io/repository/maven-public/" }`
- Shadow plugin for dependencies: `com.github.johnrengelman.shadow`
- All server APIs: `compileOnly` (not `implementation`)

---

## Java Version Requirements

| Server | Min Java | Recommended |
|--------|----------|-------------|
| All 1.21.x | Java 21 | Java 21 |
| All 1.20.5+ | Java 21 | Java 21 |
| All 1.17-1.20.4 | Java 17 | Java 17 |
| All 1.16.5 | Java 11 | Java 11 |
| All 1.8-1.16.4 | Java 8 | Java 11 |

---

## Summary for Rules Generation

**When generating rules, consider:**
1. **API availability** - Paper features not available on Spigot
2. **Thread safety** - Folia requires completely different approach
3. **Forwarding** - Velocity uses modern forwarding, BungeeCord uses IP-based
4. **Build system** - Maven vs Gradle dependency syntax
5. **Java version** - Target Java version affects available language features
6. **Hybrid servers** - Mod/plugin conflicts, dependency management critical

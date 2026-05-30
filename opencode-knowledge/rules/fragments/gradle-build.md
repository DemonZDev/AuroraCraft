# Gradle Build Rules

## Repository Configuration

```kotlin
repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}
```

## Dependency Scope

**ALL server APIs MUST use `compileOnly`:**

```kotlin
dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
}
```

**Why:** The server provides these APIs at runtime. Using `implementation`:
- Bloats JAR size (50MB+ instead of 50KB)
- Causes class loading conflicts
- May crash the server

## Shading Dependencies

Use shadow plugin to bundle libraries:

```kotlin
plugins {
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

dependencies {
    implementation("com.zaxxer:HikariCP:5.1.0")
}

tasks.shadowJar {
    relocate("com.zaxxer.hikari", "your.plugin.libs.hikari")
}
```

## Build Command

```bash
./gradlew shadowJar
```

Output: `build/libs/{name}-{version}-all.jar`

## Common Errors

### Missing Repository
```
Could not find io.papermc.paper:paper-api
```
**Fix:** Add PaperMC repository to `repositories {}`

### Wrong Scope
```
JAR is 50MB instead of 50KB
```
**Fix:** Change `implementation` to `compileOnly` for server APIs

### Unshaded Dependencies
```
ClassNotFoundException: com.zaxxer.hikari.HikariDataSource
```
**Fix:** Add shadow plugin and use `implementation` for libraries you need to shade

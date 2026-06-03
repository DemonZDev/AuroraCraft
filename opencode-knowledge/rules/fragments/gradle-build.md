# Gradle Build Rules

## Repository Configuration

```kotlin
repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
    maven("https://jitpack.io")
    maven("https://repo.codemc.io/repository/maven-public/")
}
```

## Plugin Configuration

```kotlin
plugins {
    java
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

group = "com.yourorg"
version = providers.gradleProperty("pluginVersion").getOrElse("1.0.0")
```

## Dependency Scope — The Single Most Important Rule

**ALL server-provided APIs MUST use `compileOnly`:**

```kotlin
dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
}
```

**What happens with `implementation`:**
- JAR size: 50MB+ instead of ~50KB
- Class loading conflicts → ClassCastException at runtime
- Server may refuse to load the plugin

**Scope reference:**

| Library | Gradle Config | Shade? | Relocate? |
|---------|--------------|--------|-----------|
| Paper/Spigot/Bukkit API | `compileOnly` | NO | N/A |
| Adventure API (net.kyori) | `compileOnly` | NO | N/A |
| Gson | `compileOnly`* | Only if >2.8.9 | Only if shaded |
| HikariCP | `implementation` | YES | YES |
| SQLite JDBC | `implementation` | YES | **NO** — JDBC service loader |
| MySQL Connector/J | `implementation` | YES | **NO** — JDBC service loader |
| Caffeine | `implementation` | YES | YES |
| Jedis | `implementation` | YES | YES |
| JUnit 5 | `testImplementation` | NO | N/A |
| Mockito | `testImplementation` | NO | N/A |

*\*Gson: Paper bundles 2.8.9. Use `compileOnly` by default.*

## Java Toolchain — Reproducible Builds

```kotlin
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}
```

**Why toolchain over sourceCompatibility?** Toolchain downloads and uses exactly Java 21 regardless of what JDK is running Gradle. This guarantees reproducible builds across all developer machines and CI.

## Shadow Plugin — Complete Production Configuration

```kotlin
tasks.shadowJar {
    // Remove "-all" suffix — shadow JAR becomes the main output
    archiveClassifier.set("")

    // Strip digital signatures
    exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA", "META-INF/MANIFEST.MF")

    // Merge service files (required for JDBC drivers and ServiceLoader libs)
    mergeServiceFiles()

    // Relocate ALL shaded libraries EXCEPT JDBC drivers
    relocate("com.zaxxer.hikari", "{package}.libs.hikari")
    relocate("com.github.benmanes.caffeine", "{package}.libs.caffeine")
    relocate("redis.clients.jedis", "{package}.libs.jedis")
    relocate("org.apache.commons.pool2", "{package}.libs.pool2")

    // DO NOT relocate JDBC drivers — breaks java.sql.DriverManager string-based lookup
}

// Make 'gradle build' produce the shadow JAR (not the unshaded one)
tasks.build {
    dependsOn(tasks.shadowJar)
}

// Rename the plain JAR to avoid accidentally distributing it
tasks.jar {
    archiveClassifier.set("unshaded")
}
```

## Resource Processing — Inject Version into plugin.yml

```kotlin
tasks.processResources {
    filesMatching("plugin.yml") {
        expand(
            "version" to project.version,
            "name" to project.name,
            "description" to project.description
        )
    }
    // Cache invalidation: re-run when these values change
    inputs.property("version", project.version)
    inputs.property("name", project.name)
}
```

In plugin.yml:
```yaml
name: ${name}
version: ${version}
description: ${description}
```

## Compiler & Test Configuration

```kotlin
tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.addAll(listOf(
        "-Xlint:deprecation",    // Warn on deprecated API usage
        "-Xlint:unchecked"       // Warn on unchecked casts
    ))
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}
```

## Gradle Properties (gradle.properties)

```properties
# Plugin version — single source of truth
pluginVersion=1.0.0

# Gradle performance (all highly recommended)
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configuration-cache=true
org.gradle.jvmargs=-Xmx2g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8
```

## Version Catalog (gradle/libs.versions.toml) — Recommended for >5 Dependencies

```toml
[versions]
paper = "1.21.4-R0.1-SNAPSHOT"
hikari = "5.1.0"
sqlite = "3.47.1.0"
mysql = "9.1.0"
caffeine = "3.1.8"
jedis = "5.2.0"
junit = "5.11.3"
mockito = "5.14.2"

[libraries]
paper-api = { group = "io.papermc.paper", name = "paper-api", version.ref = "paper" }
hikari-cp = { group = "com.zaxxer", name = "HikariCP", version.ref = "hikari" }
sqlite-jdbc = { group = "org.xerial", name = "sqlite-jdbc", version.ref = "sqlite" }
mysql-connector = { group = "com.mysql", name = "mysql-connector-j", version.ref = "mysql" }
caffeine = { group = "com.github.ben-manes.caffeine", name = "caffeine", version.ref = "caffeine" }
jedis = { group = "redis.clients", name = "jedis", version.ref = "jedis" }
junit-jupiter = { group = "org.junit.jupiter", name = "junit-jupiter", version.ref = "junit" }
mockito-core = { group = "org.mockito", name = "mockito-core", version.ref = "mockito" }

[plugins]
shadow = { id = "com.github.johnrengelman.shadow", version = "8.1.1" }
```

Usage in build.gradle.kts:
```kotlin
plugins {
    java
    alias(libs.plugins.shadow)
}

dependencies {
    compileOnly(libs.paper.api)
    implementation(libs.hikari.cp)
    implementation(libs.sqlite.jdbc)
    testImplementation(libs.junit.jupiter)
}
```

## Build Commands

```bash
# Build shaded JAR (most common)
./gradlew shadowJar

# Clean + build
./gradlew clean shadowJar

# Build without tests
./gradlew shadowJar -x test

# Show dependency tree (debug version conflicts)
./gradlew dependencies --configuration runtimeClasspath

# Show specific dependency insight
./gradlew dependencyInsight --dependency guava --configuration runtimeClasspath

# Scan for dependency vulnerabilities
./gradlew dependencyCheckAnalyze

# Build with info logging (debug build issues)
./gradlew shadowJar --info
```

Output: `build/libs/{name}-{version}.jar`

## JAR Verification

```bash
# Verify Paper API is NOT shaded (should return nothing)
jar tf build/libs/*.jar | grep "org/bukkit\|io/papermc\|net/kyori"

# Verify HikariCP IS shaded and relocated
jar tf build/libs/*.jar | grep "hikari"

# Check JAR size
ls -lh build/libs/*.jar

# Verify plugin.yml version was filtered (NOT ${version})
unzip -p build/libs/*.jar plugin.yml | grep version
```

## Common Gradle Errors

### Paper API Not Found
```
Could not find io.papermc.paper:paper-api
```
**Fix:** Add PaperMC repository with `maven("https://repo.papermc.io/repository/maven-public/")`.

### JAR is 50MB Instead of 50KB
**Fix:** Change `implementation` to `compileOnly` for Paper API.

### NoClassDefFoundError at Runtime
**Fix:** Dependency not shaded. Add to `implementation` (not `compileOnly`) and add `relocate()` in `tasks.shadowJar`.

### Distributing Wrong JAR (Unshaded)
**Fix:** Set `archiveClassifier.set("")` in `tasks.shadowJar` and rename plain JAR with `tasks.jar { archiveClassifier.set("unshaded") }`. Always run `shadowJar` for distribution.

### Groovy Syntax in .kts File
```
Unresolved reference: compileOnly
```
**Fix:** Use Kotlin DSL syntax with parentheses: `compileOnly("group:artifact:version")` not `compileOnly 'group:artifact:version'`.

### Version Not Replaced in plugin.yml
**Fix:** Configure `tasks.processResources` with `filesMatching("plugin.yml") { expand(...) }` and add `inputs.property()` for cache invalidation.

### plugin.yml Shows ${version} Literally
**Fix:** Resource processing not configured. See Resource Processing section above. Also verify `inputs.property()` is set for cache invalidation.

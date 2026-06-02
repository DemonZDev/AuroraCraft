# Minecraft Plugin Build System Masterclass
## Maven & Gradle for Paper 1.21.4 Plugin Development

> **Audience:** Build engineers and plugin developers standardizing build pipelines across multiple projects.
> **Scope:** Everything you need to configure, verify, and maintain Minecraft plugin builds — without external research.
> **Version:** Paper 1.21.4 · Java 21 · Maven 3.9+ · Gradle 8.x

---

## Table of Contents

1. [Build System Selection Guide](#1-build-system-selection-guide)
2. [Maven: Complete Configuration](#2-maven-complete-configuration)
3. [Gradle: Complete Configuration](#3-gradle-complete-configuration)
4. [Dependency Scope Reference](#4-dependency-scope-reference)
5. [Build Output Verification](#5-build-output-verification)
6. [Version Management](#6-version-management)
7. [Advanced Build Techniques](#7-advanced-build-techniques)
8. [Migration Guide](#8-migration-guide)
9. [AI Build System Mistakes](#9-ai-build-system-mistakes)
10. [Appendix A: Complete pom.xml Template](#appendix-a-complete-pomxml-template)
11. [Appendix B: Complete build.gradle.kts Template](#appendix-b-complete-buildgradlekts-template)
12. [Appendix C: Dependency Version Matrix](#appendix-c-dependency-version-matrix)
13. [Appendix D: Build Verification Checklist](#appendix-d-build-verification-checklist)

---

## 1. Build System Selection Guide

### 1.1 Maven vs Gradle Decision Matrix

Both Maven and Gradle are fully supported for Minecraft plugin development. The choice affects your team's workflow, CI/CD pipeline, and long-term maintainability.

| Criterion | Maven | Gradle (Kotlin DSL) | Winner |
|-----------|-------|---------------------|--------|
| **Learning curve** | Low — XML is declarative | Medium — requires Kotlin/Groovy knowledge | Maven |
| **Build speed** | Slower (no incremental builds by default) | Faster (incremental, build cache, daemon) | Gradle |
| **IDE support** | Excellent (IntelliJ, Eclipse, VS Code) | Excellent (IntelliJ first-class) | Tie |
| **Plugin ecosystem** | Mature, stable, well-documented | Large, growing, some instability | Maven |
| **Dependency management** | Reliable, predictable | Flexible, sometimes surprising | Maven |
| **Multi-module projects** | Verbose but clear | Concise, powerful | Gradle |
| **CI/CD integration** | Universal support | Universal support | Tie |
| **Reproducible builds** | Excellent with lockfiles | Good with dependency locking | Maven |
| **Custom build logic** | Limited (plugin-only) | Unlimited (Kotlin/Groovy scripts) | Gradle |
| **Community adoption (MC)** | ~60% of public plugins | ~40% of public plugins | Maven |
| **AI tooling accuracy** | Higher (more training data) | Lower (more hallucinations) | Maven |
| **Shade/relocation** | maven-shade-plugin (mature) | shadow plugin (excellent) | Tie |

**Recommendation for teams standardizing across 12 projects:**
- If your team is primarily Java developers without Gradle experience → **Maven**
- If build speed and scripting flexibility matter → **Gradle with Kotlin DSL**
- If you have a mix → **standardize on Maven** (lower variance, fewer AI mistakes)

**For new projects (2024+):** Gradle with Kotlin DSL is trending and recommended for greenfield work.
**For legacy projects:** Stay with Maven unless migration provides clear value.
**Multi-module projects:** Gradle is significantly cleaner.

### 1.2 When to Migrate Between Them

**Migrate Maven → Gradle when:**
- Build times exceed 2 minutes and incremental compilation would help
- You need complex conditional build logic (feature flags, environment-specific builds)
- You're adopting a monorepo with many subprojects
- Your team is already Kotlin-fluent
- Dependencies frequently change (Gradle's caching is better)

**Migrate Gradle → Maven when:**
- Build engineers are leaving and replacements are unfamiliar with Gradle
- You're experiencing Gradle version upgrade pain (API breakage between major versions)
- CI/CD pipelines are failing due to Gradle daemon issues
- You need maximum reproducibility guarantees
- Corporate policy mandates Maven

**Never migrate mid-release-cycle.** Always migrate at the start of a new major version.

### 1.3 Hybrid Projects

Some organizations maintain both build files simultaneously during migration. This is **strongly discouraged** for plugin projects because:

1. `pom.xml` and `build.gradle.kts` can produce different JARs from the same source
2. Developers will use whichever they're comfortable with, causing divergence
3. CI/CD must be configured for both, doubling maintenance

If you must support both temporarily, designate one as the canonical ("source of truth") build system, keep the other in sync manually, and delete the deprecated build file within 1 sprint.

---

## 2. Maven: Complete Configuration

### 2.1 The Perfect pom.xml Anatomy

A Paper plugin `pom.xml` has six critical sections. Missing or misconfiguring any one of them causes runtime failures, bloated JARs, or build errors.

```
pom.xml
├── <modelVersion>        — Always 4.0.0, never change
├── <groupId>             — Your organization's reverse domain
├── <artifactId>          — Plugin name, lowercase-hyphenated
├── <version>             — Semantic version
├── <packaging>           — MUST be "jar"
├── <properties>          — Java version, encoding, dependency versions
├── <repositories>        — Where to find non-Central artifacts
├── <dependencies>        — What your plugin needs
└── <build>
    ├── <resources>       — Resource filtering configuration
    └── <plugins>
        ├── maven-compiler-plugin   — Java version targeting
        └── maven-shade-plugin      — Dependency bundling
```

**Why `<packaging>jar</packaging>`?**
Maven defaults to `jar` if omitted, but explicit declaration prevents accidental inheritance in multi-module setups. Never use `war` (web archive) or `pom` (parent-only) for plugin projects.

### 2.2 Dependency Management

#### Repository Configuration

Paper's API is not on Maven Central. You must declare the Paper repository explicitly:

```xml
<repositories>
    <!-- Paper API repository — required for io.papermc.paper:paper-api -->
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>

    <!-- JitPack — for GitHub-hosted libraries without a Maven repo -->
    <repository>
        <id>jitpack.io</id>
        <url>https://jitpack.io</url>
    </repository>

    <!-- Sonatype snapshots — for -SNAPSHOT dependencies -->
    <repository>
        <id>sonatype-snapshots</id>
        <url>https://oss.sonatype.org/content/repositories/snapshots/</url>
        <snapshots>
            <enabled>true</enabled>
        </snapshots>
        <releases>
            <enabled>false</enabled>
        </releases>
    </repository>

    <!-- CodeMC — for bStats, other MC-specific libs -->
    <repository>
        <id>codemc-repo</id>
        <url>https://repo.codemc.io/repository/maven-public/</url>
    </repository>
</repositories>
```

#### The Paper API Dependency — Scope is Everything

```xml
<dependencies>
    <!--
        Paper API — MUST be "provided" scope.

        "provided" means: this dependency is needed to COMPILE our code,
        but it will be provided at RUNTIME by the server itself.
        The server JAR already contains Paper API — we must NOT bundle it.

        If you use "compile" scope instead:
        - Maven will include Paper API inside your plugin JAR
        - Your JAR grows from ~200KB to ~50MB+
        - Class conflicts occur at runtime (two copies of the same class)
        - Server may refuse to load the plugin
        - You will waste 50MB of disk space per plugin
    -->
    <dependency>
        <groupId>io.papermc.paper</groupId>
        <artifactId>paper-api</artifactId>
        <version>1.21.4-R0.1-SNAPSHOT</version>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

#### Scope Reference for Common Dependencies

```xml
<!-- HikariCP — connection pooling. NOT on the server, must be bundled. -->
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.1.0</version>
    <scope>compile</scope> <!-- Will be shaded into your JAR -->
</dependency>

<!-- SQLite JDBC driver — must be bundled, DO NOT relocate (breaks DriverManager) -->
<dependency>
    <groupId>org.xerial</groupId>
    <artifactId>sqlite-jdbc</artifactId>
    <version>3.47.1.0</version>
    <scope>compile</scope>
</dependency>

<!-- MySQL Connector/J — must be bundled, DO NOT relocate (JDBC service loader) -->
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <version>9.1.0</version>
    <scope>compile</scope>
</dependency>

<!-- Adventure API — bundled with Paper 1.16+, DO NOT shade -->
<dependency>
    <groupId>net.kyori</groupId>
    <artifactId>adventure-api</artifactId>
    <version>4.17.0</version>
    <scope>provided</scope>
</dependency>

<!-- MiniMessage — part of Adventure, bundled with Paper -->
<dependency>
    <groupId>net.kyori</groupId>
    <artifactId>adventure-text-minimessage</artifactId>
    <version>4.17.0</version>
    <scope>provided</scope>
</dependency>

<!-- Gson — Paper bundles its own Gson. Use provided scope by default.
     Only shade (with relocation) if you need a specific version newer than 2.8.9. -->
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.11.0</version>
    <scope>provided</scope>
</dependency>

<!-- JUnit 5 — test only, never bundled -->
<dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter</artifactId>
    <version>5.11.3</version>
    <scope>test</scope>
</dependency>

<!-- Mockito — test only -->
<dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-core</artifactId>
    <version>5.14.2</version>
    <scope>test</scope>
</dependency>

<!-- SLF4J — server provides this via Log4J bridge, do NOT shade -->
<dependency>
    <groupId>org.slf4j</groupId>
    <artifactId>slf4j-api</artifactId>
    <version>2.0.16</version>
    <scope>provided</scope>
</dependency>

<!-- LuckPerms API — provided by the LuckPerms plugin at runtime -->
<dependency>
    <groupId>net.luckperms</groupId>
    <artifactId>api</artifactId>
    <version>5.4</version>
    <scope>provided</scope>
</dependency>

<!-- Vault API — provided by Vault plugin at runtime -->
<dependency>
    <groupId>com.github.MilkBowl</groupId>
    <artifactId>VaultAPI</artifactId>
    <version>1.7.1</version>
    <scope>provided</scope>
</dependency>

<!-- PlaceholderAPI — provided by PAPI plugin at runtime -->
<dependency>
    <groupId>me.clip</groupId>
    <artifactId>placeholderapi</artifactId>
    <version>2.11.6</version>
    <scope>provided</scope>
</dependency>

<!-- Caffeine — caching library, must be shaded -->
<dependency>
    <groupId>com.github.ben-manes.caffeine</groupId>
    <artifactId>caffeine</artifactId>
    <version>3.1.8</version>
    <scope>compile</scope>
</dependency>

<!-- Jedis — Redis client, must be shaded -->
<dependency>
    <groupId>redis.clients</groupId>
    <artifactId>jedis</artifactId>
    <version>5.2.0</version>
    <scope>compile</scope>
</dependency>
```

### 2.3 The Shade Plugin (Critical)

The Maven Shade Plugin transforms your plugin from a collection of `.class` files into a self-contained, deployable JAR. Without it, any `compile`-scoped dependency will be missing at runtime, causing `NoClassDefFoundError`.

#### Why Relocation is Mandatory

When two plugins both shade the same library (e.g., HikariCP), the JVM loads whichever class appears first in the classpath. If Plugin A shades HikariCP 4.0 and Plugin B shades HikariCP 5.0, one of them will get the wrong version at runtime — causing subtle bugs or crashes.

**Relocation** moves your copy of the library to a unique package path, preventing conflicts:

```
Before relocation: com.zaxxer.hikari.HikariConfig
After relocation:  com.yourplugin.libs.hikari.HikariConfig
```

Your plugin's code is automatically rewritten to reference the relocated path. Other plugins' copies remain at the original path. No conflict.

#### Complete Shade Plugin Configuration

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-shade-plugin</artifactId>
    <version>3.6.0</version>
    <executions>
        <execution>
            <!--
                Bind to the "package" phase.
                This means "mvn package" will produce the shaded JAR.
                Without this, shade only runs if you explicitly invoke it.
            -->
            <phase>package</phase>
            <goals>
                <goal>shade</goal>
            </goals>
            <configuration>
                <!--
                    createDependencyReducedPom: creates a pom that lists
                    shaded deps as "provided" so downstream projects don't
                    re-download them. Set false for plugin projects (no downstream).
                -->
                <createDependencyReducedPom>false</createDependencyReducedPom>

                <!--
                    minimizeJar: removes unused classes from shaded deps.
                    Reduces JAR size significantly. Use with caution —
                    reflection-heavy libraries (Hibernate, Spring) may break.
                    Safe for: HikariCP, Gson, Caffeine, most utility libs.
                -->
                <minimizeJar>false</minimizeJar>

                <artifactSet>
                    <includes>
                        <!--
                            ONLY include what you explicitly want shaded.
                            Format: groupId:artifactId
                            Wildcard: groupId:* includes all artifacts from that group.

                            DO NOT include:
                            - io.papermc.paper:paper-api (provided by server)
                            - net.kyori:* (Adventure, bundled with Paper)
                            - org.slf4j:* (provided by server)
                            - org.apache.logging.log4j:* (provided by server)
                        -->
                        <include>com.zaxxer:HikariCP</include>
                        <include>org.xerial:sqlite-jdbc</include>
                        <include>com.mysql:mysql-connector-j</include>
                        <include>com.github.ben-manes.caffeine:caffeine</include>
                        <include>redis.clients:jedis</include>
                        <!-- Add other compile-scope deps here -->
                    </includes>
                </artifactSet>

                <relocations>
                    <!--
                        Relocate HikariCP.
                        Replace "com.yourplugin" with your actual base package.
                    -->
                    <relocation>
                        <pattern>com.zaxxer.hikari</pattern>
                        <shadedPattern>com.yourplugin.libs.hikari</shadedPattern>
                    </relocation>

                    <!-- Relocate Caffeine -->
                    <relocation>
                        <pattern>com.github.benmanes.caffeine</pattern>
                        <shadedPattern>com.yourplugin.libs.caffeine</shadedPattern>
                    </relocation>

                    <!--
                        Relocate Jedis.
                        Jedis also pulls in Apache Commons Pool — relocate that too.
                    -->
                    <relocation>
                        <pattern>redis.clients.jedis</pattern>
                        <shadedPattern>com.yourplugin.libs.jedis</shadedPattern>
                    </relocation>
                    <relocation>
                        <pattern>org.apache.commons.pool2</pattern>
                        <shadedPattern>com.yourplugin.libs.pool2</shadedPattern>
                    </relocation>

                    <!--
                        SQLite and MySQL JDBC drivers: DO NOT relocate.
                        JDBC drivers register themselves via java.sql.DriverManager
                        using a service loader mechanism. Relocating breaks this.
                        The driver class name is looked up by string — relocation
                        would change the class name but not the string reference.
                    -->

                    <!--
                        Gson: only relocate if you're shading it (compile scope).
                        If using server's Gson (provided scope), no relocation needed.
                    -->
                </relocations>

                <filters>
                    <!--
                        Remove digital signatures from shaded JARs.
                        Signed JARs (like some Bouncy Castle artifacts) will cause
                        SecurityException if their signatures don't match after shading.
                        This filter strips all signature files.
                    -->
                    <filter>
                        <artifact>*:*</artifact>
                        <excludes>
                            <exclude>META-INF/*.SF</exclude>
                            <exclude>META-INF/*.DSA</exclude>
                            <exclude>META-INF/*.RSA</exclude>
                            <exclude>META-INF/MANIFEST.MF</exclude>
                        </excludes>
                    </filter>
                </filters>
            </configuration>
        </execution>
    </executions>
</plugin>
```

### 2.4 Resource Filtering

Resource filtering lets you inject Maven properties (version, name, description) into your `plugin.yml` at build time. This eliminates the common mistake of forgetting to update the version in `plugin.yml` when releasing.

**Directory structure:**
```
src/
└── main/
    ├── java/
    │   └── com/yourplugin/...
    └── resources/
        └── plugin.yml          ← Filtered at build time
```

**plugin.yml with placeholders:**
```yaml
name: ${project.name}
version: ${project.version}
main: com.yourplugin.MyPlugin
description: ${project.description}
api-version: "1.21"
author: ${project.developers[0].name}
```

**Maven build configuration for filtering:**
```xml
<build>
    <resources>
        <!--
            Filtered resources: Maven replaces ${...} tokens.
            Only apply filtering to text files (yml, properties, json).
            Do NOT filter binary files (images, sounds) — it corrupts them.
        -->
        <resource>
            <directory>src/main/resources</directory>
            <filtering>true</filtering>
            <includes>
                <include>**/*.yml</include>
                <include>**/*.yaml</include>
                <include>**/*.properties</include>
                <include>**/*.json</include>
                <include>**/*.txt</include>
            </includes>
        </resource>
        <!-- Non-filtered resources: binary files passed through unchanged -->
        <resource>
            <directory>src/main/resources</directory>
            <filtering>false</filtering>
            <excludes>
                <exclude>**/*.yml</exclude>
                <exclude>**/*.yaml</exclude>
                <exclude>**/*.properties</exclude>
                <exclude>**/*.json</exclude>
                <exclude>**/*.txt</exclude>
            </excludes>
        </resource>
    </resources>
</build>
```

**Available filter tokens:**
| Token | Value | Example |
|-------|-------|---------|
| `${project.version}` | POM version | `1.2.3` |
| `${project.name}` | POM name | `MyPlugin` |
| `${project.description}` | POM description | `A great plugin` |
| `${project.groupId}` | Group ID | `com.yourorg` |
| `${project.artifactId}` | Artifact ID | `myplugin` |
| `${project.build.finalName}` | Output JAR name | `MyPlugin-1.2.3` |
| `${maven.build.timestamp}` | Build time | `2024-01-15T10:30:00` |
| `${env.CI_COMMIT_SHA}` | CI env variable | `abc123def` |

### 2.5 Build Profiles

Profiles let you switch between configurations (dev vs. production, different MC versions) without maintaining separate POM files.

```xml
<profiles>
    <!-- Development profile: faster builds, debug logging enabled.
         Activate with: mvn package -Pdev -->
    <profile>
        <id>dev</id>
        <properties>
            <plugin.debug>true</plugin.debug>
            <maven.test.skip>true</maven.test.skip>
        </properties>
    </profile>

    <!-- Production profile: full optimization, tests required.
         Activate with: mvn package -Pprod -->
    <profile>
        <id>prod</id>
        <activation>
            <activeByDefault>true</activeByDefault>
        </activation>
        <properties>
            <plugin.debug>false</plugin.debug>
        </properties>
        <build>
            <plugins>
                <plugin>
                    <groupId>org.apache.maven.plugins</groupId>
                    <artifactId>maven-surefire-plugin</artifactId>
                    <version>3.5.2</version>
                    <configuration>
                        <failIfNoTests>false</failIfNoTests>
                    </configuration>
                </plugin>
            </plugins>
        </build>
    </profile>

    <!-- Paper 1.20.4 compatibility profile.
         Activate with: mvn package -Ppaper-1204 -->
    <profile>
        <id>paper-1204</id>
        <properties>
            <paper.version>1.20.4-R0.1-SNAPSHOT</paper.version>
        </properties>
    </profile>
</profiles>
```

### 2.6 Multi-Module Projects

For organizations with shared utilities across plugins, a multi-module Maven project prevents code duplication.

**Structure:**
```
parent-project/
├── pom.xml                    ← Parent POM (packaging=pom)
├── plugin-core/               ← Shared utilities module
│   ├── pom.xml
│   └── src/main/java/...
├── plugin-survival/           ← Survival plugin module
│   ├── pom.xml
│   └── src/main/java/...
└── plugin-skyblock/           ← Skyblock plugin module
    ├── pom.xml
    └── src/main/java/...
```

**Parent POM:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.yourorg</groupId>
    <artifactId>plugins-parent</artifactId>
    <version>1.0.0</version>
    <packaging>pom</packaging>  <!-- MUST be pom for parent -->

    <modules>
        <module>plugin-core</module>
        <module>plugin-survival</module>
        <module>plugin-skyblock</module>
    </modules>

    <!-- Centralized dependency versions — child POMs inherit these -->
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>io.papermc.paper</groupId>
                <artifactId>paper-api</artifactId>
                <version>1.21.4-R0.1-SNAPSHOT</version>
                <scope>provided</scope>
            </dependency>
            <dependency>
                <groupId>com.zaxxer</groupId>
                <artifactId>HikariCP</artifactId>
                <version>5.1.0</version>
                <scope>compile</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <!-- Centralized plugin versions -->
    <build>
        <pluginManagement>
            <plugins>
                <plugin>
                    <groupId>org.apache.maven.plugins</groupId>
                    <artifactId>maven-compiler-plugin</artifactId>
                    <version>3.13.0</version>
                    <configuration>
                        <release>21</release>
                    </configuration>
                </plugin>
            </plugins>
        </pluginManagement>
    </build>
</project>
```

**Child POM (plugin-survival):**
```xml
<project>
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.yourorg</groupId>
        <artifactId>plugins-parent</artifactId>
        <version>1.0.0</version>
    </parent>

    <artifactId>plugin-survival</artifactId>
    <!-- Version inherited from parent -->

    <dependencies>
        <!-- Version inherited from parent's dependencyManagement -->
        <dependency>
            <groupId>io.papermc.paper</groupId>
            <artifactId>paper-api</artifactId>
        </dependency>

        <!-- Depend on shared core module -->
        <dependency>
            <groupId>com.yourorg</groupId>
            <artifactId>plugin-core</artifactId>
            <version>${project.version}</version>
            <scope>compile</scope>
        </dependency>
    </dependencies>
</project>
```

---

## 3. Gradle: Complete Configuration

### 3.1 The Perfect build.gradle.kts Anatomy

Gradle Kotlin DSL (`.kts`) is preferred over Groovy (`.gradle`) for new projects because:
- Type-safe — IDE autocomplete works correctly
- Compile-time errors instead of runtime surprises
- Consistent with modern Kotlin/Android tooling

**File structure for a Gradle plugin project:**
```
project-root/
├── build.gradle.kts           ← Main build script
├── settings.gradle.kts        ← Project name, subproject declarations
├── gradle.properties          ← Version numbers, Gradle properties
├── gradlew                    ← Gradle wrapper (Unix)
├── gradlew.bat                ← Gradle wrapper (Windows)
├── gradle/
│   └── wrapper/
│       ├── gradle-wrapper.jar
│       └── gradle-wrapper.properties
└── src/main/
    ├── java/
    └── resources/
        └── plugin.yml
```

**settings.gradle.kts:**
```kotlin
rootProject.name = "MyPlugin"
// For multi-module: include("module-one", "module-two")
```

**gradle.properties:**
```properties
# Gradle performance settings
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.jvmargs=-Xmx2g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8

# Dependency versions — centralized here, referenced in build.gradle.kts
paperVersion=1.21.4-R0.1-SNAPSHOT
hikariVersion=5.1.0
pluginVersion=1.0.0
```

### 3.2 Plugin Configuration

```kotlin
// build.gradle.kts

plugins {
    // Java compilation support
    java

    /*
     * Shadow plugin — equivalent to Maven Shade.
     * Creates a fat JAR with all compile-scope dependencies bundled.
     * REQUIRED if you have any "implementation" dependencies.
     * Without this, your plugin will throw NoClassDefFoundError at runtime.
     */
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

// Project coordinates
group = "com.yourorg"
version = providers.gradleProperty("pluginVersion").getOrElse("1.0.0")
description = "Your plugin description"
```

### 3.3 The Shadow Plugin

```kotlin
tasks.shadowJar {
    /*
     * archiveClassifier: controls the suffix added to the JAR filename.
     *
     * Default behavior WITHOUT this setting:
     *   - tasks.jar produces: MyPlugin-1.0.0.jar (unshaded, BROKEN for distribution)
     *   - tasks.shadowJar produces: MyPlugin-1.0.0-all.jar (shaded, correct)
     *
     * With archiveClassifier.set(""):
     *   - tasks.shadowJar produces: MyPlugin-1.0.0.jar (shaded, correct name)
     *   - tasks.jar produces: MyPlugin-1.0.0-.jar (ugly, but you won't use it)
     *
     * ALWAYS set this. Forgetting it means you'll accidentally distribute
     * the unshaded JAR (the one without the "-all" suffix).
     */
    archiveClassifier.set("")

    // Exclude digital signatures — same reason as Maven shade filter
    exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA", "META-INF/MANIFEST.MF")

    // Relocations — same logic as Maven (see section 2.3)
    relocate("com.zaxxer.hikari", "com.yourplugin.libs.hikari")
    relocate("com.github.benmanes.caffeine", "com.yourplugin.libs.caffeine")
    relocate("redis.clients.jedis", "com.yourplugin.libs.jedis")
    relocate("org.apache.commons.pool2", "com.yourplugin.libs.pool2")

    // Minimize: remove unused classes (use carefully — see Maven section 2.3)
    // minimize()

    // Merge service files — required for JDBC drivers and some other libs
    // that use META-INF/services for registration
    mergeServiceFiles()
}

/*
 * Make the default "build" task produce the shadow JAR.
 * Without this, running "gradle build" creates the unshaded JAR.
 * You'd have to explicitly run "gradle shadowJar" every time.
 */
tasks.build {
    dependsOn(tasks.shadowJar)
}

// Rename plain JAR to avoid confusion
tasks.jar {
    archiveClassifier.set("unshaded")
}
```

### 3.4 Task Configuration

```kotlin
// Java version targeting
java {
    toolchain {
        /*
         * Use Java toolchain for reproducible builds.
         * Gradle will download the correct JDK if not present locally.
         * This is more reliable than sourceCompatibility/targetCompatibility.
         */
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

// Resource filtering — inject version into plugin.yml
tasks.processResources {
    /*
     * filesMatching: only process files matching the pattern.
     * expand: replace ${key} tokens with values from the map.
     *
     * This is equivalent to Maven's resource filtering.
     * Your plugin.yml can use ${version}, ${name}, etc.
     */
    filesMatching("plugin.yml") {
        expand(
            "version" to project.version,
            "name" to project.name,
            "description" to project.description
        )
    }

    /*
     * inputs.property: tells Gradle that when these values change,
     * processResources must re-run (cache invalidation).
     * Without this, Gradle may use a cached plugin.yml with the old version.
     */
    inputs.property("version", project.version)
    inputs.property("name", project.name)
}

// Compiler options
tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.addAll(listOf(
        "-Xlint:deprecation",   // Warn on deprecated API usage
        "-Xlint:unchecked"      // Warn on unchecked casts
    ))
}

// Test configuration
tasks.test {
    useJUnitPlatform() // Required for JUnit 5
    testLogging {
        events("passed", "skipped", "failed")
    }
}
```

### 3.5 Version Management

**Centralized version catalog (gradle/libs.versions.toml):**

For projects with many dependencies, Gradle's version catalog provides a single source of truth:

```toml
# gradle/libs.versions.toml

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

**Referencing in build.gradle.kts:**
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

---

## 4. Dependency Scope Reference

### 4.1 Complete Scope/Configuration Table

| Library | Maven Scope | Gradle Config | Shaded? | Relocate? | Reason |
|---------|-------------|---------------|---------|-----------|--------|
| Paper API | `provided` | `compileOnly` | **No** | N/A | Server provides it |
| Spigot API | `provided` | `compileOnly` | **No** | N/A | Server provides it |
| Bukkit API | `provided` | `compileOnly` | **No** | N/A | Server provides it |
| Adventure API | `provided` | `compileOnly` | **No** | N/A | Bundled with Paper 1.16+ |
| MiniMessage | `provided` | `compileOnly` | **No** | N/A | Part of Adventure |
| SLF4J API | `provided` | `compileOnly` | **No** | N/A | Server provides via Log4J |
| Log4J | `provided` | `compileOnly` | **No** | N/A | Server provides it |
| Gson | `provided`* | `compileOnly`* | **No** | N/A | Server bundles 2.8.9 |
| Netty | `provided` | `compileOnly` | **No** | N/A | Paper bundles Netty |
| SnakeYAML | `provided` | `compileOnly` | **No** | N/A | Paper uses for configs |
| HikariCP | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| SQLite JDBC | `compile` | `implementation` | **Yes** | **No** | JDBC service loader |
| MySQL Connector/J | `compile` | `implementation` | **Yes** | **No** | JDBC service loader |
| PostgreSQL JDBC | `compile` | `implementation` | **Yes** | **No** | JDBC service loader |
| MariaDB JDBC | `compile` | `implementation` | **Yes** | **No** | JDBC service loader |
| H2 Database | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Caffeine | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Jedis | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Lettuce | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| OkHttp | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Retrofit | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Jackson | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Apache Commons Lang3 | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Apache Commons Pool2 | `compile` | `implementation` | **Yes** | **Yes** | Jedis dependency |
| FastUtil | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Flyway Core | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Configurate | `compile` | `implementation` | **Yes** | **Yes** | Advanced config library |
| bStats Bukkit | `compile` | `implementation` | **Yes** | **Yes** | Not on server |
| Vault API | `provided` | `compileOnly` | **No** | N/A | Vault plugin provides it |
| LuckPerms API | `provided` | `compileOnly` | **No** | N/A | LuckPerms plugin provides it |
| PlaceholderAPI | `provided` | `compileOnly` | **No** | N/A | PAPI plugin provides it |
| WorldGuard | `provided` | `compileOnly` | **No** | N/A | WorldGuard plugin provides it |
| Citizens API | `provided` | `compileOnly` | **No** | N/A | Citizens plugin provides it |
| JUnit 5 | `test` | `testImplementation` | **No** | N/A | Test only |
| Mockito | `test` | `testImplementation` | **No** | N/A | Test only |
| MockBukkit | `test` | `testImplementation` | **No** | N/A | Test only |
| AssertJ | `test` | `testImplementation` | **No** | N/A | Test only |

*\*Gson: Use `provided`/`compileOnly` by default (server bundles 2.8.9). If your plugin requires Gson 2.10+, use `compile`/`implementation` and shade + relocate.*

### 4.2 Shading Decision Tree

Use this decision tree for any dependency you're unsure about:

```
Is this dependency available on the Minecraft server at runtime?
├── YES → scope=provided / compileOnly. Do NOT shade.
│   Examples: Paper API, Adventure, SLF4J, Gson, Vault, LuckPerms
│
└── NO → scope=compile / implementation. MUST shade.
    │
    ├── Is it a JDBC driver? (ends in -jdbc, -connector-j, -driver)
    │   ├── YES → Shade but DO NOT relocate.
    │   │         JDBC uses java.sql.DriverManager.getConnection("jdbc:...")
    │   │         The driver class name is a string — relocation breaks it.
    │   │
    │   └── NO → Shade AND relocate.
    │             Use pattern: com.yourplugin.libs.<original-package>
    │
    └── Is it a test dependency? (JUnit, Mockito, AssertJ)
        ├── YES → scope=test / testImplementation. Never shaded.
        └── NO → (already handled above)
```

### 4.3 Relocation Strategy

**Naming convention for relocated packages:**
```
com.{yourplugin}.libs.{original-top-level-package}

Examples:
  com.zaxxer.hikari        → com.myplugin.libs.hikari
  com.github.benmanes.*    → com.myplugin.libs.caffeine
  redis.clients.jedis      → com.myplugin.libs.jedis
  org.apache.commons.lang3 → com.myplugin.libs.lang3
```

**What NOT to relocate:**
- JDBC drivers (breaks DriverManager registration)
- SLF4J (breaks server's logging bridge)
- `java.*`, `javax.*`, `sun.*` (JDK classes, never shaded)
- Any library the server itself exposes to plugins via its API

**Transitive dependency relocation:**
When you relocate a library, you must also relocate its transitive dependencies if they're shaded. Example: Jedis depends on Apache Commons Pool2. If you relocate Jedis, you must also relocate Pool2:

```xml
<!-- Maven -->
<relocation>
    <pattern>redis.clients.jedis</pattern>
    <shadedPattern>com.myplugin.libs.jedis</shadedPattern>
</relocation>
<relocation>
    <pattern>org.apache.commons.pool2</pattern>
    <shadedPattern>com.myplugin.libs.pool2</shadedPattern>
</relocation>
```

```kotlin
// Gradle
relocate("redis.clients.jedis", "com.myplugin.libs.jedis")
relocate("org.apache.commons.pool2", "com.myplugin.libs.pool2")
```

**Wildcard relocation (relocate entire organization):**
```kotlin
relocate("org.apache.commons", "com.myplugin.libs.commons")
// Relocates: commons-lang3, commons-io, commons-pool2, etc.
```

---

## 5. Build Output Verification

### 5.1 Maven Lifecycle

Understanding Maven's lifecycle prevents the common mistake of running the wrong phase and wondering why nothing changed.

| Phase | What Happens | Output Location | For Distribution? |
|-------|-------------|-----------------|-------------------|
| `validate` | POM syntax check | — | No |
| `initialize` | Property initialization | — | No |
| `generate-sources` | Code generation (APT, etc.) | `target/generated-sources/` | No |
| `compile` | Java → .class files | `target/classes/` | No |
| `test-compile` | Test Java → .class files | `target/test-classes/` | No |
| `test` | Run unit tests | `target/surefire-reports/` | No |
| `package` | Create JAR (+ shade if configured) | `target/*.jar` | **YES** |
| `verify` | Integration tests | `target/failsafe-reports/` | No |
| `install` | Copy to local Maven repo | `~/.m2/repository/` | No |
| `deploy` | Upload to remote repo | Remote repository | No |

**Critical:** `mvn compile` does NOT create a JAR. `mvn package` is the minimum command to produce a deployable artifact.

**Common Maven commands:**
```bash
# Build the plugin JAR (most common)
mvn package

# Build without running tests (faster for development)
mvn package -DskipTests

# Clean previous build artifacts first (recommended before release)
mvn clean package

# Build and install to local repo (for multi-module dependencies)
mvn clean install

# Build with a specific profile
mvn clean package -Pprod

# Show dependency tree (diagnose version conflicts)
mvn dependency:tree

# Show effective POM (after inheritance and profile activation)
mvn help:effective-pom

# Verify no duplicate classes in shade output
mvn dependency:analyze
```

### 5.2 Gradle Tasks

| Task | Output | For Distribution? | Notes |
|------|--------|-------------------|-------|
| `compileJava` | `build/classes/java/main/` | No | — |
| `processResources` | `build/resources/main/` | No | Filtered plugin.yml here |
| `jar` | `build/libs/MyPlugin-1.0.0.jar` | **NO** | Unshaded — missing deps |
| `shadowJar` | `build/libs/MyPlugin-1.0.0.jar` | **YES** | Shaded — correct JAR |
| `test` | `build/reports/tests/` | No | — |
| `build` | Both JARs | Check config | Depends on your setup |
| `clean` | Deletes `build/` | No | — |
| `dependencies` | Dependency tree | No | Diagnose conflicts |

**Common Gradle commands:**
```bash
# Build the shaded JAR (most common)
./gradlew shadowJar

# Clean and build
./gradlew clean shadowJar

# Build without tests
./gradlew shadowJar -x test

# Show dependency tree
./gradlew dependencies

# Show what tasks are available
./gradlew tasks

# Build with info logging (debug build issues)
./gradlew shadowJar --info

# Refresh dependencies (force re-download)
./gradlew shadowJar --refresh-dependencies
```

### 5.3 JAR Structure Verification

After building, verify your JAR has the correct structure before deploying to a server.

**Verification commands:**
```bash
# List all files in the JAR (first 30 lines)
jar tf MyPlugin-1.0.0.jar | head -30

# Check plugin.yml is at root (MUST be present)
jar tf MyPlugin-1.0.0.jar | grep "plugin.yml"

# Verify Paper API is NOT bundled (should return nothing)
jar tf MyPlugin-1.0.0.jar | grep "org/bukkit"
jar tf MyPlugin-1.0.0.jar | grep "io/papermc"
jar tf MyPlugin-1.0.0.jar | grep "net/kyori"

# Verify HikariCP IS bundled and relocated
jar tf MyPlugin-1.0.0.jar | grep "hikari"
# Should show: com/myplugin/libs/hikari/... (relocated)
# Should NOT show: com/zaxxer/hikari/... (unrelocated)

# Check JAR file size (sanity check)
ls -lh MyPlugin-1.0.0.jar
# Typical sizes:
#   No external deps: 50-200 KB
#   With HikariCP: 300-600 KB
#   With SQLite JDBC: 5-8 MB
#   With MySQL Connector: 2-4 MB
#   WRONG (Paper API leaked): 40-60 MB

# Extract and read plugin.yml to verify version was filtered
unzip -p MyPlugin-1.0.0.jar plugin.yml
```

**Correct JAR structure:**
```
MyPlugin-1.0.0.jar
├── plugin.yml                          ← MUST be at root, version must be correct
├── config.yml                          ← Default config (if any)
├── com/
│   └── yourplugin/
│       ├── MyPlugin.class              ← Your main class
│       ├── commands/
│       │   └── MyCommand.class
│       ├── listeners/
│       │   └── PlayerListener.class
│       └── libs/                       ← Relocated shaded dependencies
│           ├── hikari/
│           │   ├── HikariConfig.class
│           │   └── HikariDataSource.class
│           └── caffeine/
│               └── ...
└── META-INF/
    └── MANIFEST.MF
```

**Red flags in JAR structure:**
```
❌ org/bukkit/...          → Paper API leaked (missing provided scope)
❌ io/papermc/...          → Paper API leaked
❌ net/kyori/...           → Adventure leaked (should be provided)
❌ com/zaxxer/hikari/...   → HikariCP not relocated (conflict risk)
❌ junit/...               → Test dependency leaked (missing test scope)
❌ JAR size > 20MB         → Something is very wrong
```

### 5.4 Common Output Mistakes

**Mistake #1: Distributing the wrong JAR**

Maven with shade plugin produces TWO JARs:
```
target/
├── MyPlugin-1.0.0.jar          ← Original (unshaded) — DO NOT DISTRIBUTE
└── MyPlugin-1.0.0-shaded.jar   ← Shaded — distribute this one
```

**Fix:** Configure shade plugin to replace the original:
```xml
<configuration>
    <shadedArtifactAttached>false</shadedArtifactAttached>
    <!-- Now target/MyPlugin-1.0.0.jar IS the shaded JAR -->
</configuration>
```

**Mistake #2: Gradle `build` task producing unshaded JAR**

By default, `gradle build` runs `jar`, not `shadowJar`. Fix:
```kotlin
tasks.build {
    dependsOn(tasks.shadowJar)
}
// AND rename the plain jar to avoid confusion:
tasks.jar {
    archiveClassifier.set("unshaded")
}
```

**Mistake #3: Forgetting to clean**

Old code still runs after making changes because Maven/Gradle uses cached classes. Always use `mvn clean package` or `./gradlew clean shadowJar`.

**Mistake #4: Wrong JAR in multi-module project**

Always distribute the final artifact (usually the Bukkit/Paper module with `plugin.yml`), not the API or core module JAR.

---

## 6. Version Management

### 6.1 Java Version Targeting

| Java Version | Minecraft Versions | Paper Version | Status | Use? |
|-------------|-------------------|---------------|--------|------|
| Java 8 | 1.8 – 1.12.2 | Legacy | End of Life | No |
| Java 11 | 1.16.5 | — | LTS, legacy | No |
| Java 16 | 1.17 | — | Short-term | No |
| Java 17 | 1.18 – 1.20.4 | — | LTS | Only for 1.18-1.20.4 |
| Java 21 | 1.20.6+ | 1.21.4 | LTS, current | **Yes** |

**Maven compiler configuration:**
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <version>3.13.0</version>
    <configuration>
        <!--
            Use <release> instead of <source>/<target>.
            <release> sets source, target, AND bootclasspath simultaneously,
            preventing the "cross-compilation" footgun where you compile
            with Java 21 but target Java 17, accidentally using Java 21 APIs
            that don't exist in Java 17.
        -->
        <release>21</release>
        <encoding>UTF-8</encoding>
    </configuration>
</plugin>
```

**Gradle Java toolchain (preferred):**
```kotlin
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}
```

**Why toolchain over sourceCompatibility?**
- `sourceCompatibility = JavaVersion.VERSION_21` uses whatever JDK is running Gradle
- `toolchain { languageVersion.set(21) }` downloads and uses exactly Java 21
- Toolchain guarantees reproducible builds across developer machines

### 6.2 Minecraft Version Compatibility

**Paper API versioning pattern:**
```
{minecraft-version}-R0.1-SNAPSHOT
Examples: 1.21.4-R0.1-SNAPSHOT, 1.20.4-R0.1-SNAPSHOT
```

The `R0.1-SNAPSHOT` suffix is always the same — Paper doesn't increment the R number.

**Targeting multiple Minecraft versions:**

**Option A — Target the oldest version you support** (safest):
```xml
<paper.version>1.20.4-R0.1-SNAPSHOT</paper.version>
<!-- Plugin works on 1.20.4 through 1.21.4 -->
<!-- Cannot use 1.21+ exclusive APIs -->
```

**Option B — Use Paper's cross-version compatibility layer:**
```xml
<paper.version>1.21.4-R0.1-SNAPSHOT</paper.version>
<!-- Test on each target version -->
```

**Option C — Multi-version modules** (advanced):
```
parent/
├── api/          ← Version-agnostic interfaces
├── v1_20_4/      ← 1.20.4 implementation
├── v1_21_4/      ← 1.21.4 implementation
└── plugin/       ← Main plugin, loads correct impl at runtime
```

### 6.3 Semantic Versioning for Plugins

```
MAJOR.MINOR.PATCH[-prerelease][+buildmeta]

MAJOR: Breaking changes
  - Removed commands or permissions, changed config format (incompatible)
  - Removed public API methods, dropped Minecraft version support

MINOR: New features, backward compatible
  - New commands, new config options (with defaults)
  - New permissions, new developer API methods

PATCH: Bug fixes
  - Fixed crash, fixed incorrect behavior, performance improvements
  - No new features

Pre-release suffixes:
  1.2.0-alpha.1    → Early testing, may be unstable
  1.2.0-beta.1     → Feature complete, testing phase
  1.2.0-rc.1       → Release candidate, final testing

Build metadata (after +):
  1.2.0+20240115   → Build date
  1.2.0+abc123     → Git commit SHA (ignored in version comparisons)
```

### 6.4 api-version in plugin.yml

The `api-version` field tells the server which Paper API version your plugin was built against.

```yaml
# plugin.yml
# Correct for Paper 1.21.4
api-version: "1.21"

# Note: use the Minecraft version, not the Paper API version
# "1.21" covers 1.21.x series; "1.20" covers 1.20.x series

# WRONG — do not use the full Paper API version string
# api-version: "1.21.4-R0.1-SNAPSHOT"  ← This will cause a warning or error
```

**api-version behavior matrix:**

| api-version | Running on | Result |
|-------------|-----------|--------|
| `"1.21"` | Paper 1.21.4 | ✅ Loads normally, full feature access |
| `"1.21"` | Paper 1.20.4 | ⚠️ Warning: plugin built for newer version |
| `"1.20"` | Paper 1.21.4 | ✅ Loads, legacy mode for some features |
| Missing | Paper 1.21.4 | ⚠️ Warning: legacy plugin, some features disabled |
| `"1.22"` | Paper 1.21.4 | ❌ Refuses to load (future version) |

**Trade-off:**
- Lower `api-version` (e.g., `"1.16"`) → Broader compatibility, fewer features, legacy mappings
- Higher `api-version` (e.g., `"1.21"`) → Narrower compatibility, more features, modern mappings

---

## 7. Advanced Build Techniques

### 7.1 ProGuard/R8 Configuration

ProGuard obfuscates and shrinks your plugin JAR. Use it to protect proprietary code, reduce JAR size, and obfuscate class/method names.

**Maven ProGuard configuration:**
```xml
<plugin>
    <groupId>com.github.wvengen</groupId>
    <artifactId>proguard-maven-plugin</artifactId>
    <version>2.6.1</version>
    <executions>
        <execution>
            <phase>package</phase>
            <goals><goal>proguard</goal></goals>
        </execution>
    </executions>
    <configuration>
        <proguardVersion>7.5.0</proguardVersion>
        <injar>${project.build.finalName}.jar</injar>
        <outjar>${project.build.finalName}-obfuscated.jar</outjar>
        <libs>
            <lib>${java.home}/jmods/java.base.jmod</lib>
        </libs>
        <options>
            <!-- Keep your main plugin class -->
            <option>-keep public class com.yourplugin.MyPlugin extends org.bukkit.plugin.java.JavaPlugin</option>
            <!-- Keep all event listeners (Bukkit uses reflection) -->
            <option>-keep class * implements org.bukkit.event.Listener { *; }</option>
            <!-- Keep all command executors -->
            <option>-keep class * implements org.bukkit.command.CommandExecutor { *; }</option>
            <!-- Keep all tab completers -->
            <option>-keep class * implements org.bukkit.command.TabCompleter { *; }</option>
            <!-- Don't obfuscate class names used in plugin.yml -->
            <option>-keepnames class com.yourplugin.**</option>
            <!-- Remove debug information -->
            <option>-renamesourcefileattribute SourceFile</option>
            <option>-keepattributes SourceFile,LineNumberTable</option>
        </options>
    </configuration>
    <dependencies>
        <dependency>
            <groupId>com.guardsquare</groupId>
            <artifactId>proguard-base</artifactId>
            <version>7.5.0</version>
        </dependency>
    </dependencies>
</plugin>
```

**ProGuard rules for common Bukkit patterns:**
```proguard
# Keep all @EventHandler methods (Bukkit calls via reflection)
-keepclassmembers class * {
    @org.bukkit.event.EventHandler public void *(...);
}

# Keep all classes with @ConfigSerializable (ConfigurationSerialization)
-keep @org.bukkit.configuration.serialization.ConfigurationSerializable class * { *; }

# Keep enum values (used in config deserialization)
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep inner classes that might be referenced by outer class
-keepattributes InnerClasses,EnclosingMethod
```

### 7.2 Test Server Automation

Automate copying your built JAR to a local test server:

**Maven exec plugin:**
```xml
<plugin>
    <groupId>org.codehaus.mojo</groupId>
    <artifactId>exec-maven-plugin</artifactId>
    <version>3.4.1</version>
    <executions>
        <execution>
            <id>deploy-to-test-server</id>
            <phase>package</phase>
            <goals><goal>exec</goal></goals>
            <configuration>
                <executable>cp</executable>
                <arguments>
                    <argument>${project.build.directory}/${project.build.finalName}.jar</argument>
                    <argument>${test.server.path}/plugins/</argument>
                </arguments>
            </configuration>
        </execution>
    </executions>
</plugin>
```

**Gradle copy task:**
```kotlin
val testServerPath = providers.gradleProperty("testServerPath")
    .getOrElse("/path/to/test-server")

tasks.register<Copy>("deployToTestServer") {
    dependsOn(tasks.shadowJar)
    from(tasks.shadowJar.get().archiveFile)
    into("$testServerPath/plugins")
    doLast {
        println("Deployed to test server: $testServerPath/plugins")
    }
}

// Auto-deploy after build
tasks.build {
    finalizedBy(tasks.named("deployToTestServer"))
}
```

**Run with:**
```bash
# Maven
mvn package -Dtest.server.path=/path/to/server

# Gradle
./gradlew deployToTestServer -PtestServerPath=/path/to/server
```

### 7.3 CI/CD Integration

**GitHub Actions — Maven:**
```yaml
# .github/workflows/build.yml
name: Build Plugin

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Java 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'maven'

      - name: Build with Maven
        run: mvn clean package -B

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: plugin-jar
          path: target/*.jar
          retention-days: 30

  release:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')

    steps:
      - uses: actions/checkout@v4

      - name: Set up Java 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'maven'

      - name: Build release JAR
        run: mvn clean package -B -Pprod

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: target/*.jar
          generate_release_notes: true
```

**GitHub Actions — Gradle:**
```yaml
name: Build Plugin

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Java 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'gradle'

      - name: Grant execute permission for gradlew
        run: chmod +x gradlew

      - name: Build with Gradle
        run: ./gradlew clean shadowJar

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: plugin-jar
          path: build/libs/*.jar
```

**Jenkins (declarative pipeline):**
```groovy
// Jenkinsfile
pipeline {
    agent any

    tools {
        maven 'Maven 3.9.6'
        jdk 'JDK 21'
    }

    stages {
        stage('Checkout') {
            steps {
                git 'https://github.com/yourorg/myplugin.git'
            }
        }

        stage('Build') {
            steps {
                sh 'mvn clean package -DskipTests'
            }
        }

        stage('Test') {
            steps {
                sh 'mvn test'
            }
        }

        stage('Archive') {
            steps {
                archiveArtifacts artifacts: 'target/*.jar', fingerprint: true
            }
        }
    }

    post {
        success { echo 'Build successful!' }
        failure { echo 'Build failed!' }
    }
}
```

### 7.4 Matrix Builds

Test your plugin against multiple Minecraft versions simultaneously:

```yaml
# .github/workflows/matrix-build.yml
name: Matrix Build

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        minecraft-version:
          - "1.20.4-R0.1-SNAPSHOT"
          - "1.21.1-R0.1-SNAPSHOT"
          - "1.21.4-R0.1-SNAPSHOT"
      fail-fast: false  # Don't cancel other versions if one fails

    steps:
      - uses: actions/checkout@v4

      - name: Set up Java 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'maven'

      - name: Build for Minecraft ${{ matrix.minecraft-version }}
        run: |
          mvn clean package -B \
            -Dpaper.version=${{ matrix.minecraft-version }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: plugin-${{ matrix.minecraft-version }}
          path: target/*.jar
```

---

## 8. Migration Guide

### 8.1 Maven → Gradle Conversion

**Step 1: Generate initial Gradle files**
```bash
# In your Maven project directory
gradle init --type java-library
# Select: Kotlin DSL when prompted
```

**Step 2: Convert repositories**
```xml
<!-- Maven -->
<repository>
    <id>papermc</id>
    <url>https://repo.papermc.io/repository/maven-public/</url>
</repository>
```
```kotlin
// Gradle
repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
    maven("https://jitpack.io")
}
```

**Step 3: Convert dependencies** — use the scope conversion table:
```xml
<!-- Maven → Gradle -->
<scope>provided</scope>  →  compileOnly("...")
<scope>compile</scope>   →  implementation("...")
<scope>runtime</scope>   →  runtimeOnly("...")
<scope>test</scope>      →  testImplementation("...")
```

**Step 4: Convert shade plugin → shadow plugin**
```xml
<!-- Maven shade -->
<relocation>
    <pattern>com.zaxxer.hikari</pattern>
    <shadedPattern>com.myplugin.libs.hikari</shadedPattern>
</relocation>
```
```kotlin
// Gradle shadow
tasks.shadowJar {
    relocate("com.zaxxer.hikari", "com.myplugin.libs.hikari")
    archiveClassifier.set("")
}
```

**Step 5: Convert resource filtering**
```xml
<!-- Maven -->
<resource>
    <directory>src/main/resources</directory>
    <filtering>true</filtering>
</resource>
```
```kotlin
// Gradle
tasks.processResources {
    filesMatching("plugin.yml") {
        expand("version" to project.version)
    }
}
```

**Step 6: Delete Maven files**
```bash
rm pom.xml
rm -rf .mvn/ target/
```

### 8.2 Gradle → Maven Conversion

**Step 1: Create pom.xml** using Appendix A as your starting template.

**Step 2: Convert dependencies** (reverse of above):
- `compileOnly` → `provided`
- `implementation` → `compile`
- `testImplementation` → `test`

**Step 3: Convert shadow → shade plugin** using the shade plugin configuration from section 2.3.

**Step 4: Convert processResources → resource filtering** using the resource filtering configuration from section 2.4.

**Step 5: Delete Gradle files**
```bash
rm build.gradle.kts settings.gradle.kts gradle.properties
rm -rf gradle/ .gradle/ build/
rm gradlew gradlew.bat
```

### 8.3 Common Migration Pitfalls

| Pitfall | Maven → Gradle | Gradle → Maven |
|---------|---------------|----------------|
| **Scope mapping** | `provided` → `compileOnly` | `compileOnly` → `provided` |
| **Shade output name** | Shade replaces original by default | Shadow adds `-all` suffix by default |
| **Resource filtering syntax** | `${project.version}` | `${version}` (Gradle property) |
| **Repository declaration** | `<repositories>` block | `repositories {}` block |
| **Plugin versions** | In `<plugin>` block | In `plugins {}` block |
| **Multi-module** | `<modules>` in parent POM | `include()` in settings.gradle.kts |
| **Build output directory** | `target/` | `build/libs/` |
| **CI/CD needs updating** | Update workflow files | Update workflow files |

---

## 9. AI Build System Mistakes

This section documents the most common mistakes made by AI code generators when producing Minecraft plugin build configurations. For each mistake: the bad output, what goes wrong, and the fix.

### 9.1 Maven Mistakes

---

**Mistake 1: Paper API without `provided` scope**

```xml
<!-- ❌ AI-generated (WRONG) -->
<dependency>
    <groupId>io.papermc.paper</groupId>
    <artifactId>paper-api</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <!-- No scope = defaults to "compile" -->
</dependency>
```

**What goes wrong:** Maven includes the entire Paper API inside your plugin JAR. JAR size balloons from ~200KB to ~50MB+. At runtime, the JVM has two copies of every Bukkit class. `ClassCastException` when passing objects between plugins. Server may refuse to load the plugin.

**Fix:**
```xml
<dependency>
    <groupId>io.papermc.paper</groupId>
    <artifactId>paper-api</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <scope>provided</scope>
</dependency>
```

**Prevention prompt:** "Always use `<scope>provided</scope>` for Paper API, Spigot API, Bukkit API, and any other dependency that the Minecraft server provides at runtime."

---

**Mistake 2: No shade plugin, but compile-scope dependencies exist**

```xml
<!-- ❌ AI-generated (WRONG) — has HikariCP but no shade plugin -->
<dependencies>
    <dependency>
        <groupId>com.zaxxer</groupId>
        <artifactId>HikariCP</artifactId>
        <version>5.1.0</version>
        <scope>compile</scope>
    </dependency>
</dependencies>
<!-- No shade plugin in <build> -->
```

**What goes wrong:** `mvn package` creates a JAR without HikariCP inside. Server loads the plugin, but the first time HikariCP is accessed: `NoClassDefFoundError: com/zaxxer/hikari/HikariConfig`. Plugin crashes immediately on startup.

**Fix:** Add the complete shade plugin configuration from section 2.3.

**Prevention prompt:** "Add Maven Shade Plugin to bundle HikariCP into the JAR."

---

**Mistake 3: Shading Paper API (double-bundling)**

```xml
<!-- ❌ AI-generated (WRONG) -->
<artifactSet>
    <includes>
        <include>io.papermc.paper:paper-api</include>  <!-- NEVER do this -->
        <include>com.zaxxer:HikariCP</include>
    </includes>
</artifactSet>
```

**What goes wrong:** Paper API is already on the server classpath. Shading it creates a second copy inside your JAR. Class identity conflicts: `org.bukkit.entity.Player` from your JAR ≠ `org.bukkit.entity.Player` from the server. `ClassCastException` on every API call. JAR is 50MB+ unnecessarily.

**Fix:** Never include `io.papermc.paper`, `org.spigotmc`, `org.bukkit`, or `net.kyori` in your shade `<includes>`.

---

**Mistake 4: Missing Paper repository**

```xml
<!-- ❌ AI-generated (WRONG) — no Paper repository declared -->
<dependencies>
    <dependency>
        <groupId>io.papermc.paper</groupId>
        <artifactId>paper-api</artifactId>
        <version>1.21.4-R0.1-SNAPSHOT</version>
        <scope>provided</scope>
    </dependency>
</dependencies>
<!-- No <repositories> block -->
```

**Build error:**
```
[ERROR] Could not find artifact io.papermc.paper:paper-api:jar:1.21.4-R0.1-SNAPSHOT
```

**Fix:**
```xml
<repositories>
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>
</repositories>
```

**Prevention prompt:** "Add Paper repository: https://repo.papermc.io/repository/maven-public/"

---

**Mistake 5: Hardcoded version in plugin.yml**

```yaml
# ❌ AI-generated (WRONG)
version: 1.0.0    # Hardcoded — will never update automatically
```

**What goes wrong:** Developer updates `<version>` in pom.xml to `1.1.0`, forgets to update plugin.yml. Server loads plugin showing version `1.0.0`. `/version MyPlugin` shows wrong version. Update checkers compare wrong version.

**Fix:**
```yaml
version: ${project.version}
```
With resource filtering enabled in pom.xml (section 2.4).

---

**Mistake 6: plugin.yml in wrong directory**

```
❌ src/main/java/plugin.yml          ← WRONG
✅ src/main/resources/plugin.yml     ← CORRECT
```

**What goes wrong:** `plugin.yml` is not included in the JAR (Maven only copies `src/main/resources` to the JAR root). Server cannot find `plugin.yml`. Error: `Could not load 'plugins/MyPlugin.jar' in folder 'plugins': Plugin file does not contain plugin.yml`.

**Fix:** Always place `plugin.yml` in `src/main/resources/`.

---

**Mistake 7: Not relocating shaded dependencies**

```xml
<!-- ❌ AI-generated (WRONG) — shades but doesn't relocate -->
<artifactSet>
    <includes>
        <include>com.zaxxer:HikariCP</include>
    </includes>
</artifactSet>
<!-- No <relocations> block -->
```

**What goes wrong:** Your plugin and another plugin both shade HikariCP. Both have `com.zaxxer.hikari.HikariConfig` in their JARs. The JVM loads whichever class appears first in the classpath. Plugin A gets HikariCP 4.0 when it expects 5.0 (or vice versa). `NoSuchMethodError`, `IncompatibleClassChangeError`, or silent wrong behavior.

**Fix:** Always add `<relocations>` for every shaded library (except JDBC drivers).

---

### 9.2 Gradle Mistakes

---

**Mistake 1: `implementation` for Paper API**

```kotlin
// ❌ AI-generated (WRONG)
dependencies {
    implementation("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
}
```

**What goes wrong:** Same as Maven Mistake 1 — Paper API gets bundled into the shadow JAR, causing 50MB+ JAR and class conflicts.

**Fix:**
```kotlin
dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
}
```

**Prevention prompt:** "Use `compileOnly` for Paper API, not `implementation`."

---

**Mistake 2: Shadow plugin not applied**

```kotlin
// ❌ AI-generated (WRONG)
plugins {
    java
    // No shadow plugin
}

dependencies {
    implementation("com.zaxxer:HikariCP:5.1.0")  // Will be missing at runtime
}
```

**What goes wrong:** `./gradlew build` creates a JAR without HikariCP. Runtime `NoClassDefFoundError`.

**Fix:**
```kotlin
plugins {
    java
    id("com.github.johnrengelman.shadow") version "8.1.1"
}
```

---

**Mistake 3: Distributing wrong JAR (missing archiveClassifier)**

```kotlin
// ❌ AI-generated (WRONG) — no archiveClassifier configuration
tasks.shadowJar {
    relocate("com.zaxxer.hikari", "com.myplugin.libs.hikari")
}
```

**What goes wrong:** `./gradlew build` produces `MyPlugin-1.0.0.jar` (plain, unshaded) AND `MyPlugin-1.0.0-all.jar` (shaded). Developer copies `MyPlugin-1.0.0.jar` to server (the wrong one). Runtime `NoClassDefFoundError`.

**Fix:**
```kotlin
tasks.shadowJar {
    archiveClassifier.set("")  // Shadow JAR becomes MyPlugin-1.0.0.jar
    relocate("com.zaxxer.hikari", "com.myplugin.libs.hikari")
}

tasks.jar {
    archiveClassifier.set("unshaded")  // Rename plain JAR to avoid confusion
}
```

---

**Mistake 4: Groovy DSL syntax in Kotlin DSL file**

```kotlin
// ❌ AI-generated (WRONG) — Groovy syntax in .kts file
shadowJar {
    classifier = ''                    // Groovy assignment
    relocate 'com.zaxxer', 'com.p'    // Groovy: no parentheses
}
```

**Fix:**
```kotlin
tasks.shadowJar {
    archiveClassifier.set("")
    relocate("com.zaxxer.hikari", "com.myplugin.libs.hikari")
}
```

---

**Mistake 5: Version defined in multiple places**

```kotlin
// ❌ AI-generated (WRONG) — version in two places
version = "1.0.0"  // In build.gradle.kts
// AND in gradle.properties: pluginVersion=1.0.0
// AND in plugin.yml: version: 1.0.0
```

**What goes wrong:** Developer updates one location, forgets the others. Plugin reports wrong version.

**Fix:** Single source of truth in `gradle.properties`:
```properties
# gradle.properties
pluginVersion=1.0.0
```
```kotlin
// build.gradle.kts
version = providers.gradleProperty("pluginVersion").getOrElse("1.0.0")
```
```yaml
# plugin.yml
version: ${version}
```

---

**Mistake 6: processResources not configured**

```kotlin
// ❌ AI-generated (WRONG) — no processResources configuration
// plugin.yml contains: version: ${version}
// But nothing replaces ${version} at build time
```

**What goes wrong:** `plugin.yml` in the JAR literally contains `version: ${version}`. Server loads plugin, `/version MyPlugin` shows `${version}`. Looks broken and unprofessional.

**Fix:**
```kotlin
tasks.processResources {
    filesMatching("plugin.yml") {
        expand("version" to project.version, "name" to project.name)
    }
    inputs.property("version", project.version)
}
```

---

### 9.3 Universal Mistakes

---

**Mistake 1: Targeting wrong Java version**

```xml
<!-- ❌ AI-generated (WRONG) -->
<source>8</source>
<target>8</target>
```

```java
// But code uses Java 11+ APIs:
var list = List.of("a", "b", "c");  // List.of() is Java 9+
String result = " hello ".strip();   // strip() is Java 11+
```

**What goes wrong:** Compiles successfully (compiler doesn't check API availability with `source`/`target`). Deploys to a Java 8 server. `NoSuchMethodError: java.lang.String.strip()` at runtime.

**Fix:** Use `<release>21</release>` (Maven) or Java toolchain (Gradle). Match your target Java version to the minimum Java version of your supported Minecraft versions.

---

**Mistake 2: Depending on NMS (net.minecraft.server)**

```java
// ❌ AI-generated (WRONG)
import net.minecraft.server.v1_21_R1.EntityPlayer;
import net.minecraft.world.entity.player.EntityHuman;
```

**What goes wrong:** NMS package names change with every Minecraft version. Plugin breaks on every Minecraft update. Requires version-specific code paths.

**Fix:** Use Paper's official API. If you need NMS functionality, check if Paper has added it to the API first. If not, use a compatibility library or file a Paper API request.

**Prevention prompt:** "Never import `net.minecraft.server.*` or `org.bukkit.craftbukkit.*`. Use Paper API instead."

---

**Mistake 3: Wrong dependency version causing method not found**

```xml
<!-- ❌ AI-generated (WRONG) — outdated version -->
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>2.4.7</version>  <!-- 2018 version, missing modern methods -->
</dependency>
```

**What goes wrong:** Code uses `HikariConfig.setKeepaliveTime()` which was added in 4.0.0. `NoSuchMethodError` at runtime.

**Fix:** Use current stable versions. See Appendix C for the version matrix.

---

**Mistake 4: Test dependencies leaking into production JAR**

```xml
<!-- ❌ AI-generated (WRONG) — JUnit in compile scope -->
<dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter</artifactId>
    <version>5.11.3</version>
    <scope>compile</scope>  <!-- Should be "test" -->
</dependency>
```

**What goes wrong:** JUnit (and all its dependencies) get shaded into your plugin JAR. JAR size increases by ~5MB. JUnit classes conflict with other plugins that also accidentally bundled JUnit. Completely unnecessary at runtime.

**Fix:** Always use `<scope>test</scope>` for JUnit, Mockito, AssertJ, and any other testing library.

---

**Mistake 5: Building with wrong command**

```bash
# ❌ AI-generated (WRONG)
mvn compile          # Only compiles — no JAR produced
mvn test             # Runs tests — no JAR produced
gradle jar           # Creates unshaded JAR — missing dependencies
gradle build         # May create unshaded JAR depending on configuration
```

**Fix:**
```bash
# ✅ Correct Maven command
mvn clean package

# ✅ Correct Gradle command
./gradlew clean shadowJar
```

---

## Appendix A: Complete pom.xml Template

Copy-paste ready. Replace all `YOUR_*` placeholders before use.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">

    <!-- Always 4.0.0 — this is the POM model version, not your project version -->
    <modelVersion>4.0.0</modelVersion>

    <!-- ================================================================
         PROJECT COORDINATES
         groupId: your organization's reverse domain (com.yourorg)
         artifactId: plugin name, lowercase-hyphenated (my-plugin)
         version: semantic version (1.0.0)
         packaging: always "jar" for plugins
         ================================================================ -->
    <groupId>com.yourorg</groupId>
    <artifactId>YOUR_PLUGIN_NAME</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <name>YOUR_PLUGIN_DISPLAY_NAME</name>
    <description>YOUR_PLUGIN_DESCRIPTION</description>

    <!-- ================================================================
         PROPERTIES
         Centralize versions here. Reference with ${property.name}.
         ================================================================ -->
    <properties>
        <!-- Java version — must match your server's minimum Java version -->
        <java.version>21</java.version>

        <!-- Encoding — always UTF-8 to prevent platform-specific build issues -->
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>

        <!-- Dependency versions — update here, applies everywhere -->
        <paper.version>1.21.4-R0.1-SNAPSHOT</paper.version>
        <hikari.version>5.1.0</hikari.version>
        <sqlite.version>3.47.1.0</sqlite.version>
        <mysql.version>9.1.0</mysql.version>
        <caffeine.version>3.1.8</caffeine.version>
        <jedis.version>5.2.0</jedis.version>
        <junit.version>5.11.3</junit.version>
        <mockito.version>5.14.2</mockito.version>

        <!-- Plugin versions -->
        <maven.compiler.version>3.13.0</maven.compiler.version>
        <maven.shade.version>3.6.0</maven.shade.version>
        <maven.surefire.version>3.5.2</maven.surefire.version>
    </properties>

    <!-- ================================================================
         REPOSITORIES
         Maven Central is implicit. Add others here.
         ================================================================ -->
    <repositories>
        <!-- Paper API — required for io.papermc.paper:paper-api -->
        <repository>
            <id>papermc</id>
            <url>https://repo.papermc.io/repository/maven-public/</url>
        </repository>

        <!-- JitPack — for GitHub-hosted libraries -->
        <repository>
            <id>jitpack.io</id>
            <url>https://jitpack.io</url>
        </repository>

        <!-- CodeMC — bStats and other MC libs -->
        <repository>
            <id>codemc-repo</id>
            <url>https://repo.codemc.io/repository/maven-public/</url>
        </repository>

        <!-- Sonatype snapshots — for -SNAPSHOT dependencies -->
        <repository>
            <id>sonatype-snapshots</id>
            <url>https://oss.sonatype.org/content/repositories/snapshots/</url>
            <snapshots><enabled>true</enabled></snapshots>
            <releases><enabled>false</enabled></releases>
        </repository>
    </repositories>

    <!-- ================================================================
         DEPENDENCIES
         Scope rules:
           provided    = server has it at runtime, don't bundle
           compile     = must bundle (will be shaded)
           test        = only for unit tests, never bundled
         ================================================================ -->
    <dependencies>

        <!-- ---- SERVER-PROVIDED (scope=provided) ---- -->

        <!-- Paper API — MUST be provided. Never compile. -->
        <dependency>
            <groupId>io.papermc.paper</groupId>
            <artifactId>paper-api</artifactId>
            <version>${paper.version}</version>
            <scope>provided</scope>
        </dependency>

        <!-- ---- TO BE SHADED (scope=compile) ---- -->
        <!-- Uncomment what you need. Add to shade plugin <includes> too. -->

        <!--
        <dependency>
            <groupId>com.zaxxer</groupId>
            <artifactId>HikariCP</artifactId>
            <version>${hikari.version}</version>
            <scope>compile</scope>
        </dependency>
        -->

        <!--
        <dependency>
            <groupId>org.xerial</groupId>
            <artifactId>sqlite-jdbc</artifactId>
            <version>${sqlite.version}</version>
            <scope>compile</scope>
        </dependency>
        -->

        <!--
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <version>${mysql.version}</version>
            <scope>compile</scope>
        </dependency>
        -->

        <!--
        <dependency>
            <groupId>com.github.ben-manes.caffeine</groupId>
            <artifactId>caffeine</artifactId>
            <version>${caffeine.version}</version>
            <scope>compile</scope>
        </dependency>
        -->

        <!--
        <dependency>
            <groupId>redis.clients</groupId>
            <artifactId>jedis</artifactId>
            <version>${jedis.version}</version>
            <scope>compile</scope>
        </dependency>
        -->

        <!-- ---- TEST ONLY (scope=test) ---- -->

        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>${junit.version}</version>
            <scope>test</scope>
        </dependency>

        <dependency>
            <groupId>org.mockito</groupId>
            <artifactId>mockito-core</artifactId>
            <version>${mockito.version}</version>
            <scope>test</scope>
        </dependency>

    </dependencies>

    <!-- ================================================================
         BUILD
         ================================================================ -->
    <build>
        <!-- Output JAR name: MyPlugin-1.0.0.jar -->
        <finalName>${project.name}-${project.version}</finalName>

        <!-- Resource filtering: replaces ${project.version} etc. in plugin.yml -->
        <resources>
            <resource>
                <directory>src/main/resources</directory>
                <filtering>true</filtering>
                <includes>
                    <include>**/*.yml</include>
                    <include>**/*.yaml</include>
                    <include>**/*.properties</include>
                    <include>**/*.json</include>
                    <include>**/*.txt</include>
                </includes>
            </resource>
            <resource>
                <directory>src/main/resources</directory>
                <filtering>false</filtering>
                <excludes>
                    <exclude>**/*.yml</exclude>
                    <exclude>**/*.yaml</exclude>
                    <exclude>**/*.properties</exclude>
                    <exclude>**/*.json</exclude>
                    <exclude>**/*.txt</exclude>
                </excludes>
            </resource>
        </resources>

        <plugins>

            <!-- ---- COMPILER PLUGIN ---- -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>${maven.compiler.version}</version>
                <configuration>
                    <!-- <release> sets source + target + bootclasspath simultaneously -->
                    <release>${java.version}</release>
                    <encoding>UTF-8</encoding>
                </configuration>
            </plugin>

            <!-- ---- SHADE PLUGIN ---- -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>${maven.shade.version}</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals><goal>shade</goal></goals>
                        <configuration>
                            <!-- Replace original JAR with shaded JAR -->
                            <shadedArtifactAttached>false</shadedArtifactAttached>
                            <createDependencyReducedPom>false</createDependencyReducedPom>

                            <artifactSet>
                                <includes>
                                    <!-- Add your compile-scope deps here -->
                                    <!-- <include>com.zaxxer:HikariCP</include> -->
                                    <!-- <include>org.xerial:sqlite-jdbc</include> -->
                                    <!-- <include>com.mysql:mysql-connector-j</include> -->
                                    <!-- <include>com.github.ben-manes.caffeine:caffeine</include> -->
                                    <!-- <include>redis.clients:jedis</include> -->
                                    <!-- <include>org.apache.commons:commons-pool2</include> -->
                                </includes>
                            </artifactSet>

                            <relocations>
                                <!-- Relocate each shaded lib (except JDBC drivers) -->
                                <!-- Replace YOUR_PLUGIN with your plugin's base package -->

                                <!-- <relocation>
                                    <pattern>com.zaxxer.hikari</pattern>
                                    <shadedPattern>com.YOUR_PLUGIN.libs.hikari</shadedPattern>
                                </relocation> -->

                                <!-- <relocation>
                                    <pattern>com.github.benmanes.caffeine</pattern>
                                    <shadedPattern>com.YOUR_PLUGIN.libs.caffeine</shadedPattern>
                                </relocation> -->

                                <!-- <relocation>
                                    <pattern>redis.clients.jedis</pattern>
                                    <shadedPattern>com.YOUR_PLUGIN.libs.jedis</shadedPattern>
                                </relocation> -->
                                <!-- <relocation>
                                    <pattern>org.apache.commons.pool2</pattern>
                                    <shadedPattern>com.YOUR_PLUGIN.libs.pool2</shadedPattern>
                                </relocation> -->

                                <!-- DO NOT relocate JDBC drivers (sqlite-jdbc, mysql-connector-j) -->
                            </relocations>

                            <filters>
                                <!-- Strip digital signatures to prevent SecurityException -->
                                <filter>
                                    <artifact>*:*</artifact>
                                    <excludes>
                                        <exclude>META-INF/*.SF</exclude>
                                        <exclude>META-INF/*.DSA</exclude>
                                        <exclude>META-INF/*.RSA</exclude>
                                        <exclude>META-INF/MANIFEST.MF</exclude>
                                    </excludes>
                                </filter>
                            </filters>
                        </configuration>
                    </execution>
                </executions>
            </plugin>

            <!-- ---- SUREFIRE (test runner) ---- -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>${maven.surefire.version}</version>
                <configuration>
                    <!-- Required for JUnit 5 -->
                    <useModulePath>false</useModulePath>
                </configuration>
            </plugin>

        </plugins>
    </build>

</project>
```

---

## Appendix B: Complete build.gradle.kts Template

Copy-paste ready. Replace all `YOUR_*` placeholders before use.

```kotlin
// ============================================================
// settings.gradle.kts — place in project root
// ============================================================
// rootProject.name = "YOUR_PLUGIN_NAME"


// ============================================================
// build.gradle.kts
// ============================================================

plugins {
    java
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

// ============================================================
// PROJECT COORDINATES
// ============================================================
group = "com.yourorg"
version = providers.gradleProperty("pluginVersion").getOrElse("1.0.0")
description = "YOUR_PLUGIN_DESCRIPTION"

// ============================================================
// JAVA TOOLCHAIN
// Ensures reproducible builds regardless of developer's local JDK
// ============================================================
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

// ============================================================
// REPOSITORIES
// ============================================================
repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
    maven("https://jitpack.io")
    maven("https://repo.codemc.io/repository/maven-public/")
}

// ============================================================
// DEPENDENCIES
// compileOnly  = server provides at runtime (= Maven "provided")
// implementation = must bundle into shadow JAR (= Maven "compile")
// testImplementation = test only, never bundled (= Maven "test")
// ============================================================
dependencies {

    // ---- SERVER-PROVIDED (compileOnly) ----

    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")

    // Other plugin APIs — provided by those plugins at runtime
    // compileOnly("net.luckperms:api:5.4")
    // compileOnly("com.github.MilkBowl:VaultAPI:1.7.1")
    // compileOnly("me.clip:placeholderapi:2.11.6")

    // ---- TO BE SHADED (implementation) ----
    // Uncomment what you need. Add relocations in shadowJar block too.

    // implementation("com.zaxxer:HikariCP:5.1.0")
    // implementation("org.xerial:sqlite-jdbc:3.47.1.0")
    // implementation("com.mysql:mysql-connector-j:9.1.0")
    // implementation("com.github.ben-manes.caffeine:caffeine:3.1.8")
    // implementation("redis.clients:jedis:5.2.0")

    // ---- TEST ONLY (testImplementation) ----

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.3")
    testImplementation("org.mockito:mockito-core:5.14.2")
}

// ============================================================
// SHADOW JAR CONFIGURATION
// ============================================================
tasks.shadowJar {
    archiveClassifier.set("")

    exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA", "META-INF/MANIFEST.MF")
    mergeServiceFiles()

    // ---- RELOCATIONS ----
    // relocate("com.zaxxer.hikari", "com.yourplugin.libs.hikari")
    // relocate("com.github.benmanes.caffeine", "com.yourplugin.libs.caffeine")
    // relocate("redis.clients.jedis", "com.yourplugin.libs.jedis")
    // relocate("org.apache.commons.pool2", "com.yourplugin.libs.pool2")

    // DO NOT relocate JDBC drivers
}

tasks.build {
    dependsOn(tasks.shadowJar)
}

tasks.jar {
    archiveClassifier.set("unshaded")
}

// ============================================================
// RESOURCE PROCESSING
// ============================================================
tasks.processResources {
    filesMatching("plugin.yml") {
        expand(
            "version" to project.version,
            "name" to project.name,
            "description" to project.description
        )
    }
    inputs.property("version", project.version)
    inputs.property("name", project.name)
}

// ============================================================
// COMPILER OPTIONS
// ============================================================
tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.addAll(listOf(
        "-Xlint:deprecation",
        "-Xlint:unchecked"
    ))
}

// ============================================================
// TEST CONFIGURATION
// ============================================================
tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}

// ============================================================
// OPTIONAL: Deploy to local test server
// Usage: ./gradlew deployToTestServer -PtestServerPath=/path/to/server
// ============================================================
val testServerPath = providers.gradleProperty("testServerPath")

if (testServerPath.isPresent) {
    tasks.register<Copy>("deployToTestServer") {
        dependsOn(tasks.shadowJar)
        from(tasks.shadowJar.get().archiveFile)
        into(testServerPath.get() + "/plugins")
    }
}
```

**gradle.properties (place in project root):**
```properties
# Plugin version — single source of truth
pluginVersion=1.0.0

# Gradle performance
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.jvmargs=-Xmx2g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8

# Optional: test server path for deployToTestServer task
# testServerPath=/path/to/your/test/server
```

**plugin.yml (src/main/resources/plugin.yml):**
```yaml
name: ${name}
version: ${version}
main: com.yourorg.yourplugin.YourPlugin
description: ${description}
api-version: "1.21"
author: YourName

commands:
  yourcommand:
    description: Your command description
    usage: /<command>
    permission: yourplugin.command

permissions:
  yourplugin.command:
    description: Allows use of /yourcommand
    default: op
```

---

## Appendix C: Dependency Version Matrix

Current stable versions as of Paper 1.21.4 release cycle. Verify on Maven Central before use.

| Library | Group ID | Artifact ID | Version | Maven Scope | Gradle Config | Relocate? |
|---------|----------|-------------|---------|-------------|---------------|-----------|
| Paper API | `io.papermc.paper` | `paper-api` | `1.21.4-R0.1-SNAPSHOT` | `provided` | `compileOnly` | N/A |
| HikariCP | `com.zaxxer` | `HikariCP` | `5.1.0` | `compile` | `implementation` | **Yes** |
| SQLite JDBC | `org.xerial` | `sqlite-jdbc` | `3.47.1.0` | `compile` | `implementation` | **No** |
| MySQL Connector/J | `com.mysql` | `mysql-connector-j` | `9.1.0` | `compile` | `implementation` | **No** |
| PostgreSQL JDBC | `org.postgresql` | `postgresql` | `42.7.4` | `compile` | `implementation` | **No** |
| MariaDB JDBC | `org.mariadb.jdbc` | `mariadb-java-client` | `3.3.2` | `compile` | `implementation` | **No** |
| H2 Database | `com.h2database` | `h2` | `2.2.224` | `compile` | `implementation` | **Yes** |
| Caffeine | `com.github.ben-manes.caffeine` | `caffeine` | `3.1.8` | `compile` | `implementation` | **Yes** |
| Jedis | `redis.clients` | `jedis` | `5.2.0` | `compile` | `implementation` | **Yes** |
| Lettuce | `io.lettuce` | `lettuce-core` | `6.3.1.RELEASE` | `compile` | `implementation` | **Yes** |
| Gson | `com.google.code.gson` | `gson` | `2.11.0` | `provided`* | `compileOnly`* | See note |
| Adventure API | `net.kyori` | `adventure-api` | `4.17.0` | `provided` | `compileOnly` | N/A |
| MiniMessage | `net.kyori` | `adventure-text-minimessage` | `4.17.0` | `provided` | `compileOnly` | N/A |
| SLF4J API | `org.slf4j` | `slf4j-api` | `2.0.16` | `provided` | `compileOnly` | N/A |
| Apache Commons Lang3 | `org.apache.commons` | `commons-lang3` | `3.17.0` | `compile` | `implementation` | **Yes** |
| Apache Commons Pool2 | `org.apache.commons` | `commons-pool2` | `2.12.0` | `compile` | `implementation` | **Yes** |
| FastUtil | `it.unimi.dsi` | `fastutil` | `8.5.15` | `compile` | `implementation` | **Yes** |
| Flyway Core | `org.flywaydb` | `flyway-core` | `10.21.0` | `compile` | `implementation` | **Yes** |
| OkHttp | `com.squareup.okhttp3` | `okhttp` | `4.12.0` | `compile` | `implementation` | **Yes** |
| Jackson Core | `com.fasterxml.jackson.core` | `jackson-core` | `2.16.1` | `compile` | `implementation` | **Yes** |
| Jackson Databind | `com.fasterxml.jackson.core` | `jackson-databind` | `2.16.1` | `compile` | `implementation` | **Yes** |
| Configurate YAML | `org.spongepowered` | `configurate-yaml` | `4.1.2` | `compile` | `implementation` | **Yes** |
| LuckPerms API | `net.luckperms` | `api` | `5.4` | `provided` | `compileOnly` | N/A |
| Vault API | `com.github.MilkBowl` | `VaultAPI` | `1.7.1` | `provided` | `compileOnly` | N/A |
| PlaceholderAPI | `me.clip` | `placeholderapi` | `2.11.6` | `provided` | `compileOnly` | N/A |
| WorldGuard | `com.sk89q.worldguard` | `worldguard-bukkit` | `7.0.12` | `provided` | `compileOnly` | N/A |
| Citizens API | `net.citizensnpcs` | `citizensapi` | `2.0.32-SNAPSHOT` | `provided` | `compileOnly` | N/A |
| bStats Bukkit | `org.bstats` | `bstats-bukkit` | `3.1.0` | `compile` | `implementation` | **Yes** |
| JUnit Jupiter | `org.junit.jupiter` | `junit-jupiter` | `5.11.3` | `test` | `testImplementation` | N/A |
| Mockito Core | `org.mockito` | `mockito-core` | `5.14.2` | `test` | `testImplementation` | N/A |
| AssertJ | `org.assertj` | `assertj-core` | `3.25.3` | `test` | `testImplementation` | N/A |
| MockBukkit | `com.github.seeseemelk` | `MockBukkit-v1.21` | `3.133.0` | `test` | `testImplementation` | N/A |

*\*Gson: Server bundles 2.8.9. Use `provided` by default. If you need Gson 2.10+, shade + relocate.*

**Repository URLs for non-Central artifacts:**

| Library | Repository URL |
|---------|---------------|
| Paper API | `https://repo.papermc.io/repository/maven-public/` |
| LuckPerms | `https://oss.sonatype.org/content/repositories/snapshots/` |
| Vault API | `https://jitpack.io` |
| PlaceholderAPI | `https://repo.codemc.io/repository/maven-public/` |
| WorldGuard | `https://maven.enginehub.org/repo/` |
| Citizens | `https://repo.citizensnpcs.co/` |
| bStats | `https://repo.codemc.io/repository/maven-public/` |
| MockBukkit | `https://jitpack.io` |

---

## Appendix D: Build Verification Checklist

Run through this checklist before every public release. 20 points — all must pass.

### Project Configuration (5 points)

- [ ] **1. Java version matches server minimum.** `<release>21</release>` in compiler plugin, or Java 21 toolchain in Gradle. Verify: `javap -verbose MyPlugin.class | grep "major version"` — should be 65 (Java 21).

- [ ] **2. api-version is set correctly in plugin.yml.** Should be `"1.21"` for Paper 1.21.x. Not the full snapshot version string.

- [ ] **3. Version is not hardcoded in plugin.yml.** Should use `${project.version}` (Maven) or `${version}` (Gradle). Verify by extracting plugin.yml from the JAR and checking the version field shows a real version number, not a placeholder.

- [ ] **4. Main class path in plugin.yml matches actual class location.** If plugin.yml says `main: com.yourorg.myplugin.MyPlugin`, that class must exist at that exact path.

- [ ] **5. All commands and permissions in plugin.yml are accurate.** No commands listed that don't exist in code; no commands in code missing from plugin.yml.

### Dependency Scopes (5 points)

- [ ] **6. Paper API is `provided`/`compileOnly`.** Verify: `jar tf MyPlugin.jar | grep "org/bukkit"` returns nothing.

- [ ] **7. Adventure/MiniMessage is `provided`/`compileOnly`.** Verify: `jar tf MyPlugin.jar | grep "net/kyori"` returns nothing.

- [ ] **8. All `compile`/`implementation` dependencies are in the shade includes.** Every library you import that isn't server-provided must be in the shade configuration.

- [ ] **9. Test dependencies are `test`/`testImplementation`.** Verify: `jar tf MyPlugin.jar | grep "junit"` returns nothing. Same for Mockito, AssertJ, MockBukkit.

- [ ] **10. No NMS imports.** `grep -r "net.minecraft.server" src/` returns nothing. `grep -r "org.bukkit.craftbukkit" src/` returns nothing.

### JAR Structure (5 points)

- [ ] **11. plugin.yml is at JAR root.** `jar tf MyPlugin.jar | grep "^plugin.yml$"` returns exactly one result.

- [ ] **12. JAR size is reasonable.** No external deps: < 500KB. With HikariCP: < 1MB. With SQLite: < 10MB. With MySQL: < 5MB. If > 20MB, something is wrong.

- [ ] **13. Shaded dependencies are relocated.** `jar tf MyPlugin.jar | grep "com/zaxxer/hikari"` returns nothing. `jar tf MyPlugin.jar | grep "com/yourplugin/libs/hikari"` returns results.

- [ ] **14. JDBC drivers are NOT relocated.** `jar tf MyPlugin.jar | grep "org/sqlite"` returns results (not relocated). `jar tf MyPlugin.jar | grep "com/mysql"` returns results (not relocated).

- [ ] **15. No digital signature files.** `jar tf MyPlugin.jar | grep "\.SF$"` returns nothing.

### Build Process (5 points)

- [ ] **16. Clean build succeeds.** `mvn clean package` or `./gradlew clean shadowJar` completes without errors.

- [ ] **17. Tests pass (if any).** `mvn test` or `./gradlew test` shows no failures.

- [ ] **18. Correct JAR is being distributed.** For Maven: the file in `target/` is the shaded one (check size). For Gradle: using `shadowJar` output, not `jar` output.

- [ ] **19. Version in distributed JAR matches release tag.** Extract plugin.yml, confirm version matches your git tag / release number.

- [ ] **20. Plugin loads on target server version.** Deploy to a clean test server running your minimum supported Minecraft version. Check console for errors. Run `/version YourPlugin`. Confirm version displays correctly.

---

---

## 10. Dependency Conflict Resolution

### 10.1 Diagnosing Version Conflicts

When two dependencies pull in different versions of the same library, Maven and Gradle handle it differently — and both can surprise you.

**Maven:** Uses "nearest definition" — the version closest to the root of the dependency tree wins. This is deterministic but not always what you intend.

```bash
# Show the full dependency tree with version conflicts
mvn dependency:tree -Dverbose

# Look for lines marked with "omitted for conflict"
# Example output:
# [INFO] +- com.zaxxer:HikariCP:jar:5.1.0:compile
# [INFO] |  \- org.slf4j:slf4j-api:jar:1.7.36:compile (omitted for conflict with 2.0.16)
```

**Gradle:** Uses "highest version" by default. If Plugin A wants `guava:30.0` and Plugin B wants `guava:33.0`, Gradle silently picks `33.0`. This is convenient but can cause runtime errors if `30.0` and `33.0` have incompatible APIs.

```bash
# Show dependency insight for a specific library
./gradlew dependencyInsight --dependency guava --configuration runtimeClasspath

# Force a specific version (in build.gradle.kts)
configurations.all {
    resolutionStrategy {
        force("com.google.guava:guava:33.0.0-jre")
    }
}
```

### 10.2 Resolution Strategies

| Strategy | When to Use | Risk |
|----------|------------|------|
| **Exclude transitive dep** | You don't need the conflicting library at all | Safe if you're certain |
| **Force a version** | You need a specific version for compatibility | May break other deps |
| **Shade + relocate** | Two plugins need different versions of the same lib | The standard answer for plugins |
| **Dependency alignment (BOM)** | Coordinating versions across a family of libraries | Best for Jackson, Netty, etc. |

```xml
<!-- Maven: Exclude a transitive dependency -->
<dependency>
    <groupId>redis.clients</groupId>
    <artifactId>jedis</artifactId>
    <version>5.2.0</version>
    <exclusions>
        <exclusion>
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-pool2</artifactId>
        </exclusion>
    </exclusions>
</dependency>
<!-- Then declare the version you want separately -->
<dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-pool2</artifactId>
    <version>2.12.0</version>
</dependency>
```

```kotlin
// Gradle: Exclude transitive dependency
implementation("redis.clients:jedis:5.2.0") {
    exclude("org.apache.commons", "commons-pool2")
}
```

### 10.3 BOM (Bill of Materials) for Version Alignment

When using multiple libraries from the same ecosystem (Jackson, Netty, Spring), use a BOM to keep versions consistent:

```xml
<!-- Maven: Import Jackson BOM -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.fasterxml.jackson</groupId>
            <artifactId>jackson-bom</artifactId>
            <version>2.17.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<!-- Then declare without versions — BOM provides them -->
<dependencies>
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-databind</artifactId>
        <!-- Version comes from BOM -->
    </dependency>
</dependencies>
```

```kotlin
// Gradle: Platform dependency for BOM
dependencies {
    implementation(platform("com.fasterxml.jackson:jackson-bom:2.17.0"))
    implementation("com.fasterxml.jackson.core:jackson-databind") // No version
}
```

### 10.4 Maven Enforcer Plugin — Prevent Accidental Regressions

The enforcer plugin blocks builds that violate rules you define. This catches mistakes before they reach production:

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-enforcer-plugin</artifactId>
    <version>3.5.0</version>
    <executions>
        <execution>
            <id>enforce</id>
            <goals><goal>enforce</goal></goals>
            <configuration>
                <rules>
                    <!-- Require Java 21 (fails build if someone downgrades) -->
                    <requireJavaVersion>
                        <version>[21,)</version>
                    </requireJavaVersion>

                    <!-- Ban known-bad dependencies -->
                    <bannedDependencies>
                        <excludes>
                            <exclude>commons-logging:commons-logging</exclude>
                            <exclude>log4j:log4j</exclude>
                            <!-- Block known-vulnerable versions -->
                            <exclude>com.google.guava:guava:(,30.0)</exclude>
                        </excludes>
                    </bannedDependencies>

                    <!-- No duplicate classes across dependencies -->
                    <banDuplicateClasses>
                        <findAllDuplicates>true</findAllDuplicates>
                    </banDuplicateClasses>

                    <!-- Require dependency convergence (no version conflicts) -->
                    <dependencyConvergence/>
                </rules>
            </configuration>
        </execution>
    </executions>
</plugin>
```

---

## 11. Reproducible Builds

### 11.1 Why Reproducibility Matters

A plugin built on Developer A's machine should produce a byte-for-byte identical JAR to the one built on Developer B's machine and the CI server. Without this:

- You cannot verify that a released JAR was built from a specific commit
- Build caches are unreliable (timestamps change → cache misses)
- Security audits are impossible (you can't reproduce the binary to verify it hasn't been tampered with)

### 11.2 Maven Reproducible Builds

```xml
<properties>
    <!-- Maven 3.9+ reproducible builds support -->
    <project.build.outputTimestamp>${git.commit.time}</project.build.outputTimestamp>
</properties>

<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-jar-plugin</artifactId>
    <version>3.4.2</version>
    <configuration>
        <!-- Use deterministic timestamps (preserve for reproducible builds) -->
        <preserveFileTimestamps>false</preserveFileTimestamps>
        <excludes>
            <!-- Don't include hash files that change per-build -->
            <exclude>**/*.md5</exclude>
        </excludes>
    </configuration>
</plugin>
```

**Verify reproducibility:**
```bash
# Build twice and compare checksums
mvn clean package -Dproject.build.outputTimestamp=2024-01-01T00:00:00Z
sha256sum target/*.jar > build1.sha256
mvn clean package -Dproject.build.outputTimestamp=2024-01-01T00:00:00Z
sha256sum target/*.jar > build2.sha256
diff build1.sha256 build2.sha256  # Should be identical
```

### 11.3 Dependency Vulnerability Scanning

```bash
# Maven: OWASP Dependency-Check plugin
mvn org.owasp:dependency-check-maven:check

# Gradle: OWASP Dependency-Check plugin
./gradlew dependencyCheckAnalyze

# Both produce reports in target/dependency-check-report.html
```

Configure the plugin to fail the build on critical vulnerabilities:
```xml
<plugin>
    <groupId>org.owasp</groupId>
    <artifactId>dependency-check-maven</artifactId>
    <version>10.0.4</version>
    <configuration>
        <failBuildOnCVSS>7</failBuildOnCVSS> <!-- Fail on High (7+) or Critical (9+) -->
        <formats>
            <format>HTML</format>
            <format>JSON</format>
        </formats>
    </configuration>
    <executions>
        <execution>
            <goals><goal>check</goal></goals>
        </execution>
    </executions>
</plugin>
```

---

## 12. Gradle Advanced: Configuration Cache & Build Scans

### 12.1 Configuration Cache (Gradle 8.6+)

The configuration cache stores the result of the configuration phase. This skips the most expensive part of Gradle startup on subsequent builds:

```properties
# gradle.properties
org.gradle.configuration-cache=true
org.gradle.configuration-cache.problems=warn
```

**Impact:** CI builds that took 45 seconds (15s configuration + 30s execution) take 31 seconds (1s cache load + 30s execution). On developer machines, `./gradlew shadowJar` feels instant after the first build.

**Caveats:** Not all plugins support configuration cache. The Shadow plugin (8.1.1) does. If your build uses `buildscript {}` or `afterEvaluate {}`, the cache is disabled. Check with `./gradlew help --configuration-cache-problems`.

### 12.2 Multi-Release JARs

If your plugin targets both Java 17 (1.20.4 servers) and Java 21 (1.21.x servers) with version-specific code:

```
src/main/
├── java/                          ← Base code (Java 8 compatible)
│   └── com/yourplugin/
│       └── ServerDetector.java    ← Works on all versions
└── java17/                        ← Java 17+ only code
    └── com/yourplugin/
        └── ModernFeatures.java    ← Uses Java 17 APIs
```

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <configuration>
        <release>21</release>
    </configuration>
    <executions>
        <execution>
            <id>compile-java-17</id>
            <goals><goal>compile</goal></goals>
            <configuration>
                <release>17</release>
                <compileSourceRoots>
                    <compileSourceRoot>${project.basedir}/src/main/java17</compileSourceRoot>
                </compileSourceRoots>
                <multiReleaseOutput>true</multiReleaseOutput>
            </configuration>
        </execution>
    </executions>
</plugin>
```

The resulting JAR has:
```
META-INF/
├── MANIFEST.MF (Multi-Release: true)
└── versions/
    └── 17/
        └── com/yourplugin/ModernFeatures.class
com/yourplugin/
└── ServerDetector.class
```

Java 17+ JVMs load classes from `versions/17/` first, falling back to the root for shared classes.

---

## 13. Build Performance: The 80/20 of Faster Builds

### 13.1 Maven Build Speed

| Optimization | Speed Gain | Effort |
|-------------|-----------|--------|
| `mvn package -T 1C` (parallel builds) | 30–50% on multi-module | Zero (just add the flag) |
| `-DskipTests` during development | 40–70% (tests dominate) | Zero |
| Maven Daemon (`mvnd`) | 30–60% startup time | Install `mvnd`, use instead of `mvn` |
| Incremental compilation (maven-compiler-plugin 3.13+) | 50–80% on recompile | Already enabled by default |
| `~/.m2/repository` on SSD | 20–30% dependency resolution | Hardware |

```bash
# The fastest Maven dev command:
mvnd clean package -T 1C -DskipTests

# mvnd = Maven Daemon — keeps a warm JVM, reuses it across builds
# -T 1C = one thread per CPU core for parallel module builds
```

### 13.2 Gradle Build Speed

| Optimization | Speed Gain | How |
|-------------|-----------|-----|
| Configuration cache | 10–20s on startup | `org.gradle.configuration-cache=true` |
| Build cache (remote) | 50–90% for CI | `org.gradle.caching=true` |
| Parallel execution | 20–40% on multi-module | `org.gradle.parallel=true` (default) |
| File-system watching | 10–30% on recompile | `org.gradle.vfs.watch=true` (default) |
| Daemon | 5–15s on startup | `org.gradle.daemon=true` (default) |

```bash
# The fastest Gradle dev command:
./gradlew shadowJar --configuration-cache --parallel

# For CI — use a remote build cache:
./gradlew shadowJar --build-cache \
  -Dgradle.cache.remote.url=https://your-build-cache-server/cache/
```

### 13.3 Common Build Time Wasters

1. **`./gradlew clean build`** — `clean` deletes the build cache. Use `shadowJar` instead of `build` during development.
2. **`mvn clean install`** — `install` copies to `~/.m2/` which you don't need for plugins. Use `mvn package`.
3. **No JVM args for Maven:** Add `export MAVEN_OPTS="-Xmx2g -XX:+UseG1GC"` to your shell profile. Maven's default heap is 256MB — it spends more time GCing than compiling.
4. **Running tests on every build during development:** Tests should run in your IDE as you code, and in CI before merge. During active development, `-DskipTests` is fine.

---

*End of Minecraft Plugin Build System Masterclass*
*Paper 1.21.4 · Java 21 · Maven 3.9+ · Gradle 8.x*

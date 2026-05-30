# Minecraft Plugin Build System Masterclass
## Maven & Gradle for Paper 1.21.4 Plugin Development

**Version:** 1.0.0  
**Last Updated:** 2024  
**Target Audience:** Build Engineers, Plugin Developers, DevOps Teams  
**Purpose:** Definitive reference for Minecraft plugin build systems to eliminate runtime crashes, dependency conflicts, and build failures.

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
10. [Appendices](#appendices)

---

## 1. Build System Selection Guide

### 1.1 Maven vs Gradle Decision Matrix

| Criteria | Maven | Gradle | Winner |
|----------|-------|--------|--------|
| **Learning Curve** | Easier for beginners | Steeper, requires Groovy/Kotlin knowledge | Maven |
| **Build Speed** | Slower (no incremental builds) | Faster (incremental compilation, daemon) | Gradle |
| **IDE Integration** | Universal support | Excellent support (IntelliJ, VSCode) | Tie |
| **Convention** | Strict, opinionated | Flexible, customizable | Depends |
| **Dependency Management** | Mature, stable | Modern, powerful | Gradle |
| **Multi-Module Projects** | Verbose XML | Clean DSL | Gradle |
| **Enterprise Adoption** | 60% of legacy projects | 70% of new projects | Gradle (trending) |
| **Minecraft Community** | More tutorials | Growing adoption | Maven (legacy) |
| **Build Cache** | None (without plugins) | Built-in | Gradle |
| **Debugging** | Easier (verbose output) | Harder (abstracted tasks) | Maven |

**Recommendation:**
- **New projects (2024+):** Gradle with Kotlin DSL
- **Legacy projects:** Stay with Maven unless migration provides clear value
- **Teams with Maven expertise:** Maven (productivity matters more than tool choice)
- **Multi-module projects:** Gradle (significantly cleaner configuration)

### 1.2 When to Migrate Between Them

**Migrate Maven → Gradle when:**
- Project has 3+ modules (Gradle's multi-project builds are superior)
- Build times exceed 30 seconds (Gradle's daemon reduces this by 40-70%)
- Team has Kotlin/Groovy expertise
- You need advanced build automation (custom tasks, code generation)
- Dependencies frequently change (Gradle's caching is better)

**Migrate Gradle → Maven when:**
- Team lacks Gradle expertise and timeline is tight
- Corporate policy mandates Maven
- Simpler project structure (single module, few dependencies)
- Integration with Maven-only CI/CD systems

**Stay with current system when:**
- Build works reliably
- Team is productive with current tooling
- Migration cost exceeds value (80% of cases)

### 1.3 Hybrid Projects

**Don't do hybrid projects.** Pick one build system per repository.

**Exception:** Multi-repository microservices where each service owns its build tool choice.

**Anti-pattern:**
```
MyPlugin/
├── pom.xml          ← Maven
├── build.gradle     ← Gradle
└── ...              ← Confusion, broken builds
```

**If you must maintain both** (e.g., during migration):
1. Designate one as "source of truth"
2. Keep the other in sync manually
3. Delete the deprecated build file within 1 sprint

---

## 2. Maven: Complete Configuration

### 2.1 The Perfect pom.xml Anatomy

Maven uses XML for configuration. Every `pom.xml` has 5 critical sections:

1. **Project Metadata** — Who, what, version
2. **Properties** — Java version, encoding, dependency versions
3. **Repositories** — Where to download dependencies
4. **Dependencies** — What libraries to include
5. **Build Configuration** — How to compile and package

**Minimal structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <!-- 1. PROJECT METADATA -->
    <groupId>com.rohitraj02953</groupId>
    <artifactId>myplugin</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    
    <name>MyPlugin</name>
    <description>A Minecraft plugin</description>

    <!-- 2. PROPERTIES -->
    <properties>
        <!-- Java version -->
        <maven.compiler.source>21</maven.compiler.source>
        <maven.compiler.target>21</maven.compiler.target>
        <maven.compiler.release>21</maven.compiler.release>
        
        <!-- Encoding (prevents platform-dependent builds) -->
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
        
        <!-- Dependency versions (centralized) -->
        <paper.version>1.21.4-R0.1-SNAPSHOT</paper.version>
    </properties>

    <!-- 3. REPOSITORIES -->
    <repositories>
        <repository>
            <id>papermc</id>
            <url>https://repo.papermc.io/repository/maven-public/</url>
        </repository>
    </repositories>

    <!-- 4. DEPENDENCIES -->
    <dependencies>
        <dependency>
            <groupId>io.papermc.paper</groupId>
            <artifactId>paper-api</artifactId>
            <version>${paper.version}</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>

    <!-- 5. BUILD CONFIGURATION -->
    <build>
        <plugins>
            <!-- Compiler plugin -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.13.0</version>
                <configuration>
                    <source>21</source>
                    <target>21</target>
                    <release>21</release>
                </configuration>
            </plugin>
            
            <!-- Shade plugin -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.6.0</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals>
                            <goal>shade</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
        
        <!-- Resource filtering -->
        <resources>
            <resource>
                <directory>src/main/resources</directory>
                <filtering>true</filtering>
            </resource>
        </resources>
    </build>
</project>
```

**Why each section matters:**

#### `<packaging>jar</packaging>`
- **Correct:** `jar` — Creates executable JAR file
- **Wrong:** `pom` — No code compilation, only dependency management
- **Wrong:** `war` — Web application archive (not for Minecraft plugins)
- **Wrong:** `maven-plugin` — For Maven extensions only

#### `<properties>` Section

**Java version targeting:**
```xml
<maven.compiler.source>21</maven.compiler.source>  <!-- Read source as Java 21 -->
<maven.compiler.target>21</maven.compiler.target>  <!-- Compile to Java 21 bytecode -->
<maven.compiler.release>21</maven.compiler.release> <!-- Ensure APIs are Java 21 only -->
```

**Critical:** `release` flag prevents using Java 22 APIs while targeting Java 21. Always use it.

**Encoding:**
```xml
<project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
```
Without this, builds on Windows use Cp1252, Linux uses UTF-8 → different output!

**Centralized version management:**
```xml
<properties>
    <paper.version>1.21.4-R0.1-SNAPSHOT</paper.version>
    <hikari.version>5.1.0</hikari.version>
    <sqlite.version>3.45.1.0</sqlite.version>
</properties>

<dependencies>
    <dependency>
        <groupId>io.papermc.paper</groupId>
        <artifactId>paper-api</artifactId>
        <version>${paper.version}</version> <!-- References property -->
        <scope>provided</scope>
    </dependency>
</dependencies>
```

**Benefits:**
- Single place to update versions
- Easy version auditing
- IDE autocomplete for versions

### 2.2 Dependency Management

#### Understanding Dependency Scopes

Maven has 6 dependency scopes. Only 4 matter for plugins:

| Scope | Included in Compile? | Included in Runtime? | Included in JAR? | Use For |
|-------|---------------------|---------------------|------------------|---------|
| **compile** (default) | ✅ Yes | ✅ Yes | ✅ Yes (if shaded) | Libraries to shade (HikariCP, Gson) |
| **provided** | ✅ Yes | ❌ No | ❌ No | Server-provided APIs (Paper, Spigot) |
| **runtime** | ❌ No | ✅ Yes | ✅ Yes | JDBC drivers (rare) |
| **test** | ✅ Yes (tests only) | ✅ Yes (tests only) | ❌ No | JUnit, Mockito |
| system | ⚠️ Deprecated | ⚠️ Deprecated | ⚠️ Don't use | — |
| import | ⚠️ Special | ⚠️ Special | ⚠️ Special | BOM imports only |

**Critical rules:**
1. **Server-provided dependencies = `provided`** (Paper API, Adventure, SLF4J)
2. **External libraries = `compile`** (HikariCP, SQLite JDBC)
3. **Test libraries = `test`** (JUnit, Mockito)
4. **Never use `system` scope** (deprecated, breaks portability)

#### Paper API Dependency (Most Critical)

```xml
<dependency>
    <groupId>io.papermc.paper</groupId>
    <artifactId>paper-api</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <scope>provided</scope> <!-- CRITICAL: Prevents 50MB JAR bloat -->
</dependency>
```

**What happens without `scope=provided`:**

```bash
# Wrong (no scope specified, defaults to compile):
MyPlugin-1.0.jar → 52.4 MB (includes ALL of Paper API)

# Correct (scope=provided):
MyPlugin-1.0.jar → 150 KB (only your code)
```

**Server startup with wrong scope:**
```
[ERROR] Plugin MyPlugin contains duplicate class: org.bukkit.Bukkit
[ERROR] This plugin conflicts with the server. Disabling.
```

#### Adventure API (Bundled with Paper 1.19+)

```xml
<!-- WRONG: Adding Adventure separately -->
<dependency>
    <groupId>net.kyori</groupId>
    <artifactId>adventure-api</artifactId>
    <version>4.17.0</version>
    <scope>compile</scope> <!-- Conflicts with Paper's bundled version! -->
</dependency>

<!-- CORRECT: Adventure is in Paper API, no separate dependency needed -->
<!-- Paper 1.21.4 bundles Adventure 4.17.0 -->
```

**Exception:** If you need Adventure features not in Paper's bundled version:
```xml
<dependency>
    <groupId>net.kyori</groupId>
    <artifactId>adventure-text-minimessage</artifactId>
    <version>4.17.0</version>
    <scope>provided</scope> <!-- Paper bundles this too -->
</dependency>
```

#### External Libraries (Shade These)

**HikariCP (database connection pooling):**
```xml
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>5.1.0</version>
    <scope>compile</scope> <!-- Will be shaded into JAR -->
</dependency>
```

**SQLite JDBC driver:**
```xml
<dependency>
    <groupId>org.xerial</groupId>
    <artifactId>sqlite-jdbc</artifactId>
    <version>3.45.1.0</version>
    <scope>compile</scope>
</dependency>
```

**MySQL Connector:**
```xml
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <version>8.3.0</version>
    <scope>compile</scope>
</dependency>
```

**Gson (JSON library):**
```xml
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.10.1</version>
    <scope>compile</scope>
</dependency>
```

**⚠️ WARNING:** Spigot/Paper bundles Gson 2.8.9. If your plugin uses Gson 2.10+, **shade and relocate** to avoid conflicts.

#### Plugin Dependencies (Other Minecraft Plugins)

**Vault (economy/permissions API):**
```xml
<repository>
    <id>jitpack</id>
    <url>https://jitpack.io</url>
</repository>

<dependency>
    <groupId>com.github.MilkBowl</groupId>
    <artifactId>VaultAPI</artifactId>
    <version>1.7</version>
    <scope>provided</scope> <!-- Vault plugin provides this at runtime -->
</dependency>
```

**PlaceholderAPI:**
```xml
<repository>
    <id>placeholderapi</id>
    <url>https://repo.extendedclip.com/content/repositories/placeholderapi/</url>
</repository>

<dependency>
    <groupId>me.clip</groupId>
    <artifactId>placeholderapi</artifactId>
    <version>2.11.5</version>
    <scope>provided</scope>
</dependency>
```

**LuckPerms:**
```xml
<dependency>
    <groupId>net.luckperms</groupId>
    <artifactId>api</artifactId>
    <version>5.4</version>
    <scope>provided</scope>
</dependency>
```

#### Test Dependencies

```xml
<!-- JUnit 5 (Jupiter) -->
<dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter</artifactId>
    <version>5.10.2</version>
    <scope>test</scope>
</dependency>

<!-- Mockito -->
<dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-core</artifactId>
    <version>5.11.0</version>
    <scope>test</scope>
</dependency>

<!-- MockBukkit (Bukkit mocking framework) -->
<dependency>
    <groupId>com.github.seeseemelk</groupId>
    <artifactId>MockBukkit-v1.20</artifactId>
    <version>3.9.0</version>
    <scope>test</scope>
</dependency>
```

### 2.3 The Shade Plugin (Critical)

**The Maven Shade Plugin** bundles your dependencies into the final JAR. Without it, runtime crashes occur:

```
java.lang.NoClassDefFoundError: com/zaxxer/hikari/HikariDataSource
```

#### Basic Shade Configuration

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-shade-plugin</artifactId>
            <version>3.6.0</version>
            <executions>
                <execution>
                    <phase>package</phase> <!-- Run during 'mvn package' -->
                    <goals>
                        <goal>shade</goal>
                    </goals>
                    <configuration>
                        <!-- Configuration goes here -->
                    </configuration>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

#### Advanced Shade Configuration

```xml
<configuration>
    <!-- 1. Create executable JAR with shaded dependencies -->
    <createDependencyReducedPom>false</createDependencyReducedPom>
    
    <!-- 2. Specify which dependencies to include -->
    <artifactSet>
        <includes>
            <include>com.zaxxer:HikariCP</include>
            <include>org.xerial:sqlite-jdbc</include>
            <include>com.google.code.gson:gson</include>
        </includes>
        <excludes>
            <!-- Never shade these (server provides them) -->
            <exclude>io.papermc.paper:paper-api</exclude>
            <exclude>org.spigotmc:spigot-api</exclude>
            <exclude>net.kyori:*</exclude> <!-- Adventure (bundled) -->
        </excludes>
    </artifactSet>
    
    <!-- 3. Relocate packages to avoid conflicts -->
    <relocations>
        <!-- Relocate HikariCP -->
        <relocation>
            <pattern>com.zaxxer.hikari</pattern>
            <shadedPattern>com.rohitraj02953.myplugin.libs.hikari</shadedPattern>
        </relocation>
        
        <!-- Relocate Gson -->
        <relocation>
            <pattern>com.google.gson</pattern>
            <shadedPattern>com.rohitraj02953.myplugin.libs.gson</shadedPattern>
        </relocation>
        
        <!-- Relocate SQLite JDBC -->
        <relocation>
            <pattern>org.sqlite</pattern>
            <shadedPattern>com.rohitraj02953.myplugin.libs.sqlite</shadedPattern>
        </relocation>
    </relocations>
    
    <!-- 4. Minimize JAR (remove unused classes) -->
    <minimizeJar>true</minimizeJar>
    
    <!-- 5. Filters (exclude signatures that break JARs) -->
    <filters>
        <filter>
            <artifact>*:*</artifact>
            <excludes>
                <exclude>META-INF/*.SF</exclude>
                <exclude>META-INF/*.DSA</exclude>
                <exclude>META-INF/*.RSA</exclude>
            </excludes>
        </filter>
    </filters>
</configuration>
```

#### Understanding Relocation

**Why relocate?**

Scenario: Your plugin uses HikariCP 5.1.0. Another plugin uses HikariCP 4.0.3. Without relocation:

```
Server classloader:
  com.zaxxer.hikari.HikariDataSource (version 4.0.3) ← Loaded first

Your plugin:
  new HikariDataSource() → Uses 4.0.3 classes
  calls method added in 5.1.0 → NoSuchMethodError!
```

**With relocation:**

```xml
<relocation>
    <pattern>com.zaxxer.hikari</pattern>
    <shadedPattern>com.myplugin.libs.hikari</shadedPattern>
</relocation>
```

Your plugin JAR structure:
```
MyPlugin.jar
├── com/rohitraj02953/myplugin/
│   ├── MyPlugin.class
│   └── libs/
│       └── hikari/                    ← Relocated HikariCP
│           └── HikariDataSource.class
```

Now both plugins have isolated HikariCP versions. **No conflicts.**

#### What NOT to Relocate

**Never relocate:**
1. **Paper/Spigot API** — Should be `provided`, not shaded at all
2. **Adventure API** — Bundled with Paper, don't shade
3. **SLF4J** — Server provides logging, conflicts will break plugins
4. **Plugin dependencies** — Vault, PlaceholderAPI, etc. (runtime plugins)

**Sometimes relocate:**
1. **Gson** — Paper bundles 2.8.9. If you need 2.10+, shade + relocate
2. **Apache Commons** — Server may have older version, relocate for safety
3. **Guava** — Paper bundles it, but version conflicts are common → relocate

**Always relocate:**
1. **HikariCP** — No server bundling, high conflict risk
2. **Database drivers** — SQLite, MySQL connectors
3. **Jedis/Lettuce** — Redis clients
4. **Caffeine** — Caching library
5. **FastUtil** — Collection utilities
6. **OkHttp** — HTTP client

#### Minimize JAR

```xml
<minimizeJar>true</minimizeJar>
```

**What it does:** Removes unused classes from shaded dependencies.

**Example:**
- HikariCP full JAR: 156 KB (100+ classes)
- Your plugin uses: 15 classes
- With `minimizeJar`: Only those 15 classes are included → 45 KB

**When to disable:**
- Library uses reflection to load classes (minimizer can't detect usage)
- Build fails with `ClassNotFoundException` at runtime

**Fix for reflection issues:**
```xml
<filters>
    <filter>
        <artifact>com.zaxxer:HikariCP</artifact>
        <includes>
            <include>**</include> <!-- Keep all HikariCP classes -->
        </includes>
    </filter>
</filters>
```

### 2.4 Resource Filtering

**Problem:** Hardcoded version in `plugin.yml` gets out of sync with `pom.xml`.

**plugin.yml (before filtering):**
```yaml
name: MyPlugin
version: ${project.version}  # Replaced during build
main: com.rohitraj02953.myplugin.MyPlugin
api-version: "1.21"
description: ${project.description}
```

**Maven configuration:**
```xml
<build>
    <resources>
        <resource>
            <directory>src/main/resources</directory>
            <filtering>true</filtering> <!-- Enable placeholder replacement -->
        </resource>
    </resources>
</build>
```

**After build (inside JAR):**
```yaml
name: MyPlugin
version: 1.0.0  # From <version>1.0.0</version> in pom.xml
main: com.rohitraj02953.myplugin.MyPlugin
api-version: "1.21"
description: A Minecraft plugin  # From <description> in pom.xml
```

**Available placeholders:**
| Placeholder | Example Value |
|-------------|---------------|
| `${project.version}` | 1.0.0 |
| `${project.name}` | MyPlugin |
| `${project.description}` | A Minecraft plugin |
| `${project.groupId}` | com.rohitraj02953 |
| `${project.artifactId}` | myplugin |
| `${maven.build.timestamp}` | 2024-01-15T10:30:00Z |

**Custom properties:**
```xml
<properties>
    <plugin.author>rohitraj02953</plugin.author>
</properties>
```

```yaml
author: ${plugin.author}  # Becomes: author: rohitraj02953
```

**⚠️ WARNING:** Filtering processes ALL files in `src/main/resources`. If you have binary files (images, sounds), exclude them:

```xml
<resources>
    <!-- Filtered resources (text files) -->
    <resource>
        <directory>src/main/resources</directory>
        <filtering>true</filtering>
        <includes>
            <include>**/*.yml</include>
            <include>**/*.yaml</include>
            <include>**/*.properties</include>
        </includes>
    </resource>
    
    <!-- Non-filtered resources (binary files) -->
    <resource>
        <directory>src/main/resources</directory>
        <filtering>false</filtering>
        <excludes>
            <exclude>**/*.yml</exclude>
            <exclude>**/*.yaml</exclude>
            <exclude>**/*.properties</exclude>
        </excludes>
    </resource>
</resources>
```

### 2.5 Build Profiles

Profiles enable conditional builds (dev vs. production, different Java versions, etc.).

```xml
<profiles>
    <!-- Development profile (fast builds, no optimization) -->
    <profile>
        <id>dev</id>
        <activation>
            <activeByDefault>true</activeByDefault>
        </activation>
        <build>
            <plugins>
                <plugin>
                    <groupId>org.apache.maven.plugins</groupId>
                    <artifactId>maven-shade-plugin</artifactId>
                    <configuration>
                        <minimizeJar>false</minimizeJar> <!-- Faster builds -->
                    </configuration>
                </plugin>
            </plugins>
        </build>
    </profile>
    
    <!-- Production profile (optimized builds) -->
    <profile>
        <id>prod</id>
        <build>
            <plugins>
                <plugin>
                    <groupId>org.apache.maven.plugins</groupId>
                    <artifactId>maven-shade-plugin</artifactId>
                    <configuration>
                        <minimizeJar>true</minimizeJar> <!-- Smaller JAR -->
                    </configuration>
                </plugin>
            </plugins>
        </build>
    </profile>
    
    <!-- Java 17 profile (for 1.18-1.20.4 servers) -->
    <profile>
        <id>java17</id>
        <properties>
            <maven.compiler.source>17</maven.compiler.source>
            <maven.compiler.target>17</maven.compiler.target>
            <maven.compiler.release>17</maven.compiler.release>
        </properties>
    </profile>
</profiles>
```

**Usage:**
```bash
mvn clean package                  # Uses default (dev) profile
mvn clean package -P prod          # Uses production profile
mvn clean package -P java17        # Uses Java 17
mvn clean package -P prod,java17   # Multiple profiles
```

### 2.6 Multi-Module Projects

For large plugins with shared code (Bukkit + BungeeCord, or Core + Extensions):

```
MyPlugin/
├── pom.xml                    ← Parent POM
├── myplugin-core/
│   ├── pom.xml                ← Child POM
│   └── src/...
├── myplugin-bukkit/
│   ├── pom.xml
│   └── src/...
└── myplugin-bungee/
    ├── pom.xml
    └── src/...
```

**Parent POM (MyPlugin/pom.xml):**
```xml
<project>
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>com.rohitraj02953</groupId>
    <artifactId>myplugin-parent</artifactId>
    <version>1.0.0</version>
    <packaging>pom</packaging> <!-- IMPORTANT: pom, not jar -->
    
    <modules>
        <module>myplugin-core</module>
        <module>myplugin-bukkit</module>
        <module>myplugin-bungee</module>
    </modules>
    
    <!-- Shared properties and dependencies -->
    <properties>
        <java.version>21</java.version>
    </properties>
    
    <dependencyManagement>
        <!-- Define versions here, children inherit -->
        <dependencies>
            <dependency>
                <groupId>com.google.code.gson</groupId>
                <artifactId>gson</artifactId>
                <version>2.10.1</version>
            </dependency>
        </dependencies>
    </dependencyManagement>
</project>
```

**Child POM (myplugin-bukkit/pom.xml):**
```xml
<project>
    <modelVersion>4.0.0</modelVersion>
    
    <parent>
        <groupId>com.rohitraj02953</groupId>
        <artifactId>myplugin-parent</artifactId>
        <version>1.0.0</version>
    </parent>
    
    <artifactId>myplugin-bukkit</artifactId>
    <packaging>jar</packaging>
    
    <dependencies>
        <!-- Depend on core module -->
        <dependency>
            <groupId>com.rohitraj02953</groupId>
            <artifactId>myplugin-core</artifactId>
            <version>${project.version}</version>
        </dependency>
        
        <!-- Gson version inherited from parent -->
        <dependency>
            <groupId>com.google.code.gson</groupId>
            <artifactId>gson</artifactId>
            <!-- No version specified! Inherited from parent -->
        </dependency>
        
        <dependency>
            <groupId>io.papermc.paper</groupId>
            <artifactId>paper-api</artifactId>
            <version>1.21.4-R0.1-SNAPSHOT</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>
</project>
```

**Building multi-module projects:**
```bash
cd MyPlugin/              # Parent directory
mvn clean package         # Builds all modules

cd myplugin-bukkit/       # Child directory
mvn clean package         # Builds only Bukkit module + dependencies
```

---

## 3. Gradle: Complete Configuration

### 3.1 The Perfect build.gradle.kts Anatomy

Gradle supports two languages: **Groovy** (`.gradle`) and **Kotlin** (`.gradle.kts`). Use **Kotlin DSL** for type safety and IDE autocomplete.

**File structure:**
```
MyPlugin/
├── build.gradle.kts       ← Build script
├── settings.gradle.kts    ← Project settings
├── gradle.properties      ← Build properties
├── gradlew                ← Unix wrapper
├── gradlew.bat            ← Windows wrapper
└── src/
    └── main/
        ├── java/
        └── resources/
```

**Minimal build.gradle.kts:**
```kotlin
plugins {
    java
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

group = "com.rohitraj02953"
version = "1.0.0"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
    implementation("com.zaxxer:HikariCP:5.1.0")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

tasks {
    shadowJar {
        archiveClassifier.set("") // No "-all" suffix
        
        relocate("com.zaxxer.hikari", "com.rohitraj02953.myplugin.libs.hikari")
        
        minimize() // Remove unused classes
    }
    
    build {
        dependsOn(shadowJar) // 'gradle build' creates shaded JAR
    }
    
    processResources {
        filesMatching("plugin.yml") {
            expand("version" to project.version)
        }
    }
}
```

**settings.gradle.kts:**
```kotlin
rootProject.name = "MyPlugin"
```

**gradle.properties:**
```properties
# Gradle daemon settings (faster builds)
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true

# JVM settings (increase memory for large projects)
org.gradle.jvmargs=-Xmx2G -XX:+UseParallelGC
```

### 3.2 Plugin Configuration

Gradle uses plugins for functionality (Java compilation, JAR creation, dependency management).

**Core plugins:**
```kotlin
plugins {
    java                           // Java compilation
    `maven-publish`                // Publishing to repositories
    id("com.github.johnrengelman.shadow") version "8.1.1"  // Shade plugin
}
```

**Plugin versions:**
- `java` — Built-in, no version needed
- `maven-publish` — Built-in
- `shadow` — External, requires version

**Finding plugin versions:** [Gradle Plugin Portal](https://plugins.gradle.org/)

**Alternative shadow plugin configuration:**
```kotlin
// In settings.gradle.kts
pluginManagement {
    repositories {
        gradlePluginPortal()
    }
}

// In build.gradle.kts
plugins {
    id("com.github.johnrengelman.shadow") version "8.1.1"
}
```

### 3.3 The Shadow Plugin

Gradle Shadow Plugin = Maven Shade Plugin equivalent.

**Basic configuration:**
```kotlin
tasks.shadowJar {
    // 1. Output filename
    archiveClassifier.set("")  // MyPlugin-1.0.0.jar (no classifier)
    // archiveClassifier.set("all") → MyPlugin-1.0.0-all.jar
    
    // 2. Relocation
    relocate("com.zaxxer.hikari", "com.rohitraj02953.myplugin.libs.hikari")
    
    // 3. Minimize JAR
    minimize()
    
    // 4. Exclude files
    exclude("META-INF/*.SF")
    exclude("META-INF/*.DSA")
    exclude("META-INF/*.RSA")
}
```

**Advanced configuration:**
```kotlin
tasks.shadowJar {
    archiveBaseName.set("MyPlugin")
    archiveClassifier.set("")
    archiveVersion.set(project.version.toString())
    
    // Relocations
    relocate("com.zaxxer.hikari", "com.rohitraj02953.myplugin.libs.hikari")
    relocate("com.google.gson", "com.rohitraj02953.myplugin.libs.gson")
    relocate("org.sqlite", "com.rohitraj02953.myplugin.libs.sqlite")
    
    // Dependencies to include/exclude
    dependencies {
        include(dependency("com.zaxxer:HikariCP"))
        include(dependency("org.xerial:sqlite-jdbc"))
        exclude(dependency("io.papermc.paper:paper-api"))
    }
    
    // Minimize JAR
    minimize {
        // Exclude specific dependencies from minimization (if they use reflection)
        exclude(dependency("com.zaxxer:HikariCP"))
    }
    
    // Merge service files (for libraries that use ServiceLoader)
    mergeServiceFiles()
}
```

**Make shadowJar the default build output:**
```kotlin
tasks.build {
    dependsOn(tasks.shadowJar)
}

tasks.jar {
    archiveClassifier.set("unshaded") // Rename plain JAR to avoid confusion
}
```

### 3.4 Task Configuration

**Resource processing (plugin.yml version replacement):**
```kotlin
tasks.processResources {
    filesMatching("plugin.yml") {
        expand(
            "version" to project.version,
            "name" to project.name,
            "description" to project.description
        )
    }
}
```

**plugin.yml:**
```yaml
name: ${name}
version: ${version}
description: ${description}
```

**Java compilation options:**
```kotlin
tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.release.set(21)  // Target Java 21
    
    // Enable warnings
    options.compilerArgs.addAll(listOf(
        "-Xlint:deprecation",
        "-Xlint:unchecked"
    ))
}
```

**Testing configuration:**
```kotlin
tasks.test {
    useJUnitPlatform() // Use JUnit 5
    
    testLogging {
        events("passed", "skipped", "failed")
    }
}
```

**Custom task (copy JAR to test server):**
```kotlin
tasks.register<Copy>("deployPlugin") {
    dependsOn(tasks.shadowJar)
    
    from(tasks.shadowJar.get().archiveFile)
    into("C:/TestServer/plugins/")
    
    doLast {
        println("Plugin deployed to test server!")
    }
}
```

Usage: `gradle deployPlugin`

### 3.5 Version Management

**Centralized version management:**
```kotlin
// Option 1: gradle.properties
// version=1.0.0

// Option 2: build.gradle.kts
version = "1.0.0"

// Option 3: Version catalog (Gradle 7.0+)
// gradle/libs.versions.toml
```

**Version catalog (recommended for multi-module projects):**

**gradle/libs.versions.toml:**
```toml
[versions]
paper = "1.21.4-R0.1-SNAPSHOT"
hikari = "5.1.0"
sqlite = "3.45.1.0"
junit = "5.10.2"

[libraries]
paper-api = { group = "io.papermc.paper", name = "paper-api", version.ref = "paper" }
hikaricp = { group = "com.zaxxer", name = "HikariCP", version.ref = "hikari" }
sqlite-jdbc = { group = "org.xerial", name = "sqlite-jdbc", version.ref = "sqlite" }
junit-jupiter = { group = "org.junit.jupiter", name = "junit-jupiter", version.ref = "junit" }

[plugins]
shadow = { id = "com.github.johnrengelman.shadow", version = "8.1.1" }
```

**build.gradle.kts:**
```kotlin
plugins {
    java
    alias(libs.plugins.shadow)
}

dependencies {
    compileOnly(libs.paper.api)
    implementation(libs.hikaricp)
    implementation(libs.sqlite.jdbc)
    testImplementation(libs.junit.jupiter)
}
```

**Benefits:**
- Single source of truth for versions
- IDE autocomplete for dependency names
- Easy to update versions across all modules

---

## 4. Dependency Scope Reference

### 4.1 Complete Scope/Configuration Table

| Dependency | Maven Scope | Gradle Config | Shaded? | Relocated? | Reason |
|------------|-------------|---------------|---------|------------|--------|
| **Paper API** | `provided` | `compileOnly` | ❌ No | N/A | Server provides this at runtime |
| **Spigot API** | `provided` | `compileOnly` | ❌ No | N/A | Server provides this at runtime |
| **Adventure API** | `provided` | `compileOnly` | ❌ No | N/A | Bundled with Paper 1.19+ |
| **MiniMessage** | `provided` | `compileOnly` | ❌ No | N/A | Part of Adventure, bundled with Paper |
| **SLF4J API** | `provided` | `compileOnly` | ❌ No | N/A | Server provides logging facade |
| **Log4j** | `provided` | `compileOnly` | ❌ No | N/A | Server logging implementation |
| **Vault API** | `provided` | `compileOnly` | ❌ No | N/A | Vault plugin provides at runtime |
| **PlaceholderAPI** | `provided` | `compileOnly` | ❌ No | N/A | PAPI plugin provides at runtime |
| **LuckPerms API** | `provided` | `compileOnly` | ❌ No | N/A | LuckPerms plugin provides at runtime |
| **Citizens API** | `provided` | `compileOnly` | ❌ No | N/A | Citizens plugin provides at runtime |
| **WorldGuard API** | `provided` | `compileOnly` | ❌ No | N/A | WorldGuard plugin provides at runtime |
| **HikariCP** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Database pooling library, not in server |
| **SQLite JDBC** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Database driver, not in server |
| **MySQL Connector/J** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Database driver, not in server |
| **PostgreSQL JDBC** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Database driver, not in server |
| **MariaDB JDBC** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Database driver, not in server |
| **H2 Database** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Embedded database, not in server |
| **Gson** | `compile` | `implementation` | ⚠️ Maybe | ⚠️ Maybe | Server has 2.8.9. If you need 2.10+, shade + relocate |
| **Guava** | `compile` | `implementation` | ⚠️ Maybe | ⚠️ Maybe | Paper bundles Guava. Check version conflicts |
| **Apache Commons Lang** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Utility library, version conflicts common |
| **Apache Commons IO** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Utility library, version conflicts common |
| **FastUtil** | `compile` | `implementation` | ✅ Yes | ✅ Yes | High-performance collections |
| **Caffeine** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Caching library, not in server |
| **Jedis** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Redis client, not in server |
| **Lettuce** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Async Redis client, not in server |
| **Netty** | `provided` | `compileOnly` | ❌ No | N/A | Paper bundles Netty for networking |
| **OkHttp** | `compile` | `implementation` | ✅ Yes | ✅ Yes | HTTP client, not in server |
| **Retrofit** | `compile` | `implementation` | ✅ Yes | ✅ Yes | REST client, not in server |
| **Jackson** | `compile` | `implementation` | ✅ Yes | ✅ Yes | JSON/XML library, not in server |
| **SnakeYAML** | `provided` | `compileOnly` | ❌ No | N/A | Paper uses SnakeYAML for configs |
| **Configurate** | `compile` | `implementation` | ✅ Yes | ✅ Yes | Advanced config library |
| **JUnit 5** | `test` | `testImplementation` | ❌ No | N/A | Testing framework |
| **Mockito** | `test` | `testImplementation` | ❌ No | N/A | Mocking framework |
| **MockBukkit** | `test` | `testImplementation` | ❌ No | N/A | Bukkit testing framework |
| **AssertJ** | `test` | `testImplementation` | ❌ No | N/A | Fluent assertions library |

### 4.2 Shading Decision Tree

```
Does the server provide this dependency?
├─ YES → Use provided/compileOnly, DO NOT shade
│         Examples: Paper API, Adventure, SLF4J
│
└─ NO → Will other plugins use the same library?
    ├─ YES → Shade + relocate (to avoid conflicts)
    │         Examples: HikariCP, Gson, Apache Commons
    │
    └─ NO → Shade without relocation (optional)
              Examples: SQLite JDBC (if only you use it)
```

**Additional considerations:**

**Shade if:**
1. Library is not provided by server
2. Library is not a plugin dependency (Vault, PAPI)
3. Your plugin requires specific version
4. Library is small (<500 KB)

**Don't shade if:**
1. Server provides it (always conflicts)
2. It's a plugin API (soft dependency)
3. Library is massive (>10 MB) — reconsider architecture
4. You want to share library with other plugins (use plugin dependency instead)

### 4.3 Relocation Strategy

**When to relocate:**

| Library | Relocate? | Reason |
|---------|-----------|--------|
| HikariCP | ✅ Always | High conflict risk, version-sensitive |
| Gson | ⚠️ If > 2.8.9 | Server bundles 2.8.9, newer versions incompatible |
| Guava | ⚠️ If conflicts | Paper bundles it, but some methods differ |
| Apache Commons | ✅ Always | Very common, high conflict risk |
| FastUtil | ✅ Always | Common in performance plugins |
| Caffeine | ✅ Always | Caching library, version-sensitive |
| JDBC drivers | ✅ Recommended | Different drivers may conflict |
| OkHttp | ✅ Always | Network library, version-sensitive |

**Relocation pattern:**

Original package: `com.zaxxer.hikari`  
Relocated package: `{your.package}.libs.hikari`

**Maven example:**
```xml
<relocation>
    <pattern>com.zaxxer.hikari</pattern>
    <shadedPattern>com.rohitraj02953.myplugin.libs.hikari</shadedPattern>
</relocation>
```

**Gradle example:**
```kotlin
relocate("com.zaxxer.hikari", "com.rohitraj02953.myplugin.libs.hikari")
```

**Multiple libraries relocation:**
```kotlin
// HikariCP
relocate("com.zaxxer.hikari", "com.rohitraj02953.myplugin.libs.hikari")

// Gson
relocate("com.google.gson", "com.rohitraj02953.myplugin.libs.gson")

// Apache Commons Lang
relocate("org.apache.commons.lang3", "com.rohitraj02953.myplugin.libs.commons.lang3")

// Caffeine
relocate("com.github.benmanes.caffeine", "com.rohitraj02953.myplugin.libs.caffeine")

// OkHttp
relocate("okhttp3", "com.rohitraj02953.myplugin.libs.okhttp3")
relocate("okio", "com.rohitraj02953.myplugin.libs.okio")
```

**Wildcard relocation (relocate entire library):**
```kotlin
relocate("org.apache.commons", "com.rohitraj02953.myplugin.libs.commons")
```

This relocates all Apache Commons packages:
- `org.apache.commons.lang3` → `com.rohitraj02953.myplugin.libs.commons.lang3`
- `org.apache.commons.io` → `com.rohitraj02953.myplugin.libs.commons.io`

---

## 5. Build Output Verification

### 5.1 Maven Lifecycle

Maven has 8 lifecycle phases. Only 4 matter for plugin development:

| Phase | Command | What Happens | Output |
|-------|---------|-------------|--------|
| **compile** | `mvn compile` | Compiles Java source files | `target/classes/` |
| **test** | `mvn test` | Runs unit tests (JUnit) | Test reports in `target/surefire-reports/` |
| **package** | `mvn package` | Creates JAR file (with shade if configured) | `target/MyPlugin-1.0.0.jar` |
| **install** | `mvn install` | Installs JAR to local Maven repo | `~/.m2/repository/` |

**Full lifecycle order:**
1. `validate` — Validates POM structure
2. `compile` — Compiles `.java` → `.class`
3. `test` — Runs unit tests
4. `package` — Creates JAR (shade plugin runs here)
5. `verify` — Runs integration tests
6. `install` — Copies JAR to `~/.m2/repository/`
7. `deploy` — Uploads JAR to remote repository

**Critical commands:**

```bash
# Clean previous builds
mvn clean

# Compile only (fast check for syntax errors)
mvn clean compile

# Full build with tests
mvn clean package

# Build without tests (faster)
mvn clean package -DskipTests

# Install to local repository (for multi-module projects)
mvn clean install

# Run specific profile
mvn clean package -P production
```

**Output files:**
```
target/
├── classes/                          ← Compiled .class files
├── generated-sources/                ← Auto-generated code
├── maven-archiver/                   ← JAR metadata
├── maven-status/                     ← Build status
├── surefire-reports/                 ← Test results
├── MyPlugin-1.0.0.jar                ← Final JAR (shaded)
├── original-MyPlugin-1.0.0.jar       ← Unshaded JAR (if shade plugin used)
└── dependency-reduced-pom.xml        ← Shade plugin artifact (ignore)
```

**Which JAR to distribute?**
- **With shade plugin:** `MyPlugin-1.0.0.jar` (already shaded)
- **Without shade plugin:** `MyPlugin-1.0.0.jar` (missing dependencies, will crash!)

**Verify shaded JAR:**
```bash
jar tf target/MyPlugin-1.0.0.jar | grep hikari
# Should show: com/rohitraj02953/myplugin/libs/hikari/...
```

### 5.2 Gradle Tasks

Gradle tasks are modular. Run `gradle tasks` to see all available tasks.

| Task | What Happens | Output |
|------|-------------|--------|
| **compileJava** | Compiles Java source | `build/classes/java/main/` |
| **processResources** | Copies resources (with filtering) | `build/resources/main/` |
| **classes** | Compiles + processes resources | Both above |
| **jar** | Creates unshaded JAR | `build/libs/MyPlugin-1.0.0.jar` |
| **shadowJar** | Creates shaded JAR | `build/libs/MyPlugin-1.0.0.jar` (or `-all.jar`) |
| **build** | Full build (compiles, tests, creates JARs) | All outputs |
| **clean** | Deletes `build/` directory | — |
| **test** | Runs unit tests | Test reports in `build/reports/` |

**Critical commands:**

```bash
# Clean previous builds
./gradlew clean

# Compile only
./gradlew compileJava

# Full build with tests
./gradlew clean build

# Build without tests
./gradlew clean build -x test

# Create shaded JAR
./gradlew shadowJar

# Run specific task
./gradlew deployPlugin
```

**Output files:**
```
build/
├── classes/java/main/                ← Compiled .class files
├── resources/main/                   ← Processed resources
├── libs/
│   ├── MyPlugin-1.0.0.jar            ← Shaded JAR (if configured)
│   └── MyPlugin-1.0.0-unshaded.jar   ← Plain JAR (if renamed)
├── reports/
│   └── tests/                        ← Test results (HTML reports)
└── tmp/                              ← Temporary build files
```

**Which JAR to distribute?**

If you configured `archiveClassifier.set("")`:
- **Distribute:** `build/libs/MyPlugin-1.0.0.jar` (shaded)

If you didn't configure classifier:
- **Distribute:** `build/libs/MyPlugin-1.0.0-all.jar` (shaded)
- **Don't distribute:** `build/libs/MyPlugin-1.0.0.jar` (unshaded, missing dependencies!)

**Verify shaded JAR:**
```bash
jar tf build/libs/MyPlugin-1.0.0.jar | grep hikari
# Should show: com/rohitraj02953/myplugin/libs/hikari/...
```

### 5.3 JAR Structure Verification

**Correct JAR structure:**
```
MyPlugin-1.0.0.jar (150 KB - 2 MB typical)
├── plugin.yml                        ← MUST be at root level
├── config.yml                        ← Optional config
├── com/
│   └── rohitraj02953/
│       └── myplugin/
│           ├── MyPlugin.class
│           ├── commands/
│           │   └── TPACommand.class
│           ├── listeners/
│           │   └── JoinListener.class
│           ├── libs/                 ← Shaded dependencies
│           │   ├── hikari/
│           │   │   └── HikariDataSource.class
│           │   └── sqlite/
│           │       └── JDBC.class
│           └── utils/
│               └── ConfigManager.class
└── META-INF/
    └── MANIFEST.MF
```

**Incorrect JAR structures:**

**❌ Missing plugin.yml:**
```
MyPlugin-1.0.0.jar
├── resources/
│   └── plugin.yml  ← WRONG: Should be at root, not in resources/
└── com/...
```

**Server error:**
```
[ERROR] Could not load 'plugins/MyPlugin-1.0.0.jar' in folder 'plugins'
org.bukkit.plugin.InvalidDescriptionException: Invalid plugin.yml
```

**Fix:** Ensure `plugin.yml` is in `src/main/resources/plugin.yml` (not in subdirectory).

**❌ Paper API shaded (JAR bloat):**
```
MyPlugin-1.0.0.jar (52.4 MB) ← WAY TOO BIG
├── plugin.yml
├── com/rohitraj02953/myplugin/...
├── org/bukkit/                       ← WRONG: Paper API shaded
│   └── Bukkit.class
├── io/papermc/                       ← WRONG: Paper API shaded
│   └── paper/...
└── net/kyori/                        ← WRONG: Adventure API shaded
    └── adventure/...
```

**Server error:**
```
[ERROR] Plugin MyPlugin contains duplicate class: org.bukkit.Bukkit
[ERROR] This may cause conflicts. Disabling plugin.
```

**Fix:** Set Paper API scope to `provided` (Maven) or `compileOnly` (Gradle).

**❌ Dependencies not relocated:**
```
MyPlugin-1.0.0.jar
├── plugin.yml
├── com/rohitraj02953/myplugin/...
└── com/zaxxer/hikari/                ← WRONG: Not relocated
    └── HikariDataSource.class
```

**Runtime error (if another plugin has different HikariCP version):**
```
java.lang.NoSuchMethodError: com.zaxxer.hikari.HikariDataSource.setIdleTimeout(J)V
```

**Fix:** Add relocation configuration to shade plugin.

**Tools to inspect JAR:**

```bash
# List all files in JAR
jar tf MyPlugin-1.0.0.jar

# List only .class files
jar tf MyPlugin-1.0.0.jar | grep '\.class$'

# Extract JAR to inspect
unzip MyPlugin-1.0.0.jar -d extracted/

# Check JAR size
ls -lh MyPlugin-1.0.0.jar
```

**Expected JAR sizes:**

| Plugin Type | Size Range | Reason |
|-------------|------------|--------|
| Simple plugin (no dependencies) | 10-50 KB | Just your code + plugin.yml |
| Plugin with shaded libraries | 200 KB - 2 MB | Your code + HikariCP, Gson, etc. |
| Plugin with database drivers | 2-5 MB | SQLite JDBC is ~7 MB |
| Plugin with large frameworks | 5-15 MB | Hibernate, Spring, etc. |
| **⚠️ Over 20 MB** | **❌ Problem** | Likely shading server APIs (Paper, Adventure) |

### 5.4 Common Output Mistakes

#### Mistake #1: Distributing Unshaded JAR

**Symptom:**
```
[ERROR] Could not load plugin MyPlugin
java.lang.NoClassDefFoundError: com/zaxxer/hikari/HikariDataSource
```

**Cause:** Distributed `MyPlugin-1.0.0.jar` instead of `MyPlugin-1.0.0-all.jar` (Gradle without classifier config).

**Fix (Gradle):**
```kotlin
tasks.shadowJar {
    archiveClassifier.set("") // Output: MyPlugin-1.0.0.jar (shaded)
}

tasks.jar {
    archiveClassifier.set("unshaded") // Output: MyPlugin-1.0.0-unshaded.jar
}
```

#### Mistake #2: Running Wrong Maven Phase

**Wrong:**
```bash
mvn compile  # Only compiles, doesn't create JAR
```

**Server:** No JAR file to load.

**Correct:**
```bash
mvn package  # Creates JAR in target/
```

#### Mistake #3: Forgetting to Clean

**Symptom:** Old code still runs after making changes.

**Cause:** Maven/Gradle uses cached classes from previous build.

**Fix:**
```bash
mvn clean package     # Maven
./gradlew clean build # Gradle
```

#### Mistake #4: Test Failures Block Build

**Symptom:**
```
[ERROR] Tests run: 5, Failures: 1, Errors: 0, Skipped: 0
[ERROR] BUILD FAILURE
```

**Temporary fix (skip tests):**
```bash
mvn package -DskipTests        # Maven
./gradlew build -x test        # Gradle
```

**Permanent fix:** Fix the failing test!

#### Mistake #5: Wrong JAR in Multi-Module Project

**Project structure:**
```
MyPlugin/
├── myplugin-api/
│   └── target/myplugin-api-1.0.0.jar      ← API only
├── myplugin-core/
│   └── target/myplugin-core-1.0.0.jar     ← Core logic
└── myplugin-bukkit/
    └── target/myplugin-bukkit-1.0.0.jar   ← ✅ Distribute this one
```

**Mistake:** Uploading `myplugin-core-1.0.0.jar` instead of `myplugin-bukkit-1.0.0.jar`.

**Server error:**
```
[ERROR] Invalid plugin.yml (not found)
```

**Fix:** Always distribute the final artifact (usually the Bukkit/Paper module).

---

## 6. Version Management

### 6.1 Java Version Targeting

| Java Version | Release Date | Minecraft Support | Paper Support | Status | Use Case |
|--------------|------------|-------------------|---------------|--------|----------|
| **Java 8** | 2014 | 1.12.2 and earlier | Legacy only | ⚠️ Deprecated | Legacy servers only |
| **Java 11** | 2018 (LTS) | 1.16.5 - 1.17.1 | Supported | ⚠️ Legacy | Older servers (1.16-1.17) |
| **Java 17** | 2021 (LTS) | 1.18 - 1.20.4 | Recommended | ✅ Current LTS | Production servers (1.18-1.20.4) |
| **Java 21** | 2023 (LTS) | 1.20.6+ | Required for 1.21+ | ✅ Latest LTS | Modern servers (1.21+) |

**LTS = Long Term Support** (Oracle provides updates for 8+ years)

**Maven configuration:**
```xml
<properties>
    <!-- Java 21 -->
    <maven.compiler.source>21</maven.compiler.source>
    <maven.compiler.target>21</maven.compiler.target>
    <maven.compiler.release>21</maven.compiler.release>
</properties>
```

**Gradle configuration:**
```kotlin
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}
```

**Why `release` flag matters:**

Without `release`:
```java
// Your code (built with Java 21 targeting Java 17)
var list = List.of("a", "b"); // List.of() added in Java 9
String text = "Hello";
String repeated = text.repeat(3); // String.repeat() added in Java 11

// Compiles successfully, but uses Java 11+ API while targeting Java 17
```

With `release`:
```xml
<maven.compiler.release>17</maven.compiler.release>
```

Compiler error:
```
[ERROR] String.repeat() requires API level 11 or higher
```

This prevents shipping code that crashes on older Java versions.

### 6.2 Minecraft Version Compatibility

**Paper API versions:**

| Minecraft | Paper API Version | Java Requirement | api-version |
|-----------|-------------------|------------------|-------------|
| 1.16.5 | 1.16.5-R0.1-SNAPSHOT | Java 11+ | "1.16" |
| 1.17.1 | 1.17.1-R0.1-SNAPSHOT | Java 16+ | "1.17" |
| 1.18.2 | 1.18.2-R0.1-SNAPSHOT | Java 17+ | "1.18" |
| 1.19.4 | 1.19.4-R0.1-SNAPSHOT | Java 17+ | "1.19" |
| 1.20.4 | 1.20.4-R0.1-SNAPSHOT | Java 17+ | "1.20" |
| 1.20.6 | 1.20.6-R0.1-SNAPSHOT | Java 21+ | "1.20" |
| 1.21.4 | 1.21.4-R0.1-SNAPSHOT | Java 21+ | "1.21" |

**Dependency configuration:**

```xml
<dependency>
    <groupId>io.papermc.paper</groupId>
    <artifactId>paper-api</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <scope>provided</scope>
</dependency>
```

**Version format explanation:**
- `1.21.4` — Minecraft version
- `R0.1` — Paper revision (increments with API changes)
- `SNAPSHOT` — Development version (not stable release)

**Backward compatibility:**

A plugin compiled for Paper 1.20.4 **may** work on Paper 1.21.4 if:
1. No deprecated APIs were removed
2. No internal behavior changed
3. `api-version` is compatible

**Best practice:** Recompile for each major Minecraft version (1.20 → 1.21).

### 6.3 Semantic Versioning for Plugins

**Format:** `MAJOR.MINOR.PATCH[-prerelease][+build]`

**Examples:**
- `1.0.0` — Initial release
- `1.1.0` — New feature added (backward compatible)
- `1.1.1` — Bug fix
- `2.0.0` — Breaking change (API removed, config format changed)
- `1.2.0-beta.1` — Pre-release version
- `1.0.0+20240115` — Build metadata

**Version bump rules:**

| Change Type | Example | Version Bump |
|-------------|---------|--------------|
| Bug fix | Fixed dupe glitch | `1.0.0` → `1.0.1` |
| New command | Added /tpahere | `1.0.1` → `1.1.0` |
| New feature | Added economy integration | `1.1.0` → `1.2.0` |
| Config format change | Changed YAML structure | `1.2.0` → `2.0.0` |
| Removed API method | Deleted deprecated method | `2.0.0` → `3.0.0` |
| Security patch | Fixed exploit | `1.2.3` → `1.2.4` (or emergency 1.2.3.1) |

**plugin.yml version:**
```yaml
version: ${project.version}  # Replaced during build
```

**Maven:**
```xml
<version>1.2.0</version>
```

**Gradle:**
```kotlin
version = "1.2.0"
```

**Pre-release versions:**

```yaml
version: 1.3.0-beta.1  # Beta 1
version: 1.3.0-beta.2  # Beta 2
version: 1.3.0-rc.1    # Release candidate 1
version: 1.3.0         # Stable release
```

**Build metadata (for CI/CD):**

```yaml
version: 1.2.0+build.456  # Jenkins build #456
version: 1.2.0+20240115   # Built on 2024-01-15
```

### 6.4 api-version in plugin.yml

**Purpose:** Tells Paper which API version your plugin expects.

```yaml
api-version: "1.21"
```

**Behavior:**

| api-version | Paper Version | Result |
|-------------|---------------|--------|
| "1.16" | 1.21.4 | ✅ Loads (legacy mode, some features disabled) |
| "1.21" | 1.21.4 | ✅ Loads (full feature access) |
| "1.21" | 1.20.4 | ⚠️ Warning (plugin expects newer API) |
| Missing | 1.21.4 | ⚠️ Loads with legacy behavior |

**Legacy behavior without api-version:**
- Old material names (`GRASS` instead of `SHORT_GRASS`)
- Old enchantment names
- No access to new API features

**Best practice:**

```yaml
# Target the OLDEST version you support
api-version: "1.16"  # Works on 1.16 - 1.21

# OR target latest for new features
api-version: "1.21"  # Requires 1.21+
```

**Trade-off:**
- Lower `api-version` → Broader compatibility, fewer features
- Higher `api-version` → Narrower compatibility, more features

**Codella's default:**
```yaml
api-version: "1.16"  # Maximum compatibility (1.16+)
```

---

## 7. Advanced Build Techniques

### 7.1 ProGuard/R8 Configuration

**ProGuard** obfuscates and optimizes JAR files (makes reverse engineering harder).

**When to use:**
- Premium plugins (prevent piracy)
- Proprietary algorithms
- Reduce JAR size (advanced optimization)

**When NOT to use:**
- Open-source plugins
- Debugging is critical
- Build time is a concern (ProGuard adds 30-60 seconds)

**Maven configuration:**

```xml
<plugin>
    <groupId>com.github.wvengen</groupId>
    <artifactId>proguard-maven-plugin</artifactId>
    <version>2.6.0</version>
    <executions>
        <execution>
            <phase>package</phase>
            <goals>
                <goal>proguard</goal>
            </goals>
        </execution>
    </executions>
    <configuration>
        <proguardVersion>7.4.2</proguardVersion>
        <injar>${project.build.finalName}.jar</injar>
        <outjar>${project.build.finalName}-obfuscated.jar</outjar>
        
        <libs>
            <lib>${java.home}/jmods/java.base.jmod</lib>
        </libs>
        
        <options>
            <!-- Keep plugin main class -->
            <option>-keep public class com.rohitraj02953.myplugin.MyPlugin {
                public void onEnable();
                public void onDisable();
            }</option>
            
            <!-- Keep command executors -->
            <option>-keep class * implements org.bukkit.command.CommandExecutor {
                public boolean onCommand(...);
            }</option>
            
            <!-- Keep event listeners -->
            <option>-keep class * implements org.bukkit.event.Listener {
                @org.bukkit.event.EventHandler *;
            }</option>
            
            <!-- Optimization settings -->
            <option>-optimizationpasses 3</option>
            <option>-dontobfuscate</option> <!-- Disable obfuscation (optimization only) -->
            
            <!-- Or enable obfuscation -->
            <option>-repackageclasses com.rohitraj02953.myplugin.obf</option>
            <option>-allowaccessmodification</option>
        </options>
    </configuration>
</plugin>
```

**Gradle configuration:**

```kotlin
plugins {
    id("com.github.johnrengelman.shadow") version "8.1.1"
    id("net.nemerosa.versioning") version "3.0.0"
}

// Use ProGuard Gradle plugin
buildscript {
    repositories {
        mavenCentral()
    }
    dependencies {
        classpath("com.guardsquare:proguard-gradle:7.4.2")
    }
}

tasks.register<proguard.gradle.ProGuardTask>("proguard") {
    dependsOn(tasks.shadowJar)
    
    injars(tasks.shadowJar.get().outputs.files)
    outjars("build/libs/${project.name}-${project.version}-obfuscated.jar")
    
    libraryjars("${System.getProperty("java.home")}/jmods/java.base.jmod")
    
    keep("""
        public class com.rohitraj02953.myplugin.MyPlugin {
            public void onEnable();
            public void onDisable();
        }
    """)
    
    optimizationpasses(3)
}
```

### 7.2 Test Server Automation

**Auto-deploy plugin to test server after build:**

**Maven (copy plugin):**
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-antrun-plugin</artifactId>
    <version>3.1.0</version>
    <executions>
        <execution>
            <phase>package</phase>
            <goals>
                <goal>run</goal>
            </goals>
            <configuration>
                <target>
                    <copy file="${project.build.directory}/${project.build.finalName}.jar"
                          tofile="C:/TestServer/plugins/${project.name}.jar"
                          overwrite="true"/>
                </target>
            </configuration>
        </execution>
    </executions>
</plugin>
```

**Gradle (custom task):**
```kotlin
tasks.register<Copy>("deployPlugin") {
    dependsOn(tasks.shadowJar)
    
    from(tasks.shadowJar.get().archiveFile)
    into("C:/TestServer/plugins/")
    
    doLast {
        println("✅ Plugin deployed to test server!")
    }
}

// Auto-deploy after build
tasks.build {
    finalizedBy(tasks.named("deployPlugin"))
}
```

**Usage:**
```bash
mvn clean package        # Auto-copies to test server
./gradlew build          # Auto-copies to test server
./gradlew deployPlugin   # Manual deploy
```

**Advanced: Restart server after deploy (Linux/Mac):**
```kotlin
tasks.register<Exec>("restartServer") {
    dependsOn(tasks.named("deployPlugin"))
    
    workingDir = file("/home/minecraft/server/")
    commandLine("./restart.sh")
    
    doLast {
        println("✅ Server restarted!")
    }
}
```

### 7.3 CI/CD Integration

**GitHub Actions (build on commit):**

**.github/workflows/build.yml:**
```yaml
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
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'maven'  # or 'gradle'
      
      - name: Build with Maven
        run: mvn clean package -DskipTests
      
      # OR build with Gradle
      # - name: Build with Gradle
      #   run: ./gradlew clean build -x test
      
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: MyPlugin-JAR
          path: target/*.jar  # or build/libs/*.jar
```

**Jenkins (declarative pipeline):**

**Jenkinsfile:**
```groovy
pipeline {
    agent any
    
    tools {
        maven 'Maven 3.9.6'
        jdk 'JDK 21'
    }
    
    stages {
        stage('Checkout') {
            steps {
                git 'https://github.com/rohitraj02953/myplugin.git'
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
        success {
            echo 'Build successful!'
        }
        failure {
            echo 'Build failed!'
        }
    }
}
```

### 7.4 Matrix Builds

**Build for multiple Minecraft versions:**

**GitHub Actions:**
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        minecraft: ['1.20.4', '1.21.4']
        java: ['17', '21']
        exclude:
          - minecraft: '1.20.4'
            java: '21'  # 1.20.4 doesn't need Java 21
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up JDK ${{ matrix.java }}
        uses: actions/setup-java@v4
        with:
          java-version: ${{ matrix.java }}
          distribution: 'temurin'
      
      - name: Build for MC ${{ matrix.minecraft }}
        run: |
          mvn clean package \
            -Dpaper.version=${{ matrix.minecraft }}-R0.1-SNAPSHOT \
            -Dmaven.compiler.release=${{ matrix.java }}
      
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: MyPlugin-MC${{ matrix.minecraft }}-Java${{ matrix.java }}
          path: target/*.jar
```

**Maven profiles for multi-version:**
```xml
<profiles>
    <profile>
        <id>mc-1.20.4</id>
        <properties>
            <paper.version>1.20.4-R0.1-SNAPSHOT</paper.version>
            <java.version>17</java.version>
        </properties>
    </profile>
    
    <profile>
        <id>mc-1.21.4</id>
        <activation>
            <activeByDefault>true</activeByDefault>
        </activation>
        <properties>
            <paper.version>1.21.4-R0.1-SNAPSHOT</paper.version>
            <java.version>21</java.version>
        </properties>
    </profile>
</profiles>
```

Build commands:
```bash
mvn clean package -P mc-1.20.4  # Build for 1.20.4
mvn clean package -P mc-1.21.4  # Build for 1.21.4
```

---

## 8. Migration Guide

### 8.1 Maven → Gradle Conversion

**Step 1: Analyze existing pom.xml**

Extract:
1. Group ID, artifact ID, version
2. Java version
3. Dependencies (groupId, artifactId, version, scope)
4. Shade plugin configuration (relocations, filters)
5. Repository URLs

**Step 2: Create build.gradle.kts**

**Before (pom.xml):**
```xml
<project>
    <groupId>com.rohitraj02953</groupId>
    <artifactId>myplugin</artifactId>
    <version>1.0.0</version>
    
    <properties>
        <maven.compiler.release>21</maven.compiler.release>
        <paper.version>1.21.4-R0.1-SNAPSHOT</paper.version>
    </properties>
    
    <repositories>
        <repository>
            <id>papermc</id>
            <url>https://repo.papermc.io/repository/maven-public/</url>
        </repository>
    </repositories>
    
    <dependencies>
        <dependency>
            <groupId>io.papermc.paper</groupId>
            <artifactId>paper-api</artifactId>
            <version>${paper.version}</version>
            <scope>provided</scope>
        </dependency>
        <dependency>
            <groupId>com.zaxxer</groupId>
            <artifactId>HikariCP</artifactId>
            <version>5.1.0</version>
            <scope>compile</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <configuration>
                    <relocations>
                        <relocation>
                            <pattern>com.zaxxer.hikari</pattern>
                            <shadedPattern>com.rohitraj02953.myplugin.libs.hikari</shadedPattern>
                        </relocation>
                    </relocations>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

**After (build.gradle.kts):**
```kotlin
plugins {
    java
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

group = "com.rohitraj02953"
version = "1.0.0"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
    implementation("com.zaxxer:HikariCP:5.1.0")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

tasks.shadowJar {
    archiveClassifier.set("")
    
    relocate("com.zaxxer.hikari", "com.rohitraj02953.myplugin.libs.hikari")
    
    minimize()
}

tasks.build {
    dependsOn(tasks.shadowJar)
}

tasks.processResources {
    filesMatching("plugin.yml") {
        expand("version" to project.version)
    }
}
```

**Step 3: Create settings.gradle.kts**

```kotlin
rootProject.name = "MyPlugin"
```

**Step 4: Create gradle.properties**

```properties
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true
```

**Step 5: Test build**

```bash
./gradlew clean build
```

**Step 6: Verify output**

```bash
ls -lh build/libs/
# Should show: MyPlugin-1.0.0.jar (shaded)
```

**Step 7: Delete Maven files (after verification)**

```bash
rm pom.xml
rm -rf target/
```

**Scope conversion table:**

| Maven | Gradle |
|-------|--------|
| `provided` | `compileOnly` |
| `compile` | `implementation` |
| `runtime` | `runtimeOnly` |
| `test` | `testImplementation` |

### 8.2 Gradle → Maven Conversion

**Step 1: Analyze build.gradle.kts**

Extract same information as above.

**Step 2: Create pom.xml**

Use structure from Section 2.1 and populate with extracted data.

**Step 3: Test build**

```bash
mvn clean package
```

**Step 4: Delete Gradle files (after verification)**

```bash
rm build.gradle.kts settings.gradle.kts gradle.properties
rm -rf build/ .gradle/
rm gradlew gradlew.bat
rm -rf gradle/
```

### 8.3 Common Pitfalls

**Pitfall #1: Forgetting to change scope/configuration**

❌ **Wrong:**
```kotlin
// Gradle: Using 'provided' (doesn't exist!)
compileOnly("com.zaxxer:HikariCP:5.1.0") // Should be implementation
```

✅ **Correct:**
```kotlin
compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
implementation("com.zaxxer:HikariCP:5.1.0")
```

**Pitfall #2: Forgetting shadowJar configuration**

❌ **Wrong (Gradle):**
```kotlin
tasks.jar {
    // No shadow plugin, no shaded dependencies!
}
```

✅ **Correct:**
```kotlin
tasks.shadowJar {
    archiveClassifier.set("")
    relocate("com.zaxxer.hikari", "...")
}
```

**Pitfall #3: Not updating CI/CD**

After migration, update:
- GitHub Actions (`.github/workflows/*.yml`)
- Jenkins (`Jenkinsfile`)
- GitLab CI (`.gitlab-ci.yml`)

**Pitfall #4: Different output directory**

| Build Tool | Output Directory |
|------------|-----------------|
| Maven | `target/` |
| Gradle | `build/libs/` |

Update deployment scripts accordingly.

---

## 9. AI Build System Mistakes

### 9.1 Maven Mistakes (7 Common)

#### Mistake #1: Paper API Without `provided` Scope

**AI-generated (WRONG):**
```xml
<dependency>
    <groupId>io.papermc.paper</groupId>
    <artifactId>paper-api</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <!-- Missing scope! Defaults to compile -->
</dependency>
```

**What goes wrong:**
- JAR size: 52.4 MB (includes all of Paper API)
- Server error: `Duplicate class: org.bukkit.Bukkit`
- Plugin disabled at startup

**The fix:**
```xml
<dependency>
    <groupId>io.papermc.paper</groupId>
    <artifactId>paper-api</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <scope>provided</scope> <!-- CRITICAL -->
</dependency>
```

**Prevention:**
> "Add Paper API as a **provided** dependency"

#### Mistake #2: No Shade Plugin

**AI-generated (WRONG):**
```xml
<dependencies>
    <dependency>
        <groupId>com.zaxxer</groupId>
        <artifactId>HikariCP</artifactId>
        <version>5.1.0</version>
    </dependency>
</dependencies>

<!-- No shade plugin configured! -->
```

**What goes wrong:**
```
java.lang.NoClassDefFoundError: com/zaxxer/hikari/HikariDataSource
```

**The fix:**
```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-shade-plugin</artifactId>
            <version>3.6.0</version>
            <executions>
                <execution>
                    <phase>package</phase>
                    <goals>
                        <goal>shade</goal>
                    </goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

**Prevention:**
> "Add Maven Shade Plugin to bundle HikariCP into the JAR"

#### Mistake #3: Shading Paper API

**AI-generated (WRONG):**
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-shade-plugin</artifactId>
    <configuration>
        <artifactSet>
            <includes>
                <include>*:*</include> <!-- Includes EVERYTHING! -->
            </includes>
        </artifactSet>
    </configuration>
</plugin>
```

**What goes wrong:**
- JAR size: 50+ MB
- Class conflicts with server
- Plugin disabled

**The fix:**
```xml
<configuration>
    <artifactSet>
        <includes>
            <include>com.zaxxer:HikariCP</include>
            <include>org.xerial:sqlite-jdbc</include>
        </includes>
        <excludes>
            <exclude>io.papermc.paper:paper-api</exclude>
            <exclude>net.kyori:*</exclude>
        </excludes>
    </artifactSet>
</configuration>
```

**Prevention:**
> "Shade only HikariCP and SQLite JDBC. Exclude Paper API and Adventure"

#### Mistake #4: Missing Repository

**AI-generated (WRONG):**
```xml
<dependencies>
    <dependency>
        <groupId>io.papermc.paper</groupId>
        <artifactId>paper-api</artifactId>
        <version>1.21.4-R0.1-SNAPSHOT</version>
    </dependency>
</dependencies>

<!-- No repository configured! -->
```

**Build error:**
```
[ERROR] Could not find artifact io.papermc.paper:paper-api:jar:1.21.4-R0.1-SNAPSHOT
```

**The fix:**
```xml
<repositories>
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>
</repositories>
```

**Prevention:**
> "Add Paper repository: https://repo.papermc.io/repository/maven-public/"

#### Mistake #5: Hardcoded Version in plugin.yml

**AI-generated (WRONG):**

**plugin.yml:**
```yaml
version: "1.0.0"  # Hardcoded, never updates!
```

**pom.xml:**
```xml
<version>1.2.0</version>
```

**Result:** plugin.yml still shows 1.0.0 even after version bump.

**The fix:**

**plugin.yml:**
```yaml
version: ${project.version}
```

**pom.xml:**
```xml
<build>
    <resources>
        <resource>
            <directory>src/main/resources</directory>
            <filtering>true</filtering>
        </resource>
    </resources>
</build>
```

**Prevention:**
> "Use `${project.version}` in plugin.yml and enable resource filtering"

#### Mistake #6: plugin.yml in Wrong Folder

**AI-generated (WRONG):**
```
src/
└── main/
    └── java/
        └── com/rohitraj02953/myplugin/
            ├── MyPlugin.java
            └── plugin.yml  ← WRONG LOCATION
```

**Server error:**
```
[ERROR] Invalid plugin.yml (not found)
```

**The fix:**
```
src/
└── main/
    ├── java/
    │   └── com/rohitraj02953/myplugin/
    │       └── MyPlugin.java
    └── resources/
        └── plugin.yml  ← CORRECT LOCATION
```

**Prevention:**
> "Create plugin.yml in `src/main/resources/` (not in java folder)"

#### Mistake #7: Not Relocating Shaded Dependencies

**AI-generated (WRONG):**
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-shade-plugin</artifactId>
    <!-- No relocations configured -->
</plugin>
```

**What goes wrong:**
- Another plugin uses HikariCP 4.0.3
- Your plugin uses HikariCP 5.1.0
- Server loads 4.0.3 (first loaded)
- Your plugin crashes: `NoSuchMethodError`

**The fix:**
```xml
<configuration>
    <relocations>
        <relocation>
            <pattern>com.zaxxer.hikari</pattern>
            <shadedPattern>com.rohitraj02953.myplugin.libs.hikari</shadedPattern>
        </relocation>
    </relocations>
</configuration>
```

**Prevention:**
> "Relocate HikariCP to `com.rohitraj02953.myplugin.libs.hikari` to avoid conflicts"

### 9.2 Gradle Mistakes (7 Common)

#### Mistake #1: `implementation` for Paper API

**AI-generated (WRONG):**
```kotlin
dependencies {
    implementation("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
}
```

**What goes wrong:** Same as Maven (JAR bloat, class conflicts).

**The fix:**
```kotlin
dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
}
```

**Prevention:**
> "Use `compileOnly` for Paper API, not `implementation`"

#### Mistake #2: No Shadow Plugin Applied

**AI-generated (WRONG):**
```kotlin
plugins {
    java
    // No shadow plugin!
}

dependencies {
    implementation("com.zaxxer:HikariCP:5.1.0")
}
```

**What goes wrong:**
```
java.lang.NoClassDefFoundError: com/zaxxer/hikari/HikariDataSource
```

**The fix:**
```kotlin
plugins {
    java
    id("com.github.johnrengelman.shadow") version "8.1.1"
}
```

**Prevention:**
> "Add Shadow plugin: `id(\"com.github.johnrengelman.shadow\") version \"8.1.1\"`"

#### Mistake #3: Distributing Wrong JAR

**AI-generated (WRONG):**
```kotlin
// No shadowJar configuration
// Builds both jar and shadowJar with different names
```

**Output:**
```
build/libs/
├── MyPlugin-1.0.0.jar       ← Unshaded, missing dependencies
└── MyPlugin-1.0.0-all.jar   ← Shaded, correct
```

**Mistake:** Uploading `MyPlugin-1.0.0.jar` instead of `-all.jar`.

**The fix:**
```kotlin
tasks.shadowJar {
    archiveClassifier.set("") // Output: MyPlugin-1.0.0.jar (shaded)
}

tasks.jar {
    archiveClassifier.set("unshaded") // Output: MyPlugin-1.0.0-unshaded.jar
}
```

**Prevention:**
> "Set `archiveClassifier.set(\"\")` in shadowJar task to make it the default output"

#### Mistake #4: Kotlin DSL Syntax Errors

**AI-generated (WRONG):**
```kotlin
// Using Groovy syntax in .kts file
dependencies {
    compileOnly 'io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT' // Groovy syntax!
}
```

**Build error:**
```
Unresolved reference: compileOnly
```

**The fix:**
```kotlin
dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT") // Kotlin syntax
}
```

**Prevention:**
> "Use Kotlin DSL syntax: `compileOnly(\"...\")` not `compileOnly '...'`"

#### Mistake #5: Version in Multiple Places

**AI-generated (WRONG):**

**build.gradle.kts:**
```kotlin
version = "1.0.0"
```

**plugin.yml:**
```yaml
version: "1.0.0"  # Hardcoded again
```

**Result:** Inconsistent versions.

**The fix:**

**build.gradle.kts:**
```kotlin
version = "1.0.0"

tasks.processResources {
    filesMatching("plugin.yml") {
        expand("version" to project.version)
    }
}
```

**plugin.yml:**
```yaml
version: ${version}
```

**Prevention:**
> "Use `${version}` in plugin.yml and configure processResources task"

#### Mistake #6: Missing archiveClassifier Configuration

**AI-generated (WRONG):**
```kotlin
tasks.shadowJar {
    relocate("com.zaxxer.hikari", "...")
    // No archiveClassifier configured
}
```

**Output:**
```
build/libs/
├── MyPlugin-1.0.0.jar       ← Unshaded
└── MyPlugin-1.0.0-all.jar   ← Shaded
```

**Confusing!** Which one to distribute?

**The fix:**
```kotlin
tasks.shadowJar {
    archiveClassifier.set("") // Clear output naming
    relocate("com.zaxxer.hikari", "...")
}
```

**Prevention:**
> "Set `archiveClassifier.set(\"\")` to avoid `-all` suffix"

#### Mistake #7: Not Configuring processResources

**AI-generated (WRONG):**
```kotlin
// No processResources configuration
```

**plugin.yml:**
```yaml
version: ${version}  # Never replaced, stays as ${version}
```

**Server error:**
```
[WARN] Plugin MyPlugin has invalid version: ${version}
```

**The fix:**
```kotlin
tasks.processResources {
    filesMatching("plugin.yml") {
        expand("version" to project.version)
    }
}
```

**Prevention:**
> "Configure processResources task to expand `${version}` placeholder"

### 9.3 Universal Mistakes (5 Common)

#### Mistake #1: Targeting Java 8 but Using Java 11+ APIs

**AI-generated (WRONG):**
```xml
<maven.compiler.release>8</maven.compiler.release>
```

**Code:**
```java
var list = List.of("a", "b"); // List.of() requires Java 9+
```

**Runtime error (on Java 8 server):**
```
java.lang.NoSuchMethodError: java.util.List.of([Ljava/lang/Object;)Ljava/util/List;
```

**The fix:**
1. Use Java 17/21 target (modern servers require it anyway)
2. Or avoid Java 9+ APIs if targeting Java 8

**Prevention:**
> "Target Java 21 for Paper 1.21.4 (or Java 17 for 1.18-1.20.4)"

#### Mistake #2: Depending on NMS/OBC

**AI-generated (WRONG):**
```xml
<dependency>
    <groupId>org.spigotmc</groupId>
    <artifactId>spigot</artifactId> <!-- Full server, includes NMS! -->
    <version>1.21.4-R0.1-SNAPSHOT</version>
</dependency>
```

**Code:**
```java
import net.minecraft.server.v1_21_R1.EntityPlayer; // NMS import
```

**What goes wrong:**
- Breaks every Minecraft update (NMS version changes)
- Extremely fragile code

**The fix:**
1. Use Paper API abstractions
2. If NMS is unavoidable, use reflection + version detection

**Prevention:**
> "Never import `net.minecraft.server.*` or `org.bukkit.craftbukkit.*`. Use Paper API instead"

#### Mistake #3: Wrong Dependency Version

**AI-generated (WRONG):**
```xml
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.8.0</version> <!-- Ancient version -->
</dependency>
```

**Runtime error:**
```
java.lang.NoSuchMethodError: com.google.gson.JsonParser.parseString(Ljava/lang/String;)
```

**The fix:**
```xml
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.10.1</version> <!-- Latest stable -->
</dependency>
```

**Prevention:**
> "Use latest stable versions: check [mvnrepository.com](https://mvnrepository.com/)"

#### Mistake #4: Shading Test Dependencies

**AI-generated (WRONG):**
```xml
<dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter</artifactId>
    <version>5.10.2</version>
    <scope>compile</scope> <!-- WRONG: Should be test -->
</dependency>
```

**What goes wrong:**
- JAR includes JUnit (adds 1+ MB)
- Unnecessary bloat

**The fix:**
```xml
<dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter</artifactId>
    <version>5.10.2</version>
    <scope>test</scope> <!-- Correct -->
</dependency>
```

**Prevention:**
> "Use `test` scope (Maven) or `testImplementation` (Gradle) for testing libraries"

#### Mistake #5: Building with `mvn compile` Instead of `mvn package`

**AI-generated instructions (WRONG):**
```bash
mvn compile  # Only compiles, doesn't create JAR
```

**What goes wrong:**
- No JAR file created
- Nothing to distribute

**The fix:**
```bash
mvn clean package  # Creates JAR in target/
```

**Prevention:**
> "Use `mvn package` to create distributable JAR (not `mvn compile`)"

---

## Appendices

### Appendix A: Complete pom.xml Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <!-- PROJECT METADATA -->
    <groupId>com.rohitraj02953</groupId>
    <artifactId>myplugin</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    
    <name>MyPlugin</name>
    <description>A Paper plugin for Minecraft 1.21.4</description>

    <!-- PROPERTIES -->
    <properties>
        <!-- Java version -->
        <maven.compiler.source>21</maven.compiler.source>
        <maven.compiler.target>21</maven.compiler.target>
        <maven.compiler.release>21</maven.compiler.release>
        
        <!-- Encoding -->
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
        
        <!-- Dependency versions -->
        <paper.version>1.21.4-R0.1-SNAPSHOT</paper.version>
        <hikari.version>5.1.0</hikari.version>
        <sqlite.version>3.45.1.0</sqlite.version>
        <gson.version>2.10.1</gson.version>
        <junit.version>5.10.2</junit.version>
    </properties>

    <!-- REPOSITORIES -->
    <repositories>
        <!-- Paper -->
        <repository>
            <id>papermc</id>
            <url>https://repo.papermc.io/repository/maven-public/</url>
        </repository>
        
        <!-- Maven Central (default) -->
        <repository>
            <id>central</id>
            <url>https://repo.maven.apache.org/maven2</url>
        </repository>
        
        <!-- JitPack (for GitHub dependencies) -->
        <repository>
            <id>jitpack</id>
            <url>https://jitpack.io</url>
        </repository>
        
        <!-- PlaceholderAPI -->
        <repository>
            <id>placeholderapi</id>
            <url>https://repo.extendedclip.com/content/repositories/placeholderapi/</url>
        </repository>
    </repositories>

    <!-- DEPENDENCIES -->
    <dependencies>
        <!-- Paper API (provided by server) -->
        <dependency>
            <groupId>io.papermc.paper</groupId>
            <artifactId>paper-api</artifactId>
            <version>${paper.version}</version>
            <scope>provided</scope>
        </dependency>
        
        <!-- HikariCP (database connection pooling) -->
        <dependency>
            <groupId>com.zaxxer</groupId>
            <artifactId>HikariCP</artifactId>
            <version>${hikari.version}</version>
            <scope>compile</scope>
        </dependency>
        
        <!-- SQLite JDBC driver -->
        <dependency>
            <groupId>org.xerial</groupId>
            <artifactId>sqlite-jdbc</artifactId>
            <version>${sqlite.version}</version>
            <scope>compile</scope>
        </dependency>
        
        <!-- Gson (JSON library) -->
        <dependency>
            <groupId>com.google.code.gson</groupId>
            <artifactId>gson</artifactId>
            <version>${gson.version}</version>
            <scope>compile</scope>
        </dependency>
        
        <!-- Plugin Dependencies (soft dependencies) -->
        <!-- Vault API -->
        <dependency>
            <groupId>com.github.MilkBowl</groupId>
            <artifactId>VaultAPI</artifactId>
            <version>1.7</version>
            <scope>provided</scope>
        </dependency>
        
        <!-- PlaceholderAPI -->
        <dependency>
            <groupId>me.clip</groupId>
            <artifactId>placeholderapi</artifactId>
            <version>2.11.5</version>
            <scope>provided</scope>
        </dependency>
        
        <!-- Test Dependencies -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>${junit.version}</version>
            <scope>test</scope>
        </dependency>
        
        <dependency>
            <groupId>org.mockito</groupId>
            <artifactId>mockito-core</artifactId>
            <version>5.11.0</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <!-- BUILD CONFIGURATION -->
    <build>
        <!-- Final JAR name -->
        <finalName>${project.name}-${project.version}</finalName>
        
        <!-- Default goal (run when you type 'mvn') -->
        <defaultGoal>clean package</defaultGoal>
        
        <!-- PLUGINS -->
        <plugins>
            <!-- Maven Compiler Plugin -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.13.0</version>
                <configuration>
                    <source>21</source>
                    <target>21</target>
                    <release>21</release>
                </configuration>
            </plugin>
            
            <!-- Maven Shade Plugin -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.6.0</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals>
                            <goal>shade</goal>
                        </goals>
                        <configuration>
                            <!-- Don't create dependency-reduced-pom.xml -->
                            <createDependencyReducedPom>false</createDependencyReducedPom>
                            
                            <!-- Dependencies to include -->
                            <artifactSet>
                                <includes>
                                    <include>com.zaxxer:HikariCP</include>
                                    <include>org.xerial:sqlite-jdbc</include>
                                    <include>com.google.code.gson:gson</include>
                                </includes>
                                <excludes>
                                    <!-- Never shade server-provided dependencies -->
                                    <exclude>io.papermc.paper:paper-api</exclude>
                                    <exclude>net.kyori:*</exclude>
                                    <exclude>org.slf4j:*</exclude>
                                </excludes>
                            </artifactSet>
                            
                            <!-- Relocations (prevent conflicts) -->
                            <relocations>
                                <!-- HikariCP -->
                                <relocation>
                                    <pattern>com.zaxxer.hikari</pattern>
                                    <shadedPattern>com.rohitraj02953.myplugin.libs.hikari</shadedPattern>
                                </relocation>
                                
                                <!-- Gson -->
                                <relocation>
                                    <pattern>com.google.gson</pattern>
                                    <shadedPattern>com.rohitraj02953.myplugin.libs.gson</shadedPattern>
                                </relocation>
                                
                                <!-- SQLite JDBC -->
                                <relocation>
                                    <pattern>org.sqlite</pattern>
                                    <shadedPattern>com.rohitraj02953.myplugin.libs.sqlite</shadedPattern>
                                </relocation>
                            </relocations>
                            
                            <!-- Minimize JAR (remove unused classes) -->
                            <minimizeJar>true</minimizeJar>
                            
                            <!-- Filters (exclude signature files) -->
                            <filters>
                                <filter>
                                    <artifact>*:*</artifact>
                                    <excludes>
                                        <exclude>META-INF/*.SF</exclude>
                                        <exclude>META-INF/*.DSA</exclude>
                                        <exclude>META-INF/*.RSA</exclude>
                                    </excludes>
                                </filter>
                            </filters>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
            
            <!-- Maven Surefire Plugin (for testing) -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.2.5</version>
            </plugin>
        </plugins>
        
        <!-- RESOURCES -->
        <resources>
            <!-- Filtered resources (plugin.yml, config.yml) -->
            <resource>
                <directory>src/main/resources</directory>
                <filtering>true</filtering>
                <includes>
                    <include>plugin.yml</include>
                    <include>config.yml</include>
                    <include>**/*.yml</include>
                    <include>**/*.yaml</include>
                    <include>**/*.properties</include>
                </includes>
            </resource>
            
            <!-- Non-filtered resources (binary files) -->
            <resource>
                <directory>src/main/resources</directory>
                <filtering>false</filtering>
                <excludes>
                    <exclude>**/*.yml</exclude>
                    <exclude>**/*.yaml</exclude>
                    <exclude>**/*.properties</exclude>
                </excludes>
            </resource>
        </resources>
    </build>
</project>
```

### Appendix B: Complete build.gradle.kts Template

```kotlin
plugins {
    java
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

group = "com.rohitraj02953"
version = "1.0.0"

repositories {
    mavenCentral()
    
    // Paper
    maven("https://repo.papermc.io/repository/maven-public/")
    
    // JitPack (for GitHub dependencies)
    maven("https://jitpack.io")
    
    // PlaceholderAPI
    maven("https://repo.extendedclip.com/content/repositories/placeholderapi/")
}

dependencies {
    // Paper API (provided by server)
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
    
    // External libraries (shaded)
    implementation("com.zaxxer:HikariCP:5.1.0")
    implementation("org.xerial:sqlite-jdbc:3.45.1.0")
    implementation("com.google.code.gson:gson:2.10.1")
    
    // Plugin dependencies (soft dependencies)
    compileOnly("com.github.MilkBowl:VaultAPI:1.7")
    compileOnly("me.clip:placeholderapi:2.11.5")
    
    // Test dependencies
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testImplementation("org.mockito:mockito-core:5.11.0")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

tasks {
    // Compiler options
    withType<JavaCompile> {
        options.encoding = "UTF-8"
        options.release.set(21)
    }
    
    // Shadow JAR configuration
    shadowJar {
        archiveBaseName.set(project.name)
        archiveClassifier.set("") // No suffix (MyPlugin-1.0.0.jar)
        archiveVersion.set(project.version.toString())
        
        // Relocations (prevent conflicts)
        relocate("com.zaxxer.hikari", "com.rohitraj02953.myplugin.libs.hikari")
        relocate("com.google.gson", "com.rohitraj02953.myplugin.libs.gson")
        relocate("org.sqlite", "com.rohitraj02953.myplugin.libs.sqlite")
        
        // Minimize JAR
        minimize()
        
        // Exclude signature files
        exclude("META-INF/*.SF")
        exclude("META-INF/*.DSA")
        exclude("META-INF/*.RSA")
    }
    
    // Make shadowJar the default build output
    build {
        dependsOn(shadowJar)
    }
    
    // Rename plain JAR to avoid confusion
    jar {
        archiveClassifier.set("unshaded")
    }
    
    // Resource processing (plugin.yml version replacement)
    processResources {
        filesMatching("plugin.yml") {
            expand(
                "version" to project.version,
                "name" to project.name,
                "description" to project.description
            )
        }
    }
    
    // Testing configuration
    test {
        useJUnitPlatform()
        
        testLogging {
            events("passed", "skipped", "failed")
            showStandardStreams = false
        }
    }
}
```

### Appendix C: Dependency Version Matrix

| Dependency | Group ID | Artifact ID | Latest Stable | Maven Scope | Gradle Config |
|------------|----------|-------------|---------------|-------------|---------------|
| **Paper 1.21.4** | io.papermc.paper | paper-api | 1.21.4-R0.1-SNAPSHOT | provided | compileOnly |
| **Paper 1.20.4** | io.papermc.paper | paper-api | 1.20.4-R0.1-SNAPSHOT | provided | compileOnly |
| **Spigot 1.21.4** | org.spigotmc | spigot-api | 1.21.4-R0.1-SNAPSHOT | provided | compileOnly |
| **HikariCP** | com.zaxxer | HikariCP | 5.1.0 | compile | implementation |
| **SQLite JDBC** | org.xerial | sqlite-jdbc | 3.45.1.0 | compile | implementation |
| **MySQL Connector/J** | com.mysql | mysql-connector-j | 8.3.0 | compile | implementation |
| **PostgreSQL JDBC** | org.postgresql | postgresql | 42.7.1 | compile | implementation |
| **MariaDB JDBC** | org.mariadb.jdbc | mariadb-java-client | 3.3.2 | compile | implementation |
| **H2 Database** | com.h2database | h2 | 2.2.224 | compile | implementation |
| **Gson** | com.google.code.gson | gson | 2.10.1 | compile | implementation |
| **Guava** | com.google.guava | guava | 33.0.0-jre | compile | implementation |
| **Apache Commons Lang** | org.apache.commons | commons-lang3 | 3.14.0 | compile | implementation |
| **Apache Commons IO** | commons-io | commons-io | 2.15.1 | compile | implementation |
| **FastUtil** | it.unimi.dsi | fastutil | 8.5.12 | compile | implementation |
| **Caffeine** | com.github.ben-manes.caffeine | caffeine | 3.1.8 | compile | implementation |
| **Jedis** | redis.clients | jedis | 5.1.0 | compile | implementation |
| **Lettuce** | io.lettuce | lettuce-core | 6.3.1.RELEASE | compile | implementation |
| **OkHttp** | com.squareup.okhttp3 | okhttp | 4.12.0 | compile | implementation |
| **Retrofit** | com.squareup.retrofit2 | retrofit | 2.9.0 | compile | implementation |
| **Jackson Core** | com.fasterxml.jackson.core | jackson-core | 2.16.1 | compile | implementation |
| **Jackson Databind** | com.fasterxml.jackson.core | jackson-databind | 2.16.1 | compile | implementation |
| **Configurate (YAML)** | org.spongepowered | configurate-yaml | 4.1.2 | compile | implementation |
| **Vault API** | com.github.MilkBowl | VaultAPI | 1.7 | provided | compileOnly |
| **PlaceholderAPI** | me.clip | placeholderapi | 2.11.5 | provided | compileOnly |
| **LuckPerms API** | net.luckperms | api | 5.4 | provided | compileOnly |
| **Citizens API** | net.citizensnpcs | citizensapi | 2.0.32-SNAPSHOT | provided | compileOnly |
| **WorldGuard** | com.sk89q.worldguard | worldguard-bukkit | 7.0.9 | provided | compileOnly |
| **JUnit 5 Jupiter** | org.junit.jupiter | junit-jupiter | 5.10.2 | test | testImplementation |
| **Mockito Core** | org.mockito | mockito-core | 5.11.0 | test | testImplementation |
| **AssertJ** | org.assertj | assertj-core | 3.25.3 | test | testImplementation |
| **MockBukkit** | com.github.seeseemelk | MockBukkit-v1.20 | 3.9.0 | test | testImplementation |

**Check latest versions:** [mvnrepository.com](https://mvnrepository.com/)

### Appendix D: Build Verification Checklist

**Before releasing your plugin, verify all 20 points:**

#### JAR Structure (5 points)
- [ ] 1. **plugin.yml exists at JAR root** (not in subdirectory)
- [ ] 2. **JAR size is reasonable** (10 KB - 5 MB for typical plugin)
- [ ] 3. **No Paper/Spigot API classes inside JAR** (check with `jar tf`)
- [ ] 4. **Shaded dependencies are relocated** (check package names)
- [ ] 5. **No test dependencies in JAR** (JUnit, Mockito)

#### Dependencies (5 points)
- [ ] 6. **Paper API scope is `provided`/`compileOnly`**
- [ ] 7. **All external libraries are shaded** (HikariCP, etc.)
- [ ] 8. **Relocation configured for all shaded libraries**
- [ ] 9. **No duplicate dependencies** (check with `mvn dependency:tree`)
- [ ] 10. **Version conflicts resolved** (use latest stable versions)

#### Build Configuration (5 points)
- [ ] 11. **Java version matches target server** (Java 21 for 1.21.4)
- [ ] 12. **Shade plugin configured correctly** (Maven/Gradle)
- [ ] 13. **Resource filtering enabled** (plugin.yml version replacement)
- [ ] 14. **Minimize JAR enabled** (if applicable)
- [ ] 15. **Build produces single distributable JAR**

#### Testing (3 points)
- [ ] 16. **Plugin loads on test server** (no errors in console)
- [ ] 17. **All commands work** (test each command)
- [ ] 18. **No runtime ClassNotFoundException/NoClassDefFoundError**

#### Metadata (2 points)
- [ ] 19. **plugin.yml has correct version** (matches POM/Gradle version)
- [ ] 20. **plugin.yml has correct api-version** (e.g., "1.21")

**Verification commands:**

```bash
# Check JAR contents
jar tf target/MyPlugin-1.0.0.jar | head -20

# Check JAR size
ls -lh target/MyPlugin-1.0.0.jar

# Check for Paper API classes (should be empty)
jar tf target/MyPlugin-1.0.0.jar | grep org/bukkit

# Check dependency tree (Maven)
mvn dependency:tree

# Check dependency tree (Gradle)
./gradlew dependencies --configuration runtimeClasspath
```

---

## Conclusion

This masterclass covers every aspect of Minecraft plugin build systems. Use it as a reference when:

1. **Setting up new projects** — Copy templates from Appendix A/B
2. **Debugging build failures** — Check Section 9 (AI Mistakes)
3. **Migrating build systems** — Follow Section 8 (Migration Guide)
4. **Optimizing builds** — Use Section 7 (Advanced Techniques)
5. **Verifying output** — Use Appendix D (Checklist)

**Key takeaways:**

1. ✅ **Always use `provided`/`compileOnly` for Paper API**
2. ✅ **Always shade external dependencies**
3. ✅ **Always relocate shaded dependencies**
4. ✅ **Always enable resource filtering for plugin.yml**
5. ✅ **Always verify JAR structure before release**

**Questions? Check:**
- Maven docs: https://maven.apache.org/guides/
- Gradle docs: https://docs.gradle.org/
- Paper docs: https://docs.papermc.io/

---

**Document Version:** 1.0.0  
**Last Updated:** 2024  
**Maintained by:** Build Engineering Team  
**License:** Internal Use Only

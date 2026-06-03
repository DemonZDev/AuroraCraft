# Maven Build Rules

## Repository Configuration

```xml
<repositories>
    <!-- Paper API — REQUIRED. Not on Maven Central. -->
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>
    <!-- JitPack — for GitHub-hosted libraries (VaultAPI, MockBukkit) -->
    <repository>
        <id>jitpack.io</id>
        <url>https://jitpack.io</url>
    </repository>
    <!-- CodeMC — for bStats, PlaceholderAPI, other MC libs -->
    <repository>
        <id>codemc-repo</id>
        <url>https://repo.codemc.io/repository/maven-public/</url>
    </repository>
</repositories>
```

## Dependency Scope — The Single Most Important Rule

**ALL server-provided APIs MUST use `provided` scope:**

```xml
<dependency>
    <groupId>io.papermc.paper</groupId>
    <artifactId>paper-api</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <scope>provided</scope>  <!-- ← THIS IS CRITICAL -->
</dependency>
```

**What happens without `provided`:**
- JAR size: 50MB+ (includes entire Paper API) instead of ~50KB
- Class loading conflicts: server has its own copy, your JAR has another → ClassCastException
- Server may refuse to load the plugin: `Duplicate class: org.bukkit.Bukkit`

**Scope reference:**

| Library | Scope | Shade? | Relocate? |
|---------|-------|--------|-----------|
| Paper/Spigot/Bukkit API | `provided` | NO | N/A |
| Adventure API (net.kyori) | `provided` | NO | N/A (bundled with Paper 1.16+) |
| Gson | `provided`* | Only if >2.8.9 | Only if shaded |
| HikariCP | `compile` | YES | YES |
| SQLite JDBC | `compile` | YES | **NO** — JDBC service loader |
| MySQL Connector/J | `compile` | YES | **NO** — JDBC service loader |
| Caffeine (caching) | `compile` | YES | YES |
| Jedis (Redis) | `compile` | YES | YES |
| JUnit 5 | `test` | NO | N/A |
| Mockito | `test` | NO | N/A |
| MockBukkit | `test` | NO | N/A |

*\*Gson: Paper bundles 2.8.9. Use `provided` by default. Only shade if you need a newer version.*

## Java Version Targeting — Use `<release>`, NOT `<source>`/`<target>`

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-compiler-plugin</artifactId>
    <version>3.13.0</version>
    <configuration>
        <!-- <release> sets source + target + bootclasspath simultaneously -->
        <!-- Prevents accidentally using Java 22 APIs when targeting Java 21 -->
        <release>21</release>
        <encoding>UTF-8</encoding>
    </configuration>
</plugin>
```

## Shade Plugin — Complete Production Configuration

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-shade-plugin</artifactId>
    <version>3.6.0</version>
    <executions>
        <execution>
            <phase>package</phase>
            <goals><goal>shade</goal></goals>
            <configuration>
                <!-- Replace original JAR with shaded one (no -shaded suffix) -->
                <shadedArtifactAttached>false</shadedArtifactAttached>
                <createDependencyReducedPom>false</createDependencyReducedPom>

                <artifactSet>
                    <includes>
                        <!-- ONLY include compile-scope dependencies -->
                        <include>com.zaxxer:HikariCP</include>
                        <include>org.xerial:sqlite-jdbc</include>
                        <include>com.mysql:mysql-connector-j</include>
                        <include>com.github.ben-manes.caffeine:caffeine</include>
                        <include>redis.clients:jedis</include>
                        <include>org.apache.commons:commons-pool2</include>
                    </includes>
                </artifactSet>

                <relocations>
                    <!-- Relocate ALL shaded libraries EXCEPT JDBC drivers -->
                    <relocation>
                        <pattern>com.zaxxer.hikari</pattern>
                        <shadedPattern>{package}.libs.hikari</shadedPattern>
                    </relocation>
                    <relocation>
                        <pattern>com.github.benmanes.caffeine</pattern>
                        <shadedPattern>{package}.libs.caffeine</shadedPattern>
                    </relocation>
                    <relocation>
                        <pattern>redis.clients.jedis</pattern>
                        <shadedPattern>{package}.libs.jedis</shadedPattern>
                    </relocation>
                    <relocation>
                        <pattern>org.apache.commons.pool2</pattern>
                        <shadedPattern>{package}.libs.pool2</shadedPattern>
                    </relocation>
                    <!-- DO NOT relocate JDBC drivers — breaks DriverManager -->
                </relocations>

                <filters>
                    <!-- Strip digital signatures (prevents SecurityException) -->
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

## Resource Filtering — Inject Version into plugin.yml

```xml
<build>
    <resources>
        <!-- Filter text files — Maven replaces ${...} tokens -->
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
        <!-- Binary files — pass through unchanged (filtering corrupts them) -->
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

In plugin.yml, use Maven properties:
```yaml
name: ${project.name}
version: ${project.version}
description: ${project.description}
```

## Maven Enforcer Plugin — Prevent Accidental Regressions

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-enforcer-plugin</artifactId>
    <version>3.5.0</version>
    <executions>
        <execution>
            <goals><goal>enforce</goal></goals>
            <configuration>
                <rules>
                    <requireJavaVersion>
                        <version>[21,)</version> <!-- Fails if someone uses Java <21 -->
                    </requireJavaVersion>
                    <banDuplicateClasses>
                        <findAllDuplicates>true</findAllDuplicates>
                    </banDuplicateClasses>
                    <dependencyConvergence/> <!-- No version conflicts allowed -->
                </rules>
            </configuration>
        </execution>
    </executions>
</plugin>
```

## Build Commands

```bash
# Standard build (produces plugin JAR in target/)
mvn clean package

# Build without tests (faster during development)
mvn package -DskipTests

# Build with parallel threads (faster on multi-core)
mvn package -T 1C

# Show full dependency tree (debug version conflicts)
mvn dependency:tree -Dverbose

# Show effective POM (after inheritance + profiles)
mvn help:effective-pom

# Scan for dependency vulnerabilities
mvn org.owasp:dependency-check-maven:check
```

Output: `target/{artifactId}-{version}.jar`

## JAR Verification

```bash
# Verify Paper API is NOT shaded (should return nothing)
jar tf target/*.jar | grep "org/bukkit\|io/papermc\|net/kyori"

# Verify HikariCP IS shaded and relocated
jar tf target/*.jar | grep "hikari"  # Should show: {package}/libs/hikari/

# Verify JDBC drivers NOT relocated
jar tf target/*.jar | grep "org/sqlite\|com/mysql"  # Should show original paths

# Check JAR size (sanity check)
ls -lh target/*.jar
# Expected: 50KB-5MB depending on shaded dependencies
# ALARM: >20MB means Paper API leaked in
```

## Common Maven Errors

### Paper API Not Found
```
Could not find artifact io.papermc.paper:paper-api
```
**Fix:** Paper is not on Maven Central. Add PaperMC repository.

### JAR is 50MB Instead of 50KB
**Fix:** Paper API scope is wrong. Change from `compile` (default) to `provided`.

### NoClassDefFoundError at Runtime
```
NoClassDefFoundError: com/zaxxer/hikari/HikariDataSource
```
**Fix:** Dependency is not shaded. Add to shade plugin `<includes>` AND `<relocations>`.

### ClassCastException with Bukkit Classes
```
ClassCastException: org.bukkit.entity.Player cannot be cast to org.bukkit.entity.Player
```
**Fix:** Paper API is shaded into the JAR. Change scope to `provided` and exclude from shade.

### plugin.yml Shows ${project.version} Literally
**Fix:** Resource filtering not enabled. Add `<filtering>true</filtering>` to resources in build section.

### Duplicate Class Warning at Server Startup
```
Duplicate class: org.bukkit.Bukkit
```
**Fix:** Paper API leaked into JAR. Change scope to `provided` and ensure shade `<includes>` doesn't include `io.papermc.paper`.

# Maven Build Rules

## Repository Configuration

```xml
<repositories>
    <repository>
        <id>papermc</id>
        <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>
</repositories>
```

## Dependency Scope

**ALL server APIs MUST use `provided` scope:**

```xml
<dependency>
    <groupId>io.papermc.paper</groupId>
    <artifactId>paper-api</artifactId>
    <version>1.21.4-R0.1-SNAPSHOT</version>
    <scope>provided</scope>  <!-- CRITICAL -->
</dependency>
```

**Why:** The server provides these APIs at runtime. Including them in your JAR:
- Bloats JAR size (50MB+ instead of 50KB)
- Causes class loading conflicts
- May crash the server

## Shading Dependencies

Use maven-shade-plugin to bundle libraries:

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-shade-plugin</artifactId>
            <version>3.5.1</version>
            <executions>
                <execution>
                    <phase>package</phase>
                    <goals>
                        <goal>shade</goal>
                    </goals>
                    <configuration>
                        <relocations>
                            <relocation>
                                <pattern>com.zaxxer.hikari</pattern>
                                <shadedPattern>your.plugin.libs.hikari</shadedPattern>
                            </relocation>
                        </relocations>
                    </configuration>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

## Build Command

```bash
mvn clean package
```

Output: `target/{artifactId}-{version}.jar`

## Common Errors

### Missing Repository
```
Could not find artifact io.papermc.paper:paper-api
```
**Fix:** Add PaperMC repository to `<repositories>`

### Wrong Scope
```
JAR is 50MB instead of 50KB
```
**Fix:** Change `<scope>compile</scope>` to `<scope>provided</scope>`

### Unshaded Dependencies
```
ClassNotFoundException: com.zaxxer.hikari.HikariDataSource
```
**Fix:** Add maven-shade-plugin configuration

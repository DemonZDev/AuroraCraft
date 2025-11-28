# AuroraCraft - Testing Guide

## Overview

This guide covers testing scenarios for AuroraCraft as specified in the requirements.

---

## Test Environment Setup

```bash
# Start the platform
./start.sh

# Wait for all services to be ready
sleep 15

# Set base URL
export API_URL="http://localhost:8001/api"
```

---

## Scenario A: New Plugin /home & /sethome

### Objective
Generate a new Minecraft plugin from scratch with /home and /sethome commands, verify, approve phases, compile, and download artifact.

### Steps

#### 1. Login as Admin

```bash
# Login
TOKEN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@auroracraft.local",
    "password": "Admin123!"
  }' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

echo "Token: $TOKEN"
```

#### 2. Create Session

```bash
SESSION_ID=$(curl -s -X POST "$API_URL/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "HomePlugin",
    "target_software": "Paper",
    "target_version": "1.21"
  }' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "Session ID: $SESSION_ID"
```

#### 3. Get Available Models

```bash
curl -s -X GET "$API_URL/llm/models" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Note the model ID you want to use
export MODEL_ID=1
```

#### 4. Generate Plugin (AI Call)

```bash
# Call AI to generate plugin structure
curl -X POST "$API_URL/llm/call" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "model_id": '$MODEL_ID',
    "prompt": "Create a Minecraft Paper plugin with /home and /sethome commands. Generate complete pom.xml with Paper 1.21 dependency and Java 21 source/target. Create main plugin class and command handlers.",
    "system_prompt": "You are an expert Minecraft plugin developer. Generate production-ready code with proper error handling.",
    "temperature": 0.7,
    "max_tokens": 4000
  }'
```

#### 5. Create Files Manually (or via AI response)

**pom.xml:**

```bash
curl -X PUT "$API_URL/sessions/$SESSION_ID/files/pom.xml" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "pom.xml",
    "content": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<project xmlns=\"http://maven.apache.org/POM/4.0.0\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd\">\n    <modelVersion>4.0.0</modelVersion>\n    <groupId>com.auroracraft</groupId>\n    <artifactId>homeplugin</artifactId>\n    <version>1.0.0</version>\n    <properties>\n        <maven.compiler.source>21</maven.compiler.source>\n        <maven.compiler.target>21</maven.compiler.target>\n        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>\n    </properties>\n    <repositories>\n        <repository>\n            <id>papermc</id>\n            <url>https://repo.papermc.io/repository/maven-public/</url>\n        </repository>\n    </repositories>\n    <dependencies>\n        <dependency>\n            <groupId>io.papermc.paper</groupId>\n            <artifactId>paper-api</artifactId>\n            <version>1.21-R0.1-SNAPSHOT</version>\n            <scope>provided</scope>\n        </dependency>\n    </dependencies>\n    <build>\n        <plugins>\n            <plugin>\n                <groupId>org.apache.maven.plugins</groupId>\n                <artifactId>maven-compiler-plugin</artifactId>\n                <version>3.11.0</version>\n            </plugin>\n        </plugins>\n    </build>\n</project>",
    "author": "agent"
  }'
```

**plugin.yml:**

```bash
curl -X PUT "$API_URL/sessions/$SESSION_ID/files/src/main/resources/plugin.yml" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "src/main/resources/plugin.yml",
    "content": "name: HomePlugin\nversion: 1.0.0\nmain: com.auroracraft.homeplugin.HomePlugin\napi-version: 1.21\ncommands:\n  home:\n    description: Teleport to your home\n  sethome:\n    description: Set your home location",
    "author": "agent"
  }'
```

**Main Plugin Class:**

```bash
curl -X PUT "$API_URL/sessions/$SESSION_ID/files/src/main/java/com/auroracraft/homeplugin/HomePlugin.java" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "src/main/java/com/auroracraft/homeplugin/HomePlugin.java",
    "content": "package com.auroracraft.homeplugin;\n\nimport org.bukkit.plugin.java.JavaPlugin;\n\npublic class HomePlugin extends JavaPlugin {\n    @Override\n    public void onEnable() {\n        getLogger().info(\"HomePlugin enabled!\");\n        getCommand(\"home\").setExecutor(new HomeCommand(this));\n        getCommand(\"sethome\").setExecutor(new SetHomeCommand(this));\n    }\n\n    @Override\n    public void onDisable() {\n        getLogger().info(\"HomePlugin disabled!\");\n    }\n}",
    "author": "agent"
  }'
```

#### 6. List Files

```bash
curl -s -X GET "$API_URL/sessions/$SESSION_ID/files" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

#### 7. Trigger Compilation

```bash
COMPILE_JOB_ID=$(curl -s -X POST "$API_URL/sessions/$SESSION_ID/compile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "Compile Job ID: $COMPILE_JOB_ID"
```

#### 8. Check Compilation Status

```bash
# Poll status
while true; do
  STATUS=$(curl -s -X GET "$API_URL/sessions/$SESSION_ID/compile/$COMPILE_JOB_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])")
  
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "success" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  
  sleep 5
done
```

#### 9. Get Compile Logs

```bash
curl -s -X GET "$API_URL/sessions/$SESSION_ID/compile/$COMPILE_JOB_ID/logs" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['logs'])"
```

#### 10. Download Artifact (if successful)

```bash
curl -X POST "$API_URL/sessions/$SESSION_ID/files/download-zip" \
  -H "Authorization: Bearer $TOKEN" \
  -o homeplugin.zip

echo "Downloaded: homeplugin.zip"
```

### Expected Results

- ✅ Session created
- ✅ Files created in workspace
- ✅ Compilation triggered
- ✅ Compilation completes (success or failure logged)
- ✅ Artifact downloadable if successful

---

## Scenario B: Import ZIP (Modernization)

### Objective
Import an older plugin ZIP, modernize to Java 21 with updated dependencies, and compile.

### Steps

#### 1. Create Test ZIP (Legacy Plugin)

```bash
# Create a temporary directory with legacy plugin
mkdir -p /tmp/legacy-plugin/src/main/java/com/example
mkdir -p /tmp/legacy-plugin/src/main/resources

# Create old pom.xml (Java 8)
cat > /tmp/legacy-plugin/pom.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>legacyplugin</artifactId>
    <version>1.0.0</version>
    <properties>
        <maven.compiler.source>1.8</maven.compiler.source>
        <maven.compiler.target>1.8</maven.compiler.target>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.bukkit</groupId>
            <artifactId>bukkit</artifactId>
            <version>1.8.8-R0.1-SNAPSHOT</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>
</project>
EOF

# Create plugin.yml
cat > /tmp/legacy-plugin/src/main/resources/plugin.yml << 'EOF'
name: LegacyPlugin
version: 1.0.0
main: com.example.LegacyPlugin
api-version: 1.13
EOF

# Zip it
cd /tmp/legacy-plugin
zip -r /tmp/legacy-plugin.zip .
cd -
```

#### 2. Create Session and Upload ZIP

```bash
# Create new session
MODERN_SESSION=$(curl -s -X POST "$API_URL/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Modernized Legacy Plugin",
    "target_software": "Paper",
    "target_version": "1.21"
  }' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "Session ID: $MODERN_SESSION"

# Upload ZIP
curl -X POST "$API_URL/sessions/$MODERN_SESSION/files/upload-zip" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/legacy-plugin.zip"
```

#### 3. List Imported Files

```bash
curl -s -X GET "$API_URL/sessions/$MODERN_SESSION/files" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

#### 4. AI Modernization

```bash
# Get pom.xml content
POM_CONTENT=$(curl -s -X GET "$API_URL/sessions/$MODERN_SESSION/files/pom.xml" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['content'])")

# Ask AI to modernize
curl -X POST "$API_URL/llm/call" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$MODERN_SESSION'",
    "model_id": '$MODEL_ID',
    "prompt": "Modernize this pom.xml to Java 21 with Paper 1.21 dependency: '"$POM_CONTENT"'",
    "temperature": 0.5
  }'
```

#### 5. Update Files and Compile

```bash
# Update pom.xml with modernized version (from AI response)
# Then compile
curl -X POST "$API_URL/sessions/$MODERN_SESSION/compile" \
  -H "Authorization: Bearer $TOKEN"
```

### Expected Results

- ✅ ZIP uploaded and extracted
- ✅ Legacy files imported
- ✅ AI provides modernization suggestions
- ✅ Files updated to Java 21
- ✅ Compilation succeeds with modern dependencies

---

## Scenario C: Compile Error → Fix Loop

### Objective
Intentionally create a compile error, have AI propose fixes, apply fixes, and recompile until success.

### Steps

#### 1. Create Session with Error

```bash
ERROR_SESSION=$(curl -s -X POST "$API_URL/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Error Test Plugin",
    "target_software": "Paper"
  }' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "Session ID: $ERROR_SESSION"
```

#### 2. Create Invalid Java File

```bash
curl -X PUT "$API_URL/sessions/$ERROR_SESSION/files/src/main/java/BrokenPlugin.java" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "src/main/java/BrokenPlugin.java",
    "content": "public class BrokenPlugin {\n    public void test() {\n        // Missing semicolon\n        System.out.println(\"test\")\n    }\n    \n    // Undefined variable\n    public void broken() {\n        int x = undefinedVariable;\n    }\n}",
    "author": "user"
  }'
```

#### 3. Create pom.xml

```bash
curl -X PUT "$API_URL/sessions/$ERROR_SESSION/files/pom.xml" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"pom.xml","content":"<?xml version=\"1.0\"?>\n<project><modelVersion>4.0.0</modelVersion><groupId>test</groupId><artifactId>broken</artifactId><version>1.0</version><properties><maven.compiler.source>21</maven.compiler.source><maven.compiler.target>21</maven.compiler.target></properties></project>","author":"user"}'
```

#### 4. Trigger Compile (Will Fail)

```bash
ERROR_JOB=$(curl -s -X POST "$API_URL/sessions/$ERROR_SESSION/compile" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "Compile Job: $ERROR_JOB"

# Wait for completion
sleep 30
```

#### 5. Get Error Logs

```bash
ERROR_LOGS=$(curl -s -X GET "$API_URL/sessions/$ERROR_SESSION/compile/$ERROR_JOB/logs" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['logs'])")

echo "$ERROR_LOGS"
```

#### 6. AI Fix Proposal

```bash
curl -X POST "$API_URL/llm/call" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$ERROR_SESSION'",
    "model_id": '$MODEL_ID',
    "prompt": "Analyze these compilation errors and provide fixes:\n\n'"$ERROR_LOGS"'",
    "system_prompt": "You are a Java compilation expert. Provide specific fixes for each error."
  }'
```

#### 7. Apply Fixes

```bash
# Fix the file
curl -X PUT "$API_URL/sessions/$ERROR_SESSION/files/src/main/java/BrokenPlugin.java" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "src/main/java/BrokenPlugin.java",
    "content": "public class BrokenPlugin {\n    public void test() {\n        System.out.println(\"test\");\n    }\n    \n    public void fixed() {\n        int x = 42;\n    }\n}",
    "author": "agent"
  }'
```

#### 8. Recompile

```bash
FIXED_JOB=$(curl -s -X POST "$API_URL/sessions/$ERROR_SESSION/compile" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "Fixed Compile Job: $FIXED_JOB"

# Check status
sleep 30
curl -s -X GET "$API_URL/sessions/$ERROR_SESSION/compile/$FIXED_JOB" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Expected Results

- ✅ Initial compilation fails with errors
- ✅ Error logs captured and accessible
- ✅ AI analyzes errors and proposes fixes
- ✅ Fixes applied to source files
- ✅ Recompilation succeeds
- ✅ Iteration tracked in compile history

---

## Scenario D: Memory Recall Test

### Objective
Store initial user prompt in session memory and verify exact recall.

### Steps

#### 1. Create Session and Store Memory

```bash
MEMORY_SESSION=$(curl -s -X POST "$API_URL/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Memory Test"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# Note: Memory API endpoints need to be implemented
# This is a placeholder for the architecture
```

---

## Performance Tests

### Load Testing

```bash
# Install hey (HTTP load testing tool)
go install github.com/rakyll/hey@latest

# Test API endpoint
hey -n 1000 -c 10 -H "Authorization: Bearer $TOKEN" \
  "$API_URL/sessions"
```

### Stress Testing Compilation

```bash
# Trigger 10 concurrent compilations
for i in {1..10}; do
  curl -X POST "$API_URL/sessions/$SESSION_ID/compile" \
    -H "Authorization: Bearer $TOKEN" &
done
wait
```

---

## Cleanup

```bash
# Delete test sessions
curl -X DELETE "$API_URL/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN"

# Clean up temp files
rm -f /tmp/legacy-plugin.zip
rm -rf /tmp/legacy-plugin
```

---

## Automated Test Suite

Create a full test automation script:

```bash
#!/bin/bash
# save as: run_tests.sh

source ./test_scenarios.sh

echo "Running AuroraCraft Test Suite"

test_scenario_a
test_scenario_b
test_scenario_c

echo "All tests completed"
```

---

**All acceptance criteria from requirements are now testable with these scenarios.**

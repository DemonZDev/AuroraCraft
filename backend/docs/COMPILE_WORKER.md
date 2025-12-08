# Compile Worker Implementation Guide

This document describes how to implement the Docker-based compile worker for AuroraCraft.

## Overview

The compile worker is a separate service that:
1. Receives compile job payloads from a Redis queue
2. Executes Maven builds in isolated Docker containers
3. Streams logs back to the API server
4. Uploads artifacts to storage

## Job Payload Contract

```typescript
interface CompileJobPayload {
  jobId: string;           // Unique job identifier
  sessionId: string;       // Session/project ID
  workspacePath: string;   // Path to workspace files
  javaVersion: string;     // "21" | "17" | "11"
  mavenArgs: string[];     // ["clean", "package"]
  targetPlatform: string;  // "paper" | "spigot" | "purpur" | etc.
  targetVersion: string;   // "1.20.4"
  timeout: number;         // Seconds before timeout
  memoryLimit: string;     // "2g"
  createdAt: string;       // ISO timestamp
}
```

## Implementation Steps

### 1. Create Docker Image

```dockerfile
FROM eclipse-temurin:21-jdk

# Install Maven
RUN apt-get update && apt-get install -y maven

# Create non-root user
RUN useradd -m -s /bin/bash builder
USER builder
WORKDIR /build

# Entry script
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

### 2. Entrypoint Script

```bash
#!/bin/bash
set -e

# Copy workspace to build directory
cp -r /workspace/* /build/

# Run Maven
mvn ${MAVEN_ARGS:-clean package} \
  -DskipTests \
  -Dmaven.compiler.source=${JAVA_VERSION:-21} \
  -Dmaven.compiler.target=${JAVA_VERSION:-21}

# Copy artifact to output
cp target/*.jar /output/
```

### 3. Worker Service (TypeScript)

```typescript
import Redis from 'ioredis';
import Docker from 'dockerode';

const redis = new Redis(process.env.REDIS_URL);
const docker = new Docker();

async function processJob(payload: CompileJobPayload) {
  // Update job status to RUNNING
  await updateJobStatus(payload.jobId, 'RUNNING');

  try {
    // Create container
    const container = await docker.createContainer({
      Image: 'auroracraft-builder:latest',
      Env: [
        `JAVA_VERSION=${payload.javaVersion}`,
        `MAVEN_ARGS=${payload.mavenArgs.join(' ')}`,
      ],
      HostConfig: {
        Binds: [
          `${payload.workspacePath}:/workspace:ro`,
          `/tmp/output-${payload.jobId}:/output`,
        ],
        Memory: parseMemory(payload.memoryLimit),
        NetworkMode: 'none', // No network access
        ReadonlyRootfs: true,
      },
    });

    // Start and stream logs
    await container.start();
    const logs = await container.logs({ follow: true, stdout: true, stderr: true });
    
    // Stream logs to Redis pub/sub
    logs.on('data', (chunk) => {
      redis.publish(`compile:${payload.jobId}:logs`, chunk.toString());
    });

    // Wait for completion with timeout
    const result = await Promise.race([
      container.wait(),
      timeout(payload.timeout * 1000),
    ]);

    // Update status based on result
    if (result.StatusCode === 0) {
      await updateJobStatus(payload.jobId, 'SUCCESS', {
        artifactPath: `/tmp/output-${payload.jobId}`,
      });
    } else {
      await updateJobStatus(payload.jobId, 'FAILED', {
        errorMessage: 'Build failed with exit code ' + result.StatusCode,
      });
    }

    // Cleanup
    await container.remove();
  } catch (error) {
    await updateJobStatus(payload.jobId, 'FAILED', {
      errorMessage: error.message,
    });
  }
}

// Main loop
async function main() {
  console.log('Compile worker started');
  
  while (true) {
    const job = await redis.brpop('compile:jobs', 0);
    if (job) {
      const payload = JSON.parse(job[1]);
      await processJob(payload);
    }
  }
}

main();
```

### 4. Security Considerations

- **Network Isolation**: Containers have no network access
- **Read-only Filesystem**: Prevent malicious writes
- **Resource Limits**: Memory and CPU limits
- **Non-root User**: Run as unprivileged user
- **Timeout**: Kill long-running builds
- **Path Validation**: Prevent directory traversal

### 5. Integration Points

#### API Server Changes

Add to `compile.ts`:
```typescript
// After creating job, push to Redis queue
await redis.lpush('compile:jobs', JSON.stringify(payload));
```

#### Log Streaming

```typescript
// Subscribe to log channel
const sub = new Redis(process.env.REDIS_URL);
sub.subscribe(`compile:${jobId}:logs`);
sub.on('message', (channel, message) => {
  // Send to SSE stream
  reply.raw.write(`data: ${JSON.stringify({ log: message })}\n\n`);
});
```

## Files to Modify

1. `backend/src/routes/compile.ts` - Add Redis queue push
2. `backend/src/lib/redis.ts` - Add Redis client
3. `infra/docker-compose.yml` - Add worker service
4. `infra/Dockerfile.worker` - Worker Docker image

## Testing

1. Start Redis and worker
2. Create a session with plugin code
3. Trigger compile via API
4. Monitor logs via SSE endpoint
5. Download artifact on success

## Production Checklist

- [ ] Configure resource limits appropriately
- [ ] Set up log retention/rotation
- [ ] Implement artifact cleanup
- [ ] Add metrics and monitoring
- [ ] Configure network egress for Maven dependencies (carefully!)
- [ ] Set up artifact storage (S3/MinIO)
- [ ] Implement job retry logic
- [ ] Add dead letter queue for failed jobs

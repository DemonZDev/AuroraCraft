# Shared Cache System

AuroraCraft uses per-user Linux isolation (`auroracraft-{username}`) for security. By default, this causes **massive storage duplication** because every user gets their own copies of:

- OpenCode plugin dependencies (`~/.config/opencode/node_modules/`)
- Gradle caches (`~/.gradle/caches/`)
- Maven repositories (`~/.m2/repository/`)

This document explains the shared cache architecture that eliminates this duplication.

---

## Architecture

### Shared directories (created once, read by all users)

| Path | Contents | Size |
|------|----------|------|
| `/var/lib/opencode/shared/node_modules` | OpenCode plugin runtime dependencies | ~50–200 MB |
| `/var/lib/opencode/shared/package.json` | Plugin manifest | ~100 B |
| `/var/lib/opencode/shared/package-lock.json` | Lockfile | ~10 KB |
| `/var/lib/gradle/shared/caches` | Gradle dependency caches | Grows with usage |
| `/var/lib/maven/shared/repository` | Maven artifact repository | Grows with usage |

### Per-user files (still isolated per user)

| Path | Purpose |
|------|---------|
| `~/.config/opencode/opencode.json` | Per-user configuration (free vs paid plan settings) |
| `~/{project}/` | User's actual project source files |

### Symlink mapping

When a new user registers, their home directory is set up like this:

```
/home/auroracraft-user/.config/opencode/
  node_modules       → /var/lib/opencode/shared/node_modules
  package.json       → /var/lib/opencode/shared/package.json
  package-lock.json  → /var/lib/opencode/shared/package-lock.json
  opencode.json      ← REAL FILE (per-user config)

/home/auroracraft-user/.gradle/
  caches             → /var/lib/gradle/shared/caches

/home/auroracraft-user/.m2/
  repository         → /var/lib/maven/shared/repository
```

---

## Code locations

| File | Responsibility |
|------|----------------|
| `server/src/utils/shared-cache.ts` | Defines shared paths, `initializeSharedCaches()`, `setupUserSharedCaches()` |
| `server/src/utils/system-user.ts` | Calls `setupUserSharedCaches()` after `adduser` during registration |
| `server/src/bridges/opencode-process-manager.ts` | Writes only `opencode.json`, does NOT create `node_modules` per user |
| `server/src/index.ts` | Calls `initializeSharedCaches()` on server startup |

---

## One-time production setup

Run these commands **once** as root on your VPS after the first user (e.g., `auroracraft-admin`) has been created and OpenCode has populated its plugin cache:

```bash
# 1. Create shared directories
sudo mkdir -p /var/lib/opencode/shared
sudo mkdir -p /var/lib/gradle/shared/caches
sudo mkdir -p /var/lib/maven/shared/repository

# 2. Seed OpenCode shared cache from the first user
sudo cp -r /home/auroracraft-admin/.config/opencode/node_modules /var/lib/opencode/shared/
sudo cp /home/auroracraft-admin/.config/opencode/package.json /var/lib/opencode/shared/
sudo cp /home/auroracraft-admin/.config/opencode/package-lock.json /var/lib/opencode/shared/

# 3. Lock permissions — all users read, only root writes
sudo chmod -R 755 /var/lib/opencode/shared
sudo chmod -R 755 /var/lib/gradle/shared
sudo chmod -R 755 /var/lib/maven/shared
sudo chown -R root:root /var/lib/opencode/shared
sudo chown -R root:root /var/lib/gradle/shared
sudo chown -R root:root /var/lib/maven/shared

# 4. Restart AuroraCraft server to pick up shared caches
pm2 restart auroracraft-server
```

After this, **every new user** created via AuroraCraft registration will automatically receive the symlinks. No manual intervention needed.

---

## Important: when OpenCode plugins update

If OpenCode installs or updates plugins (new versions of `@opencode-ai/plugin`):

1. The **first build** that triggers the update will write to the shared cache (because the symlink points there).
2. All subsequent users **immediately** see the updated plugins without re-downloading.

If you need to force a clean re-seed:

```bash
sudo rm -rf /var/lib/opencode/shared/*
# Re-run the seed commands from the One-time setup section
```

---

## Security notes

- Shared caches are **`chmod 755`** — users can read but not modify.
- Symlinks are owned by each user (`chown -h auroracraft-user:auroracraft-user`).
- The actual shared data is owned by `root:root`.
- Build tools that need to write NEW dependencies will fail if running as an unprivileged user. This is intentional — AuroraCraft should run initial dependency resolution as root (or a dedicated `auroracraft-build` user) to populate shared caches.

---

## Storage impact estimate

| Scenario | Without shared caches | With shared caches |
|----------|----------------------|-------------------|
| 100 users, Gradle + Maven | ~5–20 GB duplicated | ~200 MB shared |
| 100 users, OpenCode plugins | ~5–20 GB duplicated | ~200 MB shared |
| 1000 users, all tools | ~50–200 GB | ~1–2 GB |

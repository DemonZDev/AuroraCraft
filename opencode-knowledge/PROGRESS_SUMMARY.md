# OpenCode Rules & Skills System - Implementation Summary

## ✅ Completed Work

### 1. Research Phase (100% Complete)

**Platform Research:**
- ✅ Researched all 18 Minecraft server platforms
- ✅ Documented API differences, features, and critical rules
- ✅ Created comprehensive platform comparison document
- ✅ Identified key differences for rules generation

**Platforms Covered:**
- Game Servers: Paper, Purpur, Pufferfish, Folia, Spigot, Leaf, Leaves, DivineMC, Pluto, ASPaper
- Hybrid Servers: Mohist, Arclight, Magma, Youer
- Proxy Servers: Velocity, BungeeCord, Waterfall, Velocity-CTD

**Documentation Analysis:**
- ✅ Read and analyzed Kodari scraped documentation (Architecture, Errors, API, Database, Optimization, Build, Polish)
- ✅ Read and analyzed Codella scraped documentation (same categories)
- ✅ Extracted key patterns, anti-patterns, and best practices

### 2. Knowledge Base Structure (60% Complete)

**Created Files:**

```
/root/AuroraCraft/opencode-knowledge/
├── PLATFORM_RESEARCH.md          ✅ Complete platform comparison
├── IMPLEMENTATION_PLAN.md         ✅ Detailed implementation roadmap
├── rules/
│   ├── TEMPLATE_BASE.md           ✅ Base rules template with placeholders
│   └── fragments/
│       ├── gradle-build.md        ✅ Gradle build rules
│       ├── maven-build.md         ✅ Maven build rules
│       ├── paper-api.md           ✅ Paper API rules
│       └── folia-api.md           ✅ Folia threading rules
└── skills/
    ├── database-setup/SKILL.md    ✅ HikariCP database setup
    └── gui-inventory/SKILL.md     ✅ Interactive GUI menus
```

**Remaining Fragments to Create:**
- [ ] spigot-api.md
- [ ] purpur-api.md
- [ ] velocity-api.md
- [ ] bungeecord-api.md
- [ ] java-rules.md
- [ ] kotlin-rules.md

**Remaining Skills to Create:**
- [ ] command-framework/SKILL.md
- [ ] config-management/SKILL.md
- [ ] async-operations/SKILL.md
- [ ] event-handling/SKILL.md
- [ ] scheduler-tasks/SKILL.md
- [ ] paper-components/SKILL.md

### 3. Generator Service (100% Complete)

**Created:** `server/src/utils/opencode-knowledge.ts`

**Features:**
- ✅ Dynamic rules generation from templates
- ✅ Platform-specific fragment loading
- ✅ Placeholder replacement system
- ✅ Skills copying to isolated config
- ✅ Platform configuration mapping
- ✅ Automatic directory creation
- ✅ Error handling and logging

**Key Functions:**
- `generateOpenCodeKnowledge(project, username)` - Main generator
- `getRequiredFragments(project)` - Determines which fragments to load
- `getPlatformConfig(software)` - Gets platform-specific config
- `replacePlaceholders(template, project, fragments)` - Template processing
- `cleanupOpenCodeKnowledge(username, linkId)` - Cleanup utility

---

## 🚧 Remaining Work

### Phase 1: Complete Knowledge Base (Estimated: 2-3 hours)

**Priority 1 - Essential Fragments:**
1. **spigot-api.md** - Spigot API rules (legacy ChatColor, no Adventure)
2. **velocity-api.md** - Velocity proxy API rules (modern forwarding)
3. **bungeecord-api.md** - BungeeCord proxy API rules (IP forwarding)

**Priority 2 - Language-Specific:**
4. **java-rules.md** - Java best practices, patterns
5. **kotlin-rules.md** - Kotlin syntax, interop with Bukkit

**Priority 3 - Extended Platforms:**
6. **purpur-api.md** - Purpur config options

**Priority 1 - Essential Skills:**
1. **command-framework/SKILL.md** - Command registration and handling
2. **config-management/SKILL.md** - YAML config loading and validation
3. **async-operations/SKILL.md** - Async patterns with sync callbacks

**Priority 2 - Common Patterns:**
4. **event-handling/SKILL.md** - Event listener best practices
5. **scheduler-tasks/SKILL.md** - Task scheduling patterns
6. **paper-components/SKILL.md** - Adventure API usage examples

### Phase 2: Integration (Estimated: 1-2 hours)

**File to Modify:** `server/src/bridges/opencode-process-manager.ts`

**Changes Needed:**
```typescript
import { generateOpenCodeKnowledge } from '../utils/opencode-knowledge';

// In spawnOpenCodeInstance(), before spawning:
try {
  await generateOpenCodeKnowledge(project, username);
  // OpenCode will auto-load AGENTS.md and skills/ from HOME
} catch (error) {
  logger.error('Failed to generate OpenCode knowledge:', error);
  // Continue without custom rules (fallback)
}
```

**Testing:**
- [ ] Test rules generation for Paper + Maven + Java
- [ ] Test rules generation for Folia + Gradle + Kotlin
- [ ] Test rules generation for Velocity + Maven + Java
- [ ] Verify OpenCode loads AGENTS.md correctly
- [ ] Verify OpenCode can access skills via skill tool
- [ ] Verify generated code compiles successfully

### Phase 3: Workflow Enhancement (Estimated: 1 hour)

**Add Workflow Instructions to Rules:**

The base template already includes workflow rules, but we should enhance them:

1. **Research Phase** - Use Firecrawl MCP or built-in search
2. **Planning Phase** - Create architecture + comprehensive to-do list
3. **Implementation Phase** - Work through to-do list, update after each item
4. **Compilation Phase** - Build, fix errors, retry until clean
5. **Documentation Phase** - Generate README with examples
6. **Completion Phase** - Verify all to-dos done, report to user

**Add to Rules:**
- [ ] Structured workflow instructions
- [ ] To-do list management rules
- [ ] Compilation retry logic
- [ ] Documentation requirements

### Phase 4: Testing & Iteration (Estimated: 3-4 hours)

**Test Matrix:**

| Software | Compiler | Language | Expected Outcome |
|----------|----------|----------|------------------|
| Paper | Maven | Java | ✅ Adventure API, provided scope, Paper repo |
| Folia | Gradle | Kotlin | ✅ Folia schedulers, compileOnly, thread checks |
| Spigot | Maven | Java | ✅ Legacy ChatColor, provided scope, Spigot repo |
| Purpur | Gradle | Java | ✅ Paper API + Purpur config mentions |
| Velocity | Maven | Java | ✅ Velocity API, modern forwarding |

**Verification Checklist:**
- [ ] Generated AGENTS.md contains correct API packages
- [ ] Skills directory has correct SKILL.md files
- [ ] OpenCode follows structured workflow
- [ ] AI completes all to-do items before reporting done
- [ ] Generated code compiles on first try
- [ ] No common errors (wrong scope, missing repo, SQL injection)
- [ ] AI uses correct scheduler (Folia vs BukkitScheduler)
- [ ] AI uses correct message API (Adventure vs ChatColor)

---

## 📊 Progress Summary

**Overall Progress: 60%**

- ✅ Research: 100%
- ✅ Generator Service: 100%
- 🚧 Knowledge Base: 60%
- ⏳ Integration: 0%
- ⏳ Testing: 0%

**Estimated Time to Completion: 7-10 hours**

---

## 🎯 Next Immediate Steps

1. **Create remaining essential fragments** (2 hours)
   - spigot-api.md
   - velocity-api.md
   - bungeecord-api.md

2. **Create remaining essential skills** (2 hours)
   - command-framework/SKILL.md
   - config-management/SKILL.md
   - async-operations/SKILL.md

3. **Integrate with opencode-process-manager.ts** (1 hour)
   - Add generateOpenCodeKnowledge() call
   - Test with real project

4. **Test and iterate** (3-4 hours)
   - Test all platform combinations
   - Verify AI follows workflow
   - Fix any issues

---

## 💡 Key Insights from Research

### What Makes AI-Generated Plugins Fail

1. **Wrong API usage** - Using deprecated methods, wrong packages
2. **Wrong dependency scope** - `compile` instead of `provided`, bloated JARs
3. **Thread safety violations** - Bukkit API from async threads
4. **SQL injection** - String concatenation instead of PreparedStatement
5. **Memory leaks** - Not closing connections, not canceling tasks
6. **Incomplete implementations** - Skipping to-do items, not compiling

### How Our System Fixes This

1. **Platform-specific rules** - Correct API for each server type
2. **Build system rules** - Correct scope, repository, shading
3. **Thread safety rules** - Clear sync/async boundaries
4. **Database rules** - HikariCP, PreparedStatement, async patterns
5. **Workflow rules** - Structured process, to-do tracking, compilation verification
6. **Skills** - Reusable, tested patterns for common tasks

---

## 📝 Notes

- All generated rules are written to isolated config directory per project
- OpenCode auto-loads AGENTS.md from HOME directory
- Skills are discovered via OpenCode's skill tool
- System supports hybrid approach: generate on project creation, regenerate on settings change
- Fallback to no custom rules if generation fails (graceful degradation)

---

## 🔗 Related Files

- Implementation Plan: `/root/AuroraCraft/opencode-knowledge/IMPLEMENTATION_PLAN.md`
- Platform Research: `/root/AuroraCraft/opencode-knowledge/PLATFORM_RESEARCH.md`
- Generator Service: `/root/AuroraCraft/server/src/utils/opencode-knowledge.ts`
- Scraped Docs: `/root/AuroraCraft/Kodari-Codella-Documentation/`

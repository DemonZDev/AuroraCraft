# OpenCode Rules & Skills Implementation Plan
## AuroraCraft Dynamic Knowledge System

This document outlines the complete implementation of the dynamic OpenCode Rules & Skills generation system.

---

## System Overview

When a user sends a message to the AI, the backend will:
1. Read project configuration (software, compiler, language, Java version)
2. Generate custom Rules file from templates + platform-specific fragments
3. Generate custom Skills based on project type
4. Write Rules & Skills to isolated OpenCode config directory
5. Start OpenCode with these rules/skills loaded
6. OpenCode follows structured workflow with project-specific knowledge

---

## File Structure

```
/root/AuroraCraft/
├── opencode-knowledge/
│   ├── PLATFORM_RESEARCH.md           ← Platform comparison reference
│   ├── rules/
│   │   ├── TEMPLATE_BASE.md           ← Base rules template with placeholders
│   │   └── fragments/
│   │       ├── paper-api.md           ← Paper-specific API rules
│   │       ├── folia-api.md           ← Folia threading rules
│   │       ├── spigot-api.md          ← Spigot API rules
│   │       ├── purpur-api.md          ← Purpur config rules
│   │       ├── velocity-api.md        ← Velocity proxy rules
│   │       ├── bungeecord-api.md      ← BungeeCord proxy rules
│   │       ├── maven-build.md         ← Maven build rules
│   │       ├── gradle-build.md        ← Gradle build rules
│   │       ├── java-rules.md          ← Java-specific rules
│   │       └── kotlin-rules.md        ← Kotlin-specific rules
│   └── skills/
│       ├── database-setup/SKILL.md    ← HikariCP database setup
│       ├── gui-inventory/SKILL.md     ← Interactive GUI menus
│       ├── command-framework/SKILL.md ← Command system
│       ├── config-management/SKILL.md ← YAML config handling
│       ├── async-operations/SKILL.md  ← Async patterns
│       ├── event-handling/SKILL.md    ← Event listener patterns
│       ├── scheduler-tasks/SKILL.md   ← Task scheduling
│       └── paper-components/SKILL.md  ← Adventure API usage
│
├── server/src/utils/
│   ├── opencode-knowledge.ts         ← Rules & Skills generator
│   └── opencode-mcp.ts                ← Existing MCP helpers
│
└── server/src/bridges/
    └── opencode-process-manager.ts    ← Modified to call generator
```

---

## Implementation Steps

### Phase 1: Complete Knowledge Base (IN PROGRESS)

**Status:** 40% complete

**Completed:**
- ✅ Platform research (all 18 platforms)
- ✅ Base rules template with placeholders
- ✅ Gradle build fragment
- ✅ Maven build fragment
- ✅ Paper API fragment
- ✅ Folia API fragment
- ✅ Database setup skill
- ✅ GUI inventory skill

**Remaining:**
- [ ] Spigot API fragment
- [ ] Purpur API fragment
- [ ] Velocity API fragment
- [ ] BungeeCord API fragment
- [ ] Java-specific rules
- [ ] Kotlin-specific rules
- [ ] Command framework skill
- [ ] Config management skill
- [ ] Async operations skill
- [ ] Event handling skill
- [ ] Scheduler tasks skill
- [ ] Paper components skill

**Estimated Time:** 2-3 hours

---

### Phase 2: Generator Service

**File:** `server/src/utils/opencode-knowledge.ts`

**Functions:**
1. `generateRules(project)` - Assembles rules from template + fragments
2. `generateSkills(project)` - Copies relevant skills
3. `writeToIsolatedConfig(user, linkId, rules, skills)` - Writes to isolated directory
4. `getFragmentPath(software, compiler, language)` - Determines which fragments to load

**Pseudo-code:**
```typescript
export async function generateOpenCodeKnowledge(project: Project) {
  // 1. Load base template
  const baseTemplate = await readFile('opencode-knowledge/rules/TEMPLATE_BASE.md');
  
  // 2. Determine which fragments to load
  const fragments = [];
  
  // API fragment based on software
  if (project.software === 'paper') fragments.push('paper-api.md');
  if (project.software === 'folia') fragments.push('folia-api.md', 'paper-api.md');
  if (project.software === 'purpur') fragments.push('purpur-api.md', 'paper-api.md');
  // ... etc for all 18 platforms
  
  // Build system fragment
  if (project.compiler === 'maven') fragments.push('maven-build.md');
  if (project.compiler === 'gradle') fragments.push('gradle-build.md');
  
  // Language fragment
  if (project.language === 'java') fragments.push('java-rules.md');
  if (project.language === 'kotlin') fragments.push('kotlin-rules.md');
  
  // 3. Load and merge fragments
  const fragmentContents = await Promise.all(
    fragments.map(f => readFile(`opencode-knowledge/rules/fragments/${f}`))
  );
  
  // 4. Replace placeholders in template
  const rules = baseTemplate
    .replace('{SOFTWARE}', project.software)
    .replace('{COMPILER}', project.compiler)
    .replace('{LANGUAGE}', project.language)
    .replace('{JAVA_VERSION}', project.javaVersion)
    .replace('{API_RULES}', fragmentContents.join('\n\n'))
    // ... more replacements
  
  // 5. Copy relevant skills
  const skills = ['database-setup', 'gui-inventory', 'command-framework', 'config-management'];
  
  // 6. Write to isolated config
  const configPath = `/var/lib/auroracraft/configs/${user}/${linkId}/.opencode`;
  await writeRulesAndSkills(configPath, rules, skills);
  
  return { rulesPath: `${configPath}/AGENTS.md`, skillsPath: `${configPath}/skills` };
}
```

**Estimated Time:** 3-4 hours

---

### Phase 3: Integration with OpenCode Process Manager

**File:** `server/src/bridges/opencode-process-manager.ts`

**Modification:**
```typescript
// Before spawning OpenCode
const { rulesPath, skillsPath } = await generateOpenCodeKnowledge(project);

// OpenCode will auto-load AGENTS.md and skills/ from HOME directory
// HOME is already set to isolated config directory
```

**Estimated Time:** 1 hour

---

### Phase 4: Testing & Iteration

**Test Cases:**
1. Paper + Maven + Java → Verify correct rules generated
2. Folia + Gradle + Kotlin → Verify Folia scheduler rules included
3. Velocity + Maven + Java → Verify proxy-specific rules
4. Purpur + Gradle + Java → Verify Purpur config options mentioned

**Verification:**
- Check generated AGENTS.md contains correct API packages
- Check skills directory has correct SKILL.md files
- Test OpenCode actually loads and follows rules
- Verify compilation succeeds with generated code
- Check AI follows structured workflow (research → plan → build → compile → document)

**Estimated Time:** 4-5 hours

---

## Total Estimated Time

- Phase 1: 2-3 hours
- Phase 2: 3-4 hours
- Phase 3: 1 hour
- Phase 4: 4-5 hours

**Total: 10-13 hours**

---

## Placeholder Reference

### Template Placeholders

| Placeholder | Example Value | Source |
|-------------|---------------|--------|
| `{SOFTWARE}` | `paper` | `project.software` |
| `{COMPILER}` | `maven` | `project.compiler` |
| `{LANGUAGE}` | `java` | `project.language` |
| `{JAVA_VERSION}` | `21` | `project.javaVersion` |
| `{API_VERSION}` | `1.21` | Derived from software |
| `{API_PACKAGE}` | `io.papermc.paper` | Derived from software |
| `{DEPENDENCY_SCOPE}` | `provided` (Maven) or `compileOnly` (Gradle) | Derived from compiler |
| `{REPOSITORY_URL}` | `https://repo.papermc.io/...` | Derived from software |
| `{BUILD_COMMAND}` | `mvn clean package` or `./gradlew shadowJar` | Derived from compiler |
| `{MAIN_CLASS}` | Project name in PascalCase | Derived from project name |
| `{PACKAGE_PREFIX}` | `com.example` | From project config or default |
| `{PACKAGE_PATH}` | `com/example/myplugin` | Derived from package |
| `{FOLIA_RULES}` | Folia fragment or empty | Conditional on software |
| `{MESSAGE_API_RULE}` | Adventure or ChatColor | Conditional on software |
| `{RESEARCH_INSTRUCTION}` | Firecrawl or built-in | Conditional on user tier |

---

## Next Steps

1. **Complete remaining fragments** (Spigot, Purpur, Velocity, BungeeCord, Java, Kotlin)
2. **Complete remaining skills** (Command, Config, Async, Event, Scheduler, Components)
3. **Build generator service** (`opencode-knowledge.ts`)
4. **Integrate with process manager**
5. **Test with real projects**
6. **Iterate based on AI output quality**

---

## Success Criteria

✅ AI generates plugins that compile on first try
✅ AI follows structured workflow (research → plan → build → compile → doc)
✅ AI uses correct API for selected platform
✅ AI uses correct build system syntax
✅ AI completes all to-do items before reporting done
✅ Generated code follows best practices from scraped docs
✅ No common errors (wrong scope, missing repository, SQL injection, etc.)

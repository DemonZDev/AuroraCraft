import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { Project } from '../db/schema/projects.js';

interface OpenCodeKnowledge {
  rulesPath: string;
  skillsPath: string;
}

interface PlatformConfig {
  apiPackage: string;
  apiVersion: string;
  repository: string;
  groupId: string;
  artifactId: string;
  messageApi: 'adventure' | 'legacy';
  requiresFolia: boolean;
}

const KNOWLEDGE_BASE = '/root/AuroraCraft/opencode-knowledge';
const CONFIG_BASE = '/var/lib/auroracraft/configs';

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  // ── Paper lineage ──
  paper: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  purpur: {
    apiPackage: 'org.purpurmc.purpur', apiVersion: '1.21',
    repository: 'https://repo.purpurmc.org/snapshots',
    groupId: 'org.purpurmc.purpur', artifactId: 'purpur-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  pufferfish: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  folia: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: true,
  },
  leaf: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  leaves: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  divinemc: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  pluto: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  aspaper: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },

  // ── Spigot ──
  spigot: {
    apiPackage: 'org.spigotmc', apiVersion: '1.21',
    repository: 'https://hub.spigotmc.org/nexus/content/repositories/snapshots/',
    groupId: 'org.spigotmc', artifactId: 'spigot-api',
    messageApi: 'legacy', requiresFolia: false,
  },

  // ── Hybrid (Forge + Bukkit) ──
  mohist: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  arclight: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  magma: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.12',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'legacy', requiresFolia: false,
  },
  youer: {
    apiPackage: 'io.papermc.paper', apiVersion: '1.21',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'io.papermc.paper', artifactId: 'paper-api',
    messageApi: 'adventure', requiresFolia: false,
  },

  // ── Proxy ──
  velocity: {
    apiPackage: 'com.velocitypowered', apiVersion: '3.5',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'com.velocitypowered', artifactId: 'velocity-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  'velocity-ctd': {
    apiPackage: 'com.velocitypowered', apiVersion: '3.5',
    repository: 'https://repo.papermc.io/repository/maven-public/',
    groupId: 'com.velocitypowered', artifactId: 'velocity-api',
    messageApi: 'adventure', requiresFolia: false,
  },
  bungeecord: {
    apiPackage: 'net.md-5', apiVersion: '1.21',
    repository: 'https://oss.sonatype.org/content/repositories/snapshots',
    groupId: 'net.md-5', artifactId: 'bungeecord-api',
    messageApi: 'legacy', requiresFolia: false,
  },
  waterfall: {
    apiPackage: 'net.md-5', apiVersion: '1.20',
    repository: 'https://oss.sonatype.org/content/repositories/snapshots',
    groupId: 'net.md-5', artifactId: 'bungeecord-api',
    messageApi: 'legacy', requiresFolia: false,
  },
};

function getPlatformConfig(software: string): PlatformConfig {
  const config = PLATFORM_CONFIGS[software.toLowerCase()];
  if (!config) {
    console.warn(`Unknown platform ${software}, falling back to Paper config`);
    return PLATFORM_CONFIGS.paper;
  }
  return config;
}

function getRequiredFragments(project: Project): { apiFragments: string[]; buildFragments: string[]; languageFragments: string[] } {
  const apiFragments: string[] = [];
  const buildFragments: string[] = [];
  const languageFragments: string[] = [];

  const software = project.software.toLowerCase();

  // ── API fragments ──
  if (software === 'folia') {
    apiFragments.push('folia-api.md', 'paper-api.md');
  } else if (['paper', 'pufferfish', 'leaf', 'leaves', 'divinemc', 'pluto', 'aspaper'].includes(software)) {
    apiFragments.push('paper-api.md');
  } else if (software === 'purpur') {
    apiFragments.push('paper-api.md', 'purpur-api.md');
  } else if (software === 'spigot') {
    apiFragments.push('spigot-api.md');
  } else if (software === 'velocity' || software === 'velocity-ctd') {
    apiFragments.push('velocity-api.md');
  } else if (['bungeecord', 'waterfall'].includes(software)) {
    apiFragments.push('bungeecord-api.md');
  } else if (['mohist', 'arclight', 'magma', 'youer'].includes(software)) {
    apiFragments.push('paper-api.md');
  }

  // ── Build fragments ──
  if (project.compiler === 'maven') {
    buildFragments.push('maven-build.md');
  } else if (project.compiler === 'gradle') {
    buildFragments.push('gradle-build.md');
  }

  // ── Language fragments ──
  if (project.language === 'java') languageFragments.push('java-rules.md');
  if (project.language === 'kotlin') languageFragments.push('kotlin-rules.md');

  return { apiFragments, buildFragments, languageFragments };
}

async function loadFragments(names: string[]): Promise<string> {
  const contents = await Promise.all(
    names.map(async (name) => {
      const path = join(KNOWLEDGE_BASE, 'rules', 'fragments', name);
      if (existsSync(path)) return await readFile(path, 'utf-8');
      console.warn(`Fragment not found: ${name}`);
      return '';
    })
  );
  return contents.filter(Boolean).join('\n\n---\n\n');
}

function replacePlaceholders(
  template: string,
  project: Project,
  apiRules: string,
  buildRules: string,
  languageRules: string,
): string {
  const platformConfig = getPlatformConfig(project.software);
  const mainClass = project.name.replace(/[^a-zA-Z0-9]/g, '');
  const packagePrefix = 'com.example';
  const packagePath = `${packagePrefix}/${mainClass.toLowerCase()}`.replace(/\./g, '/');

  const dependencyScope = project.compiler === 'maven' ? 'provided' : 'compileOnly';
  const buildCommand = project.compiler === 'maven'
    ? 'mvn clean package'
    : './gradlew shadowJar';

  const researchInstruction = 'Use Firecrawl MCP if available (paid users), otherwise use built-in web search';

  const foliaRules = platformConfig.requiresFolia
    ? '\n\n### CRITICAL: Folia Threading Rules\n\nThis is a Folia server. See Folia-specific rules below.'
    : '';

  const messageApiRule = platformConfig.messageApi === 'adventure'
    ? 'Use Adventure Components (Component.text()) and MiniMessage'
    : 'Use legacy ChatColor (ChatColor.RED + "message")';

  return template
    .replace(/\{SOFTWARE\}/g, project.software)
    .replace(/\{COMPILER\}/g, project.compiler)
    .replace(/\{LANGUAGE\}/g, project.language)
    .replace(/\{JAVA_VERSION\}/g, project.javaVersion)
    .replace(/\{API_VERSION\}/g, platformConfig.apiVersion)
    .replace(/\{API_PACKAGE\}/g, platformConfig.apiPackage)
    .replace(/\{DEPENDENCY_SCOPE\}/g, dependencyScope)
    .replace(/\{REPOSITORY_URL\}/g, platformConfig.repository)
    .replace(/\{BUILD_COMMAND\}/g, buildCommand)
    .replace(/\{MAIN_CLASS\}/g, mainClass)
    .replace(/\{PACKAGE_PREFIX\}/g, packagePrefix)
    .replace(/\{PACKAGE_PATH\}/g, packagePath)
    .replace(/\{API_RULES\}/g, apiRules)
    .replace(/\{BUILD_RULES\}/g, buildRules)
    .replace(/\{LANGUAGE_RULES\}/g, languageRules)
    .replace(/\{FOLIA_RULES\}/g, foliaRules)
    .replace(/\{MESSAGE_API_RULE\}/g, messageApiRule)
    .replace(/\{RESEARCH_INSTRUCTION\}/g, researchInstruction);
}

export async function generateOpenCodeKnowledge(
  project: Project,
  username: string
): Promise<OpenCodeKnowledge> {
  try {
    const templatePath = join(KNOWLEDGE_BASE, 'rules', 'TEMPLATE_BASE.md');
    const baseTemplate = await readFile(templatePath, 'utf-8');

    const { apiFragments, buildFragments, languageFragments } = getRequiredFragments(project);

    const [apiRules, buildRules, languageRules] = await Promise.all([
      loadFragments(apiFragments),
      loadFragments(buildFragments),
      loadFragments(languageFragments),
    ]);

    const rules = replacePlaceholders(baseTemplate, project, apiRules, buildRules, languageRules);

    // Write to .config/opencode/ under the isolated HOME directory
    // OpenCode auto-discovers AGENTS.md and skills/ from ~/.config/opencode/
    const isolatedHome = join(CONFIG_BASE, `auroracraft-${username.toLowerCase()}`, project.linkId!);
    const opencodeConfigDir = join(isolatedHome, '.config', 'opencode');
    const rulesPath = join(opencodeConfigDir, 'AGENTS.md');
    const skillsDir = join(opencodeConfigDir, 'skills');

    await mkdir(opencodeConfigDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });

    await writeFile(rulesPath, rules, 'utf-8');

    const skillsToCopy = [
      'database-setup', 'gui-inventory', 'command-framework',
      'config-management', 'async-operations', 'event-handling',
      'scheduler-tasks', 'paper-components',
    ];

    for (const skillName of skillsToCopy) {
      const sourcePath = join(KNOWLEDGE_BASE, 'skills', skillName);
      const destPath = join(skillsDir, skillName);

      if (existsSync(sourcePath)) {
        await mkdir(destPath, { recursive: true });
        const skillFile = join(sourcePath, 'SKILL.md');
        if (existsSync(skillFile)) {
          await copyFile(skillFile, join(destPath, 'SKILL.md'));
        }
      }
    }

    console.log(`Generated OpenCode knowledge for ${project.name} (${project.software}/${project.compiler})`);
    console.log(`  Rules: ${rulesPath}`);
    console.log(`  Skills: ${skillsDir}`);

    return { rulesPath, skillsPath: skillsDir };
  } catch (error) {
    console.error('Failed to generate OpenCode knowledge:', error);
    throw error;
  }
}

export async function cleanupOpenCodeKnowledge(username: string, linkId: string): Promise<void> {
  const configDir = join(CONFIG_BASE, `auroracraft-${username.toLowerCase()}`, linkId, '.config', 'opencode');

  try {
    const { rm } = await import('fs/promises');
    await rm(configDir, { recursive: true, force: true });
    console.log(`Cleaned up OpenCode knowledge: ${configDir}`);
  } catch (error) {
    console.error('Failed to cleanup OpenCode knowledge:', error);
  }
}

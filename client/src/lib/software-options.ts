/** Minecraft Server Software Platforms supported by AuroraCraft */
export const SOFTWARE_CATEGORIES = [
  {
    id: 'game-servers',
    label: 'Game Servers',
    description: 'Core Minecraft world servers with plugin support',
    color: 'bg-emerald-500/10 border-emerald-500/20',
    iconColor: 'text-emerald-400',
    options: [
      { value: 'paper', label: 'Paper', description: 'The industry standard — high performance, stable, most plugins' },
      { value: 'purpur', label: 'Purpur', description: 'Paper + 400+ gameplay config options (rideable mobs, etc.)' },
      { value: 'pufferfish', label: 'Pufferfish', description: 'Paper optimized for 100+ players (DAB, SIMD)' },
      { value: 'folia', label: 'Folia', description: 'Paper with regionized multi-threading for massive servers' },
      { value: 'spigot', label: 'Spigot', description: 'Legacy Bukkit fork — maximum plugin compatibility' },
      { value: 'leaf', label: 'Leaf', description: 'Paper fork balancing performance, vanilla parity & stability' },
      { value: 'leaves', label: 'Leaves', description: 'Paper fork repairing broken vanilla redstone/mechanics' },
      { value: 'divinemc', label: 'DivineMC', description: 'Purpur fork with parallel ticking, async ops, 1024-bit seeds' },
      { value: 'pluto', label: 'Pluto', description: 'Pufferfish fork with memory, hopper & farm optimizations' },
      { value: 'aspaper', label: 'ASPaper', description: 'Paper with Slime World Manager built-in for instancing' },
    ],
  },
  {
    id: 'hybrid-servers',
    label: 'Hybrid Servers',
    description: 'Run Forge/NeoForge/Fabric mods + Bukkit plugins together',
    color: 'bg-purple-500/10 border-purple-500/20',
    iconColor: 'text-purple-400',
    options: [
      { value: 'mohist', label: 'Mohist', description: 'Forge + Bukkit/Spigot/Paper APIs (formerly Thermos)' },
      { value: 'arclight', label: 'Arclight', description: 'Bukkit on Forge/NeoForge/Fabric via Mixin remapping' },
      { value: 'magma', label: 'Magma', description: 'NeoForge + Spigot — next-gen hybrid server' },
      { value: 'youer', label: 'Youer', description: 'NeoForge + Paper/Purpur API (MohistMC successor)' },
    ],
  },
  {
    id: 'proxies',
    label: 'Proxy Servers',
    description: 'Connect multiple backend servers into a network',
    color: 'bg-blue-500/10 border-blue-500/20',
    iconColor: 'text-blue-400',
    options: [
      { value: 'velocity', label: 'Velocity', description: 'Modern, secure, high-performance proxy (recommended)' },
      { value: 'bungeecord', label: 'BungeeCord', description: 'Legacy proxy — mature but slower development' },
      { value: 'waterfall', label: 'Waterfall', description: 'Paper-maintained BungeeCord fork (discontinued)' },
      { value: 'velocity-ctd', label: 'Velocity-CTD', description: 'Velocity fork with queues, extra commands & fixes' },
    ],
  },
] as const

/** Flat list of all software options for filters and simple selects */
export const ALL_SOFTWARE_OPTIONS = SOFTWARE_CATEGORIES.flatMap((cat) =>
  cat.options.map((opt) => ({ ...opt, category: cat.label }))
)

/** Simple value→label map */
export const SOFTWARE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_SOFTWARE_OPTIONS.map((o) => [o.value, o.label])
)

/** Get the category ID for a given software value */
export function getSoftwareCategory(softwareValue: string): { id: string; label: string } | null {
  for (const cat of SOFTWARE_CATEGORIES) {
    if (cat.options.some((opt) => opt.value === softwareValue)) {
      return { id: cat.id, label: cat.label }
    }
  }
  return null
}

/** Get all software values within the same category as the given software */
export function getSameCategorySoftware(softwareValue: string): string[] {
  const category = getSoftwareCategory(softwareValue)
  if (!category) return []
  const cat = SOFTWARE_CATEGORIES.find((c) => c.id === category.id)
  return cat?.options.map((o) => o.value) ?? []
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import {
  Sparkles,

  Blocks,
  Code2,
  Shield,
  Puzzle,
  ArrowRight,
  Zap,
  Terminal,
  ChevronRight,
  Cpu,
  GitBranch,
  MessageSquare,
  Play,
  Layers,
  Server,
  Rocket,
} from 'lucide-react'

/* ═══════════════════════════════════════
   Ambient Particle Background
   ═══════════════════════════════════════ */
function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = window.innerWidth
    let h = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio, 2)
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const particles: Array<{
      x: number; y: number; r: number; dx: number; dy: number; opacity: number; speed: number
    }> = []
    const PARTICLE_COUNT = Math.min(60, Math.floor(w * h / 25000))

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.3,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.4 + 0.1,
        speed: Math.random() * 0.5 + 0.2,
      })
    }

    let animId: number
    const animate = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.dx * p.speed
        p.y += p.dy * p.speed
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(148, 163, 184, ${p.opacity})`
        ctx.fill()
      }

      // Draw faint connection lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 150) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(148, 163, 184, ${0.04 * (1 - dist / 150)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity: 0.6 }}
    />
  )
}

/* ═══════════════════════════════════════
   Scroll Reveal Hook
   ═══════════════════════════════════════ */
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(el)
        }
      },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, isVisible }
}

/* ═══════════════════════════════════════
   Glass Card Component
   ═══════════════════════════════════════ */
function GlassCard({
  children,
  className = '',
  hover = true,
  delay = 0,
  isVisible = true,
}: {
  children: React.ReactNode
  className?: string
  hover?: boolean
  delay?: number
  isVisible?: boolean
}) {
  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border border-[#1e1e2e]/60
        bg-[#0f0f14]/60 backdrop-blur-xl
        transition-all duration-700 ease-out
        ${hover ? 'hover:border-[#2a2a3d]/80 hover:bg-[#161621]/70 hover:-translate-y-1 hover:shadow-[0_8px_32px_-8px_rgba(59,130,246,0.08)]' : ''}
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Subtle top highlight */}
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/20 to-transparent" />
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════
   Feature Data
   ═══════════════════════════════════════ */
const features = [
  {
    icon: Sparkles,
    title: 'AI Workspace',
    description: 'Chat with AI to plan, architect, and generate complete plugin code with intelligent context awareness.',
    accent: 'from-blue-500/10 to-blue-600/5',
    iconColor: 'text-blue-400',
  },
  {
    icon: Terminal,
    title: 'Live Editor',
    description: 'Full code editor with syntax highlighting, file tree, and real-time AI-powered file operations.',
    accent: 'from-emerald-500/10 to-emerald-600/5',
    iconColor: 'text-emerald-400',
  },
  {
    icon: Blocks,
    title: 'Multi-Platform',
    description: 'Paper, Spigot, Bukkit, Velocity — Java or Kotlin, Maven or Gradle. Your stack, your choice.',
    accent: 'from-amber-500/10 to-amber-600/5',
    iconColor: 'text-amber-400',
  },
  {
    icon: GitBranch,
    title: 'Git Integration',
    description: 'Connect your GitHub repositories. Push, reset, and review code with seamless version control.',
    accent: 'from-purple-500/10 to-purple-600/5',
    iconColor: 'text-purple-400',
  },
  {
    icon: Cpu,
    title: 'Code Review',
    description: 'AI-powered code review with CodeRabbit integration. Catch issues before they reach production.',
    accent: 'from-rose-500/10 to-rose-600/5',
    iconColor: 'text-rose-400',
  },
  {
    icon: Layers,
    title: 'Project System',
    description: 'Organize plugins with workspaces, configurations, and intelligent project scaffolding.',
    accent: 'from-cyan-500/10 to-cyan-600/5',
    iconColor: 'text-cyan-400',
  },
]

/* ═══════════════════════════════════════
   Workflow Steps
   ═══════════════════════════════════════ */
const workflowSteps = [
  {
    icon: MessageSquare,
    label: 'Describe',
    desc: 'Tell the AI what plugin you want',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    icon: Zap,
    label: 'Generate',
    desc: 'AI creates the complete codebase',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    icon: Code2,
    label: 'Edit',
    desc: 'Refine in the live code editor',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: Shield,
    label: 'Review',
    desc: 'AI reviews for issues and bugs',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
  },
  {
    icon: Rocket,
    label: 'Deploy',
    desc: 'Push to GitHub and build',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
]

/* ═══════════════════════════════════════
   Terminal Code Snippet
   ═══════════════════════════════════════ */
function TerminalSnippet({ isVisible }: { isVisible: boolean }) {
  const lines = [
    { text: '> auroracraft init --name "EpicPvP" --platform paper', color: 'text-[#a1a1aa]' },
    { text: '✓ Project scaffolded in 0.8s', color: 'text-emerald-400', indent: true },
    { text: '', color: '' },
    { text: '> auroracraft chat "Create a ranked PvP system with ELO"', color: 'text-[#a1a1aa]' },
    { text: '✓ Generated 12 files', color: 'text-emerald-400', indent: true },
    { text: '✓ RankedArena.java', color: 'text-[#71717a]', indent: true, sub: true },
    { text: '✓ EloCalculator.java', color: 'text-[#71717a]', indent: true, sub: true },
    { text: '✓ MatchManager.java', color: 'text-[#71717a]', indent: true, sub: true },
    { text: '', color: '' },
    { text: '> auroracraft review', color: 'text-[#a1a1aa]' },
    { text: '✓ 0 critical issues', color: 'text-emerald-400', indent: true },
    { text: '⚡ 2 optimizations suggested', color: 'text-amber-400', indent: true },
    { text: '', color: '' },
    { text: '> auroracraft push', color: 'text-[#a1a1aa]' },
    { text: '✓ Committed and pushed to origin/main', color: 'text-emerald-400', indent: true },
  ]

  return (
    <div
      className={cn(
        'relative rounded-2xl border border-[#1e1e2e]/80 bg-[#0a0a0f]/90 backdrop-blur-xl shadow-2xl transition-all duration-1000 ease-out max-w-full overflow-hidden',
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 invisible'
      )}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-[#1e1e2e]/60 px-3 py-2 md:px-5 md:py-3">
        <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-[#ef4444]/80 shrink-0" />
        <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-[#f59e0b]/80 shrink-0" />
        <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-[#22c55e]/80 shrink-0" />
        <span className="ml-2 md:ml-3 text-[11px] md:text-xs text-[#71717a] font-mono truncate">auroracraft — zsh</span>
      </div>
      <div className="overflow-x-auto p-3 md:p-5 font-mono text-xs md:text-sm leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'whitespace-nowrap transition-all duration-500 ease-out',
              line.indent && 'pl-4',
              line.sub && 'pl-8',
              isVisible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 invisible'
            )}
            style={{ transitionDelay: `${800 + i * 80}ms` }}
          >
            <span className={line.color}>{line.text}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center gap-2 whitespace-nowrap">
          <span className="text-[#3b82f6]">❯</span>
          <span className="inline-block h-4 w-2 animate-pulse bg-[#a1a1aa]" />
        </div>
      </div>
      {/* Glass reflection */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/20 to-transparent" />
    </div>
  )
}

/* ═══════════════════════════════════════
   Main Home Page
   ═══════════════════════════════════════ */
export default function HomePage() {
  const heroReveal = useScrollReveal(0.1)
  const featuresReveal = useScrollReveal(0.08)
  const workflowReveal = useScrollReveal(0.1)
  const ctaReveal = useScrollReveal(0.15)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    })
  }, [])

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#09090b]">
      <AmbientBackground />

      {/* ═══════════════════════════════════
          Hero Section
          ═══════════════════════════════════ */}
      <section
        ref={heroReveal.ref}
        className="relative pt-32 pb-20 lg:pt-48 lg:pb-32"
        onMouseMove={handleMouseMove}
      >
        {/* Ambient light orbs */}
        <div
          className="pointer-events-none absolute h-[600px] w-[600px] rounded-full opacity-[0.07] blur-[120px] transition-all duration-[2000ms] ease-out"
          style={{
            background: 'radial-gradient(circle, #3b82f6, transparent 70%)',
            left: `${mousePos.x * 0.3}%`,
            top: `${mousePos.y * 0.3}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
        <div
          className="pointer-events-none absolute right-0 top-20 h-[400px] w-[400px] rounded-full opacity-[0.05] blur-[100px]"
          style={{
            background: 'radial-gradient(circle, #8b5cf6, transparent 70%)',
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-16 lg:grid-cols-2 lg:gap-12 items-center">
            {/* Left: Text */}
            <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
              {/* Badge */}
              <div
                className={`
                  mb-8 inline-flex items-center gap-2.5 rounded-full
                  border border-[#1e1e2e]/80 bg-[#0f0f14]/80 backdrop-blur-md px-5 py-2 text-sm text-[#a1a1aa]
                  transition-all duration-700 ease-out
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
                `}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                AI-Powered Minecraft Plugin Development
              </div>

              {/* Headline */}
              <h1
                className={`
                  text-5xl font-bold tracking-tight text-[#f4f4f5] sm:text-6xl lg:text-7xl
                  transition-all duration-1000 ease-out
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
                `}
                style={{ transitionDelay: '150ms' }}
              >
                Build plugins{' '}
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-[#3b82f6] via-[#60a5fa] to-[#3b82f6] bg-clip-text text-transparent">
                    with AI
                  </span>
                  <svg
                    className="absolute -bottom-2 left-0 w-full"
                    viewBox="0 0 200 8"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2 6C50 2 150 2 198 6"
                      stroke="url(#underline)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      className={`transition-all duration-1000 ease-out ${heroReveal.isVisible ? 'opacity-100' : 'opacity-0'}`}
                      style={{ transitionDelay: '800ms' }}
                    />
                    <defs>
                      <linearGradient id="underline" x1="0" y1="0" x2="200" y2="0">
                        <stop stopColor="#3b82f6" stopOpacity="0" />
                        <stop offset="0.5" stopColor="#3b82f6" />
                        <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>

              {/* Subtitle */}
              <p
                className={`
                  mt-8 text-lg leading-relaxed text-[#a1a1aa] sm:text-xl
                  transition-all duration-1000 ease-out
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
                `}
                style={{ transitionDelay: '300ms' }}
              >
                A next-generation workspace for Minecraft developers.
                Plan, generate, edit, and deploy plugins with intelligent AI assistance.
              </p>

              {/* CTAs */}
              <div
                className={`
                  mt-10 flex flex-wrap items-center justify-center gap-4 lg:justify-start
                  transition-all duration-1000 ease-out
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
                `}
                style={{ transitionDelay: '450ms' }}
              >
                <Link
                  to="/register"
                  className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-xl bg-[#3b82f6] px-7 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#2563eb] hover:shadow-[0_0_32px_-8px_rgba(59,130,246,0.4)] active:scale-[0.98]"
                >
                  <span className="relative z-10">Start Building</span>
                  <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </Link>
                <Link
                  to="/docs"
                  className="group inline-flex items-center gap-2 rounded-xl border border-[#1e1e2e]/80 bg-[#0f0f14]/60 px-7 py-3.5 text-sm font-medium text-[#a1a1aa] backdrop-blur-md transition-all duration-300 hover:border-[#2a2a3d]/80 hover:bg-[#161621]/80 hover:text-[#f4f4f5]"
                >
                  Read Documentation
                  <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </div>

              {/* Stats row */}
              <div
                className={`
                  mt-16 flex items-center justify-center gap-8 border-t border-[#1e1e2e]/60 pt-8 lg:justify-start
                  transition-all duration-1000 ease-out
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
                `}
                style={{ transitionDelay: '600ms' }}
              >
                {[
                  { value: '0s', label: 'Setup time' },
                  { value: 'AI', label: 'Code generation' },
                  { value: 'Git', label: 'Version control' },
                ].map((stat) => (
                  <div key={stat.label} className="group cursor-default">
                    <div className="text-2xl font-bold text-[#f4f4f5] transition-colors duration-300 group-hover:text-[#3b82f6]">
                      {stat.value}
                    </div>
                    <div className="mt-0.5 text-xs text-[#71717a]">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Terminal + Floating Cards */}
            <div className="relative hidden xl:block">
              <TerminalSnippet isVisible={heroReveal.isVisible} />

              {/* Floating accent cards */}
              <div
                className={cn(
                  'absolute right-2 top-[-1rem] xl:-right-4 xl:-top-6 rounded-xl border border-[#1e1e2e]/60 bg-[#0f0f14]/80 backdrop-blur-xl px-3 py-2 xl:px-4 xl:py-3 shadow-xl transition-all duration-1000 ease-out',
                  heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 invisible'
                )}
                style={{ transitionDelay: '1200ms' }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#f4f4f5]">AI Assistant</div>
                    <div className="text-[11px] text-[#71717a]">Ready to help</div>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  'absolute left-2 bottom-4 xl:-left-8 xl:bottom-12 rounded-xl border border-[#1e1e2e]/60 bg-[#0f0f14]/80 backdrop-blur-xl px-3 py-2 xl:px-4 xl:py-3 shadow-xl transition-all duration-1000 ease-out',
                  heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 invisible'
                )}
                style={{ transitionDelay: '1400ms' }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Server className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#f4f4f5]">Build Ready</div>
                    <div className="text-[11px] text-[#71717a]">Maven + Gradle</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          Features Section
          ═══════════════════════════════════ */}
      <section ref={featuresReveal.ref} className="relative py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="mx-auto max-w-2xl text-center">
            <div
              className={`
                mb-4 inline-flex items-center gap-2 rounded-full border border-[#1e1e2e]/60
                bg-[#0f0f14]/60 px-4 py-1.5 text-xs font-medium text-[#71717a] backdrop-blur-md
                transition-all duration-700
                ${featuresReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
              `}
            >
              <Puzzle className="h-3.5 w-3.5" />
              Core Capabilities
            </div>
            <h2
              className={`
                text-3xl font-bold tracking-tight text-[#f4f4f5] sm:text-4xl lg:text-5xl
                transition-all duration-1000 ease-out
                ${featuresReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
              `}
              style={{ transitionDelay: '100ms' }}
            >
              Everything you need to{' '}
              <span className="text-[#3b82f6]">ship faster</span>
            </h2>
            <p
              className={`
                mt-5 text-lg text-[#a1a1aa]
                transition-all duration-1000 ease-out
                ${featuresReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
              `}
              style={{ transitionDelay: '200ms' }}
            >
              A complete development environment designed for Minecraft plugin engineers.
            </p>
          </div>

          {/* Feature Grid — Asymmetric */}
          <div className="mt-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <GlassCard
                key={feature.title}
                delay={i * 100}
                isVisible={featuresReveal.isVisible}
                className="group cursor-default p-7"
              >
                <div
                  className={`mb-5 inline-flex rounded-xl bg-gradient-to-br ${feature.accent} p-3 transition-transform duration-500 group-hover:scale-110`}
                >
                  <feature.icon className={`h-5 w-5 ${feature.iconColor}`} />
                </div>
                <h3 className="text-lg font-semibold text-[#f4f4f5] transition-colors duration-300 group-hover:text-[#3b82f6]">
                  {feature.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[#71717a] transition-colors duration-300 group-hover:text-[#a1a1aa]">
                  {feature.description}
                </p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          Workflow Section
          ═══════════════════════════════════ */}
      <section ref={workflowReveal.ref} className="relative py-24 lg:py-32">
        {/* Background accent */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0f0f14]/50 via-transparent to-[#0f0f14]/50" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div
              className={`
                mb-4 inline-flex items-center gap-2 rounded-full border border-[#1e1e2e]/60
                bg-[#0f0f14]/60 px-4 py-1.5 text-xs font-medium text-[#71717a] backdrop-blur-md
                transition-all duration-700
                ${workflowReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
              `}
            >
              <Play className="h-3.5 w-3.5" />
              How It Works
            </div>
            <h2
              className={`
                text-3xl font-bold tracking-tight text-[#f4f4f5] sm:text-4xl lg:text-5xl
                transition-all duration-1000 ease-out
                ${workflowReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
              `}
              style={{ transitionDelay: '100ms' }}
            >
              From idea to{' '}
              <span className="bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] bg-clip-text text-transparent">
                production
              </span>
            </h2>
            <p
              className={`
                mt-5 text-lg text-[#a1a1aa]
                transition-all duration-1000 ease-out
                ${workflowReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
              `}
              style={{ transitionDelay: '200ms' }}
            >
              A streamlined workflow that takes you from concept to deployed plugin in minutes.
            </p>
          </div>

          {/* Workflow Steps — Horizontal with connecting line */}
          <div className="mt-20">
            <div className="relative">
              {/* Connecting line */}
              <div className="absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-[#1e1e2e] to-transparent lg:block" />

              <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 lg:grid-cols-5">
                {workflowSteps.map((step, i) => (
                  <div
                    key={step.label}
                    className={cn(
                      'relative text-center transition-all duration-700 ease-out',
                      workflowReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
                    )}
                    style={{ transitionDelay: `${400 + i * 120}ms` }}
                  >
                    {/* Step number + icon */}
                    <div className="relative mx-auto mb-3 sm:mb-5 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center">
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#1e1e2e] to-[#0f0f14] opacity-60" />
                      <div className="absolute inset-0 rounded-2xl border border-[#1e1e2e]/80 backdrop-blur-sm" />
                      <step.icon className={cn('relative z-10 h-5 w-5 sm:h-6 sm:w-6', step.color)} />
                      {/* Step index badge */}
                      <div className="absolute -right-1 -top-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-[#0f0f14] border border-[#1e1e2e]/80 text-[9px] sm:text-[10px] font-bold text-[#71717a]">
                        {i + 1}
                      </div>
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-[#f4f4f5]">{step.label}</h3>
                    <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-[#71717a]">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom showcase card */}
          <div
            className={`
              mt-20
              transition-all duration-1000 ease-out
              ${workflowReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'}
            `}
            style={{ transitionDelay: '1000ms' }}
          >
            <div className="relative rounded-3xl border border-[#1e1e2e]/60 bg-[#0f0f14]/40 backdrop-blur-xl p-6 sm:p-8 lg:p-12">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/20 to-transparent" />
              <div className="grid gap-12 lg:grid-cols-2 items-center">
                <div>
                  <h3 className="text-2xl font-bold text-[#f4f4f5] sm:text-3xl">
                    Built for developers who care about{' '}
                    <span className="text-[#3b82f6]">quality</span>
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-[#a1a1aa]">
                    AuroraCraft combines a powerful AI workspace with a professional code editor,
                    git integration, and intelligent project management. No setup required.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-4">
                    {['Zero Config', 'Dark Mode', 'GitHub Sync', 'Code Review'].map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#1e1e2e]/60 bg-[#161621]/60 px-3.5 py-1.5 text-xs font-medium text-[#a1a1aa]"
                      >
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  {/* Decorative code block */}
                  <div className="rounded-xl border border-[#1e1e2e]/80 bg-[#0a0a0f]/80 p-3 sm:p-4 lg:p-6 font-mono text-[11px] sm:text-xs lg:text-sm shadow-2xl overflow-x-auto">
                    <div className="flex items-center gap-2 border-b border-[#1e1e2e]/60 pb-2 sm:pb-3 mb-2 sm:mb-4 min-w-max">
                      <div className="h-2 w-2 rounded-full bg-[#ef4444]/60 shrink-0" />
                      <div className="h-2 w-2 rounded-full bg-[#f59e0b]/60 shrink-0" />
                      <div className="h-2 w-2 rounded-full bg-[#22c55e]/60 shrink-0" />
                      <span className="ml-2 text-[10px] text-[#71717a] truncate">MainPlugin.java</span>
                    </div>
                    <div className="space-y-0.5 sm:space-y-1 text-[11px] sm:text-xs lg:text-[13px] leading-relaxed min-w-max">
                      <div className="whitespace-nowrap"><span className="text-purple-400">package</span> <span className="text-[#a1a1aa]">com.example.plugin;</span></div>
                      <div className="h-1.5 sm:h-2" />
                      <div className="whitespace-nowrap"><span className="text-purple-400">import</span> <span className="text-[#a1a1aa]">org.bukkit.plugin.java.JavaPlugin;</span></div>
                      <div className="h-1.5 sm:h-2" />
                      <div className="whitespace-nowrap"><span className="text-blue-400">public class</span> <span className="text-yellow-300">MainPlugin</span> <span className="text-blue-400">extends</span> <span className="text-yellow-300">JavaPlugin</span> {'{'}</div>
                      <div className="whitespace-nowrap pl-4"><span className="text-blue-400">@Override</span></div>
                      <div className="whitespace-nowrap pl-4"><span className="text-blue-400">public void</span> <span className="text-yellow-300">onEnable</span>() {'{'}</div>
                      <div className="whitespace-nowrap pl-8"><span className="text-[#71717a]">// AI-generated plugin initialized</span></div>
                      <div className="whitespace-nowrap pl-8"><span className="text-blue-400">this</span>.<span className="text-yellow-300">getLogger</span>().<span className="text-yellow-300">info</span>(<span className="text-green-400">&quot;Plugin enabled!&quot;</span>);</div>
                      <div className="whitespace-nowrap pl-4">{'}'}</div>
                      <div className="whitespace-nowrap">{'}'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          CTA Section
          ═══════════════════════════════════ */}
      <section ref={ctaReveal.ref} className="relative py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div
            className={`
              relative overflow-hidden rounded-3xl border border-[#1e1e2e]/60
              bg-gradient-to-br from-[#0f0f14]/80 to-[#161621]/60 backdrop-blur-xl p-12 text-center lg:p-16
              transition-all duration-1000 ease-out
              ${ctaReveal.isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-16 opacity-0 scale-[0.97]'}
            `}
          >
            {/* Animated gradient border */}
            <div className="absolute inset-0 rounded-3xl border border-[#1e1e2e]/40" />
            <div
              className="absolute inset-[-1px] rounded-3xl opacity-40"
              style={{
                background: 'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(59,130,246,0.15) 60deg, transparent 120deg, rgba(139,92,246,0.1) 180deg, transparent 240deg, rgba(59,130,246,0.15) 300deg, transparent 360deg)',
                animation: 'spin 8s linear infinite',
              }}
            />
            <div className="absolute inset-[1px] rounded-3xl bg-[#09090b]/95" />

            <div className="relative">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b82f6]/10 to-[#8b5cf6]/10 border border-[#1e1e2e]/60">
                <Rocket className="h-6 w-6 text-[#3b82f6]" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f5] sm:text-4xl">
                Ready to build something{' '}
                <span className="bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] bg-clip-text text-transparent">
                  epic?
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-lg text-[#a1a1aa]">
                Join the next generation of Minecraft plugin developers. Create your free account and start shipping today.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/register"
                  className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-xl bg-[#3b82f6] px-8 py-4 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#2563eb] hover:shadow-[0_0_40px_-8px_rgba(59,130,246,0.35)] active:scale-[0.98]"
                >
                  <span className="relative z-10">Create Free Account</span>
                  <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </Link>
                <Link
                  to="/community"
                  className="group inline-flex items-center gap-2 rounded-xl border border-[#1e1e2e]/80 bg-[#0f0f14]/60 px-8 py-4 text-sm font-medium text-[#a1a1aa] backdrop-blur-md transition-all duration-300 hover:border-[#2a2a3d]/80 hover:bg-[#161621]/80 hover:text-[#f4f4f5]"
                >
                  Explore Community
                  <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          Footer
          ═══════════════════════════════════ */}
      <footer className="border-t border-[#1e1e2e]/60 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3b82f6]/10">
                <Blocks className="h-4 w-4 text-[#3b82f6]" />
              </div>
              <span className="text-sm font-semibold text-[#f4f4f5]">AuroraCraft</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:gap-x-8 text-sm text-[#71717a]">
              <Link to="/docs" className="transition-colors duration-200 hover:text-[#a1a1aa]">Docs</Link>
              <Link to="/community" className="transition-colors duration-200 hover:text-[#a1a1aa]">Community</Link>
              <Link to="/pricing" className="transition-colors duration-200 hover:text-[#a1a1aa]">Pricing</Link>
              <Link to="/terms" className="transition-colors duration-200 hover:text-[#a1a1aa]">Terms</Link>
              <Link to="/privacy" className="transition-colors duration-200 hover:text-[#a1a1aa]">Privacy</Link>
            </div>
            <div className="text-xs text-[#52525b]">
              AuroraCraft. Built for Minecraft developers.
            </div>
          </div>
        </div>
      </footer>

      {/* Global keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

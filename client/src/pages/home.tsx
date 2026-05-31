import { useEffect, useRef, useState, useCallback, memo } from 'react'
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
  GitBranch,
  MessageSquare,
  Play,
  Server,
  Rocket,
  Brain,
  Workflow,
} from 'lucide-react'

/* ═══════════════════════════════════════
   Ultra-Smooth Canvas Background - 30fps throttled
   ═══════════════════════════════════════ */
const AmbientBackground = memo(function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const isVisibleRef = useRef(true)
  const lastFrameTimeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
    if (!ctx) return

    let w = window.innerWidth
    let h = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio, 2)
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    // Optimized grid system
    const gridSize = 60
    const dots: Array<{ x: number; y: number; opacity: number; pulse: number; active: boolean }> = []

    // Reduce dot count for better performance
    for (let x = 0; x < w; x += gridSize) {
      for (let y = 0; y < h; y += gridSize) {
        if (Math.random() > 0.3) { // Only create 70% of dots
          dots.push({
            x: x + (Math.random() - 0.5) * 10,
            y: y + (Math.random() - 0.5) * 10,
            opacity: Math.random() * 0.15 + 0.05,
            pulse: Math.random() * Math.PI * 2,
            active: Math.random() > 0.7,
          })
        }
      }
    }

    // Reduce line count
    const lines: Array<{ x: number; y: number; vx: number; vy: number; length: number; opacity: number }> = []
    for (let i = 0; i < 5; i++) { // Reduced from 8 to 5
      lines.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        length: Math.random() * 100 + 50,
        opacity: Math.random() * 0.1 + 0.05,
      })
    }

    let frame = 0
    const FPS_TARGET = 30 // Throttle to 30fps - background doesn't need 60fps
    const FRAME_INTERVAL = 1000 / FPS_TARGET

    const animate = (currentTime: number) => {
      if (!isVisibleRef.current) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      // Throttle to 30fps
      const elapsed = currentTime - lastFrameTimeRef.current
      if (elapsed < FRAME_INTERVAL) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }
      lastFrameTimeRef.current = currentTime - (elapsed % FRAME_INTERVAL)

      ctx.clearRect(0, 0, w, h)
      frame++

      // Draw dots (optimized)
      for (const dot of dots) {
        dot.pulse += 0.015
        const pulseOpacity = dot.opacity * (0.7 + Math.sin(dot.pulse) * 0.3)

        ctx.beginPath()
        ctx.arc(dot.x, dot.y, dot.active ? 1.5 : 1, 0, Math.PI * 2)
        ctx.fillStyle = dot.active
          ? `rgba(16, 185, 129, ${pulseOpacity})`
          : `rgba(100, 116, 139, ${pulseOpacity * 0.6})`
        ctx.fill()
      }

      // Draw lines (optimized)
      for (const line of lines) {
        line.x += line.vx
        line.y += line.vy

        if (line.x < 0) line.x = w
        if (line.x > w) line.x = 0
        if (line.y < 0) line.y = h
        if (line.y > h) line.y = 0

        const angle = Math.atan2(line.vy, line.vx)
        const endX = line.x + Math.cos(angle) * line.length
        const endY = line.y + Math.sin(angle) * line.length

        ctx.beginPath()
        ctx.moveTo(line.x, line.y)
        ctx.lineTo(endX, endY)
        ctx.strokeStyle = `rgba(16, 185, 129, ${line.opacity})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Connections (only every 4 frames for better performance)
      if (frame % 4 === 0) {
        const activeDots = dots.filter(d => d.active).slice(0, 8) // Limit to 8 active dots
        for (let i = 0; i < activeDots.length; i++) {
          for (let j = i + 1; j < Math.min(activeDots.length, i + 2); j++) {
            const dot1 = activeDots[i]
            const dot2 = activeDots[j]
            const dx = dot1.x - dot2.x
            const dy = dot1.y - dot2.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (dist < gridSize * 2) {
              ctx.beginPath()
              ctx.moveTo(dot1.x, dot1.y)
              ctx.lineTo(dot2.x, dot2.y)
              ctx.strokeStyle = `rgba(16, 185, 129, ${0.03 * (1 - dist / (gridSize * 2))})`
              ctx.lineWidth = 0.5
              ctx.stroke()
            }
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)

    // Pause animation when tab is not visible
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Debounced resize handler
    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        w = window.innerWidth
        h = window.innerHeight
        canvas.width = w * dpr
        canvas.height = h * dpr
        ctx.scale(dpr, dpr)
      }, 250)
    }
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimeout)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity: 0.5, willChange: 'contents' }}
    />
  )
})

/* ═══════════════════════════════════════
   Individual Scroll Reveal Hook - Per Element
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
   Optimized Glass Card with Memoization
   ═══════════════════════════════════════ */
const GlassCard = memo(function GlassCard({
  children,
  className = '',
  hover = true,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  hover?: boolean
  delay?: number
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const { ref: revealRef, isVisible } = useScrollReveal(0.2)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    // Use CSS custom properties instead of setState to avoid re-renders
    cardRef.current.style.setProperty('--mouse-x', `${x}%`)
    cardRef.current.style.setProperty('--mouse-y', `${y}%`)
  }, [])

  // Merge refs
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node
    if (revealRef) {
      (revealRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    }
  }, [revealRef])

  return (
    <div
      ref={setRefs}
      onMouseMove={handleMouseMove}
      className={`
        group relative overflow-hidden rounded-2xl border border-[#1a1a24]/80
        bg-gradient-to-br from-[#0a0a0f]/95 to-[#0f0f14]/90
        transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]
        ${hover ? 'hover:border-[#10b981]/40 hover:bg-[#12121a]/95 hover:-translate-y-2 hover:shadow-[0_20px_60px_-15px_rgba(16,185,129,0.15),0_0_0_1px_rgba(16,185,129,0.05)]' : ''}
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}
        ${className}
      `}
      style={{
        transitionDelay: isVisible ? `${delay}ms` : '0ms',
        transform: hover ? `perspective(1000px) rotateX(0deg) rotateY(0deg)` : undefined,
        willChange: 'transform, opacity',
        '--mouse-x': '50%',
        '--mouse-y': '50%',
      } as React.CSSProperties}
    >
      {/* Animated gradient overlay on hover */}
      {hover && (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(16, 185, 129, 0.06), transparent 40%)`,
          }}
        />
      )}

      {/* Enhanced top highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#10b981]/30 to-transparent" />

      {/* Subtle inner glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#10b981]/[0.02] via-transparent to-[#06b6d4]/[0.02]" />

      {children}
    </div>
  )
})

/* ═══════════════════════════════════════
   Feature Data with Enhanced Styling
   ═══════════════════════════════════════ */
const features = [
  {
    icon: Brain,
    title: 'AI Workspace',
    description: 'Chat with AI to plan, architect, and generate complete plugin code with intelligent context awareness.',
    accent: 'from-blue-500/15 via-blue-600/10 to-transparent',
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    borderGlow: 'group-hover:shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)]',
  },
  {
    icon: Terminal,
    title: 'Live Editor',
    description: 'Full code editor with syntax highlighting, file tree, and real-time AI-powered file operations.',
    accent: 'from-emerald-500/15 via-emerald-600/10 to-transparent',
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    borderGlow: 'group-hover:shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]',
  },
  {
    icon: Blocks,
    title: 'Multi-Platform',
    description: 'Paper, Spigot, Bukkit, Velocity — Java or Kotlin, Maven or Gradle. Your stack, your choice.',
    accent: 'from-amber-500/15 via-amber-600/10 to-transparent',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    borderGlow: 'group-hover:shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)]',
  },
  {
    icon: GitBranch,
    title: 'Git Integration',
    description: 'Connect your GitHub repositories. Push, reset, and review code with seamless version control.',
    accent: 'from-purple-500/15 via-purple-600/10 to-transparent',
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10',
    borderGlow: 'group-hover:shadow-[0_0_20px_-5px_rgba(168,85,247,0.3)]',
  },
  {
    icon: Shield,
    title: 'Code Review',
    description: 'AI-powered code review with CodeRabbit integration. Catch issues before they reach production.',
    accent: 'from-rose-500/15 via-rose-600/10 to-transparent',
    iconColor: 'text-rose-400',
    iconBg: 'bg-rose-500/10',
    borderGlow: 'group-hover:shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]',
  },
  {
    icon: Workflow,
    title: 'Project System',
    description: 'Organize plugins with workspaces, configurations, and intelligent project scaffolding.',
    accent: 'from-cyan-500/15 via-cyan-600/10 to-transparent',
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10',
    borderGlow: 'group-hover:shadow-[0_0_20px_-5px_rgba(6,182,212,0.3)]',
  },
]

/* ═══════════════════════════════════════
   Workflow Steps with Detailed Descriptions
   ═══════════════════════════════════════ */
const workflowSteps = [
  {
    icon: MessageSquare,
    label: 'Describe',
    desc: 'Tell the AI what plugin you want to build',
    details: 'Simply describe your plugin idea in natural language. The AI understands your requirements and asks clarifying questions to ensure perfect implementation.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    glowColor: 'rgba(59, 130, 246, 0.3)',
  },
  {
    icon: Zap,
    label: 'Generate',
    desc: 'AI creates the complete codebase instantly',
    details: 'Watch as the AI generates production-ready code with proper structure, best practices, and comprehensive documentation. All files created in seconds.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    glowColor: 'rgba(245, 158, 11, 0.3)',
  },
  {
    icon: Code2,
    label: 'Edit',
    desc: 'Refine and customize in the live editor',
    details: 'Use the powerful code editor to make adjustments. The AI assists with refactoring, bug fixes, and feature additions in real-time.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    glowColor: 'rgba(16, 185, 129, 0.3)',
  },
  {
    icon: Shield,
    label: 'Review',
    desc: 'AI analyzes code for issues and optimizations',
    details: 'Automated code review catches bugs, security issues, and performance problems. Get actionable suggestions before deployment.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    borderColor: 'border-rose-500/20',
    glowColor: 'rgba(244, 63, 94, 0.3)',
  },
  {
    icon: Rocket,
    label: 'Deploy',
    desc: 'Push to GitHub and build your plugin',
    details: 'One-click deployment to GitHub with automatic versioning. Build artifacts are generated and ready for your Minecraft server.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    glowColor: 'rgba(168, 85, 247, 0.3)',
  },
]

/* ═══════════════════════════════════════
   Optimized Animated Arrow - Memoized
   ═══════════════════════════════════════ */
const AnimatedArrow = memo(function AnimatedArrow({
  direction,
  delay
}: {
  direction: 'down-right' | 'down-left'
  delay: number
}) {
  const isRight = direction === 'down-right'
  const { ref, isVisible } = useScrollReveal(0.3)

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
      )}
    >
      <svg
        width="240"
        height="100"
        viewBox="0 0 240 100"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={`arrowGradient-${delay}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(16, 185, 129, 0.4)" />
            <stop offset="50%" stopColor="rgba(6, 182, 212, 0.4)" />
            <stop offset="100%" stopColor="rgba(16, 185, 129, 0.4)" />
          </linearGradient>
          <marker
            id={`arrowhead-${delay}`}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon
              points="0 0, 10 3, 0 6"
              fill="rgba(16, 185, 129, 0.6)"
            />
          </marker>
        </defs>

        <path
          d={isRight ? "M 120 0 L 120 30 L 200 30 L 200 100" : "M 120 0 L 120 30 L 40 30 L 40 100"}
          fill="none"
          stroke={`url(#arrowGradient-${delay})`}
          strokeWidth="2"
          strokeDasharray="8 4"
          markerEnd={`url(#arrowhead-${delay})`}
          className={cn(
            'transition-all duration-1500',
            isVisible ? 'animate-dash' : ''
          )}
          style={{
            strokeDashoffset: isVisible ? '0' : '1000',
          }}
        />
      </svg>
    </div>
  )
})

/* ═══════════════════════════════════════
   Optimized Workflow Card - Memoized
   ═══════════════════════════════════════ */
const WorkflowCard = memo(function WorkflowCard({
  step,
  index,
}: {
  step: typeof workflowSteps[0]
  index: number
}) {
  const { ref, isVisible } = useScrollReveal(0.2)

  return (
    <div
      ref={ref}
      className={cn(
        'group relative transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'
      )}
      style={{ willChange: 'transform, opacity' }}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[#0a0a0f]/95 to-[#0f0f14]/90',
          'shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]',
          'transition-all duration-700 hover:shadow-[0_12px_48px_-8px_var(--glow-color)]',
          'hover:-translate-y-1 cursor-default',
          'w-full max-w-lg',
          step.borderColor
        )}
        style={{ '--glow-color': step.glowColor, willChange: 'transform, opacity' } as React.CSSProperties}
      >
        {/* Top highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

        {/* Content */}
        <div className="flex items-start gap-4 p-6">
          {/* Icon */}
          <div className={cn(
            'flex-shrink-0 flex h-14 w-14 items-center justify-center rounded-xl',
            'transition-all duration-700 group-hover:scale-110 group-hover:rotate-3',
            step.bg,
            'shadow-lg'
          )}>
            <step.icon className={cn('h-7 w-7 transition-all duration-700', step.color)} />
          </div>

          {/* Text Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className={cn(
                'text-lg font-semibold text-[#fafafa] transition-all duration-500',
                'group-hover:text-emerald-400'
              )}>
                {step.label}
              </h3>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1a24]/80 text-[10px] font-bold text-[#64748b] transition-all duration-500 group-hover:text-[#94a3b8] group-hover:bg-[#1a1a24]">
                {index + 1}
              </span>
            </div>
            <p className="text-sm text-[#94a3b8] leading-relaxed transition-all duration-500 group-hover:text-[#cbd5e1]">
              {step.details}
            </p>
          </div>
        </div>

        {/* Hover glow effect */}
        <div
          className="absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100 pointer-events-none rounded-2xl"
          style={{
            background: `radial-gradient(600px circle at 50% 50%, ${step.glowColor}, transparent 40%)`
          }}
        />
      </div>
    </div>
  )
})
function TerminalSnippet({ isVisible }: { isVisible: boolean }) {
  const lines = [
    { text: '> auroracraft init --name "EpicPvP" --platform paper', color: 'text-[#94a3b8]' },
    { text: '✓ Project scaffolded in 0.8s', color: 'text-emerald-400', indent: true },
    { text: '', color: '' },
    { text: '> auroracraft chat "Create a ranked PvP system with ELO"', color: 'text-[#94a3b8]' },
    { text: '✓ Generated 12 files', color: 'text-emerald-400', indent: true },
    { text: '✓ RankedArena.java', color: 'text-[#64748b]', indent: true, sub: true },
    { text: '✓ EloCalculator.java', color: 'text-[#64748b]', indent: true, sub: true },
    { text: '✓ MatchManager.java', color: 'text-[#64748b]', indent: true, sub: true },
    { text: '', color: '' },
    { text: '> auroracraft review', color: 'text-[#94a3b8]' },
    { text: '✓ 0 critical issues', color: 'text-emerald-400', indent: true },
    { text: '⚡ 2 optimizations suggested', color: 'text-amber-400', indent: true },
    { text: '', color: '' },
    { text: '> auroracraft push', color: 'text-[#94a3b8]' },
    { text: '✓ Committed and pushed to origin/main', color: 'text-emerald-400', indent: true },
  ]

  return (
    <div
      className={cn(
        'group relative rounded-2xl border border-[#1a1a24]/90 bg-[#05050a]/98 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.5)] transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] max-w-full overflow-hidden hover:border-[#2563eb]/40 hover:shadow-[0_20px_80px_-20px_rgba(59,130,246,0.2)]',
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-16 opacity-0 invisible'
      )}
      style={{ willChange: 'transform, opacity' }}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-[#1a1a24]/80 px-3 py-2 md:px-5 md:py-3 bg-gradient-to-r from-[#0a0a0f]/50 to-transparent">
        <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-[#ef4444]/80 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.4)] transition-all duration-500 group-hover:shadow-[0_0_12px_rgba(239,68,68,0.6)]" />
        <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-[#f59e0b]/80 shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.4)] transition-all duration-500 group-hover:shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
        <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-[#22c55e]/80 shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.4)] transition-all duration-500 group-hover:shadow-[0_0_12px_rgba(34,197,94,0.6)]" />
        <span className="ml-2 md:ml-3 text-[11px] md:text-xs text-[#64748b] font-mono truncate transition-colors duration-500 group-hover:text-[#94a3b8]">auroracraft — zsh</span>
      </div>
      <div className="overflow-x-auto p-3 md:p-5 font-mono text-xs md:text-sm leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
              line.indent && 'pl-4',
              line.sub && 'pl-8',
              isVisible ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0 invisible'
            )}
            style={{ transitionDelay: `${800 + i * 80}ms`, willChange: 'transform, opacity' }}
          >
            <span className={line.color}>{line.text}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center gap-2 whitespace-nowrap">
          <span className="text-[#3b82f6]">❯</span>
          <span className="inline-block h-4 w-2 animate-pulse bg-[#94a3b8] shadow-[0_0_8px_rgba(148,163,184,0.6)]" />
        </div>
      </div>
      {/* Enhanced glass reflection */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#3b82f6]/[0.01] via-transparent to-transparent pointer-events-none" />
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

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#05050a]">
      <AmbientBackground />

      {/* Noise texture overlay for depth */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Subtle vignette */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />

      {/* ═══════════════════════════════════
          Hero Section
          ═══════════════════════════════════ */}
      <section
        ref={heroReveal.ref}
        className="relative pt-32 pb-20 lg:pt-48 lg:pb-32"
        style={{ contentVisibility: 'auto' }}
      >
        {/* Subtle geometric accents - no AI cliché orbs */}
        <div
          className="pointer-events-none absolute left-0 top-0 h-[300px] w-[300px] opacity-[0.02]"
          style={{
            background: 'linear-gradient(135deg, transparent 0%, transparent 40%, rgba(16, 185, 129, 0.3) 50%, transparent 60%, transparent 100%)',
            transform: 'rotate(45deg)',
          }}
        />
        <div
          className="pointer-events-none absolute right-0 bottom-0 h-[400px] w-[400px] opacity-[0.015]"
          style={{
            background: 'linear-gradient(-45deg, transparent 0%, transparent 40%, rgba(6, 182, 212, 0.3) 50%, transparent 60%, transparent 100%)',
            transform: 'rotate(-30deg)',
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
                  border border-[#1a1a24]/90 bg-gradient-to-r from-[#0a0a0f]/95 to-[#0f0f14]/90
                  px-5 py-2.5 text-sm text-[#94a3b8] shadow-[0_0_20px_-5px_rgba(16,185,129,0.15)]
                  transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  hover:border-[#10b981]/50 hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.25)]
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}
                `}
                style={{ willChange: 'transform, opacity' }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 duration-1000" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                </span>
                AI-Powered Minecraft Plugin Development
              </div>

              {/* Headline */}
              <h1
                className={`
                  text-5xl font-bold tracking-tight text-[#fafafa] sm:text-6xl lg:text-7xl
                  transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}
                `}
                style={{ transitionDelay: '150ms', willChange: 'transform, opacity' }}
              >
                Build plugins{' '}
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-[#10b981] via-[#06b6d4] to-[#10b981] bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
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
                      className={`transition-all duration-1200 ease-out ${heroReveal.isVisible ? 'opacity-100 stroke-dashoffset-0' : 'opacity-0 stroke-dashoffset-200'}`}
                      style={{
                        transitionDelay: '800ms',
                        strokeDasharray: '200',
                        strokeDashoffset: heroReveal.isVisible ? '0' : '200',
                      }}
                    />
                    <defs>
                      <linearGradient id="underline" x1="0" y1="0" x2="200" y2="0">
                        <stop stopColor="#10b981" stopOpacity="0" />
                        <stop offset="0.5" stopColor="#10b981" stopOpacity="0.8" />
                        <stop offset="1" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>

              {/* Subtitle */}
              <p
                className={`
                  mt-8 text-lg leading-relaxed text-[#94a3b8] sm:text-xl
                  transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}
                `}
                style={{ transitionDelay: '300ms', willChange: 'transform, opacity' }}
              >
                A next-generation workspace for Minecraft developers.
                Plan, generate, edit, and deploy plugins with intelligent AI assistance.
              </p>

              {/* CTAs */}
              <div
                className={`
                  mt-10 flex flex-wrap items-center justify-center gap-4 lg:justify-start
                  transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}
                `}
                style={{ transitionDelay: '450ms', willChange: 'transform, opacity' }}
              >
                <Link
                  to="/register"
                  className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] px-8 py-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_8px_24px_-4px_rgba(16,185,129,0.3)] transition-all duration-500 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_16px_48px_-8px_rgba(16,185,129,0.5),0_0_64px_-16px_rgba(16,185,129,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="relative z-10">Start Building</span>
                  <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-500 group-hover:translate-x-1" />
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#059669] to-[#047857] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                </Link>
                <Link
                  to="/docs"
                  className="group inline-flex items-center gap-2 rounded-xl border border-[#1a1a24]/90 bg-[#0a0a0f]/80 px-8 py-4 text-sm font-medium text-[#94a3b8] transition-all duration-500 hover:border-[#10b981]/50 hover:bg-[#12121a]/90 hover:text-[#fafafa] hover:shadow-[0_0_24px_-8px_rgba(16,185,129,0.2)]"
                >
                  Read Documentation
                  <ChevronRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1" />
                </Link>
              </div>

              {/* Stats row */}
              <div
                className={`
                  mt-16 flex items-center justify-center gap-10 border-t border-[#1a1a24]/80 pt-8 lg:justify-start
                  transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  ${heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}
                `}
                style={{ transitionDelay: '600ms', willChange: 'transform, opacity' }}
              >
                {[
                  { value: '0s', label: 'Setup time', color: 'group-hover:text-emerald-400' },
                  { value: 'AI', label: 'Code generation', color: 'group-hover:text-blue-400' },
                  { value: 'Git', label: 'Version control', color: 'group-hover:text-purple-400' },
                ].map((stat, i) => (
                  <div
                    key={stat.label}
                    className="group cursor-default transition-all duration-500 hover:scale-110"
                    style={{ transitionDelay: `${700 + i * 100}ms` }}
                  >
                    <div className={`text-2xl font-bold text-[#fafafa] transition-all duration-500 ${stat.color}`}>
                      {stat.value}
                    </div>
                    <div className="mt-1 text-xs text-[#64748b] transition-colors duration-500 group-hover:text-[#94a3b8]">{stat.label}</div>
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
                  'absolute right-2 top-[-1rem] xl:-right-4 xl:-top-6 rounded-xl border border-[#1a1a24]/80 bg-gradient-to-br from-[#0a0a0f]/95 to-[#0f0f14]/90 px-3 py-2 xl:px-4 xl:py-3 shadow-[0_8px_32px_-8px_rgba(16,185,129,0.2)] transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:shadow-[0_12px_48px_-8px_rgba(16,185,129,0.3)]',
                  heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 invisible'
                )}
                style={{ transitionDelay: '1200ms', willChange: 'transform, opacity' }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 shadow-[0_0_20px_-8px_rgba(16,185,129,0.4)]">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#fafafa]">AI Assistant</div>
                    <div className="text-[11px] text-[#64748b]">Ready to help</div>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  'absolute left-2 bottom-4 xl:-left-8 xl:bottom-12 rounded-xl border border-[#1a1a24]/80 bg-gradient-to-br from-[#0a0a0f]/95 to-[#0f0f14]/90 px-3 py-2 xl:px-4 xl:py-3 shadow-[0_8px_32px_-8px_rgba(16,185,129,0.2)] transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:shadow-[0_12px_48px_-8px_rgba(16,185,129,0.3)]',
                  heroReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 invisible'
                )}
                style={{ transitionDelay: '1400ms', willChange: 'transform, opacity' }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 shadow-[0_0_20px_-8px_rgba(16,185,129,0.4)]">
                    <Server className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#fafafa]">Build Ready</div>
                    <div className="text-[11px] text-[#64748b]">Maven + Gradle</div>
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
      <section ref={featuresReveal.ref} className="relative py-24 lg:py-32" style={{ contentVisibility: 'auto' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="mx-auto max-w-2xl text-center">
            <div
              className={`
                mb-4 inline-flex items-center gap-2 rounded-full border border-[#1a1a24]/90
                bg-gradient-to-r from-[#0a0a0f]/95 to-[#0f0f14]/90 px-4 py-2 text-xs font-medium text-[#64748b]
                shadow-[0_0_20px_-8px_rgba(59,130,246,0.2)]
                transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                ${featuresReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}
              `}
              style={{ willChange: 'transform, opacity' }}
            >
              <Puzzle className="h-3.5 w-3.5 text-blue-400" />
              Core Capabilities
            </div>
            <h2
              className={`
                text-3xl font-bold tracking-tight text-[#fafafa] sm:text-4xl lg:text-5xl
                transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                ${featuresReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}
              `}
              style={{ transitionDelay: '100ms', willChange: 'transform, opacity' }}
            >
              Everything you need to{' '}
              <span className="bg-gradient-to-r from-[#10b981] to-[#06b6d4] bg-clip-text text-transparent">ship faster</span>
            </h2>
            <p
              className={`
                mt-5 text-lg text-[#94a3b8]
                transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                ${featuresReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}
              `}
              style={{ transitionDelay: '200ms', willChange: 'transform, opacity' }}
            >
              A complete development environment designed for Minecraft plugin engineers.
            </p>
          </div>

          {/* Feature Grid — Enhanced with Individual Reveals */}
          <div className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <GlassCard
                key={feature.title}
                delay={0}
                className={`group cursor-default p-8 ${feature.borderGlow}`}
              >
                <div className="relative">
                  <div
                    className={`mb-6 inline-flex rounded-2xl bg-gradient-to-br ${feature.accent} p-4 shadow-lg transition-all duration-700 group-hover:scale-110 group-hover:rotate-3 ${feature.iconBg}`}
                  >
                    <feature.icon className={`h-6 w-6 ${feature.iconColor} transition-all duration-700 group-hover:scale-110`} />
                  </div>
                  <h3 className="text-lg font-semibold text-[#fafafa] transition-all duration-500 group-hover:text-[#10b981] group-hover:translate-x-1">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#64748b] transition-all duration-500 group-hover:text-[#94a3b8]">
                    {feature.description}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          Workflow Section
          ═══════════════════════════════════ */}
      <section ref={workflowReveal.ref} className="relative py-24 lg:py-32" style={{ contentVisibility: 'auto' }}>
        {/* Enhanced background accent */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0a0a0f]/80 via-transparent to-[#0a0a0f]/80" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.03),transparent_70%)]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div
              className={`
                mb-4 inline-flex items-center gap-2 rounded-full border border-[#1a1a24]/90
                bg-gradient-to-r from-[#0a0a0f]/95 to-[#0f0f14]/90 px-4 py-2 text-xs font-medium text-[#64748b]
                shadow-[0_0_20px_-8px_rgba(59,130,246,0.2)]
                transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                ${workflowReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}
              `}
              style={{ willChange: 'transform, opacity' }}
            >
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              How It Works
            </div>
            <h2
              className={`
                text-3xl font-bold tracking-tight text-[#fafafa] sm:text-4xl lg:text-5xl
                transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                ${workflowReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}
              `}
              style={{ transitionDelay: '100ms', willChange: 'transform, opacity' }}
            >
              From idea to{' '}
              <span className="bg-gradient-to-r from-[#10b981] to-[#06b6d4] bg-clip-text text-transparent">
                production
              </span>
            </h2>
            <p
              className={`
                mt-5 text-lg text-[#94a3b8]
                transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                ${workflowReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}
              `}
              style={{ transitionDelay: '200ms', willChange: 'transform, opacity' }}
            >
              A streamlined workflow that takes you from concept to deployed plugin in minutes.
            </p>
          </div>

          {/* Workflow Steps — Zigzag Flow with Animated Arrows */}
          <div className="mt-20">
            <div className="mx-auto max-w-5xl px-4">
              {workflowSteps.map((step, i) => {
                const isEven = i % 2 === 0
                const showArrow = i < workflowSteps.length - 1

                return (
                  <div key={step.label} className="relative">
                    {/* Step Card */}
                    <div className={cn(
                      'flex mb-8',
                      isEven ? 'justify-start' : 'justify-end'
                    )}>
                      <WorkflowCard
                        step={step}
                        index={i}
                      />
                    </div>

                    {/* Animated Arrow */}
                    {showArrow && (
                      <div className={cn(
                        'flex mb-8',
                        isEven ? 'justify-center ml-32' : 'justify-center mr-32'
                      )}>
                        <AnimatedArrow
                          direction={isEven ? 'down-right' : 'down-left'}
                          delay={i * 200 + 400}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom showcase card */}
          <div
            className={`
              mt-20
              transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
              ${workflowReveal.isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}
            `}
            style={{ transitionDelay: '1000ms', willChange: 'transform, opacity' }}
          >
            <div className="group relative rounded-3xl border border-[#1a1a24]/80 bg-gradient-to-br from-[#0a0a0f]/95 to-[#0f0f14]/90 p-6 sm:p-8 lg:p-12 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.5)] transition-all duration-700 hover:border-[#2563eb]/40 hover:shadow-[0_20px_80px_-20px_rgba(59,130,246,0.2)]">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/30 to-transparent" />
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#3b82f6]/[0.02] via-transparent to-[#8b5cf6]/[0.02]" />
              <div className="relative grid gap-12 lg:grid-cols-2 items-center">
                <div>
                  <h3 className="text-2xl font-bold text-[#fafafa] sm:text-3xl">
                    Built for developers who care about{' '}
                    <span className="bg-gradient-to-r from-[#10b981] to-[#06b6d4] bg-clip-text text-transparent">quality</span>
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-[#94a3b8]">
                    AuroraCraft combines a powerful AI workspace with a professional code editor,
                    git integration, and intelligent project management. No setup required.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    {['Zero Config', 'Dark Mode', 'GitHub Sync', 'Code Review'].map((tag, i) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#1a1a24]/90 bg-[#0a0a0f]/80 px-4 py-2 text-xs font-medium text-[#94a3b8] transition-all duration-500 hover:border-[#10b981]/50 hover:bg-[#12121a]/90 hover:text-[#fafafa] hover:scale-105"
                        style={{ transitionDelay: `${i * 50}ms` }}
                      >
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  {/* Decorative code block */}
                  <div className="group/code rounded-2xl border border-[#1a1a24]/90 bg-[#05050a]/95 p-3 sm:p-4 lg:p-6 font-mono text-[11px] sm:text-xs lg:text-sm shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] overflow-x-auto transition-all duration-700 hover:border-[#2563eb]/40 hover:shadow-[0_20px_60px_-15px_rgba(59,130,246,0.2)]">
                    <div className="flex items-center gap-2 border-b border-[#1a1a24]/80 pb-2 sm:pb-3 mb-2 sm:mb-4 min-w-max">
                      <div className="h-2.5 w-2.5 rounded-full bg-[#ef4444]/80 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]/80 shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#22c55e]/80 shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                      <span className="ml-2 text-[10px] text-[#64748b] truncate transition-colors duration-500 group-hover/code:text-[#94a3b8]">MainPlugin.java</span>
                    </div>
                    <div className="space-y-0.5 sm:space-y-1 text-[11px] sm:text-xs lg:text-[13px] leading-relaxed min-w-max">
                      <div className="whitespace-nowrap"><span className="text-purple-400">package</span> <span className="text-[#94a3b8]">com.example.plugin;</span></div>
                      <div className="h-1.5 sm:h-2" />
                      <div className="whitespace-nowrap"><span className="text-purple-400">import</span> <span className="text-[#94a3b8]">org.bukkit.plugin.java.JavaPlugin;</span></div>
                      <div className="h-1.5 sm:h-2" />
                      <div className="whitespace-nowrap"><span className="text-blue-400">public class</span> <span className="text-yellow-300">MainPlugin</span> <span className="text-blue-400">extends</span> <span className="text-yellow-300">JavaPlugin</span> {'{'}</div>
                      <div className="whitespace-nowrap pl-4"><span className="text-blue-400">@Override</span></div>
                      <div className="whitespace-nowrap pl-4"><span className="text-blue-400">public void</span> <span className="text-yellow-300">onEnable</span>() {'{'}</div>
                      <div className="whitespace-nowrap pl-8"><span className="text-[#64748b]">// AI-generated plugin initialized</span></div>
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
      <section ref={ctaReveal.ref} className="relative py-24 lg:py-32" style={{ contentVisibility: 'auto' }}>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div
            className={`
              group relative overflow-hidden rounded-3xl border border-[#1a1a24]/80
              bg-gradient-to-br from-[#0a0a0f]/95 to-[#0f0f14]/90 p-12 text-center lg:p-16
              shadow-[0_20px_80px_-20px_rgba(0,0,0,0.5)]
              transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]
              ${ctaReveal.isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-[0.95]'}
            `}
            style={{ willChange: 'transform, opacity' }}
          >
            {/* Animated gradient border */}
            <div className="absolute inset-0 rounded-3xl border border-[#1a1a24]/60" />
            <div
              className="absolute inset-[-2px] rounded-3xl opacity-30"
              style={{
                background: 'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(16,185,129,0.2) 60deg, transparent 120deg, rgba(6,182,212,0.15) 180deg, transparent 240deg, rgba(16,185,129,0.2) 300deg, transparent 360deg)',
                animation: 'spin 10s linear infinite',
              }}
            />
            <div className="absolute inset-[1px] rounded-3xl bg-[#05050a]/98" />

            <div className="relative">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#10b981]/15 via-[#10b981]/10 to-[#06b6d4]/10 border border-[#1a1a24]/80 shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)] transition-all duration-700 group-hover:scale-110 group-hover:shadow-[0_0_60px_-10px_rgba(16,185,129,0.5)]">
                <Rocket className="h-7 w-7 text-[#10b981]" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-[#fafafa] sm:text-4xl">
                Ready to build something{' '}
                <span className="bg-gradient-to-r from-[#10b981] via-[#06b6d4] to-[#10b981] bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
                  epic?
                </span>
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg text-[#94a3b8]">
                Join the next generation of Minecraft plugin developers. Create your free account and start shipping today.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/register"
                  className="group/btn relative inline-flex items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] px-8 py-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_8px_24px_-4px_rgba(16,185,129,0.3)] transition-all duration-500 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_16px_48px_-8px_rgba(16,185,129,0.5),0_0_64px_-16px_rgba(16,185,129,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="relative z-10">Create Free Account</span>
                  <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-500 group-hover/btn:translate-x-1" />
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#059669] to-[#047857] opacity-0 transition-opacity duration-500 group-hover/btn:opacity-100" />
                </Link>
                <Link
                  to="/community"
                  className="group/btn inline-flex items-center gap-2 rounded-xl border border-[#1a1a24]/90 bg-[#0a0a0f]/80 px-8 py-4 text-sm font-medium text-[#94a3b8] transition-all duration-500 hover:border-[#10b981]/50 hover:bg-[#12121a]/90 hover:text-[#fafafa] hover:shadow-[0_0_24px_-8px_rgba(16,185,129,0.2)]"
                >
                  Explore Community
                  <ChevronRight className="h-4 w-4 transition-transform duration-500 group-hover/btn:translate-x-1" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════
          Footer
          ═══════════════════════════════════ */}
      <footer className="relative border-t border-[#1a1a24]/80 py-12 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-3 group cursor-default">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#10b981]/15 to-[#10b981]/10 border border-[#1a1a24]/80 shadow-[0_0_20px_-8px_rgba(16,185,129,0.3)] transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_30px_-8px_rgba(16,185,129,0.5)]">
                <Blocks className="h-4 w-4 text-[#10b981]" />
              </div>
              <span className="text-sm font-semibold text-[#fafafa] transition-colors duration-500 group-hover:text-[#10b981]">AuroraCraft</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:gap-x-8 text-sm text-[#64748b]">
              <Link to="/docs" className="transition-all duration-300 hover:text-[#94a3b8] hover:scale-105">Docs</Link>
              <Link to="/community" className="transition-all duration-300 hover:text-[#94a3b8] hover:scale-105">Community</Link>
              <Link to="/pricing" className="transition-all duration-300 hover:text-[#94a3b8] hover:scale-105">Pricing</Link>
              <Link to="/terms" className="transition-all duration-300 hover:text-[#94a3b8] hover:scale-105">Terms</Link>
              <Link to="/privacy" className="transition-all duration-300 hover:text-[#94a3b8] hover:scale-105">Privacy</Link>
            </div>
            <div className="text-xs text-[#475569]">
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
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes dash {
          from { stroke-dashoffset: 1000; }
          to { stroke-dashoffset: 0; }
        }
        .animate-gradient {
          animation: gradient 8s ease infinite;
        }
        .animate-dash {
          animation: dash 1.5s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

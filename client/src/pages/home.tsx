import { Link } from 'react-router'
import { useEffect, useRef, useState, memo } from 'react'
import {
  Brain, Blocks, GitBranch, Shield, Workflow,
  ArrowRight, ChevronRight, MessageSquare, Zap,
  Pencil, CheckCircle, Rocket, RefreshCw,
  Terminal, Sparkles, Star, PlayCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════
   Lightweight Scroll Reveal
   No layout thrashing, no GPU waste.
   ═══════════════════════════════════════ */
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin: '40px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, visible }
}

/* ═══════════════════════════════════════
   Data
   ═══════════════════════════════════════ */
const stats = [
  { value: '0s', label: 'Setup time' },
  { value: 'AI', label: 'Code generation' },
  { value: 'Git', label: 'Version control' },
]

const features = [
  {
    icon: Brain,
    title: 'AI Workspace',
    description: 'Chat with AI to plan, architect, and generate complete plugin code with intelligent context awareness.',
    accent: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'hover:border-blue-500/30',
  },
  {
    icon: Terminal,
    title: 'Live Editor',
    description: 'Full code editor with syntax highlighting, file tree, and real-time AI-powered file operations.',
    accent: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'hover:border-emerald-500/30',
  },
  {
    icon: Blocks,
    title: 'Multi-Platform',
    description: 'Paper, Spigot, Bukkit, Velocity — Java or Kotlin, Maven or Gradle. Your stack, your choice.',
    accent: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'hover:border-amber-500/30',
  },
  {
    icon: GitBranch,
    title: 'Git Integration',
    description: 'Connect your GitHub repositories. Push, reset, and review code with seamless version control.',
    accent: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'hover:border-purple-500/30',
  },
  {
    icon: Shield,
    title: 'Code Review',
    description: 'AI-powered code review catches bugs, security issues, and performance problems before production.',
    accent: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'hover:border-rose-500/30',
  },
  {
    icon: Workflow,
    title: 'Project System',
    description: 'Organize plugins with workspaces, configurations, and intelligent project scaffolding.',
    accent: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'hover:border-cyan-500/30',
  },
]

const workflowSteps = [
  {
    icon: MessageSquare,
    label: 'Describe',
    desc: 'Tell the AI what plugin you want to build',
    detail: 'Describe your idea in natural language. The AI asks clarifying questions to ensure perfect implementation.',
    color: 'border-blue-500/30 text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    icon: Zap,
    label: 'Generate',
    desc: 'AI creates the complete codebase instantly',
    detail: 'Production-ready code with proper structure, best practices, and comprehensive docs.',
    color: 'border-amber-500/30 text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    icon: Pencil,
    label: 'Edit',
    desc: 'Refine and customize in the live editor',
    detail: 'Use the powerful code editor to make adjustments. The AI assists with refactoring and fixes.',
    color: 'border-emerald-500/30 text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: CheckCircle,
    label: 'Review',
    desc: 'AI analyzes code for issues and optimizations',
    detail: 'Automated code review catches bugs and performance issues with actionable suggestions.',
    color: 'border-rose-500/30 text-rose-400',
    bg: 'bg-rose-500/10',
  },
  {
    icon: Rocket,
    label: 'Deploy',
    desc: 'Push to GitHub and build your plugin',
    detail: 'One-click deployment to GitHub with automatic versioning. Ready for your server.',
    color: 'border-purple-500/30 text-purple-400',
    bg: 'bg-purple-500/10',
  },
]

const tags = ['Zero Config', 'Dark Mode', 'GitHub Sync', 'Code Review']

/* ═══════════════════════════════════════
   Code Window (SVG + styled spans)
   No canvas, no images, pure lightweight DOM.
   ═══════════════════════════════════════ */
const CodeWindow = memo(function CodeWindow({ visible }: { visible: boolean }) {
  const lines = [
    { text: 'package com.example.plugin;', cls: 'text-purple-400' },
    { text: '', cls: '' },
    { text: 'import org.bukkit.plugin.java.JavaPlugin;', cls: 'text-purple-400' },
    { text: '', cls: '' },
    { text: 'public class MainPlugin extends JavaPlugin {', cls: '' },
    { text: '    @Override', cls: 'text-blue-400' },
    { text: '    public void onEnable() {', cls: '' },
    { text: '        // AI-generated plugin initialized', cls: 'text-[#8b949e]' },
    { text: '        this.getLogger().info("Plugin enabled!");', cls: '' },
    { text: '    }', cls: '' },
    { text: '}', cls: '' },
  ]

  return (
    <div
      className={cn(
        'relative rounded-xl border border-border bg-[#05050a] overflow-hidden transition-all duration-700',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      )}
      style={{ transitionDelay: '400ms', willChange: 'transform, opacity' }}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-[#ef4444]/80" />
        <div className="h-3 w-3 rounded-full bg-[#f59e0b]/80" />
        <div className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
        <span className="ml-3 text-[11px] text-text-dim font-mono">MainPlugin.java</span>
      </div>
      <div className="p-4 font-mono text-[13px] leading-6 overflow-x-auto">
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'whitespace-nowrap transition-all duration-500',
              visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
            )}
            style={{ transitionDelay: `${500 + i * 60}ms`, willChange: 'transform, opacity' }}
          >
            {line.text ? (
              <span className={line.cls}>
                {line.text.split(/(".*?")/).map((part, j) =>
                  part.startsWith('"') && part.endsWith('"') ? (
                    <span key={j} className="text-green-400">{part}</span>
                  ) : (
                    <span key={j}>{part}</span>
                  )
                )}
              </span>
            ) : (
              <span>&nbsp;</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

/* ═══════════════════════════════════════
   Hero Section
   ═══════════════════════════════════════ */
function HeroSection() {
  const { ref, visible } = useReveal(0.05)

  return (
    <section
      ref={ref}
      className="relative overflow-hidden"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 600px' }}
    >
      {/* Subtle geometric decoration — SVG, no canvas, no blur */}
      <svg
        className="pointer-events-none absolute -right-20 -top-20 h-[500px] w-[500px] opacity-[0.03]"
        viewBox="0 0 500 500"
        fill="none"
      >
        <circle cx="250" cy="250" r="200" stroke="currentColor" strokeWidth="1" />
        <circle cx="250" cy="250" r="150" stroke="currentColor" strokeWidth="1" />
        <circle cx="250" cy="250" r="100" stroke="currentColor" strokeWidth="1" />
        <line x1="50" y1="250" x2="450" y2="250" stroke="currentColor" strokeWidth="0.5" />
        <line x1="250" y1="50" x2="250" y2="450" stroke="currentColor" strokeWidth="0.5" />
      </svg>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-32 pb-20 lg:pt-44 lg:pb-32">
        <div className="grid gap-16 lg:grid-cols-2 lg:gap-12 items-center">
          {/* Left: Text */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div
              className={cn(
                'mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-text-muted transition-all duration-700',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              )}
              style={{ willChange: 'transform, opacity' }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              AI-Powered Minecraft Plugin Development
            </div>

            {/* Headline */}
            <h1
              className={cn(
                'text-4xl font-bold tracking-tight text-text sm:text-5xl lg:text-6xl transition-all duration-700',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              )}
              style={{ transitionDelay: '100ms', willChange: 'transform, opacity' }}
            >
              Build plugins{' '}
              <span className="text-primary">with AI</span>
            </h1>

            {/* Subtitle */}
            <p
              className={cn(
                'mt-6 text-lg leading-relaxed text-text-muted sm:text-xl max-w-lg mx-auto lg:mx-0 transition-all duration-700',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              )}
              style={{ transitionDelay: '200ms', willChange: 'transform, opacity' }}
            >
              A next-generation workspace for Minecraft developers.
              Plan, generate, edit, and deploy plugins with intelligent AI assistance.
            </p>

            {/* CTAs */}
            <div
              className={cn(
                'mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start transition-all duration-700',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              )}
              style={{ transitionDelay: '300ms', willChange: 'transform, opacity' }}
            >
              <Link
                to="/register"
                className="group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary-hover active:scale-[0.98]"
              >
                Start Building
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/docs"
                className="group inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-medium text-text-muted transition-all duration-200 hover:border-border-bright hover:text-text active:scale-[0.98]"
              >
                Read Documentation
                <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* Stats */}
            <div
              className={cn(
                'mt-12 flex items-center justify-center gap-10 border-t border-border pt-8 lg:justify-start transition-all duration-700',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              )}
              style={{ transitionDelay: '400ms', willChange: 'transform, opacity' }}
            >
              {stats.map((stat) => (
                <div key={stat.label} className="text-center lg:text-left">
                  <div className="text-2xl font-bold text-text">{stat.value}</div>
                  <div className="mt-1 text-xs text-text-dim">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Code Window */}
          <div className="relative hidden lg:block">
            <CodeWindow visible={visible} />

            {/* Floating accent cards */}
            <div
              className={cn(
                'absolute -right-4 -top-6 rounded-lg border border-border bg-surface p-3 transition-all duration-700',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              )}
              style={{ transitionDelay: '600ms', willChange: 'transform, opacity' }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-text">AI Assistant</div>
                  <div className="text-[11px] text-text-dim">Ready to help</div>
                </div>
              </div>
            </div>

            <div
              className={cn(
                'absolute -left-4 bottom-8 rounded-lg border border-border bg-surface p-3 transition-all duration-700',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              )}
              style={{ transitionDelay: '700ms', willChange: 'transform, opacity' }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10">
                  <RefreshCw className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs font-medium text-text">Build Ready</div>
                  <div className="text-[11px] text-text-dim">Maven + Gradle</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════
   Features Section
   ═══════════════════════════════════════ */
function FeaturesSection() {
  const { ref, visible } = useReveal(0.08)

  return (
    <section
      ref={ref}
      id="features"
      className="relative py-20 lg:py-28"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 500px' }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div
            className={cn(
              'mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-text-dim transition-all duration-700',
              visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            )}
            style={{ willChange: 'transform, opacity' }}
          >
            <Star className="h-3.5 w-3.5 text-primary" />
            Core Capabilities
          </div>
          <h2
            className={cn(
              'text-3xl font-bold tracking-tight text-text sm:text-4xl lg:text-5xl transition-all duration-700',
              visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            )}
            style={{ transitionDelay: '100ms', willChange: 'transform, opacity' }}
          >
            Everything you need to <span className="text-primary">ship faster</span>
          </h2>
          <p
            className={cn(
              'mt-5 text-lg text-text-muted transition-all duration-700',
              visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            )}
            style={{ transitionDelay: '200ms', willChange: 'transform, opacity' }}
          >
            A complete development environment designed for Minecraft plugin engineers.
          </p>
        </div>

        {/* Grid */}
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => {
            const { ref: cardRef, visible: cardVisible } = useReveal(0.1)
            return (
              <div
                key={feature.title}
                ref={cardRef}
                className={cn(
                  'group relative rounded-xl border border-border bg-surface p-6 transition-all duration-300 hover:-translate-y-1',
                  feature.border,
                  cardVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                )}
                style={{
                  transitionDelay: `${i * 80}ms`,
                  willChange: 'transform, opacity',
                  contain: 'layout style paint',
                }}
              >
                <div
                  className={cn(
                    'mb-4 inline-flex rounded-lg p-3 transition-colors duration-200',
                    feature.bg
                  )}
                >
                  <feature.icon className={cn('h-5 w-5', feature.accent)} />
                </div>
                <h3 className="text-base font-semibold text-text transition-colors duration-200 group-hover:text-primary">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-dim">
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════
   Workflow Section — Creative Pipeline
   Horizontal staggered circuit instead of vertical timeline.
   ═══════════════════════════════════════ */
function WorkflowSection() {
  const { ref, visible } = useReveal(0.08)

  return (
    <section
      ref={ref}
      className="relative py-20 lg:py-28"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 500px' }}
    >
      {/* Background divider */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div
            className={cn(
              'mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-text-dim transition-all duration-700',
              visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            )}
            style={{ willChange: 'transform, opacity' }}
          >
            <PlayCircle className="h-3.5 w-3.5 text-emerald-400" />
            How It Works
          </div>
          <h2
            className={cn(
              'text-3xl font-bold tracking-tight text-text sm:text-4xl lg:text-5xl transition-all duration-700',
              visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            )}
            style={{ transitionDelay: '100ms', willChange: 'transform, opacity' }}
          >
            From idea to <span className="text-primary">production</span>
          </h2>
          <p
            className={cn(
              'mt-5 text-lg text-text-muted transition-all duration-700',
              visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            )}
            style={{ transitionDelay: '200ms', willChange: 'transform, opacity' }}
          >
            A streamlined workflow that takes you from concept to deployed plugin in minutes.
          </p>
        </div>

        {/* Pipeline — desktop: horizontal staggered, mobile: vertical */}
        <div className="mt-16 relative">
          {/* Desktop connector line */}
          <div className="hidden lg:block absolute top-[2.25rem] left-[10%] right-[10%] h-px bg-border" />
          <div
            className={cn(
              'hidden lg:block absolute top-[2.25rem] left-[10%] h-px bg-primary transition-all duration-1000',
              visible ? 'w-[80%]' : 'w-0'
            )}
            style={{ transitionDelay: '400ms', willChange: 'width' }}
          />

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            {workflowSteps.map((step, i) => (
              <div
                key={step.label}
                className={cn(
                  'relative transition-all duration-700',
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                )}
                style={{
                  transitionDelay: `${300 + i * 120}ms`,
                  willChange: 'transform, opacity',
                }}
              >
                {/* Node circle on desktop */}
                <div className="hidden lg:flex items-center justify-center mb-6">
                  <div
                    className={cn(
                      'relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 bg-background transition-all duration-300',
                      step.color
                    )}
                  >
                    <step.icon className="h-5 w-5" />
                  </div>
                </div>

                {/* Mobile step number */}
                <div className="lg:hidden flex items-center gap-3 mb-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold',
                      step.color
                    )}
                  >
                    {i + 1}
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Card */}
                <div
                  className={cn(
                    'rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-1',
                    i % 2 === 0 ? 'lg:mt-0' : 'lg:mt-8'
                  )}
                  style={{ contain: 'layout style paint' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="lg:hidden text-sm font-semibold text-text">{step.label}</span>
                    <span className="hidden lg:block text-sm font-semibold text-text">{step.label}</span>
                  </div>
                  <p className="text-sm text-text-dim mb-2">{step.desc}</p>
                  <p className="text-xs text-text-dim leading-relaxed">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════
   Code Preview Section
   ═══════════════════════════════════════ */
function CodePreviewSection() {
  const { ref, visible } = useReveal(0.1)

  const lines = [
    { text: 'package com.example.plugin;', cls: 'text-purple-400' },
    { text: '', cls: '' },
    { text: 'import org.bukkit.plugin.java.JavaPlugin;', cls: 'text-purple-400' },
    { text: '', cls: '' },
    { text: 'public class MainPlugin extends JavaPlugin {', cls: '' },
    { text: '    @Override', cls: 'text-blue-400' },
    { text: '    public void onEnable() {', cls: '' },
    { text: '        // AI-generated plugin initialized', cls: 'text-[#8b949e]' },
    { text: '        this.getLogger().info("Plugin enabled!");', cls: '' },
    { text: '    }', cls: '' },
    { text: '}', cls: '' },
  ]

  return (
    <section
      ref={ref}
      className="relative py-20 lg:py-28"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 500px' }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          {/* Left: Text */}
          <div>
            <h2
              className={cn(
                'text-3xl font-bold tracking-tight text-text sm:text-4xl transition-all duration-700',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              )}
              style={{ willChange: 'transform, opacity' }}
            >
              Built for developers who care about{' '}
              <span className="text-primary">quality</span>
            </h2>
            <p
              className={cn(
                'mt-4 text-base leading-relaxed text-text-muted transition-all duration-700',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              )}
              style={{ transitionDelay: '100ms', willChange: 'transform, opacity' }}
            >
              AuroraCraft combines a powerful AI workspace with a professional code editor,
              git integration, and intelligent project management. No setup required.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {tags.map((tag, i) => (
                <span
                  key={tag}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-text-muted transition-all duration-700 hover:border-primary hover:text-text',
                    visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                  )}
                  style={{ transitionDelay: `${200 + i * 60}ms`, willChange: 'transform, opacity' }}
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Code block */}
          <div
            className={cn(
              'transition-all duration-700',
              visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
            )}
            style={{ transitionDelay: '200ms', willChange: 'transform, opacity' }}
          >
            <div className="rounded-xl border border-border bg-[#05050a] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-[#ef4444]/80" />
                <div className="h-3 w-3 rounded-full bg-[#f59e0b]/80" />
                <div className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
                <span className="ml-3 text-[11px] text-text-dim font-mono">MainPlugin.java</span>
              </div>
              <div className="p-4 font-mono text-[13px] leading-6 overflow-x-auto">
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      'whitespace-nowrap transition-all duration-500',
                      visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
                    )}
                    style={{ transitionDelay: `${300 + i * 50}ms`, willChange: 'transform, opacity' }}
                  >
                    {line.text ? (
                      <span className={line.cls}>
                        {line.text.split(/(".*?")/).map((part, j) =>
                          part.startsWith('"') && part.endsWith('"') ? (
                            <span key={j} className="text-green-400">{part}</span>
                          ) : (
                            <span key={j}>{part}</span>
                          )
                        )}
                      </span>
                    ) : (
                      <span>&nbsp;</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════
   Bottom CTA Section
   ═══════════════════════════════════════ */
function CTASection() {
  const { ref, visible } = useReveal(0.15)

  return (
    <section
      ref={ref}
      className="relative py-20 lg:py-28"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 300px' }}
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border border-border bg-surface p-10 text-center lg:p-16 transition-all duration-700',
            visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-[0.98]'
          )}
          style={{ willChange: 'transform, opacity' }}
        >
          {/* Subtle corner accents */}
          <div className="pointer-events-none absolute top-0 left-0 h-16 w-16 border-l border-t border-primary/20 rounded-tl-2xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-16 border-r border-b border-primary/20 rounded-br-2xl" />

          <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Ready to build something <span className="text-primary">epic</span>?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-text-muted">
            Join thousands of Minecraft developers shipping plugins faster with AI-powered tools.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/register"
              className="group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary-hover active:scale-[0.98]"
            >
              Create Free Account
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/community"
              className="group inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-medium text-text-muted transition-all duration-200 hover:border-border-bright hover:text-text active:scale-[0.98]"
            >
              Explore Community
              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════
   Main Page
   ═══════════════════════════════════════ */
export default function HomePage() {
  return (
    <div className="relative bg-background">
      <HeroSection />
      <FeaturesSection />
      <WorkflowSection />
      <CodePreviewSection />
      <CTASection />
    </div>
  )
}

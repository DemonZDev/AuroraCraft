import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, X, Sparkles, Coins, Plus, ArrowRight, Zap, Minus } from 'lucide-react'
import { Link } from 'react-router'
import { usePlanSettings, type PlanFeature } from '@/hooks/use-plan-settings'

// ── Roll-ball physics ──────────────────────────────────────────────────────
const BALL_SIZE = 44
const ROLL_MS = 700
const SETTLE = 'cubic-bezier(0.34, 1.45, 0.64, 1)'

// Fallbacks render the page instantly while /api/plan-settings loads.
const DEFAULT_FEATURES: PlanFeature[] = [
  { label: 'Project Workspace', free: true, pro: true },
  { label: 'Free Models Access', free: true, pro: true },
  { label: 'Download Plugin Jar', free: true, pro: true },
  { label: 'Download Project Files', free: false, pro: true },
  { label: 'Fork Community Project', free: false, pro: true },
  { label: 'Upload Project Zip', free: false, pro: true },
  { label: 'Git Integrations', free: false, pro: true },
  { label: 'Graphify Access', free: false, pro: true },
  { label: 'Paid Models Access', free: false, pro: true },
  { label: 'Web Search Access', free: false, pro: true },
  { label: 'Prompt Enhancer', free: false, pro: true },
  { label: 'Error Prompt Maker', free: false, pro: true },
  { label: 'Code Review', free: false, pro: true },
]

// Categorized for the comparison table.
const FEATURE_GROUPS: { title: string; labels: string[] }[] = [
  { title: 'Workspace', labels: ['Project Workspace', 'Download Plugin Jar', 'Download Project Files', 'Upload Project Zip', 'Fork Community Project', 'Git Integrations'] },
  { title: 'AI Models',  labels: ['Free Models Access', 'Paid Models Access', 'Graphify Access', 'Web Search Access', 'Prompt Enhancer', 'Error Prompt Maker'] },
  { title: 'Quality',    labels: ['Code Review'] },
]

const FAQS = [
  {
    q: 'What counts as a "token"?',
    a: 'Tokens are how AuroraCraft measures how much the AI thinks. 1 token is roughly ¾ of a word. A short bug-fix iteration costs a few hundred; a full plugin (a complete OnJoin event handler with config, a /heal command, and a tab-completion hook) usually lands between 3,000 and 8,000 tokens. We bill per call — the meter in the workspace shows running cost in real time, so you never get a surprise bill.',
  },
  {
    q: 'Can I bring my own OpenRouter / OpenAI / Anthropic key?',
    a: 'Yes. From Admin Panel → API Keys you can attach one or more provider keys per project. Paid keys route through our per-project LiteLLM proxy with multi-key weighted routing, real-time per-call billing against your AuroraCraft balance, and auto-disable when a key hits its limit. Bring keys for any OpenAI-compatible provider.',
  },
  {
    q: 'Do unused Pro tokens roll over?',
    a: 'No — the monthly token allowance refreshes on the same calendar day each month as your first paid charge. Top-up tokens purchased separately are non-expiring. You can see the exact reset date in Workspace → Settings.',
  },
  {
    q: 'What does Graphify actually save?',
    a: 'Paid users can build a per-project knowledge graph of their plugin code (free users do not). When the AI works on a project with a graph, it queries that graph instead of opening every file — typical savings on a 30-file project are 40–60% of agent tokens. Build is AST-only and costs 0 AuroraCraft tokens.',
  },
  {
    q: 'Is there a free trial of Pro?',
    a: 'We do not run a timed trial. Instead, the Free plan is permanently free and includes the full Workspace plus the two free Zen models — you can build, compile, and download a real plugin without paying. Upgrade to Pro only when you want access to paid models (GPT-4 class, Claude, Gemini) or the advanced tools (Graphify, Code Review, Prompt Enhancer).',
  },
  {
    q: 'How do refunds work?',
    a: 'Email support@auroracraft.dev within 14 days of a charge and we will refund the most recent month, no questions asked. The unused portion of that month\'s token allowance is also returned to your account.',
  },
]

const TOPUP_TIERS = [
  { tokens: 1000,  label: 'Quick fix',       desc: 'A handful of small changes, a refactor, a config error.' },
  { tokens: 5000,  label: 'Solid iteration', desc: 'A full bug fix + a couple of features, fully tested.' },
  { tokens: 25000, label: 'Full plugin',     desc: 'A complete, working plugin with events, commands, GUI.' },
]

function formatUsd(n: number): string {
  return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${parseFloat(n.toFixed(2))}`
}
function formatTokens(n: number): string {
  return n.toLocaleString('en-US')
}

// ──────────────────────────────────────────────────────────────────────────
// PAGE
// ──────────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { settings } = usePlanSettings()

  const features = settings?.features?.length ? settings.features : DEFAULT_FEATURES
  const proPrice = settings?.proPriceUsd ?? 5
  const proTokens = settings?.proMonthlyTokens ?? 5000
  const tokenPer1k = settings?.tokenPricePer1kUsd ?? 1

  // Billing cycle: monthly / yearly (yearly = 2 months free, i.e. 20% off).
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const yearlyMultiplier = 0.8
  const cyclePrice = billing === 'yearly' ? proPrice * 12 * yearlyMultiplier : proPrice

  // Roll-ball state.
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [spinBoost, setSpinBoost] = useState(0)
  const [trackWidth, setTrackWidth] = useState(288)
  const trackRef = useRef<HTMLDivElement>(null)
  const ballRef = useRef<HTMLDivElement>(null)
  const squashRef = useRef<HTMLDivElement>(null)
  const textureRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const drag = useRef({ active: false, startX: 0, startP: 0, moved: false })
  const suppressClickUntil = useRef(0)
  const hintAnims = useRef<Animation[]>([])
  const reduceMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  const setProgressSync = useCallback((v: number) => {
    progressRef.current = v
    setProgress(v)
  }, [])

  const travel = useCallback(() => {
    const w = trackRef.current?.clientWidth ?? 288
    return Math.max(1, w - BALL_SIZE)
  }, [])

  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    setTrackWidth(el.clientWidth)
    const observer = new ResizeObserver(() => setTrackWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const cancelHint = useCallback(() => {
    hintAnims.current.forEach((a) => a.cancel())
    hintAnims.current = []
  }, [])

  // One-time "roll me" nudge so visitors notice the ball is interactive.
  useEffect(() => {
    if (reduceMotion.current) return
    const ball = ballRef.current
    const texture = textureRef.current
    if (!ball || !texture) return
    const timing: KeyframeAnimationOptions = {
      delay: 1800,
      duration: 1300,
      iterations: 2,
      easing: 'ease-in-out',
    }
    hintAnims.current = [
      ball.animate(
        [
          { transform: 'translate(0px, -50%)' },
          { transform: 'translate(12px, -50%)', offset: 0.35 },
          { transform: 'translate(-3px, -50%)', offset: 0.7 },
          { transform: 'translate(0px, -50%)' },
        ],
        timing,
      ),
      texture.animate(
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(31deg)', offset: 0.35 },
          { transform: 'rotate(-8deg)', offset: 0.7 },
          { transform: 'rotate(0deg)' },
        ],
        timing,
      ),
    ]
    return () => {
      hintAnims.current.forEach((a) => a.cancel())
      hintAnims.current = []
    }
  }, [])

  const playSquash = useCallback(() => {
    if (reduceMotion.current) return
    squashRef.current?.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.1, 0.9)', offset: 0.14 },
        { transform: 'scale(0.95, 1.05)', offset: 0.45 },
        { transform: 'scale(1.04, 0.96)', offset: 0.8 },
        { transform: 'scale(1, 1)' },
      ],
      { duration: ROLL_MS, easing: 'ease-out' },
    )
  }, [])

  const rollTo = useCallback(
    (target: 0 | 1, flourish = false) => {
      cancelHint()
      setDragging(false)
      if (progressRef.current !== target) {
        playSquash()
        if (flourish && !reduceMotion.current) {
          setSpinBoost((b) => b + (target === 1 ? 360 : -360))
        }
      }
      setProgressSync(target)
    },
    [cancelHint, playSquash, setProgressSync],
  )

  const onBallPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      cancelHint()
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { active: true, startX: e.clientX, startP: progressRef.current, moved: false }
      setDragging(true)
    },
    [cancelHint],
  )
  const onBallPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag.current.active) return
      const dx = e.clientX - drag.current.startX
      if (Math.abs(dx) > 6) drag.current.moved = true
      setProgressSync(Math.min(1, Math.max(0, drag.current.startP + dx / travel())))
    },
    [setProgressSync, travel],
  )
  const onBallPointerUp = useCallback(() => {
    if (!drag.current.active) return
    drag.current.active = false
    suppressClickUntil.current = performance.now() + 400
    if (drag.current.moved) rollTo(progressRef.current >= 0.5 ? 1 : 0)
    else rollTo(drag.current.startP < 0.5 ? 1 : 0, true)
  }, [rollTo])
  const onBallPointerCancel = useCallback(() => {
    if (!drag.current.active) return
    drag.current.active = false
    rollTo(progressRef.current >= 0.5 ? 1 : 0)
  }, [rollTo])
  const onTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (performance.now() < suppressClickUntil.current) return
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return
      rollTo((e.clientX - rect.left) / rect.width >= 0.5 ? 1 : 0)
    },
    [rollTo],
  )
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') rollTo(1)
      else if (e.key === 'ArrowLeft') rollTo(0)
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        rollTo(progressRef.current < 0.5 ? 1 : 0, true)
      }
    },
    [rollTo],
  )

  // Derived ball physics
  const p = progress
  const isPro = p >= 0.5
  const distance = p * Math.max(1, trackWidth - BALL_SIZE)
  const rotation = (distance / (Math.PI * BALL_SIZE)) * 360 + spinBoost
  const rollTransition = dragging ? 'none' : `transform ${ROLL_MS}ms ${SETTLE}`
  const fadeTransition = dragging ? 'none' : `opacity ${ROLL_MS}ms ease`
  const morph = dragging
    ? 'none'
    : `transform ${ROLL_MS}ms ${SETTLE}, opacity 500ms ease, color 450ms ease, box-shadow ${ROLL_MS}ms ease, border-color ${ROLL_MS}ms ease, background-color ${ROLL_MS}ms ease`

  // Card border interpolates from neutral to primary blue.
  const borderColor = `rgba(${Math.round(30 + (59 - 30) * p)}, ${Math.round(30 + (130 - 30) * p)}, ${Math.round(46 + (246 - 46) * p)}, ${0.55 + 0.45 * p})`
  const glow = `0 0 ${48 * p}px rgba(59, 130, 246, ${0.18 * p}), 0 8px 32px rgba(0, 0, 0, 0.35)`

  return (
    <div className="relative">
      {/* ═══════ HERO ═══════ */}
      <section className="relative border-b border-border">
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6 sm:pt-28">
          <div className="mx-auto max-w-2xl text-center">
            <p className="spec-label">Pricing</p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-text sm:text-5xl">
              Start free. Pay only for the AI you use.
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-text-muted">
              AuroraCraft builds your Minecraft plugin with AI. You pay for the tokens
              the AI actually spends — nothing else.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3">
              <BillingToggle billing={billing} setBilling={setBilling} />
              <p className="text-xs text-text-dim">
                Cancel anytime · No card required to start
              </p>
            </div>
          </div>

          {/* ── The roller (the one distinctive thing) ── */}
          <div className="mx-auto mt-14 max-w-2xl">
            <div className="flex items-center justify-center gap-4 select-none">
              <button
                onClick={() => rollTo(0)}
                className={`text-sm font-medium transition-colors ${!isPro ? 'text-text' : 'text-text-dim hover:text-text-muted'}`}
              >
                Free
              </button>

              <div
                ref={trackRef}
                onClick={onTrackClick}
                className="relative h-14 w-64 cursor-pointer sm:w-80"
                role="switch"
                aria-checked={isPro}
                aria-label="Toggle between Free and Pro plan"
                tabIndex={0}
                onKeyDown={onKeyDown}
              >
                <div className="absolute top-1/2 left-0 h-3 w-full -translate-y-1/2 rounded-full border border-border bg-surface" />
                <div
                  className="absolute top-1/2 left-0 h-3 -translate-y-1/2 rounded-full bg-primary"
                  style={{
                    width: `calc(${BALL_SIZE / 2}px + ${p} * (100% - ${BALL_SIZE}px))`,
                    transition: dragging ? 'none' : `width ${ROLL_MS}ms ${SETTLE}`,
                  }}
                />

                {/* The ball */}
                <div
                  ref={ballRef}
                  onPointerDown={onBallPointerDown}
                  onPointerMove={onBallPointerMove}
                  onPointerUp={onBallPointerUp}
                  onPointerCancel={onBallPointerCancel}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-1/2 left-0 z-10 cursor-grab touch-none active:cursor-grabbing"
                  style={{
                    width: BALL_SIZE,
                    height: BALL_SIZE,
                    transform: `translate(${distance}px, -50%)`,
                    transition: rollTransition,
                  }}
                >
                  <div
                    className="absolute -bottom-1.5 left-1/2 h-2 w-8 rounded-full bg-black/50 blur-[3px]"
                    style={{
                      transform: `translateX(-50%) scaleX(${dragging ? 1.3 : 1})`,
                      opacity: dragging ? 0.35 : 0.6,
                      transition: 'transform 150ms ease, opacity 150ms ease',
                    }}
                  />
                  <div
                    ref={squashRef}
                    className="h-full w-full"
                    style={{
                      transformOrigin: '50% 85%',
                      transform: dragging ? 'translateY(-2px) scale(1.05)' : undefined,
                      transition: 'transform 150ms ease',
                    }}
                  >
                    <div
                      className="relative h-full w-full overflow-hidden rounded-full"
                      style={{
                        boxShadow: `0 0 ${6 + 16 * p}px rgba(59, 130, 246, ${0.55 * p}), 0 3px 8px rgba(0, 0, 0, 0.45)`,
                        transition: dragging
                          ? 'filter 150ms ease'
                          : `filter 150ms ease, box-shadow ${ROLL_MS}ms ease`,
                      }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            'radial-gradient(circle at 30% 27%, #d6d9e0 0%, #9095a1 30%, #565b66 62%, #262830 100%)',
                        }}
                      />
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            'radial-gradient(circle at 30% 27%, #dbeafe 0%, #60a5fa 32%, #2563eb 64%, #1e3a8a 100%)',
                          opacity: p,
                          transition: fadeTransition,
                        }}
                      />
                      <div
                        ref={textureRef}
                        className="absolute inset-0"
                        style={{ transform: `rotate(${rotation}deg)`, transition: rollTransition }}
                      >
                        <svg viewBox="0 0 44 44" className="h-full w-full" aria-hidden="true">
                          <path
                            d="M 4 16 Q 22 28 40 16"
                            fill="none"
                            stroke="rgba(0, 0, 0, 0.18)"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <path
                            d="M 4 28 Q 22 16 40 28"
                            fill="none"
                            stroke="rgba(0, 0, 0, 0.18)"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <circle cx="13" cy="10" r="2.2" fill="rgba(0, 0, 0, 0.2)" />
                          <circle cx="31" cy="30" r="1.8" fill="rgba(0, 0, 0, 0.2)" />
                          <circle cx="17" cy="34" r="1.3" fill="rgba(0, 0, 0, 0.18)" />
                          <circle cx="29" cy="9" r="1.1" fill="rgba(255, 255, 255, 0.3)" />
                        </svg>
                      </div>
                      <div
                        className="pointer-events-none absolute inset-0 rounded-full"
                        style={{
                          boxShadow:
                            'inset -6px -8px 12px rgba(0, 0, 0, 0.45), inset 3px 5px 7px rgba(255, 255, 255, 0.16)',
                        }}
                      />
                      <div
                        className="pointer-events-none absolute rounded-full bg-white/60 blur-[2.5px]"
                        style={{ width: 13, height: 8, top: '13%', left: '17%', transform: 'rotate(-28deg)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => rollTo(1)}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isPro ? 'text-primary' : 'text-text-dim hover:text-text-muted'}`}
              >
                Pro
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mt-3 text-center text-xs text-text-dim">
              Drag the ball, or press{' '}
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                ←
              </kbd>{' '}
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                →
              </kbd>
            </p>

            {/* ── The morphing card ── */}
            <div
              className="relative mt-8 rounded-xl border bg-surface p-8"
              style={{
                borderColor,
                boxShadow: glow,
                transition: morph,
              }}
            >
              {/* Tier + one-line "best for" */}
              <div className="relative flex items-baseline justify-between gap-4">
                <div className="relative h-8">
                  <h3
                    className="absolute flex items-baseline gap-2 text-xl font-semibold text-text"
                    style={{ opacity: 1 - p, transform: `translateY(${p * -8}px)`, transition: morph }}
                  >
                    Free
                  </h3>
                  <h3
                    className="absolute flex items-baseline gap-2 text-xl font-semibold text-text"
                    style={{ opacity: p, transform: `translateY(${(1 - p) * 8}px)`, transition: morph }}
                  >
                    Pro
                    <Sparkles className="h-4 w-4 text-primary" />
                  </h3>
                </div>
                <div className="relative h-6 flex items-center">
                  <p
                    className="absolute right-0 text-sm text-text-dim"
                    style={{ opacity: 1 - p, transform: `translateY(${p * -6}px)`, transition: morph }}
                  >
                    For hobby builds and learning.
                  </p>
                  <p
                    className="absolute right-0 text-sm text-text-dim"
                    style={{ opacity: p, transform: `translateY(${(1 - p) * 6}px)`, transition: morph }}
                  >
                    For shipping and maintaining plugins.
                  </p>
                </div>
              </div>

              {/* Price + tokens */}
              <div className="relative mt-5 h-14">
                <div
                  className="absolute flex items-baseline gap-1.5"
                  style={{ opacity: 1 - p, transform: `translateY(${p * -8}px)`, transition: morph }}
                >
                  <span className="display-num text-5xl text-text">$0</span>
                  <span className="text-sm text-text-dim">/ forever</span>
                </div>
                <div
                  className="absolute flex items-baseline gap-1.5"
                  style={{ opacity: p, transform: `translateY(${(1 - p) * 8}px)`, transition: morph }}
                >
                  <span className="display-num text-5xl text-text">
                    {formatUsd(billing === 'yearly' ? cyclePrice / 12 : proPrice)}
                  </span>
                  <span className="text-sm text-text-dim">/ month</span>
                </div>
              </div>

              {/* Tokens included */}
              <div className="relative h-6">
                <p
                  className="absolute flex items-center gap-1.5 text-sm text-text-dim"
                  style={{ opacity: 1 - p, transition: morph }}
                >
                  <Coins className="h-3.5 w-3.5" />
                  Pay per use · {formatUsd(tokenPer1k)} / 1,000 tokens
                </p>
                <p
                  className="absolute flex items-center gap-1.5 text-sm text-text-muted"
                  style={{ opacity: p, transition: morph }}
                >
                  <Coins className="h-3.5 w-3.5 text-primary" />
                  {formatTokens(proTokens)} tokens included every month
                </p>
              </div>

              {/* Feature matrix */}
              <ul className="mt-6 grid grid-cols-1 gap-y-2 border-t border-border pt-6 sm:grid-cols-2 sm:gap-x-8">
                {features.map((feature, i) => {
                  const included = isPro ? feature.pro : feature.free
                  const changes = feature.free !== feature.pro
                  const rowOpacity = changes ? 0.55 + 0.45 * (feature.pro ? p : 1 - p) : 1
                  return (
                    <li
                      key={`${feature.label}-${i}`}
                      className="flex items-center gap-2.5 text-sm text-text-muted"
                      style={{ opacity: rowOpacity, transition: morph }}
                    >
                      <span className="relative h-4 w-4 shrink-0">
                        <Check
                          className="absolute h-4 w-4 text-success"
                          style={{
                            opacity: changes ? p : feature.free ? 1 : 0,
                            transform: `scale(${changes ? 0.5 + 0.5 * p : 1}) rotate(${changes ? -90 + 90 * p : 0}deg)`,
                            transition: morph,
                          }}
                        />
                        <X
                          className="absolute h-4 w-4 text-text-dim"
                          style={{
                            opacity: changes ? 1 - p : feature.free ? 0 : 1,
                            transform: `scale(${changes ? 0.5 + 0.5 * (1 - p) : 1})`,
                            transition: morph,
                          }}
                        />
                      </span>
                      <span className={included ? '' : 'text-text-dim'}>{feature.label}</span>
                    </li>
                  )
                })}
              </ul>

              {/* CTAs */}
              <div className="relative mt-6 h-11">
                <Link
                  to="/register"
                  className="absolute inset-0 flex items-center justify-center rounded-lg border border-border bg-surface-hover text-sm font-medium text-text transition-colors hover:bg-accent"
                  style={{ opacity: 1 - p, pointerEvents: isPro ? 'none' : 'auto', transition: morph }}
                >
                  Get started — free forever
                </Link>
                <Link
                  to="/register"
                  className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                  style={{ opacity: p, pointerEvents: isPro ? 'auto' : 'none', transition: morph }}
                >
                  <Zap className="h-4 w-4" />
                  Start with Pro
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ FEATURE COMPARISON TABLE ═══════ */}
      <section className="relative border-b border-border py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <p className="spec-label">Comparison</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-text sm:text-4xl">
              What you get, line by line.
            </h2>
          </div>

          <div className="mt-10 overflow-x-auto rounded-xl border border-border">
            <table className="compare-table min-w-[640px]">
              <thead>
                <tr>
                  <th className="w-[55%]">Feature</th>
                  <th className="w-[22.5%] text-center">Free</th>
                  <th className="col-pro w-[22.5%] text-center">Pro</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_GROUPS.map((group) => (
                  <FeatureGroupRows
                    key={group.title}
                    title={group.title}
                    features={features.filter((f) => group.labels.includes(f.label))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══════ TOKEN TOP-UP ═══════ */}
      <section className="relative border-b border-border py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr,1.4fr]">
            <div>
              <p className="spec-label">Token top-up</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-text sm:text-4xl">
                What does {formatUsd(tokenPer1k)} buy you?
              </h2>
              <p className="mt-4 max-w-md text-text-muted">
                Tokens are billed per upstream call. The workspace meter shows running
                cost in real time, so you never get a surprise bill. Top-ups never expire.
              </p>
              <dl className="mt-8 space-y-4 text-sm">
                <div className="flex gap-4">
                  <dt className="spec-label w-16 shrink-0 pt-0.5">Rate</dt>
                  <dd className="text-text-muted">
                    <span className="spec-value text-text">{formatUsd(tokenPer1k)}</span> per 1,000 tokens.
                    Sub-token math; we always round UP to the nearest token.
                  </dd>
                </div>
                <div className="flex gap-4">
                  <dt className="spec-label w-16 shrink-0 pt-0.5">Never</dt>
                  <dd className="text-text-muted">
                    We don't bill for Graphify builds, failed calls, or model refusals.
                  </dd>
                </div>
                <div className="flex gap-4">
                  <dt className="spec-label w-16 shrink-0 pt-0.5">Expires</dt>
                  <dd className="text-text-muted">
                    Top-up tokens stay in your account until you spend them. Only the
                    monthly Pro allowance refreshes.
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {TOPUP_TIERS.map((tier) => {
                const cost = (tier.tokens / 1000) * tokenPer1k
                return (
                  <div key={tier.tokens} className="rounded-xl border border-border p-5">
                    <div className="spec-label">{tier.label}</div>
                    <div className="spec-value mt-3 text-2xl text-text">
                      {formatTokens(tier.tokens)}
                      <span className="ml-1 text-xs text-text-dim">tokens</span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-text-muted">
                      {tier.desc}
                    </p>
                    <div className="spec-value mt-5 text-xs text-text-dim">
                      ≈ {formatUsd(cost)} one-time
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section className="relative border-b border-border py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <p className="spec-label text-center">Questions</p>
          <h2 className="mt-3 text-center text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            The ones we get asked the most.
          </h2>
          <div className="mt-10">
            {FAQS.map((f) => (
              <details key={f.q} className="faq">
                <summary>
                  {f.q}
                  <span className="chev">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </summary>
                <div className="answer">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER CTA ═══════ */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
            Ready to ship your first plugin?
          </h2>
          <p className="mt-3 text-text-muted">
            Free forever for small projects. No card required to start.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Create your account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/community"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-hover"
            >
              Browse community plugins
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

function BillingToggle({
  billing,
  setBilling,
}: {
  billing: 'monthly' | 'yearly'
  setBilling: (b: 'monthly' | 'yearly') => void
}) {
  const monthlyRef = useRef<HTMLButtonElement>(null)
  const yearlyRef = useRef<HTMLButtonElement>(null)
  const [slider, setSlider] = useState<{ left: number; width: number }>({ left: 3, width: 100 })

  const measure = useCallback(() => {
    const target = billing === 'monthly' ? monthlyRef.current : yearlyRef.current
    if (!target) return
    setSlider({ left: target.offsetLeft, width: target.offsetWidth })
  }, [billing])

  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  return (
    <div className="billing-toggle" role="tablist" aria-label="Billing cycle">
      <span
        className="slider"
        style={{ transform: `translateX(${slider.left - 3}px)`, width: slider.width }}
        aria-hidden="true"
      />
      <button
        ref={monthlyRef}
        role="tab"
        aria-selected={billing === 'monthly'}
        onClick={() => setBilling('monthly')}
        className={billing === 'monthly' ? 'is-active' : ''}
      >
        Monthly
      </button>
      <button
        ref={yearlyRef}
        role="tab"
        aria-selected={billing === 'yearly'}
        onClick={() => setBilling('yearly')}
        className={billing === 'yearly' ? 'is-active' : ''}
      >
        Yearly
        <span className="save-chip">−20%</span>
      </button>
    </div>
  )
}

function FeatureGroupRows({
  title,
  features,
}: {
  title: string
  features: PlanFeature[]
}) {
  if (!features.length) return null
  return (
    <>
      <tr className="group-row">
        <td colSpan={3}>{title}</td>
      </tr>
      {features.map((feature) => (
        <tr key={feature.label}>
          <td>{feature.label}</td>
          <td className="text-center">
            {feature.free ? <Check className="mx-auto h-4 w-4 text-success" /> : <Minus className="mx-auto h-4 w-4 text-text-dim/60" />}
          </td>
          <td className="col-pro text-center">
            {feature.pro ? <Check className="mx-auto h-4 w-4 text-primary" /> : <Minus className="mx-auto h-4 w-4 text-text-dim/60" />}
          </td>
        </tr>
      ))}
    </>
  )
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, X, Sparkles, Coins } from 'lucide-react'
import { Link } from 'react-router'
import { usePlanSettings, type PlanFeature } from '@/hooks/use-plan-settings'

const BALL_SIZE = 44
const ROLL_MS = 700
// Spring-ish settle when the ball is released; instant while dragging.
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

function formatUsd(n: number): string {
  return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${parseFloat(n.toFixed(2))}`
}

export default function PricingPage() {
  const { settings } = usePlanSettings()

  const features = settings?.features?.length ? settings.features : DEFAULT_FEATURES
  const proPrice = settings?.proPriceUsd ?? 5
  const proOriginal = settings?.proOriginalPriceUsd ?? 12.5
  const proTokens = settings?.proMonthlyTokens ?? 5000
  const tokenPer1k = settings?.tokenPricePer1kUsd ?? 1
  const discount = proOriginal > proPrice ? Math.round((1 - proPrice / proOriginal) * 100) : 0

  // progress: 0 = Free, 1 = Pro. Continuous while dragging so the card morphs live.
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Extra whole turns added when the ball itself is clicked (the flourish spin).
  const [spinBoost, setSpinBoost] = useState(0)
  // Measured track width drives the px math in render (refs must not be read there).
  const [trackWidth, setTrackWidth] = useState(288)

  const trackRef = useRef<HTMLDivElement>(null)
  const ballRef = useRef<HTMLDivElement>(null)
  const squashRef = useRef<HTMLDivElement>(null)
  const textureRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const drag = useRef({ active: false, startX: 0, startP: 0, moved: false })
  // A click event always follows a ball drag/tap; the track's click handler must ignore it.
  const suppressClickUntil = useRef(0)
  const hintAnims = useRef<Animation[]>([])
  const reduceMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  const setProgressSync = useCallback((v: number) => {
    progressRef.current = v
    setProgress(v)
  }, [])

  // Only used from event handlers (reading a ref in render is a lint error).
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
      // The texture rotates by the matching arc length so the nudge reads as a roll.
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

  // Cartoon squash & stretch on every settle — damped jelly wobble.
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

  // Settle the ball on a side. `flourish` adds a full extra spin (ball click / keyboard toggle).
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
    if (drag.current.moved) {
      rollTo(progressRef.current >= 0.5 ? 1 : 0)
    } else {
      // A clean click on the ball — roll to the other side with an extra full spin.
      rollTo(drag.current.startP < 0.5 ? 1 : 0, true)
    }
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

  const p = progress
  const isPro = p >= 0.5
  const distance = p * Math.max(1, trackWidth - BALL_SIZE)
  // Rolling, not sliding: rotation = distance / circumference × 360, plus the click flourish.
  const rotation = (distance / (Math.PI * BALL_SIZE)) * 360 + spinBoost
  const rollTransition = dragging ? 'none' : `transform ${ROLL_MS}ms ${SETTLE}`
  const fadeTransition = dragging ? 'none' : `opacity ${ROLL_MS}ms ease`
  const morph = dragging
    ? 'none'
    : `transform ${ROLL_MS}ms ${SETTLE}, opacity 500ms ease, color 450ms ease, box-shadow ${ROLL_MS}ms ease, border-color ${ROLL_MS}ms ease, background-color ${ROLL_MS}ms ease`

  // Interpolated card accents: border #1e1e2e → primary blue, plus a growing glow.
  const borderColor = `rgba(${Math.round(30 + (59 - 30) * p)}, ${Math.round(30 + (130 - 30) * p)}, ${Math.round(46 + (246 - 46) * p)}, ${0.55 + 0.45 * p})`
  const glow = `0 0 ${48 * p}px rgba(59, 130, 246, ${0.18 * p}), 0 8px 32px rgba(0, 0, 0, 0.35)`

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-text-muted">
          Two plans. One little ball. Roll it to see what Pro unlocks.
        </p>
      </div>

      <div className="mx-auto mt-14 max-w-md">
        {/* ——— The roller ——— */}
        <div className="flex items-center justify-center gap-4 select-none">
          <button
            onClick={() => rollTo(0)}
            className={`text-sm font-semibold transition-colors ${!isPro ? 'text-text' : 'text-text-dim hover:text-text-muted'}`}
          >
            Free
          </button>

          <div
            ref={trackRef}
            onClick={onTrackClick}
            className="relative h-14 w-64 cursor-pointer sm:w-72"
            role="switch"
            aria-checked={isPro}
            aria-label="Toggle between Free and Pro plan"
            tabIndex={0}
            onKeyDown={onKeyDown}
          >
            {/* Track bed */}
            <div className="absolute top-1/2 left-0 h-3 w-full -translate-y-1/2 rounded-full border border-border bg-surface" />
            {/* Fill that chases the ball */}
            <div
              className="absolute top-1/2 left-0 h-3 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary/30 to-primary"
              style={{
                width: `calc(${BALL_SIZE / 2}px + ${p} * (100% - ${BALL_SIZE}px))`,
                transition: dragging ? 'none' : `width ${ROLL_MS}ms ${SETTLE}`,
              }}
            />
            {/* Destination notches */}
            <div className="absolute top-1/2 left-[5px] h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-text-dim/40" />
            <div className="absolute top-1/2 right-[5px] h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-text-dim/40" />

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
              {/* Ground shadow — spreads and softens while the ball is held */}
              <div
                className="absolute -bottom-1.5 left-1/2 h-2 w-8 rounded-full bg-black/50 blur-[3px]"
                style={{
                  transform: `translateX(-50%) scaleX(${dragging ? 1.3 : 1})`,
                  opacity: dragging ? 0.35 : 0.6,
                  transition: 'transform 150ms ease, opacity 150ms ease',
                }}
              />
              {/* Squash & stretch layer (WAAPI wobble on settle; slight lift while held) */}
              <div
                ref={squashRef}
                className="h-full w-full"
                style={{
                  transformOrigin: '50% 85%',
                  transform: dragging ? 'translateY(-2px) scale(1.05)' : undefined,
                  transition: 'transform 150ms ease',
                }}
              >
                {/* Sphere — lighting stays fixed; only the texture inside rotates */}
                <div
                  className="relative h-full w-full overflow-hidden rounded-full hover:brightness-110"
                  style={{
                    boxShadow: `0 0 ${6 + 16 * p}px rgba(59, 130, 246, ${0.55 * p}), 0 3px 8px rgba(0, 0, 0, 0.45)`,
                    transition: dragging
                      ? 'filter 150ms ease'
                      : `filter 150ms ease, box-shadow ${ROLL_MS}ms ease`,
                  }}
                >
                  {/* Base shading (Free) */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at 30% 27%, #d6d9e0 0%, #9095a1 30%, #565b66 62%, #262830 100%)',
                    }}
                  />
                  {/* Pro shading cross-fades in as the ball rolls right */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at 30% 27%, #dbeafe 0%, #60a5fa 32%, #2563eb 64%, #1e3a8a 100%)',
                      opacity: p,
                      transition: fadeTransition,
                    }}
                  />
                  {/* Rolling texture — seams + craters make the rotation readable */}
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
                  {/* Fixed lighting: top-left key light, bottom-right core shadow */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-full"
                    style={{
                      boxShadow:
                        'inset -6px -8px 12px rgba(0, 0, 0, 0.45), inset 3px 5px 7px rgba(255, 255, 255, 0.16)',
                    }}
                  />
                  {/* Specular highlight */}
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
            className={`flex items-center gap-1 text-sm font-semibold transition-colors ${isPro ? 'text-primary' : 'text-text-dim hover:text-text-muted'}`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Pro
          </button>
        </div>

        {/* ——— The morphing plan card ——— */}
        <div
          className="relative mt-8 overflow-hidden rounded-2xl border bg-surface p-8"
          style={{ borderColor, boxShadow: glow, transition: morph }}
        >
          {/* Pro ambience */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/10 to-transparent"
            style={{ opacity: p, transition: morph }}
          />

          {/* Plan name + discount badge */}
          <div className="relative flex items-center justify-between">
            <div className="relative h-7">
              <h3
                className="absolute text-lg font-semibold text-text"
                style={{ opacity: 1 - p, transform: `translateY(${p * -8}px)`, transition: morph }}
              >
                Free
              </h3>
              <h3
                className="absolute flex items-center gap-2 text-lg font-semibold text-text"
                style={{ opacity: p, transform: `translateY(${(1 - p) * 8}px)`, transition: morph }}
              >
                Pro
                <Sparkles className="h-4 w-4 text-primary" />
              </h3>
            </div>
            {discount > 0 && (
              <span
                className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                style={{ opacity: p, transform: `scale(${0.8 + 0.2 * p})`, transition: morph }}
              >
                {discount}% OFF
              </span>
            )}
          </div>

          {/* Price */}
          <div className="relative mt-4 h-14">
            <div
              className="absolute flex items-baseline gap-1"
              style={{ opacity: 1 - p, transform: `translateY(${p * -10}px)`, transition: morph }}
            >
              <span className="text-4xl font-bold text-text">$0</span>
              <span className="text-sm text-text-dim">/forever</span>
            </div>
            <div
              className="absolute flex items-baseline gap-2"
              style={{ opacity: p, transform: `translateY(${(1 - p) * 10}px)`, transition: morph }}
            >
              <span className="text-4xl font-bold text-text">{formatUsd(proPrice)}</span>
              <span className="text-sm text-text-dim">/month</span>
              {discount > 0 && (
                <span className="text-base font-medium text-text-dim line-through">
                  {formatUsd(proOriginal)}
                </span>
              )}
            </div>
          </div>

          {/* Tokens line */}
          <div className="relative h-6">
            <p
              className="absolute text-sm text-text-muted"
              style={{ opacity: 1 - p, transition: morph }}
            >
              Start building plugins with AI, free.
            </p>
            <p
              className="absolute flex items-center gap-1.5 text-sm font-medium text-primary"
              style={{ opacity: p, transition: morph }}
            >
              <Coins className="h-4 w-4" />
              {proTokens.toLocaleString()} tokens included every month
            </p>
          </div>

          {/* CTA */}
          <div className="relative mt-6 h-11">
            <Link
              to="/register"
              className="absolute inset-0 flex items-center justify-center rounded-lg border border-border bg-surface-hover text-sm font-medium text-text transition-colors hover:bg-accent"
              style={{ opacity: 1 - p, pointerEvents: isPro ? 'none' : 'auto', transition: morph }}
            >
              Get Started
            </Link>
            <Link
              to="/register"
              className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              style={{ opacity: p, pointerEvents: isPro ? 'auto' : 'none', transition: morph }}
            >
              Upgrade to Pro
            </Link>
          </div>

          {/* Feature matrix — icons flip ✕ → ✓ as the ball rolls */}
          <ul className="mt-8 space-y-3">
            {features.map((feature, i) => {
              const included = isPro ? feature.pro : feature.free
              const changes = feature.free !== feature.pro
              const rowOpacity = changes ? 0.55 + 0.45 * (feature.pro ? p : 1 - p) : 1
              return (
                <li
                  key={`${feature.label}-${i}`}
                  className="flex items-center gap-3 text-sm text-text-muted"
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
                  <span className={included ? 'text-text-muted' : ''}>{feature.label}</span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Token top-up note */}
        <p className="mt-6 text-center text-sm text-text-dim">
          Need more tokens? Top up anytime for{' '}
          <span className="font-medium text-text-muted">
            {formatUsd(tokenPer1k)} / 1,000 tokens
          </span>
          .
        </p>
      </div>
    </div>
  )
}

import { useState, useCallback, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '@/hooks/use-auth'
import { PasswordStrength } from '@/components/auth/password-strength'
import { Blocks, Eye, EyeOff } from 'lucide-react'
import type { ApiError } from '@/types'

type Mode = 'login' | 'register'
type Gaze = 'idle' | 'watch' | 'away'
/** 'side' = form beside the lamp (desktop, lg+); 'stacked' = form below it (mobile). */
type SceneLayout = 'side' | 'stacked'

/** Tracks the same lg breakpoint the page grid switches at (Tailwind lg = 1024px). */
function useIsDesktopLayout() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}

/**
 * Fire-and-forget animation trigger: flips a flag on, then back off after
 * `duration`. Restarts cleanly even if fired again mid-animation.
 */
function useOneShot(duration: number) {
  const [active, setActive] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const raf = useRef<number | undefined>(undefined)

  const fire = useCallback(() => {
    window.clearTimeout(timer.current)
    if (raf.current) cancelAnimationFrame(raf.current)
    setActive(false)
    raf.current = requestAnimationFrame(() => {
      setActive(true)
      timer.current = window.setTimeout(() => setActive(false), duration)
    })
  }, [duration])

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (raf.current) cancelAnimationFrame(raf.current)
    },
    [],
  )

  return [active, fire] as const
}

/**
 * Gaze is layout-aware. Desktop ('side'): the form sits to the RIGHT of the
 * lamp, so the frog watches to the right and turns left to look away. Mobile
 * ('stacked'): the form is BELOW the scene, so the frog watches downward and
 * lifts its face UP to look away. The head pivot (140, 114) is baked into the
 * value and every state shares the same transform-list shape, so the move
 * stays anchored and transitions interpolate smoothly on every browser.
 */
function gazeTransforms(gaze: Gaze, layout: SceneLayout) {
  const head = (deg: number, dx: number, dy: number) =>
    `translate(140px, 114px) rotate(${deg}deg) translate(${dx}px, ${dy}px) translate(-140px, -114px)`
  if (layout === 'side') {
    if (gaze === 'away') return { head: head(-30, -5, 0), pupils: 'translate(-4px, -2px)' }
    if (gaze === 'watch') return { head: head(5, 0, 0), pupils: 'translate(3px, 4px)' }
  } else {
    if (gaze === 'away') return { head: head(-8, 0, -4), pupils: 'translate(0px, -5px)' }
    if (gaze === 'watch') return { head: head(0, 0, 3.5), pupils: 'translate(0px, 5px)' }
  }
  return { head: head(0, 0, 0), pupils: 'translate(0px, 0px)' }
}

const FROG = {
  base: '#74b53a',
  mid: '#5f9c2e',
  belly: '#f2d23a',
  line: '#2f6b18',
  iris: '#f2b32c',
  pupil: '#1c2433',
}

type Digit = { a: number; len: number; w: number }
const DIGIT_OUTLINE = 2.6
// slim front fingers, fanned downward to grip the front of the lamp
const FRONT_FINGERS: Digit[] = [
  { a: 42, len: 17, w: 4.4 },
  { a: 16, len: 20, w: 4.6 },
  { a: -8, len: 20, w: 4.6 },
  { a: -30, len: 16, w: 4.2 },
]

/**
 * A splayed hand/foot. Each digit is a round-capped capsule (a dark outline
 * stroke under a lighter green stroke) — no bulbous tip pads. `dir` (±1)
 * mirrors the fan so left/right splay outward.
 */
function Digits({ bx, by, dir, spec }: { bx: number; by: number; dir: number; spec: Digit[] }) {
  const capsule = (d: Digit, color: string, grow: number) => (
    <line
      key={`${color}-${d.a}`}
      x1={bx}
      y1={by}
      x2={bx}
      y2={by + d.len}
      stroke={color}
      strokeWidth={d.w + grow}
      strokeLinecap="round"
      transform={`rotate(${dir * d.a} ${bx} ${by})`}
    />
  )
  return (
    <g>
      {spec.map((d) => capsule(d, FROG.line, DIGIT_OUTLINE))}
      {spec.map((d) => capsule(d, FROG.base, 0))}
    </g>
  )
}

/**
 * A folded hind leg: a slim filled haunch tucked against the body — a tilted
 * ellipse whose inner half is covered by the body (drawn after it), so only
 * the outer thigh crescent shows. The foot/toes stay hidden behind the frog,
 * gripping the lamp from the back. `dir` (±1) mirrors it per side.
 */
function HindLeg({ dir }: { dir: number }) {
  const cx = 140 + dir * 24
  const cy = 149
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={14}
      ry={26}
      fill={FROG.mid}
      stroke={FROG.line}
      strokeWidth={3}
      transform={`rotate(${dir * 20} ${cx} ${cy})`}
    />
  )
}

interface LampSceneProps {
  mode: Mode
  gaze: Gaze
  layout: SceneLayout
  isJumping: boolean
  isSwinging: boolean
  isShaking: boolean
  onToggle: () => void
}

function LampScene({ mode, gaze, layout, isJumping, isSwinging, isShaking, onToggle }: LampSceneProps) {
  const palette =
    mode === 'register'
      ? { shade: '#22c55e', shadeDeep: '#15803d', bright: '#4ade80' }
      : { shade: '#3b82f6', shadeDeep: '#1d4ed8', bright: '#60a5fa' }

  const fillT = (color: string, extra?: React.CSSProperties): React.CSSProperties => ({
    fill: color,
    transition: 'fill 0.55s ease',
    ...extra,
  })

  const g = gazeTransforms(gaze, layout)
  const pullLabel = `Pull the cord to switch to ${mode === 'login' ? 'sign up' : 'sign in'}`

  return (
    <div className="w-full max-w-[180px] select-none sm:max-w-[220px] lg:max-w-[300px]">
      <svg viewBox="0 -80 280 550" className="h-auto w-full">
        {/* ceiling mount (static); the extra headroom above the lamp gives
            the frog's full jump arc room to play out */}
        <ellipse cx={140} cy={-75} rx={13} ry={4} fill="#3f3f46" />

        <g className={`lamp-root${isSwinging ? ' is-swinging' : ''}`}>
          {/* hanging cord */}
          <line x1={140} y1={-75} x2={140} y2={150} stroke="#52525b" strokeWidth={3} />

          {/* soft glow + downward light cone */}
          <circle className="lamp-glow" cx={140} cy={262} r={92} style={fillT(palette.bright, { filter: 'blur(26px)' })} />
          <polygon
            points="82,250 198,250 244,468 36,468"
            fillOpacity={0.07}
            style={fillT(palette.shade, { filter: 'blur(6px)' })}
          />

          {/* lamp shade */}
          <path d="M 70 250 C 70 175, 108 152, 140 152 C 172 152, 210 175, 210 250 Z" style={fillT(palette.shade)} />
          <path d="M 86 244 C 84 192, 104 165, 128 156 C 112 172, 99 205, 99 244 Z" fill="#ffffff" fillOpacity={0.16} />
          <ellipse cx={140} cy={250} rx={70} ry={12} style={fillT(palette.shadeDeep)} />
          <ellipse cx={140} cy={256} rx={24} ry={18} fillOpacity={0.7} style={fillT(palette.bright, { filter: 'blur(9px)' })} />
          <ellipse cx={140} cy={255} rx={13} ry={10} fill="#fff6da" />

          {/* frog shadow (static, so the frog lifts off it when jumping) */}
          <ellipse cx={140} cy={182} rx={44} ry={8} fill="rgba(0,0,0,0.18)" />

          {/* frog perched on the lamp */}
          <g className={`frog${isJumping ? ' is-jumping' : ''}`}>
            {/* hind legs run down the sides and grip the lamp from behind;
                grouped so the jump can compress/extend them */}
            <g className="frog-legs">
              <HindLeg dir={-1} />
              <HindLeg dir={1} />
            </g>

            {/* slim body + yellow belly */}
            <path
              d="M 122 108 C 110 124, 112 156, 127 170 C 134 176, 146 176, 153 170 C 168 156, 170 124, 158 108 C 149 100, 131 100, 122 108 Z"
              fill={FROG.base}
              stroke={FROG.line}
              strokeWidth={3}
              strokeLinejoin="round"
            />
            <ellipse cx={140} cy={150} rx={18} ry={21} fill={FROG.belly} />

            {/* slim front arms + splayed hands; grouped so the jump can show
                them lagging behind the body and releasing the rim mid-air */}
            <g className="frog-arms">
              <path d="M 124 130 Q 120 156 126 170" fill="none" stroke={FROG.line} strokeWidth={10.6} strokeLinecap="round" />
              <path d="M 124 130 Q 120 156 126 170" fill="none" stroke={FROG.base} strokeWidth={8} strokeLinecap="round" />
              <path d="M 156 130 Q 160 156 154 170" fill="none" stroke={FROG.line} strokeWidth={10.6} strokeLinecap="round" />
              <path d="M 156 130 Q 160 156 154 170" fill="none" stroke={FROG.base} strokeWidth={8} strokeLinecap="round" />
              <Digits bx={126} by={172} dir={-1} spec={FRONT_FINGERS} />
              <Digits bx={154} by={172} dir={1} spec={FRONT_FINGERS} />
            </g>

            {/* head — turns with gaze, shakes on disapproval */}
            <g className={`frog-head-shake${isShaking ? ' is-shaking' : ''}`}>
              <g className="frog-head" style={{ transform: g.head }}>
                <path
                  d="M 102 114 C 96 94, 104 74, 120 72 C 127 71, 133 70, 140 70 C 147 70, 153 71, 160 72 C 176 74, 184 94, 178 114 C 165 124, 115 124, 102 114 Z"
                  fill={FROG.base}
                  stroke={FROG.line}
                  strokeWidth={3}
                  strokeLinejoin="round"
                />
                {/* bulging eyes on top of the head */}
                <circle cx={119} cy={74} r={15} fill={FROG.base} stroke={FROG.line} strokeWidth={3} />
                <circle cx={161} cy={74} r={15} fill={FROG.base} stroke={FROG.line} strokeWidth={3} />

                <g className="frog-eyes">
                  <ellipse cx={119} cy={78} rx={9} ry={10} fill="#ffffff" />
                  <ellipse cx={161} cy={78} rx={9} ry={10} fill="#ffffff" />
                  <g className="frog-pupils" style={{ transform: g.pupils }}>
                    <circle cx={119} cy={80} r={6.6} fill={FROG.iris} />
                    <circle cx={161} cy={80} r={6.6} fill={FROG.iris} />
                    <circle cx={119} cy={81} r={4.2} fill={FROG.pupil} />
                    <circle cx={161} cy={81} r={4.2} fill={FROG.pupil} />
                    <circle cx={121.4} cy={78.5} r={1.8} fill="#ffffff" />
                    <circle cx={163.4} cy={78.5} r={1.8} fill="#ffffff" />
                  </g>
                </g>

                {/* nostrils + smile */}
                <ellipse cx={134} cy={98} rx={1.5} ry={2} fill={FROG.line} />
                <ellipse cx={146} cy={98} rx={1.5} ry={2} fill={FROG.line} />
                <path d="M 113 106 Q 140 126 167 106" fill="none" stroke={FROG.line} strokeWidth={3} strokeLinecap="round" />
              </g>
            </g>
          </g>

          {/* pull cord — click / Enter / Space toggles login ↔ register */}
          <g
            className="pull"
            role="button"
            tabIndex={0}
            aria-label={pullLabel}
            onClick={onToggle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggle()
              }
            }}
          >
            <circle cx={198} cy={336} r={32} fill="transparent" />
            <g className={`pull-assembly${isSwinging ? ' is-tugging' : ''}`}>
              <rect className="pull-cord" x={196.6} y={246} width={2.8} height={80} rx={1.4} fill="#9ca3af" />
              <g className="pull-bead">
                <circle
                  className="pull-ring"
                  cx={198}
                  cy={336}
                  r={13}
                  fill="none"
                  strokeWidth={2}
                  style={{ stroke: palette.bright, transition: 'stroke 0.55s ease' }}
                />
                <circle cx={198} cy={336} r={8} stroke="#ffffff" strokeWidth={1.5} style={fillT(palette.bright)} />
              </g>
            </g>
          </g>
        </g>
      </svg>

      <p className="mt-3 text-center text-xs font-medium text-text-dim">
        Pull the rope to {mode === 'login' ? 'sign up' : 'sign in'}
      </p>
    </div>
  )
}

interface AuthSceneProps {
  initialMode: Mode
}

export default function AuthScene({ initialMode }: AuthSceneProps) {
  const navigate = useNavigate()
  const { login, isLoggingIn, loginError, register, isRegistering, registerError } = useAuth()
  const isDesktopLayout = useIsDesktopLayout()

  const [mode, setMode] = useState<Mode>(initialMode)
  const [showPassword, setShowPassword] = useState(false)
  const [filling, setFilling] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [form, setForm] = useState({ login: '', username: '', email: '', password: '', confirmPassword: '' })

  // Durations cover each animation's delay + run time (see index.css).
  const [isJumping, fireJump] = useOneShot(1300)
  const [isSwinging, fireSwing] = useOneShot(1700)
  const [isShaking, fireShake] = useOneShot(560)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const toggleMode = useCallback(() => {
    setValidationError('')
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    fireJump()
    fireSwing()
  }, [fireJump, fireSwing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')

    try {
      if (mode === 'register') {
        if (form.password !== form.confirmPassword) {
          setValidationError('Passwords do not match')
          fireShake()
          return
        }
        if (form.password.length < 8) {
          setValidationError('Password must be at least 8 characters')
          fireShake()
          return
        }
        if (form.username.length < 3) {
          setValidationError('Username must be at least 3 characters')
          fireShake()
          return
        }
        await register({ username: form.username, email: form.email, password: form.password })
      } else {
        await login({ login: form.login, password: form.password })
      }
      navigate('/dashboard')
    } catch {
      // Auth failed — frog shakes its head in disapproval. Error shown below.
      fireShake()
    }
  }

  const mutationError = (mode === 'login' ? (loginError as ApiError | null) : (registerError as ApiError | null))?.message
  const error = validationError || mutationError
  const busy = mode === 'login' ? isLoggingIn : isRegistering
  const gaze: Gaze = showPassword ? 'away' : filling ? 'watch' : 'idle'

  const accent =
    mode === 'register'
      ? {
          ring: 'focus:border-success focus:ring-success/30',
          btn: 'bg-success text-white hover:opacity-90',
          soft: 'bg-success/10 text-success',
          bar: 'from-success/80',
        }
      : {
          ring: 'focus:border-primary focus:ring-primary/30',
          btn: 'bg-primary text-primary-foreground hover:bg-primary-hover',
          soft: 'bg-primary/10 text-primary',
          bar: 'from-primary/80',
        }
  const inputCls = `w-full rounded-lg border border-border bg-surface/70 px-3.5 py-2.5 text-sm text-text placeholder:text-text-dim outline-none transition focus:ring-2 ${accent.ring}`

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-10">
      {/* ambient glow, cross-fading with the lamp colour */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className={`absolute left-[28%] top-1/3 h-[440px] w-[440px] -translate-x-1/2 rounded-full blur-[130px] transition-opacity duration-700 ${mode === 'register' ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.18), transparent 70%)' }}
        />
        <div
          className={`absolute left-[28%] top-1/3 h-[440px] w-[440px] -translate-x-1/2 rounded-full blur-[130px] transition-opacity duration-700 ${mode === 'login' ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.18), transparent 70%)' }}
        />
      </div>

      <span className="sr-only" aria-live="polite">
        {mode === 'login' ? 'Sign in form' : 'Create account form'}
      </span>

      <div className="relative grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
        <div className="flex justify-center lg:justify-end">
          <LampScene
            mode={mode}
            gaze={gaze}
            layout={isDesktopLayout ? 'side' : 'stacked'}
            isJumping={isJumping}
            isSwinging={isSwinging}
            isShaking={isShaking}
            onToggle={toggleMode}
          />
        </div>

        <div className="flex justify-center lg:justify-start">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent.bar} to-transparent`} />

            <div className="mb-7 text-center">
              <div className={`mb-4 inline-flex rounded-xl p-3 transition-colors ${accent.soft}`}>
                <Blocks className="h-8 w-8" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-text">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="mt-2 text-sm text-text-muted">
                {mode === 'login' ? 'Sign in to your AuroraCraft account' : 'Start building Minecraft plugins with AI'}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              onFocus={() => setFilling(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFilling(false)
              }}
              className="space-y-4"
            >
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-text">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    required
                    autoComplete="username"
                    value={form.username}
                    onChange={set('username')}
                    className={inputCls}
                    placeholder="craftmaster"
                  />
                </div>
              )}

              {mode === 'login' ? (
                <div>
                  <label htmlFor="login" className="mb-1.5 block text-sm font-medium text-text">
                    Email or Username
                  </label>
                  <input
                    id="login"
                    type="text"
                    required
                    autoComplete="username"
                    value={form.login}
                    onChange={set('login')}
                    className={inputCls}
                    placeholder="you@example.com"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-text">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={set('email')}
                    className={inputCls}
                    placeholder="you@example.com"
                  />
                </div>
              )}

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-text">
                    Password
                  </label>
                  {mode === 'login' && (
                    <Link to="/forgot-password" className="text-xs text-primary hover:text-primary-hover">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={form.password}
                    onChange={set('password')}
                    className={`${inputCls} pr-10`}
                    placeholder={mode === 'login' ? 'Enter your password' : 'Min 8 characters'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim transition-colors hover:text-text-muted"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mode === 'register' && (
                  <div className="mt-2">
                    <PasswordStrength password={form.password} />
                  </div>
                )}
              </div>

              {mode === 'register' && (
                <div>
                  <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-text">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={set('confirmPassword')}
                    className={inputCls}
                    placeholder="Re-enter your password"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${accent.btn}`}
              >
                {busy
                  ? mode === 'login'
                    ? 'Signing in...'
                    : 'Creating account...'
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-text-muted">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button type="button" onClick={toggleMode} className="font-medium text-primary hover:text-primary-hover">
                Pull the rope
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

import { Link, useLocation } from 'react-router'
import { useAuth } from '@/hooks/use-auth'
import { Blocks, Menu, X } from 'lucide-react'
import { useState } from 'react'

const publicLinks = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Community', href: '/community' },
  { label: 'Docs', href: '/docs' },
]

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-text">
          <Blocks className="h-6 w-6 text-primary" />
          AuroraCraft
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                location.pathname === link.href
                  ? 'text-text'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {link.label}
            </Link>
          ))}

          {isAuthenticated ? (
            <>
              <Link
                to="/dashboard"
                className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
              >
                Dashboard
              </Link>
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
                >
                  Admin
                </Link>
              )}
              <div className="ml-2 flex items-center gap-2 border-l border-border pl-4">
                <span className="text-sm text-text-muted">{user?.username}</span>
                <button
                  onClick={() => logout()}
                  className="rounded-md bg-surface px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
                >
                  Log out
                </button>
              </div>
            </>
          ) : (
            <div className="ml-2 flex items-center gap-2 border-l border-border pl-4">
              <Link
                to="/login"
                className="rounded-md px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Get Started
              </Link>
            </div>
          )}
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-md p-2 text-text-muted md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-2">
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
              >
                {link.label}
              </Link>
            ))}
            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
                >
                  Dashboard
                </Link>
                {user?.role === 'admin' && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
                  >
                    Admin Panel
                  </Link>
                )}
                <button
                  onClick={() => { logout(); setMobileOpen(false) }}
                  className="rounded-md px-3 py-2 text-left text-sm text-text-muted transition-colors hover:text-text"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

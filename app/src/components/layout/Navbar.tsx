"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

export function Navbar() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { user, logout } = useAuth();

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#050508]/80 backdrop-blur-xl border-b border-white/5">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-3">
                        <Logo className="w-8 h-8" />
                        <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            AuroraCraft
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-8">
                        <Link
                            href="/#features"
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            Features
                        </Link>
                        <Link
                            href="/#showcase"
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            Products
                        </Link>
                        <Link
                            href="/#how-it-works"
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            How It Works
                        </Link>
                        <Link
                            href="/docs"
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            Docs
                        </Link>
                    </div>

                    {/* Auth Buttons */}
                    <div className="hidden md:flex items-center gap-4">
                        {user ? (
                            <>
                                <span className="text-gray-400">{user.username}</span>
                                <Button href="/dashboard" variant="primary" size="sm">
                                    Dashboard
                                </Button>
                                <Button onClick={logout} variant="ghost" size="sm">
                                    Logout
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button href="/login" variant="ghost" size="sm">
                                    Login
                                </Button>
                                <Button href="/register" variant="primary" size="sm">
                                    Get Started
                                </Button>
                            </>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        className="md:hidden p-2"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        aria-label="Toggle menu"
                    >
                        <div className="w-6 h-5 flex flex-col justify-between">
                            <span
                                className={`w-full h-0.5 bg-white transform transition-all ${isMobileMenuOpen ? "rotate-45 translate-y-2" : ""}`}
                            />
                            <span
                                className={`w-full h-0.5 bg-white transition-opacity ${isMobileMenuOpen ? "opacity-0" : ""}`}
                            />
                            <span
                                className={`w-full h-0.5 bg-white transform transition-all ${isMobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`}
                            />
                        </div>
                    </button>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div className="md:hidden py-4 border-t border-white/5">
                        <div className="flex flex-col gap-4">
                            <Link
                                href="/#features"
                                className="text-gray-400 hover:text-white"
                            >
                                Features
                            </Link>
                            <Link
                                href="/#showcase"
                                className="text-gray-400 hover:text-white"
                            >
                                Products
                            </Link>
                            <Link
                                href="/#how-it-works"
                                className="text-gray-400 hover:text-white"
                            >
                                How It Works
                            </Link>
                            <div className="pt-4 border-t border-white/5 flex flex-col gap-2">
                                {user ? (
                                    <>
                                        <Button href="/dashboard" variant="primary">
                                            Dashboard
                                        </Button>
                                        <Button onClick={logout} variant="secondary">
                                            Logout
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button href="/login" variant="secondary">
                                            Login
                                        </Button>
                                        <Button href="/register" variant="primary">
                                            Get Started
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </nav>
        </header>
    );
}

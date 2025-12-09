'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    Sparkles,
    Zap,
    Code2,
    Blocks,
    Globe,
    MessageSquare,
    ArrowRight,
    CheckCircle,
    Users,
    FileCode,
    Cpu
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';

export default function HomePage() {
    const [prompt, setPrompt] = useState('');
    const [activeTab, setActiveTab] = useState<'minecraft' | 'discord' | 'web'>('minecraft');
    const router = useRouter();
    const { isAuthenticated, user } = useAuthStore();

    const handleStartBuilding = () => {
        if (prompt.trim()) {
            // Store prompt and redirect
            sessionStorage.setItem('initialPrompt', prompt);
        }
        if (isAuthenticated) {
            router.push('/dashboard');
        } else {
            router.push('/login');
        }
    };

    const stats = [
        { label: 'Plugins Created', value: '9,000+', icon: FileCode },
        { label: 'Active Users', value: '2,500+', icon: Users },
        { label: 'Tokens Used Monthly', value: '350M+', icon: Cpu },
    ];

    const features = [
        {
            icon: Sparkles,
            title: 'Deep AI Reasoning',
            description: 'Multi-step thinking with verification passes for high-quality code',
        },
        {
            icon: Code2,
            title: 'Complete Projects',
            description: 'Full Maven structure, configurations, and production-ready code',
        },
        {
            icon: Zap,
            title: 'Instant Compilation',
            description: 'Built-in Maven compiler with live logs and JAR downloads',
        },
        {
            icon: Blocks,
            title: 'All Frameworks',
            description: 'Paper, Spigot, Bukkit, Folia, Velocity, BungeeCord & more',
        },
    ];

    return (
        <div className="min-h-screen bg-dark-950 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-aurora-500/10 rounded-full blur-3xl" />
                <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
            </div>

            {/* Navigation */}
            <nav className="relative z-10 border-b border-dark-800/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aurora-500 to-purple-600 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold gradient-text">AuroraCraft</span>
                        </div>
                        <div className="flex items-center gap-4">
                            {isAuthenticated ? (
                                <>
                                    <span className="text-dark-400 text-sm">
                                        {user?.tokenBalance?.toLocaleString()} tokens
                                    </span>
                                    <Link href="/dashboard" className="btn-primary">
                                        Dashboard
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link href="/login" className="btn-ghost">
                                        Sign In
                                    </Link>
                                    <Link href="/register" className="btn-primary">
                                        Get Started
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="text-center"
                    >
                        <h1 className="text-5xl md:text-6xl font-bold mb-6">
                            <span className="gradient-text">What should we build?</span>
                        </h1>
                        <p className="text-xl text-dark-400 mb-12 max-w-2xl mx-auto">
                            Create astounding plugins with no coding knowledge required.
                            Powered by advanced AI with deep reasoning capabilities.
                        </p>

                        {/* Project Type Tabs */}
                        <div className="flex justify-center gap-2 mb-8">
                            <button
                                onClick={() => setActiveTab('minecraft')}
                                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'minecraft'
                                        ? 'bg-aurora-600 text-white'
                                        : 'bg-dark-800 text-dark-400 hover:text-dark-200'
                                    }`}
                            >
                                <Blocks className="w-5 h-5" />
                                Minecraft
                            </button>
                            <button
                                disabled
                                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium bg-dark-800/50 text-dark-500 cursor-not-allowed"
                                title="Coming soon"
                            >
                                <MessageSquare className="w-5 h-5" />
                                Discord
                                <span className="text-xs bg-dark-700 px-2 py-0.5 rounded">Soon</span>
                            </button>
                            <button
                                disabled
                                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium bg-dark-800/50 text-dark-500 cursor-not-allowed"
                                title="Coming soon"
                            >
                                <Globe className="w-5 h-5" />
                                Web
                                <span className="text-xs bg-dark-700 px-2 py-0.5 rounded">Soon</span>
                            </button>
                        </div>

                        {/* Main Input */}
                        <div className="max-w-3xl mx-auto">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-aurora-500/20 via-purple-500/20 to-pink-500/20 rounded-2xl blur-xl" />
                                <div className="relative glass rounded-2xl p-2">
                                    <textarea
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="Describe your Minecraft plugin... e.g., 'Create a custom enchantment plugin with 10 unique enchantments for weapons and armor'"
                                        className="w-full bg-transparent border-0 resize-none text-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-0 p-4 min-h-[120px]"
                                        rows={3}
                                    />
                                    <div className="flex items-center justify-between px-4 pb-4">
                                        <div className="flex items-center gap-4 text-sm text-dark-500">
                                            <span>Paper/Spigot</span>
                                            <span>•</span>
                                            <span>Java 21</span>
                                            <span>•</span>
                                            <span>Maven</span>
                                        </div>
                                        <button
                                            onClick={handleStartBuilding}
                                            className="btn-primary text-lg px-8 py-3 aurora-glow"
                                        >
                                            Start Building
                                            <ArrowRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Stats */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="grid grid-cols-3 gap-8 mt-20 max-w-3xl mx-auto"
                    >
                        {stats.map((stat) => (
                            <div key={stat.label} className="text-center">
                                <div className="flex justify-center mb-3">
                                    <div className="w-12 h-12 rounded-xl bg-aurora-600/20 flex items-center justify-center">
                                        <stat.icon className="w-6 h-6 text-aurora-400" />
                                    </div>
                                </div>
                                <div className="text-3xl font-bold text-dark-100">{stat.value}</div>
                                <div className="text-dark-500">{stat.label}</div>
                            </div>
                        ))}
                    </motion.div>

                    {/* Features */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-24"
                    >
                        {features.map((feature) => (
                            <div
                                key={feature.title}
                                className="card hover:border-aurora-500/30 transition-all group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-aurora-500/20 to-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <feature.icon className="w-6 h-6 text-aurora-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-dark-100 mb-2">
                                    {feature.title}
                                </h3>
                                <p className="text-dark-400 text-sm">{feature.description}</p>
                            </div>
                        ))}
                    </motion.div>

                    {/* Supported Frameworks */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                        className="mt-24 text-center"
                    >
                        <h2 className="text-2xl font-bold text-dark-200 mb-8">
                            Supports All Major Frameworks
                        </h2>
                        <div className="flex flex-wrap justify-center gap-4">
                            {[
                                'Paper', 'Spigot', 'Bukkit', 'Folia', 'Purpur',
                                'Velocity', 'BungeeCord', 'Waterfall', 'ASPaper', 'Leaves'
                            ].map((framework) => (
                                <div
                                    key={framework}
                                    className="flex items-center gap-2 px-4 py-2 bg-dark-800/50 border border-dark-700/50 rounded-lg"
                                >
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    <span className="text-dark-300">{framework}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 border-t border-dark-800/50 mt-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-aurora-500 to-purple-600 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-dark-400">AuroraCraft</span>
                        </div>
                        <p className="text-dark-500 text-sm">
                            © 2024 AuroraCraft. AI-Powered Minecraft Plugin Builder.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}

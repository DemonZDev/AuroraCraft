"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

const tabs = [
    { id: "minecraft", label: "Minecraft", icon: "🎮" },
    { id: "discord", label: "Discord", icon: "💬" },
    { id: "webapps", label: "Web Apps", icon: "🌐" },
];

const headlines: Record<string, { title: string; highlight: string }> = {
    minecraft: { title: "Build ", highlight: "Minecraft Plugins & Mods" },
    discord: { title: "Create ", highlight: "Discord Bots Instantly" },
    webapps: { title: "Launch ", highlight: "Web Applications Fast" },
};

interface Stat {
    value: number;
    suffix: string;
    label: string;
}

const stats: Stat[] = [
    { value: 12847, suffix: "", label: "Projects Created" },
    { value: 8432, suffix: "", label: "Active Users" },
    { value: 2.4, suffix: "M", label: "Tokens Generated" },
];

function AnimatedCounter({ target, suffix }: { target: number; suffix: string }) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const duration = 2000;
        const steps = 60;
        const increment = target / steps;
        let current = 0;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                setCount(target);
                clearInterval(timer);
            } else {
                setCount(current);
            }
        }, duration / steps);
        return () => clearInterval(timer);
    }, [target]);

    const formatted = suffix
        ? count.toFixed(1)
        : Math.round(count).toLocaleString();

    return (
        <span className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            {formatted}{suffix}
        </span>
    );
}

export function HeroSection() {
    const [activeTab, setActiveTab] = useState("minecraft");

    return (
        <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-16 px-4 overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-cyan-900/10" />
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
                <div
                    className="absolute inset-0 opacity-20"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
                        backgroundSize: "60px 60px",
                    }}
                />
            </div>

            <div className="max-w-5xl mx-auto text-center">
                {/* Tabs */}
                <div className="inline-flex items-center gap-2 p-1.5 bg-[#16161f] rounded-full border border-white/5 mb-10">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${activeTab === tab.id
                                    ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-lg shadow-purple-500/25"
                                    : "text-gray-400 hover:text-white"
                                }`}
                        >
                            <span>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Headline */}
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6 leading-tight">
                    {headlines[activeTab].title}
                    <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent animate-shimmer bg-[length:200%_auto]">
                        {headlines[activeTab].highlight}
                    </span>
                </h1>

                <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
                    Turn ideas into production-ready software with AI. No coding required.
                    Just describe what you want to build.
                </p>

                {/* CTA */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                    <Button href="/register" variant="primary" size="lg">
                        Start Building
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 7l5 5m0 0l-5 5m5-5H6"
                            />
                        </svg>
                    </Button>
                    <Button href="/#how-it-works" variant="secondary" size="lg">
                        See How It Works
                    </Button>
                </div>

                {/* Stats */}
                <div className="inline-flex flex-col sm:flex-row items-center gap-6 sm:gap-8 p-6 sm:p-8 bg-[#16161f]/80 backdrop-blur-xl rounded-2xl border border-white/5">
                    {stats.map((stat, index) => (
                        <div key={stat.label} className="flex flex-col items-center">
                            <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                            <span className="text-sm text-gray-500 mt-1">{stat.label}</span>
                            {index < stats.length - 1 && (
                                <div className="hidden sm:block absolute right-0 top-1/2 -translate-y-1/2 w-px h-10 bg-white/10" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Scroll Indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-500 animate-bounce">
                <div className="w-6 h-10 border-2 border-gray-500 rounded-full flex justify-center pt-2">
                    <div className="w-1 h-2 bg-gray-500 rounded-full animate-pulse" />
                </div>
                <span className="text-xs">Scroll</span>
            </div>
        </section>
    );
}

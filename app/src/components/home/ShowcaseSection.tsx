"use client";

import { Card } from "@/components/ui/Card";
import Link from "next/link";

const products = [
    {
        id: "plugin",
        title: "Minecraft Plugin Builder",
        description: "Create Spigot, Paper, and Bukkit plugins with custom commands, events, and integrations.",
        features: ["Custom commands", "Event handlers", "Config files", "Auto-compile"],
        gradient: "from-purple-500 to-cyan-500",
        icon: "🎮",
    },
    {
        id: "mod",
        title: "Minecraft Mod Builder",
        description: "Build Forge and Fabric mods with new items, blocks, mobs, and dimensions.",
        features: ["Custom items", "New entities", "World gen", "Client & server"],
        gradient: "from-pink-500 to-purple-500",
        icon: "⚔️",
    },
    {
        id: "discord",
        title: "Discord Bot Builder",
        description: "Create powerful Discord bots with slash commands, moderation, and custom features.",
        features: ["Slash commands", "Moderation", "Music & games", "Auto-hosting"],
        gradient: "from-indigo-500 to-green-400",
        icon: "🤖",
    },
    {
        id: "webapp",
        title: "Web App Builder",
        description: "Launch full-stack web applications with modern frameworks and instant deployment.",
        features: ["React & Next.js", "API integration", "Database", "One-click deploy"],
        gradient: "from-orange-500 to-red-500",
        icon: "🌐",
        comingSoon: true,
    },
];

export function ShowcaseSection() {
    return (
        <section id="showcase" className="py-24 px-4 bg-gradient-to-b from-transparent via-[#0a0a0f] to-transparent">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-16">
                    <span className="inline-block px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-sm font-medium text-purple-400 mb-4">
                        What You Can Build
                    </span>
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">
                        Choose your{" "}
                        <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            creation
                        </span>
                    </h2>
                    <p className="text-gray-400 max-w-2xl mx-auto">
                        From plugins to full applications, we&apos;ve got you covered
                    </p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {products.map((product) => (
                        <Card
                            key={product.id}
                            hover
                            glow
                            className="group relative overflow-hidden"
                        >
                            {/* Animated border */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                <div className={`absolute inset-0 bg-gradient-to-r ${product.gradient} blur-xl opacity-20`} />
                            </div>

                            <div className="relative">
                                {/* Icon */}
                                <div className="text-4xl mb-4">{product.icon}</div>

                                {/* Title */}
                                <h3 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
                                    {product.title}
                                    {product.comingSoon && (
                                        <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full">
                                            Coming Soon
                                        </span>
                                    )}
                                </h3>

                                {/* Description */}
                                <p className="text-gray-400 mb-5">{product.description}</p>

                                {/* Features */}
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {product.features.map((feature) => (
                                        <span
                                            key={feature}
                                            className="px-3 py-1 bg-[#12121a] rounded-full text-xs text-gray-400"
                                        >
                                            {feature}
                                        </span>
                                    ))}
                                </div>

                                {/* CTA */}
                                <Link
                                    href={product.comingSoon ? "#" : "/dashboard"}
                                    className={`inline-flex items-center gap-2 font-semibold transition-all ${product.comingSoon
                                            ? "text-gray-500 cursor-not-allowed"
                                            : "text-purple-400 hover:text-purple-300 hover:gap-3"
                                        }`}
                                >
                                    {product.comingSoon ? "Coming Soon" : "Start Building"}
                                    <svg
                                        className="w-4 h-4"
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
                                </Link>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}

import { Card } from "@/components/ui/Card";

const features = [
    {
        icon: (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
        ),
        title: "7+ AI Models",
        description: "Access GPT-4, Claude, Gemini, and more. Switch models instantly based on your task.",
        badges: ["GPT-4", "Claude", "Gemini"],
        featured: true,
    },
    {
        icon: (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
        ),
        title: "Instant Compilation",
        description: "One-click build with automatic error detection. Production-ready code in seconds.",
    },
    {
        icon: (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
        title: "Live Testing",
        description: "Test in isolated sandboxes with real-time logs and <100ms latency.",
    },
    {
        icon: (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
        title: "Version Control",
        description: "Automatic checkpoints with every change. Rollback instantly with one click.",
    },
    {
        icon: (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
        ),
        title: "Professional IDE",
        description: "Full-featured editor with syntax highlighting, file navigation, and shortcuts.",
    },
    {
        icon: (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        ),
        title: "Multi-Platform",
        description: "Build for Minecraft, Discord, Web, and more. One platform, unlimited possibilities.",
    },
];

export function FeaturesSection() {
    return (
        <section id="features" className="py-24 px-4">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-16">
                    <span className="inline-block px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-sm font-medium text-purple-400 mb-4">
                        Powerful Features
                    </span>
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">
                        Everything you need to{" "}
                        <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            succeed
                        </span>
                    </h2>
                    <p className="text-gray-400 max-w-2xl mx-auto">
                        Professional development tools without the complexity
                    </p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature, index) => (
                        <Card
                            key={index}
                            hover
                            glow
                            className={feature.featured ? "md:col-span-2 lg:col-span-1" : ""}
                        >
                            <div className="flex flex-col h-full">
                                <div className="w-14 h-14 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400 mb-5">
                                    {feature.icon}
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-3">
                                    {feature.title}
                                </h3>
                                <p className="text-gray-400 flex-1">{feature.description}</p>
                                {feature.badges && (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {feature.badges.map((badge) => (
                                            <span
                                                key={badge}
                                                className="px-3 py-1 bg-[#12121a] border border-white/10 rounded-full text-xs text-gray-400"
                                            >
                                                {badge}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}

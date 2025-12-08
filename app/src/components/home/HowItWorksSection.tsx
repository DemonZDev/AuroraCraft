const steps = [
    {
        number: "01",
        title: "Describe Your Idea",
        description: "Tell the AI what you want to build. Be as detailed or simple as you like.",
        icon: (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
        ),
    },
    {
        number: "02",
        title: "AI Plans",
        description: "The AI analyzes requirements and creates a comprehensive development plan.",
        icon: (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
        ),
    },
    {
        number: "03",
        title: "AI Builds",
        description: "Watch as the AI writes production-quality code and handles dependencies.",
        icon: (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
        ),
    },
    {
        number: "04",
        title: "Test & Download",
        description: "Test in our sandbox, refine with AI, and download production-ready files.",
        icon: (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
        ),
    },
];

export function HowItWorksSection() {
    return (
        <section id="how-it-works" className="py-24 px-4">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-16">
                    <span className="inline-block px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-sm font-medium text-purple-400 mb-4">
                        Simple Process
                    </span>
                    <h2 className="text-3xl md:text-4xl font-bold mb-4">
                        How it{" "}
                        <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            works
                        </span>
                    </h2>
                    <p className="text-gray-400 max-w-2xl mx-auto">
                        From idea to production in four simple steps
                    </p>
                </div>

                {/* Steps */}
                <div className="relative">
                    {/* Connection Line */}
                    <div className="hidden lg:block absolute top-1/2 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-purple-500 to-cyan-500 opacity-30 -translate-y-1/2" />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {steps.map((step, index) => (
                            <div key={step.number} className="relative text-center">
                                {/* Step Number */}
                                <div className="text-6xl font-extrabold bg-gradient-to-b from-purple-500/20 to-transparent bg-clip-text text-transparent mb-4">
                                    {step.number}
                                </div>

                                {/* Icon */}
                                <div className="relative z-10 w-20 h-20 mx-auto mb-6 bg-[#16161f] border-2 border-white/10 rounded-full flex items-center justify-center text-purple-400 transition-all hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/20">
                                    {step.icon}
                                </div>

                                {/* Content */}
                                <h3 className="text-lg font-semibold text-white mb-2">
                                    {step.title}
                                </h3>
                                <p className="text-gray-400 text-sm max-w-[200px] mx-auto">
                                    {step.description}
                                </p>

                                {/* Arrow (mobile) */}
                                {index < steps.length - 1 && (
                                    <div className="lg:hidden flex justify-center my-6">
                                        <svg
                                            className="w-6 h-6 text-purple-500/50"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 14l-7 7m0 0l-7-7m7 7V3"
                                            />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

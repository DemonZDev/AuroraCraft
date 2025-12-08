export function Logo({ className = "" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient
                    id="logo-gradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                >
                    <stop offset="0%" stopColor="#9333ea" />
                    <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
            </defs>
            <path
                d="M20 4L36 12V28L20 36L4 28V12L20 4Z"
                stroke="url(#logo-gradient)"
                strokeWidth="2"
                fill="none"
            />
            <path
                d="M20 8L30 14V26L20 32L10 26V14L20 8Z"
                fill="url(#logo-gradient)"
                opacity="0.3"
            />
            <circle cx="20" cy="20" r="4" fill="url(#logo-gradient)" />
        </svg>
    );
}

import Link from "next/link";

interface ButtonProps {
    children: React.ReactNode;
    variant?: "primary" | "secondary" | "ghost" | "outline";
    size?: "sm" | "md" | "lg";
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    className?: string;
    type?: "button" | "submit" | "reset";
}

export function Button({
    children,
    variant = "primary",
    size = "md",
    href,
    onClick,
    disabled = false,
    loading = false,
    className = "",
    type = "button",
}: ButtonProps) {
    const baseStyles =
        "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-[#050508] disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        primary:
            "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:from-purple-500 hover:to-cyan-400 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40",
        secondary:
            "bg-[#16161f] text-white border border-white/10 hover:bg-[#1c1c27] hover:border-white/20",
        ghost: "text-gray-400 hover:text-white hover:bg-white/5",
        outline:
            "border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500",
    };

    const sizes = {
        sm: "px-4 py-2 text-sm",
        md: "px-6 py-3 text-base",
        lg: "px-8 py-4 text-lg",
    };

    const classes = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

    if (href) {
        return (
            <Link href={href} className={classes}>
                {children}
            </Link>
        );
    }

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled || loading}
            className={classes}
        >
            {loading && (
                <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                </svg>
            )}
            {children}
        </button>
    );
}

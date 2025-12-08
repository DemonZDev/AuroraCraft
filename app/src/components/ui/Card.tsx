interface CardProps {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    glow?: boolean;
    onClick?: () => void;
}

export function Card({
    children,
    className = "",
    hover = false,
    glow = false,
    onClick,
}: CardProps) {
    return (
        <div
            onClick={onClick}
            className={`
        bg-[#16161f] border border-white/5 rounded-xl p-6
        ${hover ? "cursor-pointer transition-all duration-300 hover:bg-[#1c1c27] hover:border-white/10 hover:-translate-y-1 hover:shadow-xl" : ""}
        ${glow ? "hover:shadow-purple-500/20" : ""}
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `}
        >
            {children}
        </div>
    );
}

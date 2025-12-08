interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: React.ReactNode;
}

export function Input({
    label,
    error,
    icon,
    className = "",
    ...props
}: InputProps) {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    {label}
                </label>
            )}
            <div className="relative">
                {icon && (
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                        {icon}
                    </div>
                )}
                <input
                    className={`
            w-full px-4 py-3 bg-[#12121a] border border-white/10 rounded-lg
            text-white placeholder-gray-500
            focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500
            transition-all duration-200
            ${icon ? "pl-12" : ""}
            ${error ? "border-red-500" : ""}
            ${className}
          `}
                    {...props}
                />
            </div>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
    );
}

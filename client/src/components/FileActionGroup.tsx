import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileActionGroupProps {
    action: 'created' | 'updated' | 'deleted';
    children: React.ReactNode;
    defaultExpanded?: boolean;
    className?: string;
}

const actionLabels = {
    created: 'Created',
    updated: 'Updated',
    deleted: 'Deleted',
};

const actionColors = {
    created: 'text-emerald-400',
    updated: 'text-amber-400',
    deleted: 'text-red-400',
};

export function FileActionGroup({
    action,
    children,
    defaultExpanded = true,
    className,
}: FileActionGroupProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div
            className={cn(
                'my-3 rounded-lg overflow-hidden',
                'bg-zinc-900/50 border border-zinc-800/50',
                className
            )}
        >
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5',
                    'text-left text-sm font-medium',
                    'hover:bg-zinc-800/30 transition-colors',
                    'border-b border-zinc-800/50'
                )}
            >
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                )}
                <span className={cn('font-medium', actionColors[action])}>
                    {actionLabels[action]}
                </span>
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="px-2 py-2 space-y-0.5">
                    {children}
                </div>
            )}
        </div>
    );
}

export default FileActionGroup;

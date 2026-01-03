import { FileCode, FileJson, FileText, File, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileActionItemProps {
    path: string;
    fileName: string;
    status?: 'pending' | 'complete';
    onClick?: () => void;
    className?: string;
}

function getFileIcon(fileName: string) {
    const ext = fileName.split('.').pop()?.toLowerCase();

    switch (ext) {
        case 'java':
            return <FileCode className="w-4 h-4 text-orange-400" />;
        case 'xml':
        case 'yml':
        case 'yaml':
            return <FileCode className="w-4 h-4 text-yellow-400" />;
        case 'json':
            return <FileJson className="w-4 h-4 text-green-400" />;
        case 'md':
        case 'txt':
            return <FileText className="w-4 h-4 text-blue-400" />;
        case 'properties':
            return <FileText className="w-4 h-4 text-purple-400" />;
        default:
            return <File className="w-4 h-4 text-zinc-400" />;
    }
}

function getPathPrefix(path: string, fileName: string): string {
    // Extract meaningful path prefix for display
    const parts = path.split('/');
    if (parts.length <= 1) return '';

    // Remove filename from path
    parts.pop();

    // Show last 2-3 path segments for context
    const displayParts = parts.slice(-3);
    return displayParts.join('/') + '/';
}

export function FileActionItem({
    path,
    fileName,
    status = 'complete',
    onClick,
    className,
}: FileActionItemProps) {
    const pathPrefix = getPathPrefix(path, fileName);

    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md',
                'text-left text-sm',
                'hover:bg-zinc-800/40 transition-colors',
                'group',
                className
            )}
        >
            {/* File icon */}
            {getFileIcon(fileName)}

            {/* Path prefix (subdued) */}
            {pathPrefix && (
                <span className="text-zinc-500 text-xs font-mono truncate max-w-[120px]">
                    {pathPrefix}
                </span>
            )}

            {/* Filename */}
            <span className={cn(
                'text-zinc-200 font-medium truncate',
                'group-hover:text-white transition-colors'
            )}>
                {fileName}
            </span>

            {/* Status indicator */}
            {status === 'pending' && (
                <span className="ml-auto">
                    <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                </span>
            )}
        </button>
    );
}

export default FileActionItem;

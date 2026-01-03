/**
 * AgentExecutionDisplay
 * Renders agent events as clean UI during agentic execution
 */

import { useMemo } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock, Lock, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentEvent } from '@/lib/agentEvents';
import { FileActionGroup } from './FileActionGroup';
import { FileActionItem } from './FileActionItem';
import { Button } from '@/components/ui/button';

export interface AgentExecutionDisplayProps {
    events: AgentEvent[];
    onFileClick?: (path: string) => void;
    onReAuthenticate?: () => void;
    className?: string;
}

interface FileState {
    path: string;
    fileName: string;
    status: 'pending' | 'complete';
}

export function AgentExecutionDisplay({
    events,
    onFileClick,
    onReAuthenticate,
    className,
}: AgentExecutionDisplayProps) {
    // Aggregate file states from events
    const { createdFiles, updatedFiles, deletedFiles, currentStatus, isComplete, isPaused, isResuming, summary, cooldownRemaining } = useMemo(() => {
        const created: FileState[] = [];
        const updated: FileState[] = [];
        const deleted: FileState[] = [];
        let status = '';
        let complete = false;
        let paused = false;
        let resuming = false;
        let taskSummary = '';
        let cooldown = 0;

        for (const event of events) {
            switch (event.type) {
                case 'thinking':
                case 'planning':
                    status = event.message;
                    break;
                case 'file_creating':
                    created.push({ path: event.path, fileName: event.fileName, status: 'pending' });
                    status = `Creating ${event.fileName}...`;
                    break;
                case 'file_created':
                    // Update status to complete
                    const createdFile = created.find(f => f.path === event.path);
                    if (createdFile) createdFile.status = 'complete';
                    status = `Created ${event.fileName}`;
                    break;
                case 'file_updating':
                    updated.push({ path: event.path, fileName: event.fileName, status: 'pending' });
                    status = `Updating ${event.fileName}...`;
                    break;
                case 'file_updated':
                    const updatedFile = updated.find(f => f.path === event.path);
                    if (updatedFile) updatedFile.status = 'complete';
                    status = `Updated ${event.fileName}`;
                    break;
                case 'file_deleting':
                    deleted.push({ path: event.path, fileName: event.fileName, status: 'pending' });
                    status = `Deleting ${event.fileName}...`;
                    break;
                case 'file_deleted':
                    const deletedFile = deleted.find(f => f.path === event.path);
                    if (deletedFile) deletedFile.status = 'complete';
                    status = `Deleted ${event.fileName}`;
                    break;
                case 'cooldown':
                    cooldown = event.remaining;
                    status = `Preparing next step... (${event.remaining}s)`;
                    break;
                case 'complete':
                    complete = true;
                    taskSummary = event.summary;
                    status = 'Complete';
                    break;
                case 'error':
                    status = `Error: ${event.message}`;
                    break;
                case 'paused':
                    paused = true;
                    status = 'Paused - authentication required';
                    break;
                case 'resuming':
                    resuming = true;
                    paused = false;
                    status = `Resuming from step ${event.stepNumber}...`;
                    break;
                case 'auth_required':
                    status = 'Authentication required';
                    break;
            }
        }

        return {
            createdFiles: created,
            updatedFiles: updated,
            deletedFiles: deleted,
            currentStatus: status,
            isComplete: complete,
            isPaused: paused,
            isResuming: resuming,
            summary: taskSummary,
            cooldownRemaining: cooldown,
        };
    }, [events]);

    const hasFileActions = createdFiles.length > 0 || updatedFiles.length > 0 || deletedFiles.length > 0;

    return (
        <div className={cn('space-y-3', className)}>
            {/* Status indicator */}
            {currentStatus && !isComplete && !isPaused && (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                    {isResuming ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    ) : cooldownRemaining > 0 ? (
                        <Clock className="w-4 h-4 text-zinc-500 animate-pulse" />
                    ) : (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    )}
                    <span>{currentStatus}</span>
                </div>
            )}

            {/* Paused badge with re-authenticate button */}
            {isPaused && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-950/30 border border-amber-800/30">
                    <Lock className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                        <p className="text-sm font-medium text-amber-300">
                            🔒 Response paused — Authenticate to continue
                        </p>
                        <p className="text-xs text-zinc-400">
                            Your Puter account has no remaining AI usage. Authenticate another account to resume.
                        </p>
                        {onReAuthenticate && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={onReAuthenticate}
                                className="mt-2"
                            >
                                <LogIn className="w-4 h-4 mr-2" />
                                Re-authenticate
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* File action groups */}
            {createdFiles.length > 0 && (
                <FileActionGroup action="created">
                    {createdFiles.map((file) => (
                        <FileActionItem
                            key={file.path}
                            path={file.path}
                            fileName={file.fileName}
                            status={file.status}
                            onClick={() => onFileClick?.(file.path)}
                        />
                    ))}
                </FileActionGroup>
            )}

            {updatedFiles.length > 0 && (
                <FileActionGroup action="updated">
                    {updatedFiles.map((file) => (
                        <FileActionItem
                            key={file.path}
                            path={file.path}
                            fileName={file.fileName}
                            status={file.status}
                            onClick={() => onFileClick?.(file.path)}
                        />
                    ))}
                </FileActionGroup>
            )}

            {deletedFiles.length > 0 && (
                <FileActionGroup action="deleted">
                    {deletedFiles.map((file) => (
                        <FileActionItem
                            key={file.path}
                            path={file.path}
                            fileName={file.fileName}
                            status={file.status}
                            onClick={() => onFileClick?.(file.path)}
                        />
                    ))}
                </FileActionGroup>
            )}

            {/* Completion summary */}
            {isComplete && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/30">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-emerald-300">Task Complete</p>
                        {summary && (
                            <p className="text-sm text-zinc-400">{summary}</p>
                        )}
                        {hasFileActions && (
                            <p className="text-xs text-zinc-500">
                                {createdFiles.length > 0 && `${createdFiles.length} created`}
                                {updatedFiles.length > 0 && `, ${updatedFiles.length} updated`}
                                {deletedFiles.length > 0 && `, ${deletedFiles.length} deleted`}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default AgentExecutionDisplay;

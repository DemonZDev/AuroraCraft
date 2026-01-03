/**
 * AuthRequiredModal
 * Custom modal shown when Puter.js AI calls fail due to low balance
 * Replaces Puter's native popup with a controlled AuroraCraft flow
 */

import { useState } from 'react';
import { Lock, LogIn, X, AlertCircle, Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface AuthRequiredModalProps {
    open: boolean;
    onAuthenticate: () => Promise<void>;
    onCancel: () => void;
    isAuthenticating?: boolean;
}

export function AuthRequiredModal({
    open,
    onAuthenticate,
    onCancel,
    isAuthenticating = false,
}: AuthRequiredModalProps) {
    const [error, setError] = useState<string | null>(null);

    const handleAuthenticate = async () => {
        setError(null);
        try {
            await onAuthenticate();
        } catch (err: any) {
            setError(err?.message || 'Authentication failed. Please try again.');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                            <Lock className="w-5 h-5 text-amber-500" />
                        </div>
                        <DialogTitle className="text-lg">
                            Authentication Required to Continue
                        </DialogTitle>
                    </div>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <DialogDescription className="text-sm text-muted-foreground">
                        Your current Puter account has no remaining AI usage.
                    </DialogDescription>

                    <p className="text-sm text-foreground">
                        Please authenticate another Puter account to continue this task.
                    </p>

                    <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/30">
                        <AlertCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-emerald-300">
                            Your progress has been saved and will resume once you authenticate.
                        </p>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/20 border border-red-800/30">
                            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-red-300">{error}</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex gap-2 sm:gap-2">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        disabled={isAuthenticating}
                        className="flex-1 sm:flex-none"
                    >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                    </Button>
                    <Button
                        onClick={handleAuthenticate}
                        disabled={isAuthenticating}
                        className="flex-1 sm:flex-none"
                    >
                        {isAuthenticating ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <LogIn className="w-4 h-4 mr-2" />
                        )}
                        {isAuthenticating ? 'Authenticating...' : 'Authenticate'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default AuthRequiredModal;

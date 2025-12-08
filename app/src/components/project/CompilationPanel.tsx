"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface CompilationPanelProps {
    projectName: string;
    onCompile: () => void;
    onDownload: () => void;
    onFixErrors: () => void;
}

export function CompilationPanel({
    projectName,
    onCompile,
    onDownload,
    onFixErrors,
}: CompilationPanelProps) {
    const [isCompiling, setIsCompiling] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [logs, setLogs] = useState<string[]>([]);

    const simulateCompile = async () => {
        setIsCompiling(true);
        setStatus("idle");
        setLogs([]);

        const mockLogs = [
            "[INFO] Starting build process...",
            "[INFO] Resolving dependencies...",
            "[INFO] Compiling sources...",
            "[INFO] Processing plugin.yml...",
            "[INFO] Packaging JAR file...",
            "[INFO] Running tests...",
            "[SUCCESS] Build completed successfully!",
            `[INFO] Output: ${projectName}-1.0.0.jar`,
        ];

        for (const log of mockLogs) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            setLogs((prev) => [...prev, log]);
        }

        setIsCompiling(false);
        setStatus("success");
        onCompile();
    };

    return (
        <div className="h-full flex flex-col bg-[#0a0a0f]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#12121a] border-b border-white/5">
                <h3 className="text-sm font-medium text-gray-300">Build & Compile</h3>
                <div className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${status === "success"
                        ? "bg-green-500/20 text-green-400"
                        : status === "error"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-gray-500/20 text-gray-400"
                    }`}>
                    <div className={`w-2 h-2 rounded-full ${status === "success" ? "bg-green-400" :
                            status === "error" ? "bg-red-400" :
                                isCompiling ? "bg-yellow-400 animate-pulse" : "bg-gray-400"
                        }`} />
                    {isCompiling ? "Building..." : status === "success" ? "Success" : status === "error" ? "Failed" : "Ready"}
                </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-b border-white/5">
                <div className="flex flex-wrap gap-2">
                    <Button
                        onClick={simulateCompile}
                        disabled={isCompiling}
                        variant="primary"
                        size="sm"
                        loading={isCompiling}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Compile
                    </Button>

                    <Button
                        onClick={onDownload}
                        disabled={status !== "success"}
                        variant="secondary"
                        size="sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                    </Button>

                    {status === "error" && (
                        <Button onClick={onFixErrors} variant="outline" size="sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Fix Errors
                        </Button>
                    )}
                </div>
            </div>

            {/* Logs */}
            <div className="flex-1 overflow-y-auto p-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Build Output</h4>
                <div className="font-mono text-xs space-y-1">
                    {logs.length === 0 ? (
                        <p className="text-gray-500">No build output yet. Click Compile to start.</p>
                    ) : (
                        logs.map((log, index) => (
                            <div
                                key={index}
                                className={`${log.includes("[SUCCESS]")
                                        ? "text-green-400"
                                        : log.includes("[ERROR]")
                                            ? "text-red-400"
                                            : log.includes("[WARN]")
                                                ? "text-yellow-400"
                                                : "text-gray-400"
                                    }`}
                            >
                                {log}
                            </div>
                        ))
                    )}
                    {isCompiling && (
                        <div className="text-gray-400 animate-pulse">█</div>
                    )}
                </div>
            </div>

            {/* AI Status */}
            <div className="p-4 border-t border-white/5 bg-[#12121a]">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-gray-300">
                            {isCompiling ? "AI is monitoring build..." : status === "success" ? "Build successful! Ready to download." : "AI ready to assist with builds"}
                        </p>
                        <p className="text-xs text-gray-500">
                            {isCompiling ? "Checking for optimizations..." : "Click compile to build your project"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

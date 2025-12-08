"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/context/ProjectContext";

interface ChatPanelProps {
    messages: ChatMessage[];
    isGenerating: boolean;
    onSendMessage: (content: string) => void;
    onCancel: () => void;
}

export function ChatPanel({ messages, isGenerating, onSendMessage, onCancel }: ChatPanelProps) {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isGenerating) return;
        onSendMessage(input);
        setInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0f]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.role === "user"
                                    ? "bg-gradient-to-r from-purple-600 to-purple-500 text-white"
                                    : "bg-[#16161f] text-gray-200 border border-white/5"
                                }`}
                        >
                            {message.role === "assistant" && (
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                        </svg>
                                    </div>
                                    <span className="text-xs font-medium text-purple-400">AuroraCraft AI</span>
                                </div>
                            )}
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                            {message.isStreaming && (
                                <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1" />
                            )}
                        </div>
                    </div>
                ))}

                {isGenerating && (
                    <div className="flex justify-start">
                        <div className="bg-[#16161f] border border-white/5 rounded-2xl px-4 py-3">
                            <div className="flex items-center gap-3">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                                <span className="text-sm text-gray-400">AI is thinking...</span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/5">
                <form onSubmit={handleSubmit} className="relative">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isGenerating ? "Wait for AI response..." : "Describe what you want to build..."}
                        disabled={isGenerating}
                        rows={3}
                        className="w-full px-4 py-3 pr-24 bg-[#16161f] border border-white/10 rounded-xl text-white placeholder-gray-500 resize-none focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    />
                    <div className="absolute right-2 bottom-2 flex items-center gap-2">
                        {isGenerating ? (
                            <button
                                type="button"
                                onClick={onCancel}
                                className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
                            >
                                Cancel
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={!input.trim()}
                                className="p-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-500 hover:to-cyan-400 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

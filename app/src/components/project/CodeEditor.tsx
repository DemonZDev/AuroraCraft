"use client";

import { useState, useEffect, useRef } from "react";

interface CodeEditorProps {
    content: string;
    language?: string;
    onChange: (content: string) => void;
    filename?: string;
}

export function CodeEditor({ content, language = "java", onChange, filename }: CodeEditorProps) {
    const [localContent, setLocalContent] = useState(content);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocalContent(content);
    }, [content]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        setLocalContent(newContent);
        onChange(newContent);
    };

    const handleScroll = () => {
        if (textareaRef.current && lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
        }
    };

    const lines = localContent.split("\n");
    const lineCount = lines.length;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const start = e.currentTarget.selectionStart;
            const end = e.currentTarget.selectionEnd;
            const newContent = localContent.slice(0, start) + "    " + localContent.slice(end);
            setLocalContent(newContent);
            onChange(newContent);
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
                }
            }, 0);
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#0a0a0f]">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 bg-[#12121a] border-b border-white/5">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span className="text-sm text-gray-300">{filename || "untitled"}</span>
                <span className="text-xs text-gray-500 ml-auto">{language}</span>
            </div>

            {/* Editor */}
            <div className="flex-1 flex overflow-hidden">
                {/* Line Numbers */}
                <div
                    ref={lineNumbersRef}
                    className="flex-shrink-0 w-12 bg-[#0a0a0f] overflow-hidden select-none border-r border-white/5"
                >
                    <div className="py-4 pr-2 text-right">
                        {Array.from({ length: lineCount }, (_, i) => (
                            <div key={i} className="text-xs text-gray-600 leading-6 h-6">
                                {i + 1}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Code Area */}
                <div className="flex-1 relative overflow-hidden">
                    <textarea
                        ref={textareaRef}
                        value={localContent}
                        onChange={handleChange}
                        onScroll={handleScroll}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        className="absolute inset-0 w-full h-full px-4 py-4 bg-transparent text-gray-200 font-mono text-sm leading-6 resize-none focus:outline-none overflow-auto"
                        style={{
                            tabSize: 4,
                            caretColor: "#9333ea",
                        }}
                    />
                </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center justify-between px-4 py-1 bg-[#12121a] border-t border-white/5 text-xs text-gray-500">
                <span>Lines: {lineCount}</span>
                <span>UTF-8</span>
            </div>
        </div>
    );
}

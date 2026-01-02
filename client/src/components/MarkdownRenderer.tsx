import React, { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { cn } from "@/lib/utils";
import { FileCode, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MarkdownRendererProps {
    content: string;
    className?: string;
    onFileClick?: (filePath: string) => void;
}

// Custom code block with copy button and syntax highlighting
function CodeBlock({
    language,
    value,
    onFileClick,
}: {
    language: string | undefined;
    value: string;
    onFileClick?: (filePath: string) => void;
}) {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Detect if this is a file block (e.g., ```java:src/Main.java)
    const filePathMatch = language?.match(/^(\w+):(.+)$/);
    const actualLanguage = filePathMatch ? filePathMatch[1] : language || "text";
    const filePath = filePathMatch ? filePathMatch[2] : null;

    return (
        <div className="relative group my-4 rounded-lg overflow-hidden border border-border bg-[#282c34]">
            {/* Header bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border text-xs">
                <div className="flex items-center gap-2">
                    <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground font-medium">
                        {filePath || actualLanguage}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {filePath && onFileClick && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => onFileClick(filePath)}
                            title="Open in editor"
                        >
                            <ExternalLink className="w-3 h-3" />
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleCopy}
                        title="Copy code"
                    >
                        {copied ? (
                            <Check className="w-3 h-3 text-green-500" />
                        ) : (
                            <Copy className="w-3 h-3" />
                        )}
                    </Button>
                </div>
            </div>
            {/* Code content */}
            <SyntaxHighlighter
                style={oneDark}
                language={actualLanguage}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    padding: "1rem",
                    background: "transparent",
                    fontSize: "0.8125rem",
                    lineHeight: 1.6,
                }}
                codeTagProps={{
                    style: {
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    },
                }}
            >
                {value}
            </SyntaxHighlighter>
        </div>
    );
}

// Memoized markdown renderer for performance
export const MarkdownRenderer = memo(function MarkdownRenderer({
    content,
    className,
    onFileClick,
}: MarkdownRendererProps) {
    return (
        <div
            className={cn(
                "prose prose-sm prose-invert max-w-none",
                // Headings
                "prose-headings:font-semibold prose-headings:text-foreground prose-headings:mb-2 prose-headings:mt-4",
                "prose-h1:text-xl prose-h2:text-lg prose-h3:text-base",
                // Paragraphs
                "prose-p:text-foreground prose-p:leading-relaxed prose-p:my-2",
                // Links
                "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                // Lists
                "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-foreground",
                // Strong/emphasis
                "prose-strong:text-foreground prose-strong:font-semibold",
                "prose-em:text-foreground",
                // Inline code
                "prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono",
                "prose-code:before:content-none prose-code:after:content-none",
                // Blockquotes
                "prose-blockquote:border-l-primary prose-blockquote:border-l-2 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground",
                // Tables
                "prose-table:border-collapse prose-table:w-full prose-table:my-4",
                "prose-th:border prose-th:border-border prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-sm prose-th:font-medium",
                "prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-sm",
                // Horizontal rule
                "prose-hr:border-border prose-hr:my-6",
                className
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Custom code block rendering
                    code({ node, className, children, ...props }) {
                        const match = /language-(\S+)/.exec(className || "");
                        const isInline = !match && !className;
                        const value = String(children).replace(/\n$/, "");

                        if (isInline) {
                            // Inline code
                            return (
                                <code className={className} {...props}>
                                    {children}
                                </code>
                            );
                        }

                        // Block code with syntax highlighting
                        return (
                            <CodeBlock
                                language={match ? match[1] : undefined}
                                value={value}
                                onFileClick={onFileClick}
                            />
                        );
                    },
                    // Make pre tag transparent so CodeBlock handles styling
                    pre({ children }) {
                        return <>{children}</>;
                    },
                    // Custom link handling
                    a({ href, children, ...props }) {
                        // Check if it's a file link (internal path)
                        if (href?.startsWith("file://") && onFileClick) {
                            const filePath = href.replace("file://", "");
                            return (
                                <button
                                    className="text-primary hover:underline inline-flex items-center gap-1"
                                    onClick={() => onFileClick(filePath)}
                                >
                                    <FileCode className="w-3 h-3" />
                                    {children}
                                </button>
                            );
                        }
                        return (
                            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                                {children}
                            </a>
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});

export default MarkdownRenderer;

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { ChatPanel } from "@/components/project/ChatPanel";
import { FileExplorer } from "@/components/project/FileExplorer";
import { CodeEditor } from "@/components/project/CodeEditor";
import { CompilationPanel } from "@/components/project/CompilationPanel";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProjectProvider, useProject, FileNode, ChatMessage } from "@/context/ProjectContext";

function findFileById(files: FileNode[], id: string): FileNode | null {
    for (const file of files) {
        if (file.id === id) return file;
        if (file.children) {
            const found = findFileById(file.children, id);
            if (found) return found;
        }
    }
    return null;
}

function ProjectPageContent() {
    const { user, isLoading: authLoading } = useAuth();
    const {
        currentProject,
        createProject,
        renameProject,
        addMessage,
        updateFile,
        createFile,
        deleteFile,
    } = useProject();
    const router = useRouter();

    const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [activePanel, setActivePanel] = useState<"files" | "compile">("files");
    const [isEditingName, setIsEditingName] = useState(false);
    const [projectName, setProjectName] = useState("");
    const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/login");
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (!currentProject) {
            createProject("New Project");
        } else {
            setProjectName(currentProject.name);
        }
    }, [currentProject, createProject]);

    const selectedFile = currentProject && selectedFileId
        ? findFileById(currentProject.files, selectedFileId)
        : null;

    const handleSendMessage = useCallback(async (content: string) => {
        addMessage({ role: "user", content });
        setIsGenerating(true);

        // Simulate AI response with streaming
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const responses = [
            "I understand you want to build something amazing! Let me analyze your requirements...\n\nBased on your description, I'll create a structured plan for this project.",
            "I'm now working on the implementation. I'll create the necessary files and code for you.\n\nHere's what I'm building:\n- Main class structure\n- Event handlers\n- Configuration files",
            "I've analyzed your request and I'm generating the code now.\n\nThis will include:\n- Core functionality\n- Error handling\n- Documentation comments",
        ];

        const response = responses[Math.floor(Math.random() * responses.length)];
        addMessage({ role: "assistant", content: response });
        setIsGenerating(false);
    }, [addMessage]);

    const handleCancelGeneration = () => {
        setIsGenerating(false);
    };

    const handleFileContentChange = (content: string) => {
        if (selectedFileId) {
            updateFile(selectedFileId, content);
        }
    };

    const handleSaveName = () => {
        if (currentProject && projectName.trim()) {
            renameProject(currentProject.id, projectName.trim());
        }
        setIsEditingName(false);
    };

    if (authLoading || !currentProject) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#050508]">
                <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-[#050508]">
            {/* Top Bar */}
            <header className="flex-shrink-0 flex items-center justify-between px-4 h-14 bg-[#0a0a0f] border-b border-white/5">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard" className="flex items-center gap-2">
                        <Logo className="w-6 h-6" />
                        <span className="hidden sm:inline text-sm font-semibold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            AuroraCraft
                        </span>
                    </Link>

                    <div className="w-px h-6 bg-white/10" />

                    {/* Project Name */}
                    {isEditingName ? (
                        <input
                            type="text"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            onBlur={handleSaveName}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                            className="px-2 py-1 bg-[#16161f] border border-purple-500 rounded text-sm text-white focus:outline-none"
                            autoFocus
                        />
                    ) : (
                        <button
                            onClick={() => setIsEditingName(true)}
                            className="text-sm text-gray-300 hover:text-white flex items-center gap-2"
                        >
                            {currentProject.name}
                            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Status */}
                    <div className={`hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs ${currentProject.status === "complete"
                            ? "bg-green-500/20 text-green-400"
                            : currentProject.status === "building"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-purple-500/20 text-purple-400"
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${currentProject.status === "complete" ? "bg-green-400" :
                                currentProject.status === "building" ? "bg-yellow-400 animate-pulse" : "bg-purple-400"
                            }`} />
                        {currentProject.status === "planning" ? "AI Planning" :
                            currentProject.status === "building" ? "AI Building" :
                                currentProject.status === "testing" ? "Testing" : "Complete"}
                    </div>

                    <Button
                        onClick={() => setActivePanel("compile")}
                        variant="primary"
                        size="sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        </svg>
                        <span className="hidden sm:inline">Compile</span>
                    </Button>

                    {/* Mobile Chat Toggle */}
                    <button
                        onClick={() => setIsMobileChatOpen(!isMobileChatOpen)}
                        className="lg:hidden p-2 hover:bg-white/5 rounded"
                    >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Chat Panel */}
                <div className={`${isMobileChatOpen ? "fixed inset-0 z-50 bg-[#0a0a0f]" : "hidden"} lg:block lg:relative lg:w-96 flex-shrink-0 border-r border-white/5`}>
                    {isMobileChatOpen && (
                        <div className="flex items-center justify-between p-3 border-b border-white/5 lg:hidden">
                            <span className="text-sm font-medium text-gray-300">AI Chat</span>
                            <button onClick={() => setIsMobileChatOpen(false)} className="p-1">
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}
                    <ChatPanel
                        messages={currentProject.messages}
                        isGenerating={isGenerating}
                        onSendMessage={handleSendMessage}
                        onCancel={handleCancelGeneration}
                    />
                </div>

                {/* Center: Code Editor */}
                <div className="flex-1 flex flex-col min-w-0">
                    {selectedFile && selectedFile.type === "file" ? (
                        <CodeEditor
                            content={selectedFile.content || ""}
                            language={selectedFile.language}
                            filename={selectedFile.name}
                            onChange={handleFileContentChange}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center bg-[#0a0a0f]">
                            <div className="text-center">
                                <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-gray-500">Select a file to edit</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Panel: Files or Compile */}
                <div className="hidden md:block w-72 flex-shrink-0">
                    {/* Panel Tabs */}
                    <div className="flex border-b border-white/5">
                        <button
                            onClick={() => setActivePanel("files")}
                            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activePanel === "files"
                                    ? "text-purple-400 border-b-2 border-purple-400"
                                    : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            Files
                        </button>
                        <button
                            onClick={() => setActivePanel("compile")}
                            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activePanel === "compile"
                                    ? "text-purple-400 border-b-2 border-purple-400"
                                    : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            Build
                        </button>
                    </div>

                    {activePanel === "files" ? (
                        <FileExplorer
                            files={currentProject.files}
                            selectedFileId={selectedFileId}
                            onSelectFile={setSelectedFileId}
                            onCreateFile={createFile}
                            onDeleteFile={deleteFile}
                        />
                    ) : (
                        <CompilationPanel
                            projectName={currentProject.name}
                            onCompile={() => { }}
                            onDownload={() => alert("Download started! (mock)")}
                            onFixErrors={() => handleSendMessage("Please fix the compilation errors in my code")}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default function ProjectPage() {
    return (
        <AuthProvider>
            <ProjectProvider>
                <ProjectPageContent />
            </ProjectProvider>
        </AuthProvider>
    );
}

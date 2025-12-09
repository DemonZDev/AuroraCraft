'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';
import {
    Sparkles,
    Send,
    Square,
    Wand2,
    ChevronDown,
    Play,
    Download,
    FolderTree,
    MessageSquare,
    Settings2,
    ArrowLeft,
    File,
    Folder,
    ChevronRight,
    Plus,
    Trash2,
    Edit2,
    X,
    Check,
    AlertCircle,
    CheckCircle,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { useAuthStore, useSessionStore, useChatStore, useFileStore } from '@/lib/store';
import api from '@/lib/api';
import toast from 'react-hot-toast';

type PanelView = 'chat' | 'files';

export default function SessionPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.id as string;

    const { user, checkAuth } = useAuthStore();
    const { currentSession, fetchSession } = useSessionStore();
    const {
        messages,
        isStreaming,
        currentModel,
        mode,
        models,
        fetchMessages,
        fetchModels,
        addMessage,
        updateLastMessage,
        setStreaming,
        setModel,
        setMode,
    } = useChatStore();
    const {
        files,
        currentFile,
        hasUnsavedChanges,
        fetchFiles,
        openFile,
        createFile,
        updateFile,
        deleteFile,
        setCurrentFile,
        updateLocalContent,
    } = useFileStore();

    const [prompt, setPrompt] = useState('');
    const [activePanel, setActivePanel] = useState<PanelView>('chat');
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [showModeDropdown, setShowModeDropdown] = useState(false);
    const [compilationJobs, setCompilationJobs] = useState<any[]>([]);
    const [currentCompilation, setCurrentCompilation] = useState<any>(null);
    const [isCompiling, setIsCompiling] = useState(false);
    const [showNewFileModal, setShowNewFileModal] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFileIsFolder, setNewFileIsFolder] = useState(false);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [editorContent, setEditorContent] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Load initial data
    useEffect(() => {
        checkAuth();
        fetchModels();

        if (sessionId) {
            fetchSession(sessionId).catch(() => router.push('/dashboard'));
            fetchMessages(sessionId);
            fetchFiles(sessionId);
            loadCompilationHistory();
        }
    }, [sessionId]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Update editor content when file changes
    useEffect(() => {
        if (currentFile) {
            setEditorContent(currentFile.content || '');
        }
    }, [currentFile]);

    const loadCompilationHistory = async () => {
        try {
            const { jobs } = await api.getCompilationHistory(sessionId);
            setCompilationJobs(jobs);
            const running = jobs.find((j: any) => j.status === 'RUNNING' || j.status === 'PENDING');
            if (running) {
                setCurrentCompilation(running);
                setIsCompiling(true);
            }
        } catch (error) {
            console.error('Failed to load compilation history:', error);
        }
    };

    const handleSendMessage = async () => {
        if (!prompt.trim() || isStreaming || !currentModel) return;

        const userMessage = {
            id: Date.now().toString(),
            role: 'USER' as const,
            content: prompt,
            createdAt: new Date().toISOString(),
        };

        addMessage(userMessage);
        setPrompt('');
        setStreaming(true);

        // Add placeholder for assistant response
        const assistantMessage = {
            id: (Date.now() + 1).toString(),
            role: 'ASSISTANT' as const,
            content: '',
            createdAt: new Date().toISOString(),
        };
        addMessage(assistantMessage);

        abortControllerRef.current = new AbortController();

        try {
            const response = await api.streamMessage(sessionId, {
                content: prompt,
                modelId: currentModel,
                mode,
            });

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.content) {
                                updateLastMessage(parsed.content);
                            }
                            if (parsed.error) {
                                toast.error(parsed.error);
                            }
                        } catch {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                toast.error(error.message || 'Failed to send message');
            }
        } finally {
            setStreaming(false);
            abortControllerRef.current = null;
            fetchFiles(sessionId); // Refresh files in case AI created any
        }
    };

    const handleStopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setStreaming(false);
        }
    };

    const handleEnhancePrompt = async () => {
        if (!prompt.trim() || !currentModel) return;

        try {
            toast.loading('Enhancing prompt...', { id: 'enhance' });
            const { enhanced } = await api.enhancePrompt({
                prompt,
                modelId: currentModel,
            });
            setPrompt(enhanced);
            toast.success('Prompt enhanced!', { id: 'enhance' });
        } catch (error: any) {
            toast.error(error.message || 'Failed to enhance prompt', { id: 'enhance' });
        }
    };

    const handleCompile = async () => {
        if (isCompiling) return;

        setIsCompiling(true);
        try {
            const { jobId } = await api.startCompilation(sessionId);
            toast.success('Compilation started');

            // Poll for status
            const pollStatus = async () => {
                try {
                    const { job } = await api.getCompilationStatus(sessionId, jobId);
                    setCurrentCompilation(job);

                    if (job.status === 'RUNNING' || job.status === 'PENDING') {
                        setTimeout(pollStatus, 1000);
                    } else {
                        setIsCompiling(false);
                        loadCompilationHistory();

                        if (job.status === 'SUCCESS') {
                            toast.success('Compilation successful!');
                        } else if (job.status === 'FAILED') {
                            toast.error('Compilation failed');
                        }
                    }
                } catch {
                    setIsCompiling(false);
                }
            };

            pollStatus();
        } catch (error: any) {
            toast.error(error.message || 'Failed to start compilation');
            setIsCompiling(false);
        }
    };

    const handleFixCompilation = () => {
        if (!currentCompilation?.errorLogs) return;

        const fixPrompt = `The compilation failed with the following errors:\n\n\`\`\`\n${currentCompilation.errorLogs}\n\`\`\`\n\nPlease fix these errors.`;
        setPrompt(fixPrompt);
        setActivePanel('chat');
    };

    const handleSaveFile = async () => {
        if (!currentFile || !hasUnsavedChanges) return;

        try {
            await updateFile(sessionId, currentFile.path, editorContent);
            toast.success('File saved');
        } catch (error: any) {
            toast.error(error.message || 'Failed to save file');
        }
    };

    const handleCreateFile = async () => {
        if (!newFileName.trim()) return;

        try {
            await createFile(sessionId, newFileName, '', newFileIsFolder);
            setShowNewFileModal(false);
            setNewFileName('');
            setNewFileIsFolder(false);
            toast.success(newFileIsFolder ? 'Folder created' : 'File created');
        } catch (error: any) {
            toast.error(error.message || 'Failed to create file');
        }
    };

    const handleDeleteFile = async (path: string) => {
        try {
            await deleteFile(sessionId, path);
            toast.success('Deleted');
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete');
        }
    };

    const toggleFolder = (path: string) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
        }
        setExpandedFolders(newExpanded);
    };

    // Build file tree structure
    const buildFileTree = useCallback(() => {
        const tree: any = { children: {} };

        files.forEach((file) => {
            const parts = file.path.split('/');
            let current = tree;

            parts.forEach((part, index) => {
                if (!current.children[part]) {
                    current.children[part] = {
                        ...file,
                        name: part,
                        fullPath: parts.slice(0, index + 1).join('/'),
                        children: {},
                        isFolder: index < parts.length - 1 || file.isFolder,
                    };
                }
                current = current.children[part];
            });
        });

        return tree.children;
    }, [files]);

    const renderFileTree = (node: any, depth = 0) => {
        const entries = Object.entries(node).sort((a: any, b: any) => {
            if (a[1].isFolder === b[1].isFolder) return a[0].localeCompare(b[0]);
            return a[1].isFolder ? -1 : 1;
        });

        return entries.map(([name, item]: any) => {
            const isExpanded = expandedFolders.has(item.fullPath);
            const hasChildren = Object.keys(item.children).length > 0;
            const isActive = currentFile?.path === item.path;

            return (
                <div key={item.fullPath}>
                    <div
                        className={`file-tree-item ${isActive ? 'active' : ''}`}
                        style={{ paddingLeft: `${depth * 16 + 8}px` }}
                        onClick={() => {
                            if (item.isFolder) {
                                toggleFolder(item.fullPath);
                            } else {
                                openFile(sessionId, item.path);
                            }
                        }}
                    >
                        {item.isFolder ? (
                            <>
                                <ChevronRight
                                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                />
                                <Folder className="w-4 h-4 text-aurora-400" />
                            </>
                        ) : (
                            <>
                                <span className="w-4" />
                                <File className="w-4 h-4 text-dark-400" />
                            </>
                        )}
                        <span className="truncate flex-1">{name}</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFile(item.path);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded"
                        >
                            <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                    </div>
                    {item.isFolder && isExpanded && hasChildren && (
                        <div>{renderFileTree(item.children, depth + 1)}</div>
                    )}
                </div>
            );
        });
    };

    const getFileLanguage = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            java: 'java',
            kt: 'kotlin',
            xml: 'xml',
            yml: 'yaml',
            yaml: 'yaml',
            json: 'json',
            properties: 'ini',
            md: 'markdown',
            txt: 'plaintext',
        };
        return langMap[ext || ''] || 'plaintext';
    };

    return (
        <div className="h-screen bg-dark-950 flex flex-col">
            {/* Header */}
            <header className="h-14 border-b border-dark-800/50 bg-dark-900/50 backdrop-blur-sm flex items-center px-4 gap-4 flex-shrink-0">
                <Link href="/dashboard" className="btn-ghost p-2">
                    <ArrowLeft className="w-5 h-5" />
                </Link>

                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-aurora-500" />
                    <span className="font-semibold text-dark-100">
                        {currentSession?.name || 'Loading...'}
                    </span>
                </div>

                <div className="flex-1" />

                {/* Compile Button */}
                <button
                    onClick={handleCompile}
                    disabled={isCompiling}
                    className={`btn ${isCompiling ? 'bg-amber-600 hover:bg-amber-500' : 'btn-success'}`}
                >
                    {isCompiling ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Compiling...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4" />
                            Compile
                        </>
                    )}
                </button>

                {/* Download Source */}
                <a
                    href={api.getDownloadUrl(sessionId)}
                    className="btn-secondary"
                    target="_blank"
                >
                    <Download className="w-4 h-4" />
                    Download ZIP
                </a>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Chat/Files */}
                <div className="w-[400px] border-r border-dark-800/50 flex flex-col bg-dark-900/30">
                    {/* Panel Tabs */}
                    <div className="flex border-b border-dark-800/50">
                        <button
                            onClick={() => setActivePanel('chat')}
                            className={`tab flex-1 ${activePanel === 'chat' ? 'active' : ''}`}
                        >
                            <MessageSquare className="w-4 h-4" />
                            Chat
                        </button>
                        <button
                            onClick={() => setActivePanel('files')}
                            className={`tab flex-1 ${activePanel === 'files' ? 'active' : ''}`}
                        >
                            <FolderTree className="w-4 h-4" />
                            Files
                        </button>
                    </div>

                    {activePanel === 'chat' ? (
                        <>
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.length === 0 ? (
                                    <div className="text-center py-10">
                                        <MessageSquare className="w-12 h-12 text-dark-600 mx-auto mb-3" />
                                        <p className="text-dark-500">Start a conversation with AI</p>
                                    </div>
                                ) : (
                                    messages.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={`${msg.role === 'USER' ? 'message-user ml-8' : 'message-assistant mr-8'
                                                } p-4`}
                                        >
                                            <div className="text-xs text-dark-500 mb-1">
                                                {msg.role === 'USER' ? 'You' : 'AuroraCraft'}
                                            </div>
                                            <div className="text-dark-200 whitespace-pre-wrap text-sm">
                                                {msg.content || (isStreaming && msg.role === 'ASSISTANT' ? (
                                                    <span className="typing-cursor text-dark-400">Thinking</span>
                                                ) : '')}
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Chat Input */}
                            <div className="p-4 border-t border-dark-800/50">
                                {/* Mode & Model Selectors */}
                                <div className="flex gap-2 mb-3">
                                    {/* Mode Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowModeDropdown(!showModeDropdown)}
                                            className="btn-secondary text-sm py-1.5"
                                        >
                                            <Settings2 className="w-4 h-4" />
                                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                        {showModeDropdown && (
                                            <div className="absolute bottom-full left-0 mb-1 w-40 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-10">
                                                {(['agent', 'plan', 'question'] as const).map((m) => (
                                                    <button
                                                        key={m}
                                                        onClick={() => {
                                                            setMode(m);
                                                            setShowModeDropdown(false);
                                                        }}
                                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-dark-700 ${mode === m ? 'text-aurora-400' : 'text-dark-300'
                                                            }`}
                                                    >
                                                        {m.charAt(0).toUpperCase() + m.slice(1)} Mode
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Model Dropdown */}
                                    <div className="relative flex-1">
                                        <button
                                            onClick={() => setShowModelDropdown(!showModelDropdown)}
                                            className="btn-secondary text-sm py-1.5 w-full justify-between"
                                        >
                                            <span className="truncate">
                                                {models.find((m) => m.id === currentModel)?.name || 'Select Model'}
                                            </span>
                                            <ChevronDown className="w-4 h-4 flex-shrink-0" />
                                        </button>
                                        {showModelDropdown && (
                                            <div className="absolute bottom-full left-0 right-0 mb-1 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                                                {models.map((model) => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => {
                                                            setModel(model.id);
                                                            setShowModelDropdown(false);
                                                        }}
                                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-dark-700 ${currentModel === model.id ? 'text-aurora-400' : 'text-dark-300'
                                                            }`}
                                                    >
                                                        <div>{model.name}</div>
                                                        <div className="text-xs text-dark-500">{model.provider.name}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Input */}
                                <div className="relative">
                                    <textarea
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                        placeholder="Describe what you want to build..."
                                        className="input min-h-[80px] resize-none pr-24"
                                        disabled={isStreaming}
                                    />
                                    <div className="absolute right-2 bottom-2 flex gap-1">
                                        <button
                                            onClick={handleEnhancePrompt}
                                            disabled={!prompt.trim() || isStreaming}
                                            className="btn-ghost p-2 text-purple-400 hover:text-purple-300"
                                            title="Enhance prompt"
                                        >
                                            <Wand2 className="w-4 h-4" />
                                        </button>
                                        {isStreaming ? (
                                            <button
                                                onClick={handleStopGeneration}
                                                className="btn-danger p-2"
                                                title="Stop generation"
                                            >
                                                <Square className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleSendMessage}
                                                disabled={!prompt.trim() || !currentModel}
                                                className="btn-primary p-2"
                                                title="Send message"
                                            >
                                                <Send className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* File Tree */}
                            <div className="flex-1 overflow-y-auto">
                                <div className="p-2">
                                    <button
                                        onClick={() => setShowNewFileModal(true)}
                                        className="w-full btn-ghost text-sm justify-start"
                                    >
                                        <Plus className="w-4 h-4" />
                                        New File/Folder
                                    </button>
                                </div>
                                <div className="pb-4">
                                    {files.length === 0 ? (
                                        <div className="text-center py-10">
                                            <FolderTree className="w-12 h-12 text-dark-600 mx-auto mb-3" />
                                            <p className="text-dark-500">No files yet</p>
                                        </div>
                                    ) : (
                                        renderFileTree(buildFileTree())
                                    )}
                                </div>
                            </div>

                            {/* Compilation History */}
                            <div className="border-t border-dark-800/50 p-3 max-h-48 overflow-y-auto">
                                <h3 className="text-xs font-medium text-dark-400 mb-2">Compilation History</h3>
                                {compilationJobs.slice(0, 5).map((job) => (
                                    <div
                                        key={job.id}
                                        className="flex items-center justify-between p-2 rounded hover:bg-dark-800/50 group"
                                    >
                                        <div className="flex items-center gap-2">
                                            {job.status === 'SUCCESS' ? (
                                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                            ) : job.status === 'FAILED' ? (
                                                <AlertCircle className="w-4 h-4 text-red-400" />
                                            ) : job.status === 'RUNNING' || job.status === 'PENDING' ? (
                                                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                                            ) : (
                                                <X className="w-4 h-4 text-dark-500" />
                                            )}
                                            <span className={`badge-${job.status.toLowerCase()}`}>
                                                {job.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {job.status === 'FAILED' && (
                                                <button
                                                    onClick={handleFixCompilation}
                                                    className="text-xs text-aurora-400 hover:text-aurora-300"
                                                >
                                                    Fix
                                                </button>
                                            )}
                                            {job.status === 'SUCCESS' && job.artifactPath && (
                                                <a
                                                    href={api.getArtifactDownloadUrl(sessionId, job.id)}
                                                    className="text-xs text-emerald-400 hover:text-emerald-300"
                                                >
                                                    Download JAR
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Right Panel - Code Editor */}
                <div className="flex-1 flex flex-col">
                    {currentFile ? (
                        <>
                            {/* Editor Header */}
                            <div className="h-10 border-b border-dark-800/50 flex items-center px-4 justify-between bg-dark-900/30">
                                <div className="flex items-center gap-2 text-sm">
                                    <File className="w-4 h-4 text-dark-400" />
                                    <span className="text-dark-200">{currentFile.path}</span>
                                    {hasUnsavedChanges && (
                                        <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
                                    )}
                                </div>
                                <button
                                    onClick={handleSaveFile}
                                    disabled={!hasUnsavedChanges}
                                    className="btn-ghost text-sm py-1"
                                >
                                    <Check className="w-4 h-4" />
                                    Save
                                </button>
                            </div>

                            {/* Monaco Editor */}
                            <div className="flex-1">
                                <Editor
                                    height="100%"
                                    language={getFileLanguage(currentFile.name)}
                                    value={editorContent}
                                    onChange={(value) => {
                                        setEditorContent(value || '');
                                        updateLocalContent(value || '');
                                    }}
                                    theme="vs-dark"
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        fontFamily: 'JetBrains Mono, Fira Code, monospace',
                                        lineNumbers: 'on',
                                        scrollBeyondLastLine: false,
                                        wordWrap: 'on',
                                        tabSize: 4,
                                        padding: { top: 16 },
                                    }}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-dark-500">
                            <div className="text-center">
                                <File className="w-16 h-16 text-dark-600 mx-auto mb-4" />
                                <p>Select a file to edit</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* New File Modal */}
            <AnimatePresence>
                {showNewFileModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                        onClick={() => setShowNewFileModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="card w-full max-w-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-4">New File/Folder</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-dark-300 mb-2">
                                        Path
                                    </label>
                                    <input
                                        type="text"
                                        value={newFileName}
                                        onChange={(e) => setNewFileName(e.target.value)}
                                        className="input"
                                        placeholder="src/main/java/Plugin.java"
                                        autoFocus
                                    />
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={newFileIsFolder}
                                        onChange={(e) => setNewFileIsFolder(e.target.checked)}
                                        className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-aurora-500 focus:ring-aurora-500"
                                    />
                                    <span className="text-sm text-dark-300">Create as folder</span>
                                </label>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowNewFileModal(false)}
                                    className="btn-secondary flex-1"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateFile}
                                    disabled={!newFileName.trim()}
                                    className="btn-primary flex-1"
                                >
                                    Create
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

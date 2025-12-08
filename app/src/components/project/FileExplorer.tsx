"use client";

import { useState } from "react";
import { FileNode } from "@/context/ProjectContext";

interface FileExplorerProps {
    files: FileNode[];
    selectedFileId: string | null;
    onSelectFile: (fileId: string) => void;
    onCreateFile: (parentId: string | null, name: string, type: "file" | "folder") => void;
    onDeleteFile: (fileId: string) => void;
}

function FileTreeItem({
    node,
    level,
    selectedFileId,
    onSelect,
    onDelete,
}: {
    node: FileNode;
    level: number;
    selectedFileId: string | null;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(true);
    const [showMenu, setShowMenu] = useState(false);

    const isSelected = selectedFileId === node.id;
    const isFolder = node.type === "folder";

    const getFileIcon = (name: string) => {
        const ext = name.split(".").pop()?.toLowerCase();
        switch (ext) {
            case "java":
                return <span className="text-orange-400">☕</span>;
            case "kt":
                return <span className="text-purple-400">K</span>;
            case "yml":
            case "yaml":
                return <span className="text-green-400">📄</span>;
            case "json":
                return <span className="text-yellow-400">{`{}`}</span>;
            case "xml":
                return <span className="text-orange-300">&lt;/&gt;</span>;
            case "md":
                return <span className="text-blue-400">M↓</span>;
            case "js":
                return <span className="text-yellow-300">JS</span>;
            case "ts":
            case "tsx":
                return <span className="text-blue-400">TS</span>;
            case "css":
                return <span className="text-blue-300">#</span>;
            case "html":
                return <span className="text-orange-400">&lt;&gt;</span>;
            default:
                return <span className="text-gray-400">📄</span>;
        }
    };

    return (
        <div>
            <div
                className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded transition-colors ${isSelected ? "bg-purple-500/20 text-white" : "hover:bg-white/5 text-gray-300"
                    }`}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={() => {
                    if (isFolder) {
                        setIsOpen(!isOpen);
                    } else {
                        onSelect(node.id);
                    }
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setShowMenu(!showMenu);
                }}
            >
                {isFolder ? (
                    <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                ) : (
                    <span className="w-4 h-4 flex items-center justify-center text-xs">
                        {getFileIcon(node.name)}
                    </span>
                )}

                {isFolder ? (
                    <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                    </svg>
                ) : null}

                <span className="flex-1 text-sm truncate">{node.name}</span>

                <button
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(node.id);
                    }}
                >
                    <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {isFolder && isOpen && node.children && (
                <div>
                    {node.children.map((child) => (
                        <FileTreeItem
                            key={child.id}
                            node={child}
                            level={level + 1}
                            selectedFileId={selectedFileId}
                            onSelect={onSelect}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function FileExplorer({
    files,
    selectedFileId,
    onSelectFile,
    onCreateFile,
    onDeleteFile,
}: FileExplorerProps) {
    const [isCreating, setIsCreating] = useState<"file" | "folder" | null>(null);
    const [newName, setNewName] = useState("");

    const handleCreate = () => {
        if (newName.trim() && isCreating) {
            onCreateFile(null, newName.trim(), isCreating);
            setNewName("");
            setIsCreating(null);
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#0a0a0f] border-r border-white/5">
            {/* Header */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300">Files</h3>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsCreating("file")}
                        className="p-1.5 hover:bg-white/5 rounded transition-colors"
                        title="New file"
                    >
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setIsCreating("folder")}
                        className="p-1.5 hover:bg-white/5 rounded transition-colors"
                        title="New folder"
                    >
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Create Input */}
            {isCreating && (
                <div className="p-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                            placeholder={`New ${isCreating}...`}
                            className="flex-1 px-2 py-1 bg-[#16161f] border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                            autoFocus
                        />
                        <button
                            onClick={handleCreate}
                            className="p-1 bg-purple-500 rounded text-white"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </button>
                        <button
                            onClick={() => {
                                setIsCreating(null);
                                setNewName("");
                            }}
                            className="p-1 bg-gray-600 rounded text-white"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto py-2">
                {files.map((node) => (
                    <FileTreeItem
                        key={node.id}
                        node={node}
                        level={0}
                        selectedFileId={selectedFileId}
                        onSelect={onSelectFile}
                        onDelete={onDeleteFile}
                    />
                ))}
            </div>
        </div>
    );
}

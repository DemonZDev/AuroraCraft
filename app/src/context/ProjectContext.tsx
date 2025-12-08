"use client";

import { createContext, useContext, useState, ReactNode } from "react";

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
}

export interface FileNode {
    id: string;
    name: string;
    type: "file" | "folder";
    content?: string;
    children?: FileNode[];
    language?: string;
}

export interface Project {
    id: string;
    name: string;
    createdAt: Date;
    lastEdited: Date;
    messages: ChatMessage[];
    files: FileNode[];
    status: "planning" | "building" | "testing" | "complete";
}

interface ProjectContextType {
    projects: Project[];
    currentProject: Project | null;
    createProject: (name: string) => Project;
    openProject: (id: string) => void;
    deleteProject: (id: string) => void;
    renameProject: (id: string, name: string) => void;
    addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
    updateFile: (fileId: string, content: string) => void;
    createFile: (parentId: string | null, name: string, type: "file" | "folder") => void;
    deleteFile: (fileId: string) => void;
    setProjectStatus: (status: Project["status"]) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const defaultFiles: FileNode[] = [
    {
        id: "src",
        name: "src",
        type: "folder",
        children: [
            {
                id: "main",
                name: "main",
                type: "folder",
                children: [
                    {
                        id: "java",
                        name: "java",
                        type: "folder",
                        children: [
                            {
                                id: "mainclass",
                                name: "Main.java",
                                type: "file",
                                language: "java",
                                content: `package com.example.plugin;

import org.bukkit.plugin.java.JavaPlugin;

public class Main extends JavaPlugin {
    @Override
    public void onEnable() {
        getLogger().info("Plugin enabled!");
    }

    @Override
    public void onDisable() {
        getLogger().info("Plugin disabled!");
    }
}`,
                            },
                        ],
                    },
                    {
                        id: "resources",
                        name: "resources",
                        type: "folder",
                        children: [
                            {
                                id: "plugin-yml",
                                name: "plugin.yml",
                                type: "file",
                                language: "yaml",
                                content: `name: MyPlugin
version: 1.0.0
main: com.example.plugin.Main
api-version: 1.20
description: A custom Minecraft plugin`,
                            },
                        ],
                    },
                ],
            },
        ],
    },
];

export function ProjectProvider({ children }: { children: ReactNode }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [currentProject, setCurrentProject] = useState<Project | null>(null);

    const createProject = (name: string): Project => {
        const newProject: Project = {
            id: "proj_" + Math.random().toString(36).substr(2, 9),
            name,
            createdAt: new Date(),
            lastEdited: new Date(),
            messages: [
                {
                    id: "msg_welcome",
                    role: "assistant",
                    content: `Welcome to AuroraCraft! I'm your AI development assistant. Tell me what you'd like to build, and I'll help you create it step by step.\n\nYou can describe your plugin, mod, or bot idea in natural language. I'll plan the implementation, generate the code, and help you test it.`,
                    timestamp: new Date(),
                },
            ],
            files: JSON.parse(JSON.stringify(defaultFiles)),
            status: "planning",
        };
        setProjects((prev) => [...prev, newProject]);
        setCurrentProject(newProject);
        return newProject;
    };

    const openProject = (id: string) => {
        const project = projects.find((p) => p.id === id);
        if (project) {
            setCurrentProject(project);
        }
    };

    const deleteProject = (id: string) => {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        if (currentProject?.id === id) {
            setCurrentProject(null);
        }
    };

    const renameProject = (id: string, name: string) => {
        setProjects((prev) =>
            prev.map((p) => (p.id === id ? { ...p, name, lastEdited: new Date() } : p))
        );
        if (currentProject?.id === id) {
            setCurrentProject((prev) => (prev ? { ...prev, name } : null));
        }
    };

    const addMessage = (message: Omit<ChatMessage, "id" | "timestamp">) => {
        const newMessage: ChatMessage = {
            ...message,
            id: "msg_" + Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
        };
        setCurrentProject((prev) => {
            if (!prev) return null;
            return { ...prev, messages: [...prev.messages, newMessage], lastEdited: new Date() };
        });
        setProjects((prev) =>
            prev.map((p) =>
                p.id === currentProject?.id
                    ? { ...p, messages: [...p.messages, newMessage], lastEdited: new Date() }
                    : p
            )
        );
    };

    const updateFile = (fileId: string, content: string) => {
        const updateFileInTree = (nodes: FileNode[]): FileNode[] => {
            return nodes.map((node) => {
                if (node.id === fileId) {
                    return { ...node, content };
                }
                if (node.children) {
                    return { ...node, children: updateFileInTree(node.children) };
                }
                return node;
            });
        };

        setCurrentProject((prev) => {
            if (!prev) return null;
            return { ...prev, files: updateFileInTree(prev.files) };
        });
    };

    const createFile = (parentId: string | null, name: string, type: "file" | "folder") => {
        const newNode: FileNode = {
            id: "file_" + Math.random().toString(36).substr(2, 9),
            name,
            type,
            children: type === "folder" ? [] : undefined,
            content: type === "file" ? "" : undefined,
            language: type === "file" ? name.split(".").pop() : undefined,
        };

        if (!parentId) {
            setCurrentProject((prev) => {
                if (!prev) return null;
                return { ...prev, files: [...prev.files, newNode] };
            });
            return;
        }

        const addToTree = (nodes: FileNode[]): FileNode[] => {
            return nodes.map((node) => {
                if (node.id === parentId && node.type === "folder") {
                    return { ...node, children: [...(node.children || []), newNode] };
                }
                if (node.children) {
                    return { ...node, children: addToTree(node.children) };
                }
                return node;
            });
        };

        setCurrentProject((prev) => {
            if (!prev) return null;
            return { ...prev, files: addToTree(prev.files) };
        });
    };

    const deleteFile = (fileId: string) => {
        const removeFromTree = (nodes: FileNode[]): FileNode[] => {
            return nodes
                .filter((node) => node.id !== fileId)
                .map((node) => {
                    if (node.children) {
                        return { ...node, children: removeFromTree(node.children) };
                    }
                    return node;
                });
        };

        setCurrentProject((prev) => {
            if (!prev) return null;
            return { ...prev, files: removeFromTree(prev.files) };
        });
    };

    const setProjectStatus = (status: Project["status"]) => {
        setCurrentProject((prev) => {
            if (!prev) return null;
            return { ...prev, status };
        });
    };

    return (
        <ProjectContext.Provider
            value={{
                projects,
                currentProject,
                createProject,
                openProject,
                deleteProject,
                renameProject,
                addMessage,
                updateFile,
                createFile,
                deleteFile,
                setProjectStatus,
            }}
        >
            {children}
        </ProjectContext.Provider>
    );
}

export function useProject() {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error("useProject must be used within a ProjectProvider");
    }
    return context;
}

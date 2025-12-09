import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from './api';

interface User {
    id: string;
    username: string;
    email: string;
    role: string;
    tokenBalance: number;
}

interface AuthState {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;

    login: (email: string, password: string) => Promise<void>;
    register: (data: { username: string; email: string; password: string; confirmPassword: string }) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            isLoading: true,
            isAuthenticated: false,

            login: async (email, password) => {
                const { user } = await api.login({ email, password });
                set({ user, isAuthenticated: true });
            },

            register: async (data) => {
                const { user } = await api.register(data);
                set({ user, isAuthenticated: true });
            },

            logout: async () => {
                await api.logout();
                set({ user: null, isAuthenticated: false });
            },

            checkAuth: async () => {
                try {
                    set({ isLoading: true });
                    const { user } = await api.getCurrentUser();
                    set({ user, isAuthenticated: true, isLoading: false });
                } catch {
                    set({ user: null, isAuthenticated: false, isLoading: false });
                }
            },

            updateUser: (updates) => {
                const { user } = get();
                if (user) {
                    set({ user: { ...user, ...updates } });
                }
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
        }
    )
);

// Session store
interface Session {
    id: string;
    name: string;
    description?: string;
    projectType: string;
    createdAt: string;
    updatedAt: string;
}

interface SessionState {
    sessions: Session[];
    currentSession: any | null;
    isLoading: boolean;

    fetchSessions: () => Promise<void>;
    fetchSession: (id: string) => Promise<void>;
    createSession: (data: { name: string; description?: string }) => Promise<Session>;
    deleteSession: (id: string) => Promise<void>;
    setCurrentSession: (session: any | null) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
    sessions: [],
    currentSession: null,
    isLoading: false,

    fetchSessions: async () => {
        set({ isLoading: true });
        try {
            const { sessions } = await api.getSessions();
            set({ sessions, isLoading: false });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    fetchSession: async (id) => {
        set({ isLoading: true });
        try {
            const { session } = await api.getSession(id);
            set({ currentSession: session, isLoading: false });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    createSession: async (data) => {
        const { session } = await api.createSession(data);
        set((state) => ({ sessions: [session, ...state.sessions] }));
        return session;
    },

    deleteSession: async (id) => {
        await api.deleteSession(id);
        set((state) => ({
            sessions: state.sessions.filter((s) => s.id !== id),
            currentSession: state.currentSession?.id === id ? null : state.currentSession,
        }));
    },

    setCurrentSession: (session) => set({ currentSession: session }),
}));

// Chat store
interface ChatMessage {
    id: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    content: string;
    createdAt: string;
    model?: { name: string };
}

interface ChatState {
    messages: ChatMessage[];
    isStreaming: boolean;
    currentModel: string | null;
    mode: 'agent' | 'plan' | 'question';
    models: any[];

    fetchMessages: (sessionId: string) => Promise<void>;
    fetchModels: () => Promise<void>;
    addMessage: (message: ChatMessage) => void;
    updateLastMessage: (content: string) => void;
    setStreaming: (streaming: boolean) => void;
    setModel: (modelId: string) => void;
    setMode: (mode: 'agent' | 'plan' | 'question') => void;
    clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
    messages: [],
    isStreaming: false,
    currentModel: null,
    mode: 'agent',
    models: [],

    fetchMessages: async (sessionId) => {
        try {
            const { messages } = await api.getChatHistory(sessionId);
            set({ messages });
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        }
    },

    fetchModels: async () => {
        try {
            const { models } = await api.getModels();
            set({ models });
            if (models.length > 0 && !get().currentModel) {
                set({ currentModel: models[0].id });
            }
        } catch (error) {
            console.error('Failed to fetch models:', error);
        }
    },

    addMessage: (message) => {
        set((state) => ({ messages: [...state.messages, message] }));
    },

    updateLastMessage: (content) => {
        set((state) => {
            const messages = [...state.messages];
            if (messages.length > 0) {
                messages[messages.length - 1] = {
                    ...messages[messages.length - 1],
                    content: messages[messages.length - 1].content + content,
                };
            }
            return { messages };
        });
    },

    setStreaming: (streaming) => set({ isStreaming: streaming }),
    setModel: (modelId) => set({ currentModel: modelId }),
    setMode: (mode) => set({ mode }),
    clearMessages: () => set({ messages: [] }),
}));

// File store
interface FileNode {
    id: string;
    path: string;
    name: string;
    isFolder: boolean;
    updatedAt: string;
    content?: string;
}

interface FileState {
    files: FileNode[];
    currentFile: FileNode | null;
    isLoading: boolean;
    hasUnsavedChanges: boolean;

    fetchFiles: (sessionId: string) => Promise<void>;
    openFile: (sessionId: string, path: string) => Promise<void>;
    createFile: (sessionId: string, path: string, content?: string, isFolder?: boolean) => Promise<void>;
    updateFile: (sessionId: string, path: string, content: string) => Promise<void>;
    deleteFile: (sessionId: string, path: string) => Promise<void>;
    setCurrentFile: (file: FileNode | null) => void;
    setUnsavedChanges: (hasChanges: boolean) => void;
    updateLocalContent: (content: string) => void;
}

export const useFileStore = create<FileState>((set, get) => ({
    files: [],
    currentFile: null,
    isLoading: false,
    hasUnsavedChanges: false,

    fetchFiles: async (sessionId) => {
        set({ isLoading: true });
        try {
            const { files } = await api.getFileTree(sessionId);
            set({ files, isLoading: false });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    openFile: async (sessionId, path) => {
        set({ isLoading: true });
        try {
            const { file } = await api.getFile(sessionId, path);
            set({ currentFile: file, isLoading: false, hasUnsavedChanges: false });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    createFile: async (sessionId, path, content = '', isFolder = false) => {
        await api.createFile(sessionId, { path, content, isFolder });
        await get().fetchFiles(sessionId);
    },

    updateFile: async (sessionId, path, content) => {
        await api.updateFile(sessionId, path, content);
        set({ hasUnsavedChanges: false });
    },

    deleteFile: async (sessionId, path) => {
        await api.deleteFile(sessionId, path);
        const { currentFile } = get();
        if (currentFile?.path === path) {
            set({ currentFile: null });
        }
        await get().fetchFiles(sessionId);
    },

    setCurrentFile: (file) => set({ currentFile: file, hasUnsavedChanges: false }),
    setUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
    updateLocalContent: (content) => {
        const { currentFile } = get();
        if (currentFile) {
            set({
                currentFile: { ...currentFile, content },
                hasUnsavedChanges: true,
            });
        }
    },
}));

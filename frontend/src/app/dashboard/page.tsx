'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    Plus,
    FolderOpen,
    Trash2,
    Clock,
    FileCode,
    MessageSquare,
    LogOut,
    Settings,
    Coins,
    ChevronRight,
    Search,
    X,
} from 'lucide-react';
import { useAuthStore, useSessionStore } from '@/lib/store';
import toast from 'react-hot-toast';

export default function DashboardPage() {
    const router = useRouter();
    const { user, logout, checkAuth, isLoading: authLoading } = useAuthStore();
    const { sessions, fetchSessions, createSession, deleteSession, isLoading: sessionsLoading } = useSessionStore();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        checkAuth().then(() => {
            fetchSessions().catch(console.error);
        });
    }, []);

    useEffect(() => {
        // Check for initial prompt from homepage
        const initialPrompt = sessionStorage.getItem('initialPrompt');
        if (initialPrompt) {
            setShowCreateModal(true);
            setNewProjectDesc(initialPrompt);
            sessionStorage.removeItem('initialPrompt');
        }
    }, []);

    const handleLogout = async () => {
        await logout();
        router.push('/');
        toast.success('Logged out successfully');
    };

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) {
            toast.error('Please enter a project name');
            return;
        }

        setIsCreating(true);
        try {
            const session = await createSession({
                name: newProjectName.trim(),
                description: newProjectDesc.trim() || undefined,
            });
            setShowCreateModal(false);
            setNewProjectName('');
            setNewProjectDesc('');
            router.push(`/session/${session.id}`);
            toast.success('Project created!');
        } catch (error: any) {
            toast.error(error.message || 'Failed to create project');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteProject = async (id: string) => {
        try {
            await deleteSession(id);
            setShowDeleteModal(null);
            toast.success('Project deleted');
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete project');
        }
    };

    const filteredSessions = sessions.filter(
        (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-dark-950 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dark-950">
            {/* Header */}
            <header className="border-b border-dark-800/50 bg-dark-900/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aurora-500 to-purple-600 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold gradient-text">AuroraCraft</span>
                        </Link>

                        <div className="flex items-center gap-4">
                            {/* Token Balance */}
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-800/80 rounded-lg">
                                <Coins className="w-4 h-4 text-amber-400" />
                                <span className="text-sm font-medium text-dark-200">
                                    {user?.tokenBalance?.toLocaleString() || 0}
                                </span>
                            </div>

                            {/* User Menu */}
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-dark-400">{user?.username}</span>

                                {user?.role === 'ADMIN' && (
                                    <Link
                                        href="/admin"
                                        className="btn-ghost p-2"
                                        title="Admin Panel"
                                    >
                                        <Settings className="w-5 h-5" />
                                    </Link>
                                )}

                                <button
                                    onClick={handleLogout}
                                    className="btn-ghost p-2 text-dark-400 hover:text-red-400"
                                    title="Logout"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Page Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-dark-100">Your Projects</h1>
                        <p className="text-dark-400 mt-1">
                            Manage your Minecraft plugin projects
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn-primary"
                    >
                        <Plus className="w-5 h-5" />
                        New Project
                    </button>
                </div>

                {/* Search */}
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search projects..."
                        className="input pl-10 max-w-md"
                    />
                </div>

                {/* Sessions Grid */}
                {sessionsLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full" />
                    </div>
                ) : filteredSessions.length === 0 ? (
                    <div className="text-center py-20">
                        <FolderOpen className="w-16 h-16 text-dark-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-dark-300 mb-2">
                            {searchQuery ? 'No projects found' : 'No projects yet'}
                        </h3>
                        <p className="text-dark-500 mb-6">
                            {searchQuery
                                ? 'Try a different search term'
                                : 'Create your first Minecraft plugin project'}
                        </p>
                        {!searchQuery && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="btn-primary"
                            >
                                <Plus className="w-5 h-5" />
                                Create Project
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredSessions.map((session) => (
                            <motion.div
                                key={session.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="card group hover:border-aurora-500/30 transition-all cursor-pointer"
                                onClick={() => router.push(`/session/${session.id}`)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-dark-100 group-hover:text-aurora-400 transition-colors truncate">
                                            {session.name}
                                        </h3>
                                        {session.description && (
                                            <p className="text-sm text-dark-400 mt-1 line-clamp-2">
                                                {session.description}
                                            </p>
                                        )}
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-dark-600 group-hover:text-aurora-500 transition-colors flex-shrink-0 ml-2" />
                                </div>

                                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-dark-700/50">
                                    <div className="flex items-center gap-1.5 text-dark-500 text-sm">
                                        <FileCode className="w-4 h-4" />
                                        <span>{session._count?.files || 0} files</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-dark-500 text-sm">
                                        <MessageSquare className="w-4 h-4" />
                                        <span>{session._count?.messages || 0} messages</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between mt-3">
                                    <div className="flex items-center gap-1.5 text-dark-600 text-xs">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>{formatDate(session.updatedAt)}</span>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowDeleteModal(session.id);
                                        }}
                                        className="p-1.5 rounded hover:bg-red-500/10 text-dark-500 hover:text-red-400 transition-colors"
                                        title="Delete project"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </main>

            {/* Create Project Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                        onClick={() => setShowCreateModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="card w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">New Project</h2>
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="p-1 hover:bg-dark-700 rounded"
                                >
                                    <X className="w-5 h-5 text-dark-400" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-dark-300 mb-2">
                                        Project Name
                                    </label>
                                    <input
                                        type="text"
                                        value={newProjectName}
                                        onChange={(e) => setNewProjectName(e.target.value)}
                                        className="input"
                                        placeholder="My Awesome Plugin"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-dark-300 mb-2">
                                        Description (optional)
                                    </label>
                                    <textarea
                                        value={newProjectDesc}
                                        onChange={(e) => setNewProjectDesc(e.target.value)}
                                        className="input min-h-[100px] resize-none"
                                        placeholder="Describe what your plugin should do..."
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="btn-secondary flex-1"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateProject}
                                    disabled={isCreating || !newProjectName.trim()}
                                    className="btn-primary flex-1"
                                >
                                    {isCreating ? 'Creating...' : 'Create Project'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {showDeleteModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                        onClick={() => setShowDeleteModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="card w-full max-w-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-2">Delete Project?</h2>
                            <p className="text-dark-400 mb-6">
                                This will permanently delete the project, all files, and chat history.
                                This action cannot be undone.
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteModal(null)}
                                    className="btn-secondary flex-1"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDeleteProject(showDeleteModal)}
                                    className="btn-danger flex-1"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

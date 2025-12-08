"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProjectProvider, useProject, Project } from "@/context/ProjectContext";

function DashboardContent() {
    const { user, logout, isLoading } = useAuth();
    const { projects, createProject, openProject, deleteProject } = useProject();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#050508]">
                <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!user) return null;

    const handleNewProject = () => {
        const project = createProject("Untitled Project");
        router.push(`/project/${project.id}`);
    };

    const handleOpenProject = (project: Project) => {
        openProject(project.id);
        router.push(`/project/${project.id}`);
    };

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    return (
        <div className="min-h-screen bg-[#050508]">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#050508]/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <Link href="/" className="flex items-center gap-3">
                            <Logo className="w-8 h-8" />
                            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                                AuroraCraft
                            </span>
                        </Link>

                        <div className="flex items-center gap-6">
                            {/* Token Balance */}
                            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-[#16161f] rounded-lg border border-white/5">
                                <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2v-6zm0 8h2v2h-2v-2z" />
                                </svg>
                                <span className="text-sm font-medium text-white">
                                    {user.tokenBalance.toLocaleString()} tokens
                                </span>
                            </div>

                            {/* User Menu */}
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
                                    {user.username[0].toUpperCase()}
                                </div>
                                <span className="hidden sm:block text-sm text-gray-300">{user.username}</span>
                                <Button onClick={logout} variant="ghost" size="sm">
                                    Logout
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {/* Welcome Section */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-12">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            Welcome back, {user.username}!
                        </h1>
                        <p className="text-gray-400">
                            Continue working on your projects or start something new.
                        </p>
                    </div>
                    <Button onClick={handleNewProject} variant="primary" size="lg">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New Project
                    </Button>
                </div>

                {/* Projects */}
                <div>
                    <h2 className="text-xl font-semibold text-white mb-6">Your Projects</h2>

                    {projects.length === 0 ? (
                        <Card className="text-center py-16">
                            <div className="w-16 h-16 mx-auto mb-6 bg-purple-500/10 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">No projects yet</h3>
                            <p className="text-gray-400 mb-6">
                                Create your first project to start building with AI
                            </p>
                            <Button onClick={handleNewProject} variant="primary">
                                Create First Project
                            </Button>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map((project) => (
                                <Card
                                    key={project.id}
                                    hover
                                    className="group relative"
                                >
                                    {/* Status Badge */}
                                    <div className={`absolute top-4 right-4 px-2 py-1 rounded text-xs font-medium ${project.status === "complete"
                                            ? "bg-green-500/20 text-green-400"
                                            : project.status === "building"
                                                ? "bg-yellow-500/20 text-yellow-400"
                                                : "bg-purple-500/20 text-purple-400"
                                        }`}>
                                        {project.status}
                                    </div>

                                    <div className="mb-4">
                                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center mb-4">
                                            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                            </svg>
                                        </div>
                                        <h3 className="text-lg font-semibold text-white mb-1">
                                            {project.name}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            {project.messages.length} messages • {formatDate(project.lastEdited)}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
                                        <Button
                                            onClick={() => handleOpenProject(project)}
                                            variant="primary"
                                            size="sm"
                                            className="flex-1"
                                        >
                                            Open
                                        </Button>
                                        <Button
                                            onClick={() => deleteProject(project.id)}
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <AuthProvider>
            <ProjectProvider>
                <DashboardContent />
            </ProjectProvider>
        </AuthProvider>
    );
}

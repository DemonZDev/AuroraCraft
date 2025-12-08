"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AuthProvider, useAuth } from "@/context/AuthContext";

interface Stats {
    users: number;
    sessions: number;
    messages: number;
    compileJobs: number;
    providers: number;
    models: number;
}

interface User {
    id: string;
    username: string;
    email: string;
    role: string;
    tokenBalance: number;
    createdAt: string;
}

interface Provider {
    id: string;
    name: string;
    displayName: string;
    baseUrl: string;
    isEnabled: boolean;
    _count: { models: number };
}

function AdminContent() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("overview");
    const [stats, setStats] = useState<Stats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [providers, setProviders] = useState<Provider[]>([]);

    useEffect(() => {
        if (!isLoading && (!user || user.role !== "ADMIN")) {
            router.push("/dashboard");
        }
    }, [user, isLoading, router]);

    // Mock data fetch (in production, call API)
    useEffect(() => {
        setStats({
            users: 1247,
            sessions: 3891,
            messages: 45678,
            compileJobs: 892,
            providers: 4,
            models: 12,
        });

        setUsers([
            { id: "1", username: "admin", email: "admin@auroracraft.local", role: "ADMIN", tokenBalance: 1000000, createdAt: "2024-01-01" },
            { id: "2", username: "developer1", email: "dev1@example.com", role: "USER", tokenBalance: 50000, createdAt: "2024-06-15" },
            { id: "3", username: "creator42", email: "creator@example.com", role: "USER", tokenBalance: 25000, createdAt: "2024-08-20" },
        ]);

        setProviders([
            { id: "1", name: "openrouter", displayName: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", isEnabled: true, _count: { models: 8 } },
            { id: "2", name: "anthropic", displayName: "Anthropic", baseUrl: "https://api.anthropic.com/v1", isEnabled: true, _count: { models: 3 } },
        ]);
    }, []);

    if (isLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#050508]">
                <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    const tabs = [
        { id: "overview", label: "Overview", icon: "📊" },
        { id: "users", label: "Users", icon: "👥" },
        { id: "providers", label: "Providers", icon: "🔌" },
        { id: "tokens", label: "Tokens", icon: "🪙" },
        { id: "logs", label: "Logs", icon: "📋" },
        { id: "settings", label: "Settings", icon: "⚙️" },
    ];

    return (
        <div className="min-h-screen bg-[#050508] flex">
            {/* Sidebar */}
            <aside className="w-64 bg-[#0a0a0f] border-r border-white/5 flex flex-col">
                <div className="p-4 border-b border-white/5">
                    <Link href="/" className="flex items-center gap-3">
                        <Logo className="w-8 h-8" />
                        <span className="text-lg font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            Admin Panel
                        </span>
                    </Link>
                </div>

                <nav className="flex-1 p-4">
                    <ul className="space-y-1">
                        {tabs.map((tab) => (
                            <li key={tab.id}>
                                <button
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${activeTab === tab.id
                                            ? "bg-purple-500/20 text-purple-400"
                                            : "text-gray-400 hover:text-white hover:bg-white/5"
                                        }`}
                                >
                                    <span>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="p-4 border-t border-white/5">
                    <Link href="/dashboard">
                        <Button variant="secondary" size="sm" className="w-full">
                            ← Back to Dashboard
                        </Button>
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                <header className="sticky top-0 bg-[#050508]/90 backdrop-blur-xl border-b border-white/5 px-8 py-4">
                    <h1 className="text-2xl font-bold text-white capitalize">{activeTab}</h1>
                </header>

                <div className="p-8">
                    {activeTab === "overview" && stats && (
                        <div className="space-y-8">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <Card className="bg-gradient-to-br from-purple-500/10 to-transparent">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center text-2xl">
                                            👥
                                        </div>
                                        <div>
                                            <p className="text-3xl font-bold text-white">{stats.users.toLocaleString()}</p>
                                            <p className="text-sm text-gray-400">Total Users</p>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="bg-gradient-to-br from-cyan-500/10 to-transparent">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-cyan-500/20 rounded-lg flex items-center justify-center text-2xl">
                                            📁
                                        </div>
                                        <div>
                                            <p className="text-3xl font-bold text-white">{stats.sessions.toLocaleString()}</p>
                                            <p className="text-sm text-gray-400">Projects</p>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="bg-gradient-to-br from-pink-500/10 to-transparent">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center text-2xl">
                                            💬
                                        </div>
                                        <div>
                                            <p className="text-3xl font-bold text-white">{stats.messages.toLocaleString()}</p>
                                            <p className="text-sm text-gray-400">Messages</p>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="bg-gradient-to-br from-green-500/10 to-transparent">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center text-2xl">
                                            🔨
                                        </div>
                                        <div>
                                            <p className="text-3xl font-bold text-white">{stats.compileJobs.toLocaleString()}</p>
                                            <p className="text-sm text-gray-400">Compile Jobs</p>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="bg-gradient-to-br from-yellow-500/10 to-transparent">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center text-2xl">
                                            🔌
                                        </div>
                                        <div>
                                            <p className="text-3xl font-bold text-white">{stats.providers}</p>
                                            <p className="text-sm text-gray-400">Providers</p>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="bg-gradient-to-br from-indigo-500/10 to-transparent">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center text-2xl">
                                            🤖
                                        </div>
                                        <div>
                                            <p className="text-3xl font-bold text-white">{stats.models}</p>
                                            <p className="text-sm text-gray-400">AI Models</p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    )}

                    {activeTab === "users" && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <p className="text-gray-400">Manage user accounts</p>
                                <Button variant="primary" size="sm">
                                    + Add User
                                </Button>
                            </div>

                            <Card className="overflow-hidden p-0">
                                <table className="w-full">
                                    <thead className="bg-[#12121a]">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">User</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Role</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Tokens</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Joined</th>
                                            <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {users.map((u) => (
                                            <tr key={u.id} className="hover:bg-white/5">
                                                <td className="px-6 py-4">
                                                    <div>
                                                        <p className="text-white font-medium">{u.username}</p>
                                                        <p className="text-sm text-gray-500">{u.email}</p>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded text-xs ${u.role === "ADMIN" ? "bg-purple-500/20 text-purple-400" : "bg-gray-500/20 text-gray-400"
                                                        }`}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-gray-300">{u.tokenBalance.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-gray-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <Button variant="ghost" size="sm">Edit</Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                        </div>
                    )}

                    {activeTab === "providers" && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <p className="text-gray-400">Configure AI providers and models</p>
                                <Button variant="primary" size="sm">
                                    + Add Provider
                                </Button>
                            </div>

                            <div className="grid gap-6">
                                {providers.map((provider) => (
                                    <Card key={provider.id} hover className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center text-xl">
                                                🔌
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-semibold text-white">{provider.displayName}</h3>
                                                <p className="text-sm text-gray-500">{provider.baseUrl}</p>
                                                <p className="text-xs text-gray-400 mt-1">{provider._count.models} models configured</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`px-2 py-1 rounded text-xs ${provider.isEnabled ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                                }`}>
                                                {provider.isEnabled ? "Active" : "Disabled"}
                                            </span>
                                            <Button variant="secondary" size="sm">Manage</Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === "tokens" && (
                        <div className="space-y-6">
                            <Card>
                                <h3 className="text-lg font-semibold text-white mb-4">Token Pricing</h3>
                                <p className="text-gray-400 mb-6">Set per-character costs for each model</p>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-[#12121a] rounded-lg">
                                        <div>
                                            <p className="text-white font-medium">Claude 3.5 Sonnet</p>
                                            <p className="text-sm text-gray-500">OpenRouter</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="number"
                                                defaultValue="0.000003"
                                                step="0.000001"
                                                className="w-32 px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded text-white text-sm"
                                            />
                                            <span className="text-gray-500 text-sm">per char</span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === "settings" && (
                        <div className="space-y-6">
                            <Card>
                                <h3 className="text-lg font-semibold text-white mb-4">AI Identity</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">AI Name</label>
                                        <input
                                            type="text"
                                            defaultValue="AuroraCraft"
                                            className="w-full px-4 py-2 bg-[#12121a] border border-white/10 rounded-lg text-white"
                                        />
                                    </div>
                                    <Button variant="primary">Save Changes</Button>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default function AdminPage() {
    return (
        <AuthProvider>
            <AdminContent />
        </AuthProvider>
    );
}

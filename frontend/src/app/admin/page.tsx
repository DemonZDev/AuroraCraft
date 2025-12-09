'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    Sparkles,
    ArrowLeft,
    Users,
    Server,
    Cpu,
    BarChart3,
    Settings,
    Trash2,
    Shield,
    ShieldOff,
    Plus,
    Edit2,
    Check,
    X,
    ChevronDown,
    ChevronRight,
    Coins,
    Eye,
    EyeOff,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import api from '@/lib/api';
import toast from 'react-hot-toast';

type Tab = 'overview' | 'users' | 'providers' | 'analytics';

export default function AdminPage() {
    const router = useRouter();
    const { user, checkAuth } = useAuthStore();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [stats, setStats] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [providers, setProviders] = useState<any[]>([]);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
    const [providerModels, setProviderModels] = useState<Record<string, any[]>>({});

    // Modals
    const [showAddProviderModal, setShowAddProviderModal] = useState(false);
    const [showAddModelModal, setShowAddModelModal] = useState(false);
    const [showAddTokensModal, setShowAddTokensModal] = useState<string | null>(null);
    const [editingProvider, setEditingProvider] = useState<any>(null);
    const [editingModel, setEditingModel] = useState<any>(null);

    useEffect(() => {
        checkAuth().then(() => {
            if (user?.role !== 'ADMIN') {
                router.push('/dashboard');
                return;
            }
            loadData();
        });
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [statsRes, usersRes, providersRes, settingsRes] = await Promise.all([
                api.getAdminStats(),
                api.getAdminUsers(),
                api.getProviders(),
                api.getSettings(),
            ]);
            setStats(statsRes.stats);
            setUsers(usersRes.users);
            setProviders(providersRes.providers);
            setSettings(settingsRes.settings);
        } catch (error) {
            console.error('Failed to load admin data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadProviderModels = async (providerId: string) => {
        try {
            const { models } = await api.getProviderModels(providerId);
            setProviderModels((prev) => ({ ...prev, [providerId]: models }));
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    };

    const handleToggleExpandProvider = async (providerId: string) => {
        if (expandedProvider === providerId) {
            setExpandedProvider(null);
        } else {
            setExpandedProvider(providerId);
            if (!providerModels[providerId]) {
                await loadProviderModels(providerId);
            }
        }
    };

    const handleUpdateSetting = async (key: string, value: string) => {
        try {
            await api.updateSetting(key, value);
            setSettings((prev) => ({ ...prev, [key]: value }));
            toast.success('Setting updated');
        } catch (error: any) {
            toast.error(error.message || 'Failed to update setting');
        }
    };

    const handleToggleUserRole = async (userId: string, currentRole: string) => {
        const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
        try {
            await api.updateUserRole(userId, newRole);
            setUsers((prev) =>
                prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
            );
            toast.success(`User ${newRole === 'ADMIN' ? 'promoted to' : 'demoted from'} admin`);
        } catch (error: any) {
            toast.error(error.message || 'Failed to update user role');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            return;
        }
        try {
            await api.deleteUser(userId);
            setUsers((prev) => prev.filter((u) => u.id !== userId));
            toast.success('User deleted');
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete user');
        }
    };

    const handleAddTokens = async (userId: string, amount: number, description: string) => {
        try {
            const { user: updated } = await api.addUserTokens(userId, amount, description);
            setUsers((prev) =>
                prev.map((u) => (u.id === userId ? { ...u, tokenBalance: updated.tokenBalance } : u))
            );
            setShowAddTokensModal(null);
            toast.success(`${amount > 0 ? 'Added' : 'Deducted'} ${Math.abs(amount)} tokens`);
        } catch (error: any) {
            toast.error(error.message || 'Failed to update tokens');
        }
    };

    const handleToggleProvider = async (providerId: string, isEnabled: boolean) => {
        try {
            await api.updateProvider(providerId, { isEnabled: !isEnabled });
            setProviders((prev) =>
                prev.map((p) => (p.id === providerId ? { ...p, isEnabled: !isEnabled } : p))
            );
            toast.success(`Provider ${!isEnabled ? 'enabled' : 'disabled'}`);
        } catch (error: any) {
            toast.error(error.message || 'Failed to update provider');
        }
    };

    const handleDeleteProvider = async (providerId: string) => {
        if (!confirm('Delete this provider and all its models?')) return;
        try {
            await api.deleteProvider(providerId);
            setProviders((prev) => prev.filter((p) => p.id !== providerId));
            toast.success('Provider deleted');
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete provider');
        }
    };

    const handleToggleModel = async (modelId: string, providerId: string, isEnabled: boolean) => {
        try {
            await api.updateModel(modelId, { isEnabled: !isEnabled });
            setProviderModels((prev) => ({
                ...prev,
                [providerId]: prev[providerId].map((m) =>
                    m.id === modelId ? { ...m, isEnabled: !isEnabled } : m
                ),
            }));
            toast.success(`Model ${!isEnabled ? 'enabled' : 'disabled'}`);
        } catch (error: any) {
            toast.error(error.message || 'Failed to update model');
        }
    };

    const handleDeleteModel = async (modelId: string, providerId: string) => {
        if (!confirm('Delete this model?')) return;
        try {
            await api.deleteModel(modelId);
            setProviderModels((prev) => ({
                ...prev,
                [providerId]: prev[providerId].filter((m) => m.id !== modelId),
            }));
            toast.success('Model deleted');
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete model');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-dark-950 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-aurora-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Settings },
        { id: 'users', label: 'Users', icon: Users },
        { id: 'providers', label: 'Providers', icon: Server },
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    ] as const;

    return (
        <div className="min-h-screen bg-dark-950">
            {/* Header */}
            <header className="border-b border-dark-800/50 bg-dark-900/50 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <Link href="/dashboard" className="btn-ghost p-2">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-aurora-500 to-purple-600 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-xl font-bold">Admin Panel</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Tabs */}
                <div className="flex gap-2 mb-8 overflow-x-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${activeTab === tab.id
                                    ? 'bg-aurora-600 text-white'
                                    : 'bg-dark-800 text-dark-400 hover:text-dark-200'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="space-y-8">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {[
                                { label: 'Total Users', value: stats?.users || 0, icon: Users, color: 'text-aurora-400' },
                                { label: 'Projects', value: stats?.sessions || 0, icon: Cpu, color: 'text-purple-400' },
                                { label: 'Plugins Compiled', value: stats?.pluginsCompiled || 0, icon: Check, color: 'text-emerald-400' },
                                { label: 'Tokens Used', value: (stats?.tokensUsed || 0).toLocaleString(), icon: Coins, color: 'text-amber-400' },
                            ].map((stat) => (
                                <div key={stat.label} className="card">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg bg-dark-800 ${stat.color}`}>
                                            <stat.icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="text-2xl font-bold text-dark-100">{stat.value}</div>
                                            <div className="text-sm text-dark-500">{stat.label}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Settings */}
                        <div className="card">
                            <h2 className="text-lg font-semibold mb-4">System Settings</h2>
                            <div className="space-y-4">
                                {[
                                    { key: 'site_name', label: 'Site Name' },
                                    { key: 'site_description', label: 'Site Description' },
                                    { key: 'enhance_cost', label: 'Enhance Cost (tokens)' },
                                    { key: 'signup_bonus', label: 'Signup Bonus (tokens)' },
                                ].map((setting) => (
                                    <div key={setting.key} className="flex items-center gap-4">
                                        <label className="w-48 text-dark-400 text-sm">{setting.label}</label>
                                        <input
                                            type="text"
                                            value={settings[setting.key] || ''}
                                            onChange={(e) => setSettings((prev) => ({ ...prev, [setting.key]: e.target.value }))}
                                            onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)}
                                            className="input flex-1"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                    <div className="card">
                        <h2 className="text-lg font-semibold mb-4">User Management</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-dark-700">
                                        <th className="text-left py-3 px-4 text-dark-400 font-medium">User</th>
                                        <th className="text-left py-3 px-4 text-dark-400 font-medium">Role</th>
                                        <th className="text-left py-3 px-4 text-dark-400 font-medium">Tokens</th>
                                        <th className="text-left py-3 px-4 text-dark-400 font-medium">Projects</th>
                                        <th className="text-right py-3 px-4 text-dark-400 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                                            <td className="py-3 px-4">
                                                <div className="font-medium text-dark-200">{u.username}</div>
                                                <div className="text-sm text-dark-500">{u.email}</div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`badge ${u.role === 'ADMIN' ? 'badge-info' : 'badge-pending'}`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-dark-300">
                                                {u.tokenBalance?.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-dark-400">
                                                {u._count?.sessions || 0}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => setShowAddTokensModal(u.id)}
                                                        className="btn-ghost p-2 text-amber-400"
                                                        title="Add/Remove tokens"
                                                    >
                                                        <Coins className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleUserRole(u.id, u.role)}
                                                        className={`btn-ghost p-2 ${u.role === 'ADMIN' ? 'text-red-400' : 'text-emerald-400'}`}
                                                        title={u.role === 'ADMIN' ? 'Demote to user' : 'Promote to admin'}
                                                    >
                                                        {u.role === 'ADMIN' ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(u.id)}
                                                        className="btn-ghost p-2 text-red-400"
                                                        title="Delete user"
                                                        disabled={u.id === user?.id}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Providers Tab */}
                {activeTab === 'providers' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold">AI Providers</h2>
                            <button onClick={() => setShowAddProviderModal(true)} className="btn-primary">
                                <Plus className="w-4 h-4" />
                                Add Provider
                            </button>
                        </div>

                        {providers.map((provider) => (
                            <div key={provider.id} className="card">
                                <div
                                    className="flex items-center justify-between cursor-pointer"
                                    onClick={() => handleToggleExpandProvider(provider.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <ChevronRight
                                            className={`w-5 h-5 text-dark-400 transition-transform ${expandedProvider === provider.id ? 'rotate-90' : ''
                                                }`}
                                        />
                                        <div>
                                            <div className="font-semibold text-dark-200">{provider.name}</div>
                                            <div className="text-sm text-dark-500">{provider.baseUrl}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`badge ${provider.isEnabled ? 'badge-success' : 'badge-pending'}`}>
                                            {provider.isEnabled ? 'Active' : 'Disabled'}
                                        </span>
                                        <span className="text-sm text-dark-500">{provider._count?.models || 0} models</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleProvider(provider.id, provider.isEnabled);
                                            }}
                                            className={`btn-ghost p-2 ${provider.isEnabled ? 'text-amber-400' : 'text-emerald-400'}`}
                                        >
                                            {provider.isEnabled ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingProvider(provider);
                                            }}
                                            className="btn-ghost p-2 text-aurora-400"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProvider(provider.id);
                                            }}
                                            className="btn-ghost p-2 text-red-400"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {expandedProvider === provider.id && (
                                    <div className="mt-4 pt-4 border-t border-dark-700">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-sm font-medium text-dark-400">Models</h4>
                                            <button
                                                onClick={() => {
                                                    setEditingModel({ providerId: provider.id });
                                                    setShowAddModelModal(true);
                                                }}
                                                className="btn-ghost text-sm"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Add Model
                                            </button>
                                        </div>
                                        {providerModels[provider.id]?.length > 0 ? (
                                            <div className="space-y-2">
                                                {providerModels[provider.id].map((model) => (
                                                    <div
                                                        key={model.id}
                                                        className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg"
                                                    >
                                                        <div>
                                                            <div className="font-medium text-dark-300">{model.name}</div>
                                                            <div className="text-xs text-dark-500">
                                                                ID: {model.modelId} | Input: {model.inputTokenCost}/1k | Output: {model.outputTokenCost}/1k
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`badge ${model.isEnabled ? 'badge-success' : 'badge-pending'}`}>
                                                                {model.isEnabled ? 'Active' : 'Disabled'}
                                                            </span>
                                                            <button
                                                                onClick={() => handleToggleModel(model.id, provider.id, model.isEnabled)}
                                                                className="btn-ghost p-1.5"
                                                            >
                                                                {model.isEnabled ? (
                                                                    <EyeOff className="w-4 h-4 text-amber-400" />
                                                                ) : (
                                                                    <Eye className="w-4 h-4 text-emerald-400" />
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteModel(model.id, provider.id)}
                                                                className="btn-ghost p-1.5 text-red-400"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-dark-500 text-sm">No models configured</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Analytics Tab */}
                {activeTab === 'analytics' && (
                    <div className="card">
                        <h2 className="text-lg font-semibold mb-4">Token Usage Analytics</h2>
                        <p className="text-dark-500">
                            Detailed analytics and usage charts will be displayed here.
                            Total tokens used: {(stats?.tokensUsed || 0).toLocaleString()}
                        </p>
                    </div>
                )}
            </div>

            {/* Add Tokens Modal */}
            {showAddTokensModal && (
                <AddTokensModal
                    userId={showAddTokensModal}
                    onClose={() => setShowAddTokensModal(null)}
                    onSubmit={handleAddTokens}
                />
            )}

            {/* Provider Modal */}
            {(showAddProviderModal || editingProvider) && (
                <ProviderModal
                    provider={editingProvider}
                    onClose={() => {
                        setShowAddProviderModal(false);
                        setEditingProvider(null);
                    }}
                    onSave={async (data) => {
                        try {
                            if (editingProvider) {
                                await api.updateProvider(editingProvider.id, data);
                            } else {
                                await api.createProvider(data);
                            }
                            loadData();
                            setShowAddProviderModal(false);
                            setEditingProvider(null);
                            toast.success(editingProvider ? 'Provider updated' : 'Provider created');
                        } catch (error: any) {
                            toast.error(error.message || 'Failed to save provider');
                        }
                    }}
                />
            )}

            {/* Model Modal */}
            {showAddModelModal && editingModel && (
                <ModelModal
                    providerId={editingModel.providerId}
                    onClose={() => {
                        setShowAddModelModal(false);
                        setEditingModel(null);
                    }}
                    onSave={async (data) => {
                        try {
                            await api.createModel(data);
                            loadProviderModels(editingModel.providerId);
                            setShowAddModelModal(false);
                            setEditingModel(null);
                            toast.success('Model created');
                        } catch (error: any) {
                            toast.error(error.message || 'Failed to create model');
                        }
                    }}
                />
            )}
        </div>
    );
}

// Add Tokens Modal Component
function AddTokensModal({
    userId,
    onClose,
    onSubmit,
}: {
    userId: string;
    onClose: () => void;
    onSubmit: (userId: string, amount: number, description: string) => void;
}) {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="card w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-bold mb-4">Add/Remove Tokens</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">
                            Amount (negative to deduct)
                        </label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="input"
                            placeholder="10000"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">
                            Description (optional)
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="input"
                            placeholder="Admin adjustment"
                        />
                    </div>
                </div>
                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="btn-secondary flex-1">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSubmit(userId, parseInt(amount), description)}
                        disabled={!amount || parseInt(amount) === 0}
                        className="btn-primary flex-1"
                    >
                        Apply
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// Provider Modal Component
function ProviderModal({
    provider,
    onClose,
    onSave,
}: {
    provider?: any;
    onClose: () => void;
    onSave: (data: any) => void;
}) {
    const [formData, setFormData] = useState({
        name: provider?.name || '',
        baseUrl: provider?.baseUrl || '',
        authType: provider?.authType || 'BEARER',
        apiKey: '',
        isEnabled: provider?.isEnabled ?? true,
    });

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="card w-full max-w-md max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-bold mb-4">
                    {provider ? 'Edit Provider' : 'Add Provider'}
                </h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="input"
                            placeholder="OpenRouter"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Base URL</label>
                        <input
                            type="url"
                            value={formData.baseUrl}
                            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                            className="input"
                            placeholder="https://openrouter.ai/api/v1"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Auth Type</label>
                        <select
                            value={formData.authType}
                            onChange={(e) => setFormData({ ...formData, authType: e.target.value })}
                            className="input"
                        >
                            <option value="BEARER">Bearer Token</option>
                            <option value="API_KEY">API Key Header</option>
                            <option value="CUSTOM_HEADER">Custom Header</option>
                            <option value="NONE">None</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">API Key</label>
                        <input
                            type="password"
                            value={formData.apiKey}
                            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                            className="input"
                            placeholder={provider ? '••••••••' : 'sk-...'}
                        />
                    </div>
                </div>
                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="btn-secondary flex-1">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(formData)}
                        disabled={!formData.name || !formData.baseUrl}
                        className="btn-primary flex-1"
                    >
                        Save
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// Model Modal Component
function ModelModal({
    providerId,
    onClose,
    onSave,
}: {
    providerId: string;
    onClose: () => void;
    onSave: (data: any) => void;
}) {
    const [formData, setFormData] = useState({
        name: '',
        modelId: '',
        inputTokenCost: 0.001,
        outputTokenCost: 0.002,
        maxContextLength: 128000,
        isEnabled: true,
        isVisible: true,
        providerId,
    });

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="card w-full max-w-md max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-bold mb-4">Add Model</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Display Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="input"
                            placeholder="Claude 3.5 Sonnet"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Model ID</label>
                        <input
                            type="text"
                            value={formData.modelId}
                            onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                            className="input"
                            placeholder="anthropic/claude-3.5-sonnet"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">Input Cost/1k</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={formData.inputTokenCost}
                                onChange={(e) => setFormData({ ...formData, inputTokenCost: parseFloat(e.target.value) })}
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">Output Cost/1k</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={formData.outputTokenCost}
                                onChange={(e) => setFormData({ ...formData, outputTokenCost: parseFloat(e.target.value) })}
                                className="input"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Max Context</label>
                        <input
                            type="number"
                            value={formData.maxContextLength}
                            onChange={(e) => setFormData({ ...formData, maxContextLength: parseInt(e.target.value) })}
                            className="input"
                        />
                    </div>
                </div>
                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="btn-secondary flex-1">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(formData)}
                        disabled={!formData.name || !formData.modelId}
                        className="btn-primary flex-1"
                    >
                        Create
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

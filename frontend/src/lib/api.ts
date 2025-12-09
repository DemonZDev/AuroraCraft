const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FetchOptions extends RequestInit {
    skipAuth?: boolean;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const defaultHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            headers: {
                ...defaultHeaders,
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || error.message || 'Request failed');
        }

        return response.json();
    }

    // Auth
    async register(data: { username: string; email: string; password: string; confirmPassword: string }) {
        return this.request<{ user: any }>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async login(data: { email: string; password: string }) {
        return this.request<{ user: any }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async logout() {
        return this.request<{ success: boolean }>('/api/auth/logout', {
            method: 'POST',
        });
    }

    async getCurrentUser() {
        return this.request<{ user: any }>('/api/auth/me');
    }

    // Sessions
    async getSessions() {
        return this.request<{ sessions: any[] }>('/api/sessions');
    }

    async createSession(data: { name: string; description?: string; projectType?: string }) {
        return this.request<{ session: any }>('/api/sessions', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async getSession(id: string) {
        return this.request<{ session: any }>(`/api/sessions/${id}`);
    }

    async deleteSession(id: string) {
        return this.request<{ success: boolean }>(`/api/sessions/${id}`, {
            method: 'DELETE',
        });
    }

    // Files
    async getFileTree(sessionId: string) {
        return this.request<{ files: any[] }>(`/api/files/${sessionId}`);
    }

    async getFile(sessionId: string, path: string) {
        return this.request<{ file: any }>(`/api/files/${sessionId}/file?path=${encodeURIComponent(path)}`);
    }

    async createFile(sessionId: string, data: { path: string; content: string; isFolder?: boolean }) {
        return this.request<{ file: any }>(`/api/files/${sessionId}`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateFile(sessionId: string, path: string, content: string) {
        return this.request<{ file: any }>(`/api/files/${sessionId}/file?path=${encodeURIComponent(path)}`, {
            method: 'PUT',
            body: JSON.stringify({ content }),
        });
    }

    async deleteFile(sessionId: string, path: string) {
        return this.request<{ success: boolean }>(`/api/files/${sessionId}/file?path=${encodeURIComponent(path)}`, {
            method: 'DELETE',
        });
    }

    async renameFile(sessionId: string, oldPath: string, newPath: string) {
        return this.request<{ file: any }>(`/api/files/${sessionId}/file?path=${encodeURIComponent(oldPath)}`, {
            method: 'PATCH',
            body: JSON.stringify({ newPath }),
        });
    }

    getDownloadUrl(sessionId: string) {
        return `${this.baseUrl}/api/files/${sessionId}/download`;
    }

    // Chat
    async getModels() {
        return this.request<{ models: any[] }>('/api/chat/models');
    }

    async getChatHistory(sessionId: string) {
        return this.request<{ messages: any[] }>(`/api/chat/${sessionId}/history`);
    }

    async enhancePrompt(data: { prompt: string; modelId: string }) {
        return this.request<{ enhanced: string }>('/api/chat/enhance', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // Streaming chat - uses EventSource
    streamMessage(sessionId: string, data: { content: string; modelId: string; mode: string }) {
        const url = `${this.baseUrl}/api/chat/${sessionId}/message`;

        return fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    }

    // Compilation
    async startCompilation(sessionId: string) {
        return this.request<{ jobId: string }>(`/api/compile/${sessionId}/compile`, {
            method: 'POST',
        });
    }

    async getCompilationStatus(sessionId: string, jobId: string) {
        return this.request<{ job: any }>(`/api/compile/${sessionId}/status/${jobId}`);
    }

    async getCompilationHistory(sessionId: string) {
        return this.request<{ jobs: any[] }>(`/api/compile/${sessionId}/history`);
    }

    getArtifactDownloadUrl(sessionId: string, jobId: string) {
        return `${this.baseUrl}/api/compile/${sessionId}/download/${jobId}`;
    }

    streamCompilationLogs(sessionId: string, jobId: string) {
        return `${this.baseUrl}/api/compile/${sessionId}/logs/${jobId}`;
    }

    // Admin
    async getAdminStats() {
        return this.request<{ stats: any }>('/api/admin/stats');
    }

    async getAdminUsers(page = 1, limit = 20) {
        return this.request<{ users: any[]; total: number }>(`/api/admin/users?page=${page}&limit=${limit}`);
    }

    async updateUserRole(userId: string, role: string) {
        return this.request<{ user: any }>(`/api/admin/users/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role }),
        });
    }

    async addUserTokens(userId: string, amount: number, description?: string) {
        return this.request<{ user: any }>(`/api/admin/users/${userId}/tokens`, {
            method: 'POST',
            body: JSON.stringify({ amount, description }),
        });
    }

    async deleteUser(userId: string) {
        return this.request<{ success: boolean }>(`/api/admin/users/${userId}`, {
            method: 'DELETE',
        });
    }

    async getProviders() {
        return this.request<{ providers: any[] }>('/api/admin/providers');
    }

    async createProvider(data: any) {
        return this.request<{ provider: any }>('/api/admin/providers', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateProvider(id: string, data: any) {
        return this.request<{ provider: any }>(`/api/admin/providers/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteProvider(id: string) {
        return this.request<{ success: boolean }>(`/api/admin/providers/${id}`, {
            method: 'DELETE',
        });
    }

    async getProviderModels(providerId: string) {
        return this.request<{ models: any[] }>(`/api/admin/providers/${providerId}/models`);
    }

    async createModel(data: any) {
        return this.request<{ model: any }>('/api/admin/models', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateModel(id: string, data: any) {
        return this.request<{ model: any }>(`/api/admin/models/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteModel(id: string) {
        return this.request<{ success: boolean }>(`/api/admin/models/${id}`, {
            method: 'DELETE',
        });
    }

    async getSettings() {
        return this.request<{ settings: Record<string, string> }>('/api/admin/settings');
    }

    async updateSetting(key: string, value: string) {
        return this.request<{ setting: any }>(`/api/admin/settings/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value }),
        });
    }
}

export const api = new ApiClient(API_URL);
export default api;

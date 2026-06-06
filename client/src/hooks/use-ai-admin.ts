import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type ModelUsage = 'agent' | 'prompt_enhancer' | 'error_prompt_maker'

export interface AiProvider {
  id: string
  name: string
  slug: string
  baseUrl: string
  kind: 'openai_compatible' | 'zen'
  isFree: boolean
  isActive: boolean
  isBuiltin: boolean
  createdAt: string
  updatedAt: string
}

export interface AiModelRow {
  id: string
  providerId: string
  showName: string
  realName: string
  description: string
  usages: ModelUsage[]
  typeTag: string
  weight: number
  inputPer1m: number
  outputPer1m: number
  cachedInputPer1m: number | null
  isActive: boolean
  providerName: string
  providerSlug: string
  providerIsFree: boolean
  providerIsActive: boolean
}

export interface McpRow {
  id: string
  name: string
  config: string
  apiType: 'non_api' | 'api'
  isActive: boolean
}

const KEYS = {
  providers: ['ai-admin', 'providers'] as const,
  models: ['ai-admin', 'models'] as const,
  mcps: ['ai-admin', 'mcps'] as const,
}

// ── Providers ───────────────────────────────────────────────────────────
export function useAiProviders() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: KEYS.providers,
    queryFn: () => api.get<AiProvider[]>('/admin/ai/providers'),
  })
  return { providers: data ?? [], isLoading, refetch }
}

export function useProviderMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEYS.providers })
    qc.invalidateQueries({ queryKey: KEYS.models })
  }
  const create = useMutation({
    mutationFn: (body: { name: string; baseUrl: string; isFree: boolean }) => api.post('/admin/ai/providers', body),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; baseUrl?: string; isFree?: boolean; isActive?: boolean }) =>
      api.patch(`/admin/ai/providers/${id}`, body),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/ai/providers/${id}`),
    onSuccess: invalidate,
  })
  return { create, update, remove }
}

// ── Models ──────────────────────────────────────────────────────────────
export function useAiModels() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: KEYS.models,
    queryFn: () => api.get<AiModelRow[]>('/admin/ai/models'),
  })
  return { models: data ?? [], isLoading, refetch }
}

export interface ModelInput {
  providerId: string
  showName: string
  realName: string
  description?: string
  usages: ModelUsage[]
  typeTag?: string
  weight: number
  inputPer1m?: number
  outputPer1m?: number
  cachedInputPer1m?: number | null
}

export function useModelMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: KEYS.models })
  const create = useMutation({
    mutationFn: (body: ModelInput) => api.post('/admin/ai/models', body),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...body }: Partial<ModelInput> & { id: string; isActive?: boolean }) =>
      api.patch(`/admin/ai/models/${id}`, body),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/ai/models/${id}`),
    onSuccess: invalidate,
  })
  return { create, update, remove }
}

// ── MCPs ────────────────────────────────────────────────────────────────
export function useAdminMcps() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: KEYS.mcps,
    queryFn: () => api.get<McpRow[]>('/admin/ai/mcps'),
  })
  return { mcps: data ?? [], isLoading, refetch }
}

export function useMcpMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: KEYS.mcps })
  const create = useMutation({
    mutationFn: (body: { name: string; config: string; apiType: 'non_api' | 'api' }) => api.post('/admin/ai/mcps', body),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; config?: string; apiType?: 'non_api' | 'api'; isActive?: boolean }) =>
      api.patch(`/admin/ai/mcps/${id}`, body),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/ai/mcps/${id}`),
    onSuccess: invalidate,
  })
  return { create, update, remove }
}

// ── Per-user keys (used by the Users page) ───────────────────────────────
export interface UserProviderKeyRow {
  providerId: string
  name: string
  slug: string
  isFree: boolean
  isActive: boolean
  isBuiltin: boolean
  hasKey: boolean
  maskedKey: string | null
}
export interface UserMcpKeyRow {
  mcpId: string
  name: string
  isActive: boolean
  hasKey: boolean
  maskedKey: string | null
}
export interface UserKeys {
  providers: UserProviderKeyRow[]
  mcps: UserMcpKeyRow[]
}

export function useUserKeys(userId: string | null) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ai-admin', 'user-keys', userId],
    queryFn: () => api.get<UserKeys>(`/admin/users/${userId}/keys`),
    enabled: !!userId,
  })
  return { keys: data ?? null, isLoading, refetch }
}

export function useUserKeyMutations(userId: string | null) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['ai-admin', 'user-keys', userId] })
  const setKey = useMutation({
    mutationFn: (body: { providerId?: string; mcpId?: string; apiKey: string }) =>
      api.post(`/admin/users/${userId}/keys`, body),
    onSuccess: invalidate,
  })
  const removeKey = useMutation({
    mutationFn: (target: { providerId?: string; mcpId?: string }) => {
      const q = target.providerId ? `providerId=${target.providerId}` : `mcpId=${target.mcpId}`
      return api.delete(`/admin/users/${userId}/keys?${q}`)
    },
    onSuccess: invalidate,
  })
  return { setKey, removeKey }
}

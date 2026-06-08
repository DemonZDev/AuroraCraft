import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface ToolModelOption { id: string; label: string; typeTag?: string; providerName?: string; isFree?: boolean; hasKey?: boolean }
export type PromptToolJobStatus = 'running' | 'awaiting_user' | 'ready' | 'completed' | 'cancelled' | 'failed' | 'timeout'
export interface PromptToolJobView {
  id: string
  kind: 'prompt_enhance' | 'error_fix' | 'agent_dispatch'
  status: PromptToolJobStatus
  toolModel: string
  agentModel?: string | null
  style?: string | null
  error?: string | null
  result?: { prompt?: string; summary?: string } | null
  createdAt: string
  updatedAt: string
}

const TERMINAL: PromptToolJobStatus[] = ['completed', 'cancelled', 'failed', 'timeout']
export const isTerminal = (s?: PromptToolJobStatus | null) => !!s && TERMINAL.includes(s)

interface ToolModelsResponse {
  enhancer: ToolModelOption[]
  errorMaker: ToolModelOption[]
  defaultEnhancerId: string
  defaultErrorMakerId: string
}

/** Models for the Prompt Enhancer & Error Prompt Maker pickers (DB-driven, per-usage). */
export function useToolModels() {
  const { data } = useQuery({
    queryKey: ['prompt-tools', 'models'],
    queryFn: () => api.get<ToolModelsResponse>('/prompt-tools/models'),
    staleTime: 1000 * 60 * 10,
  })
  return {
    enhancerModels: data?.enhancer ?? [],
    errorMakerModels: data?.errorMaker ?? [],
    defaultEnhancerId: data?.defaultEnhancerId ?? '',
    defaultErrorMakerId: data?.defaultErrorMakerId ?? '',
  }
}

/** True if the current user can run at least one enhancer/error-maker model (has a key for it). */
export function useHasToolKey() {
  const { data } = useQuery({
    queryKey: ['prompt-tools', 'models'],
    queryFn: () => api.get<ToolModelsResponse>('/prompt-tools/models'),
    staleTime: 1000 * 60 * 10,
  })
  const all = [...(data?.enhancer ?? []), ...(data?.errorMaker ?? [])]
  return all.some((m) => m.hasKey)
}

/** Poll a single prompt-tool job until terminal. */
export function usePromptToolJob(projectId: string, jobId: string | null) {
  const { data } = useQuery({
    queryKey: ['projects', projectId, 'prompt-tools', 'job', jobId],
    queryFn: () => api.get<{ job: PromptToolJobView }>(`/projects/${projectId}/prompt-tools/jobs/${jobId}`).then((r) => r.job),
    enabled: !!projectId && !!jobId,
    refetchInterval: (q) => (isTerminal((q.state.data as PromptToolJobView | undefined)?.status) ? false : 1500),
  })
  return data ?? null
}

/** Re-attach: latest non-terminal job for the project (on workspace open / refresh). */
export function useActivePromptToolJob(projectId: string, enabled = true) {
  const { data, refetch } = useQuery({
    queryKey: ['projects', projectId, 'prompt-tools', 'active'],
    queryFn: () => api.get<{ job: PromptToolJobView | null }>(`/projects/${projectId}/prompt-tools/active`).then((r) => r.job),
    enabled: !!projectId && enabled,
    refetchInterval: (q) => (isTerminal((q.state.data as PromptToolJobView | null | undefined)?.status) ? false : 2500),
  })
  return { activeJob: data ?? null, refetchActive: refetch }
}

export function usePromptToolMutations(projectId: string) {
  const enhance = useMutation({
    mutationFn: (body: { prompt: string; style: string; toolModel?: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/prompt-tools/enhance`, body),
  })
  const refine = useMutation({
    mutationFn: ({ jobId, changeRequest }: { jobId: string; changeRequest: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/prompt-tools/enhance/${jobId}/refine`, { changeRequest }),
  })
  const completeEnhance = useMutation({
    mutationFn: (jobId: string) => api.post(`/projects/${projectId}/prompt-tools/enhance/${jobId}/complete`),
  })
  const enhanceDispatch = useMutation({
    mutationFn: ({ jobId, agentModel }: { jobId: string; agentModel: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/prompt-tools/enhance/${jobId}/dispatch`, { agentModel }),
  })
  const cancel = useMutation({
    mutationFn: (jobId: string) => api.post(`/projects/${projectId}/prompt-tools/jobs/${jobId}/cancel`),
  })
  const errorFix = useMutation({
    mutationFn: (body: { reviewIssueRefs: Array<{ reviewId: string; issueIdx: number }>; toolModel?: string; agentModel: string; sessionId?: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/prompt-tools/error-fix`, body),
  })
  // In-Built Prompt Maker: register a pre-built prompt as a ready error_fix job so its
  // dispatch is refresh-proof + idempotent, exactly like the AI flow.
  const dispatch = useMutation({
    mutationFn: (body: { prompt: string; agentModel: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/prompt-tools/dispatch`, body),
  })
  return { enhance, refine, completeEnhance, enhanceDispatch, cancel, errorFix, dispatch }
}

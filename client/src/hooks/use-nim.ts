import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface NimModelOption { id: string; label: string; typeTag?: string; providerName?: string; isFree?: boolean; hasKey?: boolean }
export type NimJobStatus = 'running' | 'awaiting_user' | 'ready' | 'completed' | 'cancelled' | 'failed' | 'timeout'
export interface NimJobView {
  id: string
  kind: 'prompt_enhance' | 'error_fix' | 'agent_dispatch'
  status: NimJobStatus
  nimModel: string
  agentModel?: string | null
  style?: string | null
  error?: string | null
  result?: { prompt?: string; summary?: string } | null
  createdAt: string
  updatedAt: string
}

const TERMINAL: NimJobStatus[] = ['completed', 'cancelled', 'failed', 'timeout']
export const isTerminal = (s?: NimJobStatus | null) => !!s && TERMINAL.includes(s)

interface NimModelsResponse {
  enhancer: NimModelOption[]
  errorMaker: NimModelOption[]
  defaultEnhancerId: string
  defaultErrorMakerId: string
}

/** Models for the Prompt Enhancer & Error Prompt Maker pickers (DB-driven, per-usage). */
export function useNimModels() {
  const { data } = useQuery({
    queryKey: ['nim', 'models'],
    queryFn: () => api.get<NimModelsResponse>('/nim/models'),
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
export function useHasNimKey() {
  const { data } = useQuery({
    queryKey: ['nim', 'models'],
    queryFn: () => api.get<NimModelsResponse>('/nim/models'),
    staleTime: 1000 * 60 * 10,
  })
  const all = [...(data?.enhancer ?? []), ...(data?.errorMaker ?? [])]
  return all.some((m) => m.hasKey)
}

/** Poll a single NIM job until terminal. */
export function useNimJob(projectId: string, jobId: string | null) {
  const { data } = useQuery({
    queryKey: ['projects', projectId, 'nim', 'job', jobId],
    queryFn: () => api.get<{ job: NimJobView }>(`/projects/${projectId}/nim/jobs/${jobId}`).then((r) => r.job),
    enabled: !!projectId && !!jobId,
    refetchInterval: (q) => (isTerminal((q.state.data as NimJobView | undefined)?.status) ? false : 1500),
  })
  return data ?? null
}

/** Re-attach: latest non-terminal job for the project (on workspace open / refresh). */
export function useActiveNimJob(projectId: string, enabled = true) {
  const { data, refetch } = useQuery({
    queryKey: ['projects', projectId, 'nim', 'active'],
    queryFn: () => api.get<{ job: NimJobView | null }>(`/projects/${projectId}/nim/active`).then((r) => r.job),
    enabled: !!projectId && enabled,
    refetchInterval: (q) => (isTerminal((q.state.data as NimJobView | null | undefined)?.status) ? false : 2500),
  })
  return { activeJob: data ?? null, refetchActive: refetch }
}

export function useNimMutations(projectId: string) {
  const enhance = useMutation({
    mutationFn: (body: { prompt: string; style: string; nimModel?: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/nim/enhance`, body),
  })
  const refine = useMutation({
    mutationFn: ({ jobId, changeRequest }: { jobId: string; changeRequest: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/nim/enhance/${jobId}/refine`, { changeRequest }),
  })
  const completeEnhance = useMutation({
    mutationFn: (jobId: string) => api.post(`/projects/${projectId}/nim/enhance/${jobId}/complete`),
  })
  const enhanceDispatch = useMutation({
    mutationFn: ({ jobId, agentModel }: { jobId: string; agentModel: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/nim/enhance/${jobId}/dispatch`, { agentModel }),
  })
  const cancel = useMutation({
    mutationFn: (jobId: string) => api.post(`/projects/${projectId}/nim/jobs/${jobId}/cancel`),
  })
  const errorFix = useMutation({
    mutationFn: (body: { reviewIssueRefs: Array<{ reviewId: string; issueIdx: number }>; nimModel?: string; agentModel: string; sessionId?: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/nim/error-fix`, body),
  })
  // In-Built Prompt Maker: register a pre-built prompt as a ready error_fix job so its
  // dispatch is refresh-proof + idempotent, exactly like the AI flow.
  const dispatch = useMutation({
    mutationFn: (body: { prompt: string; agentModel: string }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/nim/dispatch`, body),
  })
  return { enhance, refine, completeEnhance, enhanceDispatch, cancel, errorFix, dispatch }
}

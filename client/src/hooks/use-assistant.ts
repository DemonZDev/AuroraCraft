import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ── Types (mirror server/src/agents/assistant-types.ts) ──────────────────────

export type AssistantJobKind = 'enhance' | 'error_fix' | 'post_session'
export type AssistantJobStatus =
  | 'queued' | 'running' | 'awaiting_user' | 'done' | 'failed' | 'cancelled' | 'stopped'
export type EnhanceStyle = 'optimized' | 'structured' | 'explanatory' | 'feature_adding'

export interface AssistantAction {
  id: string
  type: 'send_prompt' | 'graphify' | 'code_review' | 'git_push'
  label: string
  prompt?: string
}

export interface PostSessionArtifact {
  analysis: { completed: boolean; stoppedMidway: boolean; issues: string[]; reason: string; summary: string }
  recommendation: string
  actions: AssistantAction[]
}

export interface AssistantJob {
  id: string
  projectId: string
  sessionId: string | null
  kind: AssistantJobKind
  status: AssistantJobStatus
  model: string
  input: any
  draft: { prompt: string } | null
  result: any
  error: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface AssistantModelOption { id: string; name: string; description: string; isDefault: boolean }
export interface AssistantConfig {
  enabled: boolean
  model: string
  hasKey: boolean
  tier: 'free' | 'paid'
  available: boolean
  models: AssistantModelOption[]
}

// ── Config + mutations ───────────────────────────────────────────────────────

export function useAssistant(projectId: string, active = true) {
  const queryClient = useQueryClient()
  const configKey = ['projects', projectId, 'assistant']
  const activeKey = ['projects', projectId, 'assistant', 'active']

  const { data: config } = useQuery({
    queryKey: configKey,
    queryFn: () => api.get<AssistantConfig>(`/projects/${projectId}/assistant`),
    enabled: !!projectId && active,
  })

  const { data: job } = useQuery({
    queryKey: activeKey,
    queryFn: () => api.get<AssistantJob | null>(`/projects/${projectId}/assistant/jobs/active`),
    enabled: !!projectId && active,
    refetchInterval: (q) => {
      const s = (q.state.data as AssistantJob | null | undefined)?.status
      return s === 'queued' || s === 'running' ? 1500 : false
    },
  })

  const invalidateConfig = () => queryClient.invalidateQueries({ queryKey: configKey })
  const invalidateActive = () => queryClient.invalidateQueries({ queryKey: activeKey })

  const patch = useMutation({
    mutationFn: (body: { enabled?: boolean; model?: string }) =>
      api.patch(`/projects/${projectId}/assistant`, body),
    onSuccess: invalidateConfig,
  })

  const enhance = useMutation({
    mutationFn: (body: { prompt: string; style: EnhanceStyle }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/assistant/enhance`, body),
    onSuccess: invalidateActive,
  })

  const errorFix = useMutation({
    mutationFn: (body: { issues: unknown[] }) =>
      api.post<{ jobId: string }>(`/projects/${projectId}/assistant/error-fix`, body),
    onSuccess: invalidateActive,
  })

  const revise = useMutation({
    mutationFn: (vars: { jobId: string; feedback: string }) =>
      api.post(`/projects/${projectId}/assistant/jobs/${vars.jobId}/revise`, { feedback: vars.feedback }),
    onSuccess: invalidateActive,
  })

  const confirm = useMutation({
    mutationFn: (jobId: string) =>
      api.post<{ prompt: string }>(`/projects/${projectId}/assistant/jobs/${jobId}/confirm`),
    onSuccess: invalidateActive,
  })

  const acceptAction = useMutation({
    mutationFn: (vars: { jobId: string; actionId: string }) =>
      api.post<{ action: AssistantAction }>(`/projects/${projectId}/assistant/jobs/${vars.jobId}/accept-action`, { actionId: vars.actionId }),
    onSuccess: invalidateActive,
  })

  const cancel = useMutation({
    mutationFn: (jobId: string) => api.post(`/projects/${projectId}/assistant/jobs/${jobId}/cancel`),
    onSuccess: invalidateActive,
  })

  const stop = useMutation({
    mutationFn: (jobId: string) => api.post(`/projects/${projectId}/assistant/jobs/${jobId}/stop`),
    onSuccess: invalidateActive,
  })

  return {
    config: config ?? null,
    available: config?.available ?? false,
    job: job ?? null,
    invalidateActive,
    setEnabled: (enabled: boolean) => patch.mutateAsync({ enabled }),
    setModel: (model: string) => patch.mutateAsync({ model }),
    isPatching: patch.isPending,
    enhance: enhance.mutateAsync,
    isEnhancing: enhance.isPending,
    errorFix: errorFix.mutateAsync,
    revise: revise.mutateAsync,
    confirm: confirm.mutateAsync,
    acceptAction: acceptAction.mutateAsync,
    cancel: cancel.mutateAsync,
    stop: stop.mutateAsync,
  }
}

// ── Live progress (SSE) ───────────────────────────────────────────────────────

export interface AssistantProgress { lines: string[]; text: string; connected: boolean; done: boolean; error: string | null }

/**
 * Subscribe to a job's live progress over SSE. Progress is ephemeral (DB job row
 * is the source of truth for the final result); this just powers the "working…" UI.
 */
export function useAssistantStream(projectId: string, jobId: string | null): AssistantProgress {
  const [progress, setProgress] = useState<AssistantProgress>({ lines: [], text: '', connected: false, done: false, error: null })
  const textRef = useRef('')

  useEffect(() => {
    if (!projectId || !jobId) {
      setProgress({ lines: [], text: '', connected: false, done: false, error: null })
      textRef.current = ''
      return
    }
    textRef.current = ''
    const es = new EventSource(`/api/projects/${projectId}/assistant/jobs/${jobId}/stream`, { withCredentials: true })
    es.onopen = () => setProgress((p) => ({ ...p, connected: true }))
    es.onmessage = (e) => {
      let ev: any
      try {
        ev = JSON.parse(e.data)
      } catch {
        return
      }
      if (ev.type === 'text-delta') {
        textRef.current += ev.content ?? ''
        setProgress((p) => ({ ...p, text: textRef.current }))
      } else if (ev.type === 'thinking') {
        textRef.current += ev.content ?? ''
        setProgress((p) => ({ ...p, text: textRef.current }))
      } else if (ev.type === 'status' && ev.message) {
        setProgress((p) => ({ ...p, lines: [...p.lines.slice(-20), String(ev.message)] }))
      } else if (ev.type === 'complete') {
        setProgress((p) => ({ ...p, done: true }))
        es.close()
      } else if (ev.type === 'error') {
        setProgress((p) => ({ ...p, done: true, error: String(ev.message ?? 'Assistant failed.') }))
        es.close()
      }
    }
    es.onerror = () => setProgress((p) => ({ ...p, connected: false }))
    return () => es.close()
  }, [projectId, jobId])

  return progress
}

// ── Feature 2 auto-send: poll an error_fix job to completion, then hand its
//    generated prompt to `onReady` exactly once (the prompt is never shown). ──

export function useErrorFixAutoSend(
  projectId: string,
  activeJob: AssistantJob | null,
  onReady: (prompt: string) => void,
) {
  const sentRef = useRef<Set<string>>(new Set())
  const [trackId, setTrackId] = useState<string | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // Resume tracking an in-flight error_fix job (e.g. after a page refresh).
  useEffect(() => {
    if (activeJob && activeJob.kind === 'error_fix' && (activeJob.status === 'queued' || activeJob.status === 'running')) {
      setTrackId(activeJob.id)
    }
  }, [activeJob?.id, activeJob?.status])

  // Poll the tracked job until it finishes, then auto-send its prompt once.
  useEffect(() => {
    if (!projectId || !trackId) return
    let stopped = false
    const poll = async () => {
      try {
        const job = await api.get<AssistantJob>(`/projects/${projectId}/assistant/jobs/${trackId}`)
        if (stopped) return
        if (job.status === 'done') {
          const prompt = (job.result as { prompt?: string } | null)?.prompt
          if (prompt && !sentRef.current.has(job.id)) {
            sentRef.current.add(job.id)
            onReadyRef.current(prompt)
          }
          setTrackId(null)
          return
        }
        if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'stopped') {
          setTrackId(null)
          return
        }
      } catch {
        /* transient — retry */
      }
      if (!stopped) setTimeout(poll, 1500)
    }
    void poll()
    return () => {
      stopped = true
    }
  }, [trackId, projectId])

  return { track: setTrackId }
}

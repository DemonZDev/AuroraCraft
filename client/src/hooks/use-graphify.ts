import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface GraphifyState {
  enabled: boolean
  status: 'none' | 'building' | 'ready' | 'failed'
  builtAt: string | null
}

/**
 * Graphify state + enable/remove mutations for a project.
 * Polls every 2s while a build is in progress. Pass `active=false` (e.g. for free
 * users) to skip the query entirely.
 */
export function useGraphify(projectId: string, active = true) {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['projects', projectId, 'graphify'],
    queryFn: () => api.get<GraphifyState>(`/projects/${projectId}/graphify`),
    enabled: !!projectId && active,
    refetchInterval: (q) =>
      ((q.state.data as GraphifyState | undefined)?.status === 'building' ? 2000 : false),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'graphify'] })

  const enableMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/graphify`),
    onSuccess: invalidate,
  })

  const removeMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/graphify`),
    onSuccess: invalidate,
  })

  return {
    graphify: data ?? null,
    enable: enableMutation.mutateAsync,
    isEnabling: enableMutation.isPending,
    remove: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  }
}

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AIModel } from '@/types'

/** Agent models available to the current user (tier-filtered, weight-sorted) from the DB. */
export function useAgentModels() {
  const { data, isLoading } = useQuery({
    queryKey: ['ai', 'models'],
    queryFn: () => api.get<{ models: AIModel[]; tier: string }>('/ai/models'),
    staleTime: 60_000,
  })
  return { models: data?.models ?? [], tier: data?.tier ?? 'free', isLoading }
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AdminStats, AdminProject, User, KiroAuthStatus } from '@/types'

export function useAdminStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<AdminStats>('/admin/stats'),
  })

  return { stats: data ?? null, isLoading }
}

export function useAdminUsers() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<User[]>('/admin/users'),
  })

  return { users: data ?? [], isLoading, refetch }
}

export function useAdminProjects() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'projects'],
    queryFn: () => api.get<AdminProject[]>('/admin/projects'),
  })

  return { projects: data ?? [], isLoading }
}

export function useKiroAuthStatus(userId: string) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'kiro', 'status', userId],
    queryFn: () => api.get<KiroAuthStatus>(`/admin/kiro/status/${userId}`),
    enabled: !!userId,
  })

  return { status: data ?? null, isLoading, refetch }
}

export function useKiroAuthenticate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) =>
      api.post<KiroAuthStatus>(`/admin/kiro/authenticate/${userId}`),
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kiro', 'status', userId] })
    },
  })
}

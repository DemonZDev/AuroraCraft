import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AdminStats, AdminProject, AdminProjectDetail, User } from '@/types'

export function useAdminStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<AdminStats>('/admin/stats'),
  })

  return { stats: data ?? null, isLoading }
}

export function useAdminUsers(search?: string) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'users', search ?? ''],
    queryFn: () =>
      api.get<User[]>(`/admin/users/detailed${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  })

  return { users: data ?? [], isLoading, refetch }
}

export function useAdminProjects(search?: string) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'projects', search ?? ''],
    queryFn: () =>
      api.get<AdminProject[]>(`/admin/projects${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  })

  return { projects: data ?? [], isLoading, refetch }
}

// Single project + owner info — powers the admin workspace header.
export function useAdminProject(id: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'project', id],
    queryFn: () => api.get<AdminProjectDetail>(`/admin/projects/${id}`),
    enabled: !!id,
  })

  return { project: data ?? null, isLoading }
}

export function useAdminProjectMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] })

  const setSuspended = useMutation({
    mutationFn: ({ id, suspended, reason }: { id: string; suspended: boolean; reason?: string }) =>
      api.patch(`/admin/projects/${id}`, { suspended, reason }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/projects/${id}`),
    onSuccess: invalidate,
  })

  return { setSuspended, remove }
}

export function useAdminUserMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })

  const setSuspended = useMutation({
    mutationFn: ({ id, suspended, reason }: { id: string; suspended: boolean; reason?: string }) =>
      api.patch(`/admin/users/${id}/suspended`, { suspended, reason }),
    onSuccess: invalidate,
  })

  const updateProfile = useMutation({
    mutationFn: ({ id, email, password }: { id: string; email?: string; password?: string }) =>
      api.patch(`/admin/users/${id}`, { email, password }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: invalidate,
  })

  return { setSuspended, updateProfile, remove }
}

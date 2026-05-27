import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface UserTokens {
  balance: number
  used: number
  tier: 'free' | 'paid'
}

export interface UserProviderKeys {
  provider: string
  apiKey: string
  isActive: boolean
  createdAt: string
}

export function useUserTokens() {
  const { data, isLoading } = useQuery({
    queryKey: ['user', 'tokens'],
    queryFn: () => api.get<UserTokens>('/user/tokens'),
    refetchInterval: 30000,
  })

  return { tokens: data ?? null, isLoading }
}

export function useUserProviderKeys() {
  const { data, isLoading } = useQuery({
    queryKey: ['user', 'provider-keys'],
    queryFn: () => api.get<UserProviderKeys[]>('/user/provider-keys'),
  })

  return { keys: data ?? [], isLoading }
}

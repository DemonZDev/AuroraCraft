import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface UserTokens {
  balance: number
  used: number
  tier: 'free' | 'paid'
}

export function useUserTokens() {
  const { data, isLoading } = useQuery({
    queryKey: ['user', 'tokens'],
    queryFn: () => api.get<UserTokens>('/user/tokens'),
    refetchInterval: 30000,
  })

  return { tokens: data ?? null, isLoading }
}

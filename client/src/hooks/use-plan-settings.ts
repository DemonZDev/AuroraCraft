import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface PlanFeature {
  label: string
  free: boolean
  pro: boolean
}

export interface PlanSettings {
  proPriceUsd: number
  proOriginalPriceUsd: number
  proMonthlyTokens: number
  tokenPricePer1kUsd: number
  features: PlanFeature[]
  updatedAt: string
}

export type PlanSettingsUpdate = Partial<Omit<PlanSettings, 'updatedAt'>>

// Public — pricing page reads live prices without auth.
export function usePlanSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ['plan-settings'],
    queryFn: () => api.get<PlanSettings>('/plan-settings'),
  })

  return { settings: data ?? null, isLoading }
}

// Admin — edit prices, token price, and the feature matrix.
export function usePlanSettingsMutations() {
  const queryClient = useQueryClient()

  const update = useMutation({
    mutationFn: (body: PlanSettingsUpdate) => api.patch<PlanSettings>('/admin/plan-settings', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan-settings'] }),
  })

  return { update }
}

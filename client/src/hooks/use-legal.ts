import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Server-shape: see server/src/routes/legal.ts → serialize().
export interface LegalDocument {
  slug: 'privacy' | 'terms' | string
  title: string
  content: string
  version: string
  effectiveDate: string // ISO
  updatedAt: string // ISO
}

export type LegalDocumentUpdate = Partial<Pick<LegalDocument, 'title' | 'content' | 'version'>> & {
  effectiveDate?: string
}

// Public — used by /privacy and /terms. No auth.
export function useLegalDoc(slug: 'privacy' | 'terms') {
  const { data, isLoading, error } = useQuery({
    queryKey: ['legal', slug],
    queryFn: () => api.get<LegalDocument>(`/legal/${slug}`),
  })
  return { doc: data ?? null, isLoading, error }
}

// Admin — list all editable documents.
export function useAdminLegalDocs() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'legal'],
    queryFn: () => api.get<LegalDocument[]>('/admin/legal'),
  })
  return { docs: data ?? [], isLoading }
}

// Admin — fetch a single document for the editor.
export function useAdminLegalDoc(slug: 'privacy' | 'terms') {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'legal', slug],
    queryFn: () => api.get<LegalDocument>(`/admin/legal/${slug}`),
  })
  return { doc: data ?? null, isLoading, error }
}

// Admin — update. Invalidates the public + admin caches so the live /privacy
// and /terms pages reflect the next save immediately.
export function useAdminLegalMutations() {
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: LegalDocumentUpdate }) =>
      api.patch<LegalDocument>(`/admin/legal/${slug}`, body),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'legal'] })
      queryClient.invalidateQueries({ queryKey: ['legal', vars.slug] })
    },
  })
  return { update }
}

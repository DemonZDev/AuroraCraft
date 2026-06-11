import { Routes, Route } from 'react-router'
import { RootLayout } from '@/components/layout/root-layout'
import { PublicLayout } from '@/components/layout/public-layout'
import { AppLayout } from '@/components/layout/app-layout'
import { AdminLayout } from '@/components/layout/admin-layout'
import { ProtectedRoute, AdminRoute, GuestRoute } from '@/components/auth/protected-route'

import HomePage from '@/pages/home'
import PricingPage from '@/pages/pricing'
import DocsPage from '@/pages/docs'
import TermsPage from '@/pages/terms'
import PrivacyPage from '@/pages/privacy'
import LoginPage from '@/pages/login'
import RegisterPage from '@/pages/register'
import ForgotPasswordPage from '@/pages/forgot-password'
import DashboardPage from '@/pages/dashboard'
import NewProjectPage from '@/pages/new-project'
import WorkspacePage from '@/pages/workspace'
import ProjectMenuPage from '@/pages/project-menu'
import CommunityPage from '@/pages/community'
import CommunityProjectPage from '@/pages/community-project'
import AdminOverviewPage from '@/pages/admin/overview'
import AdminUsersPage from '@/pages/admin/users'
import AdminAIRuntimePage from '@/pages/admin/ai-runtime'
import AdminProjectsPage from '@/pages/admin/projects'
import AdminWorkspacePage from '@/pages/admin/workspace'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        {/* Public pages */}
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="docs" element={<DocsPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="community" element={<CommunityPage />} />
        </Route>

        {/* Auth pages (guest only) */}
        <Route element={<PublicLayout />}>
          <Route path="login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* Protected app pages */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="projects/new" element={<NewProjectPage />} />
        </Route>

        {/* Workspace (full viewport, no footer) */}
        <Route
          path="workspace/:projectId"
          element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>}
        />

        {/* Project Menu (full viewport, no footer) */}
        <Route
          path="project/:projectId/settings"
          element={<ProtectedRoute><ProjectMenuPage /></ProtectedRoute>}
        />

        {/* Community project view (full viewport, read-only) */}
        <Route
          path="community/:projectId"
          element={<CommunityProjectPage />}
        />

        {/* Admin panel */}
        <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route path="admin" element={<AdminOverviewPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/ai-runtime" element={<AdminAIRuntimePage />} />
          <Route path="admin/projects" element={<AdminProjectsPage />} />
          <Route path="admin/projects/:projectId/workspace" element={<AdminWorkspacePage />} />
        </Route>
      </Route>
    </Routes>
  )
}

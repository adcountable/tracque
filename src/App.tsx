import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import Layout from './components/Layout'
import { AuthProvider, useAuth, AUTH_ENABLED } from './lib/auth'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Brands from './pages/Brands'
import Keywords from './pages/Keywords'
import AIResults from './pages/AIResults'
import SEOResults from './pages/SEOResults'
import PromptDiscovery from './pages/PromptDiscovery'
import Recommendations from './pages/Recommendations'
import SiteAudit from './pages/SiteAudit'
import Attribution from './pages/Attribution'
import Properties from './pages/Properties'
import Leads from './pages/Leads'
import LandFlips from './pages/LandFlips'
import Calculator from './pages/Calculator'
import Playbook from './pages/Playbook'
import Settings from './pages/Settings'

// Gate /app behind a session when a Supabase project is configured.
// Demo mode (no env) stays open — nothing real to protect.
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (!AUTH_ENABLED) return <>{children}</>
  if (loading) return <div className="min-h-screen bg-background" />
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="properties" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="brands" element={<Brands />} />
        <Route path="keywords" element={<Keywords />} />
        <Route path="ai" element={<AIResults />} />
        <Route path="seo" element={<SEOResults />} />
        <Route path="prompts" element={<PromptDiscovery />} />
        <Route path="recommendations" element={<Recommendations />} />
        <Route path="site-audit" element={<SiteAudit />} />
        <Route path="attribution" element={<Attribution />} />
        <Route path="properties" element={<Properties />} />
        <Route path="leads" element={<Leads />} />
        <Route path="land" element={<LandFlips />} />
        <Route path="calculator" element={<Calculator />} />
        <Route path="playbook" element={<Playbook />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
    </AuthProvider>
  )
}

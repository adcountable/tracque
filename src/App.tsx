import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
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
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<Layout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
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
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

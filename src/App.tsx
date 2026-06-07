import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Brands from './pages/Brands'
import Keywords from './pages/Keywords'
import AIResults from './pages/AIResults'
import SEOResults from './pages/SEOResults'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/app" element={<Layout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="brands" element={<Brands />} />
        <Route path="keywords" element={<Keywords />} />
        <Route path="ai" element={<AIResults />} />
        <Route path="seo" element={<SEOResults />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

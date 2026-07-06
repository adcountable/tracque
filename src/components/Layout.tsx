import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Hash, Bot, Search, Globe, BarChart3,
  Sparkles, Zap, Home, Workflow, Trees, Settings,
} from 'lucide-react'
import { cn } from '../lib/utils'

type NavItem = { to: string; icon: typeof Home; label: string }

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Deals',
    items: [
      { to: '/app/properties', icon: Home, label: 'Deal Finder' },
      { to: '/app/land', icon: Trees, label: 'Land & Wholesale' },
      { to: '/app/leads', icon: Workflow, label: 'Pipeline' },
    ],
  },
  {
    label: 'Visibility',
    items: [
      { to: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/app/brands', icon: Building2, label: 'Brands' },
      { to: '/app/keywords', icon: Hash, label: 'Keywords' },
      { to: '/app/prompts', icon: Sparkles, label: 'Prompt Discovery' },
      { to: '/app/ai', icon: Bot, label: 'AI Visibility' },
      { to: '/app/seo', icon: Search, label: 'SEO Rankings' },
      { to: '/app/recommendations', icon: Zap, label: 'Recommendations' },
      { to: '/app/site-audit', icon: Globe, label: 'Site Audit' },
      { to: '/app/attribution', icon: BarChart3, label: 'Attribution' },
    ],
  },
]

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'group relative flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-md text-[13px] font-medium transition-colors',
    isActive
      ? 'bg-white/[0.06] text-white'
      : 'text-[hsl(var(--sidebar-foreground))] hover:bg-white/[0.04] hover:text-white',
  )
}

function Item({ to, icon: Icon, label }: NavItem) {
  return (
    <NavLink to={to} className={navClass}>
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[hsl(var(--sidebar-primary))]" />}
          <Icon className={cn('w-[17px] h-[17px] shrink-0', isActive ? 'text-[hsl(var(--sidebar-primary))]' : 'text-current opacity-80')} strokeWidth={2} />
          {label}
        </>
      )}
    </NavLink>
  )
}

export default function Layout() {
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-60 flex flex-col bg-[hsl(var(--sidebar))] shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--sidebar-primary))] flex items-center justify-center shadow-sm">
            <Home className="w-[18px] h-[18px] text-[hsl(var(--sidebar))]" strokeWidth={2.5} />
          </div>
          <div className="leading-none">
            <div className="text-white font-semibold text-[15px] tracking-tight">Tracque</div>
            <div className="text-[10px] text-[hsl(var(--sidebar-foreground))] mt-0.5">Deal intelligence</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5">
          {sections.map(section => (
            <div key={section.label}>
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/35">{section.label}</div>
              <div className="space-y-0.5">
                {section.items.map(item => <Item key={item.to} {...item} />)}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2.5 py-3 border-t border-white/[0.06]">
          <NavLink to="/app/settings" className={navClass}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[hsl(var(--sidebar-primary))]" />}
                <Settings className="w-[17px] h-[17px] opacity-80" strokeWidth={2} /> Settings
              </>
            )}
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

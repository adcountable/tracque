import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Hash, Bot, Search, Settings } from 'lucide-react'
import { cn } from '../lib/utils'

const nav = [
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/brands', icon: Building2, label: 'Brands' },
  { to: '/app/keywords', icon: Hash, label: 'Keywords' },
  { to: '/app/ai', icon: Bot, label: 'AI Visibility' },
  { to: '/app/seo', icon: Search, label: 'SEO Rankings' },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-56 flex flex-col bg-[hsl(var(--sidebar))] shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/5">
          <div className="w-7 h-7 rounded-lg bg-[hsl(var(--sidebar-primary))] flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-base tracking-tight">Traque</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-[hsl(var(--sidebar-accent))] text-white'
                    : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-4 h-4', isActive ? 'text-[hsl(var(--sidebar-primary))]' : '')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-white/5">
          <NavLink
            to="/app/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-[hsl(var(--sidebar-accent))] text-white'
                  : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white'
              )
            }
          >
            <Settings className="w-4 h-4" />
            Settings
          </NavLink>
          <p className="text-[10px] text-[hsl(var(--sidebar-foreground))] px-3 pt-3 opacity-50">
            AI + SEO visibility
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

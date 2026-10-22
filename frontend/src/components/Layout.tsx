import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { BellPlus, Columns3, LayoutDashboard } from 'lucide-react'
import { useCity, withCity } from '../lib/city'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/board', label: 'Turnover board', icon: Columns3 },
  { to: '/notice', label: 'Log a notice', icon: BellPlus },
]

const CITIES = ['All', 'Calgary', 'Edmonton'] as const

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg font-semibold text-white">
        Turnover<span className="text-accent">OS</span>
      </span>
    </div>
  )
}

function CityFilter() {
  const [params, setParams] = useSearchParams()
  const current = params.get('city') ?? 'All'
  return (
    <div role="group" aria-label="City" className="inline-flex rounded-pill bg-surface p-1 shadow-card">
      {CITIES.map((c) => {
        const active = current === c
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => {
              const next = new URLSearchParams(params)
              if (c === 'All') next.delete('city'); else next.set('city', c)
              setParams(next)
            }}
            className={`rounded-pill px-4 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-chart text-white' : 'text-body hover:text-navy'}`}
          >
            {c}
          </button>
        )
      })}
    </div>
  )
}

export default function Layout() {
  const city = useCity()
  const { pathname } = useLocation()
  const showCity = pathname === '/' || pathname === '/board'

  return (
    <div className="min-h-screen">
      {/* Sidebar (desktop) / top bar (mobile) */}
      <aside className="bg-navy-deep md:fixed md:inset-y-0 md:w-60 md:flex md:flex-col">
        <div className="flex items-center justify-between px-4 py-4 md:px-5 md:py-6">
          <Logo />
        </div>
        <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] px-3 pb-3 md:flex-col md:px-3 md:pb-0">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={withCity(to, city)}
              end={to === '/'}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded-card px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-[#b7becd] hover:bg-white/5 hover:text-white'}`
              }
            >
              <Icon size={18} aria-hidden className="text-accent" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden px-5 py-6 text-xs leading-relaxed text-[#8c96a8] md:block">
          Prototype built for KO Realty.
          <br />All units, people and numbers are demo data.
        </div>
      </aside>

      <div className="min-w-0 md:ml-60">
        {showCity && (
          <div className="flex justify-end px-4 pt-4 md:px-8 md:pt-6">
            <CityFilter />
          </div>
        )}
        <main className="px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

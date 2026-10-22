import { useEffect } from 'react'
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
    <div className="flex items-center gap-3">
      <img src="/favicon.svg" alt="" className="h-9 w-9" />
      <div className="leading-tight">
        <p className="text-[17px] font-semibold tracking-tight text-white">
          Turnover<span className="text-gold">OS</span>
        </p>
        <p className="font-label text-[11px] uppercase tracking-[0.14em] text-[#9a93b8]">Property management</p>
      </div>
    </div>
  )
}

function CityFilter() {
  const [params, setParams] = useSearchParams()
  const current = params.get('city') ?? 'All'
  return (
    <div role="group" aria-label="City" className="inline-flex overflow-hidden rounded-btn border border-line-strong bg-surface">
      {CITIES.map((c, i) => {
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
            className={`font-label px-3.5 py-1.5 text-[15px] tracking-wide transition-colors ${i > 0 ? 'border-l border-line-strong' : ''} ${
              active ? 'bg-ink text-white' : 'text-body hover:bg-canvas hover:text-ink'}`}
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

  // New page starts at the top (city filter changes keep the position)
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const today = new Date().toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="min-h-screen">
      <aside className="bg-indigo md:fixed md:inset-y-0 md:flex md:w-60 md:flex-col">
        <div className="px-4 py-4 md:px-5 md:py-6">
          <Logo />
        </div>
        <p className="hidden px-5 pb-2 font-label text-[11px] uppercase tracking-[0.16em] text-[#9a93b8] md:block">Workspace</p>
        <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={withCity(to, city)}
              end={to === '/'}
              className={({ isActive }) =>
                `relative flex shrink-0 items-center gap-3 rounded-btn px-3 py-2.5 font-label text-[16px] tracking-wide transition-colors ${
                  isActive
                    ? 'bg-white/[0.07] text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gold'
                    : 'text-[#c8c4dc] hover:bg-white/[0.04] hover:text-white'}`
              }
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden className="text-gold" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-white/10 px-5 py-5 text-xs leading-relaxed text-[#9a93b8] md:block">
          <p className="font-label text-[11px] uppercase tracking-[0.16em] text-gold">Prototype</p>
          <p className="mt-1">Built for KO Realty. All units, people and figures are demo data.</p>
        </div>
      </aside>

      <div className="min-w-0 md:ml-60">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2 md:px-8">
          <p className="font-label text-[14px] uppercase tracking-[0.12em] text-muted">
            KO Realty · Calgary &amp; Edmonton
            <span className="hidden sm:inline"><span className="mx-1.5 text-line-strong">|</span> {today}</span>
          </p>
          {showCity && <CityFilter />}
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { useTitle } from '../lib/title'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BellPlus, MessageSquareWarning } from 'lucide-react'
import DemoGuide from '../components/DemoGuide'
import { api } from '../lib/api'
import { compactMoney, days, money } from '../lib/format'
import { useCity, withCity } from '../lib/city'
import { ErrorBox, Loading, Section, StatTile } from '../components/ui'
import { CompareBars, StageBars, TrendChart } from '../components/charts'
import SavingsCalculator from '../components/SavingsCalculator'

export default function Dashboard() {
  useTitle('Dashboard')
  const city = useCity()
  const { data: d, isLoading, error } = useQuery({ queryKey: ['dashboard', city], queryFn: () => api.dashboard(city) })

  if (isLoading) return <Loading />
  if (error || !d) return <ErrorBox error={error} />

  const k = d.kpis
  const delta = k.avg_days_vacant_90d != null && k.avg_days_vacant_prev_90d != null
    ? k.avg_days_vacant_90d - k.avg_days_vacant_prev_90d : null
  const pre = d.pre_marketing
  const price = d.pricing
  const slowest = [...d.stage_breakdown].sort((a, b) => b.avg_days - a.avg_days)[0]

  return (
    <div className="space-y-6">
      {/* Hero: KO Realty style, photo with indigo overlay, light headline, gold rule */}
      <section className="relative overflow-hidden rounded-card bg-indigo text-white">
        <img src="/images/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-right" />
        <div className="absolute inset-0 bg-gradient-to-r from-indigo via-indigo/85 to-indigo/20" />
        <div className="relative grid gap-8 p-6 md:p-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl">
            <p className="font-label text-[14px] uppercase tracking-[0.16em] text-gold">Vacancy overview · {d.city}</p>
            <h1 className="mt-3 text-[2rem] font-light leading-[1.1] tracking-tight text-white md:text-[2.75rem]">
              Every empty day <span className="font-semibold text-gold">costs owners rent.</span>
            </h1>
            <div className="mt-4 h-[3px] w-16 bg-gold" />
            <p className="mt-4 text-[#e6e1f0] md:text-lg">
              Units sit empty <b className="font-semibold text-white">{days(k.avg_days_vacant_12m)}</b> on average between tenants:{' '}
              <b className="font-semibold text-white">{compactMoney(k.vacancy_cost_12m)}</b> of rent lost in the last 12 months.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={withCity('/board', city)} className="btn-solid">Open turnover board <ArrowRight size={16} aria-hidden /></Link>
              <Link to="/notice" className="inline-flex items-center justify-center gap-2 rounded-btn border border-white/60 px-4 py-2 font-label text-[15px] uppercase tracking-[0.06em] text-white transition-colors hover:bg-white hover:text-ink">
                <BellPlus size={16} aria-hidden /> Log a notice
              </Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-white/15 bg-white/15 text-center backdrop-blur-sm lg:w-72">
            <div className="bg-indigo/70 p-4"><dt className="font-label text-[12px] uppercase tracking-[0.12em] text-[#c8c4dc]">Pre-marketed</dt><dd className="num mt-1 text-2xl font-semibold text-gold">{days(pre.with?.avg_days_vacant)}</dd></div>
            <div className="bg-indigo/70 p-4"><dt className="font-label text-[12px] uppercase tracking-[0.12em] text-[#c8c4dc]">Listed after</dt><dd className="num mt-1 text-2xl font-semibold text-white">{days(pre.without?.avg_days_vacant)}</dd></div>
            <div className="col-span-2 bg-indigo/70 px-4 py-2.5 text-xs text-[#c8c4dc]">Average days vacant, last 12 months</div>
          </dl>
        </div>
      </section>

      <DemoGuide city={city} />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Avg days vacant (90 days)"
          value={k.avg_days_vacant_90d?.toFixed(1) ?? '—'}
          sub={delta == null ? undefined : `${delta <= 0 ? '▼' : '▲'} ${Math.abs(delta).toFixed(1)} vs previous 90 days`}
          tone={delta == null ? undefined : delta <= 0 ? 'good' : 'bad'}
        />
        <StatTile label="Rent lost to vacancy (12 mo)" value={compactMoney(k.vacancy_cost_12m)}
                  sub={`${k.turnovers_12m} turnovers · ${money(k.avg_rent)} avg rent`} />
        <StatTile label="Vacant right now" value={k.vacant_now}
                  sub={`${money(k.vacant_now_daily_cost)} lost per day`} tone="bad" />
        <StatTile label="Occupancy" value={`${k.occupancy_rate?.toFixed(1) ?? '—'}%`}
                  sub={`${k.total_units} units under management`} />
      </div>

      {/* Where the days go + trend */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Where the days go"
                 subtitle={slowest ? `${slowest.label} is the biggest gap: ${days(slowest.avg_days)} per turnover.` : undefined}>
          <StageBars data={d.stage_breakdown} />
        </Section>
        <Section title="Days vacant over time" subtitle="Winter months lease slower in Alberta.">
          <TrendChart data={d.monthly_trend} />
        </Section>
      </div>

      {/* What the data says works */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Market before move-out" subtitle="Units listed while the old tenant still lived there.">
          {pre.with && pre.without ? (
            <>
              <CompareBars items={[
                { label: `Listed after move-out (${pre.without.turnovers})`, value: pre.without.avg_days_vacant },
                { label: `Pre-marketed (${pre.with.turnovers})`, value: pre.with.avg_days_vacant, emphasis: true },
              ]} />
              <p className="mt-4 text-sm text-body">
                <b className="text-heading">{days(pre.without.avg_days_vacant - pre.with.avg_days_vacant)} faster.</b>{' '}
                Only {Math.round((100 * pre.with.turnovers) / (pre.with.turnovers + pre.without.turnovers))}% of
                turnovers were pre-marketed. Autopilot makes it the default.
              </p>
            </>
          ) : <p className="text-sm">Not enough data.</p>}
        </Section>

        <Section title="Price it right" subtitle="Asking rent vs similar units (not pre-marketed).">
          {price.fair && price.overpriced ? (
            <>
              <CompareBars items={[
                { label: `More than 3% over market (${price.overpriced.turnovers})`, value: price.overpriced.avg_days_vacant },
                { label: `Priced at market (${price.fair.turnovers})`, value: price.fair.avg_days_vacant, emphasis: true },
              ]} />
              <p className="mt-4 text-sm text-body">
                Overpriced units sat <b className="text-heading">{days(price.overpriced.avg_days_vacant - price.fair.avg_days_vacant)} longer</b>.
                The price suggestion flags them early.
              </p>
            </>
          ) : <p className="text-sm">Not enough data.</p>}
        </Section>

        <Section title="Reply to renters fast" subtitle="Enquiries in the last 90 days.">
          <div className="flex items-start gap-3">
            <MessageSquareWarning className="mt-1 shrink-0 text-warn" aria-hidden />
            <div>
              <p className="text-3xl font-semibold tabular-nums text-navy">{d.lead_response.median_hours?.toFixed(0) ?? '—'} h</p>
              <p className="text-sm text-body">median time to first reply</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-body">
            <b className="text-heading">{d.lead_response.unanswered_pct?.toFixed(0)}%</b> of{' '}
            {d.lead_response.leads_90d.toLocaleString()} enquiries never got a reply. Renters who wait rent elsewhere.
            An instant reply bot closes this gap.
          </p>
        </Section>
      </div>

      <div id="savings" className="scroll-mt-6" />
      <Section title="Savings calculator"
               subtitle="Cut days from any step and see what owners keep. Try the Autopilot result first.">
        <SavingsCalculator d={d} />
      </Section>

      {d.by_city.length > 1 && (
        <Section title="By city" subtitle="Last 12 months.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr><th className="py-2">City</th><th>Turnovers</th><th>Avg days vacant</th><th>Rent lost</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {d.by_city.map((c) => (
                  <tr key={c.city} className="border-t border-line">
                    <td className="py-2 font-medium text-heading">{c.city}</td>
                    <td>{c.turnovers}</td><td>{c.avg_days_vacant}</td><td>{compactMoney(c.vacancy_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}

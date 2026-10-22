import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BellPlus, MessageSquareWarning } from 'lucide-react'
import { api } from '../lib/api'
import { compactMoney, days, money } from '../lib/format'
import { useCity, withCity } from '../lib/city'
import { ErrorBox, Loading, Section, StatTile } from '../components/ui'
import { CompareBars, StageBars, TrendChart } from '../components/charts'
import SavingsCalculator from '../components/SavingsCalculator'

export default function Dashboard() {
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
      {/* Hero */}
      <section className="relative overflow-hidden rounded-card bg-navy-deep text-white shadow-card">
        <img src="/images/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-right" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-darkest/95 via-navy-darkest/75 to-navy-darkest/10" />
        <div className="relative max-w-2xl p-6 md:p-10">
          <p className="text-sm font-medium uppercase tracking-wider text-accent">Vacancy overview · {d.city}</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-white md:text-4xl">
            Every empty day costs owners rent.
          </h1>
          <p className="mt-4 text-[#d5dbe4] md:text-lg">
            Units sit empty <b className="text-white">{days(k.avg_days_vacant_12m)}</b> on average between tenants.
            That was <b className="text-white">{compactMoney(k.vacancy_cost_12m)}</b> of rent lost in the last 12 months.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={withCity('/board', city)} className="btn-solid">Open turnover board <ArrowRight size={16} aria-hidden /></Link>
            <Link to="/notice" className="inline-flex items-center gap-2 rounded-pill border-2 border-white/70 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-navy">
              <BellPlus size={16} aria-hidden /> Log a notice
            </Link>
          </div>
        </div>
      </section>

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

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, BadgeDollarSign, Bath, BedDouble, Check, CheckCircle2, Circle, Ruler,
  Sparkles, Star, X,
} from 'lucide-react'
import { api, type StageKey, type TurnoverDetail } from '../lib/api'
import {
  CHANNEL_LABELS, TASK_LABELS, allInteriors, beds, days, money, shortDate,
} from '../lib/format'
import { useCity, withCity } from '../lib/city'
import { AutopilotBadge, ErrorBox, HealthBadge, Loading, Section, StatTile } from '../components/ui'
import ListingWriter from '../components/ai/ListingWriter'
import ApplicationReader from '../components/ai/ApplicationReader'
import RenterChat from '../components/ai/RenterChat'
import AppInsights from '../components/ai/AppInsights'

const STAGES: { key: StageKey; label: string }[] = [
  { key: 'notice', label: 'Notice' },
  { key: 'pre_marketing', label: 'Pre-marketing' },
  { key: 'move_out_inspection', label: 'Inspection' },
  { key: 'make_ready', label: 'Make-ready' },
  { key: 'photos', label: 'Photos' },
  { key: 'listed', label: 'Listed' },
  { key: 'showings', label: 'Showings' },
  { key: 'screening', label: 'Screening' },
  { key: 'lease_signed', label: 'Lease signed' },
  { key: 'moved_in', label: 'Moved in' },
]

/** Mirrors the backend's "next step" rule so the button can say where it goes. */
function nextStage(t: TurnoverDetail): StageKey | null {
  if (t.status === 'completed') return null
  const i = STAGES.findIndex((s) => s.key === t.stage)
  if (t.stage === 'make_ready' && t.pre_marketed) return t.has_approved_applicant ? 'lease_signed' : 'showings'
  return STAGES[i + 1]?.key ?? null
}

function Stepper({ t }: { t: TurnoverDetail }) {
  const visited = new Set(t.timeline.map((e) => e.stage))
  const current = STAGES.findIndex((s) => s.key === t.stage)
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Turnover progress">
      {STAGES.map((s, i) => {
        const done = i < current || t.status === 'completed'
        const isCurrent = i === current && t.status !== 'completed'
        const skipped = i < current && !visited.has(s.key)
        return (
          <li key={s.key} className="min-w-[4.75rem] flex-1" aria-current={isCurrent ? 'step' : undefined}>
            <div className={`h-1.5 rounded-pill ${skipped ? 'bg-line' : done ? 'bg-chart' : isCurrent ? 'bg-accent' : 'bg-line'}`} />
            <p className={`mt-1.5 flex items-center gap-1 text-xs ${isCurrent ? 'font-semibold text-navy' : skipped ? 'text-muted line-through' : done ? 'text-heading' : 'text-muted'}`}>
              {done && !skipped ? <Check size={12} aria-hidden /> : isCurrent ? <Circle size={10} className="fill-accent text-accent" aria-hidden /> : null}
              {s.label}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

function PricePanel({ id, active }: { id: number; active: boolean }) {
  const qc = useQueryClient()
  const { data: p, isLoading } = useQuery({ queryKey: ['price', id], queryFn: () => api.price(id), enabled: active })
  const apply = useMutation({
    mutationFn: (price: number) => api.setPrice(id, price),
    onSuccess: (t) => {
      qc.setQueryData(['turnover', id], t)
      qc.invalidateQueries({ queryKey: ['price', id] })
      qc.invalidateQueries({ queryKey: ['board'] })
    },
  })
  if (!active) return null
  if (isLoading || !p) return <Section title="Price suggestion"><Loading label="Checking comparables…" /></Section>

  const tone = {
    lower: 'border-warn bg-warn/10', raise: 'border-ok bg-ok/10', refresh_listing: 'border-warn bg-warn/10',
    watch: 'border-accent bg-accent-soft', hold: 'border-ok bg-ok/10',
  }[p.action]
  const title = {
    lower: 'Lower the rent', raise: 'Room to raise', refresh_listing: 'Refresh the listing',
    watch: 'Watch the price', hold: 'Price looks right',
  }[p.action]

  return (
    <Section title="Price suggestion" subtitle={`${p.comparables.count} similar leases · ${p.comparables.scope}`}>
      <div className={`rounded-card border-l-4 p-4 ${tone}`}>
        <p className="flex items-center gap-2 font-semibold text-navy"><BadgeDollarSign size={18} aria-hidden />{title}</p>
        <p className="mt-1 text-sm text-heading">{p.message}</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted">Asking</dt><dd className="font-semibold tabular-nums text-heading">{money(p.asking_rent)}</dd></div>
        <div><dt className="text-muted">Recommended</dt><dd className="font-semibold tabular-nums text-heading">{money(p.recommended_rent)}</dd></div>
        <div><dt className="text-muted">Enquiries / day</dt><dd className="tabular-nums text-heading">{p.listing.leads_per_day} <span className="text-muted">vs {p.listing.typical_leads_per_day} normal</span></dd></div>
        <div><dt className="text-muted">Days listed</dt><dd className="tabular-nums text-heading">{p.listing.days_listed}</dd></div>
      </dl>
      {p.action === 'lower' && p.estimated_days_saved > 0 && (
        <p className="mt-3 text-sm text-body">
          Data says overpriced units sit <b className="text-heading">{days(p.estimated_days_saved)}</b> longer,
          about <b className="text-heading">{money(p.estimated_vacancy_cost_saved)}</b> of empty rent.
        </p>
      )}
      {(p.action === 'lower' || p.action === 'raise') && p.recommended_rent !== p.asking_rent && (
        <button type="button" className="btn-solid mt-4" disabled={apply.isPending}
                onClick={() => apply.mutate(p.recommended_rent)}>
          {apply.isPending ? 'Updating…' : `Set rent to ${money(p.recommended_rent)}`}
        </button>
      )}
      {apply.error && <div className="mt-3"><ErrorBox error={apply.error} /></div>}
    </Section>
  )
}

export default function TurnoverPage() {
  const id = Number(useParams().id)
  const [newAppId, setNewAppId] = useState<number | null>(null)
  const city = useCity()
  const qc = useQueryClient()
  const { data: t, isLoading, error } = useQuery({ queryKey: ['turnover', id], queryFn: () => api.turnover(id) })

  const refresh = (next: TurnoverDetail) => {
    qc.setQueryData(['turnover', id], next)
    qc.invalidateQueries({ queryKey: ['board'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['price', id] })
  }
  const move = useMutation({ mutationFn: () => api.move(id), onSuccess: refresh })
  const decide = useMutation({
    mutationFn: ({ appId, approve }: { appId: number; approve: boolean }) => api.decide(appId, approve),
    onSuccess: refresh,
  })

  if (isLoading) return <Loading />
  if (error || !t) return <ErrorBox error={error} />

  const u = t.unit_details
  const next = nextStage(t)
  const nextLabel = STAGES.find((s) => s.key === next)?.label
  const done = t.status === 'completed'
  const listed = t.listings.some((l) => l.status === 'live')

  return (
    <div className="space-y-6">
      <Link to={withCity('/board', city)} className="inline-flex items-center gap-1 text-sm font-medium text-[#0f7898] hover:underline">
        <ArrowLeft size={16} aria-hidden /> Back to board
      </Link>

      {/* Header */}
      <section className="card overflow-hidden md:flex">
        <img src={u.photo} alt={`${u.property_name} exterior`} className="h-48 w-full object-cover md:h-auto md:w-80" />
        <div className="flex-1 p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <HealthBadge health={t.health} />
            {t.autopilot && <AutopilotBadge />}
            {t.pre_marketed && !t.autopilot && <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-medium text-[#0f7898]">Pre-marketed</span>}
            <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs font-medium text-body">{done ? 'Completed' : t.stage_label}</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-navy md:text-3xl">{u.label}</h1>
          <p className="text-body">{u.address} · {u.neighbourhood}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-heading">
            <span className="inline-flex items-center gap-1.5"><BedDouble size={16} aria-hidden className="text-chart" />{beds(u.bedrooms)}</span>
            <span className="inline-flex items-center gap-1.5"><Bath size={16} aria-hidden className="text-chart" />{u.bathrooms} bath</span>
            <span className="inline-flex items-center gap-1.5"><Ruler size={16} aria-hidden className="text-chart" />{u.sqft} sq ft</span>
            <span>Market {money(u.market_rent)}</span>
          </div>
          <div className="mt-5"><Stepper t={t} /></div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {next && (
              <button type="button" className="btn-solid" disabled={move.isPending} onClick={() => move.mutate()}>
                {move.isPending ? 'Moving…' : <>Mark done: move to {nextLabel} <ArrowRight size={16} aria-hidden /></>}
              </button>
            )}
            <span className="text-sm text-body">
              {t.outgoing_tenant && <>Leaving: <b className="text-heading">{t.outgoing_tenant}</b></>}
              {t.incoming_tenant && <> · New tenant: <b className="text-heading">{t.incoming_tenant}</b></>}
            </span>
          </div>
          {(move.error || decide.error) && <div className="mt-3"><ErrorBox error={move.error || decide.error} /></div>}
        </div>
      </section>

      {done && (
        <section className="card flex flex-col overflow-hidden sm:flex-row">
          <img src="/images/move-in-keys.jpg" alt="Keys handed to the new tenant" className="h-40 w-full object-cover sm:w-64" />
          <div className="p-5">
            <p className="flex items-center gap-2 text-lg font-semibold text-navy"><CheckCircle2 className="text-ok" aria-hidden /> Moved in {shortDate(t.move_in_date)}</p>
            <p className="mt-1 text-body">Empty for <b className="text-heading">{days(t.days_vacant, 0)}</b> between tenants. New rent {money(t.final_rent)}.</p>
          </div>
        </section>
      )}

      {/* Numbers */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Days empty" value={t.days_vacant}
                  sub={t.days_vacant === 0 && !done ? `Moves out ${shortDate(t.move_out_date)}` : `Since ${shortDate(t.move_out_date)}`} />
        <StatTile label="Rent lost" value={money(t.rent_lost)} tone={t.rent_lost > 0 ? 'bad' : undefined}
                  sub={`at ${money(t.asking_rent)}/mo asking`} />
        <StatTile label="Time in this step" value={`${t.days_in_stage}d`} sub={`Target ${t.target_days}d`}
                  tone={t.health === 'late' ? 'bad' : t.health === 'ok' ? 'good' : undefined} />
        <StatTile label="Renter enquiries" value={t.leads} sub={listed ? 'on live listings' : 'no live listing'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Section title="Timeline" subtitle="Days spent in each step vs target.">
            <ul className="space-y-3">
              {t.timeline.map((e, i) => {
                const over = e.days > e.target_days && e.stage !== 'notice' && e.stage !== 'pre_marketing'
                return (
                  <li key={i} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_auto]">
                    <span className="text-heading">{e.label}</span>
                    <span className="text-xs text-body tabular-nums">{shortDate(e.entered_at)} → {e.exited_at ? shortDate(e.exited_at) : 'now'}</span>
                    <span className={`tabular-nums font-medium ${over ? 'text-[#b4252a]' : 'text-heading'}`}>
                      {e.days}d{over && <span className="sr-only"> (over target)</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Section>

          <Section title="Work orders" subtitle="Vendors booked for this turnover.">
            {t.tasks.length === 0 ? <p className="text-sm text-body">No work booked yet.</p> : (
              <ul className="divide-y divide-line">
                {t.tasks.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <p className="font-medium text-heading">
                        {TASK_LABELS[k.type] ?? k.type}
                        {k.auto_created && <span className="ml-2 align-middle"><AutopilotBadge /></span>}
                      </p>
                      {k.vendor && (
                        <p className="text-xs text-body">
                          {k.vendor.name} · <Star size={11} className="inline fill-warn text-warn" aria-hidden /> {k.vendor.rating} · ~{k.vendor.avg_turnaround_days}d turnaround
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-medium ${k.status === 'done' ? 'text-[#1d7f55]' : 'text-body'}`}>
                        {k.status === 'done' ? `Done ${shortDate(k.completed_at)}` : `Scheduled ${shortDate(k.scheduled_for)}`}
                      </p>
                      {k.cost != null && k.cost > 0 && <p className="text-xs text-muted tabular-nums">{money(k.cost)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Applications" subtitle="Approve one and the new lease is created automatically.">
            {!done && <div className="mb-4"><ApplicationReader t={t} onDone={setNewAppId} /></div>}
            {t.applications.length === 0 ? <p className="text-sm text-body">No applications yet.</p> : (
              <ul className="divide-y divide-line">
                {t.applications.map((a) => (
                  <li key={a.id} className={`py-3 text-sm ${a.id === newAppId ? 'rounded-card bg-accent-soft/60 px-3' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-heading">{a.applicant_name}</p>
                      <p className="text-xs text-body">
                        {a.employer ?? 'Employer not given'} · {money(a.monthly_income)}/mo
                        {a.income_to_rent != null && <> · <b className={a.income_to_rent >= 3 ? 'text-[#1d7f55]' : 'text-[#94600f]'}>{a.income_to_rent}× rent</b></>}
                        {a.has_pets ? ' · has pets' : ''}
                      </p>
                    </div>
                    {a.status === 'submitted' && !done ? (
                      <div className="flex gap-2">
                        <button type="button" className="btn-solid px-3! py-1!" disabled={decide.isPending}
                                onClick={() => decide.mutate({ appId: a.id, approve: true })}>
                          <Check size={14} aria-hidden /> Approve
                        </button>
                        <button type="button" className="btn px-3! py-1!" disabled={decide.isPending}
                                onClick={() => decide.mutate({ appId: a.id, approve: false })}>
                          <X size={14} aria-hidden /> Decline
                        </button>
                      </div>
                    ) : (
                      <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${
                        a.status === 'approved' ? 'bg-ok/10 text-[#1d7f55]' : 'bg-canvas text-body'}`}>
                        {a.status[0].toUpperCase() + a.status.slice(1)}
                      </span>
                    )}
                  </div>
                  {a.ai_summary && <AppInsights a={a} open={a.id === newAppId} />}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {!done && (
            <Section title="Renter messages" subtitle="Instant replies from the AI leasing assistant. Try it as a renter.">
              <RenterChat t={t} />
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <PricePanel id={id} active={!done && listed} />

          <Section title="Listings">
            {t.listings.length === 0 ? <p className="text-sm text-body">Not listed yet.</p> : (
              <ul className="space-y-4">
                {t.listings.map((l) => (
                  <li key={l.id} className="rounded-card border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-navy">{CHANNEL_LABELS[l.channel] ?? l.channel}</span>
                      <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${l.status === 'live' ? 'bg-ok/10 text-[#1d7f55]' : 'bg-canvas text-body'}`}>
                        {l.status === 'live' ? 'Live' : 'Closed'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-heading">{l.title}</p>
                    <p className="mt-1 text-xs text-body">
                      Posted {shortDate(l.posted_at)} · {l.leads} enquiries
                      {l.avg_response_hours != null && <> · replied in {l.avg_response_hours}h avg</>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {!done && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-heading"><Sparkles size={15} aria-hidden className="text-chart" /> AI listing writer</p>
                <ListingWriter t={t} />
              </div>
            )}
          </Section>

          <Section title="Unit details">
            <div className="grid grid-cols-2 gap-2">
              {allInteriors.map((src) => (
                <img key={src} src={src} alt="" className="aspect-[3/2] w-full rounded-card object-cover" loading="lazy" />
              ))}
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Parking</dt><dd className="text-right text-heading">{u.parking}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Pets</dt><dd className="text-heading">{u.pets_allowed ? 'Considered' : 'No pets'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Utilities included</dt><dd className="text-right text-heading">{u.utilities_included.join(', ') || 'None'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Built</dt><dd className="text-heading">{u.year_built}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {u.amenities.map((a) => <span key={a} className="rounded-pill bg-canvas px-2 py-0.5 text-xs text-body">{a}</span>)}
            </div>
            <p className="mt-3 text-xs text-muted">Interior photos are shared demo images.</p>
          </Section>
        </div>
      </div>
    </div>
  )
}
